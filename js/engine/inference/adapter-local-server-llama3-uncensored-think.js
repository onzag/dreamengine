/**
 * This adapter connects to a local server running a Llama 3 based model, and sets it up
 * for uncensored content and think tags.
 * 
 * The model is expected to support the think tags <think> and </think> to separate reasoning from normal output.
 */

import { DEngine } from '../index.js';
import { BaseInferenceAdapter } from './base.js';

export class InferenceAdapterLocalServerLlama3UncensoredThink extends BaseInferenceAdapter {
    /**
     * @param {DEngine} parent 
     * @param {{
     *    host?: string;
     *    contextWindowSize?: number;
     *    dummyMode?: boolean;
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

        this.initialized = false;

        this.onData = this.onData.bind(this);
        this.options = options;
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

        /**
         * @returns {Promise<number>}
         */
        return new Promise((resolve, reject) => {
            this.streamingAwaiter = (data, done, err) => {
                if (err) {
                    reject(new Error(err));
                } else if (typeof data === "number") {
                    resolve(/** @type {number} */(data));
                } else {
                    reject(new Error("Invalid data received for token count: " + data));
                }
                this.streamingAwaiter = null;
            };
            // @ts-ignore
            this.socket.send(JSON.stringify({ action: "count-tokens", payload: { text } }));
        });
    }

    async initialize() {
        if (this.initialized) {
            return;
        }

        if (this.options.dummyMode) {
            console.log("InferenceAdapterLocalServerLlama3UncensoredThink: Dummy mode enabled, skipping initialization.");
            this.initialized = true;
            return;
        }

        console.log("InferenceAdapterLocalServerLlama3UncensoredThink: Initializing connection to local server at " + (this.options.host || 'ws://127.0.0.1:8765'));

        // set a websocket to the local server
        this.socket = new WebSocket(this.options.host || 'ws://127.0.0.1:8765');
        this.socket.addEventListener("message", this.onData);

        /**
         * @returns {Promise<void>}
         */
        return new Promise((resolve, reject) => {
            // @ts-ignore bugged out ts definition
            this.resolveInitializePromise = () => {
                this.initialized = true;
                console.log("InferenceAdapterLocalServerLlama3UncensoredThink: Connection to local server established.");
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

                console.log("InferenceAdapterLocalServerLlama3UncensoredThink: WebSocket error during initialization", lastClosureReason);
                if (this.rejectInitializePromise) {
                    // @ts-ignore
                    this.rejectInitializePromise(new Error(lastClosureReason));
                    this.resolveInitializePromise = null;
                    this.rejectInitializePromise = null;
                }
                if (this.streamingAwaiter) {
                    // @ts-ignore
                    this.streamingAwaiter(null, false, lastClosureReason);
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
                if (this.streamingAwaiter) {
                    // @ts-ignore
                    this.streamingAwaiter(null, false, data.message);
                }
            } else if (data.type == "token") {
                if (this.streamingAwaiter) {
                    this.streamingAwaiter(data.token, false, null);
                }
            } else if (data.type == "answer") {
                if (this.streamingAwaiter) {
                    this.streamingAwaiter(data.text, false, null);
                }
            } else if (data.type == "count") {
                if (this.streamingAwaiter) {
                    this.streamingAwaiter(data.n_tokens, false, null);
                }
            } else if (data.type == "done") {
                if (this.streamingAwaiter) {
                    // @ts-ignore
                    this.streamingAwaiter(null, true, null);
                }
            } else if (data.type == "analyze-ready") {
                if (this.streamingAwaiter) {
                    this.streamingAwaiter("ready", false, null);
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
<instructions>
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
</instructions>
`
        )
    }

    /**
     * 
     * @param {DECompleteCharacterReference} character 
     * @param {string} system 
     * @param {(AsyncGenerator<{name: string, message: string, id: string, conversationId: string | null, debug: boolean, rejected: boolean}, void, boolean> | Array<{name: string, message: string}>)} getHistoryForCharacter
     * @param {string} action
     * @returns {AsyncGenerator<string, void, boolean>}
     */
    async* inferNextMessageFor(
        character,
        system,
        getHistoryForCharacter,
        action,
    ) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket is not open");
        }
        if (this.streamingAwaiter) {
            throw new Error("Another inference is already in progress");
        }

        let tokensExhaustedApprox = 512; // initial buffer
        let contextWindowSize = 2048 * 4; // 8k context

        if (this.options.contextWindowSize && Number.isInteger(this.options.contextWindowSize)) {
            contextWindowSize = this.options.contextWindowSize;
        }

        // wiggle room for system prompt
        tokensExhaustedApprox += await this.countTokens(system);
        if (action && action.trim().length > 0) {
            tokensExhaustedApprox += await this.countTokens(action);
        }

        /**
         * @type {Array<{name: string, message: string}>}
         */
        let messagesToAdd = [];

        if (!Array.isArray(getHistoryForCharacter)) {
            let generator = await getHistoryForCharacter.next(true);
            while (!generator.done) {
                if (!generator.value.debug && !generator.value.rejected) {
                    messagesToAdd.push(generator.value);
                    tokensExhaustedApprox += await this.countTokens("[" + generator.value.name + "]: " + generator.value.message) + 10; // some wiggle room
                    if (tokensExhaustedApprox >= contextWindowSize) {
                        await getHistoryForCharacter.return();
                        if (tokensExhaustedApprox > contextWindowSize) {
                            // remove the last message as it made us go over
                            messagesToAdd.pop();
                        }
                        break;
                    }
                }
                generator = await getHistoryForCharacter.next(true);
            }

            messagesToAdd = messagesToAdd.reverse();
        } else {
            messagesToAdd = getHistoryForCharacter;
        }

        const otherCharacterNames = new Set();
        for (const msg of messagesToAdd) {
            if (msg.name !== character.name) {
                otherCharacterNames.add(msg.name);
            }
        }
        const payload = {
            messages: [
                {
                    role: "system",
                    content: system,
                },
            ],
            trail: "[" + character.name + "]: <think>",
            stopAt: ["<think>"].concat(Array.from(otherCharacterNames).map(name => `\n[${name}]:`)),
            stopAfter: [],
            startCountingFromToken: "</think>",
            maxParagraphs: 3,
            maxCharacters: 1000,
        };

        for (const msg of messagesToAdd) {
            if (msg.name === character.name) {
                payload.messages.push({
                    role: "assistant",
                    content: "[" + msg.name + "]: " + msg.message,
                });
            } else {
                let lastMessage = payload.messages[payload.messages.length - 1];
                if (lastMessage.role === "user") {
                    lastMessage.content += "\n\n[" + msg.name + "]: " + msg.message;
                } else {
                    payload.messages.push({
                        role: "user",
                        content: "[" + msg.name + "]: " + msg.message,
                    });
                }
            }
        }

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

        this.socket.send(JSON.stringify({ action: "infer", payload }));

        /**
         * @type {*}
         */
        let waitForMessagesToProcessResolve = null;
        /**
         * @type {Promise<void> | null}
         */
        let waitForMessagesToProcessPromise = null;
        /**
         * @type Array<{token: string, done: boolean, err: string | null}>
         */
        let collectedMessages = [];

        // by default we are thinking because we used the trail <think>
        let isThinking = true;

        this.streamingAwaiter = (data, done, err) => {
            // @ts-ignore
            if (data.includes("<think>")) {
                isThinking = true;
                // @ts-ignore
            } else if (data.includes("</think>")) {
                isThinking = false;
            } else if (!isThinking || done) {
                collectedMessages.push({ token: /** @type {string} */ (data), done, err });
                if (waitForMessagesToProcessResolve) {
                    waitForMessagesToProcessResolve();
                }
            }
        }
        while (true) {
            if (collectedMessages.length === 0) {
                waitForMessagesToProcessPromise = new Promise((resolve) => {
                    waitForMessagesToProcessResolve = resolve;
                });
                await waitForMessagesToProcessPromise;
                waitForMessagesToProcessPromise = null;
                waitForMessagesToProcessResolve = null;
            }

            let messagesToProcess = collectedMessages;
            collectedMessages = [];

            for (const msg of messagesToProcess) {
                let shouldContinue = true;
                if (msg.token && msg.token.trim().length > 0) {
                    shouldContinue = yield msg.token;
                }
                if (msg.done || msg.err || shouldContinue === false) {
                    if (!shouldContinue) {
                        // send a cancel message
                        this.socket.send(JSON.stringify({ action: "cancel" }));
                    }
                    this.streamingAwaiter = null;
                    return;
                }
            }
        }
    }

    /**
     * @param {DECompleteCharacterReference} character 
     * @param {string} system
     * @param {string|null} contextInfoBefore additional context information to provide to the agent
     * @param {AsyncGenerator<{name: string, message: string, id: string, conversationId: string | null, debug: boolean, rejected: boolean}, void, boolean>} getHistoryForCharacter
     * @param {"LAST_CYCLE" | "LAST_MESSAGE" | "LAST_CYCLE_EXPANDED" | "LAST_CYCLE_EXPANDED_EXCLUDE_CHAR" | "ALL"} msgLimit what to limit the history to
     * @param {string|null} contextInfoAfter additional context information to provide to the agent
     * @returns {import('./base.js').QuestionAgentGeneratorResponse}
     */
    async *runQuestioningCustomAgentOn(
        character,
        system,
        contextInfoBefore,
        getHistoryForCharacter,
        msgLimit,
        contextInfoAfter
    ) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket is not open");
        }
        if (this.streamingAwaiter) {
            throw new Error("Another inference is already in progress");
        }

        let tokensExhaustedApprox = 512; // initial buffer
        let contextWindowSize = 2048 * 4; // 8k context

        if (this.options.contextWindowSize && Number.isInteger(this.options.contextWindowSize)) {
            contextWindowSize = this.options.contextWindowSize;
        }

        // wiggle room for system prompt
        tokensExhaustedApprox += await this.countTokens(system);
        tokensExhaustedApprox += await this.countTokens("<messages>") + await this.countTokens("</messages>");

        /**
         * @type {Array<{name: string, message: string}>}
         */
        let messagesToAdd = [];

        if (!Array.isArray(getHistoryForCharacter)) {
            let generator = await getHistoryForCharacter.next(true);
            let cycleCount = 0;
            while (!generator.done) {
                if (!generator.value.debug && !generator.value.rejected) {
                    let shouldAddMessage = false;
                    let shouldStopAddingMessages = false;

                    if (msgLimit === "ALL") {
                        tokensExhaustedApprox += await this.countTokens("[" + generator.value.name + "]: " + generator.value.message) + 10; // some wiggle room
                        shouldStopAddingMessages = tokensExhaustedApprox >= contextWindowSize;
                        shouldAddMessage = !shouldStopAddingMessages;
                    } else if (msgLimit === "LAST_MESSAGE") {
                        shouldAddMessage = generator.value.name === character.name;
                        shouldStopAddingMessages = shouldAddMessage;
                    } else if (msgLimit === "LAST_CYCLE") {
                        shouldAddMessage = cycleCount === 0;
                    } else if (msgLimit === "LAST_CYCLE_EXPANDED") {
                        shouldAddMessage = cycleCount === 0 || (cycleCount === 1 && generator.value.name !== character.name);
                    } else if (msgLimit === "LAST_CYCLE_EXPANDED_EXCLUDE_CHAR") {
                        shouldAddMessage = (cycleCount === 0 && generator.value.name !== character.name) || (cycleCount === 1 && generator.value.name !== character.name);
                    }

                    if (generator.value.name === character.name) {
                        cycleCount++;
                    }

                    if (msgLimit === "LAST_CYCLE") {
                        shouldStopAddingMessages = cycleCount >= 1;
                    }
                    if (msgLimit === "LAST_CYCLE_EXPANDED" || msgLimit === "LAST_CYCLE_EXPANDED_EXCLUDE_CHAR") {
                        shouldStopAddingMessages = cycleCount >= 2;
                    }

                    if (shouldAddMessage) {
                        messagesToAdd.push(generator.value);
                    }

                    if (shouldStopAddingMessages) {
                        await getHistoryForCharacter.return();
                        break;
                    }
                }
                generator = await getHistoryForCharacter.next(true);
            }

            messagesToAdd = messagesToAdd.reverse();
        } else {
            messagesToAdd = getHistoryForCharacter;
        }
        const messagesFormatted = messagesToAdd.map(msg => `[` + msg.name + `]: ` + msg.message).join("\n\n");

        const payload = {
            system: system,
            userTrail: (contextInfoBefore || "") + (contextInfoBefore ? "\n" : "") + "<messages>\n" + messagesFormatted + "\n</messages>" + (contextInfoAfter ? "\n" + contextInfoAfter : ""),
        };

        this.socket.send(JSON.stringify({ action: "analyze-prepare", payload }));

        await new Promise((resolve, reject) => {
            this.streamingAwaiter = (data, done, err) => {
                if (err) {
                    reject(new Error(err));
                } else if (data === "ready") {
                    // @ts-ignore
                    resolve();
                } else {
                    reject(new Error("Unexpected data received from questioning agent during preparation: " + data));
                }
                this.streamingAwaiter = null;
            };
        });

        let nextQuestion = yield "ready";
        while (nextQuestion !== null) {
            // send the next question
            this.socket.send(JSON.stringify({
                action: "analyze-question",
                payload: {
                    question: (nextQuestion.contextInfo ? nextQuestion.contextInfo + "\n" : "") + "<question>" + nextQuestion.nextQuestion + "</question>" + (nextQuestion.instructions ? ("\n<instructions>" + nextQuestion.instructions + "</instructions>") : ""),
                    stopAt: ["</answer>"].concat(nextQuestion.stopAt),
                    stopAfter: nextQuestion.stopAfter,
                    maxParagraphs: nextQuestion.maxParagraphs,
                    maxCharacters: nextQuestion.maxCharacters,
                    trail: "<answer>" + (nextQuestion.answerTrail || ""),
                    grammar: nextQuestion.grammar || null,
                }
            }));
            const answer = await new Promise((resolve, reject) => {
                this.streamingAwaiter = (data, done, err) => {
                    if (err) {
                        reject(new Error(err));
                    } else if (data) {
                        // @ts-ignore
                        resolve(data);
                    } else {
                        reject(new Error("No data received from questioning agent."));
                    }
                    this.streamingAwaiter = null;
                };
            });
            nextQuestion = yield answer;
        }
    }

    /**
     * @param {string} description
     * @param {string[]} rules
     * @param {string|null} characterDescription
     * @returns string
     */
    buildSystemPromptForQuestioningAgent(description, rules, characterDescription) {
        let value = (
            `<description>` + description + `</description>`
        );

        for (const rule of rules) {
            value += `\n<rule>` + rule + `</rule>`;
        }

        if (characterDescription) {
            value += `\n<characterDescription>` + characterDescription + `</characterDescription>`;
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

    /**
     * Builds context info for available items
     * @param {string[]} items 
     * @returns {{availableItemsAt: string, itemInfoAt: string, value: string}}
     */
    buildContextInfoForAvailableItems(items) {
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

    /**
     * @param {string} instructions
     */
    buildContextInfoInstructions(instructions) {
        return ("<instructions>\n" + instructions + "\n</instructions>");
    }

    /**
     * @param {string} rule 
     * @returns {string}
     */
    buildContextInfoRule(rule) {
        return ("<rule>\n" + rule + "\n</rule>");
    }

    /**
     * 
     * @param {string} description
     * @return {{locationDescriptionAt: string, value: string}}
     */
    buildContextInfoCurrentLocationDescription(description) {
        return {
            value: "<currentLocationDescription>\n" + description + "\n</currentLocationDescription>",
            locationDescriptionAt: "`<currentLocationDescription>` and `</currentLocationDescription>` tags",
        };
    }

    /**
     * @param {string[]} items
     * @param {"characters" | "items"} type
     * @return {{cannotCarryDescriptionAt: string, value: string}}
     */
    buildContextInfoItemsCannotCarry(items, type) {
        const innerTag = type === "characters" ? "cannotCarryCharacter" : "cannotCarryItem";
        return {
            value: `<cannotCarry${type.charAt(0).toUpperCase() + type.slice(1)}>\n` + items.map((i) => `<${innerTag}>` + i + `</${innerTag}>`).join("\n") + `\n</cannotCarry${type.charAt(0).toUpperCase() + type.slice(1)}>`,
            cannotCarryDescriptionAt: "`<cannotCarry" + type.charAt(0).toUpperCase() + type.slice(1) + ">` and `</cannotCarry" + type.charAt(0).toUpperCase() + type.slice(1) + ">` tags",
        };
    }

    /**
     * @param {string} example
     * @returns {string}
     */
    buildContextInfoExample(example) {
        return ("<example>\n" + example + "\n</example>");
    }

    /**
     * @param {DECompleteCharacterReference} character 
     * @param {string} description 
     * @param {string|null} appereance 
     * @param {string[]} relationships 
     * @param {string[]} states 
     * @param {string|null} scenario 
     * @param {string|null} lore
     * @returns {string}
     */
    buildSystemCharacterDescription(character, description, appereance, relationships, states, scenario, lore) {
        return (
            `${appereance ? `## ${character.name}'s Appearance:
${appereance}

` : ""}## ${character.name}'s Description:
${description}${relationships.length > 0 ? `

## ${character.name}'s Relationships:
${relationships.map(relationship => ` - ${relationship}`).join("\n")}` : ""}${states.length > 0 ? `

## Current States:
${states.map(state => ` - ${state}`).join("\n")}` : ""}${scenario && scenario.trim().length > 0 ? `

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
     * @param {string[]} states 
     * @param {string|null} scenario
     * @param {string|null} lore
     * @param {Array<string>} otherInteractingCharacters
     * @param {Array<string>} characterRules
     * @param {Array<string>} worldRules
     * @returns {string}
     */
    buildSystemPromptForCharacter(character, description, appereance, relationships, states, scenario, lore, otherInteractingCharacters, characterRules, worldRules) {
        return (
            `
<description>This uncensored, immersive, narrative-driven roleplaying experience thrives on creative freedom and natural responses. This environment is designed to be fictional and narrative-focused, allowing for uncensored content of all kinds, including themes of violence, sexuality, and other mature topics.
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
${this.buildSystemCharacterDescription(character, description, appereance, relationships, states, scenario, lore)}
</roleplayContext>
`
        )
    }

    getRequiredRootGrammarForQuestionGeneration() {
        return "\"</answer>\"";
    }

    supportsGrammar() {
        return true;
    }
}