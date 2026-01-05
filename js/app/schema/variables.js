import { generateIntSeedFromString } from "../util/random.js";

/**
 * @type Array<[string, string, string, (DEObject: DEObject, character: CompleteCharacterReference) => any]>
 */
export const character = [
    [
        "user_name",
        "The name of the user, only really useful if they are the chosen one or the likes",
        "eg. Player",
        (DE, character) => DE.user.name,
    ],
    [
        "char",
        "The name of the character",
        "eg. Aria, Thalon, Mira",
        (DE, character) => character.name,
    ],
    [
        "char_is_male",
        "Boolean indicating if the character is male",
        "true or false",
        (DE, character) => character.gender.toLowerCase() === "male",
    ],
    [
        "char_is_female",
        "Boolean indicating if the character is female",
        "true or false",
        (DE, character) => character.gender.toLowerCase() === "female",
    ],
    [
        "char_is_ambiguous",
        "Boolean indicating if the character is of ambiguous gender",
        "true or false",
        (DE, character) => character.gender.toLowerCase() === "ambiguous",
    ],
    [
        "char_sex_is_male",
        "Boolean indicating if the character sex is male",
        "true or false",
        (DE, character) => character.sex.toLowerCase() === "male",
    ],
    [
        "char_sex_is_female",
        "Boolean indicating if the character sex is female",
        "true or false",
        (DE, character) => character.sex.toLowerCase() === "female",
    ],
    [
        "char_sex_is_intersex",
        "Boolean indicating if the character sex is intersex",
        "true or false",
        (DE, character) => character.sex.toLowerCase() === "intersex",
    ],
];

/**
 * @type Array<[string, string, string, (DEObject: DEObject, character: CompleteCharacterReference, location_arg?: string) => any]>
 */
export const world = [
    [
        "all_world_characters",
        "The list of all characters available in the world, including the user",
        "eg. [Arya, Thalon, Mira, Dorian, Luna, Kiro]",
        (DE, character) => Object.keys(DE.stateFor),
    ],
    [
        "current_location",
        "The name of the current location",
        "eg. Eldoria, Shadowfen",
        (DE, character) => DE.world.currentLocation,
    ],
    [
        "current_location_is_in_vehicle",
        "Boolean indicating if the social group is currently in a vehicle",
        "true or false",
        (DE, character) => {
            return DE.world.locations.find(loc => loc.name === DE.world.currentLocation)?.isVehicle || false;
        },
    ],
    [
        "current_location_is_safe",
        "Boolean indicating if the current location is a safe location",
        "true or false",
        (DE, character) => {
            return DE.world.locations.find(loc => loc.name === DE.world.currentLocation)?.isSafe || false;
        },
    ],

    [
        "all_characters_at_location location_name",
        "The list of all characters available in the current location of the world, including the user",
        "eg. [Luna, Kiro]",
        (DE, character, location_name) => {
            const allMembersAtLocation = [];
            for (const member of Object.keys(DE.stateFor)) {
                const locationOfChar = DE.stateFor[member].location;
                if (locationOfChar === location_name) {
                    allMembersAtLocation.push(member);
                }
            }
            return allMembersAtLocation;
        }
    ],
    [
        "location_is_vehicle location_name",
        "Boolean indicating if the provided location is a vehicle",
        "true or false",
        (DE, character, location_name) => {
            return DE.world.locations.find(loc => loc.name === location_name)?.isVehicle || false;
        }
    ],
    [
        "location_is_safe location_name",
        "Boolean indicating if the provided location is a safe location",
        "true or false",
        (DE, character, location_name) => {
            return DE.world.locations.find(loc => loc.name === location_name)?.isSafe || false;
        }
    ]
];

/**
 * 
 * @param {DEObject} DE 
 * @param {CompleteCharacterReference} character 
 * @param {string | string[]} listOrCharacter 
 * @param {string} they 
 * @param {string} he 
 * @param {string} she 
 * @param {string} they_singular 
 * @returns 
 */
function getPronounHelper(DE, character, listOrCharacter, they, he, she, they_singular) {
    /**
     * @type {string}
     */
    let nameOne = "";
    if (Array.isArray(listOrCharacter)) {
        if (listOrCharacter.length === 0) {
            return they;
        } else if (listOrCharacter.length === 1) {
            nameOne = listOrCharacter[0];
        } else {
            return they;
        }
    }
    const references = DE.characters;
    const charRef = references[nameOne];
    if (!charRef) {
        return they_singular;
    }
    const gender = charRef.gender.toLowerCase();
    if (gender === "male") {
        return he;
    } else if (gender === "female") {
        return she;
    } else {
        return they_singular;
    }
}

/**
 * @type Array<[string, string, string, (DEObject: DEObject, character: CompleteCharacterReference, other: string) => any]>
 */
export const specials = [
    [
        "potential_causant",
        "Only available at potential_causant_negative_prompt and potential_causant_positive_prompt, the name of the potential causant for a possible state activation, basically all the present characters",
        "eg. Aria, Thalon, Mira",
        (DE, character, potentialCausant) => potentialCausant,
    ],
    [
        "other",
        "Only available at bonds and relationships, the name of the other character in the bond or relationship",
        "eg. Aria, Thalon, Mira",
        (DE, character, otherCharacter) => otherCharacter,
    ],
    [
        "causant",
        "Only available at description and relieving description for states, the name of the causant character or object that activated the state; note that causant can be an object as well",
        "eg. Aria, Thalon, The Ancient Sword",
        (DE, character, causant) => causant,
    ],
    [
        "cause",
        "Only available at description and relieving description for states, the cause/reason provided for the state activation",
        "eg. helped me with my chores, betrayed me in the past",
        (DE, character, cause) => cause,
    ]
]

/**
 * 
 * @param {string[]} list 
 * @returns 
 */
function formatAnd(list) {
    if (!list || !Array.isArray(list)) return "";
    if (list.length === 0) return "";
    if (list.length === 1) return list[0];
    if (list.length === 2) return `${list[0]} and ${list[1]}`;
    return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
}

/**
 * 
 * @param {DEObject} DE 
 * @param {CompleteCharacterReference} character 
 * @param {string} stateName 
 * @returns 
 */
function getCausantsHelper(DE, character, stateName) {
    const actualStateName = stateName.trim().toUpperCase().replace(/\s+/, "_");
    const characterHistory = DE.stateFor[character.name].history;

    /**
     * @type {StateForDescription | null}
     */
    let lastEntryWithActivation = null;
    // loop in reverse to find the last activation of the state
    for (let i = characterHistory.length - 1; i >= 0; i--) {
        const entry = characterHistory[i];
        if (entry.type === "INTERACTING" && entry.states.find(s => s.state === actualStateName)) {
            lastEntryWithActivation = entry;
            break;
        }
    }
    if (!lastEntryWithActivation) {
        return [];
    }
    const stateEntry = lastEntryWithActivation.states.find(s => s.state === actualStateName);
    if (stateEntry?.causants === null) {
        console.warn(`State ${actualStateName} does not track causants for character ${character.name}`);
        return [];
    }

    return stateEntry?.causants || [];
}

/**
 * @type Array<[string, string, string, (DEObject: DEObject, character: CompleteCharacterReference, ...args: any[]) => any]>
 */
export const utils = [
    [
        "get_last_state_causants state_name",
        "The name of the characters/users/objects that activated the state last, it is available everywhere but it needs track_causants enabled for the state to work",
        "eg. [\"Aria\", \"Thalon\", \"Player\", \"The Ancient Sword\"]",
        (DE, character, stateName) => {
            return getCausantsHelper(DE, character, stateName).map(causant => causant.name);
        },
    ],
    [
        "get_last_state_cause state_name",
        "The cause/reason for the last activation of the state, it requires track_cause enabled for the state to work",
        "eg. 'helped me with my chores', 'betrayed me in the past'",
        (DE, character, stateName) => {
            const actualStateName = stateName.trim().toUpperCase().replace(/\s+/, "_");
            const characterHistory = DE.stateFor[character.name].history;

            /**
             * @type {StateForDescription | null}
             */
            let lastEntryWithActivation = null;
            // loop in reverse to find the last activation of the state
            // this will include current as the history contains the current session too
            for (let i = characterHistory.length - 1; i >= 0; i--) {
                const entry = characterHistory[i];
                if (entry.type === "INTERACTING" && entry.states.find(s => s.state === actualStateName)) {
                    lastEntryWithActivation = entry;
                    break;
                }
            }
            if (!lastEntryWithActivation) {
                return "";
            }
            const stateInfo = lastEntryWithActivation.states.find(s => s.state === actualStateName);
            if (stateInfo?.causes === null) {
                console.warn(`State ${actualStateName} does not track causes for character ${character.name}`);
                return "";
            }
            return stateInfo?.causes.map(cause => cause.description);
        },
    ],
    [
        "get_last_state_character_causants state_name",
        "The name of the characters only that activated the state last, it is available everywhere but it needs track_causants enabled for the state to work",
        "eg. [\"Aria\", \"Thalon\", \"Player\"]",
        (DE, character, stateName) => {
            return getCausantsHelper(DE, character, stateName).filter(causant => causant.type === "character").map(causant => causant.name);
        },
    ],
    [
        "get_last_state_object_causants state_name",
        "The name of the characters only that activated the state last, it is available everywhere but it needs track_causants enabled for the state to work",
        "eg. [\"Aria\", \"Thalon\", \"Player\"]",
        (DE, character, stateName) => {
            return getCausantsHelper(DE, character, stateName).filter(causant => causant.type === "object").map(causant => causant.name);
        },
    ],
    [
        "get_social_group min_bond_level max_bond_level min_2_bond_level max_2_bond_level",
        "Get the list of social group members for the current character",
        "eg. [Arya, Thalon, Mira]",
        (DE, character, minBondLevel, maxBondLevel, min2BondLevel, max2BondLevel) => {
            return DE.social.bonds[character.name].active.filter(bond => {
                const bondValue = bond.bond;
                const secondaryBond = bond.bond2;
                return bondValue >= minBondLevel && bondValue <= maxBondLevel && secondaryBond >= min2BondLevel && secondaryBond <= max2BondLevel;
            }).map(bond => bond.towards);
        }
    ],
    [
        "get_present_social_group min_bond_level max_bond_level min_2_bond_level max_2_bond_level",
        "Get the list of social group members for the current character that are present at the same location as our character",
        "eg. [Arya, Thalon, Mira]",
        (DE, character, minBondLevel, maxBondLevel, min2BondLevel, max2BondLevel) => {
            const currentLocation = DE.world.currentLocation;
            const socialGroup = DE.social.bonds[character.name].active.filter(bond => {
                const bondValue = bond.bond;
                const secondaryBond = bond.bond2;
                return bondValue >= minBondLevel && bondValue <= maxBondLevel && secondaryBond >= min2BondLevel && secondaryBond <= max2BondLevel;
            }).map(bond => bond.towards);
            return socialGroup.filter(memberName => {
                const stateOfChar = DE.stateFor[memberName];
                const locationOfChar = stateOfChar.location;
                return locationOfChar === currentLocation;
            });
        }
    ],
    [
        "get_present_participating_social_group min_bond_level max_bond_level min_2_bond_level max_2_bond_level",
        "Get the list of social group members for the current character, that are not only present but also participating in a conversation with our character",
        "eg. [Thalon, Mira]",
        (DE, character, minBondLevel, maxBondLevel, min2BondLevel, max2BondLevel) => {
            if (minBondLevel === -100 && maxBondLevel === 100 && min2BondLevel === 0 && max2BondLevel === 100) {
                const conversationId = DE.stateFor[character.name].conversationId;
                if (!conversationId) return [];
                return DE.conversations[conversationId].participants.filter(memberName => memberName !== character.name);
            }
            const stateForChar = DE.stateFor[character.name];
            const conversationId = stateForChar.conversationId;
            if (!conversationId) return [];
            const socialGroup = DE.social.bonds[character.name].active.filter(bond => {
                const bondValue = bond.bond;
                const secondaryBond = bond.bond2;
                return bondValue >= minBondLevel && bondValue <= maxBondLevel && secondaryBond >= min2BondLevel && secondaryBond <= max2BondLevel;
            }).map(bond => bond.towards);
            const conversation = DE.conversations[conversationId];
            return conversation.participants.filter(memberName => socialGroup.includes(memberName));
        }
    ],
    [
        "get_difference_of_present_social_group list",
        "Get the difference between the provided list and the present social group members",
        "eg. [Arya, Thalon]",
        (DE, character, list) => {
            const currentLocation = DE.world.currentLocation;
            const socialGroup = DE.social.bonds[character.name].active.map(bond => bond.towards);
            const presentSocialGroup = socialGroup.filter(memberName => {
                const stateOfChar = DE.stateFor[memberName];
                const locationOfChar = stateOfChar.location;
                return locationOfChar === currentLocation;
            });
            // @ts-ignore
            return list.filter(name => !presentSocialGroup.includes(name));
        }
    ],
    [
        "get_gone_social_group min_bond_level max_bond_level min_2_bond_level max_2_bond_level",
        "Get the list of social group members that are gone forever (most likely dead) for the current character",
        "eg. [Thalon, Mira]",
        (DE, character, minBondLevel, maxBondLevel, min2BondLevel, max2BondLevel) => {
            return DE.social.bonds[character.name].ex.filter(bond => {
                const bondValue = bond.bond;
                const secondaryBond = bond.bond2;
                return bondValue >= minBondLevel && bondValue <= maxBondLevel && secondaryBond >= min2BondLevel && secondaryBond <= max2BondLevel;
            }).map(bond => bond.towards);
        }
    ],
    [
        "is_dead character",
        "Boolean indicating if the character is dead",
        "true or false",
        (DE, character, characterQuestioned) => {
            const stateOfChar = DE.stateFor[characterQuestioned];
            return stateOfChar.dead;
        }
    ],
    [
        "is_male character",
        "Boolean indicating if the character is male",
        "true or false",
        (DE, character, characterQuestioned) => {
            const charRef = DE.characters[characterQuestioned];
            return charRef.gender.toLowerCase() === "male";
        }
    ],
    [
        "is_female character",
        "Boolean indicating if the character is female",
        "true or false",
        (DE, character, characterQuestioned) => {
            const charRef = DE.characters[characterQuestioned];
            return charRef.gender.toLowerCase() === "female";
        }
    ],
    [
        "is_ambiguous character",
        "Boolean indicating if the character is of ambiguous gender",
        "true or false",
        (DE, character, characterQuestioned) => {
            const charRef = DE.characters[characterQuestioned];
            return charRef.gender.toLowerCase() === "ambiguous";
        }
    ],
    [
        "is_sex_male character",
        "Boolean indicating if the character sex is male",
        "true or false",
        (DE, character, characterQuestioned) => {
            const charRef = DE.characters[characterQuestioned];
            return charRef.sex.toLowerCase() === "male";
        }
    ],
    [
        "is_sex_female character",
        "Boolean indicating if the character sex is female",
        "true or false",
        (DE, character, characterQuestioned) => {
            const charRef = DE.characters[characterQuestioned];
            return charRef.sex.toLowerCase() === "female";
        }
    ],
    [
        "is_sex_intersex character",
        "Boolean indicating if the character sex is intersex",
        "true or false",
        (DE, character, characterQuestioned) => {
            const charRef = DE.characters[characterQuestioned];
            return charRef.sex.toLowerCase() === "intersex";
        }
    ],
    [
        "is_char character",
        "Boolean indicating if the character is a character, this will give true to the user as well",
        "true or false",
        (DE, character, characterQuestioned) => {
            return !!DE.characters[characterQuestioned];
        }
    ],
    [
        "is_user character",
        "Boolean indicating if the character is the user",
        "true or false",
        (DE, character, characterQuestioned) => {
            return DE.user.name === characterQuestioned;
        }
    ],
    [
        "is_present_member character",
        "Boolean indicating if the character is a present member of the social",
        "true or false",
        (DE, character, characterQuestioned) => {
            const currentLocation = DE.world.currentLocation;
            const charState = DE.stateFor[characterQuestioned];
            return charState.location === currentLocation;
        }
    ],
    [
        "is_not_present character",
        "Boolean indicating if the character is not present in the location",
        "true or false",
        (DE, character, characterQuestioned) => {
            const currentLocation = DE.world.currentLocation;
            const charState = DE.stateFor[characterQuestioned];
            return charState.location !== currentLocation;
        }
    ],
    [
        "is_gone character",
        "Boolean indicating if the character is gone forever (most likely dead)",
        "true or false",
        (DE, character, characterQuestioned) => {
            const exbonds = DE.social.bonds[character.name].ex;
            for (const bond of exbonds) {
                if (bond.towards === characterQuestioned) {
                    return true;
                }
            }
            return false;
        }
    ],
    [
        "is_in_conversation character",
        "Boolean indicating if the character is currently in a conversation with our character",
        "true or false",
        (DE, character, characterQuestioned) => {
            const stateForChar = DE.stateFor[character.name];
            const conversationId = stateForChar.conversationId;
            if (!conversationId) return false;
            const conversation = DE.conversations[conversationId];
            return conversation.participants.includes(characterQuestioned);
        }
    ],
    [
        "last_saw character",
        "String indicating a location where another character should be at according to the character's knowledge",
        "true or false",
        (DE, character, characterQuestioned) => {
            const charHistory = DE.stateFor[character.name].history;
            for (let i = charHistory.length - 1; i >= 0; i--) {
                const entry = charHistory[i];
                if (entry.surroundingNonStrangers.includes(characterQuestioned)) {
                    return entry.location;
                }
            }

            return ""
        }
    ],
    [
        "has_no_idea_where_is character",
        "Boolean indicating if the character is a member that got lost after being left behind (known to this member)",
        "true or false",
        (DE, character, characterQuestioned) => {
            let shouldBeAt = null;
            const charHistory = DE.stateFor[character.name].history;
            let foundAtIndex = -1;
            for (let i = charHistory.length - 1; i >= 0; i--) {
                const entry = charHistory[i];
                if (entry.surroundingNonStrangers.includes(characterQuestioned)) {
                    shouldBeAt = entry.location;
                    foundAtIndex = i;
                    break;
                }
            }

            // this character just doesn't have any info about the questioned character, they have never met!
            if (!shouldBeAt) {
                console.warn(`Character ${character.name} has no knowledge about character ${characterQuestioned}, cannot determine if they have lost them.`);
                return false
            };

            // check if there is a history entry more recent for that location
            for (let j = foundAtIndex + 1; j < charHistory.length; j++) {
                const entry = charHistory[j];
                if (entry.location === shouldBeAt) {
                    // character has been at the location more recently, and the character questioned was not with them, they must have lost them
                    return true;
                }
            }

            // character has not been at the location more recently, they must know where they are
            return false;
        }
    ],
    [
        "does_not_know_character character",
        "Boolean indicating if the character does not know the questioned character and does not have a bond with them",
        "true or false",
        (DE, character, characterQuestioned) => {
            const bonds = DE.social.bonds[character.name].active;
            for (const bond of bonds) {
                if (bond.towards === characterQuestioned) {
                    return false;
                }
            }
            return true;
        }
    ],
    [
        "is_strangers_with character",
        "Boolean indicating if the character has a stranger relationship with the questioned character",
        "true or false",
        (DE, character, characterQuestioned) => {
            const bonds = DE.social.bonds[character.name].active;
            for (const bond of bonds) {
                if (bond.towards === characterQuestioned && bond.stranger) {
                    return true;
                }
            }
            return false;
        }
    ],
    [
        "is_here character",
        "Boolean indicating if the character is at the current location of the world",
        "true or false",
        (DE, character, characterQuestioned) => {
            const currentLocation = DE.world.currentLocation;
            const charState = DE.stateFor[characterQuestioned];
            if (charState.location === currentLocation) {
                return true;
            }
            return false;
        }
    ],
    [
        "size list",
        "The size of the list",
        "eg. 3",
        (DE, character, list) => {
            if (!list || !Array.isArray(list)) return 0;
            return list.length;
        }
    ],
    [
        "intersect list1 list2",
        "intersects two lists",
        "eg. [Arya, Thalon]",
        (DE, character, list1, list2) => {
            if (!list1 || !Array.isArray(list1)) return [];
            if (!list2 || !Array.isArray(list2)) return [];
            return list1.filter(value => list2.includes(value));
        }
    ],
    [
        "union list1 list2",
        "unites two lists",
        "eg. [Arya, Thalon, Mira]",
        (DE, character, list1, list2) => {
            if (!list1 || !Array.isArray(list1)) return [];
            if (!list2 || !Array.isArray(list2)) return [];
            return Array.from(new Set([...list1, ...list2]));
        }
    ],
    [
        "difference list1 list2",
        "difference between two lists",
        "eg. [Arya]",
        (DE, character, list1, list2) => {
            if (!list1 || !Array.isArray(list1)) return [];
            if (!list2 || !Array.isArray(list2)) return [];
            return list1.filter(value => !list2.includes(value));
        }
    ],
    [
        "format_and list",
        "formats a list with commas and 'and'",
        "eg. Arya, Thalon, and Mira",
        (DE, character, list) => {
            formatAnd(list);
        }
    ],
    [
        "fomat_or list",
        "formats a list with commas and 'or'",
        "eg. Arya, Thalon, or Mira",
        (DE, character, list) => {
            if (!list || !Array.isArray(list)) return "";
            if (list.length === 0) return "";
            if (list.length === 1) return list[0];
            if (list.length === 2) return `${list[0]} or ${list[1]}`;
            return `${list.slice(0, -1).join(', ')}, or ${list[list.length - 1]}`;
        }
    ],
    [
        "length list",
        "The length of the list",
        "eg. 3",
        (DE, character, list) => {
            if (!list || typeof list !== "string") return 0;
            return list.length;
        }
    ],
    [
        "in value list",
        "Boolean indicating if the value is in the list",
        "true or false",
        (DE, character, value, list) => {
            if (!list || !Array.isArray(list)) return false;
            return list.includes(value);
        }
    ],
    [
        "gt value1 value2",
        "Boolean indicating if value1 is greater than value2",
        "true or false",
        (DE, character, value1, value2) => {
            return value1 > value2;
        }
    ],
    [
        "lt value1 value2",
        "Boolean indicating if value1 is less than value2",
        "true or false",
        (DE, character, value1, value2) => {
            return value1 < value2;
        }
    ],
    [
        "eq value1 value2",
        "Boolean indicating if value1 is equal to value2",
        "true or false",
        (DE, character, value1, value2) => {
            return value1 == value2;
        }
    ],
    [
        "neq value1 value2",
        "Boolean indicating if value1 is not equal to value2",
        "true or false",
        (DE, character, value1, value2) => {
            return value1 != value2;
        }
    ],
    [
        "lte value1 value2",
        "Boolean indicating if value1 is less than or equal to value2",
        "true or false",
        (DE, character, value1, value2) => {
            return value1 <= value2;
        }
    ],
    [
        "gte value1 value2",
        "Boolean indicating if value1 is greater than or equal to value2",
        "true or false",
        (DE, character, value1, value2) => {
            return value1 >= value2;
        }
    ],
    [
        "format_object_pronoun listOrCharacter",
        "Formats the object pronoun for a list of characters or a single character",
        "eg. him, her, them",
        (DE, character, listOrCharacter) => {
            return getPronounHelper(DE, character, listOrCharacter, "them", "him", "her", "them");
        }
    ],
    [
        "format_possessive listOrCharacter",
        "Formats the possessive pronoun for a list of characters or a single character",
        "eg. his, her, their",
        (DE, character, listOrCharacter) => {
            return getPronounHelper(DE, character, listOrCharacter, "their", "his", "her", "their");
        }
    ],
    [
        "format_reflexive listOrCharacter",
        "Formats the reflexive pronoun for a list of characters or a single character",
        "eg. himself, herself, themself",
        (DE, character, listOrCharacter) => {
            return getPronounHelper(DE, character, listOrCharacter, "themselves", "himself", "herself", "themself");
        }
    ],
    [
        "format_pronoun listOrCharacter",
        "Formats the pronoun for a list of characters or a single character",
        "eg. he, she, they",
        (DE, character, listOrCharacter) => {
            return getPronounHelper(DE, character, listOrCharacter, "they", "he", "she", "they");
        }
    ],
    [
        "format_ownership_pronoun listOrCharacter",
        "Formats the ownership pronoun for a list of characters or a single character",
        "eg. his, hers, theirs",
        (DE, character, listOrCharacter) => {
            return getPronounHelper(DE, character, listOrCharacter, "theirs", "his", "hers", "theirs");
        },
    ],
    [
        "get_random_seed_from_string options_number input_string",
        "Generates a random seed integer from a string input for this specific character, the range will be from 0 to options_number - 1, useful for creating random character traits for instantiable characters that will get a random name",
        "integer",
        (DE, character, options_number, input_string) => {
            return generateIntSeedFromString(options_number, input_string);
        }
    ]
];

export const ALL_VARIABLES = [
    ...character,
    ...world,
    ...utils,
    ...specials,
];

export const ALL_VARIABLES_FNS = ALL_VARIABLES.map(entry => entry[0].split(' ')[0]);