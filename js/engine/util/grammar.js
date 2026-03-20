import { DEngine } from "../index.js";
import { getSurroundingCharacters } from "./character-info.js";
import { BASIC_WORDS } from "./vocabulary.js";

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
 * @param {string} word 
 * @param {"CAPITALIZE_SCREAM" | "NONE"} intensityEffect
 * @param {"elongate" | "stutter" | "none"} effect
 * @param {boolean} isName - whether the word is a character name (which should be treated as case-insensitive for the purposes of elongation and stuttering)
 */
export function wordForGrammar(word, intensityEffect, effect, isName = false) {
    if (word.length === 0) {
        throw new Error("Word must be non-empty");
    }
    if (intensityEffect === "CAPITALIZE_SCREAM") {
        if (effect === "elongate") {
            return elongatedWordGrammar(word.toUpperCase());
        } else if (effect === "stutter") {
            return stutteredWordGrammar(word.toUpperCase());
        }
        return JSON.stringify(word.toUpperCase());
    } else {
        if (word.length === 1) {
            return caseInsensitiveGrammar(word);
        }
        if (!isName) {
            const wordLower = word.toLowerCase();
            if (effect === "elongate") {
                return elongatedWordGrammar(wordLower, true);
            } else if (effect === "stutter") {
                return stutteredWordGrammar(wordLower, true);
            }
            return "(" + caseInsensitiveGrammar(wordLower[0]) + JSON.stringify(wordLower.slice(1)) + ")";
        } else {
            if (effect === "elongate") {
                return elongatedWordGrammar(word);
            } else if (effect === "stutter") {
                return stutteredWordGrammar(word);
            }
            return JSON.stringify(word);
        }
    }
}

/**
 * @param {string} word 
 * @param {boolean} capitalizeInsensitive - whether to treat uppercase and lowercase letters as the same for the purpose of elongation (e.g., "Happy" would allow "Haaappy" and "haaaappy" if true, but only "Haaappy" if false)
 * @returns {string}
 */
export function elongatedWordGrammar(word, capitalizeInsensitive = false) {
    if (word.length === 0) {
        throw new Error("Word must be non-empty");
    }
    const chars = word.split('');
    return "(" + chars.map((c, index) => {
        if (c.match(/[aeiouAEIOU]/)) {
            if (capitalizeInsensitive && index === 0 && c.match(/[a-zA-Z]/)) {
                return `([${c.toUpperCase()}${c.toLowerCase()}])+`;
            }
            return `(${JSON.stringify(c)})+`;
        }
        if (index === 0 && capitalizeInsensitive && c.match(/[a-zA-Z]/)) {
            return `([${c.toUpperCase()}${c.toLowerCase()}])`;
        }
        return JSON.stringify(c);
    }).join(' ') + ")";
}

/**
 * @param {string} word 
 * @param {boolean} capitalizeInsensitive - whether to treat uppercase and lowercase letters as the same for the purpose of elongation (e.g., "Happy" would allow "Haaappy" and "haaaappy" if true, but only "Haaappy" if false)
 * @returns {string}
 */
export function stutteredWordGrammar(word, capitalizeInsensitive = false) {
    if (word.length === 0) {
        throw new Error("Word must be non-empty");
    }

    const chars = word.split('');
    if (chars.length <= 2 || !chars[0].match(/[a-zA-Z]/) || !chars[1].match(/[a-zA-Z]/)) {
        return JSON.stringify(word);
    }

    const firstChar = chars[0];
    const firstCharGrammar = capitalizeInsensitive ? `[${firstChar.toUpperCase()}${firstChar.toLowerCase()}]` : JSON.stringify(firstChar);
    return `(${firstCharGrammar} "-")? ${JSON.stringify(word)}`;
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

/**
 * 
 * @param {DEngine} engine 
 * @param {DEVocabularyLimit | null | undefined} vocabulary 
 * @param {string} charName
 * @returns {string}
 */
export function generateGrammarForVocabulary(engine, vocabulary, charName) {
    if (!engine.inferenceAdapter) {
        throw new Error("Inference adapter is required to create grammar");
    }

    const defaultEverythingGoes = `[a-zA-Z0-9 ,.'";:!?%$#&€£¥¢₩₹()\\-~_=^@/\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]+`;
    let dialogueVocabulary = defaultEverythingGoes;

    if (vocabulary?.mute) {
        return `root ::= LINE_OF_STORY+ ${engine.inferenceAdapter.getRequiredRootGrammarForStoryGeneration()}
LINE_OF_STORY ::= NARRATION
NARRATION_BASE ::= "*" ${defaultEverythingGoes} "*"
NARRATION ::= NARRATION_BASE "\n\n"
    `;
    }
    

    if (vocabulary && vocabulary.vocabulary) {

        if (vocabulary.vocabulary.length === 0) {
            throw new Error("Vocabulary list cannot be empty if vocabulary is provided");
        }

        /**
         * @type {Set<string>}
         */
        const allGrammar = new Set();

        for (const token of vocabulary.vocabulary) {
            if (token.type === "WORD") {
                if (!token.value) continue;
                let word = token.value.trim();
                if (!word) continue;

                allGrammar.add(wordForGrammar(word, vocabulary.intensityEffect || "NONE", "none"));
                if (vocabulary.elongateWordsEffect) {
                    allGrammar.add(wordForGrammar(word, vocabulary.intensityEffect || "NONE", "elongate"));
                }
                if (vocabulary.stutterEffect) {
                    allGrammar.add(wordForGrammar(word, vocabulary.intensityEffect || "NONE", "stutter"));
                }
            } else if (token.type === "GRAMMAR") {
                if (!token.value) continue;
                let grammar = token.value.trim();
                if (!grammar) continue;
                allGrammar.add(grammar);
            }
        }

        if (vocabulary.includeBaseVocabulary) {
            for (const word of BASIC_WORDS) {
                allGrammar.add(wordForGrammar(word, vocabulary.intensityEffect || "NONE", "none"));
                if (vocabulary.elongateWordsEffect) {
                    allGrammar.add(wordForGrammar(word, vocabulary.intensityEffect || "NONE", "elongate"));
                }
                if (vocabulary.stutterEffect) {
                    allGrammar.add(wordForGrammar(word, vocabulary.intensityEffect || "NONE", "stutter"));
                }
            }
        }

        if (vocabulary.includeCharacterNames) {
            const surroundingCharacters = getSurroundingCharacters(engine, charName);
            if (surroundingCharacters.nonStrangers.length > 0) {
                for (const character of surroundingCharacters.nonStrangers) {
                    allGrammar.add(wordForGrammar(character, vocabulary.intensityEffect || "NONE", "none", true));
                    if (vocabulary.elongateWordsEffect) {
                        allGrammar.add(wordForGrammar(character, vocabulary.intensityEffect || "NONE", "elongate", true));
                    }
                    if (vocabulary.stutterEffect) {
                        allGrammar.add(wordForGrammar(character, vocabulary.intensityEffect || "NONE", "stutter", true));
                    }
                }
            }
        }

        // space
        allGrammar.add(JSON.stringify(" "));

        const baseWord = "(" + Array.from(allGrammar).join(" | ") + ")";
        if (vocabulary.maxWordsPerMessage) {
            dialogueVocabulary = baseWord + `( ${baseWord}){0,${vocabulary.maxWordsPerMessage - 1}}`;
        } else {
            dialogueVocabulary = baseWord + `( ${baseWord})*`;
        }
    }

    return `root ::= LINE_OF_STORY+ ${engine.inferenceAdapter.getRequiredRootGrammarForStoryGeneration()}
LINE_OF_STORY ::= NARRATION | DIALOGUE
NARRATION_BASE ::= "*" ${defaultEverythingGoes} "*"
DIALOGUE_BASE ::= ${dialogueVocabulary}
NARRATION ::= NARRATION_BASE "\\n\\n"
DIALOGUE ::= ${JSON.stringify(charName + ": ")} DIALOGUE_BASE ( (" " NARRATION_BASE) | (" " DIALOGUE_BASE) )* "\\n\\n"
    `;
}