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