import { DEngine } from "../index.js";

/**
 * Takes a complete message in the narrative form and converts it into components that conform the message
 * 
 * Returns an array of messages with each author and content separated, for example the following message:
 * 
 * *Alice looks around worried* Hello Jonh how are you doing?
 * 
 * Will turn into:
 * 
 * [
 *   { author: null, origin: "Alice", content: "Alice looks around worried" },
 *   { author: "Alice", origin: "Alice", content: "Hello John how are you doing?" }
 * ]
 * 
 * This allows the engine to separate the narrative parts of the message from the dialogue parts, and also to know who is saying what in a message that may contain multiple sentences and multiple narrative actions.
 * this can later be passed onto parseMessageInComponentsAsText to get
 * 
 * *Alice Looks Around Worried*
 * Alice: Hello Jonh how are you doing?
 * 
 * or it can be used to create more complex UI
 * 
 * This function is also able to take output in the same format, but cannot distinguish character when in such case as it
 * is expected that every time an author is given no spoken part belongs to another character, for example:
 * 
 * When the author is Alice and the message is:
 * 
 * *Alice looks around worried*
 * Bob: Hello Jonh how are you doing?
 * *Alice looks at Bob and smiles*
 * Alice: I'm doing great Bob, thanks for asking!
 * 
 * Would just cause all messages to be attributed to Alice because she is the author
 * 
 * @param {string} author 
 * @param {string} message
 */
export function parseMessageInComponents(author, message) {
    /**
     * @type {Array<{author: string | null, origin: string, content: string}>}
     */
    const finalMessages = [];

    if (author === "Story Master") {
        // for story master messages we will not do any parsing, we will just return the whole message as a single component
        const lines = message.split("\n").map(line => line.trim()).filter(line => !!line);
        const results = [];
        for (const line of lines) {
            results.push({
                author: null,
                origin: author,
                content: line,
            });
        }
        return results;
    }

    const splittedLines = message.split("\n");
    for (const line of splittedLines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith(author + ":")) {
            finalMessages.push({
                author: author,
                origin: author,
                content: trimmedLine.substring(author.length + 2).trim(),
            });
        }
        let inContext = false;
        let accumulatedContext = "";
        for (const char of line) {
            if (char === "*") {
                if (accumulatedContext.trim().length > 0) {
                    finalMessages.push({
                        author: inContext ? null : author,
                        origin: author,
                        content: accumulatedContext.trim(),
                    });
                }

                inContext = !inContext;
                accumulatedContext = "";
            } else {
                accumulatedContext += char;
            }
        }

        if (accumulatedContext.trim().length > 0) {
            finalMessages.push({
                author: inContext ? null : author,
                origin: author,
                content: accumulatedContext.trim(),
            });
        }
    }

    return finalMessages;
}

/**
 * @param {string} author 
 * @param {string} message 
 * @returns {string}
 */
export function parseMessageInComponentsAsText(author, message) {
    const components = parseMessageInComponents(author, message);
    let finalText = "";
    for (const component of components) {
        if (component.author) {
            finalText += `${component.author}: ${component.content}\n\n`;
        } else {
            finalText += `*${component.content}*\n\n`;
        }
    }
    return finalText.trim();
}

/**
 * @param {DEngine} engine
 * @param {DETimeDescription | null} time
 * @param {boolean} includeNowLabel
 */
export function makeTimestamp(engine, time, includeNowLabel = true) {
    if (!time) {
        return "Now";
    }
    if (includeNowLabel && engine.deObject?.currentTime.time === time.time) {
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
 * Returns the whole history for the character up to the specified depth, if the depth
 * is 0, returns all history.
 * 
 * TODO something for optimizing long histories, like summarization of non-pseudo conversations
 * when it starts to get too long, even sumarization of many conversations into a single summary message
 * this will ensure the LLM can handle the context window properly without losing important information
 * 
 * @param {DEngine} engine
 * @param {DECompleteCharacterReference} character
 * @param {{ excludeFrom?: string[] | null, includeDebugMessages?: boolean | null, includeRejectedMessages?: boolean | null, includeHiddenMessages?: boolean | null}} options
 * @return {AsyncGenerator<{name: string, message: string, id: string, conversationId: string | null, debug: boolean, rejected: boolean, hidden: boolean, storyMaster: boolean}, void, boolean>}
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
        let message = `From ${makeTimestamp(engine, fromTime)} to ${makeTimestamp(engine, statesAccumulatedFromTime)}, ` + character.name;
        if (statesAccumulated.size > 0) {
            message += ` finds ${engine.deObject?.functions.format_reflexive(engine.deObject, character, character.name)} in the following states: `;
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
            storyMaster: true,
            hidden: false,
        };
    };

    for (const state of characterStateWithCurrent) {
        if (state.conversationId && !consumedConversationIds.has(state.conversationId)) {
            consumedConversationIds.add(state.conversationId);
            const currentConversationObject = engine.deObject.conversations[state.conversationId];

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
            const conversationMessages = currentConversationObject.messages.filter(msg => (options.includeRejectedMessages || !msg.isRejectedMessage) && (options.includeDebugMessages || !msg.isDebugMessage) && (options.includeHiddenMessages || !msg.isHiddenMessage) &&
                (!msg.canOnlyBeSeenByCharacter || msg.canOnlyBeSeenByCharacter === character.name));

            const conversationLocation = currentConversationObject.location || "an unknown location";
            const conversationStartTime = currentConversationObject.startTime;
            const firstMessageIsStoryMaster = conversationMessages.length > 0 && conversationMessages[0].sender === "Story Master";

            if (currentConversationObject.pseudoConversationSummary || currentConversationObject.pseudoConversation) {
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
                const participantsExcludingCharacter = currentConversationObject.participants.filter(p => p !== character.name);
                const timeMark = makeTimestamp(engine, conversationStartTime);
                const withOrAlone = participantsExcludingCharacter.length === 0 ? "on their own" : "with " + engine.deObject.functions.format_and(engine.deObject, null, participantsExcludingCharacter);

                const expectedId = `story-master-${state.conversationId}-summary`;
                const keepgoing = yield {
                    name: "Story Master",
                    message: (timeMark === "Now" ? "Right Now" : "At " + timeMark) + ", " + character.name + " is at " + conversationLocation + " " + withOrAlone + ". The interaction happened as follows:\n\n" + currentConversationObject.pseudoConversationSummary,
                    id: expectedId,
                    conversationId: state.conversationId,
                    debug: false,
                    rejected: false,
                    storyMaster: true,
                    hidden: false,
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
                        storyMaster: message.isStoryMasterMessage,
                        hidden: message.isHiddenMessage,
                    });
                    if (!keepgoing) {
                        return;
                    }
                }

                if (!firstMessageIsStoryMaster) {
                    const participantsExcludingCharacter = currentConversationObject.participants.filter(p => p !== character.name);
                    const timeMark = makeTimestamp(engine, conversationStartTime);
                    const timeMarkDetailed = timeMark === "Now" ? "right now" : "at " + timeMark;
                    const withOrAlone = participantsExcludingCharacter.length === 0 ? "on their own" : "with " + engine.deObject.functions.format_and(engine.deObject, null, participantsExcludingCharacter);
                    const keepgoing = yield {
                        name: "Story Master",
                        message: "The following interaction took place " + timeMarkDetailed + ", " + character.name + " is at " + conversationLocation + withOrAlone + ".",
                        id: `story-master-${state.conversationId}-interaction-info`,
                        conversationId: state.conversationId,
                        debug: false,
                        rejected: false,
                        storyMaster: true,
                        hidden: false,
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
 * Returns a chunk of the history for the character up to the specified depth, if the depth
 * is 0, returns all history.
 * 
 * TODO implement useExponentialShrinkingSelectiveContextWindowStrategy
 * VERYIMPORTANT TODO
 * 
 * @param {DEngine} engine
 * @param {DECompleteCharacterReference} character
 * @param {{
 *   excludeFrom?: string[] | null,
 *   includeDebugMessages?: boolean | null,
 *   includeRejectedMessages?: boolean | null,
 *   includeHiddenMessages?: boolean | null,
 *   msgLimit: "LAST_CYCLE" | "LAST_CYCLE_EXCLUDE_CHAR" | "LAST_STORY_FRAGMENT_FROM_CHAR" | "LAST_CYCLE_EXPANDED" | "LAST_CYCLE_EXPANDED_EXCLUDE_CHAR" | "ALL",
 *   countTokens?: (text: string) => Promise<number>,
 *   contextWindowSize?: number,
 *   useExponentialShrinkingSelectiveContextWindowStrategy?: boolean,
 * }} options
 */
export async function getHistoryFragmentForCharacter(engine, character, options) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    const allHistory = getHistoryForCharacter(engine, character, options);
    let generator = await allHistory.next();

    /**
     * @type {string[]}
     */
    let messagesToAdd = [];
    /**
     * @type {string[]}
     */
    const interactedCharacters = [];
    /**
     * @type {string[]}
     */
    const mentionedCharacters = [];

    if (options.msgLimit === "ALL" && (!options.countTokens || !options.contextWindowSize)) {
        throw new Error("countTokens and contextWindowSize are required when msgLimit is ALL");
    }

    if (options.useExponentialShrinkingSelectiveContextWindowStrategy && (options.includeDebugMessages || options.includeRejectedMessages || options.includeHiddenMessages)) {
        throw new Error("useExponentialShrinkingSelectiveContextWindowStrategy cannot be used with includeDebugMessages, includeRejectedMessages, or includeHiddenMessages");
    }

    let tokensExhaustedApprox = 512; // initial buffer

    let cycleCount = 0;
    while (!generator.done) {
        if (!generator.value.debug && !generator.value.rejected) {
            let shouldAddMessage = false;
            let shouldStopAddingMessages = false;

            const messageParsed = generator.value.debug ? generator.value.message : parseMessageInComponentsAsText(generator.value.name, generator.value.message);

            if (options.msgLimit === "ALL") {
                // @ts-ignore
                const messageTokens = await options.countTokens(messageParsed);
                tokensExhaustedApprox += messageTokens + 10; // some wiggle room
                // @ts-ignore
                shouldStopAddingMessages = tokensExhaustedApprox >= options.contextWindowSize;
                shouldAddMessage = !shouldStopAddingMessages;
                if (shouldStopAddingMessages) {
                    // this will stop restore it back to before adding the message that caused the overflow, so we are sure to not exceed the context window size
                    tokensExhaustedApprox -= messageTokens + 10; // remove wiggle room if we are not adding the message
                }
            } else if (options.msgLimit === "LAST_STORY_FRAGMENT_FROM_CHAR") {
                shouldAddMessage = generator.value.name === character.name;
                shouldStopAddingMessages = shouldAddMessage;
            } else if (options.msgLimit === "LAST_CYCLE") {
                shouldAddMessage = cycleCount === 0;
            } else if (options.msgLimit === "LAST_CYCLE_EXCLUDE_CHAR") {
                shouldAddMessage = cycleCount === 0 && generator.value.name !== character.name;
            } else if (options.msgLimit === "LAST_CYCLE_EXPANDED") {
                shouldAddMessage = cycleCount === 0 || (cycleCount === 1 && generator.value.name !== character.name);
            } else if (options.msgLimit === "LAST_CYCLE_EXPANDED_EXCLUDE_CHAR") {
                shouldAddMessage = (cycleCount === 0 && generator.value.name !== character.name) || (cycleCount === 1 && generator.value.name !== character.name);
            }

            if (generator.value.name === character.name) {
                cycleCount++;
            }

            if (options.msgLimit === "LAST_CYCLE" || options.msgLimit === "LAST_CYCLE_EXCLUDE_CHAR") {
                shouldStopAddingMessages = cycleCount >= 1;
            }
            if (options.msgLimit === "LAST_CYCLE_EXPANDED" || options.msgLimit === "LAST_CYCLE_EXPANDED_EXCLUDE_CHAR") {
                shouldStopAddingMessages = cycleCount >= 2;
            }

            if (shouldAddMessage) {
                messagesToAdd.push(messageParsed);
                if (!interactedCharacters.includes(generator.value.name) && !generator.value.storyMaster) {
                    interactedCharacters.push(generator.value.name);
                    if (!mentionedCharacters.includes(generator.value.name)) {
                        mentionedCharacters.push(generator.value.name);
                    }
                }
                if (generator.value.storyMaster) {
                    // we want to extract mentioned characters from the story master messages as well, because they can contain important information about the world and the interactions that took place, so we want to make sure to include them in the context of the character, even if they are not directly interacting with them, because they can be mentioned in the story master messages as part of the interactions that took place
                    for (const charName of Object.keys(engine.deObject.characters)) {
                        const pattern = new RegExp(`(?<![\\w])${charName}(?![\\w])`, 'i');
                        if (pattern.test(generator.value.message) && !mentionedCharacters.includes(charName)) {
                            mentionedCharacters.push(charName);
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
        interactedCharacters,
        mentionedCharacters,
        tokensExhaustedApprox,
    }
}