import { playCancelSound, playConfirmSound, playHoverSound, startAmbienceWithFade, stopAmbienceWithFade } from '../sound.js';
import './world-image.js';
import './dialog.js';

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

        /**
         * @type {Promise<void>}
         */
        this.lightFadePromise = new Promise(resolve => {
            this.lightFadeResolve = resolve;
        });
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
        const bgRoot = /** @type {HTMLElement | null} */ (this.root.querySelector('.game-root'));
        const probedUrl = bgRoot?.dataset.bgUrl;
        const fallbackUrl = './images/default-world.png';
        if (bgRoot && probedUrl && probedUrl !== fallbackUrl) {
            const probe = new Image();
            probe.onerror = () => {
                bgRoot.style.backgroundImage = `url('${fallbackUrl}')`;
            };
            probe.src = probedUrl;
        }

        const lightFade = this.root.querySelector('.light-fade');
        if (lightFade) {
            setTimeout(async () => {
                lightFade.classList.add('fade-out');
                await new Promise(resolve => setTimeout(resolve, 1100));
                lightFade.remove();
                setTimeout(() => {
                    this.lightFadeResolve();
                }, 1000); // delay the resolve to ensure the fade-out has fully completed before allowing any dependent actions (like error dialogs) to proceed
            }, 1000); // slight delay to ensure the element is visible before starting the fade
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

    async prepareGame(comeFromConflictError = false, newName = null) {
        try {
            if (!comeFromConflictError) {
                await window.ENGINE_WORKER_CLIENT.jsEngineClearExecutionOrder();
                await window.ENGINE_WORKER_CLIENT.jsEngineImportScript({
                    namespace: this.getAttribute('world-namespace') || '',
                    id: this.getAttribute('world-id') || '',
                });

                const isSelfInsert = this.getAttribute('is-self-insert') === 'true';
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
                        tier, tierValue, powerGrowthRate,
                        species, speciesType, race, groupBelonging,
                    ] = await Promise.all([
                        cfg('user.name'), cfg('user.sex'), cfg('user.gender'),
                        cfg('user.heightCm'), cfg('user.weightKg'), cfg('user.ageYears'),
                        cfg('user.carryingCapacityLiters'), cfg('user.carryingCapacityKg'),
                        cfg('user.maintenanceCaloriesPerDay'), cfg('user.maintenanceHydrationLitersPerDay'),
                        cfg('user.rangeMeters'), cfg('user.locomotionSpeedMetersPerSecond'),
                        cfg('user.shortDescription'), cfg('user.shortDescriptionTopNakedAdd'), cfg('user.shortDescriptionBottomNakedAdd'),
                        cfg('user.stealth'), cfg('user.perception'), cfg('user.attractiveness'), cfg('user.charisma'),
                        cfg('user.tier'), cfg('user.tierValue'), cfg('user.powerGrowthRate'),
                        cfg('user.species'), cfg('user.speciesType'), cfg('user.race'), cfg('user.groupBelonging'),
                    ]);

                    user = {
                        name,
                        sex: sex || "male",
                        gender: gender || sex || "male",
                        heightCm: Number(heightCm),
                        weightKg: Number(weightKg),
                        ageYears: Number(ageYears),
                        carryingCapacityLiters: Number(carryingCapacityLiters),
                        carryingCapacityKg: Number(carryingCapacityKg),
                        maintenanceCaloriesPerDay: Number(maintenanceCaloriesPerDay),
                        maintenanceHydrationLitersPerDay: Number(maintenanceHydrationLitersPerDay),
                        rangeMeters: Number(rangeMeters),
                        locomotionSpeedMetersPerSecond: Number(locomotionSpeedMetersPerSecond),
                        shortDescription: shortDescription || '',
                        shortDescriptionTopNakedAdd: shortDescriptionTopNakedAdd || null,
                        shortDescriptionBottomNakedAdd: shortDescriptionBottomNakedAdd || null,
                        stealth: Number(stealth),
                        perception: Number(perception),
                        attractiveness: Number(attractiveness),
                        charisma: Number(charisma),
                        tier,
                        tierValue: Number(tierValue),
                        powerGrowthRate: Number(powerGrowthRate),
                        species: species || 'human',
                        speciesType: speciesType || 'humanoid',
                        race: race || null,
                        groupBelonging: groupBelonging || [],
                    };


                    console.log('User config values retrieved for self-insert:', user);
                }

                await window.ENGINE_WORKER_CLIENT.initialize({ user, playMode });
            } else {
                await window.ENGINE_WORKER_CLIENT.completeDisruptedInitializationDueToNameConflict({ newName });
            }

            // check if we are taking a character's identity (i.e. not a self-insert but sharing a name with an existing character), and if so, assume that identity to get the correct starting location and inventory
            const characterName = this.getAttribute('character-name') || '';
            const isSelfInsert = this.getAttribute('is-self-insert') === 'true';
            if (!isSelfInsert && characterName) {
                await window.ENGINE_WORKER_CLIENT.assumeCharacterIdentity({ characterName });
            }

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

    async onInitialSceneSelect() {
        try {
            const actualUserName = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["user", "name"],
            });
            const currentSelectedScene = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["world", "selectedScene"],
            });
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

                await window.ENGINE_WORKER_CLIENT.startScene({ sceneName: selectedScene });
            }
        } catch (error) {
            // @ts-ignore
            this.displayFatalError('Failed to select the initial scene.', error);
            console.error('Error selecting initial scene:', error);
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

            // Keep the input placeholder in sync with the engine-side name. The
            // wording mirrors render() and varies by special-mode.
            const input = /** @type {HTMLTextAreaElement | null} */ (this.root.getElementById('game-input'));
            if (input) {
                const specialMode = this.getAttribute('special-mode') || '';
                const voiceName = this.getAttribute('voice-name') || '';
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

            const content = this.root.querySelector('.game-sidebar-content');
            if (!content) return;

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
        dialog.setAttribute('extra-z-index', '100');
        dialog.dataset.nameConflict = 'true';

        const escapedName = escapeHtml(currentName);

        dialog.innerHTML = `
            <p style="margin: 0 0 1.2vh 0;">
                A character in this world already shares the name ${escapedName}. Please pick a different name to use for this dream.
            </p>
            <app-overlay-input
                label="Your name"
                input-placeholder="Enter a different name"
                input-data-location="newName"
                input-default-value="${escapedName}"
            ></app-overlay-input>
        `;

        const nameInput = dialog.querySelector('app-overlay-input[input-data-location="newName"]');
        if (nameInput && currentName) {
            nameInput.setAttribute('value', currentName);
        }

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
        // @ts-expect-error
        document.querySelector('.sky').style.display = 'block';
        // @ts-ignore
        document.querySelector('.fx').style.zIndex = ''; // delete z-index override to restore normal stacking
        // @ts-ignore
        document.querySelector('.ambience').style.zIndex = ''; // delete z-index override to restore normal stacking

        await stopAmbienceWithFade(1000, 3);
        await startAmbienceWithFade(['./sounds/dream-ambience.mp3'], 1000, 3);
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

    onToggleSidebar() {
        playConfirmSound();
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

    render() {
        const characterName = this.getAttribute('character-name') || 'Unnamed Dreamer';
        const isSelfInsert = this.getAttribute('is-self-insert') === 'true';
        const specialMode = this.getAttribute('special-mode') || '';
        const worldNamespace = this.getAttribute('world-namespace') || '';
        const worldId = this.getAttribute('world-id') || '';
        const characterAsset = this.getAttribute('character-asset') || '';
        const voiceName = this.getAttribute('voice-name') || '';

        // Build the input placeholder (3rd-person, varies by mode).
        let inputPlaceholder;
        if (specialMode === 'narrator') {
            inputPlaceholder = `Narrate ${characterName}'s actions\u2026`;
        } else if (specialMode === 'schizophrenia') {
            const voice = voiceName || 'a voice';
            inputPlaceholder = `Speak inside ${characterName}'s head as ${voice}\u2026`;
        } else {
            inputPlaceholder = `What does ${characterName} do/say?`;
        }

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

        const subtitleParts = [];
        if (specialMode === 'narrator') subtitleParts.push('Narrator');
        else if (specialMode === 'schizophrenia') subtitleParts.push('Voice in the head');
        else if (isSelfInsert) subtitleParts.push('Self-insert');
        if (worldNamespace && worldId) {
            const ns = worldNamespace.startsWith('@') ? worldNamespace.slice(1) : worldNamespace;
            subtitleParts.push(`${ns} / ${worldId}`);
        }

        this.root.innerHTML = `
        <link rel="stylesheet" href="components/game.css">
        <div class="game-root" data-bg-url="${escapeHtml(worldBgUrl)}" style="background-image: url(&quot;${escapeHtml(worldBgUrl)}&quot;);">
            <div class="game-stage">
                <!-- Sidebar (starts open; serves as a toolbox) -->
                <aside class="game-sidebar" aria-label="Game sidebar">
                    <div class="game-sidebar-inner">
                        <div class="game-sidebar-header">
                            ${characterAsset ? `
                                <div class="game-sidebar-portrait">
                                    <app-asset-image image-url="${escapeHtml(characterAsset)}" default-image="./images/default-profile.png"></app-asset-image>
                                </div>
                            ` : ''}
                            <div class="game-sidebar-title">${escapeHtml(characterName)}</div>
                            ${subtitleParts.length ? `<div class="game-sidebar-subtitle">${escapeHtml(subtitleParts.join(' · '))}</div>` : ''}
                        </div>
                        <div class="game-sidebar-content">
                            <!-- intentionally empty for now -->
                        </div>
                        <div class="game-sidebar-footer">
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

                    <div class="game-input-bar">
                        <textarea
                            id="game-input"
                            class="game-input"
                            rows="1"
                            placeholder="${escapeHtml(inputPlaceholder)}"></textarea>
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
