import { playCancelSound, playConfirmSound, playHoverSound, stopAllAmbiencesAndStartNewOne } from '../sound.js';
import './world-image.js';
import './dialog.js';
import './game-messages/message.js';
import './debug/debug-character.js';
import './game/cycle-inform.js';

/**
 * The main in-dream game UI. Renders a transition ("falling asleep" white
 * tunnel) then settles into the main play screen with a hideable sidebar
 * and a multiline text input.
 *
 * Attributes (set by caller before append):
 *  - character-name           Display name of the chosen character
 *  - character-script-key     The script key for the chosen character ("__self__" for self insert)
 *  - is-self-insert           "true" if the player chose self-insert
 *  - special-mode             "" | "narrator" | "schizophrenia"
 *  - world-namespace          Namespace of the chosen world script
 *  - world-id                 Id of the chosen world script
 *  - mode                     "new" | "load"
 *  - save-id                  Save id when loading, otherwise empty
 *  - party-characters         JSON-encoded Array<{namespace: string, id: string}>
 *                             of additional party members chosen at setup. Empty
 *                             array means "spawn solo".
 *
 * Audio:
 *  - The transition sound is played from <audio id="dreamFallSound"> if it
 *    exists in the document. The element is preserved unchanged so a real
 *    file can be wired in later by simply adding/updating that <audio> tag.
 */
class GameOverlay extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });

        this.onToggleSidebar = this.onToggleSidebar.bind(this);
        this.onSubmit = this.onSubmit.bind(this);
        this.onInputKeydown = this.onInputKeydown.bind(this);
        this.onExitClick = this.onExitClick.bind(this);

        /** @type {boolean} */
        this.sidebarOpen = false;

        /** @type {string | null} */
        this._activeThinkingCharacter = null;

        /**
         * @type {Promise<void>}
         */
        this.lightFadePromise = new Promise(resolve => {
            this.lightFadeResolve = resolve;
        });

        /**
         * Resolves the moment the white "falling asleep" overlay begins fading
         * out — i.e. the dream world starts being revealed. The theme song
         * waits on this (rather than the longer lightFadePromise) so it swells
         * in with the reveal instead of trailing it by a couple of seconds.
         * @type {Promise<void>}
         */
        this.lightFadeOutStartedPromise = new Promise(resolve => {
            this.lightFadeOutStartedResolve = resolve;
        });

        /** @type {ReturnType<typeof setTimeout> | null} */
        this._charUpdateTimer = null;

        /**
         * Global keydown handler installed while the world intro plays. Kept
         * on the instance so disconnectedCallback can detach it if we unmount
         * before the intro finishes.
         * @type {((e: KeyboardEvent) => void) | null}
         */
        this._introKeydownHandler = null;

        /**
         * @type {string | null}
         */
        this.lastMessageGid = null;

        /**
         * @type {"normal" | "hard" | "easy" | "debug"}
         */
        this.gameDifficulty = "normal";

        /**
         * @type {string | null}
         */
        this.lastSaveName = null;

        this.onSaveClick = this.onSaveClick.bind(this);
        this.onF5Keydown = this.onF5Keydown.bind(this);
        this.onCharacterUpdateUI = this.onCharacterUpdateUI.bind(this);
        this.onCycleInform = this.onCycleInform.bind(this);
        this.onThinkingInform = this.onThinkingInform.bind(this);
        this.onInferringOverConversationMessage = this.onInferringOverConversationMessage.bind(this);
    }

    async connectedCallback() {
        this.render();

        // @ts-ignore
        document.querySelector('.fx').style.zIndex = '50'; // ensure fx controls are above the game UI
        // @ts-ignore
        document.querySelector('.ambience').style.zIndex = '50'; // ensure fx controls are above the game UI

        // Probe the .game-root background (the blurred backdrop behind the
        // main playfield) and fall back to the default image if the asset
        // 404s. Background images set via CSS have no error event, so we
        // check it by loading through a throwaway Image(). The main
        // .game-background uses <app-asset-image>, which handles its own
        // fallback via the `default-image` attribute.
        //
        // We also remember the outcome on `this._worldImageAssetDoesNotExist`
        // so the later cascading lookup in updateLocation() can skip the
        // world-level fallback without re-probing it.
        const bgRoot = /** @type {HTMLElement | null} */ (this.root.querySelector('.game-root'));
        const probedUrl = bgRoot?.dataset.bgUrl;
        const fallbackUrl = './images/default-world.png';
        if (bgRoot && probedUrl && probedUrl !== fallbackUrl) {
            const probe = new Image();
            probe.onload = () => {
                this._worldImageAssetDoesNotExist = false;
            };
            probe.onerror = () => {
                this._worldImageAssetDoesNotExist = true;
                bgRoot.style.backgroundImage = `url('${fallbackUrl}')`;
                bgRoot.dataset.bgUrl = fallbackUrl;
            };
            probe.src = probedUrl;
        } else if (bgRoot && (!probedUrl || probedUrl === fallbackUrl)) {
            // No world image to begin with: treat as missing so updateLocation
            // doesn't bother probing the world-level fallback.
            this._worldImageAssetDoesNotExist = true;
        }

        /**
         * World intro messages, shown one-by-one over the white "falling
         * asleep" overlay before the dream settles in. `getInfoMapForScripts`
         * returns a map keyed by "<namespace>/<id>", so the world is looked up
         * by that key (the previous `[0]` index was always undefined). Any
         * failure here is non-fatal — we simply fall back to no intro.
         *
         * @type {Array<{ title: string, subtitle: string, delay?: number }>}
         */
        let introMessages = [];
        if (!this.getAttribute("save-id")) {
            try {
                const introWorldNamespace = this.getAttribute('world-namespace') || '';
                const introWorldId = this.getAttribute('world-id') || '';
                const introInfoMap = await window.ENGINE_WORKER_CLIENT.jsEngineGetInfoMapForScripts({
                    scripts: [{ namespace: introWorldNamespace, id: introWorldId }],
                });
                const introWorldInfo = introInfoMap?.[`${introWorldNamespace}/${introWorldId}`];
                const intro = introWorldInfo?.metadata?.intro;
                if (Array.isArray(intro)) introMessages = intro;
            } catch (error) {
                console.error('Failed to load world intro messages:', error);
            }
        }

        const lightFade = /** @type {HTMLElement | null} */ (this.root.querySelector('.light-fade'));
        if (lightFade) {
            (async () => {
                // When the world ships an intro, play it over the white screen
                // and only fade out once the player has seen (or skipped) it.
                // Otherwise keep the original brief blank-flash behaviour.
                if (introMessages.length > 0) {
                    await this.playWorldIntro(lightFade, introMessages);
                } else {
                    await new Promise(resolve => setTimeout(resolve, 1000)); // slight delay to ensure the element is visible before starting the fade
                }

                lightFade.classList.add('fade-out');
                // Signal that the dream is now being revealed so the theme song
                // (waiting in startInitialThemeSong) can swell in with the fade.
                this.lightFadeOutStartedResolve();
                await new Promise(resolve => setTimeout(resolve, 1100));
                lightFade.remove();
                setTimeout(() => {
                    this.lightFadeResolve();
                }, 1000); // delay the resolve to ensure the fade-out has fully completed before allowing any dependent actions (like error dialogs) to proceed
            })();
        }

        // Wire up controls.
        const toggleBtn = this.root.getElementById('sidebar-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('mouseenter', () => playHoverSound());
            toggleBtn.addEventListener('click', this.onToggleSidebar);
        }

        const submitBtn = this.root.getElementById('submit-btn');
        if (submitBtn) {
            submitBtn.setAttribute('disabled', '');
            submitBtn.addEventListener('mouseenter', () => { if (!submitBtn.hasAttribute('disabled')) playHoverSound(); });
            submitBtn.addEventListener('click', this.onSubmit);
        }

        const exitBtn = this.root.getElementById('exit-btn');
        if (exitBtn) {
            exitBtn.addEventListener('mouseenter', () => playHoverSound());
            exitBtn.addEventListener('click', this.onExitClick);
        }

        const saveBtn = this.root.getElementById('save-btn');
        if (saveBtn) {
            saveBtn.addEventListener('mouseenter', () => playHoverSound());
            saveBtn.addEventListener('click', this.onSaveClick);
        }
        
        document.addEventListener('keydown', this.onF5Keydown);

        const sidebarPortrait = this.root.querySelector('.game-sidebar-portrait');
        if (sidebarPortrait) {
            sidebarPortrait.addEventListener('mouseenter', () => playHoverSound());
            sidebarPortrait.addEventListener('click', () => {
                const titleEl = this.root.querySelector('.game-sidebar-title');
                const name = (titleEl && titleEl.textContent) || this.getAttribute('character-name') || '';
                this._openCharacterDialog(name);
            });
        }

        const input = /** @type {HTMLTextAreaElement | null} */ (this.root.getElementById('game-input'));
        if (input) {
            input.addEventListener('input', () => {
                input.style.height = 'auto';
                input.style.height = Math.min(input.scrollHeight, window.innerHeight * 0.4) + 'px';
            });
            input.addEventListener('keydown', this.onInputKeydown);
        }

        this.prepareGame();
    }

    /**
     * Play the world's intro over the white "falling asleep" overlay.
     *
     * Each entry fades its title (and optional subtitle) in. When the entry
     * has a numeric `delay` it holds for that long (clamped to a readable
     * minimum) and auto-advances; when `delay` is omitted it waits for the
     * player to press the explicit "Continue" button before moving on. The
     * whole sequence is interactive: clicking anywhere — or pressing
     * Space / Enter / → — advances, while the "Skip" control (or Escape)
     * jumps straight to the end. Resolves once the last message has shown or
     * the player skips; the caller then fades the white overlay away.
     *
     * @param {HTMLElement} overlay - the `.light-fade` element to mount onto
     * @param {Array<{ title: string, subtitle: string, delay?: number }>} messages
     * @returns {Promise<void>}
     */
    playWorldIntro(overlay, messages) {
        return new Promise(resolve => {
            const intro = document.createElement('div');
            intro.className = 'light-fade-intro';
            intro.setAttribute('role', 'group');
            intro.setAttribute('aria-label', 'World introduction');
            intro.innerHTML = `
                <button class="light-fade-intro-skip" type="button">Skip</button>
                <div class="light-fade-intro-stage" aria-live="polite">
                    <div class="light-fade-intro-title"></div>
                    <div class="light-fade-intro-subtitle"></div>
                </div>
                <div class="light-fade-intro-footer">
                    <div class="light-fade-intro-progress" aria-hidden="true"></div>
                    <div class="light-fade-intro-action">
                        <button class="light-fade-intro-continue" type="button"></button>
                        <div class="light-fade-intro-hint"><span>Click anywhere to continue</span></div>
                    </div>
                </div>`;
            overlay.appendChild(intro);

            const stage = /** @type {HTMLElement} */ (intro.querySelector('.light-fade-intro-stage'));
            const titleEl = /** @type {HTMLElement} */ (intro.querySelector('.light-fade-intro-title'));
            const subtitleEl = /** @type {HTMLElement} */ (intro.querySelector('.light-fade-intro-subtitle'));
            const progressEl = /** @type {HTMLElement} */ (intro.querySelector('.light-fade-intro-progress'));
            const skipBtn = /** @type {HTMLButtonElement} */ (intro.querySelector('.light-fade-intro-skip'));
            const continueBtn = /** @type {HTMLButtonElement} */ (intro.querySelector('.light-fade-intro-continue'));
            const hintEl = /** @type {HTMLElement} */ (intro.querySelector('.light-fade-intro-hint'));

            // One progress dot per message (hidden for a lone message).
            const dots = messages.map(() => {
                const dot = document.createElement('span');
                dot.className = 'light-fade-intro-dot';
                progressEl.appendChild(dot);
                return dot;
            });
            if (messages.length < 2) progressEl.style.display = 'none';

            let skipped = false;
            let finished = false;
            /** @type {(() => void) | null} */
            let resolveStep = null;

            // A wait the player can cut short by advancing or skipping.
            /** @param {number} ms */
            const interruptibleWait = (ms) => new Promise(res => {
                const finish = () => {
                    clearTimeout(timer);
                    resolveStep = null;
                    res(undefined);
                };
                const timer = setTimeout(finish, ms);
                resolveStep = finish;
            });

            // A wait with no timer: only the player (the Continue button, a
            // click, a key, or Skip) can end it. Used for messages that omit
            // their `delay`.
            const waitForContinue = () => new Promise(res => {
                resolveStep = () => {
                    resolveStep = null;
                    res(undefined);
                };
            });

            const advance = () => {
                if (finished || !resolveStep) return;
                playHoverSound();
                resolveStep();
            };
            const skip = () => {
                if (finished) return;
                skipped = true;
                if (resolveStep) resolveStep();
            };

            /** @param {KeyboardEvent} e */
            const onKeyDown = (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    skip();
                    return;
                }
                // If a control button is focused, let it handle its own
                // activation (Enter / Space) rather than double-firing.
                const active = this.root.activeElement;
                if ((active === skipBtn || active === continueBtn) && (e.key === 'Enter' || e.key === ' ')) return;
                if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    advance();
                }
            };

            intro.addEventListener('click', advance);
            skipBtn.addEventListener('mouseenter', () => playHoverSound());
            skipBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                playConfirmSound();
                skip();
            });
            continueBtn.addEventListener('mouseenter', () => playHoverSound());
            continueBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (finished || !resolveStep) return;
                playConfirmSound();
                resolveStep();
            });
            document.addEventListener('keydown', onKeyDown);
            this._introKeydownHandler = onKeyDown;

            const cleanup = () => {
                if (finished) return;
                finished = true;
                document.removeEventListener('keydown', onKeyDown);
                this._introKeydownHandler = null;
                // Fade the intro furniture out, then drop it so the caller is
                // left with a clean white overlay to fade away.
                intro.classList.add('leaving');
                setTimeout(() => {
                    intro.remove();
                    resolve();
                }, 600);
            };

            (async () => {
                // Let the blank white screen settle before the first words.
                await interruptibleWait(700);

                for (let i = 0; i < messages.length; i++) {
                    if (skipped) break;

                    const msg = /** @type {{ title?: string, subtitle?: string, delay?: number }} */ (messages[i] || {});
                    const title = typeof msg.title === 'string' ? msg.title : '';
                    const subtitle = typeof msg.subtitle === 'string' ? msg.subtitle : '';
                    const hasDelay = typeof msg.delay === 'number' && isFinite(msg.delay);
                    const isLast = i === messages.length - 1;

                    titleEl.textContent = title;
                    subtitleEl.textContent = subtitle;
                    subtitleEl.style.display = subtitle ? '' : 'none';

                    dots.forEach((dot, di) => {
                        dot.classList.toggle('active', di === i);
                        dot.classList.toggle('seen', di < i);
                    });

                    // A message with a `delay` auto-advances (but can still be
                    // cut short); one without it waits for the player to press
                    // the explicit Continue button (or click / a key / Skip).
                    // The button and hint share a fixed-size slot and cross-fade
                    // via the `visible` class, and the button's label is set
                    // while it's still invisible so it never flashes "Continue"
                    // before settling on "Begin".
                    if (hasDelay) {
                        continueBtn.classList.remove('visible');
                        hintEl.classList.add('visible');
                    } else {
                        hintEl.classList.remove('visible');
                        continueBtn.textContent = isLast ? 'Begin' : 'Continue';
                        continueBtn.classList.add('visible');
                    }

                    // Restart the enter transition, then reveal the message.
                    stage.classList.remove('visible', 'leaving');
                    void stage.offsetWidth;
                    stage.classList.add('visible');

                    if (!hasDelay) continueBtn.focus();

                    // Hold on screen: a timed (but skippable) hold when a delay
                    // is given, otherwise wait indefinitely for the player.
                    if (hasDelay) {
                        await interruptibleWait(Math.max(1400, /** @type {number} */(msg.delay)));
                    } else {
                        await waitForContinue();
                    }

                    // Fade the message out before the next one (or the finish),
                    // taking the button/hint with it so the action slot fades in
                    // step with the words rather than snapping away.
                    continueBtn.classList.remove('visible');
                    hintEl.classList.remove('visible');
                    stage.classList.remove('visible');
                    stage.classList.add('leaving');
                    if (!skipped) await interruptibleWait(450);
                }

                stage.classList.remove('visible');
                stage.classList.add('leaving');
                cleanup();
            })();
        });
    }

    async prepareGame(comeFromConflictError = false, newName = null) {
        try {
            this.gameDifficulty = (await window.API.getConfigValue("difficulty") || "normal").toLowerCase();

            const partyCharactersJson = this.getAttribute('party-characters') || '[]';
            const partyCharacters = JSON.parse(partyCharactersJson);

            if (!comeFromConflictError) {
                await window.ENGINE_WORKER_CLIENT.jsEngineClearExecutionOrder();

                const saveId = this.getAttribute('save-id') || '';
                let isSelfInsert = this.getAttribute('is-self-insert') === 'true';
                if (saveId) {
                    this.saveObject = this.saveObject || await (await fetch(window.DREAMENGINE_HOME + `/saves/${this.getAttribute('world-namespace') || ''}/${this.getAttribute('world-id') || ''}/${encodeURIComponent(saveId)}.json`)).json();
                    isSelfInsert = this.saveObject.__self_insert;

                    for (const script of this.saveObject.__scripts || []) {
                        await window.ENGINE_WORKER_CLIENT.jsEngineImportScript({
                            namespace: script.split("/")[0] || '',
                            id: script.split("/")[1] || '',
                        });
                    }

                    await window.ENGINE_WORKER_CLIENT.initializeFromJSONState({json: this.saveObject});
                } else {
                    await window.ENGINE_WORKER_CLIENT.jsEngineImportScript({
                        namespace: this.getAttribute('world-namespace') || '',
                        id: this.getAttribute('world-id') || '',
                    });

                    for (const partyMember of partyCharacters) {
                        await window.ENGINE_WORKER_CLIENT.jsEngineImportScript({
                            namespace: partyMember.namespace,
                            id: partyMember.id,
                        });
                    }

                    const specialMode = this.getAttribute('special-mode') || '';
                    /** @type {"player" | "narrator" | "voice-in-the-head"} */
                    const playMode = specialMode === 'narrator'
                        ? 'narrator'
                        : specialMode === 'schizophrenia'
                            ? 'voice-in-the-head'
                            : 'player';

                    /** @type {DEMinimalCharacterReference | null} */
                    let user = null;
                    if (isSelfInsert) {
                        // Pull every DEMinimalCharacterReference field from the user
                        // config. When picking an existing character we leave `user`
                        // null and let the engine assume that character's identity
                        // afterwards.
                        const cfg = window.API.getConfigValue;
                        const [
                            name, sex, gender,
                            heightCm, weightKg, ageYears,
                            carryingCapacityLiters, carryingCapacityKg,
                            maintenanceCaloriesPerDay, maintenanceHydrationLitersPerDay,
                            rangeMeters, locomotionSpeedMetersPerSecond,
                            shortDescription, shortDescriptionTopNakedAdd, shortDescriptionBottomNakedAdd,
                            stealth, perception, attractiveness, charisma,
                            tier, tierValue, apparentTier, apparentTierValue, powerGrowthRate,
                            species, speciesType, race, groupBelonging,
                        ] = await Promise.all([
                            cfg('user.name'), cfg('user.sex'), cfg('user.gender'),
                            cfg('user.heightCm'), cfg('user.weightKg'), cfg('user.ageYears'),
                            cfg('user.carryingCapacityLiters'), cfg('user.carryingCapacityKg'),
                            cfg('user.maintenanceCaloriesPerDay'), cfg('user.maintenanceHydrationLitersPerDay'),
                            cfg('user.rangeMeters'), cfg('user.locomotionSpeedMetersPerSecond'),
                            cfg('user.shortDescription'), cfg('user.shortDescriptionTopNakedAdd'), cfg('user.shortDescriptionBottomNakedAdd'),
                            cfg('user.stealth'), cfg('user.perception'), cfg('user.attractiveness'), cfg('user.charisma'),
                            cfg('user.tier'), cfg('user.tierValue'), cfg('user.apparentTier'), cfg('user.apparentTierValue'), cfg('user.powerGrowthRate'),
                            cfg('user.species'), cfg('user.speciesType'), cfg('user.race'), cfg('user.groupBelonging'),
                        ]);

                        user = {
                            name,
                            sex: sex || "male",
                            gender: gender || sex || "male",
                            heightCm: typeof heightCm === "number" ? Number(heightCm) : 175,
                            weightKg: typeof weightKg === "number" ? Number(weightKg) : 70,
                            ageYears: typeof ageYears === "number" ? Number(ageYears) : 25,
                            carryingCapacityLiters: typeof carryingCapacityLiters === "number" ? Number(carryingCapacityLiters) : 50,
                            carryingCapacityKg: typeof carryingCapacityKg === "number" ? Number(carryingCapacityKg) : 50,
                            maintenanceCaloriesPerDay: typeof maintenanceCaloriesPerDay === "number" ? Number(maintenanceCaloriesPerDay) : 2000,
                            maintenanceHydrationLitersPerDay: typeof maintenanceHydrationLitersPerDay === "number" ? Number(maintenanceHydrationLitersPerDay) : 2,
                            rangeMeters: typeof rangeMeters === "number" ? Number(rangeMeters) : 10000,
                            locomotionSpeedMetersPerSecond: typeof locomotionSpeedMetersPerSecond === "number" ? Number(locomotionSpeedMetersPerSecond) : 1.4,
                            shortDescription: shortDescription || '',
                            shortDescriptionTopNakedAdd: shortDescriptionTopNakedAdd || null,
                            shortDescriptionBottomNakedAdd: shortDescriptionBottomNakedAdd || null,
                            stealth: typeof stealth === "number" ? Number(stealth) : 0.5,
                            perception: typeof perception === "number" ? Number(perception) : 0.5,
                            attractiveness: typeof attractiveness === "number" ? Number(attractiveness) : 0.5,
                            charisma: typeof charisma === "number" ? Number(charisma) : 0.5,
                            tier: tier || "human",
                            tierValue: typeof tierValue === "undefined" ? 50 : Number(tierValue),
                            apparentTier: apparentTier || "human",
                            apparentTierValue: typeof apparentTierValue === "undefined" ? 50 : Number(apparentTierValue),
                            powerGrowthRate: typeof powerGrowthRate === "undefined" ? 0.25 : Number(powerGrowthRate),
                            species: species || 'human',
                            speciesType: speciesType || 'humanoid',
                            race: race || null,
                            groupBelonging: groupBelonging || [],
                        };

                        console.log('User config values retrieved for self-insert:', user);
                    }

                    await window.ENGINE_WORKER_CLIENT.initialize({ user, playMode });
                }
            } else {
                await window.ENGINE_WORKER_CLIENT.completeDisruptedInitializationDueToNameConflict({ newName });
            }

            if (!this.saveObject) {
                const dreamStability = this.getAttribute('dream-stability') || 'stable';
                await window.ENGINE_WORKER_CLIENT.setDreamStability({ stability: dreamStability === "stable" ? 1 : (dreamStability === "unstable" ? 0.99 : 0.95) });

                // adding characters that were added by those scripts as the party members, the reason is that
                // a script can add many characters and not just one, so they all need to be added by name
                // everything is dynamic so we don't necessarily know by the namespace and id
                const engineScriptInfo = await window.ENGINE_WORKER_CLIENT.getEngineScriptInfo();
                for (const partyMember of partyCharacters) {
                    for (const charInfo of engineScriptInfo.charactersAdded) {
                        if (charInfo.byId === partyMember.id && charInfo.byNamespace === partyMember.namespace) {
                            await window.ENGINE_WORKER_CLIENT.addCharacterToParty({ characterName: charInfo.name });
                        }
                    }
                }

                // check if we are taking a character's identity (i.e. not a self-insert but sharing a name with an existing character), and if so, assume that identity to get the correct starting location and inventory
                const characterName = this.getAttribute('character-name') || '';
                const isSelfInsert = this.getAttribute('is-self-insert') === 'true';
                if (!isSelfInsert && characterName) {
                    if (characterName.startsWith('script://')) {
                        const [namespace, id] = characterName.substring('script://'.length).split('/');
                        const charInfo = engineScriptInfo.charactersAdded.find(c => c.byNamespace === namespace && c.byId === id);
                        if (charInfo) {
                            await window.ENGINE_WORKER_CLIENT.assumeCharacterIdentity({ characterName: charInfo.name });
                        } else {
                            throw new Error(`Character with script key ${namespace + "/" + id} not found among characters added by the world and party scripts.` + JSON.stringify(engineScriptInfo.charactersAdded));
                        }
                    } else {
                        await window.ENGINE_WORKER_CLIENT.assumeCharacterIdentity({ characterName });
                    }
                }
            }

            // The engine is ready now, so begin resolving the world's theme
            // song. It waits internally for the dream to start being revealed
            // (the white overlay fading out) and then swells in — kicking it off
            // here, before the post-fade buffers below, keeps it on time even
            // after a long, interactive world intro.
            this.startInitialThemeSong();

            await this.lightFadePromise;
            await new Promise(resolve => setTimeout(resolve, 1000));

            this.onCharacterUpdateUI();
            this.onInitialSceneSelect();
        } catch (error) {
            await this.lightFadePromise; // ensure the light fade has completed before showing the error dialog, so it appears above the fade

            // Name conflict errors are recoverable: the engine reports them by
            // including "Name Conflict" in the error message. We then prompt
            // the user to pick a different name and resume initialization.
            const message = (error && /** @type {Error} */ (error).message) || String(error);
            // @ts-ignore
            const isNameConflictError = /name conflict/i.test(message);

            if (isNameConflictError) {
                this.askForNewNameAndRetry();
            } else {
                // @ts-ignore
                this.displayFatalError('Failed to load the world script. Please check that the world exists and is valid.', error);
                console.error('Error loading world script:', error);
            }
        }
    }

    /**
     * Start the world's theme song, synced to the dream being revealed.
     *
     * Kicked off (fire-and-forget) from prepareGame() as soon as the engine is
     * ready. It waits only for the white "falling asleep" overlay to BEGIN
     * fading out — not the longer lightFadePromise, which tacks a ~2s buffer
     * onto the fade — so the music swells in alongside the reveal. This matters
     * most after a world intro: by the time the player dismisses it the engine
     * is long ready, so without this the theme would sit silent through the
     * fade and its trailing buffers before finally starting.
     * @returns {Promise<void>}
     */
    async startInitialThemeSong() {
        if (this._initialThemeSongStarted) return;
        this._initialThemeSongStarted = true;
        try {
            const themeSong = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["world", "state", "theme"],
            });
            if (!themeSong || !themeSong.asset) return;

            const worldNamespace = this.getAttribute('world-namespace') || '';
            const worldId = this.getAttribute('world-id') || '';
            const isSystemAsset = worldNamespace.startsWith('@');
            const base = isSystemAsset
                ? window.DREAMENGINE_DEFAULT_SCRIPTS_HOME
                : window.DREAMENGINE_HOME;
            const themeUrl = `${base}/assets/${worldNamespace}/${worldId}/${themeSong.asset}`;

            // Hold until the dream starts being revealed, then swell the theme
            // in over the same window the world fades up.
            await this.lightFadeOutStartedPromise;

            await stopAllAmbiencesAndStartNewOne([{ src: themeUrl, volume: themeSong.volume || 1 }], 1000, 1000);
        } catch (error) {
            console.error('Error starting theme ambience:', error);
        }
    }

    async onInitialSceneSelect() {
        try {
            const actualUserName = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["user", "name"],
            });
            const currentSelectedScene = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["world", "selectedScene"],
            });

            // The world's theme song is started separately, from
            // startInitialThemeSong() (kicked off in prepareGame), so it can
            // swell in the moment the dream is revealed rather than waiting on
            // the post-fade buffers this method sits behind.

            if (!currentSelectedScene) {
                const allInitialScenes = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                    path: ["world", "initialScenes"],
                });

                /**
                 * @type {Record<string, string>}
                 */
                const sceneOptions = {};
                for (const sceneName of allInitialScenes) {
                    const result = await window.ENGINE_WORKER_CLIENT.callCharOnlyTemplate({ path: ["world", "scenes", sceneName, "narration"], characterName: actualUserName });
                    sceneOptions[sceneName] = result;
                }

                const selectedScene = await this.promptInitialSceneSelection(sceneOptions);

                window.ENGINE_WORKER_CLIENT.onDEObjectUpdated = this.onDEObjectUpdated.bind(this);
                window.ENGINE_WORKER_CLIENT.onCycleInform = this.onCycleInform.bind(this);
                window.ENGINE_WORKER_CLIENT.onThinkingInform = this.onThinkingInform.bind(this);
                window.ENGINE_WORKER_CLIENT.onInferringOverConversationMessage = this.onInferringOverConversationMessage.bind(this);

                await window.ENGINE_WORKER_CLIENT.startScene({ sceneName: selectedScene });
            } else {

            }
        } catch (error) {
            // @ts-ignore
            this.displayFatalError('Failed to select the initial scene.', error);
            console.error('Error selecting initial scene:', error);
        }
    }

    onDEObjectUpdated() {
        if (this._generalSceneUpdateTimer) clearTimeout(this._generalSceneUpdateTimer);
        this._generalSceneUpdateTimer = setTimeout(() => {
            this._generalSceneUpdateTimer = null;
            this.ensureGameableArea();
            this.onCharacterUpdateUI();
            this.updateLocation();
            this.updatePresentCharacters();
            this.updateStory();
        }, 100);
    }

    async ensureGameableArea() {
        // @ts-ignore
        this.shadowRoot.querySelector(".game-story-container").classList.add("loaded");
        // @ts-ignore
        this.shadowRoot.querySelector(".game-story-container").inert = false;
    }

    async updateLocation() {
        try {
            const location = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["world", "currentLocation"],
            });
            const locationSlot = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["world", "currentLocationSlot"],
            });

            if (this._currentLocation === location && this._currentLocationSlot === locationSlot) {
                return;
            }

            const changedRootLocation = this._currentLocation !== location;

            this._currentLocation = location;
            this._currentLocationSlot = locationSlot;

            this.updateCurrentLocation(changedRootLocation);

            const worldNamespace = this.getAttribute('world-namespace') || '';
            const worldId = this.getAttribute('world-id') || '';
            const isSystemAsset = worldNamespace.startsWith('@');
            const base = isSystemAsset
                ? window.DREAMENGINE_DEFAULT_SCRIPTS_HOME
                : window.DREAMENGINE_HOME;

            // THEME SONG LOGIC:
            const locationStateInfo = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["world", "locations", location, "state"],
                pick: ["asset"]
            });

            const locationSlotStateInfo = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["world", "locations", location, "slots", locationSlot, "state"],
                pick: ["asset"]
            });

            const themeSongLocationSlot = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["world", "locations", location, "slots", locationSlot, "state", "theme"],
            });

            const themeSongLocation = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["world", "locations", location, "state", "theme"],
            });

            const themeSong = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["world", "state", "theme"],
            });

            if (themeSongLocationSlot && themeSongLocationSlot.asset) {
                const themeUrl = `${base}/assets/${worldNamespace}/${worldId}/${themeSongLocationSlot.asset}`;
                (async () => {
                    try {
                        await stopAllAmbiencesAndStartNewOne([{ src: themeUrl, volume: themeSongLocationSlot.volume || 1 }], 1000, 1000);
                    } catch (error) {
                        console.error('Error starting theme ambience:', error);
                    }
                })();
            } else if (themeSongLocation && themeSongLocation.asset) {
                const themeUrl = `${base}/assets/${worldNamespace}/${worldId}/${themeSongLocation.asset}`;
                (async () => {
                    try {
                        await stopAllAmbiencesAndStartNewOne([{ src: themeUrl, volume: themeSong.volume || 1 }], 1000, 1000);
                    } catch (error) {
                        console.error('Error starting theme ambience:', error);
                    }
                })();
            } else if (themeSong && themeSong.asset) {
                const themeUrl = `${base}/assets/${worldNamespace}/${worldId}/${themeSong.asset}`;
                (async () => {
                    try {
                        await stopAllAmbiencesAndStartNewOne([{ src: themeUrl, volume: themeSong.volume || 1 }], 1000, 1000);
                    } catch (error) {
                        console.error('Error starting theme ambience:', error);
                    }
                })();
            }

            // WORLD IMAGE LOGIC:
            const fallbackBgUrl = './images/default-world.png';

            /**
             * Build the asset path (consumed by <app-asset-image>) and the
             * fully-resolved URL (consumed by the CSS background-image) for
             * an asset name relative to this world's asset folder.
             * @param {string} asset
             */
            const buildCandidate = (asset) => {
                if (!asset || !worldNamespace || !worldId) return null;
                const assetPath = `assets/${worldNamespace}/${worldId}/${asset}`;
                const fullUrl = `${base}/${assetPath}`.replace(/\\/g, '/');
                return { assetPath, fullUrl };
            };

            // Cascading fallback order:
            //   1. slot asset, 2. location asset, 3. world image, 4. default.
            /** @type {Array<{ assetPath: string, fullUrl: string, isWorldImage?: boolean }>} */
            const candidates = [];
            const slotCandidate = buildCandidate(locationSlotStateInfo?.asset);
            if (slotCandidate) candidates.push(slotCandidate);
            const locationCandidate = buildCandidate(locationStateInfo?.asset);
            if (locationCandidate) candidates.push(locationCandidate);
            if (!this._worldImageAssetDoesNotExist) {
                const worldCandidate = buildCandidate('image');
                if (worldCandidate) candidates.push({ ...worldCandidate, isWorldImage: true });
            }

            let chosenAssetPath = ''; // empty -> <app-asset-image> shows default
            let chosenFullUrl = fallbackBgUrl;

            for (const candidate of candidates) {
                // eslint-disable-next-line no-await-in-loop
                const ok = await this._probeImageExists(candidate.fullUrl);
                if (ok) {
                    chosenAssetPath = candidate.assetPath;
                    chosenFullUrl = candidate.fullUrl;
                    break;
                }
                if (candidate.isWorldImage) {
                    // Remember so subsequent updateLocation() calls skip this step.
                    this._worldImageAssetDoesNotExist = true;
                }
            }

            // Apply to the blurred CSS-backed backdrop.
            const bgRoot = /** @type {HTMLElement | null} */ (this.root.querySelector('.game-root'));
            if (bgRoot) {
                bgRoot.style.backgroundImage = `url("${chosenFullUrl}")`;
                bgRoot.dataset.bgUrl = chosenFullUrl;
            }

            // Apply to the main <app-asset-image>. Passing an empty image-url
            // makes the component immediately load its default-image.
            const bgImage = this.root.querySelector('.game-background .game-background-image');
            if (bgImage) {
                bgImage.setAttribute('image-url', chosenAssetPath);
            }
        } catch (error) {
            console.error('Error updating location:', error);
        }
    }

    /**
     * Probe whether an image URL loads successfully. Results are cached on
     * this instance to avoid repeated network probes for the same URL.
     * @param {string} url
     * @returns {Promise<boolean>}
     */
    _probeImageExists(url) {
        if (!url) return Promise.resolve(false);
        if (!this._imageProbeCache) this._imageProbeCache = new Map();
        const cached = this._imageProbeCache.get(url);
        if (cached !== undefined) return cached;
        const promise = new Promise(resolve => {
            const probe = new Image();
            probe.onload = () => resolve(true);
            probe.onerror = () => resolve(false);
            probe.src = url;
        });
        this._imageProbeCache.set(url, promise);
        return promise;
    }

    /**
     * Populate the top nav bar: current location & slot name on the left,
     * and a horizontal strip of every slot's image (alphabetical) on the
     * right. The current slot's thumbnail is highlighted. Hovering / focusing
     * a thumbnail shows a bottom-anchored tooltip with a larger preview of
     * that slot's image.
     * @param {boolean} changedRootLocation - whether the root location (as opposed to just the slot) has changed, which can be used as a hint to skip certain updates that only need to happen on a full location change. Note that this is just a hint and not guaranteed to be accurate, so the method should still work correctly if it's wrong or ignored.
     */
    async updateCurrentLocation(changedRootLocation) {
        try {
            const currentTime = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["currentTime", "time"],
            });

            const timeAsDate = new Date(currentTime);

            // format as UTC time for the given locale, with month and day
            const locale = 'en-US';
            const formattedTime = timeAsDate.toLocaleString(locale, {
                hour: '2-digit',
                minute: '2-digit',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                timeZone: 'UTC',
            }) + ",";

            const location = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["world", "currentLocation"],
            });
            const currentSlot = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["world", "currentLocationSlot"],
            });

            const weatherAtLocation = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["world", "locations", location, "internalState", "currentWeather"],
            });

            const weatherText = this.root.querySelector('.game-nav-bar-current-location-weather');
            if (weatherAtLocation) {
                if (weatherText && weatherText.textContent !== weatherAtLocation) weatherText.textContent = weatherAtLocation;
            } else {
                if (weatherText) weatherText.textContent = '';
            }

            const nameEl = this.root.querySelector('.game-nav-bar-current-location-name');
            const slotNameEl = this.root.querySelector('.game-nav-bar-current-location-slot-name');
            const slotsList = this.root.querySelector('.game-nav-bar-location-slots-images');
            if (!nameEl || !slotNameEl || !slotsList) return;

            if (nameEl.textContent !== (location || '')) nameEl.textContent = location || '';
            if (slotNameEl.textContent !== (currentSlot || '')) slotNameEl.textContent = currentSlot || '';

            const timeEl = this.root.querySelector('.game-nav-bar-current-location-time');
            if (timeEl && timeEl.textContent !== formattedTime) timeEl.textContent = formattedTime;

            if (!location) {
                slotsList.innerHTML = '';
                return;
            }

            const slotsObj = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["world", "locations", location, "slots"],
                depth: 0,
            });
            const slotNames = Object.keys(slotsObj || {}).sort((a, b) => a.localeCompare(b));

            const worldNamespace = this.getAttribute('world-namespace') || '';
            const worldId = this.getAttribute('world-id') || '';

            const locationGeneralInfo = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["world", "locations", location],
                pick: ["isPrivate", "isSafe", "isIndoors", "locationFullyBlocksWeather", "locationPartiallyBlocksWeather", "locationNegativelyExposesCharactersToWeather"],
            });
            const isPrivate = !!locationGeneralInfo?.isPrivate;
            const isSafe = !!locationGeneralInfo?.isSafe;
            const isIndoors = !!locationGeneralInfo?.isIndoors;

            const userCharacterName = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["user", "name"],
            });

            // Resolve each slot's asset path and metadata.
            /** @type {Array<{ name: string, assetPath: string, description: string, isPrivate: boolean, isSafe: boolean, isIndoors: boolean, fullyBlocksWeather: boolean, partiallyBlocksWeather: boolean, negativelyExposesWeather: boolean, weather: string }>} */
            const slotEntries = [];
            for (const slotName of slotNames) {
                // eslint-disable-next-line no-await-in-loop
                const stateInfo = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                    path: ["world", "locations", location, "slots", slotName, "state"],
                    pick: ["asset"],
                });
                const asset = stateInfo?.asset || '';
                const assetPath = (asset && worldNamespace && worldId)
                    ? `assets/${worldNamespace}/${worldId}/${asset}`
                    : '';

                // eslint-disable-next-line no-await-in-loop
                const description = await window.ENGINE_WORKER_CLIENT.callCharOnlyTemplate({
                    path: ["world", "locations", location, "slots", slotName, "description"],
                    characterName: userCharacterName,
                }) || '';

                // eslint-disable-next-line no-await-in-loop
                const slotGeneralInfo = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                    path: ["world", "locations", location, "slots", slotName],
                    pick: ["slotFullyBlocksWeather", "slotPartiallyBlocksWeather", "slotNegativelyExposesCharactersToWeather"],
                });

                const fullyBlocksWeather = !!(slotGeneralInfo?.slotFullyBlocksWeather || locationGeneralInfo?.locationFullyBlocksWeather || []).includes(weatherAtLocation);
                const partiallyBlocksWeather = !fullyBlocksWeather && !!(slotGeneralInfo?.slotPartiallyBlocksWeather || locationGeneralInfo?.locationPartiallyBlocksWeather || []).includes(weatherAtLocation);
                const negativelyExposesWeather = !partiallyBlocksWeather && !fullyBlocksWeather && !!(slotGeneralInfo?.slotNegativelyExposesCharactersToWeather || locationGeneralInfo?.locationNegativelyExposesCharactersToWeather || []).includes(weatherAtLocation);

                slotEntries.push({ name: slotName, assetPath, description, isPrivate, isSafe, isIndoors, fullyBlocksWeather, partiallyBlocksWeather, negativelyExposesWeather, weather: weatherAtLocation || '' });
            }

            // Remove stale items.
            const wantNames = new Set(slotEntries.map(s => s.name));
            for (const item of Array.from(slotsList.querySelectorAll('.game-nav-bar-location-slot'))) {
                if (changedRootLocation || !wantNames.has(/** @type {HTMLElement} */(item).dataset.slotName || '')) item.remove();
            }

            for (const entry of slotEntries) {
                let item = /** @type {HTMLElement | null} */ (
                    Array.from(slotsList.querySelectorAll('.game-nav-bar-location-slot'))
                        .find(el => /** @type {HTMLElement} */(el).dataset.slotName === entry.name)
                );

                if (!item) {
                    item = document.createElement('div');
                    item.className = 'game-nav-bar-location-slot';
                    item.dataset.slotName = entry.name;
                    item.setAttribute('tabindex', '0');
                    item.setAttribute('role', 'button');

                    const img = document.createElement('app-asset-image');
                    img.setAttribute('default-image', './images/default-world.png');
                    img.setAttribute('no-transition', 'true');
                    item.appendChild(img);

                    const show = () => {
                        this._showLocationSlotTooltip(/** @type {HTMLElement} */(item));
                        playHoverSound();
                    };
                    const hide = () => {
                        this._hideLocationSlotTooltip(/** @type {HTMLElement} */(item));
                    };
                    item.addEventListener('mouseenter', show);
                    item.addEventListener('mouseleave', hide);
                    item.addEventListener('focus', show);
                    item.addEventListener('blur', hide);

                    slotsList.appendChild(item);
                }

                item.dataset.slotImageUrl = entry.assetPath;
                item.dataset.slotDescription = entry.description;
                item.dataset.slotIsPrivate = entry.isPrivate ? '1' : '';
                item.dataset.slotIsSafe = entry.isSafe ? '1' : '';
                item.dataset.slotIsIndoors = entry.isIndoors ? '1' : '';
                item.dataset.slotFullyBlocksWeather = entry.fullyBlocksWeather ? '1' : '';
                item.dataset.slotPartiallyBlocksWeather = entry.partiallyBlocksWeather ? '1' : '';
                item.dataset.slotNegativelyExposesWeather = entry.negativelyExposesWeather ? '1' : '';
                item.dataset.slotWeather = entry.weather;
                const img = item.querySelector('app-asset-image');
                if (img && img.getAttribute('image-url') !== entry.assetPath) {
                    img.setAttribute('image-url', entry.assetPath);
                }
                item.classList.toggle('current', entry.name === currentSlot);
            }

            // Re-order DOM to match alphabetical sort order.
            for (const entry of slotEntries) {
                const item = slotsList.querySelector(
                    `.game-nav-bar-location-slot[data-slot-name="${CSS.escape(entry.name)}"]`
                );
                if (item) slotsList.appendChild(item);
            }
        } catch (error) {
            console.error('Error updating current location:', error);
        }
    }

    /**
     * Show the shared slot tooltip pinned below the given slot thumbnail.
     * @param {HTMLElement} item
     */
    _showLocationSlotTooltip(item) {
        const tooltip = /** @type {HTMLElement | null} */ (
            this.root.querySelector('.game-nav-bar-location-slot-tooltip')
        );
        const navBar = /** @type {HTMLElement | null} */ (
            this.root.querySelector('.game-nav-bar')
        );
        if (!tooltip || !navBar) return;

        const tooltipImg = tooltip.querySelector('.game-nav-bar-location-slot-tooltip-image');
        if (tooltipImg) {
            const imgUrl = item.dataset.slotImageUrl || '';
            if (tooltipImg.getAttribute('image-url') !== imgUrl) tooltipImg.setAttribute('image-url', imgUrl);
        }

        const descEl = tooltip.querySelector('.game-nav-bar-location-slot-tooltip-description');
        if (descEl) {
            const desc = item.dataset.slotDescription || '';
            if (descEl.textContent !== desc) descEl.textContent = desc;
            /** @type {HTMLElement} */ (descEl).style.display = desc ? '' : 'none';
        }

        const statsEl = tooltip.querySelector('.game-nav-bar-location-slot-tooltip-stats');
        if (statsEl) {
            const weather = item.dataset.slotWeather || '';
            /** @type {Array<{ key: string, icon: string, label: string, value: string }>} */
            // @ts-ignore
            const chips = [
                item.dataset.slotIsPrivate ? { key: 'private', icon: '🔒', label: 'Private', value: 'Private' } : null,
                item.dataset.slotIsSafe ? { key: 'safe', icon: '🛡️', label: 'Safe', value: 'Safe' } : null,
                item.dataset.slotIsIndoors ? { key: 'indoors', icon: '🏠', label: 'Indoors', value: 'Indoors' } : null,
                item.dataset.slotFullyBlocksWeather && weather ? { key: 'weather-full', icon: '⛺', label: `Sheltered`, value: `Sheltered` } : null,
                item.dataset.slotPartiallyBlocksWeather && weather ? { key: 'weather-partial', icon: '🌂', label: `Partially sheltered`, value: `Partially sheltered` } : null,
                item.dataset.slotNegativelyExposesWeather && weather ? { key: 'weather-exposed', icon: '⚠️', label: `Negatively Exposed`, value: `Negatively Exposed` } : null,
                !item.dataset.slotFullyBlocksWeather && !item.dataset.slotPartiallyBlocksWeather && !item.dataset.slotNegativelyExposesWeather && weather ? { key: 'weather-none', icon: '☀️', label: `Exposed`, value: `Exposed` } : null,
            ].filter(/** @param {any} x */ x => x !== null);
            const seen = new Set();
            for (const chip of chips) {
                seen.add(chip.key);
                let el = statsEl.querySelector(`.game-character-chip[data-key="${chip.key}"]`);
                if (!el) {
                    el = document.createElement('span');
                    el.className = 'game-character-chip';
                    el.setAttribute('data-key', chip.key);
                    el.innerHTML = `<span class="game-character-chip-icon"></span><span class="game-character-chip-value"></span>`;
                    statsEl.appendChild(el);
                }
                el.setAttribute('title', chip.label);
                const iconEl = el.querySelector('.game-character-chip-icon');
                const valueEl = el.querySelector('.game-character-chip-value');
                if (iconEl && iconEl.textContent !== chip.icon) iconEl.textContent = chip.icon;
                if (valueEl && valueEl.textContent !== chip.value) valueEl.textContent = chip.value;
            }
            for (const el of Array.from(statsEl.querySelectorAll('.game-character-chip'))) {
                if (!seen.has(el.getAttribute('data-key') || '')) el.remove();
            }
        }

        const navRect = navBar.getBoundingClientRect();
        const itemRect = item.getBoundingClientRect();
        // Horizontal: center under the thumbnail (nav-bar-relative).
        const desiredCenterX = (itemRect.left - navRect.left) + itemRect.width / 2;
        // Vertical: just below the nav bar.
        const top = navRect.height + 8;

        // We need to know the tooltip width to clamp horizontally to viewport.
        // Make the tooltip measurable (it's already in DOM but transparent).
        const tooltipW = tooltip.offsetWidth;
        const margin = 8;
        // Clamp the screen-space center so the tooltip stays on screen.
        let screenCenterX = navRect.left + desiredCenterX;
        screenCenterX = Math.max(margin + tooltipW / 2,
            Math.min(window.innerWidth - margin - tooltipW / 2, screenCenterX));
        const left = screenCenterX - navRect.left;

        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
        tooltip.classList.add('visible');
        tooltip.setAttribute('aria-hidden', 'false');
        tooltip.dataset.forSlot = item.dataset.slotName || '';
    }

    /**
     * @param {HTMLElement} item
     */
    _hideLocationSlotTooltip(item) {
        const tooltip = /** @type {HTMLElement | null} */ (
            this.root.querySelector('.game-nav-bar-location-slot-tooltip')
        );
        if (!tooltip) return;
        if (tooltip.dataset.forSlot !== (item.dataset.slotName || '')) return;
        tooltip.classList.remove('visible');
        tooltip.setAttribute('aria-hidden', 'true');
        delete tooltip.dataset.forSlot;
    }

    async updatePresentCharacters() {
        try {
            const list = this.root.querySelector('.game-present-characters-list');
            if (!list) return;

            const location = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["world", "currentLocation"],
            });
            const mySlot = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["world", "currentLocationSlot"],
            });
            const userName = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["user", "name"],
            });
            const charactersAtLocation = await Promise.all((await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["utils", "allCharactersAtLocation"],
                call: [location],
                pick: ["name", "gender", "heightCm", "species", "speciesType"],
                // @ts-ignore
            })).filter((v) => v.name !== userName).map(async (char) => {
                // for each character determine what slot they are at
                const charSlot = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                    path: ["stateFor", char.name, "locationSlot"],
                });
                const charDescription = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                    path: ["utils", "getExternalDescriptionOfCharacter"],
                    call: [{ char: char.name }, true, false],
                });
                return { ...char, slot: charSlot, description: charDescription };
            }));

            // Sort: mySlot characters first (alphabetical by name),
            // then remaining slots alphabetically, then by name within each slot.
            charactersAtLocation.sort((a, b) => {
                const aIsMy = a.slot === mySlot;
                const bIsMy = b.slot === mySlot;
                if (aIsMy !== bIsMy) return aIsMy ? -1 : 1;
                if (a.slot !== b.slot) return (a.slot || '').localeCompare(b.slot || '');
                return (a.name || '').localeCompare(b.name || '');
            });

            // Remove cards for characters no longer at this location.
            // @ts-ignore
            const currentNames = new Set(charactersAtLocation.map(c => c.name));
            for (const card of Array.from(list.querySelectorAll('.game-present-character'))) {
                if (!currentNames.has(/** @type {HTMLElement} */(card).dataset.charName)) card.remove();
            }

            const emptyEl = list.querySelector('.game-present-characters-empty');
            if (charactersAtLocation.length === 0) {
                if (!emptyEl) {
                    const el = document.createElement('div');
                    el.className = 'game-present-characters-empty';
                    list.appendChild(el);
                }
                return;
            }
            if (emptyEl) emptyEl.remove();

            const engineInfo = await window.ENGINE_WORKER_CLIENT.getEngineScriptInfo();

            for (const char of charactersAtLocation) {
                let card = /** @type {HTMLElement | null} */ (
                    Array.from(list.querySelectorAll('.game-present-character'))
                        .find(el => /** @type {HTMLElement} */(el).dataset.charName === char.name)
                );

                if (!card) {
                    card = document.createElement('div');
                    card.className = 'game-present-character';
                    card.dataset.charName = char.name;
                    card.setAttribute('tabindex', '0');
                    card.setAttribute('role', 'button');
                    card.setAttribute('aria-expanded', 'false');

                    const portrait = document.createElement('div');
                    portrait.className = 'game-present-character-portrait';
                    const img = document.createElement('app-asset-image');
                    img.setAttribute('default-image', './images/default-profile.png');
                    img.setAttribute('no-transition', 'true');
                    portrait.appendChild(img);
                    card.appendChild(portrait);

                    // Wire hover / focus / click → show the shared tooltip.
                    // The tooltip lives OUTSIDE the scrolling list so it isn't
                    // clipped (and so it doesn't trigger a horizontal
                    // scrollbar via the overflow-x/y interaction).
                    const show = () => {
                        this._showPresentCharacterTooltip(/** @type {HTMLElement} */(card));
                        playHoverSound();
                    };
                    const hide = () => {
                        this._hidePresentCharacterTooltip(/** @type {HTMLElement} */(card));
                    };
                    card.addEventListener('mouseenter', show);
                    card.addEventListener('mouseleave', hide);
                    card.addEventListener('focus', show);
                    card.addEventListener('blur', hide);
                    card.addEventListener('click', () => {
                        // @ts-ignore
                        this._openCharacterDialog(card.dataset.charName || '');
                    });

                    list.appendChild(card);
                }

                // Refresh text on every update in case data changed.
                card.dataset.charDisplayName = char.name;
                card.dataset.charGender = char.gender || '';
                card.dataset.charHeightCm = char.heightCm != null ? String(char.heightCm) : '';
                card.dataset.charSpecies = char.species || '';
                card.dataset.charSpeciesType = char.speciesType || '';
                card.dataset.charDescription = char.description || '';

                // Resolve portrait: state asset > script default 'image' > default-profile fallback.
                // eslint-disable-next-line no-await-in-loop
                const assetImage = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                    path: ["characters", char.name, "state", "asset"],
                }) || "profile";

                const charInfo = engineInfo.charactersAdded.find(c => c.name === char.name);
                const img = card.querySelector('app-asset-image');
                const newUrl = charInfo
                    ? `assets/${charInfo.byNamespace}/${charInfo.byId}/${assetImage}`
                    : '';
                if (img) {
                    if (img.getAttribute('image-url') !== newUrl) img.setAttribute('image-url', newUrl);
                }
                card.dataset.charImageUrl = newUrl;
            }
        } catch (error) {
            console.error('Error updating present characters:', error);
        }
    }

    /**
     * Open a character detail dialog when a present-character card is clicked.
     * In "debug" difficulty this opens the debug-character overlay.
     * Other modes are reserved for future use.
     * @param {string} charName
     */
    _openCharacterDialog(charName) {
        if (this.gameDifficulty === 'debug') {
            const dialog = document.createElement('app-dialog');
            dialog.setAttribute('dialog-title', "Debug: " + charName + " (Character Sysprompt)");
            dialog.setAttribute('confirmation', 'true');
            dialog.setAttribute('confirm-text', 'Close');
            dialog.setAttribute('cancel-text-disable', 'true');
            dialog.setAttribute('extra-z-index', '100');
            dialog.setAttribute("large", "true");
            dialog.setAttribute("pre-expand", "true");

            const debugPanel = document.createElement('app-debug-character');
            debugPanel.setAttribute('character-name', charName);
            dialog.appendChild(debugPanel);

            dialog.addEventListener('confirm', () => {
                playConfirmSound();
                if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
            });
            dialog.addEventListener('cancel', () => {
                if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
            });

            document.body.appendChild(dialog);
        } else {
            // TODO: implement character interaction dialog for other game modes
        }
    }

    /**
     * Show the shared tooltip pinned next to the given character card.
     * The tooltip is a single sibling of the scrolling list so it isn't
     * clipped by the list's scroll container.
     * @param {HTMLElement} card
     */
    _showPresentCharacterTooltip(card) {
        const tooltip = /** @type {HTMLElement | null} */ (
            this.root.querySelector('.game-present-character-tooltip')
        );
        const section = /** @type {HTMLElement | null} */ (
            this.root.querySelector('.game-present-characters-section')
        );
        if (!tooltip || !section) return;

        const tooltipImg = /** @type {Element | null} */ (tooltip.querySelector('.game-present-character-tooltip-image'));
        const descEl = tooltip.querySelector('.game-present-character-description');
        const statsEl = tooltip.querySelector('.game-present-character-stats');
        if (tooltipImg) {
            const imgUrl = card.dataset.charImageUrl || '';
            if (tooltipImg.getAttribute('image-url') !== imgUrl) tooltipImg.setAttribute('image-url', imgUrl);
            /** @type {HTMLElement} */ (tooltipImg).style.display = imgUrl ? '' : 'none';
        }
        if (descEl) descEl.textContent = card.dataset.charDescription || '';
        if (statsEl) {
            /** @type {Array<[string, string | number | null | undefined]>} */
            const fields = [
                ['gender', card.dataset.charGender || ''],
                ['height', card.dataset.charHeightCm ? Number(card.dataset.charHeightCm) : null],
                ['species', card.dataset.charSpecies || ''],
                ['speciesType', card.dataset.charSpeciesType || ''],
            ];
            const seen = new Set();
            for (const [key, raw] of fields) {
                const formatted = formatGameStat(key, raw);
                if (!formatted) continue;
                seen.add(key);
                let chip = statsEl.querySelector(`.game-character-chip[data-key="${key}"]`);
                if (!chip) {
                    chip = document.createElement('span');
                    chip.className = 'game-character-chip';
                    chip.setAttribute('data-key', key);
                    chip.innerHTML = `<span class="game-character-chip-icon"></span><span class="game-character-chip-value"></span>`;
                    statsEl.appendChild(chip);
                }
                chip.setAttribute('title', formatted.label);
                const iconEl = chip.querySelector('.game-character-chip-icon');
                const valueEl = chip.querySelector('.game-character-chip-value');
                if (iconEl && iconEl.textContent !== formatted.icon) iconEl.textContent = formatted.icon;
                if (valueEl && valueEl.textContent !== formatted.value) valueEl.textContent = formatted.value;
            }
            for (const chip of Array.from(statsEl.querySelectorAll('.game-character-chip'))) {
                const key = chip.getAttribute('data-key') || '';
                if (!seen.has(key)) chip.remove();
            }
        }

        const sectionRect = section.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const left = (cardRect.right - sectionRect.left) + 12; // 12px gap
        tooltip.style.left = `${left}px`;

        // Desired vertical center: card midpoint, in section-relative coords.
        const desiredCenter = (cardRect.top - sectionRect.top) + cardRect.height / 2;

        // Measure the tooltip's natural height (it's in the DOM but opacity:0,
        // so layout is already computed) then clamp against the viewport.
        const tooltipH = tooltip.offsetHeight;
        const margin = 8; // px gap from viewport edges
        // Convert the section-relative center to an absolute screen y for clamping.
        let screenCenter = sectionRect.top + desiredCenter;
        screenCenter = Math.max(margin + tooltipH / 2,
            Math.min(window.innerHeight - margin - tooltipH / 2, screenCenter));
        // Convert back to section-relative coords. The CSS transform is -50%,
        // so `top` must equal the desired center in section space.
        const top = screenCenter - sectionRect.top;
        tooltip.style.top = `${top}px`;
        tooltip.classList.add('visible');
        tooltip.setAttribute('aria-hidden', 'false');
        tooltip.dataset.forCharacter = card.dataset.charName || '';
    }

    /**
     * Hide the shared tooltip — but only if the card asking to hide it is
     * the one currently shown, and no other card is in the "active" (pinned)
     * state.
     * @param {HTMLElement} card
     */
    _hidePresentCharacterTooltip(card) {
        const tooltip = /** @type {HTMLElement | null} */ (
            this.root.querySelector('.game-present-character-tooltip')
        );
        if (!tooltip) return;
        if (tooltip.dataset.forCharacter !== (card.dataset.charName || '')) return;
        // Don't hide if this card is pinned active.
        if (card.classList.contains('active')) return;
        // Don't hide if another active card exists — re-pin to it.
        const pinned = /** @type {HTMLElement | null} */ (
            this.root.querySelector('.game-present-character.active')
        );
        if (pinned) {
            this._showPresentCharacterTooltip(pinned);
            return;
        }
        tooltip.classList.remove('visible');
        tooltip.setAttribute('aria-hidden', 'true');
        delete tooltip.dataset.forCharacter;
    }

    async updateStory() {
        try {
            const actualUserName = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["user", "name"],
            });
            const history = await window.ENGINE_WORKER_CLIENT.getHistoryForCharacter({
                characterName: actualUserName,
                lastMessageGid: this.lastMessageGid,
            });

            const hadNoPreviousMessages = this.lastMessageGid === null;

            if (!history || !Array.isArray(history) || history.length === 0) return;

            const historyReversed = history.reverse(); // this list contains the most recent messages last
            // and we want to render them in the order from oldest to newest, so we reverse the list before rendering

            const list = this.root.querySelector('.game-story-content-list');
            if (!list) return;

            // Determine the last rendered sender so consecutive messages from the
            // same character can be grouped (Discord-style: only the first message
            // in a run shows the avatar and name; subsequent ones show a spacer).
            const lastRenderedItem = /** @type {HTMLElement | null} */ (list.lastElementChild);
            let lastSenderName = lastRenderedItem?.dataset.senderName || '';

            /**
             * Pre-resolve all message metadata so we can enqueue them without
             * async work inside the chained event handler.
             * @type {Array<{ gid: string, senderName: string, isNarration: boolean, isUser: boolean, isGroupStart: boolean, assetImage: string, text: string }>}
             */
            const resolvedMsgs = [];
            for (const msg of historyReversed) {
                const gid = msg.gid ?? msg.id;
                if (gid == null) continue;

                const senderName = msg.name || '';
                const isNarration = !!msg.storyMaster;
                const isUser = senderName === actualUserName;
                const text = msg.message || '';
                const isGroupStart = !isNarration && senderName !== lastSenderName;

                let assetImage = !isNarration ? (await window.ENGINE_WORKER_CLIENT.queryDEObject({
                    path: ["characters", senderName, "state", "asset"],
                }) || "profile") : "";
                if (assetImage) {
                    const engineInfo = await window.ENGINE_WORKER_CLIENT.getEngineScriptInfo();
                    const charInfo = engineInfo.charactersAdded.find(c => c.name === senderName);
                    if (charInfo) {
                        assetImage = `assets/${charInfo.byNamespace}/${charInfo.byId}/${assetImage}`;
                    } else {
                        const userNameBySettings = await window.API.getConfigValue('user.name');
                        const isSelfInsert = this.saveObject ? this.saveObject.__self_insert : this.getAttribute('is-self-insert') === 'true';
                        if (isSelfInsert && userNameBySettings === senderName) {
                            assetImage = "profile";
                        } else {
                            assetImage = "";
                        }
                    }
                }

                resolvedMsgs.push({ gid: String(gid), senderName, isNarration, isUser, isGroupStart, assetImage, text });
                lastSenderName = isNarration ? '' : senderName;
            }

            /**
             * Append one resolved message entry, then wait for its stream to
             * finish before appending the next.
             * @param {number} index
             */
            const appendNext = (index) => {
                if (index >= resolvedMsgs.length) return;
                const { gid, senderName, isNarration, isUser, isGroupStart, assetImage, text } = resolvedMsgs[index];

                const el = /** @type {HTMLElement} */ (document.createElement('app-game-message'));
                el.dataset.gid = gid;
                el.setAttribute('text', text);
                el.setAttribute('image-url', assetImage);
                el.setAttribute("gid", gid);
                el.setAttribute("debug", this.gameDifficulty === 'debug' ? 'true' : 'false');
                if (hadNoPreviousMessages) {
                    el.setAttribute('no-stream-simulation', 'true');
                }
                if (isNarration) {
                    el.setAttribute('is-narration', '');
                } else {
                    el.dataset.senderName = senderName;
                    el.setAttribute('sender-name', senderName);
                    if (isUser) el.setAttribute('is-self', '');
                    if (isGroupStart) el.setAttribute('is-group-start', '');
                }

                this.lastMessageGid = gid;

                // Keep the chat scrolled to the latest message.
                const container = this.root.querySelector('.game-story-content-list');

                el.addEventListener('on-simulated-stream-finished', () => {
                    if (container) container.scrollTop = container.scrollHeight;
                    appendNext(index + 1);
                }, { once: true });

                list.appendChild(el);
                if (container) container.scrollTop = container.scrollHeight;
            };

            appendNext(0);

        } catch (error) {
            console.error('Error updating story:', error);
        }
    }

    /**
     * @param {"info" | "warning" | "error"} level 
     * @param {string} message 
     */
    onCycleInform(level, message) {
        const el = /** @type {any} */ (this.root.querySelector('.game-cycle-inform'));
        if (el && typeof el.addMessage === 'function') {
            el.addMessage(level, message);
        }
    }

    /**
     * @param {boolean} thinking 
     * @param {string | null} characterName
     * @param {boolean} noMoreCharactersToTalk
     */
    onThinkingInform(thinking, characterName, noMoreCharactersToTalk) {
        // thinking refers on whether the engine is currently thinking and
        // processing data, if a character name is specified then it means that one character is the one
        // thinking, otherwise it means that the engine is thinking in general

        if (thinking) {
            // Show the spinning triangle whenever the engine is thinking.
            this._setThinkingTriangleVisible(true);
            // Highlight the character currently thinking (if any). Passing a
            // new name cancels the previous character's animation first.
            this._setThinkingCharacter(characterName || null);
        } else {
            // Thinking finished: stop everything — triangle and any character.
            this._setThinkingTriangleVisible(false);
            this._setThinkingCharacter(null);
        }
    }

    /**
     * @param {boolean} visible
     */
    _setThinkingTriangleVisible(visible) {
        const triangle = this.root.querySelector('.game-thinking-triangle');
        if (!triangle) return;
        triangle.classList.toggle('visible', visible);
        triangle.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }

    /**
     * Activate the "thinking" animation on the given character's present-card
     * (matched by its data-char-name in the present-characters bar). Passing a
     * different name cancels the previously animated character first; passing
     * null simply clears any current animation.
     * @param {string | null} characterName
     */
    _setThinkingCharacter(characterName) {
        if (this._activeThinkingCharacter === characterName) return;

        // Cancel the previously activated character (if any).
        if (this._activeThinkingCharacter) {
            const prev = this.root.querySelector(
                `.game-present-character[data-char-name="${CSS.escape(this._activeThinkingCharacter)}"]`
            );
            if (prev) prev.classList.remove('thinking-active');
        }

        this._activeThinkingCharacter = characterName;

        if (characterName) {
            const card = this.root.querySelector(
                `.game-present-character[data-char-name="${CSS.escape(characterName)}"]`
            );
            if (card) card.classList.add('thinking-active');
        }
    }

    /**
     * 
     * @param {{conversationId: string, messageId: string, text: string, hidden: boolean}} data 
     */
    onInferringOverConversationMessage(data) {
        if (data.hidden) return;

        const list = this.root.querySelector('.game-story-content-list');
        if (!list) return;

        const el = /** @type {HTMLElement | null} */ (
            list.querySelector(`[data-gid="${CSS.escape(data.messageId)}"]`)
        );
        if (el && typeof /** @type {any} */ (el).addText === 'function') {
            /** @type {any} */ (el).addText(data.text);
        }
    }

    /**
     * Render the initial-scene picker as an in-place overlay on top of the
     * world background (replacing the "Entering dream..." message). Resolves
     * with the chosen scene name once the player picks one. The picker reuses
     * the same translucent / backdrop-blurred surface style as the input bar
     * so it feels native to the play screen.
     *
     * @param {Record<string, string>} sceneOptions - sceneName -> narration preview
     * @returns {Promise<string>}
     */
    promptInitialSceneSelection(sceneOptions) {
        return new Promise(resolve => {
            const background = this.root.querySelector('.game-background');
            if (!background) {
                // Fallback: nothing to mount onto. Resolve with the first key
                // (or empty) so the caller can proceed.
                resolve(Object.keys(sceneOptions)[0] || '');
                return;
            }

            // Hide the loading message; the picker takes its place.
            const loadingMessage = background.querySelector('.game-background-message');
            if (loadingMessage) /** @type {HTMLElement} */ (loadingMessage).style.display = 'none';

            const picker = document.createElement('div');
            picker.className = 'game-scene-picker';

            const heading = document.createElement('div');
            heading.className = 'game-scene-picker-title';
            heading.textContent = 'How does the dream begin?';
            picker.appendChild(heading);

            const list = document.createElement('div');
            list.className = 'game-scene-picker-list';
            picker.appendChild(list);

            /** @type {string | null} */
            let selectedScene = null;
            /** @type {HTMLButtonElement | null} */
            let selectedOption = null;

            const footer = document.createElement('div');
            footer.className = 'game-scene-picker-footer';

            const beginBtn = document.createElement('button');
            beginBtn.type = 'button';
            beginBtn.className = 'game-scene-picker-begin';
            beginBtn.textContent = 'Begin';
            beginBtn.disabled = true;
            footer.appendChild(beginBtn);

            const finish = () => {
                if (!selectedScene) return;
                playConfirmSound();
                picker.remove();
                if (loadingMessage) loadingMessage.remove();
                resolve(selectedScene);
            };

            beginBtn.addEventListener('mouseenter', () => { if (!beginBtn.disabled) playHoverSound(); });
            beginBtn.addEventListener('click', finish);

            for (const [sceneName, narration] of Object.entries(sceneOptions)) {
                const option = document.createElement('button');
                option.type = 'button';
                option.className = 'game-scene-option';
                option.setAttribute('data-scene', sceneName);

                const title = document.createElement('div');
                title.className = 'game-scene-option-title';
                title.textContent = sceneName;
                option.appendChild(title);

                const desc = document.createElement('div');
                desc.className = 'game-scene-option-desc';
                desc.textContent = narration;
                option.appendChild(desc);

                option.addEventListener('mouseenter', () => playHoverSound());
                option.addEventListener('click', () => {
                    if (selectedOption === option) return;
                    playConfirmSound();
                    if (selectedOption) selectedOption.classList.remove('selected');
                    option.classList.add('selected');
                    selectedOption = option;
                    selectedScene = sceneName;
                    beginBtn.disabled = false;
                });
                list.appendChild(option);
            }

            picker.appendChild(footer);
            background.appendChild(picker);
        });
    }

    async onCharacterUpdateUI() {
        try {
            const actualUserName = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["user", "name"],
            });
            if (typeof actualUserName !== 'string' || !actualUserName) return;

            const assetImage = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["characters", actualUserName, "state", "asset"],
            }) || "profile";

            const userCharacter = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["characters", actualUserName],
                pick: ["name", "gender", "sex", "ageYears", "heightCm", "weightKg", "species", "speciesType"],
            });
            if (!userCharacter || typeof userCharacter !== 'object') return;

            // Keep the sidebar title in sync with the engine-side name (it may
            // differ from the original `character-name` attribute after a rename
            // or identity assumption).
            const titleEl = this.root.querySelector('.game-sidebar-title');
            if (titleEl && titleEl.textContent !== actualUserName) {
                titleEl.textContent = actualUserName;
            }

            // Update the sidebar portrait <app-asset-image> with the character's
            // current asset. Falls back to default-profile.png if no asset or
            // world coordinates are available (handled by the default-image attr).
            const portraitImg = this.root.querySelector('.game-sidebar-portrait app-asset-image');
            if (portraitImg) {
                const engineInfo = await window.ENGINE_WORKER_CLIENT.getEngineScriptInfo();

                // find that character to see its scriptKey that contains the asset
                const charInfo = engineInfo.charactersAdded.find(c => c.name === actualUserName);
                if (charInfo) {
                    const portraitAssetPath = `assets/${charInfo.byNamespace}/${charInfo.byId}/${assetImage}`;
                    portraitImg.setAttribute('image-url', portraitAssetPath);
                } else {
                    const userNameBySettings = await window.API.getConfigValue('user.name');
                    const isSelfInsert = this.saveObject ? this.saveObject.__self_insert : this.getAttribute('is-self-insert') === 'true';
                    if (isSelfInsert && userNameBySettings === actualUserName) {
                        // In self insert mode with the character name being our own, our image is likely the profile
                        portraitImg.setAttribute('image-url', "profile");
                    } else {
                        portraitImg.setAttribute('image-url', ""); // fallback to default image
                    }
                }
            }

            // Keep the input placeholder in sync with the engine-side name. The
            // wording mirrors render() and varies by special-mode.
            const input = /** @type {HTMLTextAreaElement | null} */ (this.root.getElementById('game-input'));
            if (input) {
                const specialMode = this.saveObject?.playMode || this.getAttribute('special-mode') || '';
                const voiceName = this.saveObject?.__voice_name || this.getAttribute('voice-name') || '';
                let inputPlaceholder;
                if (specialMode === 'narrator') {
                    inputPlaceholder = `Narrate ${actualUserName}'s actions\u2026`;
                } else if (specialMode === 'schizophrenia') {
                    const voice = voiceName || 'a voice';
                    inputPlaceholder = `Speak inside ${actualUserName}'s head as ${voice}\u2026`;
                } else {
                    inputPlaceholder = `What does ${actualUserName} do/say?`;
                }
                if (input.placeholder !== inputPlaceholder) {
                    input.placeholder = inputPlaceholder;
                }
            }

            const specialMode = this.saveObject?.playMode || this.getAttribute('special-mode') || '';
            const isSelfInsert = this.saveObject ? this.saveObject.__self_insert : this.getAttribute('is-self-insert') === 'true';
            const worldNamespace = this.getAttribute('world-namespace') || '';
            const worldId = this.getAttribute('world-id') || '';

            const subtitleParts = [];
            if (specialMode === 'narrator') subtitleParts.push('Narrator');
            else if (specialMode === 'schizophrenia') subtitleParts.push('Voice in the head' );
            else if (isSelfInsert) subtitleParts.push('Self-insert');
            if (worldNamespace && worldId) {
                const ns = worldNamespace.startsWith('@') ? worldNamespace.slice(1) : worldNamespace;
                subtitleParts.push(`${ns} / ${worldId}`);
            }

            const subtitleText = subtitleParts.join(' · ');
            const subtitleElement = this.root.querySelector('.game-sidebar-subtitle');
            // @ts-ignore
            subtitleElement.textContent = subtitleText;

            const content = this.root.querySelector('.game-sidebar-content');
            if (!content) return;

            const userDescription = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["utils", "getExternalDescriptionOfCharacter"],
                call: [{ char: actualUserName }, true, false],
            });

            // Stable container for character stats. Created once, then chips are
            // added/updated/removed in place so re-entrant calls don't churn the
            // DOM or wipe other future sidebar sections.
            let stats = content.querySelector('.game-character-stats');
            if (!stats) {
                stats = document.createElement('div');
                stats.className = 'game-character-stats';
                content.prepend(stats);
            }

            /** @type {Array<[string, string | number | null | undefined]>} */
            const fields = [
                ['sex', /** @type {any} */ (userCharacter).sex],
                ['gender', /** @type {any} */ (userCharacter).gender],
                ['age', /** @type {any} */ (userCharacter).ageYears],
                ['height', /** @type {any} */ (userCharacter).heightCm],
                ['weight', /** @type {any} */ (userCharacter).weightKg],
                ['speciesType', /** @type {any} */ (userCharacter).speciesType],
                ['species', /** @type {any} */ (userCharacter).species],
            ];

            const seen = new Set();
            for (const [key, raw] of fields) {
                const formatted = formatGameStat(key, raw);
                if (!formatted) continue;
                seen.add(key);

                let chip = stats.querySelector(`.game-character-chip[data-key="${key}"]`);
                if (!chip) {
                    chip = document.createElement('span');
                    chip.className = 'game-character-chip';
                    chip.setAttribute('data-key', key);
                    chip.innerHTML = `<span class="game-character-chip-icon"></span><span class="game-character-chip-value"></span>`;
                    stats.appendChild(chip);
                }
                chip.setAttribute('title', formatted.label);
                const iconEl = chip.querySelector('.game-character-chip-icon');
                const valueEl = chip.querySelector('.game-character-chip-value');
                if (iconEl && iconEl.textContent !== formatted.icon) iconEl.textContent = formatted.icon;
                if (valueEl && valueEl.textContent !== formatted.value) valueEl.textContent = formatted.value;
            }

            // Drop chips for fields no longer present (e.g. after schema change).
            for (const chip of Array.from(stats.querySelectorAll('.game-character-chip'))) {
                const key = chip.getAttribute('data-key') || '';
                if (!seen.has(key)) chip.remove();
            }

            const descEl = /** @type {HTMLElement | null} */ (content.querySelector('.game-character-description'));
            if (descEl) {
                const descText = typeof userDescription === 'string' ? userDescription : '';
                if (descEl.textContent !== descText) descEl.textContent = descText;
            }
        } catch (error) {
            // @ts-ignore
            this.displayProblematicWarning('Failed to update character stats in the sidebar. The game can continue, but some character information may be missing or outdated.', error);
            console.error('Error updating character UI:', error);
        }
    }

    async askForNewNameAndRetry() {
        // Don't stack dialogs.
        if (document.querySelector('app-dialog[data-name-conflict="true"]')) return;

        const currentName = this.getAttribute('character-name') || '';

        const dialog = document.createElement('app-dialog');
        dialog.setAttribute('dialog-title', 'Name already taken');
        dialog.setAttribute('confirmation', 'true');
        dialog.setAttribute('confirm-text', 'Continue');
        dialog.setAttribute('cancel-text', 'Wake up');
        dialog.setAttribute('no-cancel-on-backdrop-click', 'true');
        dialog.setAttribute('extra-z-index', '100');
        dialog.dataset.nameConflict = 'true';

        const escapedName = escapeHtml(currentName);

        dialog.innerHTML = `
            <p style="margin: 0 0 1.2vh 0;">
                A character in this world already uses the name ${escapedName}. Please pick a different name to use for this dream.
            </p>
            <app-overlay-input
                id="new-name-input"
                label="Your name"
                input-placeholder="Enter a different name"
                input-default-value="${escapedName}"
            ></app-overlay-input>
        `;

        const nameInput = dialog.querySelector('app-overlay-input#new-name-input');

        dialog.addEventListener('confirm', () => {
            // @ts-ignore
            const chosen = (nameInput?.getValue?.() || '').trim();
            if (!chosen || chosen === currentName) {
                // Reject empty names and no-op renames; keep the dialog open
                // so the user can adjust the input.
                return;
            }
            playConfirmSound();
            if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
            // Reflect the new name on the host so the rest of the UI (input
            // placeholder, sidebar title, etc.) stays in sync if it re-reads.
            this.setAttribute('character-name', chosen);
            this.prepareGame(true, chosen);
        });

        dialog.addEventListener('cancel', () => {
            playCancelSound();
            if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
            // The user chose not to rename — there is no way forward, so wake up.
            this.dispatchEvent(new CustomEvent('exit', { bubbles: true, composed: true }));
        });

        document.body.appendChild(dialog);
    }

    /**
     * Show a non-recoverable error dialog. The dream cannot continue from
     * this state, so the only available action is "Wake up", which exits
     * the game (same effect as the sidebar exit button). The error's stack
     * trace (if any) is rendered in a selectable, scrollable preformatted
     * block so the user can copy it for a bug report.
     *
     * @param {string} message
     * @param {Error} [error]
     */
    displayFatalError(message, error) {
        // Avoid stacking multiple fatal-error dialogs.
        if (document.querySelector('app-dialog[data-fatal="true"]')) return;

        const dialog = document.createElement('app-dialog');
        dialog.setAttribute('dialog-title', 'Something went wrong');
        dialog.setAttribute('confirmation', 'true');
        dialog.setAttribute('confirm-text', 'Wake up');
        dialog.setAttribute('cancel-text-disable', 'true');
        dialog.setAttribute('no-cancel-on-backdrop-click', 'true');
        dialog.setAttribute('extra-z-index', '100');
        dialog.dataset.fatal = 'true';

        const body = document.createElement('div');
        const msg = document.createElement('p');
        msg.textContent = message;
        msg.style.margin = '0 0 1.2vh 0';
        body.appendChild(msg);

        if (error) {
            const details = document.createElement('pre');
            details.textContent = error.stack || `${error.name || 'Error'}: ${error.message || String(error)}`;
            details.style.cssText = [
                'max-height: 30vh',
                'overflow: auto',
                'padding: 1vh 1.2vh',
                'margin: 0',
                'background: rgba(0, 0, 0, 0.35)',
                'border: 1px solid rgba(255, 255, 255, 0.15)',
                'border-radius: 0.6vh',
                'font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                'font-size: 1.5vh',
                'line-height: 1.4',
                'white-space: pre-wrap',
                'word-break: break-word',
                'user-select: text',
                '-webkit-user-select: text',
                'color: #ffd9d9',
            ].join(';');
            body.appendChild(details);
        }

        dialog.appendChild(body);

        const exit = () => {
            playConfirmSound();
            this.dispatchEvent(new CustomEvent('exit', { bubbles: true, composed: true }));
            if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
        };
        // Both confirm and cancel (Escape / backdrop click) wake up.
        dialog.addEventListener('confirm', exit);
        dialog.addEventListener('cancel', exit);

        document.body.appendChild(dialog);
    }

    /**
     * Show a non-recoverable error dialog. The dream cannot continue from
     * this state, so the only available action is "Wake up", which exits
     * the game (same effect as the sidebar exit button). The error's stack
     * trace (if any) is rendered in a selectable, scrollable preformatted
     * block so the user can copy it for a bug report.
     *
     * @param {string} message
     * @param {Error} [error]
     */
    displayProblematicWarning(message, error) {
        // Avoid stacking multiple problematic-warning dialogs.
        if (document.querySelector('app-dialog[data-fatal="true"]')) return;

        const dialog = document.createElement('app-dialog');
        dialog.setAttribute('dialog-title', 'Warning');
        dialog.setAttribute('confirmation', 'true');
        dialog.setAttribute('confirm-text', 'Ok');
        dialog.setAttribute('cancel-text-disable', 'true');
        dialog.setAttribute('extra-z-index', '100');
        dialog.dataset.fatal = 'true';

        const body = document.createElement('div');
        const msg = document.createElement('p');
        msg.textContent = message;
        msg.style.margin = '0 0 1.2vh 0';
        body.appendChild(msg);

        if (error) {
            const details = document.createElement('pre');
            details.textContent = error.stack || `${error.name || 'Error'}: ${error.message || String(error)}`;
            details.style.cssText = [
                'max-height: 30vh',
                'overflow: auto',
                'padding: 1vh 1.2vh',
                'margin: 0',
                'background: rgba(0, 0, 0, 0.35)',
                'border: 1px solid rgba(255, 255, 255, 0.15)',
                'border-radius: 0.6vh',
                'font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                'font-size: 1.5vh',
                'line-height: 1.4',
                'white-space: pre-wrap',
                'word-break: break-word',
                'user-select: text',
                '-webkit-user-select: text',
                'color: #ffd9d9',
            ].join(';');
            body.appendChild(details);
        }

        dialog.appendChild(body);

        const exit = () => {
            playConfirmSound();
            if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
        };
        // Both confirm and cancel (Escape / backdrop click) wake up.
        dialog.addEventListener('confirm', exit);
        dialog.addEventListener('cancel', exit);

        document.body.appendChild(dialog);
    }

    async disconnectedCallback() {
        // If the world intro is still playing, detach its global key listener.
        if (this._introKeydownHandler) {
            document.removeEventListener('keydown', this._introKeydownHandler);
            this._introKeydownHandler = null;
        }

        // @ts-expect-error
        document.querySelector('.sky').style.display = 'block';
        // @ts-ignore
        document.querySelector('.fx').style.zIndex = ''; // delete z-index override to restore normal stacking
        // @ts-ignore
        document.querySelector('.ambience').style.zIndex = ''; // delete z-index override to restore normal stacking

        window.ENGINE_WORKER_CLIENT.onCycleInform = null;
        window.ENGINE_WORKER_CLIENT.onThinkingInform = null;
        window.ENGINE_WORKER_CLIENT.onInferringOverConversationMessage = null;
        window.ENGINE_WORKER_CLIENT.onDEObjectUpdated = null;

        this.stopEngine();
        document.removeEventListener('keydown', this.onF5Keydown);

        await stopAllAmbiencesAndStartNewOne([{ src: './sounds/dream-ambience.mp3', volume: 3 }], 1000, 1000);
    }

    async stopEngine() {
        await window.ENGINE_WORKER_CLIENT.endSimulation();
    }

    /**
     * @param {boolean} [enabled] - If provided, sets the state explicitly; otherwise toggles.
     */
    toggleSubmitBtn(enabled) {
        const submitBtn = this.root.getElementById('submit-btn');
        if (!submitBtn) return;
        const shouldEnable = enabled !== undefined ? enabled : submitBtn.hasAttribute('disabled');
        if (shouldEnable) {
            submitBtn.removeAttribute('disabled');
        } else {
            submitBtn.setAttribute('disabled', '');
        }
    }


    onToggleSidebar(silent = false) {
        if (!silent) playConfirmSound();
        this.sidebarOpen = !this.sidebarOpen;
        const stage = this.root.querySelector('.game-stage');
        const toggle = this.root.getElementById('sidebar-toggle');
        if (stage) stage.classList.toggle('sidebar-open', this.sidebarOpen);
        if (toggle) toggle.setAttribute('aria-expanded', String(this.sidebarOpen));
    }

    /**
     * @param {KeyboardEvent} e
     */
    onInputKeydown(e) {
        // Submit on Ctrl/Cmd+Enter (placeholder; submit is a no-op for now).
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            this.onSubmit();
        }
    }

    onSubmit() {
        const input = /** @type {HTMLTextAreaElement | null} */ (this.root.getElementById('game-input'));
        const value = input?.value.trim() || '';
        if (!value) return;

        playConfirmSound();

        if (input) {
            input.value = '';
            input.style.height = 'auto';
            input.focus();
        }
    }

    onExitClick() {
        // Avoid stacking multiple confirm dialogs.
        if (document.querySelector('app-dialog')) return;

        const dialog = document.createElement('app-dialog');
        dialog.setAttribute('dialog-title', 'Wake up?');
        dialog.setAttribute('confirmation', 'true');
        dialog.setAttribute('confirm-text', 'Wake up');
        dialog.setAttribute('cancel-text', 'Stay');
        dialog.setAttribute('extra-z-index', '100'); // ensure the dialog appears above all other elements
        dialog.textContent = 'Are you sure you want to leave the dream? Any unsaved progress will be lost.';

        dialog.addEventListener('confirm', () => {
            playConfirmSound();
            this.dispatchEvent(new CustomEvent('exit', { bubbles: true, composed: true }));
            document.body.removeChild(dialog);
        });
        dialog.addEventListener('cancel', () => {
            playCancelSound();
            document.body.removeChild(dialog);
        });

        document.body.appendChild(dialog);
    }

    /**
     * 
     * @param {KeyboardEvent} e
     */
    onF5Keydown(e) {
        if (e.key === 'F5') {
            e.preventDefault();
            this.onSaveClick();
        }
    }

    async onSaveClick() {
        // Avoid stacking multiple confirm dialogs.
        if (document.querySelector('app-dialog')) return;

        const worldNamespace = this.getAttribute('world-namespace') || '';
        const worldId = this.getAttribute('world-id') || '';

        /**
         * @type {string}
         */
        // @ts-ignore
        let saveName = this.lastSaveName || this.getAttribute("save-id");
        let saveNameIsEstablished = true;
        if (!saveName) {
            const actualUserName = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["user", "name"],
            });
            saveName = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["world", "selectedScene"],
            }) || "No Selected Scene";

            saveName += " - " + actualUserName;
            saveNameIsEstablished = false;
        }

        const dialog = document.createElement('app-dialog');
        dialog.setAttribute('dialog-title', 'Save Dream');
        dialog.setAttribute('confirmation', 'true');
        dialog.setAttribute('confirm-text', 'Save');
        dialog.setAttribute('cancel-text', 'Cancel');
        dialog.setAttribute('extra-z-index', '100');

        /**
         * @param {string} nameToCheck
         */
        const checkSaveExists = async (nameToCheck) => {
            const saveNameWithJSON = encodeURIComponent(nameToCheck) + ".json";
            const expectedEndPath = window.DREAMENGINE_HOME + "/saves/" + worldNamespace + "/" + worldId + "/" + saveNameWithJSON;

            // run fetch to check if the file exists
            try {
                const response = await fetch(expectedEndPath, { method: 'HEAD' });
                const isFound = response.ok;
                return isFound;
            } catch (error) {
                return false;
            }
        };

        /**
         * @param {string} nameToCheck
         */
        const checkSaveExistWithHTMLUpdate = async (nameToCheck) => {
            const isFound = await checkSaveExists(nameToCheck);
            const overlayInput = dialog.querySelector('app-overlay-input#name-input');
            if (overlayInput) {
                if (isFound) {
                    // @ts-ignore
                    overlayInput.setErrorMessage('A save with this name already exists. Saving will overwrite it.');
                } else {
                    // @ts-ignore
                    overlayInput.clearErrorMessage();
                }
            }
        }

        if (!saveNameIsEstablished) {
            const baseName = saveName;
            let num = 1;
            while (await checkSaveExists(saveName)) {
                saveName = baseName + " #" + num;
                num++;
            }
        }

        
        dialog.innerHTML = `
            <app-overlay-input
                label="Savefile Name"
                input-placeholder="e.g. my-save"
                id="name-input"
                aria-key="n"
                input-default-value="${escapeHtml(saveName)}"
            ></app-overlay-input>
        `;

        if (saveNameIsEstablished) {
            // @ts-ignore
            checkSaveExistWithHTMLUpdate(saveName);
        }

        dialog.addEventListener('confirm', async () => {
            playConfirmSound();

            const saveFileName = dialog.querySelector('app-overlay-input#name-input');
            if (!saveFileName) return;

            const saveFileNameText = /** @type {any} */ (saveFileName).getValue?.() || '';

            const saveStateInfo = await window.ENGINE_WORKER_CLIENT.getLastSafeState();

            const currentlyInteractingCharacters = (await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["utils", "getCurrentlyInteractingCharacters"],
                call: [saveStateInfo.user.name],
            })) || [];

            const andFormatted = currentlyInteractingCharacters.length > 1
                ? currentlyInteractingCharacters.slice(0, -1).join(', ') + ' and ' + currentlyInteractingCharacters.slice(-1)
                : currentlyInteractingCharacters.join('');

            const timeAsDate = new Date(saveStateInfo.currentTime.time);

            // format as UTC time for the given locale, with month and day
            const locale = 'en-US';
            const formattedTime = timeAsDate.toLocaleString(locale, {
                hour: '2-digit',
                minute: '2-digit',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                timeZone: 'UTC',
            });

            const createdAt = new Date();
            const formattedCreatedAt = createdAt.toLocaleString(locale, {
                hour: '2-digit',
                minute: '2-digit',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
            });

            /**
             * @type {Record<string, string>}
             */
            const metadataIndex = {
                "Dreamer": saveStateInfo.user.name,
                "Scene": saveStateInfo.world.selectedScene || "No Selected Scene",
                "Created At": formattedCreatedAt,
                "World": saveStateInfo.world.name || "Unnamed World",
                "Dream Mode": saveStateInfo.stability === 1 ? "Normal" : saveStateInfo.stability === 0.99 ? "Vivid" : "Astral",
            };

            if (andFormatted) {
                metadataIndex["Interacting With"] = andFormatted;
                metadataIndex["Dream Time"] = formattedTime;
            }

            // add some extra stuff
            saveStateInfo.__self_insert = this.saveObject.__self_insert || this.getAttribute('is-self-insert') === 'true';
            saveStateInfo.__voice_name = this.saveObject.__voice_name || this.getAttribute('voice-name') || '';

            document.body.removeChild(dialog);
            if (this.sidebarOpen) {
                this.onToggleSidebar(true);
            }

            try {
                this.onCycleInform("info", "Saving dream...");
                await window.API.saveFile(worldNamespace, worldId, saveFileNameText, JSON.stringify(saveStateInfo), metadataIndex);
                this.lastSaveName = saveFileNameText;
                this.onCycleInform("info", "Dream saved successfully.");
            } catch (error) {
                console.error('Failed to save file:', error);
                this.onCycleInform("error", "Failed to save dream.");
            }
        });
        dialog.addEventListener('cancel', () => {
            playCancelSound();
            document.body.removeChild(dialog);
        });
        dialog.addEventListener('input', async (e) => {
            // @ts-ignore
            const value = (e.detail.value || '').trim();
            checkSaveExistWithHTMLUpdate(value);
        });

        document.body.appendChild(dialog);
    }

    render() {
        const characterName = this.getAttribute('character-name') || '';
        const worldNamespace = this.getAttribute('world-namespace') || '';
        const worldId = this.getAttribute('world-id') || '';
        const characterAsset = this.getAttribute('character-asset') || '';

        // Resolve the world background image. System namespaces (those whose
        // name starts with '@') live under DREAMENGINE_DEFAULT_SCRIPTS_HOME;
        // user namespaces live under DREAMENGINE_HOME. Falls back to the
        // built-in default-world image if no world is set or if the world's
        // image asset 404s (handled in connectedCallback via a probe for
        // .game-root, and via the <app-asset-image> default for .game-background).
        const fallbackBgUrl = './images/default-world.png';
        let worldBgUrl = fallbackBgUrl;
        // Asset path consumed by <app-asset-image> (e.g. "assets/@ns/id/image").
        // Empty string means "no world set", which causes the component to
        // immediately load its default image.
        const worldAssetPath = (worldNamespace && worldId)
            ? `assets/${worldNamespace}/${worldId}/image`
            : '';
        if (worldNamespace && worldId) {
            const isSystem = worldNamespace.startsWith('@');
            const base = isSystem
                ? window.DREAMENGINE_DEFAULT_SCRIPTS_HOME
                : window.DREAMENGINE_HOME;
            // Normalize Windows backslashes to forward slashes — CSS url()
            // treats `\` as an escape character (so `\e` becomes U+000E etc.).
            worldBgUrl = `${base}/assets/${worldNamespace}/${worldId}/image`.replace(/\\/g, '/');
        }

        this.root.innerHTML = `
        <link rel="stylesheet" href="components/game.css">
        <div class="game-root" data-bg-url="${escapeHtml(worldBgUrl)}" style="background-image: url(&quot;${escapeHtml(worldBgUrl)}&quot;);">
            <div class="game-stage">
                <!-- Sidebar (starts open; serves as a toolbox) -->
                <aside class="game-sidebar" aria-label="Game sidebar">
                    <div class="game-sidebar-inner">
                        <div class="game-sidebar-header">
                            <div class="game-sidebar-portrait">
                                <app-asset-image image-url="${characterAsset ? escapeHtml(characterAsset) : ''}" default-image="./images/default-profile.png"></app-asset-image>
                            </div>
                            <div class="game-sidebar-title">${escapeHtml(characterName)}</div>
                            <div class="game-sidebar-subtitle"></div>
                        </div>
                        <div class="game-sidebar-content">
                            <div class="game-character-description">
                                <!-- populated by onCharacterUpdateUI() -->
                            </div>
                        </div>
                        <div class="game-sidebar-footer">
                            <button id="save-btn" class="game-sidebar-save" type="button" aria-label="Save Dream">
                                <svg viewBox="0 0 24 24" width="2.2vh" height="2.2vh" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                                    <polyline points="17 21 17 13 7 13 7 21"></polyline>
                                    <polyline points="7 3 7 8 15 8"></polyline>
                                </svg>
                                <span>Save</span>
                            </button>
                            <button id="exit-btn" class="game-sidebar-exit" type="button" aria-label="Exit game">
                                <svg viewBox="0 0 24 24" width="2.2vh" height="2.2vh" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                                    <polyline points="16 17 21 12 16 7"></polyline>
                                    <line x1="21" y1="12" x2="9" y2="12"></line>
                                </svg>
                                <span>Wake up</span>
                            </button>
                        </div>
                    </div>
                </aside>

                <!-- Toggle arrow (sits between sidebar and main) -->
                <button id="sidebar-toggle" class="sidebar-toggle" aria-expanded="false" aria-label="Toggle sidebar">
                    <svg class="toggle-arrow" viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="15 6 9 12 15 18"></polyline>
                    </svg>
                </button>

                <!-- Main playfield (shrinks to fit alongside the sidebar) -->
                <main class="game-main">
                    <div class="game-background">
                        <app-asset-image
                            class="game-background-image game-background-loading"
                            image-url="${escapeHtml(worldAssetPath)}"
                            default-image="./images/default-world.png"></app-asset-image>
                        <div class="game-background-message">
                            <div class="game-background-message-title">Entering dream...</div>
                            ${worldId ? `<div class="game-background-message-subtitle">${escapeHtml(worldId)}</div>` : ''}
                        </div>
                    </div>

                    <div class="game-story-container" inert="true">
                        <div class="game-nav-bar">
                            <div class="game-nav-bar-current-location-info">
                                <div class="game-nav-bar-current-location-data">
                                    <div class="game-nav-bar-current-location-time">
                                        <!-- populated by updateCurrentLocation() -->
                                    </div>
                                    <div class="game-nav-bar-current-location-weather">
                                        <!-- populated by updateCurrentLocation() -->
                                    </div>
                                </div>
                                <div class="game-nav-bar-current-location-title">
                                    <div class="game-nav-bar-current-location-name">
                                        <!-- populated by updateCurrentLocation() -->
                                    </div>
                                    <div class="game-nav-bar-current-location-slot-name">
                                        <!-- populated by updateCurrentLocation() -->
                                    </div>
                                    <div class="game-thinking-triangle" aria-hidden="true">
                                        <svg viewBox="0 0 100 100" aria-hidden="true">
                                            <defs>
                                                <linearGradient id="game-thinking-gradient" x1="0" y1="0" x2="1" y2="1">
                                                    <stop offset="0%" stop-color="#50beff"></stop>
                                                    <stop offset="50%" stop-color="#7d5cff"></stop>
                                                    <stop offset="100%" stop-color="#ff5ce1"></stop>
                                                </linearGradient>
                                            </defs>
                                            <svg version="1.1" id="L7" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 100 100" enable-background="new 0 0 100 100" xml:space="preserve"><path class="game-thinking-triangle-path" fill="currentColor" d="M31.6,3.5C5.9,13.6-6.6,42.7,3.5,68.4c10.1,25.7,39.2,38.3,64.9,28.1l-3.1-7.9c-21.3,8.4-45.4-2-53.8-23.3
                            c-8.4-21.3,2-45.4,23.3-53.8L31.6,3.5z"><animateTransform attributeName="transform" attributeType="XML" type="rotate" dur="2s" from="0 50 50" to="360 50 50" repeatCount="indefinite"></animateTransform></path><path class="game-thinking-triangle-path" fill="currentColor" d="M42.3,39.6c5.7-4.3,13.9-3.1,18.1,2.7c4.3,5.7,3.1,13.9-2.7,18.1l4.1,5.5c8.8-6.5,10.6-19,4.1-27.7
                            c-6.5-8.8-19-10.6-27.7-4.1L42.3,39.6z"><animateTransform attributeName="transform" attributeType="XML" type="rotate" dur="1s" from="0 50 50" to="-360 50 50" repeatCount="indefinite"></animateTransform></path><path class="game-thinking-triangle-path" fill="currentColor" d="M82,35.7C74.1,18,53.4,10.1,35.7,18S10.1,46.6,18,64.3l7.6-3.4c-6-13.5,0-29.3,13.5-35.3s29.3,0,35.3,13.5
                            L82,35.7z"><animateTransform attributeName="transform" attributeType="XML" type="rotate" dur="2s" from="0 50 50" to="360 50 50" repeatCount="indefinite"></animateTransform></path></svg>
                                        </svg>
                                    </div>
                                </div>
                            </div>
                            <div class="game-nav-bar-location-slots-images-container">
                                <div class="game-nav-bar-location-slots-images">
                                    <!-- populated by updateCurrentLocation() -->
                                </div>
                                <div class="game-nav-bar-location-slot-escape-button" role="button" aria-label="Other locations" title="Other locations">
                                    <svg viewBox="0 0 48 48" width="52%" height="52%" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                        <!-- connection lines -->
                                        <line x1="24" y1="24" x2="10" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>
                                        <line x1="24" y1="24" x2="38" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>
                                        <line x1="24" y1="24" x2="8" y2="32" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>
                                        <line x1="24" y1="24" x2="40" y2="32" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>
                                        <line x1="24" y1="24" x2="24" y2="40" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>
                                        <!-- outer location nodes -->
                                        <circle cx="10" cy="12" r="3.2" fill="currentColor" opacity="0.65"/>
                                        <circle cx="38" cy="12" r="3.2" fill="currentColor" opacity="0.65"/>
                                        <circle cx="8" cy="32" r="3.2" fill="currentColor" opacity="0.65"/>
                                        <circle cx="40" cy="32" r="3.2" fill="currentColor" opacity="0.65"/>
                                        <circle cx="24" cy="40" r="3.2" fill="currentColor" opacity="0.65"/>
                                        <!-- center node (current location) -->
                                        <circle cx="24" cy="24" r="5" fill="currentColor" opacity="0.95"/>
                                        <circle cx="24" cy="24" r="3" fill="rgba(10,30,60,0.8)"/>
                                    </svg>
                                </div>
                            </div>
                            <div class="game-nav-bar-location-slot-tooltip" role="tooltip" aria-hidden="true">
                                <app-asset-image no-transition="true" class="game-nav-bar-location-slot-tooltip-image" default-image="./images/default-world.png"></app-asset-image>
                                <div class="game-nav-bar-location-slot-tooltip-description"></div>
                                <div class="game-nav-bar-location-slot-tooltip-stats"></div>
                            </div>
                        </div>
                        <div class="game-present-characters-section">
                            <div class="game-present-characters-list">
                                <!-- populated by updatePresentCharacters() -->
                            </div>
                            <div class="game-present-character-tooltip" role="tooltip" aria-hidden="true">
                                <app-asset-image no-transition="true" class="game-present-character-tooltip-image" default-image="./images/default-profile.png"></app-asset-image>
                                <div class="game-present-character-description"></div>
                                <div class="game-present-character-stats"></div>
                            </div>
                        </div>
                        <div class="game-story-content">
                            <div class="game-story-content-list">
                            </div>
                        </div>
                        <app-cycle-inform class="game-cycle-inform"></app-cycle-inform>
                    </div>

                    <div class="game-input-bar">
                        <textarea
                            id="game-input"
                            class="game-input"
                            rows="1"></textarea>
                        <button id="submit-btn" class="game-submit" aria-label="Submit">
                            <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="22" y1="2" x2="11" y2="13"></line>
                                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                            </svg>
                        </button>
                    </div>
                </main>
            </div>
        </div>
        <div class="light-fade"></div>`;
    }
}

/**
 * @param {string} str
 */
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Format a single character stat for the in-dream sidebar. Returns null when
 * the value is missing or unrecognized so the caller can skip it.
 *
 * @param {string} key
 * @param {string | number | null | undefined} raw
 * @returns {{ icon: string, label: string, value: string } | null}
 */
function formatGameStat(key, raw) {
    if (raw === undefined || raw === null || raw === '') return null;

    switch (key) {
        case 'sex': {
            const v = String(raw).toLowerCase();
            const icon = v === 'male' ? '♂️'
                : v === 'female' ? '♀️'
                    : v === 'intersex' ? '⚥'
                        : v === 'none' ? '🚫'
                            : '❓';
            const cap = String(raw).charAt(0).toUpperCase() + String(raw).slice(1);
            return { icon, label: `Sex: ${cap}`, value: cap };
        }
        case 'gender': {
            const v = String(raw).toLowerCase();
            const icon = v === 'male' ? '👨'
                : v === 'female' ? '👩'
                    : v === 'ambiguous' ? '🧑'
                        : '❓';
            const cap = String(raw).charAt(0).toUpperCase() + String(raw).slice(1);
            return { icon, label: `Gender: ${cap}`, value: cap };
        }
        case 'age':
            return { icon: '🎂', label: `Age: ${raw} years`, value: `${raw}y` };
        case 'height':
            return { icon: '📏', label: `Height: ${raw} cm`, value: `${raw}cm` };
        case 'weight':
            return { icon: '⚖️', label: `Weight: ${raw} kg`, value: `${raw}kg` };
        case 'species': {
            const cap = String(raw).charAt(0).toUpperCase() + String(raw).slice(1);
            return { icon: '🧬', label: `Species: ${cap}`, value: cap };
        }
        case 'speciesType': {
            const v = String(raw).toLowerCase();
            // humanoid = human-like creatures; feral = mythical/intelligent
            // talking creatures; animal = standard mute animals.
            const icon = v === 'humanoid' ? '🧍'
                : v === 'feral' ? '🐉'
                    : v === 'animal' ? '🐾'
                        : '❓';
            const labelMap = { humanoid: 'Humanoid', feral: 'Feral', animal: 'Animal' };
            const display = labelMap[/** @type {keyof typeof labelMap} */ (v)] || String(raw);
            return { icon, label: `Species type: ${display}`, value: display };
        }
    }
    return null;
}

customElements.define('app-game', GameOverlay);
