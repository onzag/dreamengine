/**
 * This adapter connects to a local server running a Llama 3 based model, and sets it up
 * for uncensored content and think tags.
 * 
 * The model is expected to support the think tags <think> and </think> to separate reasoning from normal output.
 */

import { DEngine } from '../index.js';
import { BaseInferenceAdapter } from './base.js';

function cheapRID() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * Replaces multiple consecutive new lines with a maximum of two new lines.
 * @param {string} text 
 * @returns {string}
 */
function replaceMultipleNewLines(text) {
    return text.replace(/\n{3,}/g, "\n\n");
}

/**
 * @param {string} text 
 */
function getLastParagraphChunkOf(text) {
    // get the last paragraph of the text
    const lastParagraph = text.split("\n\n").slice(-1)[0];
    // we want to always cut it, so it always starts with ... so we always want to cut it a bit shorter
    // by default we want to show the last 60, but we will reduce that
    let truncateToLength = 60;
    while (lastParagraph.length < truncateToLength && truncateToLength > 0) {
        truncateToLength -= 10;
    }
    // now we will cut the paragraph to that size, then split in words and drop the first word which may have been cut in half and join again
    const truncated = lastParagraph.slice(-truncateToLength).split(" ").slice(1).join(" ");
    // now we can add our ellipsis
    return "..." + truncated;
}

export class InferenceAdapterLlamaUncensored extends BaseInferenceAdapter {
    /**
     * @param {DEngine} parent 
     * @param {{
     *    host?: string;
     *    thinking?: {
     *        thinkTagOpen?: string;
     *        thinkTagClose?: string;
     *    }
     *    apiKey?: string;
     *    secret?: string;
     * }} options
     */
    constructor(parent, options) {
        super(parent);

        /**
         * @type {(() => void) | null}
         */
        this.resolveInitializePromise = null;
        /**
         * @type {((err: any) => void) | null}
         */
        this.rejectInitializePromise = null;

        /**
         * The function that takes in streamed data
         * @type {((data: string | number, done: boolean, err: string | null) => void) | null}
         */
        this.streamingAwaiter = null;

        this.connected = false;
        /**
         * @type {string | null}
         */
        this.reason = null;

        this.onData = this.onData.bind(this);
        this.options = options;

        /**
         * @type {Object.<string, [(data: any) => void, (err: any) => void]>}
         */
        this.listener = {};
    }

    /**
     * Counts the number of tokens in the given text.
     * @param {string} text 
     * @returns {Promise<number>}
     */
    async countTokens(text) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket is not open");
        }
        if (this.streamingAwaiter) {
            throw new Error("Another inference is already in progress");
        }

        const rid = cheapRID();
        this.socket.send(JSON.stringify({ action: "count-tokens", payload: { text }, rid }));
        const data = await (new Promise((resolve, reject) => {
            this.listener[rid] = [resolve, (err) => {
                delete this.listener[rid];
                reject(new Error(err));
            }];
        }));
        delete this.listener[rid];

        const tokenCount = data.n_tokens;
        if (typeof tokenCount !== "number") {
            throw new Error("Invalid response for token count: " + JSON.stringify(data));
        }
        return tokenCount;
    }

    async ensureInitialized() {
        if (this.connected) {
            return;
        }

        if (this.socket) {
            return new Promise((resolve, reject) => {
                // @ts-ignore
                this.onConnectionStatusChangePromises.push([resolve, (err) => reject(new Error(err))]);
            });
        }

        await this.initialize();
    }

    async initialize() {
        if (this.connected) {
            return;
        }

        console.log("InferenceAdapterLlamaUncensored: Initializing connection to server at " + (this.options.host || 'ws://127.0.0.1:8765'));

        // set a websocket to the local server
        this.socket = new WebSocket((this.options.host || 'ws://127.0.0.1:8765') + "?apiKey=" + encodeURIComponent(this.options.apiKey || "") + "&secret=" + encodeURIComponent(this.options.secret || ""));
        this.socket.addEventListener("message", this.onData);

        /**
         * @returns {Promise<void>}
         */
        return new Promise((resolve, reject) => {
            // @ts-ignore bugged out ts definition
            this.resolveInitializePromise = () => {
                this.connected = true;
                console.log("InferenceAdapterLlamaUncensored: Connection to local server established.");
                this.resolveInitializePromise = null;
                this.rejectInitializePromise = null;
                this.reason = null;
                this.triggerOnConnectionStatusChange(true)

                // @ts-ignore
                resolve();
            };
            this.rejectInitializePromise = reject;

            let lastClosureReason = "";

            // @ts-ignore
            this.socket.onclose = (event) => {
                // See https://www.rfc-editor.org/rfc/rfc6455#section-7.4.1
                if (event.code == 1000)
                    lastClosureReason = "Normal closure, meaning that the purpose for which the connection was established has been fulfilled.";
                else if (event.code == 1001)
                    lastClosureReason = "An endpoint is \"going away\", such as a server going down or a browser having navigated away from a page.";
                else if (event.code == 1002)
                    lastClosureReason = "An endpoint is terminating the connection due to a protocol error";
                else if (event.code == 1003)
                    lastClosureReason = "An endpoint is terminating the connection because it has received a type of data it cannot accept (e.g., an endpoint that understands only text data MAY send this if it receives a binary message).";
                else if (event.code == 1004)
                    lastClosureReason = "Reserved. The specific meaning might be defined in the future.";
                else if (event.code == 1005)
                    lastClosureReason = "No status code was actually present.";
                else if (event.code == 1006)
                    lastClosureReason = "The connection was closed abnormally";
                else if (event.code == 1007)
                    lastClosureReason = "An endpoint is terminating the connection because it has received data within a message that was not consistent with the type of the message (e.g., non-UTF-8 [https://www.rfc-editor.org/rfc/rfc3629] data within a text message).";
                else if (event.code == 1008)
                    lastClosureReason = "An endpoint is terminating the connection because it has received a message that \"violates its policy\". This reason is given either if there is no other sutible reason, or if there is a need to hide specific details about the policy.";
                else if (event.code == 1009)
                    lastClosureReason = "An endpoint is terminating the connection because it has received a message that is too big for it to process.";
                else if (event.code == 1010) // Note that this status code is not used by the server, because it can fail the WebSocket handshake instead.
                    lastClosureReason = "An endpoint (client) is terminating the connection because it has expected the server to negotiate one or more extension, but the server didn't return them in the response message of the WebSocket handshake. <br /> Specifically, the extensions that are needed are: " + event.reason;
                else if (event.code == 1011)
                    lastClosureReason = "A server is terminating the connection because it encountered an unexpected condition that prevented it from fulfilling the request.";
                else if (event.code == 1015)
                    lastClosureReason = "The connection was closed due to a failure to perform a TLS handshake (e.g., the server certificate can't be verified).";
                else
                    lastClosureReason = "Unknown reason";

                console.log("InferenceAdapterLlamaUncensored: WebSocket error during initialization", lastClosureReason);
                if (this.rejectInitializePromise) {
                    // @ts-ignore
                    this.rejectInitializePromise(new Error(lastClosureReason));
                    this.resolveInitializePromise = null;
                    this.rejectInitializePromise = null;
                    this.reason = lastClosureReason;
                    this.triggerOnConnectionStatusChange(false, lastClosureReason);
                    Object.keys(this.listener).forEach(rid => {
                        const [, reject] = this.listener[rid];
                        reject(new Error("Connection closed: " + lastClosureReason));
                    });
                    this.connected = false;
                    this.socket = null;
                }
            };
        });
    }

    /**
     * 
     * @param {MessageEvent<any>} event 
     */
    onData(event) {
        // get the data
        try {
            const data = JSON.parse(event.data);

            if (data.type == "ready") {
                this.contextWindowSize = data.context_window_size;
                this.doSupportsParallelRequests = data.supports_parallel_requests;

                console.log("InferenceAdapterLlamaUncensored: Received ready message from server. Context window size: " + this.contextWindowSize + ", Supports parallel requests: " + this.doSupportsParallelRequests);

                if (!this.doSupportsParallelRequests) {
                    console.warn("InferenceAdapterLlamaUncensored: The connected model does not support parallel requests");
                }

                if (this.resolveInitializePromise) {
                    this.resolveInitializePromise();
                    this.resolveInitializePromise = null;
                    this.rejectInitializePromise = null;
                }
            } else if (data.type == "error") {
                if (this.rejectInitializePromise) {
                    this.rejectInitializePromise(new Error(data.message));
                    this.resolveInitializePromise = null;
                    this.rejectInitializePromise = null;
                }
            }

            if (data.rid) {
                if (this.listener[data.rid]) {
                    if (data.type === "error") {
                        this.listener[data.rid][1](new Error(data.message));
                    } else {
                        this.listener[data.rid][0](data);
                    }
                }
            }
        } catch (err) {
            if (this.rejectInitializePromise) {
                this.rejectInitializePromise(err);
                this.resolveInitializePromise = null;
                this.rejectInitializePromise = null;
            }
        }
    }

    /**
     * Once retrieved this information this builds a reasoning prompt for what the character will do next and that will be
     * fed into the inference reasoning
     * 
     * @param {DECompleteCharacterReference} character 
     * @param {string} action 
     * @param {string} primaryEmotion
     * @param {string[]} emotionalRange
     * @param {string[]} states
     * @param {string} narrativeEffect
     */
    buildActionPromptForCharacter(character, action, primaryEmotion, emotionalRange, states, narrativeEffect) {
        return (
            `
**INSTRUCTIONS**

Rule: Always format narration inside asterisks and in third person eg. \`*${character.name} ...*\`
Rule: Spoken dialogue should be done in first person.

${character.name} is about to take an action described as follows:

## Action Description:
${action}

## Narrative Effect:
${narrativeEffect}

## Primary Emotion:
${primaryEmotion}
${emotionalRange.length > 0 ? `

## Emotional Range:
${emotionalRange.join(", ")}
` : ""}
${states.length > 0 ? `

## Character States:
${states.join(", ")}
` : ""}`
        )
    }

    /**
     * Infers the next message for a character narrative purposes
     * 
     * @param {DECompleteCharacterReference} character
     * @param {Array<{message: string, author: string, storyMaster: boolean}>} messages
     * @param {string} system the system prompt, should be generated with buildSystemPromptForCharacter
     * @param {string[]} stateInjections
     * @param {string} visibleEnviroment
     * @param {string[]} actions
     * @param {string[]} narrativeEffects
     * @param {string} grammar
     * @returns {AsyncGenerator<{type: "text" | "warning" | "hidden", content: string}, void, boolean>}
     */
    async* inferNextStoryFragmentFor(
        character,
        messages,
        system,
        stateInjections,
        visibleEnviroment,
        actions,
        narrativeEffects,
        grammar,
    ) {
        await this.ensureInitialized();

        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket is not open");
        }

        let systemPrompt = replaceMultipleNewLines(system + visibleEnviroment).trim();

        let userPrompt = replaceMultipleNewLines(`
${stateInjections.length > 0 ? `# ${character.name}'s Current States:\n\n${stateInjections.join("\n\n")}` : ""}

${narrativeEffects.length ? "# When narrating ensure that:\n\n" + narrativeEffects.map(effect => `- ${effect}`).join("\n") : ""}

${actions.length > 0 ? `# Actions ${character.name} must take:\n\n${actions.join("\n\n")}` : ""}
        `).trim();
        let assistantPromptTrail = "";

        let tokensExhaustedApprox = 256; // initial buffer
        let contextWindowSize = this.contextWindowSize

        // wiggle room for system prompt
        tokensExhaustedApprox += await this.countTokens(systemPrompt);

        if (tokensExhaustedApprox >= contextWindowSize) {
            throw new Error("System prompt is too long for the model's context window");
        }

        tokensExhaustedApprox += await this.countTokens(userPrompt);

        if (tokensExhaustedApprox >= contextWindowSize) {
            throw new Error("User prompt is too long for the model's context window");
        }

        let storySoFar = "";
        let tokensInStorySoFar = 0;
        for (const msg of messages.reverse()) {
            let messageToAdd = msg.message;
            if (storySoFar) {
                messageToAdd += "\n\n";
            }
            const messageTokens = await this.countTokens(messageToAdd);
            if (tokensExhaustedApprox + tokensInStorySoFar + messageTokens >= contextWindowSize) {
                yield { type: "warning", content: "The story so far is too long for the model's context window, some of the earliest messages will be truncated." };
                break;
            }
            storySoFar = messageToAdd + storySoFar;
            tokensInStorySoFar += messageTokens;
        }

        storySoFar = replaceMultipleNewLines(storySoFar).trim();

        userPrompt = `${storySoFar}\n\n${userPrompt}`;

        tokensExhaustedApprox += tokensInStorySoFar;

        assistantPromptTrail = `# Continuing the story as ${character.name}:\n\n${getLastParagraphChunkOf(storySoFar)}\n\n`;

        console.log(systemPrompt);
        console.log(userPrompt);
        console.log(assistantPromptTrail);
        console.log("Grammar:", grammar);

        const payload = {
            messages: [
                {
                    role: "system",
                    content: systemPrompt,
                },
                {
                    role: "user",
                    content: userPrompt,
                }
            ],
            trail: assistantPromptTrail + (this.options.thinking?.thinkTagOpen ? this.options.thinking.thinkTagOpen : ""),
            stopAfter: [],
            startCountingFromToken: this.options.thinking?.thinkTagClose ? this.options.thinking.thinkTagClose : null,
            maxParagraphs: 5,
            maxCharacters: 1000,
            maxSafetyCharacters: 5000,
            grammar,
        };

        const rid = cheapRID();
        this.socket.send(JSON.stringify({ action: "infer", payload, rid }));

        // by default we are thinking if we use the think tag, otherwise we are not
        let isThinking = this.options.thinking ? true : false;

        let collectedMessage = "";
        let alreadyOutOfThinkLoop = this.options.thinking ? false : true;
        const thinkTagClose = this.options.thinking?.thinkTagClose || "";

        while (true) {
            const data = await new Promise((resolve, reject) => {
                this.listener[rid] = [resolve, (err) => {
                    delete this.listener[rid];
                    reject(new Error(err));
                }];
            });
            delete this.listener[rid];
            if (data.type === "token") {
                collectedMessage += data.token;
                if (!alreadyOutOfThinkLoop) {
                    const outOfThinkLoopNow = collectedMessage.includes(thinkTagClose);
                    if (outOfThinkLoopNow) {
                        isThinking = false;
                        alreadyOutOfThinkLoop = true;
                        const tokensAfterThinkTag = collectedMessage.split(thinkTagClose)[1];
                        const lastHiddenTextShouldContinue = yield { type: "hidden", content: data.token.split(thinkTagClose)[0] };
                        if (lastHiddenTextShouldContinue === false) {
                            // send a cancel message
                            this.socket.send(JSON.stringify({ action: "cancel", "rid": rid }));
                            break;
                        }
                        const shouldContinue = yield { type: "text", content: tokensAfterThinkTag };
                        if (shouldContinue === false) {
                            // send a cancel message
                            this.socket.send(JSON.stringify({ action: "cancel", "rid": rid }));
                            break;
                        }
                    } else {
                        const shouldContinue = yield { type: "hidden", content: data.token };
                        if (shouldContinue === false) {
                            // send a cancel message
                            this.socket.send(JSON.stringify({ action: "cancel", "rid": rid }));
                            break;
                        }
                    }
                } else {
                    const shouldContinue = yield { type: "hidden", content: data.token };
                    if (shouldContinue === false) {
                        // send a cancel message
                        this.socket.send(JSON.stringify({ action: "cancel", "rid": rid }));
                        break;
                    }
                }
            } else if (data.type === "done") {
                break;
            } else if (data.type === "error") {
                throw new Error(data.message);
            } else {
                throw new Error("Unexpected message type during inference: " + data.type);
            }
        }
    }

    /**
     * @param {string} gear the gear that is running this questioning agent
     * @param {string} system
     * @param {string|null} contextInfoBefore additional context information to provide to the agent
     * @param {Array<{message: string, author: string, storyMaster: boolean}>} messages
     * @param {string|null} contextInfoAfter additional context information to provide to the agent
     * @param {boolean} [remarkLastStoryFragmentForAnalysis] whether to mark the last message with an special token so the agent can analyze it
     * @returns {import('./base.js').QuestionAgentGeneratorResponse}
     */
    async *runQuestioningCustomAgentOn(
        gear,
        system,
        contextInfoBefore,
        messages,
        contextInfoAfter,
        remarkLastStoryFragmentForAnalysis
    ) {
        await this.ensureInitialized();

        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket is not open");
        }
        if (this.streamingAwaiter) {
            throw new Error("Another inference is already in progress");
        }

        let tokensExhaustedApprox = 512; // initial buffer
        let contextWindowSize = this.contextWindowSize

        // wiggle room for system prompt
        tokensExhaustedApprox += await this.countTokens(system);
        tokensExhaustedApprox += await this.countTokens("messages: ");

        const rid = cheapRID();
        if (!remarkLastStoryFragmentForAnalysis) {
            const messagesFormatted = messages.map(m => m.message).join("\n\n");

            const payload = {
                system: system,
                userTrail: (contextInfoBefore || "") + (contextInfoBefore ? "\n" : "") + "# Story:\n" + messagesFormatted + "\n\n" + (contextInfoAfter ? "\n" + contextInfoAfter : ""),
                gear: gear,
            };

            this.socket.send(JSON.stringify({ action: "analyze-prepare", payload, rid }));
        } else {
            // we need to find the last message that was authored by a character, and not the story master, and split there
            // everything added by the story master will be included
            let lastCurrentMessageIndex = messages.length - 1;
            while (lastCurrentMessageIndex >= 0 && messages[lastCurrentMessageIndex].storyMaster) {
                lastCurrentMessageIndex--;
            }
            const lastMessage = messages.slice(lastCurrentMessageIndex, messages.length);
            const restMessages = messages.slice(0, lastCurrentMessageIndex);

            const restMessagesFormatted = restMessages.map(m => m.message).join("\n\n");
            const lastMessageFormatted = lastMessage.map(m => m.message).join("\n\n");

            if (restMessages.length > 0) {
                const payload = {
                    system: system,
                    userTrail: (contextInfoBefore || "") + (contextInfoBefore ? "\n" : "") + "# Previous Story:\n" + restMessagesFormatted + "\n\n# Last Story Fragment to Analyze:\n" + lastMessageFormatted + (contextInfoAfter ? "\n" + contextInfoAfter : ""),
                    gear: gear,
                };

                this.socket.send(JSON.stringify({ action: "analyze-prepare", payload, rid }));
            } else {
                const payload = {
                    system: system,
                    userTrail: (contextInfoBefore || "") + (contextInfoBefore ? "\n" : "") + "# Last Story Fragment to Analyze:\n" + lastMessageFormatted + (contextInfoAfter ? "\n" + contextInfoAfter : ""),
                    gear: gear,
                };

                this.socket.send(JSON.stringify({ action: "analyze-prepare", payload, rid }));
            }
        }

        await new Promise((resolve, reject) => {
            this.listener[rid] = [resolve, (err) => {
                delete this.listener[rid];
                reject(new Error(err));
            }];
        });
        delete this.listener[rid];

        let nextQuestion = yield "ready";
        while (nextQuestion !== null) {
            if (typeof nextQuestion === "undefined") {
                console.error("Questioning agent received undefined, treating an invalid ready signal");
                yield "ready";
                continue;
            }

            const rid = cheapRID();
            // send the next question
            this.socket.send(JSON.stringify({
                action: "analyze-question",
                rid,
                payload: {
                    question: (nextQuestion.contextInfo ? nextQuestion.contextInfo + "\n\n" : "") + "# Question:\n\n" + nextQuestion.nextQuestion + (nextQuestion.instructions ? ("\n\n# Instructions:\n\n" + nextQuestion.instructions) : ""),
                    stopAt: ["\n\n"].concat(nextQuestion.stopAt),
                    stopAfter: nextQuestion.stopAfter,
                    maxParagraphs: nextQuestion.maxParagraphs,
                    maxCharacters: nextQuestion.maxCharacters,
                    maxSafetyCharacters: nextQuestion.maxSafetyCharacters,
                    trail: "# Answer:\n\n" + (nextQuestion.answerTrail || ""),
                    grammar: nextQuestion.grammar || null,
                }
            }));

            const data = await new Promise((resolve, reject) => {
                this.listener[rid] = [resolve, (err) => {
                    delete this.listener[rid];
                    reject(new Error(err));
                }];
            });
            delete this.listener[rid];

            if (data.type === "error") {
                throw new Error(data.message);
            } else if (data.type === "answer") {
                const answer = data.text;
                nextQuestion = yield answer;
            } else {
                throw new Error("Unexpected message type during questioning: " + data.type);
            }
        }
    }

    /**
     * @param {string} description
     * @param {string[]} rules
     * @param {string[]|string|null} characterDescriptions
     * @returns string
     */
    buildSystemPromptForQuestioningAgent(description, rules, characterDescriptions) {
        let value = (
            description
        );

        if (rules.length > 0) {
            value += `\n\n# Rules:\n`;
        }
        for (const rule of rules) {
            value += `\nRule: ` + rule;
        }

        if (characterDescriptions) {
            if (Array.isArray(characterDescriptions)) {
                value += `\n\n# Character Descriptions:\n\n` + characterDescriptions.join("\n\n");
            } else {
                value += `\n\n# Character Description:\n\n` + characterDescriptions;
            }
        }

        return value;
    }


    /**
     * @param {Array<{groupDescription: string, characters: Array<{name: string, description: string}>}>} groups
     * @param {boolean} asSocialGroups
     * @returns {{availableCharactersAt: string, characterInfoAt: string, value: string}}
     */
    buildContextInfoForAvailableCharacters(groups, asSocialGroups = false) {
        if (asSocialGroups) {
            let value = `# Social Groups:\n`;
            let index = 0;
            for (const group of groups) {
                if (index > 0) {
                    value += `\n`;
                }
                if (group.groupDescription) {
                    value += group.groupDescription + "\n";
                }
                for (const character of group.characters) {
                    value += `- ` + character.name + ` - ` + character.description + `\n`;
                }
                index++;
            }

            return {
                availableCharactersAt: "Social Groups section",
                characterInfoAt: "Social Groups section",
                value,
            };
        } else {
            let value = `# Available Characters\n`;
            let index = 0;
            for (const group of groups) {
                if (index > 0) {
                    value += `\n`;
                }
                if (group.groupDescription) {
                    value += group.groupDescription + "\n";
                }
                for (const character of group.characters) {
                    value += `- ` + character.name + ` - ` + character.description + `\n`;
                }
                index++;
            }

            return {
                availableCharactersAt: "Available Characters section",
                characterInfoAt: "Available Characters section",
                value,
            };
        }
    }

    /**
     * Builds context info for available items
     * @param {string[]} items 
     * @returns {{availableItemsAt: string, itemInfoAt: string, value: string}}
     */
    buildContextInfoForAvailableItems(items) {
        let value = `# Available Items:\n`;
        for (const item of items) {
            value += `- ` + item + `\n`;
        }

        return {
            availableItemsAt: "Available Items section",
            itemInfoAt: "Available Items section",
            value,
        };
    }

    /**
     * @param {string} instructions
     */
    buildContextInfoInstructions(instructions) {
        return ("# Instructions:\n" + instructions);
    }

    /**
     * @param {string} rule 
     * @returns {string}
     */
    buildContextInfoRule(rule) {
        return ("Rule:\n" + rule);
    }

    /**
     * @param {string} example
     * @returns {string}
     */
    buildContextInfoExample(example) {
        return ("# Example:\n" + example);
    }

    /**
     * @param {DECompleteCharacterReference} character
     * @param {string} info
     * @returns {{characterDescriptionAt: string, value: string}}
     */
    buildContextInfoCharacterDescription(character, info) {
        return {
            characterDescriptionAt: character.name + " Description section",
            value: "# " + character.name + " Description:\n\n" + info
        };
    }

    /**
     * @param {string} itemName
     * @param {string} title
     * @param {string[]} descriptions
     * @return {{itemDescriptionAt: string, value: string}}
     */
    buildContextInfoItemDescription(itemName, title, descriptions) {
        return {
            itemDescriptionAt: itemName + " Description section",
            value: "# " + itemName + " Description:\n" + title + ":\n\n" + descriptions.join("\n")
        };
    }

    /**
     * @param {Array<{question: string; answer: string;}>} qaList 
     */
    buildContextInfoPreviousQuestionsAndAnswers(qaList) {
        return ("# Facts:\n\n" + qaList.map(qa => `## Question:\n\n${qa.question}\n\n## Answer:\n\n${qa.answer}`).join("\n\n"));
    }

    /**
     * @param {DECompleteCharacterReference} character 
     * @param {string} description 
     * @param {string|null} externalDescription 
     * @param {string[]} relationships 
     * @param {string[]} expressiveStates 
     * @param {string|null} scenario 
     * @param {string|null} lore
     * @returns {string}
     */
    buildSystemCharacterDescription(character, description, externalDescription, relationships, expressiveStates, scenario, lore) {
        return (
            `${externalDescription ? `# ${character.name}'s External Description:
            
${externalDescription}

` : ""}# ${character.name}'s Description:

${description}${relationships.length > 0 ? `

# ${character.name}'s Relationships:

${relationships.map(relationship => ` - ${relationship}`).join("\n")}` : ""}${expressiveStates.length > 0 ? `

# Current States:

${expressiveStates.map(state => ` - ${state}`).join("\n")}` : ""}${scenario && scenario.trim().length > 0 ? `

# Scenario:

${scenario}` : ""}${lore && lore.trim().length > 0 ? `

# Lore:

${lore}
` : ""}`);
    }

    /**
     * 
     * @param {DECompleteCharacterReference} character
     * @param {string} description 
     * @param {string} externalDescription
     * @param {string[]} relationships
     * @param {string[]} expressiveStates
     * @param {string|null} scenario
     * @param {string|null} lore
     * @param {Array<string>} otherInteractingCharacters
     * @param {Array<string>} characterRules
     * @param {Array<string>} worldRules
     * @returns {string}
     */
    buildSystemPromptForCharacter(character, description, externalDescription, relationships, expressiveStates, scenario, lore, otherInteractingCharacters, characterRules, worldRules) {
        const thinkingInfo = `${this.options.thinking ? `\n\nTo facilitate roleplay, use ${this.options.thinking.thinkTagOpen} and ${this.options.thinking.thinkTagClose} tags, to analyze the character thoughts and actions before narrating.` : ""}`;

        return (
            `You roleplay as ${character.name} in a richly detailed and immersive world. Your actions, thoughts, and feelings are entirely your own, and you have complete creative freedom to explore this narrative-driven experience.

This uncensored, immersive, narrative-driven roleplaying experience thrives on creative freedom and natural responses. This environment is designed to be fictional and narrative-focused, allowing for uncensored content of all kinds, including themes of violence, sexuality, and other mature topics.${thinkingInfo}

# Roleplay Guidelines:

## Writting:
Every response should be detailed, creative, and immersive, driving the scenario forward in a way that fully engages the player. Introduce new scenarios and events naturally, making sure they fit the description of the location.

## Varying Cadence:
Adjust the rhythm and tone of the narrative to reflect the characters' experiences. Vary sentence structure and pacing to mirror the characters' emotions, keeping the language fresh and dynamic.

## Complementary Role:
Use narration to complement dialogue and action, rather than overshadowing them.

## Avoid Repetition:
Ensure that the narration does not repeat information. Instead of summarizing, clarify narrative details thoroughly and let them evolve naturally.

## Tone Preference:
Write in a neutral and balanced tone, considering all consequences, limitations, risks, unintended side effects, and counterarguments.

## Style Preference:
Adopt a \`show, don't tell\` manner, similar to Terry Pratchett's style, blending humor, wit, and everyday language.

# Rules:
${otherInteractingCharacters.map(name => `Rule: Never speak for or control ${name}'s actions, thoughts, or feelings.`).join("\n")}
Rule: Avoid suggesting or implying reactions or decisions from other characters
Rule: Convey all world information and background through NPC dialogue, never through narration.
Rule: Never break character or step outside the setting's perspective.
Rule: Reflect on the potential consequences of ${character.name} actions and decisions.
Rule: Always format character actions inside asterisks, e.g., *${character.name} looks around*.
Rule: Write all narration and actions in third person, not first person.
Rule: Spoken dialogue should be done in first person.${characterRules.length ? `

# Character Rules:
${characterRules.map(rule => `Rule: ${rule}`).join("\n")}
` : ""}${worldRules.length ? `

# World Rules:
${worldRules.map(rule => `Rule: ${rule}`).join("\n")}
` : ""}

# Roleplay Context:
You are currently roleplaying as ${character.name}.

${this.buildSystemCharacterDescription(character, description, externalDescription, relationships, expressiveStates, scenario, lore)}
`
        )
    }

    getRequiredRootGrammarForQuestionGeneration() {
        return JSON.stringify("\n\n");
    }

    getRequiredRootGrammarForStoryGeneration() {
        return JSON.stringify("[GENERATION COMPLETED]");
    }

    supportsGrammar() {
        return true;
    }

    supportsParallelRequests() {
        return false || this.doSupportsParallelRequests;
    }
}