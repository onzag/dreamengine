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
     * 
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
        throw new Error("Method 'inferNextMessageFor()' must be implemented.");
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
        throw new Error("Method 'runQuestioningCustomAgentOn()' must be implemented.");
    }
}