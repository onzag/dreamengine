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
     * useQuestionCache?: boolean,
     * useRepetitionBuster?: boolean,
     * useAggressiveListRepetitionBuster?: boolean,
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
    }
    
    async initialize() {
        throw new Error("Method 'initialize()' must be implemented.");
    }

    /**
     * Infers the next message for a character narrative purposes
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
        throw new Error("Method 'inferNextMessageFor()' must be implemented.");
    }

    /**
     * The questioning agent is used to create a persistent agent session that can be used to ask multiple questions,
     * this is what is used for bond questioning, what will the character do next, etc...
     * 
     * When the generator is called it will yield "entire answers" as they are generated, not token by token; giving it a next
     * question will make it keep ongoing, passing null will make it stop after the current answer and the generator will finish.
     * 
     * @param {DECompleteCharacterReference} character 
     * @param {string} system
     * @param {string|null} contextInfoBefore additional context information to provide to the agent
     * @param {(AsyncGenerator<{name: string, message: string, id: string, conversationId: string | null, debug: boolean, rejected: boolean}, void, boolean> | Array<{name: string, message: string}>)} getHistoryForCharacter
     * @param {"LAST_CYCLE" | "LAST_MESSAGE" | "LAST_CYCLE_EXPANDED" | "LAST_CYCLE_EXPANDED_TWICE" | "LAST_CYCLE_EXPANDED_EXCLUDE_CHAR" | "ALL"} msgLimit what to limit the history to
     * @param {string|null} contextInfoAfter additional context information to provide to the agent
     * @param {boolean} [remarkLastMessageForAnalysis] whether to mark the last message with an special token so the agent can analyze it
     * @returns {QuestionAgentGeneratorResponse}
     */
    async *runQuestioningCustomAgentOn(
        character,
        system,
        contextInfoBefore,
        getHistoryForCharacter,
        msgLimit,
        contextInfoAfter,
        remarkLastMessageForAnalysis,
    ) {
        throw new Error("Method 'runQuestioningCustomAgentOn()' must be implemented.");
    }

    /**
     * @param {DECompleteCharacterReference} character the character in question that is building a prompt for
     * @param {string} description the description of the character, general
     * @param {string} appereance the appereance description of the character
     * @param {string[]} relationships the relationships description of the character
     * @param {string[]} states the current applying states of the character, most dominant ones, short summary do not explain everything
     * @param {string} scenario the basic description of the current location
     * @param {string|null} lore the lore related to the character or scenario
     * @param {Array<string>} otherInteractingCharacters the other characters interacting with this character
     * @param {Array<string>} characterRules the rules that apply specifically to this character
     * @param {Array<string>} worldRules the rules that apply to the world or scenario
     * @returns {string} the system prompt
     */
    buildSystemPromptForCharacter(character, description, appereance, relationships, states, scenario, lore, otherInteractingCharacters, characterRules, worldRules) {
        throw new Error("Method 'buildSystemPromptForCharacter()' must be implemented.");
    }

    /**
     * @param {DECompleteCharacterReference} character the character in question that is building a prompt for
     * @param {string} description the description of the character, general
     * @param {string|null} appereance the appereance description of the character
     * @param {string[]} relationships the relationships description of the character
     * @param {string[]} states the current applying states of the character, most dominant ones, short or long summary
     * @param {string|null} scenario the basic description of the current location
     * @param {string|null} lore the lore related to the character or scenario
     * @returns {string} the system prompt
     */
    buildSystemCharacterDescription(character, description, appereance, relationships, states, scenario, lore) {
        throw new Error("Method 'buildSystemCharacterDescription()' must be implemented.");
    }

    /**
     * Builds a system prompt for an assistant to run a questioning agent
     * 
     * @param {string} description
     * @param {string[]} rules
     * @param {string|null} characterDescription
     * @returns {string}
     */
    buildSystemPromptForQuestioningAgent(description, rules, characterDescription) {
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
     * @param {string} description
     * @return {{locationDescriptionAt: string, value: string}}
     */
    buildContextInfoCurrentLocationDescription(description) {
        throw new Error("Method 'buildContextInfoCurrentLocationDescription()' must be implemented.");
    }

    /**
     * @param {string[]} items
     * @param {"characters" | "items"} type
     * @return {{cannotCarryDescriptionAt: string, value: string}}
     */
    buildContextInfoItemsCannotCarry(items, type) {
        throw new Error("Method 'buildContextInfoItemsCannotCarry()' must be implemented.");
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
     * @param {DECompleteCharacterReference} character
     * @param {string} info
     * @returns {string}
     */
    buildContextInfoIsolatedCharacter(character, info) {
        throw new Error("Method 'buildContextInfoIsolatedCharacter()' must be implemented.");
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
     * @param {Array<{question: string; answer: string;}>} qaList 
     */
    buildContextInfoPreviousQuestionsAndAnswers(qaList) {
        throw new Error("Method 'buildContextInfoPreviousQuestionsAndAnswers()' must be implemented.");
    }
}