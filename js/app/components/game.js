import { playCancelSound, playConfirmSound, playHoverSound, stopAllAmbiencesAndStartNewOne } from '../sound.js';
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

        /**
         * @type {Promise<void>}
         */
        this.lightFadePromise = new Promise(resolve => {
            this.lightFadeResolve = resolve;
        });

        /** @type {ReturnType<typeof setTimeout> | null} */
        this._charUpdateTimer = null;
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
            const partyCharactersJson = this.getAttribute('party-characters') || '[]';
            const partyCharacters = JSON.parse(partyCharactersJson);

            if (!comeFromConflictError) {
                await window.ENGINE_WORKER_CLIENT.jsEngineClearExecutionOrder();
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

    async onInitialSceneSelect() {
        try {
            const actualUserName = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["user", "name"],
            });
            const currentSelectedScene = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["world", "selectedScene"],
            });
            const themeSong = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["world", "state", "theme"],
            });

            if (themeSong && themeSong.asset) {
                const worldNamespace = this.getAttribute('world-namespace') || '';
                const worldId = this.getAttribute('world-id') || '';
                const isSystemAsset = worldNamespace.startsWith('@');
                const base = isSystemAsset
                    ? window.DREAMENGINE_DEFAULT_SCRIPTS_HOME
                    : window.DREAMENGINE_HOME;

                const themeUrl = `${base}/assets/${worldNamespace}/${worldId}/${themeSong.asset}`;
                (async () => {
                    await this.lightFadePromise; // ensure the light fade has completed before starting the ambience, so it doesn't play on top of the fade-out
                    try {
                        await stopAllAmbiencesAndStartNewOne([{ src: themeUrl, volume: themeSong.volume || 1 }], 1000, 1000);
                    } catch (error) {
                        console.error('Error starting theme ambience:', error);
                    }
                })();
            }

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
                window.ENGINE_WORKER_CLIENT.onInferringOverConversationMessage = this.onInferringOverConversationMessage.bind(this);

                await window.ENGINE_WORKER_CLIENT.startScene({ sceneName: selectedScene });
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
                if (changedRootLocation || !wantNames.has(/** @type {HTMLElement} */ (item).dataset.slotName || '')) item.remove();
            }

            for (const entry of slotEntries) {
                let item = /** @type {HTMLElement | null} */ (
                    Array.from(slotsList.querySelectorAll('.game-nav-bar-location-slot'))
                        .find(el => /** @type {HTMLElement} */ (el).dataset.slotName === entry.name)
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
                path: ["utils", "templateUtils", "allCharactersAtLocation"],
                call: [location],
                pick: ["name", "gender", "heightCm", "species", "speciesType"],
                // @ts-ignore
            })).filter((v) => v.name !== userName).map(async (char) => {
                // for each character determine what slot they are at
                const charSlot = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                    path: ["stateFor", char.name, "locationSlot"],
                });
                const charDescription = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                    path: ["utils", "templateUtils", "getExternalDescriptionOfCharacter"],
                    call: [{char: char.name}, true, false],
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
                if (!currentNames.has(/** @type {HTMLElement} */ (card).dataset.charName)) card.remove();
            }

            const emptyEl = list.querySelector('.game-present-characters-empty');
            if (charactersAtLocation.length === 0) {
                if (!emptyEl) {
                    const el = document.createElement('div');
                    el.className = 'game-present-characters-empty';
                    el.textContent = 'No one else is here.';
                    list.appendChild(el);
                }
                return;
            }
            if (emptyEl) emptyEl.remove();

            const engineInfo = await window.ENGINE_WORKER_CLIENT.getEngineScriptInfo();

            for (const char of charactersAtLocation) {
                let card = /** @type {HTMLElement | null} */ (
                    Array.from(list.querySelectorAll('.game-present-character'))
                        .find(el => /** @type {HTMLElement} */ (el).dataset.charName === char.name)
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

        } catch (error) {

        }
    }

    /**
     * @param {"info" | "warning" | "error"} level 
     * @param {string} message 
     */
    onCycleInform(level, message) {
        console.warn(`Cycle inform [${level}]: ${message}`);
    }

    /**
     * 
     * @param {{conversationId: string, messageId: string, text: string, hidden: boolean}} data 
     */
    onInferringOverConversationMessage(data) {
        console.log(`Inferring-over conversation message [${data.conversationId} / ${data.messageId}]: ${data.text} (hidden: ${data.hidden})`);
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
            }) || "image";

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
                    if (this.getAttribute('is-self-insert') === 'true' && userNameBySettings === actualUserName) {
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
        dialog.setAttribute('no-cancel-on-backdrop-click', 'true');
        dialog.setAttribute('extra-z-index', '100');
        dialog.dataset.nameConflict = 'true';

        const escapedName = escapeHtml(currentName);

        dialog.innerHTML = `
            <p style="margin: 0 0 1.2vh 0;">
                A character in this world already shares the name ${escapedName}. Please pick a different name to use for this dream.
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
        // @ts-expect-error
        document.querySelector('.sky').style.display = 'block';
        // @ts-ignore
        document.querySelector('.fx').style.zIndex = ''; // delete z-index override to restore normal stacking
        // @ts-ignore
        document.querySelector('.ambience').style.zIndex = ''; // delete z-index override to restore normal stacking

        window.ENGINE_WORKER_CLIENT.onCycleInform = null;
        window.ENGINE_WORKER_CLIENT.onInferringOverConversationMessage = null;
        window.ENGINE_WORKER_CLIENT.onDEObjectUpdated = null;

        this.stopEngine();

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
                            <div class="game-sidebar-portrait">
                                <app-asset-image image-url="${characterAsset ? escapeHtml(characterAsset) : ''}" default-image="./images/default-profile.png"></app-asset-image>
                            </div>
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
