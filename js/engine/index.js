import { ALL_FUNCTIONS_WITH_SPECIALS } from "../schema/functions.js"
import { weightedRandomByLikelihood } from "../util/random.js"
import { EMOTIONS_LIST } from "./rolling-emotion.js";
import { deEngineUtils } from "./utils.js";
import { commands } from "./commands.js";
import { BaseInferenceAdapter } from "./inference/base.js";
import calculateStateChange from "./gears/state-change.js";
import calculateBondsChangesDueToMessages from "./gears/bond-change.js";
import testWorldRulesOn from "./gears/rules-enforce.js";
import testMessageFeasibilityForCharacter from "./gears/feasibility-check.js";
import { getCharacterVolume, getCharacterWeight, getItemVolume, getItemWeight, getWearableFitment, locationPathToMessage } from "./util/weight-and-volume.js";
import { cleanAll } from "./gears/feasibility-check/item-changes.js";
import { getAllItemsCharacterIsInsideOf, getBeingCarriedByCharacter, getCharacterExactLocation, getExternalDescriptionOfCharacter, getListOfCarriedCharactersByCharacter, getSurroundingCharacters, isBottomNaked, isTopNaked } from "./util/character-info.js";
import { DEJSEngine } from "../jsengine/index.js";
import defaultNamePool from "./util/name-pool.js";
import { getHistoryFragmentForCharacter } from "./util/messages.js";

const INVALID_NAMES = ["system", "assistant", "user", "everyone", "nobody",
    "anyone", "somebody", "narrator", "observer", "admin", "moderator",
    "game master", "gm", "storyteller", "dungeon master", "dm", "host",
    "player", "players", "character", "characters", "npc", "npcs",
    "they", "them", "their", "theirs", "he", "him", "his", "she", "her", "hers",
    "it", "its", "i", "me", "my", "mine", "we", "us", "our", "ours", "you", "your", "yours",
    "everyone else", "everybody else", "anyone else", "anybody else",
    "somebody else", "somebodyelse", "nobody else", "nobody", "story master", "storymaster", "story", "master"];

const ROOT_SKIP_KEYS = new Set(['utils', 'functions']);

/**
 * @param {DEObject} root
 * @returns {(this: any, key: string, value: any) => any}
 */
function serializationReplacer(root) {
    return function (key, value) {
        if (this === root && ROOT_SKIP_KEYS.has(key)) return undefined;
        if (typeof value === 'function') return undefined;
        if (value !== null && typeof value === 'object' && value.__nonserialize === true) return undefined;
        return value;
    };
}

function setupFunctions() {
    const finalObject = {};
    for (const [signature, details, returnDesc, fn] of ALL_FUNCTIONS_WITH_SPECIALS) {
        const parts = signature.split("->");
        const name = parts[0].trim().split(" ")[0];
        // @ts-ignore
        finalObject[name] = fn;
    }
    return finalObject;
}

/**
 * @typedef {Object} DEngineInteraction
 * @property {string} name name of the character that is about to interact
 * @property {string | null} invoker who invoked this interaction, null if none and it was their own initiative
 */

/**
 * @param {*} obj 
 * @param {*} parent
 * @param {(parent: any, value: any) => void} objChecker
 */
function checkObjectRecursively(parent, obj, objChecker) {
    if (typeof obj !== "object" || obj === null) {
        return;
    }
    if (Array.isArray(obj)) {
        for (const item of obj) {
            checkObjectRecursively(obj, item, objChecker);
        }
        return;
    }
    objChecker(parent, obj);
    for (const key in obj) {
        checkObjectRecursively(obj, obj[key], objChecker);
    }
}

/**
 * @param {*} obj 
 * @param {*} parent
 * @param {(parent: any, value: any) => Promise<void>} objChecker
 */
async function checkObjectRecursivelyAsync(parent, obj, objChecker) {
    if (typeof obj !== "object" || obj === null) {
        return;
    }
    if (Array.isArray(obj)) {
        for (const item of obj) {
            await checkObjectRecursivelyAsync(obj, item, objChecker);
        }
        return;
    }
    await objChecker(parent, obj);
    for (const key in obj) {
        await checkObjectRecursivelyAsync(obj, obj[key], objChecker);
    }
}

/**
 * @param {DEMinimalCharacterReference} user
 * @returns {DECompleteCharacterReference}
 */
function createCharacterFromUser(user) {
    return {
        name: user.name,
        autism: 0,
        gender: user.gender,
        heightCm: user.heightCm,
        weightKg: user.weightKg,
        ageYears: user.ageYears,
        carryingCapacityLiters: user.carryingCapacityLiters,
        carryingCapacityKg: user.carryingCapacityKg,
        characterRules: {},
        actionPromptInjection: {},
        locomotionSpeedMetersPerSecond: user.locomotionSpeedMetersPerSecond,
        maintenanceCaloriesPerDay: user.maintenanceCaloriesPerDay,
        maintenanceHydrationLitersPerDay: user.maintenanceHydrationLitersPerDay,
        rangeMeters: user.rangeMeters,
        generalCharacterDescriptionInjection: {},
        wanderPotential: 0,
        bonds: {
            system: "UNKNOWN",
            declarations: [],
            bondChangeFineTune: 1.0,
            bondChangeNegativityBias: 1.0,
            strangerBreakawayBondWeightAbsolute: 10,
            strangerBreakawayInteractionsCount: 10,
            strangerBreakawayTimeMinutes: 30,
            strangerNegativeMultiplier: 1.0,
            strangerPositiveMultiplier: 1.0,
            descriptionGeneralInjection: null,
        },
        shortDescription: user.shortDescription,
        shortDescriptionBottomNakedAdd: user.shortDescriptionBottomNakedAdd,
        shortDescriptionTopNakedAdd: user.shortDescriptionTopNakedAdd,
        general: "",
        initiative: 1,
        properties: {},
        schizophrenia: 0,
        schizophrenicVoiceDescription: "",
        states: {},
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
    }
}

export class DEngine {
    constructor() {
        // constructor code
        this.allInternalFunctions = setupFunctions();
        /**
         * @type {DEObject | null}
         */
        this.deObject = null;
        /**
         * @type {DEMinimalCharacterReference | null}
         */
        this.user = null;
        /**
         * @type {DECompleteCharacterReference | null}
         */
        this.userCharacter = null;

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
         * @type {((obj: DEObject, conversationId: string, messageId: string, text: string) => void)[]}
         */
        this.startsToInferOverConversationMessageListeners = [];

        /**
         * @type {BaseInferenceAdapter | null}
         */
        this.inferenceAdapter = null;

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
     * @param {BaseInferenceAdapter} adapter
     */
    setInferenceAdapter(adapter) {
        this.inferenceAdapter = adapter;

        // TODO, allow for non grammar supporting adapters
        if (!this.inferenceAdapter.supportsGrammar()) {
            throw new Error("Inference adapter does not support grammar generation, which is required in this version of DEngine.");
        }
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
     * @param {*} deObjectJSON 
     */
    async initializeFromJSONState(deObjectJSON) {
        if (this.initialized) {
            throw new Error("DEngine already initialized");
        }
        this.deObject = JSON.parse(deObjectJSON);
        if (!this.deObject) {
            throw new Error("Invalid DEObject JSON");
        } else if (!this.jsEngine) {
            throw new Error("JS Engine not set, cannot import scripts");
        }

        // @ts-ignore
        this.deObject.functions = this.allInternalFunctions;
        this.deObject.utils = deEngineUtils;
        this.user = this.deObject.user;
        this.userCharacter = this.deObject.characters[this.user.name];

        /**
         * @type {DEScript[]}
         */
        const worldScripts =
            // @ts-ignore typescript bugs
            this.jsEngine.scriptOrder.map(scriptKey => this.jsEngine.scriptCache[scriptKey]).filter(script => script.type === "world");

        for (const script of worldScripts) {
            // @ts-ignore typescript continues to bug
            script.initialize && await script.initialize(this.deObject);
        }

        this.initialized = true;
    }

    getStateAsJSON() {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }

        return JSON.stringify(this.deObject, serializationReplacer(this.deObject));
    }
    /**
     * @param {DEMinimalCharacterReference} user
     */
    async initialize(user) {
        const defaultTime = new Date();
        /**
         * @type {DETimeDescription}
         */
        const defaultTimeDEFormat = {
            dayOfMonth: defaultTime.getUTCDate(),
            monthOfYear: defaultTime.getUTCMonth() + 1,
            year: defaultTime.getUTCFullYear(),
            hourOfDay: defaultTime.getUTCHours(),
            minuteOfHour: defaultTime.getUTCMinutes(),
            time: defaultTime.getTime(),
            dayOfWeek: defaultTime.getUTCDay(),
        }
        this.deObject = {
            user: user,
            world: {
                connections: {},
                // @ts-ignore
                currentLocation: null,
                // @ts-ignore
                currentLocationSlot: null,
                initialScenes: {},
                locations: {},
                lore: "",
                properties: {},
                selectedScene: null,
            },
            characters: {},
            worldNames: {
                mal: [],
                fem: [],
                amb: [],
            },
            conversations: {},
            stateFor: {},
            initialTime: defaultTimeDEFormat,
            currentTime: { ...defaultTimeDEFormat },
            functions: /** @type {*} */ (this.allInternalFunctions),
            social: {
                bonds: {},
            },
            wanderHeuristics: {},
            utils: deEngineUtils,
            gameOver: false,
            worldRules: {},
            actionAccumulators: {},
            internal: {},
        }

        this.user = user;
        this.userCharacter = createCharacterFromUser(user);

        if (!this.jsEngine) {
            throw new Error("JS Engine not set, cannot import scripts");
        }

        await this.runInitializationScripts();
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
                this.jsEngine.scriptOrder.map(scriptKey => ({script: this.jsEngine.scriptCache[scriptKey], scriptKey})).filter(script => script.script.type === type);

            if (needsAtLeastOne.includes(type) && scripts.length === 0) {
                throw new Error(`At least one script of type ${type} is required.`);
            }

            for (const script of scripts) {
                console.log(`Initializing script ${script.scriptKey} of type ${type}`);
                // @ts-ignore typescript continues to bug
                script.script.initialize && await script.script.initialize(this.deObject);
            }

            if (type === "world" && this.userCharacter) {
                const stateForUserChar = this.deObject.stateFor[this.userCharacter.name];
                if (!stateForUserChar) {
                    const randomLocation = this.pickRandomLocationForCharacter(this.userCharacter);
                    this.addCharacter(this.userCharacter, randomLocation.location, randomLocation.locationSlot);
                }
            }

            if (type === "characters") {
                for (const charName in this.deObject.characters) {
                    const character = this.deObject.characters[charName];
                    if (INVALID_NAMES.includes(character.name.toLowerCase())) {
                        throw new Error(`Character name ${character.name} is invalid or reserved.`);
                    }

                    // ensure the character name starts with a capital letter and is a-z with spaces only
                    if (!/^[A-Z][a-zA-Z ]*$/.test(character.name)) {
                        throw new Error(`Character name ${character.name} is invalid. It must start with a capital letter and contain only letters and spaces.`);
                    }

                    const charState = this.deObject.stateFor[charName];
                    if (!charState) {
                        // adding a char state for this character by default
                        const futureLocation = this.pickRandomLocationForCharacter(character);
                        this.deObject.stateFor[charName] = {
                            history: [],
                            carrying: [],
                            carryingCharactersDirectly: [],
                            conversationId: null,
                            dead: false,
                            deadEnded: false,
                            deadEndReason: null,
                            id: crypto.randomUUID(),
                            location: futureLocation.location,
                            locationSlot: futureLocation.locationSlot,
                            messageId: null,
                            posture: "standing",
                            seenCharacters: [],
                            seenItems: [],
                            states: [],
                            time: this.deObject.initialTime,
                            type: "BACKGROUND",
                            wearing: [],
                        }
                    }

                    const bonds = this.deObject.social.bonds[charName];
                    if (!bonds) {
                        this.deObject.social.bonds[charName] = {
                            active: [],
                            ex: [],
                        };
                    }

                    const wanderHeuristic = this.deObject.wanderHeuristics[charName];
                    if (!wanderHeuristic) {
                        this.deObject.wanderHeuristics[charName] = {
                            wanderConfinement: null,
                            wanderPrimaryLocation: null,
                            wanderOutsideConfinementActivatesState: null,
                        };
                    }

                    if (!this.deObject.actionAccumulators[charName]) {
                        this.deObject.actionAccumulators[charName] = {
                            accumulators: {},
                        }
                    }
                }
            }
        }

        for (const type of orderOfExecution) {
            /**
             * @type {DEScript[]}
             */
            const scripts =
                // @ts-ignore typescript bugs
                this.jsEngine.scriptOrder.map(scriptKey => this.jsEngine.scriptCache[scriptKey]).filter(script => script.type === type);

            for (const script of scripts) {
                // @ts-ignore typescript continues to bug
                script.postSpawnAllCharacters && await script.postSpawnAllCharacters(this.deObject);
            }
        }

        // this initializes the world but no characters have been added yet
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
        const locationNames = Object.keys(this.deObject.world.locations);
        if (locationNames.length === 0) {
            throw new Error("No locations found in world to pick from.");
        }

        const charHeight = char.heightCm;

        const viableLocations = locationNames.map(locationName => {
            // @ts-ignore
            const allSlots = this.deObject.world.locations[locationName].slots;
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
                    const weight = getItemWeight(this, item);
                    measuredCharacters.push(...weight.allCharactersInvolved);
                    allItemWeight += weight.completeWeight;
                    const volume = getItemVolume(this, item);
                    measuredCharacters.push(...volume.allCharactersInvolved);
                    allItemVolume += volume.completeVolume;
                }

                // @ts-ignore
                for (const charName in this.deObject.stateFor) {
                    // @ts-ignore
                    const charState = this.deObject.stateFor[charName];
                    if (charState.location === locationName && charState.locationSlot === slotName) {
                        if (measuredCharacters.includes(charName)) {
                            continue;
                        }
                        allItemWeight += getCharacterWeight(this, charName).weight;
                        allItemVolume += getCharacterVolume(this, charName).volume;
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
                location: locationName,
                viableSlots,
            };
        }).filter(loc => loc.viableSlots.length > 0);

        const randomViableLocation = viableLocations[Math.floor(Math.random() * viableLocations.length)];

        const doFallback = () => {
            if (!this.deObject) {
                // stupid typescript
                throw new Error("DEngine not initialized");
            }
            console.warn(`No viable slots found for character ${char.name}, picking random slot without checking viability.`);
            const locationNames = Object.keys(this.deObject.world.locations);
            if (locationNames.length === 0) {
                throw new Error(`No locations found in world to pick from for fallback.`);
            }
            const randomLocationName = locationNames[Math.floor(Math.random() * locationNames.length)];
            if (!randomLocationName) {
                throw new Error(`No locations found in world to pick from for fallback.`);
            }
            const location = this.deObject.world.locations[randomLocationName];
            if (!location) {
                throw new Error(`Location ${randomLocationName} not found in world for fallback.`);
            }
            const slotNames = Object.keys(location.slots);
            if (!slotNames || slotNames.length === 0) {
                throw new Error(`No slots found in location ${randomLocationName} to pick from for fallback.`);
            }
            const randomSlotName = slotNames[Math.floor(Math.random() * slotNames.length)];
            if (!randomSlotName) {
                throw new Error(`No valid slot found in location ${randomLocationName} for fallback.`);
            }
            return { location: randomLocationName, locationSlot: randomSlotName };
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
        if (this.deObject.characters[character.name]) {
            throw new Error(`Character with name ${character.name} already exists.`);
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
            if (!EMOTIONS_LIST.includes(emotionName)) {
                throw new Error(`Character ${character.name} has invalid emotion name ${emotionName}.`);
            }
        }

        this.deObject.characters[character.name] = character;
        this.deObject.social.bonds[character.name] = {
            active: [],
            ex: [],
        };

        this.deObject.stateFor[character.name] = {
            history: [],
            dead: false,
            deadEnded: false,
            deadEndReason: null,
            id: crypto.randomUUID(),
            location: location,
            locationSlot: locationSlot,
            states: [],
            type: "BACKGROUND",
            time: this.deObject.initialTime,
            conversationId: null,
            messageId: null,
            posture: "standing",

            // chars start out empty handed
            carrying: [],
            carryingCharactersDirectly: [],

            // chars start up naked
            // hopefully they give them some clothes soon :)
            wearing: [],
            seenItems: [],
            seenCharacters: [],
        };

        this.deObject.wanderHeuristics[character.name] = {
            wanderConfinement: null,
            wanderPrimaryLocation: null,
            wanderOutsideConfinementActivatesState: null,
        };

        this.deObject.actionAccumulators[character.name] = {
            accumulators: {},
        };
    }

    /**
     * @param {string} optionName 
     */
    async startScene(optionName) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        } else if (this.deObject.world.selectedScene) {
            throw new Error("A scene has already been selected.");
        } else if (!this.userCharacter) {
            throw new Error("DEngine user character not initialized");
        } else if (!this.inferenceAdapter) {
            throw new Error("Inference adapter not set");
        }

        try {
            await this.inferenceAdapter.initialize();
        } catch (error) {
            console.warn("Inference adapter failed to initialize, continuing anyway. Error:", error);
        }

        const initialScene = this.deObject.world.initialScenes[optionName];
        if (!initialScene) {
            throw new Error(`Initial scene with option name ${optionName} not found.`);
        }
        const sceneObject = initialScene;
        if (sceneObject.initialTime) {
            this.deObject.currentTime = { ...sceneObject.initialTime };
            this.deObject.initialTime = { ...sceneObject.initialTime };
            for (const charName in this.deObject.stateFor) {
                this.deObject.stateFor[charName].time = { ...sceneObject.initialTime };
            }
        }

        this.deObject.stateFor[this.userCharacter.name].location = sceneObject.startingLocation;
        this.deObject.stateFor[this.userCharacter.name].locationSlot = sceneObject.startingLocationSlot;
        this.deObject.world.currentLocation = sceneObject.startingLocation;
        this.deObject.world.currentLocationSlot = sceneObject.startingLocationSlot;

        // TODO add startup script for the scene?

        const expectedParticipants = sceneObject.startingEngagedCharacters ? [...sceneObject.startingEngagedCharacters] : [];
        expectedParticipants.push(this.userCharacter.name);

        // ensure these are at the given location, if not, teleport them there
        for (const participantName of expectedParticipants) {
            if (!this.deObject.characters[participantName]) {
                throw new Error(`Participant character ${participantName} not found in DEObject characters.`);
            }
            this.deObject.stateFor[participantName].location = sceneObject.startingLocation;
            this.deObject.stateFor[participantName].locationSlot = sceneObject.startingLocationSlot;
            this.deObject.stateFor[participantName].conversationId = "INITIAL_SCENE_NARRATION";
            this.deObject.stateFor[participantName].type = "INTERACTING";
        }

        const narration = typeof sceneObject.narration === "string" ? sceneObject.narration : await sceneObject.narration(this.deObject, {});

        this.deObject.conversations["INITIAL_SCENE_NARRATION"] = {
            id: "INITIAL_SCENE_NARRATION",
            messages: [
                {
                    id: "INITIAL_SCENE_NARRATION_MESSAGE",
                    canOnlyBeSeenByCharacter: null,
                    content: narration,
                    sender: "Story Master",
                    duration: {
                        inDays: 0,
                        inHours: 0,
                        inMinutes: 0,
                    },
                    endTime: { ...this.deObject.currentTime },
                    isCharacter: false,
                    isDebugMessage: false,
                    isRejectedMessage: false,
                    isHiddenMessage: false,
                    isStoryMasterMessage: true,
                    isUser: false,
                    startTime: { ...this.deObject.currentTime },
                    perspectiveSummaryIds: {},
                    singleSummary: null,
                },
            ],
            bondsAtStart: getFrozenBonds(this, expectedParticipants),
            // TODO what do we do with bonds at end here?
            bondsAtEnd: {},
            startTime: { ...this.deObject.currentTime },
            location: sceneObject.startingLocation,
            participants: expectedParticipants,
            previousConversationIdsPerParticipant: {},
            pseudoConversation: false,
            remoteParticipants: [],
        };
        for (const participantName of expectedParticipants) {
            this.deObject.conversations["INITIAL_SCENE_NARRATION"].previousConversationIdsPerParticipant[participantName] = null;
        }

        this.rerollWorldWeather();
        this.deObject.world.selectedScene = optionName;
        this.deObject.world.initialScenes = {}; // we can remove the initial scenes from the world object to save memory, we don't need them anymore

        // TODO post scene started script?

        const extraMessage = await this.fixPotentiallyBrokenItemStates();
        if (extraMessage) {
            this.deObject.conversations["INITIAL_SCENE_NARRATION"].messages.push({
                id: "INITIAL_SCENE_ITEM_FIXTURE_MESSAGE",
                canOnlyBeSeenByCharacter: null,
                content: extraMessage,
                sender: "Story Master",
                duration: {
                    inDays: 0,
                    inHours: 0,
                    inMinutes: 0,
                },
                endTime: { ...this.deObject.currentTime },
                isCharacter: false,
                isDebugMessage: false,
                isStoryMasterMessage: true,
                isUser: false,
                startTime: { ...this.deObject.currentTime },
                perspectiveSummaryIds: {},
                singleSummary: null,
                isRejectedMessage: false,
                isHiddenMessage: false,
            });
        }

        if (sceneObject.charactersStart) {
            const randomizedList = ([...sceneObject.startingEngagedCharacters]).sort(() => Math.random() - 0.5);
            for (const participantName of randomizedList) {
                this.informCycleState("info", "Pre-calculating initial states for " + participantName + " and the world...");
                await calculateStateChange(this, this.deObject.characters[participantName]);

                this.informCycleState("info", "Pre-calculating initial bonds for " + participantName + "...");
                await calculateBondsChangesDueToMessages(this, this.deObject.characters[participantName]);

                // TODO they talk
            }
        }

        // now the user starts, let's precalculate these states and bonds
        // so that they are ready for the user's first turn, even though
        // the user has no real affecting states, they are forced upon the user
        // as information bits
        this.informCycleState("info", "Pre-calculating initial states for your character and the world...");
        await calculateStateChange(this, this.userCharacter);

        this.informCycleState("info", "Pre-calculating initial bonds for your character...");
        await calculateBondsChangesDueToMessages(this, this.userCharacter);

        // Game on :)
    }

    /**
     * @param {string} locationName
     * @returns {Record<string, {maxWeightKg: number; maxVolumeLiters: number; currentWeightKg: number; currentVolumeLiters: number}>}
     */
    getRemainingCapacityInLocation(locationName) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        const locationInfo = this.deObject.world.locations[locationName];
        if (!locationInfo) {
            throw new Error(`Location ${locationName} not found in world.`);
        }
        /**
         * @type {Record<string, {maxWeightKg: number; maxVolumeLiters: number; currentWeightKg: number; currentVolumeLiters: number}>}
         */
        const slots = {};
        for (const slotName in locationInfo.slots) {
            slots[slotName] = {
                maxWeightKg: locationInfo.slots[slotName].maxWeightKg,
                maxVolumeLiters: locationInfo.slots[slotName].maxVolumeLiters,
                currentWeightKg: 0,
                currentVolumeLiters: 0,
            };
            /**
             * @type {string[]}
             */
            const measuredCharacters = [];
            locationInfo.slots[slotName].items.forEach(item => {
                const weight = getItemWeight(this, item);
                measuredCharacters.push(...weight.allCharactersInvolved);
                slots[slotName].currentWeightKg += weight.completeWeight;
                const volume = getItemVolume(this, item);
                measuredCharacters.push(...volume.allCharactersInvolved);
                slots[slotName].currentVolumeLiters += volume.completeVolume;
            });

            // find characters in this slot
            for (const charName in this.deObject.stateFor) {
                const charState = this.deObject.stateFor[charName];
                if (charState.location === locationName && charState.locationSlot === slotName) {
                    if (measuredCharacters.includes(charName)) {
                        continue;
                    }

                    slots[slotName].currentWeightKg += getCharacterWeight(this, charName).weight;
                    slots[slotName].currentVolumeLiters += getCharacterVolume(this, charName).volume;
                }
            }
        }
        return slots;
    }

    async fixPotentiallyBrokenItemStates() {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        } else if (!this.deObject.world.selectedScene) {
            throw new Error("DEngine world scene not started");
        } else if (!this.userCharacter) {
            throw new Error("User character not set");
        }
        /**
         * @type {string[]}
         */
        const storyMasterMessages = [];

        const allMessages = await getHistoryFragmentForCharacter(this, this.userCharacter, {
            includeDebugMessages: false,
            includeRejectedMessages: false,
            msgLimit: "LAST_CYCLE",
        });

        // TODO also calculate potentially broken items here, guess in a different manner
        // should be made so that it is a standalone function that can be used in other places

        await cleanAll(this, this.deObject.stateFor[this.userCharacter.name].location, allMessages.messages, storyMasterMessages);

        if (storyMasterMessages.length > 0) {
            const addedMessageStr = storyMasterMessages.join("\n\n");
            return addedMessageStr;
        }

        return null;
    }

    /**
     * @param {string} locationName
     * @param {DEStatefulLocationDefinition} location 
     * @param {DEStatefulLocationDefinition | null} parentLocation
     * @param {boolean} cascade
     */
    rerollLocationWeather(locationName, location, parentLocation, cascade = true) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }

        if (!location.ownWeatherSystem || location.ownWeatherSystem.length === 0) {
            if (parentLocation) {
                location.currentWeather = parentLocation.currentWeather;
                location.currentWeatherHasBeenOngoingFor = parentLocation.currentWeatherHasBeenOngoingFor;
                location.currentWeatherNoEffectDescription = parentLocation.currentWeatherNoEffectDescription;
                location.currentWeatherPartialEffectDescription = parentLocation.currentWeatherPartialEffectDescription;
                location.currentWeatherFullEffectDescription = parentLocation.currentWeatherFullEffectDescription;
                location.currentWeatherNegativelyExposedDescription = parentLocation.currentWeatherNegativelyExposedDescription;

                // find every children locations and reroll their weather
                if (cascade) {
                    for (const potentialChildLocationKey in this.deObject.world.locations) {
                        const potentialChildLocation = this.deObject.world.locations[potentialChildLocationKey];
                        if (potentialChildLocation.parent === locationName) {
                            this.rerollLocationWeather(potentialChildLocationKey, potentialChildLocation, location, true);
                        }
                    }
                }
            } else {
                throw new Error("Location has no own weather system and no parent location to inherit weather from.");
            }
        } else {
            let shouldHaveNewWeather = false;
            const currentWeather = location.currentWeather;
            if (!currentWeather) {
                shouldHaveNewWeather = true;
            } else {
                const weatherDuration = location.currentWeatherHasBeenOngoingFor.inHours;
                const weatherSystemInfo = location.ownWeatherSystem.find(ws => ws.name === currentWeather);
                if (!weatherSystemInfo) {
                    throw new Error(`Weather system info for current weather ${currentWeather} not found.`);
                }
                if (weatherDuration >= weatherSystemInfo.maxDurationInHours) {
                    shouldHaveNewWeather = true;
                } else if (weatherDuration >= weatherSystemInfo.minDurationInHours) {
                    const chanceToChange = (weatherDuration - weatherSystemInfo.minDurationInHours) / (weatherSystemInfo.maxDurationInHours - weatherSystemInfo.minDurationInHours);
                    if (Math.random() < chanceToChange) {
                        shouldHaveNewWeather = true;
                    }
                }
            }

            if (shouldHaveNewWeather) {
                // pick new weather
                const newWeatherSystem = weightedRandomByLikelihood(location.ownWeatherSystem);
                if (!newWeatherSystem) {
                    throw new Error("Failed to pick new weather system. Are there any weather systems defined?");
                }
                location.currentWeather = newWeatherSystem.name;
                location.currentWeatherHasBeenOngoingFor = {
                    inMinutes: 0,
                    inHours: 0,
                    inDays: 0,
                };
                location.currentWeatherNoEffectDescription = newWeatherSystem.noEffectDescription;
                location.currentWeatherPartialEffectDescription = newWeatherSystem.partialEffectDescription;
                location.currentWeatherFullEffectDescription = newWeatherSystem.fullEffectDescription;
                location.currentWeatherNegativelyExposedDescription = newWeatherSystem.negativelyExposedDescription;

                // find every children locations and reroll their weather
                if (cascade) {
                    for (const potentialChildLocationKey in this.deObject.world.locations) {
                        const potentialChildLocation = this.deObject.world.locations[potentialChildLocationKey];
                        if (potentialChildLocation.parent === locationName) {
                            this.rerollLocationWeather(potentialChildLocationKey, potentialChildLocation, location, true);
                        }
                    }
                }
            }
        }
    }

    rerollWorldWeather() {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }

        console.log("Rerolling world weather...");

        // find every top level location and reroll their weather
        for (const locationKey in this.deObject.world.locations) {
            const location = this.deObject.world.locations[locationKey];
            if (!location.parent) {
                this.rerollLocationWeather(locationKey, location, null, true);
            }
        }
    }

    /**
     * This function provides the reasoning message that reasons what
     * should be in the character's mind at the moment and what the
     * AI should base its next response on, all previous conversation history
     * will be in user space
     * 
     * Standard reasoning message
     * 
     * @param {string} characterName 
     */
    getReasoningMessageForCharacter(characterName) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }

        return {
            "system": "",
            "user": "",
            "assistant": "",
        }
    }

    /**
     * @param {string} characterName
     * @return {{complete: string, cheapList: string[]}}
     */
    describeItemsAvailableToCharacterForInference(characterName) {
        /**
         * @type {string[]}
         */
        const cheapList = [];
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        const characterState = this.deObject.stateFor[characterName];
        if (!characterState) {
            throw new Error(`Character state for ${characterName} not found.`);
        }
        const locationName = characterState.location;

        const location = this.deObject.world.locations[locationName];
        if (!location) {
            throw new Error(`Location ${locationName} not found.`);
        }
        const slotNames = Object.keys(location.slots);
        let noItemsInAnySlot = true;
        for (const slotName of slotNames) {
            const slot = location.slots[slotName];
            if (slot.items.length > 0) {
                noItemsInAnySlot = false;
                break;
            }
        }

        let message = "# Items at the location:\n";

        /**
         * @param {string} space 
         * @param {DEItem} item
         */
        const listItems = (space, item) => {
            message += `${space}- ${item.owner ? item.owner + "'s " : ""}${item.name}${item.amount >= 2 || item.amount === 0 ? " x" + item.amount : ""}\n`;
            if (item.containing.length !== 0) {
                message += `${space}  Containing:\n`;
            }
            for (const containedItem of item.containing) {
                listItems(space + "  ", containedItem);
            }
            for (const ontopItem of item.ontop) {
                listItems(space + "  ", ontopItem);
            }
            if (item.containingCharacters.length !== 0) {
                message += `${space}  Characters inside:\n`;
            }
            for (const containedCharacters of item.containingCharacters) {
                message += `${space}  - ${containedCharacters}\n`;
            }
            if (item.ontopCharacters.length !== 0) {
                message += `${space}  Characters on top:\n`;
            }
            for (const ontopCharacters of item.ontopCharacters) {
                message += `${space}  - ${ontopCharacters}\n`;
            }
            cheapList.push(`${item.owner ? item.owner + "'s " : ""}${item.name}${item.amount >= 2 ? " x" + item.amount : ""}`);
        }
        if (noItemsInAnySlot) {
            message += "No items available at the location.\n";
        } else {
            for (const slotName of slotNames) {
                const slot = location.slots[slotName];
                message += `\n## Items at ${slotName}:\n`;
                for (const item of slot.items) {
                    listItems("", item);
                }
            }
        }

        // now let's check each character excluding our own for now
        for (const otherCharName in this.deObject.stateFor) {
            if (otherCharName === characterName) continue;
            const otherCharState = this.deObject.stateFor[otherCharName];
            if (otherCharState.location === locationName) {
                message += `\n## Items worn by ${otherCharName}:\n`;
                if (otherCharState.wearing.length === 0) {
                    message += `${otherCharName} Is currently naked.\n`;
                } else {
                    for (const item of otherCharState.wearing) {
                        listItems("", item);
                    }
                }
                const carriedChars = getListOfCarriedCharactersByCharacter(this, otherCharName);
                if (carriedChars.length > 0) {
                    message += `\n## Characters carried by ${otherCharName}:\n`;
                    for (const carriedChar of carriedChars) {
                        if (carriedChar.itemPathEnd === "containingCharacters" && carriedChar.itemPath) {
                            message += `${otherCharName} is carrying ${carriedChar.carriedName} ${locationPathToMessage(this, otherCharName, locationName, [...carriedChar.itemPath, carriedChar.itemPathEnd], true)}.\n`;
                        } else if (carriedChar.itemPathEnd === "ontopCharacters" && carriedChar.itemPath) {
                            message += `${otherCharName} is carrying ${carriedChar.carriedName} ${locationPathToMessage(this, otherCharName, locationName, [...carriedChar.itemPath, carriedChar.itemPathEnd], true)}.\n`;
                        } else {
                            message += `${otherCharName} is carrying ${carriedChar.carriedName}.\n`;
                        }
                    }
                }
                message += `\n## Items carried by ${otherCharName}:\n`;
                if (otherCharState.carrying.length === 0) {
                    message += `No items carried by ${otherCharName}.\n`;
                } else {
                    for (const item of otherCharState.carrying) {
                        listItems("", item);
                    }
                }
            }
        }

        // now let's do our own character
        message += `\n## Items worn by ${characterName}:\n`;
        if (characterState.wearing.length === 0) {
            message += `${characterName} Is currently naked.\n`;
        } else {
            for (const item of characterState.wearing) {
                listItems("", item);
            }
        }

        const carriedChars = getListOfCarriedCharactersByCharacter(this, characterName);
        if (carriedChars.length > 0) {
            message += `\n## Characters carried by ${characterName}:\n`;
            for (const carriedChar of carriedChars) {
                if (carriedChar.itemPathEnd === "containingCharacters" && carriedChar.itemPath) {
                    message += `${characterName} is carrying ${carriedChar.carriedName} ${locationPathToMessage(this, characterName, locationName, [...carriedChar.itemPath, carriedChar.itemPathEnd], true)}.\n`;
                } else if (carriedChar.itemPathEnd === "ontopCharacters" && carriedChar.itemPath) {
                    message += `${characterName} is carrying ${carriedChar.carriedName} ${locationPathToMessage(this, characterName, locationName, [...carriedChar.itemPath, carriedChar.itemPathEnd], true)}.\n`;
                } else {
                    message += `${characterName} is carrying ${carriedChar.carriedName}.\n`;
                }
            }
        }

        message += `\n## Items carried by ${characterName}:\n`;
        if (characterState.carrying.length === 0) {
            message += `No items or characters carried by ${characterName}.\n`;
        } else {
            for (const item of characterState.carrying) {
                listItems("", item);
            }
        }

        const exactLocation = getCharacterExactLocation(this, characterName);
        if (exactLocation.beingCarriedBy) {
            message += `\n## ${characterName} is being carried by another character:\n`;
            message += `${characterName} is being carried by character: ${exactLocation.beingCarriedBy}.\n`;
        }

        if (exactLocation.itemPathEnd === "containingCharacters" && exactLocation.itemPath) {
            message += `\n## ${characterName} is inside an item:\n`;
            message += `${characterName} is ${locationPathToMessage(this, characterName, locationName, [...exactLocation.itemPath, exactLocation.itemPathEnd])}.\n`;
        }

        if (exactLocation.itemPathEnd === "ontopCharacters" && exactLocation.itemPath) {
            message += `\n## ${characterName} is on top of an item:\n`;
            message += `${characterName} is ${locationPathToMessage(this, characterName, locationName, [...exactLocation.itemPath, exactLocation.itemPathEnd])}.\n`;
        }

        return { complete: message, cheapList };
    }

    /**
     * 
     * @param {string} characterName 
     * @param {string} towards
     * @returns {Promise<[boolean, DESingleBondDescription, DEBondDeclaration, string]>} bond description and bond info
     */
    async getRelationshipBetweenCharacters(characterName, towards) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        const character = this.deObject.characters[characterName];
        if (!character) {
            throw new Error(`Character ${characterName} not found.`);
        }
        const towardsCharacter = this.deObject.characters[towards];
        if (!towardsCharacter) {
            throw new Error(`Character ${towards} not found.`);
        }
        // @ts-ignore
        let bond = this.deObject.social.bonds[characterName].active.find(bond => bond.towards === towards);
        let bondInfo = "";
        let pseudoBond = false;
        if (!bond) {
            // make a pseudo bond for stranger
            bond = {
                bond: 0,
                bond2: 0,
                stranger: true,
                towards: towards,
                createdAt: this.deObject.currentTime,
            }
            pseudoBond = true;
        }

        if (!character.bonds) {
            throw new Error(`Character ${characterName} has no bonds defined.`);
        }

        const bondDecl = character.bonds.declarations.find((b => b.strangerBond === bond.stranger && b.minBondLevel <= bond.bond && bond.bond < (b.maxBondLevel === 100 ? 200 : b.maxBondLevel) && b.min2BondLevel <= bond.bond2 && bond.bond2 < (b.max2BondLevel === 100 ? 200 : b.max2BondLevel)));
        if (!bondDecl) {
            throw new Error(`No bond description found for bond level ${bond.bond} and secondary bond level ${bond.bond2} from character "${characterName}" towards character "${towards}".`);
        }

        // @ts-ignore
        bondInfo += await bondDecl.description.execute(this.deObject, character, towardsCharacter);

        if (character.bonds.descriptionGeneralInjection) {
            // @ts-ignore
            const value = await character.bonds.descriptionGeneralInjection.execute(this.deObject, character, towardsCharacter);
            bondInfo += `\n\n${value}`;
        }

        return [pseudoBond, bond, bondDecl, bondInfo];
    }

    /**
     * TODO fix this function, it's iffy
     * @param {"can" | "cannot"} canOrCannot
     * @param {string} characterName 
     * @param {string} locationName 
     * @returns 
     */
    getItemsCharacterMayWearWithReasons(canOrCannot, characterName, locationName) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        const character = this.deObject.characters[characterName];
        if (!character) {
            throw new Error(`Character ${characterName} not found.`);
        }
        const location = this.deObject.world.locations[locationName];
        if (!location) {
            throw new Error(`Location ${locationName} not found.`);
        }
        const characterState = this.deObject.stateFor[characterName];
        if (!characterState) {
            throw new Error(`Character state for ${characterName} not found.`);
        }

        /**
         * @type {Set<string>}
         */
        const itemsCharacterCannotWearWReasons = new Set();

        let remainingCarryingCapacity = character.carryingCapacityKg;

        /**
             * @param {DEItem[]} itemList 
             */
        const processItemList = (itemList) => {
            for (const carriedItem of itemList) {
                remainingCarryingCapacity -= carriedItem.weightKg * carriedItem.amount;

                // the added and taken volume are irrelevant because
                // these are already inside another container
                processItemList(carriedItem.containing);
                processItemList(carriedItem.ontop);
            }
        }
        /**
         * @param {string[]} characterList
         */
        const processCharacterList = (characterList) => {
            for (const carriedCharacterName of characterList) {
                const carriedCharacterState = this.deObject?.stateFor[carriedCharacterName];
                if (carriedCharacterState === undefined) {
                    continue;
                }
                const characterWeight = this.deObject?.characters[carriedCharacterName]?.weightKg || 0;
                remainingCarryingCapacity -= characterWeight;
                processItemList(carriedCharacterState.carrying);
                processItemList(carriedCharacterState.wearing);
                processCharacterList(carriedCharacterState.carryingCharactersDirectly);
            }
        }
        processCharacterList(characterState.carryingCharactersDirectly);
        processItemList(characterState.carrying);
        processItemList(characterState.wearing);

        let characterCurrentVolumeApprox = character.weightKg;
        for (const wornItem of characterState.wearing) {
            if (!wornItem.wearableProperties) continue;
            characterCurrentVolumeApprox += wornItem.wearableProperties.extraBodyVolumeWhenWornLiters * wornItem.amount;
        }

        /**
         * @param {DEItem} item
         * @param {string} extraMessage
         */
        const processItemAndReason = (item, extraMessage) => {
            let reason = null;
            if (!item.wearableProperties) {
                reason = `item is not wearable`;
            } else if (item.weightKg > character.carryingCapacityKg) {
                reason = `item is too heavy (${item.weightKg}kg) for ${character.name}'s strength`;
            } else if (item.weightKg - item.wearableProperties.addedCarryingCapacityKg > remainingCarryingCapacity) {
                reason = `${character.name} is already carrying too much weight to wear this item, needs to wear ${item.weightKg - item.wearableProperties.addedCarryingCapacityKg}kg, remaining capacity is ${remainingCarryingCapacity}kg`;
            } else if (item.wearableProperties.volumeRangeMinLiters > characterCurrentVolumeApprox) {
                reason = `${character.name} is too big to wear this item, minimum volume is ${item.wearableProperties.volumeRangeMinLiters}L, character current volume with is approximated at ${characterCurrentVolumeApprox}L`;
            } else if (characterCurrentVolumeApprox > item.wearableProperties.volumeRangeMaxLiters) {
                reason = `${character.name} is too small to wear this item, maximum volume is ${item.wearableProperties.volumeRangeMaxLiters}L, character current volume is approximated at ${characterCurrentVolumeApprox}L`;
            }

            if (reason && canOrCannot === "cannot") {
                if (item.amount >= 2) {
                    itemsCharacterCannotWearWReasons.add(`1 of ${item.name}: ${reason}`);
                } else {
                    itemsCharacterCannotWearWReasons.add(`${item.name}: ${reason}`);
                }
            } else if (!reason && canOrCannot === "can") {
                if (item.amount >= 2) {
                    itemsCharacterCannotWearWReasons.add(`1 of ${item.name}: can be worn`);
                } else {
                    itemsCharacterCannotWearWReasons.add(`${item.name}: can be worn`);
                }
            }

            for (const containedItem of item.containing) {
                processItemAndReason(containedItem, ` (contained by ${item.name}${extraMessage})`);
            }

            for (const ontopItem of item.ontop) {
                processItemAndReason(ontopItem, ` (on top of ${item.name}${extraMessage})`);
            }
        }

        for (const locationSlotName in location.slots) {
            const locationSlot = location.slots[locationSlotName];
            for (const item of locationSlot.items) {
                processItemAndReason(item, "");
            }
        }

        for (const otherCharName in this.deObject.stateFor) {
            if (otherCharName === characterName) continue;
            const otherCharState = this.deObject.stateFor[otherCharName];
            if (otherCharState.location === locationName) {
                // check their wearing items
                for (const item of otherCharState.wearing) {
                    processItemAndReason(item, ` (worn by ${otherCharName})`);
                }

                // check their carried items
                for (const item of otherCharState.carrying) {
                    processItemAndReason(item, ` (carried by ${otherCharName})`);
                }
            }
        }

        return Array.from(itemsCharacterCannotWearWReasons);
    }

    /**
     * @param {string} locationName 
     * @returns 
     */
    getFullItemListAtLocation(locationName) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        const location = this.deObject.world.locations[locationName];
        if (!location) {
            throw new Error(`Location ${locationName} not found.`);
        }
        /**
         * @type {string[]}
         */
        const items = [];
        /**
         * 
         * @param {DEItem[]} itemList 
         */
        const processItemList = (itemList) => {
            for (const item of itemList) {
                if (!items.includes(item.name)) {
                    items.push(item.name);
                }
                processItemList(item.containing);
                processItemList(item.ontop);
            }
        }
        for (const locationSlotName in location.slots) {
            const locationSlot = location.slots[locationSlotName];
            processItemList(locationSlot.items);
        }
        // @ts-ignore
        const charactersAtLocation = Object.keys(this.deObject.stateFor).filter(charName => this.deObject.stateFor[charName].location === locationName);
        for (const charName of charactersAtLocation) {
            const charState = this.deObject.stateFor[charName];
            processItemList(charState.wearing);
            processItemList(charState.carrying);
        }
        return items;
    }

    /**
     * @param {"can" | "cannot"} canOrCannot
     * @param {string} characterName 
     * @param {string} locationName 
     * @param {boolean} includeCharacters
     * @param {boolean} excludeItems
     * @param {boolean} addVerboseContainmentInfo
     * @returns 
     */
    async getItemsCharacterMayCarryWithReasons(canOrCannot, characterName, locationName, includeCharacters, excludeItems, addVerboseContainmentInfo = false) {
        // TODO refactor this, we should use the util weight and volume that has the standarized way to measure weight and volume of
        // characters and items, also maybe it's better to specify list of interactions...
        // 1. what can be carried
        // 2. what cannot be carried with reasons
        // 3. what can be worn
        // 4. what cannot be worn with reasons
        // 5. What items and characters can get atop
        // 6. What items and characters cannot get atop with reasons (eg. will break, will crush)
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        const character = this.deObject.characters[characterName];
        if (!character) {
            throw new Error(`Character ${characterName} not found.`);
        }
        const location = this.deObject.world.locations[locationName];
        if (!location) {
            throw new Error(`Location ${locationName} not found.`);
        }
        const characterState = this.deObject.stateFor[characterName];
        if (!characterState) {
            throw new Error(`Character state for ${characterName} not found.`);
        }

        /**
         * @type {Set<string>}
         */
        const itemsCharacterCannotCarryWReasons = new Set();

        let remainingCarryingCapacity = character.carryingCapacityKg;
        let remainingCarryingVolume = character.carryingCapacityLiters;

        /**
             * @param {DEItem[]} itemList 
             * @param {boolean} isOurOwnCharacterWearing
             * @param {boolean} isOtherCharacterWearing
             */
        const processItemList = (itemList, isOurOwnCharacterWearing = false, isOtherCharacterWearing = false) => {
            let takenVolume = 0;
            let addedVolume = 0;
            for (const carriedItem of itemList) {
                remainingCarryingCapacity -= carriedItem.weightKg * carriedItem.amount;
                if (carriedItem.containerProperties?.capacityLiters) {
                    addedVolume += carriedItem.containerProperties.capacityLiters * carriedItem.amount;
                }
                takenVolume += carriedItem.volumeLiters * carriedItem.amount;

                if (isOurOwnCharacterWearing && carriedItem.wearableProperties) {
                    // wearing an item does not take volume, but it can add volume capacity
                    if (carriedItem.wearableProperties.addedCarryingCapacityLiters) {
                        addedVolume += carriedItem.wearableProperties.addedCarryingCapacityLiters * carriedItem.amount;
                    }
                    if (carriedItem.wearableProperties.addedCarryingCapacityKg) {
                        remainingCarryingCapacity += carriedItem.wearableProperties.addedCarryingCapacityKg * carriedItem.amount;
                    }
                }
                if (isOtherCharacterWearing && carriedItem.wearableProperties) {
                    // wearing an item does not take volume, but it can add volume capacity
                    if (carriedItem.wearableProperties.extraBodyVolumeWhenWornLiters) {
                        takenVolume += carriedItem.wearableProperties.extraBodyVolumeWhenWornLiters * carriedItem.amount;
                    }
                }

                // the added and taken volume are irrelevant because
                // these are already inside another container
                processItemList(carriedItem.containing);
                processItemList(carriedItem.ontop);
            }

            return { takenVolume, addedVolume }
        }
        /**
         * @param {string[]} characterList
         */
        const processCharacterList = (characterList) => {
            let takenVolume = 0;
            let addedVolume = 0;
            for (const carriedCharacterName of characterList) {
                const carriedCharacterState = this.deObject?.stateFor[carriedCharacterName];
                if (carriedCharacterState === undefined) {
                    continue;
                }
                const characterWeight = this.deObject?.characters[carriedCharacterName]?.weightKg || 0;
                remainingCarryingCapacity -= characterWeight;
                // assume a character is mostly water, so the volume is weight
                // in liters is weight in kg divided by 1 (density of water)
                // so just use the weight as volume for simplicity
                takenVolume += characterWeight;
                // carrying a character does not add volume capacity but it takes volume
                const characterVolumes = processItemList(carriedCharacterState.carrying);
                takenVolume += characterVolumes.takenVolume;
                // now consider the clothes they are wearing
                const characterVolumesWearing = processItemList(carriedCharacterState.wearing, false, true);
                takenVolume += characterVolumesWearing.takenVolume;
                // the same is true for the characters they are carrying
                const characterCharactersVolumes = processCharacterList(carriedCharacterState.carryingCharactersDirectly);
                takenVolume += characterCharactersVolumes.takenVolume;
            }

            return { takenVolume, addedVolume }
        }
        const characterCharactersVolumes = processCharacterList(characterState.carryingCharactersDirectly);
        const carryingVolumes = processItemList(characterState.carrying);
        remainingCarryingVolume -= (carryingVolumes.takenVolume - carryingVolumes.addedVolume);
        remainingCarryingVolume -= characterCharactersVolumes.takenVolume;
        const volumeClothes = processItemList(characterState.wearing, true);
        remainingCarryingVolume += volumeClothes.addedVolume; // clothes don't count towards carrying volume, becuase they are worn
        // so we only consider the extra volume they add, not the volume they take

        /**
         * @param {DEItem} item
         * @param {string} extraMessage
         */
        const processItemAndReason = async (item, extraMessage) => {
            let reason = null;
            if (item.weightKg > character.carryingCapacityKg) {
                reason = `item is too heavy (${item.weightKg}kg) for ${character.name}'s strength`;
            } else if (item.volumeLiters > character.carryingCapacityLiters) {
                reason = `item is too large (${item.volumeLiters}L) for ${character.name}'s carrying capacity`;
            } else if (item.weightKg > remainingCarryingCapacity) {
                reason = `${character.name} is already carrying too much weight to lift this item, weights ${item.weightKg}kg, remaining capacity is ${remainingCarryingCapacity}kg`;
            } else if (item.volumeLiters > remainingCarryingVolume) {
                reason = `${character.name} is already carrying too much volume to fit this item, volume is ${item.volumeLiters}L, remaining capacity is ${remainingCarryingVolume}L`;
            }

            if (reason && canOrCannot === "cannot") {
                if (item.amount >= 2) {
                    itemsCharacterCannotCarryWReasons.add(`Name: 1 of ${item.name}${addVerboseContainmentInfo ? " - " + extraMessage : ""} - Cannot be carried/picked because ${reason}`);
                } else {
                    itemsCharacterCannotCarryWReasons.add(`Name: ${item.name}${addVerboseContainmentInfo ? " - " + extraMessage : ""} - Cannot be carried/picked because ${reason}`);
                }
            } else if (!reason && canOrCannot === "can") {
                if (item.amount >= 2) {
                    itemsCharacterCannotCarryWReasons.add(`Name: 1 of ${item.name}${addVerboseContainmentInfo ? " - " + extraMessage : ""} - can be carried/picked`);
                } else {
                    itemsCharacterCannotCarryWReasons.add(`Name: ${item.name}${addVerboseContainmentInfo ? " - " + extraMessage : ""} - can be carried/picked`);
                }
            }

            for (const containedItem of item.containing) {
                await processItemAndReason(containedItem, ` (contained by ${item.name}${extraMessage})`);
            }

            for (const ontopItem of item.ontop) {
                await processItemAndReason(ontopItem, ` (on top of ${item.name}${extraMessage})`);
            }
        }

        if (!excludeItems) {
            for (const locationSlotName in location.slots) {
                const locationSlot = location.slots[locationSlotName];
                for (const item of locationSlot.items) {
                    await processItemAndReason(item, "");
                }
            }

            for (const otherCharName in this.deObject.stateFor) {
                if (otherCharName === characterName) continue;
                const otherCharState = this.deObject.stateFor[otherCharName];
                if (otherCharState.location === locationName) {
                    // check their wearing items
                    for (const item of otherCharState.wearing) {
                        await processItemAndReason(item, ` (worn by ${otherCharName})`);
                    }

                    // check their carried items
                    for (const item of otherCharState.carrying) {
                        await processItemAndReason(item, ` (carried by ${otherCharName})`);
                    }
                }
            }
        }

        if (includeCharacters) {
            for (const otherCharName in this.deObject.stateFor) {
                if (otherCharName === characterName) continue;
                const otherCharState = this.deObject.stateFor[otherCharName];
                if (otherCharState.location === locationName) {
                    let reason = null;
                    const otherCharacter = this.deObject.characters[otherCharName];
                    if (!otherCharacter) {
                        continue;
                    }
                    if (otherCharacter.weightKg > character.carryingCapacityKg) {
                        reason = `${otherCharacter.name} is too heavy (${otherCharacter.weightKg}kg) for ${character.name}'s strength`;
                    } else if (otherCharacter.weightKg > character.carryingCapacityLiters) {
                        reason = `${otherCharacter.name} is too large (${otherCharacter.weightKg}L) for ${character.name}'s carrying capacity`;
                    } else if (otherCharacter.weightKg > remainingCarryingCapacity) {
                        reason = `${character.name} is already carrying too much weight to lift ${otherCharacter.name}`;

                        // assume the character's volume is equal to their weight in liters
                    } else if (otherCharacter.weightKg > remainingCarryingVolume) {
                        reason = `${character.name} is already carrying too much volume to carry ${otherCharacter.name}`;
                    }
                    const otherCharacterState = this.deObject.stateFor[otherCharName];
                    const otherCharacterInfo = this.deObject.characters[otherCharName];
                    const currentShortDesc = await getExternalDescriptionOfCharacter(this, characterName, true);

                    if (reason && canOrCannot === "cannot") {
                        itemsCharacterCannotCarryWReasons.add(`Name: ${otherCharacter.name} - Description: ${currentShortDesc} - Cannot be carried because ${reason}`);
                    } else if (!reason && canOrCannot === "can") {
                        itemsCharacterCannotCarryWReasons.add(`Name: ${otherCharacter.name} - Description: ${currentShortDesc} - Can be carried`);
                    }
                }

            }
        }

        return Array.from(itemsCharacterCannotCarryWReasons);
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
    informCycleState(level, message) {
        for (const listener of this.informListeners) {
            try {
                listener(level, message);
            } catch (e) {
                console.error("Error in cycle state listener:", e);
            }
        }
    }

    /**
     * @param {string} characterName 
     */
    informCharacterInferenceStart(characterName) {

    }

    /**
     * 
     * @param {DECompleteCharacterReference} character 
     * @param {string[]} listOfCharacters
     */
    getCharacterWithClosestBondToCharacter(character, listOfCharacters) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }

        const bondsInOrder = listOfCharacters.map(otherCharName => {
            // @ts-expect-error
            const bondFound = this.deObject.social.bonds[character.name].active.find((b) => b.towards === otherCharName);
            if (!bondFound) {
                return { name: otherCharName, bond: 0 };
            }
            return { name: otherCharName, bond: Math.abs(bondFound.bond) };
        }).sort((a, b) => b.bond - a.bond);

        return bondsInOrder.length > 0 ? bondsInOrder[0].name : null;
    }

    /**
     * @param {DECompleteCharacterReference} character 
     * @param {boolean} characterIsSolo 
     */
    async determineCharacterHasMergedIntoAnotherConversationGroup(character, characterIsSolo) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }

        const characterState = this.deObject.stateFor[character.name];
        if (!characterState) {
            throw new Error(`Character state for ${character.name} not found.`);
        }

        const systemMessage = `You are an assistant that determines if ${character.name} approached a conversation group together with all ` +
            `the members of their current conversation group and has merged into that other conversation group in a friedly manner as they are closeby.\n\n` +
            `if ${character.name} has gone with their conversation group towards another, say the name of the group, the people in the group, and mention the new people ` +
            `that will conform this new conversation group.`;
        const systemMessageSolo = `You are an assistant that determines if ${character.name} has decided to join a new conversation group ` +
            `if ${character.name} has joined a new conversation group, say the name of the group, and mention the people in the group`;

        const currentConversation = characterState.conversationId ? this.deObject.conversations[characterState.conversationId] : null;
        if (!currentConversation) {
            throw new Error(`Character ${character.name} is not in a conversation, cannot determine if they have left the conversation group.`);
        }

        const participantsThatAreNotCharacter = currentConversation.participants.filter(charName => charName !== character.name);
        if (participantsThatAreNotCharacter.length === 0) {
            throw new Error(`Character ${character.name} is the only participant in the conversation, cannot determine if they have left the conversation group.`);
        }

        let groupsList = `The list of groups is as follows:\n\n${character.name}'s own group:\n - ${character.name}: ${await getExternalDescriptionOfCharacter(this, character.name)}\n`;

        for (const ownGroupParticipant of currentConversation.participants) {
            groupsList += ` - ${ownGroupParticipant}: ${await getExternalDescriptionOfCharacter(this, ownGroupParticipant)}\n`;
        }

        const allCharactersSurrounding = getSurroundingCharacters(this, character.name)
        const allCharactersAround = [...allCharactersSurrounding.nonStrangers, ...allCharactersSurrounding.totalStrangers];

        /**
         * @type {string[][]}
         */
        const groups = [];
        const solos = [];
        for (const surrondingCharacterName of allCharactersAround) {
            if (surrondingCharacterName === character.name) continue;
            if (participantsThatAreNotCharacter.includes(surrondingCharacterName)) continue;

            // check if already in one of the groups
            let foundInGroup = false;
            for (const group of groups) {
                if (group.includes(surrondingCharacterName)) {
                    foundInGroup = true;
                    break;
                }
            }
            if (foundInGroup) continue;

            const surrondingCharacterState = this.deObject.stateFor[surrondingCharacterName];
            if (surrondingCharacterState.conversationId) {
                const conv = this.deObject.conversations[surrondingCharacterState.conversationId];
                const participants = conv.participants;
                if (participants.length === 1) {
                    solos.push(surrondingCharacterName);
                } else {
                    groups.push(participants);
                }
            } else {
                solos.push(surrondingCharacterName);
            }
        }

        for (const [index, group] of groups.entries()) {
            const strongestCharacterBond = this.getCharacterWithClosestBondToCharacter(character, group);
            groupsList += `\n\n${strongestCharacterBond}'s group:\n`;
            for (const member of group) {
                groupsList += ` - ${member}: ${await getExternalDescriptionOfCharacter(this, member)}\n`;
            }
        };

        groupsList += `\n\nNow take into account the last message from ${character.name} and determine if they have merged into another conversation group together with all the members of their current conversation group. ` +
            `If they have approach a new group, say the new people that conform the new group that ${character.name} has joined, including any characters from the previous conversation that have joined as well. ` +
            `DO NOT say everyone in case it is everyone, use the specific names; if they have not merged into another group, say "NO, ${character.name} has not approached another group."`;

        // TODO inference to determine which group they have joined and with whom
        // TODO determine no
        let inferenceText = "";

        const inferenceTextLowered = inferenceText.toLowerCase();
        /**
         * @type {string[]}
         */
        const newPeopleOfTheGroup = [];
        for (const char of allCharactersAround) {
            if (char === character.name) continue;
            const lowered = char.toLowerCase();
            if (inferenceTextLowered.includes(lowered) && !newPeopleOfTheGroup.includes(char)) {
                newPeopleOfTheGroup.push(char);

                // now let's readd potential people from the groups that are conversing together that the LLM may have missed
                for (const group of groups) {
                    if (group.includes(char)) {
                        for (const member of group) {
                            if (!newPeopleOfTheGroup.includes(member)) {
                                newPeopleOfTheGroup.push(member);
                            }
                        }
                    }
                }
            }
        }

        if (!newPeopleOfTheGroup.includes(character.name)) {
            // add to the list
            newPeopleOfTheGroup.push(character.name);
        }

        if (newPeopleOfTheGroup.length === 1) {
            // well, :| this is not good, the LLM must have missed everything
            // we will be alone I guess
            return { merged: false, newGroupMembers: currentConversation.participants };
        }

        return {
            merged: true,
            newGroupMembers: newPeopleOfTheGroup,
        }
    }

    /**
     * Retruns the weather system for a given location and weather name,
     * taking into account location hierarchy (parent locations).
     * @param {string} locationName 
     * @param {string} weatherName 
     * @returns {DEWeatherSystem}
     */
    getWeatherSystemForLocationAndWeather(locationName, weatherName) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        const locationInfo = this.deObject.world.locations[locationName];
        if (!locationInfo) {
            throw new Error(`Location ${locationName} not found in world.`);
        }
        const weatherSystem = locationInfo.ownWeatherSystem?.find(ws => ws.name === weatherName);
        if (!weatherSystem && locationInfo.parent) {
            return this.getWeatherSystemForLocationAndWeather(locationInfo.parent, weatherName);
        } else if (!weatherSystem) {
            throw new Error(`Weather system ${weatherName} not found in location ${locationName} or its parents.`);
        }
        return weatherSystem;
    }

    /**
     * Determines if a character is fully or partially sheltered from a certain weather condition
     * by their current location or surroundings, or by an item they are carrying or wearing.
     * @param {string} characterName 
     * @param {string} weatherName
     * @param {string} locationName
     * @param {string} slotName
     */
    async isCharacterShelteredFromWeather(characterName, weatherName, locationName, slotName) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        const returnInformation = {
            fullySheltered: false,
            partiallySheltered: false,
            negativelyExposed: false,
            reason: `${characterName} is fully exposed to the weather condition "${weatherName}"`,
        }

        const weatherSystem = this.getWeatherSystemForLocationAndWeather(locationName, weatherName);

        const character = this.deObject.characters[characterName];
        if (!character) {
            throw new Error(`Character ${characterName} not found in world.`);
        }

        const locationInfo = this.deObject.world.locations[locationName];
        if (!locationInfo) {
            throw new Error(`Location ${locationName} not found in world.`);
        }

        const slotInfo = locationInfo.slots[slotName];
        if (!slotInfo) {
            throw new Error(`Slot ${slotName} not found in location ${locationName}.`);
        }

        const characterState = this.deObject.stateFor[characterName];
        if (!characterState) {
            throw new Error(`Character state for ${characterName} not found.`);
        }

        /**
         * @type {DEItem[]}
         */
        const potentiallyProtectingItemsCharacterIsInsideOf = getAllItemsCharacterIsInsideOf(this, characterName);

        // FULLY PROTECTED CHECKS
        // check for location based sheltering
        if ((slotInfo.slotFullyBlocksWeather || locationInfo.locationFullyBlocksWeather).includes(weatherName)) {
            returnInformation.fullySheltered = true;
            returnInformation.reason = `The location "${locationName}" fully blocks the weather condition "${weatherName}"`;
            return returnInformation;
        }

        // check if an item the character is carrying or wearing provides full sheltering
        for (const item of characterState.wearing) {
            if (item.wearableProperties?.fullyProtectsFromWeathers?.includes(weatherName)) {
                returnInformation.fullySheltered = true;
                returnInformation.reason = `The item "${item.name}" worn by "${characterName}" fully protects from the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }
        for (const item of characterState.carrying) {
            if (item.carriableProperties?.fullyProtectsFromWeathers?.includes(weatherName)) {
                returnInformation.fullySheltered = true;
                returnInformation.reason = `The item "${item.name}" carried by "${characterName}" fully protects from the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }

        if (weatherSystem.fullyProtectedNaked) {
            returnInformation.fullySheltered = true;
            returnInformation.reason = `Because ${characterName} is naked ${characterName} is immune to the weather condition "${weatherName}"`;
            return returnInformation;
        }
        if (weatherSystem.fullyProtectingWornItems.length > 0) {
            for (const item of characterState.wearing) {
                if (weatherSystem.fullyProtectingWornItems.includes(item.name)) {
                    returnInformation.fullySheltered = true;
                    returnInformation.reason = `The item "${item.name}" worn by "${characterName}" fully protects from the weather condition "${weatherName}"`;
                    return returnInformation;
                }
            }
        }
        if (weatherSystem.fullyProtectingCarriedItems.length > 0) {
            for (const item of characterState.carrying) {
                if (weatherSystem.fullyProtectingCarriedItems.includes(item.name)) {
                    returnInformation.fullySheltered = true;
                    returnInformation.reason = `The item "${item.name}" carried by "${characterName}" fully protects from the weather condition "${weatherName}"`;
                    return returnInformation;
                }
            }
        }
        for (const potentialProtectingItem of potentiallyProtectingItemsCharacterIsInsideOf || []) {
            if (potentialProtectingItem.containerProperties?.fullyProtectsFromWeathers?.includes(weatherName)) {
                returnInformation.fullySheltered = true;
                returnInformation.reason = `The item "${potentialProtectingItem.name}" that "${characterName}" is inside of fully protects from the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }

        if (weatherSystem.fullyProtectingStates.length > 0) {
            for (const state of characterState.states) {
                if (weatherSystem.fullyProtectingStates.includes(state.state)) {
                    returnInformation.fullySheltered = true;
                    // TODO improve this description of the state
                    returnInformation.reason = `Because "${characterName}" is in a state of "${state.state}", ${characterName} is immune to the weather condition "${weatherName}"`;
                    return returnInformation;
                }
            }
        }
        if (weatherSystem.fullyProtectedTemplate) {
            // @ts-expect-error
            const hasFullProtect = await weatherSystem.fullyProtectedTemplate.execute(this.deObject, character);
            if (hasFullProtect) {
                returnInformation.fullySheltered = true;
                returnInformation.reason = `Because ${hasFullProtect}, ${characterName} is immune to the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }

        // PARTIALLY PROTECTED CHECKS
        // check for location based sheltering
        if ((slotInfo.slotPartiallyBlocksWeather || locationInfo.locationPartiallyBlocksWeather).includes(weatherName)) {
            returnInformation.partiallySheltered = true;
            returnInformation.reason = `The location "${locationName}" partially blocks the weather condition "${weatherName}"`;
            return returnInformation;
        }

        //check if an item the character is carrying or wearing provides partial sheltering
        for (const item of characterState.wearing) {
            if (item.wearableProperties?.partiallyProtectsFromWeathers?.includes(weatherName)) {
                returnInformation.partiallySheltered = true;
                returnInformation.reason = `The item "${item.name}" worn by "${characterName}" partially protects from the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }
        for (const item of characterState.carrying) {
            if (item.carriableProperties?.partiallyProtectsFromWeathers?.includes(weatherName)) {
                returnInformation.partiallySheltered = true;
                returnInformation.reason = `The item "${item.name}" carried by "${characterName}" partially protects from the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }
        if (weatherSystem.partiallyProtectedNaked) {
            const isNaked = characterState.wearing.filter(item => item.wearableProperties?.coversTopNakedness || item.wearableProperties?.coversBottomNakedness).length === 0;
            if (isNaked) {
                returnInformation.partiallySheltered = true;
                returnInformation.reason = `Because ${characterName} is partially/totally naked, ${characterName} is partially immune to the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }

        if (weatherSystem.partiallyProtectingWornItems.length > 0) {
            for (const item of characterState.wearing) {
                if (weatherSystem.partiallyProtectingWornItems.includes(item.name)) {
                    returnInformation.partiallySheltered = true;
                    returnInformation.reason = `The item "${item.name}" worn by "${characterName}" partially protects from the weather condition "${weatherName}"`;
                    return returnInformation;
                }
            }
        }

        if (weatherSystem.partiallyProtectingCarriedItems.length > 0) {
            for (const item of characterState.carrying) {
                if (weatherSystem.partiallyProtectingCarriedItems.includes(item.name)) {
                    returnInformation.partiallySheltered = true;
                    returnInformation.reason = `The item "${item.name}" carried by "${characterName}" partially protects from the weather condition "${weatherName}"`;
                    return returnInformation;
                }
            }
        }

        for (const potentialProtectingItem of potentiallyProtectingItemsCharacterIsInsideOf || []) {
            if (potentialProtectingItem.containerProperties?.partiallyProtectsFromWeathers?.includes(weatherName)) {
                returnInformation.partiallySheltered = true;
                returnInformation.reason = `The item "${potentialProtectingItem.name}" that "${characterName}" is inside of partially protects from the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }

        if (weatherSystem.partiallyProtectingStates.length > 0) {
            for (const state of characterState.states) {
                if (weatherSystem.partiallyProtectingStates.includes(state.state)) {
                    returnInformation.partiallySheltered = true;
                    // TODO improve this description of the state
                    returnInformation.reason = `Because "${characterName}" is in a state of "${state.state}", ${characterName} is partially protected from the weather condition "${weatherName}".`;
                    return returnInformation;
                }
            }
        }

        if (weatherSystem.partiallyProtectedTemplate) {
            // @ts-expect-error
            const hasPartialEffect = await weatherSystem.partiallyProtectedTemplate.execute(this.deObject, character);
            if (hasPartialEffect) {
                returnInformation.partiallySheltered = true;
                returnInformation.reason = `Because ${hasPartialEffect}, ${characterName} is partially protected from the weather condition "${weatherName}".`;
                return returnInformation;
            }
        }

        // NEGATIVELY EXPOSED CHECKS
        // check for location based negative exposure
        if ((slotInfo.slotNegativelyExposesCharactersToWeather || locationInfo.locationNegativelyExposesCharactersToWeather).includes(weatherName)) {
            returnInformation.negativelyExposed = true;
            returnInformation.reason = `The location "${locationName}" negatively exposes to the weather condition "${weatherName}".`;
            return returnInformation;
        }

        // check if an item the character is carrying or wearing provides negative exposure
        for (const item of characterState.wearing) {
            if (item.wearableProperties?.negativelyExposesToWeathers?.includes(weatherName)) {
                returnInformation.negativelyExposed = true;
                returnInformation.reason = `The item "${item.name}" worn by "${characterName}" negatively exposes to the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }

        for (const item of characterState.carrying) {
            if (item.carriableProperties?.negativelyExposesToWeathers?.includes(weatherName)) {
                returnInformation.negativelyExposed = true;
                returnInformation.reason = `The item "${item.name}" carried by "${characterName}" negatively exposes to the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }

        if (weatherSystem.negativelyAffectedNaked) {
            const isNaked = characterState.wearing.filter(item => item.wearableProperties?.coversTopNakedness || item.wearableProperties?.coversBottomNakedness).length === 0;
            if (isNaked) {
                returnInformation.negativelyExposed = true;
                returnInformation.reason = `Because ${characterName} is partially/totally naked, ${characterName} is negatively exposed to the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }

        if (weatherSystem.negativelyAffectingWornItems.length > 0) {
            for (const item of characterState.wearing) {
                if (weatherSystem.negativelyAffectingWornItems.includes(item.name)) {
                    returnInformation.negativelyExposed = true;
                    returnInformation.reason = `The item "${item.name}" worn by "${characterName}" negatively exposes to the weather condition "${weatherName}"`;
                    return returnInformation;
                }
            }
        }

        if (weatherSystem.negativelyAffectingCarriedItems.length > 0) {
            for (const item of characterState.carrying) {
                if (weatherSystem.negativelyAffectingCarriedItems.includes(item.name)) {
                    returnInformation.negativelyExposed = true;
                    returnInformation.reason = `The item "${item.name}" carried by "${characterName}" negatively exposes to the weather condition "${weatherName}"`;
                    return returnInformation;
                }
            }
        }

        for (const potentialProtectingItem of potentiallyProtectingItemsCharacterIsInsideOf || []) {
            if (potentialProtectingItem.containerProperties?.negativelyExposesToWeathers?.includes(weatherName)) {
                returnInformation.negativelyExposed = true;
                returnInformation.reason = `The item "${potentialProtectingItem.name}" that "${characterName}" is inside of negatively exposes ${characterName} to the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }

        if (weatherSystem.negativelyAffectingStates.length > 0) {
            for (const state of characterState.states) {
                if (weatherSystem.negativelyAffectingStates.includes(state.state)) {
                    returnInformation.negativelyExposed = true;
                    // TODO improve this description of the state
                    returnInformation.reason = `Because "${characterName}" is in a state of "${state.state}", ${characterName} is negatively exposed to the weather condition "${weatherName}"`;
                    return returnInformation;
                }
            }
        }

        if (weatherSystem.negativelyAffectedTemplate) {
            // @ts-expect-error
            const hasNegativeEffect = await weatherSystem.negativelyAffectedTemplate.execute(this.deObject, character);
            if (hasNegativeEffect) {
                returnInformation.negativelyExposed = true;
                returnInformation.reason = `Because ${hasNegativeEffect}, ${characterName} is negatively exposed to the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }

        return returnInformation;
    }

    async requestTalkingTurnFromUser() {
        this.talkingTurnRequested = true;
    }

    /**
     * @param {DECompleteCharacterReference} character
     * @param {Array<DEngineInteraction>} previouslyLeftOrderOfInteraction
     * @param {number} internalCycleDepth
     * @returns 
     */
    async _startInteraction(character, previouslyLeftOrderOfInteraction = [], internalCycleDepth = 0) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }

        const characterState = this.deObject.stateFor[character.name];
        if (!characterState) {
            throw new Error(`Character state for ${character.name} not found.`);
        }

        if (!characterState.conversationId) {
            throw new Error(`Character ${character.name} is not in a conversation, cannot run internal cycle step.`);
        }

        if (this.talkingTurnRequested && internalCycleDepth !== 0) {
            // stop recursion user wants to talk
            // in theory characters can talk/react forever without the user talking
            // and just keep talking to each other because user's turn never comes
            // this allows user to interrupt the cycle and take a turn

            // it must not be the cycle zero because that would be bit weird
            // but I guess it can be allowed, but nah
            this.talkingTurnRequested = false;
            return;
        }

        this.informCycleState("info", `Next character to talk: ${character.name}`);
        await calculateStateChange(this, character);
        await calculateBondsChangesDueToMessages(this, character);
        await talk(character);

        const feasibilityResults = await testMessageFeasibilityForCharacter(this, character, previouslyLeftOrderOfInteraction);

        // this should not happen for non user characters
        if (!feasibilityResults.feasible) {
            throw new Error(`Character ${character.name} generated an infeasible message, which should not happen because they are not the user character. Reason: ${feasibilityResults.reason}`);
        }

        this.informCycleState("info", `Feasibility analysis and effect completed!`);

        const nextCharacterToTalk = feasibilityResults.nextCharacterToTalk;

        if (!nextCharacterToTalk || nextCharacterToTalk.name === this.user?.name) {
            this.informCycleState("info", `Next character to talk is the user or no one, ending recursive internal cycle.`);
            return;
        }

        const nextCharacterToTalkCharacterObject = this.deObject.characters[nextCharacterToTalk.name];
        const leftOrderOfInteraction = feasibilityResults.leftOrderOfInteraction;

        await this._startInteraction(nextCharacterToTalkCharacterObject, leftOrderOfInteraction, internalCycleDepth + 1);
    }

    async gameOver() {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        this.deObject.gameOver = true;
        await this.informDEObjectUpdated();
    }

    /**
     * @param {string} userMessageOrig 
     */
    async executeNextCycle(userMessageOrig) {
        const userMessage = userMessageOrig.trim();

        if (userMessage.length === 0) {
            return;
        }

        if (!this.userCharacter) {
            throw new Error("DEngine has no user character defined");
        } else if (!this.deObject) {
            throw new Error("DEngine not initialized");
        } else if (!this.user) {
            throw new Error("DEngine has no user character defined");
        } else if (this.executingCycle) {
            throw new Error("DEngine is already executing a cycle, cannot execute another one concurrently.");
        } else if (!this.pseudoConversationSummaryGenerator) {
            // TODO reenable this error once we have a proper LLM integration
            // TODO maybe instead of this summary generator, we can just do it on the fly
            // throw new Error("DEngine has no pseudo conversation summary generator defined, cannot execute cycle.");
        }

        if (this.executingCycle) {
            throw new Error("A cycle is already being executed.");
        }
        this.executingCycle = true;

        if (userMessage.startsWith("/")) {
            await this.executeCommand(userMessage);
            this.executingCycle = false;
            return;
        }

        const userCharacterState = this.deObject.stateFor[this.user.name];
        if (!userCharacterState) {
            throw new Error(`Character state for user ${this.user.name} not found.`);
        }

        const deObjectBackup = deepCopy(this.deObject);

        try {
            this.informCycleState("info", `Starting new message cycle`);

            const user = this.user;

            const expectedFutureConversationIdIfNotFound = crypto.randomUUID();

            /**
             * @param {boolean} makeRejected 
             * @returns 
             */
            const addUserMessage = (makeRejected) => {
                /**
                 * @type {DEConversationMessage}
                 */
                const messageToAdd = {
                    sender: user.name,
                    content: userMessage,
                    duration: { inMinutes: 0, inHours: 0, inDays: 0 },
                    // @ts-expect-error typescript issue as usual
                    startTime: { ...this.deObject.currentTime },
                    // @ts-expect-error typescript issue as usual
                    endTime: { ...this.deObject.currentTime },
                    id: crypto.randomUUID(),
                    isCharacter: true,
                    isDebugMessage: false,
                    isHiddenMessage: false,
                    isUser: true,
                    isStoryMasterMessage: false,
                    isRejectedMessage: makeRejected,
                    canOnlyBeSeenByCharacter: null,
                    perspectiveSummaryIds: {},
                    // @ts-ignore
                    singleSummary: userMessage.length < 50 ? userMessage : null,
                }
                if (!userCharacterState.conversationId) {
                    // need to make a new conversation
                    // TODO time hasn't moved so it shouldn't be a new state
                    const userCharacterStateCopy = deepCopyNoHistory(userCharacterState);
                    userCharacterState.history.push(userCharacterStateCopy);
                    userCharacterState.conversationId = expectedFutureConversationIdIfNotFound;
                    if (!makeRejected) {
                        userCharacterState.messageId = messageToAdd.id;
                    }
                    userCharacterState.type = "INTERACTING";
                    // @ts-expect-error typescript issue as usual
                    this.deObject.conversations[expectedFutureConversationIdIfNotFound] = {
                        id: expectedFutureConversationIdIfNotFound,
                        previousConversationIdsPerParticipant: {
                            [user.name]: null,
                        },
                        // @ts-expect-error typescript issue as usual
                        startTime: { ...this.deObject.currentTime },
                        messages: [messageToAdd],
                        participants: [user.name],
                        remoteParticipants: [],
                        location: userCharacterState.location,
                        pseudoConversation: false,
                        bondsAtStart: getFrozenBonds(this, [user.name]),
                        bondsAtEnd: null,
                    };
                    return expectedFutureConversationIdIfNotFound;
                } else {
                    // @ts-expect-error typescript issue as usual
                    this.deObject.conversations[userCharacterState.conversationId].messages.push(messageToAdd);
                    if (!makeRejected) {
                        userCharacterState.messageId = messageToAdd.id;
                    }
                    return userCharacterState.conversationId;
                }
            }

            /**
             * @param {string} reason 
             */
            const simpleRollbackWithReason = async (reason) => {
                this.deObject = deObjectBackup;

                const conversationIdUsed = addUserMessage(true);

                // @ts-ignore
                this.deObject.conversations[conversationIdUsed].messages.push({
                    sender: "Story Master",
                    content: `Message rejected, ${reason}`,
                    duration: { inMinutes: 0, inHours: 0, inDays: 0 },
                    // @ts-ignore
                    startTime: { ...this.deObject.currentTime },
                    // @ts-ignore
                    endTime: { ...this.deObject.currentTime },
                    id: crypto.randomUUID(),
                    isCharacter: false,
                    isDebugMessage: false,
                    isHiddenMessage: false,
                    isUser: false,
                    isStoryMasterMessage: true,
                    // make it rejected so that characters don't pick it up when they check conversations
                    isRejectedMessage: true,
                });

                await this.informDEObjectUpdated();
            }

            addUserMessage(false);
            await this.informDEObjectUpdated();
            this.informCycleState("info", `Testing message is following the rules`);

            const testResults = await testWorldRulesOn(this, this.userCharacter);
            if (!testResults.passed) {
                await simpleRollbackWithReason(testResults.reason || "Message broke world rules");
                this.informCycleState("info", `The message has been rejected for breaking the world rules`);
                this.executingCycle = false;
                return;
            }

            const feasibilityResults = await testMessageFeasibilityForCharacter(this, this.userCharacter, []);

            if (!feasibilityResults.feasible) {
                await simpleRollbackWithReason(feasibilityResults.reason || "Message is not feasible for character");
                this.informCycleState("info", `The message has been rejected for being not feasible for the character`);
                this.executingCycle = false;
                return;
            }

            this.informCycleState("info", `Feasibility test Passed!`);

            process.exit(1);

            const nextCharacterToTalk = feasibilityResults.nextCharacterToTalk;

            if (!nextCharacterToTalk || nextCharacterToTalk.name === this.user.name) {
                this.informCycleState("info", `Calculating state changes for user character`);
                await calculateStateChange(this, this.userCharacter);
                this.informCycleState("info", `Cycle completed successfully`);
                await this.informDEObjectUpdated();
                return;
            }

            const nextCharacterToTalkCharacterObject = this.deObject.characters[nextCharacterToTalk.name];
            const leftOrderOfInteraction = feasibilityResults.leftOrderOfInteraction;

            await this._startInteraction(
                nextCharacterToTalkCharacterObject,
                leftOrderOfInteraction,
                0,
            );
            // calculate state changes towards the user character
            // hopefully these are reasonable
            this.informCycleState("info", `Calculating state changes for user character`);
            await calculateStateChange(this, this.userCharacter);
            this.informCycleState("info", `Cycle completed successfully`);
            await this.informDEObjectUpdated();

            // TODO summarize in a detached way all the conversation messages added last cycle
            // TODO run fixPotentiallyBrokenItemStates at the end of each character reply, who knows what scripts may have done
        } catch (error) {
            // @ts-ignore
            this.informCycleState("error", `Internal Error during cycle execution: ${error.message}`);
            // @ts-ignore
            console.log(error.stack);
            // restore deObject from backup
            this.deObject = deObjectBackup;
            await this.informDEObjectUpdated();
        }

        this.executingCycle = false;
    }

    /**
     * 
     * @param {(obj: DEObject) => void | Promise<void>} listener 
     */
    addDEObjectUpdatedListener(listener) {
        this.listeners.push(listener);
    }

    /**
     * @param {(level: "info" | "warning" | "error", message: string) => void} listener 
     */
    addCycleInformListener(listener) {
        this.informListeners.push(listener);
    }

    /**
     * @param {(obj: DEObject, conversationId: string, messageId: string, text: string) => void} listener 
     */
    addInferringOverConversationMessageListener(listener) {
        this.startsToInferOverConversationMessageListeners.push(listener);
    }

    /**
     * @param {string} commandText 
     */
    async executeCommand(commandText) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        } else if (!this.user) {
            throw new Error("DEngine has no user character defined");
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

        /**
         * @type {DEConversationMessage}
         */
        const messageToAdd = {
            sender: "System",
            content: message,
            duration: { inMinutes: 0, inHours: 0, inDays: 0 },
            startTime: { ...this.deObject.currentTime },
            endTime: { ...this.deObject.currentTime },
            id: crypto.randomUUID(),
            isCharacter: false,
            isDebugMessage: true,
            isHiddenMessage: false,
            isUser: false,
            isStoryMasterMessage: true,
            isRejectedMessage: false,
            canOnlyBeSeenByCharacter: null,
            perspectiveSummaryIds: {},
            singleSummary: null,
        };

        let userConversationId = this.deObject.stateFor[this.user.name].conversationId;
        if (!userConversationId) {
            userConversationId = crypto.randomUUID();
            // @ts-ignore
            const userCharacterState = this.deObject.stateFor[this.user.name];
            const userCharacterStateCopy = deepCopyNoHistory(userCharacterState);
            userCharacterState.history.push(userCharacterStateCopy)
            userCharacterState.conversationId = userConversationId;
            userCharacterState.messageId = null;
            userCharacterState.type = "INTERACTING";
            this.deObject.conversations[userConversationId] = {
                id: userConversationId,
                previousConversationIdsPerParticipant: {
                    [this.user.name]: null,
                },
                startTime: { ...this.deObject.currentTime },
                messages: [messageToAdd],
                participants: [this.user.name],
                remoteParticipants: [],
                location: userCharacterState.location,
                pseudoConversation: false,
                bondsAtStart: getFrozenBonds(this, [this.user.name]),
                bondsAtEnd: null,
            };
        } else {
            this.deObject.conversations[userConversationId].messages.push(messageToAdd);
        }

        await this.informDEObjectUpdated();
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

/**
     * @param {DEngine} engine 
     * @param {string[]} characters 
     */
export function getFrozenBonds(engine, characters) {
    /**
     * @type {Record<string, DEBondDescription>}
     */
    const frozenBonds = {};
    characters.forEach(charName => {
        // @ts-expect-error
        frozenBonds[charName] = deepCopy(engine.deObject.social.bonds[charName]);
    });
    return frozenBonds;
}