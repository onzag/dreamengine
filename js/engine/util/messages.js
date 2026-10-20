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
 * @param {import("../index.js").DEngine} engine
 * @param {DECompleteCharacterReference} character
 * @param {DECompleteCharacterReference} otherCharacter
 */
export function getNameIdentificationForOneCharacterTowardsAnother(engine, character, otherCharacter) {
    const knowsThemAs = getNameIdentificationForOneCharacterTowardsAnotherOnlyName(engine, character, otherCharacter);
    return "<" + otherCharacter.id + ":" + knowsThemAs + ">";
}

/**
 * Provides the name that one character knows another character as, based on their bond and knowledge of each other.
 * @param {import("../index.js").DEngine} engine
 * @param {DECompleteCharacterReference} character
 * @param {DECompleteCharacterReference} otherCharacter
 */
export function getNameIdentificationForOneCharacterTowardsAnotherOnlyName(engine, character, otherCharacter) {
    if (character.id === otherCharacter.id) {
        // you know yourself, so return your own name
        return character.name;
    }

    const defaultName = otherCharacter.unknownName;
    const characterBond = engine.getDEObject().bonds[character.id]?.active.find(b => b.towards === otherCharacter.id) ||
        engine.getDEObject().bonds[character.id]?.ex.find(b => b.towards === otherCharacter.id);

    const knowsThemAs = (characterBond ? characterBond.knowsAs.find(k => k.primary) || characterBond.knowsAs[0] : null) || null;
    const actualNameKnowsThemAs = knowsThemAs?.nickname ?
        ((characterBond ? characterBond.knowsAs.find(k => k.name === otherCharacter.name) || characterBond.knowsAs.find((k) => !k.nickname) : null) || null): null;
    
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
 *  enrichedMode?: boolean | null,
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
        // @ts-ignore typescript is wrong, deObject has been null checked at the beginning of the function
        let message = `From ${makeTimestamp(engine.deObject, fromTime)} to ${makeTimestamp(engine.deObject, statesAccumulatedFromTime)}, ` + character.name;
        if (statesAccumulated.size > 0) {
            message += ` finds ${engine.getDEObject().utils.templates.formatReflexive([character])} in the following states: `;
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

        /**
         * @type {DEConversationMessageNarration}
         */
        const narrationMessage = {
            type: "narration",
            fragments: [
                {
                    type: "narration",
                    text: message,
                },
            ],
        };

        return {
            name: "Story Master",
            characterId: null,
            content: [
                narrationMessage,
            ],
            id: null,
            gid: `story-master-states-${character.id}-${fromTime.time}`,
            conversationId: null,
            debug: false,
            rejected: false,
            storyMaster: true,
            hidden: false,
            interactingCharacters: [
                character.id,
            ],
            emotion: null,
            emotionalRange: null,
            untimed: true,
        };
    };

    // TODO refactor this, need to figure enrichedMode and useExponentialShrinkingSelectiveContextWindowStrategy
    for (const state of characterStateWithCurrent) {
        if (state.conversationId && !consumedConversationIds.has(state.conversationId)) {
            consumedConversationIds.add(state.conversationId);
            const currentConversationObject = engine.deObject.conversations[state.conversationId];

            if (!currentConversationId && options.enrichedMode) {
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
                const withOrAlone = participantsExcludingCharacter.length === 0 ? "on their own" : "with " + engine.deObject.utils.templates.formatAnd(participantsExcludingCharacter);

                const expectedId = `story-master-${state.conversationId}-summary`;
                const keepgoing = yield {
                    name: "Story Master",
                    content: [
                        {
                            type: "narration",
                            fragments: [
                                {
                                    type: "narration",
                                    text: (timeMark === "Now" ? "Right Now" : "At " + timeMark) + ", " + character.name + " is at " + conversationLocation + " " + withOrAlone + ". The interaction happened as follows:\n\n" + currentConversationObject.pseudoConversationSummary,
                                },
                            ],
                        },
                    ],
                    characterId: null,
                    id: null,
                    conversationId: state.conversationId,
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
                    if (options.excludeFrom && options.excludeFrom.includes(message.characterId)) {
                        continue;
                    }

                    const otherCharInfo = engine.getDEObject().characters[message.characterId];
                    const knownName = getNameIdentificationForOneCharacterTowardsAnother(engine, character, otherCharInfo);
                    
                    const keepgoing = yield ({
                        name: knownName,
                        content: message.content,
                        id: message.id,
                        characterId: message.characterId,
                        conversationId: state.conversationId,
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
                    const participantsExcludingCharacter = currentConversationObject.participants.filter(p => p !== character.name);
                    const timeMark = makeTimestamp(engine.deObject, conversationStartTime);
                    const timeMarkDetailed = timeMark === "Now" ? "right now" : "at " + timeMark;
                    const withOrAlone = participantsExcludingCharacter.length === 0 ? "on their own" : "with " + engine.deObject.utils.templates.formatAnd(participantsExcludingCharacter);
                    const keepgoing = yield {
                        name: "Story Master",
                        content: [
                            {
                                type: "narration",
                                text: "The following interaction took place " + timeMarkDetailed + ", " + character.name + " is at " + conversationLocation + withOrAlone + ".",
                            },
                        ],
                        id: null,
                        characterId: null,
                        conversationId: state.conversationId,
                        debug: false,
                        rejected: false,
                        storyMaster: true,
                        hidden: false,
                        interactingCharacters: currentConversationObject.participants,
                        gid: `story-master-${state.conversationId}-interaction-info`,
                        emotion: null,
                        emotionalRange: null,
                        untimed: true,
                    };
                    if (!keepgoing) {
                        return;
                    }
                }
            }

            currentConversationId = state.conversationId;
        } else if (!state.conversationId) {
            currentConversationId = null;
            if (statesAccumulatedAtLocation && statesAccumulatedAtLocation !== state.location && options.enrichedMode) {
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
    if ((statesAccumulated.size > 0 || statesAccumulatedAtLocation) && lastStateObjectHandled && options.enrichedMode) {
        const keepgoing = yield consumeAccumulatedStatesAndLocations(lastStateObjectHandled.time);
        if (!keepgoing) {
            return;
        }
    }
}

/**
 * @param {Array<DEConversationMessageNarration | DEConversationMessageDialogue>} content
 * @param {string} author
 * @param {boolean} storyMaster
 */
export function convertContentToSimpleList(content, author, storyMaster) {
    /**
     * @type {Array<{author: string, message: string, storyMaster: boolean}>}
     */
    const finalList = [];
    for (const contentPart of content) {
        if (contentPart.type === "narration") {
            finalList.push({
                author: storyMaster ? "Story Master" : author,
                message: "*" + contentPart.text + "*",
                storyMaster: storyMaster,
            });
        } else if (contentPart.type === "dialogue") {
            // Reconstruct the authored format: spoken words are plain, action-beat narration
            // goes back inside asterisks, and voice/sound tags back inside square brackets.
            // The stored fragments never contain these markers themselves.
            const pieces = [];
            for (const fragment of contentPart.fragments) {
                const text = (fragment.text || "").trim();
                if (!text) {
                    continue;
                }
                if (fragment.type === "narration") {
                    pieces.push("*" + text + "*");
                } else if (fragment.type === "dialogue") {
                    pieces.push(text);
                } else if (fragment.type === "sound") {
                    pieces.push("[" + text + "]");
                }
            }
            finalList.push({
                author: author,
                message: author + ": " + pieces.join(" "),
                storyMaster: storyMaster,
            });
        }
    }
    return finalList;
}

/**
 * @param {Array<{content: Array<DEConversationMessageNarration | DEConversationMessageDialogue>, author: string, storyMaster: boolean, id: string | null, conversationId: string | null}>} messages 
 */
export function convertMessagesToSimpleList(messages) {
    const accumulatedLists = messages.map(msg => convertContentToSimpleList(msg.content, msg.author, msg.storyMaster));
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
 * @returns {Promise<{messages: Array<{content: Array<DEConversationMessageNarration | DEConversationMessageDialogue>, author: string, storyMaster: boolean, id: string | null, conversationId: string | null}>, conversingCharacters: string[], mentionedCharacters: string[]}>}
 */
export async function getHistoryFragmentForCharacter(engine, character, options) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    const allHistory = getHistoryForCharacter(engine, character, options);
    let generator = await allHistory.next();

    /**
     * @type {Array<{content: Array<DEConversationMessageNarration | DEConversationMessageDialogue>, author: string, storyMaster: boolean, id: string | null, conversationId: string | null}>}
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
                shouldAddMessage = cycleCount === 0 && generator.value.name !== character.name;
            } else if (options.msgLimit === "ALL_MESSAGES_SINCE_CHAR_2ND_LAST_MESSAGE_INCLUDING_CHAR_2ND_LAST_MESSAGE") {
                shouldAddMessage = cycleCount === 0 || (cycleCount === 1 && generator.value.name !== character.name);
            } else if (options.msgLimit === "ALL_MESSAGES_SINCE_CHAR_2ND_LAST_MESSAGE_EXCLUDING_CHAR_2ND_LAST_MESSAGE") {
                shouldAddMessage = (cycleCount === 0 && generator.value.name !== character.name) || (cycleCount === 1 && generator.value.name !== character.name);
            } else if (options.msgLimit === "ALL_UNTIMED_MESSAGES_UNTIL_FIRST_TIMED_MESSAGE") {
                shouldAddMessage = generator.value.untimed;
                shouldStopAddingMessages = !generator.value.untimed;
            }

            if (generator.value.name === character.name) {
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
                    author: generator.value.name,
                    storyMaster: generator.value.storyMaster,
                    id: generator.value.id,
                    conversationId: generator.value.conversationId,
                });
                if (!conversingCharacters.includes(generator.value.name) && !generator.value.storyMaster) {
                    conversingCharacters.push(generator.value.name);
                    if (!mentionedCharacters.includes(generator.value.name)) {
                        mentionedCharacters.push(generator.value.name);
                    }
                }
                for (const charName of generator.value.interactingCharacters) {
                    if (!mentionedCharacters.includes(charName)) {
                        mentionedCharacters.push(charName);
                    }
                }
                if (generator.value.storyMaster) {
                    // we want to extract mentioned characters from the story master messages as well, because they can contain important information about the world and the interactions that took place, so we want to make sure to include them in the context of the character, even if they are not directly interacting with them, because they can be mentioned in the story master messages as part of the interactions that took place
                    for (const charName of Object.keys(engine.deObject.characters)) {
                        const pattern = new RegExp(`(?<![\\w])${charName}(?![\\w])`, 'i');
                        for (const contentPart of content) {
                            if (contentPart.type === "narration" && pattern.test(contentPart.text) && !mentionedCharacters.includes(charName)) {
                                mentionedCharacters.push(charName);
                            } else if (contentPart.type === "dialogue") {
                                for (const fragment of contentPart.fragments) {
                                    if (fragment.type === "narration" && pattern.test(fragment.text) && !mentionedCharacters.includes(charName)) {
                                        mentionedCharacters.push(charName);
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