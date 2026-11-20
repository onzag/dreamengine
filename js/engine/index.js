import { emotions } from "./util/emotions.js";
import { consumeAccumulatedSideEffectsReadyFunctions, deEngineUtilsFn } from "./utils.js";
import { commands } from "./commands.js";
import { BaseInferenceAdapter } from "./inference/base.js";
import calculateStateChange from "./gears/state-change.js";
import calculateBondsChange from "./gears/bond-change.js";
import testWorldRulesOn from "./gears/rules-enforce.js";
import testMessageFeasibilityForCharacter from "./gears/feasibility-check.js";
import { getCharacterVolume, getCharacterWeight, getItemVolume, getItemWeight, getWearableFitment, locationPathToMessage } from "./util/weight-and-volume.js";
import { DEJSEngine } from "../jsengine/index.js";
import calculatePostureChange from "./gears/posture-change.js";
import timeForwardsUsingLastMessage, { rerollWorldWeather, timeForwardsToNewTime } from "./gears/time-forwards.js";
import { talk } from "./gears/talk.js";
import { millisecondsToTime } from "./util/time.js";
import { regenerateDEFromSavedDE, removeUnnecessaryPropertiesFromDE } from "./util/save-de.js";
import runAllTriggersFor from "./gears/triggers-run.js";
import deleteTemp from "./gears/temp.js";
import { giveCharacterRandomClothing } from "./util/clothing.js";
import { BaseDataManager } from "./data-management/base.js";
import timeForwardsUsingUntimedMessages from "./gears/time-forwards.js";
import { getHistoryFragment } from "./util/messages.js";
import calculatePhysicalChanges from "./gears/physical-changes.js";
import { calculateEmotionForCharacter } from "./gears/emotional-update.js";
import { getInternalDescriptionOfCharacter } from "./util/character-info.js";

const INVALID_NAMES = ["system", "assistant", "user", "everyone", "nobody",
    "anyone", "somebody", "narrator", "observer", "admin", "moderator",
    "game master", "gm", "storyteller", "dungeon master", "dm", "host",
    "player", "players", "character", "characters", "npc", "npcs",
    "they", "them", "their", "theirs", "he", "him", "his", "she", "her", "hers",
    "it", "its", "i", "me", "my", "mine", "we", "us", "our", "ours", "you", "your", "yours",
    "everyone else", "everybody else", "anyone else", "anybody else",
    "somebody else", "somebodyelse", "nobody else", "nobody", "story master", "storymaster", "story", "master",
    "ooc"];

/**
 * @param {Partial<DEMinimalCharacterReference>} character 
 * @return {DEMinimalCharacterReference}
 */
export function repairPotentialUserWithDefaults(character) {
    const speciesType = character.speciesType || "humanoid";
    const sex = character.sex || "intersex";
    return ({
        ...character,

        id: character.id || "???",
        clothing: character.clothing || "auto",
        metadata: character.metadata || {},
        script: character.script || "",
        unknownName: character.unknownName || "Unknown Creature",
        scriptGivenId: character.scriptGivenId || "",
        attention: typeof character.attention === "number" ? character.attention : 0,

        ageYears: character.ageYears || 30,
        attractiveness: typeof character.attractiveness === "number" ? character.attractiveness : 0.5,
        carryingCapacityKg: typeof character.carryingCapacityKg === "number" ? character.carryingCapacityKg : 20,
        carryingCapacityLiters: typeof character.carryingCapacityLiters === "number" ? character.carryingCapacityLiters : 20,
        charisma: typeof character.charisma === "number" ? character.charisma : 0.5,
        genderAppearance: typeof character.genderAppearance === "number" ? character.genderAppearance : 0.5,
        genderAppearanceByExternals: typeof character.genderAppearanceByExternals === "number" ? character.genderAppearanceByExternals : (typeof character.genderAppearance === "number" ? character.genderAppearance : 0.5),
        pronouns: character.pronouns || (sex === "male" ? "male" : (sex === "female" ? "female" : "ambiguous")),
        groupBelonging: character.groupBelonging || [],
        heightCm: character.heightCm || 170,
        locomotionSpeedMetersPerSecond: typeof character.locomotionSpeedMetersPerSecond === "number" ? character.locomotionSpeedMetersPerSecond : 1.4,
        maintenanceCaloriesPerDay: character.maintenanceCaloriesPerDay || 2000,
        maintenanceHydrationLitersPerDay: character.maintenanceHydrationLitersPerDay || 2,
        name: character.name || "Player",
        perception: typeof character.perception === "number" ? character.perception : 0.5,
        powerGrowthRate: typeof character.powerGrowthRate === "number" ? character.powerGrowthRate : 1,
        race: character.race || null,
        rangeMeters: typeof character.rangeMeters === "number" ? character.rangeMeters : 10000,
        sex: character.sex || "intersex",
        shortDescription: character.shortDescription || "An odd humanoid creature with indistinguishable features a body covered by stars looking like a cosmic entity and no face",
        shortDescriptionBottomNakedAdd: character.shortDescriptionBottomNakedAdd || (
            sex === "male" ? "showing exposed male genitalia" :
                (
                    sex === "female" ? "showing exposed female genitalia" :
                        (sex === "intersex" ? "showing exposed unclear genitalia" :
                            "showing no genitals or anus")
                )
        ),
        shortDescriptionTopNakedAdd: character.shortDescriptionTopNakedAdd || (
            character.sex === "male" && speciesType === "humanoid" ? "showing a flat toned male chest" :
                (character.sex === "female" && speciesType === "humanoid" ? "showing small breasts" :
                    (speciesType === "humanoid" ? "showing no male or female characteristics" : (
                        character.sex === "male" ? "showing male characteristics" :
                            character.sex === "female" ? "showing female characteristics" :
                                "showing no male or female characteristics"
                    )))
        ),
        species: character.species || "unknown",
        speciesType,
        stealth: typeof character.stealth === "number" ? character.stealth : 0.5,
        tier: character.tier || "galactic",
        tierValue: typeof character.tierValue === "number" ? character.tierValue : 100,
        weightKg: typeof character.weightKg === "number" ? character.weightKg : 70,
        blindness: character.blindness === "full" || character.blindness === "partial-good" || character.blindness === "partial-bad" || character.blindness === "no" ? character.blindness : "no",
    });
}

/**
 * @param {DEMinimalCharacterReference} user
 * @returns {DECompleteCharacterReference}
 */
export function createCharacterFromUser(user) {
    return {
        id: user.id,
        script: user.script,
        scriptGivenId: user.scriptGivenId,
        attention: user.attention || 0,
        unknownName: user.species === "human" ? "Stranger" : "Unknown Creature",
        adventurousness: 0,
        antagonism: 0,
        combat: [],
        correctiveness: 0,
        clothing: user.clothing || "auto",
        metadata: user.metadata || {},
        curiosity: 0,
        skepticism: 0,
        apparentTier: user.apparentTier,
        apparentTierValue: user.apparentTierValue,
        name: user.name,
        autism: 0,
        genderAppearance: user.genderAppearance,
        genderAppearanceByExternals: user.genderAppearanceByExternals,
        pronouns: user.pronouns,
        heightCm: user.heightCm,
        weightKg: user.weightKg,
        ageYears: user.ageYears,
        carryingCapacityLiters: user.carryingCapacityLiters,
        carryingCapacityKg: user.carryingCapacityKg,
        characterRules: {},
        actionPromptInjection: [],
        locomotionSpeedMetersPerSecond: user.locomotionSpeedMetersPerSecond,
        maintenanceCaloriesPerDay: user.maintenanceCaloriesPerDay,
        maintenanceHydrationLitersPerDay: user.maintenanceHydrationLitersPerDay,
        rangeMeters: user.rangeMeters,
        generalCharacterDescriptionInjection: {},
        thinkBeforeAct: 0,
        bonds: {
            totalStrangersBondDescription: "",
            system: "UNKNOWN",
            declarations: [],
            bondChangeFineTune: 1.0,
            bondChangeNegativityBias: 1.0,
            strangerBreakawayBondWeightAbsolute: 10,
            strangerBreakawayTimeMinutes: 30,
            strangerNegativeMultiplier: 1.0,
            strangerPositiveMultiplier: 1.0,
            descriptionGeneralInjection: null,
            bond2DoesNotTrackAttraction: false,
            bond2DoesNotTrackAttractionForFamily: false,
            bond2Graduation: {
                moderate: 0,
                strong: 0,
                slight: 0,
            },
            bondGraduation: {
                acquaintance: 0,
                antagonistic: 0,
                bestFriend: 0,
                closeFriend: 0,
                foe: 0,
                friend: 0,
                goodFriend: 0,
                hostile: 0,
                unfriendly: 0,
                unpleasant: 0,
            },
            neutralInteractionBondChange: 0,
        },
        shortDescription: user.shortDescription,
        shortDescriptionBottomNakedAdd: user.shortDescriptionBottomNakedAdd,
        shortDescriptionTopNakedAdd: user.shortDescriptionTopNakedAdd,
        general: "",
        initiative: 1,
        state: {},
        temp: {},
        schizophrenia: 0,
        schizophrenicVoiceDescription: "",
        stateDefinitions: {},
        sex: user.sex,
        strangerInitiative: 1,
        strangerRejection: 0,
        emotions: {},
        heroism: 0,
        stealth: user.stealth,
        perception: user.perception,
        tier: user.tier,
        tierValue: user.tierValue,
        powerGrowthRate: user.powerGrowthRate,
        speciesType: user.speciesType,
        attractions: [],
        dislikes: [],
        likes: [],
        species: user.species,
        attractiveness: user.attractiveness,
        dislikesSpecies: [],
        familyTies: {},
        charisma: user.charisma,
        socialSimulation: {
            gossipTendency: 1,
        },
        triggers: [],
        violence: 0,
        libido: 0,
        race: null,
        groupBelonging: [],
        voice: {
            mute: false,
            description: "",
            modes: [],
            sounds: [],
        },
        blindness: user.blindness || "no",
    }
}

export class DEngine {
    constructor() {
        /**
         * @type {DEObject | null}
         */
        this.deObject = null;
        /**
         * @type {DEObject | null}
         */
        this.deObjectSafeBackup = null;

        this.executingCycle = false;

        this.talkingTurnRequested = false;

        /**
         * @type {((deObject: DEObject, characters: DECompleteCharacterReference, conversation: DEConversation) => Promise<string>) | null}
         */
        this.pseudoConversationSummaryGenerator = null;

        /**
         * @type {((obj: DEObject) => void | Promise<void>)[]}
         */
        this.listeners = [];
        /**
         * @type {((level: "info" | "warning" | "error", message: string) => void)[]}
         */
        this.informListeners = [];
        /**
         * @type {((thinking: boolean, characterId: string | null, noMoreCharactersToTalk: boolean) => void)[]}
         */
        this.thinkingListeners = [];

        /**
         * @type {BaseInferenceAdapter | null}
         */
        this.inferenceAdapter = null;

        /**
         * @type {BaseDataManager | null}
         */
        this.dataManager = null;

        /**
         * @type {DEJSEngine | null}
         */
        this.jsEngine = null;

        /**
         * @type {boolean}
         * 
         * mainly meant for debugging purposes, when true it will disable all world rules checks
         * this speeds up things greatly when testing other parts of the engine
         */
        this.disabledWorldRules = false;

        this.getDEObject = this.getDEObject.bind(this);
    }

    /**
     * A number from 0 to 1 representing how stable the simulation is
     * don't know why you would want to make it unstable, but it makes for
     * a nice gimmick
     * 
     * @param {number} stability 
     */
    setStability(stability) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        // TODO implement deliberate low stability effects
        this.deObject.stability = stability;
        this.backupDEObject();
    }

    getDEObject() {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        return this.deObject;
    }

    /**
     * @param {boolean} disabled 
     */
    setWorldRulesDisabled(disabled) {
        this.disabledWorldRules = disabled;
    }

    /**
     * Makes the user character schizophrenic which changes the behaviour
     * of the testing of world rules, so the character is free to hallucinate
     * instead of being constrained by reality
     */
    enableSchizophreniaModeForUser() {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        this.deObject.characters[this.deObject.user].schizophrenia = 1;
    }

    /**
     * @param {BaseInferenceAdapter} adapter
     */
    setInferenceAdapter(adapter) {
        this.inferenceAdapter = adapter;
    }

    /**
     * @param {BaseDataManager} dataManager 
     */
    setDataManager(dataManager) {
        this.dataManager = dataManager;
    }

    /**
     * 
     * @param {DEJSEngine} jsEngine 
     */
    setJSEngine(jsEngine) {
        this.jsEngine = jsEngine;
    }

    /**
     * @param {((deObject: DEObject, characters: DECompleteCharacterReference, conversation: DEConversation) => Promise<string>)} pseudoConversationSummaryGenerator
     */
    setPseudoConversationGenerator(pseudoConversationSummaryGenerator) {
        this.pseudoConversationSummaryGenerator = pseudoConversationSummaryGenerator;
    }

    /**
     * @param {*} loadName
     * @returns {Promise<void>}
     */
    async initializeFromStoredState(loadName) {
        if (this.initialized) {
            throw new Error("DEngine already initialized");
        } else if (!this.dataManager) {
            throw new Error("Data manager not set, cannot initialize from stored state");
        }

        await this.dataManager.loadDatabase(loadName);
        const deObjectJSON = await this.dataManager.getDEObject();
        this.deObject = deObjectJSON;
        if (!this.deObject) {
            throw new Error("Invalid DEObject JSON");
        } else if (!this.jsEngine) {
            throw new Error("JS Engine not set, cannot import scripts");
        }

        this.deObject = regenerateDEFromSavedDE(this, this.deObject);
        const scriptOrder = await this.dataManager.getScriptOrder();

        for (const script of scriptOrder || []) {
            await this.jsEngine.importScript(script.split("/")[0] || '', script.split("/")[1] || '');
        }

        await this.runInitializationScripts();

        const hasStartedClock = !!this.deObject.world.selectedScene;
        if (hasStartedClock) {
            /**
             * @type {Array<{script: DEScript, scriptKey: string}>}
             */
            const allScripts =
                // @ts-ignore typescript bugs
                this.jsEngine.scriptOrder.map(scriptKey => ({ script: this.jsEngine.scriptCache[scriptKey], scriptKey }));
            await this.callFunctionInScripts(allScripts, (script) => `Running onWorldClockReady for script ${script.scriptKey}`, "onWorldClockReady", { untilTrue: false }, this.deObject);
        }

        this.initialized = true;
    }

    /**
     * @param {string} saveName 
     * @param {any} [metadata] 
     * @returns {Promise<void>}
     */
    async saveCurrentState(saveName, metadata) {
        if (!this.dataManager) {
            throw new Error("Data manager not set, cannot save current state");
        } else if (!this.jsEngine) {
            throw new Error("JS Engine not set, cannot get last safe state");
        } else if (!this.deObject) {
            throw new Error("DEngine not initialized, cannot save current state");
        }

        if (this.hasActiveBackup()) {
            throw new Error("Cannot save current state. Changes are occurring and the state is not stable.");
        }

        const lastSafe = removeUnnecessaryPropertiesFromDE(this.deObject);
        const scriptOrder = this.jsEngine.scriptOrder;

        await this.dataManager.setDEObject(lastSafe);
        await this.dataManager.setScriptOrder(scriptOrder);
        return this.dataManager.saveCurrentDatabase(saveName, metadata);
    }

    /**
     * @param {Omit<DEMinimalCharacterReference, "id" | "scriptGivenId" | "script"> | null} user
     * @param {"player" | "narrator" | "voice-in-the-head"} playMode
     * @param {"standard" | "debug" | "disembodied"} userMode
     */
    async initialize(user, playMode = "player", userMode = "standard") {
        if (this.initialized) {
            throw new Error("DEngine already initialized");
        }

        if (!this.dataManager) {
            throw new Error("Data manager not set, cannot initialize");
        }

        /**
         * @type {DETimeDescription}
         */
        const defaultTimeDEFormat = millisecondsToTime((new Date()).getTime());
        this.deObject = {
            user: "",
            party: [],
            world: {
                metadata: {},
                name: "Unnamed World",
                connections: {},
                currentLocation: /** @type {string} */ (/** @type {unknown} */ (null)),
                currentLocationSlot: /** @type {string} */ (/** @type {unknown} */ (null)),
                scenes: {},
                initialScenes: [],
                locations: {},
                lore: "",
                state: {},
                selectedScene: null,
                temp: {},
            },
            characters: {},
            bonds: {},
            worldNames: {
                mal: [],
                fem: [],
                amb: [],
            },
            stateFor: {},
            initialTime: defaultTimeDEFormat,
            currentTime: { ...defaultTimeDEFormat },
            worldRules: {},
            narrationStyle: {
                maxParagraphs: 2,
                minParagraphs: 2,
                narrativeBias: 0.2,
            },
            playMode,
            importantEvents: {},
            interests: {},
            internalState: {},
            state: {},
            stability: 0,
            counters: {
                characterId: {},
                itemId: {},
                locationId: {},
            },
            userMode: userMode || "standard",
            utils:  /** @type {*} */ (/** @type {unknown} */ (null)),
            database: this.dataManager.getDatabaseForDEObject(),
        };

        await this.dataManager.newDatabase();

        this.deObject.utils = deEngineUtilsFn(this.deObject, this);

        const userValue = user ? repairPotentialUserWithDefaults(user) : repairPotentialUserWithDefaults({ name: "Player" });
        const actualUserId = this.deObject.utils.id.characterIdGenerator(userValue.name);
        this.deObject.user = actualUserId;

        userValue.id = actualUserId;
        userValue.scriptGivenId = "@engine-" + actualUserId;
        userValue.script = "@engine";

        const userCharacter = user ? createCharacterFromUser(userValue) : null;
        if (userCharacter) {
            this.deObject.characters[userCharacter.id] = userCharacter;
        }

        if (!this.jsEngine) {
            throw new Error("JS Engine not set, cannot import scripts");
        }

        await this.runInitializationScripts();
    }

    async endSimulation() {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }

        if (this.dataManager) {
            await this.dataManager.closeCurrentDatabase();
        }

        this.deObject = null;
        this.deObjectSafeBackup = null;
        this.initialized = false;
        this.disabledWorldRules = false;
        this.executingCycle = false;
        this.talkingTurnRequested = false;
    }

    /**
     * @param {string} characterId 
     */
    assumeCharacterIdentity(characterId) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }

        if (!this.deObject.characters[characterId]) {
            throw new Error(`Character with id ${characterId} does not exist so its identity cannot be assumed.`);
        }

        this.deObject.user = characterId;
        this.deObject.world.currentLocation = this.deObject.stateFor[characterId].location;
        this.deObject.world.currentLocationSlot = this.deObject.stateFor[characterId].locationSlot;

        this.informDEObjectUpdated();
    }

    /**
     * @param {string} scriptGivenId 
     */
    assumeCharacterIdentityByScriptGivenId(scriptGivenId) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }

        const characterId = Object.keys(this.deObject.characters).find((charId) => this.getDEObject().characters[charId].scriptGivenId === scriptGivenId);
        if (!characterId) {
            throw new Error(`Character with scriptGivenId ${scriptGivenId} does not exist so its identity cannot be assumed.`);
        }

        this.assumeCharacterIdentity(characterId);
    }

    hasActiveBackup() {
        return !!this.deObjectSafeBackup;
    }

    async backupDEObject() {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        } else if (!this.jsEngine) {
            throw new Error("JS Engine not set, cannot backup DEObject");
        } else if (!this.dataManager) {
            throw new Error("Data manager not set, cannot backup DEObject");
        }

        if (this.deObjectSafeBackup) {
            throw new Error("DEngine safe state already exists, cannot backup DEObject again without restoring first");
        }

        this.deObjectSafeBackup = deepCopy(this.deObject);
        await this.dataManager.newTransaction();
    }

    async restoreDEObjectFromBackup() {
        if (!this.deObjectSafeBackup) {
            throw new Error("DEngine safe state not found");
        } else if (!this.jsEngine) {
            throw new Error("JS Engine not set, cannot restore DEObject from backup");
        } else if (!this.dataManager) {
            throw new Error("Data manager not set, cannot restore DEObject from backup");
        }

        this.deObject = this.deObjectSafeBackup;
        this.deObjectSafeBackup = null;
        await this.dataManager.rollbackTransaction();
    }

    async clearBackupDEObject() {
        if (!this.deObjectSafeBackup) {
            throw new Error("DEngine safe state not found");
        } else if (!this.jsEngine) {
            throw new Error("JS Engine not set, cannot clear DEObject backup");
        } else if (!this.dataManager) {
            throw new Error("Data manager not set, cannot clear DEObject backup");
        }

        this.deObjectSafeBackup = null;
        await this.dataManager.commitTransaction();
    }

    /**
     * 
     * @param {string} characterId 
     * @returns 
     */
    addCharacterToParty(characterId) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        if (!this.deObject.characters[characterId]) {
            throw new Error(`Character with id ${characterId} does not exist so it cannot be added to the party.`);
        }
        if (this.deObject.party.includes(characterId)) {
            return; // already in party
        }
        const deadEndedCharacter = this.deObject.stateFor[characterId]?.deadEnded;
        if (deadEndedCharacter) {
            throw new Error(`Character with id ${characterId} has dead-ended and cannot be added to the party.`);
        }
        this.deObject.party.push(characterId);

        this.informDEObjectUpdated();
    }

    /**
     * @param {string} scriptGivenId
     */
    addCharacterToPartyByScriptGivenId(scriptGivenId) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        const characterId = Object.keys(this.deObject.characters).find((charId) => this.getDEObject().characters[charId].scriptGivenId === scriptGivenId);
        if (!characterId) {
            throw new Error(`Character with scriptGivenId ${scriptGivenId} does not exist so it cannot be added to the party.`);
        }

        this.addCharacterToParty(characterId);
    }

    /**
     * @param {Array<{script: DEScript, scriptKey: string}>} scripts
     * @param {(script: {script: DEScript, scriptKey: string}) => string} loopMessage
     * @param {string} functionName
     * @param {{untilTrue: boolean}} options
     * @param  {...any} args 
     * @returns {Promise<{handled: boolean}>}
     */
    async callFunctionInScripts(scripts, loopMessage, functionName, options, ...args) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        let handled = false;
        for (const script of scripts) {
            let breakCycle = false;
            if (script.script[functionName]) {
                console.log(loopMessage(script));
                const value = await script.script[functionName](...args);

                if (options.untilTrue && value === true) {
                    breakCycle = true;
                    handled = true;
                }
            }
            if (breakCycle) {
                break;
            }
        }

        return { handled };
    }

    async runInitializationScripts() {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        } else if (!this.jsEngine) {
            throw new Error("JS Engine not set, cannot run initialization scripts");
        }
        const orderOfExecution = [
            "world",
            "characters",
            "world-mechanic",
            "character-mechanic",
            "misc",
        ];

        const needsAtLeastOne = [
            "world",
        ];

        for (const type of orderOfExecution) {
            /**
             * @type {Array<{script: DEScript, scriptKey: string}>}
             */
            const scripts =
                // @ts-ignore typescript bugs
                this.jsEngine.scriptOrder.map(scriptKey => ({ script: this.jsEngine.scriptCache[scriptKey], scriptKey })).filter(script => script.script.type === type);

            if (needsAtLeastOne.includes(type) && scripts.length === 0) {
                throw new Error(`At least one script of type ${type} is required.`);
            }

            await this.callFunctionInScripts(scripts, (script) => `Initializing script ${script.scriptKey} of type ${type}`, "initialize", { untilTrue: false }, this.deObject);

            for (const charId in this.deObject.characters) {
                const character = this.deObject.characters[charId];
                if (INVALID_NAMES.includes(character.name.toLowerCase())) {
                    throw new Error(`Character name ${character.name} is invalid or reserved.`);
                }

                // ensure the character name starts with a capital letter and is a-z with spaces only
                if (!/^[A-Z][a-zA-Z ]*$/.test(character.name)) {
                    throw new Error(`Character name ${character.name} is invalid. It must start with a capital letter and contain only letters and spaces.`);
                }

                const charState = this.deObject.stateFor[charId];
                if (!charState) {
                    // adding a char state for this character by default
                    const futureLocation = this.pickRandomLocationForCharacter(character);
                    this.deObject.stateFor[charId] = {
                        hp: 100,
                        carrying: [],
                        carryingCharactersDirectly: [],
                        heardIdentifiers: [],
                        conversationId: null,
                        dead: false,
                        deadEnded: false,
                        deadEndReason: null,
                        location: futureLocation.location,
                        locationSlot: futureLocation.locationSlot,
                        posture: "standing",
                        states: [],
                        wearing: [],
                        primaryEmotion: "neutral",
                        emotionalRange: [],
                    }
                }

                const bonds = this.deObject.bonds[charId];
                if (!bonds) {
                    this.deObject.bonds[charId] = {
                        active: [],
                        ex: [],
                    };
                }
            }
        }

        // delete invalid characters that have not been owned by a script
        for (const charName in this.deObject.characters) {
            const character = this.deObject.characters[charName];
            if (INVALID_NAMES.includes(character.name.toLowerCase())) {
                throw new Error(`Character name ${character.name} is invalid or reserved.`);
            }

            if (!this.deObject.stateFor[charName] || !character.name) {
                delete this.deObject.stateFor[charName];
                delete this.deObject.bonds[charName];
                delete this.deObject.characters[charName];
            }
        }

        for (const type of orderOfExecution) {
            /**
             * @type {Array<{script: DEScript, scriptKey: string}>}
             */
            const scripts =
                // @ts-ignore typescript bugs
                this.jsEngine.scriptOrder.map(scriptKey => ({ script: this.jsEngine.scriptCache[scriptKey], scriptKey })).filter(script => script.script.type === type);


            await this.callFunctionInScripts(scripts, (script) => `Calling onWorldInitialized script ${script.scriptKey} of type ${type}`, "onWorldInitialized", { untilTrue: false }, this.deObject);
        }

        this.initialized = true;
    }

    /**
     * @param {DEMinimalCharacterReference} char 
     * @returns 
     */
    pickRandomLocationForCharacter(char) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        const locationIds = Object.keys(this.deObject.world.locations);
        if (locationIds.length === 0) {
            throw new Error("No locations found in world to pick from.");
        }

        const charHeight = char.heightCm;

        const viableLocations = locationIds.map(locationId => {
            // @ts-ignore
            const allSlots = this.deObject.world.locations[locationId].slots;
            const viableSlots = [];
            for (const slotName in allSlots) {
                const slot = allSlots[slotName];
                if (slot.maxHeightCm && charHeight > slot.maxHeightCm) {
                    continue;
                } else if (slot.maxWeightKg && char.weightKg > slot.maxWeightKg) {
                    continue;
                } else if (slot.maxVolumeLiters && char.carryingCapacityLiters > slot.maxVolumeLiters) {
                    continue;
                }

                if (!slot.maxHeightCm && !slot.maxWeightKg && !slot.maxVolumeLiters) {
                    viableSlots.push(slotName);
                    continue;
                }

                let allItemWeight = 0;
                let allItemVolume = 0;

                const measuredCharacters = [];
                for (const item of slot.items) {
                    const weight = getItemWeight(this.getDEObject(), item);
                    measuredCharacters.push(...weight.allCharactersInvolved);
                    allItemWeight += weight.completeWeight;
                    const volume = getItemVolume(this.getDEObject(), item);
                    measuredCharacters.push(...volume.allCharactersInvolved);
                    allItemVolume += volume.completeVolume;
                }

                if (!this.deObject) {
                    throw new Error("DEngine not initialized");
                }

                for (const charId in this.deObject.stateFor) {
                    const charState = this.deObject.stateFor[charId];
                    if (charState.deadEnded && !charState.dead) {
                        continue;
                    }
                    if (charState.location === locationId && charState.locationSlot === slotName) {
                        if (measuredCharacters.includes(charId)) {
                            continue;
                        }
                        allItemWeight += getCharacterWeight(this.getDEObject(), charId).weight;
                        allItemVolume += getCharacterVolume(this.getDEObject(), charId).volume;
                    }
                }

                const remainingWeight = slot.maxWeightKg - allItemWeight;
                const remainingVolume = slot.maxVolumeLiters - allItemVolume;

                if (slot.maxWeightKg && char.weightKg > remainingWeight) {
                    continue;
                } else if (slot.maxVolumeLiters && char.carryingCapacityLiters > remainingVolume) {
                    continue;
                }

                viableSlots.push(slotName);
            }

            return {
                location: locationId,
                viableSlots,
            };
        }).filter(loc => loc.viableSlots.length > 0);

        const randomViableLocation = viableLocations[Math.floor(Math.random() * viableLocations.length)];

        const doFallback = () => {
            if (!this.deObject) {
                // stupid typescript
                throw new Error("DEngine not initialized");
            }
            console.warn(`No viable slots found for character ${char.name} with id ${char.id}, picking random slot without checking viability.`);
            const locationIds = Object.keys(this.deObject.world.locations);
            if (locationIds.length === 0) {
                throw new Error(`No locations found in world to pick from for fallback.`);
            }
            const randomLocationId = locationIds[Math.floor(Math.random() * locationIds.length)];
            if (!randomLocationId) {
                throw new Error(`No locations found in world to pick from for fallback.`);
            }
            const location = this.deObject.world.locations[randomLocationId];
            if (!location) {
                throw new Error(`Location ${randomLocationId} not found in world for fallback.`);
            }
            const slotIds = Object.keys(location.slots);
            if (!slotIds || slotIds.length === 0) {
                throw new Error(`No slots found in location ${randomLocationId} to pick from for fallback.`);
            }
            const randomSlotName = slotIds[Math.floor(Math.random() * slotIds.length)];
            if (!randomSlotName) {
                throw new Error(`No valid slot found in location ${randomLocationId} for fallback.`);
            }
            return { location: randomLocationId, locationSlot: randomSlotName };
        }

        if (!randomViableLocation) {
            return doFallback();
        }

        const randomSlot = randomViableLocation.viableSlots[Math.floor(Math.random() * randomViableLocation.viableSlots.length)];
        return { location: randomViableLocation.location, locationSlot: randomSlot };
    }

    /**
     * @param {DECompleteCharacterReference} character
     * @param {string} location
     * @param {string} locationSlot
     */
    addCharacter(character, location, locationSlot) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }

        if (INVALID_NAMES.includes(character.name.toLowerCase())) {
            throw new Error(`Character name ${character.name} is invalid or reserved.`);
        }

        // ensure the character name starts with a capital letter and is a-z with spaces only
        if (!/^[A-Z][a-zA-Z ]*$/.test(character.name)) {
            throw new Error(`Character name ${character.name} is invalid. It must start with a capital letter and contain only letters and spaces.`);
        }

        // check all the emotion names are in our rolling emotion list
        for (const emotionName in character.emotions) {
            // @ts-ignore
            if (!emotions.includes(emotionName)) {
                throw new Error(`Character ${character.name} has invalid emotion name ${emotionName}.`);
            }
        }

        this.deObject.characters[character.id] = character;
        this.deObject.bonds[character.id] = {
            active: [],
            ex: [],
        };

        this.deObject.stateFor[character.id] = {
            hp: 100,
            dead: false,
            deadEnded: false,
            deadEndReason: null,
            location: location,
            locationSlot: locationSlot,
            states: [],
            conversationId: null,
            posture: "standing",
            emotionalRange: [],
            primaryEmotion: "neutral",

            heardIdentifiers: [],

            // chars start out empty handed
            carrying: [],
            carryingCharactersDirectly: [],

            // chars start up naked
            // hopefully they give them some clothes soon :)
            wearing: [],
        };
    }

    /**
     * @param {{
     *    followup: Record<string, {
     *       microInjections: string[],
     *       microVoices: DEVoiceDescription[],
     *       injectedActions: Array<{
     *          action: DEActionPromptInjection<DEStringTemplateCharOnly>,
     *          cycle: number,
     *       }>,
     *    }>,
     * }} followup
     * @param {number} currentCycle
     * @param {string[][]} interrupters
     * @param {string[]} charactersToForceTalk
     * @returns {Promise<void>}
     */
    async runFollowUpInteractions(followup, currentCycle, interrupters, charactersToForceTalk) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        } else if (!this.inferenceAdapter) {
            throw new Error("Inference adapter not set");
        } else if (!this.jsEngine) {
            throw new Error("JS Engine not set");
        } else if (!this.dataManager) {
            throw new Error("Data manager not set");
        }

        /**
         * @type {Record<string, {
         *     microInjections: string[],
         *     microVoices: DEVoiceDescription[],
         *     internalState: DEInternalDescriptionOfCharacter,
         *     injectedActions: Array<{
         *         resolvedAction: DEResolvedActionPromptInjection,
         *         action: DEActionPromptInjection<DEStringTemplateCharOnly>,
         *         cycle: number,
         *      }>,
         *   }>}
         */
        const cleanedFollowup = {};

        for (const charId in followup.followup) {
            const character = this.deObject.characters[charId];
            if (!character) {
                console.warn(`Character with id ${charId} not found in DEObject, skipping followup.`);
                continue;
            }

            const internalState = (await getInternalDescriptionOfCharacter(this.deObject, charId));
            const charFollowup = followup.followup[charId];

            const additionalActions = internalState.actions.map(action => ({
                action,
                cycle: currentCycle,
            }));

            cleanedFollowup[charId] = {
                microInjections: charFollowup.microInjections,
                microVoices: charFollowup.microVoices,
                internalState,
                injectedActions: (await Promise.all([...additionalActions, ...charFollowup.injectedActions].map(async (injectedAction) => {
                    const cyclesAgo = Math.abs(currentCycle - injectedAction.cycle);
                    const resolvedAction = await this.resolveAction(injectedAction.action, character, cyclesAgo, currentCycle === 0 ? [] : interrupters[currentCycle - 1] || []);
                    if (!resolvedAction) {
                        console.warn(`Injected action for character ${charId} could not be resolved, skipping.`, injectedAction);
                        return null;
                    }
                    return {
                        ...injectedAction,
                        resolvedAction,
                    };
                }))).filter(action => action !== null),
            };
        }

        for (const charId in charactersToForceTalk) {
            if (cleanedFollowup[charId]) {
                continue;
            }
            const character = this.deObject.characters[charId];
            if (!character) {
                console.warn(`Character with id ${charId} not found in DEObject, skipping forced talk.`);
                continue;
            }

            const internalState = (await getInternalDescriptionOfCharacter(this.deObject, charId));

            const additionalActions = internalState.actions.map(action => ({
                action,
                cycle: currentCycle,
            }));

            cleanedFollowup[charId] = {
                microInjections: [],
                microVoices: [],
                internalState,
                injectedActions: (await Promise.all(additionalActions.map(async (injectedAction) => {
                    const resolvedAction = await this.resolveAction(injectedAction.action, character, 0, []);
                    if (!resolvedAction) {
                        console.warn(`Injected action for character ${charId} could not be resolved, skipping.`, injectedAction);
                        return null;
                    }
                    return {
                        ...injectedAction,
                        resolvedAction,
                    };
                }))).filter(action => action !== null),
            };
        }

        // remove repeats in all those lists
        for (const charId in cleanedFollowup) {
            const charFollowup = cleanedFollowup[charId];

            // microInjections are primitives, a Set is sufficient
            charFollowup.microInjections = [...new Set(charFollowup.microInjections)];

            // microVoices just merge — no deduplication

            // injectedActions: for each of action, narrativeAction and narrativeEffect there must be no
            // two repeated non-empty values. When a repeat is found, blank out that field on the entry with
            // the smallest cycle. Then drop any entry left with all three fields empty.
            for (const field of /** @type {Array<"action" | "narrativeAction" | "narrativeEffect">} */(["action", "narrativeAction", "narrativeEffect"])) {
                const seen = new Map();
                for (const entry of charFollowup.injectedActions) {
                    const value = entry.resolvedAction[field];
                    if (!value) {
                        continue;
                    }
                    const existing = seen.get(value);
                    if (!existing) {
                        seen.set(value, entry);
                        continue;
                    }
                    // blank the field on the entry with the smallest cycle, keep the other as the representative
                    if (entry.cycle < existing.cycle) {
                        entry.resolvedAction[field] = "";
                    } else {
                        existing.resolvedAction[field] = "";
                        seen.set(value, entry);
                    }
                }
            }

            // remove any injectedActions that have all three fields empty
            // even if they might still carry data, this is an action nightmare I know it is possible
            // for an action to render something else in another cycle, but then this means we are accumulating a bunch of actions
            charFollowup.injectedActions = charFollowup.injectedActions.filter(entry =>
                entry.resolvedAction.action || entry.resolvedAction.narrativeAction || entry.resolvedAction.narrativeEffect
            );
        }

        // now we have a clean list for this cycle...

        // fuzz a character's initiative so higher-initiative characters tend to go first, but not always.
        // initiative is a value from 0 to 1; the fuzz window (-0.1 to +0.3) biases upward slightly while
        // still allowing a lower-initiative character to occasionally overtake a higher one.
        /**
         * @param {string} characterId
         * @returns {number}
         */
        const fuzzInitiative = (characterId) => {
            const character = this.getDEObject().characters[characterId];
            const initiative = character?.initiative || 0;
            const fuzz = Math.random() * 0.5 - 0.1;
            return initiative + fuzz;
        };

        // Okay so this should all be completed in a single cycle somehow, but we can have actions from
        // many characters that are all trying to do something at once, and then we have all these characters
        // that are also supposed to talk and do something

        // we need to tell apart injectedActions from microVoices and microInjections
        // because injectedActions are "immediate" actions that are supposed to be performed by the character
        // while microVoices and microInjections are more like "personal side effects" to how the character felt for something
        // that happened, and they don't necessarily need an immediate effect, but we might consider them to be more important to talk

        // So we need to take in for the next cycle before processing in priority; WE WILL FUZZ INITIAIVE SLIGTLY
        // 1. An injected action that can be combined into a single narrative process for all the characters involved wins.
        // 2. The character that has something with actions and the highest initiative wins, it takes at least 1 action to be considered for this.
        // 3. The character that has microInjections and the highest initiative wins, it takes at least 1 microInjection to be considered for this.
        // 4. The character that has microVoices and the highest initiative wins, it takes at least 1 microVoice to be considered for this.
        // 5. Pick a random one from charactersToForceTalk sorting by fuzzed initiative.

        // if no character comes out of this, or we don't get the combination, the follow up is completed and it is the user's turn to talk
        // otherwise we run the talk, we calculate side effects and then run follow up again!... until it is all exhaused

        // we will also have an interrupt for the user in case, they can after all, go in a forever loop of talking

        // 1. The combined narrative action
        /**
         * @type {Array<{
         *    characterId: string,
         *    resolvedAction: DEResolvedActionPromptInjection,
         *    indexOrigin: number,
         *    originalAction: DEActionPromptInjection<DEStringTemplateCharOnly>,
         *  }>}
         */
        let foundPotentiallyCombinableActions = [];

        for (const charId in cleanedFollowup) {
            const charFollowup = cleanedFollowup[charId];
            for (let i = 0; i < charFollowup.injectedActions.length; i++) {
                const injectedAction = charFollowup.injectedActions[i];
                if (
                    // an action that can be delivered through narration
                    (injectedAction.resolvedAction.action && injectedAction.resolvedAction.actionMustBe !== "dialogue") ||
                    // or a narrative action without an action
                    (injectedAction.resolvedAction.narrativeAction && !injectedAction.resolvedAction.action)
                ) {
                    foundPotentiallyCombinableActions.push({
                        characterId: charId,
                        resolvedAction: injectedAction.resolvedAction,
                        indexOrigin: i,
                        originalAction: injectedAction.action,
                    });
                }
            }
        }

        if (foundPotentiallyCombinableActions.length >= 2) {
            const characters = new Set(foundPotentiallyCombinableActions.map(entry => entry.characterId));
            if (characters.size >= 2) {
                // we have at least two characters with a combinable narrative action, those now take priority over any other action

                // will be the same because they won't talk in this hybrid action
                const nextCharactersToForceTalk = charactersToForceTalk;
                const nextInterrupters = [...interrupters, [...characters]];
                const nextCycle = currentCycle + 1;
                const nextFollowup = followup;

                // this is where it gets interesting, we must remove the actions that were combined but leave them
                // if they have narrative effects
                for (const entry of foundPotentiallyCombinableActions) {
                    // we will modify the original action in turn!
                    // this should affect nextFollowup because that is a reference
                    // and the nextFollowup is the same as followup
                    delete entry.originalAction.action;
                    delete entry.originalAction.narrativeAction
                }

                // TODO make brand new special mode narration talk
                // TODO run side effects and alter nextFollowup accordingly
                // TODO run follow up again until exhausted
                return await this.runFollowUpInteractions(nextFollowup, nextCycle, nextInterrupters, nextCharactersToForceTalk);
            }
        }

        const charactersWithActions = Object.keys(cleanedFollowup).filter(charId => cleanedFollowup[charId].injectedActions.filter((a) => a.resolvedAction.action || a.resolvedAction.narrativeAction).length > 0);
        let winner = "";

        if (charactersWithActions.length > 0) {
            const initiative = charactersWithActions.map(charId => ({ charId, fuzzedInitiative: fuzzInitiative(charId) }));
            winner = initiative.sort((a, b) => b.fuzzedInitiative - a.fuzzedInitiative)[0].charId;
        }

        if (!winner) {
            const charactersWithMicroInjections = Object.keys(cleanedFollowup).filter(charId => cleanedFollowup[charId].microInjections.length > 0);
            if (charactersWithMicroInjections.length > 0) {
                const initiative = charactersWithMicroInjections.map(charId => ({ charId, fuzzedInitiative: fuzzInitiative(charId) }));
                winner = initiative.sort((a, b) => b.fuzzedInitiative - a.fuzzedInitiative)[0].charId;
            }
        }

        if (!winner) {
            const charactersWithMicroVoices = Object.keys(cleanedFollowup).filter(charId => cleanedFollowup[charId].microVoices.length > 0);
            if (charactersWithMicroVoices.length > 0) {
                const initiative = charactersWithMicroVoices.map(charId => ({ charId, fuzzedInitiative: fuzzInitiative(charId) }));
                winner = initiative.sort((a, b) => b.fuzzedInitiative - a.fuzzedInitiative)[0].charId;
            }
        }

        if (!winner) {
            const initiative = charactersToForceTalk.map(charId => ({ charId, fuzzedInitiative: fuzzInitiative(charId) }));
            if (initiative.length > 0) {
                winner = initiative.sort((a, b) => b.fuzzedInitiative - a.fuzzedInitiative)[0].charId;
            }
        }

        if (!winner) {
            // we are done
            return;
        }

        // single character mode...
        const winnerFollowup = cleanedFollowup[winner] || {
            injectedActions: [],
            internalState: await getInternalDescriptionOfCharacter(this.deObject, winner),
            microInjections: [],
            microVoices: [],
        };

        const nextCharactersToForceTalk = charactersToForceTalk.filter(charId => charId !== winner);
        const nextInterrupters = [...interrupters, [winner]];
        const nextCycle = currentCycle + 1;
        const nextFollowup = { followup: {
            ...followup.followup
        }};
        delete nextFollowup.followup[winner];

        // TODO make talk
        // TODO run side effects
        // TODO run follow up again until exhausted

        return await this.runFollowUpInteractions(nextFollowup, nextCycle, nextInterrupters, nextCharactersToForceTalk);
    }

    /**
     * 
     * @param {DEActionPromptInjection<DEStringTemplateCharOnly>} action
     * @param {DECompleteCharacterReference} character
     * @param {number} cycles
     * @param {string[]} interrupters
     * @return {Promise<DEResolvedActionPromptInjection | null>}
     */
    async resolveAction(action, character, cycles, interrupters) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }

        if (!action.action && !action.narrativeAction && !action.narrativeEffect) {
            console.warn(`Action has no action, narrativeAction or narrativeEffect. Skipping.`, action);
            return null;
        }

        const resolvedAction = action.action ? action.action(cycles, interrupters) : null;
        const resolvedNarrativeAction = action.narrativeAction ? action.narrativeAction(cycles, interrupters) : null;
        const resolvedNarrativeEffect = action.narrativeEffect ? action.narrativeEffect(cycles, interrupters) : null;

        const stringResolvedAction = resolvedAction ? (
            typeof resolvedAction === "string" ? resolvedAction : await resolvedAction({
                char: character,
            })
        ) : "";

        const stringResolvedNarrativeAction = resolvedNarrativeAction ? (
            typeof resolvedNarrativeAction === "string" ? resolvedNarrativeAction : await resolvedNarrativeAction({
                char: character,
            })
        ) : "";

        const stringResolvedNarrativeEffect = resolvedNarrativeEffect ? (
            typeof resolvedNarrativeEffect === "string" ? resolvedNarrativeEffect : await resolvedNarrativeEffect({
                char: character,
            })
        ) : "";

        if (!stringResolvedAction && !stringResolvedNarrativeAction && !stringResolvedNarrativeEffect) {
            console.warn(`Action has no resolved action, narrativeAction or narrativeEffect. Skipping.`, action);
            return null;
        }

        return {
            action: stringResolvedAction,
            narrativeAction: stringResolvedNarrativeAction,
            narrativeEffect: stringResolvedNarrativeEffect,
            deadEndIsDeath: action.deadEndIsDeath || false,
            emotionalRange: action.emotionalRange || [],
            isDeadEndScenario: action.isDeadEndScenario || false,
            primaryEmotion: action.primaryEmotion || null,
            actionMustBe: action.actionMustBe,
            dominance: action.dominance,
            voice: action.voice,
        }
    }

    /**
     * 
     * @param {{moveTimeForwards: boolean}} options
     * @param {number} cycle
     * @param {string[][]} interruptersAccumulated
     * @param {string | null} characterIdThatJustTalked
     */
    async calculateSideEffects(options, cycle, interruptersAccumulated, characterIdThatJustTalked = null) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        } else if (!this.inferenceAdapter) {
            throw new Error("Inference adapter not set");
        } else if (!this.jsEngine) {
            throw new Error("JS Engine not set");
        } else if (!this.dataManager) {
            throw new Error("Data manager not set");
        }

        if (options.moveTimeForwards) {
            await timeForwardsUsingUntimedMessages(this);
        }

        const lastMessages = await getHistoryFragment(this, this.deObject.characters[this.deObject.user], {
            msgLimit: "ALL_UNPROCESSED_MESSAGES_UNTIL_FIRST_PROCESSED_MESSAGE",
            perspective: "story-master",
        });

        const { destroyedItemIds: destroyedItems } = await calculatePhysicalChanges(this);

        /**
         * @type {{
         *    followup: Record<string, {
         *       microInjections: string[],
         *       microVoices: DEVoiceDescription[],
         *       injectedActions: Array<{
         *          action: DEActionPromptInjection<DEStringTemplateCharOnly>,
         *          cycle: number,
         *       }>
         *    }>
         * }}
         */
        const results = {
            followup: {

            }
        }

        for (const characterId of lastMessages.conversingCharacters) {
            const character = this.deObject.characters[characterId];

            if (character.id === characterIdThatJustTalked) {
                continue;
            }

            // the character was already dead ended, so we don't need to process them
            const isDeadEndedAndNotDead = this.deObject.stateFor[characterId]?.deadEnded && !this.deObject.stateFor[characterId]?.dead;
            if (isDeadEndedAndNotDead) {
                continue;
            }

            // we do this at first so that characters can all have their emotions updated first
            await calculateEmotionForCharacter(this, character);
        }

        // this will include everyone involved in the conversation
        for (const characterId of lastMessages.conversingCharacters) {
            const character = this.deObject.characters[characterId];

            // the character was already dead ended, so we don't need to process them
            const isDeadEndedAndNotDead = this.deObject.stateFor[characterId]?.deadEnded && !this.deObject.stateFor[characterId]?.dead;
            if (isDeadEndedAndNotDead) {
                continue;
            }

            // run the triggers and calculate things
            // this can kill the character
            const triggersOutcome = await runAllTriggersFor(this, character);

            const nextActionsProduced = this.deObject.internalState.NEXT_ACTIONS || [];
            delete this.deObject.internalState.NEXT_ACTIONS;

            /**
             * @type {Array<{characterId: string, action: DEActionPromptInjection<DEStringTemplateCharOnly>}>}
             */
            const allNextActions = [...nextActionsProduced];

            for (const nextAction of allNextActions) {
                if (nextAction.characterId !== characterId) {
                    console.warn(`Next action was produced for character ${nextAction.characterId} but we are processing character ${characterId}. Adding anyway, but this may be a bug in the script that produced the next action.`);
                }

                // they can talk twice in a row for these injected actions
                if (!this.deObject.stateFor[characterId].dead) {
                    if (typeof nextAction.action.probability === "number" && nextAction.action.probability < Math.random()) {
                        console.log(`Next action for character ${characterId} was skipped due to probability check.`);
                        continue;
                    }

                    results.followup[characterId] = results.followup[characterId] || {
                        microInjections: [],
                        microVoices: [],
                        injectedActions: [],
                    };
                    results.followup[characterId].injectedActions.push({
                        action: nextAction.action,
                        cycle,
                    });
                } else {
                    console.log(`Next action for character ${characterId} was skipped because the character is dead.`);
                }
            }

            const isDeadEndedAndNotDeadNow = this.deObject.stateFor[characterId]?.deadEnded && !this.deObject.stateFor[characterId]?.dead;
            if (isDeadEndedAndNotDeadNow) {
                continue;
            }

            if (!this.deObject.stateFor[characterId].dead) {
                results.followup[characterId] = results.followup[characterId] || {
                    microInjections: [],
                    microVoices: [],
                    injectedActions: [],
                };
                results.followup[characterId].microInjections.push(...triggersOutcome.microInjections);
                results.followup[characterId].microVoices.push(...triggersOutcome.microVoices);
            }

            await calculatePostureChange(this, character);
            await calculateStateChange(this, character);
            await calculateBondsChange(this, character);
        }

        await deleteTemp(this);

        await consumeAccumulatedSideEffectsReadyFunctions(destroyedItems);
        await this.informDEObjectUpdated();

        return results;
    }

    /**
     * @param {string} optionName 
     */
    async startScene(optionName) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        } else if (!this.inferenceAdapter) {
            throw new Error("Inference adapter not set");
        } else if (!this.jsEngine) {
            throw new Error("JS Engine not set, cannot run initialization scripts");
        } else if (!this.dataManager) {
            throw new Error("Data manager not set, cannot start scene");
        }

        let ownsBackup = false;
        if (!this.hasActiveBackup()) {
            await this.backupDEObject();
            ownsBackup = true;
        }

        try {
            this.informThinking(true, null, false);

            try {
                await this.inferenceAdapter.initialize();
            } catch (error) {
                console.warn("Inference adapter failed to initialize, continuing anyway. Error:", error);
            }

            const randomId = crypto.randomUUID();
            const sceneId = `${optionName}_${randomId}`;

            const isInitialScene = !this.deObject.world.selectedScene;

            /**
             * @type {DEScene}
             */
            const scene = this.deObject.world.scenes[optionName];
            if (!scene) {
                throw new Error(`Scene with option name ${optionName} not found.`);
            }
            const sceneObject = scene.prepareScene ? await scene.prepareScene(scene) || scene : scene;

            let preselectedTimeAtSceneStart = false;

            // the scene has its own time, we need to check if it's in the past or future
            if (sceneObject.time) {
                // check that the time is in the future
                if (sceneObject.time.time < this.deObject.currentTime.time && this.deObject.world.selectedScene) {
                    console.warn(`Scene time ${sceneObject.time.time} is in the past compared to current time ${this.deObject.currentTime.time}.`);
                    this.inform("warning", `Scene time ${sceneObject.time.time} is in the past compared to current time ${this.deObject.currentTime.time}. This may cause unexpected behavior.`);

                } else {
                    // the scene time is in the future, we need to move time forwards to that point
                    // if we don't have a selected scene, it means this is our first scene
                    if (!this.deObject.world.selectedScene) {
                        this.deObject.initialTime = { ...sceneObject.time };
                        this.deObject.currentTime = { ...sceneObject.time };
                        rerollWorldWeather(this);
                    } else {
                        preselectedTimeAtSceneStart = true;
                        await timeForwardsToNewTime(this, sceneObject.time)
                    }
                }
            } else if (this.deObject.world.selectedScene) {

            } else {
                rerollWorldWeather(this);
            }

            this.deObject.stateFor[this.deObject.user].location = sceneObject.location;
            this.deObject.stateFor[this.deObject.user].locationSlot = sceneObject.locationSlot;

            this.deObject.world.currentLocation = sceneObject.location;
            this.deObject.world.currentLocationSlot = sceneObject.locationSlot;

            const expectedParticipants = (sceneObject.engagedCharacters ? (
                typeof sceneObject.engagedCharacters === "function" ? sceneObject.engagedCharacters() : sceneObject.engagedCharacters
            ) : []).map((v) => typeof v === "string" ? v : v.id);
            expectedParticipants.push(this.deObject.user);

            // ensure these are at the given location, if not, teleport them there
            for (const participantId of expectedParticipants) {
                if (!this.deObject.characters[participantId]) {
                    throw new Error(`Participant character ${participantId} not found in DEObject characters.`);
                }

                this.deObject.stateFor[participantId].location = sceneObject.location;
                this.deObject.stateFor[participantId].locationSlot = sceneObject.locationSlot;
            }

            this.deObject.world.selectedScene = optionName;

            /**
             * @type {Array<{script: DEScript, scriptKey: string}>}
             */
            const allScripts =
                // @ts-ignore typescript bugs
                this.jsEngine.scriptOrder.map(scriptKey => ({ script: this.jsEngine.scriptCache[scriptKey], scriptKey }));

            if (isInitialScene) {
                await this.callFunctionInScripts(allScripts, (script) => `Running onWorldClockReady for script ${script.scriptKey} at the end of initialization`, "onWorldClockReady", { untilTrue: false }, this.deObject);

                const allCharactersThatWouldLikeTheirClothesModified = Object.keys(this.deObject.characters).filter(name => {
                    // @ts-ignore
                    return this.deObject.characters[name].clothing !== "custom";
                });

                for (const charName of allCharactersThatWouldLikeTheirClothesModified) {
                    const char = this.deObject.characters[charName];
                    const fitment = char.clothing === "auto-loose" ? "loose" : char.clothing === "auto-tight" ? "tight" : "normal";

                    const info = await this.callFunctionInScripts(allScripts, (script) => `Running onCharacterNeedsClothing for script ${script.scriptKey} for character ${charName}`, "onCharacterNeedsClothing", { untilTrue: true }, this.deObject, char, fitment);
                    if (!info.handled) {
                        // check if the character is naked and humanoid, if so try to find some clothes at least
                        const charState = this.deObject.stateFor[charName];
                        if (char.speciesType === "humanoid") {
                            giveCharacterRandomClothing(this.deObject.utils, char, charState, this.deObject.world, fitment);
                        }
                    }
                }
            }

            const narration = typeof sceneObject.narration === "string" ? sceneObject.narration : await sceneObject.narration({
                char: this.deObject.characters[this.deObject.user],
            });

            const narrationParsed = await this.deObject.utils.narrationAndDialogue.parseNarration(narration, null);

            const conversation = await this.deObject.utils.conversations.newConversation({
                participants: expectedParticipants,
                pseudoConversation: false,
                communicators: {},
            }, {
                teleportParticipantsTo: sceneObject.location,
                unsafeMode: false,
            });

            await this.deObject.utils.conversations.addMessageToConversation(conversation.id, {
                canOnlyBeSeenByCharacters: null,
                content: [
                    {
                        type: "narration",
                        fragments: narrationParsed,
                    },
                ],
                characterId: null,
                isCharacter: false,
                isRejectedMessage: false,
                isStoryMasterMessage: true,
                singleSummary: null,
                emotion: null,
                emotionalRange: null,
                interactingCharacters: [],
                rumors: [],
                metadata: {},
                summariesByCharacterId: {},
            });

            scene.sceneStarted && await scene.sceneStarted(scene);
            await this.callFunctionInScripts(allScripts, (script) => `Running onSceneStarted for script ${script.scriptKey} at the start of scene ${sceneId}`, "onSceneStarted", { untilTrue: false }, this.deObject, scene);

            await this.informDEObjectUpdated();

            this.inform("info", "Pre-calculating side effects...");
            const nextFollowUpInfo = await this.calculateSideEffects({
                moveTimeForwards: !preselectedTimeAtSceneStart,
            }, 0, [], null);

            await this.informDEObjectUpdated();

            if (Object.values(nextFollowUpInfo.followup).some(followup => followup.injectedActions.length) || sceneObject.charactersStart) {
                const baseList = sceneObject.charactersStart ? ([...(typeof sceneObject.engagedCharacters === "function" ? sceneObject.engagedCharacters() : sceneObject.engagedCharacters)]) : [];
                const baseListNoDuplicatesOnlyIds = Array.from(new Set(baseList.map(v => typeof v === "string" ? v : v.id)));
                await this.runFollowUpInteractions(nextFollowUpInfo, 0, [], baseListNoDuplicatesOnlyIds);
            }

            this.informThinking(false, null, true);

            scene.sceneReady && await scene.sceneReady(scene);

            await this.callFunctionInScripts(allScripts, (script) => `Running onSceneReady for script ${script.scriptKey} at the end of scene ${sceneId}`, "onSceneReady", { untilTrue: false }, this.deObject, scene);

            if (ownsBackup) {
                await this.clearBackupDEObject();
            }

            // Game on :)
        } catch (error) {
            console.error("Error during scene initialization:", error);
            if (ownsBackup) {
                await this.restoreDEObjectFromBackup();
                await this.informDEObjectUpdated();
            }
            throw error;
        } finally {
            this.informThinking(false, null, true);
        }
    }

    async informDEObjectUpdated() {
        await Promise.all(this.listeners.map(async (listener) => {
            try {
                // @ts-ignore
                await listener(this.deObject)
            } catch (e) {
                console.error("Error in listener:", e);
            }
        }));
    }

    /**
     * @param {"info" | "error" | "warning"} level
     * @param {string} message
     */
    inform(level, message) {
        for (const listener of this.informListeners) {
            try {
                listener(level, message);
            } catch (e) {
                console.error("Error in cycle state listener:", e);
            }
        }
    }

    /**
     * @param {boolean} thinking 
     * @param {string | null} characterId
     * @param {boolean} noMoreCharactersToTalk
     */
    informThinking(thinking, characterId, noMoreCharactersToTalk) {
        for (const listener of this.thinkingListeners) {
            try {
                listener(thinking, characterId, noMoreCharactersToTalk);
            } catch (e) {
                console.error("Error in thinking listener:", e);
            }
        }
    }

    async requestTurn() {
        this.talkingTurnRequested = true;
    }

    /**
     * @param {(obj: DEObject) => void | Promise<void>} listener 
     */
    addDEObjectUpdatedListener(listener) {
        this.listeners.push(listener);
    }

    /**
     * @param {(obj: DEObject) => void | Promise<void>} listener 
     */
    removeDEObjectUpdatedListener(listener) {
        this.listeners = this.listeners.filter(l => l !== listener);
    }

    /**
     * @param {(level: "info" | "warning" | "error", message: string) => void} listener 
     */
    addInformListener(listener) {
        this.informListeners.push(listener);
    }

    /**
     * @param {(level: "info" | "warning" | "error", message: string) => void} listener 
     */
    removeInformListener(listener) {
        this.informListeners = this.informListeners.filter(l => l !== listener);
    }

    /**
     * @param {(thinking: boolean, character: string | null, noMoreCharactersToTalk: boolean) => void} listener 
     */
    addThinkingListener(listener) {
        this.thinkingListeners.push(listener);
    }

    /**
     * @param {(thinking: boolean, characterId: string | null, noMoreCharactersToTalk: boolean) => void} listener 
     */
    removeThinkingListener(listener) {
        this.thinkingListeners = this.thinkingListeners.filter(l => l !== listener);
    }

    /**
     * @param {string} commandText 
     */
    async executeCommand(commandText) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        const command = commandText.slice(1).trim().split(" ")[0].toLowerCase();

        let message = "";
        if (command === "help") {
            message = "Available commands:\n\n"
                + "/help - Show this help message\n";

            for (const [commandName, commandValue] of Object.entries(commands)) {
                message += `/${commandName} ${commandValue.args.join(", ")} - ${commandValue.help}\n`;
            }
        } else if (commands[command]) {
            try {
                message = await commands[command].run(this, commandText.split(" ").slice(1).join(" ").split(",").map(s => s.trim()));
            } catch (error) {
                // @ts-ignore
                message = `Error executing command /${command}: ${error.message}`;
                // @ts-ignore
                console.log(error.stack);
            }
        } else {
            message = "Unknown command /" + command + ". Type /help for a list of commands.";
        }

        this.inform("info", message);
    }
}

/**
 * 
 * @param {*} obj 
 */
// @ts-ignore
export function deepCopy(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    } else if (Array.isArray(obj)) {
        // @ts-ignore
        return obj.map(item => deepCopy(item));
    }
    const copy = {};
    for (const key in obj) {
        const value = obj[key];
        // @ts-ignore
        copy[key] = deepCopy(value);
    }
    return copy;
}

/**
 * 
 * @param {*} obj 
 */
export function deepCopyNoHistory(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    } else if (Array.isArray(obj)) {
        // @ts-ignore
        return obj.map(item => deepCopy(item));
    }
    const copy = {};
    for (const key in obj) {
        if (key === "history") {
            continue;
        }
        const value = obj[key];
        // @ts-ignore
        copy[key] = deepCopy(value);
    }
    return copy;
}
