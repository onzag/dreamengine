import { ALL_FUNCTIONS_WITH_SPECIALS } from "../schema/functions.js"
import { weightedRandomByLikelyhood } from "../util/random.js"

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
 * @param {DEMinimalCharacterReference} user
 * @returns {DECompleteCharacterReference}
 */
function createCharacterFromUser(user) {
    return {
        name: user.name,
        autisticResponse: 0,
        gender: user.gender,
        heightCm: user.heightCm,
        weightKg: user.weightKg,
        carryingCapacityLiters: user.carryingCapacityLiters,
        carryingCapacityKg: user.carryingCapacityKg,
        bonds: [],
        shortDescription: user.shortDescription,
        general: {
            id: "?INTERNAL_NOOP_TEMPLATE",
            execute: () => "",
        },
        initiative: 1,
        injectableInGeneralText: {},
        injectableInStateTextAfter: {},
        injectableInStateTextBefore: {},
        properties: {},
        schizophrenia: 0,
        scripts: {
            firstInteract: [],
            postAnyInference: [],
            postInference: [],
            preInference: [],
            preStateCheck: [],
            spawn: [],
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
    }
    /**
     * 
     * @param {*} deObjectJSON 
     */
    initializeFromJSONState(deObjectJSON) {
        if (this.initialized) {
            throw new Error("DEngine already initialized");
        }
        // TODO
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
     * @param {string} startingLocation
     * @param {string} startingLocationSlot
     * @param {"standing" | "sitting" | "laying_down"} startingPosture
     * @param {DETimeDescription} startingTime
     */
    initialize(user, startingLocation, startingLocationSlot, startingPosture, startingTime) {
        this.deObject = {
            user: user,
            world: {
                currentLocation: startingLocation,
                currentLocationSlot: startingLocationSlot,
                locations: [],
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
            // @ts-ignore
            functions: this.allInternalFunctions,
            social: {
                bonds: {},
            },
            scriptSources: [
                {
                    type: "handlebars",
                    id: "?INTERNAL_NOOP_TEMPLATE",
                    source: "",
                },
            ],
        }

        this.user = user;
        this.userCharacter = createCharacterFromUser(user);

        this.addCharacter(this.userCharacter, startingLocation, startingLocationSlot, startingPosture);

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
     * @param {DECompleteCharacterReference} character
     * @param {string} location
     * @param {string} locationSlot
     * @param {"standing" | "sitting" | "laying_down"} posture
     */
    addCharacter(character, location, locationSlot, posture) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        if (this.deObject.characters[character.name]) {
            throw new Error(`Character with name ${character.name} already exists.`);
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
            posture: posture,

            // chars start out empty handed
            carrying: [],

            // chars start up naked
            // hopefully they give them some clothes soon :)
            wearing: [],
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
            const characterLocationObj = this.deObject.world.locations.find(loc => loc.name === characterLocation);
            if (!characterLocationObj) {
                throw new Error(`Character ${charName} is in invalid location ${characterLocation}`);
            }
            const characterLocationSlotObj = characterLocationObj.slots.find(slot => slot.name === characterLocationSlot);
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
     * @param {DEStatefulLocationDefinition} location 
     * @param {DEStatefulLocationDefinition | null} parentLocation
     * @param {boolean} cascade
     */
    rerollLocationWeather(location, parentLocation, cascade = true) {
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
                const newWeatherSystem = weightedRandomByLikelyhood(location.ownWeatherSystem);
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
                    for (const potentialChildLocation of this.deObject.world.locations) {
                        if (potentialChildLocation.parentConnection === location.id) {
                            this.rerollLocationWeather(potentialChildLocation, location, true);
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
        for (const location of this.deObject.world.locations) {
            if (!location.parentConnection) {
                this.rerollLocationWeather(location, null, true);
            }
        }
    }

    /**
     * @param {DELocationDefinition} location 
     */
    addLocation(location) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }

        const parentConnection = location.parentConnection;
        /**
         * @type {DEStatefulLocationDefinition | null}
         */
        let parentLocation = null;
        if (parentConnection) {
            parentLocation = this.deObject.world.locations.find(loc => loc.id === parentConnection) || null;
            if (!parentLocation) {
                throw new Error(`Parent location with id ${parentConnection} not found.`);
            }
        }
        /**
         * @type {DEStatefulLocationDefinition}
         */
        const statefulLocation = {
            ...location,

            // @ts-ignore
            currentWeather: null,
            // @ts-ignore
            currentWeatherFullEffectDescription: null,
            // @ts-ignore
            currentWeatherHasBeenOngoingFor: {
                inMinutes: 0,
                inHours: 0,
                inDays: 0,
            },
            // @ts-ignore
            currentWeatherNoEffectDescription: null,
            // @ts-ignore
            currentWeatherPartialEffectDescription: null,
        };
        this.deObject.world.locations.push(statefulLocation);
        this.rerollLocationWeather(statefulLocation, parentLocation);
    }

    /**
     * This function provides the reasoning message that reasons what
     * should be in the character's mind at the moment and what the
     * AI should base its next response on, all previous conversation history
     * will be in user space
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

        const location = this.deObject.world.locations.find(loc => loc.name === locationName);
        if (!location) {
            throw new Error(`Location ${locationName} not found.`);
        }
        const locationSlot = location.slots.find(slot => slot.name === slotName);
        if (!locationSlot) {
            throw new Error(`Location slot ${slotName} not found in location ${locationName}.`);
        }

        let message = "Items at the location:\n";

        /**
         * @param {string} space 
         * @param {DEItem} item 
         */
        const listItems = (space, item) => {
            message += `${space}- ${item.name}, placement: ${item.placement}\n`;
            if (item.containing.length !== 0) {
                message += `${space}  Containing:\n`;
            }
            for (const containedItem of item.containing) {
                listItems(space + "  ", containedItem);
            }
        }
        if (locationSlot.items.length === 0) {
            message += "No items available at the location.\n";
        } else {
            for (const item of locationSlot.items) {
                listItems("", item);
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
                }
                if (otherCharState.carrying.length === 0 && otherCharState.wearing.length === 0) {
                    message += `No items carried by ${otherCharName}.\n`;
                } else {
                    for (const item of otherCharState.carrying) {
                        listItems("", item);
                    }
                }
            }
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
        let finalDescription = character.shortDescription;
        if (!finalDescription.endsWith(".")) {
            finalDescription += ".";
        }
        if (characterState.wearing.length > 0) {
            finalDescription += " Wearing " + this.deObject.functions.format_and(this.deObject, null, characterState.wearing.map(item => item.descriptionWhenWorn || item.description)) + ".";
        } else {
            finalDescription += " Not wearing any clothes.";
        }

        if (characterState.carrying.length > 0) {
            finalDescription += " Carrying " + this.deObject.functions.format_and(this.deObject, null, characterState.carrying.map(item => item.descriptionWhenCarried || item.description)) + ".";
        } else {
            finalDescription += " Not carrying any items.";
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
        const location = this.deObject.world.locations.find(loc => loc.name === locationName);
        if (!location) {
            throw new Error(`Location ${locationName} not found.`);
        }
        const locationSlot = location.slots.find(slot => slot.name === locationSlotName);
        if (!locationSlot) {
            throw new Error(`Location slot ${locationSlotName} not found in location ${locationName}.`);
        }
        const nonPickableItems = locationSlot.items.filter(item => item.nonPickable);
        return nonPickableItems;
    }

    /**
     * 
     * @param {string} characterName 
     * @param {string} locationName 
     * @param {string} locationSlotName 
     * @returns 
     */
    getItemsCharacterCannotCarryWithReasons(characterName, locationName, locationSlotName) {
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
        const location = this.deObject.world.locations.find(loc => loc.name === locationName);
        if (!location) {
            throw new Error(`Location ${locationName} not found.`);
        }
        const locationSlot = location.slots.find(slot => slot.name === locationSlotName);
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
                remainingCarryingCapacity -= carriedItem.weightKg;
                if (carriedItem.capacityLiters) {
                    addedVolume += carriedItem.capacityLiters;
                }
                takenVolume += carriedItem.volumeLiters;

                // the added and taken volume are irrelevant because
                // these are already inside another container
                processItemList(carriedItem.containing);
            }

            return { takenVolume, addedVolume }
        }
        const { takenVolume, addedVolume } = processItemList(characterState.carrying);
        remainingCarryingVolume -= (takenVolume - addedVolume);
        const volumeClothes = processItemList(characterState.wearing);
        remainingCarryingVolume += volumeClothes.addedVolume; // clothes don't count towards carrying volume, becuase they are worn
        // so we only consider the extra volume they add, not the volume they take

        for (const item of locationSlot.items) {
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
                itemsCharacterCannotCarryWReasons.push(`${item.name}: ${reason}`);
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

        const otherRules = this.deObject.userWorldRules || [];

        const otherRulesProcessed = (await Promise.all(otherRules.map((rule, index) => {
            if (typeof rule === "function") {
                // @ts-ignore
                return rule(this.deObject, character);
            } else {
                // @ts-ignore
                return rule.execute(this.deObject, character);
            }
        }))).filter((v) => v !== null && v !== undefined && v !== "");;

        const basicRules = [
            `${characterName} cannot describe other characters's actions or reactions directly, they can only describe their own actions and reactions, other characters must react on their own; minor reactions like flinching or slight movements are allowed but not major actions or decisions`,
            `${characterName} cannot describe the outcome of conflicts or fights involving other characters, those characters must decide their own outcomes based on their own reasoning and reactions`,
            `${characterName} cannot describe characters joining the conversation by themselves, ${characterName} can try to approach other characters, even aggressively, but the decision to join must be made by those characters`,
            `If ${characterName} is trying to go somewhere by themselves, they need to end the message saying that they are heading towards that location and not specify anything after that; the message must end there`,
            `If ${characterName} is trying to go somewhere with another character, they need to end the message saying that they are heading towards that location and not specify anything after that, aggression and force is allowed, but they cannot specify ` +
            "further to give the characters involved a chance to either fight, follow or stay in place; the message must end before any commitments have been made",
            `${characterName} cannot spawn characters out of thin air, all characters must already exist in the location or be introduced through valid means.`,
            ...otherRulesProcessed,
        ];
        const nonPickableItems = this.getNonPickableItemsAtSlot(
            charState.location,
            charState.locationSlot,
        ).map(item => item.name);
        const itemsDescribedAtLocation = this.describeItemsAvailableToCharacterForInference(characterName);
        const itemsCharacterCannotCarryWReasons = this.getItemsCharacterCannotCarryWithReasons(characterName, charState.location, charState.locationSlot);
        const specialRules = [
            nonPickableItems ? {
                rule: `${characterName} cannot grab or pick up items that are marked as non-pickable in the location, the list of non pickable items are: ` + nonPickableItems.join(", ") + `\n\nIf ${characterName} attempts to pick up any of these items, respond with YES and explain why they cannot pick it up, otherwise respond with NO\n\nHas ${characterName} attempted to pick up any of these items?`,
                ruleExpect: "NO",
            } : null,
            {
                rule: `${characterName} cannot spawn, interact or drop items out of thin air, , all items must already exist in the location or be acquired through valid means; ensure consistency with:\n` +
                itemsDescribedAtLocation +
                `\n\nIf ${characterName} attempts to spawn or drop any items not in this list, respond with YES and explain why they cannot do that, otherwise respond with NO\n\nHas ${characterName} attempted to spawn, drop or interact with any items not in this list?`,
                ruleExpect: "NO",
            },
            {
                rule: `if ${characterName} describes sucesffully picking up an item, it cannot be any of the the following:\n` + itemsCharacterCannotCarryWReasons.join("\n-") +
                `\n\nIf $${characterName} attempts to pick up any of these items, respond with YES and explain why they cannot pick it up, otherwise respond with NO\n\nHas ${characterName} attempted to pick up any of these items?`,
                ruleExpect: "NO",
            },
        ]
        // We will do item validation later on on which item was picked up and if they are placing it in a container or wearing it, etc.

        return {
            systemMessageYes,
            systemMessageNo,
            basicRules,
            specialRules,
        };
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
    }

    /**
     * @param {string} userMessage 
     */
    executeNextCycle(userMessage) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        } else if (this.invalidCharacterStates) {
            throw new Error("DEngine has invalid character states, cannot execute next cycle");
        }
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
    }
}