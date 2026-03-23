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
import { getAllItemsCharacterIsInsideOf, getBeingCarriedByCharacter, getCharacterExactLocation, getExternalDescriptionOfCharacter, getListOfCarriedCharactersByCharacter, getSurroundingCharacters, isBottomNaked, isTopNaked } from "./util/character-info.js";
import { DEJSEngine } from "../jsengine/index.js";
import defaultNamePool from "./util/name-pool.js";
import { getHistoryFragmentForCharacter } from "./util/messages.js";
import calculatePostureChange from "./gears/posture-change.js";
import calculateItemChanges from "./gears/item-changes.js";
import timeForwardsUsingLastMessage, { rerollWorldWeather, timeForwardsToNewTime } from "./gears/time-forwards.js";
import { talk } from "./gears/talk.js";
import { millisecondsToTime } from "./util/time.js";
import { regenerateDEFromSavedDE } from "./util/save-de.js";

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
    // TODO improve this, there are a lot of things that we don't even need
    // like eg. most things should only really leave the properties behind,
    // we also should add the world script id or something or all scripts or whatever
    return function (key, value) {
        if (this === root && ROOT_SKIP_KEYS.has(key)) return undefined;
        if (typeof value === 'function') return undefined;
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
        socialSimulation: {
            attractions: [],
            dislikes: [],
            likes: [],
            species: "unknown",
            attractiveness: 1,
            dislikesSpecies: [],
            familyTies: {},
            gossipTendency: 1,
        }
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
         * @type {((obj: DEObject, data: {conversationId: string, messageId: string, text: string, hidden: boolean}) => void)[]}
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
     * Makes the user character schizophrenic which changes the behaviour
     * of the testing of world rules, so the character is free to hallucinate
     * instead of being constrained by reality
     */
    enableSchizophreniaModeForUser() {
        if (!this.userCharacter) {
            throw new Error("DEngine not initialized");
        }
        this.userCharacter.schizophrenia = 1;
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

        this.deObject = regenerateDEFromSavedDE(this, this.deObject);
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
        /**
         * @type {DETimeDescription}
         */
        const defaultTimeDEFormat = millisecondsToTime((new Date()).getTime());
        this.deObject = {
            user: user,
            world: {
                connections: {},
                // @ts-ignore
                currentLocation: null,
                // @ts-ignore
                currentLocationSlot: null,
                scenes: {},
                initialScenes: [],
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
            narrationStyle: {
                maxParagraphs: 5,
                minParagraphs: 2,
                narrativeBias: 0.2,
            },
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
                this.jsEngine.scriptOrder.map(scriptKey => ({ script: this.jsEngine.scriptCache[scriptKey], scriptKey })).filter(script => script.script.type === type);

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
                script.onWorldInitialized && await script.onWorldInitialized(this.deObject);
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
        } else if (!this.userCharacter) {
            throw new Error("DEngine user character not initialized");
        } else if (!this.inferenceAdapter) {
            throw new Error("Inference adapter not set");
        } else if (!this.jsEngine) {
            throw new Error("JS Engine not set, cannot run initialization scripts");
        }

        try {
            await this.inferenceAdapter.initialize();
        } catch (error) {
            console.warn("Inference adapter failed to initialize, continuing anyway. Error:", error);
        }

        const randomId = crypto.randomUUID();
        const sceneId = `INITIAL_SCENE_${randomId}_`;

        /**
         * @type {string[]}
         * 
         * We don't really use these messages, unless we remain at the same location
         */
        let timeForwardsMessages = [];
        const moveTimeForwards = async () => {
            if (!this.deObject) {
                throw new Error("DEngine not initialized");
            } else if (!this.userCharacter) {
                throw new Error("DEngine user character not initialized");
            }

            timeForwardsMessages = await timeForwardsUsingLastMessage(this, this.userCharacter);
        }

        /**
         * @type {DEScene}
         */
        const scene = this.deObject.world.scenes[optionName];
        if (!scene) {
            throw new Error(`Scene with option name ${optionName} not found.`);
        }
        const sceneObject = scene.prepareScene ? await scene.prepareScene(this.deObject, scene) || scene : scene;
        if (sceneObject.time) {
            // check that the time is in the future
            if (sceneObject.time.time < this.deObject.currentTime.time && this.deObject.world.selectedScene) {
                console.warn(`Scene time ${sceneObject.time.time} is in the past compared to current time ${this.deObject.currentTime.time}.`);
                this.informCycleState("warning", `Scene time ${sceneObject.time.time} is in the past compared to current time ${this.deObject.currentTime.time}. This may cause unexpected behavior.`);
                await moveTimeForwards();
            } else {
                if (!this.deObject.world.selectedScene) {
                    this.deObject.initialTime = { ...sceneObject.time };
                    this.deObject.currentTime = { ...sceneObject.time };
                    for (const charName in this.deObject.stateFor) {
                        this.deObject.stateFor[charName].time = { ...sceneObject.time };
                    }
                    rerollWorldWeather(this);
                } else {
                    timeForwardsToNewTime(this, sceneObject.time)
                }
            }
        } else if (this.deObject.world.selectedScene) {
            await moveTimeForwards();
        } else {
            rerollWorldWeather(this);
        }

        this.deObject.stateFor[this.userCharacter.name].location = sceneObject.location;
        this.deObject.stateFor[this.userCharacter.name].locationSlot = sceneObject.locationSlot;

        const didChangeLocation = sceneObject.location !== this.deObject.world.currentLocation;

        this.deObject.world.currentLocation = sceneObject.location;
        this.deObject.world.currentLocationSlot = sceneObject.locationSlot;

        const expectedParticipants = sceneObject.engagedCharacters ? [...sceneObject.engagedCharacters] : [];
        expectedParticipants.push(this.userCharacter.name);

        // ensure these are at the given location, if not, teleport them there
        for (const participantName of expectedParticipants) {
            if (!this.deObject.characters[participantName]) {
                throw new Error(`Participant character ${participantName} not found in DEObject characters.`);
            }
            this.deObject.stateFor[participantName].location = sceneObject.location;
            this.deObject.stateFor[participantName].locationSlot = sceneObject.locationSlot;
            this.deObject.stateFor[participantName].conversationId = sceneId;
            this.deObject.stateFor[participantName].type = "INTERACTING";
        }

        const narration = typeof sceneObject.narration === "string" ? sceneObject.narration : await sceneObject.narration(this.deObject, {});

        this.deObject.conversations[sceneId] = {
            id: sceneId,
            messages: [
                {
                    id: `${sceneId}_MESSAGE_0`,
                    canOnlyBeSeenByCharacter: null,
                    // we specify the weather changing only if we stayed at the same place
                    content: !didChangeLocation && timeForwardsMessages.length ? (timeForwardsMessages.join("\n\n") + "\n\n" + narration) : narration,
                    sender: "Story Master",
                    duration: {
                        inDays: 0,
                        inHours: 0,
                        inMinutes: 0,
                        inSeconds: 0,
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
                    emotion: null,
                    emotionalRange: null,
                    interactingCharacters: [],
                    rumors: [],
                },
            ],
            bondsAtStart: getFrozenBonds(this, expectedParticipants),
            // TODO what do we do with bonds at end here?
            bondsAtEnd: {},
            startTime: { ...this.deObject.currentTime },
            location: sceneObject.location,
            participants: expectedParticipants,
            previousConversationIdsPerParticipant: {},
            pseudoConversation: false,
            remoteParticipants: [],
        };
        for (const participantName of expectedParticipants) {
            this.deObject.conversations[sceneId].previousConversationIdsPerParticipant[participantName] = null;
        }

        this.deObject.world.selectedScene = optionName;

        await this.informDEObjectUpdated();

        let index = 0;
        /**
         * @param {string[]} messages 
         */
        const addMessageForStoryMaster = async (messages) => {
            if (!this.deObject) {
                throw new Error("DEngine not initialized");
            }

            if (messages.length === 0) {
                return;
            }

            index++;

            const messageCombined = messages.join("\n\n");
            this.deObject.conversations[sceneId].messages.push({
                id: `${sceneId}_MESSAGE_${index}`,
                canOnlyBeSeenByCharacter: null,
                content: messageCombined,
                sender: "Story Master",
                duration: {
                    inDays: 0,
                    inHours: 0,
                    inMinutes: 0,
                    inSeconds: 0,
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
                emotion: null,
                emotionalRange: null,
                interactingCharacters: [],
                rumors: [],
            });

            await this.informDEObjectUpdated();
        }

        scene.sceneStarted && await scene.sceneStarted(this.deObject, scene);
        for (const script of Object.values(this.jsEngine.scriptCache)) {
            script.onSceneStarted && await script.onSceneStarted(this.deObject, scene);
        }

        this.informCycleState("info", "Pre-calculating item changes and effects...");
        let lastItemChangesInfo = await calculateItemChanges(this, this.userCharacter);

        if (lastItemChangesInfo.storyMasterMessages.length > 0) {
            await addMessageForStoryMaster(lastItemChangesInfo.storyMasterMessages);
        }

        if (sceneObject.charactersStart) {
            const randomizedList = ([...sceneObject.engagedCharacters]).sort(() => Math.random() - 0.5);
            for (const participantName of randomizedList) {
                this.informCycleState("info", "Pre-calculating initial states for " + participantName + " and the world...");
                await calculateStateChange(this, this.deObject.characters[participantName], lastItemChangesInfo.interactedCharacters);

                this.informCycleState("info", "Pre-calculating initial bonds for " + participantName + "...");
                await calculateBondsChangesDueToMessages(this, this.deObject.characters[participantName]);

                /**
                 * @type {string[]}
                 */
                const postureChangeMessagesAccum = [];

                for (const participantName of expectedParticipants) {
                    this.informCycleState("info", "Pre-calculating posture for " + participantName + "...");
                    const messages = await calculatePostureChange(this, this.deObject.characters[participantName], lastItemChangesInfo.charactersThatMoved);
                    postureChangeMessagesAccum.push(...messages);
                }

                if (postureChangeMessagesAccum.length > 0) {
                    await addMessageForStoryMaster(postureChangeMessagesAccum);
                }

                for (const script of Object.values(this.jsEngine.scriptCache)) {
                    script.onInferencePrepareToExecute && await script.onInferencePrepareToExecute(this.deObject, participantName);
                }

                const talkResult = await talk(this, this.deObject.characters[participantName], {
                    doNotMove: true,
                });

                await addMessageForStoryMaster(talkResult.addedMessagesForStoryMaster);

                if (!talkResult.hasDeadEnded) {
                    const worldRulesResult = await testWorldRulesOn(this, this.deObject.characters[participantName]);
                    await addMessageForStoryMaster(worldRulesResult.addedMessagesForStoryMaster);

                    this.informCycleState("info", "Pre-calculating item changes and effects...");
                    lastItemChangesInfo = await calculateItemChanges(this, this.deObject.characters[participantName]);
                }

                for (const script of Object.values(this.jsEngine.scriptCache)) {
                    script.onInferenceExecuted && await script.onInferenceExecuted(this.deObject, participantName, {
                        emotionalRange: talkResult.emotionalRange,
                        primaryEmotion: talkResult.primaryEmotion,
                        hasDeadEnded: talkResult.hasDeadEnded,
                        hasDied: talkResult.hasDied,
                        message: talkResult.message,
                    });
                }
            }
        }

        // now the user starts, let's precalculate these states and bonds
        // so that they are ready for the user's first turn, even though
        // the user has no real affecting states, they are forced upon the user
        // as information bits
        this.informCycleState("info", "Pre-calculating initial states for " + this.userCharacter.name + " and the world...");
        await calculateStateChange(this, this.userCharacter, lastItemChangesInfo.interactedCharacters);

        this.informCycleState("info", "Pre-calculating initial bonds for your character...");
        await calculateBondsChangesDueToMessages(this, this.userCharacter);

        /**
         * @type {string[]}
         */
        const postureChangeMessagesAccum = [];

        for (const participantName of expectedParticipants) {
            this.informCycleState("info", "Pre-calculating posture for " + participantName + "...");
            const messages = await calculatePostureChange(this, this.deObject.characters[participantName], lastItemChangesInfo.charactersThatMoved);
            postureChangeMessagesAccum.push(...messages);
        }

        if (postureChangeMessagesAccum.length > 0) {
            await addMessageForStoryMaster(postureChangeMessagesAccum);
        }

        scene.sceneReady && await scene.sceneReady(this.deObject, scene);

        for (const script of Object.values(this.jsEngine.scriptCache)) {
            script.onSceneReady && await script.onSceneReady(this.deObject, scene);
        }

        // Game on :)
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
                    duration: { inMinutes: 0, inHours: 0, inDays: 0, inSeconds: 0 },
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
                    interactingCharacters: [],
                    rumors: [],
                    // @ts-ignore
                    singleSummary: userMessage.length < 50 ? userMessage : null,

                    emotion: null,
                    emotionalRange: null,
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
                    duration: { inMinutes: 0, inHours: 0, inDays: 0, inSeconds: 0 },
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
    addCycleInformListener(listener) {
        this.informListeners.push(listener);
    }

    /**
     * @param {(level: "info" | "warning" | "error", message: string) => void} listener 
     */
    removeCycleInformListener(listener) {
        this.informListeners = this.informListeners.filter(l => l !== listener);
    }

    /**
     * @param {(obj: DEObject, data: {conversationId: string, messageId: string, text: string, hidden: boolean}) => void} listener 
     */
    addInferringOverConversationMessageListener(listener) {
        this.startsToInferOverConversationMessageListeners.push(listener);
    }

    /**
     * @param {(obj: DEObject, data: {conversationId: string, messageId: string, text: string, hidden: boolean}) => void} listener 
     */
    removeInferringOverConversationMessageListener(listener) {
        this.startsToInferOverConversationMessageListeners = this.startsToInferOverConversationMessageListeners.filter(l => l !== listener);
    }

    /**
     * @param {DEObject} deObject 
     * @param {{conversationId: string, messageId: string, text: string, hidden: boolean}} data
     */
    triggerInferingOverConversationMessage(deObject, data) {
        for (const listener of this.startsToInferOverConversationMessageListeners) {
            try {
                listener(deObject, data);
            } catch (e) {
                console.error("Error in inferring over conversation message listener:", e);
            }
        }
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
            duration: { inMinutes: 0, inHours: 0, inDays: 0, inSeconds: 0 },
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
            emotion: null,
            emotionalRange: null,
            interactingCharacters: [],
            rumors: [],
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