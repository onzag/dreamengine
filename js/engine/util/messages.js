/**
 * @param {DEObject} deObject
 * @param {DETimeDescription | null} time
 * @param {boolean} includeNowLabel
 */
export function makeTimestamp(deObject, time, includeNowLabel = true) {
    if (!time) {
        return "Now";
    }
    if (includeNowLabel && deObject?.currentTime.time === time.time) {
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

/**
 * Provides the name that one character knows another character as, based on their bond and knowledge of each other.
 * @param {DEObject} deObject
 * @param {DECompleteCharacterReference} character
 * @param {DECompleteCharacterReference} otherCharacter
 */
export function getNameIdentificationForOneCharacterTowardsAnother(deObject, character, otherCharacter) {
    const knowsThemAs = getNameIdentificationForOneCharacterTowardsAnotherOnlyName(deObject, character, otherCharacter);
    return "<" + otherCharacter.id + ":" + knowsThemAs + ">";
}

/**
 * Provides the name that one character knows another character as, based on their bond and knowledge of each other.
 * @param {DEObject} deObject
 * @param {DECompleteCharacterReference} character our character
 * @param {DECompleteCharacterReference} otherCharacter the character to get the name for, as known by our character
 */
export function getNameIdentificationForOneCharacterTowardsAnotherOnlyName(deObject, character, otherCharacter) {
    if (character.id === otherCharacter.id) {
        // you know yourself, so return your own name
        return character.name;
    }

    const defaultName = otherCharacter.unknownName;
    const characterBond = deObject.bonds[character.id]?.active.find(b => b.towards === otherCharacter.id) ||
        deObject.bonds[character.id]?.ex.find(b => b.towards === otherCharacter.id);

    const knowsThemAs = (characterBond ? characterBond.knowsAs.find(k => k.primary) || characterBond.knowsAs[0] : null) || null;
    const actualNameKnowsThemAs = knowsThemAs?.nickname ?
        ((characterBond ? characterBond.knowsAs.find(k => k.name === otherCharacter.name) || characterBond.knowsAs.find((k) => !k.nickname) : null) || null) : null;

    /**
     * @type {string}
     */
    let finalone;
    if (knowsThemAs) {
        if (actualNameKnowsThemAs) {
            finalone = actualNameKnowsThemAs.name + (actualNameKnowsThemAs.nickname ? `, ${actualNameKnowsThemAs.nickname}` : "");
        } else {
            finalone = knowsThemAs.name;
        }
    } else {
        finalone = defaultName;
    }

    return finalone;
}

/**
 * Builds narration fragments for a list of characters, joining them with commas and "and"
 * in the same style as formatAnd, where each character becomes an identifier fragment that
 * carries the name the given character knows them as.
 * @param {import("../index.js").DEngine} engine
 * @param {DECompleteCharacterReference} character the character whose perspective is used for naming
 * @param {string[]} participantIds the ids of the characters to list
 * @returns {Array<DEConversationMessageNarrationFragment>}
 */
export function buildCharacterListNarrationFragments(engine, character, participantIds) {
    /**
     * @type {Array<DEConversationMessageNarrationFragment>}
     */
    const fragments = [];
    participantIds.forEach((participantId, index) => {
        if (index > 0) {
            fragments.push(index === participantIds.length - 1
                ? (participantIds.length === 2 ? " and " : ", and ")
                : ", ");
        }
        const participantChar = engine.getDEObject().characters[participantId];
        fragments.push({
            type: "identifier",
            text: getNameIdentificationForOneCharacterTowardsAnotherOnlyName(engine.getDEObject(), character, participantChar),
            identifier: participantId,
            foundAs: "character",
        });
    });
    return fragments;
}

/**
 * Renders an array of narration-style fragments (plain strings or identifier fragments)
 * into a single plain-text string, using the known name carried by identifier fragments.
 * @param {Array<string | DEConversationMessageFragmentIdentifier>} fragments
 * @returns {string}
 */
export function renderNarrationFragmentsToText(fragments) {
    let text = "";
    for (const fragment of fragments) {
        if (typeof fragment === "string") {
            text += fragment;
        } else {
            text += fragment.text;
        }
    }
    return text;
}

/**
 * @typedef {Object} DEObjectMessageGeneratorResult
 * @property {string} name the name of the character or entity that generated the message as known by the character that was passed in
 * @property {string | null} characterId the id of the character that actually generated the message, if this message belongs to an actual character, otherwise null
 * @property {Array<DEConversationMessageNarration | DEConversationMessageDialogue>} content the message content, can be a narrative or a dialogue
 * @property {string | null} conversationId the id of the conversation this message belongs to, if any, otherwise null
 * @property {string | null} id the id of the message, if this is a conversation message, otherwise null
 * @property {boolean} debug whether this is a debug message
 * @property {boolean} rejected whether this message was rejected by the story master or not
 * @property {boolean} hidden whether this message is hidden or not
 * @property {boolean} storyMaster whether this message is from the story master or not
 * @property {string[]} interactingCharacters the interacting characters in this message
 * @property {string} gid a global id, always available, always unique, can be used to identify a message uniquely
 * @property {DEEmotionNames|null} emotion the primary emotion of the message, provided there is a sender
 * @property {DEEmotionNames[]|null} emotionalRange the emotional range of the message
 * @property {boolean} untimed whether this message is untimed or not
 */

/**
 * Returns the whole history for the character up to the specified depth, if the depth
 * is 0, returns all history.
 * 
 * TODO something for optimizing long histories, like summarization of non-pseudo conversations
 * when it starts to get too long, even sumarization of many conversations into a single summary message
 * this will ensure the LLM can handle the context window properly without losing important information
 * 
 * @param {import("../index.js").DEngine} engine
 * @param {DECompleteCharacterReference} character
 * @param {{
 *  excludeFrom?: string[] | null,
 *  includeDebugMessages?: boolean | null,
 *  includeRejectedMessages?: boolean | null,
 *  includeHiddenMessages?: boolean | null,
 *  useExponentialShrinkingSelectiveContextWindowStrategy?: boolean,
 *  enrichedMode?: boolean,
 * }} options
 * @return {AsyncGenerator<DEObjectMessageGeneratorResult, void, boolean>}
 */
export async function* getHistoryForCharacter(engine, character, options) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    } else if (!engine.deObject.stateFor[character.name]) {
        throw new Error(`Character state for ${character.name} not found.`);
    } else if (!engine.pseudoConversationSummaryGenerator) {
        // TODO reenable this error once we have a proper LLM integration
        // throw new Error("Pseudo conversation summary generator not initialized.");
    }

    const characterState = engine.deObject.stateFor[character.name];
    let currentConversationId = characterState.conversationId;

    while (currentConversationId) {
        const currentConversationObject = await engine.dataManager?.getConversation(currentConversationId);

        if (!currentConversationObject) {
            return;
        }

        // process the conversation messages
        const conversationMessages = currentConversationObject.messages.filter(msg => (options.includeRejectedMessages || !msg.isRejectedMessage) && (options.includeDebugMessages || !msg.isDebugMessage) && (options.includeHiddenMessages || !msg.isHiddenMessage) &&
            (!msg.canOnlyBeSeenByCharacter || msg.canOnlyBeSeenByCharacter === character.id));

        const conversationLocation = currentConversationObject.location || "an unknown location";
        const conversationStartTime = currentConversationObject.startTime;
        const firstMessageIsStoryMaster = conversationMessages.length > 0 && conversationMessages[0].isStoryMasterMessage;

        if ((currentConversationObject.pseudoConversationSummary || currentConversationObject.pseudoConversation) && options.enrichedMode) {
            if (!currentConversationObject.pseudoConversationSummary) {
                // generate summary, it doesn't exist yet, but we need to have a conversation for what this
                // character has been through and been doing
                // @ts-ignore
                currentConversationObject.pseudoConversationSummary = await this.pseudoConversationSummaryGenerator(
                    engine.deObject,
                    currentConversationObject.participants.map((v) => engine.deObject?.characters[v]),
                    currentConversationObject,
                );
            }
            const participantsExcludingCharacter = currentConversationObject.participants.filter(p => p !== character.id);
            const timeMark = makeTimestamp(engine.deObject, conversationStartTime);

            /**
             * @type {Array<DEConversationMessageNarrationFragment>}
             */
            const summaryFragments = [
                (timeMark === "Now" ? "Right Now" : "At " + timeMark) + ", ",
                {
                    type: "identifier",
                    text: character.name,
                    identifier: character.id,
                    foundAs: "character",
                },
                " is at " + conversationLocation + " ",
            ];

            if (participantsExcludingCharacter.length === 0) {
                summaryFragments.push("on their own");
            } else {
                summaryFragments.push("with ");
                summaryFragments.push(...buildCharacterListNarrationFragments(engine, character, participantsExcludingCharacter));
            }

            summaryFragments.push(". The interaction happened as follows:\n\n" + currentConversationObject.pseudoConversationSummary);

            const expectedId = `story-master-${currentConversationId}-summary`;
            const keepgoing = yield {
                name: "Story Master",
                content: [
                    {
                        type: "narration",
                        fragments: summaryFragments,
                    },
                ],
                characterId: null,
                id: null,
                conversationId: currentConversationId,
                debug: false,
                rejected: false,
                storyMaster: true,
                hidden: false,
                interactingCharacters: currentConversationObject.participants,
                gid: expectedId,
                emotion: null,
                emotionalRange: null,
                untimed: true,
            };
            if (!keepgoing) {
                return;
            }
        } else {
            for (const message of conversationMessages.reverse()) {
                if (message.characterId && options.excludeFrom && options.excludeFrom.includes(message.characterId)) {
                    continue;
                }

                const otherCharInfo = message.characterId ? engine.getDEObject().characters[message.characterId] : null;
                const knownName = message.isStoryMasterMessage ? "Story Master" : (!otherCharInfo ? "<" + message.characterId + ":Unknown Entity>" : getNameIdentificationForOneCharacterTowardsAnother(engine.getDEObject(), character, otherCharInfo));

                const keepgoing = yield ({
                    name: knownName,
                    // no change if the message is from the character themselves, surely they know all the information they used to create that message
                    content: message.characterId === character.id ? message.content : message.content.map((messageNarrationOrDialogue) => {
                        if (messageNarrationOrDialogue.type === "narration") {
                            return {
                                ...messageNarrationOrDialogue,
                                fragments: messageNarrationOrDialogue.fragments.map((fragment) => {
                                    if (typeof fragment === "string" || (fragment.type === "identifier" && fragment.foundAs !== "character")) {
                                        return fragment;
                                    } else {
                                        const charKnownAs = getNameIdentificationForOneCharacterTowardsAnotherOnlyName(engine.getDEObject(), character, engine.getDEObject().characters[fragment.identifier]);
                                        // already similar enough, don't change it
                                        if (fragment.text.toLowerCase().includes(charKnownAs.toLowerCase())) {
                                            return fragment;
                                        }
                                        return {
                                            ...fragment,
                                            text: charKnownAs,
                                        };
                                    }
                                })
                            };
                        } else {
                            return {
                                ...messageNarrationOrDialogue,
                                fragments: messageNarrationOrDialogue.fragments.map((fragment) => {
                                    if (fragment.type === "narration") {
                                        return {
                                            ...fragment,
                                            fragments: fragment.fragments.map((subFragment) => {
                                                if (typeof subFragment === "string" || (subFragment.type === "identifier" && subFragment.foundAs !== "character")) {
                                                    return subFragment;
                                                } else {
                                                    const charKnownAs = getNameIdentificationForOneCharacterTowardsAnotherOnlyName(engine.getDEObject(), character, engine.getDEObject().characters[subFragment.identifier]);
                                                    if (subFragment.text.toLowerCase().includes(charKnownAs.toLowerCase())) {
                                                        return subFragment;
                                                    }
                                                    return {
                                                        ...subFragment,
                                                        text: charKnownAs,
                                                    };
                                                }
                                            })
                                        };
                                    } else {
                                        return fragment;
                                    }
                                }),
                            };
                        }
                    }),
                    id: message.id,
                    characterId: message.characterId,
                    conversationId: currentConversationId,
                    debug: message.isDebugMessage,
                    rejected: message.isRejectedMessage,
                    storyMaster: message.isStoryMasterMessage,
                    hidden: message.isHiddenMessage,
                    interactingCharacters: message.interactingCharacters || [],
                    gid: message.id,
                    emotion: message.emotion,
                    emotionalRange: message.emotionalRange,
                    untimed: message.untimed || false,
                });
                if (!keepgoing) {
                    return;
                }
            }

            if (!firstMessageIsStoryMaster && options.enrichedMode) {
                const participantsExcludingCharacter = currentConversationObject.participants.filter(p => p !== character.id);
                const timeMark = makeTimestamp(engine.deObject, conversationStartTime);
                const timeMarkDetailed = timeMark === "Now" ? "right now" : "at " + timeMark;

                const characterName = getNameIdentificationForOneCharacterTowardsAnotherOnlyName(engine.deObject, character, character);

                /**
                 * @type {Array<DEConversationMessageNarrationFragment>}
                 */
                const interactionFragments = [
                    "The following interaction took place " + timeMarkDetailed + ", ",
                    {
                        type: "identifier",
                        text: characterName,
                        identifier: character.id,
                        foundAs: "character",
                    },
                    " is at " + conversationLocation + " ",
                ];

                if (participantsExcludingCharacter.length === 0) {
                    interactionFragments.push("on their own");
                } else {
                    interactionFragments.push("with ");
                    interactionFragments.push(...buildCharacterListNarrationFragments(engine, character, participantsExcludingCharacter));
                }

                interactionFragments.push(".");

                const keepgoing = yield {
                    name: "Story Master",
                    content: [
                        {
                            type: "narration",
                            fragments: interactionFragments,
                        },
                    ],
                    id: null,
                    characterId: null,
                    conversationId: currentConversationId,
                    debug: false,
                    rejected: false,
                    storyMaster: true,
                    hidden: false,
                    interactingCharacters: currentConversationObject.participants,
                    gid: `story-master-${currentConversationId}-interaction-info`,
                    emotion: null,
                    emotionalRange: null,
                    untimed: true,
                };
                if (!keepgoing) {
                    return;
                }
            }
        }

        currentConversationId = currentConversationObject.previousConversationIdsPerParticipant?.[character.id] || null;
    }
}

/**
 * @param {Array<DEConversationMessageNarration | DEConversationMessageDialogue>} content
 * @param {string} name
 * @param {string|null} characterId
 * @param {boolean} storyMaster
 * @returns {Array<string>}
 */
export function convertContentToSimpleList(
    content,
    name,
    characterId,
    storyMaster,
) {
    /**
     * @type {Array<string>}
     */
    const finalList = [];
    for (const contentPart of content) {
        if (contentPart.type === "narration") {
            let message = "*";
            for (const fragment of contentPart.fragments) {
                if (typeof fragment === "string") {
                    message += fragment;
                } else if (fragment.type === "identifier") {
                    message += "<" + fragment.identifier + ":" + fragment.text + ">";
                }
            }
            message += "*";
            finalList.push(message);
        } else if (contentPart.type === "dialogue") {
            // Reconstruct the authored format: spoken words are plain, action-beat narration
            // goes back inside asterisks, and voice/sound tags back inside square brackets.
            // The stored fragments never contain these markers themselves.
            const pieces = [];
            for (const fragment of contentPart.fragments) {
                if (fragment.type === "sound") {
                    const text = (fragment.text || "").trim();
                    if (!text) {
                        continue;
                    }
                    pieces.push("[" + text + "]");
                } else {
                    let text = "";
                    for (const subFragment of fragment.fragments) {
                        if (typeof subFragment === "string") {
                            text += subFragment;
                        } else if (subFragment.type === "identifier") {
                            text += "<" + subFragment.identifier + ":" + subFragment.text + ">";
                        }
                    }
                    text = text.trim();
                    if (!text) {
                        continue;
                    }
                    if (fragment.type === "narration") {
                        pieces.push("*" + text + "*");
                    } else {
                        pieces.push(text);
                    }
                }
            }
            finalList.push(storyMaster ? ("Story Master: " + pieces.join(" ")) : ("<" + characterId + ":" + name + ">: " + pieces.join(" ")));
        }
    }
    return finalList;
}

/**
 * @param {Array<{content: Array<DEConversationMessageNarration | DEConversationMessageDialogue>, name: string, storyMaster: boolean, characterId: string | null, conversationId: string | null}>} messages
 * @returns {Array<{message: string, author: string, storyMaster: boolean}>}
 */
export function convertMessagesToSimpleList(messages) {
    const accumulatedLists = messages.map(msg => {
        return convertContentToSimpleList(msg.content, msg.name, msg.characterId, msg.storyMaster).map(message => {
            return {
                message,
                author: msg.name,
                storyMaster: msg.storyMaster,
            };
        })
    });
    return accumulatedLists.flat();
}

/**
 * Returns a chunk of the history for the character up to the specified depth, if the depth
 * is 0, returns all history.
 * 
 * TODO implement useExponentialShrinkingSelectiveContextWindowStrategy
 * VERYIMPORTANT TODO
 * 
 * @param {import("../index.js").DEngine} engine
 * @param {DECompleteCharacterReference} character
 * @param {{
 *   excludeFrom?: string[] | null,
 *   includeDebugMessages?: boolean | null,
 *   includeRejectedMessages?: boolean | null,
 *   includeHiddenMessages?: boolean | null,
 *   msgLimit:
 *      "ALL_MESSAGES_SINCE_CHAR_LAST_MESSAGE_INCLUDING_CHAR_LAST_MESSAGE" |
 *      "ALL_MESSAGES_SINCE_CHAR_LAST_MESSAGE_EXCLUDING_CHAR_LAST_MESSAGE" |
 *      "ALL_MESSAGES_SINCE_CHAR_2ND_LAST_MESSAGE_INCLUDING_CHAR_2ND_LAST_MESSAGE" |
 *      "ALL_MESSAGES_SINCE_CHAR_2ND_LAST_MESSAGE_EXCLUDING_CHAR_2ND_LAST_MESSAGE" |
 *      "ALL_UNTIMED_MESSAGES_UNTIL_FIRST_TIMED_MESSAGE" |
 *      "ALL",
 *   useExponentialShrinkingSelectiveContextWindowStrategy?: boolean,
 *   enrichedMode?: boolean,
 * }} options
 * @returns {Promise<{messages: Array<{content: Array<DEConversationMessageNarration | DEConversationMessageDialogue>, name: string, characterId: string | null, storyMaster: boolean, id: string | null, conversationId: string | null}>, conversingCharacters: string[], mentionedCharacters: string[]}>}
 */
export async function getHistoryFragmentForCharacter(engine, character, options) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    const allHistory = getHistoryForCharacter(engine, character, options);
    let generator = await allHistory.next();

    /**
     * @type {Array<{content: Array<DEConversationMessageNarration | DEConversationMessageDialogue>, name: string, characterId: string | null, storyMaster: boolean, id: string | null, conversationId: string | null}>}
     */
    let messagesToAdd = [];
    /**
     * @type {string[]}
     */
    const conversingCharacters = [];
    /**
     * @type {string[]}
     */
    const mentionedCharacters = [];

    if (options.useExponentialShrinkingSelectiveContextWindowStrategy && (options.includeDebugMessages || options.includeRejectedMessages || options.includeHiddenMessages)) {
        throw new Error("useExponentialShrinkingSelectiveContextWindowStrategy cannot be used with includeDebugMessages, includeRejectedMessages, or includeHiddenMessages");
    }

    if (options.useExponentialShrinkingSelectiveContextWindowStrategy && (options.enrichedMode === false)) {
        throw new Error("useExponentialShrinkingSelectiveContextWindowStrategy cannot be used with enrichedMode set to an explicit false");
    }

    // TODO implement useExponentialShrinkingSelectiveContextWindowStrategy
    // if (options.useExponentialShrinkingSelectiveContextWindowStrategy) {
    //     throw new Error("useExponentialShrinkingSelectiveContextWindowStrategy is not yet implemented");
    // }

    let cycleCount = 0;
    while (!generator.done) {
        if (!generator.value.debug && !generator.value.rejected) {
            let shouldAddMessage = false;
            let shouldStopAddingMessages = false;

            const content = generator.value.content;

            if (options.msgLimit === "ALL") {
                shouldStopAddingMessages = false;
                shouldAddMessage = true;
            } else if (options.msgLimit === "ALL_MESSAGES_SINCE_CHAR_LAST_MESSAGE_INCLUDING_CHAR_LAST_MESSAGE") {
                shouldAddMessage = cycleCount === 0;
            } else if (options.msgLimit === "ALL_MESSAGES_SINCE_CHAR_LAST_MESSAGE_EXCLUDING_CHAR_LAST_MESSAGE") {
                shouldAddMessage = cycleCount === 0 && generator.value.characterId !== character.id;
            } else if (options.msgLimit === "ALL_MESSAGES_SINCE_CHAR_2ND_LAST_MESSAGE_INCLUDING_CHAR_2ND_LAST_MESSAGE") {
                shouldAddMessage = cycleCount === 0 || (cycleCount === 1 && generator.value.characterId !== character.id);
            } else if (options.msgLimit === "ALL_MESSAGES_SINCE_CHAR_2ND_LAST_MESSAGE_EXCLUDING_CHAR_2ND_LAST_MESSAGE") {
                shouldAddMessage = (cycleCount === 0 && generator.value.characterId !== character.id) || (cycleCount === 1 && generator.value.characterId !== character.id);
            } else if (options.msgLimit === "ALL_UNTIMED_MESSAGES_UNTIL_FIRST_TIMED_MESSAGE") {
                shouldAddMessage = generator.value.untimed;
                shouldStopAddingMessages = !generator.value.untimed;
            }

            if (generator.value.characterId === character.id) {
                cycleCount++;
            }

            if (
                options.msgLimit === "ALL_MESSAGES_SINCE_CHAR_LAST_MESSAGE_INCLUDING_CHAR_LAST_MESSAGE" ||
                options.msgLimit === "ALL_MESSAGES_SINCE_CHAR_LAST_MESSAGE_EXCLUDING_CHAR_LAST_MESSAGE"
            ) {
                shouldStopAddingMessages = cycleCount >= 1;
            }
            if (
                options.msgLimit === "ALL_MESSAGES_SINCE_CHAR_2ND_LAST_MESSAGE_INCLUDING_CHAR_2ND_LAST_MESSAGE" ||
                options.msgLimit === "ALL_MESSAGES_SINCE_CHAR_2ND_LAST_MESSAGE_EXCLUDING_CHAR_2ND_LAST_MESSAGE"
            ) {
                shouldStopAddingMessages = cycleCount >= 2;
            }

            if (shouldAddMessage) {
                messagesToAdd.push({
                    content: content,
                    name: generator.value.name,
                    characterId: generator.value.characterId,
                    storyMaster: generator.value.storyMaster,
                    id: generator.value.id,
                    conversationId: generator.value.conversationId,
                });
                if (generator.value.characterId) {
                    if (!conversingCharacters.includes(generator.value.characterId) && !generator.value.storyMaster) {
                        conversingCharacters.push(generator.value.characterId);
                        if (!mentionedCharacters.includes(generator.value.characterId)) {
                            mentionedCharacters.push(generator.value.characterId);
                        }
                    }
                }
                for (const charId of generator.value.interactingCharacters) {
                    if (!mentionedCharacters.includes(charId)) {
                        mentionedCharacters.push(charId);
                    }
                }
                for (const contentBit of generator.value.content) {
                    if (contentBit.type === "narration") {
                        for (const fragment of contentBit.fragments) {
                            if (typeof fragment !== "string" && fragment.type === "identifier" && !mentionedCharacters.includes(fragment.identifier) && fragment.foundAs === "character") {
                                mentionedCharacters.push(fragment.identifier);
                            }
                        }
                    } else if (contentBit.type === "dialogue") {
                        for (const fragment of contentBit.fragments) {
                            if (fragment.type === "narration") {
                                for (const subFragment of fragment.fragments) {
                                    if (typeof subFragment !== "string" && subFragment.type === "identifier" && !mentionedCharacters.includes(subFragment.identifier) && subFragment.foundAs === "character") {
                                        mentionedCharacters.push(subFragment.identifier);
                                    }
                                }
                            } else if (fragment.type === "dialogue") {
                                for (const subFragment of fragment.fragments) {
                                    if (typeof subFragment !== "string" && subFragment.type === "identifier" && !mentionedCharacters.includes(subFragment.identifier) && subFragment.foundAs === "character") {
                                        mentionedCharacters.push(subFragment.identifier);
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if (shouldStopAddingMessages) {
                await allHistory.return();
                break;
            }
        }
        generator = await allHistory.next(true);
    }

    messagesToAdd = messagesToAdd.reverse();

    return {
        messages: messagesToAdd,
        conversingCharacters,
        mentionedCharacters,
    }
}
