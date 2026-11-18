import { DEngine } from "../index.js";

/**
 * @typedef {Object} WordRejectionSettings
 * @property {Array<string>} rejectedWordsInNarration - The words to reject in narration.
 * @property {string | null} postRejectedWordInNarrationGrammar - The grammar to use after a rejected word in narration.
 * @property {Array<string>} rejectedWordsInDialogue - The words to reject in dialogue.
 * @property {string | null} postRejectedWordInDialogueGrammar - The grammar to use after a rejected word in dialogue.
 * @property {Array<string>} delimiters - The delimiters to use for splitting the text into words.
 * @property {boolean} startsInDialogue - Whether the text starts in dialogue or not.
 */

/**
 * @typedef {Object} DEServerPayload
 * @property {Array<{role: "system" | "user" | "assistant", content: string}>} messages
 * @property {number} maxParagraphs
 * @property {number} maxCharacters
 * @property {boolean} maxCharactersCutOnDot - Whether to cut on dot when max characters is reached, not just newline, default false
 * @property {number} maxSafetyCharacters
 * @property {WordRejectionSettings} wordRejection
 * @property {Array<string>} stopAfter
 * @property {Array<string>} stopAt
 * @property {string|null} grammar
 */

/**
 * @typedef {{text: string, thoughts: string[], warnings: string[]}} InferenceResponse
 */

/**
 * @typedef {AsyncGenerator<InferenceResponse, void, {
     * grammar?: string,
     * contextInfo?: string,
     * instructions?: string,
     * nextQuestion: string,
     * stopAfter: Array<string>,
     * stopAt: Array<string>,
     * maxParagraphs: number,
     * maxCharacters: number,
     * maxCharactersCutOnDot?: boolean,
     * maxSafetyCharacters: number,
     * newSession?: boolean,
     * thinkingEffort?: "none" | "low" | "medium" | "high" | "xhigh" | "max",
     * } | null>} QuestionAgentGeneratorResponse
     */

export class BaseInferenceAdapter {
    /**
     * @param {DEngine} parent
     */
    constructor(parent) {
        if (new.target === BaseInferenceAdapter) {
            throw new TypeError("Cannot construct BaseInferenceAdapter instances directly");
        }
        this.engine = parent;

        this.engine.setInferenceAdapter(this);

        /**
         * @type {Array<(status: {connected: boolean, reason?: string}) => void>}
         */
        this.onConnectionStatusChangeFns = [];
        /**
         * @type {Array<[() => void, (err: string) => void]>}
         */
        this.onConnectionStatusChangePromises = [];

        /**
         * @type {Array<() => Promise<void>>}
         */
        this.beforeInferenceFns = [];
    }
    
    async initialize() {
        throw new Error("Method 'initialize()' must be implemented.");
    }

    async ensureInitialized() {
        throw new Error("Method 'ensureInitialized()' must be implemented.");
    }

    async pause() {
        throw new Error("Method 'pause()' not supported by this adapter.");
    }

    async resume() {
        throw new Error("Method 'resume()' not supported by this adapter.");
    }

    /**
     * @returns {Array<string>} the list of supported languages
     */
    getSupportedLanguages() {
        throw new Error("Method 'getSupportedLanguages()' must be implemented.");
    }

    /**
     * Infers the next message for a character narrative purposes
     * 
     * @param {DEObject} DE
     * @param {DECompleteCharacterReference} character
     * @param {{
     *   messages: Array<{message: string, author: string, storyMaster: boolean, unprocessed: boolean}>,
     *   perspective: DEPerspective,
     *   narrativeEffects: string[],
     *   followingAction?: string|null,
     *   primaryEmotion: DEEmotionNames,
     *   emotionalRange: Array<DEEmotionNames>,
     *   type: "narration" | "dialogue" | "thought",
     *   internalDescription: DEInternalDescriptionOfCharacter,
     *   externalDescription: string,
     *   availableModes: Array<string>,
     *   availableSounds: Array<string>,
     *   forcedMode: string|null,
     *   forcedSounds: Array<string>,
     *   additionalInjections: Array<string>,
     * }} options
     * @returns {Promise<DEConversationMessageNarration | DEConversationMessageDialogue | DEConversationMessageThought>}
     */
    async inferNextStoryFragmentFor(
        DE,
        character,
        options,
    ) {
        throw new Error("Method 'inferNextStoryFragmentFor()' must be implemented.");
    }

    /**
     * The questioning agent is used to create a persistent agent session that can be used to ask multiple questions,
     * this is what is used for bond questioning, what will the character do next, etc...
     * 
     * The initial yield is {text: "ready", thoughts: [], warnings: []}. Later yields contain complete replies. Giving it a next
     * question will make it keep ongoing, passing null will make it stop after the current answer and the generator will finish.
     * Questions share conversation history within this generator by default.
     * Pass newSession: true with a question to reset to the original system prompt and context.
     * 
     * @param {string} gear the gear that is running this questioning agent
     * @param {{
     *   system: string,
     *   contextInfoBefore: string|null,
     *   messages: Array<{message: string, author: string, storyMaster: boolean, unprocessed: boolean}>,
     *   contextInfoAfter: string|null,
     *   remarkUnprocessedMessagesForAnalysis?: boolean,
     * }} options
     * @returns {QuestionAgentGeneratorResponse}
     */
    async *runQuestioningCustomAgentOn(
        gear,
        options,
    ) {
        throw new Error("Method 'runQuestioningCustomAgentOn()' must be implemented.");
    }

    /**
     * Builds a system prompt for an assistant to run a questioning agent
     * 
     * @param {string} description
     * @param {string[]} rules
     * @param {string[]|string|null} characterDescriptions
     * @returns {string}
     */
    buildSystemPromptForQuestioningAgent(description, rules, characterDescriptions) {
        throw new Error("Method 'buildSystemPromptForQuestioningAgent()' must be implemented.");
    }

    /**
     * Triggers the on connection status change event
     * @param {boolean} connected 
     * @param {string} [reason] 
     */
    triggerOnConnectionStatusChange(connected, reason) {
        const status = { connected, reason };
        this.onConnectionStatusChangeFns.forEach(fn => fn(status));
        this.onConnectionStatusChangePromises.forEach(([resolve, reject]) => {
            if (connected) {
                resolve();
            } else {
                reject(reason || "Unknown reason");
            }
        });
        this.onConnectionStatusChangePromises = [];
    }

    /**
     * @param {(status: {connected: boolean, reason?: string}) => any} callback
     */
    addEventListenerOnConnectStatusChange(callback) {
        this.onConnectionStatusChangeFns.push(callback);
    }

    /**
     * @param {(status: {connected: boolean, reason?: string}) => any} callback
     */
    removeEventListenerOnConnectStatusChange(callback) {
        this.onConnectionStatusChangeFns = this.onConnectionStatusChangeFns.filter(fn => fn !== callback);
    }

    /**
     * @param {() => Promise<void>} callback
     */
    addBlockingEventListenerBeforeInference(callback) {
        this.beforeInferenceFns.push(callback);
    }

    /**
     * @param {() => Promise<void>} callback
     */
    removeBlockingEventListenerBeforeInference(callback) {
        this.beforeInferenceFns = this.beforeInferenceFns.filter(fn => fn !== callback);
    }
}
