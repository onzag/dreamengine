import { importScript, importScriptAsPropertyValueInCharacterSpace, importScriptAsPropertyValueInItemSpace, importScriptAsScript, importScriptAsTemplate } from "../imports/scripts.js";
import { ALL_FUNCTIONS_WITH_SPECIALS } from "../schema/functions.js"
import { weightedRandomByLikelihood } from "../util/random.js"
import { EMOTIONS_LIST } from "./rolling-emotion.js";
import { deEngineUtils } from "./utils.js";
import { commands } from "./commands.js";
import { BaseInferenceAdapter } from "./inference/base.js";
import calculateStateChange from "./gears/state-change.js";
import calculateBondsChangesDueToMessages from "./gears/bond-change.js";
import testWorldRulesOn from "./gears/rules-enforce.js";

const INVALID_NAMES = ["system", "assistant", "user", "everyone", "nobody",
    "anyone", "somebody", "narrator", "observer", "admin", "moderator",
    "game master", "gm", "storyteller", "dungeon master", "dm", "host",
    "player", "players", "character", "characters", "npc", "npcs",
    "they", "them", "their", "theirs", "he", "him", "his", "she", "her", "hers",
    "it", "its", "i", "me", "my", "mine", "we", "us", "our", "ours", "you", "your", "yours",
    "everyone else", "everybody else", "anyone else", "anybody else",
    "somebody else", "somebodyelse", "nobody else", "nobody", "story master", "storymaster", "story", "master"];

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
        systemPromptInjection: {},
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
        general: {
            type: "template",
            id: "?INTERNAL_NOOP_TEMPLATE",
            // @ts-expect-error
            execute: null,
        },
        initiative: 1,
        injectableInGeneralText: {},
        injectableInReasoning: {},
        properties: {},
        schizophrenia: 0,
        schizophrenicVoiceDescription: {
            execute: () => "",
            id: "?INTERNAL_NOOP_TEMPLATE",
            type: "template",
        },
        scripts: {
            firstInteract: {},
            postAnyInference: {},
            postInference: {},
            preInference: {},
            preStateCheck: {},
            spawn: {},
        },
        states: {},
        sex: user.sex,
        strangerInitiative: 1,
        strangerRejection: 0,
        emotions: {},
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
        this.initialized = false;
        /**
         * @type {DEMinimalCharacterReference | null}
         */
        this.user = null;
        /**
         * @type {DECompleteCharacterReference | null}
         */
        this.userCharacter = null;

        this.invalidCharacterStates = false;
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
         * @type {((scriptId: string, scriptType: "script" | "template" | "value_getter_char_space" | "value_getter_item_space", existingScriptSources: DEScriptSource[]) => Promise<DEScriptSource>) | null}
         */
        this.scriptImportResolver = null;
        /**
         * @type {((characterFileId: string) => Promise<{character: DECompleteCharacterReference, scriptSources: DEScriptSource[]}>) | null}
         */
        this.characterImportResolver = null;

        /**
         * @type {BaseInferenceAdapter | null}
         */
        this.inferenceAdapter = null;

        /**
         * @type {(Array<{name: string; import: string; properties: Record<string, DEPropertyValueInCharSpace>; spawnLocations: string[]; spawnLocationSlots: string[]; spawnSpreadToChildrenLocations: boolean; instances: number}>) | null}
         */
        this.characters = null;

        /**
         * @type {boolean}
         * 
         * mainly meant for debugging purposes, when true it will disable all world rules checks
         * this speeds up things greatly when testing other parts of the engine
         */
        this.disabledWorldRules = false;
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
     * Provides default script sources that are always available in the DEngine.
     * @returns {DEScriptSource[]}
     */
    getDefaultScriptSources() {
        return [
            {
                type: "template",
                sourceType: "handlebars",
                id: "?INTERNAL_NOOP_TEMPLATE",
                source: "",
                imports: [],
                run: (/*DE, character*/) => "",
            },
            {
                type: "value_getter_char_space",
                sourceType: "javascript",
                id: "?INTERNAL_NOOP_VALUE_GETTER",
                source: "",
                imports: [],
                run: (/*DE, character*/) => null,
            },
            // {
            //     type: "template",
            //     sourceType: "handlebars",
            //     id: "?INTERNAL_ALL_CHARACTERS_INJECTABLE_IN_GENERAL_TEXT",
            //     /**
            //      * @param {DEObject} DE 
            //      * @param {DECompleteCharacterReference} character 
            //      * @returns 
            //      */
            //     run: async (DE, character) => {
            //         return `As ${character.name} you should always respect the Story Master's decisions and narrations, ` +
            //             `if the Story Master says something about you or the world, you should accept it as true and adapt your behavior accordingly. Never do anything that contradicts the Story Master's narration.`;
            //     },
            //     source: "",
            //     imports: [],
            // },
        ];
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
        }
        // @ts-ignore
        this.deObject.functions = this.allInternalFunctions;
        this.deObject.scriptSources = this.deObject.scriptSources.filter(src => !src.id.startsWith("?INTERNAL_"));
        this.deObject.utils = deEngineUtils;
        this.user = this.deObject.user;
        this.userCharacter = this.deObject.characters[this.user.name];

        // these internals have no source so they cannot be recreated from JSON, but they are the same for every DEngine
        // so we can just add them back in
        for (const internalSrc of this.getDefaultScriptSources()) {
            this.deObject.scriptSources.push(internalSrc);
        }

        // now we need to recreate all sources
        for (const scriptSource of this.deObject.scriptSources) {
            switch (scriptSource.type) {
                case "script":
                    scriptSource.run = importScriptAsScript(scriptSource.id, scriptSource.id, scriptSource.source).execute;
                    break;
                case "template":
                    scriptSource.run = importScriptAsTemplate(scriptSource.id, scriptSource.id, scriptSource.sourceType, scriptSource.source).execute;
                    break;
                case "value_getter_char_space":
                    scriptSource.run = importScriptAsPropertyValueInCharacterSpace(scriptSource.id, scriptSource.id, scriptSource.source, scriptSource.sourceType).value;
                    break;
                case "value_getter_item_space":
                    scriptSource.run = importScriptAsPropertyValueInItemSpace(scriptSource.id, scriptSource.id, scriptSource.source, scriptSource.sourceType).value;
                    break;
                default:
                    throw new Error(`Unknown script source type: ${scriptSource.type}`);
            }
        }

        // patch all the scripts in the deObject to have their execute functions
        await this.patchScripts(true);

        this.initialized = true;
    }

    /**
     * @param {(scriptId: string, scriptType: "script" | "template" | "value_getter_char_space" | "value_getter_item_space", existingScriptSources: DEScriptSource[]) => Promise<DEScriptSource>} fn 
     */
    setScriptImportResolver(fn) {
        this.scriptImportResolver = fn
    }

    /**
     * @param {(characterFileId: string) => Promise<{character: DECompleteCharacterReference, scriptSources: DEScriptSource[]}>} fn 
     */
    setCharacterImportResolver(fn) {
        this.characterImportResolver = fn;
    }

    async patchScripts(noImport = false) {
        await checkObjectRecursivelyAsync(null, this.deObject, async (parent, obj) => {
            if (obj.type === "script" || obj.type === "template") {
                if (typeof obj.execute !== "function") {
                    // find the script in the deObject.scriptSources and see if we can set it up
                    // @ts-ignore
                    const scriptSourceFound = this.deObject.scriptSources.find(src => src.id === obj.id);
                    if (scriptSourceFound) {
                        obj.execute = scriptSourceFound.run;
                    } else if (noImport || !this.scriptImportResolver) {
                        throw new Error(`Script with id ${obj.id} does not have a valid source.`);
                    } else {
                        // @ts-ignore
                        const scriptSource = await this.scriptImportResolver(obj.id, obj.type, this.deObject.scriptSources);
                        if (!scriptSource || scriptSource.id !== obj.id || scriptSource.type !== obj.type) {
                            throw new Error(`Imported script source for id ${obj.id} is invalid.`);
                        } else {
                            // add the script source to the deObject script sources
                            // @ts-ignore
                            this.deObject.scriptSources.push(scriptSource);
                            obj.execute = scriptSource.run;
                        }
                    }
                }
            } else if (obj.type === "value_getter_char_space" || obj.type === "value_getter_item_space") {
                if (typeof obj.value !== "function") {
                    // find the script in the deObject.scriptSources and see if we can set it up
                    // @ts-ignore
                    const scriptSourceFound = this.deObject.scriptSources.find(src => src.id === obj.id);
                    if (scriptSourceFound) {
                        obj.value = scriptSourceFound.run;
                    } else if (noImport || !this.scriptImportResolver) {
                        throw new Error(`Script with id ${obj.id} does not have a valid source`);
                    } else {
                        // @ts-ignore
                        const scriptSource = await this.scriptImportResolver(obj.id, obj.type, this.deObject.scriptSources);
                        if (!scriptSource || scriptSource.id !== obj.id || scriptSource.type !== obj.type) {
                            throw new Error(`Imported script source for id ${obj.id} is invalid.`);
                        } else {
                            // add the script source to the deObject script sources
                            // @ts-ignore
                            this.deObject.scriptSources.push(scriptSource);
                            obj.value = scriptSource.run;
                        }
                    }
                }
            }
        });

        // now we will check the imports of all script sources and ensure they are also imported
        let hasMissingImports = false;
        do {
            /**
             * @type {Set<string>}
             */
            const missingImports = new Set();
            // @ts-ignore
            for (const scriptSource of this.deObject.scriptSources) {
                if (scriptSource.imports && scriptSource.imports.length > 0) {
                    for (const importId of scriptSource.imports) {
                        // @ts-ignore
                        const found = this.deObject.scriptSources.find(src => src.id === importId);
                        if (!found) {
                            missingImports.add(importId);
                        }
                    }
                }
            }

            // @ts-ignore
            hasMissingImports = missingImports.size > 0;
            if (hasMissingImports) {
                for (const importId of missingImports) {
                    if (noImport) {
                        throw new Error(`Cannot find missing imported script ${importId}`);
                    } else if (!this.scriptImportResolver) {
                        throw new Error(`Script import resolver not set, cannot import missing script ${importId}`);
                    } else {
                        // @ts-ignore
                        const scriptSource = await this.scriptImportResolver(importId, "script", this.deObject.scriptSources);
                        if (!scriptSource || scriptSource.id !== importId || scriptSource.type !== "script") {
                            throw new Error(`Imported script source for id ${importId} is invalid.`);
                        } else {
                            // add the script source to the deObject script sources
                            // @ts-ignore
                            this.deObject.scriptSources.push(scriptSource);
                        }
                    }
                }
            }
        } while (hasMissingImports);
    }

    getStateAsJSON() {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        } else if (this.invalidCharacterStates) {
            throw new Error("DEngine has invalid character states, cannot get state as JSON");
        }

        // this should work fine, because all functions will be stripped out automatically
        // it should be possible to regenerate them on load
        // as the script that generated them should be in the object
        // as a string, and we use eval anyway to create the functions from that string
        return JSON.stringify(this.deObject);
    }
    /**
     * @param {DEMinimalCharacterReference} user
     * @param {DEWorld} world
     * @param {DEScriptSource[]} worldScriptsSources
     * @param {Array<{name: string; import: string; properties: Record<string, DEPropertyValueInCharSpace>; spawnLocations: string[]; spawnLocationSlots: string[]; spawnSpreadToChildrenLocations: boolean; instances: number}>} characters
     */
    async initialize(user, world, worldScriptsSources, characters) {
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
            world: world,
            characters: {},
            allNames: {
                mal: [],
                fem: [],
                amb: [],
            },
            worldNames: {
                mal: [],
                fem: [],
                amb: [],
            },
            conversations: {},
            stateFor: {},
            initialTime: defaultTimeDEFormat,
            currentTime: { ...defaultTimeDEFormat },
            // @ts-ignore
            functions: this.allInternalFunctions,
            social: {
                bonds: {},
            },
            scriptSources: [...this.getDefaultScriptSources(), ...worldScriptsSources],
            wanderHeuristics: {},
            utils: deEngineUtils,
            gameOver: false,
            worldRules: {}
        }

        this.user = user;
        this.userCharacter = createCharacterFromUser(user);

        this.characters = characters;

        // @ts-ignore
        this.addCharacter(this.userCharacter, [], null, null);

        this.initialized = true;
    }
    /**
     * 
     * @param {DENamePool} pool 
     */
    setNamePool(pool) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        this.deObject.allNames = pool;
    }
    getCurrentDEObject() {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        return this.deObject;
    }

    /**
     * @param {string} id 
     */
    getScriptSourceForId(id) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        return this.deObject.scriptSources.find(src => src.id === id) || null;
    }

    /**
     * @param {DECompleteCharacterReference} character
     * @param {DEScriptSource[]} scriptSources
     * @param {string} location
     * @param {string} locationSlot
     */
    addCharacter(character, scriptSources, location, locationSlot) {
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
            surroundingNonStrangers: [],
            surroundingTotalStrangers: [],
            partiallyExposedToWeather: null,
            fullyExposedToWeather: null,
            posture: "standing",
            // start on the ground/floor/etc
            postureAppliedOn: null,

            // chars start out empty handed
            carrying: [],
            carryingCharacters: [],
            beingCarriedByCharacter: null,
            currentAgeMinutes: character.ageYears * 525600, // approximate minutes in a year
            currentWeightKg: character.weightKg,

            // chars start up naked
            // hopefully they give them some clothes soon :)
            isTopNaked: true,
            isBottomNaked: true,
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

        if (scriptSources && scriptSources.length > 0) {
            for (const scriptSource of scriptSources) {
                this.deObject.scriptSources.push(scriptSource);
            }
        }

        // we need to set up surroundingNonStrangers and surroundingTotalStrangers, partiallyExposedToWeather and fullyExposedToWeather properly later
        this.invalidCharacterStates = true;
    }

    refreshCharacterStates() {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }

        const userGetsAPass = !this.deObject.world.hasStartedScene;

        for (const charName in this.deObject.stateFor) {
            const charState = this.deObject.stateFor[charName];
            const characterLocation = charState.location;
            const characterLocationSlot = charState.locationSlot;
            const characterLocationObj = this.deObject.world.locations[characterLocation];
            if (!characterLocationObj && !userGetsAPass) {
                throw new Error(`Character ${charName} is in invalid location ${characterLocation}, valid locations are: ${Object.keys(this.deObject.world.locations).join(", ")}`);
            } else if (characterLocationObj) {
                const characterLocationSlotObj = characterLocationObj.slots[characterLocationSlot];
                if (!characterLocationSlotObj) {
                    throw new Error(`Character ${charName} is in invalid location slot ${characterLocationSlot} in location ${characterLocation}, valid slots are: ${Object.keys(characterLocationObj.slots).join(", ")}`);
                }
                const currentWeather = characterLocationObj.currentWeather;
                const fullyBlockWeatherInfo = characterLocationSlotObj.slotFullyBlocksWeather || characterLocationObj.locationFullyBlocksWeather;
                const partiallyBlockWeatherInfo = characterLocationSlotObj.slotPartiallyBlocksWeather || characterLocationObj.locationPartiallyBlocksWeather;
                const isFullyProtectedFromWeather = fullyBlockWeatherInfo.includes(currentWeather);
                const isPartiallyProtectedFromWeather = partiallyBlockWeatherInfo.includes(currentWeather);
                charState.fullyExposedToWeather = !isFullyProtectedFromWeather && !isPartiallyProtectedFromWeather ? currentWeather : null;
                charState.partiallyExposedToWeather = !isFullyProtectedFromWeather && isPartiallyProtectedFromWeather ? currentWeather : null;

                // find other characters in the same location
                /**
                 * @type {string[]}
                 */
                const surroundingNonStrangers = [];
                /**
                 * @type {string[]}
                 */
                const surroundingTotalStrangers = [];
                for (const otherCharName in this.deObject.stateFor) {
                    if (otherCharName === charName) continue;
                    const otherCharState = this.deObject.stateFor[otherCharName];
                    if (otherCharState.location === characterLocation) {
                        const otherChar = this.deObject.characters[otherCharName];
                        if (this.deObject.social.bonds[charName].active.find(b => b.towards === otherCharName) || this.deObject.social.bonds[charName].ex.find(b => b.towards === otherCharName)) {
                            surroundingNonStrangers.push(otherChar.name);
                        } else {
                            surroundingTotalStrangers.push(otherChar.name);
                        }
                    }
                }
                charState.surroundingNonStrangers = surroundingNonStrangers;
                charState.surroundingTotalStrangers = surroundingTotalStrangers;
                charState.seenCharacters = [...surroundingNonStrangers, ...surroundingTotalStrangers];

                // determine seen items
                charState.seenItems = [];

                /**
                 * @param {DEItem} item
                 * @param {string} slotName
                 * @param {string|null} carriedByCharacter
                 * @param {string|null} wornByCharacter
                 */
                const processItem = (item, slotName, carriedByCharacter = null, wornByCharacter = null) => {
                    charState.seenItems.push({
                        name: item.name,
                        amount: item.amount || 1,
                        location: characterLocation,
                        locationSlot: slotName,
                        placement: item.placement || "on the ground",
                        carriedByCharacter: carriedByCharacter,
                        wornByCharacter: wornByCharacter,
                    });

                    if (!wornByCharacter && item.isSeeThrough) {
                        for (const containedItem of item.containing) {
                            processItem(containedItem, slotName, carriedByCharacter, wornByCharacter);
                        }
                    }
                }

                for (const [slotName, slot] of Object.entries(characterLocationObj.slots)) {
                    for (const item of slot.items) {
                        processItem(item, slotName);
                    }
                }

                for (const otherCharacter of charState.seenCharacters) {
                    const otherCharState = this.deObject.stateFor[otherCharacter];
                    for (const item of otherCharState.carrying) {
                        processItem(item, otherCharState.locationSlot, otherCharacter, null);
                    }
                    for (const item of otherCharState.wearing) {
                        processItem(item, otherCharState.locationSlot, null, otherCharacter);
                    }
                }
            }

            charState.isTopNaked = true;
            charState.isBottomNaked = true;
            for (const cloth of charState.wearing) {
                if (cloth.wearableProperties?.coversTopNakedness) {
                    charState.isTopNaked = false;
                }
                if (cloth.wearableProperties?.coversBottomNakedness) {
                    charState.isBottomNaked = false;
                }
            }


        }

        this.invalidCharacterStates = false;
    }

    async runAllSpawnScripts() {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        if (this.invalidCharacterStates) {
            throw new Error("DEngine has invalid character states, cannot run spawn scripts");
        }

        /**
         * @type {Record<string, Set<string>>}
         */
        let scriptsRan = {};
        for (const script of Object.values(this.deObject.world.worldAllCharacterSpawnScripts)) {
            for (const charName in this.deObject.characters) {
                const character = this.deObject.characters[charName];
                scriptsRan[character.name] = await this.runScriptById(script.id, character, scriptsRan[character.name] || new Set());
            }
        }
        for (const charName in this.deObject.characters) {
            const character = this.deObject.characters[charName];
            for (const scriptId of Object.keys(character.scripts.spawn)) {
                scriptsRan[character.name] = await this.runScriptById(scriptId, character, scriptsRan[character.name] || new Set());
            }
            character.scripts.spawn = {};
        }

        // save memory by clearing out the worldAllCharacterSpawnScripts after they have run
        this.deObject.world.worldAllCharacterSpawnScripts = {};
    }

    /**
     * @param {string} scriptId
     * @param {DECompleteCharacterReference} character
     * @param {Set<string>} scriptsRanInAnotherContext
     */
    async runScriptById(scriptId, character, scriptsRanInAnotherContext = new Set()) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        const scriptsRan = new Set(scriptsRanInAnotherContext);

        /**
         * 
         * @param {string} internalScriptId 
         * @returns 
         */
        const runScriptInternal = async (internalScriptId) => {
            if (scriptsRan.has(internalScriptId)) {
                return;
            }
            const source = this.getScriptSourceForId(internalScriptId);
            if (!source) {
                throw new Error(`Script source with id ${internalScriptId} not found.`);
            }
            const imports = source.imports || [];
            for (const importId of imports) {
                await runScriptInternal(importId);
            }
            await source.run(this.deObject, character);
            scriptsRan.add(internalScriptId);
        }
        await runScriptInternal(scriptId);
        return scriptsRan;
    }

    async runAllWorldCreationScripts() {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        if (!this.userCharacter) {
            throw new Error("DEngine user character not initialized");
        }
        let scriptsRan = new Set();
        for (const script of Object.values(this.deObject.world.worldScripts)) {
            scriptsRan = await this.runScriptById(script.id, this.userCharacter, scriptsRan);
        }

        // save memory by clearing out the worldScripts after they have run
        this.deObject.world.worldScripts = {};
    }

    /**
     * @param {string} optionName 
     */
    async startScene(optionName) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        } else if (!this.deObject.world.hasInitializedWorld) {
            throw new Error("World has not been initialized yet.");
        } else if (this.deObject.world.hasStartedScene) {
            throw new Error("Scene has already been started.");
        } else if (!this.userCharacter) {
            throw new Error("DEngine user character not initialized");
        } else if (!this.inferenceAdapter) {
            throw new Error("Inference adapter not set");
        }

        await this.inferenceAdapter.initialize();

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
        // @ts-ignore
        const narration = await sceneObject.narration.execute(this.deObject, this.userCharacter);

        const expectedParticipants = sceneObject.startingEngagedCharacters || [];
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
                    isStoryMasterMessage: true,
                    isUser: false,
                    startTime: { ...this.deObject.currentTime },
                }
            ],
            bondsAtStart: getFrozenBonds(expectedParticipants),
            bondsAtEnd: {},
            duration: {
                inDays: 0,
                inHours: 0,
                inMinutes: 0,
            },
            endTime: { ...this.deObject.currentTime },
            startTime: { ...this.deObject.currentTime },
            location: sceneObject.startingLocation,
            participants: expectedParticipants,
            previousConversationIdsPerParticipant: {},
            pseudoConversation: false,
            remoteParticipants: [],
            summary: null,
        };
        for (const participantName of expectedParticipants) {
            this.deObject.conversations["INITIAL_SCENE_NARRATION"].previousConversationIdsPerParticipant[participantName] = null;
        }

        this.rerollWorldWeather();
        const scriptTorRun = this.deObject.world.worldSceneInitializationScripts[optionName];
        if (scriptTorRun) {
            // @ts-ignore
            await this.runScriptById(scriptTorRun.id, this.userCharacter);
        }
        this.refreshCharacterStates();

        this.deObject.world.hasStartedScene = true;
        // remove initial scenes to save memory
        this.deObject.world.worldSceneInitializationScripts = {};
        this.deObject.world.initialScenes = {};

        this.deleteOrphanedScriptSources();
    }

    checkDEObjectIntegrity(initialization = false) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }

        // now let's check that all function are defined
        checkObjectRecursively(null, this.deObject, (parent, obj) => {
            if (obj.type === "script" || obj.type === "template") {
                if (typeof obj.execute !== "function") {
                    // find the script in the deObject.scriptSources and see if we can set it up
                    // @ts-ignore
                    const scriptSourceFound = this.deObject.scriptSources.find(src => src.id === obj.id);
                    if (scriptSourceFound) {
                        obj.execute = scriptSourceFound.run;
                    } else {
                        throw new Error(`Script with id ${obj.id} does not have a valid execute function.`);
                    }
                } else {
                    const scriptSourceFound = this.deObject?.scriptSources.find(src => src.id === obj.id);
                    if (!scriptSourceFound) {
                        throw new Error(`Value getter with id ${obj.id} does not have a valid source.`);
                    }
                }
            } else if (obj.type === "value_getter" || obj.type === "value_getter_char_space") {
                if (typeof obj.value !== "function") {
                    // find the script in the deObject.scriptSources and see if we can set it up
                    // @ts-ignore
                    const scriptSourceFound = this.deObject.scriptSources.find(src => src.id === obj.id);
                    if (scriptSourceFound) {
                        obj.value = scriptSourceFound.run;
                    } else {
                        throw new Error(`Value getter with id ${obj.id} does not have a valid value function.`);
                    }
                } else {
                    const scriptSourceFound = this.deObject?.scriptSources.find(src => src.id === obj.id);
                    if (!scriptSourceFound) {
                        throw new Error(`Value getter with id ${obj.id} does not have a valid source.`);
                    }
                }
            }
        });
    }

    deleteOrphanedScriptSources() {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        console.log("Optimizing DEObject...");

        // find all script source ids that are used in the deObject
        let deletedSomething = false;
        while (true) {
            /** @type {Set<string>} */
            const usedScriptSourceIds = new Set();
            checkObjectRecursively(null, this.deObject, (parent, obj) => {
                if (parent === this.deObject?.scriptSources) {
                    // we are iterating over the script sources themselves
                    return;
                }
                if (obj.type === "script" || obj.type === "template") {
                    if (obj.id === "LUNAR_STATION_INITIAL_SCRIPT") {
                        console.log(obj)
                    }
                    usedScriptSourceIds.add(obj.id);
                } else if (obj.type === "value_getter" || obj.type === "value_getter_char_space" || obj.type === "value_getter_item_space") {
                    usedScriptSourceIds.add(obj.id);
                }
            });
            // I know it is not the most efficient way, but it is simple and works
            // and easy to understand should be bombproof against bugs
            this.deObject.scriptSources.forEach(src => {
                for (const importId of src.imports) {
                    usedScriptSourceIds.add(importId);
                }
            });
            // now remove all script sources that are not used
            const newScriptSources = this.deObject.scriptSources.filter(src => usedScriptSourceIds.has(src.id));
            if (newScriptSources.length < this.deObject.scriptSources.length) {
                deletedSomething = true;
                const whatWasDeleted = this.deObject.scriptSources.filter(src => !usedScriptSourceIds.has(src.id)).map(src => src.id);
                console.log(`Deleted orphaned script sources: ${whatWasDeleted.join(", ")}`);
                this.deObject.scriptSources = newScriptSources;
            } else {
                deletedSomething = false;
            }
            if (!deletedSomething) {
                break;
            }
        }
    }

    /**
     * @param {string} locationName
     * @returns {Record<string, {maxWeightKg: number; maxVolumeLiters: number; currentWeightKg: number; currentVolumeLiters: number}>}
     */
    getRemainingCapacityInLocationApprox(locationName) {
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
            locationInfo.slots[slotName].items.forEach(item => {
                slots[slotName].currentWeightKg += item.weightKg;
                slots[slotName].currentVolumeLiters += item.volumeLiters;
            });

            // find characters in this slot
            for (const charName in this.deObject.stateFor) {
                const charState = this.deObject.stateFor[charName];
                if (charState.location === locationName && charState.locationSlot === slotName) {
                    const character = this.deObject.characters[charName];
                    let weight = character.weightKg;
                    let volume = weight;
                    weight += character.carryingCapacityKg;
                    volume += character.carryingCapacityLiters;
                    slots[slotName].currentWeightKg += weight;
                    slots[slotName].currentVolumeLiters += volume;
                }
            }
        }
        return slots;
    }

    async addCharactersInWorld() {
        if (this.characters === null) {
            throw new Error("No characters missing to add to the world");
        } else if (!this.characterImportResolver) {
            throw new Error("Character import resolver not set");
        } else if (!this.scriptImportResolver) {
            throw new Error("Script import resolver not set");
        } else if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }

        /**
         * @type {Record<string, DECompleteCharacterReference>}
         */
        const cache = {};
        for (const charData of this.characters) {
            if (charData.instances < 1) {
                continue;
            }
            if (!cache[charData.import]) {
                const character = await this.characterImportResolver(charData.import);
                if (!character) {
                    throw new Error(`Failed to import character ${charData.name} from ${charData.import}`);
                }
                cache[charData.import] = character.character;
                // @ts-ignore
                this.deObject.scriptSources.push(...character.scriptSources);
            }

            let weight = cache[charData.import].weightKg;
            let volume = weight; // approximate 1kg = 1 liter
            weight += cache[charData.import].carryingCapacityKg;
            volume += cache[charData.import].carryingCapacityLiters;

            // hopefully we can find a spot for them, we add all their potential
            // weight and volume requirements in case some script gives
            // them stuff as they spawn in that location

            for (let i = 0; i < charData.instances; i++) {
                const potentialSpawnLocations = (charData.spawnLocations.length > 0 ?
                    charData.spawnLocations :
                    Object.keys(this.deObject.world.locations));

                if (charData.spawnLocations.length > 0 && charData.spawnSpreadToChildrenLocations) {
                    // we need to add all child locations of the specified spawn locations
                    /**
                     * 
                     * @param {string} locationName 
                     */
                    const addAllChildrenOf = (locationName) => {
                        for (const locName in this.deObject?.world.locations) {
                            const locObj = this.deObject.world.locations[locName];
                            if (locObj.parent === locationName) {
                                if (!potentialSpawnLocations.includes(locName)) {
                                    potentialSpawnLocations.push(locName);
                                }
                                // recursively add children of this location
                                addAllChildrenOf(locName);
                            }
                        }
                    }
                    for (const locName of charData.spawnLocations) {
                        addAllChildrenOf(locName);
                    }
                }

                const viableSlotsAtLocation = potentialSpawnLocations.map(locName => {
                    const approx = this.getRemainingCapacityInLocationApprox(locName);
                    const viableSlots = [];
                    for (const slotName in approx) {
                        if (approx[slotName].maxWeightKg - approx[slotName].currentWeightKg >= weight &&
                            approx[slotName].maxVolumeLiters - approx[slotName].currentVolumeLiters >= volume) {
                            viableSlots.push(slotName);
                        }
                    }
                    return { location: locName, viableSlots, likelihood: viableSlots.length };
                }).filter(locInfo => locInfo.viableSlots.length > 0);

                if (!viableSlotsAtLocation || viableSlotsAtLocation.length === 0) {
                    throw new Error(`Failed to find a viable spawn location and slot for character ${charData.name} instance number ${i + 1}`);
                }

                // pick one at random
                const locationToSpawn = weightedRandomByLikelihood(viableSlotsAtLocation);

                if (!locationToSpawn) {
                    throw new Error(`Failed to pick a spawn location for character ${charData.name} instance number ${i + 1}`);
                }

                // now we are going to pick a slot at random
                const slotsToSpawn = locationToSpawn.viableSlots.filter((slot) => {
                    return charData.spawnLocationSlots.length > 0 ? charData.spawnLocationSlots.includes(slot) : true
                });

                if (!slotsToSpawn || slotsToSpawn.length === 0) {
                    throw new Error(`Failed to pick a spawn slot for character ${charData.name} instance number ${i + 1} at location ${locationToSpawn.location},
                        filtering of slots by spawnLocationSlots resulted in no viable slots, available slots were: ${locationToSpawn.viableSlots.join(", ")},
                        requested spawnLocationSlots were: ${charData.spawnLocationSlots.join(", ")}`);
                }

                // pick one slot at random
                const finalSlotToSpawn = slotsToSpawn[Math.floor(Math.random() * slotsToSpawn.length)];

                if (charData.instances === 1) {
                    const characterToWorkWith = deepCopy(cache[charData.import]);
                    characterToWorkWith.name = charData.name;
                    characterToWorkWith.properties = {
                        ...characterToWorkWith.properties,
                        ...charData.properties,
                    };
                    this.addCharacter(characterToWorkWith, [], locationToSpawn.location, finalSlotToSpawn);
                } else {
                    // now we need to get a name pool based on the location
                    const locationObj = this.deObject.world.locations[locationToSpawn.location];

                    const defaultNamePool = this.deObject.allNames;
                    let selectedNamePool = defaultNamePool;

                    /**
                     * @param {DEStatefulLocationDefinition} locationObj
                     */
                    const getNamePoolForLocation = (locationObj) => {
                        if (locationObj.namePool) {
                            selectedNamePool = locationObj.namePool;
                            return;
                        }

                        // find a parent location with a name pool
                        if (locationObj.parent) {
                            const parentLocationObj = this.deObject?.world.locations[locationObj.parent];
                            if (parentLocationObj) {
                                getNamePoolForLocation(parentLocationObj);
                            }
                        }
                    }
                    getNamePoolForLocation(locationObj);

                    const gender = cache[charData.import].gender;

                    // now we need to get a name from the selected name pool
                    let namePicked = null;
                    const pickName = () => {
                        let poolToUse = gender === "male" ? selectedNamePool.mal :
                            gender === "female" ? selectedNamePool.fem : selectedNamePool.amb;

                        // give it a 0.15 chance to pick the ambiguous pool if not ambiguous already
                        if (gender !== "ambiguous" && Math.random() < 0.15) {
                            poolToUse = selectedNamePool.amb;
                        }

                        let availableNames = poolToUse.filter(name => {
                            // ensure the name is not already used by another character
                            if (this.deObject?.characters[name]) {
                                return false;
                            }
                            return true;
                        });

                        if (availableNames.length === 0 && selectedNamePool !== defaultNamePool) {
                            // try again with the default pool
                            selectedNamePool = defaultNamePool;
                            pickName();
                            return;
                        } else if (availableNames.length === 0) {
                            throw new Error(`Failed to pick a name for character ${charData.name} instance number ${i + 1}, no available names left in the name pool.`);
                        } else {
                            namePicked = availableNames[Math.floor(Math.random() * availableNames.length)];
                        }
                    }

                    const characterToWorkWith = deepCopy(cache[charData.import]);
                    characterToWorkWith.name = namePicked;
                    characterToWorkWith.properties = {
                        ...characterToWorkWith.properties,
                        ...charData.properties,
                    };
                    this.addCharacter(characterToWorkWith, [], locationToSpawn.location, finalSlotToSpawn);
                }
            }
        }
    }

    async initializeWorld() {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        } else if (!this.characterImportResolver) {
            throw new Error("Character import resolver not set");
        } else if (!this.scriptImportResolver) {
            throw new Error("Script import resolver not set");
        } else if (!this.inferenceAdapter) {
            throw new Error("Inference adapter not set");
        }

        await this.inferenceAdapter.initialize();

        this.refreshCharacterStates();

        // now let's check that all function are defined
        if (!this.deObject.world.hasInitializedWorld) {
            await this.patchScripts();
            this.refreshCharacterStates();
            await this.runAllWorldCreationScripts();
            this.refreshCharacterStates();
            await this.addCharactersInWorld();
            this.refreshCharacterStates();
            await this.patchScripts();
            await this.runAllSpawnScripts();
            this.deleteOrphanedScriptSources();
        }

        this.refreshCharacterStates();
        this.checkDEObjectIntegrity(true);

        this.deObject.world.hasInitializedWorld = true;
    }

    async prepareNextCycle() {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        } else if (!this.deObject.world.hasInitializedWorld) {
            throw new Error("DEngine world not initialized");
        } else if (!this.deObject.world.hasStartedScene) {
            throw new Error("DEngine world scene not started");
        } else if (!this.inferenceAdapter) {
            throw new Error("Inference adapter not set");
        }

        await this.inferenceAdapter.initialize();

        this.refreshCharacterStates();
        this.checkDEObjectIntegrity();
        this.rerollWorldWeather();
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
        if (this.invalidCharacterStates) {
            throw new Error("DEngine has invalid character states, cannot get reasoning message");
        }

        return {
            "system": "",
            "user": "",
            "assistant": "",
        }
    }

    /**
     * 
     * @param {string} characterName 
     * @returns 
     */
    getAllSurroundingCharacters(characterName) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        if (this.invalidCharacterStates) {
            throw new Error("DEngine has invalid character states, cannot get surrounding characters");
        }
        const characterState = this.deObject.stateFor[characterName];
        if (!characterState) {
            throw new Error(`Character state for ${characterName} not found.`);
        }
        const surroundingCharacters = [...characterState.surroundingNonStrangers, ...characterState.surroundingTotalStrangers];
        return surroundingCharacters;
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
        if (this.invalidCharacterStates) {
            throw new Error("DEngine has invalid character states, cannot list items available to character");
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

        let message = "Items at the location:\n";

        /**
         * @param {string} space 
         * @param {DEItem} item 
         * @param {string} extraMessage
         */
        const listItems = (space, item, extraMessage) => {
            message += `${space}- ${item.owner ? item.owner + "'s " : ""}${item.name}${item.amount >= 2 ? " x" + item.amount : ""}, placement: ${item.placement}${extraMessage}\n`;
            if (item.containing.length !== 0) {
                message += `${space}  Containing:\n`;
            }
            for (const containedItem of item.containing) {
                listItems(space + "  ", containedItem, ", contained by: " + item.name + extraMessage);
            }
            cheapList.push(`${item.owner ? item.owner + "'s " : ""}${item.name}${item.amount >= 2 ? " x" + item.amount : ""}`);
        }
        if (noItemsInAnySlot) {
            message += "No items available at the location.\n";
        } else {
            for (const slotName of slotNames) {
                const slot = location.slots[slotName];
                message += `\nItems at ${slotName}:\n`;
                for (const item of slot.items) {
                    listItems("", item, "");
                }
            }
        }

        // now let's check each character excluding our own for now
        for (const otherCharName in this.deObject.stateFor) {
            if (otherCharName === characterName) continue;
            const otherCharState = this.deObject.stateFor[otherCharName];
            if (otherCharState.location === locationName) {
                message += `\nItems carried by ${otherCharName}:\n`;
                if (otherCharState.wearing.length === 0) {
                    message += `${otherCharName} Is currently naked.\n`;
                } else {
                    for (const item of otherCharState.wearing) {
                        listItems("", item, `, worn by: ${otherCharName}`);
                    }
                }
                if (otherCharState.carryingCharacters.length > 0) {
                    for (const carriedCharName of otherCharState.carryingCharacters) {
                        message += `${otherCharName} is carrying character: ${carriedCharName}.\n`;
                    }
                }
                if (otherCharState.carrying.length === 0 && otherCharState.wearing.length === 0 && otherCharState.carryingCharacters.length === 0) {
                    message += `No items or characters carried by ${otherCharName}.\n`;
                } else {
                    for (const item of otherCharState.carrying) {
                        listItems("", item, `, carried by: ${otherCharName}`);
                    }
                }
            }
        }

        // now let's do our own character
        message += `\nItems carried by ${characterName}:\n`;
        if (characterState.wearing.length === 0) {
            message += `${characterName} Is currently naked.\n`;
        } else {
            for (const item of characterState.wearing) {
                listItems("", item, `, worn by: ${characterName}`);
            }
        }
        if (characterState.carryingCharacters.length > 0) {
            for (const carriedCharName of characterState.carryingCharacters) {
                message += `${characterName} is carrying character: ${carriedCharName}.\n`;
            }
        }
        if (characterState.carrying.length === 0 && characterState.wearing.length === 0 && characterState.carryingCharacters.length === 0) {
            message += `No items or characters carried by ${characterName}.\n`;
        } else {
            for (const item of characterState.carrying) {
                listItems("", item, `, carried by: ${characterName}`);
            }
        }
        if (characterState.beingCarriedByCharacter) {
            message += `${characterName} is being carried by character: ${characterState.beingCarriedByCharacter}.\n`;
        }

        return { complete: message, cheapList };
    }

    /**
     * @param {string} characterName 
     * @param {boolean} onlyBasics
     * @returns {string}
     */
    getShortDescriptionOfCharacter(characterName, onlyBasics = false) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        if (this.invalidCharacterStates) {
            throw new Error("DEngine has invalid character states, cannot get short description of character");
        }
        const character = this.deObject.characters[characterName];
        if (!character) {
            throw new Error(`Character ${characterName} not found.`);
        }
        const characterState = this.deObject.stateFor[characterName];
        if (!characterState) {
            throw new Error(`Character state for ${characterName} not found.`);
        }
        let finalDescription = character.shortDescription;
        if (!finalDescription.endsWith(".")) {
            finalDescription += ".";
        }
        const hasItemsCoveringTopNakedness = characterState.wearing.some(item => item.wearableProperties && item.wearableProperties.coversTopNakedness);
        if (!hasItemsCoveringTopNakedness && character.shortDescriptionTopNakedAdd) {
            finalDescription += ` ${character.shortDescriptionTopNakedAdd}`;
            if (!finalDescription.endsWith(".")) {
                finalDescription += ".";
            }
        }
        const hasItemsCoveringBottomNakedness = characterState.wearing.some(item => item.wearableProperties && item.wearableProperties.coversBottomNakedness);
        if (!hasItemsCoveringBottomNakedness && character.shortDescriptionBottomNakedAdd) {
            finalDescription += ` ${character.shortDescriptionBottomNakedAdd}`;
            if (!finalDescription.endsWith(".")) {
                finalDescription += ".";
            }
        }
        if (characterState.wearing.length > 0) {
            finalDescription += " Wearing " + this.deObject.functions.format_and(this.deObject, null, characterState.wearing.map(item => item.amount >= 2 ? item.amount + " of " + (item.descriptionWhenWorn || item.description) : (item.descriptionWhenWorn || item.description))) + ".";
        } else {
            finalDescription += " Not wearing any clothes.";
        }

        if (onlyBasics) {
            return finalDescription;
        }

        if (characterState.carrying.length > 0) {
            finalDescription += " Carrying " + this.deObject.functions.format_and(this.deObject, null, characterState.carrying.map(item => item.amount >= 2 ? item.amount + " of " + (item.descriptionWhenCarried || item.description) : (item.descriptionWhenCarried || item.description))) + ".";
        } else {
            finalDescription += " Not carrying any items.";
        }

        if (characterState.beingCarriedByCharacter) {
            finalDescription += ` Being carried by ${characterState.beingCarriedByCharacter}.`;
        }

        if (characterState.carryingCharacters.length > 0) {
            finalDescription += ` Carrying characters: ` + this.deObject.functions.format_and(this.deObject, null, characterState.carryingCharacters) + ".";
        }

        let postureAppliedOnDescription = "the ground/floor";
        if (characterState.postureAppliedOn) {
            postureAppliedOnDescription = characterState.postureAppliedOn;
            if (characterState.beingCarriedByCharacter) {
                // let's see if we can be more specific
                const carryingCharacterState = this.deObject.stateFor[characterState.beingCarriedByCharacter];
                if (carryingCharacterState) {
                    const itemCarriedOn = carryingCharacterState.carrying.find(item => item.name === characterState.postureAppliedOn);
                    if (itemCarriedOn) {
                        postureAppliedOnDescription = itemCarriedOn.descriptionWhenCarried || itemCarriedOn.description;
                        postureAppliedOnDescription += ` (carried by ${characterState.beingCarriedByCharacter})`;
                    } else {
                        const itemWearing = carryingCharacterState.wearing.find(item => item.name === characterState.postureAppliedOn);
                        if (itemWearing) {
                            postureAppliedOnDescription = itemWearing.descriptionWhenWorn || itemWearing.description;
                            postureAppliedOnDescription += ` (worn by ${characterState.beingCarriedByCharacter})`;
                        }
                    }
                }
            } else {
                // find items in the location slot
                const location = this.deObject.world.locations[characterState.location];
                if (location) {
                    const locationSlot = location.slots[characterState.locationSlot];
                    if (locationSlot) {
                        const itemAtLocation = locationSlot.items.find(item => item.name === characterState.postureAppliedOn);
                        if (itemAtLocation) {
                            postureAppliedOnDescription = itemAtLocation.description;
                        }
                    }
                }
            }
        }

        finalDescription += " " + character.name + " is currently " + characterState.posture + " on " + postureAppliedOnDescription + ".";

        return finalDescription;
    }

    /**
     * Gets the carry/wear message for the character
     * @param {string} characterName 
     */
    getCarryWearMessageForCharacter(characterName) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        if (this.invalidCharacterStates) {
            throw new Error("DEngine has invalid character states, cannot get short description of character");
        }
        const character = this.deObject.characters[characterName];
        if (!character) {
            throw new Error(`Character ${characterName} not found.`);
        }
        const characterState = this.deObject.stateFor[characterName];
        if (!characterState) {
            throw new Error(`Character state for ${characterName} not found.`);
        }
        let finalDescription = "";
        if (characterState.wearing.length > 0) {
            finalDescription += `${character.name} is wearing ` + this.deObject.functions.format_and(this.deObject, null, characterState.wearing.map(item => item.amount >= 2 ? item.amount + " of " + (item.descriptionWhenWorn || item.description) : (item.descriptionWhenWorn || item.description))) + ".";
        } else {
            finalDescription += `${character.name} is not wearing any clothes.`;
        }

        if (characterState.carrying.length > 0) {
            finalDescription += `\n${character.name} is carrying ` + this.deObject.functions.format_and(this.deObject, null, characterState.carrying.map(item => item.amount >= 2 ? item.amount + " of " + (item.descriptionWhenCarried || item.description) : (item.descriptionWhenCarried || item.description))) + ".";
        } else {
            finalDescription += `\n${character.name} is not carrying any items.`;
        }

        if (characterState.beingCarriedByCharacter) {
            finalDescription += `\n${character.name} is being carried by ${characterState.beingCarriedByCharacter}.`;
        }

        if (characterState.carryingCharacters.length > 0) {
            finalDescription += `\n${character.name} is carrying characters: ` + this.deObject.functions.format_and(this.deObject, null, characterState.carryingCharacters) + ".";
        }

        return finalDescription;
    }

    /**
     * @param {string} locationName 
     * @param {string} locationSlotName 
     */
    getNonPickableItemsAtSlot(locationName, locationSlotName) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        if (this.invalidCharacterStates) {
            throw new Error("DEngine has invalid character states, cannot get non pickable items at slot");
        }
        const location = this.deObject.world.locations[locationName]
        if (!location) {
            throw new Error(`Location ${locationName} not found.`);
        }
        const locationSlot = location.slots[locationSlotName]
        if (!locationSlot) {
            throw new Error(`Location slot ${locationSlotName} not found in location ${locationName}.`);
        }
        const nonPickableItems = locationSlot.items.filter(item => item.nonPickable);
        return nonPickableItems;
    }

    /**
     * @param {"can" | "cannot"} canOrCannot
     * @param {string} characterName 
     * @param {string} locationName 
     * @returns 
     */
    getItemsCharacterMayWearWithReasons(canOrCannot, characterName, locationName) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        if (this.invalidCharacterStates) {
            throw new Error("DEngine has invalid character states, cannot get items character cannot carry");
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
                processCharacterList(carriedCharacterState.carryingCharacters);
            }
        }
        processCharacterList(characterState.carryingCharacters);
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
            } else if (item.nonPickable) {
                reason = `${character.name} cannot wear an item that is non-pickable`;
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
     * @param {"can" | "cannot"} canOrCannot
     * @param {string} characterName 
     * @param {string} locationName 
     * @param {boolean} includeCharacters
     * @param {boolean} excludeItems
     * @param {boolean} addVerboseContainmentInfo
     * @returns 
     */
    getItemsCharacterMayCarryWithReasons(canOrCannot, characterName, locationName, includeCharacters, excludeItems, addVerboseContainmentInfo = false) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        if (this.invalidCharacterStates) {
            throw new Error("DEngine has invalid character states, cannot get items character cannot carry");
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
                if (carriedItem.capacityLiters) {
                    addedVolume += carriedItem.capacityLiters * carriedItem.amount;
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
                const characterCharactersVolumes = processCharacterList(carriedCharacterState.carryingCharacters);
                takenVolume += characterCharactersVolumes.takenVolume;
            }

            return { takenVolume, addedVolume }
        }
        const characterCharactersVolumes = processCharacterList(characterState.carryingCharacters);
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
        const processItemAndReason = (item, extraMessage) => {
            let reason = null;
            if (item.weightKg > character.carryingCapacityKg) {
                reason = `item is too heavy (${item.weightKg}kg) for ${character.name}'s strength`;
            } else if (item.volumeLiters > character.carryingCapacityLiters) {
                reason = `item is too large (${item.volumeLiters}L) for ${character.name}'s carrying capacity`;
            } else if (item.weightKg > remainingCarryingCapacity) {
                reason = `${character.name} is already carrying too much weight to lift this item, weights ${item.weightKg}kg, remaining capacity is ${remainingCarryingCapacity}kg`;
            } else if (item.volumeLiters > remainingCarryingVolume) {
                reason = `${character.name} is already carrying too much volume to fit this item, volume is ${item.volumeLiters}L, remaining capacity is ${remainingCarryingVolume}L`;
            } else if (item.nonPickable) {
                reason = `${character.name} cannot pick/carry the item because the item is part of the environment and non-pickable`;
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
                processItemAndReason(containedItem, ` (contained by ${item.name}${extraMessage})`);
            }
        }

        if (!excludeItems) {
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
                    const currentShortDesc = this.getShortDescriptionOfCharacter(characterName, true)

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
        } else if (this.invalidCharacterStates) {
            throw new Error("DEngine has invalid character states, cannot determine closest bond");
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
        } else if (this.invalidCharacterStates) {
            throw new Error("DEngine has invalid character states, cannot determine if character has left conversation group to join another");
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

        let groupsList = `The list of groups is as follows:\n\n${character.name}'s own group:\n - ${character.name}: ${this.getShortDescriptionOfCharacter(character.name)}\n`;

        for (const ownGroupParticipant of currentConversation.participants) {
            groupsList += ` - ${ownGroupParticipant}: ${this.getShortDescriptionOfCharacter(ownGroupParticipant)}\n`;
        }

        const allCharactersAround = characterState.surroundingNonStrangers.concat(characterState.surroundingTotalStrangers);

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

        groups.forEach((group, index) => {
            const strongestCharacterBond = this.getCharacterWithClosestBondToCharacter(character, group);
            groupsList += `\n\n${strongestCharacterBond}'s group:\n`;
            for (const member of group) {
                groupsList += ` - ${member}: ${this.getShortDescriptionOfCharacter(member)}\n`;
            }
        });

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
     * @param {DECompleteCharacterReference} character
     * @param {string[]} currentlyInteractingCharacters
     * @param {Array<{
         * name: string,
         * lastInvoker: string | null,
         * messageWillBeAboutAgreeFollow: boolean,
         * messageWillBeAboutFightFollow: boolean,
         * messageWillBeAboutAgreeGroupMemberTaken: boolean,
         * messageWillBeAboutFightGroupMemberTaken: boolean,
         * expectedReasoning: string | null,
         * }>} interactionExpectations
     */
    async determineGroupDynamics(character, currentlyInteractingCharacters, interactionExpectations) {
        const allCharacterNamesNotChar = [...currentlyInteractingCharacters];

        // character is solo wont be really used here because we will use merged into another conversation group
        // to figure that out

        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        } else if (this.invalidCharacterStates) {
            throw new Error("DEngine has invalid character states, cannot determine if character has left conversation group to join another");
        }

        if (currentlyInteractingCharacters.length === 0 && interactionExpectations.length === 0) {
            throw new Error("No currently interacting characters or interaction expectations provided, cannot determine group dynamics");
        }

        if (currentlyInteractingCharacters.length === 0) {
            // in this case we will just use the interaction expectations to build the list, since they must be joining
            // whomever they are interacting with
            // TODO
        }

        if (this.inferenceAdapter === null) {
            throw new Error("Inference adapter not set, cannot perform inference");
        }

        const characterState = this.deObject.stateFor[character.name];
        if (!characterState) {
            throw new Error(`Character state for ${character.name} not found.`);
        }

        const currentConversation = characterState.conversationId ? this.deObject.conversations[characterState.conversationId] : null;
        if (!currentConversation) {
            throw new Error(`Character ${character.name} is not in a conversation, cannot determine if they have left the conversation group.`);
        }

        /**
         * @type Array<{groupDescription: string, characters: Array<{name: string, description: string}>}>
         */
        const groups = [
            {
                groupDescription: `${character.name}'s own group`,
                characters: currentlyInteractingCharacters.map((charName) => {
                    return {
                        name: charName,
                        description: this.getShortDescriptionOfCharacter(charName),
                    };
                })
            }];

        const allCharactersAround = characterState.surroundingNonStrangers.concat(characterState.surroundingTotalStrangers);
        /**
         * @type {{groupDescription: string, characters: Array<{name: string, description: string}>}}
         */
        const solos = {
            groupDescription: "Solo characters around",
            characters: [],
        };
        for (const surrondingCharacterName of allCharactersAround) {
            if (surrondingCharacterName !== character.name && !allCharacterNamesNotChar.includes(surrondingCharacterName)) {
                allCharacterNamesNotChar.push(surrondingCharacterName);
            }
            if (currentlyInteractingCharacters.includes(surrondingCharacterName)) continue;

            // check if already in one of the groups
            let foundInGroup = false;
            for (const group of groups) {
                if (group.characters.some(char => char.name === surrondingCharacterName)) {
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
                    solos.characters.push({
                        name: surrondingCharacterName,
                        description: this.getShortDescriptionOfCharacter(surrondingCharacterName),
                    });
                } else {
                    const existingGroup = groups.find(group => {
                        // small hack, we will change these group descriptions later
                        return group.groupDescription === "?" + surrondingCharacterState.conversationId;
                    });
                    if (existingGroup) {
                        // add to existing group
                        existingGroup.characters.push({
                            name: surrondingCharacterName,
                            description: this.getShortDescriptionOfCharacter(surrondingCharacterName),
                        });
                    } else {
                        groups.push({
                            // small hack, we will change these group descriptions later
                            groupDescription: "?" + surrondingCharacterState.conversationId,
                            characters: participants.map((charName) => {
                                return {
                                    name: charName,
                                    description: this.getShortDescriptionOfCharacter(charName),
                                };
                            }),
                        });
                    }
                }
            } else {
                solos.characters.push({
                    name: surrondingCharacterName,
                    description: this.getShortDescriptionOfCharacter(surrondingCharacterName),
                });
            }
        };

        groups.forEach((group, index) => {
            // we have the hacky description renamed
            if (group.groupDescription.startsWith("?")) {
                const strongestCharacterBond = this.getCharacterWithClosestBondToCharacter(character, group.characters.map(c => c.name));
                group.groupDescription = `${strongestCharacterBond}'s group`;
            }
        });

        const availableSocialGroupsContextInfo = this.inferenceAdapter.buildContextInfoForAvailableCharacters(groups, true);

        const systemMessage = `You are an assistant and story analyst that determines group dynamics between ${character.name} and ${this.deObject.functions.format_and(this.deObject, null, currentlyInteractingCharacters)}`;
        const systemPrompt = this.inferenceAdapter.buildSystemPromptForQuestioningAgent(systemMessage, [
            "You must make the conclusion based on the last message from " + character.name,
            "You must resolve ambiguous mentions of characters to proper names based on the available character descriptions at " + availableSocialGroupsContextInfo.characterInfoAt,
        ], null);
        const systemAgent = this.inferenceAdapter.runQuestioningCustomAgentOn(
            character,
            systemPrompt,
            availableSocialGroupsContextInfo.value,
            this.getHistoryForCharacter(character, {}),
            "LAST_CYCLE_EXPANDED",
            null,
        );
        const ready = await systemAgent.next();
        if (ready.done) {
            throw new Error("Questioning agent could not be started properly.");
        }

        // huge grammar should answer all the possible outcomes, we need examples
        const result = await systemAgent.next({
            nextQuestion: `considering the list at ${availableSocialGroupsContextInfo.availableCharactersAt}. How have the conversational dynamics changed?`,
            maxCharacters: 250,
            maxParagraphs: 1,
            stopAt: [],
            stopAfter: [".", "\n"],
            contextInfo: this.inferenceAdapter.buildContextInfoExample(
                `Example: If the story says '${character.name} left alone to go [somewhere]', answer: '${character.name} has left their current conversation group on their own to go somewhere else'.`
            ) + "\n" + this.inferenceAdapter.buildContextInfoExample(
                `Example: If the story says '${character.name} left their current conversation group and joined Bob', answer: '${character.name} has left their current conversation group on their own and joined another group, the new group is formed by "Alice", "Bob" and "Charlie"'.`
            ) + "\n" + this.inferenceAdapter.buildContextInfoExample(
                `Example: If the story says '${character.name} joined the group where the cat is', answer: '${character.name} has joined another group on their own; the new group is formed by "Alice", "Bob", and "Charlie"'. Assuming Charlie is the cat's name, use proper names.`
            ) + "\n" + this.inferenceAdapter.buildContextInfoExample(
                `Example: If the story says '${character.name} joined another group together with Dave and Eve', answer: '${character.name} has joined another group with "Dave" and "Eve"; the new group is formed by "Alice", "Bob" and "Charlie"'.`
            ) + "\n" + this.inferenceAdapter.buildContextInfoExample(
                `Example: If the story says '${character.name} kidnapped Joe away from their friends', answer: '${character.name} has kidnapped "Joe" away from their current conversation'.`
            ) + "\n" + this.inferenceAdapter.buildContextInfoExample(
                `Example: If the story says '${character.name} joined Dale while forcing Peter with him', answer: '${character.name} has joined another group forcing "Peter" with them; the new group is formed by "Dale"'.`
            ) + "\n" + this.inferenceAdapter.buildContextInfoExample(
                `Example: If the story does not indicate any change in group dynamics, answer: '${character.name} has stayed with their current group'.`
            )
            ,
            answerTrail: `${character.name} has `,
            grammar: `root::= (leftalone | leftalonejoined | joinedgroupalone | joinedgroupwith | stayedwithcurrentgroup | takenfromgroup) .*\n` +

                `leftalone ::= "left" " " "their" " " "current" " " "conversation" " " "group" " " "on" " " "their" " " "own" " " "to" (gosomewhereelse | dosomethingelse)\n` +
                `gosomewhereelse ::= "go" " " "somewhere" " " "else"\n` +
                `dosomethingelse ::= "do" " " "something" " " "else"\n` +

                `leftalonejoined ::= "left" " " "their" " " "current" " " "conversation" " " "group" " " "on" " " "their" " " "own" " " "and" " " "joined" " " "another" " " "group" ";" "the" " " "new" " " "group" " " "is" " " "formed" " " "by" " " characteractuallist\n` +

                `joinedgroupalone ::= "joined" " " "another" " " "group" " " "on" " " "their" " " "own" ";" " " "the" " " "new" " " "group" " " "is" " " "formed" " " "by" " " characteractuallist\n` +

                `joinedgroupwith ::= "joined" " " "another" " " "group" " " ("accompanied" | "together" | "taking" | "forcing" | "kidnapping") characteractuallist (" " "with" " " "them")? ";" "the" " " "new" " " "group" " " "is" " " "formed" " " "by" " " characteractuallist\n` +
                `stayedwithcurrentgroup ::= "stayed" " " "with" " " "their" " " "current" " " "group" .*\n` +

                `takenfromgroup ::= ("taken" | ("forced" " " "out") | "kidnapped" | "removed") " " characteractuallist " " "away" " " "from" " " "their" " " "current" " " "conversation" " " "group" andjoined?\n` +
                `andjoined ::= "and" " " "joined" " " characteractuallist\n` +

                `characteractuallist ::= ((" "? "," " "? | " " "and" " ")? "\\"" characterlist "\\"")+\n` +
                "characterlist ::= " + allCharacterNamesNotChar.map(name => JSON.stringify(name)).join(" | ") + "\n",
        });

        if (result.done) {
            throw new Error("Questioning agent finished unexpectedly.");
        }

        await systemAgent.next(null); // finish the generator

        // now we are up to some serious parsing
        const message = result.value.trim();

        // leftalone check
        if (message.toLowerCase().startsWith("left their current conversation group on their own to")) {
            originalGroupMembersLeftBehind = [...currentlyInteractingCharacters];
            newGroupMembers = [character.name];
        } else if (message.toLowerCase().startsWith("left their current conversation group on their own and joined another group")) {
            const formedByPart = message.split("formed by")[1];
        }
    }

    /**
     * @param {DECompleteCharacterReference} character
     */
    async determineInteractedCharactersForMessage(character) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        } else if (this.invalidCharacterStates) {
            throw new Error("DEngine has invalid character states, cannot determine interacted characters");
        } else if (!this.inferenceAdapter) {
            throw new Error("Inference adapter not set, cannot perform inference");
        }
        const systemMessage = `You are an assistant and story analyst that determines which characters are being interacted within a message by ${character.name} in an interactive story. ` +
            `By interaction we mean any mention of the character by name, description, actions directed towards them, where it warrants a response from the character`;

        const systemPrompt = this.inferenceAdapter.buildSystemPromptForQuestioningAgent(systemMessage, [], null);

        const characterState = this.deObject.stateFor[character.name];
        if (!characterState) {
            throw new Error(`Character state for ${character.name} not found.`);
        }
        if (!characterState.conversationId) {
            throw new Error(`Character ${character.name} is not in a conversation, cannot determine interacted characters.`);
        }

        const surroundingNonStrangers = characterState.surroundingNonStrangers;

        // these characters nearby but they are strangers likely not even looking at the direction
        // of the character so they likely don't notice them
        const surroundingTotalStrangers = characterState.surroundingTotalStrangers;

        // these characters are already in the conversation and likely will hear everything
        const conversationParticipants = this.deObject.conversations[characterState.conversationId].participants.filter(charName => charName !== character.name);
        const surroundingNonStrangersNotInConversation = surroundingNonStrangers.filter(charName => !conversationParticipants.includes(charName));

        /**
         * @type {string[]}
         */
        const strangersLikelyToNotice = [];
        /**
         * @type {string[]}
         */
        const strangersNotLikelyToNotice = [];
        /**
         * @type {string[]}
         */
        const nonStrangerLikelyToNotice = [];
        /**
         * @type {string[]}
         */
        const nonStrangerNotLikelyToNotice = [];

        for (const stranger of surroundingTotalStrangers) {
            const sameSlot = this.deObject.stateFor[stranger]?.locationSlot === characterState.locationSlot;
            if (sameSlot) {
                strangersLikelyToNotice.push(stranger);
            } else {
                strangersNotLikelyToNotice.push(stranger);
            }
        }
        for (const nonStranger of surroundingNonStrangersNotInConversation) {
            const sameSlot = this.deObject.stateFor[nonStranger]?.locationSlot === characterState.locationSlot;
            if (sameSlot) {
                nonStrangerLikelyToNotice.push(nonStranger);
            } else {
                nonStrangerNotLikelyToNotice.push(nonStranger);
            }
        }

        /**
         * @type Array<{groupDescription: string, characters: Array<{name: string, description: string}>}>
         */
        const groups = [];
        const allValidNamesForGrammar = new Set();

        if (strangersNotLikelyToNotice.length > 0) {
            groups.push({
                groupDescription: "strangers likely not looking at " + character.name + "'s direction",
                characters: strangersNotLikelyToNotice.map(name => ({
                    name,
                    description: this.getShortDescriptionOfCharacter(name),
                })),
            });
            for (const name of strangersNotLikelyToNotice) {
                allValidNamesForGrammar.add(name);
            }
        }
        if (nonStrangerNotLikelyToNotice.length > 0) {
            groups.push({
                groupDescription: "characters who know " + character.name + " but are likely not looking at " + character.name + "'s direction",
                characters: nonStrangerNotLikelyToNotice.map(name => ({
                    name,
                    description: this.getShortDescriptionOfCharacter(name),
                })),
            });
            for (const name of nonStrangerNotLikelyToNotice) {
                allValidNamesForGrammar.add(name);
            }
        }
        if (strangersLikelyToNotice.length > 0) {
            groups.push({
                groupDescription: "strangers likely looking at " + character.name + "'s direction",
                characters: strangersLikelyToNotice.map(name => ({
                    name,
                    description: this.getShortDescriptionOfCharacter(name),
                })),
            });
            for (const name of strangersLikelyToNotice) {
                allValidNamesForGrammar.add(name);
            }
        }
        if (nonStrangerLikelyToNotice.length > 0) {
            groups.push({
                groupDescription: "characters who know " + character.name + " and are likely looking at " + character.name + "'s direction",
                characters: nonStrangerLikelyToNotice.map(name => ({
                    name,
                    description: this.getShortDescriptionOfCharacter(name),
                })),
            });
            for (const name of nonStrangerLikelyToNotice) {
                allValidNamesForGrammar.add(name);
            }
        }
        if (conversationParticipants.length > 0) {
            groups.push({
                groupDescription: "characters already in conversation with " + character.name + " and likely hear everything",
                characters: conversationParticipants.map(name => ({
                    name,
                    description: this.getShortDescriptionOfCharacter(name),
                })),
            });
            for (const name of conversationParticipants) {
                allValidNamesForGrammar.add(name);
            }
        }

        const allPotentials = ([
            ...strangersLikelyToNotice,
            ...nonStrangerLikelyToNotice,
            ...strangersNotLikelyToNotice,
            ...nonStrangerNotLikelyToNotice,
            ...conversationParticipants,
        ])
        const allPotentialsLowered = allPotentials.map(name => name.toLowerCase());

        const generator = this.inferenceAdapter.runQuestioningCustomAgentOn(character, systemPrompt, null, this.getHistoryForCharacter(character, {}), "LAST_CYCLE_EXPANDED", null);
        const ready = await generator.next();
        if (ready.value !== "ready") {
            throw new Error("Questioning agent could not be started properly.");
        }

        const answerAboutLone = await generator.next({
            maxParagraphs: 1,
            maxCharacters: 500,
            stopAt: [],
            stopAfter: ["yes", "no"],
            nextQuestion: "In the last message from " + character.name + ", did they interact with any characters or try to get anyone's attention? answer yes if they did, no if they ignored everyone, left or did not interact with anyone.",
            grammar: `root ::= yesno .*\nyesno ::= "yes" | "no"`,
        });

        if (answerAboutLone.done) {
            throw new Error("Questioning agent ended unexpectedly when asking about interaction alone.");
        }

        console.log("Answer about tried to get someone attention interaction:", answerAboutLone.value);

        const interactingWithSomeone = answerAboutLone.value.trim().toLowerCase().indexOf("yes") !== -1;
        let interactingWithEveryone = false;
        /**
         * @type string[]
         */
        let interactingSpecifically = [];

        if (interactingWithSomeone) {
            const answerAboutEveryone = await generator.next({
                maxParagraphs: 1,
                maxCharacters: 500,
                stopAt: [],
                stopAfter: ["yes", "no"],
                nextQuestion: "In the last message from " + character.name + ", did they attempt to get everyone's attention or interact with everyone around them? such as trying to do a speech or announcement, or otherwise did they do something loud that would get everyone's attention? answer yes if they did, no if they didn't.",
                grammar: `root ::= yesno .*\nyesno ::= "yes" | "no"`,
            });

            if (answerAboutEveryone.done) {
                throw new Error("Questioning agent ended unexpectedly when asking about interaction with everyone.");
            }
            interactingWithEveryone = answerAboutEveryone.value.trim().toLowerCase().indexOf("yes") !== -1;

            console.log("Answer about everyone interaction:", answerAboutEveryone.value);

            if (!interactingWithEveryone) {
                // now let's ask who, the LLM is not good at saying nobody or none when there are many options
                // so we first ask if they interacted with anyone at all
                // if yes, we then ask who specifically
                const contextInfoGroups = this.inferenceAdapter.buildContextInfoForAvailableCharacters(groups);

                const customGrammar = `root ::= nameList (${this.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()})\nnameList ::= name (\",\" name)*\nname ::= ${Array.from(allValidNamesForGrammar).map(name => JSON.stringify(name)).join(" | ")}`;

                const answerToQuestion = await generator.next({
                    contextInfo: contextInfoGroups.value,
                    maxParagraphs: 1,
                    maxCharacters: 500,
                    stopAt: [],
                    stopAfter: [],
                    nextQuestion: "In the last message from " + character.name + ", which characters specifically are being interacted with?",
                    grammar: customGrammar,
                    answerTrail: "The characters " + character.name + " has interacted with in the order they are likely to respond/react are: ",
                });

                if (answerToQuestion.done) {
                    throw new Error("Questioning agent ended unexpectedly when asking about who was interacted with.");
                }

                console.log("Answer to who was interacted with:", answerToQuestion.value);

                answerToQuestion.value.split(",").map(name => name.trim()).forEach(name => {
                    const loweredName = name.toLowerCase();
                    if (loweredName === "none" || loweredName === "noone" || loweredName === "nobody" || !loweredName) {
                        return;
                    }

                    if (allPotentialsLowered.includes(loweredName)) {
                        const actualName = allPotentials[allPotentialsLowered.indexOf(loweredName)];
                        if (!interactingSpecifically.includes(actualName)) {
                            interactingSpecifically.push(actualName);
                        }
                    }
                });
            } else {
                interactingSpecifically = allPotentials;
            }
        }

        await generator.next(null); // finish the generator

        const result = {
            strangersAtDistanceInteracted: strangersNotLikelyToNotice.filter(name => interactingSpecifically.includes(name)),
            nonStrangersAtDistanceInteracted: nonStrangerNotLikelyToNotice.filter(name => interactingSpecifically.includes(name)),
            strangersUpCloseInteracted: strangersLikelyToNotice.filter(name => interactingSpecifically.includes(name)),
            nonStrangersUpCloseInteracted: nonStrangerLikelyToNotice.filter(name => interactingSpecifically.includes(name)),
            ordering: interactingSpecifically,
            loudAnnouncementToEveryone: interactingWithEveryone,
        };

        return result;
    }

    /**
     * @param {string} characterThatInvokedInteraction 
     * @param {string} interactedCharacter 
     */
    async applyConversationReactionAccordingToCharacter(characterThatInvokedInteraction, interactedCharacter) {
        return {
            repliesWithAutism: false,
            repliesWithSchizophrenia: false,
            repliesNormally: false,
            ignoresInvokerDueToTotalStranger: false,
            ignoresInvokerDueToBadRelationship: false,

            repliesWithCustom: false,
            customReaction: "",
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

        // FULLY PROTECTED CHECKS
        // check for location based sheltering
        if ((slotInfo.slotFullyBlocksWeather || locationInfo.locationFullyBlocksWeather).includes(weatherName)) {
            returnInformation.fullySheltered = true;
            returnInformation.reason = `The location "${locationName}" fully blocks the weather condition "${weatherName}"`;
            return returnInformation;
        }

        // check if an item the character is carrying or wearing provides full sheltering
        const characterState = this.deObject.stateFor[characterName];
        if (!characterState) {
            throw new Error(`Character state for ${characterName} not found.`);
        }
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

    /**
     * @param {DETimeDescription | null} time
     * @param {boolean} includeNowLabel
     */
    makeTimestamp(time, includeNowLabel = true) {
        if (!time) {
            return "Now";
        }
        if (includeNowLabel && this.deObject?.currentTime.time === time.time) {
            return "Now";
        }
        // We want something like; Monday, June 5th, 2023 at 3:45 PM
        // we expect utc time in milliseconds
        // even in the formatting
        const date = new Date(time.time);
        // so we want to ensure offset 0
        return date.toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            hour12: true,
            timeZone: 'UTC',
        });
    }

    async requestTalkingTurnFromUser() {
        this.talkingTurnRequested = true;
    }

    /**
     * Returns the whole history for the character up to the specified depth, if the depth
     * is 0, returns all history.
     * 
     * TODO something for optimizing long histories, like summarization of non-pseudo conversations
     * when it starts to get too long, even sumarization of many conversations into a single summary message
     * this will ensure the LLM can handle the context window properly without losing important information
     * 
     * @param {DECompleteCharacterReference} character
     * @param {{ excludeFrom?: string[] | null, includeDebugMessages?: boolean | null, includeRejectedMessages?: boolean | null}} options
     * @return {AsyncGenerator<{name: string, message: string, id: string, conversationId: string | null, debug: boolean, rejected: boolean}, void, boolean>}
     */
    async *getHistoryForCharacter(character, options) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        } else if (this.invalidCharacterStates) {
            throw new Error("DEngine has invalid character states, cannot get history for character");
        } else if (!this.deObject.stateFor[character.name]) {
            throw new Error(`Character state for ${character.name} not found.`);
        } else if (!this.pseudoConversationSummaryGenerator) {
            // TODO reenable this error once we have a proper LLM integration
            // throw new Error("Pseudo conversation summary generator not initialized.");
        }

        const characterState = this.deObject.stateFor[character.name];
        // newest first
        const characterStateWithCurrent = [characterState, ...(characterState.history.reverse())];

        let currentConversationId = characterState.conversationId;

        let statesAccumulated = new Set();
        /**
         * @type {string | null}
         */
        let statesAccumulatedAtLocation = null;
        /**
         * @type {DETimeDescription | null}
         */
        let statesAccumulatedFromTime = null;
        let lastStateObjectHandled = null;
        const consumedConversationIds = new Set();

        /**
         * @param {DETimeDescription} fromTime
         */
        const consumeAccumulatedStatesAndLocations = (fromTime) => {
            // because we are looping from newest to oldest, lastConversationStartTime is actually before
            // thisConversationEndTime
            let message = `From ${this.makeTimestamp(fromTime)} to ${this.makeTimestamp(statesAccumulatedFromTime)}, ` + character.name;
            if (statesAccumulated.size > 0) {
                message += ` finds ${this.deObject?.functions.format_reflexive(this.deObject, character, character.name)} in the following states: `;
                let statesList = "";
                statesAccumulated.forEach(s => {
                    if (statesList.length > 0) {
                        statesList += ", ";
                    }
                    statesList += s.toLowerCase();
                });
                message += statesList;
                message += ` while at location: "${statesAccumulatedAtLocation || "unknown location"}".`;
            } else {
                message += ` is at location: "${statesAccumulatedAtLocation || "unknown location"}".`;
            }

            statesAccumulated = new Set();
            statesAccumulatedAtLocation = null;
            statesAccumulatedFromTime = null;

            return {
                name: "Story Master",
                message: message,
                id: `story-master-${fromTime.time}`,
                conversationId: null,
                debug: false,
                rejected: false,
            };
        };

        for (const state of characterStateWithCurrent) {
            if (state.conversationId && !consumedConversationIds.has(state.conversationId)) {
                consumedConversationIds.add(state.conversationId);
                const currentConversationObject = this.deObject.conversations[state.conversationId];

                if (!currentConversationId) {
                    // time skipped and now we are into this conversation
                    // calculate time skipped, and specify in which state the character was
                    // maybe they were sleeping, eating, working, etc
                    // who knows what happened
                    const keepgoing = yield consumeAccumulatedStatesAndLocations(state.time);

                    if (!keepgoing) {
                        return;
                    }
                }

                // process the conversation messages
                const conversationMessages = currentConversationObject.messages.filter(msg => (options.includeRejectedMessages || !msg.isRejectedMessage) && (options.includeDebugMessages || !msg.isDebugMessage) &&
                    (!msg.canOnlyBeSeenByCharacter || msg.canOnlyBeSeenByCharacter === character.name));

                const conversationLocation = currentConversationObject.location || "an unknown location";
                const conversationStartTime = currentConversationObject.startTime;
                const firstMessageIsStoryMaster = conversationMessages.length > 0 && conversationMessages[0].sender === "Story Master";

                if (currentConversationObject.summary || currentConversationObject.pseudoConversation) {
                    if (!currentConversationObject.summary) {
                        // generate summary, it doesn't exist yet, but we need to have a conversation for what this
                        // character has been through and been doing
                        // @ts-ignore
                        currentConversationObject.summary = await this.pseudoConversationSummaryGenerator(
                            this.deObject,
                            // @ts-expect-error
                            currentConversationObject.participants.map((v) => this.deObject?.characters[v]),
                            currentConversationObject,
                        );
                    }
                    const participantsExcludingCharacter = currentConversationObject.participants.filter(p => p !== character.name);
                    const timeMark = this.makeTimestamp(conversationStartTime);
                    const withOrAlone = participantsExcludingCharacter.length === 0 ? "on their own" : "with " + this.deObject.functions.format_and(this.deObject, null, participantsExcludingCharacter);

                    const expectedId = `story-master-${state.conversationId}-summary`;
                    const keepgoing = yield {
                        name: "Story Master",
                        message: (timeMark === "Now" ? "Right Now" : "At " + timeMark) + ", " + character.name + " is at " + conversationLocation + " " + withOrAlone + ". Conversation summary: " + currentConversationObject.summary,
                        id: expectedId,
                        conversationId: state.conversationId,
                        debug: false,
                        rejected: false,
                    };
                    if (!keepgoing) {
                        return;
                    }
                } else {
                    for (const message of conversationMessages.reverse()) {
                        if (options.excludeFrom && options.excludeFrom.includes(message.sender)) {
                            continue;
                        }
                        const keepgoing = yield ({
                            name: message.sender,
                            message: message.content,
                            id: message.id,
                            conversationId: state.conversationId,
                            debug: message.isDebugMessage,
                            rejected: message.isRejectedMessage,
                        });
                        if (!keepgoing) {
                            return;
                        }
                    }

                    if (!firstMessageIsStoryMaster) {
                        const participantsExcludingCharacter = currentConversationObject.participants.filter(p => p !== character.name);
                        const timeMark = this.makeTimestamp(conversationStartTime);
                        const timeMarkDetailed = timeMark === "Now" ? "right now" : "at " + timeMark;
                        const withOrAlone = participantsExcludingCharacter.length === 0 ? "on their own" : "with " + this.deObject.functions.format_and(this.deObject, null, participantsExcludingCharacter);
                        const keepgoing = yield {
                            name: "Story Master",
                            message: "The following interaction took place " + timeMarkDetailed + ", " + character.name + " is at " + conversationLocation + withOrAlone + ".",
                            id: `story-master-${state.conversationId}-interaction-info`,
                            conversationId: state.conversationId,
                            debug: false,
                            rejected: false,
                        };
                        if (!keepgoing) {
                            return;
                        }
                    }
                }

                currentConversationId = state.conversationId;
            } else if (!state.conversationId) {
                currentConversationId = null;
                if (statesAccumulatedAtLocation && statesAccumulatedAtLocation !== state.location) {
                    // location changed, consume accumulated states
                    const keepgoing = yield consumeAccumulatedStatesAndLocations(state.time);
                    if (!keepgoing) {
                        return;
                    }
                } else {
                    statesAccumulatedAtLocation = state.location;
                    statesAccumulatedFromTime = state.time;
                }
                state.states.map(s => s.state).forEach(s => {
                    statesAccumulated.add(s);
                })
                // time skip until next conversation found
            }
            lastStateObjectHandled = state;
        }

        // consume any remaining accumulated states
        if ((statesAccumulated.size > 0 || statesAccumulatedAtLocation) && lastStateObjectHandled) {
            const keepgoing = yield consumeAccumulatedStatesAndLocations(lastStateObjectHandled.time);
            if (!keepgoing) {
                return;
            }
        }
    }

    /**
     * @param {DECompleteCharacterReference} character
     * @param {Array<{name: string, lastInvoker: string}>} previouslyLeftOrderOfInteraction
     * @param {number} internalCycleDepth
     * @returns 
     */
    async _runInternalCycleStepRecursive(character, previouslyLeftOrderOfInteraction = [], internalCycleDepth = 0) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }

        // TODO run item interaction inference here, to check if items move hands or locations

        // TODO run scripts like post any inference here
        // do something about stateContiguous cycles too

        let expectedNewTime = this.deObject.currentTime.time + (1000 * 60 * 1); // 1 minute per internal cycle step
        // TODO we will need to detect time change from actions that take time
        // apply the time change to everything, states, conversations, etc... they will all need a fresh
        // slate, stateFor should have its new history too

        // TODO states have intensityChangePerMinute so that should be applied too

        const characterState = this.deObject.stateFor[character.name];
        if (!characterState) {
            throw new Error(`Character state for ${character.name} not found.`);
        }

        if (!characterState.conversationId) {
            throw new Error(`Character ${character.name} is not in a conversation, cannot run internal cycle step.`);
        }

        // TODO this cycle cannot go if the character did a location change previously
        // as well as a group modification like taking a group member or leaving a group
        // those need to be processed first by the user
        // we need to detect that and process the location change first, as the user needs to
        // specify whether they follow, fight back, etc... so maybe it needs to go after nextOrderOfInteraction
        // if there is nothing to handle with agree follow, fight follow, etc...
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

        const alreadyInteractingCharacters = this.deObject.conversations[characterState.conversationId].participants.filter(participant => participant !== character.name);

        this.informCycleState("info", `Determining next order of interaction for character ${character.name} message`);

        const interactedCharacters = await this.determineInteractedCharactersForMessage(character);

        console.log(`Character ${character.name} interacted characters:`, interactedCharacters);

        /**
         * @type {Array<{
         * name: string,
         * lastInvoker: string | null,
         * messageWillBeAboutAgreeFollow: boolean,
         * messageWillBeAboutFightFollow: boolean,
         * messageWillBeAboutAgreeGroupMemberTaken: boolean,
         * messageWillBeAboutFightGroupMemberTaken: boolean,
         * expectedReasoning: string | null,
         * }>}
         */
        let nextOrderOfInteraction = /** @type {*} */(interactedCharacters.ordering.map(name => {
            if (name === character.name) {
                // kinda weird is character talking to themselves?
                return null;
            }
            return ({
                name: name,
                lastInvoker: character.name,

                messageWillBeAboutAgreeFollow: false,
                messageWillBeAboutFightFollow: false,
                messageWillBeAboutAgreeGroupMemberTaken: false,
                messageWillBeAboutFightGroupMemberTaken: false,

                expectedReasoning: null,
            });

            // we don't add the ones that already left the order of interaction
            // they come first in the next order of interaction
        }).filter(item => item !== null && !previouslyLeftOrderOfInteraction.find(prev => prev.name === item.name)));

        // we take the old values provided that they are still interacting characters
        // otherwise we must have left them behind without giving them time to answer
        // in their turn in the conversation
        // well the character did so, just the user is also a character after all
        const nextOrderOfInteractionPrevValues = previouslyLeftOrderOfInteraction.filter((c) => alreadyInteractingCharacters.includes(c.name)).map(prevInteraction => ({
            name: prevInteraction.name,
            lastInvoker: prevInteraction.lastInvoker,
            messageWillBeAboutAgreeFollow: false,
            messageWillBeAboutFightFollow: false,
            messageWillBeAboutAgreeGroupMemberTaken: false,
            messageWillBeAboutFightGroupMemberTaken: false,
            expectedReasoning: null,
        }));

        nextOrderOfInteraction = [
            ...nextOrderOfInteractionPrevValues,
            ...nextOrderOfInteraction,
        ];

        // we will add characters that are already interacting based on their initiative
        for (const alreadyInteractingCharacterName of alreadyInteractingCharacters) {
            const characterReference = this.deObject.characters[alreadyInteractingCharacterName];
            if (!nextOrderOfInteraction.find(interaction => interaction.name === alreadyInteractingCharacterName)) {
                if (Math.random() < characterReference.initiative) {
                    console.log(`Adding already interacting character ${alreadyInteractingCharacterName} to next order of interaction based on initiative ${characterReference.initiative}`);
                    nextOrderOfInteraction.push({
                        name: alreadyInteractingCharacterName,
                        lastInvoker: null,
                        messageWillBeAboutAgreeFollow: false,
                        messageWillBeAboutFightFollow: false,
                        messageWillBeAboutAgreeGroupMemberTaken: false,
                        messageWillBeAboutFightGroupMemberTaken: false,
                        expectedReasoning: null,
                    });
                }
            }
        }

        // forcefully add the character with the highest initiative if no one is left
        if (nextOrderOfInteraction.length === 0) {
            let highestInitiativeCharacter = null;
            let highestInitiativeValue = -1;
            for (const alreadyInteractingCharacterName of alreadyInteractingCharacters) {
                const characterReference = this.deObject.characters[alreadyInteractingCharacterName];
                if (characterReference.initiative > highestInitiativeValue) {
                    highestInitiativeValue = characterReference.initiative;
                    highestInitiativeCharacter = alreadyInteractingCharacterName;
                }
            }
            if (highestInitiativeCharacter) {
                console.log(`Forcefully adding already interacting character ${highestInitiativeCharacter} to next order of interaction as highest initiative ${highestInitiativeValue}`);
                nextOrderOfInteraction.push({
                    name: highestInitiativeCharacter,
                    lastInvoker: null,
                    messageWillBeAboutAgreeFollow: false,
                    messageWillBeAboutFightFollow: false,
                    messageWillBeAboutAgreeGroupMemberTaken: false,
                    messageWillBeAboutFightGroupMemberTaken: false,
                    expectedReasoning: null,
                });
            }
        }

        console.log(`Character is currently interacting with:`, alreadyInteractingCharacters);

        let expectedNextLocation = characterState.location;
        let expectedNextLocationSlot = characterState.locationSlot;

        // TODO determine the location change

        console.log(`Character ${character.name} final next order of interaction:`, nextOrderOfInteraction);

        // We need to check characters that are in conversation with these
        if (alreadyInteractingCharacters.length > 0 || nextOrderOfInteraction.length > 0) {
            console.log(`Determining change in group dynamics for character ${character.name}`);

            // this function modifies nextOrderOfInteraction in place
            // TODO this is not completed
            await this.determineGroupDynamics(character, alreadyInteractingCharacters, nextOrderOfInteraction);
        } else {
            // otherwise they are talking to themselves :D
        }

        // Now we will use initiative to find out characters that may just barge in the conversation
        // alongside their group members
        // TODO do this after location changes and we know which group is left and where they are

        if (nextOrderOfInteraction.length === 0) {
            // you are kinda, talking to yourself :D are you alone?...
            // we still need to figure item interactions nevertheless.
            this.informCycleState("info", `No characters noticed the user message.`);

            this.deObject.conversations[characterState.conversationId].messages.push({
                sender: "Story Master",
                content: "No characters noticed " + character.name + " messages/actions.",
                duration: { inMinutes: 0, inHours: 0, inDays: 0 },
                startTime: { ...this.deObject.currentTime },
                endTime: { ...this.deObject.currentTime },
                id: crypto.randomUUID(),
                isCharacter: false,
                isDebugMessage: false,
                isUser: false,
                isStoryMasterMessage: true,
                isRejectedMessage: false,
                canOnlyBeSeenByCharacter: null,
            });

            await this.informDEObjectUpdated();
            return;
        }

        // TODO process location changes, follow changes and consume characters that left the interaction order
        // once that is consumed it is but the lastInvoker that has their chance to talk once again

        // TODO recalculate postures and stances

        if (nextOrderOfInteraction.length > 0) {
            this.informCycleState("info", `Next character to talk: ${nextOrderOfInteraction[0].name}`);
            const nextCharacterToTalk = nextOrderOfInteraction[0];
            const nextCharacterToTalkCharacterObject = this.deObject.characters[nextCharacterToTalk.name];
            await this._talk(nextCharacterToTalkCharacterObject);
            await this._runInternalCycleStepRecursive(nextCharacterToTalkCharacterObject, [], internalCycleDepth + 1);
        }
    }

    /**
     * Finally it is the character's turn to talk
     * @param {DECompleteCharacterReference} character 
     */
    async _talk(character) {
        await calculateStateChange(this, character);
        await calculateBondsChangesDueToMessages(this, character);

        // Determine an action to take
        const actionDeterminationResult = await this.determineCharacterAction(character);

        // Now finally generate the message
    }

    async gameOver() {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        this.deObject.gameOver = true;
        await this.informDEObjectUpdated();
    }

    /**
     * @param {DECompleteCharacterReference} character 
     * @param {DESingleBondDescription} bond 
     */
    getBondDeclarationFromBondDescription(character, bond) {
        const bondDeclaration =
            character.bonds.declarations.find(bondDecl => bondDecl.strangerBond === bond.stranger && bondDecl.minBondLevel <= bond.bond && bond.bond < (bondDecl.maxBondLevel === 100 ? 200 : bondDecl.maxBondLevel) && bondDecl.min2BondLevel <= bond.bond2 && bond.bond2 < (bondDecl.max2BondLevel === 100 ? 200 : bondDecl.max2BondLevel));
        return bondDeclaration;
    }

    /**
     * @param {string} userMessageOrig 
     */
    async executeNextCycle(userMessageOrig) {
        const userMessage = userMessageOrig.trim();

        if (userMessage.length === 0) {
            return;
        }

        this.prepareNextCycle();

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

            let userConversationId = userCharacterState.conversationId;
            let originalConversationId = userConversationId;
            let originalMessageId = userCharacterState.messageId;
            /**
             * @type {DEConversationMessage}
             */
            const messageToAdd = {
                sender: this.user.name,
                content: userMessage,
                duration: { inMinutes: 0, inHours: 0, inDays: 0 },
                startTime: { ...this.deObject.currentTime },
                endTime: { ...this.deObject.currentTime },
                id: crypto.randomUUID(),
                isCharacter: true,
                isDebugMessage: false,
                isUser: true,
                isStoryMasterMessage: false,
                isRejectedMessage: false,
                canOnlyBeSeenByCharacter: null,
            }
            if (!userConversationId) {
                // need to make a new conversation
                // TODO time hasn't moved so it shouldn't be a new state
                userConversationId = crypto.randomUUID();
                const userCharacterStateCopy = deepCopyNoHistory(userCharacterState);
                userCharacterState.history.push(userCharacterStateCopy)
                userCharacterState.conversationId = userConversationId;
                userCharacterState.messageId = messageToAdd.id;
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
                    duration: { inMinutes: 0, inHours: 0, inDays: 0 },
                    endTime: null,
                    location: userCharacterState.location,
                    pseudoConversation: false,
                    summary: null,
                    bondsAtStart: getFrozenBonds([this.user.name]),
                    bondsAtEnd: null,
                };
            } else {
                this.deObject.conversations[userConversationId].messages.push(messageToAdd);
                userCharacterState.messageId = messageToAdd.id;
            }

            /**
             * @param {string} reason 
             */
            const simpleRollbackWithReason = async (reason) => {
                userCharacterState.messageId = originalMessageId;
                userCharacterState.conversationId = originalConversationId;
                // reject the added message
                messageToAdd.isRejectedMessage = true;
                // delete the historic state we added
                // @ts-ignore
                this.deObject.stateFor[this.user.name].history.pop();
                // @ts-ignore
                this.deObject.conversations[userConversationId].messages.push({
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
                    isUser: false,
                    isStoryMasterMessage: true,
                    // make it rejected so that characters don't pick it up when they check conversations
                    isRejectedMessage: true,
                });

                await this.informDEObjectUpdated();
            }

            await this.informDEObjectUpdated();
            this.informCycleState("info", `Testing message is following the rules`);

            const testResults = await testWorldRulesOn(this, this.userCharacter);
            if (!testResults.passed) {
                await simpleRollbackWithReason(testResults.reason || "Message broke world rules");
                this.informCycleState("info", `The message has been rejected for breaking the rules`);
                this.executingCycle = false;
                return;
            }

            this.informCycleState("info", `World rules passed!`);

            await this._runInternalCycleStepRecursive(this.userCharacter, [], 0);
            // calculate state changes towards the user character
            // hopefully these are reasonable
            await calculateStateChange(this, this.userCharacter);
            
        } catch (error) {
            // @ts-ignore
            this.informCycleState("error", `Internal Error during cycle execution: ${error.message}`);
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
            isUser: false,
            isStoryMasterMessage: true,
            isRejectedMessage: false,
            canOnlyBeSeenByCharacter: null,
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
                duration: { inMinutes: 0, inHours: 0, inDays: 0 },
                endTime: null,
                location: userCharacterState.location,
                pseudoConversation: false,
                summary: null,
                bondsAtStart: getFrozenBonds([this.user.name]),
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
     * 
     * @param {string[]} characters 
     */
export function getFrozenBonds(characters) {
    /**
     * @type {Record<string, DEBondDescription>}
     */
    const frozenBonds = {};
    characters.forEach(charName => {
        // @ts-expect-error
        frozenBonds[charName] = deepCopy(this.deObject.social.bonds[charName]);
    });
    return frozenBonds;
}