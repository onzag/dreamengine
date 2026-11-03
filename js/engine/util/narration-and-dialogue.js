import { findBestIdentifier } from "./identifiers.js";

/**
 * Phrases that, when appearing immediately before a name marker, indicate that
 * the content is explicitly stating a name (e.g. "he was named Dema").
 * In those cases the name must be preserved as-is instead of being replaced
 * with a generic descriptor, which would produce ungrammatical results like
 * "he was named the robot".
 */
const beforeMakesForceOfTheName = [
    // ── Direct naming / labelling verbs ──────────────────────────────────────
    "named", "called", "nicknamed", "christened", "dubbed", "titled",
    "styled", "baptized", "baptised", "labeled", "labelled", "designated", "hailed",

    // ── Reflexive / self-naming forms ────────────────────────────────────────
    "named himself", "named herself", "named themselves", "named itself",
    "called himself", "called herself", "called themselves", "called itself",
    "dubbed himself", "dubbed herself", "dubbed themselves", "dubbed itself",

    // ── "known as" family ────────────────────────────────────────────────────
    "known as", "also known as", "simply known as",
    "known by the name", "known by the name of",
    "known under the name", "known under the name of",

    // ── "referred / referred to" family ──────────────────────────────────────
    "referred to as",

    // ── "goes / went by" family ──────────────────────────────────────────────
    "goes by", "going by", "went by",
    "goes by the name", "goes by the name of",
    "went by the name", "went by the name of",
    "going by the name", "going by the name of",

    // ── "by the name" prepositional family ──────────────────────────────────
    "by the name", "by the name of",
    "by the alias", "by the alias of",

    // ── "answered to" family ─────────────────────────────────────────────────
    "answered to", "answers to",
    "answered to the name", "answered to the name of",
    "answers to the name", "answers to the name of",

    // ── "uses / used the name" family ────────────────────────────────────────
    "uses the name", "used the name", "using the name",

    // ── "took / assumed / adopted the name" family ───────────────────────────
    "took the name", "takes the name", "taking the name",
    "assumed the name", "assumes the name", "assuming the name",
    "adopted the name", "adopts the name", "adopting the name",

    // ── "introduced as" family ───────────────────────────────────────────────
    "introduced as",
    "introduced himself as", "introduced herself as",
    "introduced themselves as", "introduced itself as",
    "introduces himself as", "introduces herself as",
    "introduces themselves as", "introduces itself as",
    "introducing himself as", "introducing herself as",
    "introducing themselves as", "introducing itself as",

    // ── "identified as" family ────────────────────────────────────────────────
    "identified as", "identifies as", "identifying as",

    // ── "signed as" / "signed off as" family ─────────────────────────────────
    "signed as", "signs as", "signing as",
    "signed off as", "signs off as", "signing off as",

    // ── "simply called" / "often called" etc. ────────────────────────────────
    "simply called", "often called", "commonly called",
    "simply dubbed", "often dubbed", "commonly dubbed",
]

const unspecificQualifiersSoloWorlds = [
    "he", "him", "his", "himself",
    "she", "her", "hers", "herself",
    "they", "them", "their", "theirs", "themself", "themselves",
    "it", "its", "itself",
];
/**
 * Whether the marker sits at the very start of its text (ie. only whitespace,
 * or nothing at all, precedes it). An empty string counts as the start.
 * @param {string} previousText the raw text that appears immediately before the marker
 * @returns {boolean}
 */
function isStartOfMessage(previousText) {
    for (let i = previousText.length - 1; i >= 0; i--) {
        const char = previousText[i];
        if (char !== " " && char !== "\t" && char !== "\n" && char !== "\r") return false;
    }
    return true;
}

/**
 * Whether the last non-whitespace character before the marker ends a sentence.
 * @param {string} previousText the raw text that appears immediately before the marker
 * @returns {boolean}
 */
function previousNonSpaceCharacterIsDotOrSign(previousText) {
    for (let i = previousText.length - 1; i >= 0; i--) {
        const char = previousText[i];
        if (char === " " || char === "\t" || char === "\n" || char === "\r") continue;
        return char === "." || char === "!" || char === "?";
    }
    return false;
}

/**
 * Whether the word right before the marker calls for a non-definite article
 * (eg. "a"/"an"/"the", or words ending in "ly", "ing", "ed").
 * @param {string} previousText the raw text that appears immediately before the marker
 * @returns {boolean}
 */
function previousWordSpecifiesNonDefinitiveNext(previousText) {
    // look for a previous words ending in "ly", "ing", "ed", etc... that make it not to use "the" or "an" or "a" before the next word, but instead use "some" or "any" or "one of the"
    const previousWordsFull = ["the", "an", "a"];
    const previousWordsEndingIn = ["ly", "ing", "ed"];

    const previousWords = previousText.split(/\s+/).filter(Boolean);
    const lastWord = previousWords[previousWords.length - 1]?.toLowerCase();
    if (!lastWord) return false;
    if (previousWordsFull.includes(lastWord)) return true;
    if (previousWordsEndingIn.some(ending => lastWord.endsWith(ending))) return true;
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
 * Inserts a relative attribute into a name string, placing it after any leading
 * article or determiner ("the", "a", "an", "this", "that", "these", "those")
 * so the result reads naturally.
 *
 * Examples:
 *   "the stranger"  + "older"  => "the older stranger"
 *   "a woman"       + "taller" => "a taller woman"
 *   "this person"   + "first"  => "this first person"
 *   "stranger"      + "older"  => "older stranger"
 *   "Stranger"      + "older"  => "Older stranger"
 *
 * @param {string} name
 * @param {string} attribute
 * @returns {string}
 */
function addRelativeAttributeToName(name, attribute) {
    // Preserve leading and trailing whitespace.
    const leadingSpace = (name.match(/^\s*/)?.[0]) || "";
    const trailingSpace = (name.match(/\s*$/)?.[0]) || "";
    const trimmed = name.slice(leadingSpace.length, name.length - trailingSpace.length);

    const articleMatch = trimmed.match(/^(the|a|an|this|that|these|those)\s+/i);
    if (articleMatch) {
        const article = articleMatch[0];
        const rest = trimmed.slice(article.length);
        return leadingSpace + article + attribute + " " + rest + trailingSpace;
    }
    // No leading article — prepend the attribute, preserving overall capitalisation.
    const isCapitalized = trimmed.length > 0 && trimmed[0] === trimmed[0].toUpperCase() && trimmed[0] !== trimmed[0].toLowerCase();
    if (isCapitalized) {
        return leadingSpace + attribute.charAt(0).toUpperCase() + attribute.slice(1) + " " + trimmed.charAt(0).toLowerCase() + trimmed.slice(1) + trailingSpace;
    }
    return leadingSpace + attribute + " " + trimmed + trailingSpace;
}

/**
 * Splits a run of text into fragments, resolving embedded entity identifiers
 * (<identifier:name> markers) into identifier objects while leaving the
 * surrounding plain text untouched. Incomplete markers and other
 * angle-bracketed text are left as plain text.
 *
 * @param {DEObject} DE
 * @param {string} text
 * @param {string|null} resolvedId the id of the emitter/perspective used to resolve identifiers
 * @returns {Promise<Array<DEConversationMessageNarrationFragment>>}
 */
async function parseIdentifierFragments(DE, text, resolvedId) {
    /** @type {Array<DEConversationMessageNarrationFragment>} */
    const fragments = [];

    let lastIndex = 0;

    for (const match of text.matchAll(/<([^<>:\s]+):([^<>]+)>/g)) {
        const identifier = match[1];
        const name = match[2];

        if (match.index > lastIndex) {
            fragments.push(text.slice(lastIndex, match.index));
        }

        const result = await findBestIdentifier(DE, identifier, name, resolvedId);
        fragments.push(result);
        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
        fragments.push(text.slice(lastIndex));
    }

    return fragments;
}

/**
 * Parses a raw dialogue line (the character name is NOT included) into
 * structured dialogue fragments.
 *
 * A dialogue line is spoken words by default; an asterisk toggles into a
 * third-person narration/action beat (and the next asterisk toggles back out),
 * and [..] delimit voice/sound tags while speaking. Asterisks and brackets are
 * consumed as structural markers and never emitted as fragment text. The
 * spoken and narration runs are additionally parsed for embedded entity
 * identifiers (<identifier:name> markers).
 *
 * @param {DEObject} DE 
 * @param {string} message 
 * @param {DECompleteCharacterReference | null} resolvedEmitterAndPerspective
 * @returns {Promise<Array<DEConversationMessageDialogueFragment>>}
 */
export async function parseDialogue(DE, message, resolvedEmitterAndPerspective) {
    const resolvedId = resolvedEmitterAndPerspective?.id || null;

    // First pass: a character-by-character state machine splits the line into
    // typed segments. An asterisk toggles between spoken dialogue (default) and
    // narration beats; "[" opens a sound/voice tag and "]" closes it (only while
    // speaking). This mirrors the streaming parser in the talk gear.
    /** @type {Array<{ type: "narration" | "dialogue" | "sound", text: string }>} */
    const segments = [];

    let insideNarration = false;
    let insideSound = false;
    let run = "";

    const currentType = () => insideSound ? "sound" : (insideNarration ? "narration" : "dialogue");

    // Flushes the pending run as a segment of the given type. Pure-whitespace
    // narration runs are empty beats and are dropped; empty runs produce nothing.
    const flushRun = (/** @type {"narration" | "dialogue" | "sound"} */ type) => {
        if (type === "narration" && !run.trim()) {
            run = "";
            return;
        }
        if (run) {
            segments.push({ type, text: run });
        }
        run = "";
    };

    for (let i = 0; i < message.length; i++) {
        const char = message[i];
        if (insideSound) {
            if (char === "]") {
                // keep the sound segment even when empty, so a bare "[]" still renders
                segments.push({ type: "sound", text: run });
                run = "";
                insideSound = false;
            } else {
                run += char;
            }
        } else if (char === "*") {
            flushRun(currentType());
            insideNarration = !insideNarration;
        } else if (char === "[" && !insideNarration) {
            flushRun(currentType());
            insideSound = true;
        } else {
            run += char;
        }
    }

    // flush whatever is left over at the end of the line
    if (insideSound) {
        // an unterminated sound tag — treat the remainder as sound content
        segments.push({ type: "sound", text: run });
    } else {
        flushRun(currentType());
    }

    // Second pass: turn each segment into a dialogue fragment, resolving
    // identifiers inside spoken/narration runs.
    /** @type {Array<DEConversationMessageDialogueFragment>} */
    const fragments = [];

    for (const segment of segments) {
        if (segment.type === "sound") {
            fragments.push({ type: "sound", text: segment.text, soundInfo: {} });
        } else {
            const innerFragments = await parseIdentifierFragments(DE, segment.text, resolvedId);
            fragments.push({ type: segment.type, fragments: innerFragments });
        }
    }

    return fragments;
}

/**
 * 
 * @param {DEObject} DE 
 * @param {string} rawMessage 
 * @param {DECompleteCharacterReference | null} resolvedEmitterAndPerspective
 * @returns {Promise<Array<DEConversationMessageNarrationFragment>>}
 */
export async function parseNarration(DE, rawMessage, resolvedEmitterAndPerspective) {
    let message = rawMessage.trim();
    while (message.startsWith("*")) {
        message = message.slice(1).trim();
    }
    while (message.endsWith("*")) {
        message = message.slice(0, -1).trim();
    }

    // Match entity identifiers paired with their readable names.
    // Leave incomplete markers and other angle-bracketed text untouched.
    return parseIdentifierFragments(DE, message, resolvedEmitterAndPerspective?.id || null);
}

/**
 * Parses a narration (or reprocesses an existing parsed narration) in the perspective of the emitter
 * 
 * @param {DEObject} DE
 * @param {Array<DEConversationMessageNarrationFragment>} message 
 * @param {DECompleteCharacterReference|null} resolvedEmitter 
 * @param {DECompleteCharacterReference|null} resolvedPerspectiveCharacter
 * @param {Array<DEConversationMessageFragmentIdentifier>|null} previouslyHeardIdentifiers
 * @returns {Promise<{ fragments: Array<DEConversationMessageNarrationFragment> }>}
 */
export async function putNarrationInPerspective(DE, message, resolvedEmitter, resolvedPerspectiveCharacter, previouslyHeardIdentifiers) {
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

    // Match entity identifiers paired with their readable names.
    // Leave incomplete markers and other angle-bracketed text untouched.
    for (let i = 0; i < message.length; i++) {
        const originalFragment = message[i];
        if (typeof originalFragment === "string") {
            fragments.push(originalFragment);
            continue;
        }

        let fragment = originalFragment;

        let hasModified = false;

        if (fragment.foundAs === "character" && resolvedPerspectiveCharacter) {
            // do first this cheap check, if it is already in the previouslyHeardIdentifiers, then we don't need to do anything
            // the perspective character has already heard this name, so it is safe to use it, no need to check if it is specific or not
            // this is a simple cheap check, but it is not enough, we will do a more complex check later on if this fails
            const cheapCheck = previouslyHeardIdentifiers?.some(id => id.text.toLowerCase().trim() === fragment.text.toLowerCase().trim() && id.identifier === fragment.identifier);

            if (!cheapCheck) {

                // unspecific will be eg. he, him, she, her, they, them, etc.
                // eg. <character-jonh:he> goes to the store, should remain as it is, and not be replaced with "the man" or "the person" or whatever
                // as it is already unspecific, and it is not a name, so we don't need to check
                const isUnspecific = isUnspecificText(fragment.text);

                if (!isUnspecific) {

                    // now we need to check if the previous text before this identifier is one of the phrases that force the name to be used, if so we will not modify it
                    /**
                     * @type {string}
                     */
                    let rawTextBeforeIdentifier = "";
                    if (typeof message[i - 1] === "string") {
                        rawTextBeforeIdentifier = /** @type {string} */ (message[i - 1]);
                    }
                    const textBeforeIdentifier = rawTextBeforeIdentifier.trim().toLowerCase();

                    // check ends with any of the phrases in beforeMakesForceOfTheName, if it does then we will not modify it
                    // eg. he goes by the name of <character-jonh:John>, should remain as it is, and not be replaced with "<character-jonh:the man>" or "<character-jonh:the person>" or whatever
                    const forcesName = beforeMakesForceOfTheName.some(phrase => textBeforeIdentifier.endsWith(phrase));

                    if (!forcesName) {
                        // okay so it is not a highly unspecifc pronoun, which means it might contain
                        // unknown information, we must check it, by using the emitterCharacter, the targetCharacter, and the perspectiveCharacter
                        const targetCharacter = DE.characters[fragment.identifier];
                        if (targetCharacter) {
                            const referredAs = splitNameInBits(fragment.text);

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
                            // we do it this way because the emitterMightHaveReferredToTargetAsBits contains all the names that the emitter might have used to refer to the target character, and we want to check if any of those names are specific to the target character
                            // rather than being some generic name that could refer to anyone
                            const isSpecificName = referredAs.some(nameBit => emitterMightHaveReferredToTargetAsBits.some(emitterNameBit => nameBit === emitterNameBit));

                            // okay so the name given was a specific name, but should our perspective character have known this?...
                            if (isSpecificName) {
                                // we can check if perspective character can know this name

                                /**
                                 * @type {Array<string>}
                                 */
                                const perspectiveCanReferToTargetAs = [];
                                if (!resolvedPerspectiveCharacter || resolvedPerspectiveCharacter.id === targetCharacter.id) {
                                    perspectiveCanReferToTargetAs.push(targetCharacter.name);
                                } else {
                                    const perspectiveToTargetBond = DE.bonds[resolvedPerspectiveCharacter.id]?.active.find(b => b.towards === targetCharacter.id) ||
                                        DE.bonds[resolvedPerspectiveCharacter.id]?.ex.find(b => b.towards === targetCharacter.id);
                                    if (perspectiveToTargetBond) {
                                        perspectiveCanReferToTargetAs.push(...perspectiveToTargetBond.knowsAs.map(k => k.name));
                                    }
                                }

                                const perspectiveCanReferToTargetAsBits = perspectiveCanReferToTargetAs.map(name => splitNameInBits(name)).flat();

                                // now we will add the heard names for the more complex (non-cheap) check
                                if (previouslyHeardIdentifiers) {
                                    for (const heardIdentifier of previouslyHeardIdentifiers) {
                                        if (heardIdentifier.identifier === targetCharacter.id) {
                                            perspectiveCanReferToTargetAsBits.push(...splitNameInBits(heardIdentifier.text));
                                        }
                                    }
                                }

                                const isPerspectiveAwareOfName = referredAs.some(nameBit => perspectiveCanReferToTargetAsBits.some(perspectiveNameBit => nameBit === perspectiveNameBit));

                                if (!isPerspectiveAwareOfName) {
                                    // okay so the perspective character is not aware of this name, we must replace it with a generic name
                                    fragment = {
                                        ...fragment,
                                    };
                                    fragment.text = DE.utils.templates.formatCharacterName(targetCharacter, resolvedPerspectiveCharacter, {
                                        capitalize: isStartOfMessage(rawTextBeforeIdentifier) || previousNonSpaceCharacterIsDotOrSign(rawTextBeforeIdentifier),
                                        justName: true,
                                        type: previousWordSpecifiesNonDefinitiveNext(rawTextBeforeIdentifier) ? "default" : "definite",
                                    });
                                    hasModified = true;
                                    modifiedFragmentsCharacterIds.add(targetCharacter.id);
                                }
                            }
                        }
                    }
                }
            }
        }

        fragments.push(fragment);
        if (hasModified) {
            modifiedFragmentsIndexes.push(fragments.length - 1);
        }
    }

    if (modifiedFragmentsCharacterIds.size > 1) {
        // okay it is possible that two of these characters had the same stranger or unknown
        // (or even the same nickname) or whatever, so we must make a clear distinction in text
        // for that we must be creative

        // option 1. using opposite traits, eg. younger and older, taller and shorter, bigger or smaller (between two character only)
        // option 2. using other (two chararacters only, and only if mentioned in consecutive, aka only two mentions) meh we won't use this one, it is too complicated and not very useful
        // option 3. enumeration, first, second, third, fourth, fifth, sixth, seventh, eighth, ninth, tenth (two or more characters)

        // first off to find potential groups of characters that are the same, and using the same name.
        /**
         * @type {Record<string, Array<DEConversationMessageFragmentIdentifier>>}
         */
        const allGroups = {};
        for (const index of modifiedFragmentsIndexes) {
            const fragment = fragments[index];
            if (typeof fragment !== "string" && fragment.foundAs === "character") {
                const trimmed = fragment.text.trim();
                if (!allGroups[trimmed]) {
                    allGroups[trimmed] = [];
                }
                allGroups[trimmed].push(fragment);
            }
        }

        for (const group of Object.values(allGroups)) {
            if (group.length > 1) {
                const individualCharacters = group.map(f => f.identifier).filter((v, i, a) => a.indexOf(v) === i);
                const amountOfCharacters = individualCharacters.length;
                // okay so we have a group of characters that are using the same name, we must make a distinction between them
                if (amountOfCharacters === 2) {
                    // two characters, first we will try to use opposite traits strategy, first pick one to be each
                    const characterA = DE.characters[individualCharacters[0]];
                    const characterB = DE.characters[individualCharacters[1]];

                    let characterAAddedAttribute = "";
                    let characterBAddedAttribute = "";

                    // a gap of 10 years is enough to consider them "older" and "younger"
                    if (Math.abs(characterA.ageYears - characterB.ageYears) >= 10) {
                        const olderCharacter = characterA.ageYears > characterB.ageYears ? characterA : characterB;

                        characterAAddedAttribute = olderCharacter.id === characterA.id ? "older" : "younger";
                        characterBAddedAttribute = olderCharacter.id === characterB.id ? "older" : "younger";

                        // a gap of 30 cm is enough to consider them "taller" and "shorter"
                    } else if (Math.abs(characterA.heightCm - characterB.heightCm) >= 30) {
                        const tallerCharacter = characterA.heightCm > characterB.heightCm ? characterA : characterB;

                        characterAAddedAttribute = tallerCharacter.id === characterA.id ? "taller" : "shorter";
                        characterBAddedAttribute = tallerCharacter.id === characterB.id ? "taller" : "shorter";
                    } else if (Math.abs(characterA.weightKg - characterB.weightKg) >= 30) {
                        const heavierCharacter = characterA.weightKg > characterB.weightKg ? characterA : characterB;

                        characterAAddedAttribute = heavierCharacter.id === characterA.id ? "bigger" : "smaller";
                        characterBAddedAttribute = heavierCharacter.id === characterB.id ? "bigger" : "smaller";
                    } else if (characterA.gender !== characterB.gender) {
                        characterAAddedAttribute = characterA.gender === "male" ? "male" : (characterA.gender === "female" ? "female" : "non-binary");
                        characterBAddedAttribute = characterB.gender === "male" ? "male" : (characterB.gender === "female" ? "female" : "non-binary");
                    } else {
                        // okay so we cannot use opposite traits, we will use "first" and "second" instead
                        characterAAddedAttribute = "first";
                        characterBAddedAttribute = "second";
                    }

                    for (const fragment of group) {
                        if (fragment.identifier === characterA.id) {
                            fragment.text = addRelativeAttributeToName(fragment.text, characterAAddedAttribute);
                        } else if (fragment.identifier === characterB.id) {
                            fragment.text = addRelativeAttributeToName(fragment.text, characterBAddedAttribute);
                        }
                    }
                } else {
                    // more than two characters, we will use "first", "second", "third", etc; any larger than 10 will use the number plus "th" (eg. 11th, 12th, 13th, etc)
                    const ordinalWords = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];

                    // we will loop per character to ensure that each character gets the same and correct ordinal
                    for (let i = 0; i < individualCharacters.length; i++) {
                        const fragments = group.filter(f => f.identifier === individualCharacters[i]);
                        const ordinalForThisCharacter = i < 10 ? ordinalWords[i] : `${i + 1}th`;
                        for (const fragment of fragments) {
                            fragment.text = addRelativeAttributeToName(fragment.text, ordinalForThisCharacter);
                        }
                    }
                }
            }
        }
    }

    // find awkardness, for example "The robot <character-dema:the robot>, is at the station..."
    // this first case will cause a drop of the "the robot" in the first part, and will be replaced with "The robot, is at the station..."
    // provided they are equal, if they are non equal "The robot <character-dema:the first robot>, is at the station..." note
    // that whis would also apply to "as this robot <character-dema:the robot>, is at the station..." or "as the robot <character-dema:the robot>, is at the station..."
    // "The technological creature <character-dema:the robot>, is at the station..." then it will not be replaced, and set in pharentesis
    // "The technological creature (the robot), is at the station..." or "The robot (the first robot), is at the station..."
    // For that we will check single sentences starting with "The" or "As the" or "as this" or "as that" or "this" or "that" or similar cases that specify a character identity
    // only the modifiedFragmentsIndexes will be checked, all the others fragments will remain original, as they are not modified, and thus not a problem
    return {
        fragments,
    };
}

/**
 * 
 * @param {DEObject} DE 
 * @param {Array<DEConversationMessageDialogueFragment>} message 
 * @param {DECompleteCharacterReference | null} resolvedEmitter 
 * @param {DECompleteCharacterReference | null} resolvedPerspectiveCharacter 
 * @param {Array<DEConversationMessageFragmentIdentifier> | null} previouslyHeardIdentifiers
 * @returns {Promise<{
 *    fragments: Array<DEConversationMessageDialogueFragment>,
 *    heardIdentifiers: Array<DEConversationMessageFragmentIdentifier>
 * }>}
 */
export async function putDialogueInPerspective(DE, message, resolvedEmitter, resolvedPerspectiveCharacter, previouslyHeardIdentifiers) {
    /** @type {Array<DEConversationMessageDialogueFragment>} */
    const fragments = [];

    const actualHeardIdentifiers = [...(previouslyHeardIdentifiers || [])];

    // first let's process the dialogue fragments first, to accumulate the heard identifiers
    for (const fragment of message) {
        if (fragment.type === "sound") {
            fragments.push(fragment);
        } else if (fragment.type === "dialogue") {
            for (const innerFragment of fragment.fragments) {
                if (typeof innerFragment === "string") {
                    continue;
                }
                if (innerFragment.foundAs === "character") {
                    actualHeardIdentifiers.push(innerFragment)
                }
            }
            fragments.push(fragment);
        } else {
            // narration (will reprocess later)
            fragments.push(fragment);
        }
    }

    for (const fragment of fragments) {
        if (fragment.type === "narration") {
            fragment.fragments = (await putNarrationInPerspective(DE, fragment.fragments, resolvedEmitter, resolvedPerspectiveCharacter, actualHeardIdentifiers)).fragments;
        }
    }

    // done
    return {
        fragments,
        heardIdentifiers: actualHeardIdentifiers,
    };
}

/**
 * Reduces a descriptor noun phrase to its comparable core by lowercasing and
 * removing a single leading "as" and/or article/determiner, then collapsing
 * whitespace. Eg. "As this robot" => "robot", "The first robot" => "first robot".
 * @param {string} text
 * @returns {string}
 */
function normalizeDescriptor(text) {
    return text
        .toLowerCase()
        .replace(/^\s*as\s+/, "")
        .replace(/^\s*(the|a|an|this|that|these|those)\s+/, "")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Resolves appositive redundancy produced by generic-name replacement.
 *
 * When the narration leads a sentence with an identity descriptor and then
 * restates the same entity as an appositive, replacing the name with a generic
 * descriptor can read awkwardly:
 *   "The robot <character-dema:the robot>, is at the station..."
 *
 * For each modified fragment that directly follows a sentence-leading descriptor
 * and is followed by an appositive comma, we either:
 *  - drop the fragment when its core matches the descriptor
 *    ("The robot <the robot>," => "The robot,"), or
 *  - wrap it in parentheses when the core differs
 *    ("The technological creature <the robot>," => "The technological creature (the robot),").
 *
 * @param {Array<DEConversationMessageNarrationFragment>} fragments
 * @param {Array<number>} modifiedFragmentsIndexes
 * @returns {Array<DEConversationMessageNarrationFragment>}
 */
function findAwkardness(fragments, modifiedFragmentsIndexes) {
    for (const index of modifiedFragmentsIndexes) {
        const fragment = fragments[index];
        if (typeof fragment === "string" || fragment.foundAs !== "character") continue;

        // the subject descriptor, if any, lives in the plain text right before this marker
        const previousFragment = fragments[index - 1];
        if (typeof previousFragment !== "string") continue;

        // the appositive that follows the marker is our main signal. It is closed by a
        // comma, sentence-ending punctuation (. ! ? ;) or the end of the message,
        // eg. "The robot <marker>, is..." / "The robot <marker>." / "The robot <marker>"
        const nextFragment = fragments[index + 1];
        const nextText = typeof nextFragment === "string" ? nextFragment : "";
        const isLastFragment = index === fragments.length - 1;
        const closedByPunctuation = /^\s*[,.!?;]/.test(nextText);
        const closedByEnd = isLastFragment || nextText.trim() === "";
        if (!closedByPunctuation && !closedByEnd) continue;

        // isolate the current sentence lead (text from the last sentence terminator up to the marker)
        const sentenceStart = Math.max(
            previousFragment.lastIndexOf("."),
            previousFragment.lastIndexOf("!"),
            previousFragment.lastIndexOf("?"),
            previousFragment.lastIndexOf("\n"),
        ) + 1;
        const sentenceLead = previousFragment.slice(sentenceStart);

        // a true appositive subject is a single noun phrase: no comma between the sentence start and the marker
        if (sentenceLead.includes(",")) continue;

        // and it must start with an identity-specifying determiner,
        // eg. "The", "this", "that", optionally preceded by "as"
        if (!/^\s*(as\s+)?(the|this|that|these|those)\s+/i.test(sentenceLead)) continue;

        const subjectCore = normalizeDescriptor(sentenceLead);
        const fragmentCore = normalizeDescriptor(fragment.text);
        if (!subjectCore || !fragmentCore) continue;

        if (subjectCore === fragmentCore) {
            // identical descriptor, eg. "The robot <marker:the robot>," -> drop the marker
            // to avoid "The robot the robot,"
            fragment.text = "";
            // remove the now-dangling space that joined the subject to the marker
            fragments[index - 1] = previousFragment.replace(/\s+$/, "");
            // if the following text begins with whitespace before punctuation (eg. " , is")
            // collapse it so the punctuation attaches directly (-> "The robot, is"), and
            // otherwise collapse a leading run of spaces down to a single separating space
            if (typeof nextFragment === "string") {
                if (/^\s+[,.!?;]/.test(nextFragment)) {
                    fragments[index + 1] = nextFragment.replace(/^\s+/, "");
                } else {
                    fragments[index + 1] = nextFragment.replace(/^[ \t]{2,}/, " ");
                }
            }
        } else {
            // related but distinct descriptor, eg. "The technological creature <marker:the robot>,"
            // -> parenthesise it so both descriptors are preserved
            fragment.text = "(" + fragment.text.trim() + ")";
        }
    }
    return fragments;
}