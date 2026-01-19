import { importScript, importScriptAsPropertyValueInCharacterSpace, importScriptAsPropertyValueInItemSpace, importScriptAsScript, importScriptAsTemplate } from "../imports/scripts.js";
import { ALL_FUNCTIONS_WITH_SPECIALS } from "../schema/functions.js"
import { weightedRandomByLikelihood } from "../util/random.js"
import { EMOTIONS_LIST } from "./rolling-emotion.js";

const INVALID_NAMES = ["system", "assistant", "user", "everyone", "nobody",
    "anyone", "somebody", "narrator", "observer", "admin", "moderator",
    "game master", "gm", "storyteller", "dungeon master", "dm", "host",
    "player", "players", "character", "characters", "npc", "npcs",
    "they", "them", "their", "theirs", "he", "him", "his", "she", "her", "hers",
    "it", "its", "i", "me", "my", "mine", "we", "us", "our", "ours", "you", "your", "yours",
    "everyone else", "everybody else", "anyone else", "anybody else",
    "somebody else", "somebodyelse", "nobody else", "nobody"];

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
 * @param {(parent: any, value: any) => void} arrayChecker
 */
function checkArraysRecursively(parent, obj, arrayChecker) {
    if (typeof obj !== "object" || obj === null) {
        return;
    }
    if (Array.isArray(obj)) {
        arrayChecker(parent, obj);
        return;
    }
    for (const key in obj) {
        checkArraysRecursively(obj, obj[key], arrayChecker);
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
        },
        shortDescription: user.shortDescription,
        shortDescriptionNaked: user.shortDescriptionNaked,
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

class DEngine {
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
         * @type {Function[]}
         */
        this.listeners = [];
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
                run: (/*DE, character*/) => "",
            },
            {
                type: "value_getter_char_space",
                sourceType: "javascript",
                id: "?INTERNAL_NOOP_VALUE_GETTER",
                source: "",
                run: (/*DE, character*/) => null,
            },
            {
                type: "template",
                sourceType: "handlebars",
                id: "?INTERNAL_ALL_CHARACTERS_INJECTABLE_IN_GENERAL_TEXT",
                /**
                 * @param {DEObject} DE 
                 * @param {DECompleteCharacterReference} character 
                 * @returns 
                 */
                run: async (DE, character) => {
                    return `As ${character.name} you should always respect the Story Master's decisions and narrations, ` +
                        `if the Story Master says something about you or the world, you should accept it as true and adapt your behavior accordingly. Never do anything that contradicts the Story Master's narration.`;
                },
                source: "",
            },
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
    initializeFromJSONState(deObjectJSON) {
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
        this.patchScripts();

        this.initialized = true;
    }

    patchScripts() {
        checkObjectRecursively(null, this.deObject, (parent, obj) => {
            if (obj.type === "script" || obj.type === "template") {
                if (typeof obj.execute !== "function") {
                    // find the script in the deObject.scriptSources and see if we can set it up
                    // @ts-ignore
                    const scriptSourceFound = this.deObject.scriptSources.find(src => src.id === obj.id);
                    if (scriptSourceFound) {
                        obj.execute = scriptSourceFound.run;
                    } else {
                        throw new Error(`Script with id ${obj.id} does not have a valid source.`);
                    }
                }
            } else if (obj.type === "value_getter" || obj.type === "value_getter_char_space" || obj.type === "value_getter_item_space") {
                if (typeof obj.value !== "function") {
                    // find the script in the deObject.scriptSources and see if we can set it up
                    // @ts-ignore
                    const scriptSourceFound = this.deObject.scriptSources.find(src => src.id === obj.id);
                    if (scriptSourceFound) {
                        obj.value = scriptSourceFound.run;
                    } else {
                        throw new Error(`Script with id ${obj.id} does not have a valid source`);
                    }
                }
            }
        });
    }

    getStateAsJSON() {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        } else if (this.invalidCharacterStates) {
            throw new Error("DEngine has invalid character states, cannot get state as JSON");
        }

        /**
         * @type {DEObject}
         */
        const cloned = deepCopy(this.deObject);

        // some optimizations, we don't need anything related
        // to the creation or initialization of the world anymore
        // as it has been fully set up
        if (this.deObject.world.hasStartedScene) {
            cloned.world.initialScenes = {};
        }
        let deletedScripts = [];
        if (this.deObject.world.hasInitializedWorld) {
            for (let scriptId of Object.keys(cloned.worldScripts)) {
                deletedScripts.push(cloned.worldScripts[scriptId].id);
            }
            cloned.worldScripts = {};
            for (let scriptId of Object.keys(cloned.worldAllCharacterSpawnScripts)) {
                deletedScripts.push(cloned.worldAllCharacterSpawnScripts[scriptId].id);
            }
            cloned.worldAllCharacterSpawnScripts = {};
            for (let character of Object.values(cloned.characters)) {
                for (let scriptId of Object.keys(character.scripts.spawn)) {
                    deletedScripts.push(character.scripts.spawn[scriptId].id);
                }
                character.scripts.spawn = {};
            }
        }
        for (const scriptId of deletedScripts) {
            // remove the script source from cloned.scriptSources
            cloned.scriptSources = cloned.scriptSources.filter(src => src.id !== scriptId);
        }
        
        
        // this should work fine, because all functions will be stripped out automatically
        // it should be possible to regenerate them on load
        // as the script that generated them should be in the object
        // as a string, and we use eval anyway to create the functions from that string
        return JSON.stringify(cloned);
    }
    /**
     * @param {DEMinimalCharacterReference} user
     * @param {string} startingLocation
     * @param {string} startingLocationSlot
     * @param {DETimeDescription} startingTime
     */
    initialize(user, startingLocation, startingLocationSlot, startingTime) {
        this.deObject = {
            user: user,
            world: {
                currentLocation: startingLocation,
                currentLocationSlot: startingLocationSlot,
                locations: {},
                connections: {},
                selectedScene: null,
                initialScenes: {},
                hasStartedScene: false,
                hasInitializedWorld: false,
                lore: {
                    type: "template",
                    id: "?INTERNAL_NOOP_TEMPLATE",
                    execute: () => "",
                },
            },
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
            initialTime: startingTime,
            currentTime: { ...startingTime },
            // @ts-ignore
            functions: this.allInternalFunctions,
            social: {
                bonds: {},
            },
            scriptSources: this.getDefaultScriptSources(),
        }

        this.user = user;
        this.userCharacter = createCharacterFromUser(user);

        this.addCharacter(this.userCharacter, startingLocation, startingLocationSlot);

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
            surroundingNonStrangers: [],
            surroundingStrangers: [],
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
            wearing: [],
        };

        this.deObject.wanderHeuristics[character.name] = {
            wanderConfinement: null,
            wanderPrimaryLocation: null,
            wanderOutsideConfinementActivatesState: null,
        };

        // we need to set up surroundingNonStrangers and surroundingStrangers, partiallyExposedToWeather and fullyExposedToWeather properly later
        this.invalidCharacterStates = true;
    }

    refreshCharacterStates() {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        for (const charName in this.deObject.stateFor) {
            const charState = this.deObject.stateFor[charName];
            const characterLocation = charState.location;
            const characterLocationSlot = charState.locationSlot;
            const characterLocationObj = this.deObject.world.locations[characterLocation];
            if (!characterLocationObj) {
                throw new Error(`Character ${charName} is in invalid location ${characterLocation}`);
            }
            const characterLocationSlotObj = characterLocationObj.slots[characterLocationSlot];
            if (!characterLocationSlotObj) {
                throw new Error(`Character ${charName} is in invalid location slot ${characterLocationSlot} in location ${characterLocation}`);
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
            const surroundingStrangers = [];
            for (const otherCharName in this.deObject.stateFor) {
                if (otherCharName === charName) continue;
                const otherCharState = this.deObject.stateFor[otherCharName];
                if (otherCharState.location === characterLocation) {
                    const otherChar = this.deObject.characters[otherCharName];
                    if (this.deObject.social.bonds[charName].active.find(b => b.towards === otherCharName) || this.deObject.social.bonds[charName].ex.find(b => b.towards === otherCharName)) {
                        surroundingNonStrangers.push(otherChar.name);
                    } else {
                        surroundingStrangers.push(otherChar.name);
                    }
                }
            }
            charState.surroundingNonStrangers = surroundingNonStrangers;
            charState.surroundingStrangers = surroundingStrangers;
        }

        this.invalidCharacterStates = false;
    }

    /**
     * @param {string} id
     * @param {string} source
     * @return {DEScript} 
     */
    addDEScript(id, source) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        if (id.startsWith("?")) {
            throw new Error(`Script id cannot start with '?', as it is reserved for internal use.`);
        }
        // check if source with the same id already exists
        const existingSource = this.deObject.scriptSources.find(src => src.id === id);
        if (existingSource) {
            // check if it is identical
            if (existingSource.source === source && existingSource.sourceType === "javascript" && existingSource.type === "script") {
                return {
                    type: "script",
                    id: existingSource.id,
                    execute: existingSource.run,
                }
            }
            throw new Error(`Script source with id ${id} already exists.`);
        }
        const importedScript = importScriptAsScript(id, id, source);
        this.deObject.scriptSources.push({
            type: "script",
            sourceType: "javascript",
            id: id,
            source: source,
            run: importedScript.execute,
        });
        return importedScript;
    }

    /**
     * @param {string} characterName 
     */
    async runSpawnScriptsForCharacter(characterName) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        if (this.invalidCharacterStates) {
            throw new Error("DEngine has invalid character states, cannot run spawn scripts");
        }

        const character = this.deObject.characters[characterName];
        if (!character) {
            throw new Error(`Character ${characterName} not found.`);
        }

        for (const script of Object.values(character.scripts.spawn)) {
            await script.execute(this.deObject, character);
        }
    }

    async runAllSpawnScripts() {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        if (this.invalidCharacterStates) {
            throw new Error("DEngine has invalid character states, cannot run spawn scripts");
        }
        await Promise.all(Object.keys(this.deObject.characters).map(charName => this.runSpawnScriptsForCharacter(charName)));
    }

    async runAllWorldScripts() {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        if (this.invalidCharacterStates) {
            throw new Error("DEngine has invalid character states, cannot run world scripts");
        }
        if (!this.userCharacter) {
            throw new Error("DEngine user character not initialized");
        }
        for (const script of Object.values(this.deObject.worldScripts)) {
            await script.execute(this.deObject, this.userCharacter);
        }
    }

    async startScene() {

    }

    checkDEObjectIntegrity() {
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

    async prepareNextCycle() {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }

        // now let's check that all function are defined
        if (!this.deObject.world.hasInitializedWorld) {
            this.patchScripts();
            await this.runAllWorldScripts();
            await this.runAllSpawnScripts();
        }

        this.refreshCharacterStates();
        this.checkDEObjectIntegrity();

        if (!this.deObject.world.hasStartedScene) {
            // first time setup of the weather in the world
            this.rerollWorldWeather();
            this.startScene();
        }
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

        if (!location.ownWeatherSystem) {
            if (parentLocation) {
                location.currentWeather = parentLocation.currentWeather;
                location.currentWeatherHasBeenOngoingFor = parentLocation.currentWeatherHasBeenOngoingFor;
                location.currentWeatherNoEffectDescription = parentLocation.currentWeatherNoEffectDescription;
                location.currentWeatherPartialEffectDescription = parentLocation.currentWeatherPartialEffectDescription;
                location.currentWeatherFullEffectDescription = parentLocation.currentWeatherFullEffectDescription;
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
        const surroundingCharacters = [...characterState.surroundingNonStrangers, ...characterState.surroundingStrangers];
        return surroundingCharacters;
    }

    /**
     * @param {string} characterName
     * @return {string}
     */
    describeItemsAvailableToCharacterForInference(characterName) {
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
        const slotName = characterState.locationSlot;

        const location = this.deObject.world.locations[locationName];
        if (!location) {
            throw new Error(`Location ${locationName} not found.`);
        }
        const locationSlot = location.slots[slotName];
        if (!locationSlot) {
            throw new Error(`Location slot ${slotName} not found in location ${locationName}.`);
        }

        let message = "Items at the location:\n";

        /**
         * @param {string} space 
         * @param {DEItem} item 
         * @param {string} extraMessage
         */
        const listItems = (space, item, extraMessage) => {
            message += `${space}- ${item.name}${item.amount >= 2 ? " x" + item.amount : ""}, placement: ${item.placement}${extraMessage}\n`;
            if (item.containing.length !== 0) {
                message += `${space}  Containing:\n`;
            }
            for (const containedItem of item.containing) {
                listItems(space + "  ", containedItem, ", contained by: " + item.name + extraMessage);
            }
        }
        if (locationSlot.items.length === 0) {
            message += "No items available at the location.\n";
        } else {
            for (const item of locationSlot.items) {
                listItems("", item, "");
            }
        }

        // now let's check each character excluding our own for now
        for (const otherCharName in this.deObject.stateFor) {
            if (otherCharName === characterName) continue;
            const otherCharState = this.deObject.stateFor[otherCharName];
            if (otherCharState.location === locationName && otherCharState.locationSlot === slotName) {
                message += `\n\nItems carried by ${otherCharName}:\n`;
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
        message += `\n\nItems carried by ${characterName}:\n`;
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

        return message;
    }

    /**
     * @param {string} characterName 
     */
    getShortDescriptionOfCharacter(characterName) {
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
        const hasItemsCoveringNakedness = characterState.wearing.some(item => item.coversNakedness);
        let finalDescription = hasItemsCoveringNakedness ? character.shortDescription : character.shortDescriptionNaked || character.shortDescription;
        if (!finalDescription.endsWith(".")) {
            finalDescription += ".";
        }
        if (characterState.wearing.length > 0) {
            finalDescription += " Wearing " + this.deObject.functions.format_and(this.deObject, null, characterState.wearing.map(item => item.amount >= 2 ? item.amount + " of " + (item.descriptionWhenWorn || item.description) : (item.descriptionWhenWorn || item.description))) + ".";
        } else {
            finalDescription += " Not wearing any clothes.";
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

        if (char)

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
     * @param {string} characterName 
     * @param {string} locationName 
     * @param {string} locationSlotName
     * @param {boolean} includeCharacters
     * @param {boolean} excludeItems
     * @returns 
     */
    getItemsCharacterCannotCarryWithReasons(characterName, locationName, locationSlotName, includeCharacters, excludeItems) {
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
        const locationSlot = location.slots[locationSlotName];
        if (!locationSlot) {
            throw new Error(`Location slot ${locationSlotName} not found in location ${locationName}.`);
        }
        const characterState = this.deObject.stateFor[characterName];
        if (!characterState) {
            throw new Error(`Character state for ${characterName} not found.`);
        }
        const itemsCharacterCannotCarryWReasons = [];

        let remainingCarryingCapacity = character.carryingCapacityKg;
        let remainingCarryingVolume = character.carryingCapacityLiters;

        /**
             * @param {DEItem[]} itemList 
             */
        const processItemList = (itemList) => {
            let takenVolume = 0;
            let addedVolume = 0;
            for (const carriedItem of itemList) {
                remainingCarryingCapacity -= carriedItem.weightKg * carriedItem.amount;
                if (carriedItem.capacityLiters) {
                    addedVolume += carriedItem.capacityLiters * carriedItem.amount;
                }
                takenVolume += carriedItem.volumeLiters * carriedItem.amount;

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
                const characterVolumesWearing = processItemList(carriedCharacterState.wearing);
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
        const volumeClothes = processItemList(characterState.wearing);
        remainingCarryingVolume += volumeClothes.addedVolume; // clothes don't count towards carrying volume, becuase they are worn
        // so we only consider the extra volume they add, not the volume they take

        /**
         * @param {DEItem} item
         * @param {string} extraMessage
         */
        const processItemAndReason = (item, extraMessage) => {
            let reason = null;
            if (item.weightKg > remainingCarryingCapacity) {
                reason = `item is too heavy (${item.weightKg}kg) for character strength`;
            } else if (item.volumeLiters > character.carryingCapacityLiters) {
                reason = `item is too large (${item.volumeLiters}L) for character carrying capacity`;
            } else if (item.weightKg > remainingCarryingCapacity) {
                reason = `the character is already carrying too much weight to lift this item`;
            } else if (item.volumeLiters > remainingCarryingVolume) {
                reason = `the character is already carrying too much volume to fit this item`;
            } else if (item.nonPickable) {
                reason = `item is marked as non-pickable`;
            }

            if (reason) {
                if (item.amount >= 2) {
                    itemsCharacterCannotCarryWReasons.push(`1 of ${item.name}: ${reason}`);
                } else {
                    itemsCharacterCannotCarryWReasons.push(`${item.name}: ${reason}`);
                }
            }

            for (const containedItem of item.containing) {
                processItemAndReason(containedItem, ` (contained by ${item.name}${extraMessage})`);
            }
        }

        if (!excludeItems) {
            for (const item of locationSlot.items) {
                processItemAndReason(item, "");
            }
            for (const otherCharName in this.deObject.stateFor) {
                if (otherCharName === characterName) continue;
                const otherCharState = this.deObject.stateFor[otherCharName];
                if (otherCharState.location === locationName && otherCharState.locationSlot === locationSlotName) {
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
                if (otherCharState.location === locationName && otherCharState.locationSlot === locationSlotName) {
                    let reason = null;
                    const otherCharacter = this.deObject.characters[otherCharName];
                    if (!otherCharacter) {
                        continue;
                    }
                    if (otherCharacter.weightKg > remainingCarryingCapacity) {
                        reason = `character is too heavy (${otherCharacter.weightKg}kg) for character strength`;
                    } else if (otherCharacter.weightKg > remainingCarryingCapacity) {
                        reason = `the character is already carrying too much weight to lift this character`;

                        // assume the character's volume is equal to their weight in liters
                    } else if (otherCharacter.weightKg > remainingCarryingVolume) {
                        reason = `the character is already carrying too much volume to fit this character`;
                    }
                    if (reason) {
                        itemsCharacterCannotCarryWReasons.push(`${otherCharacter.name}: ${reason}`);
                    }
                }

            }
        }

        return itemsCharacterCannotCarryWReasons;
    }

    /**
     * 
     * @param {string} character 
     */
    async getWorldRulesFor(character) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        if (this.invalidCharacterStates) {
            throw new Error("DEngine has invalid character states, cannot validate world rules");
        }
        const characterState = this.deObject.stateFor[character];
        if (!characterState) {
            throw new Error(`Character state for ${character} not found.`);
        }
        const characterObj = this.deObject.characters[character];
        if (!characterObj) {
            throw new Error(`Character object for ${character} not found.`);
        }
        const charState = this.deObject.stateFor[character];

        const characterName = characterObj.name || "User";
        const characterPronoun = characterObj.gender === "male" ? "he" : characterObj.gender === "female" ? "she" : "they";
        const systemMessageYes = `You are a assistant that validates if ${characterName} is currently breaking any world rules or general rules in an interactive story, ` +
            `you will be questioned on each rule separately, and you will answer with YES or NO, and if the answer is YES, you will explain why briefly.`;

        const systemMessageNo = `You are a assistant that validates if ${characterName} is currently breaking any world rules or general rules in an interactive story, ` +
            `you will be questioned on each rule separately, and you will answer with YES or NO, and if the answer is NO, you will explain why briefly.`;

        const otherRules = this.deObject.worldRules || {};

        const otherRulesProcessed = (await Promise.all(Object.values(otherRules).map(async (rule, index) => {
            // @ts-ignore
            return await rule.execute(this.deObject, characterObj);
        }))).filter((v) => v !== null && v !== undefined && v !== "");

        const ruleBreakMessage = "\nWas this rule broken by " + characterName + "? Answer with YES or NO, if YES, explain why briefly.";

        const basicRules = [
            {
                rule: `RULE: ${characterName} cannot describe other characters's actions or reactions directly, they can only describe their own actions and reactions, other characters must react on their own; minor reactions like flinching or slight movements are allowed but not major actions or decisions.` + ruleBreakMessage,
                ruleExpect: "NO",
            },
            {
                rule: `RULE: ${characterName} cannot invoke characters into the location, they can talk about them but they cannot force their presence, either by saying their name or by description, characters must enter through valid means by themselves.` + ruleBreakMessage,
                ruleExpect: "NO",
            },
            {
                rule: `RULE: ${characterName} cannot bring other characters's thoughts or feelings directly that they are not experiencing, they can only describe their own thoughts and feelings, other characters must express their own thoughts and feelings on their own.` + ruleBreakMessage,
                ruleExpect: "NO",
            },
            {
                rule: `RULE: ${characterName} cannot do time skips or manipulate the timeline, all actions must be immediate, they can't say things like 1 month has passed or similar, 1 hour has passed, 1 minute has passed or use similar expressions; or otherwise describe actions that take hours or more, all actions must be reasonable and immediate.` + ruleBreakMessage,
                ruleExpect: "NO",
            },
            {
                rule: `RULE: ${characterName} cannot describe the outcome of conflicts or fights involving other characters, those characters must decide their own outcomes based on their own reasoning and reactions.` + ruleBreakMessage,
                ruleExpect: "NO",
            },
            {
                rule: `RULE: ${characterName} cannot describe characters joining the conversation by themselves, ${characterName} can try to approach other characters, even aggressively, but the decision to join must be made by those characters.` + ruleBreakMessage,
                ruleExpect: "NO",
            },
            {
                rule: `RULE: If ${characterName} is trying to go somewhere by themselves, they need to end the message saying that they are heading towards that location and not specify anything after that; the message must end there.` + ruleBreakMessage,
                ruleExpect: "NO",
            },
            {
                rule: `RULE: If ${characterName} is trying to go somewhere with another character, they need to end the message saying that they are heading towards that location and not specify anything after that, aggression and force is allowed, but they cannot specify ` +
                    "further to give the characters involved a chance to either fight, follow or stay in place; the message must end before any commitments have been made." + ruleBreakMessage,
                ruleExpect: "NO",
            },
            {
                rule: `RULE: ${characterName} cannot spawn characters out of thin air, all characters must already exist in the location or be introduced through valid means.` + ruleBreakMessage,
                ruleExpect: "NO",
            },
            ...otherRulesProcessed.map(rule => ({
                rule: "RULE: " + (rule.endsWith(".") ? rule + ruleBreakMessage : rule + "." + ruleBreakMessage),
                ruleExpect: "NO",
            })),
        ];
        const nonPickableItems = this.getNonPickableItemsAtSlot(
            charState.location,
            charState.locationSlot,
        ).map(item => item.name);
        const itemsDescribedAtLocation = this.describeItemsAvailableToCharacterForInference(characterName);
        const itemsCharacterCannotCarryWReasons = this.getItemsCharacterCannotCarryWithReasons(characterName, charState.location, charState.locationSlot, false, false);
        const charactersCharacterCannotCarryWReasons = this.getItemsCharacterCannotCarryWithReasons(characterName, charState.location, charState.locationSlot, true, true);
        const specialRules = [
            nonPickableItems ? {
                rule: `RULE: ${characterName} cannot grab or pick up items that are marked as non-pickable in the location, the list of non pickable items are: ` + nonPickableItems.join(", ") + `\n\nIf ${characterName} attempts to pick up any of these items, respond with YES and explain why they cannot pick it up, otherwise respond with NO\n\nHas ${characterName} attempted to pick up any of these items?`,
                ruleExpect: "NO",
            } : null,
            {
                rule: `RULE: ${characterName} cannot spawn, interact or drop items out of thin air, all items must already exist in the location or be acquired through valid means; ensure consistency with:\n` +
                    itemsDescribedAtLocation +
                    `\n\nIf ${characterName} attempts to spawn or drop any items not in this list, respond with YES and explain why they cannot do that, otherwise respond with NO\n\nHas ${characterName} attempted to spawn, drop or interact with any items not in this list or in ways that do not make sense?`,
                ruleExpect: "NO",
            },
            itemsCharacterCannotCarryWReasons.length === 0 ? null : {
                rule: `RULE: if ${characterName} describes sucesffully picking up an item, trying to pick or lift it is allowed but they cannot succesfully pick it up, it cannot be any of the the following:\n` + itemsCharacterCannotCarryWReasons.join("\n-") +
                    `\n\nIf $${characterName} describes sucesffully picking it up any of these items, respond with YES and explain why they cannot pick it up, otherwise respond with NO\n\nHas ${characterName} sucesfully picked up any of these items?`,
                ruleExpect: "NO",
            },
            charactersCharacterCannotCarryWReasons.length === 0 ? null : {
                rule: `RULE: if ${characterName} describes sucesffully picking up another character, trying to pick or lift it is allowed but they cannot succesfully pick them up, it cannot be any of the the following:\n` + charactersCharacterCannotCarryWReasons.join("\n-") +
                    `\n\nIf $${characterName} describes sucesffully picking it up any of these characters, respond with YES and explain why they cannot pick it up, otherwise respond with NO\n\nHas ${characterName} sucesfully picked up any of these characters?`,
                ruleExpect: "NO",
            },
        ].filter(rule => rule !== null);
        // We will do item validation later on on which item was picked up and if they are placing it in a container or wearing it, etc.

        return {
            systemMessageYes,
            systemMessageNo,
            basicRules,
            specialRules,
        };
    }

    /**
     * @param {string} characterName
     * @return {Promise<string[]>}
     */
    async getAISpecificRulesForCharacter(characterName) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        if (this.invalidCharacterStates) {
            throw new Error("DEngine has invalid character states, cannot validate world rules");
        }
        const characterObj = this.deObject.characters[characterName];
        if (!characterObj) {
            throw new Error(`Character object for ${characterName} not found.`);
        }
        const worldRulesInfo = await this.getWorldRulesFor(characterName);
        const simplifiedRules = [
            "When roleplaying as " + characterName + ", you should not describe actions done by other characters, roleplay as " + characterName + " only.",
        ];

        const otherRules = this.deObject.worldRules || {};

        const otherRulesProcessed = (await Promise.all(Object.values(otherRules).map((rule, index) => {
            // @ts-ignore
            return rule.execute(this.deObject, characterObj);
        }))).filter((v) => v !== null && v !== undefined && v !== "");
        simplifiedRules.push(...otherRulesProcessed);

        return simplifiedRules;
    }

    informDEObjectUpdated() {
        this.listeners.forEach(listener => {
            listener(this.deObject)
        });
    }

    /**
     * @param {"info" | "error" | "debug"} level
     * @param {string} message
     */
    informCycleState(level, message) {

    }

    /**
     * @param {string} characterName 
     */
    informCharacterInferenceStart(characterName) {

    }

    /**
     * @param {string} systemMessage
     * @param {string[]} rulesList
     * @param {string} message
     * @returns {Promise<{passed: boolean, reason: string | null}>}
     */
    async runYesNoQuestionInference(systemMessage, rulesList, message) {
        // TODO: implement the actual inference using an AI model
        return { passed: true, reason: null };
    }

    /**
     * @param {string} userMessage 
     * @returns 
     */
    async testWorldRulesForUserMessage(userMessage) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        if (this.invalidCharacterStates) {
            throw new Error("DEngine has invalid character states, cannot validate world rules");
        }
        if (!this.user) {
            throw new Error("DEngine has no user character defined");
        }
        const worldRulesInfo = await this.getWorldRulesFor(this.user.name);
        const message = this.user.name + " said: " + userMessage;

        const NO_RULES = worldRulesInfo.basicRules.filter(rule => rule.ruleExpect === "NO").concat(worldRulesInfo.specialRules.filter(rule => rule.ruleExpect === "NO")).map(rule => rule.rule);
        const YES_RULES = worldRulesInfo.basicRules.filter(rule => rule.ruleExpect === "YES").concat(worldRulesInfo.specialRules.filter(rule => rule.ruleExpect === "YES")).map(rule => rule.rule);
        let currentOutcome = YES_RULES.length ?
            await this.runYesNoQuestionInference(worldRulesInfo.systemMessageYes, YES_RULES, message) :
            { passed: true, reason: null };
        currentOutcome = currentOutcome.passed && NO_RULES.length ?
            await this.runYesNoQuestionInference(worldRulesInfo.systemMessageNo, NO_RULES, message) :
            currentOutcome;

        return currentOutcome;
    }

    /**
     * @param {DECompleteCharacterReference} character
     */
    async determineCharacterHasLeftTheirCurrentConversationGroupAlone(character) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        } else if (this.invalidCharacterStates) {
            throw new Error("DEngine has invalid character states, cannot determine if character has left conversation group alone");
        }
        const characterState = this.deObject.stateFor[character.name];
        if (!characterState) {
            throw new Error(`Character state for ${character.name} not found.`);
        }

        if (!characterState.conversationId) {
            throw new Error(`Character ${character.name} is not in a conversation, cannot determine if they have left the conversation group.`);
        }
        const conversationParticipants = this.deObject.conversations[characterState.conversationId].participants.filter(charName => charName !== character.name);
        if (conversationParticipants.length === 0) {
            throw new Error(`Character ${character.name} is the only participant in the conversation, cannot determine if they have left the conversation group.`);
        }

        const systemMessage = `You are an assistant that determines if ${character.name} has left their current conversation group alone in an interactive story. ` +
            `Leaving the conversation group alone means that ${character.name} has specified he left to somewhere else alone to be alone without anyone else and without joining someone else.\n\n` +
            `If ${character.name} is trying to leave the conversation group but is being followed, forced or accompanied by other characters, that does not count as leaving alone to be alone.\n\n` +
            `Answer with YES if ${character.name} has left the conversation group alone, otherwise answer with NO and no further explanation.`;

        // TODO add the messages to the prompt
        const messageSpecified = "";

        // TODO implement the actual inference using an AI model
        let inferenceText = "";

        return inferenceText.trim().toUpperCase().includes("YES");
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

        const allCharactersAround = characterState.surroundingNonStrangers.concat(characterState.surroundingStrangers);

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
     * @param {boolean} characterIsSolo
     */
    async determineCharacterHasLeftTheirCurrentConversationGroupToJoinAnotherAndWithWhom(character, characterIsSolo) {
        // character is solo wont be really used here because we will use merged into another conversation group
        // to figure that out

        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        } else if (this.invalidCharacterStates) {
            throw new Error("DEngine has invalid character states, cannot determine if character has left conversation group to join another");
        }

        const characterState = this.deObject.stateFor[character.name];
        if (!characterState) {
            throw new Error(`Character state for ${character.name} not found.`);
        }

        const currentConversation = characterState.conversationId ? this.deObject.conversations[characterState.conversationId] : null;
        if (!currentConversation) {
            throw new Error(`Character ${character.name} is not in a conversation, cannot determine if they have left the conversation group.`);
        }

        const participantsThatAreNotCharacter = currentConversation.participants.filter(charName => charName !== character.name);
        if (participantsThatAreNotCharacter.length === 0) {
            throw new Error(`Character ${character.name} is the only participant in the conversation, cannot determine if they have left the conversation group.`);
        }

        // TODO first inference to determine if they have left to join another group, without asking for specifics
        const systemMessage = `You are an assistant that determines if ${character.name} has left or decided to leave their current conversation group to join another group. ` +
            `if ${character.name} has left their current conversation group to join another group, say the name of the group, the people in the group, or solo people, and if ` +
            `anyone from the current conversation group is taken there or asked to go there as well. either asked if they want to go there, willingly of by force\n\n`;

        let groupsList = `The list of groups is as follows:\n\n${character.name}'s own group:\n - ${character.name}: ${this.getShortDescriptionOfCharacter(character.name)}\n`;

        for (const ownGroupParticipant of currentConversation.participants) {
            groupsList += ` - ${ownGroupParticipant}: ${this.getShortDescriptionOfCharacter(ownGroupParticipant)}\n`;
        }

        const allCharactersAround = characterState.surroundingNonStrangers.concat(characterState.surroundingStrangers);
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

        groupsList += `\n\nNow take into account the last message from ${character.name} and if they left the current conversation to join another determine who are the characters that conform the new group that ${character.name} has joined, ` +
            `including any characters from the previous conversation that have been taken along. DO NOT say everyone in case it is everyone, use the specific names; if they have not left to join another group, say "NO, ${character.name} has not left."`;

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
            return { left: true, newGroupMembers: newPeopleOfTheGroup };
        }

        return { left: true, newGroupMembers: newPeopleOfTheGroup };
    }

    /**
     * 
     * @param {DECompleteCharacterReference} characterDoingAction 
     * @param {DECompleteCharacterReference} characterThatWasTaken 
     * @param {string} actionDescription 
     */
    async determineForceUsedForAction(
        characterDoingAction,
        characterThatWasTaken,
        actionDescription,
    ) {
        const systemMessage = `You are an assistant that determines if ${characterDoingAction.name} has used force or aggression to make ${characterThatWasTaken.name} ${actionDescription}\n\n` +
            `Answer with YES if force or aggression was used, otherwise answer with NO and no further explanation.`;

        // TODO add the messages to the prompt
        const messageSpecified = "";

        // TODO second inference to determine which group they have joined and with whom
        let inferenceText = "";

        return inferenceText.trim().toUpperCase().includes("YES");
    }

    /**
     * @param {DECompleteCharacterReference} character
     */
    async determineInteractedCharactersForMessage(character) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        } else if (this.invalidCharacterStates) {
            throw new Error("DEngine has invalid character states, cannot determine interacted characters");
        }
        const systemMessage = `You are an assistant that determines which characters are being interacted within a message by ${character.name} in an interactive story. ` +
            `By interaction we mean any mention of the character by name, description, actions directed towards them, where it warrants a response from the character ` +
            `just mentioning the character behind their back is not enough for interaction unless the message implies that the character is aware of it or might become aware.\n\n` +
            `Pay attention to potential mispellings of the character names, as they might be referred to in different ways.\n\n` +
            `If the character whispers, talks quietly, or only thinks about them without any action or dialogue directed towards them or that they might hear, that does not count as interaction.`;

        const instruction = "Answer with a list of character names being interacted with, separated by commas. In the order you believe they would most likely respond. If no characters are being interacted with, respond with NONE." +
            "The list should be in the format: CharacterName1, CharacterName2, CharacterName3\n\n" +
            "And not include any other text or descriptions. Use the exact character names as defined in the world and not a description or nickname." +
            "The list should be specific to " + character.name + "'s last message and who is likely to notice them based on their surroundings.";

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
        const surroundingStrangers = characterState.surroundingStrangers;
        // these characters are already in the conversation and likely will hear everything
        const conversationParticipants = this.deObject.conversations[characterState.conversationId].participants.filter(charName => charName !== character.name);
        const surroundingNonStrangersNotInConversation = surroundingNonStrangers.filter(charName => !conversationParticipants.includes(charName));

        const strangersLikelyToNotice = [];
        const strangersNotLikelyToNotice = [];
        const nonStrangerLikelyToNotice = [];
        const nonStrangerNotLikelyToNotice = [];

        let description = "";
        for (const stranger of surroundingStrangers) {
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

        if (strangersNotLikelyToNotice.length > 0) {
            description += `The following characters are strangers likely not looking at ${character.name}'s direction:\n\n` +
                strangersNotLikelyToNotice.map(name => `- ${name}: ${this.getShortDescriptionOfCharacter(name)}`).join("\n") + "\n\n";
        }
        if (nonStrangerNotLikelyToNotice.length > 0) {
            description += `The following characters know ${character.name} but are likely not looking at ${character.name}'s direction:\n\n` +
                nonStrangerNotLikelyToNotice.map(name => `- ${name}: ${this.getShortDescriptionOfCharacter(name)}`).join("\n") + "\n\n";
        }
        if (strangersLikelyToNotice.length > 0) {
            description += `The following characters are strangers likely looking at ${character.name}'s direction:\n\n` +
                strangersLikelyToNotice.map(name => `- ${name}: ${this.getShortDescriptionOfCharacter(name)}`).join("\n") + "\n\n";
        }
        if (nonStrangerLikelyToNotice.length > 0) {
            description += `The following characters know ${character.name} and are likely looking at ${character.name}'s direction:\n\n` +
                nonStrangerLikelyToNotice.map(name => `- ${name}: ${this.getShortDescriptionOfCharacter(name)}`).join("\n") + "\n\n";
        }
        if (conversationParticipants.length > 0) {
            description += `The following characters are already in conversation with ${character.name} and likely hear everything:\n\n` +
                conversationParticipants.map(name => `- ${name}: ${this.getShortDescriptionOfCharacter(name)}`).join("\n") + "\n\n";
        }

        const allPotentials = ([
            ...strangersLikelyToNotice,
            ...nonStrangerLikelyToNotice,
            ...strangersNotLikelyToNotice,
            ...nonStrangerNotLikelyToNotice,
            ...conversationParticipants,
        ])
        const allPotentialsLowered = allPotentials.map(name => name.toLowerCase());

        // TODO implement the actual inference using an AI model
        let inferenceText = "";
        // TODO add the messages to the prompt
        const messageSpecified = "";

        /**
         * @type {DEConversationMessage}
         */
        const messageToAdd = {
            sender: character.name,
            content: "Interaction Inference Response:\n\n" + inferenceText,
            duration: { inMinutes: 0, inHours: 0, inDays: 0 },
            id: crypto.randomUUID(),
            isCharacter: false,
            isDebugMessage: true,
            isSystemMessage: true,
            isUser: false,
            isRejectedMessage: false,
            // @ts-ignore
            startTime: { ...this.deObject.currentTime },
            // @ts-ignore
            endTime: { ...this.deObject.currentTime },
            canOnlyBeSeenByCharacter: null,
        };
        // typescript not being able to infer here as usual
        // @ts-ignore
        this.deObject.conversations[characterState.conversationId].messages.push(messageToAdd);
        this.informDEObjectUpdated();

        /**
         * @type {string[]}
         */
        const inferenceResult = [];
        inferenceText.split(",").map(name => name.trim()).forEach(name => {
            const loweredName = name.toLowerCase();
            if (loweredName === "none") {
                return;
            }
            const indexOfIt = allPotentialsLowered.indexOf(loweredName);
            if (indexOfIt !== -1) {
                const toAdd = allPotentials[indexOfIt];
                if (!inferenceResult.includes(toAdd)) {
                    inferenceResult.push(toAdd);
                } else {
                    // duplicate, ignore
                }
            } else {
                // try find the character
                /**
                 * @type {Array<{name: string, index: number}>}
                 */
                const foundCharacters = []
                allPotentialsLowered.forEach((potentialName, indexOfPotentialName) => {
                    const indexWithinSubstring = potentialName.indexOf(loweredName);
                    if (indexWithinSubstring !== -1) {
                        foundCharacters.push({ name: allPotentials[indexOfPotentialName], index: indexWithinSubstring });
                    }
                });
                // sort by index, lowest index first
                foundCharacters.sort((a, b) => a.index - b.index);
                if (foundCharacters.length > 0) {
                    for (const foundCharacter of foundCharacters) {
                        if (!inferenceResult.includes(foundCharacter.name)) {
                            inferenceResult.push(foundCharacter.name);
                        }
                    }
                } else {
                    // not found, ignore, give debug message
                    /**
                     * @type {DEConversationMessage}
                     */
                    const messageToAdd = {
                        sender: character.name,
                        content: `Character "${name}" was mentioned in interaction detection but was not found among potential interacted characters.`,
                        duration: { inMinutes: 0, inHours: 0, inDays: 0 },
                        id: crypto.randomUUID(),
                        isCharacter: false,
                        isDebugMessage: true,
                        isSystemMessage: true,
                        isUser: false,
                        isRejectedMessage: false,
                        // @ts-ignore
                        startTime: { ...this.deObject.currentTime },
                        // @ts-ignore
                        endTime: { ...this.deObject.currentTime },
                        canOnlyBeSeenByCharacter: null,
                    };
                    // typescript not being able to infer here as usual
                    // @ts-ignore
                    this.deObject.conversations[characterState.conversationId].messages.push(messageToAdd);
                    this.informDEObjectUpdated();
                }
            }
        });

        const result = {
            strangersAtDistanceThatReacted: strangersLikelyToNotice.filter(name => inferenceResult.includes(name)),
            nonStrangersAtDistanceThatReacted: nonStrangerLikelyToNotice.filter(name => inferenceResult.includes(name)),
            strangersUpCloseThatReacted: strangersNotLikelyToNotice.filter(name => inferenceResult.includes(name)),
            nonStrangersUpCloseThatReacted: nonStrangerNotLikelyToNotice.filter(name => inferenceResult.includes(name)),
            ordering: inferenceResult,
        };

        /**
         * @type {DEConversationMessage}
         */
        const messageToAdd2 = {
            sender: character.name,
            content: "Interaction Inference Parsed Response:\n\n" + JSON.stringify(result, null, 2),
            duration: { inMinutes: 0, inHours: 0, inDays: 0 },
            id: crypto.randomUUID(),
            isCharacter: false,
            isDebugMessage: true,
            isSystemMessage: true,
            isUser: false,
            isRejectedMessage: false,
            // @ts-ignore
            startTime: { ...this.deObject.currentTime },
            // @ts-ignore
            endTime: { ...this.deObject.currentTime },
            canOnlyBeSeenByCharacter: null,
        };
        // typescript not being able to infer here as usual
        // @ts-ignore
        this.deObject.conversations[characterState.conversationId].messages.push(messageToAdd2);
        this.informDEObjectUpdated();

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
     * @param {DECompleteCharacterReference} character 
     * @returns {Promise<{splitted: boolean, followed: string[], stayed: string[]}>}
     */
    async determineCharacterHasSplitTheGroup(character) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        } else if (this.invalidCharacterStates) {
            throw new Error("DEngine has invalid character states, cannot determine if character has split the conversation group");
        }
        const characterState = this.deObject.stateFor[character.name];
        if (!characterState) {
            throw new Error(`Character state for ${character.name} not found.`);
        }
        if (!characterState.conversationId) {
            throw new Error(`Character ${character.name} is not in a conversation, cannot determine if they have split the conversation group.`);
        }

        // TODO
        // remember user must be somewhere in one of the two groups
        return {
            splitted: false,
            /** @type {string[]} */
            followed: [],
            /** @type {string[]} */
            stayed: [],
        }
    }

    /**
     * @param {DETimeDescription | null} time
     */
    makeTimestamp(time) {
        if (!time) {
            return "Now";
        }
        if (this.deObject?.currentTime.time === time.time) {
            return "Now";
        }
        // We want something like; Monday, June 5th, 2023 at 3:45 PM
        const date = new Date(time.time);
        return date.toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            hour12: true,
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
     * @param {number} depth
     * @param {boolean} limitToOneCycle
     * @return {Promise<Array<{name: string, message: string}>>}
     */
    async getHistoryForCharacterForInference(character, depth, limitToOneCycle) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        } else if (this.invalidCharacterStates) {
            throw new Error("DEngine has invalid character states, cannot get history for character");
        } else if (!this.deObject.stateFor[character.name]) {
            throw new Error(`Character state for ${character.name} not found.`);
        } else if (!this.pseudoConversationSummaryGenerator) {
            throw new Error("Pseudo conversation summary generator not initialized.");
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
         * @type {Array<{name: string, message: string}>}
         */
        const historyMessages = [];

        /**
         * @param {DETimeDescription} fromTime
         */
        const consumeAccumulatedStatesAndLocations = (fromTime) => {
            // because we are looping from newest to oldest, lastConversationStartTime is actually before
            // thisConversationEndTime
            let message = `From ${this.makeTimestamp(fromTime)} to ${this.makeTimestamp(statesAccumulatedFromTime)}, ` + character.name;
            if (statesAccumulated.size > 0) {
                message += ` was in the following states: `;
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
                message += ` was at location: "${statesAccumulatedAtLocation || "unknown location"}".`;
            }

            historyMessages.push({
                name: "Story Master",
                message: message,
            });

            statesAccumulated = new Set();
            statesAccumulatedAtLocation = null;
            statesAccumulatedFromTime = null;
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
                    consumeAccumulatedStatesAndLocations(state.time);

                    if (depth > 0 && historyMessages.length >= depth) {
                        break;
                    }
                }

                // process the conversation messages
                const conversationMessages = currentConversationObject.messages.filter(msg => !msg.isRejectedMessage && !msg.isDebugMessage &&
                    (!msg.canOnlyBeSeenByCharacter || msg.canOnlyBeSeenByCharacter === character.name));

                const conversationLocation = currentConversationObject.location || "an unknown location";
                const conversationStartTime = currentConversationObject.startTime;
                const firstMessageIsStoryMaster = conversationMessages.length > 0 && conversationMessages[0].sender === "Story Master";

                if (currentConversationObject.summary || currentConversationObject.pseudoConversation) {
                    if (!currentConversationObject.summary) {
                        // generate summary, it doesn't exist yet, but we need to have a conversation for what this
                        // character has been through and been doing
                        currentConversationObject.summary = await this.pseudoConversationSummaryGenerator(
                            this.deObject,
                            // @ts-expect-error
                            currentConversationObject.participants.map((v) => this.deObject?.characters[v]),
                            currentConversationObject,
                        );
                    }
                    historyMessages.push({
                        name: "Story Master",
                        message: "At " + this.makeTimestamp(conversationStartTime) + ", " + character.name + " is at " + conversationLocation + " with " +
                            this.deObject.functions.format_and(this.deObject, null, currentConversationObject.participants.filter(p => p !== character.name)) + ".\n\nConversation summary: " + currentConversationObject.summary,
                    });
                    if (depth > 0 && historyMessages.length >= depth || limitToOneCycle) {
                        // we assume the character talked during this pseudo conversation
                        break;
                    }
                } else {
                    for (const message of conversationMessages.reverse()) {
                        historyMessages.push({
                            name: message.sender,
                            message: message.content,
                        });
                        if (depth > 0 && historyMessages.length >= depth || (limitToOneCycle && message.sender === character.name)) {
                            break;
                        }
                    }

                    if (!firstMessageIsStoryMaster) {
                        historyMessages.push({
                            name: "Story Master",
                            message: "The following interaction took place at " + this.makeTimestamp(conversationStartTime) + ", " + character.name + " is at " + conversationLocation + " with " +
                                this.deObject.functions.format_and(this.deObject, null, currentConversationObject.participants.filter(p => p !== character.name)) + ".",
                        });
                        if (depth > 0 && historyMessages.length >= depth || limitToOneCycle) {
                            break;
                        }
                    }
                }

                currentConversationId = state.conversationId;
            } else if (!state.conversationId) {
                currentConversationId = null;
                if (statesAccumulatedAtLocation && statesAccumulatedAtLocation !== state.location) {
                    // location changed, consume accumulated states
                    consumeAccumulatedStatesAndLocations(state.time);
                    if (depth > 0 && historyMessages.length >= depth) {
                        break;
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

        if (depth > 0 && historyMessages.length >= depth) {
            // reverse the messages to be from oldest to newest
            return historyMessages.reverse();
        }

        // consume any remaining accumulated states
        if ((statesAccumulated.size > 0 || statesAccumulatedAtLocation) && lastStateObjectHandled) {
            consumeAccumulatedStatesAndLocations(lastStateObjectHandled.time);
        }

        // reverse the messages to be from oldest to newest
        return historyMessages.reverse();
    }

    /**
     * 
     * @param {string[]} characters 
     */
    _getFrozenBonds(characters) {
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

        const characterState = this.deObject.stateFor[character.name];
        if (!characterState) {
            throw new Error(`Character state for ${character.name} not found.`);
        }

        if (!characterState.conversationId) {
            throw new Error(`Character ${character.name} is not in a conversation, cannot run internal cycle step.`);
        }

        if (this.talkingTurnRequested) {
            // stop recursion user wants to talk
            // in theory characters can talk/react forever without the user talking
            // and just keep talking to each other because user's turn never comes
            // this allows user to interrupt the cycle and take a turn
            this.talkingTurnRequested = false;
            return;
        }

        const alreadyInteractingCharacters = this.deObject.conversations[characterState.conversationId].participants.filter(participant => participant !== character.name);
        const interactedCharacters = await this.determineInteractedCharactersForMessage(character);

        /**
         * @type {Array<{name: string, lastInvoker: string | null, messageWillBeAboutAgreeFollow: boolean, messageWillBeAboutFightFollow: boolean, expectedReasoning: string | null}>}
         */
        let nextOrderOfInteraction = /** @type {Array<{name: string, lastInvoker: string | null, messageWillBeAboutAgreeFollow: boolean, messageWillBeAboutFightFollow: boolean, expectedReasoning: string | null}>} */ (interactedCharacters.ordering.map(name => {
            if (name === character.name) {
                // kinda weird is character talking to themselves?
                return null;
            }
            return ({
                name: name,
                lastInvoker: character.name,

                messageWillBeAboutAgreeFollow: false,
                messageWillBeAboutFightFollow: false,
                // messageWillBeAboutAcceptingJoiners: false,
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
            // messageWillBeAboutAcceptingJoiners: false,
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
                    nextOrderOfInteraction.push({
                        name: alreadyInteractingCharacterName,
                        lastInvoker: null,
                        messageWillBeAboutAgreeFollow: false,
                        messageWillBeAboutFightFollow: false,
                        // messageWillBeAboutAcceptingJoiners: false,
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
                nextOrderOfInteraction.push({
                    name: highestInitiativeCharacter,
                    lastInvoker: null,
                    messageWillBeAboutAgreeFollow: false,
                    messageWillBeAboutFightFollow: false,
                    // messageWillBeAboutAcceptingJoiners: false,
                    expectedReasoning: null,
                });
            }
        }

        let expectedNextLocation = characterState.location;
        let expectedNextLocationSlot = characterState.locationSlot;

        // We need to check characters that are in conversation with these
        if (alreadyInteractingCharacters.length > 0) {
            // left the conversation, these include not wanting to talk to anyone, want to be sitted alone, left alone, etc...
            // for this we would need to quest characters on whether they follow or not in spite of the user
            const hasCharLeftConversationAlone = await this.determineCharacterHasLeftTheirCurrentConversationGroupAlone(character);
            const hasCharMergedIntoAnotherConversationGroup = hasCharLeftConversationAlone ? null :
                await this.determineCharacterHasMergedIntoAnotherConversationGroup(character, alreadyInteractingCharacters.length === 0);
            // left the conversation to join another with someone else, maybe taking someone with them, maybe even the whole group
            // we still need to quest the characters on whether they follow, accept, fight etc...
            // this could be a kidnapping situation after all
            const hasCharLeftConversationToJoinAnotherWithSomeoneElse = hasCharLeftConversationAlone || hasCharMergedIntoAnotherConversationGroup?.merged ? null :
                await this.determineCharacterHasLeftTheirCurrentConversationGroupToJoinAnotherAndWithWhom(character, alreadyInteractingCharacters.length === 0);
            // split the group in two, eg. some follow, some stay
            // this usually happens when characters are kicked out of the conversation and told to go
            // for one reason or another, or when the user says "some follow me, others stay"
            const hasGroupBeenSplittedBy = hasCharLeftConversationAlone || hasCharMergedIntoAnotherConversationGroup?.merged || hasCharLeftConversationToJoinAnotherWithSomeoneElse?.left ?
                null : await this.determineCharacterHasSplitTheGroup(character);

            if (hasCharLeftConversationAlone) {
                nextOrderOfInteraction.forEach(interaction => {
                    interaction.messageWillBeAboutAgreeFollow = true;
                    // @ts-ignore
                    interaction.expectedReasoning = `${character.name} has left the conversation alone, will ${interaction.name} decide follow/stay with ${character.name} or not?`;
                });
                for (const characterName of alreadyInteractingCharacters) {
                    if (!nextOrderOfInteraction.find(interaction => interaction.name === characterName)) {
                        nextOrderOfInteraction.push({
                            name: characterName,
                            lastInvoker: character.name,
                            messageWillBeAboutAgreeFollow: true,
                            messageWillBeAboutFightFollow: false,
                            // messageWillBeAboutAcceptingJoiners: false,
                            expectedReasoning: `${character.name} has left the conversation alone, will ${characterName} decide follow/stay with ${character.name} or not?`,
                        });
                    }
                }
            } else if (hasCharMergedIntoAnotherConversationGroup?.merged) {
                // this one is very simple, everyone just goes along
                // there is no particular reasoning to be made here
                // we just will add them to the new conversation group
                // add people from the group based on, their initiative
                // provided they are not already in the list
                let wasSomeoneAdded = false;
                hasCharMergedIntoAnotherConversationGroup.newGroupMembers.forEach(newGroupMemberName => {
                    if (newGroupMemberName === character.name) return;
                    if (!nextOrderOfInteraction.find(interaction => interaction.name === newGroupMemberName)) {
                        // @ts-ignore
                        const characterReference = this.deObject.characters[newGroupMemberName];
                        if (Math.random() < characterReference.initiative) {
                            wasSomeoneAdded = true;
                            nextOrderOfInteraction.push({
                                name: newGroupMemberName,
                                lastInvoker: null,
                                messageWillBeAboutAgreeFollow: false,
                                messageWillBeAboutFightFollow: false,
                                // messageWillBeAboutAcceptingJoiners: false,
                                expectedReasoning: null,
                            });
                        }
                    }
                });

                if (!wasSomeoneAdded) {
                    // forcefully add the character with the highest initiative from the new group
                    let highestInitiativeCharacter = null;
                    let highestInitiativeValue = -1;
                    hasCharMergedIntoAnotherConversationGroup.newGroupMembers.forEach(newGroupMemberName => {
                        if (newGroupMemberName === character.name) return;
                        if (!nextOrderOfInteraction.find(interaction => interaction.name === newGroupMemberName)) {
                            // @ts-ignore
                            const characterReference = this.deObject.characters[newGroupMemberName];
                            if (characterReference.initiative > highestInitiativeValue) {
                                highestInitiativeValue = characterReference.initiative;
                                highestInitiativeCharacter = newGroupMemberName;
                            }
                        }
                    });
                    if (highestInitiativeCharacter) {
                        nextOrderOfInteraction.push({
                            name: highestInitiativeCharacter,
                            lastInvoker: null,
                            messageWillBeAboutAgreeFollow: false,
                            messageWillBeAboutFightFollow: false,
                            // messageWillBeAboutAcceptingJoiners: false,
                            expectedReasoning: null,
                        });
                    }
                }

                // the new conversation group is formed succesfully, everyone goes along
                // including the user, who must be there
                const newConversationId = crypto.randomUUID();
                this.deObject.conversations[newConversationId] = {
                    id: newConversationId,
                    participants: hasCharMergedIntoAnotherConversationGroup.newGroupMembers,
                    messages: [],
                    duration: { inMinutes: 0, inHours: 0, inDays: 0 },
                    startTime: { ...this.deObject.currentTime },
                    endTime: null,
                    location: expectedNextLocation,
                    summary: null,
                    pseudoConversation: false,
                    previousConversationIdsPerParticipant: {},
                    bondsAtStart: this._getFrozenBonds(hasCharMergedIntoAnotherConversationGroup.newGroupMembers),
                    bondsAtEnd: null,
                };
                hasCharMergedIntoAnotherConversationGroup.newGroupMembers.forEach(memberName => {
                    // @ts-ignore
                    const memberState = this.deObject.stateFor[memberName];
                    memberState.history.push(deepCopyNoHistory(memberState));
                    // @ts-ignore
                    this.deObject.conversations[newConversationId].previousConversationIdsPerParcipant[memberName] = memberState.conversationId;
                    // @ts-expect-error
                    this.deObject.conversations[memberState.conversationId].endTime = { ...this.deObject.currentTime };
                    memberState.conversationId = newConversationId;
                    // TODO update member location, slot, and posture according to the new conversation
                });

                const participantsThatJoinWithUser = this.deObject.conversations[characterState.conversationId].participants;
                const allOthers = hasCharMergedIntoAnotherConversationGroup.newGroupMembers.filter(name => !participantsThatJoinWithUser.includes(name));

                /**
                 * @type {DEConversationMessage}
                 */
                const initialMessage = {
                    sender: "Story Master",
                    content: this.deObject.functions.format_and(this.deObject, character, participantsThatJoinWithUser) + " have approached for a conversation with " + this.deObject.functions.format_and(this.deObject, character, allOthers),
                    duration: { inMinutes: 0, inHours: 0, inDays: 0 },
                    id: crypto.randomUUID(),
                    isCharacter: false,
                    isDebugMessage: false,
                    isSystemMessage: true,
                    isRejectedMessage: false,
                    endTime: { ...this.deObject.currentTime },
                    startTime: { ...this.deObject.currentTime },
                    isUser: false,
                    canOnlyBeSeenByCharacter: null,
                };
                this.deObject.conversations[newConversationId].messages.push(initialMessage);
                this.informDEObjectUpdated();
            } else if (hasCharLeftConversationToJoinAnotherWithSomeoneElse?.left) {
                await Promise.all(nextOrderOfInteraction.map(async interaction => {
                    const isParticipantCurrently = alreadyInteractingCharacters.includes(interaction.name);
                    interaction.messageWillBeAboutFightFollow = isParticipantCurrently &&
                        await this.determineForceUsedForAction(
                            character,
                            // @ts-ignore
                            this.deObject.characters[interaction.name],
                            `join another group`,
                        );
                    interaction.messageWillBeAboutAgreeFollow = !interaction.messageWillBeAboutFightFollow &&
                        !hasCharLeftConversationToJoinAnotherWithSomeoneElse.newGroupMembers.includes(interaction.name) &&
                        isParticipantCurrently;
                    if (interaction.messageWillBeAboutAgreeFollow) {
                        // @ts-ignore
                        interaction.expectedReasoning = `${character.name} is going to join another group with: ${hasCharLeftConversationToJoinAnotherWithSomeoneElse.newGroupMembers.join(", ")}. Will ${interaction.name} decide to follow/stay with ${character.name} or not?`;
                    } else if (interaction.messageWillBeAboutFightFollow) {
                        // @ts-ignore
                        interaction.expectedReasoning = `${character.name} is going to take ${interaction.name} to join with ${hasCharLeftConversationToJoinAnotherWithSomeoneElse.newGroupMembers.join(", ")} by force. Will ${interaction.name} decide to fight back or be compliant?`;
                    }
                }));
                for (const alreadyInteractingCharacterName of alreadyInteractingCharacters) {
                    if (!nextOrderOfInteraction.find(interaction => interaction.name === alreadyInteractingCharacterName)) {
                        if (!hasCharLeftConversationToJoinAnotherWithSomeoneElse.newGroupMembers.includes(alreadyInteractingCharacterName)) {
                            const interactionWillBeAboutFightFollow = await this.determineForceUsedForAction(
                                // @ts-ignore
                                character,
                                // @ts-ignore
                                this.deObject.characters[alreadyInteractingCharacterName],
                                `join another group`,
                            );
                            // @ts-ignore
                            nextOrderOfInteraction.push({
                                name: alreadyInteractingCharacterName,
                                lastInvoker: character.name,
                                messageWillBeAboutAgreeFollow: interactionWillBeAboutFightFollow ? false : true,
                                messageWillBeAboutFightFollow: interactionWillBeAboutFightFollow,
                                expectedReasoning: interactionWillBeAboutFightFollow ?
                                    `${character.name} is going to take ${alreadyInteractingCharacterName} to join with ${hasCharLeftConversationToJoinAnotherWithSomeoneElse.newGroupMembers.join(", ")} by force. Will ${alreadyInteractingCharacterName} decide to fight back or be compliant?` :
                                    `${character.name} is going to join another group with: ${hasCharLeftConversationToJoinAnotherWithSomeoneElse.newGroupMembers.join(", ")}. Will ${alreadyInteractingCharacterName} decide to follow/stay with ${character.name} or not?`,
                            });
                        }
                    }
                }

                // the messageWillBeAboutFightFollow is true must go first
                // followed by messageWillBeAboutAgreeFollow
                nextOrderOfInteraction.sort((a, b) => {
                    // Priority 1: messageWillBeAboutFightFollow
                    if (a.messageWillBeAboutFightFollow && !b.messageWillBeAboutFightFollow) {
                        return -1;
                    } else if (!a.messageWillBeAboutFightFollow && b.messageWillBeAboutFightFollow) {
                        return 1;
                    }
                    // Priority 2: messageWillBeAboutAgreeFollow
                    if (a.messageWillBeAboutAgreeFollow && !b.messageWillBeAboutAgreeFollow) {
                        return -1;
                    } else if (!a.messageWillBeAboutAgreeFollow && b.messageWillBeAboutAgreeFollow) {
                        return 1;
                    }
                    // Keep original order for items without these flags
                    return 0;
                });

                // add people from the group based on, their initiative
                // provided they are not already in the list
                let wasSomeoneAdded = false;
                hasCharLeftConversationToJoinAnotherWithSomeoneElse.newGroupMembers.forEach(newGroupMemberName => {
                    if (newGroupMemberName === character.name) return;
                    if (!nextOrderOfInteraction.find(interaction => interaction.name === newGroupMemberName)) {
                        // @ts-ignore
                        const characterReference = this.deObject.characters[newGroupMemberName];
                        if (Math.random() < characterReference.initiative) {
                            wasSomeoneAdded = true;
                            nextOrderOfInteraction.push({
                                name: newGroupMemberName,
                                lastInvoker: null,
                                messageWillBeAboutAgreeFollow: false,
                                messageWillBeAboutFightFollow: false,
                                // messageWillBeAboutAcceptingJoiners: false,
                                expectedReasoning: null,
                            });
                        }
                    }
                });

                if (!wasSomeoneAdded) {
                    // forcefully add the character with the highest initiative from the new group
                    let highestInitiativeCharacter = null;
                    let highestInitiativeValue = -1;
                    hasCharLeftConversationToJoinAnotherWithSomeoneElse.newGroupMembers.forEach(newGroupMemberName => {
                        if (newGroupMemberName === character.name) return;
                        if (!nextOrderOfInteraction.find(interaction => interaction.name === newGroupMemberName)) {
                            // @ts-ignore
                            const characterReference = this.deObject.characters[newGroupMemberName];
                            if (characterReference.initiative > highestInitiativeValue) {
                                highestInitiativeValue = characterReference.initiative;
                                highestInitiativeCharacter = newGroupMemberName;
                            }
                        }
                    });
                    if (highestInitiativeCharacter) {
                        nextOrderOfInteraction.push({
                            name: highestInitiativeCharacter,
                            lastInvoker: null,
                            messageWillBeAboutAgreeFollow: false,
                            messageWillBeAboutFightFollow: false,
                            // messageWillBeAboutAcceptingJoiners: false,
                            expectedReasoning: null,
                        });
                    }
                }

                // hopefully they will greet the characters as they join the new group
                // and whatnot

                // if they don't get to join the new group, eg. the inference says they succesfully fought back, or
                // they decided not to follow, they will be left behind in the previous conversation; the conversation
                // joining will always be succesful from the character's point of view, but the other characters may
                // decide not to follow or fight back successfully

            } else if (hasGroupBeenSplittedBy?.splitted) {
                await Promise.all(nextOrderOfInteraction.map(async interaction => {
                    const isParticipantCurrently = alreadyInteractingCharacters.includes(interaction.name);
                    const followsTheCharacter = hasGroupBeenSplittedBy.followed.includes(interaction.name);
                    const staysWithRemainingCharacters = hasGroupBeenSplittedBy.stayed.includes(interaction.name);
                }));
            }
        } else {

        }

        // Now we will use initiative to find out characters that may just barge in the conversation
        // TODO do this after location changes and we know which group is left and where they are

        const alreadyInteracted = [character.name];

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
                isSystemMessage: true,
                isRejectedMessage: false,
                canOnlyBeSeenByCharacter: null,
            });

            this.informDEObjectUpdated();
            return;
        }
    }

    /**
     * @param {string} userMessage 
     */
    async executeNextCycle(userMessage) {
        this.prepareNextCycle();

        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        } else if (!this.user) {
            throw new Error("DEngine has no user character defined");
        } else if (this.executingCycle) {
            throw new Error("DEngine is already executing a cycle, cannot execute another one concurrently.");
        } else if (!this.pseudoConversationSummaryGenerator) {
            throw new Error("DEngine has no pseudo conversation summary generator defined, cannot execute cycle.");
        }
        this.executingCycle = true;

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
                isSystemMessage: false,
                isRejectedMessage: false,
                canOnlyBeSeenByCharacter: null,
            }
            if (!userConversationId) {
                // need to make a new conversation
                userConversationId = crypto.randomUUID();
                const userCharacterStateCopy = deepCopyNoHistory(userCharacterState);
                userCharacterState.history.push(userCharacterStateCopy)
                userCharacterState.conversationId = userConversationId;
                userCharacterState.messageId = messageToAdd.id;
                this.deObject.conversations[userConversationId] = {
                    id: userConversationId,
                    previousConversationIdsPerParticipant: {
                        [this.user.name]: null,
                    },
                    startTime: { ...this.deObject.currentTime },
                    messages: [messageToAdd],
                    participants: [this.user.name],
                    duration: { inMinutes: 0, inHours: 0, inDays: 0 },
                    endTime: null,
                    location: userCharacterState.location,
                    pseudoConversation: false,
                    summary: null,
                    bondsAtStart: this._getFrozenBonds([this.user.name]),
                    bondsAtEnd: null,
                };
            } else {
                this.deObject.conversations[userConversationId].messages.push(messageToAdd);
                userCharacterState.messageId = messageToAdd.id;
            }

            /**
             * @param {string} reason 
             */
            const simpleRollbackWithReason = (reason) => {
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
                    content: `Message rejected: ${reason}`,
                    duration: { inMinutes: 0, inHours: 0, inDays: 0 },
                    // @ts-ignore
                    startTime: { ...this.deObject.currentTime },
                    // @ts-ignore
                    endTime: { ...this.deObject.currentTime },
                    id: crypto.randomUUID(),
                    isCharacter: false,
                    isDebugMessage: false,
                    isUser: false,
                    isSystemMessage: true,
                    // make it rejected so that characters don't pick it up when they check conversations
                    isRejectedMessage: true,
                });

                this.informDEObjectUpdated();
            }

            this.informDEObjectUpdated();
            this.informCycleState("info", `Testing message is following the rules`);

            const testResults = await this.testWorldRulesForUserMessage(userMessage);
            if (!testResults.passed) {
                simpleRollbackWithReason(testResults.reason || "Message broke world rules");
                this.informCycleState("info", `The message has been rejected for breaking the rules`);
                return;
            }

            this.informCycleState("info", `World rules passed!`);

            // @ts-expect-error
            await this._runInternalCycleStepRecursive(this.userCharacter, [], 0);


            // 1. Get user message
            // 2. Validate the user message does not break any rules world rules or general rules, esp no forced actions in other characters, validate locations
            //    are real and accessible if trying to go somewhere, if the user tries to go somewhere they cannot continue the story there, they need to end the message
            //    saying that they are heading towards that location, otherwise the message will be rejected; also possible to head towards slots within locations so as long as they
            //    are real and/or change posture within them, this all has to be validated and create this potential new de state in memory but not commit it yet, check also that
            //    if the character cannot say things like they win a fight against someone else, the other character must be capable to react before a conclusion is reached; the user simply
            //    cannot force other characters to do things with the text input, they can say they force them but the character must react and let it happen or not.
            // 3. Check for characters mentioned in the message (either by name or by context) and gather them, use the short description to identify them
            //    3.1. Pick some more by initiative if needed, eg. if already in a conversation or if stranger initiative is high enough; the end list can as well be empty, eg. none is around
            //    or none is interested in interacting, for those that have high stranger rejection, roll to see if they ignore the character or not, just keep it in place
            //    for now, eg. for injecting *character will ignore user and go away* kind of injections
            // 4. Calculate the time change using inference, move characters around but don't commit, try to lock the interacted characters in place, but if they are forced
            //    away by some world event (eg. a workplace and they have to go back home) reject the entire thing saying the character would not be present; if allowed,
            //    keep this potential new state in memory but don't commit, also reroll weather
            // 5. Calculate a location change and see if it is forced or requested for that character, if forced characters have the chance to fight back, if a location change is proposed
            //    it should be kept to check how the characters react to it and if they are taken along or not, either by force or by choice; this is why we cannot allow the user
            //    to just say *they go somewhere with x and then do y*, because the characters need to have the chance to react and not be kidnapped like that; the same is to be true for
            //    characters as they must follow the same rules as user, so also the user (or other character) must agree or be taken by force.
            // 6. State can be committed now, it is valid and the user message is accepted.
            // NOTE a location change request either by force or not, will affect all the characters in the list that were interacted with and defined in the list in step 3
            // characters who came with no bond will be removed nevertheless
            // NOTE a location change is also done for a user will go alone kind of thing, the character has the chance to follow or not
            // NOTE similar things for a slot change, and a posture change that can be requested or forced; they all will cause this effect on the characters interacted with
            // that they need to react to accept it or reject it (accept, reject, fight back if forced, etc.) slot and posture changes however do not stop the response from happening
            // and they are more silent in nature, that is because slot changes and posture changes still mantain the character in the same location, so they can still interact normally
            // As for things like changing slots and posture by self, that is allowed as well, eg. the character can decide to sit down or stand up or lay down on their own, or move to another slot within the same location
            // and needs no approval for that, but it needs to be checked that they actually fit, if our character is too big to fit in a slot, they cannot go there, etc.
            // but when asking characters to change slot or posture, they need to approve it, if they dont fit, they will reject it automatically, even for locations.
            // 7. For each character involved, pick an order based on initiative, and then for each one in order:
            //    7.1 Generate reasoning message for the character, if a location/slot/posture change was requested, make it relevant towards that and ensure it either accepts or rejects it and nothing else, short,
            //        and asks the AI for what would they do next, based on their reasoning message; of course if they have one of these
            //        injection that define specific actions to take, those should be prioritized. As for the reasoning message it should include the items it can interact with, the surrounding
            //        characters, the time, the weather, and the character own state, including emotions, current states, etc. Also world rules are important, maybe in system.
            //        if it was a slot or posture change, they accept it/reject it silently, and keep conversing as normal.
            //    7.2 Generate the actual response messsage for the character, based on the AI response on what to do next. Reinject world rules somehow to avoid breaking them.
            //      7.2.1 If a location change was proposed, check if it was accepted by this specific character.
            //    7.3 Check for even more characters mentioned in the message and gather them, same as step 3
            //    7.4 Hopefully the character didn't break any rules, and since their responses are more immediate, location changes should be enforced as the character said so.
            //    7.5 Now they also do follow the same slot/posture/location change rules as user, and also user has to accept or reject it, follow or not, etc... everyone will get an extra turn in
            //        the cycle, including the user, to answer this.

        } catch (error) {
            // @ts-ignore
            this.informCycleState("error", `Internal Error during cycle execution: ${error.message}`);
            // restore deObject from backup
            this.deObject = deObjectBackup;
            this.informDEObjectUpdated();
        }

        this.executingCycle = false;
    }

    /**
     * 
     * @param {(obj: DEObject) => void} listener 
     */
    addDEObjectUpdatedListener(listener) {
        this.listeners.push(listener);
    }
}

/**
 * 
 * @param {*} obj 
 */
// @ts-ignore
function deepCopy(obj) {
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
function deepCopyNoHistory(obj) {
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