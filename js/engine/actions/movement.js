
/**
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
 * @param {string} currentTarget 
 * @returns 
 */
const RESPONSE_CLASSIC_RULES = (currentTarget) => `Answer as ${currentTarget} and keep the roleplay and conversation flow, The answer MUST start with Yes, No, *${currentTarget} accepts*, *${currentTarget} refuses*, *${currentTarget} agrees*, or *${currentTarget} declines* depending on the situation.`;
/**
 * 
 * @param {string} currentTarget 
 * @returns 
 */
const RESPONSE_COERCION_RULES = (currentTarget) => `Answer as ${currentTarget} and keep the roleplay and conversation flow, The answer MUST start with *${currentTarget} fights back*, *${currentTarget} allows it*, depending on the situation.`;

const NONE_SOCIAL = `If nothing of the above applies, output the following EXACTLY in your response:
- No action taken

NOTE: Always use the names of the characters when referring to them, do NOT use pronouns or descriptions, infer who is being referred to if needed.`;

/**
 * @type {Array<{
 *  identifier: string,
 *  instruction: (DE: DEObject, char: CompleteCharacterReference, currentConversationParticipants: string[]) => string,
 *  onceEstablishedYesNoQuestion: (DE: DEObject, char: CompleteCharacterReference, currentConversationParticipants: string[], data: any) => string | null,
 *  onceEstablishedYesNoQuestionConfirm?: (DE: DEObject, char: CompleteCharacterReference, currentConversationParticipants: string[], data: any) => string | null,
 *  onceEstablishedYesNoQuestionConfirmUserOptions?: (DE: DEObject, char: CompleteCharacterReference, currentConversationParticipants: string[], data: any) => any,
 *  onceEstablishedYesNoQuestionEvenAskerNegatedConfirm?: (DE: DEObject, char: CompleteCharacterReference, currentConversationParticipants: string[], data: any) => string | null,
 *  parseResponseFromInstruction: (DE: DEObject, char: CompleteCharacterReference, currentConversationParticipants: string[], response: string) => Promise<{matched: boolean, coercion?: boolean, data: any}>,
 *  parseResponseFromConfirmation?: (DE: DEObject, char: CompleteCharacterReference, currentConversationParticipants: string[], response: string) => {fighters: string[], allowers: string[], declines: string[]},
 *  execute: (DE: DEObject, char: CompleteCharacterReference, currentConversationParticipants: string[], newConversationParticipants: string[]) => Promise<void>,
 * }>} 
 */
const MOVEMENT_ACTIONS = [
    {
        identifier: "Move Conversation Members",
        instruction(DE, char, currentConversationParticipants) {
            if (currentConversationParticipants.length === 2) {
                return `If ${char.name} is asking physically or by actions to take ${currentConversationParticipants.find(c => c !== char.name)} from the conversation to a new location, determine where to go.
Output the following EXACTLY in your response:

- ${char.name} is trying to take ${currentConversationParticipants.find(c => c !== char.name)} to [NEW_LOCATION]
- ${char.name} is trying to take ${currentConversationParticipants.find(c => c !== char.name)} to a new unspecified location
- ${char.name} is trying to take ${currentConversationParticipants.find(c => c !== char.name)} to a private unspecified location
- ${char.name} is trying to coerce ${currentConversationParticipants.find(c => c !== char.name)} to go to [NEW_LOCATION]
- ${char.name} is trying to coerce ${currentConversationParticipants.find(c => c !== char.name)} to go to a new unspecified location
- ${char.name} is trying to coerce ${currentConversationParticipants.find(c => c !== char.name)} to go to a private unspecified location
- ${char.name} is trying to take the conversation to [NEW_LOCATION]
- ${char.name} is trying to take the conversation to a new unspecified location
- ${char.name} is trying to take the conversation to a private unspecified location`;
            }

            return `If ${char.name} is trying to take participants away from a conversation, determine who they are trying to isolate and where they want to go.
Output the following EXACTLY in your response, please use personal names to refer to characters:

- ${char.name} is trying to take [character_name_a, character_name_b, etc...] from the conversation to [NEW_LOCATION]
- ${char.name} is trying to take [character_name_a, character_name_b, etc...] from the conversation into a new unspecified location
- ${char.name} is trying to take [character_name_a, character_name_b, etc...] from the conversation to a private unspecified location
- ${char.name} is trying to coerce [character_name_a, character_name_b, etc...] to go to [NEW_LOCATION]
- ${char.name} is trying to coerce [character_name_a, character_name_b, etc...] to go to a new unspecified location
- ${char.name} is trying to coerce [character_name_a, character_name_b, etc...] to go to a private unspecified location
- ${char.name} is trying to take the conversation to [NEW_LOCATION]
- ${char.name} is trying to take the conversation to a new unspecified location
- ${char.name} is trying to take the conversation to a private unspecified location
- ${char.name} is trying to coerce everyone in the conversation to go to [NEW_LOCATION]`;
        },
        // allTargets, currentTarget, newWholeLocation, newLocationSlot, coercionUsed
        onceEstablishedYesNoQuestion(DE, char, currentConversationParticipants, data) {
            // Yes even the user would have to answer this question
            const isEveryone = currentConversationParticipants.length === data.allTargets.length;
            if (data.coercion) {
                if (isEveryone && data.currentTarget === DE.user.name) {
                    return `${char.name} is trying to coerce ${data.allTargets.length === 1 ? "you" : "everyone"} to go to ${data.newLocationSlot}, what would you do?`;
                } else if (isEveryone) {
                    return `${char.name} is trying to coerce ${data.allTargets.length === 1 ? data.currentTarget : "everyone"} to go to ${data.newLocationSlot}, what does ${data.currentTarget} do? ${RESPONSE_COERCION_RULES(data.currentTarget)}`;
                } else if (DE.user.name === data.currentTarget) {
                    // @ts-ignore
                    return `${char.name} is trying to coerce you and ${data.allTargets.filter(t => t !== DE.user.name)} to go to ${data.newLocationSlot}, what would you do?`;
                } else {
                    return `${char.name} is trying to coerce ${data.allTargets} to go to ${data.newLocationSlot}, what does ${data.currentTarget} do? ${RESPONSE_COERCION_RULES(data.currentTarget)}`;
                }
            }
            
            if (isEveryone && data.currentTarget === DE.user.name) {
                return `${char.name} wants to move ${data.allTargets.length === 1 ? "you" : "everyone"} to ${data.newLocationSlot}, do you accept?`;
            } else if (isEveryone) {
                return `${char.name} wants to move ${data.allTargets.length === 1 ? data.currentTarget : "everyone"} to ${data.newLocationSlot}, does ${data.currentTarget} accept the idea? ${RESPONSE_CLASSIC_RULES(data.currentTarget)}`;
            }

            if (DE.user.name === data.currentTarget) {
                // @ts-ignore
                return `${char.name} wants to move away from the group and go with ${data.allTargets.map((t) => t !== DE.user.name ? "you" : t)}, do you accept?`;
            } else {
                return `${char.name} wants to move away from the group and go with ${data.allTargets} to ${data.newLocationSlot}, does ${data.currentTarget} accept the idea? ${RESPONSE_CLASSIC_RULES(data.currentTarget)}`;
            }
        },
        onceEstablishedYesNoQuestionConfirm(DE, char, currentConversationParticipants, data) {
            // Yes even the user would have to answer this question
            if (data.negatingTargets.length === 0) {
                return null;
            }
            if (data.negatingTargets.length >= 1 && char.name === DE.user.name) {
                return `${formatAnd(data.negatingTargets)} ${data.negatingTargets.length === 1 ? "does" : "do"} not want to go, do you still want to go?`;
            } else if (data.negatingTargets.length >= 1) {
                return `${formatAnd(data.negatingTargets)} ${data.negatingTargets.length === 1 ? "does" : "do"} not want to go, does ${data.currentTarget} still want to go? ${RESPONSE_CLASSIC_RULES(data.currentTarget)}`;
            }

            return null;
        },
        onceEstablishedYesNoQuestionConfirmUserOptions(DE, char, currentConversationParticipants, data) {
            if (data.coercion) {
                return {
                    "Fight back": "*" + DE.user.name + " fights back*\n\n",
                    "Allow it": "*" + DE.user.name + " allows " + (DE.user.gender === "ambiguous" ? "themself" : (DE.user.gender === "male" ? "himself" : "herself")) + " to be taken*\n\n",
                }
            }
            return {
                "Yes": "*" + DE.user.name + " agrees to go*\n\n",
                "No": "*" + DE.user.name + " declines to go*\n\n",
            }
        },
        onceEstablishedYesNoQuestionEvenAskerNegatedConfirm(DE, char, currentConversationParticipants, data) {
            // Yes even the user would have to answer this question
            if (data.newNegatingTargets.length >= 1 && char.name === DE.user.name) {
                return `${formatAnd(data.newNegatingTargets)} ${data.newNegatingTargets.length === 1 ? "does" : "do"} not want to go, do you still want to go?`;
            } else if (data.newNegatingTargets.length >= 1) {
                return `${formatAnd(data.newNegatingTargets)} ${data.newNegatingTargets.length === 1 ? "does" : "do"} not want to go, does ${data.currentTarget} still want to go? ${RESPONSE_CLASSIC_RULES(data.currentTarget)}`;
            }

            return null;
        },
        async parseResponseFromInstruction(DE, char, currentConversationParticipants, response) {
            // we may need to use inference to know who is character_name_a, character_name_b, etc... when they leave to speak
            // with someone else if they don't specify it directly by name, using the short description, if not
            // we may literally need to ask the name of the characters they are going to speak with, either to the user
            // or to the AI itself if we cannot infer it properly
            
            // TODO
            return {
                matched: false,
                data: null
            }
        },
        parseResponseFromConfirmation(DE, char, currentConversationParticipants, response) {
            // TODO
            return {
                // when fighters are given it means coercion was used
                // the action does not proceed due to the fighting
                fighters: [],
                allowers: [],
                declines: [],
            }
        },
        async execute(DE, char, currentConversationParticipants, newConversationParticipants) {
            // TODO update the game state
        }
    },
    {
        identifier: "Leave Conversation",
        instruction(DE, char, currentConversationParticipants) {
            return `If ${char.name} is actively leaving a conversation that they are part of, and they are already going their way, output the following EXACTLY in your response:
- ${char.name} left to [NEW_LOCATION]
- ${char.name} left to a new unspecified location
- ${char.name} left to a private unspecified location
- ${char.name} has been socially rejected and left to [NEW_LOCATION]
- ${char.name} has been socially rejected and left to a new unspecified location
- ${char.name} has been socially rejected and left to a private unspecified location
- ${char.name} has temporarily left the conversation to [NEW_LOCATION] to speak with [character_name_a, character_name_b, etc...]
- ${char.name} has temporarily left the conversation to a new unspecified location to speak with [character_name_a, character_name_b, etc...]
- ${char.name} has temporarily left the conversation to a private unspecified location to speak with [character_name_a, character_name_b, etc...]
- ${char.name} left with [character_name_a, character_name_b, etc...] to [NEW_LOCATION]
- ${char.name} left with [character_name_a, character_name_b, etc...] to a new unspecified location
- ${char.name} left with [character_name_a, character_name_b, etc...] to a private unspecified location
- ${char.name} left to [NEW_LOCATION] in order to follow [character_name]
- ${char.name} left to follow [character_name]
`;
        },
        onceEstablishedYesNoQuestion(DE, char, currentConversationParticipants, data) {
            // character just left, none can stop them
            // unlike the process of asking to move the conversation this does not require consent
            return null;
        },
        async parseResponseFromInstruction(DE, char, currentConversationParticipants, response) {
            // TODO
            return {
                matched: false,
                coercion: false,
                data: null,
            }
        },
        async execute(DE, char, currentConversationParticipants, newConversationParticipants) {
            // TODO update the game state
            // we may need to use inference to know who is character_a, character_b, etc... when they leave to speak
            // with someone else if they don't specify it directly by name, using the short description, if not
            // we may literally need to ask the name of the characters they are going to speak with, either to the user
            // or to the AI itself if we cannot infer it properly
        }
    },
    {
        identifier: "Kidnapped members",
        instruction(DE, char, currentConversationParticipants) {
            return `If ${char.name} suceeds in forcefully taking away one or more members from the current conversation, output the following EXACTLY in your response:
- ${char.name} has used coercion to take away [character_a, character_b, etc...] to [NEW_LOCATION]
- ${char.name} has used coercion to take away [character_a, character_b, etc...] to a new unspecified location
- ${char.name} has used coercion to take away [character_a, character_b, etc...] to a private unspecified location
`;
        },
        onceEstablishedYesNoQuestion(DE, char, currentConversationParticipants, data) {
            // character moved the characters by force, no consent needed
            return null;
        },
        async parseResponseFromInstruction(DE, char, currentConversationParticipants, response) {
            // TODO
            return {
                matched: false,
                coercion: false,
                data: null,
            }
        },
        async execute(DE, char, currentConversationParticipants, newConversationParticipants) {
            // TODO update the game state
            // we may need to use inference to know who is character_a, character_b, etc... when they leave to speak
            // with someone else if they don't specify it directly by name, using the short description, if not
            // we may literally need to ask the name of the characters they are going to speak with, either to the user
            // or to the AI itself if we cannot infer it properly
        }
    }
]