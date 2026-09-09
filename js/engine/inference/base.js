import { DEngine } from "../index.js";
import { InferenceAdapterLlamaUncensored } from "./adapter-de-server-uncensored.js";

// Optional dependency: `gbnf` is declared as an optionalDependency in
// package.json, so it may or may not be present at runtime. We attempt a
// dynamic ESM import of its bundled `dist/index.js` using a path that
// resolves identically under both electron (file://) and the web server
// (which mounts node_modules/gbnf at /node_modules/gbnf). If the import
// fails (package not installed), the experimental test-mode toggle is
// simply hidden.
let gbnfAvailable = false;
let gbnfDetected = false;
const gbnfDetectionPromise = import('../../../node_modules/gbnf/dist/index.js')
    .then(() => { gbnfAvailable = true; })
    .catch(() => { /* optional dependency not installed */ })
    .finally(() => { gbnfDetected = true; });

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
 * @property {string} trail
 * @property {number} maxParagraphs
 * @property {number} maxCharacters
 * @property {boolean} maxCharactersCutOnDot - Whether to cut on dot when max characters is reached, not just newline, default false
 * @property {number} maxSafetyCharacters
 * @property {WordRejectionSettings} wordRejection
 * @property {Array<string>} stopAfter
 * @property {Array<string>} stopAt
 * @property {string|null} grammar
 * @property {string} primaryEmotion
 * @property {{state: string, dominance: number}[]} activeStates
 */

/**
 * @typedef {AsyncGenerator<string, void, {
     * answerTrail?: string,
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
     * } | null>} QuestionAgentGeneratorResponse
     */

/**
 * @type {Object<string, {build: (engine: DEngine, config: any) => BaseInferenceAdapter, hasSelfSignedOption?: boolean, settings: import("../setting").SettingsFunction}>}>}
 */
export const INFERENCE_ADAPTERS = {
    "DreamServer": {
        settings: async () => ({
            host: {
                label: "DreamServer Host",
                description: "This is the host address for the DreamServer, you can define all parameters here for the remote server, for example wss://myserver.com:1234?model=custom&param=value, the protocol must be ws:// or wss://",
                default: "wss://localhost:8765",
                type: "string",
                placeholder: "Enter DreamServer host",
            },
            apiKey: {
                label: "DreamServer API Key",
                description: "This is the API key for the DreamServer, used for authentication.",
                default: "dev-secret-12345678900abcdef",
                type: "string",
                placeholder: "Enter DreamServer API key",
            },
            useExperimentalTestMode: await gbnfDetectionPromise.then(() => (gbnfAvailable ? {
                label: "Use Experimental Test Mode",
                placeholder: "Enable experimental test mode",
                description: "A developer mode that generates random sentences on inference, meant for expert testing and debugging. This mode is only available if the optional dependency 'gbnf' is installed.",
                default: false,
                type: "boolean",
            } : null)),
        }),
        hasSelfSignedOption: true,
        build: (engine, config) => new InferenceAdapterLlamaUncensored(engine, {
            apiKey: config.apiKey || "dev-secret-12345678900abcdef",
            host: config.host || "wss://localhost:8765",
            useExperimentalTestMode: config.useExperimentalTestMode || false,
        }),
    },
}

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
     *   primaryEmotion: string,
     *   narration: boolean,
     *   activeStates: Array<{state: string, dominance: number}>,
     *   __debug_id?: string|null,
     * }} options
     * @returns {AsyncGenerator<{type: "text" | "warning" | "hidden", content: string}, void, boolean>}
     */
    async* inferNextStoryFragmentFor(
        character,
        options,
    ) {
        throw new Error("Method 'inferNextStoryFragmentFor()' must be implemented.");
    }

    /**
     * Returns a debug payload, non-essential
     * this is an arbitrary json object that was sent as payload for whatever the server is
     * 
     * @param {string} __debug_id
     * @returns {any | null}
     */
    getDebugPayload(__debug_id) {
        return null;
    }

    /**
     * The questioning agent is used to create a persistent agent session that can be used to ask multiple questions,
     * this is what is used for bond questioning, what will the character do next, etc...
     * 
     * When the generator is called it will yield "entire answers" as they are generated, not token by token; giving it a next
     * question will make it keep ongoing, passing null will make it stop after the current answer and the generator will finish.
     * 
     * @param {string} gear the gear that is running this questioning agent
     * @param {{
     *   system: string,
     *   contextInfoBefore: string|null,
     *   messages: Array<{message: string, author: string, storyMaster: boolean}>,
     *   contextInfoAfter: string|null,
     *   remarkLastStoryFragmentForAnalysis?: boolean,
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
        throw new Error("Method 'buildSystemPromptForCharacter()' must be implemented.");
    }

    /**
     * @param {DECompleteCharacterReference} character the character in question that is building a prompt for
     * @param {{
     *   description: string,
     *   externalDescription: string|null,
     *   relationships: Array<{title: string, description: string}>,
     *   expressiveStates: string[],
     *   scenario: string|null,
     *   lore: string|null,
     * }} options
     * @returns {string} the system prompt
     */
    buildSystemCharacterDescription(character, options) {
        throw new Error("Method 'buildSystemCharacterDescription()' must be implemented.");
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
     * @param {Array<{groupDescription: string, characters: Array<{name: string, description: string}>}>} groups
     * @param {boolean} asSocialGroups
     * @returns {{availableCharactersAt: string, characterInfoAt: string, value: string}}
     */
    buildContextInfoForAvailableCharacters(groups, asSocialGroups = false) {
        throw new Error("Method 'buildContextInfoForAvailableCharacters()' must be implemented.");
    }

    /**
     * @param {string} instructions
     * @returns {string}
     */
    buildContextInfoInstructions(instructions) {
        throw new Error("Method 'buildContextInfoInstructions()' must be implemented.");
    }

    /**
     * @param {string} rule
     * @returns {string}
     */
    buildContextInfoRule(rule) {
        throw new Error("Method 'buildContextInfoRule()' must be implemented.");
    }

    /**
     * @param {string} example
     * @returns {string}
     */
    buildContextInfoExample(example) {
        throw new Error("Method 'buildContextInfoExample()' must be implemented.");
    }

    /**
     * @param {DECompleteCharacterReference} character
     * @param {string} info
     * @returns {{characterDescriptionAt: string, value: string}}
     */
    buildContextInfoCharacterDescription(character, info) {
        throw new Error("Method 'buildContextInfoCharacterDescription()' must be implemented.");
    }

    /**
     * @param {string} itemName
     * @param {string} title
     * @param {string[]} descriptions
     * @return {{itemDescriptionAt: string, value: string}}
     */
    buildContextInfoItemDescription(itemName, title, descriptions) {
        throw new Error("Method 'buildContextInfoItemDescription()' must be implemented.");
    }

    /**
     * Builds context info for available items
     * @param {string[]} items 
     * @returns {{availableItemsAt: string, itemInfoAt: string, value: string}}
     */
    buildContextInfoForAvailableItems(items) {
        throw new Error("Method 'buildContextInfoForAvailableItems()' must be implemented.");
    }

    /**
     * Specifies whether the adapter supports grammar generation
     * @returns {boolean}
     */
    supportsGrammar() {
        throw new Error("Method 'supportsGrammar()' must be implemented.");
    }

    /**
     * Specifies whether the adapter supports parallel requests, meaning multiple ongoing questioning agents or inference processes at the same time
     * @returns {boolean}
     */
    supportsParallelRequests() {
        throw new Error("Method 'supportsParallelRequests()' must be implemented.");
    }

    /**
     * @param {Array<{question: string; answer: string;}>} qaList 
     */
    buildContextInfoPreviousQuestionsAndAnswers(qaList) {
        throw new Error("Method 'buildContextInfoPreviousQuestionsAndAnswers()' must be implemented.");
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