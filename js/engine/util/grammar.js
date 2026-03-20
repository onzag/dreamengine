import { DEngine } from "../index.js";

/**
 * @param {string} word 
 * @returns {string}
 */
export function caseInsensitiveGrammar(word) {
    return "(" + word.split('').map(c => {
        if (c.match(/[a-zA-Z]/)) {
            return `[${c.toUpperCase()}${c.toLowerCase()}]`;
        }
        return JSON.stringify(c);
    }).join(' ') + ")";
}

/**
 * @param {DEngine} engine
 * @param {string[]} list
 * @returns {{grammar: string, stopAfter: string[]}}
 */
export function createGrammarFromList(engine, list) {
    if (!engine.inferenceAdapter) {
        throw new Error("Inference adapter is required to create grammar");
    }
    return {
        grammar: `root ::= (${list.map(item => caseInsensitiveGrammar(item)).join(" | ")}) ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\n`,
        stopAfter: [],
    };
}

/**
 * @param {DEngine} engine
 * @param {string[]} list
 * @param {number} limit - maximum number of items from the list to include in the grammar (to prevent excessively large grammars)
 * @returns {{grammar: string, stopAfter: string[]}}
 */
export function createGrammarListFromList(engine, list, limit = 5) {
    if (!engine.inferenceAdapter) {
        throw new Error("Inference adapter is required to create grammar");
    }
    let suffix = '';
    for (let i = 1; i < limit; i++) {
        suffix = ` (", " LIST_ELEMENT${suffix})?`;
    }
    return {
        grammar: `root ::= LIST_ELEMENT${suffix} ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\nLIST_ELEMENT ::= (${list.slice(0, limit).map(item => caseInsensitiveGrammar(item)).join(" | ")})`,
        stopAfter: [],
    };
}

/**
 * @param {string} response 
 * @returns {string[]}
 */
export function parseListFromGrammarResponse(response) {
    // This function assumes the response is in the format of a list of items separated by commas, e.g., "happy, sad, excited"
    const baseResponse = response.split(",").map(item => item.trim()).filter(item => item.length > 0);
    return Array.from(new Set(baseResponse));
}

/**
 * @param {DEngine} engine
 * @returns {{grammar: string, stopAfter: string[]}}
 */
export function yesNoGrammar(engine) {
    if (!engine.inferenceAdapter) {
        throw new Error("Inference adapter is required to create grammar");
    }
    return {
        grammar: `root ::= ("yes" | "no" | "Yes" | "No" | "YES" | "NO") ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\n`,
        stopAfter: ["yes", "no", "Yes", "No", "YES", "NO"],
    };
}

/**
 * @param {string} answer 
 * @returns {boolean}
 */
export function isYes(answer) {
    return answer.trim().toLowerCase().includes("yes");
}