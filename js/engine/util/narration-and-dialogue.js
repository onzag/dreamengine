import { findBestIdentifier } from "./identifiers";

const unspecificQualifiersSoloWorlds = [
    "he", "him", "his", "himself",
    "she", "her", "hers", "herself",
    "they", "them", "their", "theirs", "themself", "themselves",
    "it", "its", "itself",
];
/**
 * @param {string} message
 * @param {number} index
 * @returns {boolean}
 */
function isStartOfMessage(message, index) {
    for (let i = index - 1; i >= 0; i--) {
        const char = message[i];
        if (char !== " " && char !== "\t" && char !== "\n" && char !== "\r") return false;
    }
    return true;
}

/**
 * @param {string} message
 * @param {number} index
 * @returns {boolean}
 */
function previousNonSpaceCharacterIsDotOrSign(message, index) {
    for (let i = index - 1; i >= 0; i--) {
        const char = message[i];
        if (char === " " || char === "\t" || char === "\n" || char === "\r") continue;
        return char === "." || char === "!" || char === "?";
    }
    return false;
}

/**
 * 
 * @param {string} text
 */
function isUnspecificText(text) {
    return unspecificQualifiersSoloWorlds.includes(text.toLowerCase().trim());
}

/**
 * 
 * @param {string} name 
 * @returns {Array<string>}
 */
function splitNameInBits(name) {
    // Split the name into words, removing any qualifiers like "the", "a", "an" from the start of each word.
    return name.split(/\s+/).map(word => word.replace(/^(the|a|an)\s+/i, "").trim().toLowerCase()).filter(Boolean);
}

/**
 * 
 * @param {DEObject} DE
 * @param {string} message 
 * @param {DECompleteCharacterReference} resolvedEmitter 
 * @param {DECompleteCharacterReference} resolvedPerspective 
 * @returns {Promise<Array<DEConversationMessageNarrationFragment>>}
 */
export async function parseNarration(DE, message, resolvedEmitter, resolvedPerspective) {
    /** @type {Array<DEConversationMessageNarrationFragment>} */
    const fragments = [];
    /**
     * @type {Array<number>}
     */
    const modifiedFragmentsIndexes = [];
    /**
     * @type {Set<string>}
     */
    const modifiedFragmentsCharacterIds = new Set();
    let lastIndex = 0;

    // Match entity identifiers paired with their readable names.
    // Leave incomplete markers and other angle-bracketed text untouched.
    for (const match of message.matchAll(/<([^<>:\s]+):([^<>]+)>/g)) {
        const identifier = match[1];
        const name = match[2];

        if (match.index > lastIndex) {
            fragments.push(message.slice(lastIndex, match.index));
        }

        const result = await findBestIdentifier(DE, identifier, name, resolvedEmitter?.id || null);
        let hasModified = false;

        if (result.foundAs === "character" && resolvedPerspective) {
            // unspecific will be eg. he, him, she, her, they, them, etc.
            const isUnspecific = isUnspecificText(result.text);
            if (!isUnspecific) {
                // okay so it is not a highly unspecifc pronoun, which means it might contain
                // unknown information, we must check it, by using the emitterCharacter, the targetCharacter, and the perspectiveCharacter
                const targetCharacter = DE.characters[result.identifier];
                if (targetCharacter) {
                    const referredAs = splitNameInBits(result.text);

                    // now we must find what the emitter might have referred to them as
                    /**
                     * @type {Array<string>}
                     */
                    const emitterMightHaveReferredToTargetAsBits = [];
                    if (!resolvedEmitter || resolvedEmitter.id === targetCharacter.id) {
                        emitterMightHaveReferredToTargetAsBits.push(...splitNameInBits(targetCharacter.name).flat());
                    } else {
                        const emitterToTargetBond = DE.bonds[resolvedEmitter.id]?.active.find(b => b.towards === targetCharacter.id) ||
                            DE.bonds[resolvedEmitter.id]?.ex.find(b => b.towards === targetCharacter.id);
                        if (emitterToTargetBond) {
                            emitterMightHaveReferredToTargetAsBits.push(...emitterToTargetBond.knowsAs.map(k => splitNameInBits(k.name)).flat());
                        }
                        // add the character name for good measure
                        emitterMightHaveReferredToTargetAsBits.push(...splitNameInBits(targetCharacter.name).flat());
                    }

                    // now in this variable we are going to check if the emitter has used a name that is specific to their knowledge, rather than being some random
                    // generic "eg. the man" or "the cat" or "the person" etc... for that we will check if the name somehow contains any of these
                    // for that we will check the name against the id given
                    const isSpecificName = referredAs.some(nameBit => emitterMightHaveReferredToTargetAsBits.some(emitterNameBit => nameBit === emitterNameBit));

                    if (isSpecificName) {
                        // Okay so the name given was a specific name, but should our perspective character have known this?...
                        // we can check if perspective character can know this name

                        /**
                         * @type {Array<string>}
                         */
                        const perspectiveCanReferToTargetAs = [];
                        if (!resolvedPerspective || resolvedPerspective.id === targetCharacter.id) {
                            perspectiveCanReferToTargetAs.push(targetCharacter.name);
                        } else {
                            const perspectiveToTargetBond = DE.bonds[resolvedPerspective.id]?.active.find(b => b.towards === targetCharacter.id) ||
                                DE.bonds[resolvedPerspective.id]?.ex.find(b => b.towards === targetCharacter.id);
                            if (perspectiveToTargetBond) {
                                perspectiveCanReferToTargetAs.push(...perspectiveToTargetBond.knowsAs.map(k => k.name));
                            }
                        }

                        const perspectiveCanReferToTargetAsBits = perspectiveCanReferToTargetAs.map(name => splitNameInBits(name)).flat();
                        const isPerspectiveAwareOfName = referredAs.some(nameBit => perspectiveCanReferToTargetAsBits.some(perspectiveNameBit => nameBit === perspectiveNameBit));

                        if (!isPerspectiveAwareOfName) {
                            // okay so the perspective character is not aware of this name, we must replace it with a generic name
                            result.text = DE.utils.templates.formatCharacterName(targetCharacter, resolvedPerspective, {
                                capitalize: isStartOfMessage(message, match.index) || previousNonSpaceCharacterIsDotOrSign(message, match.index),
                                justName: true,
                                type: "definite",
                            });
                            hasModified = true;
                            modifiedFragmentsCharacterIds.add(targetCharacter.id);
                        }
                    }
                }
            }
        }

        fragments.push(result);
        if (hasModified) {
            modifiedFragmentsIndexes.push(fragments.length - 1);
        }

        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < message.length) {
        fragments.push(message.slice(lastIndex));
    }

    if (modifiedFragmentsCharacterIds.size > 1) {
        // okay it is possible that two of these characters had the same stranger or unknown
        // (or even the same nickname) or whatever, so we must make a clear distinction in text
        // for that we must be creative

        // option 1. using opposite traits, eg. younger and older, taller and shorter, bigger or smaller (between two character only)
        // option 2. using other (two chararacters only, and only if mentioned in consecutive, aka only two mentions)
        // option 3. enumeration, first, second, third, fourth, fifth, sixth, seventh, eighth, ninth, tenth (two or more characters)

        // this will be a pain
    }
    return fragments;
}