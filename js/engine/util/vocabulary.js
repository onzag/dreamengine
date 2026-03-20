const basicWords = [
    // articles & conjunctions
    "the", "a", "an", "and", "or", "but", "nor", "so", "yet", "both",
    "either", "neither", "although", "though", "because", "since", "while",
    "if", "unless", "until", "that", "which", "who", "whom", "whose",

    // prepositions
    "in", "on", "at", "to", "of", "for", "with", "from", "by", "about",
    "as", "into", "through", "during", "before", "after", "above", "below",
    "between", "among", "against", "along", "around", "without", "within",
    "across", "behind", "beyond", "except", "near", "off", "out", "over",
    "under", "up", "down", "upon", "toward", "towards",

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

    // indefinite pronouns
    "all", "any", "anyone", "anything", "anywhere",
    "some", "someone", "something", "somewhere",
    "none", "no", "nobody", "nothing", "nowhere",
    "everyone", "everybody", "everything", "everywhere",
    "each", "every", "both", "few", "many", "much", "more", "most",
    "other", "others", "another", "one", "ones",

    // interrogative / relative pronouns
    "what", "which", "who", "whom", "whose", "where", "when", "why", "how",

    // "to be" — all conjugations
    "be", "am", "is", "are", "was", "were", "been", "being",
    "will be", "would be", "shall be", "should be",
    "can be", "could be", "may be", "might be", "must be",

    // "to have" — all conjugations
    "have", "has", "had", "having",
    "will have", "would have", "shall have", "should have",
    "could have", "may have", "might have", "must have",

    // "to do" — all conjugations
    "do", "does", "did", "done", "doing",
    "will do", "would do", "shall do", "should do",
    "can do", "could do", "may do", "might do", "must do",

    // "to go" — all conjugations
    "go", "goes", "went", "gone", "going",
    "will go", "would go", "shall go", "should go",

    // "to make" — all conjugations
    "make", "makes", "made", "making",
    "will make", "would make", "shall make", "should make",

    // "to get" — all conjugations
    "get", "gets", "got", "gotten", "getting",

    // "to come" — all conjugations
    "come", "comes", "came", "coming",

    // "to take" — all conjugations
    "take", "takes", "took", "taken", "taking",

    // "to know" — all conjugations
    "know", "knows", "knew", "known", "knowing",

    // "to think" — all conjugations
    "think", "thinks", "thought", "thinking",

    // "to see" — all conjugations
    "see", "sees", "saw", "seen", "seeing",

    // "to say" / "to tell"
    "say", "says", "said", "saying",
    "tell", "tells", "told", "telling",

    // "to want" / "to need"
    "want", "wants", "wanted", "wanting",
    "need", "needs", "needed", "needing",

    // "to look" / "to find"
    "look", "looks", "looked", "looking",
    "find", "finds", "found", "finding",

    // "to give" / "to put"
    "give", "gives", "gave", "given", "giving",
    "put", "puts", "putting",

    // "to use" / "to seem"
    "use", "uses", "used", "using",
    "seem", "seems", "seemed", "seeming",

    // "to feel" / "to try"
    "feel", "feels", "felt", "feeling",
    "try", "tries", "tried", "trying",

    // "to let" / "to keep" / "to hold"
    "let", "lets", "letting",
    "keep", "keeps", "kept", "keeping",
    "hold", "holds", "held", "holding",

    // modal verbs (standalone)
    "can", "could", "will", "would", "shall", "should",
    "may", "might", "must", "ought",

    // negation & basic adverbs
    "not", "no", "never", "ever", "always", "often", "sometimes",
    "already", "still", "just", "only", "also", "too", "very",
    "quite", "rather", "really", "so", "here", "there", "now", "then",
    "again", "once", "twice", "perhaps", "maybe", "even", "almost",

    // common adjectives
    "good", "bad", "big", "small", "large", "little", "long", "short",
    "old", "new", "first", "last", "next", "same", "other",
    "right", "wrong", "high", "low", "own", "such",

    // miscellaneous function words
    "yes", "well", "like", "than", "then", "more", "less",
    "if", "not", "from", "by", "on", "with", "at",
];

/**
 * @param {DEVocabularyLimit} a 
 * @param {DEVocabularyLimit} b 
 */
export function mergeVocabularyLimits(a, b) {
    const newVocab = [...a.vocabulary];
    for (const word of b.vocabulary) {
        if (!a.vocabulary.includes(word)) {
            newVocab.push(word);
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