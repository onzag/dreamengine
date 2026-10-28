import { getSurroundingCharacters, getPowerLevelFromCharacter, getRelationship, getExternalDescriptionOfCharacter } from "./util/character-info.js";
import { generateIntSeedFromString, weightedRandomByLikelihood } from "../util/random.js";
import { getCharacterVolume, getCharacterWeight } from "./util/weight-and-volume.js";
import { emotions } from "./util/emotions.js";
import { DEngine } from "./index.js";
import { getNameIdentificationForOneCharacterTowardsAnother, getNameIdentificationForOneCharacterTowardsAnotherOnlyName } from "./util/messages.js";
import { utilItemCount } from "./util/items.js";
import { getSizeVisibility, getPerceivedItemLabel } from "./util/visibility.js";

// NOTE: DE.characters, DE.bonds, DE.stateFor are all keyed by character id (character.id), not character name.
// DESingleBondDescription.towards is a character id.
// All string arguments that represent a character accept a character id string.

/**
 * @param {string[]} list
 * @returns {string}
 */
function formatAndHelper(list) {
    if (!list || !Array.isArray(list)) return "";
    if (list.length === 0) return "";
    if (list.length === 1) return list[0];
    if (list.length === 2) return `${list[0]} and ${list[1]}`;
    return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
}

/**
 * @param {string[]} list
 * @returns {string}
 */
function formatOrHelper(list) {
    if (!list || !Array.isArray(list)) return "";
    if (list.length === 0) return "";
    if (list.length === 1) return list[0];
    if (list.length === 2) return `${list[0]} or ${list[1]}`;
    return `${list.slice(0, -1).join(', ')}, or ${list[list.length - 1]}`;
}

/**
 * Resolves a character id string or object to the full character reference.
 * @param {DEObject} DE
 * @param {string | DECompleteCharacterReference | null} c  character id string or reference
 * @returns {DECompleteCharacterReference | undefined}
 */
function resolveCharacter(DE, c) {
    if (!c) return undefined;
    return typeof c === "string" ? DE.characters[c] : c;
}

/**
 * @param {{ id: string, name: string }} entity
 * @param {{ type?: "default" | "indefinite" | "definite", capitalize?: boolean, justName?: boolean }} [options]
 */
function formatPlaceName(entity, options) {
    let nameGiven = entity.name;
    if (options?.type === "indefinite") {
        nameGiven = (/^[aeiou]/i.test(nameGiven) ? "an " : "a ") + nameGiven;
    } else if (options?.type === "definite") {
        nameGiven = "the " + nameGiven;
    }
    if (options?.capitalize) {
        nameGiven = nameGiven.charAt(0).toUpperCase() + nameGiven.slice(1);
    }
    return options?.justName ? nameGiven : "<" + entity.id + ":" + nameGiven + ">";
}

/**
 * @param {DEObject} DE
 * @param {Array<DECompleteCharacterReference | string>} charsOrig  character id strings or references
 * @param {string} they
 * @param {string} he
 * @param {string} she
 * @param {string} theySingular
 * @returns {string}
 */
function getPronounHelperLocal(DE, charsOrig, they, he, she, theySingular) {
    // strings are character ids
    const chars = charsOrig.map(c => resolveCharacter(DE, c));

    if (!chars || chars.length === 0) return they;
    if (chars.length > 1) return they;
    const charRef = chars[0];
    if (!charRef) return theySingular;
    const gender = charRef.gender.toLowerCase();
    if (gender === "male") return he;
    if (gender === "female") return she;
    return theySingular;
}

/**
 * @param {string[]} list
 * @returns {string[]}
 */
function removeDuplicatesHelper(list) {
    if (!list || !Array.isArray(list)) return [];
    const seen = new Set();
    return list.filter(item => {
        if (seen.has(item)) {
            return false;
        }
        seen.add(item);
        return true;
    });
}

/**
 * @param {DEObject} DE
 * @param {DECompleteCharacterReference} character
 * @param {string} stateName
 * @returns {Promise<Array<DEStateCauseCausantCharacter | DEStateCauseCausantObject>>}
 */
async function getCausantsHelperLocal(DE, character, stateName) {
    const actualStateName = stateName.trim().toUpperCase().replace(/\s+/g, "_");
    // Keys in stateFor are character ids

    const stateForCharacter = DE.stateFor[character.id];
    if (!stateForCharacter) {
        throw new Error(`Character with id ${character.id} not found in DE.stateFor`);
    }

    let stateEntry = stateForCharacter.states.find(s => s.state === actualStateName);
    if (!stateEntry) {
        const historicState = await DE.database.getFirstHistoricStateWithState(character.id, actualStateName);
        stateEntry = historicState?.states.find(s => s.state === actualStateName);
    }
    if (!stateEntry) return [];
    if (!stateEntry.causes?.length) {
        console.warn(`State ${actualStateName} does not have causants because there are no causes.`);
        return [];
    }

    const causants = stateEntry.causes.map(c => c.causant).filter(c => typeof c !== "undefined");

    return causants || [];
}

/**
 * @param {DEObject} DE
 * @param {DEngine} engine
 * @returns {DEUtils}
 */
export const deEngineUtilsFn = (DE, engine) => ({
    id: {
        characterIdGenerator() {
            DE.counters.characterId++;
            return "character-" + DE.counters.characterId;
        },
        itemIdGenerator(itemName) {
            const normalizedItemName = itemName ? itemName.toLowerCase().replace(/\s+/g, "-") : "item";
            DE.counters.itemId[normalizedItemName] = (DE.counters.itemId[normalizedItemName] || 0) + 1;
            return "item-" + normalizedItemName + "-" + DE.counters.itemId[normalizedItemName];
        },
        locationIdGenerator(locationName) {
            const normalizedLocationName = locationName ? locationName.toLowerCase().replace(/\s+/g, "-") : "location";
            DE.counters.locationId[normalizedLocationName] = (DE.counters.locationId[normalizedLocationName] || 0) + 1;
            return "location-" + normalizedLocationName + "-" + DE.counters.locationId[normalizedLocationName];
        },
    },

    items: {
        canSeeItem(item, inPerspectiveOf) {
            const observer = resolveCharacter(DE, inPerspectiveOf ?? null);
            if (inPerspectiveOf && !observer) throw new Error(`Character ${inPerspectiveOf} not found`);
            return getSizeVisibility(item.volumeLiters, observer || null);
        },
        newItem(definition) {
            const id = DE.utils.id.itemIdGenerator(definition.name);
            return { ...definition, id };
        },
        newClonableItemFactory(definitionFn) {
            return (amount) => {
                if (amount <= 0) {
                    return [];
                }
                const clones = [];
                for (let i = 0; i < amount; i++) {
                    const definition = definitionFn();
                    const newId = DE.utils.id.itemIdGenerator(definition.name);
                    /** @type {DEItem} */
                    const newItem = { ...definition, id: newId, containingCharacters: [], ontopCharacters: [] };
                    clones.push(newItem);
                }
                return clones;
            };
        },
        cloneItem(item, amount) {
            if (amount <= 0) {
                return [];
            }
            const clones = [];
            for (let i = 0; i < amount; i++) {
                const newId = DE.utils.id.itemIdGenerator(item.name);
                /**
                 * @type {DEItem}
                 */
                const newItem = { ...item, id: newId, containing: [], ontop: [], containingCharacters: [], ontopCharacters: [] };
                if (item.containing) {
                    for (const containedItem of item.containing) {
                        const singleClone = DE.utils.items.cloneItem(containedItem, 1)[0];
                        if (singleClone) {
                            newItem.containing.push(singleClone);
                        }
                    }
                }
                if (item.ontop) {
                    for (const ontopItem of item.ontop) {
                        const singleClone = DE.utils.items.cloneItem(ontopItem, 1)[0];
                        if (singleClone) {
                            newItem.ontop.push(singleClone);
                        }
                    }
                }
                clones.push(newItem);
            }
            return clones;
        },
        shallowCloneItem(item, amount) {
            if (amount <= 0) {
                return [];
            }
            const clones = [];
            for (let i = 0; i < amount; i++) {
                const newId = DE.utils.id.itemIdGenerator(item.name);
                /**
                 * @type {DEItem}
                 */
                const newItem = { ...item, id: newId, containing: [], ontop: [], containingCharacters: [], ontopCharacters: [] };
                clones.push(newItem);
            }
            return clones;
        },
    },

    world: {
        defineGlobalInterest(interest) {
            if (DE.interests[interest.id]) {
                console.warn(`Interest with id ${interest.id} already exists, mixing it.`);
                if (!Array.isArray(DE.interests[interest.id].template)) {
                    DE.interests[interest.id].template = [DE.interests[interest.id].template];
                }
                if (Array.isArray(interest.template)) {
                    DE.interests[interest.id].template.push(...interest.template);
                } else {
                    DE.interests[interest.id].template.push(interest.template);
                }
            } else {
                DE.interests[interest.id] = interest;
            }
        },
        newLocation(locationDef, slots, scriptGivenId) {
            const actualScriptGivenId = scriptGivenId || locationDef.script + ":" + locationDef.name;

            /**
             * @param {string | null} withId 
             * @returns 
             */
            const generateStatefulLocation = (withId) => {
                const id = withId || DE.utils.id.locationIdGenerator(locationDef.name);

                /**
                 * @type {Record<string, DELocationSlot>}
                 */
                const slotsObj = {};

                for (const slot of slots()) {
                    const slotId = DE.utils.id.locationIdGenerator(slot.name);
                    slotsObj[slotId] = {
                        ...slot,
                        id: slotId,
                    }
                }

                /**
                 * @type {DEStatefulLocation}
                 */
                const statefulLocation = {
                    ...locationDef,
                    slots: slotsObj,
                    id: id,
                    scriptGivenId: actualScriptGivenId,
                    internalState: {
                        // @ts-ignore
                        currentWeather: null,
                        // @ts-ignore
                        currentWeatherHasBeenOngoingFor: null,
                    }
                };

                return statefulLocation;
            }


            const alreadyExistingLocationId = Object.keys(DE.world.locations).find(key => DE.world.locations[key].scriptGivenId === actualScriptGivenId);
            if (alreadyExistingLocationId) {
                const alreadyExistingLocation = DE.world.locations[alreadyExistingLocationId];
                const statefulLocation = generateStatefulLocation(alreadyExistingLocationId);
                for (const property of Object.keys(statefulLocation)) {
                    if (!["id", "scriptGivenId", "slots", "state", "internalState"].includes(property)) {
                        // @ts-ignore
                        alreadyExistingLocation[property] = statefulLocation[property];
                    }
                }
                for (const slotId of Object.keys(statefulLocation.slots)) {
                    if (!alreadyExistingLocation.slots[slotId]) {
                        alreadyExistingLocation.slots[slotId] = statefulLocation.slots[slotId];
                    } else {
                        for (const property of Object.keys(statefulLocation.slots[slotId])) {
                            if (!["id", "state", "internalState", "items"].includes(property)) {
                                // @ts-ignore
                                alreadyExistingLocation.slots[slotId][property] = statefulLocation.slots[slotId][property];
                            }
                        }
                    }
                }
                return alreadyExistingLocation;
            } else {
                const statefulLocation = generateStatefulLocation(null);
                if (statefulLocation.parent) {
                    const parentLocation = DE.world.locations[statefulLocation.parent];
                    if (!parentLocation) {
                        console.warn(`Parent location ${statefulLocation.parent} not found for location ${statefulLocation.name}`);
                        DE.world.locations[statefulLocation.id] = statefulLocation;
                        return DE.world.locations[statefulLocation.id];
                    }

                    if (!locationDef.ownWeatherSystem) {
                        statefulLocation.internalState.currentWeather = parentLocation.internalState.currentWeather;
                        statefulLocation.internalState.currentWeatherHasBeenOngoingFor = parentLocation.internalState.currentWeatherHasBeenOngoingFor;
                    }
                }

                DE.world.locations[statefulLocation.id] = statefulLocation;
                return statefulLocation;
            }
        },
        newConnection(connectionDef) {
            const id = connectionDef.from + " to " + connectionDef.to;
            const existingConnection = DE.world.connections[id];
            DE.world.connections[id] = connectionDef;
            if (existingConnection && existingConnection.state) {
                DE.world.connections[id].state = existingConnection.state;
            }
            return DE.world.connections[id];
        },
        allWorldCharacters() {
            // Keys in stateFor are character ids
            return Object.keys(DE.stateFor).filter((charId) => !DE.stateFor[charId].deadEnded).map(id => DE.characters[id]);
        },
        allWorldCharactersButUser() {
            return Object.keys(DE.stateFor).filter(id => id !== DE.user && !DE.stateFor[id].deadEnded).map(id => DE.characters[id]);
        },
        currentLocation() {
            return DE.world.currentLocation;
        },
        currentLocationIsInVehicle() {
            return !!DE.world.locations[DE.world.currentLocation]?.vehicleType || false;
        },
        currentLocationIsSafe() {
            return DE.world.locations[DE.world.currentLocation]?.isSafe || false;
        },
        allCharactersAtLocation(locationId) {
            const result = [];
            for (const charId of Object.keys(DE.stateFor)) {
                if (DE.stateFor[charId].location === locationId) {
                    const charRef = DE.characters[charId];
                    if (charRef) result.push(charRef);
                }
            }
            return result;
        },
        locationIsVehicle(locationId) {
            return !!DE.world.locations[locationId]?.vehicleType || false;
        },
        locationIsSafe(locationId) {
            return DE.world.locations[locationId]?.isSafe || false;
        },
    },

    characters: {
        newCharacter(characterDef, scriptGivenId) {
            const actualScriptGivenId = scriptGivenId || characterDef.script + ":" + characterDef.name;
            // Search for an existing character that has the same id
            const existingChar = Object.values(DE.characters).find(c => c.scriptGivenId === actualScriptGivenId);
            if (!existingChar) {
                const id = DE.utils.id.characterIdGenerator();
                const charWithId = { ...characterDef, id, scriptGivenId: actualScriptGivenId };
                DE.characters[id] = charWithId;
                return charWithId;
            }

            DE.characters[existingChar.id] = {
                ...characterDef,
                id: existingChar.id,
                state: existingChar.state,
                scriptGivenId: existingChar.scriptGivenId,
            };

            if (DE.internalState["CHARACTER_OVERRIDES_" + existingChar.scriptGivenId]) {
                Object.assign(DE.characters[existingChar.id], DE.internalState["CHARACTER_OVERRIDES_" + existingChar.scriptGivenId]);
            }
            return DE.characters[existingChar.id];
        },
        defineStateInAllCharacters(stateName, stateDefinition) {
            Object.values(DE.characters).forEach((character) => {
                defineStateInCharacter(DE, character, stateName, stateDefinition);
            });
            return stateDefinition;
        },
        defineStateInCharacter(character, stateName, stateDefinition) {
            const characterRef = resolveCharacter(DE, character);
            if (!characterRef) {
                if (typeof character === "string") {
                    console.warn(`Character with id ${character} not found`);
                } else {
                    console.warn(`Received null as character reference when trying to create state ${stateName}`);
                }
                return null;
            }
            return defineStateInCharacter(DE, characterRef, stateName, stateDefinition);
        },
        defineBond(char1, towards, bondDefinition, options = { forceOverride: false }) {
            const char1Ref = resolveCharacter(DE, char1);
            const towardsRef = resolveCharacter(DE, towards);

            if (!char1Ref) {
                if (typeof char1 === "string") {
                    console.warn(`Character with id ${char1} not found when trying to create bond towards ${towards}`);
                } else {
                    console.warn(`Received null as char1 reference when trying to create bond towards ${towards}`);
                }
                return null;
            }

            if (!towardsRef) {
                if (typeof towards === "string") {
                    console.warn(`Character with id ${towards} not found when trying to create bond from ${char1}`);
                } else {
                    console.warn(`Received null as towards reference when trying to create bond from ${char1}`);
                }
                return null;
            }

            if (!options.forceOverride) {
                // bonds are keyed by character id; DESingleBondDescription.towards is also a character id
                const existingBond = DE.bonds[char1Ref.id].active.find(b => b.towards === towardsRef.id);
                if (existingBond) {
                    return existingBond;
                }
            }
            const newBond = {
                towards: towardsRef.id,
                ...bondDefinition,
            };
            DE.bonds[char1Ref.id].active.push(newBond);
            return newBond;
        },
        defineMutualBond(char1, char2, bondDefinition) {
            const bond1 = DE.utils.characters.defineBond(char1, char2, bondDefinition, { forceOverride: true });
            const bond2 = DE.utils.characters.defineBond(char2, char1, bondDefinition);
            return [bond1, bond2];
        },
        defineFamilyRelation(char1, towards, relation) {
            const character1 = resolveCharacter(DE, char1);
            const towardsRef = resolveCharacter(DE, towards);

            /** @type {DEFamilyTie | null} */
            let familyTie1 = null;
            if (!character1) {
                console.warn(`Character with id ${char1} not found when trying to create family relation towards ${towards}`);
            } else {
                if (typeof towards === "string") {
                    // towards is a character id string
                    character1.familyTies[towards] = { relation };
                    familyTie1 = character1.familyTies[towards];
                } else if (towardsRef) {
                    character1.familyTies[towardsRef.id] = { relation };
                    familyTie1 = character1.familyTies[towardsRef.id];
                } else {
                    console.warn(`Received null as towards reference when trying to create family relation from ${char1}`);
                }
            }

            /** @type {DEFamilyTie | null} */
            let familyTie2 = null;
            if (!towardsRef) {
                console.warn(`Character with id ${towards} not found when trying to create family relation from ${char1}`);
            } else if (character1) {
                /** @type {DEFamilyRelation} */
                let inverseRelation;
                switch (relation) {
                    case "parent":
                        inverseRelation = "child";
                        break;
                    case "child":
                        inverseRelation = "parent";
                        break;
                    case "sibling":
                        inverseRelation = "sibling";
                        break;
                    case "spouse":
                        inverseRelation = "spouse";
                        break;
                    case "cousin":
                        inverseRelation = "cousin";
                        break;
                    case "uncle":
                    case "aunt":
                        inverseRelation = character1.gender === "male" || character1.gender === "ambiguous" ? "nephew" : "niece";
                        break;
                    case "grandparent":
                        inverseRelation = "grandchild";
                        break;
                    case "grandchild":
                        inverseRelation = "grandparent";
                        break;
                    case "niece":
                    case "nephew":
                        inverseRelation = character1.gender === "male" || character1.gender === "ambiguous" ? "uncle" : "aunt";
                        break;
                    case "half sibling":
                        inverseRelation = "half sibling";
                        break;
                    case "step parent":
                        inverseRelation = "step child";
                        break;
                    case "step child":
                        inverseRelation = "step parent";
                        break;
                    case "step sibling":
                        inverseRelation = "step sibling";
                        break;
                    case "step grandparent":
                        inverseRelation = "step grandchild";
                        break;
                    case "step grandchild":
                        inverseRelation = "step grandparent";
                        break;
                    default:
                        inverseRelation = "other";
                }

                towardsRef.familyTies[character1.id] = { relation: inverseRelation };
                familyTie2 = towardsRef.familyTies[character1.id];
            } else {
                console.warn(`Received null as character reference when trying to create family relation towards ${towards}`);
            }

            return [familyTie1, familyTie2];
        },
        newTrigger(character, trigger) {
            const characterRef = resolveCharacter(DE, character);
            if (!characterRef) {
                if (typeof character === "string") {
                    console.warn(`Character with id ${character} not found when trying to create trigger`);
                } else {
                    console.warn(`Received null as character reference when trying to create trigger`);
                }
                return;
            }
            characterRef.triggers.push(trigger);
        },
        newTriggerInAllCharacters(trigger) {
            Object.values(DE.characters).forEach((character) => {
                DE.utils.characters.newTrigger(character, trigger);
            });
        },
        createVoiceFromPreset(presetName) {
            // TODO: Implement voice presets
            return {
                mute: false,
                description: "",
                sounds: [],
                modes: [],
            };
        },
        createVoice(description) {
            const reservedNames = [...emotions, "normal", "none"];
            /** @type {Array<string>} */
            const usedInSounds = [];
            if (description.sounds) {
                for (const sound of description.sounds) {
                    if (!/^[a-z]+$/.test(sound.label)) {
                        throw new Error(`Sound label ${sound.label} is invalid. It must be lowercase letters only.`);
                    }
                    if (reservedNames.includes(sound.label)) {
                        throw new Error(`Sound label ${sound.label} is a reserved name.`);
                    }
                    if (usedInSounds.includes(sound.label)) {
                        throw new Error(`Sound label ${sound.label} is already used by another sound.`);
                    }
                    usedInSounds.push(sound.label);
                }
            }
            /** @type {Array<string>} */
            const usedInModes = [];
            if (description.modes) {
                for (const mode of description.modes) {
                    if (!/^[a-z]+$/.test(mode.label)) {
                        throw new Error(`Mode label ${mode.label} is invalid. It must be lowercase letters only.`);
                    }
                    if (reservedNames.includes(mode.label)) {
                        throw new Error(`Mode label ${mode.label} is a reserved name.`);
                    }
                    if (usedInSounds.includes(mode.label)) {
                        throw new Error(`Mode label ${mode.label} is already used by a sound.`);
                    }
                    if (usedInModes.includes(mode.label)) {
                        throw new Error(`Mode label ${mode.label} is already used by another mode.`);
                    }
                    usedInModes.push(mode.label);
                }
            }
            return description;
        },
    },

    conversations: {
        getConversation: async function (conversationId) {
            return DE.database.getConversation(conversationId);
        },
        getAllConversationsAtLocation: async function (locationId) {
            const allCharactersAtLocation = DE.utils.world.allCharactersAtLocation(locationId);
            const allConversationIds = new Set();
            for (const character of allCharactersAtLocation) {
                const charState = DE.stateFor[character.id];
                if (charState && charState.conversationId) {
                    allConversationIds.add(charState.conversationId);
                }
            }
            const conversations = (await Promise.all(Array.from(allConversationIds).map(id => DE.database.getConversation(id)))).filter(c => c !== null);
            const foundCharacters = allCharactersAtLocation.map(character => character.id);
            const groupedCharacters = new Set(conversations.flatMap(c => [...c.participants, ...c.remoteParticipants]));
            return {
                conversations,
                foundCharacters,
                leftoverCharacters: foundCharacters.filter(id => !groupedCharacters.has(id)),
            };
        },
        async newConversation(conversation, options = {}) {
            const participants = conversation.participants;
            const remoteParticipants = conversation.remoteParticipants;

            if ((!participants || participants.length === 0) && (!options.unsafeMode)) {
                throw new Error("Conversation must have at least one participant");
            }

            const location = conversation.location;

            if (!options.unsafeMode) {
                // participants are character ids
                for (const participant of participants) {
                    if (!DE.characters[participant]) {
                        throw new Error(`Participant ${participant} does not exist in DE.characters`);
                    }
                }

                for (const remoteParticipant of remoteParticipants) {
                    if (!DE.characters[remoteParticipant]) {
                        throw new Error(`Remote participant ${remoteParticipant} does not exist in DE.characters`);
                    }
                }

                const hasUserInvolved = participants.includes(DE.user) || remoteParticipants.includes(DE.user);
                if (hasUserInvolved && conversation.pseudoConversation) {
                    throw new Error("Cannot create a pseudo-conversation with the user involved");
                }

                for (const participant of participants) {
                    if (remoteParticipants.includes(participant)) {
                        throw new Error(`Participant ${participant} cannot be both a participant and a remote participant`);
                    }
                }
            }

            /** @type {Omit<DEConversation, "id">} */
            const newConversation = {
                bondsAtEnd: null,
                bondsAtStart: {},
                participants: participants,
                remoteParticipants: remoteParticipants,
                location: location,
                messages: [],
                pseudoConversation: conversation.pseudoConversation || false,
                previousConversationIdsPerParticipant: {},
                startTime: { ...DE.currentTime },
                endTime: null,
                pseudoConversationSummary: conversation.pseudoConversationSummary,
                metadata: {},
            };

            newConversation.metadata = await engine.callConversationMetadataGenerator(newConversation);

            /**
             * @type {Array<(id: string) => void>}
             */
            const fnsToRunOnceIdIsKnown = [];

            const participantAndRemoteParticipants = [...participants, ...remoteParticipants];

            const conversationsEnded = new Set();

            for (const participantId of participantAndRemoteParticipants) {
                // stateFor is keyed by character id
                const charState = DE.stateFor[participantId];
                const isRemoteParticipant = remoteParticipants.includes(participantId);
                if (!charState && options.unsafeMode) {
                    console.warn(`Participant ${participantId} does not have a state in DE.stateFor`);
                    continue;
                }
                if (charState.deadEnded) {
                    console.warn(`Participant ${participantId} is dead-ended`);
                }

                if (charState.location !== location && !isRemoteParticipant) {
                    if (options.teleportParticipants) {
                        // TODO teleport participants
                    } else if (!options.unsafeMode) {
                        throw new Error(`Participant ${participantId} is not in the specified location ${location}`);
                    }
                }

                const oldConversation = charState.conversationId ? (
                    await DE.utils.conversations.getConversation(charState.conversationId)
                ) : null;

                fnsToRunOnceIdIsKnown.push((addedConversationId) => {
                    charState.conversationId = addedConversationId;
                });
                // bonds are keyed by character id
                newConversation.bondsAtStart[participantId] = {
                    active: DE.bonds[participantId].active.map(b => ({ ...b })),
                    ex: DE.bonds[participantId].ex.map(b => ({ ...b })),
                };
                if (oldConversation) {
                    conversationsEnded.add(oldConversation.id);
                    oldConversation.bondsAtEnd = oldConversation.bondsAtEnd || {};
                    oldConversation.bondsAtEnd[participantId] = newConversation.bondsAtStart[participantId];
                }
                newConversation.previousConversationIdsPerParticipant[participantId] = oldConversation ? oldConversation.id : null;
            }

            for (const endedConversationId of conversationsEnded) {
                const endedConversation = await DE.utils.conversations.getConversation(endedConversationId);
                if (endedConversation && !endedConversation.endTime) {
                    endedConversation.endTime = { ...DE.currentTime };
                    await DE.database.updateConversation(endedConversationId, {
                        endTime: endedConversation.endTime,
                    });
                }

                if (!endedConversation) {
                    console.warn(`Ended conversation with id ${endedConversationId} not found`);
                    continue;
                }

                let participantsLeft = endedConversation.participants.filter(p => !participantAndRemoteParticipants.includes(p));
                let remoteParticipantsLeft = endedConversation.remoteParticipants.filter(p => !participantAndRemoteParticipants.includes(p));

                if (participantsLeft.length !== 0 || remoteParticipantsLeft.length !== 0) {
                    // DE.user is a character id
                    const deUserInRemoteParticipantsLeft = remoteParticipantsLeft.includes(DE.user);
                    if (deUserInRemoteParticipantsLeft) {
                        const newHost = DE.user;
                        remoteParticipantsLeft.splice(remoteParticipantsLeft.indexOf(newHost), 1);
                        for (const p of participantsLeft) {
                            remoteParticipantsLeft.push(p);
                        }
                        participantsLeft = [newHost];
                    }

                    const onlyRemoteParticipantsLeft = participantsLeft.length === 0 && remoteParticipantsLeft.length > 0;
                    if (onlyRemoteParticipantsLeft) {
                        const newHost = remoteParticipantsLeft[Math.floor(Math.random() * remoteParticipantsLeft.length)];
                        participantsLeft.push(newHost);
                        remoteParticipantsLeft.splice(remoteParticipantsLeft.indexOf(newHost), 1);
                    }

                    for (const remoteParticipantId of remoteParticipantsLeft) {
                        const remoteParticipantState = DE.stateFor[remoteParticipantId];
                        if (remoteParticipantState && remoteParticipantState.location === endedConversation.location) {
                            participantsLeft.push(remoteParticipantId);
                            remoteParticipantsLeft.splice(remoteParticipantsLeft.indexOf(remoteParticipantId), 1);
                        }
                    }

                    /** @type {Omit<DEConversation, "id">} */
                    const newConversationForRemainingParticipants = {
                        bondsAtEnd: null,
                        bondsAtStart: {},
                        endTime: null,
                        previousConversationIdsPerParticipant: {},
                        startTime: { ...DE.currentTime },
                        participants: participantsLeft,
                        remoteParticipants: remoteParticipantsLeft,
                        location: endedConversation.location,
                        messages: [],
                        pseudoConversation: participantsLeft.includes(DE.user) ? false : true,
                        metadata: {},
                    };

                    newConversationForRemainingParticipants.metadata = await engine.callConversationMetadataGenerator(newConversationForRemainingParticipants);

                    const actualNewConversationForRemainingParticipants = await DE.database.newConversation(newConversationForRemainingParticipants);

                    if (!actualNewConversationForRemainingParticipants) {
                        throw new Error("Failed to add new conversation for remaining participants to the database");
                    }

                    for (const allParticipantId of [...participantsLeft, ...remoteParticipantsLeft]) {
                        const charState = DE.stateFor[allParticipantId];
                        charState.conversationId = actualNewConversationForRemainingParticipants.id;
                        newConversationForRemainingParticipants.bondsAtStart[allParticipantId] = {
                            active: DE.bonds[allParticipantId].active.map(b => ({ ...b })),
                            ex: DE.bonds[allParticipantId].ex.map(b => ({ ...b })),
                        };
                        newConversationForRemainingParticipants.previousConversationIdsPerParticipant[allParticipantId] = endedConversationId;
                    }

                    engine.triggerConversationMessageUpdate(DE, {
                        event: "new-conversation",
                        conversationId: actualNewConversationForRemainingParticipants.id,
                        obj: actualNewConversationForRemainingParticipants,
                    });
                }
            }

            const addedConversation = await DE.database.newConversation(newConversation);

            if (!addedConversation) {
                throw new Error("Failed to add conversation to the database");
            }

            for (const fn of fnsToRunOnceIdIsKnown) {
                fn(addedConversation.id);
            }

            engine.triggerConversationMessageUpdate(DE, {
                event: "new-conversation",
                conversationId: addedConversation.id,
                obj: addedConversation,
            });
            return addedConversation;
        },
        async addMessage(conversationId, message, options = {}) {
            const conversationObject = await DE.utils.conversations.getConversation(conversationId);
            if (!conversationObject) {
                throw new Error(`Conversation with ID ${conversationId} not found`);
            }

            if (
                (

                    message.characterId &&
                    !conversationObject.participants.includes(message.characterId) &&
                    !(
                        conversationObject.remoteParticipants &&
                        conversationObject.remoteParticipants.includes(message.characterId)
                    ) &&
                    !options.unsafeMode &&
                    !message.isStoryMasterMessage

                )
            ) {
                throw new Error(`Sender ${message.characterId} is not a participant nor a remote participant of conversation ${conversationId}`);
            }

            /** @type {Omit<DEConversationMessage, "id">} */
            const newMessage = {
                ...message,
                startTime: { ...DE.currentTime },
                duration: {
                    inDays: 0,
                    inHours: 0,
                    inMinutes: 0,
                    inSeconds: 0,
                },
                endTime: { ...DE.currentTime },
                untimed: true,
            };

            const addedMessage = await DE.database.newConversationMessage(conversationId, newMessage);

            if (!addedMessage) {
                throw new Error(`Failed to add message to conversation ${conversationId}`);
            }

            engine.triggerConversationMessageUpdate(DE, {
                event: "new-message",
                conversationId: conversationId,
                messageId: addedMessage.id,
                obj: addedMessage,
            });
            return addedMessage;
        },
        async addMessageIntoTargetConversation(target, message, options = {}) {
            // target is a character id
            const targetChar = DE.stateFor[target];
            if (!targetChar) {
                throw new Error(`Target character state not found for target ${target}`);
            }

            // message.sender is a character id
            const senderChar = message.characterId ? DE.stateFor[message.characterId] : null;
            let senderIsGhost = !message.characterId || options.ghost || message.isStoryMasterMessage || false;
            if (!senderChar && !senderIsGhost) {
                if (!options.unsafeMode) {
                    throw new Error(`Sender character state not found for sender ${message.characterId}`);
                }
                senderIsGhost = true;
            }

            /**
             * @type {Record<string, DEConversation>}
             */
            const miniCache = {};

            /**
             * @param {string} conversationId 
             * @returns {Promise<DEConversation>}
             */
            const getConversation = async (conversationId) => {
                if (miniCache[conversationId]) {
                    return miniCache[conversationId];
                }
                const conversation = await DE.utils.conversations.getConversation(conversationId);
                if (!conversation) {
                    throw new Error(`Conversation with ID ${conversationId} not found`);
                }
                miniCache[conversationId] = conversation;
                return conversation;
            };

            const currentConversationIdOfTarget = targetChar.conversationId;

            /** @type {Array<string>} */
            let newParticipants = [];
            /** @type {Array<string>} */
            let newRemoteParticipants = [];
            if (!senderIsGhost && message.characterId) {
                if (options.isolation === "isolate") {
                    newParticipants = Array.from(new Set([target, message.characterId]));
                } else {
                    const currentConversationIdOfSender = senderChar && options.isolation === "merge-groups" ? senderChar.conversationId : null;
                    const participantsOfCurrentConversationOfTarget = currentConversationIdOfTarget ? (await getConversation(currentConversationIdOfTarget)).participants : [];
                    const remoteParticipantsOfCurrentConversationOfTarget = currentConversationIdOfTarget ? (await getConversation(currentConversationIdOfTarget)).remoteParticipants : [];
                    const participantsOfCurrentConversationOfSender = currentConversationIdOfSender ? (await getConversation(currentConversationIdOfSender)).participants : [];
                    const remoteParticipantsOfCurrentConversationOfSender = currentConversationIdOfSender ? (await getConversation(currentConversationIdOfSender)).remoteParticipants : [];
                    newParticipants = Array.from(new Set([target, message.characterId, ...participantsOfCurrentConversationOfTarget, ...participantsOfCurrentConversationOfSender]));
                    newRemoteParticipants = Array.from(new Set([...remoteParticipantsOfCurrentConversationOfTarget, ...remoteParticipantsOfCurrentConversationOfSender]));

                    newRemoteParticipants = newRemoteParticipants.filter(rp => !newParticipants.includes(rp));

                    for (const remoteParticipantId of newRemoteParticipants) {
                        const remoteParticipantState = DE.stateFor[remoteParticipantId];
                        if (remoteParticipantState && remoteParticipantState.location === targetChar.location) {
                            newParticipants.push(remoteParticipantId);
                            newRemoteParticipants.splice(newRemoteParticipants.indexOf(remoteParticipantId), 1);
                        }
                    }
                }
            } else {
                if (options.isolation === "isolate") {
                    newParticipants = [target];
                } else {
                    const participantsOfCurrentConversationOfTarget = currentConversationIdOfTarget ? (await getConversation(currentConversationIdOfTarget)).participants : [];
                    const remoteParticipantsOfCurrentConversationOfTarget = currentConversationIdOfTarget ? (await getConversation(currentConversationIdOfTarget)).remoteParticipants : [];
                    newParticipants = participantsOfCurrentConversationOfTarget;
                    newRemoteParticipants = remoteParticipantsOfCurrentConversationOfTarget;
                }
            }

            const currentConversationOfTarget = currentConversationIdOfTarget ? await getConversation(currentConversationIdOfTarget) : null;
            const currentConversationHasAllParticipantsAndRemoteParticipants = currentConversationOfTarget ?
                newParticipants.every(p => currentConversationOfTarget.participants.includes(p) || currentConversationOfTarget.remoteParticipants.includes(p)) &&
                newRemoteParticipants.every(rp => currentConversationOfTarget.participants.includes(rp) || currentConversationOfTarget.remoteParticipants.includes(rp)) : false;

            const targetConversation = currentConversationHasAllParticipantsAndRemoteParticipants && currentConversationOfTarget ? currentConversationOfTarget : await DE.utils.conversations.newConversation({
                participants: newParticipants,
                remoteParticipants: newRemoteParticipants,
                location: targetChar.location,
                pseudoConversation: newParticipants.includes(DE.user) || newRemoteParticipants.includes(DE.user) ? false : true,
            }, options);

            return DE.utils.conversations.addMessage(targetConversation.id, message, {
                unsafeMode: options.unsafeMode || senderIsGhost || message.isStoryMasterMessage || false,
            });
        },
        async addMessageBroadcast(message, location, travelDistance, travelDistanceType) {
            const locationsToBroadcast = new Set([
                {
                    location: location,
                    distance: 0,
                },
            ]);

            if (travelDistanceType === "connections") {
                // TODO graph traversal by connection count
            } else if (travelDistanceType === "meters") {
                // TODO graph traversal by cumulative connection distance
            }

            const messagesToBroadcast = Array.from(locationsToBroadcast).map(loc => ({
                message: message(loc.distance),
                location: loc.location,
                distance: loc.distance,
            }));

            /** @type {DEConversationMessage[]} */
            const finalConversationeMessages = [];

            messagesToBroadcast.forEach(async m => {
                // Keys in stateFor are character ids
                const allCharactersInLocation = Object.keys(DE.stateFor).filter(charId => DE.stateFor[charId].location === m.location);
                const allRelevantConversationIds = new Set();
                const charactersWithoutConversation = new Set();
                for (const charId of allCharactersInLocation) {
                    const charState = DE.stateFor[charId];
                    if (charState.conversationId) {
                        allRelevantConversationIds.add(charState.conversationId);
                    } else {
                        charactersWithoutConversation.add(charId);
                    }
                }

                for (const conversationId of allRelevantConversationIds) {
                    finalConversationeMessages.push(await DE.utils.conversations.addMessage(conversationId, m.message, { unsafeMode: true }));
                }
                for (const charId of charactersWithoutConversation) {
                    finalConversationeMessages.push(await DE.utils.conversations.addMessageIntoTargetConversation(charId, m.message, { unsafeMode: true, ghost: true, teleportParticipants: false }));
                }
            });

            return finalConversationeMessages;
        },
    },

    characterInfo: {
        canSeeCharacter(char, inPerspectiveOf) {
            const target = resolveCharacter(DE, char);
            const observer = resolveCharacter(DE, inPerspectiveOf ?? null);
            if (!target) throw new Error(`Character ${char} not found`);
            if (inPerspectiveOf && !observer) throw new Error(`Character ${inPerspectiveOf} not found`);
            if (observer?.id === target.id) return "visible";
            return getSizeVisibility(target.weightKg, observer || null);
        },
        canSeeOtherCharacter(char, inPerspectiveOf) {
            return DE.utils.characterInfo.canSeeCharacter(char, inPerspectiveOf);
        },
        getExternalDescriptionOfCharacter(char, inPerspectiveOf, onlyBasics, hideCurrentPosture) {
            return getExternalDescriptionOfCharacter(DE, char.id, inPerspectiveOf.id, onlyBasics, hideCurrentPosture);
        },
        isWithinAttractionGroupFor(opt, char1, char2) {
            const char1Ref = resolveCharacter(DE, char1);
            const char2Ref = resolveCharacter(DE, char2);

            if (!char1Ref || !char2Ref) {
                console.warn(`Character reference not found when checking if within attraction group for ${opt}`);
                return false;
            }

            if (char2Ref.gender !== opt) {
                return false;
            }

            for (const attraction of char1Ref.attractions) {
                if (
                    attraction.towards &&
                    (attraction.towards.includes(opt) || attraction.towards === "any") &&
                    attraction.ageRange && attraction.ageRange[0] <= char2Ref.ageYears && char2Ref.ageYears <= attraction.ageRange[1] &&
                    (!attraction.speciesType || attraction.speciesType === char2Ref.speciesType) &&
                    (!attraction.species || attraction.species.includes(char2Ref.species)) &&
                    (!attraction.group || char2Ref.groupBelonging.includes(attraction.group)) &&
                    (!attraction.sex || attraction.sex.includes(char2Ref.sex))
                ) {
                    return true;
                }
            }
            return false;
        },
        isAloneWith(char1, char2) {
            if (char1 === null || char2 === null) {
                console.warn(`Cannot check if alone with because one of the characters is null`);
                return false;
            }

            const char1Ref = resolveCharacter(DE, char1);
            const char2Ref = resolveCharacter(DE, char2);
            if (!char1Ref || !char2Ref) {
                console.warn(`Character reference not found when checking if alone with`);
                return false;
            }

            // stateFor keyed by character id
            const char1Location = DE.stateFor[char1Ref.id].location;
            const char2Location = DE.stateFor[char2Ref.id].location;

            if (char1Location !== char2Location) {
                return false;
            }

            for (const memberId of Object.keys(DE.stateFor)) {
                if (memberId !== char1Ref.id && memberId !== char2Ref.id) {
                    if (DE.stateFor[memberId].location === char1Location) {
                        return false;
                    }
                }
            }

            return true;
        },
        isInPrivateLocation(char) {
            const charRef = resolveCharacter(DE, char);
            if (!charRef) {
                console.warn(`Character reference not found when checking if in private location`);
                return false;
            }

            const charLocation = DE.stateFor[charRef.id].location;
            const locationRef = DE.world.locations[charLocation];
            if (!locationRef) {
                console.warn(`Location reference for ${charLocation} not found when checking if in private location`);
                return false;
            }

            return locationRef.isPrivate || false;
        },
        isAroundFriendsOrBetter(char1, options) {
            const char1Ref = resolveCharacter(DE, char1);
            if (!char1Ref) {
                console.warn(`Character reference not found when checking if around friends or better`);
                return false;
            }

            if (!char1Ref.bonds) {
                console.warn(`Character ${char1Ref.name} does not have a bond system, cannot check if around friends or better`);
                return false;
            }

            const char1Location = DE.stateFor[char1Ref.id].location;
            // excludes may be character id strings or references
            const excludes = options?.exclude || [];
            const excludesAsAssuredArray = (Array.isArray(excludes) ? excludes : [excludes]).map(e => typeof e === "string" ? e : e.id);

            for (const memberId of Object.keys(DE.stateFor)) {
                if (memberId !== char1Ref.id && !excludesAsAssuredArray.includes(memberId) && (options.excludeFamily ? !char1Ref.familyTies[memberId] : true)) {
                    if (DE.stateFor[memberId].location === char1Location) {
                        const bondTowards = DE.bonds[char1Ref.id].active.find(b => b.towards === memberId);
                        if (!bondTowards) {
                            continue;
                        }
                        const friendsThreshold = char1Ref.bonds.bondGraduation.friend;
                        if (bondTowards.bond >= friendsThreshold) {
                            return true;
                        }
                    }
                }
            }
            return false;
        },
        isAroundFamily(char1, options) {
            const char1Ref = resolveCharacter(DE, char1);
            if (!char1Ref) {
                console.warn(`Character reference not found when checking if around family`);
                return false;
            }

            const char1Location = DE.stateFor[char1Ref.id].location;
            const excludes = options?.exclude || [];
            const excludesAsAssuredArray = (Array.isArray(excludes) ? excludes : [excludes]).map(e => typeof e === "string" ? e : e.id);

            for (const memberId of Object.keys(DE.stateFor)) {
                if (memberId === char1Ref.id || excludesAsAssuredArray.includes(memberId)) {
                    continue;
                }
                if (DE.stateFor[memberId].location === char1Location) {
                    // familyTies keyed by character id
                    const familyTie = char1Ref.familyTies[memberId];
                    if (familyTie) {
                        return true;
                    }
                }
            }
            return false;
        },
        isTopNaked(char) {
            if (!char) return false;

            const charRef = resolveCharacter(DE, char);
            if (!charRef) {
                console.warn(`Character reference not found when checking if top naked`);
                return false;
            }

            const charState = DE.stateFor[charRef.id];
            if (!charState) {
                console.warn(`Character state for ${charRef.name} not found when checking if top naked`);
                return false;
            }

            return !charState.wearing.find((i) => i.wearableProperties?.coversTopNakedness);
        },
        isBottomNaked(char) {
            if (!char) return false;

            const charRef = resolveCharacter(DE, char);
            if (!charRef) {
                console.warn(`Character reference not found when checking if bottom naked`);
                return false;
            }

            const charState = DE.stateFor[charRef.id];
            if (!charState) {
                console.warn(`Character state for ${charRef.name} not found when checking if bottom naked`);
                return false;
            }

            return !charState.wearing.find((i) => i.wearableProperties?.coversBottomNakedness);
        },
        getCarryWeight(char) {
            const charRef = resolveCharacter(DE, char);
            if (!charRef) {
                console.warn(`Character reference for ${char} not found when checking carry weight`);
                return 0;
            }
            return getCharacterWeight(DE, charRef.id).weight;
        },
        getCarryVolume(char) {
            const charRef = resolveCharacter(DE, char);
            if (!charRef) {
                console.warn(`Character reference for ${char} not found when checking carry volume`);
                return 0;
            }
            return getCharacterVolume(DE, charRef.id).volume;
        },
        getPowerLevel(char) {
            const charRef = resolveCharacter(DE, char);
            if (!charRef) {
                console.warn(`Character reference for ${char} not found when checking power level`);
                return 0;
            }
            return getPowerLevelFromCharacter(charRef);
        },
        getTier(char) {
            const charRef = resolveCharacter(DE, char);
            if (!charRef) {
                console.warn(`Character reference for ${char} not found when checking tier`);
                return "insect";
            }
            return charRef.tier;
        },
        getTierValue(char) {
            const charRef = resolveCharacter(DE, char);
            if (!charRef) {
                console.warn(`Character reference for ${char} not found when checking tier value`);
                return 0;
            }
            return charRef.tierValue;
        },
        isDead(char) {
            const charRef = resolveCharacter(DE, char);
            if (!charRef) {
                console.warn(`Character reference for ${char} not found when checking if dead`);
                return false;
            }
            return charRef ? DE.stateFor[charRef.id].dead : false;
        },
        isUser(char) {
            const charRef = resolveCharacter(DE, char);
            if (!charRef) {
                console.warn(`Character reference for ${char} not found when checking if user`);
                return false;
            }
            // DE.user is a character id
            return DE.user === charRef.id;
        },
        isGone(char) {
            const charRef = resolveCharacter(DE, char);
            if (!charRef) {
                console.warn(`Character reference for ${char} not found when checking if gone`);
                return false;
            }
            const exbonds = DE.bonds[charRef.id]?.ex;
            if (!exbonds) return false;
            return exbonds.length > 0;
        },
        isIndoors(char) {
            const charRef = resolveCharacter(DE, char);
            if (!charRef) {
                console.warn(`Character reference for ${char} not found when checking if indoors`);
                return false;
            }
            const locationOfChar = DE.stateFor[charRef.id].location;
            const locationInfo = DE.world.locations[locationOfChar];
            return locationInfo ? locationInfo.isIndoors : false;
        },
        isOutdoors(char) {
            const charRef = resolveCharacter(DE, char);
            if (!charRef) {
                console.warn(`Character reference for ${char} not found when checking if outdoors`);
                return false;
            }
            const locationOfChar = DE.stateFor[charRef.id].location;
            const locationInfo = DE.world.locations[locationOfChar];
            return locationInfo ? !locationInfo.isIndoors : false;
        },
        hasItem(char, itemName) {
            const charRef = resolveCharacter(DE, char);
            if (!charRef) {
                console.warn(`Character reference for ${char} not found when checking if has item ${itemName}`);
                return false;
            }
            return DE.stateFor[charRef.id].carrying.find(item => item.name === itemName) !== undefined;
        },
        getPosture(char) {
            const charRef = resolveCharacter(DE, char);
            if (!charRef) {
                console.warn(`Character reference for ${char} not found when checking posture`);
                return "standing";
            }
            return DE.stateFor[charRef.id].posture;
        },
        async lastSaw(povChar, char) {
            const povRef = resolveCharacter(DE, povChar);
            const charRef = resolveCharacter(DE, char);
            if (!povRef || !charRef) {
                console.warn(`Character reference for ${!povRef ? povChar : char} not found when checking last saw`);
                return "";
            }

            // If char is currently at povChar's location, povChar knows where char is
            if (DE.stateFor[charRef.id].location === DE.stateFor[povRef.id].location) {
                return DE.stateFor[charRef.id].location;
            }

            const currentState = DE.stateFor[povRef.id];
            if (currentState.seenCharacters.some(seen => seen.id === charRef.id)) {
                return currentState.location;
            }
            const historicState = await DE.database.getFirstHistoricStateWithCharacter(povRef.id, charRef.id);
            return historicState?.location ?? "";
        },
        async hasNoIdeaWhereIs(povChar, char) {
            const povRef = resolveCharacter(DE, povChar);
            const charRef = resolveCharacter(DE, char);
            if (!povRef || !charRef) {
                console.warn(`Character reference for ${!povRef ? povChar : char} not found when checking has no idea where is`);
                return false;
            }

            return !(await DE.utils.characterInfo.lastSaw(povRef, charRef));
        },
    },

    bonds: {
        isStrangerTowards(char1, towards) {
            const char1Ref = resolveCharacter(DE, char1);
            const towardsRef = resolveCharacter(DE, towards);
            if (!char1Ref || !towardsRef) {
                console.warn(`Cannot check if ${char1} is stranger towards ${towards} because one of the characters was not found`);
                return true;
            }
            // bonds keyed by char id; DESingleBondDescription.towards is a char id
            const bond = DE.bonds[char1Ref.id].active.find(b => b.towards === towardsRef.id);
            return !bond || bond.stranger;
        },
        isAttractedTo(char1, potentialAttractiveChar2) {
            return DE.utils.bonds.isAttractedToWithReasoning(char1, potentialAttractiveChar2).attracted;
        },
        isAttractedToWithLevel(char1, potentialAttractiveChar2) {
            return DE.utils.bonds.isAttractedToWithReasoning(char1, potentialAttractiveChar2).level;
        },
        isAttractedToWithLevelAsNumber(char1, potentialAttractiveChar2) {
            const attractionResult = DE.utils.bonds.isAttractedToWithReasoning(char1, potentialAttractiveChar2);
            switch (attractionResult.level) {
                case "slight": return 1;
                case "moderate": return 2;
                case "strong": return 3;
                default: return 0;
            }
        },

        isAttractedToWithReasoning(char1, potentialAttractiveChar2) {
            const char1Ref = resolveCharacter(DE, char1);
            const char2Ref = resolveCharacter(DE, potentialAttractiveChar2);
            if (!char1Ref || !char2Ref) {
                return { level: false, attracted: false, reasoning: `Cannot check attraction from ${char1} towards ${potentialAttractiveChar2} because one of the characters was not found` };
            }

            if (char1Ref.attractions.length === 0) {
                return { level: false, attracted: false, reasoning: `Character ${char1Ref.name} is asexual and therefore not attracted to ${char2Ref.name}` };
            }

            if (!char1Ref.bonds) {
                console.warn(`Character ${char1Ref.name} does not have bonds property, cannot check attraction towards ${char2Ref.name}`);
                return { level: false, attracted: false, reasoning: `Character ${char1Ref.name} has no bonds and therefore cannot feel attraction towards ${char2Ref.name}` };
            }

            /** @type {"slight" | "moderate" | "strong" | false} */
            let actuallyFeelsAttractionRegardless = false;
            const defaultAttraction = "moderate";

            // familyTies keyed by character id
            const isFamilyMember = char1Ref.familyTies[char2Ref.id];

            if (isFamilyMember ? !char1Ref.bonds.bond2DoesNotTrackAttractionForFamily : !char1Ref.bonds.bond2DoesNotTrackAttraction) {
                const bond2Value = DE.bonds[char1Ref.id].active.find(b => b.towards === char2Ref.id)?.bond2 || 0;
                if (bond2Value >= char1Ref.bonds.bond2Graduation.slight) {
                    actuallyFeelsAttractionRegardless = "slight";
                }
                if (bond2Value >= char1Ref.bonds.bond2Graduation.moderate) {
                    actuallyFeelsAttractionRegardless = "moderate";
                }
                if (bond2Value >= char1Ref.bonds.bond2Graduation.strong) {
                    actuallyFeelsAttractionRegardless = "strong";
                }
            }

            let level = actuallyFeelsAttractionRegardless || defaultAttraction;
            let char1Attractions = (char1Ref.attractions || []).slice();

            char1Attractions = char1Attractions.filter(a => !a.speciesType || a.speciesType === char2Ref.speciesType);

            if (char1Attractions.length === 0) {
                const explanation = {
                    "humanoid": "humans or humanoid creatures",
                    "animal": "animals",
                    "feral": "feral animalistic creatures of any kind",
                };
                if (actuallyFeelsAttractionRegardless) {
                    return { level, attracted: true, reasoning: `Despite ${char1Ref.name} not being attracted to ${explanation[char2Ref.speciesType] || "unknown reason"}, ${char1Ref.name} still feels ${actuallyFeelsAttractionRegardless} sexual/romantic attraction towards ${char2Ref.name}` };
                }
                return { level: false, attracted: false, reasoning: `${char1Ref.name} is not romantically/sexually attracted to ${char2Ref.name} because ${char1Ref.name} is not attracted to ${explanation[char2Ref.speciesType] || "unknown reason"}` };
            }

            char1Attractions = char1Attractions.filter(a => !a.species || a.species.includes(char2Ref.species));

            if (char1Attractions.length === 0) {
                if (actuallyFeelsAttractionRegardless) {
                    return { level, attracted: true, reasoning: `Despite ${char1Ref.name} not being attracted to ${char2Ref.species} species, ${char1Ref.name} still feels ${actuallyFeelsAttractionRegardless} sexual/romantic attraction towards ${char2Ref.name}` };
                }
                return { level: false, attracted: false, reasoning: `${char1Ref.name} is not romantically/sexually attracted to ${char2Ref.name} because ${char1Ref.name} is not attracted to ${char2Ref.species} species` };
            }

            const oldChar1AttractionsBeforeAgeCheck = char1Attractions;
            char1Attractions = char1Attractions.filter(a => (char2Ref.ageYears >= a.ageRange[0] && char2Ref.ageYears <= a.ageRange[1]));

            if (char1Attractions.length === 0) {
                const isTooOld = char2Ref.ageYears > oldChar1AttractionsBeforeAgeCheck[0].ageRange[1];
                if (actuallyFeelsAttractionRegardless) {
                    const ageReason = isTooOld ? `${char2Ref.name} being too old` : `${char2Ref.name} being too young`;
                    return { level, attracted: true, reasoning: `Despite ${ageReason}, ${char1Ref.name} still feels ${actuallyFeelsAttractionRegardless} sexual/romantic attraction towards ${char2Ref.name}` };
                }
                if (isTooOld) {
                    return { level, attracted: false, reasoning: `${char1Ref.name} is not romantically/sexually attracted to ${char2Ref.name} because ${char2Ref.name} is too old for them` };
                } else {
                    return { level: false, attracted: false, reasoning: `${char1Ref.name} is not romantically/sexually attracted to ${char2Ref.name} because ${char2Ref.name} is too young for them` };
                }
            }

            char1Attractions = char1Attractions.filter(a => !a.towards || a.towards.includes(char2Ref.gender));

            if (char1Attractions.length === 0) {
                if (actuallyFeelsAttractionRegardless) {
                    return { level, attracted: true, reasoning: `Despite ${char1Ref.name} not being attracted to ${char2Ref.name}'s gender being ${char2Ref.gender}, ${char1Ref.name} still feels ${actuallyFeelsAttractionRegardless} sexual/romantic attraction towards ${char2Ref.name}` };
                }
                return { level: false, attracted: false, reasoning: `${char1Ref.name} is not romantically/sexually attracted to ${char2Ref.name} because ${char1Ref.name} is not attracted to ${char2Ref.name} gender being ${char2Ref.gender}` };
            }

            char1Attractions = char1Attractions.filter(a => !a.sex || a.sex.includes(char2Ref.sex));

            if (char1Attractions.length === 0) {
                if (actuallyFeelsAttractionRegardless) {
                    return { level, attracted: true, reasoning: `Despite ${char1Ref.name} not being attracted to ${char2Ref.name}'s biological sex being ${char2Ref.sex}, ${char1Ref.name} still feels ${actuallyFeelsAttractionRegardless} sexual/romantic attraction towards ${char2Ref.name}` };
                }
                return { level: false, attracted: false, reasoning: `${char1Ref.name} is not romantically/sexually attracted to ${char2Ref.name} because ${char1Ref.name} is not attracted to ${char2Ref.name} biological sex being ${char2Ref.sex}` };
            }

            char1Attractions = char1Attractions.filter(a => !a.race || a.race === char2Ref.race);

            if (char1Attractions.length === 0) {
                if (actuallyFeelsAttractionRegardless) {
                    const raceReason = char1Ref.race ? `not being attracted to ${char2Ref.name}'s race being ${char2Ref.race}` : `${char2Ref.name} having no racial identity`;
                    return { level, attracted: true, reasoning: `Despite ${raceReason}, ${char1Ref.name} still feels ${actuallyFeelsAttractionRegardless} sexual/romantic attraction towards ${char2Ref.name}` };
                }
                if (char1Ref.race) {
                    return { level: false, attracted: false, reasoning: `${char1Ref.name} is not romantically/sexually attracted to ${char2Ref.name} because ${char1Ref.name} is not attracted to ${char2Ref.name} race being ${char2Ref.race}` };
                } else {
                    return { level: false, attracted: false, reasoning: `${char1Ref.name} is not romantically/sexually attracted to ${char2Ref.name} because ${char2Ref.name} has no racial identity` };
                }
            }

            const beforeGroupBelongingFilterAttractions = char1Attractions;
            char1Attractions = char1Attractions.filter(a => !a.group || char2Ref.groupBelonging.includes(a.group));

            if (char1Attractions.length === 0) {
                const groupsThatMatter = [...new Set(beforeGroupBelongingFilterAttractions.map(a => a.group))].filter(g => g);
                if (actuallyFeelsAttractionRegardless) {
                    // @ts-ignore
                    const groupReason = groupsThatMatter.length === 1 ? `not belonging to the group of ${groupsThatMatter[0]}` : `not belonging to any of the following required groups: ${formatOrHelper(groupsThatMatter)}`;
                    return { level, attracted: true, reasoning: `Despite ${groupReason}, ${char1Ref.name} still feels ${actuallyFeelsAttractionRegardless} sexual/romantic attraction towards ${char2Ref.name}` };
                }
                if (groupsThatMatter.length === 1) {
                    return { level: false, attracted: false, reasoning: `${char1Ref.name} is not romantically/sexually attracted to ${char2Ref.name} because ${char2Ref.name} does not belong to the group of ${groupsThatMatter[0]}` };
                }
                // @ts-ignore
                return { level: false, attracted: false, reasoning: `${char1Ref.name} is not romantically/sexually attracted to ${char2Ref.name} because ${char2Ref.name} does not belong to any of the following required groups: ${formatOrHelper(groupsThatMatter)}` };
            }

            const minPickiness = Math.min(...char1Attractions.map(a => a.pickiness || 0));
            const tooUnattractive = char2Ref.attractiveness < minPickiness;

            if (tooUnattractive) {
                if (actuallyFeelsAttractionRegardless) {
                    return { level, attracted: true, reasoning: `Despite ${char2Ref.name} not being attractive enough, ${char1Ref.name} still feels ${actuallyFeelsAttractionRegardless} sexual/romantic attraction towards ${char2Ref.name}` };
                }
                return { level: false, attracted: false, reasoning: `${char1Ref.name} is not romantically/sexually attracted to ${char2Ref.name} because they are not attractive enough for them` };
            }

            if (minPickiness > 0.65) {
                const tooUncharismatic = char2Ref.charisma < (minPickiness * 0.75);
                if (tooUncharismatic) {
                    if (actuallyFeelsAttractionRegardless) {
                        return { level, attracted: true, reasoning: `Despite ${char2Ref.name} lacking charisma, ${char1Ref.name} still feels ${actuallyFeelsAttractionRegardless} sexual/romantic attraction towards ${char2Ref.name}` };
                    }
                    return { level: false, attracted: false, reasoning: `${char1Ref.name} is not romantically/sexually attracted to ${char2Ref.name} because ${char2Ref.name} lacks charisma` };
                }
            }

            const specialReason = char1Attractions.find(a => a.specialReason);

            if (actuallyFeelsAttractionRegardless) {
                level = "strong";
            }

            const diffBetweenMinPickinessAndAttractiveness = minPickiness - char2Ref.attractiveness;
            if (diffBetweenMinPickinessAndAttractiveness > 0.35) {
                level = "strong";
            }

            if (specialReason) {
                return { level, attracted: true, reasoning: `${char1Ref.name} is romantically/sexually attracted to ${char2Ref.name} because ${specialReason.specialReason}` };
            }

            return { level, attracted: true, reasoning: `${char1Ref.name} is romantically/sexually attracted to ${char2Ref.name}` };
        },
        doesNotKnow(char, towardsChar) {
            const charRef = resolveCharacter(DE, char);
            const towardsRef = resolveCharacter(DE, towardsChar);
            if (!charRef || !towardsRef) return true;
            const bond = DE.bonds[charRef.id].active.find(b => b.towards === towardsRef.id);
            return !bond;
        },
        isStrangersWith(char, towardsChar) {
            const charRef = resolveCharacter(DE, char);
            const towardsRef = resolveCharacter(DE, towardsChar);
            if (!charRef || !towardsRef) return true;
            const bond = DE.bonds[charRef.id].active.find(b => b.towards === towardsRef.id);
            return !bond || bond.stranger;
        },
        getBondTowards(char, towardsChar) {
            const charRef = resolveCharacter(DE, char);
            const towardsRef = resolveCharacter(DE, towardsChar);
            if (!charRef || !towardsRef) return 0;
            const bond = DE.bonds[charRef.id].active.find(b => b.towards === towardsRef.id);
            return bond ? bond.bond : 0;
        },
        getSecondaryBondTowards(char, towardsChar) {
            const charRef = resolveCharacter(DE, char);
            const towardsRef = resolveCharacter(DE, towardsChar);
            if (!charRef || !towardsRef) return 0;
            const bond = DE.bonds[charRef.id].active.find(b => b.towards === towardsRef.id);
            return bond ? bond.bond2 : 0;
        },
        hasBondBeenShiftedThisCycle(char1, towards) {
            const char1Ref = resolveCharacter(DE, char1);
            const towardsRef = resolveCharacter(DE, towards);
            if (!char1Ref || !towardsRef) {
                console.warn(`Cannot check if bond has been shifted from ${char1} towards ${towards} because one of the characters was not found`);
                return false;
            }
            const alreadyShiftedPrimary = char1Ref.temp["alreadyShiftedBondPrimary_" + towardsRef.id] || 0;
            const alreadyShiftedSecondary = char1Ref.temp["alreadyShiftedBondSecondary_" + towardsRef.id] || 0;
            return alreadyShiftedPrimary !== 0 || alreadyShiftedSecondary !== 0;
        },
        shiftBond(char1, towards, primaryShift, secondaryShift) {
            const char1Ref = resolveCharacter(DE, char1);
            const towardsRef = resolveCharacter(DE, towards);
            if (!char1Ref || !towardsRef) {
                console.warn(`Cannot shift bond from ${char1} towards ${towards} because one of the characters was not found`);
                return;
            }
            if (!char1Ref.bonds) {
                console.warn(`Character ${char1Ref.name} does not have bonds property, cannot shift bond towards ${towardsRef.name}`);
                return;
            }
            let bond = DE.bonds[char1Ref.id].active.find(b => b.towards === towardsRef.id);
            if (!bond) {
                bond = {
                    towards: towardsRef.id,
                    bond: 0,
                    bond2: 0,
                    createdAt: DE.currentTime,
                    knowsAs: [],
                    stranger: true,
                    undoableShifts: {},
                };
                DE.bonds[char1Ref.id].active.push(bond);
            }

            if (bond) {
                const overallShift = primaryShift + secondaryShift;
                const conditionMultiplier = (bond.stranger ? (overallShift < 0 ? char1Ref.bonds.strangerNegativeMultiplier : char1Ref.bonds.strangerPositiveMultiplier) :
                    (overallShift < 0 ? char1Ref.bonds.bondChangeNegativityBias : char1Ref.bonds.bondChangeFineTune));
                let actualPrimaryShift = primaryShift * conditionMultiplier;
                let actualSecondaryShift = secondaryShift * conditionMultiplier;

                const alreadyShiftedPrimary = char1Ref.temp["alreadyShiftedBondPrimary_" + towardsRef.id] || 0;
                if (alreadyShiftedPrimary !== 0) {
                    if ((alreadyShiftedPrimary > 0 && actualPrimaryShift > 0 && actualPrimaryShift <= alreadyShiftedPrimary) ||
                        (alreadyShiftedPrimary < 0 && actualPrimaryShift < 0 && actualPrimaryShift >= alreadyShiftedPrimary)) {
                        actualPrimaryShift = alreadyShiftedPrimary;
                    }
                }

                const alreadyShiftedSecondary = char1Ref.temp["alreadyShiftedBondSecondary_" + towardsRef.id] || 0;
                if (alreadyShiftedSecondary !== 0) {
                    if ((alreadyShiftedSecondary > 0 && actualSecondaryShift > 0 && actualSecondaryShift <= alreadyShiftedSecondary) ||
                        (alreadyShiftedSecondary < 0 && actualSecondaryShift < 0 && actualSecondaryShift >= alreadyShiftedSecondary)) {
                        actualSecondaryShift = alreadyShiftedSecondary;
                    }
                }

                const effectivePrimary = actualPrimaryShift - alreadyShiftedPrimary;
                const effectiveSecondary = actualSecondaryShift - alreadyShiftedSecondary;

                if (effectivePrimary === 0 && effectiveSecondary === 0) {
                    console.log(`Already shifted bond from ${char1Ref.name} towards ${towardsRef.name} by primary=${alreadyShiftedPrimary}, secondary=${alreadyShiftedSecondary}, skipping because new shifts are smaller or equal.`);
                    return;
                }

                bond.bond += effectivePrimary;
                bond.bond2 += effectiveSecondary;

                char1Ref.temp["alreadyShiftedBondPrimary_" + towardsRef.id] = actualPrimaryShift;
                char1Ref.temp["alreadyShiftedBondSecondary_" + towardsRef.id] = actualSecondaryShift;
            }
        },
        rejectIntimacy(char1, towards) {
            const char1Ref = resolveCharacter(DE, char1);
            const towardsRef = resolveCharacter(DE, towards);
            if (!char1Ref || !towardsRef) {
                console.warn(`Cannot reject intimacy from ${char1} towards ${towards} because one of the characters was not found`);
                return;
            }
            char1Ref.temp["rejectIntimacy_" + towardsRef.id] = true;
        },
        async justStartedTalkingToEachOther(char1, char2) {
            if (!char1 || !char2) return false;

            const char1Ref = resolveCharacter(DE, char1);
            const char2Ref = resolveCharacter(DE, char2);
            if (!char1Ref || !char2Ref) return false;

            const char1Conversation = DE.stateFor[char1Ref.id].conversationId;
            const char2Conversation = DE.stateFor[char2Ref.id].conversationId;

            if (char1Conversation !== char2Conversation) return false;
            if (!char1Conversation) return false;

            const conversationToUse = await DE.database.getConversation(char1Conversation);

            if (!conversationToUse) return false;

            if (conversationToUse.previousConversationIdsPerParticipant[char1Ref.id] === conversationToUse.previousConversationIdsPerParticipant[char2Ref.id] &&
                conversationToUse.previousConversationIdsPerParticipant[char1Ref.id]) {
                return false;
            }

            // message.sender is a character id
            return conversationToUse.messages.filter((m) => m.characterId === char1Ref.id || m.characterId === char2Ref.id).length <= 1;
        },
        getSocialGroup(char, minBondLevel, maxBondLevel, min2BondLevel, max2BondLevel) {
            const charRef = resolveCharacter(DE, char);
            if (!charRef) {
                console.warn(`Character reference for ${char} not found when getting social group`);
                return [];
            }
            return DE.bonds[charRef.id].active.filter(bond => {
                return bond.bond >= minBondLevel && bond.bond <= maxBondLevel && bond.bond2 >= min2BondLevel && bond.bond2 <= max2BondLevel;
            }).map(bond => bond.towards);
        },
        getPresentSocialGroup(char, minBondLevel, maxBondLevel, min2BondLevel, max2BondLevel) {
            const charRef = resolveCharacter(DE, char);
            if (!charRef) {
                console.warn(`Character reference for ${char} not found when getting present social group`);
                return [];
            }
            const currentLocation = DE.world.currentLocation;
            const socialGroup = DE.bonds[charRef.id].active.filter(bond => {
                return bond.bond >= minBondLevel && bond.bond <= maxBondLevel && bond.bond2 >= min2BondLevel && bond.bond2 <= max2BondLevel;
            }).map(bond => bond.towards);
            // bond.towards is a character id; stateFor keyed by id
            return socialGroup.filter(memberId => DE.stateFor[memberId].location === currentLocation);
        },
        async getPresentConversingSocialGroup(char, minBondLevel, maxBondLevel, min2BondLevel, max2BondLevel) {
            const charRef = resolveCharacter(DE, char);
            if (!charRef) {
                console.warn(`Character reference for ${char} not found when getting present conversing social group`);
                return [];
            }
            const conversationId = DE.stateFor[charRef.id].conversationId;
            if (!conversationId) return [];
            const conversation = await DE.database.getConversation(conversationId);
            if (!conversation) return [];
            if (minBondLevel === -100 && maxBondLevel === 100 && min2BondLevel === 0 && max2BondLevel === 100) {
                return conversation.participants.filter(memberId => memberId !== charRef.id);
            }
            const socialGroup = DE.bonds[charRef.id].active.filter(bond => {
                return bond.bond >= minBondLevel && bond.bond <= maxBondLevel && bond.bond2 >= min2BondLevel && bond.bond2 <= max2BondLevel;
            }).map(bond => bond.towards);
            return conversation.participants.filter(memberId => socialGroup.includes(memberId));
        },
        getDifferenceOfPresentSocialGroup(char, list) {
            const charRef = resolveCharacter(DE, char);
            if (!charRef) {
                console.warn(`Character reference for ${char} not found when getting difference of present social group`);
                return [];
            }
            const currentLocation = DE.world.currentLocation;
            const socialGroup = DE.bonds[charRef.id].active.map(bond => bond.towards);
            const presentSocialGroup = socialGroup.filter(memberId => DE.stateFor[memberId].location === currentLocation);
            return list.filter(id => !presentSocialGroup.includes(id));
        },
        getExSocialGroup(char, minBondLevel, maxBondLevel, min2BondLevel, max2BondLevel) {
            const charRef = resolveCharacter(DE, char);
            if (!charRef) {
                console.warn(`Character reference for ${char} not found when getting ex social group`);
                return [];
            }
            return DE.bonds[charRef.id].ex.filter(bond => {
                return bond.bond >= minBondLevel && bond.bond <= maxBondLevel && bond.bond2 >= min2BondLevel && bond.bond2 <= max2BondLevel;
            }).map(bond => bond.towards);
        },
    },

    states: {
        charHasState(character, stateName) {
            // accept character id string or reference
            const characterId = typeof character === "string" ? character : character.id;
            const characterState = DE.stateFor[characterId];
            if (!characterState) {
                console.warn(`Character state for ${characterId} not found when checking for state ${stateName}`);
                return false;
            }
            return characterState.states.some(s => s.state === stateName && s.intensity > 0);
        },
        charIsRelievingState(character, stateName) {
            const characterId = typeof character === "string" ? character : character.id;
            const characterState = DE.stateFor[characterId];
            if (!characterState) {
                console.warn(`Character state for ${characterId} not found when checking if relieving state ${stateName}`);
                return false;
            }
            const stateInfo = characterState.states.find(s => s.state === stateName);
            if (!stateInfo) return false;
            return stateInfo.relieving;
        },
        async shiftState(character, stateName, shiftAmount, cap, causes) {
            if (shiftAmount === 0) {
                console.warn(`Shift amount is 0 when trying to shift state ${stateName} on character ${character}, skipping.`);
                return;
            }

            const characterRef = resolveCharacter(DE, character);
            if (!characterRef) {
                if (typeof character === "string") {
                    console.warn(`Character with id ${character} not found when trying to shift state ${stateName}`);
                } else {
                    console.warn(`Received null as character reference when trying to shift state ${stateName}`);
                }
                return;
            } else if (!characterRef.stateDefinitions[stateName]) {
                console.warn(`Character ${characterRef.name} does not have state ${stateName} when trying to shift it by ${shiftAmount}`);
                return;
            }

            const alreadyShiftedInfo = characterRef.temp["alreadyShifted_" + stateName] || 0;
            if (alreadyShiftedInfo !== 0) {
                if ((alreadyShiftedInfo > 0 && shiftAmount > 0)) {
                    if (shiftAmount <= alreadyShiftedInfo) {
                        console.log(`Already shifted state ${stateName} on character ${characterRef.name} by ${alreadyShiftedInfo}, skipping shift by ${shiftAmount} because it's smaller or equal.`);
                        return;
                    }
                } else if (alreadyShiftedInfo < 0 && shiftAmount < 0) {
                    if (shiftAmount >= alreadyShiftedInfo) {
                        console.log(`Already shifted state ${stateName} on character ${characterRef.name} by ${alreadyShiftedInfo}, skipping shift by ${shiftAmount} because it's smaller or equal.`);
                        return;
                    }
                }
            }

            const stateRef = characterRef.stateDefinitions[stateName];
            if (!stateRef) {
                console.warn(`Character ${characterRef.name} does not have state ${stateName}`);
                return;
            }

            // stateFor keyed by character id
            let activeState = DE.stateFor[characterRef.id].states.find(s => s.state === stateName);

            const conflictingActiveStates = DE.stateFor[characterRef.id].states.filter(s => s.intensity > 0 && DE.characters[characterRef.id].stateDefinitions[s.state].conflictStates.includes(stateName));

            if (conflictingActiveStates.length > 0) {
                const defaultDominance = stateRef.dominance;
                const defaultDominanceAfterRelief = stateRef.dominanceAfterRelief || defaultDominance;

                const currentDominance = activeState ? (activeState.relieving ? defaultDominanceAfterRelief : defaultDominance) : -Infinity;
                const conflictingStateMaxDominance = Math.max(...conflictingActiveStates.map(s => {
                    const sRef = DE.characters[characterRef.id].stateDefinitions[s.state];
                    const sDominance = sRef.dominance;
                    const sDominanceAfterRelief = sRef.dominanceAfterRelief || sDominance;
                    return s.relieving ? sDominanceAfterRelief : sDominance;
                }));

                if (currentDominance < conflictingStateMaxDominance) {
                    console.warn(`Cannot shift state ${stateName} on character ${characterRef.name} by ${shiftAmount} because of conflicting active states with higher dominance: ${conflictingActiveStates.map(s => s.state).join(", ")}`);
                    return;
                }
            }

            let hasTriggeredIt = false;
            if (!activeState) {
                if (shiftAmount <= 0) {
                    console.warn(`Character ${characterRef.name} does not have active state ${stateName} to decrease by ${shiftAmount}`);
                    return;
                }

                activeState = {
                    state: stateName,
                    causes: null,
                    intensity: 0,
                    relieving: false,
                    contiguousStartActivationCyclesAgo: 0,
                    contiguousStartActivationTime: { ...DE.currentTime },
                };
                DE.stateFor[characterRef.id].states.push(activeState);
                hasTriggeredIt = true;
            }

            let hasRemovedIt = false;

            const newExpectedIntensity = activeState.intensity + shiftAmount - alreadyShiftedInfo;
            if (cap !== undefined && cap !== null) {
                if (newExpectedIntensity > cap) {
                    shiftAmount = cap - activeState.intensity + alreadyShiftedInfo;
                }
            }

            activeState.intensity += shiftAmount - alreadyShiftedInfo;
            characterRef.temp["alreadyShifted_" + stateName] = shiftAmount;

            if (shiftAmount > 0) {
                if (activeState.causes && causes) {
                    for (const causeToAdd of causes) {
                        const existingSameCause = activeState.causes.find(c => c.causant && c.causant.id === causeToAdd.causant?.id && c.causant?.type === causeToAdd.causant?.type && c.description === causeToAdd.description);
                        if (existingSameCause) {
                            if (existingSameCause.causant && existingSameCause.causant.type === "character") {
                                const apologizableRate = (causeToAdd.causant?.type === "character" && causeToAdd.causant?.apologizable) || 0;
                                if (existingSameCause.causant.apologizable > 0) {
                                    existingSameCause.causant.apologizable /= (4 / (apologizableRate + 1));
                                }
                            }
                        } else {
                            activeState.causes.push(causeToAdd);
                        }
                    }
                } else if (causes) {
                    activeState.causes = causes;
                }
            } else if (causes && activeState.causes) {
                for (const causeToRemove of causes) {
                    activeState.causes = activeState.causes.filter(c => !(c.causant && causeToRemove.causant && c.causant.id === causeToRemove.causant.id && c.causant.type === causeToRemove.causant.type && c.description === causeToRemove.description));
                }
            }

            if (activeState.intensity > 4) {
                activeState.intensity = 4;
            } else if (activeState.intensity <= 0) {
                DE.stateFor[characterRef.id].states = DE.stateFor[characterRef.id].states.filter(s => s.state !== stateName);
                hasRemovedIt = true;
            }

            if (hasTriggeredIt) {
                await onStateTriggeredOnCharacter(DE, characterRef, stateName);
            } else if (hasRemovedIt) {
                await onStateRemovedOnCharacter(DE, characterRef, stateName);
            } else {
                const hasRelievingDynamic = !!stateRef.usesReliefDynamic;
                if (hasRelievingDynamic && shiftAmount < 0 && !activeState.relieving) {
                    activeState.relieving = true;
                    await onStateRelievedOnCharacter(DE, characterRef, stateName);
                }
            }
        },
        addCauseToState(character, stateName, cause) {
            const characterRef = resolveCharacter(DE, character);
            if (!characterRef) {
                if (typeof character === "string") {
                    console.warn(`Character with id ${character} not found when trying to add cause to state ${stateName}`);
                } else {
                    console.warn(`Received null as character reference when trying to add cause to state ${stateName}`);
                }
                return;
            }

            const activeState = DE.stateFor[characterRef.id].states.find(s => s.state === stateName);
            if (!activeState) {
                console.warn(`Character ${characterRef.name} does not have active state ${stateName} when trying to add cause`);
                return;
            }

            if (activeState.causes) {
                const existingSameCause = activeState.causes.find(c => c.causant && c.causant.id === cause.causant?.id && c.causant?.type === cause.causant?.type && c.description === cause.description);
                if (existingSameCause) {
                    if (existingSameCause.causant && existingSameCause.causant.type === "character") {
                        const apologizableRate = (cause.causant?.type === "character" && cause.causant?.apologizable) || 0;
                        if (existingSameCause.causant.apologizable > 0) {
                            existingSameCause.causant.apologizable /= (4 / (apologizableRate + 1));
                        }
                    }
                } else {
                    activeState.causes.push(cause);
                }
            } else {
                activeState.causes = [cause];
            }
        },
        removeCauseFromState(character, stateName, cause) {
            const characterRef = resolveCharacter(DE, character);
            if (!characterRef) {
                if (typeof character === "string") {
                    console.warn(`Character with id ${character} not found when trying to remove cause from state ${stateName}`);
                } else {
                    console.warn(`Received null as character reference when trying to remove cause from state ${stateName}`);
                }
                return;
            }
            const activeState = DE.stateFor[characterRef.id].states.find(s => s.state === stateName);
            if (!activeState) {
                console.warn(`Character ${characterRef.name} does not have active state ${stateName} when trying to remove cause`);
                return;
            }
            if (activeState.causes) {
                activeState.causes = activeState.causes.filter(c => !(c.causant && cause && c.causant.id === cause.causant?.id && c.causant.type === cause.causant?.type && c.description === cause.description));
                if (activeState.causes.length === 0) {
                    activeState.causes = null;
                }
            }
        },
        removeCausantFromState(character, stateName, causant, causantType) {
            const characterRef = resolveCharacter(DE, character);
            if (!characterRef) {
                if (typeof character === "string") {
                    console.warn(`Character with id ${character} not found when trying to remove causant from state ${stateName}`);
                } else {
                    console.warn(`Received null as character reference when trying to remove causant from state ${stateName}`);
                }
                return;
            }
            const activeState = DE.stateFor[characterRef.id].states.find(s => s.state === stateName);
            if (!activeState) {
                console.warn(`Character ${characterRef.name} does not have active state ${stateName} when trying to remove causant`);
                return;
            }
            if (activeState.causes) {
                activeState.causes = activeState.causes.filter(c => !(c.causant && c.causant.id === causant && c.causant.type === causantType));
            }
        },
        async getLastStateCausants(char, stateName) {
            return removeDuplicatesHelper((await getCausantsHelperLocal(DE, char, stateName)).map(c => c.id));
        },
        async getLastStateCharacterCausants(char, stateName) {
            return removeDuplicatesHelper((await getCausantsHelperLocal(DE, char, stateName)).filter(c => c.type === "character").map(c => c.id));
        },
        async getLastStateObjectCausants(char, stateName) {
            return (await getCausantsHelperLocal(DE, char, stateName)).filter(c => c.type === "object").map(c => c.id);
        },
        getStates(char) {
            return DE.stateFor[char.id].states.map(s => s.state);
        },
        getStateIntensity(char, stateName) {
            const stateObject = DE.stateFor[char.id].states.find(s => s.state === stateName);
            return stateObject ? stateObject.intensity : 0;
        },
        hasState(char, stateName) {
            return DE.stateFor[char.id].states.some(s => s.state === stateName);
        },
        stateHasJustActivated(char, stateName) {
            const stateObject = DE.stateFor[char.id].states.find(s => s.state === stateName);
            if (!stateObject) return false;
            return stateObject.contiguousStartActivationCyclesAgo === 0;
        },
        async getStateActivationCyclesAgo(char, stateName) {
            const stateObject = DE.stateFor[char.id].states.find(s => s.state === stateName);
            if (!stateObject) {
                return DE.database.getHistoricStateActivationCyclesAgo(char.id, stateName);
            }
            return stateObject.contiguousStartActivationCyclesAgo;
        },
    },

    triggersAndAccumulators: {
        triggerActionNext(action) {
            DE.internalState.NEXT_ACTIONS = DE.internalState.NEXT_ACTIONS || [];
            DE.internalState.NEXT_ACTIONS.push(action);
        },
        accumulateInCharacter(character, accumulatorName, amount) {
            const characterRef = resolveCharacter(DE, character);
            if (!characterRef) {
                if (typeof character === "string") {
                    console.warn(`Character with id ${character} not found when trying to accumulate ${accumulatorName}`);
                } else {
                    console.warn(`Received null as character reference when trying to accumulate ${accumulatorName}`);
                }
                return 0;
            }
            characterRef.state[accumulatorName] = (characterRef.state[accumulatorName] || 0) + amount;
            return characterRef.state[accumulatorName];
        },
        getAccumulatedValueInCharacter(character, accumulatorName) {
            const characterRef = resolveCharacter(DE, character);
            if (!characterRef) {
                if (typeof character === "string") {
                    console.warn(`Character with id ${character} not found when trying to get accumulated value of ${accumulatorName}`);
                } else {
                    console.warn(`Received null as character reference when trying to get accumulated value of ${accumulatorName}`);
                }
                return 0;
            }
            return characterRef.state[accumulatorName] || 0;
        },
    },

    templates: {
        parseNarration(message) {
            /** @type {Array<DEConversationMessageNarrationFragment>} */
            const fragments = [];
            let lastIndex = 0;

            // Match entity identifiers paired with their readable names.
            // Leave incomplete markers and other angle-bracketed text untouched.
            for (const match of message.matchAll(/<([^<>:\s]+):([^<>]+)>/g)) {
                const identifier = match[1];
                /** @type {DEConversationMessageFragmentIdentifier["foundAs"]} */
                let foundAs = "item";
                if (Object.prototype.hasOwnProperty.call(DE.characters, identifier)) {
                    foundAs = "character";
                } else if (Object.prototype.hasOwnProperty.call(DE.world.locations, identifier)) {
                    foundAs = "location";
                } else if (Object.values(DE.world.locations).some(location => Object.prototype.hasOwnProperty.call(location.slots, identifier))) {
                    foundAs = "location-slot";
                }

                if (match.index > lastIndex) {
                    fragments.push(message.slice(lastIndex, match.index));
                }
                fragments.push({ type: "identifier", identifier, text: match[2], foundAs });
                lastIndex = match.index + match[0].length;
            }
            if (lastIndex < message.length) {
                fragments.push(message.slice(lastIndex));
            }
            return fragments;
        },
        breakDownCharactersAndCausesTemplate(info) {
            return async (info2) => {
                let base = typeof info.base === "string" ? info.base : info.base({
                    char: info2.char,
                });

                if (info2.causes) {
                    /** @type {string[]} */
                    const causants = [];
                    /** @type {Record<string, string[]>} */
                    const causesPerCausant = {};
                    info2.causes.forEach(cause => {
                        if (cause.causant) {
                            // cause.causant.name stores the causant identifier (character id in the new system)
                            if (!causesPerCausant[cause.causant.id]) {
                                causesPerCausant[cause.causant.id] = [];
                            }
                            causesPerCausant[cause.causant.id].push(cause.description);
                            if (!causants.includes(cause.causant.id)) {
                                causants.push(cause.causant.id);
                            }
                        }
                    });

                    for (let i = 0; i < causants.length; i++) {
                        const causantId = causants[i];
                        // DE.characters keyed by character id
                        const other = DE.characters[causantId];
                        if (!other) continue;
                        const otherFamilyRelationship = info2.char.familyTies[causantId];
                        const otherRelationship = await getRelationship(DE, info2.char, other);
                        const descriptionForThatCausant = typeof info.perOther === "string" ? info.perOther : await info.perOther({
                            char: info2.char,
                            other: other,
                            otherFamilyRelation: otherFamilyRelationship?.relation,
                            otherRelationship: otherRelationship,
                        });
                        if (base) {
                            base += "\n\n";
                        }
                        base += descriptionForThatCausant;

                        if (causesPerCausant[causantId].length > 1) {
                            base += `. Reasons: ${info2.char.name} `;
                            base += formatAndHelper(causesPerCausant[causantId]);
                            base += `, by ${other.name}`;
                        }
                    }
                }

                if (info2.causes) {
                    /** @type {string[]} */
                    const causants = [];
                    /** @type {Record<string, string[]>} */
                    const causesPerCausant = {};
                    info2.causes.forEach(cause => {
                        if (cause.causant && cause.causant.type === "object") {
                            if (!causesPerCausant[cause.causant.name]) {
                                causesPerCausant[cause.causant.name] = [];
                            }
                            causesPerCausant[cause.causant.name].push(cause.description);
                            if (!causants.includes(cause.causant.name)) {
                                causants.push(cause.causant.name);
                            }
                        }
                    });

                    for (let i = 0; i < causants.length; i++) {
                        const causant = causants[i];
                        const descriptionForThatCausant = typeof info.perObject === "string" ? info.perObject : await info.perObject({
                            char: info2.char,
                            item: causant,
                        });
                        if (base) {
                            base += "\n\n";
                        }
                        base += descriptionForThatCausant;

                        if (causesPerCausant[causant].length > 1) {
                            base += `. Reasons: ${info2.char.name} `;
                            base += formatAndHelper(causesPerCausant[causant]);
                            base += `, by/with the object: ${causant}`;
                        }
                    }
                }

                return base;
            };
        },
        formatAnd(list) {
            return formatAndHelper(list);
        },
        formatCommaList(list) {
            if (!list || !Array.isArray(list)) return "";
            return list.join(', ');
        },
        formatOr(list) {
            return formatOrHelper(list);
        },
        formatVerbToBe(chars) {
            return getPronounHelperLocal(DE, chars, "are", "is", "is", "is");
        },
        formatPluralOrSingular(chars, plural, singular) {
            if (chars.length === 1) return singular;
            return plural;
        },
        formatObjectPronoun(chars) {
            return getPronounHelperLocal(DE, chars, "them", "him", "her", "them");
        },
        formatPossessive(chars) {
            return getPronounHelperLocal(DE, chars, "their", "his", "her", "their");
        },
        formatReflexive(chars) {
            return getPronounHelperLocal(DE, chars, "themselves", "himself", "herself", "themself");
        },
        formatPronoun(chars) {
            return getPronounHelperLocal(DE, chars, "they", "he", "she", "they");
        },
        formatOwnershipPronoun(chars) {
            return getPronounHelperLocal(DE, chars, "theirs", "his", "hers", "theirs");
        },
        formatCharacterName(char, inPerspectiveOf, options) {
            const ourChar = resolveCharacter(DE, char);
            if (!ourChar) {
                console.warn(`Character reference for ${char} not found when formatting character name`);
                return "Unknown Character";
            }
            const perspectiveChar = (inPerspectiveOf ? resolveCharacter(DE, inPerspectiveOf) : ourChar) || ourChar;
            let nameGiven = getNameIdentificationForOneCharacterTowardsAnotherOnlyName(DE, perspectiveChar, ourChar);
            if (nameGiven === ourChar.unknownName) {
                if (options && options.type === "indefinite") {
                    if (nameGiven[0].toLowerCase() === "a" || nameGiven[0].toLowerCase() === "e" || nameGiven[0].toLowerCase() === "i" || nameGiven[0].toLowerCase() === "o" || nameGiven[0].toLowerCase() === "u") {
                        nameGiven = "an " + nameGiven;
                    } else {
                        nameGiven = "a " + nameGiven;
                    }
                } else if (options && options.type === "definite") {
                    nameGiven = "the " + nameGiven;
                }
            }
            if (options && options.capitalize) {
                nameGiven = nameGiven.charAt(0).toUpperCase() + nameGiven.slice(1);
            }
            if (options && options.justName) {
                return nameGiven;
            }
            return "<" + ourChar.id + ":" + nameGiven + ">";
        },
        formatItemName(item, inPerspectiveOf, options) {
            const visibility = DE.utils.items.canSeeItem(item, inPerspectiveOf);
            if (visibility !== "visible") {
                const observer = resolveCharacter(DE, inPerspectiveOf ?? null);
                const label = visibility === "invisible" || !observer ? "invisible item" : getPerceivedItemLabel(item, observer);
                let nameGiven = options?.type === "definite" ? "the " + label : (/^[aeiou]/i.test(label) ? "an " : "a ") + label;
                if (options?.capitalize) nameGiven = nameGiven.charAt(0).toUpperCase() + nameGiven.slice(1);
                return options?.justName ? nameGiven : "<" + item.id + ":" + nameGiven + ">";
            }
            const nameGiven = utilItemCount(DE, null, item.oneOfAKind || false, item.owner, 1, item.name, item.id, options?.capitalize, options?.type === "definite");
            return options?.justName ? nameGiven : "<" + item.id + ":" + nameGiven + ">";
        },
        formatLocationName(location, inPerspectiveOf, options) {
            const locationRef = typeof location === "string" ? DE.world.locations[location] : location;
            if (!locationRef) {
                console.warn(`Location reference for ${location} not found when formatting location name`);
                return "Unknown Location";
            }
            return formatPlaceName(locationRef, options);
        },
        formatLocationSlotName(slot, inPerspectiveOf, options) {
            const slotRef = typeof slot === "string" ? Object.values(DE.world.locations)
                .find(location => Object.prototype.hasOwnProperty.call(location.slots, slot))?.slots[slot] : slot;
            if (!slotRef) {
                console.warn(`Location slot reference for ${slot} not found when formatting location slot name`);
                return "Unknown Location Slot";
            }
            return formatPlaceName(slotRef, options);
        },
    },

    ramdom: {
        getRandomSeedFromString(optionsNumber, inputString) {
            return generateIntSeedFromString(optionsNumber, inputString);
        },
        getRandomSeedFromTime(optionsNumber) {
            const currentTimeString = DE.currentTime.time.toString();
            return generateIntSeedFromString(optionsNumber, currentTimeString);
        },
        getRandomOption(options) {
            const result = weightedRandomByLikelihood(options.map(option => ({ item: option, likelihood: 1 })), generateIntSeedFromString(1000000, DE.currentTime.time.toString()));
            return result ? result.item : options[0];
        },
        getRandomOptionFixedCharacter(char, options) {
            const charRef = resolveCharacter(DE, char);
            // Use character id for consistent seeding per character
            const result = weightedRandomByLikelihood(options.map(option => ({ item: option, likelihood: 1 })), generateIntSeedFromString(1000000, char.id));
            return result ? result.item : options[0];
        },
    },
});

/**
 * @param {DEObject} DE 
 * @param {DECompleteCharacterReference} character 
 * @param {string} stateName 
 * @param {DECharacterStateDefinition} stateDefinition
 * @return {DECharacterStateDefinition}
 */
function defineStateInCharacter(DE, character, stateName, stateDefinition) {
    if (character.stateDefinitions[stateName]) {
        console.warn(`Character ${character.name} already has a state named ${stateName}`);
    }
    character.stateDefinitions[stateName] = stateDefinition;
    return character.stateDefinitions[stateName];
}

/**
 * 
 * @param {DEObject} DE 
 * @param {string} content 
 */
function makeUserStoryMasterMessage(DE, content) {
    DE.internalState.ADD_STORY_MASTER_MESSAGES = DE.internalState.ADD_STORY_MASTER_MESSAGES || [];
    DE.internalState.ADD_STORY_MASTER_MESSAGES.push({ type: "user", content });
}

/**
 * @param {DEObject} DE
 */
function markGameOver(DE) {
    DE.internalState.GAME_OVER = true;
}

/**
 * 
 * @param {DEObject} DE 
 * @param {string} content 
 */
function makeStoryMasterMessage(DE, content) {
    DE.internalState.ADD_STORY_MASTER_MESSAGES = DE.internalState.ADD_STORY_MASTER_MESSAGES || [];
    DE.internalState.ADD_STORY_MASTER_MESSAGES.push({ type: "everyone", content });
}

/**
 * @param {DEObject} deObject
 * @param {DECompleteCharacterReference} character 
 * @param {string} stateName 
 */
async function onStateTriggeredOnCharacter(deObject, character, stateName) {
    // stateFor keyed by character id
    const characterState = deObject.stateFor[character.id];
    if (!characterState) {
        throw new Error(`Character state for ${character.name} (id: ${character.id}) not found.`);
    }
    const characterStateInfo = characterState.states.find(s => s.state === stateName);
    if (!characterStateInfo) {
        throw new Error(`Character ${character.name} does not have state ${stateName} active.`);
    }

    const characterStateDescription = character.stateDefinitions[stateName];
    if (!characterStateDescription) {
        throw new Error(`Character ${character.name} does not have state description for ${stateName}.`);
    }

    // DE.user is a character id
    if (deObject.user && deObject.user === character.id) {
        let stateDescriptionText = typeof characterStateDescription.general === "string" ? characterStateDescription.general : await characterStateDescription.general({
            char: character,
            causes: characterStateInfo.causes,
        });
        if (!stateDescriptionText.endsWith(".")) {
            stateDescriptionText += ".";
        }
        makeUserStoryMasterMessage(deObject, `${character.name} is now being affected by the state: ${stateName.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ")}.\n${stateDescriptionText}`);
    }

    if (characterStateDescription.triggersStates) {
        for (const triggeredState of Object.keys(characterStateDescription.triggersStates)) {
            const withIntensity = characterStateDescription.triggersStates[triggeredState].intensity || 1.0;
            console.log(`State ${stateName} triggered on character ${character.name}, triggering state ${triggeredState} with intensity ${withIntensity}.`);

            const alreadyActivatedInfo = deObject.stateFor[character.id].states.find(s => s.state === triggeredState);
            if (alreadyActivatedInfo) {
                console.log(`State ${triggeredState} already active on character ${character.name}, cannot trigger.`);
            } else {
                /** @type {DEApplyingState} */
                const state = {
                    causes: characterStateInfo.causes,
                    state: triggeredState,
                    intensity: withIntensity,
                    relieving: false,
                    contiguousStartActivationCyclesAgo: 0,
                    contiguousStartActivationTime: { ...deObject.currentTime },
                };
                deObject.stateFor[character.id].states.push(state);

                console.log(`State ${triggeredState} activated on character ${character.name} with intensity ${withIntensity}.`);

                await onStateTriggeredOnCharacter(deObject, character, triggeredState);
            }
        }
    }

    if (characterStateDescription.modifiesStatesIntensitiesOnTrigger) {
        for (const toModifyState of Object.keys(characterStateDescription.modifiesStatesIntensitiesOnTrigger)) {
            const withIntensity = characterStateDescription.modifiesStatesIntensitiesOnTrigger[toModifyState].intensity || -1.0;
            console.log(`State ${stateName} triggered on character ${character.name}, modifying state ${toModifyState} with intensity ${withIntensity}.`);

            const alreadyActivatedInfo = deObject.stateFor[character.id].states.find(s => s.state === toModifyState);
            if (!alreadyActivatedInfo) {
                console.log(`State ${toModifyState} not active on character ${character.name}, cannot modify.`);
            } else {
                const stateDescriptionSpecific = character.stateDefinitions[toModifyState];

                alreadyActivatedInfo.intensity += withIntensity;
                if (alreadyActivatedInfo.intensity > 4) {
                    alreadyActivatedInfo.intensity = 4;
                }

                if (stateDescriptionSpecific && stateDescriptionSpecific.usesReliefDynamic && withIntensity < 0) {
                    alreadyActivatedInfo.relieving = true;

                    if (alreadyActivatedInfo.intensity > 0) {
                        console.log(`State ${toModifyState} intensity modified on character ${character.name} by ${withIntensity}, now relieving.`);
                        await onStateRelievedOnCharacter(deObject, character, toModifyState);
                    }
                }

                if (alreadyActivatedInfo.intensity <= 0) {
                    deObject.stateFor[character.id].states = deObject.stateFor[character.id].states.filter(s => s.state !== toModifyState);
                    console.log(`State ${toModifyState} intensity modified on character ${character.name} by ${withIntensity}, now removed.`);
                    await onStateRemovedOnCharacter(deObject, character, toModifyState);
                }
            }
        }
    }

    const deadEndPotential = !characterStateDescription.triggersDeadEnd ? "" : (typeof characterStateDescription.triggersDeadEnd === "string" ? characterStateDescription.triggersDeadEnd :
        (await characterStateDescription.triggersDeadEnd({
            char: character,
            causes: characterStateInfo.causes,
        })).trim());
    if (deadEndPotential) {
        console.log(`State ${stateName} on character ${character.name} triggers dead-end, the character will now be removed from the story.`);
        deObject.stateFor[character.id].deadEnded = true;
        deObject.stateFor[character.id].deadEndReason = deadEndPotential;
        if (characterStateDescription.deadEndIsDeath) {
            console.log(`Character ${character.name} has died due to state ${stateName}.`);
            deObject.stateFor[character.id].dead = true;
        }

        // DE.user is a character id
        if (character.id === deObject.user) {
            console.log(`The user character ${character.name} has reached a dead-end: ${deadEndPotential}, game over.`);

            if (characterStateDescription.deadEndIsDeath) {
                makeUserStoryMasterMessage(deObject, `${character.name} has died: ${deadEndPotential}.`);
            } else {
                makeUserStoryMasterMessage(deObject, `${character.name} has reached a dead-end and is thus removed from the story: ${deadEndPotential}.`);
            }

            markGameOver(deObject);
        }
    }
}

/**
 * @param {DEObject} deObject
 * @param {DECompleteCharacterReference} character 
 * @param {string} stateName 
 */
export async function onStateRemovedOnCharacter(deObject, character, stateName) {
    // DE.user is a character id
    if (deObject.user && deObject.user === character.id) {
        makeUserStoryMasterMessage(deObject, `${character.name} is no longer affected by the state: ${stateName.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ")}.`);
    }

    // stateFor keyed by character id
    const characterState = deObject.stateFor[character.id];
    if (!characterState) {
        throw new Error(`Character state for ${character.name} (id: ${character.id}) not found.`);
    }
    const characterStateInfo = characterState.states.find(s => s.state === stateName);
    if (!characterStateInfo) {
        throw new Error(`Character ${character.name} does not have state ${stateName} active.`);
    }
    const characterStateDescription = character.stateDefinitions[stateName];
    if (!characterStateDescription) {
        throw new Error(`Character ${character.name} does not have state description for ${stateName}.`);
    }

    if (characterStateDescription.triggersStatesOnRemove) {
        for (const triggeredState of Object.keys(characterStateDescription.triggersStatesOnRemove)) {
            const withIntensity = characterStateDescription.triggersStatesOnRemove[triggeredState].intensity || 1.0;
            console.log(`State ${stateName} removed from character ${character.name}, triggering state ${triggeredState} with intensity ${withIntensity}.`);

            const alreadyActivatedInfo = deObject.stateFor[character.id].states.find(s => s.state === triggeredState);
            if (alreadyActivatedInfo) {
                console.log(`State ${triggeredState} already active on character ${character.name}, cannot trigger.`);
            } else {
                /** @type {DEApplyingState} */
                const state = {
                    causes: characterStateInfo.causes,
                    state: triggeredState,
                    intensity: withIntensity,
                    relieving: false,
                    contiguousStartActivationCyclesAgo: 0,
                    contiguousStartActivationTime: { ...deObject.currentTime },
                };
                deObject.stateFor[character.id].states.push(state);

                console.log(`State ${triggeredState} activated on character ${character.name} with intensity ${withIntensity}.`);

                await onStateTriggeredOnCharacter(deObject, character, triggeredState);
            }
        }
    }

    if (characterStateDescription.modifiesStatesIntensitiesOnRemove) {
        for (const toModifyState of Object.keys(characterStateDescription.modifiesStatesIntensitiesOnRemove)) {
            const withIntensity = characterStateDescription.modifiesStatesIntensitiesOnRemove[toModifyState].intensity || -1.0;
            console.log(`State ${stateName} removed from character ${character.name}, modifying state ${toModifyState} with intensity ${withIntensity}.`);

            const alreadyActivatedInfo = deObject.stateFor[character.id].states.find(s => s.state === toModifyState);
            if (!alreadyActivatedInfo) {
                console.log(`State ${toModifyState} not active on character ${character.name}, cannot modify.`);
            } else {
                const stateDescriptionSpecific = character.stateDefinitions[toModifyState];

                alreadyActivatedInfo.intensity += withIntensity;
                if (alreadyActivatedInfo.intensity > 4) {
                    alreadyActivatedInfo.intensity = 4;
                }

                if (stateDescriptionSpecific && stateDescriptionSpecific.usesReliefDynamic && withIntensity < 0) {
                    alreadyActivatedInfo.relieving = true;

                    if (alreadyActivatedInfo.intensity > 0) {
                        console.log(`State ${toModifyState} intensity modified on character ${character.name} by ${withIntensity}, now relieving.`);
                        await onStateRelievedOnCharacter(deObject, character, toModifyState);
                    }
                }

                if (alreadyActivatedInfo.intensity <= 0) {
                    deObject.stateFor[character.id].states = deObject.stateFor[character.id].states.filter(s => s.state !== toModifyState);
                    console.log(`State ${toModifyState} intensity modified on character ${character.name} by ${withIntensity}, now removed.`);
                    await onStateRemovedOnCharacter(deObject, character, toModifyState);
                }
            }
        }
    }
}

/**
 * @param {DEObject} deObject
 * @param {DECompleteCharacterReference} character 
 * @param {string} stateName 
 */
export async function onStateRelievedOnCharacter(deObject, character, stateName) {
    // stateFor keyed by character id
    const characterState = deObject.stateFor[character.id];
    if (!characterState) {
        throw new Error(`Character state for ${character.name} (id: ${character.id}) not found.`);
    }
    const characterStateInfo = characterState.states.find(s => s.state === stateName);
    if (!characterStateInfo) {
        throw new Error(`Character ${character.name} does not have state ${stateName} active.`);
    }
    const characterStateDescription = character.stateDefinitions[stateName];
    if (!characterStateDescription) {
        throw new Error(`Character ${character.name} does not have state description for ${stateName}.`);
    }

    // DE.user is a character id
    if (deObject.user && deObject.user === character.id) {
        let stateDescriptionText = ".\n";

        if (characterStateDescription.relieving && stateDescriptionText) {
            stateDescriptionText += typeof characterStateDescription.relieving === "string" ? characterStateDescription.relieving : (await characterStateDescription.relieving({
                char: character,
                causes: characterStateInfo.causes,
            })).trim();
            if (!stateDescriptionText.endsWith(".")) {
                stateDescriptionText += ".";
            }
        } else {
            stateDescriptionText = "";
        }

        makeUserStoryMasterMessage(deObject, `${character.name} is has begun to relieve: ${stateName.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ")}${stateDescriptionText}`);
    }

    if (characterStateDescription.triggersStatesOnRelieve) {
        for (const triggeredState of Object.keys(characterStateDescription.triggersStatesOnRelieve)) {
            const withIntensity = characterStateDescription.triggersStatesOnRelieve[triggeredState].intensity || 1.0;
            console.log(`State ${stateName} relieved on character ${character.name}, triggering state ${triggeredState} with intensity ${withIntensity}.`);

            const alreadyActivatedInfo = deObject.stateFor[character.id].states.find(s => s.state === triggeredState);
            if (alreadyActivatedInfo) {
                console.log(`State ${triggeredState} already active on character ${character.name}, cannot trigger.`);
            } else {
                /** @type {DEApplyingState} */
                const state = {
                    causes: characterStateInfo.causes,
                    state: triggeredState,
                    intensity: withIntensity,
                    relieving: false,
                    contiguousStartActivationCyclesAgo: 0,
                    contiguousStartActivationTime: { ...deObject.currentTime },
                };
                deObject.stateFor[character.id].states.push(state);

                console.log(`State ${triggeredState} activated on character ${character.name} with intensity ${withIntensity}.`);

                await onStateTriggeredOnCharacter(deObject, character, triggeredState);
            }
        }
    }
    if (characterStateDescription.modifiesStatesIntensitiesOnRelieve) {
        for (const toModifyState of Object.keys(characterStateDescription.modifiesStatesIntensitiesOnRelieve)) {
            const withIntensity = characterStateDescription.modifiesStatesIntensitiesOnRelieve[toModifyState].intensity || -1.0;
            console.log(`State ${stateName} relieved on character ${character.name}, modifying state ${toModifyState} with intensity ${withIntensity}.`);

            const alreadyActivatedInfo = deObject.stateFor[character.id].states.find(s => s.state === toModifyState);
            if (!alreadyActivatedInfo) {
                console.log(`State ${toModifyState} not active on character ${character.name}, cannot modify.`);
            } else {
                const stateDescriptionSpecific = character.stateDefinitions[toModifyState];

                alreadyActivatedInfo.intensity += withIntensity;
                if (alreadyActivatedInfo.intensity > 4) {
                    alreadyActivatedInfo.intensity = 4;
                }

                if (stateDescriptionSpecific && stateDescriptionSpecific.usesReliefDynamic && withIntensity < 0) {
                    alreadyActivatedInfo.relieving = true;

                    if (alreadyActivatedInfo.intensity > 0) {
                        console.log(`State ${toModifyState} intensity modified on character ${character.name} by ${withIntensity}, now relieving.`);
                        await onStateRelievedOnCharacter(deObject, character, toModifyState);
                    }
                }

                if (alreadyActivatedInfo.intensity <= 0) {
                    deObject.stateFor[character.id].states = deObject.stateFor[character.id].states.filter(s => s.state !== toModifyState);
                    console.log(`State ${toModifyState} intensity modified on character ${character.name} by ${withIntensity}, now removed.`);
                    await onStateRemovedOnCharacter(deObject, character, toModifyState);
                }
            }
        }
    }
}
