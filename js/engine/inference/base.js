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
     * @param {string[]} messages
     * @param {string} system 
     * @param {string[]} stateInjections
     * @param {string} visibleEnviroment
     * @param {string[]} actions
     * @param {string[]} narrativeEffects
     * @param {string} primaryEmotion
     * @param {string[]} emotionalRange
     * @param {string} grammar
     * @returns {AsyncGenerator<string, void, boolean>}
     */
    async* inferNextStoryFragmentFor(
        character,
        messages,
        system,
        stateInjections,
        visibleEnviroment,
        actions,
        narrativeEffects,
        primaryEmotion,
        emotionalRange,
        grammar,
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
     * @param {string} system
     * @param {string|null} contextInfoBefore additional context information to provide to the agent
     * @param {Array<{message: string, author: string, storyMaster: boolean}>} messages
     * @param {string|null} contextInfoAfter additional context information to provide to the agent
     * @param {boolean} [remarkLastStoryFragmentForAnalysis] whether to mark the last message with an special token so the agent can analyze it
     * @returns {QuestionAgentGeneratorResponse}
     */
    async *runQuestioningCustomAgentOn(
        gear,
        system,
        contextInfoBefore,
        messages,
        contextInfoAfter,
        remarkLastStoryFragmentForAnalysis,
    ) {
        throw new Error("Method 'runQuestioningCustomAgentOn()' must be implemented.");
    }

    /**
     * @param {DECompleteCharacterReference} character the character in question that is building a prompt for
     * @param {string} description the description of the character, general
     * @param {string} externalDescription the external description of the character
     * @param {string[]} relationships the relationships description of the character
     * @param {string[]} expressiveStates the current applying expressive states of the character, most dominant ones, short summary do not explain everything
     * @param {string} scenario the basic description of the current location
     * @param {string|null} lore the lore related to the character or scenario
     * @param {Array<string>} otherInteractingCharacters the other characters interacting with this character
     * @param {Array<string>} characterRules the rules that apply specifically to this character
     * @param {Array<string>} worldRules the rules that apply to the world or scenario
     * @returns {string} the system prompt
     */
    buildSystemPromptForCharacter(character, description, externalDescription, relationships, expressiveStates, scenario, lore, otherInteractingCharacters, characterRules, worldRules) {
        throw new Error("Method 'buildSystemPromptForCharacter()' must be implemented.");
    }

    /**
     * @param {DECompleteCharacterReference} character the character in question that is building a prompt for
     * @param {string} description the description of the character, general
     * @param {string|null} appereance the appereance description of the character
     * @param {string[]} relationships the relationships description of the character
     * @param {string[]} expressiveStates the current applying expressive states of the character, most dominant ones, short or long summary
     * @param {string|null} scenario the basic description of the current location
     * @param {string|null} lore the lore related to the character or scenario
     * @returns {string} the system prompt
     */
    buildSystemCharacterDescription(character, description, appereance, relationships, expressiveStates, scenario, lore) {
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
     * Once retrieved this information this builds a reasoning prompt for what the character will do next and that will be
     * fed into the inference reasoning
     * 
     * @param {DECompleteCharacterReference} character 
     * @param {string} action 
     * @param {string} primaryEmotion
     * @param {string[]} emotionalRange
     * @param {string[]} states
     * @param {string} narrativeEffect
     * @returns {string}
     */
    buildActionPromptForCharacter(character, action, primaryEmotion, emotionalRange, states, narrativeEffect) {
        throw new Error("Method 'buildActionPromptForCharacter()' must be implemented.");
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
     * When generating custom grammar these are the required grammar rules to be included at the root level
     * 
     * When defining a custom grammar for question generation this function should return the required root level grammar rules
     * 
     * eg. root ::= answer | {getRequiredRootGrammarForQuestionGeneration()}
     * answer ::= word+
     * word ::= "a" | "b" | "c"
     * 
     * @returns {string}
     */
    getRequiredRootGrammarForQuestionGeneration() {
        throw new Error("Method 'getRequiredRootGrammarForQuestionGeneration()' must be implemented.");
    }

    /**
     * When generating custom grammar these are the required grammar rules to be included at the root level
     * 
     * When defining a custom grammar for story generation this function should return the required root level grammar rules
     * 
     * eg. root ::= answer | {getRequiredRootGrammarForStoryGeneration()}
     * answer ::= word+
     * word ::= "a" | "b" | "c"
     * 
     * @returns {string}
     */
    getRequiredRootGrammarForStoryGeneration() {
        throw new Error("Method 'getRequiredRootGrammarForStoryGeneration()' must be implemented.");
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