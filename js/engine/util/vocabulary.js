export const BASIC_WORDS = [
    // articles & conjunctions
    "the", "a", "an", "and", "or", "but", "nor", "so", "too",
    "that", "which", "who", "whom", "whose",

    // prepositions
    "in", "on", "at", "to", "of", "for", "with", "from", "by",
    "as", "into",

    // personal pronouns
    "i", "me", "my", "mine", "myself",
    "you", "your", "yours", "yourself", "yourselves",
    "he", "him", "his", "himself",
    "she", "her", "hers", "herself",
    "it", "its", "itself",
    "we", "us", "our", "ours", "ourselves",
    "they", "them", "their", "theirs", "themselves",

    // demonstrative pronouns
    "this", "that", "these", "those",

    // interrogative / relative pronouns
    "what", "which", "who", "whom", "whose", "where", "when", "why", "how",

    // "to be" — all conjugations
    "be", "am", "is", "are", "was", "were", "been", "being", "will", "would",

    // "to have" — all conjugations
    "have", "has", "had", "having",

    // "to do" — all conjugations
    "do", "does", "did", "done", "doing",

    // "to go" — all conjugations
    "go", "goes", "went", "gone", "going",

    // "to make" — all conjugations
    "make", "makes", "made", "making",

    "yes", "no", "not",

    // punctuation (as separate tokens)
    ".", ",", "!", "?", ";", ":", "-", "(", ")", "\"", "'", ".",
];

/**
 * @param {DEVocabularyLimit} a 
 * @param {DEVocabularyLimit} b 
 */
export function mergeVocabularyLimits(a, b) {
    const newVocab = a.vocabulary ? [...a.vocabulary] : (b.vocabulary ? [...b.vocabulary] : undefined);
    if (a.vocabulary && b.vocabulary) {
        for (const word of b.vocabulary) {
            // @ts-ignore
            if (!newVocab.includes(word)) {
                // @ts-ignore
                newVocab.push(word);
            }
        }
    }

    /**
     * @type {number | undefined}
     */
    let newMaxWords = Math.min(a.maxWordsPerMessage || Infinity, b.maxWordsPerMessage || Infinity);
    if (newMaxWords === Infinity) {
        newMaxWords = undefined;
    }
    /**
     * @type {DEVocabularyLimit}
     */
    const newOne = {
        mute: a.mute || b.mute,
        vocabulary: newVocab,
        elongateWordsEffect: a.elongateWordsEffect || b.elongateWordsEffect,
        includeBaseVocabulary: a.includeBaseVocabulary || b.includeBaseVocabulary,
        intensityEffect: a.intensityEffect === "CAPITALIZE_SCREAM" || b.intensityEffect === "CAPITALIZE_SCREAM" ? "CAPITALIZE_SCREAM" : "NONE",
        maxWordsPerMessage: newMaxWords,
        stutterEffect: a.stutterEffect || b.stutterEffect,
    }

    return newOne;
}