import { DEngine } from "../index.js";

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
     * @param {AsyncGenerator<{name: string, message: string, id: string, conversationId: string | null, debug: boolean, rejected: boolean}, void, boolean>} getHistoryForCharacter
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
     * @param {string|null} contextInfo additional context information to provide to the agent
     * @param {AsyncGenerator<{name: string, message: string, id: string, conversationId: string | null, debug: boolean, rejected: boolean}, void, boolean>} getHistoryForCharacter
     * @param {"LAST_CYCLE" | "LAST_MESSAGE" | "ALL"} msgLimit what to limit the history to
     * @returns {AsyncGenerator<string, void, {nextQuestion: string, stopAt: Array<string>, maxParagraphs: number; maxCharacters: number} | null>}
     */
    async *runQuestioningCustomAgentOn(
        character,
        system,
        contextInfo,
        getHistoryForCharacter,
        msgLimit,
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
     * @param {string[]} items
     * @returns {string}
     */
    buildSystemPromptForQuestioningAgent(description, rules, characterDescription, items) {
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
     */
    buildActionPromptForCharacter(character, action, primaryEmotion, emotionalRange, states, narrativeEffect) {
        throw new Error("Method 'buildActionPromptForCharacter()' must be implemented.");
    }
}