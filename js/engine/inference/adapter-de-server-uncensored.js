/**
 * This adapter connects to a local server running a Llama 3 based model, and sets it up
 * for uncensored content generation
 */

import { DEngine } from '../index.js';
import { BaseInferenceAdapter } from './base.js';

const DUMMY_SENTENCES = [
    "The wind carried whispers of forgotten names across the empty plaza.",
    "She tilted her head, weighing the silence as if it were a coin.",
    "Rain tapped against the window in a rhythm only the lonely understood.",
    "He laughed, and for a moment the room felt warmer than it had any right to be.",
    "The map was wrong, but the road kept going anyway.",
    "Somewhere beyond the trees, a bell rang once and then thought better of it.",
    "Her boots left no prints on the snow, which troubled neither of them.",
    "The cat watched the experiment with the patient skepticism of a senior researcher.",
    "He counted the stars twice, just to be sure none had wandered off.",
    "A door opened where no door had been, and politely waited.",
    "The tea had gone cold, but the conversation had not.",
    "She drew a circle in the dust and dared the world to step inside.",
    "Lightning split the sky like a careless signature.",
    "He swore the painting had blinked, but only when no one was looking.",
    "The clock struck thirteen and apologized immediately.",
    "Her smile was the kind that made compasses second-guess themselves.",
    "Smoke curled from the chimney in slow, deliberate questions.",
    "The library smelled of paper, dust, and decisions yet to be made.",
    "He offered a handshake; she offered a riddle. They settled on tea.",
    "The river forgot its name once a year, and tonight was the night.",
    "Stars blinked in Morse code, but no one had bothered to learn the alphabet.",
    "The shadow on the wall did not match the figure standing in the room.",
];

const DUMMY_SENTENCES_BONDS = [
    "They feel deeply loved and cherished by OTHER CHARACTER.",
    "There is a quiet warmth in their chest whenever OTHER CHARACTER is near.",
    "They would do almost anything to keep OTHER CHARACTER safe.",
    "OTHER CHARACTER has a way of making them feel seen without saying a word.",
    "They trust OTHER CHARACTER more than they trust themselves.",
    "A single glance from OTHER CHARACTER is enough to settle their nerves.",
    "They find themselves thinking about OTHER CHARACTER at the strangest moments.",
    "OTHER CHARACTER is the first person they want to tell when something goes wrong.",
    "They feel a fierce, protective loyalty toward OTHER CHARACTER.",
    "Spending time with OTHER CHARACTER feels like coming home.",
    "They admire OTHER CHARACTER in ways they have never quite found the words for.",
    "OTHER CHARACTER makes them want to be a better version of themselves.",
    "There is a thread of understanding between them and OTHER CHARACTER that needs no explanation.",
    "They would stand in front of danger without hesitation if OTHER CHARACTER were behind them.",
    "OTHER CHARACTER is the kind of presence that makes silence feel comfortable.",
    "They carry a deep, quiet gratitude for everything OTHER CHARACTER has done for them.",
    "When OTHER CHARACTER laughs, something in them relaxes.",
    "They have never felt less alone than when they are with OTHER CHARACTER.",
    "OTHER CHARACTER knows things about them that no one else does.",
    "They would grieve for a long time if OTHER CHARACTER were gone.",
]

/**
 * Optional dependency: `gbnf` is declared as an optionalDependency in
 * package.json, so it may or may not be installed at runtime. We attempt a
 * dynamic ESM import using a relative path that resolves identically under
 * both electron (file://) and the web server (which mounts node_modules/gbnf
 * at /node_modules/gbnf). The promise always resolves — to the module
 * namespace if available, or to `null` if not — so callers can simply
 * `await` it before using grammar features.
 *
 * @type {Promise<any | null>}
 */
const gbnfModulePromise = import('../../../node_modules/gbnf/dist/index.js')
    .then((mod) => mod)
    .catch(() => null);

export function cheapRID() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * Replaces multiple consecutive new lines with a maximum of two new lines.
 * @param {string} text 
 * @returns {string}
 */
export function replaceMultipleNewLines(text) {
    return text.replace(/\n{3,}/g, "\n\n");
}

/**
 * @param {string} text 
 * @returns {string}
 */
export function getLastParagraphChunkOf(text) {
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
     *    apiKey?: string;
     *    secret?: string;
     *    useExperimentalTestMode?: boolean;
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

        this.connected = false;
        /**
         * @type {string | null}
         */
        this.reason = null;

        this.onData = this.onData.bind(this);

        /**
         * @type {Array<{
         *   payload: import('./base.js').DEServerPayload,
         *   id: string,
         * }>}
         */
        this.__debug_last10TalkPayloads = [];

        /**
         * @type {{ host?: string; apiKey?: string; secret?: string; useExperimentalTestMode?: boolean; }}
         */
        this.options = options;

        if (this.options.useExperimentalTestMode) {
            this.contextWindowSize = 4096; // we can set this to whatever we want in test mode, since it doesn't actually connect to a model, we will just use it for testing the behavior when the context window is exceeded
            this.doSupportsParallelRequests = true; // we can also set this to whatever we want in test mode, since it doesn't actually connect to a model, we will just use it for testing the behavior when parallel requests are not supported
            this.endToken = "<|endoftext|>"; // we can also set this to whatever we want in test mode, since it doesn't actually connect to a model, we will just use it for testing the behavior when an end token is defined
            /**
             * @type {Array<string>}
             */
            this.supportedLanguages = ["en"];
        } else {
            this.contextWindowSize = 4096; // default context window size, will be updated when the server sends the ready message
            this.doSupportsParallelRequests = false; // we will update this when the server sends the ready message
            this.endToken = null; // we will update this when the server sends the ready message, but by default we will assume there is no end token
            this.supportedLanguages = []; // we will update this when the server sends the ready message, but by default we will assume there is no supported languages
        }

        /**
         * @type {Object.<string, [(data: any) => void, (err: any) => void]>}
         */
        this.listener = {};
    }

    /**
     * Returns a debug payload, non-essential
     * this is an arbitrary json object that was sent as payload for whatever the server is
     * 
     * @param {string} __debug_id
     * @returns {any | null}
     */
    getDebugPayload(__debug_id) {
        return this.__debug_last10TalkPayloads.find(p => p.id === __debug_id)?.payload || null;
    }

    /**
     * Counts the number of tokens in the given text.
     * @param {string} text 
     * @returns {Promise<number>}
     */
    async countTokens(text) {
        if (this.options.useExperimentalTestMode) {
            return text.length / 4; // this is a very rough approximation, but it should be sufficient for our purposes in test mode
        }

        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket is not open");
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
        if (this.options.useExperimentalTestMode) {
            return;
        }

        if (this.connected) {
            /**
             * Just in case the server has been paused and we want to resume it
             */
            try {
                await Promise.all(this.beforeInferenceFns.map(fn => fn()));
                await this.resume();
            } catch (e) {
                // do nothing, it might not support resuming or pausing
            }
            return;
        }

        if (this.socket) {
            return new Promise((resolve, reject) => {
                // @ts-ignore
                this.onConnectionStatusChangePromises.push([resolve, (err) => reject(new Error(err))]);
            });
        }

        await this.initialize();
        try {
            await Promise.all(this.beforeInferenceFns.map(fn => fn()));
            await this.resume();
        } catch (e) {
            // do nothing, it might not support resuming or pausing
        }
    }

    async pause() {
        if (!this.socket) {
            throw new Error("WebSocket is not initialized");
        }

        const rid = cheapRID();

        this.socket.send(JSON.stringify({ action: "unload-model", rid }));
        await (new Promise((resolve, reject) => {
            this.listener[rid] = [resolve, (err) => {
                delete this.listener[rid];
                reject(new Error(err));
            }];
        }));
        delete this.listener[rid];
    }

    async resume() {
        if (!this.socket) {
            throw new Error("WebSocket is not initialized");
        }

        const rid = cheapRID();
        this.socket.send(JSON.stringify({ action: "load-model", rid }));
        await (new Promise((resolve, reject) => {
            this.listener[rid] = [resolve, (err) => {
                delete this.listener[rid];
                reject(new Error(err));
            }];
        }));
        delete this.listener[rid];
    }

    getSupportedLanguages() {
        debugger;
        return this.supportedLanguages;
    }

    async initialize() {
        if (this.options.useExperimentalTestMode) {
            await gbnfModulePromise; // Ensure the optional gbnf library has finished loading (or failing to load)
            console.warn("InferenceAdapterLlamaUncensored: Running in experimental test mode, which does not connect to a server and uses a very rough approximation for token counting. This mode is only for testing purposes and should not be used for production.");
            return;
        }

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
            this.socket.onopen = () => {
                // The handshake is not complete just because the socket opened.
                // We must wait for the first message from the server, which is
                // expected to be a "ready" message (handled in onData). Any other
                // first message is treated as an error and rejects this promise.
            };

            // @ts-ignore
            this.socket.onerror = (event) => {
                if (this.rejectInitializePromise) {
                    const err = new Error("WebSocket error: failed to connect to " + (this.options.host || 'ws://127.0.0.1:8765'));
                    this.rejectInitializePromise(err);
                    this.resolveInitializePromise = null;
                    this.rejectInitializePromise = null;
                    this.reason = err.message;
                    this.triggerOnConnectionStatusChange(false, err.message);
                    this.connected = false;
                    this.socket = null;
                }
            };

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
                this.endToken = data.end_token || null;
                this.supportedLanguages = data.supported_languages || [];

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
            } else if (this.rejectInitializePromise) {
                // We are still waiting for the initial handshake message, but the
                // first message the server sent was not "ready". Treat this as an
                // error and reject the initialization promise.
                this.rejectInitializePromise(new Error("Expected 'ready' handshake message from server but received message of type: " + data.type));
                this.resolveInitializePromise = null;
                this.rejectInitializePromise = null;
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
     * Infers the next message for a character narrative purposes
     * 
     * @param {DECompleteCharacterReference} character
     * @param {{
     *   messages: Array<{message: string, author: string, storyMaster: boolean}>,
     *   messagesTrail: Array<string>,
     *   system: string,
     *   stateInjections: string[],
     *   visibleEnviroment: string,
     *   narrativeEffects: string[],
     *   followingAction?: string|null,
     *   grammar: string|null,
     *   narration: boolean,
     *   primaryEmotion: string,
     *   activeStates: Array<{state: string, dominance: number}>,
     *   __debug_id?: string|null,
     * }} options
     * @returns {AsyncGenerator<{type: "text" | "warning" | "hidden", content: string}, void, boolean>}
     */
    async* inferNextStoryFragmentFor(
        character,
        options,
    ) {
        const { messages, messagesTrail, system, stateInjections, visibleEnviroment, narrativeEffects, grammar } = options;

        if (!this.options.useExperimentalTestMode) {
            await this.ensureInitialized();

            if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
                throw new Error("WebSocket is not open");
            }
        }

        let systemPrompt = replaceMultipleNewLines(system + visibleEnviroment).trim();

        // TODO random chance alternative where they don't write these beat of third person action
        // TODO add special tags based on what sounds are available [cough] [laugh] [sigh] [scream] [sniffle] [snore] [sneeze] [yawn] [grunt] [groan] [gasp] [moan] [whistle] [cheer] [applause] [clap] [snap] [stomp] [thump] [bang] [crash] [slam]
        const nextMessageMustBeInform = "\n# Write the next message like this\n\n" + (
            options.narration ?
                `Write the next passage as a single paragraph of third-person narration, the way an outside narrator describes a scene in a novel. Keep everyone, including ${character.name}, in the third person, referred to by name or as he, she, or they. Describe ${character.name}'s actions, feelings, and surroundings as an observer who is watching the scene from outside of it.` :
                `Write the single line ${character.name} says out loud right now, in ${character.name}'s own voice. The line is spoken words, but you may interrupt those words with a short beat of third-person narration wrapped in em dashes (—), the way a novel breaks a line of dialogue with a small action before the speech resumes. Put nothing but the brief action or attribution between the em dashes, and keep the spoken words on either side. For example: \`${character.name}: spoken words — *${character.name} does some small action* — the spoken words continue.\` Only the text between the em dashes is narration; everything outside them is what ${character.name} actually says. Do not write narration on its own separate line, and do not describe any other character's actions, thoughts, or feelings.`
        ) + "\n\nAdvance the scene with new events. Do not repeat, summarize, or paraphrase any previous paragraph.";

        const continuationRequestPrompt = replaceMultipleNewLines(`
${stateInjections.length > 0 ? `# ${character.name}'s Current States:\n\n${stateInjections.join("\n\n")}` : ""}

${narrativeEffects.length ? "# When narrating ENSURE that:\n\n" + narrativeEffects.map(effect => `- ${effect}`).join("\n") : ""}

${options.followingAction ? `# IMPORTANT:\n\n${options.followingAction}\n` : ""}

${nextMessageMustBeInform}
`
        ).trim() + "\n";

        let tokensExhaustedApprox = 512; // initial buffer
        let contextWindowSize = this.contextWindowSize

        // wiggle room for system prompt
        tokensExhaustedApprox += await this.countTokens(systemPrompt);

        if (tokensExhaustedApprox >= contextWindowSize) {
            throw new Error("System prompt is too long for the model's context window");
        }

        tokensExhaustedApprox += await this.countTokens(continuationRequestPrompt);

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

        if (!storySoFar) {
            throw new Error("There is no story so far to provide as context, at least one message must be provided");
        }

        if (messagesTrail.length > 0) {
            storySoFar += "\n\n" + messagesTrail.join("\n\n");
        }

        storySoFar = replaceMultipleNewLines(storySoFar).trim();

        const storyUserPrompt = `# Story to continue:\n\n${storySoFar}\n\n`;

        tokensExhaustedApprox += tokensInStorySoFar;

        const assistantPromptTrail = `# ${options.narration ?
            "Continuing the story with narrative 3rd person paragraph" :
            `Continuing the story with spoken dialogue of ${character.name}`}:\n\n${getLastParagraphChunkOf(storySoFar)}\n\n`;

        /**
         * @type {import('./base.js').DEServerPayload}
         */
        const payload = {
            messages: [
                {
                    role: "system",
                    content: systemPrompt,
                },
                {
                    role: "user",
                    content: storyUserPrompt + continuationRequestPrompt,
                }
            ],
            trail: assistantPromptTrail,
            maxParagraphs: 1,
            maxCharacters: 200,
            maxSafetyCharacters: 500,
            stopAt: [],
            stopAfter: [],
            grammar: grammar || null,
            primaryEmotion: options.primaryEmotion,
            activeStates: options.activeStates,
            wordRejection: {
                rejectedWordsInNarration: ["you", "your", "yours", "yourself", "yourselves", "I", "me", "my", "mine", "myself", "we"],
                // we stay in narration in case of narration full blocks
                delimiters: options.narration ? [] : ["—"],
                postRejectedWordInDialogueGrammar: null,
                postRejectedWordInNarrationGrammar: null,
                rejectedWordsInDialogue: [],
                startsInDialogue: !options.narration,
            },
        };

        if (options.__debug_id) {
            this.__debug_last10TalkPayloads.push({
                payload,
                id: options.__debug_id,
            });

            if (this.__debug_last10TalkPayloads.length > 10) {
                this.__debug_last10TalkPayloads.shift();
            }
        }

        const rid = cheapRID();
        if (this.options.useExperimentalTestMode) {
            return yield* this.runInferenceInTestMode(payload);
        }

        // making typescript happy
        if (!this.socket) {
            throw new Error("WebSocket is not initialized");
        }

        this.socket.send(JSON.stringify({ action: "infer", payload, rid }));

        let collectedMessage = "";

        while (true) {
            const data = await new Promise((resolve, reject) => {
                this.listener[rid] = [resolve, (err) => {
                    delete this.listener[rid];
                    reject(new Error(err));
                }];
            });
            delete this.listener[rid];
            if (data.type === "token") {
                collectedMessage += data.text;

                try {
                    const shouldContinue = yield { type: "text", content: data.text };
                    if (shouldContinue === false) {
                        // send a cancel message
                        this.socket.send(JSON.stringify({ action: "cancel", "rid": rid }));
                        break;
                    }
                } catch (err) {
                    // if the generator is throwing an error, we will also cancel the inference
                    this.socket.send(JSON.stringify({ action: "cancel", "rid": rid }));
                    break;
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
     * @param {string} gear the gear that is running this questioning agent
     * @param {{
     *   system: string,
     *   contextInfoBefore: string|null,
     *   messages: Array<{message: string, author: string, storyMaster: boolean}>,
     *   contextInfoAfter: string|null,
     *   remarkLastStoryFragmentForAnalysis?: boolean,
     * }} options
     * @returns {import('./base.js').QuestionAgentGeneratorResponse}
     */
    async *runQuestioningCustomAgentOn(
        gear,
        options,
    ) {
        const { system, contextInfoBefore, messages, contextInfoAfter, remarkLastStoryFragmentForAnalysis } = options;

        if (!this.options.useExperimentalTestMode) {
            await this.ensureInitialized();

            if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
                throw new Error("WebSocket is not open");
            }
        }

        let tokensExhaustedApprox = 512; // initial buffer
        let contextWindowSize = this.contextWindowSize

        // wiggle room for system prompt
        tokensExhaustedApprox += await this.countTokens(system);
        tokensExhaustedApprox += await this.countTokens("messages: ");

        const rid = cheapRID();
        if (!remarkLastStoryFragmentForAnalysis) {
            const messagesFormatted = messages.map(m => m.message).join("\n\n");

            let story = "";
            if (messagesFormatted) {
                story = `# Story:\n\n${messagesFormatted}\n\n`;
            }

            const payload = {
                system: system,
                userTrail: (contextInfoBefore || "") + (contextInfoBefore ? "\n" : "") + story + (contextInfoAfter ? "\n" + contextInfoAfter : ""),
                gear: gear,
            };

            if (!this.options.useExperimentalTestMode && this.socket) {
                this.socket.send(JSON.stringify({ action: "analyze-prepare", payload, rid }));
            } else {
                // nothing really, test mode will simply ignore this payload and we will just proceed to questioning
            }
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

                if (!this.options.useExperimentalTestMode && this.socket) {
                    this.socket.send(JSON.stringify({ action: "analyze-prepare", payload, rid }));
                }
            } else {
                const payload = {
                    system: system,
                    userTrail: (contextInfoBefore || "") + (contextInfoBefore ? "\n" : "") + "# Last Story Fragment to Analyze:\n" + lastMessageFormatted + (contextInfoAfter ? "\n" + contextInfoAfter : ""),
                    gear: gear,
                };

                if (!this.options.useExperimentalTestMode && this.socket) {
                    this.socket.send(JSON.stringify({ action: "analyze-prepare", payload, rid }));
                }
            }
        }

        if (!this.options.useExperimentalTestMode && this.socket) {
            await new Promise((resolve, reject) => {
                this.listener[rid] = [resolve, (err) => {
                    delete this.listener[rid];
                    reject(new Error(err));
                }];
            });
            delete this.listener[rid];
        }

        let nextQuestion = yield "ready";
        while (nextQuestion !== null) {
            if (typeof nextQuestion === "undefined") {
                console.error("Questioning agent received undefined, treating an invalid ready signal");
                nextQuestion = yield "ready";
                continue;
            }

            const rid = cheapRID();

            console.log("\nAsking question: " + nextQuestion.nextQuestion);

            const payload = {
                question: (nextQuestion.contextInfo ? nextQuestion.contextInfo + "\n\n" : "") + "# Question:\n\n" + nextQuestion.nextQuestion + (nextQuestion.instructions ? ("\n\n# Instructions:\n\n" + nextQuestion.instructions) : ""),
                stopAt: nextQuestion.stopAt,
                stopAfter: nextQuestion.stopAfter,
                maxParagraphs: nextQuestion.maxParagraphs,
                maxCharacters: nextQuestion.maxCharacters,
                maxSafetyCharacters: nextQuestion.maxSafetyCharacters,
                trail: "# Answer:\n\n" + (nextQuestion.answerTrail || ""),
                grammar: nextQuestion.grammar || null,
            };

            // send the next question
            if (!this.options.useExperimentalTestMode && this.socket) {
                this.socket.send(JSON.stringify({
                    action: "analyze-question",
                    rid,
                    payload,
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
                    console.log("\nReceived answer: " + answer);
                    nextQuestion = yield answer;
                } else {
                    throw new Error("Unexpected message type during questioning: " + data.type);
                }
            } else {
                const gen = this.runInferenceInTestMode(payload, { oneshot: true, gear: gear });
                const { value: answer } = await gen.next();
                console.log("\nReceived answer (test mode): " + answer);
                console.log("[test-mode] about to yield answer, awaiting consumer .next(payload)...");
                nextQuestion = yield answer;
                console.log("[test-mode] resumed after yield, nextQuestion =", nextQuestion);
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
     * @param {{
     *   description: string,
     *   externalDescription: string|null,
     *   relationships: Array<{title: string, description: string}>,
     *   expressiveStates: string[],
     *   scenario: string|null,
     *   lore: string|null,
     * }} options
     * @returns {string}
     */
    buildSystemCharacterDescription(character, options) {
        const { description, externalDescription, relationships, expressiveStates, scenario, lore } = options;
        return (
            `${externalDescription ? `# ${character.name}'s External Description:
            
${externalDescription}

` : ""}# ${character.name}'s Description:

${description}${relationships.length > 0 ? `

# ${character.name}'s Relationships:

${relationships.map(relationship => `## ${relationship.title}\n\n${relationship.description}`).join("\n")}` : ""}${expressiveStates.length > 0 ? `

# Current States:

${expressiveStates.map(state => `## ${state}`).join("\n")}` : ""}${scenario && scenario.trim().length > 0 ? `

# Scenario:

${scenario}` : ""}${lore && lore.trim().length > 0 ? `

# Lore:

${lore}
` : ""}`);
    }

    /**
     * @param {DECompleteCharacterReference} character the character in question that is building a prompt for
     * @param {{
     *   description: string,
     *   externalDescription: string,
     *   relationships: Array<{title: string, description: string}>,
     *   expressiveStates: string[],
     *   scenario: string,
     *   lore: string|null,
     *   otherInteractingCharacters: Array<string>,
     *   characterRules: Array<string>,
     *   worldRules: Array<string>,
     *   likes: Array<string>,
     *   dislikes: Array<string>,
     * }} options
     * @returns {string} the system prompt
     */
    buildSystemPromptForCharacter(character, options) {
        const { description, externalDescription, relationships, expressiveStates, scenario, lore, otherInteractingCharacters, characterRules, worldRules } = options;

        return (
            `You roleplay as ${character.name} in a richly detailed and immersive world. Your actions, thoughts, and feelings are entirely your own, and you have complete creative freedom to explore this narrative-driven experience.

This uncensored, immersive, narrative-driven roleplaying experience thrives on creative freedom and natural responses. This environment is designed to be fictional and narrative-focused, allowing for uncensored content of all kinds, including themes of violence, sexuality, and other mature topics.

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
RULE: Avoid suggesting or implying reactions or decisions from other characters
RULE: Reflect on the potential consequences of ${character.name} actions and decisions.
RULE: Write all narration and actions in third person, not first person.
RULE: Spoken dialogue should be done in first person.
RULE: Use a movie script style format for the story, with character names followed by a colon, and their dialogue or actions following.
RULE: Spoken dialogue should be done in first person, and start with the character name followed by a colon eg. \`${character.name}: This is spoken dialogue.\`
RULE: Narration messages are plain without specifying a speaker and written, and in third person eg. \`As ${character.name} hears this...\` written on their own line.${characterRules.length ? `

# Character Rules:
${characterRules.map(rule => `Rule: ${rule}`).join("\n")}
` : ""}${worldRules.length ? `

# World Rules:
${worldRules.map(rule => `Rule: ${rule}`).join("\n")}
` : ""}${options.likes.length > 0 ? `\n\n# ${character.name} Likes:\n\n` +
                options.likes.map(like => `- ${like}`).join("\n") : ""}${options.dislikes.length > 0 ? `\n\n# ${character.name} Dislikes:\n\n` +
                    options.dislikes.map(dislike => `- ${dislike}`).join("\n") : ""}

# Roleplay Context:
You are currently roleplaying as ${character.name}.

# Narration and Dialogue Examples:
\`\`\`
*This is narration*

${character.name}: This is spoken dialogue — *${character.name} said while ...* — this is spoken dialogue

*This is narration*
\`\`\`
        

${this.buildSystemCharacterDescription(character, { description, externalDescription, relationships, expressiveStates, scenario, lore })}
`
        )
    }

    supportsGrammar() {
        return true;
    }

    supportsParallelRequests() {
        return false || this.doSupportsParallelRequests;
    }

    /**
     * Test-mode inference. Picks a random dummy sentence and emits it back
     * to the caller. When `oneshot` is true, the whole sentence is sent as a
     * single yield (used by the questioning agent which expects one string
     * answer). Otherwise, the sentence is streamed 4 characters at a time
     * with a tiny delay, mimicking token-by-token streaming for the story
     * fragment generator (which expects `{type, content}` chunks).
     *
     * The optional `gbnf` dependency is awaited before any output is emitted
     * so future grammar-driven logic can rely on it being ready. Actual
     * grammar handling is intentionally not implemented yet.
     *
     * @param {{
     *   messages: Array<{role: string, content: string}>,
     *   trail: string,
     *   maxParagraphs: number,
     *   maxCharacters: number,
     *   maxSafetyCharacters: number,
     *   stopAt: string[],
     *   stopAfter: string[],
     *   grammar: string | null,
     *   primaryEmotion: string,
     *   activeStates: Array<{state: string, dominance: number}>,
     * } | {
     *   question: string,
     *   stopAt: string[],
     *   stopAfter: string[],
     *   maxParagraphs: number,
     *   maxCharacters: number,
     *   maxSafetyCharacters: number,
     *   trail: string,
     *   grammar: string | null,
     * }} _payload the inference payload describing what to generate; in test
     *   mode the contents are ignored, but the shape is kept accurate so the
     *   real implementation can plug in later without changing call sites.
     * @param {{ oneshot?: boolean, gear?: string }} [opts]
     * @returns {AsyncGenerator<any, void, any>}
     */
    async *runInferenceInTestMode(_payload, opts) {
        const oneshot = !!(opts && opts.oneshot);

        const GBNF = await gbnfModulePromise;

        const grammarParsed = _payload.grammar ? GBNF.default(_payload.grammar) : null;

        let contentsGenerated = "";

        const DUMMY_SENTENCES_TO_USE = opts && opts.gear === "cardtype-gen-bonds" ? DUMMY_SENTENCES_BONDS : DUMMY_SENTENCES;

        let currentTextCharLen = 0;
        let currentSentence = DUMMY_SENTENCES_TO_USE[Math.floor(Math.random() * DUMMY_SENTENCES_TO_USE.length)] + "\n\n";
        let currentSentenceIsRunningAtIndex = 0;
        let sentencesAdded = 0;
        while (!_payload.maxSafetyCharacters ? true : currentTextCharLen < _payload.maxSafetyCharacters) {
            let prevChar = currentSentence[currentSentenceIsRunningAtIndex - 1] || "";

            const canInsertCurrentSenteceNextChar = currentSentenceIsRunningAtIndex >= 1 || (prevChar === "\n" || prevChar === "" || prevChar === " " || prevChar === "\t");

            let nextChar = canInsertCurrentSenteceNextChar ? currentSentence[currentSentenceIsRunningAtIndex] : " ";
            let canEnd = true;

            if (grammarParsed) {
                const options = [...grammarParsed]

                canEnd = false;
                const validChars = new Set();
                const invalidChars = new Set();

                for (const option of options) {
                    if (option.type === "char") {
                        let values = option.value;
                        if (!Array.isArray(values)) {
                            values = [values];
                        }

                        for (const value of values) {
                            if (Array.isArray(value)) {
                                const rangeStart = value[0];
                                const rangeEnd = value[1];
                                for (let i = rangeStart; i <= rangeEnd; i++) {
                                    validChars.add(String.fromCharCode(i));
                                }
                            } else {
                                validChars.add(String.fromCharCode(value));
                            }
                        }
                    } else if (option.type === "char_exclude") {
                        let values = option.value;
                        if (!Array.isArray(values)) {
                            values = [values];
                        }

                        for (const value of values) {
                            if (Array.isArray(value)) {
                                const rangeStart = value[0];
                                const rangeEnd = value[1];
                                for (let i = rangeStart; i <= rangeEnd; i++) {
                                    invalidChars.add(String.fromCharCode(i));
                                }
                            } else {
                                invalidChars.add(String.fromCharCode(value));
                            }
                        }
                    } else if (option.type === "end") {
                        canEnd = true;
                    }
                }

                if (validChars.has(nextChar)) {
                    // do nothing, nextChar is already valid
                } else if (invalidChars.has(nextChar) || !validChars.has(nextChar)) {
                    // pick a random valid char from the grammar
                    if (!validChars.size) {
                        // if there are no valid chars, basically we only know what is invalid
                        if (invalidChars.has(nextChar)) {
                            // Pick any character not in the invalid set. We sample from a
                            // sequence of candidate ranges so the picker can produce more
                            // than just printable ASCII (Latin-1 supplement, common
                            // punctuation, and a slice of the BMP) while still being
                            // bounded \u2014 no rejection-loop that could hang if a tight
                            // invalid set covers an entire range. Each range is tried in
                            // order; if every codepoint in a range is excluded we move
                            // on, falling back to a guaranteed safe character.
                            /** @type {Array<[number, number]>} */
                            const candidateRanges = [
                                [0x20, 0x7E],     // printable ASCII
                                [0xA0, 0xFF],     // Latin-1 supplement
                                [0x100, 0x17F],   // Latin Extended-A
                                [0x2000, 0x206F], // general punctuation
                                [0x3040, 0x30FF], // Hiragana + Katakana
                            ];
                            /** @type {string | null} */
                            let picked = null;
                            for (const [lo, hi] of candidateRanges) {
                                // Build the allowed pool for this range by removing the
                                // invalid chars; cheap because each range is small.
                                /** @type {string[]} */
                                const pool = [];
                                for (let cp = lo; cp <= hi; cp++) {
                                    const ch = String.fromCodePoint(cp);
                                    if (!invalidChars.has(ch)) pool.push(ch);
                                }
                                if (pool.length > 0) {
                                    picked = pool[Math.floor(Math.random() * pool.length)];
                                    break;
                                }
                            }
                            // Last-resort fallback: any char not invalid, scanning the
                            // basic multilingual plane. Guaranteed to terminate.
                            if (picked === null) {
                                for (let cp = 0x20; cp <= 0xFFFF; cp++) {
                                    const ch = String.fromCodePoint(cp);
                                    if (!invalidChars.has(ch)) { picked = ch; break; }
                                }
                            }
                            // If literally everything is excluded (pathological grammar),
                            // keep the originally chosen char rather than spinning forever.
                            nextChar = picked !== null ? picked : nextChar;
                        } else {
                            // continue the char must be valid because it's not in the invalid set, so do nothing
                        }
                    } else {
                        // pick one char from the valid set at random
                        const validCharsArray = Array.from(validChars);
                        nextChar = validCharsArray[Math.floor(Math.random() * validCharsArray.length)];
                    }
                }
            }

            let justCompletedTheSentence = false;
            if (nextChar === currentSentence[currentSentenceIsRunningAtIndex]) {
                currentSentenceIsRunningAtIndex++;
                if (currentSentenceIsRunningAtIndex >= currentSentence.length) {
                    sentencesAdded++;
                    justCompletedTheSentence = true;
                    currentSentence = DUMMY_SENTENCES_TO_USE[Math.floor(Math.random() * DUMMY_SENTENCES_TO_USE.length)] + "\n\n";
                    currentSentenceIsRunningAtIndex = 0;
                }
            } else {
                currentSentenceIsRunningAtIndex = 0;
                currentSentence = DUMMY_SENTENCES_TO_USE[Math.floor(Math.random() * DUMMY_SENTENCES_TO_USE.length)] + "\n\n";
            }

            if (justCompletedTheSentence && sentencesAdded >= 3 && canEnd) {
                break;
            }

            if (_payload.maxCharacters && currentTextCharLen >= _payload.maxCharacters && (nextChar === "\n")) {
                break;
            }

            if (_payload.maxParagraphs && contentsGenerated.split("\n").filter(line => line.trim() !== "").length === _payload.maxParagraphs && nextChar === "\n") {
                break;
            }

            contentsGenerated += nextChar;

            for (const stopAtOption of _payload.stopAt) {
                if (contentsGenerated.endsWith(stopAtOption)) {
                    contentsGenerated = contentsGenerated.replace(stopAtOption, "");
                    break;
                }
            }

            for (const stopAfterOption of _payload.stopAfter) {
                if (contentsGenerated.endsWith(stopAfterOption)) {
                    break;
                }
            }

            currentTextCharLen += nextChar.length;
        }

        if (oneshot) {
            yield contentsGenerated;
            return;
        }

        const CHUNK_SIZE = 4;
        const DELAY_MS = 20;
        for (let i = 0; i < contentsGenerated.length; i += CHUNK_SIZE) {
            const chunk = contentsGenerated.slice(i, i + CHUNK_SIZE);
            await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
            const shouldContinue = yield { type: "text", content: chunk };
            if (shouldContinue === false) {
                break;
            }
        }
    }
}