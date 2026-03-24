import { DEngine } from "../index.js";

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
     * maxSafetyCharacters: number,
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
    }
    
    async initialize() {
        throw new Error("Method 'initialize()' must be implemented.");
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
     *   grammar: string|null,
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
     *   relationships: string[],
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
     *   relationships: string[],
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
}