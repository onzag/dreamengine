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
 * @param {DEVoiceDescription} a 
 * @param {DEVoiceDescription} b
 */
export function mergeVoicesFrom(a, b) {
    let descriptionOfHigherDominance = a.description;
    if ((b.descriptionDominance || 0) > (a.descriptionDominance || 0)) {
        descriptionOfHigherDominance = b.description;
    }

    let narrationStyleOfHigherDominance = a.narrationStyle;
    if ((b.narrationStyleDominance || 0) > (a.narrationStyleDominance || 0)) {
        narrationStyleOfHigherDominance = b.narrationStyle;
    }

    let muteOfHigherDominance = a.mute;
    if ((b.muteDominance || 0) > (a.muteDominance || 0)) {
        muteOfHigherDominance = b.mute;
    }

    /**
     * @type {DEVoiceDescription}
     */
    const newOne = {
        mute: (a.muteDominance || 0) === (b.muteDominance || 0) ? (a.mute || b.mute) : muteOfHigherDominance,
        description: (a.descriptionDominance || 0) === (b.descriptionDominance || 0) ? (async (info) => {
            const aDesc = (a.description ? typeof a.description === "function" ? await a.description(info) : a.description : "").trim();
            const bDesc = (b.description ? typeof b.description === "function" ? await b.description(info) : b.description : "").trim();

            if (aDesc && bDesc) {
                return aDesc + ". " + bDesc;
            }
            return aDesc || bDesc;
        }) : descriptionOfHigherDominance,
        narrationStyle: (a.narrationStyleDominance || 0) === (b.narrationStyleDominance || 0) ? {
            maxParagraphs: Math.max(a.narrationStyle?.maxParagraphs || 0, b.narrationStyle?.maxParagraphs || 0),
            narrativeBias: Math.max(a.narrationStyle?.narrativeBias || 0, b.narrationStyle?.narrativeBias || 0),
            minParagraphs: Math.max(a.narrationStyle?.minParagraphs || 0, b.narrationStyle?.minParagraphs || 0),
        } : narrationStyleOfHigherDominance,
        modes: a.modes,
        sounds: a.sounds,
        descriptionDominance: Math.max(a.descriptionDominance || 0, b.descriptionDominance || 0),
        narrationStyleDominance: Math.max(a.narrationStyleDominance || 0, b.narrationStyleDominance || 0),
        muteDominance: Math.max(a.muteDominance || 0, b.muteDominance || 0),
        soundsDominance: a.soundsDominance,
        modesDominance: a.modesDominance
    };

    if ((newOne.soundsDominance || 0) < (b.soundsDominance || 0)) {
        newOne.sounds = b.sounds;
        newOne.soundsDominance = b.soundsDominance;
    } else if ((newOne.soundsDominance || 0) === (b.soundsDominance || 0)) {
        // delete duplicates and combine their likelihoods
        for (const sound of b.sounds) {
            const existing = newOne.sounds.find(s => s.label === sound.label);
            if (existing) {
                existing.forcedLikelihood = (existing.forcedLikelihood || 0) + (sound.forcedLikelihood || 0);
                if (!existing.relatedToEmotion) existing.relatedToEmotion = {};
                for (const key of Object.keys(sound.relatedToEmotion || {})) {
                    // @ts-ignore
                    if (!existing.relatedToEmotion[key]) existing.relatedToEmotion[key] = {};
                    // @ts-ignore
                    existing.relatedToEmotion[key].forcedLikelihood = (existing.relatedToEmotion[key]?.forcedLikelihood || 0) + (sound.relatedToEmotion[key]?.forcedLikelihood || 0);
                }
                if (!existing.relatedToState) existing.relatedToState = {};
                for (const key of Object.keys(sound.relatedToState || {})) {
                    // @ts-ignore
                    if (!existing.relatedToState[key]) existing.relatedToState[key] = {};
                    // @ts-ignore
                    existing.relatedToState[key].forcedLikelihood = (existing.relatedToState[key]?.forcedLikelihood || 0) + (sound.relatedToState[key]?.forcedLikelihood || 0);
                }
            } else {
                newOne.sounds.push(sound);
            }
        }
    }

    if ((newOne.modesDominance || 0) < (b.modesDominance || 0)) {
        newOne.modes = b.modes;
        newOne.modesDominance = b.modesDominance;
    } else if ((newOne.modesDominance || 0) === (b.modesDominance || 0)) {
        for (const mode of b.modes) {
            const existing = newOne.modes.find(m => m.label === mode.label);
            if (existing) {
                existing.forcedLikelihood = (existing.forcedLikelihood || 0) + (mode.forcedLikelihood || 0);
                if (!existing.relatedToEmotion) existing.relatedToEmotion = {};
                for (const key of Object.keys(mode.relatedToEmotion || {})) {
                    // @ts-ignore
                    if (!existing.relatedToEmotion[key]) existing.relatedToEmotion[key] = {};
                    // @ts-ignore
                    existing.relatedToEmotion[key].forcedLikelihood = (existing.relatedToEmotion[key]?.forcedLikelihood || 0) + (mode.relatedToEmotion[key]?.forcedLikelihood || 0);
                }
                if (!existing.relatedToState) existing.relatedToState = {};
                for (const key of Object.keys(mode.relatedToState || {})) {
                    // @ts-ignore
                    if (!existing.relatedToState[key]) existing.relatedToState[key] = {};
                    // @ts-ignore
                    existing.relatedToState[key].forcedLikelihood = (existing.relatedToState[key]?.forcedLikelihood || 0) + (mode.relatedToState[key]?.forcedLikelihood || 0);
                }
            } else {
                newOne.modes.push(mode);
            }
        }
    }

    return newOne;
}

/**
 * 
 * @param {DEVoiceSound|undefined} sound 
 * @returns {DEVoiceSoundMin|undefined}
 */
export function minimizeSoundDescription(sound) {
    if (!sound) return undefined;
    return {
        label: sound.label,
        replacement: sound.replacement,
    }
}

/**
 * 
 * @param {DEVoiceMode|undefined} mode 
 * @returns {DEVoiceModeMin|undefined}
 */
export function minimizeModeDescription(mode) {
    if (!mode) return undefined;
    return {
        label: mode.label,
    }
}

/**
 * 
 * @param {DEVoiceDescription} baseVoice
 * @param {DEEmotionNames} primaryEmotion 
 * @param {DEEmotionNames} emotionalRange 
 * @param {Array<{state: string; dominance: number;}>} activeStates
 */
function reweightVoiceForEmotion(baseVoice, primaryEmotion, emotionalRange, activeStates) {
    const newVoice = { ...baseVoice };
}
