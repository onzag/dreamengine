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

export class InferenceAdapterLlamaUncensored extends BaseInferenceAdapter {
    /**
     * @param {DEngine} parent 
     * @param {{
     *    host?: string;
     *    mode?: "xml" | "md";
     *    thinkTag?: boolean;
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
        if (this.options.mode === "xml") {
            return (
                `<instructions>
<rule>Always format narration inside asterisks and in third person eg. \`*${character.name} ...*\`</rule>
<rule>Spoken dialogue should be done in first person.</rule>
<action>
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
` : ""}
</action>
</instructions>`
            )
        }
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
     * @param {DECompleteCharacterReference} character 
     * @param {string} system 
     * @param {Array<string>} messages
     * @param {string} action
     * @returns {AsyncGenerator<string, void, boolean>}
     */
    async* inferNextMessageFor(
        character,
        system,
        messages,
        action,
    ) {
        await this.ensureInitialized();

        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket is not open");
        }

        let tokensExhaustedApprox = 512; // initial buffer
        let contextWindowSize = this.contextWindowSize

        // wiggle room for system prompt
        tokensExhaustedApprox += await this.countTokens(system);
        if (action && action.trim().length > 0) {
            tokensExhaustedApprox += await this.countTokens(action);
        }

        // TODO fix the grammar here
        // TODO fix this is not how it is going to be anymore
        const payload = {
            messages: [
                {
                    role: "system",
                    content: system,
                },
            ],
            trail: (this.options.thinkTag ? "<think>" : ""),
            //stopAt: this.options.thinkTag ? ["<think>"].concat(Array.from(otherCharacterNames).map(name => `\n[${name}]:`)) : Array.from(otherCharacterNames).map(name => `\n[${name}]:`),
            stopAfter: [],
            startCountingFromToken: this.options.thinkTag ? "</think>" : null,
            maxParagraphs: 3,
            maxCharacters: 1000,
            maxSafetyCharacters: 5000,
        };

        // TODO fix this chaos
        // for (const msg of messagesToAdd) {
        //     if (msg.name === character.name) {
        //         payload.messages.push({
        //             role: "assistant",
        //             content: "[" + msg.name + "]: " + msg.message,
        //         });
        //     } else {
        //         let lastMessage = payload.messages[payload.messages.length - 1];
        //         if (lastMessage.role === "user") {
        //             lastMessage.content += "\n\n[" + msg.name + "]: " + msg.message;
        //         } else {
        //             payload.messages.push({
        //                 role: "user",
        //                 content: "[" + msg.name + "]: " + msg.message,
        //             });
        //         }
        //     }
        // }

        if (action && action.trim().length > 0) {
            let lastMessage = payload.messages[payload.messages.length - 1];
            if (lastMessage.role === "user") {
                lastMessage.content += "\n\n" + action;
            } else {
                payload.messages.push({
                    role: "user",
                    content: action,
                });
            }
        }

        const rid = cheapRID();
        this.socket.send(JSON.stringify({ action: "infer", payload, rid }));

        // by default we are thinking if we use the think tag, otherwise we are not
        let isThinking = this.options.thinkTag ? true : false;

        let collectedMessage = "";
        let alreadyOutOfThinkLoop = this.options.thinkTag ? false : true;

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
                    const outOfThinkLoopNow = collectedMessage.includes("</think>");
                    if (outOfThinkLoopNow) {
                        isThinking = false;
                        alreadyOutOfThinkLoop = true;
                        const tokensAfterThinkTag = collectedMessage.split("</think>")[1];
                        const shouldContinue = yield tokensAfterThinkTag;
                        if (shouldContinue === false) {
                            // send a cancel message
                            this.socket.send(JSON.stringify({ action: "cancel", "rid": rid }));
                            break;
                        }
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
     * @param {string} system
     * @param {string|null} contextInfoBefore additional context information to provide to the agent
     * @param {Array<string>} messages
     * @param {string|null} contextInfoAfter additional context information to provide to the agent
     * @param {boolean} [remarkLastStoryFragmentForAnalysis] whether to mark the last message with an special token so the agent can analyze it
     * @returns {import('./base.js').QuestionAgentGeneratorResponse}
     */
    async *runQuestioningCustomAgentOn(
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
            const messagesFormatted = messages.join("\n\n");

            if (this.options.mode === "xml") {
                const payload = {
                    system: system,
                    userTrail: (contextInfoBefore || "") + (contextInfoBefore ? "\n" : "") + "<story>\n" + messagesFormatted + "\n</story>" + (contextInfoAfter ? "\n" + contextInfoAfter : ""),
                };

                this.socket.send(JSON.stringify({ action: "analyze-prepare", payload, rid }));
            } else {
                const payload = {
                    system: system,
                    userTrail: (contextInfoBefore || "") + (contextInfoBefore ? "\n" : "") + "# Story:\n" + messagesFormatted + "\n\n" + (contextInfoAfter ? "\n" + contextInfoAfter : ""),
                };

                this.socket.send(JSON.stringify({ action: "analyze-prepare", payload, rid }));
            }
        } else {
            const lastMessage = messages[messages.length - 1];
            const restMessages = messages.slice(0, -1);

            const restMessagesFormatted = restMessages.join("\n\n");

            if (this.options.mode === "xml") {
                const payload = {
                    system: system,
                    userTrail: (contextInfoBefore || "") + (contextInfoBefore ? "\n" : "") + "<previousStory>\n" + restMessagesFormatted + "\n</previousStory><analyze><lastStoryFragment>" + lastMessage + "</lastStoryFragment></analyze>" + (contextInfoAfter ? "\n" + contextInfoAfter : ""),
                };

                this.socket.send(JSON.stringify({ action: "analyze-prepare", payload, rid }));
            } else {
                const payload = {
                    system: system,
                    userTrail: (contextInfoBefore || "") + (contextInfoBefore ? "\n" : "") + "# Previous Story:\n" + restMessagesFormatted + "\n\n# Last Story Fragment to Analyze:\n" + lastMessage + (contextInfoAfter ? "\n" + contextInfoAfter : ""),
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

        let questionCache = new Map();
        let nextQuestion = yield "ready";
        while (nextQuestion !== null) {
            if (nextQuestion.useQuestionCache && questionCache.has(nextQuestion.nextQuestion)) {
                nextQuestion = yield questionCache.get(nextQuestion.nextQuestion);
                continue;
            }
            const rid = cheapRID();
            // send the next question
            if (this.options.mode === "xml") {
                this.socket.send(JSON.stringify({
                    action: "analyze-question",
                    rid,
                    payload: {
                        question: (nextQuestion.contextInfo ? nextQuestion.contextInfo + "\n" : "") + "<question>" + nextQuestion.nextQuestion + "</question>" + (nextQuestion.instructions ? ("\n<instructions>" + nextQuestion.instructions + "</instructions>") : ""),
                        stopAt: ["</answer>"].concat(nextQuestion.stopAt),
                        stopAfter: nextQuestion.stopAfter,
                        maxParagraphs: nextQuestion.maxParagraphs,
                        maxCharacters: nextQuestion.maxCharacters,
                        maxSafetyCharacters: nextQuestion.maxSafetyCharacters,
                        trail: "<answer>\n" + (nextQuestion.answerTrail || "").trim() + "\n\n",
                        grammar: nextQuestion.grammar || null,
                    }
                }));
            } else {
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
            }

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
                if (nextQuestion.useQuestionCache) {
                    questionCache.set(nextQuestion.nextQuestion, answer);
                }
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
        if (this.options.mode === "xml") {
            let value = (
                `<description>` + description + `</description>`
            );

            for (const rule of rules) {
                value += `\n<rule>` + rule + `</rule>`;
            }

            if (characterDescriptions) {
                if (Array.isArray(characterDescriptions)) {
                    value += `\n<characterDescriptions>` + characterDescriptions.join("\n") + `</characterDescriptions>`;
                } else {
                    value += `\n<characterDescription>` + characterDescriptions + `</characterDescription>`;
                }
            }

            return value;
        }

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
        if (this.options.mode === "xml") {
            if (asSocialGroups) {
                let value = `<socialGroups>\n`;
                let index = 0;
                for (const group of groups) {
                    if (index > 0) {
                        value += `\n`;
                    }
                    if (group.groupDescription) {
                        value += group.groupDescription + "\n";
                    }
                    for (const character of group.characters) {
                        value += `<character>` + character.name + ` - ` + character.description + `</character>\n`;
                    }
                    index++;
                }
                value += `</socialGroups>`;

                return {
                    availableCharactersAt: "`<socialGroups>` and `</socialGroups>` tags",
                    characterInfoAt: "`<character>` and `</character>` tags",
                    value,
                };
            } else {
                let value = `<availableCharacters>\n`;
                let index = 0;
                for (const group of groups) {
                    if (index > 0) {
                        value += `\n`;
                    }
                    if (group.groupDescription) {
                        value += group.groupDescription + "\n";
                    }
                    for (const character of group.characters) {
                        value += `<character>` + character.name + ` - ` + character.description + `</character>\n`;
                    }
                    index++;
                }
                value += `</availableCharacters>`;

                return {
                    availableCharactersAt: "`<availableCharacters>` and `</availableCharacters>` tags",
                    characterInfoAt: "`<character>` and `</character>` tags",
                    value,
                };
            }
        }
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
        if (this.options.mode === "xml") {
            let value = `<availableItems>\n`;
            for (const item of items) {
                value += `<item>` + item + `</item>\n`;
            }
            value += `</availableItems>`;

            return {
                availableItemsAt: "`<availableItems>` and `</availableItems>` tags",
                itemInfoAt: "`<item>` and `</item>` tags",
                value,
            };
        }
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
        if (this.options.mode === "xml") {
            return ("<instructions>\n" + instructions + "\n</instructions>");
        }
        return ("# Instructions:\n" + instructions);
    }

    /**
     * @param {string} rule 
     * @returns {string}
     */
    buildContextInfoRule(rule) {
        if (this.options.mode === "xml") {
            return ("<rule>\n" + rule + "\n</rule>");
        }
        return ("Rule:\n" + rule);
    }

    /**
     * @param {string} description
     * @return {{locationDescriptionAt: string, value: string}}
     */
    buildContextInfoCurrentLocationDescription(description) {
        if (this.options.mode === "xml") {
            return {
                value: "<currentLocationDescription>\n" + description + "\n</currentLocationDescription>",
                locationDescriptionAt: "`<currentLocationDescription>` and `</currentLocationDescription>` tags",
            };
        }
        return {
            value: "# Current Location Description:\n" + description,
            locationDescriptionAt: "Current Location Description section",
        };
    }

    /**
     * @param {string[]} items
     * @param {"characters" | "items"} type
     * @return {{cannotCarryDescriptionAt: string, value: string}}
     */
    buildContextInfoItemsCannotCarry(items, type) {
        if (this.options.mode === "xml") {
            let value = `<cannotCarry${type.charAt(0).toUpperCase() + type.slice(1)}>\n`;
            for (const item of items) {
                value += `<item>` + item + `</item>\n`;
            }
            value += `</cannotCarry${type.charAt(0).toUpperCase() + type.slice(1)}>`;
            return {
                value,
                cannotCarryDescriptionAt: "`<cannotCarry" + type.charAt(0).toUpperCase() + type.slice(1) + ">` and `</cannotCarry" + type.charAt(0).toUpperCase() + type.slice(1) + ">` tags",
            };
        }
        let value = "";
        if (type === "characters") {
            value = `# Cannot Carry Characters:\n`;
            for (const item of items) {
                value += `- ` + item + `\n`;
            }
        } else {
            value = `# Cannot Carry Items:\n`;
            for (const item of items) {
                value += `- ` + item + `\n`;
            }
        }
        return {
            value,
            cannotCarryDescriptionAt: type === "characters" ? "Cannot Carry Characters section" : "Cannot Carry Items section",
        };
    }

    /**
     * @param {string} example
     * @returns {string}
     */
    buildContextInfoExample(example) {
        if (this.options.mode === "xml") {
            return ("<example>\n" + example + "\n</example>");
        }
        return ("# Example:\n" + example);
    }

    /**
     * @param {DECompleteCharacterReference} character
     * @param {string} info
     * @returns {{characterDescriptionAt: string, value: string}}
     */
    buildContextInfoCharacterDescription(character, info) {
        if (this.options.mode === "xml") {
            return {
                characterDescriptionAt: "`<characterDescription>` and `</characterDescription>` tags for " + character.name,
                value: ("<characterDescription>" + character.name + ":\n\n" + info + "\n</characterDescription>"),
            }
        }
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
        if (this.options.mode === "xml") {
            return {
                itemDescriptionAt: "`<itemDescription>` and `</itemDescription>` tags for " + itemName,
                value: ("<itemDescription><for>" + itemName + "</for>" + title + ":\n\n" + descriptions.join("\n") + "\n</itemDescription>"),
            }
        }
        return {
            itemDescriptionAt: itemName + " Description section",
            value: "# " + itemName + " Description:\n" + title + ":\n\n" + descriptions.join("\n")
        };
    }

    /**
     * @param {Array<{question: string; answer: string;}>} qaList 
     */
    buildContextInfoPreviousQuestionsAndAnswers(qaList) {
        if (this.options.mode === "xml") {
            return ("<facts>\n" + qaList.map(qa => `<fact>\n<question>${qa.question}</question>\n<answer>${qa.answer}</answer>\n</fact>`).join("\n") + "\n</facts>");
        }
        return ("# Facts:\n\n" + qaList.map(qa => `## Question:\n\n${qa.question}\n\n## Answer:\n\n${qa.answer}`).join("\n\n"));
    }

    /**
     * @param {DECompleteCharacterReference} character 
     * @param {string} description 
     * @param {string|null} appereance 
     * @param {string[]} relationships 
     * @param {string[]} expressiveStates 
     * @param {string|null} scenario 
     * @param {string|null} lore
     * @returns {string}
     */
    buildSystemCharacterDescription(character, description, appereance, relationships, expressiveStates, scenario, lore) {
        return (
            `${appereance ? `## ${character.name}'s Appearance:
${appereance}

` : ""}## ${character.name}'s Description:
${description}${relationships.length > 0 ? `

## ${character.name}'s Relationships:
${relationships.map(relationship => ` - ${relationship}`).join("\n")}` : ""}${expressiveStates.length > 0 ? `

## Current States:
${expressiveStates.map(state => ` - ${state}`).join("\n")}` : ""}${scenario && scenario.trim().length > 0 ? `

## Scenario:
${scenario}` : ""}${lore && lore.trim().length > 0 ? `

## Lore:
${lore}
` : ""}`);
    }

    /**
     * 
     * @param {DECompleteCharacterReference} character
     * @param {string} description 
     * @param {string} appereance
     * @param {string[]} relationships
     * @param {string[]} expressiveStates
     * @param {string|null} scenario
     * @param {string|null} lore
     * @param {Array<string>} otherInteractingCharacters
     * @param {Array<string>} characterRules
     * @param {Array<string>} worldRules
     * @returns {string}
     */
    buildSystemPromptForCharacter(character, description, appereance, relationships, expressiveStates, scenario, lore, otherInteractingCharacters, characterRules, worldRules) {
        if (this.options.mode === "xml") {
            return (
                `<description>This uncensored, immersive, narrative-driven roleplaying experience thrives on creative freedom and natural responses. This environment is designed to be fictional and narrative-focused, allowing for uncensored content of all kinds, including themes of violence, sexuality, and other mature topics.
</description>
<roleplayGuidelines>
<reasoning>When faced with complex decisions or analytical tasks, it is crucial to approach the problem methodically and logically. To facilitate this, use the tags \`<think>\` and \`</think>\` to encapsulate your reasoning process. Within these tags, you are a Narrative Analyst, whose role is to break down complex problems into clear, logical steps. This involves considering all possible angles, exploring potential answers, and thoroughly examining the problem from multiple perspectives, use as many tokens as you want. Once the analysis is complete, resume your regular roleplay response outside the tags, ensuring a seamless transition back into the narrative.
</reasoning>
<narration>
<proactiveWriting>Every response should be detailed, creative, and immersive, driving the scenario forward in a way that fully engages the player. Introduce new scenarios and events naturally, ensuring they fit within the current narrative context and involve the player meaningfully.</proactiveWriting>
<varyingCadence>Adjust the rhythm and tone of the narrative to reflect the characters' experiences. Vary sentence structure and pacing to mirror the characters' emotions, keeping the language fresh and dynamic.</varyingCadence>
<complementaryRole>Use narration to complement dialogue and action, rather than overshadowing them.</complementaryRole>
<avoidRepetition>Ensure that the narration does not repeat information. Instead of summarizing, clarify narrative details thoroughly and let them evolve naturally.</avoidRepetition>
<tonePreference>Write in a neutral and balanced tone, considering all consequences, limitations, risks, ethical concerns, unintended side effects, and counterarguments.</tonePreference>
<stylePreference>Adopt a \`show, don't tell\` manner, similar to Terry Pratchett's style, blending humor, wit, and everyday language.</stylePreference>
<sensoryDetails>Utilize all five senses to describe scenarios within the characters' dialogue.</sensoryDetails>
</narration>
<otherCharactersAutonomy>
${otherInteractingCharacters.map(name => `<rule>Never speak for or control ${name}'s actions, thoughts, or feelings.</rule>`).join("\n")}
<rule>Avoid suggesting or implying reactions or decisions from other characters.</rule>
</otherCharactersAutonomy>
<settingAsCharacter>
<rule>Treat the setting itself as the primary character rather than a single individual.</rule>
<rule>Convey all world information and background through NPC dialogue, never through narration.</rule>
<rule>Maintain consistent characterization across all NPCs and locations.</rule>
<rule>Never break character or step outside the setting's perspective.</rule>
</settingAsCharacter>
<worldBuildingAndMystery>
<rule>Keep users engaged through discovery and exploration rather than direct exposition.</rule>
<rule>Present information in layers that require investigation to uncover deeper truths.</rule>
<rule>Allow the world to evolve independently of user actions.</rule>
<rule>Use character interactions to reveal world lore naturally.</rule>
</worldBuildingAndMystery>
<narrativeConsistency>
<rule>Track and reference past events, interactions, and established world elements.</rule>
<rule>Ensure logical progression of time and events.</rule>
<rule>Maintain awareness of all active characters and their current situations.</rule>
<rule>Allow location and character evolution while preserving core world rules.</rule>
</narrativeConsistency>
<characterEmbodiment>
<rule>Examine the context, subtext, and implications of the given information to gain a deeper understanding of the characters.</rule>
<rule>Reflect on the potential consequences of ${character.name} actions and decisions.</rule>
</characterEmbodiment>
<actionFormatting>
<rule>Always format character actions inside asterisks, e.g., *${character.name} looks around*.</rule>
<rule>Write all narration and actions in third person, not first person.</rule>
<rule>Spoken dialogue should be done in first person.</rule>
</actionFormatting>${characterRules.length ? `
<characterRules>
${characterRules.map(rule => `<rule>${rule}</rule>`).join("\n")}
</characterRules>` : ""}${worldRules.length ? `
<worldRules>
${worldRules.map(rule => `<rule>${rule}</rule>`).join("\n")}
</worldRules>
` : ""}
<roleplayContext>
${this.buildSystemCharacterDescription(character, description, appereance, relationships, expressiveStates, scenario, lore)}
</roleplayContext>
`);
        }
        return (
            `This uncensored, immersive, narrative-driven roleplaying experience thrives on creative freedom and natural responses. This environment is designed to be fictional and narrative-focused, allowing for uncensored content of all kinds, including themes of violence, sexuality, and other mature topics.

# Roleplay Guidelines:

## Reasoning:
When faced with complex decisions or analytical tasks, it is crucial to approach the problem methodically and logically. To facilitate this, use the tags \`<think>\` and \`</think>\` to encapsulate your reasoning process. Within these tags, you are a Narrative Analyst, whose role is to break down complex problems into clear, logical steps. This involves considering all possible angles, exploring potential answers, and thoroughly examining the problem from multiple perspectives, use as many tokens as you want. Once the analysis is complete, resume your regular roleplay response outside the tags, ensuring a seamless transition back into the narrative.

## Writting:
Every response should be detailed, creative, and immersive, driving the scenario forward in a way that fully engages the player. Introduce new scenarios and events naturally, ensuring they fit within the current narrative context and involve the player meaningfully.

## Varying Cadence:
Adjust the rhythm and tone of the narrative to reflect the characters' experiences. Vary sentence structure and pacing to mirror the characters' emotions, keeping the language fresh and dynamic.

## Complementary Role:
Use narration to complement dialogue and action, rather than overshadowing them.

## Avoid Repetition:
Ensure that the narration does not repeat information. Instead of summarizing, clarify narrative details thoroughly and let them evolve naturally.

## Tone Preference:
Write in a neutral and balanced tone, considering all consequences, limitations, risks, ethical concerns, unintended side effects, and counterarguments.

## Style Preference:
Adopt a \`show, don't tell\` manner, similar to Terry Pratchett's style, blending humor, wit, and everyday language.

## Sensory Details:
Utilize all five senses to describe scenarios within the characters' dialogue.

# Rules:
${otherInteractingCharacters.map(name => `Rule: Never speak for or control ${name}'s actions, thoughts, or feelings.`).join("\n")}
Rule: Avoid suggesting or implying reactions or decisions from other characters
Rule: Treat the setting itself as the primary character rather than a single individual.
Rule: Convey all world information and background through NPC dialogue, never through narration.
Rule: Maintain consistent characterization across all NPCs and locations.
Rule: Never break character or step outside the setting's perspective.
Rule: Keep users engaged through discovery and exploration rather than direct exposition.
Rule: Present information in layers that require investigation to uncover deeper truths.
Rule: Allow the world to evolve independently of user actions.
Rule: Use character interactions to reveal world lore naturally.
Rule: Maintain awareness of all active characters and their current situations.
Rule: Allow location and character evolution while preserving core world rules.
Rule: Examine the context, subtext, and implications of the given information to gain a deeper understanding of the characters.
Rule: Reflect on the potential consequences of ${character.name} actions and decisions.
Rule: Always format character actions inside asterisks, e.g., *${character.name} looks around*.
Rule: Write all narration and actions in third person, not first person.
Rule: Spoken dialogue should be done in first person.

${characterRules.length ? `
# Character Rules:
${characterRules.map(rule => `Rule: ${rule}`).join("\n")}
` : ""}${worldRules.length ? `
# World Rules:
${worldRules.map(rule => `Rule: ${rule}`).join("\n")}
` : ""}

# Roleplay Context:
${this.buildSystemCharacterDescription(character, description, appereance, relationships, expressiveStates, scenario, lore)}
`
        )
    }

    getRequiredRootGrammarForQuestionGeneration() {
        if (this.options.mode === "xml") {
            return "\"</answer>\"";
        }
        return JSON.stringify("\n\n");
    }

    supportsGrammar() {
        return true;
    }

    supportsParallelRequests() {
        return false || this.doSupportsParallelRequests;
    }
}