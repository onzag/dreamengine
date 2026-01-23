import { DEngine } from '../index.js';
import { BaseInferenceAdapter } from './base.js';

export class InferenceAdapterLocalServer extends BaseInferenceAdapter {
    /**
     * @param {DEngine} parent 
     */
    constructor(parent) {
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
         * @type {((data: string, done: boolean, err: string | null) => void) | null}
         */
        this.streamingAwaiter = null;

        this.onData = this.onData.bind(this);
    }

    async initialize() {
        // set a websocket to the local server
        this.socket = new WebSocket('ws://localhost:8080');
        this.socket.addEventListener("message", this.onData);

        /**
         * @returns {Promise<void>}
         */
        return new Promise((resolve, reject) => {
            // @ts-ignore bugged out ts definition
            this.resolveInitializePromise = resolve;
            this.rejectInitializePromise = reject;

            // @ts-ignore
            this.socket.onerror = (err) => {
                this.resolveInitializePromise = null;
                this.rejectInitializePromise = null;
                reject(err);
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

            if (data.event == "ready") {
                if (this.resolveInitializePromise) {
                    this.resolveInitializePromise();
                    this.resolveInitializePromise = null;
                    this.rejectInitializePromise = null;
                }
            } else if (data.event == "error") {
                if (this.rejectInitializePromise) {
                    this.rejectInitializePromise(new Error(data.message));
                    this.resolveInitializePromise = null;
                    this.rejectInitializePromise = null;
                }
            } else if (data.event == "token") {
                if (this.streamingAwaiter) {
                    this.streamingAwaiter(data.token, data.err ? true : data.done, data.err || null);
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
     * @param {DECompleteCharacterReference} character 
     * @param {string} system 
     * @param {DEConversationMessage[]} messages
     * @param {string | null} reasoning
     * @returns {AsyncGenerator<string, void, boolean>}
     */
    async* inferNextMessageFor(
        character,
        system,
        messages,
        reasoning,
    ) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket is not open");
        }
        if (this.streamingAwaiter) {
            throw new Error("Another inference is already in progress");
        }
        const otherCharacterNames = new Set();
        for (const msg of messages) {
            if (msg.sender !== character.name) {
                otherCharacterNames.add(msg.sender);
            }
        }
        const payload = {
            messages: [
                {
                    role: "system",
                    content: system,
                },
            ],
            trail: character.name + ": ",
            extraStops: Array.from(otherCharacterNames),
            maxParagraphs: 3,
            maxCharacters: 1000,
            reasoning,
        };

        // TODO add messages to payload

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

        this.streamingAwaiter = (token, done, err) => {
            collectedMessages.push({ token, done, err });
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
            for (const msg of collectedMessages) {
                const shouldContinue = yield msg.token;
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
     * @param {string} preInstructions
     * @param {DEConversationMessage[]} messages
     * @param {string} postInstructions
     * @returns {AsyncGenerator<string, void, {nextQuestion: string, stopAt: Array<string>, maxParagraphs: number; maxCharacters: number} | null>}
     */
    async *runQuestioningCustomAgentOn(
        character,
        system,
        preInstructions,
        messages,
        postInstructions,
    ) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket is not open");
        }
        if (this.streamingAwaiter) {
            throw new Error("Another inference is already in progress");
        }
        const otherCharacterNames = new Set();
        for (const msg of messages) {
            if (msg.sender !== character.name) {
                otherCharacterNames.add(msg.sender);
            }
        }
        const payload = {
            messages: [
                {
                    role: "system",
                    content: system,
                },
            ],
        };

        // TODO add messages to payload, preInstructions, postInstructions

        this.socket.send(JSON.stringify({ action: "analyze", payload }));

        /**
         * @type {*}
         */
        let waitForMessagesToProcessResolve = null;
        /**
         * @type {Promise<void> | null}
         */
        let waitForMessagesToProcessPromise = null;
        /**
         * @type Array<{data: string, done: boolean, err: string | null}>
         */
        let collectedMessages = [];

        this.streamingAwaiter = (data, done, err) => {
            collectedMessages.push({ data, done, err });
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
            for (const msg of collectedMessages) {
                const continueInfo = yield msg.data;
                if (msg.done || msg.err || continueInfo === null) {
                    if (continueInfo === null) {
                        // send a cancel message
                        this.socket.send(JSON.stringify({ action: "cancel" }));
                    }
                    this.streamingAwaiter = null;
                    return;
                } else if (continueInfo) {
                    // send continue info
                    this.socket.send(JSON.stringify({ action: "continue", payload: continueInfo }));
                } else {
                    throw new Error("Invalid continueInfo provided");
                }
            }
        }
    }
}