
export const character = [
    [
        "user_name",
        "The name of the user, only really useful if they are the chosen one or the likes",
        "eg. Player",
        (user, character) => user.name,
    ],
    [
        "char",
        "The name of the character",
        "eg. Aria, Thalon, Mira",
        (user, character) => character.name,
    ],
    [
        "char_gender",
        "The gender of the character",
        "male, female or ambiguous",
        (user, character) => character.gender.toLowerCase(),
    ],
    [
        "char_sex",
        "The sex of the character",
        "male, female or intersex",
        (user, character) => character.sex.toLowerCase(),
    ],
    [
        "char_pronoun",
        "The 3rd person pronoun of the character",
        "he, she or they",
        (user, character) => character.sex.toLowerCase() === "male" ? "he" : character.sex.toLowerCase() === "female" ? "she" : "they",
    ],
    [
        "char_possessive",
        "The possessive pronoun of the character",
        "his, her or their",
        (user, character) => character.gender.toLowerCase() === "male" ? "his" : character.gender.toLowerCase() === "female" ? "her" : "their",
    ],
    [
        "char_object_pronoun",
        "The object pronoun of the character",
        "him, her or them",
        (user, character) => character.gender.toLowerCase() === "male" ? "him" : character.gender.toLowerCase() === "female" ? "her" : "them",
    ],
    [
        "char_reflexive_pronoun",
        "The reflexive pronoun of the character",
        "himself, herself or themself",
        (user, character) => character.gender.toLowerCase() === "male" ? "himself" : character.gender.toLowerCase() === "female" ? "herself" : "themself",
    ],
    [
        "char_ownership_pronoun",
        "The ownership pronoun of the character",
        "his, hers or theirs",
        (user, character) => character.gender.toLowerCase() === "male" ? "his" : character.gender.toLowerCase() === "female" ? "hers" : "theirs",
    ],
    [
        "char_is_male",
        "Boolean indicating if the character is male",
        "true or false",
        (user, character) => character.gender.toLowerCase() === "male",
    ],
    [
        "char_is_female",
        "Boolean indicating if the character is female",
        "true or false",
        (user, character) => character.gender.toLowerCase() === "female",
    ],
    [
        "char_is_ambiguous",
        "Boolean indicating if the character is of ambiguous gender",
        "true or false",
        (user, character) => character.gender.toLowerCase() === "ambiguous",
    ],
    [
        "char_sex_is_male",
        "Boolean indicating if the character sex is male",
        "true or false",
        (user, character) => character.sex.toLowerCase() === "male",
    ],
    [
        "char_sex_is_female",
        "Boolean indicating if the character sex is female",
        "true or false",
        (user, character) => character.sex.toLowerCase() === "female",
    ],
    [
        "char_sex_is_intersex",
        "Boolean indicating if the character sex is intersex",
        "true or false",
        (user, character) => character.sex.toLowerCase() === "intersex",
    ],
];

export const social = [
    [
        "char_social_group",
        "The list of social group members (characters wtih a bond with, positive or negative)",
        "eg. [Arya, Thalon, Mira]",
        (user, character, social) => social.groupForChar[character.name].members.map(member => member.name),
    ],
    [
        "char_social_group_present_members",
        "The list of present social group members (present characters the character has a bond with, positive or negative)",
        "eg. [Arya, Thalon]",
        (user, character, social) => social.groupForChar[character.name].members.filter(member => member.isPresent).map(member => member.name),
    ],
    [
        "user_social_group_ex_members",
        "The list of ex-social group members",
        "eg. [Dorian]",
        (user, character, social) => social.groupForChar[user.name].exMembers.map(member => member.name),
    ],
    [
        "non_social_group_members_at_location",
        "The list of non-social group members available in the current location of the world",
        "eg. [Luna, Kiro]",
        (user, character, social) => social.nonMembersAtLocation.map(member => member.name),
    ],
    [
        "non_social_group_members_at_world",
        "The list of all characters available in the world, including the social group itself",
        "eg. [Arya, Thalon, Mira, Dorian, Luna, Kiro]",
        (user, character, social) => social.everyone.map(member => member.name),
    ]
];

// TODO add the actual location functionality about available locations and such
export const world = [
    [
        "current_location",
        "The name of the current location",
        "eg. Eldoria, Shadowfen",
        (user, character, social, world) => world.currentLocation.name,
    ],
    [
        "location_is_in_vehicle",
        "Boolean indicating if the social group is currently in a vehicle",
        "true or false",
        (user, character, social, world) => world.currentLocation.isVehicle,
    ],
    [
        "location_is_safe",
        "Boolean indicating if the current location is a safe location",
        "true or false",
        (user, character, social, world) => world.currentLocation.isSafe,
    ]
];

function getPronounHelper(user, character, social, world, listOrCharacter, they, he, she, they_singular) {
    let nameOne = listOrCharacter;
    if (Array.isArray(listOrCharacter)) {
        if (listOrCharacter.length === 0) {
            return they;
        } else if (listOrCharacter.length === 1) {
            nameOne = listOrCharacter[0];
        } else {
            return they;
        }
    }
    for (const member of social.everyone) {
        if (member.name == nameOne) {
            const gender = social.references[member.name].gender.toLowerCase();
            if (gender === "male") {
                return he;
            } else if (gender === "female") {
                return she;
            } else {
                return they_singular;
            }
        }
    }
    return they_singular;
}

export const specials = [
    [
        "potential_causant",
        "Only available at causant_negative_prompt and causant_positive_prompt, the name of the potential causant for a possible state",
        "eg. Aria, Thalon, Mira",
        (user, character, social, world, potentialCausant) => potentialCausant,
    ],
]

function formatAnd(list) {
    if (!list || !Array.isArray(list)) return "";
            if (list.length === 0) return "";
            if (list.length === 1) return list[0];
            if (list.length === 2) return `${list[0]} and ${list[1]}`;
            return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
}

export const utils = [
    [
        "get_last_state_causant state_name",
        "The name of the character/user/object that activated the state, it could also be an unspecified non-character or object",
        "eg. Aria, Thalon, Player",
        (user, character, social, world, stateName) => {
            const actualStateName = stateName.trim().toUpperCase().replace(/\s+/, "_");
            const characterInfo = social.everyone.find(member => member.name === character.name);
            if (!characterInfo || !characterInfo.stateHistory[actualStateName] || characterInfo.stateHistory[actualStateName].length === 0) {
                return "";
            }
            const activators = characterInfo.currentStates[actualStateName].activatedBy;
            return activators[activators.length - 1] || "";
        },
    ],
    [
        "get_all_state_causants state_name",
        "The name of all characters/users that activated the state, it could also be unspecified non-characters or objects",
        "eg. [Aria, Thalon, Random Spooky Book]",
        (user, character, social, world, stateName) => {
            const actualStateName = stateName.trim().toUpperCase().replace(/\s+/, "_");
            const characterInfo = social.everyone.find(member => member.name === character.name);
            if (!characterInfo || !characterInfo.stateHistory[actualStateName] || characterInfo.stateHistory[actualStateName].length === 0) {
                return "";
            }
            const activators = characterInfo.currentStates[actualStateName].activatedBy;
            return activators;
        },
    ],
    [
        "get_state_cause state_name",
        "The cause/reason for the last activation of the state",
        "eg. 'helped me with my chores', 'betrayed me in the past'",
        (user, character, social, world, stateName) => {
            const actualStateName = stateName.trim().toUpperCase().replace(/\s+/, "_");
            const characterInfo = social.everyone.find(member => member.name === character.name);
            if (!characterInfo || !characterInfo.stateHistory[actualStateName] || characterInfo.stateHistory[actualStateName].length === 0) {
                return "";
            }
            return formatAnd(characterInfo.currentStates[actualStateName].causes) || "";
        },
    ],
    [
        "get_last_character_state_causant state_name",
        "The name of the character that activated the state, always ensuring a character is returned",
        "eg. Aria, Thalon",
        (user, character, social, world, stateName) => {
            const characterInfo = social.everyone.find(member => member.name === character.name);
            if (!characterInfo || !characterInfo.stateHistory[stateName] || characterInfo.stateHistory[stateName].length === 0) {
                return "";
            }
            const activators = characterInfo.currentStates[stateName].activatedBy;
            activators.filter(activator => {
                for (const member of social.everyone) {
                    if (member.name == activator) {
                        return true;
                    }
                }
                return false;
            });
            return activators.length > 0 ? activators[activators.length - 1] : "";
        },
    ],
    [
        "get_all_character_state_causants state_name",
        "The of all the character that activated the state, always ensuring a character is returned",
        "eg. Aria, Thalon",
        (user, character, social, world, stateName) => {
            const characterInfo = social.everyone.find(member => member.name === character.name);
            if (!characterInfo || !characterInfo.stateHistory[stateName] || characterInfo.stateHistory[stateName].length === 0) {
                return "";
            }
            const activators = characterInfo.currentStates[stateName].activatedBy;
            activators.filter(activator => {
                for (const member of social.everyone) {
                    if (member.name == activator) {
                        return true;
                    }
                }
                return false;
            });
            return activators;
        },
    ],
    [
        "get_social_group min_bond_level max_bond_level min_2_bond_level max_2_bond_level",
        "Get the list of social group members for the current character",
        "eg. [Arya, Thalon, Mira]",
        (user, character, social, world, minBondLevel, maxBondLevel, min2BondLevel, max2BondLevel) => {
            return social.groupForChar[character.name].members.filter(member => {
                const bond = member.bonds[character.name][member.name].bond;
                const secondaryBond = member.bonds[character.name][member.name].bond_2;
                return bond >= minBondLevel && bond <= maxBondLevel && secondaryBond >= min2BondLevel && secondaryBond <= max2BondLevel;
            });
        }
    ],
    [
        "get_present_social_group min_bond_level max_bond_level min_2_bond_level max_2_bond_level",
        "Get the list of social group members for the current character",
        "eg. [Arya, Thalon, Mira]",
        (user, character, social, world, minBondLevel, maxBondLevel, min2BondLevel, max2BondLevel) => {
            return social.groupForChar[character.name].members.filter(member => {
                const bond = member.bonds[character.name][member.name].bond;
                const secondaryBond = member.bonds[character.name][member.name].bond_2;
                return bond >= minBondLevel && bond <= maxBondLevel && secondaryBond >= min2BondLevel && secondaryBond <= max2BondLevel && member.isPresent;
            });
        }
    ],
    [
        "get_difference_of_present_social_group list",
        "Get the difference between the provided list and the present social group members",
        "eg. [Arya, Thalon]",
        (user, character, social, world, list) => {
            const presentMembers = social.groupForChar[character.name].members.filter(member => member.isPresent).map(member => member.name);
            return list.filter(name => !presentMembers.includes(name));
        }
    ],
    [
        "is_dead character",
        "Boolean indicating if the character is dead",
        "true or false",
        (user, character, social, world, characterQuestioned) => {
            if (!characterQuestioned) return false;
            for (const member of social.everyone) {
                if (member.name == characterQuestioned) {
                    return member.isDead;
                }
            }
            return false;
        }
    ],
    [
        "is_male character",
        "Boolean indicating if the character is male",
        "true or false",
        (user, character, social, world, characterQuestioned) => {
            if (!characterQuestioned) return false;
            for (const member of social.everyone) {
                if (member.name == characterQuestioned) {
                    return social.references[member.name].gender.toLowerCase() === "male";
                }
            }
            return false;
        }
    ],
    [
        "is_female character",
        "Boolean indicating if the character is female",
        "true or false",
        (user, character, social, world, characterQuestioned) => {
            if (!characterQuestioned) return false;
            for (const member of social.everyone) {
                if (member.name == characterQuestioned) {
                    return social.references[member.name].gender.toLowerCase() === "female";
                }
            }
            return false;
        }
    ],
    [
        "is_ambiguous character",
        "Boolean indicating if the character is of ambiguous gender",
        "true or false",
        (user, character, social, world, characterQuestioned) => {
            if (!characterQuestioned) return false;
            for (const member of social.everyone) {
                if (member.name == characterQuestioned) {
                    return social.references[member.name].gender.toLowerCase() === "ambiguous";
                }
            }
            return false;
        }
    ],
    [
        "is_sex_male character",
        "Boolean indicating if the character sex is male",
        "true or false",
        (user, character, social, world, characterQuestioned) => {
            if (!characterQuestioned) return false;
            for (const member of social.everyone) {
                if (member.name == characterQuestioned) {
                    return social.references[member.name].sex.toLowerCase() === "male";
                }
            }
            return false;
        }
    ],
    [
        "is_sex_female character",
        "Boolean indicating if the character sex is female",
        "true or false",
        (user, character, social, world, characterQuestioned) => {
            if (!characterQuestioned) return false;
            for (const member of social.everyone) {
                if (member.name == characterQuestioned) {
                    return social.references[member.name].sex.toLowerCase() === "female";
                }
            }
            return false;
        }
    ],
    [
        "is_sex_intersex character",
        "Boolean indicating if the character sex is intersex",
        "true or false",
        (user, character, social, world, characterQuestioned) => {
            if (!characterQuestioned) return false;
            for (const member of social.everyone) {
                if (member.name == characterQuestioned) {
                    return social.references[member.name].sex.toLowerCase() === "intersex";
                }
            }
            return false;
        }
    ],
    [
        "is_member character",
        "Boolean indicating if the character is a member of the social",
        "true or false",
        (user, character, social, world, characterQuestioned) => {
            if (!characterQuestioned) return false;
            for (const member of social.members) {
                if (member.name == characterQuestioned) {
                    return true;
                }
            }
            return false;
        }
    ],
    [
        "is_present_member character",
        "Boolean indicating if the character is a present member of the social",
        "true or false",
        (user, character, social, world, characterQuestioned) => {
            if (!characterQuestioned) return false;
            for (const member of social.members) {
                if (member.name == characterQuestioned) {
                    return member.isPresent;
                }
            }
            return false;
        }
    ],
    [
        "is_not_present character",
        "Boolean indicating if the character is not present in the location",
        "true or false",
        (user, character, social, world, characterQuestioned) => {
            if (!characterQuestioned) return false;
            for (const member of social.everyone) {
                if (member.name == characterQuestioned) {
                    return !member.isPresent;
                }
            }
            return false;
        }
    ],
    [
        "should_be_at character",
        "String indicating a location where another character should be at according to the character's knowledge",
        "true or false",
        (user, character, social, world, characterQuestioned) => {
            if (!characterQuestioned) return false;
            for (const member of social.groupForChar[character.name]) {
                if (member.name == characterQuestioned) {
                    return !member.isPresent ? member.lastKnownLocation : world.currentLocation.name;
                }
            }
            return "";
        }
    ],
    [
        "is_lost character",
        "Boolean indicating if the character is a member that got lost after being left behind (known to this member)",
        "true or false",
        (user, character, social, world, characterQuestioned) => {
            if (!characterQuestioned) return false;
            for (const member of social.groupForChar[character.name]) {
                if (member.name == characterQuestioned) {
                    return !member.isPresent && member.isLost;
                }
            }
            return false;
        }
    ],
    [
        "does_not_know_character character",
        "Boolean indicating if the character does not know the questioned character and does not have a bond with them",
        "true or false",
        (user, character, social, world, characterQuestioned) => {
            if (!characterQuestioned) return false;
            for (const member of social.everyone) {
                if (member.name == characterQuestioned) {
                    return member.bonds[character][characterQuestioned].not_met;
                }
            }
            return false;
        }
    ],
    [
        "is_strangers_with character",
        "Boolean indicating if the character has a stranger relationship with the questioned character",
        "true or false",
        (user, character, social, world, characterQuestioned) => {
            if (!characterQuestioned) return false;
            for (const member of social.everyone) {
                if (member.name == characterQuestioned) {
                    return member.bonds[character][characterQuestioned].stranger;
                }
            }
            return false;
        }
    ],
    [
        "is_at_location character",
        "Boolean indicating if the character is at the current location of the world",
        "true or false",
        (user, character, social, world, characterQuestioned) => {
            if (!characterQuestioned) return false;
            for (const member of social.everyoneAtLocation) {
                if (member.name == characterQuestioned) {
                    return true;
                }
            }
            return false;
        }
    ],
    [
        "size list",
        "The size of the list",
        "eg. 3",
        (user, character, social, world, list) => {
            if (!list || !Array.isArray(list)) return 0;
            return list.length;
        }
    ],
    [
        "intersect list1 list2",
        "intersects two lists",
        "eg. [Arya, Thalon]",
        (user, character, social, world, list1, list2) => {
            if (!list1 || !Array.isArray(list1)) return [];
            if (!list2 || !Array.isArray(list2)) return [];
            return list1.filter(value => list2.includes(value));
        }
    ],
    [
        "union list1 list2",
        "unites two lists",
        "eg. [Arya, Thalon, Mira]",
        (user, character, social, world, list1, list2) => {
            if (!list1 || !Array.isArray(list1)) return [];
            if (!list2 || !Array.isArray(list2)) return [];
            return Array.from(new Set([...list1, ...list2]));
        }
    ],
    [
        "difference list1 list2",
        "difference between two lists",
        "eg. [Arya]",
        (user, character, social, world, list1, list2) => {
            if (!list1 || !Array.isArray(list1)) return [];
            if (!list2 || !Array.isArray(list2)) return [];
            return list1.filter(value => !list2.includes(value));
        }
    ],
    [
        "format_and list",
        "formats a list with commas and 'and'",
        "eg. Arya, Thalon, and Mira",
        (user, character, social, world, list) => {
            formatAnd(list);
        }
    ],
    [
        "fomat_or list",
        "formats a list with commas and 'or'",
        "eg. Arya, Thalon, or Mira",
        (user, character, social, world, list) => {
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
        (user, character, social, world, list) => {
            if (!list || typeof list !== "string") return 0;
            return list.length;
        }
    ],
    [
        "in value list",
        "Boolean indicating if the value is in the list",
        "true or false",
        (user, character, social, world, value, list) => {
            if (!list || !Array.isArray(list)) return false;
            return list.includes(value);
        }
    ],
    [
        "gt value1 value2",
        "Boolean indicating if value1 is greater than value2",
        "true or false",
        (user, character, social, world, value1, value2) => {
            return value1 > value2;
        }
    ],
    [
        "lt value1 value2",
        "Boolean indicating if value1 is less than value2",
        "true or false",
        (user, character, social, world, value1, value2) => {
            return value1 < value2;
        }
    ],
    [
        "eq value1 value2",
        "Boolean indicating if value1 is equal to value2",
        "true or false",
        (user, character, social, world, value1, value2) => {
            return value1 == value2;
        }
    ],
    [
        "neq value1 value2",
        "Boolean indicating if value1 is not equal to value2",
        "true or false",
        (user, character, social, world, value1, value2) => {
            return value1 != value2;
        }
    ],
    [
        "lte value1 value2",
        "Boolean indicating if value1 is less than or equal to value2",
        "true or false",
        (user, character, social, world, value1, value2) => {
            return value1 <= value2;
        }
    ],
    [
        "gte value1 value2",
        "Boolean indicating if value1 is greater than or equal to value2",
        "true or false",
        (user, character, social, world, value1, value2) => {
            return value1 >= value2;
        }
    ],
    [
        "format_object_pronoun listOrCharacter",
        "Formats the object pronoun for a list of characters or a single character",
        "eg. him, her, them",
        (user, character, social, world, listOrCharacter) => {
            return getPronounHelper(user, character, social, world, listOrCharacter, "them", "him", "her", "them");
        }
    ],
    [
        "format_possessive listOrCharacter",
        "Formats the possessive pronoun for a list of characters or a single character",
        "eg. his, her, their",
        (user, character, social, world, listOrCharacter) => {
            return getPronounHelper(user, character, social, world, listOrCharacter, "their", "his", "her", "their");
        }
    ],
    [
        "format_reflexive listOrCharacter",
        "Formats the reflexive pronoun for a list of characters or a single character",
        "eg. himself, herself, themself",
        (user, character, social, world, listOrCharacter) => {
            return getPronounHelper(user, character, social, world, listOrCharacter, "themselves", "himself", "herself", "themself");
        }
    ],
    [
        "format_pronoun listOrCharacter",
        "Formats the pronoun for a list of characters or a single character",
        "eg. he, she, they",
        (user, character, social, world, listOrCharacter) => {
            return getPronounHelper(user, character, social, world, listOrCharacter, "they", "he", "she", "they");
        }
    ],
    [
        "format_ownership_pronoun listOrCharacter",
        "Formats the ownership pronoun for a list of characters or a single character",
        "eg. his, hers, theirs",
        (user, character, social, world, listOrCharacter) => {
            return getPronounHelper(user, character, social, world, listOrCharacter, "theirs", "his", "hers", "theirs");
        },
    ],
];

export const ALL_VARIABLES = [
    ...character,
    ...social,
    ...world,
    ...utils,
    ...specials,
];

export const ALL_VARIABLES_FNS = ALL_VARIABLES.map(entry => entry[0].split(' ')[0]);