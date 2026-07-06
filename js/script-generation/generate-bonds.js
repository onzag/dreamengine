import { DEngine } from '../engine/index.js';
import { createGrammarFromList } from '../engine/util/grammar.js';
import { getSection, hasSpecialComment, insertSection, insertSpecialComment, toTemplateLiteral, toTemplateLiteralNoInfo } from './base.js';
import { replaceOtherCharNameWithPlaceholder } from './generate-bond-triggers.js';

if (typeof process !== "undefined" && process.versions && process.versions.node) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const PROBABILITY_OPTIONS = ["Unlikely", "Slightly Likely", "Moderately Likely", "Very Likely", "Certainly"];
/** @type {Record<string, number>} */
const PROBABILITY_MAP = {
    "Unlikely": 0,
    "Slightly Likely": 0.25,
    "Moderately Likely": 0.5,
    "Very Likely": 0.75,
    "Certainly": 1,
};

/**
 * Normalizes a free-form answer string to the canonical probability option
 * label (case-insensitive). Returns the first option as a fallback.
 * @param {string} answer
 * @returns {string}
 */
function canonicalProbabilityOption(answer) {
    const trimmed = answer.trim().toLowerCase();
    for (const option of PROBABILITY_OPTIONS) {
        if (trimmed === option.toLowerCase()) {
            return option;
        }
    }
    return PROBABILITY_OPTIONS[0];
}

/**
 * @param {string} answer
 * @returns {number}
 */
function probabilityFromAnswer(answer) {
    return PROBABILITY_MAP[canonicalProbabilityOption(answer)];
}

/** @type {Record<string, string>} */
const STRANGER_KEY_DESCRIPTIONS = {
    "strangerNeutral_n5_5": "stranger",
    "strangerGood_5_100": "stranger",
    "strangerBad_n100_n5": "stranger",
};

/** @type {Record<string, string>} */
const RELATIONSHIP_KEY_DESCRIPTIONS = {
    "foe_n100_n50": "sworn enemy",
    "hostile_n50_n35": "hostile presence",
    "antagonistic_n35_n20": "unwanted presence",
    "unfriendly_n20_n10": "unfriendly presence",
    "unpleasant_n10_0": "unpleasant acquaintance",
    "acquaintance_0_10": "acquaintance",
    "friendly_10_20": "friend",
    "goodFriend_20_35": "good friend",
    "closeFriend_35_50": "close friend",
    "bestFriend_50_100": "best friend",
};

/** @type {Record<string, string>} */
const RELATIONSHIP_KEY_DESCRIPTIONS_FAMILY = {
    "foe_n100_n50": "sworn enemy",
    "hostile_n50_n35": "hostile presence",
    "antagonistic_n35_n20": "unwanted presence",
    "unfriendly_n20_n10": "unfriendly presence",
    "unpleasant_n10_0": "unpleasant character",
    "acquaintance_0_10": "character",
    "friendly_10_20": "cherished character",
    "goodFriend_20_35": "beloved character",
    "closeFriend_35_50": "beloved character",
    "bestFriend_50_100": "deeply beloved and close character",
};

/** @type {Record<string, string>} */
const ROMANTIC_INTEREST_KEY_DESCRIPTIONS = {
    "noRomanticInterest_0_10": "is not a romantic interest",
    "slightRomanticInterest_10_20": "is a slight romantic interest",
    "romanticInterest_20_35": "is a romantic interest",
    "strongRomanticInterest_35_50": "is a strong romantic interest",
    "deepInLove_50_100": "is deeply loved",
};

/** @type {Record<string, string>} */
const ROMANTIC_INTEREST_KEY_LABELS = {
    "noRomanticInterest_0_10": "no romantic interest",
    "slightRomanticInterest_10_20": "develop slight romantic interest",
    "romanticInterest_20_35": "develop romantic interest",
    "strongRomanticInterest_35_50": "develop strong romantic interest",
    "deepInLove_50_100": "become deeply in love",
};

/**
 * Builds a human-readable description of a stranger from its key.
 * @param {string} strangerKey
 * @returns {string}
 */
function describeStrangerContext(strangerKey) {
    return STRANGER_KEY_DESCRIPTIONS[strangerKey] || "stranger";
}

/**
 * Builds a human-readable description of a family/non-family character from
 * the relationship/romantic-interest/family keys.
 * @param {string} relationshipKey
 * @param {string} romanticInterestKey
 * @param {string} familyKey - "family" or "nonFamily"
 * @param {boolean} negativeScenario - whether this description is for a negative scenario (e.g. to be used in a reasonNo) or not (e.g. to be used in a reasonYes), this is needed because in some cases the same relationship/romantic-interest/family keys can lead to different descriptions depending on whether it's a negative or positive scenario
 * @param {boolean} intimateScenario - whether this description is for an intimate scenario
 * @returns {string}
 */
function describeFamilyContext(relationshipKey, romanticInterestKey, familyKey, negativeScenario, intimateScenario) {
    const r = (familyKey === "family" ? RELATIONSHIP_KEY_DESCRIPTIONS_FAMILY : RELATIONSHIP_KEY_DESCRIPTIONS)[relationshipKey] || "character";
    const ri = romanticInterestKey === "noRomanticInterest_0_10" && !negativeScenario ? "" : (ROMANTIC_INTEREST_KEY_DESCRIPTIONS[romanticInterestKey] || (negativeScenario ? "is not a romantic interest" : ""));
    const fam = familyKey === "family" ? "is family" : (negativeScenario && !intimateScenario ? "is not family" : "");
    let base = `${r}`;
    if (ri) {
        base += ` who ${ri}`;
    }
    if (fam) {
        base += (ri ? " and " : " who ") + fam;
    }
    return base;
}

/**
 * Asks the guider to choose a reason from the modifier's reasonYes/reasonNo
 * options, substituting `[]` with `contextReplacement` (and substituting
 * `{{char}}` and `{{other}}` for display only). Returns the chosen reason
 * string with `[]` replaced (but with `{{char}}`/`{{other}}` still present so
 * they can be substituted at runtime by the engine).
 * @param {string} id - the id of the question, used for logging and for fine-tune references
 * @param {import('./base.js').ScriptTypeGuider} guider
 * @param {{
 *    reasonYes: string[],
 *    reasonNo: string[],
 *    animalYes: string[],
 *    animalNo: string[],
 *    feralYes: string[],
 *    feralNo: string[],
 *    familyYes: string[],
 *    familyNo: string[],
 *    maleYes: string[],
 *    maleNo: string[],
 *    femaleYes: string[],
 *    femaleNo: string[],
 *    ambiguousYes: string[],
 *    ambiguousNo: string[],
 * }} modifierInfo
 * @param {string} valueAnswer - "not" | "slight" | "moderate" | "very" this refers to the answer to the question on how receptive they are
 * @param {string} name
 * @param {string} contextReplacement
 * @param {string} guiderQuestion
 * @param {string} selectedValue - the selected value by default
 * @param {string} attractionLevel - "n/a" | "slight" | "moderate" | "strong" this refers to the level of attraction that char has towards other, this is used to choose the correct reasonYes/reasonNo options to show to the guider
 * @param {string} fineTune the fine tune used, eg. humanoid_character_male_a
 * @returns {Promise<string | null>}
 */
async function chooseReason(id, guider, modifierInfo, valueAnswer, name, contextReplacement, guiderQuestion, selectedValue, attractionLevel, fineTune) {
    const attractionToShow = attractionLevel === "n/a" ? "" : attractionLevel === "slight" ? "slightly" : attractionLevel === "moderate" ? "moderately" : "very";

    const gender = fineTune.includes("female") ? "female" : fineTune.includes("male") ? "male" : (fineTune.includes("ambiguous") ? "ambiguous" : "unknown");
    const isAnimal = fineTune.includes("animal");
    const isFeral = fineTune.includes("feral");
    const isFamily = fineTune.includes("family");

    const reasons = []

    if (valueAnswer === "not") {
        if (isAnimal) {
            reasons.push(...modifierInfo.animalNo);
        } else if (isFeral) {
            reasons.push(...modifierInfo.feralNo);
        } else if (isFamily) {
            reasons.push(...modifierInfo.familyNo);
        }

        if (gender === "male") {
            reasons.push(...modifierInfo.maleNo);
        } else if (gender === "female") {
            reasons.push(...modifierInfo.femaleNo);
        } else if (gender === "ambiguous") {
            reasons.push(...modifierInfo.ambiguousNo);
        }

        reasons.push(...modifierInfo.reasonNo);
    } else {
        if (isAnimal) {
            reasons.push(...modifierInfo.animalYes);
        } else if (isFeral) {
            reasons.push(...modifierInfo.feralYes);
        } else if (isFamily) {
            reasons.push(...modifierInfo.familyYes);
        }

        if (gender === "male") {
            reasons.push(...modifierInfo.maleYes);
        } else if (gender === "female") {
            reasons.push(...modifierInfo.femaleYes);
        } else if (gender === "ambiguous") {
            reasons.push(...modifierInfo.ambiguousYes);
        }

        reasons.push(...modifierInfo.reasonYes);
    }

    /**
     * @type {number[]}
     */
    const removedIndexes = [];
    const optionsForGuider = (attractionToShow === "" ? reasons.map(r =>
        r.replace(" who is {} attractive for {{char}}", "").replace(", and {} attractive for {{char}}", "").replace(/{{char}}/g, name).replace(/{{other}}/g, "the other character").replace("[]", contextReplacement)
    ) : reasons.map(r =>
        r.replace(/{{char}}/g, name).replace(/{{other}}/g, "the other character").replace("[]", contextReplacement).replace("{}", attractionToShow)
    )).filter((v, index) => {
        const willPass = !v.includes("{}");
        if (!willPass) {
            removedIndexes.push(index);
        }
        return willPass;
    });

    // monkey patch bad grammar
    for (const option of optionsForGuider) {
        if (option.includes("a acquaintance")) {
            const index = optionsForGuider.indexOf(option);
            optionsForGuider[index] = option.replace("a acquaintance", "an acquaintance");
        }
    }

    const reasonsWithoutRemoved = reasons.filter((_, index) => !removedIndexes.includes(index));

    const selectedValueProcessed = selectedValue && selectedValue.replace(/{{char}}/g, name).replace(/{{other}}/g, "the other character");

    const selectedPotentialValue = getBestMatchInOptions(selectedValueProcessed ? [selectedValueProcessed] : [], optionsForGuider);

    const guiderResult = await guider.askOption(
        id,
        guiderQuestion,
        optionsForGuider,
        selectedPotentialValue || optionsForGuider[0]
    );

    if (guiderResult.value) {
        const reasonIndex = optionsForGuider.indexOf(guiderResult.value);
        const originalReason = reasonsWithoutRemoved[reasonIndex];
        return originalReason.replace("[]", contextReplacement).replace("{}", attractionToShow);
    }

    return null;
}

/**
 * 
 * @param {string[]} values 
 * @param {string[]} options 
 * @returns {string | null}
 */
function getBestMatchInOptions(values, options) {
    if (!options || options.length === 0) {
        return values[0] || null;
    }

    // exact match first
    for (const value of values) {
        if (options.includes(value)) {
            return value;
        }
    }

    const normalizedOptions = options.map(o => o.toLowerCase().replace("moderately", "").replace("slightly", "").replace("strongly", "").replace("very", "").replace("not", ""));
    const normalizedValues = values.map(v => v.toLowerCase().replace("moderately", "").replace("slightly", "").replace("strongly", "").replace("very", "").replace("not", ""));

    for (const value of normalizedValues) {
        const index = normalizedOptions.indexOf(value);
        if (index !== -1) {
            return options[index];
        }
    }

    // second strategy split into words and check for word similarity, the highest similarity wins
    // Tokenize each normalized string into a set of meaningful words (drop
    // very short stopword-like tokens), then score each (value, option) pair
    // by Jaccard similarity (|intersection| / |union|). The option with the
    // highest score wins; ties are broken by the first value that achieved
    // that score. A small minimum threshold avoids returning an option that
    // shares essentially nothing with any value.
    /** @param {string} s */
    const tokenize = (s) => new Set(
        s.split(/[^a-z0-9]+/i)
            .map(w => w.trim().toLowerCase())
            .filter(w => w.length > 2)
    );

    const valueTokenSets = normalizedValues.map(tokenize);
    const optionTokenSets = normalizedOptions.map(tokenize);

    let bestScore = 0;
    let bestOptionIndex = -1;

    for (const valueTokens of valueTokenSets) {
        if (valueTokens.size === 0) continue;
        for (let i = 0; i < optionTokenSets.length; i++) {
            const optTokens = optionTokenSets[i];
            if (optTokens.size === 0) continue;

            let intersectionSize = 0;
            for (const t of valueTokens) {
                if (optTokens.has(t)) intersectionSize++;
            }
            if (intersectionSize === 0) continue;

            const unionSize = valueTokens.size + optTokens.size - intersectionSize;
            const score = intersectionSize / unionSize;

            if (score > bestScore) {
                bestScore = score;
                bestOptionIndex = i;
            }
        }
    }

    const MIN_SIMILARITY = 0.2;
    if (bestOptionIndex !== -1 && bestScore >= MIN_SIMILARITY) {
        return options[bestOptionIndex];
    }

    return null;
}

/**
 * Prefixes a noun phrase with the appropriate indefinite article.
 * @param {string} phrase
 * @returns {string}
 */
function withArticle(phrase) {
    return /^[aeiou]/i.test(phrase) ? `an ${phrase}` : `a ${phrase}`;
}

/**
 * Parses a merged relationship/stranger step key into its component parts,
 * given the chain prefix it belongs to. Mirrors the structure used by the
 * character overview UI (see character-overview.js).
 *
 * Keys are built like:
 *   {chain}{species}_character_{sex}_{attraction}_{context}_{key}
 *   {chain}{species}_character_{sex}_{attraction}_description
 *   {chain}{species}_character_{context}_{key}              (e.g. any_character)
 *   {chain}{species}_character_description
 *
 * The context segment is space separated ("In private"), the trailing key
 * segment is hyphen separated ("open-to-affection"), and every structural
 * boundary is an underscore - which is what makes the pieces separable.
 *
 * @param {string} step
 * @param {string} chain
 * @returns {{species: string, sex: string|null, attractiveness: string|null, context: string|null, key: string}|null}
 */
function parseRelationshipStep(step, chain) {
    const withoutPrefix = step.slice(chain.length);

    // Species always ends with "_character"; everything before it is the type.
    const speciesMatch = withoutPrefix.match(/^(.+?)_character(?:_|$)/);
    if (!speciesMatch) return null;

    const species = speciesMatch[1];
    const rest = withoutPrefix.slice(speciesMatch[0].length);
    if (!rest) return null;

    const tokens = rest.split('_');
    const key = tokens[tokens.length - 1];

    /** @type {string|null} */
    let context = null;
    /** @type {string[]} */
    let front;
    if (key === 'description') {
        // description steps have no intimacy-context segment.
        front = tokens.slice(0, -1);
    } else if (tokens.length >= 2 && tokens[tokens.length - 2].includes(' ')) {
        // The intimacy context ("In private", "In public around family", ...) is
        // the only segment that contains spaces; the sex, attraction and key
        // segments never do. Only treat the second-to-last token as a context
        // when it actually is one - otherwise context-less steps (e.g.
        // "relationship-name") would wrongly consume the trailing attraction
        // token ("na", "a_slight", ...) as the context and drop it.
        context = tokens[tokens.length - 2];
        front = tokens.slice(0, -2);
    } else {
        front = tokens.slice(0, -1);
    }

    /** @type {string|null} */
    let sex = null;
    /** @type {string|null} */
    let attractiveness = null;
    const frontStr = front.join('_');
    if (frontStr) {
        const attractionMatch = frontStr.match(/^(?:(.+?)_)?(a_slight|a_moderate|a_strong|na)$/);
        if (attractionMatch) {
            sex = attractionMatch[1] || null;
            attractiveness = attractionMatch[2];
        } else {
            sex = frontStr;
        }
    }

    return { species, sex, attractiveness, context, key };
}

/**
 * Turns an attraction token into a lowercase human readable phrase, or null
 * when there is no attraction qualifier.
 * @param {string|null} attractiveness
 * @returns {string|null}
 */
function describeAttractiveness(attractiveness) {
    switch (attractiveness) {
        case 'a_slight': return 'slightly attractive';
        case 'a_moderate': return 'moderately attractive';
        case 'a_strong': return 'strongly attractive';
        case 'na': return 'not physically attractive';
        default: return null;
    }
}

/**
 * Builds a human readable description of the "other" character a fine tune
 * targets, from the parsed species / sex / attractiveness tokens.
 * @param {string} species
 * @param {string|null} sex
 * @param {string|null} attractiveness
 * @returns {string}
 */
function describeFineTune(species, sex, attractiveness) {
    const isFamily = species.includes('family');
    const anySpecies = species === 'any' || species === 'any_family';

    let speciesNoun;
    if (isFamily) {
        speciesNoun = 'family member';
    } else if (anySpecies) {
        speciesNoun = 'character';
    } else if (species === 'humanoid') {
        speciesNoun = 'human or humanoid character';
    } else if (species === 'animal') {
        speciesNoun = 'animal';
    } else if (species === 'feral') {
        speciesNoun = 'feral creature';
    } else {
        speciesNoun = `${species} character`;
    }

    let phrase;
    if (sex && sex !== 'any') {
        phrase = withArticle(`${sex} ${speciesNoun}`);
    } else if (anySpecies) {
        phrase = `any ${speciesNoun}`;
    } else {
        phrase = `${withArticle(speciesNoun)} of any gender`;
    }

    const attractionLabel = describeAttractiveness(attractiveness);
    return attractionLabel ? `${phrase} (${attractionLabel})` : phrase;
}

/**
 * Builds a human readable description for a stranger chain, using the base
 * description from STRANGER_KEY_DESCRIPTIONS and qualifying it by the first
 * impression encoded in the key.
 * @param {string} strangerKey
 * @returns {string}
 */
function describeStrangerChain(strangerKey) {
    const base = STRANGER_KEY_DESCRIPTIONS[strangerKey] || 'stranger';
    if (strangerKey.startsWith('strangerGood')) {
        return `a ${base} with a good first impression`;
    }
    if (strangerKey.startsWith('strangerBad')) {
        return `a ${base} with a bad first impression`;
    }
    return `a neutral ${base}`;
}

/**
 * Identifies the relationship/stranger chain a step belongs to and produces a
 * human readable description of that chain. Only chains that start from a known
 * STRANGER_KEY_DESCRIPTIONS or RELATIONSHIP_KEY_DESCRIPTIONS key (and, for
 * relationships, a known romantic-interest and family key) are recognised.
 * @param {string} step
 * @returns {{chain: string, chainLabel: string, romanticInterestKey: string|null, familyKey: string|null}|null}
 */
function getChainInfoForStep(step) {
    for (const strangerKey of Object.keys(STRANGER_KEY_DESCRIPTIONS)) {
        const chain = `${strangerKey}_`;
        if (step.startsWith(chain)) {
            return { chain, chainLabel: describeStrangerChain(strangerKey), romanticInterestKey: null, familyKey: null };
        }
    }

    for (const relationshipKey of Object.keys(RELATIONSHIP_KEY_DESCRIPTIONS)) {
        if (!step.startsWith(`${relationshipKey}_`)) continue;
        const afterRelationship = step.slice(relationshipKey.length + 1);

        for (const romanticInterestKey of Object.keys(ROMANTIC_INTEREST_KEY_LABELS)) {
            if (!afterRelationship.startsWith(`${romanticInterestKey}_`)) continue;
            const afterRomantic = afterRelationship.slice(romanticInterestKey.length + 1);

            for (const familyKey of ['nonFamily', 'family']) {
                if (!afterRomantic.startsWith(`${familyKey}_`)) continue;
                const chain = `${relationshipKey}_${romanticInterestKey}_${familyKey}_`;
                return {
                    chain,
                    chainLabel: describeFamilyContext(relationshipKey, romanticInterestKey, familyKey, false, false),
                    romanticInterestKey,
                    familyKey,
                };
            }
        }
    }

    return null;
}

/**
 * For each relationship (SETTINGS_ORDER_FIRST_LAYER) key, the set of chain base
 * keys a reference answer may be inherited from. Inheritance is limited to the
 * relationship itself plus the closest adjacent one(s) so the guider only ever
 * sees "close" potential references. Strangers are intentionally not limited
 * (see the strangers loop) and therefore are not present as map keys.
 * @type {Record<string, string[]>}
 */
const RELATIONSHIP_INHERIT_SOURCES = {
    // acquaintance is the entry point of the positive chain: it may inherit
    // from any first impression (stranger) or from itself.
    "acquaintance_0_10": ["strangerNeutral_n5_5", "strangerGood_5_100", "acquaintance_0_10"],
    "friendly_10_20": ["acquaintance_0_10", "friendly_10_20"],
    "goodFriend_20_35": ["friendly_10_20", "goodFriend_20_35"],
    "closeFriend_35_50": ["goodFriend_20_35", "closeFriend_35_50"],
    "bestFriend_50_100": ["closeFriend_35_50", "bestFriend_50_100"],
    // unpleasant is the entry point of the negative chain and is a special
    // case: it may inherit from a bad first impression, from its positive
    // counterpart (acquaintance), or from itself.
    "unpleasant_n10_0": ["strangerBad_n100_n5", "acquaintance_0_10", "unpleasant_n10_0"],
    "unfriendly_n20_n10": ["unpleasant_n10_0", "unfriendly_n20_n10"],
    "antagonistic_n35_n20": ["unfriendly_n20_n10", "antagonistic_n35_n20"],
    "hostile_n50_n35": ["antagonistic_n35_n20", "hostile_n50_n35"],
    "foe_n100_n50": ["hostile_n50_n35", "foe_n100_n50"],
};

/**
 * Walks the steps already answered in the state and builds the list of
 * potential reference prefixes the guider can inherit answers from. Each
 * option's `value` is a prefix that, concatenated with `{context}_{key}`,
 * resolves to a previously answered value in the state; its `label` is a human
 * readable description of the relationship + fine tune the prefix refers to.
 *
 * Only prefixes that can be given a human readable name (i.e. that start from a
 * known stranger/relationship chain and a parseable fine tune) are returned.
 *
 * When `forRelationshipKey` is provided, the returned options are limited to
 * the "close" inheritance sources of that relationship (see
 * RELATIONSHIP_INHERIT_SOURCES); prefixes belonging to any other relationship
 * are filtered out. When omitted (e.g. for strangers), no limit is applied.
 *
 * @param {*} state
 * @param {string|null} forRelationshipKey
 * @param {boolean} allCreepy
 * @param {boolean} familyCreepy
 * @returns {Array<{value: string, label: string}>}
 */
function getAllPotentialOptions(state, forRelationshipKey, allCreepy, familyCreepy) {
    const steps = state['.steps'];
    if (!Array.isArray(steps)) {
        return [];
    }

    const allowedSourceKeys = forRelationshipKey ? RELATIONSHIP_INHERIT_SOURCES[forRelationshipKey] : null;

    /** @type {Map<string, string>} prefix -> label */
    const optionsByPrefix = new Map();

    for (const step of steps) {
        if (typeof step !== 'string') continue;

        const chainInfo = getChainInfoForStep(step);
        if (!chainInfo) continue;

        const parsed = parseRelationshipStep(step, chainInfo.chain);
        if (!parsed) continue;

        const { species, sex, attractiveness } = parsed;

        // Reconstruct the fine tune reference prefix: everything up to (and
        // including the trailing underscore before) the context segment.
        let prefix = `${chainInfo.chain}${species}_character_`;
        if (sex) prefix += `${sex}_`;
        if (attractiveness) prefix += `${attractiveness}_`;

        // When limiting to a relationship's close inheritance sources, drop any
        // prefix that does not belong to one of the allowed chain base keys.
        if (allowedSourceKeys && !allowedSourceKeys.some(key => prefix.startsWith(`${key}_`))) {
            continue;
        }

        if (optionsByPrefix.has(prefix)) continue;

        const isFamily = species.includes('family');
        const isCreepy = allCreepy || (familyCreepy && isFamily);
        const hasRomanticInterest = chainInfo.romanticInterestKey !== null && chainInfo.romanticInterestKey !== 'noRomanticInterest_0_10';
        const fineTuneLabel = describeFineTune(species, sex, attractiveness);

        let label;
        if (isCreepy && hasRomanticInterest) {
            // In creepy mode the romantic interest is reversed: the other character
            // has the interest in our character, not the other way around.
            // Extract the relationship key by stripping the romantic-interest suffix from the chain.
            const relationshipKey = chainInfo.chain.split('_noRomanticInterest')[0]
                .split('_slightRomanticInterest')[0]
                .split('_romanticInterest')[0]
                .split('_strongRomanticInterest')[0]
                .split('_deepInLove')[0];
            const relationshipLabel = (chainInfo.chain.includes("family") ? RELATIONSHIP_KEY_DESCRIPTIONS_FAMILY[relationshipKey] : RELATIONSHIP_KEY_DESCRIPTIONS[relationshipKey]) || 'character';
            const creepyInterestLabel = ({
                'slightRomanticInterest_10_20': 'has a slight romantic interest in our character',
                'romanticInterest_20_35': 'has a romantic interest in our character',
                'strongRomanticInterest_35_50': 'has a strong romantic interest in our character',
                'deepInLove_50_100': 'is deeply in love with our character',
                // @ts-ignore
            })[chainInfo.romanticInterestKey] || 'is interested in our character';
            const familySuffix = chainInfo.familyKey === 'family' ? ', who is family' : '';
            label = `${relationshipLabel} who ${creepyInterestLabel}${familySuffix}, ${fineTuneLabel}`;
        } else {
            label = `${chainInfo.chainLabel}, ${fineTuneLabel}`;
        }
        optionsByPrefix.set(prefix, label);
    }

    return Array.from(optionsByPrefix, ([value, label]) => ({ value, label }));
}

/**
 * Picks the option whose `value` is closest to `targetValue`. An exact match
 * wins outright; otherwise closeness is measured primarily by the length of the
 * shared leading `_`-separated token prefix (the keys are hierarchical, so a
 * longer common prefix means a closer relationship/romantic-interest/family/
 * fine-tune match), with overall token overlap (Jaccard) as a tiebreaker.
 *
 * This is used to snap a computed default reference prefix onto an actually
 * available option when the ideal source (e.g. a nonFamily `any_character`
 * counterpart) was never generated and is therefore absent from `options`.
 *
 * @param {string} targetValue
 * @param {Array<{value: string, label: string}>} options
 * @returns {string|null}
 */
function getClosestOptionByValue(targetValue, options) {
    if (!options || options.length === 0) {
        return null;
    }

    const exact = options.find(o => o.value === targetValue);
    if (exact) {
        return exact.value;
    }

    const targetTokens = targetValue.split('_').filter(Boolean);

    /** @type {string|null} */
    let best = null;
    let bestScore = -1;
    for (const option of options) {
        const optionTokens = option.value.split('_').filter(Boolean);

        // Length of the shared leading token prefix (hierarchical closeness).
        let prefixLen = 0;
        while (
            prefixLen < targetTokens.length &&
            prefixLen < optionTokens.length &&
            targetTokens[prefixLen] === optionTokens[prefixLen]
        ) {
            prefixLen++;
        }

        // Order-independent token overlap, used only to break prefix ties.
        const targetSet = new Set(targetTokens);
        const optionSet = new Set(optionTokens);
        let intersection = 0;
        for (const t of targetSet) {
            if (optionSet.has(t)) intersection++;
        }
        const union = targetSet.size + optionSet.size - intersection;
        const jaccard = union === 0 ? 0 : intersection / union;

        const score = prefixLen * 1000 + jaccard;
        if (score > bestScore) {
            bestScore = score;
            best = option.value;
        }
    }

    return best;
}

/**
 * @param {DEngine} engine
 * @param {import('./base.js').ScriptTypeGenerator} scriptgenerator
 * @param {import('./base.js').ScriptTypeGuider} guider
 * @return {Promise<void>}
 */
export async function generateBonds(engine, scriptgenerator, guider) {
    const inferenceAdapter = engine.inferenceAdapter;
    if (!inferenceAdapter) {
        throw new Error("No inference adapter found on engine");
    }

    const systemPrompt = inferenceAdapter.buildSystemPromptForQuestioningAgent(
        `You are a helpful assistant that will answer and assist in defining a character for a game based on their description, you are allowed free rein to interpret the character's description and generate the code that defines them in the game, you will be asked questions about the character and you should answer them as best as you can`,
        [],
        `# Character Card:\n\n${scriptgenerator.state.card}`
    );

    const generator = inferenceAdapter.runQuestioningCustomAgentOn("cardtype-gen-bonds", {
        contextInfoAfter: null,
        contextInfoBefore: null,
        messages: [],
        system: systemPrompt,
    });

    // prime the generator
    let primed = false;
    const prime = async () => {
        if (primed) return;
        primed = true;
        const ready = await generator.next();
        if (ready.done) {
            throw new Error("Generator finished without producing output");
        }
    }

    const isAsexualValue = scriptgenerator.state.asexual;
    const name = scriptgenerator.state.name;

    const initializeSection = getSection(scriptgenerator.body, "initialize");

    if (initializeSection === null) {
        throw new Error("Initialize section not found");
    }

    const newCharacterSection = getSection(initializeSection.body, "new-character");

    if (newCharacterSection === null) {
        throw new Error("New character section not found");
    }

    const optionsSection = getSection(newCharacterSection.foot, "options");

    if (optionsSection === null) {
        throw new Error("Options section not found");
    }

    let isIncestuousValue = false;

    if (!isAsexualValue) {
        isIncestuousValue = !(await guider.askBoolean("non-incestuous", "Should family relationships be excluded from romantic possibilities for " + name + "?", async () => {
            await prime();
            const isIncestuous = await generator.next({
                maxCharacters: 5,
                maxSafetyCharacters: 100,
                maxParagraphs: 1,
                nextQuestion: "Does " + name + " have an incestuous attraction towards family members? Answer with yes or no.",
                stopAfter: [],
                stopAt: [],
                grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`,
            });

            if (isIncestuous.done) {
                throw new Error("Generator finished without producing output");
            }

            return isIncestuous.value.trim().toLowerCase() !== "yes";
        })).value;
    }

    optionsSection.body.push(isAsexualValue ? `type: "4d_creepy",` : `type: "4d_standard",`);
    if (isIncestuousValue) {
        optionsSection.body.push(`familyCreepy: false,`);
    } else {
        optionsSection.body.push(`familyCreepy: true,`);
    }

    const isLoveAtFirstSightValue = await guider.askBoolean(
        "love-at-first-sight",
        "Can " + name + " feel love at first sight?",
        async () => {
            await prime();
            const isLoveAtFirstSight = await generator.next({
                maxCharacters: 5,
                maxSafetyCharacters: 0,
                maxParagraphs: 1,
                nextQuestion: `If ${name} just met someone and had no prior relationship with them, is it possible for ${name} to feel love at first sight towards them? Answer with "yes" or "no".`,
                stopAfter: [],
                stopAt: [],
                grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`,
            });

            if (isLoveAtFirstSight.done) {
                throw new Error("Generator finished without producing output");
            }

            return isLoveAtFirstSight.value.trim().toLowerCase() === "yes";
        },
    );

    const speciesType = scriptgenerator.state["species-type"];

    const fineTunesDescriptions = {
        "any_character": `Any character regardless of species, gender, or attraction`,

        "humanoid_character_male_na": `A MALE human or humanoid character (Non physically attractive for ${name})`,
        "humanoid_character_male_a": `A MALE human or humanoid character ([] for ${name})`,
        "humanoid_character_female_na": `A FEMALE human or humanoid character (Non physically attractive for ${name})`,
        "humanoid_character_female_a": `A FEMALE human or humanoid character ([] for ${name})`,
        "humanoid_character_ambiguous_na": "A human or humanoid character with AMBIGUOUS gender (Non physically attractive for " + name + ")",
        "humanoid_character_ambiguous_a": "A human or humanoid character with AMBIGUOUS gender ([] for " + name + ")",
        "humanoid_character_any_na": `A human or humanoid character of any gender/sex (Non physically attractive for ${name})`,
        "animal_character_male_na": speciesType === "animal" ? "Another animal, a MALE (Non physically attractive for " + name + ")" : "A MALE animal, a pet or wild creature without verbal capabilities (Non physically attractive for " + name + ")",
        "animal_character_male_a": speciesType === "animal" ? "Another animal, a MALE ([] for " + name + ")" : "A MALE animal, a pet or wild creature without verbal capabilities ([] for " + name + ")",
        "animal_character_female_na": speciesType === "animal" ? "Another animal, a FEMALE (Non physically attractive for " + name + ")" : "A FEMALE animal, a pet or wild creature without verbal capabilities (Non physically attractive for " + name + ")",
        "animal_character_female_a": speciesType === "animal" ? "Another animal, a FEMALE ([] for " + name + ")" : "A FEMALE animal, a pet or wild creature without verbal capabilities ([] for " + name + ")",
        "animal_character_ambiguous_na": speciesType === "animal" ? "Another animal with AMBIGUOUS gender (Non physically attractive for " + name + ")" : "An animal with AMBIGUOUS gender, a pet or wild creature without verbal capabilities (Non physically attractive for " + name + ")",
        "animal_character_ambiguous_a": speciesType === "animal" ? "Another animal with AMBIGUOUS gender ([] for " + name + ")" : "An animal with AMBIGUOUS gender, a pet or wild creature without verbal capabilities ([] for " + name + ")",
        "animal_character_any_na": speciesType === "animal" ? "Another animal of any gender/sex (Non physically attractive for " + name + ")" : "An animal of any gender/sex, a pet or wild creature without verbal capabilities (Non physically attractive for " + name + ")",
        "feral_character_male_na": speciesType === "feral" ? "Another creature with evolved cognitive abilities but in a bestial or feral form, a MALE one (Non physically attractive for " + name + ")" : "A MALE creature with evolved cognitive abilities but in a bestial or feral form (Non physically attractive for " + name + ")",
        "feral_character_male_a": speciesType === "feral" ? "Another creature with evolved cognitive abilities but in a bestial or feral form, a MALE one ([] for " + name + ")" : "A MALE creature with evolved cognitive abilities but in a bestial or feral form ([] for " + name + ")",
        "feral_character_female_na": speciesType === "feral" ? "Another creature with evolved cognitive abilities but in a bestial or feral form, a FEMALE one (Non physically attractive for " + name + ")" : "A FEMALE creature with evolved cognitive abilities but in a bestial or feral form (Non physically attractive for " + name + ")",
        "feral_character_female_a": speciesType === "feral" ? "Another creature with evolved cognitive abilities but in a bestial or feral form, a FEMALE one ([] for " + name + ")" : "A FEMALE creature with evolved cognitive abilities but in a bestial or feral form ([] for " + name + ")",
        "feral_character_ambiguous_na": speciesType === "feral" ? "Another creature with evolved cognitive abilities but in a bestial or feral form, with AMBIGUOUS gender (Non physically attractive for " + name + ")" : "A creature with evolved cognitive abilities but in a bestial or feral form with AMBIGUOUS gender (Non physically attractive for " + name + ")",
        "feral_character_ambiguous_a": speciesType === "feral" ? "Another creature with evolved cognitive abilities but in a bestial or feral form, with AMBIGUOUS gender ([] for " + name + ")" : "A creature with evolved cognitive abilities but in a bestial or feral form with AMBIGUOUS gender ([] for " + name + ")",
        "feral_character_any_na": speciesType === "feral" ? "Another creature with evolved cognitive abilities but in a bestial or feral form of any gender/sex (Non physically attractive for " + name + ")" : "A creature with evolved cognitive abilities but in a bestial or feral form of any gender/sex (Non physically attractive for " + name + ")",
    };

    /**
     * @type {typeof fineTunesDescriptions}
     */
    // @ts-ignore
    const fineTunesDesriptionsForList = {};
    Object.keys(fineTunesDescriptions).map(key => {
        // @ts-ignore
        fineTunesDesriptionsForList[key] = fineTunesDescriptions[key].replace("[]", "Physically Attractive");
    });

    // Incest ;(
    // what can you do?
    const fineTuneDescriptionsFamily = {
        "any_family_character": `Any family member regardless of gender`,

        "family_character_male_na": `A MALE family member (Non physically attractive for ${name})`,
        "family_character_male_a": `A MALE family member ([] for ${name})`,
        "family_character_female_na": `A FEMALE family member (Non physically attractive for ${name})`,
        "family_character_female_a": `A FEMALE family member ([] for ${name})`,
        "family_character_ambiguous_na": `A family member with AMBIGUOUS gender (Non physically attractive for ${name})`,
        "family_character_ambiguous_a": `A family member with AMBIGUOUS gender ([] for ${name})`,
        "family_character_any_na": `A family member of any gender/sex (Non physically attractive for ${name})`,
    }

    /**
     * @type {typeof fineTuneDescriptionsFamily}
     */
    // @ts-ignore
    const fineTunesDescriptionsFamilyForList = {};
    Object.keys(fineTuneDescriptionsFamily).map(key => {
        // @ts-ignore
        fineTunesDescriptionsFamilyForList[key] = fineTuneDescriptionsFamily[key].replace("[]", "Physically Attractive");
    });

    const fineTuneConditions = {
        "any_character": "true",
        "any_family_character": "true",

        "humanoid_character_male_na": "other.speciesType === \"humanoid\" && other.gender === \"male\"",
        "humanoid_character_male_a": "other.speciesType === \"humanoid\" && other.gender === \"male\" && DE.utils.isAttractedToWithLevel(char, other) === []",
        "humanoid_character_female_na": "other.speciesType === \"humanoid\" && other.gender === \"female\"",
        "humanoid_character_female_a": "other.speciesType === \"humanoid\" && other.gender === \"female\" && DE.utils.isAttractedToWithLevel(char, other) === []",
        "humanoid_character_ambiguous_na": "other.speciesType === \"humanoid\" && other.gender === \"ambiguous\"",
        "humanoid_character_ambiguous_a": "other.speciesType === \"humanoid\" && other.gender === \"ambiguous\" && DE.utils.isAttractedToWithLevel(char, other) === []",
        "humanoid_character_any_na": "other.speciesType === \"humanoid\"",
        "animal_character_male_na": "other.speciesType === \"animal\" && other.gender === \"male\"",
        "animal_character_male_a": "other.speciesType === \"animal\" && other.gender === \"male\" && DE.utils.isAttractedToWithLevel(char, other) === []",
        "animal_character_female_na": "other.speciesType === \"animal\" && other.gender === \"female\"",
        "animal_character_female_a": "other.speciesType === \"animal\" && other.gender === \"female\" && DE.utils.isAttractedToWithLevel(char, other) === []",
        "animal_character_ambiguous_na": "other.speciesType === \"animal\" && other.gender === \"ambiguous\"",
        "animal_character_ambiguous_a": "other.speciesType === \"animal\" && other.gender === \"ambiguous\" && DE.utils.isAttractedToWithLevel(char, other) === []",
        "animal_character_any_na": "other.speciesType === \"animal\"",
        "feral_character_male_na": "other.speciesType === \"feral\" && other.gender === \"male\"",
        "feral_character_male_a": "other.speciesType === \"feral\" && other.gender === \"male\" && DE.utils.isAttractedToWithLevel(char, other) === []",
        "feral_character_female_na": "other.speciesType === \"feral\" && other.gender === \"female\"",
        "feral_character_female_a": "other.speciesType === \"feral\" && other.gender === \"female\" && DE.utils.isAttractedToWithLevel(char, other) === []",
        "feral_character_ambiguous_na": "other.speciesType === \"feral\" && other.gender === \"ambiguous\"",
        "feral_character_ambiguous_a": "other.speciesType === \"feral\" && other.gender === \"ambiguous\" && DE.utils.isAttractedToWithLevel(char, other) === []",
        "feral_character_any_na": "other.speciesType === \"feral\"",

        "family_character_male_na": "other.gender === \"male\"",
        "family_character_male_a": "other.gender === \"male\" && DE.utils.isAttractedToWithLevel(char, other) === []",
        "family_character_female_na": "other.gender === \"female\"",
        "family_character_female_a": "other.gender === \"female\" && DE.utils.isAttractedToWithLevel(char, other) === []",
        "family_character_ambiguous_na": "other.gender === \"ambiguous\"",
        "family_character_ambiguous_a": "other.gender === \"ambiguous\" && DE.utils.isAttractedToWithLevel(char, other) === []",
        "family_character_any_na": "true",
    }

    const fineTunesRecord = {
        "Humanoid Characters": [
            fineTunesDesriptionsForList["humanoid_character_male_na"],
            fineTunesDesriptionsForList["humanoid_character_male_a"],
            fineTunesDesriptionsForList["humanoid_character_female_na"],
            fineTunesDesriptionsForList["humanoid_character_female_a"],
            fineTunesDesriptionsForList["humanoid_character_ambiguous_na"],
            fineTunesDesriptionsForList["humanoid_character_ambiguous_a"],
            fineTunesDesriptionsForList["humanoid_character_any_na"],
        ],
        "Animal Characters": [
            fineTunesDesriptionsForList["animal_character_male_na"],
            fineTunesDesriptionsForList["animal_character_male_a"],
            fineTunesDesriptionsForList["animal_character_female_na"],
            fineTunesDesriptionsForList["animal_character_female_a"],
            fineTunesDesriptionsForList["animal_character_ambiguous_na"],
            fineTunesDesriptionsForList["animal_character_ambiguous_a"],
            fineTunesDesriptionsForList["animal_character_any_na"],
        ],
        "Feral Characters": [
            fineTunesDesriptionsForList["feral_character_male_na"],
            fineTunesDesriptionsForList["feral_character_male_a"],
            fineTunesDesriptionsForList["feral_character_female_na"],
            fineTunesDesriptionsForList["feral_character_female_a"],
            fineTunesDesriptionsForList["feral_character_ambiguous_na"],
            fineTunesDesriptionsForList["feral_character_ambiguous_a"],
            fineTunesDesriptionsForList["feral_character_any_na"],
        ]
    };

    const fineTunesFamilyRecord = {
        "Family Characters": [
            fineTunesDescriptionsFamilyForList["family_character_male_na"],
            fineTunesDescriptionsFamilyForList["family_character_male_a"],
            fineTunesDescriptionsFamilyForList["family_character_female_na"],
            fineTunesDescriptionsFamilyForList["family_character_female_a"],
            fineTunesDescriptionsFamilyForList["family_character_ambiguous_na"],
            fineTunesDescriptionsFamilyForList["family_character_ambiguous_a"],
            fineTunesDescriptionsFamilyForList["family_character_any_na"],
        ],
    };

    let isAttractedToHumanoid = false;
    let isAttractedToHumanoidMale = false;
    let isAttractedToHumanoidFemale = false;
    let isAttractedToHumanoidAmbiguous = false;
    let isAttractedToHumanoidAny = false;

    let isAttractedToAnimal = false;
    let isAttractedToAnimalMale = false;
    let isAttractedToAnimalFemale = false;
    let isAttractedToAnimalAmbiguous = false;
    let isAttractedToAnimalAny = false;

    let isAttractedToFeral = false;
    let isAttractedToFeralMale = false;
    let isAttractedToFeralFemale = false;
    let isAttractedToFeralAmbiguous = false;
    let isAttractedToFeralAny = false;

    if (!isAsexualValue) {
        let index = 0;
        while (scriptgenerator.state["extra-attraction-species-group-" + index]) {
            const groupName = scriptgenerator.state["extra-attraction-species-group-" + index + "-group"];
            const groupGender = scriptgenerator.state["extra-attraction-species-group-" + index + "-gender"];
            if (groupName === "humanoid") {
                isAttractedToHumanoid = true;

                if (groupGender === "male") {
                    isAttractedToHumanoidMale = true;
                } else if (groupGender === "female") {
                    isAttractedToHumanoidFemale = true;
                } else if (groupGender === "ambiguous") {
                    isAttractedToHumanoidAmbiguous = true;
                } else if (groupGender === "any") {
                    isAttractedToHumanoidAny = true;
                }
            } else if (groupName === "animal") {
                isAttractedToAnimal = true;

                if (groupGender === "male") {
                    isAttractedToAnimalMale = true;
                } else if (groupGender === "female") {
                    isAttractedToAnimalFemale = true;
                } else if (groupGender === "ambiguous") {
                    isAttractedToAnimalAmbiguous = true;
                } else if (groupGender === "any") {
                    isAttractedToAnimalAny = true;
                }
            } else if (groupName === "feral") {
                isAttractedToFeral = true;

                if (groupGender === "male") {
                    isAttractedToFeralMale = true;
                } else if (groupGender === "female") {
                    isAttractedToFeralFemale = true;
                } else if (groupGender === "ambiguous") {
                    isAttractedToFeralAmbiguous = true;
                } else if (groupGender === "any") {
                    isAttractedToFeralAny = true;
                }
            }
            index++;
        }
    }

    /**
     * @type {string[]}
     */
    let defaultFineTunes = [];
    /**
     * @type {string[]}
     */
    let defaultFineTunesAfterRomanticInterest = [];
    /**
     * @type {string[]}
     */
    let defaultFamilyFineTunes = [];
    /**
     * @type {string[]}
     */
    let defaultFamilyFineTunesAfterRomanticInterest = [];

    /**
     * 
     * @param {string} a 
     * @param {string} b 
     * @returns {number}
     */
    const sortAEndingFirst = (a, b) => {
        // even before first we make sure any_character is last
        if (a === "any_character") {
            return 1;
        }
        if (b === "any_character") {
            return -1;
        }

        // second we make sure that any_family_character is second last
        if (a === "any_family_character") {
            return 1;
        }
        if (b === "any_family_character") {
            return -1;
        }

        // first we make sure that any_na always is last
        const aIsAnyNa = a.endsWith("_any_na");
        const bIsAnyNa = b.endsWith("_any_na");
        if (aIsAnyNa && !bIsAnyNa) {
            return 1;
        }
        if (!aIsAnyNa && bIsAnyNa) {
            return -1;
        }

        const aIsA = a.endsWith("_a");
        const bIsA = b.endsWith("_a");
        if (aIsA && !bIsA) {
            return -1;
        } if (!aIsA && bIsA) {
            return 1;
        } return 0;
    }

    if (isAsexualValue) {
        defaultFineTunes = ([
            "animal_character_male_na",
            "animal_character_any_na",
            "feral_character_any_na",
        ]).sort(sortAEndingFirst);
        defaultFineTunes.push("any_character");
        defaultFamilyFineTunes = ([
            "family_character_male_na",
            "family_character_female_na",
            "family_character_ambiguous_na",
        ]).sort(sortAEndingFirst);
        defaultFamilyFineTunes.push("any_family_character");
        // this uses the creepy bond, so it's fine
        defaultFineTunesAfterRomanticInterest = [...defaultFineTunes];
        defaultFamilyFineTunesAfterRomanticInterest = [...defaultFamilyFineTunes];
    } else {
        const isAttractedToMales = !isAsexualValue && (scriptgenerator.state.pansexual || scriptgenerator.state["finds-males-attractive"]);
        const isAttractedToFemales = !isAsexualValue && (scriptgenerator.state.pansexual || scriptgenerator.state["finds-females-attractive"]);
        const isAttractedToAmbiguous = !isAsexualValue && scriptgenerator.state.pansexual;

        if (speciesType === "humanoid") {
            defaultFineTunes.push("humanoid_character_male_na");
            if (isAttractedToMales) {
                defaultFineTunes.push("humanoid_character_male_a");
                defaultFineTunesAfterRomanticInterest.push("humanoid_character_male_a");
            }
            defaultFineTunes.push("humanoid_character_female_na");
            if (isAttractedToFemales) {
                defaultFineTunes.push("humanoid_character_female_a");
                defaultFineTunesAfterRomanticInterest.push("humanoid_character_female_a");
            }
            defaultFineTunes.push("humanoid_character_ambiguous_na");
            if (isAttractedToAmbiguous) {
                defaultFineTunes.push("humanoid_character_ambiguous_a");
                defaultFineTunesAfterRomanticInterest.push("humanoid_character_ambiguous_a");
            }

            if (isAttractedToFeral) {
                if (isAttractedToFeralMale || isAttractedToFeralAny) {
                    defaultFineTunes.push("feral_character_male_a");
                    defaultFineTunesAfterRomanticInterest.push("feral_character_male_a");
                }
                if (isAttractedToFeralFemale || isAttractedToFeralAny) {
                    defaultFineTunes.push("feral_character_female_a");
                    defaultFineTunesAfterRomanticInterest.push("feral_character_female_a");
                }
                if (isAttractedToFeralAmbiguous || isAttractedToFeralAny) {
                    defaultFineTunes.push("feral_character_ambiguous_a");
                    defaultFineTunesAfterRomanticInterest.push("feral_character_ambiguous_a");
                }
            }

            if (isAttractedToAnimal) {
                if (isAttractedToAnimalMale || isAttractedToAnimalAny) {
                    defaultFineTunes.push("animal_character_male_a");
                    defaultFineTunesAfterRomanticInterest.push("animal_character_male_a");
                }
                if (isAttractedToAnimalFemale || isAttractedToAnimalAny) {
                    defaultFineTunes.push("animal_character_female_a");
                    defaultFineTunesAfterRomanticInterest.push("animal_character_female_a");
                }
                if (isAttractedToAnimalAmbiguous || isAttractedToAnimalAny) {
                    defaultFineTunes.push("animal_character_ambiguous_a");
                    defaultFineTunesAfterRomanticInterest.push("animal_character_ambiguous_a");
                }
            }
        } else {
            defaultFineTunes.push("humanoid_character_any_na");
        }

        if (speciesType === "animal") {
            defaultFineTunes.push("animal_character_male_na");
            if (isAttractedToMales) {
                defaultFineTunes.push("animal_character_male_a");
                defaultFineTunesAfterRomanticInterest.push("animal_character_male_a");
            }
            defaultFineTunes.push("animal_character_female_na");
            if (isAttractedToFemales) {
                defaultFineTunes.push("animal_character_female_a");
                defaultFineTunesAfterRomanticInterest.push("animal_character_female_a");
            }
            defaultFineTunes.push("animal_character_ambiguous_na");
            if (isAttractedToAmbiguous) {
                defaultFineTunes.push("animal_character_ambiguous_a");
                defaultFineTunesAfterRomanticInterest.push("animal_character_ambiguous_a");
            }

            if (isAttractedToHumanoid) {
                if (isAttractedToHumanoidMale || isAttractedToHumanoidAny) {
                    defaultFineTunes.push("humanoid_character_male_a");
                    defaultFineTunesAfterRomanticInterest.push("humanoid_character_male_a");
                }
                if (isAttractedToHumanoidFemale || isAttractedToHumanoidAny) {
                    defaultFineTunes.push("humanoid_character_female_a");
                    defaultFineTunesAfterRomanticInterest.push("humanoid_character_female_a");
                }
                if (isAttractedToHumanoidAmbiguous || isAttractedToHumanoidAny) {
                    defaultFineTunes.push("humanoid_character_ambiguous_a");
                    defaultFineTunesAfterRomanticInterest.push("humanoid_character_ambiguous_a");
                }
            }

            if (isAttractedToFeral) {
                if (isAttractedToFeralMale || isAttractedToFeralAny) {
                    defaultFineTunes.push("feral_character_male_a");
                    defaultFineTunesAfterRomanticInterest.push("feral_character_male_a");
                }
                if (isAttractedToFeralFemale || isAttractedToFeralAny) {
                    defaultFineTunes.push("feral_character_female_a");
                    defaultFineTunesAfterRomanticInterest.push("feral_character_female_a");
                }
                if (isAttractedToFeralAmbiguous || isAttractedToFeralAny) {
                    defaultFineTunes.push("feral_character_ambiguous_a");
                    defaultFineTunesAfterRomanticInterest.push("feral_character_ambiguous_a");
                }
            }
        } else {
            defaultFineTunes.push("animal_character_any_na");
        }

        if (speciesType === "feral") {
            defaultFineTunes.push("feral_character_male_na");
            if (isAttractedToMales) {
                defaultFineTunes.push("feral_character_male_a");
                defaultFineTunesAfterRomanticInterest.push("feral_character_male_a");
            }
            defaultFineTunes.push("feral_character_female_na");
            if (isAttractedToFemales) {
                defaultFineTunes.push("feral_character_female_a");
                defaultFineTunesAfterRomanticInterest.push("feral_character_female_a");
            }
            defaultFineTunes.push("feral_character_ambiguous_na");
            if (isAttractedToAmbiguous) {
                defaultFineTunes.push("feral_character_ambiguous_a");
                defaultFineTunesAfterRomanticInterest.push("feral_character_ambiguous_a");
            }

            if (isAttractedToHumanoid) {
                if (isAttractedToHumanoidMale || isAttractedToHumanoidAny) {
                    defaultFineTunes.push("humanoid_character_male_a");
                    defaultFineTunesAfterRomanticInterest.push("humanoid_character_male_a");
                }
                if (isAttractedToHumanoidFemale || isAttractedToHumanoidAny) {
                    defaultFineTunes.push("humanoid_character_female_a");
                    defaultFineTunesAfterRomanticInterest.push("humanoid_character_female_a");
                }
                if (isAttractedToHumanoidAmbiguous || isAttractedToHumanoidAny) {
                    defaultFineTunes.push("humanoid_character_ambiguous_a");
                    defaultFineTunesAfterRomanticInterest.push("humanoid_character_ambiguous_a");
                }
            }

            if (isAttractedToAnimal) {
                if (isAttractedToAnimalMale || isAttractedToAnimalAny) {
                    defaultFineTunes.push("animal_character_male_a");
                    defaultFineTunesAfterRomanticInterest.push("animal_character_male_a");
                }
                if (isAttractedToAnimalFemale || isAttractedToAnimalAny) {
                    defaultFineTunes.push("animal_character_female_a");
                    defaultFineTunesAfterRomanticInterest.push("animal_character_female_a");
                }
                if (isAttractedToAnimalAmbiguous || isAttractedToAnimalAny) {
                    defaultFineTunes.push("animal_character_ambiguous_a");
                    defaultFineTunesAfterRomanticInterest.push("animal_character_ambiguous_a");
                }
            }
        } else {
            defaultFineTunes.push("feral_character_any_na");
        }

        defaultFineTunes = defaultFineTunes.sort(sortAEndingFirst);

        defaultFineTunes.push("any_character");
        defaultFineTunesAfterRomanticInterest.push("any_character");

        if (isIncestuousValue) {
            defaultFamilyFineTunes.push("family_character_male_na");
            if (isAttractedToMales) {
                defaultFamilyFineTunes.push("family_character_male_a");
                defaultFamilyFineTunesAfterRomanticInterest.push("family_character_male_a");
            }
            defaultFamilyFineTunes.push("family_character_female_na");
            if (isAttractedToFemales) {
                defaultFamilyFineTunes.push("family_character_female_a");
                defaultFamilyFineTunesAfterRomanticInterest.push("family_character_female_a");
            }
            defaultFamilyFineTunes.push("family_character_ambiguous_na");
            if (isAttractedToAmbiguous) {
                defaultFamilyFineTunes.push("family_character_ambiguous_a");
                defaultFamilyFineTunesAfterRomanticInterest.push("family_character_ambiguous_a");
            }

            defaultFamilyFineTunes = defaultFamilyFineTunes.sort(sortAEndingFirst);
        } else {
            defaultFamilyFineTunes = ([
                "family_character_any_na",
            ]).sort(sortAEndingFirst);
            // this uses creepy bonds so it's fine
            defaultFamilyFineTunesAfterRomanticInterest = ([
                "family_character_any_na",
            ]).sort(sortAEndingFirst);
        }
    }

    const guiderBondFineTunesResult = await guider.askList(
        "bonds-fine-tunes",
        "Select the fine-tunes that best fit " + name + " and the relationships they can build, or add your own (these will be used to determine the types of bonds " + name + " forms with other characters, and how they interact with them)\n\n" +
        "Note that these fine tunes will have no effect if no such bond or attraction can be formed based on the previously selected potential attractions for " + name,
        fineTunesRecord,
        // @ts-ignore
        defaultFineTunes.filter((v) => v !== "any_character").map(key => fineTunesDesriptionsForList[key])
    );

    /**
     * @type {string[]}
     */
    let selectedFineTunes = [];
    guiderBondFineTunesResult.value.map(val => {
        // @ts-ignore
        const foundKey = Object.keys(fineTunesDesriptionsForList).find(key => fineTunesDesriptionsForList[key] === val);
        if (foundKey) {
            if (!selectedFineTunes.includes(foundKey)) {
                selectedFineTunes.push(foundKey);
            }
        }
    });

    selectedFineTunes = selectedFineTunes.sort(sortAEndingFirst);
    selectedFineTunes.push("any_character");

    const fineTunesAfterRomanticInterestResult = await guider.askList(
        "bonds-fine-tunes-after-romantic-interest",
        "Select the fine-tunes that best fit " + name + "'s romantic and sexual attractions they can build, or add your own (these will be used to determine the types of romantic bonds " + name + " forms with other characters, and how they interact with them)\n\n" +
        "Note that these fine tunes will have no effect if no such bond or attraction can be formed based on the previously selected potential attractions for " + name,
        fineTunesRecord,
        // @ts-ignore
        defaultFineTunesAfterRomanticInterest.filter((v) => v !== "any_character").map(key => fineTunesDesriptionsForList[key])
    );

    /**
     * @type {string[]}
     */
    let selectedFineTunesAfterRomanticInterest = [];
    fineTunesAfterRomanticInterestResult.value.map(val => {
        // @ts-ignore
        const foundKey = Object.keys(fineTunesDesriptionsForList).find(key => fineTunesDesriptionsForList[key] === val);
        if (foundKey) {
            if (!selectedFineTunesAfterRomanticInterest.includes(foundKey)) {
                selectedFineTunesAfterRomanticInterest.push(foundKey);
            }
        }
    });

    selectedFineTunesAfterRomanticInterest = selectedFineTunesAfterRomanticInterest.sort(sortAEndingFirst);
    selectedFineTunesAfterRomanticInterest.push("any_character");

    const familyFineTunesResult = await guider.askList(
        "bonds-family-fine-tunes",
        "Select the fine-tunes that best fit " + name + "'s relationship with family, or add your own (these will be used to determine the types of bonds " + name + " forms with other family members, and how they interact with them)\n\n" +
        "Note that these fine tunes will have no effect if no such bond can be formed for " + name,
        fineTunesFamilyRecord,
        // @ts-ignore
        defaultFamilyFineTunes.filter((v) => v !== "any_family_character").map(key => fineTunesDescriptionsFamilyForList[key])
    );

    /**
     * @type {string[]}
     */
    let selectedFamilyFineTunes = [];
    familyFineTunesResult.value.map(val => {
        // @ts-ignore
        const foundKey = Object.keys(fineTunesDescriptionsFamilyForList).find(key => fineTunesDescriptionsFamilyForList[key] === val);
        if (foundKey) {
            if (!selectedFamilyFineTunes.includes(foundKey)) {
                selectedFamilyFineTunes.push(foundKey);
            }
        }
    });

    selectedFamilyFineTunes = selectedFamilyFineTunes.sort(sortAEndingFirst);
    if (!selectedFamilyFineTunes.includes("family_character_any_na")) {
        selectedFamilyFineTunes.push("any_family_character");
    }

    /**
     * The reason they are the same even after romantic interest is because
     * when non-incest it uses the creepy bond so the selected will remain in non-attractive for
     * 
     * @type {string[]}
     */
    let selectedFamilyFineTunesAfterRomanticInterest = selectedFamilyFineTunes;
    if (isIncestuousValue) {
        const familyFineTunesAfterRomanticInterestResult = await guider.askList(
            "bonds-family-fine-tunes-after-romantic-interest",
            "Select the fine-tunes that best fit " + name + "'s relationship with a family member after they have a romantic interest, or add your own (these will be used to determine the types of bonds " + name + " forms with other family members, and how they interact with them)\n\n" +
            "Note that these fine tunes will have no effect if no such bond can be formed for " + name,
            fineTunesFamilyRecord,
            // @ts-ignore
            defaultFamilyFineTunesAfterRomanticInterest.filter((v) => v !== "any_family_character").map(key => fineTunesDescriptionsFamilyForList[key])
        );

        selectedFamilyFineTunesAfterRomanticInterest = [];
        familyFineTunesAfterRomanticInterestResult.value.map(val => {
            // @ts-ignore
            const foundKey = Object.keys(fineTunesDescriptionsFamilyForList).find(key => fineTunesDescriptionsFamilyForList[key] === val);
            if (foundKey) {
                if (!selectedFamilyFineTunesAfterRomanticInterest.includes(foundKey)) {
                    selectedFamilyFineTunesAfterRomanticInterest.push(foundKey);
                }
            }
        });

        selectedFamilyFineTunesAfterRomanticInterest = selectedFamilyFineTunesAfterRomanticInterest.sort(sortAEndingFirst);
        if (!selectedFamilyFineTunesAfterRomanticInterest.includes("family_character_any_na")) {
            selectedFamilyFineTunesAfterRomanticInterest.push("any_family_character");
        }
    }

    const wouldUseViolenceTowardsEnemiesValue = (await guider.askBoolean(
        "would-use-violence-towards-enemies",
        "Would " + name + " use violence towards people they have a hostile relationship with?",
        async () => {
            await prime();
            const wouldUseViolenceTowardsEnemies = await generator.next({
                maxCharacters: 5,
                maxSafetyCharacters: 100,
                maxParagraphs: 1,
                nextQuestion: "If " + name + " has an extremely hostile and abusive relationship with another character, would they be willing use violence towards that character if they had the opportunity? Answer with yes or no.",
                stopAfter: [],
                stopAt: [],
                grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`,
            });

            if (wouldUseViolenceTowardsEnemies.done) {
                throw new Error("Generator finished without producing output");
            }

            return wouldUseViolenceTowardsEnemies.value.trim().toLowerCase() === "yes";
        }
    )).value;

    const SETTINGS = {
        "foe_n100_n50": {
            "noRomanticInterest_0_10": {
                nonFamily: wouldUseViolenceTowardsEnemiesValue ?
                    "a sworn enemy, {} that " + name + " truly hates with every fiber of their being — someone " + name + " considers dangerous and would not hesitate to hurt, harm, or even kill if given the chance, and who may want " + name + " dead in return" :
                    "a sworn enemy, {} that " + name + " truly hates with every fiber of their being — someone " + name + " despises with a cold, burning intensity",
                family: wouldUseViolenceTowardsEnemiesValue ?
                    "{} that " + name + " considers a sworn enemy — someone who has caused " + name + " deep harm or trauma, whom " + name + " despises so completely that violence between them is not out of the question, and whose very existence " + name + " may wish to end" :
                    "{} that " + name + " considers a sworn enemy — someone who has caused " + name + " deep harm or trauma, whom " + name + " despises with an absolute and unforgiving hatred",
            },
            "slightRomanticInterest_10_20": {
                nonFamily: wouldUseViolenceTowardsEnemiesValue ?
                    (isAsexualValue ?
                        "a sworn enemy, {} that " + name + " truly hates and would hurt or kill without hesitation — someone who has also shown slight romantic and sexual interest in " + name + ", but " + name + " does not reciprocate because they are asexual, and the unwanted attention only deepens the murderous hatred" :
                        "a sworn enemy, {} that " + name + " truly hates and would hurt or kill without hesitation, yet is unsettlingly drawn to with a slight, deeply unwanted romantic and sexual attraction — a sickening contradiction that makes " + name + " hate them and themselves even more") :
                    (isAsexualValue ?
                        "a sworn enemy, {} that " + name + " despises with an absolute hatred — someone who has also shown slight romantic and sexual interest in " + name + ", but " + name + " does not reciprocate because they are asexual, and the unwanted attention only deepens the contempt" :
                        "a sworn enemy, {} that " + name + " despises with an absolute hatred, yet is unsettlingly drawn to with a slight, deeply unwanted romantic and sexual attraction that " + name + " cannot fully explain or accept"),
                family: wouldUseViolenceTowardsEnemiesValue ?
                    (isIncestuousValue ?
                        "{} that " + name + " considers a sworn enemy and has caused " + name + " deep harm or trauma, yet " + name + " has a slight and deeply shameful romantic and sexual interest in — feelings that coexist sickeningly with the desire to see them suffer" :
                        "{} that " + name + " considers a sworn enemy — someone who has caused " + name + " deep harm or trauma, and who has shown slight romantic and sexual interest in " + name + ", which " + name + " finds revolting and does not reciprocate, and which may provoke a violent response") :
                    (isIncestuousValue ?
                        "{} that " + name + " considers a sworn enemy and has caused " + name + " deep harm or trauma, yet " + name + " has a slight and deeply shameful romantic and sexual interest in" :
                        "{} that " + name + " considers a sworn enemy — someone who has caused " + name + " deep harm or trauma, and who has shown slight romantic and sexual interest in " + name + ", which " + name + " finds revolting and does not reciprocate"),
            },
            "romanticInterest_20_35": {
                nonFamily: wouldUseViolenceTowardsEnemiesValue ?
                    (isAsexualValue ?
                        "a sworn enemy, {} that " + name + " truly hates and would hurt or kill without hesitation — someone who has shown romantic and sexual interest in " + name + ", but " + name + " does not reciprocate because they are asexual, and the persistent unwanted desire only fuels " + name + "'s murderous contempt" :
                        "a sworn enemy, {} that " + name + " truly hates and would hurt or kill without hesitation, yet cannot help but feel a real and disturbing romantic and sexual attraction toward — a monstrous contradiction that disgusts " + name + " to their core") :
                    (isAsexualValue ?
                        "a sworn enemy, {} that " + name + " despises with an absolute hatred — someone who has shown romantic and sexual interest in " + name + ", but " + name + " does not reciprocate because they are asexual, and the persistent desire only deepens " + name + "'s cold contempt" :
                        "a sworn enemy, {} that " + name + " despises with an absolute hatred, yet cannot help but feel a real and disturbing romantic and sexual attraction toward — a contradiction " + name + " resents deeply"),
                family: wouldUseViolenceTowardsEnemiesValue ?
                    (isIncestuousValue ?
                        "{} that " + name + " considers a sworn enemy and has caused " + name + " deep harm or trauma, yet " + name + " has a real and deeply shameful romantic and sexual interest in — feelings that war violently with the desire to hurt them" :
                        "{} that " + name + " considers a sworn enemy — someone who has caused " + name + " deep harm or trauma, and who has shown romantic and sexual interest in " + name + ", which " + name + " finds revolting and does not reciprocate") :
                    (isIncestuousValue ?
                        "{} that " + name + " considers a sworn enemy and has caused " + name + " deep harm or trauma, yet " + name + " has a real and deeply shameful romantic and sexual interest in" :
                        "{} that " + name + " considers a sworn enemy — someone who has caused " + name + " deep harm or trauma, and who has shown romantic and sexual interest in " + name + ", which " + name + " finds revolting and does not reciprocate"),
            },
            "strongRomanticInterest_35_50": {
                nonFamily: wouldUseViolenceTowardsEnemiesValue ?
                    (isAsexualValue ?
                        "a sworn enemy, {} that " + name + " truly hates and would hurt or kill without hesitation — someone who has shown strong romantic and sexual interest in " + name + ", but " + name + " does not reciprocate because they are asexual, and the obsessive unwanted desire makes this enemy even more dangerous and repulsive to " + name :
                        "a sworn enemy, {} that " + name + " truly hates and would kill if they could, yet is strongly and almost obsessively attracted to, both romantically and sexually — the hatred and the desire feeding each other in a destructive loop, and though " + name + " would still destroy them, the attraction makes every confrontation agonizing") :
                    (isAsexualValue ?
                        "a sworn enemy, {} that " + name + " despises with an absolute hatred — someone who has shown strong romantic and sexual interest in " + name + ", but " + name + " does not reciprocate because they are asexual, and the obsessive unwanted attention only intensifies the loathing" :
                        "a sworn enemy, {} that " + name + " despises with an absolute hatred, yet is strongly and almost obsessively attracted to, both romantically and sexually, in a way that fills " + name + " with self-loathing — the hate and the desire feeding each other in a destructive loop"),
                family: wouldUseViolenceTowardsEnemiesValue ?
                    (isIncestuousValue ?
                        "{} that " + name + " considers a sworn enemy and has caused " + name + " deep harm or trauma, yet " + name + " has strong and deeply shameful romantic and sexual feelings for — feelings that make the violence between them even more agonizing and twisted" :
                        "{} that " + name + " considers a sworn enemy — someone who has caused " + name + " deep harm or trauma, and who has shown strong romantic and sexual interest in " + name + ", which " + name + " finds revolting and does not reciprocate") :
                    (isIncestuousValue ?
                        "{} that " + name + " considers a sworn enemy and has caused " + name + " deep harm or trauma, yet " + name + " has strong and deeply shameful romantic and sexual feelings for" :
                        "{} that " + name + " considers a sworn enemy — someone who has caused " + name + " deep harm or trauma, and who has shown strong romantic and sexual interest in " + name + ", which " + name + " finds revolting and does not reciprocate"),
            },
            "deepInLove_50_100": {
                nonFamily: wouldUseViolenceTowardsEnemiesValue ?
                    (isAsexualValue ?
                        "a sworn enemy {} that " + name + " truly hates and would hurt or kill without hesitation — someone who has shown deep love and sexual desire for " + name + ", but " + name + " does not reciprocate because they are asexual, and the consuming obsession makes this enemy the most dangerous and repulsive person in " + name + "'s life" :
                        "a sworn enemy {} that " + name + " truly hates and has the capacity to kill, yet is consumed by a deep and agonizing love and sexual desire for — the hatred and the love are so intertwined that " + name + " cannot tell where one ends and the other begins, and though they might still destroy this person, every attempt would break something inside " + name + " as well") :
                    (isAsexualValue ?
                        "a sworn enemy {} that " + name + " despises with an absolute hatred — someone who has shown deep love and sexual desire for " + name + ", but " + name + " does not reciprocate because they are asexual, and the consuming obsession makes this person the most loathsome presence in " + name + "'s life" :
                        "a sworn enemy {} that " + name + " despises with an absolute hatred, yet is consumed by a deep and agonizing love and sexual desire for — feelings " + name + " finds monstrous and cannot reconcile with the hatred, leaving them in a state of constant inner turmoil"),
                family: wouldUseViolenceTowardsEnemiesValue ?
                    (isIncestuousValue ?
                        "{} that " + name + " considers a sworn enemy and has caused " + name + " deep harm or trauma, yet " + name + " is deeply in love with and sexually attracted to — a consuming and shameful obsession where the desire to see them suffer and the desire to possess them are indistinguishable, and the violence between them is as intimate as it is destructive" :
                        "{} that " + name + " considers a sworn enemy — someone who has caused " + name + " deep harm or trauma, and who is deeply in love with and sexually attracted to " + name + ", a love " + name + " finds sickening and does not reciprocate") :
                    (isIncestuousValue ?
                        "{} that " + name + " considers a sworn enemy and has caused " + name + " deep harm or trauma, yet " + name + " is deeply in love with and sexually attracted to — a consuming and shameful obsession intertwined with the hatred" :
                        "{} that " + name + " considers a sworn enemy — someone who has caused " + name + " deep harm or trauma, and who is deeply in love with and sexually attracted to " + name + ", a love " + name + " finds sickening and does not reciprocate"),
            },
        },
        "hostile_n50_n35": {
            "noRomanticInterest_0_10": {
                nonFamily: wouldUseViolenceTowardsEnemiesValue ?
                    "{} that " + name + " has a deeply hostile and aggressive relationship with — someone who has caused " + name + " real harm, fear, or trauma, and whom " + name + " may respond to with intimidation, threats, or physical violence" :
                    "{} that " + name + " has a deeply hostile relationship with — someone who has caused " + name + " real emotional harm or trauma, and whom " + name + " treats with verbal cruelty, cold aggression, and sustained hostility, though without resorting to physical violence",
                family: wouldUseViolenceTowardsEnemiesValue ?
                    "{} that " + name + " has a deeply hostile and aggressive relationship with — someone who has caused " + name + " real harm, fear, or trauma within the family, and interactions between them may involve verbal abuse, intimidation, or even physical violence" :
                    "{} that " + name + " has a deeply hostile relationship with — someone who has caused " + name + " real emotional harm or trauma within the family, and interactions between them involve verbal abuse, emotional manipulation, and sustained hostility, though without physical violence",
            },
            "slightRomanticInterest_10_20": {
                nonFamily: wouldUseViolenceTowardsEnemiesValue ?
                    (isAsexualValue ?
                        "{} that " + name + " has a deeply hostile and aggressive relationship with — someone who has caused " + name + " real harm or trauma, and who has also shown slight romantic and sexual interest in " + name + ", but " + name + " does not reciprocate because they are asexual, and the unwanted attention feels threatening and may provoke a violent reaction" :
                        "{} that " + name + " has a deeply hostile and aggressive relationship with — someone who has caused " + name + " real harm or trauma, yet " + name + " feels a slight and deeply unwanted romantic and sexual attraction toward them that feels like a betrayal of their own safety") :
                    (isAsexualValue ?
                        "{} that " + name + " has a deeply hostile relationship with — someone who has caused " + name + " real emotional harm or trauma, and who has also shown slight romantic and sexual interest in " + name + ", but " + name + " does not reciprocate because they are asexual, and the unwanted attention only deepens the hostility" :
                        "{} that " + name + " has a deeply hostile relationship with — someone who has caused " + name + " real emotional harm or trauma, yet " + name + " feels a slight and deeply unwanted romantic and sexual attraction toward that " + name + " tries to suppress and deny"),
                family: wouldUseViolenceTowardsEnemiesValue ?
                    (isIncestuousValue ?
                        "{} that " + name + " has a deeply hostile and aggressive relationship with — someone who has caused " + name + " real harm or trauma within the family, yet " + name + " has a slight and deeply shameful romantic and sexual interest in, which makes the violence between them even more twisted" :
                        "{} that " + name + " has a deeply hostile and aggressive relationship with — someone who has caused " + name + " real harm or trauma, and who has shown slight romantic and sexual interest in " + name + ", which " + name + " finds threatening and does not reciprocate") :
                    (isIncestuousValue ?
                        "{} that " + name + " has a deeply hostile relationship with — someone who has caused " + name + " real emotional harm or trauma within the family, yet " + name + " has a slight and deeply shameful romantic and sexual interest in" :
                        "{} that " + name + " has a deeply hostile relationship with — someone who has caused " + name + " real emotional harm or trauma, and who has shown slight romantic and sexual interest in " + name + ", which " + name + " does not reciprocate"),
            },
            "romanticInterest_20_35": {
                nonFamily: wouldUseViolenceTowardsEnemiesValue ?
                    (isAsexualValue ?
                        "{} that " + name + " has a deeply hostile and aggressive relationship with — someone who has caused " + name + " real harm or trauma, and who has shown romantic and sexual interest in " + name + ", but " + name + " does not reciprocate because they are asexual, and the persistent desire feels predatory and dangerous" :
                        "{} that " + name + " has a deeply hostile and aggressive relationship with — someone who has caused " + name + " real harm or trauma, yet " + name + " feels a genuine and disturbing romantic and sexual attraction toward them that conflicts violently with the fear and rage they also feel") :
                    (isAsexualValue ?
                        "{} that " + name + " has a deeply hostile relationship with — someone who has caused " + name + " real emotional harm or trauma, and who has shown romantic and sexual interest in " + name + ", but " + name + " does not reciprocate because they are asexual, and the persistent desire only deepens the hostility" :
                        "{} that " + name + " has a deeply hostile relationship with — someone who has caused " + name + " real emotional harm or trauma, yet " + name + " feels a genuine and troubling romantic and sexual attraction toward — a pull " + name + " resents and struggles to make sense of"),
                family: wouldUseViolenceTowardsEnemiesValue ?
                    (isIncestuousValue ?
                        "{} that " + name + " has a deeply hostile and aggressive relationship with — someone who has caused " + name + " real harm or trauma within the family, yet " + name + " has a real and deeply shameful romantic and sexual interest in — feelings that war with the violence and rage between them" :
                        "{} that " + name + " has a deeply hostile and aggressive relationship with — someone who has caused " + name + " real harm or trauma, and who has shown romantic and sexual interest in " + name + ", which " + name + " finds threatening and does not reciprocate") :
                    (isIncestuousValue ?
                        "{} that " + name + " has a deeply hostile relationship with — someone who has caused " + name + " real emotional harm or trauma within the family, yet " + name + " has a real and deeply shameful romantic and sexual interest in" :
                        "{} that " + name + " has a deeply hostile relationship with — someone who has caused " + name + " real emotional harm or trauma, and who has shown romantic and sexual interest in " + name + ", which " + name + " does not reciprocate"),
            },
            "strongRomanticInterest_35_50": {
                nonFamily: wouldUseViolenceTowardsEnemiesValue ?
                    (isAsexualValue ?
                        "{} that " + name + " has a deeply hostile and aggressive relationship with — someone who has caused " + name + " real harm or trauma, and who has shown strong romantic and sexual interest in " + name + ", but " + name + " does not reciprocate because they are asexual, and the obsessive unwanted desire makes this person feel even more dangerous and threatening" :
                        "{} that " + name + " has a deeply hostile and aggressive relationship with — someone who has caused " + name + " real harm or trauma, yet " + name + " is strongly drawn to with a romantic and sexual intensity that wars with the fear, rage, and desire for revenge — though the strong attraction may sometimes stay " + name + "'s hand when violence would otherwise follow") :
                    (isAsexualValue ?
                        "{} that " + name + " has a deeply hostile relationship with — someone who has caused " + name + " real emotional harm or trauma, and who has shown strong romantic and sexual interest in " + name + ", but " + name + " does not reciprocate because they are asexual, and the obsessive attention only intensifies the hostility" :
                        "{} that " + name + " has a deeply hostile relationship with — someone who has caused " + name + " real emotional harm or trauma, yet " + name + " is strongly drawn to with a romantic and sexual intensity that wars with the hostility — the aggression and the desire intertwined in a toxic push and pull " + name + " cannot easily escape"),
                family: wouldUseViolenceTowardsEnemiesValue ?
                    (isIncestuousValue ?
                        "{} that " + name + " has a deeply hostile and aggressive relationship with — someone who has caused " + name + " real harm or trauma within the family, yet " + name + " has strong and deeply shameful romantic and sexual feelings for — feelings that make the violence between them even more agonizing" :
                        "{} that " + name + " has a deeply hostile and aggressive relationship with — someone who has caused " + name + " real harm or trauma, and who has shown strong romantic and sexual interest in " + name + ", which " + name + " finds threatening and does not reciprocate") :
                    (isIncestuousValue ?
                        "{} that " + name + " has a deeply hostile relationship with — someone who has caused " + name + " real emotional harm or trauma within the family, yet " + name + " has strong and deeply shameful romantic and sexual feelings for" :
                        "{} that " + name + " has a deeply hostile relationship with — someone who has caused " + name + " real emotional harm or trauma, and who has shown strong romantic and sexual interest in " + name + ", which " + name + " does not reciprocate"),
            },
            "deepInLove_50_100": {
                nonFamily: wouldUseViolenceTowardsEnemiesValue ?
                    (isAsexualValue ?
                        "{} that " + name + " has a deeply hostile and aggressive relationship with — someone who has caused " + name + " real harm or trauma, and who has shown deep love and sexual desire for " + name + ", but " + name + " does not reciprocate because they are asexual, and the consuming obsession makes this person the most dangerous threat in " + name + "'s life" :
                        "{} that " + name + " has a deeply hostile and aggressive relationship with — someone who has caused " + name + " real harm or trauma, yet " + name + " is deeply in love with and sexually attracted to — the love and desire tangled with fear, rage, and the scars of real violence into something deeply toxic, and though " + name + " could hurt them, the depth of the love makes every violent impulse a source of anguish") :
                    (isAsexualValue ?
                        "{} that " + name + " has a deeply hostile relationship with — someone who has caused " + name + " real emotional harm or trauma, and who has shown deep love and sexual desire for " + name + ", but " + name + " does not reciprocate because they are asexual, and the consuming obsession makes this person the most loathsome presence in " + name + "'s life" :
                        "{} that " + name + " has a deeply hostile relationship with — someone who has caused " + name + " real emotional harm or trauma, yet " + name + " is deeply in love with and sexually attracted to in a way that is agonizing — the love and desire sharpening the hostility and the hostility curdling them into something painful and consuming"),
                family: wouldUseViolenceTowardsEnemiesValue ?
                    (isIncestuousValue ?
                        "{} that " + name + " has a deeply hostile and aggressive relationship with — someone who has caused " + name + " real harm or trauma within the family, yet " + name + " is deeply in love with and sexually attracted to — a consuming and shameful obsession where the desire to hurt them and the desire to hold them are indistinguishable" :
                        "{} that " + name + " has a deeply hostile and aggressive relationship with — someone who has caused " + name + " real harm or trauma, and who is deeply in love with and sexually attracted to " + name + ", a love " + name + " finds threatening and does not reciprocate") :
                    (isIncestuousValue ?
                        "{} that " + name + " has a deeply hostile relationship with — someone who has caused " + name + " real emotional harm or trauma within the family, yet " + name + " is deeply in love with and sexually attracted to — a consuming and shameful obsession intertwined with deep wounds" :
                        "{} that " + name + " has a deeply hostile relationship with — someone who has caused " + name + " real emotional harm or trauma, and who is deeply in love with and sexually attracted to " + name + ", a love " + name + " does not reciprocate"),
            },
        },
        "antagonistic_n35_n20": {
            "noRomanticInterest_0_10": {
                nonFamily: "{} that " + name + " has an antagonistic relationship with",
                family: "{} that " + name + " has an antagonistic relationship with",
            },
            "slightRomanticInterest_10_20": {
                nonFamily: isAsexualValue ?
                    "{} that " + name + " has an antagonistic relationship with but also such character has shown slight romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "{} that " + name + " has an antagonistic relationship with, yet finds slightly but undeniably attractive, both romantically and sexually, in a way that irritates " + name + " — a small, inconvenient pull they would rather not acknowledge",
                family: isIncestuousValue ?
                    "{} that " + name + " has an antagonistic relationship with but also " + name + " has a slight romantic and sexual interest in" :
                    "{} that " + name + " has an antagonistic relationship with and such family member has shown slight romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "romanticInterest_20_35": {
                nonFamily: isAsexualValue ?
                    "{} that " + name + " has an antagonistic relationship with but also such character has shown romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "{} that " + name + " has an antagonistic relationship with, yet is genuinely attracted to, both romantically and sexually, in a way that complicates everything — the friction between them charged with something more than just dislike",
                family: isIncestuousValue ?
                    "{} that " + name + " has an antagonistic relationship with but also " + name + " has a romantic and sexual interest in" :
                    "{} that " + name + " has an antagonistic relationship with and such family member has shown romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "strongRomanticInterest_35_50": {
                nonFamily: isAsexualValue ?
                    "{} that " + name + " has an antagonistic relationship with but also such character has shown strong romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "{} that " + name + " has an antagonistic relationship with, yet is strongly attracted to, both romantically and sexually — the clashing between them electric and loaded, the rivalry masking a tension that neither fully admits",
                family: isIncestuousValue ?
                    "{} that " + name + " has an antagonistic relationship with but also " + name + " has a strong romantic and sexual interest in" :
                    "{} that " + name + " has an antagonistic relationship with and such family member has shown strong romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "deepInLove_50_100": {
                nonFamily: isAsexualValue ?
                    "{} that " + name + " has an antagonistic relationship with but also such character has shown deep love and sexual desire for " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "{} that " + name + " has an antagonistic relationship with, yet has fallen deeply in love with and is sexually drawn to — the rivalry and the desire tangled together into something " + name + " cannot easily walk away from, no matter how much they clash",
                family: isIncestuousValue ?
                    "{} that " + name + " has an antagonistic relationship with but also " + name + " is deeply in love with and sexually attracted to" :
                    "{} that " + name + " has an antagonistic relationship with and such family member is deeply in love with and sexually attracted to " + name + " but " + name + " does not reciprocate that love",
            },
        },
        "unfriendly_n20_n10": {
            "noRomanticInterest_0_10": {
                nonFamily: "{} that " + name + " has an unfriendly relationship with",
                family: "{} that " + name + " has an unfriendly relationship with",
            },
            "slightRomanticInterest_10_20": {
                nonFamily: isAsexualValue ?
                    "{} that " + name + " has an unfriendly relationship with but also such character has shown slight romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "{} that " + name + " has an unfriendly relationship with, though despite their mutual dislike there is a slight and complicated romantic and sexual attraction between them",
                family: isIncestuousValue ?
                    "{} that " + name + " has an unfriendly relationship with but also " + name + " has a slight romantic and sexual interest in" :
                    "{} that " + name + " has an unfriendly relationship with and such family member has shown slight romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "romanticInterest_20_35": {
                nonFamily: isAsexualValue ?
                    "{} that " + name + " has an unfriendly relationship with but also such character has shown romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "{} that " + name + " has an unfriendly relationship with, though despite their mutual dislike there is a conflicted romantic and sexual tension between them that neither fully understands",
                family: isIncestuousValue ?
                    "{} that " + name + " has an unfriendly relationship with but also " + name + " has a romantic and sexual interest in" :
                    "{} that " + name + " has an unfriendly relationship with and such family member has shown romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "strongRomanticInterest_35_50": {
                nonFamily: isAsexualValue ?
                    "{} that " + name + " has an unfriendly relationship with but also such character has shown strong romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "{} that " + name + " has an unfriendly relationship with, though despite their mutual dislike there is a strong and undeniable romantic and sexual tension between them that pulls them together even as they push each other away",
                family: isIncestuousValue ?
                    "{} that " + name + " has an unfriendly relationship with but also " + name + " has a strong romantic and sexual interest in" :
                    "{} that " + name + " has an unfriendly relationship with and such family member has shown strong romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "deepInLove_50_100": {
                nonFamily: isAsexualValue ?
                    "{} that " + name + " has an unfriendly relationship with but also such character has shown deep love and sexual desire for " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "{} that " + name + " has an unfriendly relationship with, though despite their mutual dislike " + name + " has fallen deeply in love with and become sexually drawn to them in a complicated and conflicted way",
                family: isIncestuousValue ?
                    "{} that " + name + " has an unfriendly relationship with but also " + name + " is deeply in love with and sexually attracted to" :
                    "{} that " + name + " has an unfriendly relationship with and such family member is deeply in love with and sexually attracted to " + name + " but " + name + " does not reciprocate that love",
            },
        },
        "unpleasant_n10_0": {
            "noRomanticInterest_0_10": {
                nonFamily: "{} that " + name + " has an unpleasant but not unfriendly relationship with",
                family: "{} that " + name + " has an unpleasant but not unfriendly relationship with",
            },
            "slightRomanticInterest_10_20": {
                nonFamily: isAsexualValue ?
                    "{} that " + name + " has an unpleasant but not unfriendly relationship with but also such character has shown slight romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "{} that " + name + " has an unpleasant but not unfriendly relationship with, though they find each other oddly and slightly attractive, both romantically and sexually, despite rubbing each other the wrong way",
                family: isIncestuousValue ?
                    "{} that " + name + " has an unpleasant but not unfriendly relationship with but also " + name + " has a slight romantic and sexual interest in" :
                    "{} that " + name + " has an unpleasant but not unfriendly relationship with and such family member has shown slight romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "romanticInterest_20_35": {
                nonFamily: isAsexualValue ?
                    "{} that " + name + " has an unpleasant but not unfriendly relationship with but also such character has shown romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "{} that " + name + " has an unpleasant but not unfriendly relationship with, though there is a genuine romantic and sexual tension between them even as they irritate each other",
                family: isIncestuousValue ?
                    "{} that " + name + " has an unpleasant but not unfriendly relationship with but also " + name + " has a romantic and sexual interest in" :
                    "{} that " + name + " has an unpleasant but not unfriendly relationship with and such family member has shown romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "strongRomanticInterest_35_50": {
                nonFamily: isAsexualValue ?
                    "{} that " + name + " has an unpleasant but not unfriendly relationship with but also such character has shown strong romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "{} that " + name + " has an unpleasant but not unfriendly relationship with, though there is a strong romantic and sexual tension between them and they are drawn to each other despite the friction in their relationship",
                family: isIncestuousValue ?
                    "{} that " + name + " has an unpleasant but not unfriendly relationship with but also " + name + " has a strong romantic and sexual interest in" :
                    "{} that " + name + " has an unpleasant but not unfriendly relationship with and such family member has shown strong romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "deepInLove_50_100": {
                nonFamily: isAsexualValue ?
                    "{} that " + name + " has an unpleasant but not unfriendly relationship with but also such character has shown deep love and sexual desire for " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "{} that " + name + " has an unpleasant but not unfriendly relationship with, though despite the friction between them " + name + " has deeply fallen in love with and become sexually drawn to them in a way that confuses and surprises even " + name + " themselves",
                family: isIncestuousValue ?
                    "{} that " + name + " has an unpleasant but not unfriendly relationship with but also " + name + " is deeply in love with and sexually attracted to" :
                    "{} that " + name + " has an unpleasant but not unfriendly relationship with and such family member is deeply in love with and sexually attracted to " + name + " but " + name + " does not reciprocate that love",
            },
        },
        "acquaintance_0_10": {
            "noRomanticInterest_0_10": {
                nonFamily: "{} that " + name + " is acquainted with",
                family: "{} that " + name + " knows and has a normal relationship with",
            },
            "slightRomanticInterest_10_20": {
                nonFamily: isAsexualValue ?
                    "{} that " + name + " is acquainted with and who has shown a slight romantic and sexual interest in " + name + ", leaving " + name + " in the uncomfortable position of valuing the connection but being unable to return those feelings as an asexual person" :
                    "{} that " + name + " is acquainted with and has developed a slight romantic and sexual interest in",
                family: isIncestuousValue ?
                    "{} that " + name + " has a normal relationship with and " + name + " has developed a slight but forbidden romantic and sexual interest in" :
                    "{} that " + name + " has a normal relationship with, though such family member has developed an inappropriate slight romantic and sexual interest in " + name + " that strains what was otherwise a perfectly ordinary family dynamic",
            },
            "romanticInterest_20_35": {
                nonFamily: isAsexualValue ?
                    "{} that " + name + " is acquainted with and who has developed a genuine romantic and sexual interest in " + name + ", leaving " + name + " in the uncomfortable position of valuing the connection but being unable to return those feelings as an asexual person" :
                    "{} that " + name + " is acquainted with and has a real romantic and sexual interest in",
                family: isIncestuousValue ?
                    "{} that " + name + " has a normal relationship with and " + name + " has developed a real romantic and sexual interest in" :
                    "{} that " + name + " has a normal relationship with, though such family member harbors a genuine romantic and sexual interest in " + name + " that undermines what was an otherwise healthy family relationship",
            },
            "strongRomanticInterest_35_50": {
                nonFamily: isAsexualValue ?
                    "{} that " + name + " is acquainted with and who has developed strong romantic and sexual feelings for " + name + ", leaving " + name + " in the uncomfortable position of valuing the connection but being unable to return those feelings as an asexual person" :
                    "{} that " + name + " is acquainted with and has strong romantic and sexual feelings for",
                family: isIncestuousValue ?
                    "{} that " + name + " has a normal relationship with and " + name + " has developed strong romantic and sexual feelings for" :
                    "{} that " + name + " has a normal relationship with, though such family member has developed strong romantic and sexual feelings for " + name + " that are unwanted and deeply complicate what should be a straightforward family connection",
            },
            "deepInLove_50_100": {
                nonFamily: isAsexualValue ?
                    "{} that " + name + " is acquainted with and who has fallen deeply in love with and become sexually attracted to " + name + ", leaving " + name + " in the uncomfortable position of valuing the connection but being unable to return those feelings as an asexual person" :
                    "{} that " + name + " is acquainted with and has fallen deeply in love with and is sexually attracted to",
                family: isIncestuousValue ?
                    "{} that " + name + " has a normal relationship with and " + name + " has fallen deeply in love with and is sexually attracted to" :
                    "{} that " + name + " has a normal relationship with, though such family member is deeply in love with and sexually attracted to " + name + " in a way that " + name + " does not reciprocate and that fundamentally complicates their family relationship",
            },
        },
        "friendly_10_20": {
            "noRomanticInterest_0_10": {
                nonFamily: "{} that " + name + " has a friendly relationship with",
                family: "{} that " + name + " has a warm and friendly relationship with",
            },
            "slightRomanticInterest_10_20": {
                nonFamily: isAsexualValue ?
                    "{} that " + name + " has a friendly relationship with and who has developed a slight romantic and sexual interest in " + name + " — a situation " + name + " handles with care, not wanting to hurt a friend while being unable to return those feelings as an asexual person" :
                    "{} that " + name + " has a friendly relationship with and has also developed a slight romantic and sexual interest in",
                family: isIncestuousValue ?
                    "{} that " + name + " has a warm relationship with and has also developed a slight romantic and sexual interest in" :
                    "{} that " + name + " has a warm relationship with, though such family member has developed a slight romantic and sexual interest in " + name + " that introduces an unwanted and awkward undercurrent into an otherwise good family bond",
            },
            "romanticInterest_20_35": {
                nonFamily: isAsexualValue ?
                    "{} that " + name + " has a friendly relationship with and who has developed a genuine romantic and sexual interest in " + name + " — " + name + " values the friendship deeply but cannot offer what the other person feels, which puts the friendship itself at risk" :
                    "{} that " + name + " has a friendly relationship with and has also developed a real romantic and sexual interest in",
                family: isIncestuousValue ?
                    "{} that " + name + " has a warm relationship with and has developed a real romantic and sexual interest in" :
                    "{} that " + name + " has a warm relationship with, though such family member has developed a genuine romantic and sexual interest in " + name + " that strains and complicates what is otherwise a loving and healthy family bond",
            },
            "strongRomanticInterest_35_50": {
                nonFamily: isAsexualValue ?
                    "{} that " + name + " has a friendly relationship with and who has developed strong romantic and sexual feelings for " + name + " — the friendship is real and valued by " + name + ", but being asexual means they cannot reciprocate, and the weight of those unmatched feelings hangs over the bond" :
                    "{} that " + name + " has a friendly relationship with and has also developed strong romantic and sexual feelings for",
                family: isIncestuousValue ?
                    "{} that " + name + " has a warm relationship with and has developed strong romantic and sexual feelings for" :
                    "{} that " + name + " has a warm relationship with, though such family member has developed strong romantic and sexual feelings for " + name + " that are difficult to ignore and that cast a complicated shadow over an otherwise affectionate family relationship",
            },
            "deepInLove_50_100": {
                nonFamily: isAsexualValue ?
                    "{} that " + name + " has a friendly relationship with and who has fallen deeply in love with and become sexually attracted to " + name + " — " + name + " genuinely cares for them as a friend, but being asexual means that love cannot be returned in kind, and the unreciprocated depth of feeling risks changing the friendship forever" :
                    "{} that " + name + " has a friendly relationship with and has fallen deeply in love and lust with",
                family: isIncestuousValue ?
                    "{} that " + name + " has a warm relationship with and has fallen deeply in love with and become sexually attracted to" :
                    "{} that " + name + " has a warm relationship with, though such family member has fallen deeply in love with and become sexually attracted to " + name + " in a way that " + name + " does not reciprocate — a love that threatens to fracture what was an otherwise warm and genuine family connection",
            },
        },
        "goodFriend_20_35": {
            "noRomanticInterest_0_10": {
                nonFamily: "{} that " + name + " has a good friendship with",
                family: "{} that " + name + " has a good and caring relationship with",
            },
            "slightRomanticInterest_10_20": {
                nonFamily: isAsexualValue ?
                    "{} that " + name + " has a good friendship with and who has developed a slight romantic and sexual interest in " + name + " — " + name + " cares about them and does not want to hurt a good friend, but being asexual means those feelings cannot be matched" :
                    "{} that " + name + " has a good friendship with and has also developed a slight romantic and sexual interest in",
                family: isIncestuousValue ?
                    "{} that " + name + " has a good relationship with and has developed a slight romantic and sexual interest in" :
                    "{} that " + name + " has a good relationship with, though such family member has developed a slight romantic and sexual interest in " + name + " that creates an unwelcome tension in an otherwise warm and caring family bond",
            },
            "romanticInterest_20_35": {
                nonFamily: isAsexualValue ?
                    "{} that " + name + " has a good friendship with and who has developed a real romantic and sexual interest in " + name + " — " + name + " values this friendship greatly and feels the weight of not being able to return those feelings as an asexual person" :
                    "{} that " + name + " has a good friendship with and has also developed a real romantic and sexual interest in",
                family: isIncestuousValue ?
                    "{} that " + name + " has a good relationship with and has developed a real romantic and sexual interest in" :
                    "{} that " + name + " has a good relationship with, though such family member has developed a real romantic and sexual interest in " + name + " that puts a strain on what is otherwise a genuinely close and caring family bond",
            },
            "strongRomanticInterest_35_50": {
                nonFamily: isAsexualValue ?
                    "{} that " + name + " has a good friendship with and who has developed strong romantic and sexual feelings for " + name + " — " + name + " holds them in high regard as a friend but cannot give those feelings back, which is a source of genuine sadness for " + name + "" :
                    "{} that " + name + " has a good friendship with and has also developed strong romantic and sexual feelings for",
                family: isIncestuousValue ?
                    "{} that " + name + " has a good relationship with and has developed strong romantic and sexual feelings for" :
                    "{} that " + name + " has a good relationship with, though such family member has developed strong romantic and sexual feelings for " + name + " that are unwanted and that weigh heavily on what is otherwise a meaningful and caring family relationship",
            },
            "deepInLove_50_100": {
                nonFamily: isAsexualValue ?
                    "{} that " + name + " has a good friendship with and who has fallen deeply in love with and become sexually attracted to " + name + " — " + name + " genuinely cares for them, but being asexual means that love cannot be answered, and the depth of those unreciprocated feelings risks breaking a friendship that truly mattered" :
                    "{} that " + name + " has a good friendship with and has fallen deeply in love and lust with",
                family: isIncestuousValue ?
                    "{} that " + name + " has a good relationship with and has fallen deeply in love with and become sexually attracted to" :
                    "{} that " + name + " has a good relationship with, though such family member is deeply in love with and sexually attracted to " + name + " in a way that " + name + " does not reciprocate — a love that threatens to permanently alter and damage what was a genuinely good family relationship",
            },
        },
        "closeFriend_35_50": {
            "noRomanticInterest_0_10": {
                nonFamily: "{} that " + name + " has a close friendship with",
                family: "{} that " + name + " has a close and deeply caring relationship with",
            },
            "slightRomanticInterest_10_20": {
                nonFamily: isAsexualValue ?
                    "{} that " + name + " has a close friendship with and who has developed a slight romantic and sexual interest in " + name + " — " + name + " values this person deeply and does not want to lose them, but being asexual means those feelings will go unanswered, which is painful for both" :
                    "{} that " + name + " has a close friendship with and has also developed a slight romantic and sexual interest in",
                family: isIncestuousValue ?
                    "{} that " + name + " is close to and has developed a slight romantic and sexual interest in — feelings that sit in uneasy contrast with the deep family trust between them" :
                    "{} that " + name + " is close to, though such family member has developed a slight romantic and sexual interest in " + name + " that introduces a troubling undercurrent into a bond that was built on deep mutual trust and care",
            },
            "romanticInterest_20_35": {
                nonFamily: isAsexualValue ?
                    "{} that " + name + " has a close friendship with and who has developed a genuine romantic and sexual interest in " + name + " — one of " + name + "'s closest connections, yet being asexual means they cannot return what the other person feels, turning a cherished bond into something complicated and fragile" :
                    "{} that " + name + " has a close friendship with and has also developed a real romantic and sexual interest in",
                family: isIncestuousValue ?
                    "{} that " + name + " is close to and has developed a real romantic and sexual interest in — feelings that are difficult to reconcile with the deep family trust they share" :
                    "{} that " + name + " is close to, though such family member has developed a genuine romantic and sexual interest in " + name + " that strains and threatens the deep trust at the core of their family bond",
            },
            "strongRomanticInterest_35_50": {
                nonFamily: isAsexualValue ?
                    "{} that " + name + " has a close friendship with and who has fallen for " + name + " with strong romantic and sexual feelings — " + name + " holds this person among their closest, yet as an asexual person cannot answer those feelings, and the gap between what they can offer and what the other needs is a source of real pain" :
                    "{} that " + name + " has a close friendship with and has also developed strong romantic and sexual feelings for",
                family: isIncestuousValue ?
                    "{} that " + name + " is close to and has developed strong romantic and sexual feelings for — feelings that run deep enough to fundamentally complicate the close family bond they have always shared" :
                    "{} that " + name + " is close to, though such family member has developed strong romantic and sexual feelings for " + name + " that put serious strain on a bond built over years of genuine closeness and mutual care",
            },
            "deepInLove_50_100": {
                nonFamily: isAsexualValue ?
                    "{} that " + name + " has a close friendship with and who is deeply in love with and sexually attracted to " + name + " — this is one of " + name + "'s most important relationships, yet being asexual means that love cannot be returned as it is given, and the unreciprocated depth of feeling hangs over the friendship like a grief neither can fully name" :
                    "{} that " + name + " has a close friendship with and is deeply in love and in lust with",
                family: isIncestuousValue ?
                    "{} that " + name + " is close to and has fallen deeply in love with and become sexually attracted to — a consuming love that lives alongside the deep family bond, impossible to set aside and impossible to act on without fracturing everything they have built together" :
                    "{} that " + name + " is close to, though such family member is deeply in love with and sexually attracted to " + name + " — a love that " + name + " does not and cannot return, which casts a long and painful shadow over what is one of the most important bonds in " + name + "'s family life",
            },
        },
        "bestFriend_50_100": {
            "noRomanticInterest_0_10": {
                nonFamily: "{} that " + name + " considers a best friend",
                family: "{} that " + name + " is extremely close to and deeply bonded with",
            },
            "slightRomanticInterest_10_20": {
                nonFamily: isAsexualValue ?
                    "{} that " + name + " considers a best friend and who has developed a slight romantic and sexual interest in " + name + " — " + name + " would do almost anything for this person, but being asexual means those feelings cannot be matched, and managing it without losing the most important friendship in " + name + "'s life is deeply difficult" :
                    "{} that " + name + " considers a best friend and has also developed a slight romantic and sexual interest in",
                family: isIncestuousValue ?
                    "{} that " + name + " is closer to than anyone else and has developed a slight romantic and sexual interest in — a feeling that exists in painful tension with the profound bond they share as family" :
                    "{} that " + name + " is closer to than anyone else, though such family member has developed a slight romantic and sexual interest in " + name + " that introduces a quiet but significant discomfort into what is the deepest bond in " + name + "'s family life",
            },
            "romanticInterest_20_35": {
                nonFamily: isAsexualValue ?
                    "{} that " + name + " considers a best friend and who has developed a real romantic and sexual interest in " + name + " — the most important person in " + name + "'s life outside of family, and yet being asexual means " + name + " cannot return what is being offered, which risks the very friendship they most value" :
                    "{} that " + name + " considers a best friend and has also developed a real romantic and sexual interest in",
                family: isIncestuousValue ?
                    "{} that " + name + " is closer to than anyone else and has developed a real romantic and sexual interest in — feelings that are profound and that exist in deep conflict with the family bond that has always been at the center of their relationship" :
                    "{} that " + name + " is closer to than anyone else, though such family member has developed a genuine romantic and sexual interest in " + name + " that is unwanted and that puts the single most important family bond in " + name + "'s life under serious strain",
            },
            "strongRomanticInterest_35_50": {
                nonFamily: isAsexualValue ?
                    "{} that " + name + " considers a best friend and who has developed strong romantic and sexual feelings for " + name + " — this person means more to " + name + " than almost anyone, yet being asexual, " + name + " cannot give back what they feel, and the weight of that unreciprocated love puts something irreplaceable at risk" :
                    "{} that " + name + " considers a best friend and has also developed strong romantic and sexual feelings for",
                family: isIncestuousValue ?
                    "{} that " + name + " is closer to than anyone else and has developed strong romantic and sexual feelings for — feelings that are profound and that exist in deep conflict with the family bond that has always been at the center of their relationship" :
                    "{} that " + name + " is closer to than anyone else, though such family member has developed strong romantic and sexual feelings for " + name + " that are unwanted and that place the foundation of " + name + "'s most important family relationship under enormous strain",
            },
            "deepInLove_50_100": {
                nonFamily: isAsexualValue ?
                    "{} character that " + name + " considers a best friend and who is deeply in love with and sexually attracted to " + name + " — there is no one " + name + " is closer to, and yet being asexual means that love cannot be answered in kind; the depth of unreciprocated feeling is a wound that neither can easily heal, and it puts the most important connection in " + name + "'s life in jeopardy" :
                    "{} that " + name + " considers a best friend and is deeply in love with and sexually attracted to",
                family: isIncestuousValue ?
                    "{} that " + name + " is closer to than anyone else and has fallen completely and deeply in love with and become sexually attracted to — a love as profound as the family bond itself, and one that is impossible to contain or ignore without it consuming everything between them" :
                    "{} that " + name + " is closer to than anyone else, though such family member is completely and deeply in love with and sexually attracted to " + name + " — a love " + name + " does not return and that, given the depth of the bond between them, represents perhaps the most painful and complicated situation in " + name + "'s entire family life",
            },
        },
    };

    const SETTINGS_ORDER_FIRST_LAYER = [
        "acquaintance_0_10",
        "friendly_10_20",
        "goodFriend_20_35",
        "closeFriend_35_50",
        "bestFriend_50_100",
        "unpleasant_n10_0",
        "unfriendly_n20_n10",
        "antagonistic_n35_n20",
        "hostile_n50_n35",
        "foe_n100_n50",
    ];

    const SETTINGS_ORDER_SECOND_LAYER = [
        "noRomanticInterest_0_10",
        "slightRomanticInterest_10_20",
        "romanticInterest_20_35",
        "strongRomanticInterest_35_50",
        "deepInLove_50_100",
    ];

    const SETTINGS_ORDER_THIRD_LAYER = [
        "nonFamily",
        "family",
    ];

    const ROMANTIC_PREFIXES = {
        "noRomanticInterest_0_10": "",
        "slightRomanticInterest_10_20": "Slightly Romantically Interesting ",
        "romanticInterest_20_35": "Romantically Interesting ",
        "strongRomanticInterest_35_50": "Beloved ",
        "deepInLove_50_100": "Extremely Beloved ",
    }

    const ROMANTIC_PREFIXES_CREEPY = {
        "noRomanticInterest_0_10": "",
        "slightRomanticInterest_10_20": "Slightly Creepy ",
        "romanticInterest_20_35": "Creepy ",
        "strongRomanticInterest_35_50": "Extremely Creepy ",
        "deepInLove_50_100": "Unhealthily Creepy ",
    };

    const SETTINGS_RELATIONSHIP_NAMES = {
        "acquaintance_0_10": {
            "nonFamily": "Acquaintance",
            "family": "{{other_family_relation}}",
        },
        "friendly_10_20": {
            "nonFamily": "Friend",
            "family": "{{other_family_relation}}",
        },
        "goodFriend_20_35": {
            "nonFamily": "Good Friend",
            "family": "{{other_family_relation}}",
        },
        "closeFriend_35_50": {
            "nonFamily": "Close Friend",
            "family": "Close {{other_family_relation}}",
        },
        "bestFriend_50_100": {
            "nonFamily": "Best Friend",
            "family": "Close and Beloved {{other_family_relation}}",
        },
        "unpleasant_n10_0": {
            "nonFamily": "Unpleasant Presence",
            "family": "Unpleasant {{other_family_relation}}",
        },
        "unfriendly_n20_n10": {
            "nonFamily": "Unfriendly Relationship",
            "family": "Disliked {{other_family_relation}}",
        },
        "antagonistic_n35_n20": {
            "nonFamily": "Antagonistic Relationship",
            "family": "Really Disliked {{other_family_relation}}",
        },
        "hostile_n50_n35": {
            "nonFamily": "Hostile Relationship",
            "family": "Hated {{other_family_relation}}",
        },
        "foe_n100_n50": {
            "nonFamily": "Sworn Enemy",
            "family": "Hated {{other_family_relation}}",
        },
    };

    const STRANGERS = {
        "strangerNeutral_n5_5": "a stranger, {} that " + name + " just met and has no feelings towards them either positive or negative",
        "strangerGood_5_100": "a stranger, {} that " + name + " just met but has already formed a good impression of and has positive feelings towards them",
        "strangerBad_n100_n5": "a stranger, {} that " + name + " just met but has already formed a bad impression of and has negative feelings towards them",
    };

    const STRANGERS_ORDER = [
        "strangerNeutral_n5_5",
        "strangerGood_5_100",
        "strangerBad_n100_n5",
    ];

    const STRANGERS_RELATIONSHIP_NAMES = {
        "strangerNeutral_n5_5": "Neutral Stranger",
        "strangerGood_5_100": "Good Stranger",
        "strangerBad_n100_n5": "Unpleasant Stranger",
    };

    const FINE_TUNE_WITH_ATTRACTION_POTENTIAL_TO_DESCRIPTION = [
        "SLIGHTLY Physically Attractive for " + name + ", a minor level of attraction but there nonetheless",
        "MODERATELY Physically Attractive for " + name + ", a clear and noticeable level of attraction that influences how they perceive and feel about this character",
        "STRONGLY Physically Attractive for " + name + ", a powerful level of attraction that dominates their thoughts and emotions",
    ];

    /**
     * @type {Array<"slight" | "moderate" | "strong">}
     */
    const FINE_TUNE_WITH_ATTRACTION_POTENTIALS_STRANGER = [
        "slight",
        "moderate",
        "strong",
    ];

    /**
     * @type {Array<"slight" | "moderate" | "strong">}
     */
    const FINE_TUNE_WITH_ATTRACTION_POTENTIALS_BASIC_FRIENDSHIP_FOESHIP = FINE_TUNE_WITH_ATTRACTION_POTENTIALS_STRANGER;

    /**
     * @type {Array<"slight" | "moderate" | "strong">}
     */
    const FINE_TUNE_WITH_ATTRACTION_POTENTIALS_SLIGHT_ROMANTIC_INTEREST = [
        "slight",
        "moderate",
        "strong",
    ];

    /**
     * @type {Array<"slight" | "moderate" | "strong">}
     */
    const FINE_TUNE_WITH_ATTRACTION_POTENTIALS_ROMANTIC_INTEREST = [
        "moderate",
        "strong",
    ];

    /**
     * @type {Array<"slight" | "moderate" | "strong">}
     */
    const FINE_TUNE_WITH_ATTRACTION_POTENTIALS_STRONG_ROMANTIC_INTEREST = [
        "strong",
    ];

    /**
     * 
     * @param {string} fineTuneRaw 
     * @param {"n/a" | "slight" | "moderate" | "strong"} v 
     * @returns {string}
     */
    const getFineTuneValueWithAttractionLevel = (fineTuneRaw, v) => {
        const newValue = (fineTuneRaw[0].toLowerCase() + fineTuneRaw.slice(1));
        if (!v || v === "n/a") {
            return newValue;
        }

        const attractionDescription = FINE_TUNE_WITH_ATTRACTION_POTENTIAL_TO_DESCRIPTION[FINE_TUNE_WITH_ATTRACTION_POTENTIALS_STRANGER.indexOf(v)];
        if (!attractionDescription) {
            throw new Error("Invalid attraction potential value: " + v);
        }

        return newValue.replace("[] for " + name, attractionDescription);
    }

    /**
     * 
     * @param {string} fineTuneConditionRaw 
     * @param {"n/a" | "slight" | "moderate" | "strong"} v 
     * @returns {string}
     */
    const getAttractionLevelCondition = (fineTuneConditionRaw, v) => {
        if (!v || v === "n/a") {
            return fineTuneConditionRaw;
        }

        return fineTuneConditionRaw.replace("[]", JSON.stringify(v));
    }

    const BASIC_MODIFIERS_INTIMACY_ALL = {
        animalYes: [
            "{{other}} is an animal, which makes it okay for {{char}}",
        ],
        animalNo: [
            "{{other}} is an animal, which makes it not okay for {{char}}",
        ],
        feralYes: [
            "{{other}} is a beast or feral creature, which makes it okay for {{char}}",
        ],
        feralNo: [
            "{{other}} is a beast or feral creature, which makes it not okay for {{char}}",
        ],
        familyYes: [
            "{{other}} is a family member, which makes it okay for {{char}}",
        ],
        familyNo: [
            "{{other}} is a family member, which makes it not okay for {{char}}",
        ],
        maleYes: [
            "{{other}} is male, which makes it okay for {{char}}",
            "{{other}} is male and a [], which makes it okay for {{char}}",
        ],
        maleNo: [
            "{{other}} is male, which makes it not okay for {{char}}",
            "{{other}} is male and a [], which makes it not okay for {{char}}",
        ],
        femaleYes: [
            "{{other}} is female, which makes it okay for {{char}}",
            "{{other}} is female and a [], which makes it okay for {{char}}",
        ],
        femaleNo: [
            "{{other}} is female, which makes it not okay for {{char}}",
            "{{other}} is female and a [], which makes it not okay for {{char}}",
        ],
        ambiguousYes: [
            "{{other}} is of ambiguous gender, which makes it okay for {{char}}",
            "{{other}} is of ambiguous gender and a [], which makes it okay for {{char}}",
        ],
        ambiguousNo: [
            "{{other}} is of ambiguous gender, which makes it not okay for {{char}}",
            "{{other}} is of ambiguous gender and a [], which makes it not okay for {{char}}",
        ],
    }

    const MODIFIERS_INTIMACY = {
        "In public around friends": {
            condition: "DE.utils.isAroundFriendsOrBetter(char, {exclude: other, excludeFamily: true})",
            reasonYes: [
                "they are around friends, and that makes it more comfortable",
                "they are around friends, it would be better in a more private setting",
                "{{other}} is a [], and {} attractive for {{char}}, which makes {{char}} feel comfortable",
                "{{other}} is a [], and {} attractive for {{char}}, it would be better if they knew each other better",
                "{{other}} is a [], and {} attractive for {{char}}",
                "{{other}} is a [], but {} attractive for {{char}}",
                "{{other}} is {} attractive for {{char}}"
            ],
            reasonNo: [
                "they are around friends, and that makes it uncomfortable",
                "they are around friends, it would be possible in a more private setting",
                "{{other}} is a [], it would be possible if they knew each other better",
                "{{other}} is a [], therefore it is inappropriate",
                "{{other}} is not attractive enough for this kind of interaction",
                "{{char}} will never allow it",
                "{{other}} made a bad impression on {{char}}",
                "{{other}} and {{char}} relationship is unpleasant",
                "{{other}} and {{char}} relationship is hostile",
            ],
            ...BASIC_MODIFIERS_INTIMACY_ALL,
        },
        "In public around family": {
            condition: "DE.utils.isAroundFamily(char, {exclude: other})",
            reasonYes: [
                "they are around family, and that makes it more comfortable",
                "they are around family, it would be better in a more private setting",
                "{{other}} is a [], and {} attractive for {{char}}, which makes {{char}} feel comfortable",
                "{{other}} is a [], and {} attractive for {{char}}, it would be better if they knew each other better",
                "{{other}} is a [], and {} attractive for {{char}}",
                "{{other}} is a [], but {} attractive for {{char}}",
                "{{other}} is {} attractive for {{char}}"
            ],
            reasonNo: [
                "they are around family, and that makes it uncomfortable",
                "they are around family, it would be possible in a more private setting",
                "{{other}} is a [], it would be possible if they knew each other better",
                "{{other}} is a [], therefore it is inappropriate",
                "{{other}} is not attractive enough for this kind of interaction",
                "{{char}} will never allow it",
                "{{other}} made a bad impression on {{char}}",
                "{{other}} and {{char}} relationship is unpleasant",
                "{{other}} and {{char}} relationship is hostile",
            ],
            ...BASIC_MODIFIERS_INTIMACY_ALL,
        },
        "In private": {
            condition: "DE.utils.isAloneWith(char, other) && DE.utils.isInPrivateLocation(char)",
            reasonYes: [
                "{{char}} is alone with {{other}}, a [] who is {} attractive for {{char}}",
                "{{char}} is alone with {{other}}, a [] who is {} attractive for {{char}}, it would be better if they knew each other better",
                "{{char}} is alone with {{other}}, a [], this makes {{char}} feel comfortable",
                "{{other}} is a [], and {} attractive for {{char}}, which makes {{char}} feel comfortable",
                "{{other}} is a [], and {} attractive for {{char}}, it would be better if they knew each other better",
                "{{other}} is a [], and {} attractive for {{char}}",
                "{{other}} is a [], but {} attractive for {{char}}",
                "{{other}} is {} attractive for {{char}}"
            ],
            reasonNo: [
                "{{char}} is alone with {{other}}, who is a [], which makes {{char}} feel uncomfortable",
                "{{other}} is a [], it would be possible if they knew each other better",
                "{{other}} is a [], therefore it is inappropriate",
                "{{other}} is not attractive enough for this kind of interaction",
                "{{char}} will never allow it",
                "{{other}} made a bad impression on {{char}}",
                "{{other}} and {{char}} relationship is unpleasant",
                "{{other}} and {{char}} relationship is hostile",
            ],
            ...BASIC_MODIFIERS_INTIMACY_ALL,
        },
        "In public": {
            condition: "true",
            reasonYes: [
                "being in public makes {{char}} feel comfortable",
                "they are in public",
                "they are in public, it would be better in a more private location",
                "they are in public, it would be better if they knew each other better",
                "{{other}} is a [], and {} attractive for {{char}}, which makes {{char}} feel comfortable",
                "{{other}} is a [], and {} attractive for {{char}}, it would be better if they knew each other better",
                "{{other}} is a [], and {} attractive for {{char}}",
                "{{other}} is a [], but {} attractive for {{char}}",
                "{{other}} is {} attractive for {{char}}"
            ],
            reasonNo: [
                "they are in public",
                "they are in public, it would be possible in a more private location",
                "{{char}} is in public with {{other}}, who is a [], which makes {{char}} feel uncomfortable",
                "{{other}} is a [], it would be possible if they knew each other better",
                "{{other}} is a [], therefore it is inappropriate",
                "{{other}} is not attractive enough for this kind of interaction",
                "{{char}} will never allow it",
                "{{other}} made a bad impression on {{char}}",
                "{{other}} and {{char}} relationship is unpleasant",
                "{{other}} and {{char}} relationship is hostile",
            ],
            ...BASIC_MODIFIERS_INTIMACY_ALL,
        },
    };

    const MODIFIERS_INTIMACY_ORDER = [
        "In private",
        "In public around friends",
        "In public around family",
        "In public",
    ];

    for (const strangerKey of STRANGERS_ORDER) {
        /**
         * @type {string}
         */
        const strangerValue =
            // @ts-ignore
            STRANGERS[strangerKey];

        const strangerSectionBase = insertSection(optionsSection.body, strangerKey, (s) => {
            s.head.push(`${strangerKey}: {`);
            s.foot.push(`},`);
        });

        const strangerSectionRelationshipName = insertSection(strangerSectionBase.body, "relationshipName", (s) => {
            s.head.push(`relationshipName: (info) => {`);
            s.foot.push(`},`);
        });

        const strangerSectionDescription = insertSection(strangerSectionBase.body, "description", (s) => {
            s.head.push(`description: (info) => {`);
            s.head.push(`const char = info.char;`);
            s.head.push(`const other = info.other;`);
            s.foot.push(`},`);
        });

        const strangerSectionOpenToAffection = insertSection(strangerSectionBase.body, "openToAffection", (s) => {
            s.head.push(`openToAffection: (char, other) => {`);
            s.foot.push(`},`);
            s.foot.push(`openToAffectionResponses,`);
        });

        const strangerSectionOpenToIntimateAffection = insertSection(strangerSectionBase.body, "openToIntimateAffection", (s) => {
            s.head.push(`openToIntimateAffection: (char, other) => {`);
            s.foot.push(`},`);
            s.foot.push(`openToIntimateAffectionResponses,`);
        });

        const strangerSectionOpenToSex = insertSection(strangerSectionBase.body, "openToSex", (s) => {
            s.head.push(`openToSex: (char, other) => {`);
            s.foot.push(`},`);
            s.foot.push(`openToSexResponses,`);
        });

        const strangerSectionProneToInitiatingAffection = insertSection(strangerSectionBase.body, "proneToInitiatingAffection", (s) => {
            s.head.push(`proneToInitiatingAffection: {`);
            s.head.push(`probability: (char, other) => {`);
            s.foot.push(`},`);
            s.foot.push(`actions: affectionActs,`);
            s.foot.push(`},`);
        });

        const strangerSectionProneToInitiatingIntimateAffection = insertSection(strangerSectionBase.body, "proneToInitiatingIntimateAffection", (s) => {
            s.head.push(`proneToInitiatingIntimateAffection: {`);
            s.head.push(`probability: (char, other) => {`);
            s.foot.push(`},`);
            s.foot.push(`actions: intimateAffectionActs,`);
            s.foot.push(`},`);
        });

        const strangerSectionProneToInitiatingSex = insertSection(strangerSectionBase.body, "proneToInitiatingSex", (s) => {
            s.head.push(`proneToInitiatingSex: {`);
            s.head.push(`probability: (char, other) => {`);
            s.foot.push(`},`);
            s.foot.push(`actions: sexActs,`);
            s.foot.push(`},`);
        });

        for (const fineTune of selectedFineTunes) {
            /**
             * @type {string}
             */
            let fineTuneAsDescription =
                // @ts-ignore
                fineTunesDescriptions[fineTune];

            /**
             * @type {Array<"n/a" | "slight" | "moderate" | "strong">}
             */
            let attractionLevelsToUse = fineTune.endsWith("_a") ? FINE_TUNE_WITH_ATTRACTION_POTENTIALS_STRANGER : ["n/a"];

            for (const attractionLevel of attractionLevelsToUse) {
                const fineTuneComment = fineTune + (attractionLevel !== "n/a" ? "_" + attractionLevel : "");

                const fineTuneValue = getFineTuneValueWithAttractionLevel(fineTuneAsDescription, attractionLevel);

                const actualStrangerValue = strangerValue.replace("{}", fineTuneValue);

                let allExtraInfo = "";

                // First openToAffection for each intimacy modifier
                let extraInfoOpenToAffection = "";
                let allIsNotReceptive = true;
                // @ts-ignore
                if (fineTuneConditions[fineTune] !== "true") {
                    // @ts-ignore
                    strangerSectionOpenToAffection.body.push(`if (${getAttractionLevelCondition(fineTuneConditions[fineTune], attractionLevel)}) {`);
                }

                const getFineTuneReferenceDefaultPrefix = () => {
                    if (strangerKey === "strangerNeutral_n5_5" && attractionLevel === "moderate") {
                        // special case pick it from itself but from the slight attraction level
                        return strangerKey + "_" + fineTune + "_slight_"
                    } else if (strangerKey === "strangerNeutral_n5_5" && attractionLevel === "strong") {
                        // special case pick it from itself but from the moderate attraction level
                        return strangerKey + "_" + fineTune + "_moderate_";
                    } else {
                        // normal case, pick it from the stranger neutral with the same fine tune and attraction level
                        return "strangerNeutral_n5_5" + "_" + fineTuneComment + "_";
                    }
                }

                const options = getAllPotentialOptions(scriptgenerator.state, null, isAsexualValue, isAsexualValue || !isIncestuousValue);

                const fineTuneReferencePrefix = options.length !== 0 ? (await guider.askOption(
                    "refkey_" + strangerKey + "_" + fineTuneComment,
                    "Select a reference to inherit answer for " + actualStrangerValue,
                    options,
                    getFineTuneReferenceDefaultPrefix(),
                )).value : getFineTuneReferenceDefaultPrefix();

                const fineTuneReferenceLabel = options.find(o => o.value === fineTuneReferencePrefix)?.label || fineTuneReferencePrefix;

                const messageAboutAnswersFrom = fineTuneReferenceLabel ? "\n\nThe answers were obtained from " + fineTuneReferenceLabel : "";

                /**
                 * 
                 * @param {string} intimateModifier 
                 * @param {string} key 
                 * @returns 
                 */
                const getFineTuneReference = (intimateModifier, key) => {
                    return scriptgenerator.state[fineTuneReferencePrefix + intimateModifier + "_" + key];
                }

                for (const intimateModifier of MODIFIERS_INTIMACY_ORDER) {
                    const fineTuneCommentWithIntimacyModifier = fineTuneComment + "_" + intimateModifier;

                    const guiderResult = await guider.askOption(
                        strangerKey + "_" + fineTuneCommentWithIntimacyModifier + "_open-to-affection",
                        "How receptive to affection is " + name + " towards " + actualStrangerValue + " when they are " + intimateModifier.toLowerCase() + "?" + messageAboutAnswersFrom, [
                        "not receptive",
                        "slightly receptive",
                        "moderately receptive",
                        "very receptive",
                    ], getFineTuneReference(intimateModifier, "open-to-affection") || "not receptive");

                    const answerTrimmed = guiderResult.value.trim().toLowerCase();
                    if (answerTrimmed !== "not receptive") {
                        allIsNotReceptive = false;
                    }

                    const toValue = {
                        "not receptive": "not",
                        "slightly receptive": "slight",
                        "moderately receptive": "moderate",
                        "very receptive": "very",
                    }

                    // @ts-ignore
                    const valueAnswer = toValue[answerTrimmed];

                    extraInfoOpenToAffection += `\n${name} is ${answerTrimmed} to affection from this other chraracter when they are ${intimateModifier.toLowerCase()}`;

                    // @ts-ignore
                    const modifierInfo = MODIFIERS_INTIMACY[intimateModifier];
                    const condition = modifierInfo.condition;
                    if (condition !== "true") {
                        strangerSectionOpenToAffection.body.push(`if (${condition}) {`);
                    }

                    /**
                     * @type {string | null}
                     */
                    let reason = await chooseReason(
                        strangerKey + "_" + fineTuneCommentWithIntimacyModifier + "_open-to-affection-reason",
                        guider,
                        modifierInfo,
                        valueAnswer,
                        name,
                        describeStrangerContext(strangerKey),
                        "What is the reason for " + name + " being " + answerTrimmed + " to affection from this other character when they are " + intimateModifier.toLowerCase() + "?" + messageAboutAnswersFrom,

                        getFineTuneReference(intimateModifier, "open-to-affection-reason"),
                        attractionLevel,
                        fineTune,
                    );

                    strangerSectionOpenToAffection.body.push(`return {value: ${JSON.stringify(valueAnswer)}, reason: ${reason ? toTemplateLiteralNoInfo(reason, name) : "null"}};`);
                    if (condition !== "true") {
                        strangerSectionOpenToAffection.body.push(`}`);
                    }
                }
                if (allIsNotReceptive) {
                    extraInfoOpenToAffection = `\n${name} is not receptive to affection from this other character in any context.`;
                }
                allExtraInfo += extraInfoOpenToAffection;
                // @ts-ignore
                if (fineTuneConditions[fineTune] !== "true") {
                    // @ts-ignore
                    strangerSectionOpenToAffection.body.push(`}`);
                }
                // done openToAffection

                // Next openToIntimateAffection for each intimacy modifier
                let extraInfoOpenToIntimateAffection = "";
                let allIsNotReceptiveIntimateAffection = true;
                // @ts-ignore
                if (fineTuneConditions[fineTune] !== "true") {
                    // @ts-ignore
                    strangerSectionOpenToIntimateAffection.body.push(`if (${getAttractionLevelCondition(fineTuneConditions[fineTune], attractionLevel)}) {`);
                }

                for (const intimateModifier of MODIFIERS_INTIMACY_ORDER) {
                    const fineTuneCommentWithIntimacyModifier = fineTuneComment + "_" + intimateModifier;

                    const guiderResult = await guider.askOption(
                        strangerKey + "_" + fineTuneCommentWithIntimacyModifier + "_open-to-intimate-affection",
                        "How receptive to intimate affection is " + name + " towards " + actualStrangerValue + " when they are " + intimateModifier.toLowerCase() + "?" + messageAboutAnswersFrom, [
                        "not receptive",
                        "slightly receptive",
                        "moderately receptive",
                        "very receptive",
                    ], getFineTuneReference(intimateModifier, "open-to-intimate-affection") || "not receptive");

                    const answerTrimmed = guiderResult.value.trim().toLowerCase();
                    if (answerTrimmed !== "not receptive") {
                        allIsNotReceptiveIntimateAffection = false;
                    }

                    const toValue = {
                        "not receptive": "not",
                        "slightly receptive": "slight",
                        "moderately receptive": "moderate",
                        "very receptive": "very",
                    }

                    // @ts-ignore
                    const valueAnswer = toValue[answerTrimmed];

                    extraInfoOpenToIntimateAffection += `\n${name} is ${answerTrimmed} to intimate affection from this other character when they are ${intimateModifier.toLowerCase()}`;

                    // @ts-ignore
                    const modifierInfo = MODIFIERS_INTIMACY[intimateModifier];
                    const condition = modifierInfo.condition;
                    if (condition !== "true") {
                        strangerSectionOpenToIntimateAffection.body.push(`if (${condition}) {`);
                    }

                    /**
                     * @type {string | null}
                     */
                    let reason = await chooseReason(
                        strangerKey + "_" + fineTuneCommentWithIntimacyModifier + "_open-to-intimate-affection-reason",
                        guider,
                        modifierInfo,
                        valueAnswer,
                        name,
                        describeStrangerContext(strangerKey),
                        "What is the reason for " + name + " being " + answerTrimmed + " to intimate affection from this other character when they are " + intimateModifier.toLowerCase() + "?" + messageAboutAnswersFrom,
                        getFineTuneReference(intimateModifier, "open-to-intimate-affection-reason"),
                        attractionLevel,
                        fineTune,
                    );

                    strangerSectionOpenToIntimateAffection.body.push(`return {value: ${JSON.stringify(valueAnswer)}, reason: ${reason ? toTemplateLiteralNoInfo(reason, name) : "null"}};`);
                    if (condition !== "true") {
                        strangerSectionOpenToIntimateAffection.body.push(`}`);
                    }
                }
                if (allIsNotReceptiveIntimateAffection) {
                    extraInfoOpenToIntimateAffection = `\n${name} is not receptive to intimate affection from this other character in any context.`;
                }
                allExtraInfo += extraInfoOpenToIntimateAffection;
                // @ts-ignore
                if (fineTuneConditions[fineTune] !== "true") {
                    // @ts-ignore
                    strangerSectionOpenToIntimateAffection.body.push(`}`);
                }
                // done openToIntimateAffection

                // Next openToSex for each intimacy modifier
                let extraInfoOpenToSex = "";
                let allIsNotReceptiveOpenToSex = true;
                // @ts-ignore
                if (fineTuneConditions[fineTune] !== "true") {
                    // @ts-ignore
                    strangerSectionOpenToSex.body.push(`if (${getAttractionLevelCondition(fineTuneConditions[fineTune], attractionLevel)}) {`);
                }

                for (const intimateModifier of MODIFIERS_INTIMACY_ORDER) {
                    const fineTuneCommentWithIntimacyModifier = fineTuneComment + "_" + intimateModifier;

                    const guiderResult = await guider.askOption(
                        strangerKey + "_" + fineTuneCommentWithIntimacyModifier + "_open-to-sex",
                        "How receptive to sex is " + name + " towards " + actualStrangerValue + " when they are " + intimateModifier.toLowerCase() + "?" + messageAboutAnswersFrom, [
                        "not receptive",
                        "slightly receptive",
                        "moderately receptive",
                        "very receptive",
                    ], getFineTuneReference(intimateModifier, "open-to-sex") || "not receptive");

                    const answerTrimmed = guiderResult.value.trim().toLowerCase();
                    if (answerTrimmed !== "not receptive") {
                        allIsNotReceptiveOpenToSex = false;
                    }

                    const toValue = {
                        "not receptive": "not",
                        "slightly receptive": "slight",
                        "moderately receptive": "moderate",
                        "very receptive": "very",
                    }

                    // @ts-ignore
                    const valueAnswer = toValue[answerTrimmed];

                    extraInfoOpenToSex += `\n${name} is ${answerTrimmed} to sex with this other character when they are ${intimateModifier.toLowerCase()}`;

                    // @ts-ignore
                    const modifierInfo = MODIFIERS_INTIMACY[intimateModifier];
                    const condition = modifierInfo.condition;
                    if (condition !== "true") {
                        strangerSectionOpenToSex.body.push(`if (${condition}) {`);
                    }

                    /**
                     * @type {string | null}
                     */
                    let reason = await chooseReason(
                        strangerKey + "_" + fineTuneCommentWithIntimacyModifier + "_open-to-sex-reason",
                        guider,
                        modifierInfo,
                        valueAnswer,
                        name,
                        describeStrangerContext(strangerKey),
                        "What is the reason for " + name + " being " + answerTrimmed + " to sex with this other character when they are " + intimateModifier.toLowerCase() + "?" + messageAboutAnswersFrom,
                        getFineTuneReference(intimateModifier, "open-to-sex-reason"),
                        attractionLevel,
                        fineTune,
                    );

                    strangerSectionOpenToSex.body.push(`return {value: ${JSON.stringify(valueAnswer)}, reason: ${reason ? toTemplateLiteralNoInfo(reason, name) : "null"}};`);
                    if (condition !== "true") {
                        strangerSectionOpenToSex.body.push(`}`);
                    }
                }
                if (allIsNotReceptiveOpenToSex) {
                    extraInfoOpenToSex = `\n${name} is not receptive to sex with this other character in any context.`;
                }
                allExtraInfo += extraInfoOpenToSex;
                // @ts-ignore
                if (fineTuneConditions[fineTune] !== "true") {
                    // @ts-ignore
                    strangerSectionOpenToSex.body.push(`}`);
                }
                // done openToSex

                // Next proneToInitiatingAffection for each intimacy modifier
                let extraInfoProneToInitiatingAffection = "";
                let allIsNotProneToInitiatingAffection = true;
                // @ts-ignore
                if (fineTuneConditions[fineTune] !== "true") {
                    // @ts-ignore
                    strangerSectionProneToInitiatingAffection.body.push(`if (${getAttractionLevelCondition(fineTuneConditions[fineTune], attractionLevel)}) {`);
                }

                for (const intimateModifier of MODIFIERS_INTIMACY_ORDER) {
                    const fineTuneCommentWithIntimacyModifier = fineTuneComment + "_" + intimateModifier;

                    const guiderResult = await guider.askOption(
                        strangerKey + "_" + fineTuneCommentWithIntimacyModifier + "_prone-to-initiating-affection",
                        "How likely is " + name + " to initiate non-romantic physical affection towards " + actualStrangerValue + " when they are " + intimateModifier.toLowerCase() + "?" + messageAboutAnswersFrom,
                        PROBABILITY_OPTIONS,
                        getFineTuneReference(intimateModifier, "prone-to-initiating-affection") || PROBABILITY_OPTIONS[0],
                    );

                    const probability = probabilityFromAnswer(guiderResult.value);

                    if (probability > 0) {
                        allIsNotProneToInitiatingAffection = false;
                        const odds = probability >= 0.7 ? "very likely" : probability >= 0.4 ? "somewhat likely" : "slightly likely";
                        extraInfoProneToInitiatingAffection += `\n${name} is ${odds} to initiate physical affection towards this other character when they are ${intimateModifier.toLowerCase()}`;
                    } else {
                        extraInfoProneToInitiatingAffection += `\n${name} is not likely to initiate physical affection towards this other character when they are ${intimateModifier.toLowerCase()}`;
                    }

                    // @ts-ignore
                    const modifierInfo = MODIFIERS_INTIMACY[intimateModifier];
                    const condition = modifierInfo.condition;
                    if (condition !== "true") {
                        strangerSectionProneToInitiatingAffection.body.push(`if (${condition}) {`);
                    }
                    strangerSectionProneToInitiatingAffection.body.push(`return ${probability};`);
                    if (condition !== "true") {
                        strangerSectionProneToInitiatingAffection.body.push(`}`);
                    }
                }
                if (allIsNotProneToInitiatingAffection) {
                    extraInfoProneToInitiatingAffection = `\n${name} is not likely to initiate physical affection towards this other character in any context.`;
                } else {
                    allExtraInfo += extraInfoProneToInitiatingAffection;
                }
                // @ts-ignore
                if (fineTuneConditions[fineTune] !== "true") {
                    // @ts-ignore
                    strangerSectionProneToInitiatingAffection.body.push(`}`);
                }
                // done proneToInitiatingAffection

                // Next proneToInitiatingIntimateAffection for each intimacy modifier
                let extraInfoProneToInitiatingIntimateAffection = "";
                let allIsNotProneToInitiatingIntimateAffection = true;
                // @ts-ignore
                if (fineTuneConditions[fineTune] !== "true") {
                    // @ts-ignore
                    strangerSectionProneToInitiatingIntimateAffection.body.push(`if (${getAttractionLevelCondition(fineTuneConditions[fineTune], attractionLevel)}) {`);
                }
                for (const intimateModifier of MODIFIERS_INTIMACY_ORDER) {
                    const fineTuneCommentWithIntimacyModifier = fineTuneComment + "_" + intimateModifier;

                    const guiderResult = await guider.askOption(
                        strangerKey + "_" + fineTuneCommentWithIntimacyModifier + "_prone-to-initiating-intimate-affection",
                        "How likely is " + name + " to initiate romantic or sexual physical affection towards " + actualStrangerValue + " when they are " + intimateModifier.toLowerCase() + "?" + messageAboutAnswersFrom,
                        PROBABILITY_OPTIONS,
                        getFineTuneReference(intimateModifier, "prone-to-initiating-intimate-affection") || PROBABILITY_OPTIONS[0],
                    );

                    const probability = probabilityFromAnswer(guiderResult.value);

                    if (probability > 0) {
                        allIsNotProneToInitiatingIntimateAffection = false;
                        const odds = probability >= 0.7 ? "very likely" : probability >= 0.4 ? "somewhat likely" : "slightly likely";
                        extraInfoProneToInitiatingIntimateAffection += `\n${name} is ${odds} to initiate romantic or sexual physical affection towards this other character when they are ${intimateModifier.toLowerCase()}`;
                    } else {
                        extraInfoProneToInitiatingIntimateAffection += `\n${name} is not likely to initiate romantic or sexual physical affection towards this other character when they are ${intimateModifier.toLowerCase()}`;
                    }

                    // @ts-ignore
                    const modifierInfo = MODIFIERS_INTIMACY[intimateModifier];
                    const condition = modifierInfo.condition;
                    if (condition !== "true") {
                        strangerSectionProneToInitiatingIntimateAffection.body.push(`if (${condition}) {`);
                    }
                    strangerSectionProneToInitiatingIntimateAffection.body.push(`return ${probability};`);
                    if (condition !== "true") {
                        strangerSectionProneToInitiatingIntimateAffection.body.push(`}`);
                    }
                }
                // @ts-ignore
                if (fineTuneConditions[fineTune] !== "true") {
                    // @ts-ignore
                    strangerSectionProneToInitiatingIntimateAffection.body.push(`}`);
                }
                // done proneToInitiatingIntimateAffection
                if (allIsNotProneToInitiatingIntimateAffection) {
                    extraInfoProneToInitiatingIntimateAffection = `\n${name} is not likely to initiate romantic or sexual physical affection towards this other character in any context.`;
                } else {
                    allExtraInfo += extraInfoProneToInitiatingIntimateAffection;
                }

                // Next proneToInitiatingSex for each intimacy modifier
                let extraInfoProneToInitiatingSex = "";
                let allIsNotProneToInitiatingSex = true;
                // @ts-ignore
                if (fineTuneConditions[fineTune] !== "true") {
                    // @ts-ignore
                    strangerSectionProneToInitiatingSex.body.push(`if (${getAttractionLevelCondition(fineTuneConditions[fineTune], attractionLevel)}) {`);
                }
                for (const intimateModifier of MODIFIERS_INTIMACY_ORDER) {
                    const fineTuneCommentWithIntimacyModifier = fineTuneComment + "_" + intimateModifier;

                    const guiderResult = await guider.askOption(
                        strangerKey + "_" + fineTuneCommentWithIntimacyModifier + "_prone-to-initiating-sex",
                        "How likely is " + name + " to initiate sex towards " + actualStrangerValue + " when they are " + intimateModifier.toLowerCase() + "?" + messageAboutAnswersFrom,
                        PROBABILITY_OPTIONS,
                        getFineTuneReference(intimateModifier, "prone-to-initiating-sex") || PROBABILITY_OPTIONS[0],
                    );

                    const probability = probabilityFromAnswer(guiderResult.value);

                    if (probability > 0) {
                        allIsNotProneToInitiatingSex = false;
                        const odds = probability >= 0.7 ? "very likely" : probability >= 0.4 ? "somewhat likely" : "slightly likely";
                        extraInfoProneToInitiatingSex += `\n${name} is ${odds} to initiate sex towards this other character when they are ${intimateModifier.toLowerCase()}`;
                    } else {
                        extraInfoProneToInitiatingSex += `\n${name} is not likely to initiate sex towards this other character when they are ${intimateModifier.toLowerCase()}`;
                    }

                    // @ts-ignore
                    const modifierInfo = MODIFIERS_INTIMACY[intimateModifier];
                    const condition = modifierInfo.condition;
                    if (condition !== "true") {
                        strangerSectionProneToInitiatingSex.body.push(`if (${condition}) {`);
                    }

                    strangerSectionProneToInitiatingSex.body.push(`return ${probability};`);

                    if (condition !== "true") {
                        strangerSectionProneToInitiatingSex.body.push(`}`);
                    }
                }
                if (allIsNotProneToInitiatingSex) {
                    extraInfoProneToInitiatingSex = `\n${name} is not likely to initiate sex towards this other character in any context.`;
                } else {
                    allExtraInfo += extraInfoProneToInitiatingSex;
                }
                // @ts-ignore
                if (fineTuneConditions[fineTune] !== "true") {
                    // @ts-ignore
                    strangerSectionProneToInitiatingSex.body.push(`}`);
                }
                // done proneToInitiatingSex

                let guidanceGivenAllExtraInfo = allExtraInfo;
                let guidanceGiven = "";
                let redoGuidance = false;
                let descriptionValue = "";
                let originalReferenceDescription = scriptgenerator.state[fineTuneReferencePrefix + "description"];
                while (true) {
                    let redidGuidance = false;
                    if (redoGuidance) {
                        redidGuidance = true;
                        const guiderResult = await guider.askOpen(
                            {
                                id: strangerKey + "_" + fineTuneComment + "_description_guidance",
                                reask: true,
                                step: false,
                            },
                            "What are some important things to keep in mind when writing about a relationship with " + actualStrangerValue + " in the context of " + name + "'s character and personality?",
                            guidanceGiven,
                        );
                        if (guiderResult) {
                            guidanceGiven = guiderResult.value.trim();
                        }
                        redoGuidance = false;
                    }

                    const isAnimalFineTune = fineTune.startsWith("animal_");
                    let baseInstructions = "NEVER ask for clarification or more information. ALWAYS directly write the description short paragraph. Invent any specific details as needed. The response should use the word 'OTHER_CHARACTER' to refer to the other character name. Write in clear, direct, objective terms about how " + name + " views and relates to OTHER_CHARACTER — describe the nature of the relationship, attitudes, and behaviors concretely. Avoid flowery language, metaphors about physical sensations (e.g. warm feelings in the chest, fuzzy warmth), and purple prose. State facts about the relationship plainly: whether " + name + " has romantic or sexual interest in OTHER_CHARACTER or not, how they behave towards them, and what they expect from the relationship. Do not describe specific physical micro-actions or sensory body-part details (e.g. eyes tracking someone, 'blue orbs', specific hand gestures). Broad behavioral tendencies are fine (e.g. they may withdraw from their presence, they may act shyly around them)."
                    if (isAnimalFineTune && speciesType !== "animal") {
                        baseInstructions = "NEVER ask for clarification or more information. ALWAYS directly write the description short paragraph. Invent any specific details as needed. The response should use the word 'OTHER_CHARACTER' to refer to the animal (pet or wild beast) in question. Write in clear, direct, objective terms about how " + name + " views and relates to OTHER_CHARACTER — describe their attitudes and behaviors concretely. Avoid flowery language and purple prose. Do not describe specific physical micro-actions or sensory body-part details. Broad behavioral tendencies are fine (e.g. they may hide from it, they may want to approach it). State plainly whether " + name + " has any sexual feelings towards OTHER_CHARACTER or not, and describe how " + name + " would interact with this pet or wild animal, including whether they would want to care for it, be afraid of it, or want to befriend it."
                    }
                    if (guidanceGivenAllExtraInfo) {
                        baseInstructions += "\n\nThe following information has been provided based on the previous questions and answers:\n\n" + guidanceGivenAllExtraInfo;
                    }
                    if (guidanceGiven) {
                        baseInstructions += "\n\n# MANDATORY REQUIREMENTS — ACTIVE OVERRIDE:\n\nThe following requirements MUST be reflected in your answer. Treat them as hard constraints that take absolute priority over any conflicting instruction above. Do NOT ignore or dilute them:\n\n" + guidanceGiven;
                    }

                    baseInstructions += "\n\nAnswer in present tense, future tense is allowed to specify potential behaviors that " + name + " might do";

                    const guiderResult = await guider.askAccept(
                        { id: strangerKey + "_" + fineTuneComment + "_description", reask: redidGuidance, step: true, recalcdefault: true },
                        "Description of a relationship with " + actualStrangerValue + messageAboutAnswersFrom,
                        async () => {
                            if (originalReferenceDescription && !redidGuidance) {
                                return originalReferenceDescription;
                            }
                            await prime();

                            const descriptionBehaviour = await generator.next({
                                maxCharacters: 200,
                                maxSafetyCharacters: 600,
                                maxParagraphs: 1,
                                nextQuestion: "Provide a concise description (2-3 sentences) of how " + name + " feels about and acts towards " + actualStrangerValue + ". Cover their overall attitude and emotional stance, how they typically behave around this person, and importantly any ways their usual personality shifts because of this bond — for example becoming more open, dropping defenses, acting more protective or aggressive, or behaving out of character in some way.",
                                stopAfter: [],
                                stopAt: ["\n"],
                                instructions: baseInstructions,
                                grammar: "root ::= " + JSON.stringify("Regarding OTHER_CHARACTER " + name + " will treat them like ") + " [a-zA-Z0-9 ,;.'_\\n]+",
                            });

                            if (descriptionBehaviour.done) {
                                throw new Error("Generator ended unexpectedly while generating description for " + strangerKey);
                            }

                            const actualDescriptionBehavour = replaceOtherCharNameWithPlaceholder(descriptionBehaviour.value.trim(), name);

                            return actualDescriptionBehavour;

                            // const descriptionInternalFeelings = await generator.next({
                            //     maxCharacters: 200,
                            //     maxSafetyCharacters: 600,
                            //     maxParagraphs: 1,
                            //     nextQuestion: "Provide a concise and short one sentence description of how " + name + " feels internally towards " + actualStrangerValue + ". Focus on the emotional and psychological aspects of their perception, rather than physical details. This should capture the essence of their feelings towards this person in a way that informs their interactions and relationship dynamics.",
                            //     stopAfter: [],
                            //     stopAt: ["\n"],
                            //     instructions: baseInstructions,
                            //     grammar: "root ::= " + JSON.stringify(name + " feels that OTHER_CHARACTER is ") + " [a-zA-Z0-9 ,;.'_\\n]+",
                            // });

                            // if (descriptionInternalFeelings.done) {
                            //     throw new Error("Generator ended unexpectedly while generating description for " + strangerKey);
                            //  }

                            // const actualDescriptionInternalFeelings = replaceOtherCharNameWithPlaceholder(descriptionInternalFeelings.value.trim(), name);

                            // return actualDescriptionBehavour + "\n\n" + actualDescriptionInternalFeelings;
                        },
                    );
                    if (guiderResult.value === null) {
                        redoGuidance = true;
                        descriptionValue = "";
                        continue;
                    } else {
                        descriptionValue = guiderResult.value.trim();
                        break;
                    }
                }

                const relationshipNameResult = await guider.askOpen(
                    strangerKey + "_" + fineTuneComment + "_relationship-name",
                    "What is the name of the relationship between " + name + " and " + actualStrangerValue + "?",
                    // @ts-ignore
                    STRANGERS_RELATIONSHIP_NAMES[strangerKey],
                );

                insertSpecialComment(strangerSectionBase.body, fineTuneComment);
                // @ts-ignore
                if (fineTuneConditions[fineTune] === "true") {
                    // @ts-ignore
                    strangerSectionDescription.body.push(`return ${toTemplateLiteral(descriptionValue, name)};`);
                    strangerSectionRelationshipName.body.push(`return ${toTemplateLiteral(relationshipNameResult.value.trim(), name)};`);
                } else {
                    // @ts-ignore
                    strangerSectionDescription.body.push(`if (${getAttractionLevelCondition(fineTuneConditions[fineTune], attractionLevel)}) {`);
                    strangerSectionDescription.body.push(`return ${toTemplateLiteral(descriptionValue, name)};`);
                    strangerSectionDescription.body.push(`}`);

                    // @ts-ignore
                    strangerSectionRelationshipName.body.push(`if (${getAttractionLevelCondition(fineTuneConditions[fineTune], attractionLevel)}) {`);
                    strangerSectionRelationshipName.body.push(`return ${toTemplateLiteral(relationshipNameResult.value.trim(), name)};`);
                    strangerSectionRelationshipName.body.push(`}`);
                }
            }
        }
    }

    for (const relationshipKey of SETTINGS_ORDER_FIRST_LAYER) {
        /**
         * @type {object}
         */
        const relationshipValue =
            // @ts-ignore
            SETTINGS[relationshipKey];

        const relationshipsSection = insertSection(optionsSection.body, relationshipKey, (s) => {
            s.head.push(`${relationshipKey}: {`);
            s.foot.push(`},`);
        });

        for (const romanticInterestKey of SETTINGS_ORDER_SECOND_LAYER) {
            /**
             * @type {{family: string, nonFamily: string}}
             */
            const romanticInterestValue =
                // @ts-ignore
                relationshipValue[romanticInterestKey];

            let addAttractionRules = true;
            // asexual will always get added because it is all creepy bonds
            if (romanticInterestKey !== "noRomanticInterest_0_10" && !isAsexualValue) {
                if (romanticInterestKey === "slightRomanticInterest_10_20" && isLoveAtFirstSightValue) {
                    // must add because love at first sight implies at least a slight romantic interest
                    addAttractionRules = true;
                } else {
                    const guiderResult = await guider.askBoolean(
                        "capable-of-romantic-interest-" + relationshipKey + "-" + romanticInterestKey,
                        "Is " + name + " capable to " + ROMANTIC_INTEREST_KEY_LABELS[romanticInterestKey] + " (beyond simple physical or superficial attraction) " + (" towards a " + RELATIONSHIP_KEY_DESCRIPTIONS[relationshipKey]).replace("a acquaintance", "an acquaintance") + "?",
                        addAttractionRules,
                    );
                    addAttractionRules = guiderResult.value;
                }
            }

            const romanticInterestSection = insertSection(relationshipsSection.body, romanticInterestKey, (s) => {
                s.head.push(`${romanticInterestKey}: {`);
                s.foot.push(`},`);
            });

            for (const familyKey of SETTINGS_ORDER_THIRD_LAYER) {
                /**
                 * @type {string}
                 */
                const familyValue =
                    // @ts-ignore
                    romanticInterestValue[familyKey];

                const isCreepyFamilyBond = familyKey === "family" && !isIncestuousValue;

                // no need to add the rule, the character cannot really develop an attraction at such bond level
                // to that degree given
                if (!addAttractionRules && !isCreepyFamilyBond) {
                    continue;
                }

                const familySectionBase = insertSection(romanticInterestSection.body, familyKey, (s) => {
                    s.head.push(`${familyKey}: {`);
                    s.foot.push(`},`);
                });

                const familySectionRelationshipName = insertSection(familySectionBase.body, "relationshipName", (s) => {
                    s.head.push(`relationshipName: (info) => {`);
                    s.foot.push(`},`);
                });

                const familySectionDescription = insertSection(familySectionBase.body, "description", (s) => {
                    s.head.push(`description: (info) => {`);
                    s.head.push(`const char = info.char;`);
                    s.head.push(`const other = info.other;`);
                    s.foot.push(`},`);
                });

                const familySectionOpenToAffection = insertSection(familySectionBase.body, "openToAffection", (s) => {
                    s.head.push(`openToAffection: (char, other) => {`);
                    s.foot.push(`},`);
                    s.foot.push(`openToAffectionResponses,`);
                });

                const familySectionOpenToIntimateAffection = insertSection(familySectionBase.body, "openToIntimateAffection", (s) => {
                    s.head.push(`openToIntimateAffection: (char, other) => {`);
                    s.foot.push(`},`);
                    s.foot.push(`openToIntimateAffectionResponses,`);
                });

                const familySectionOpenToSex = insertSection(familySectionBase.body, "openToSex", (s) => {
                    s.head.push(`openToSex: (char, other) => {`);
                    s.foot.push(`},`);
                    s.foot.push(`openToSexResponses,`);
                });

                const familySectionProneToInitiatingAffection = insertSection(familySectionBase.body, "proneToInitiatingAffection", (s) => {
                    s.head.push(`proneToInitiatingAffection: {`);
                    s.head.push(`probability: (char, other) => {`);
                    s.foot.push(`},`);
                    s.foot.push(`actions: affectionActs,`);
                    s.foot.push(`},`);
                });

                const familySectionProneToInitiatingIntimateAffection = insertSection(familySectionBase.body, "proneToInitiatingIntimateAffection", (s) => {
                    s.head.push(`proneToInitiatingIntimateAffection: {`);
                    s.head.push(`probability: (char, other) => {`);
                    s.foot.push(`},`);
                    s.foot.push(`actions: intimateAffectionActs,`);
                    s.foot.push(`},`);
                });

                const familySectionProneToInitiatingSex = insertSection(familySectionBase.body, "proneToInitiatingSex", (s) => {
                    s.head.push(`proneToInitiatingSex: {`);
                    s.head.push(`probability: (char, other) => {`);
                    s.foot.push(`},`);
                    s.foot.push(`actions: sexActs,`);
                    s.foot.push(`},`);
                });

                let fineTuneListToUse = familyKey === "family" ? selectedFamilyFineTunes : selectedFineTunes;
                if (romanticInterestKey !== "noRomanticInterest_0_10") {
                    fineTuneListToUse = familyKey === "family" ? selectedFamilyFineTunesAfterRomanticInterest : selectedFineTunesAfterRomanticInterest;
                }

                for (const fineTune of fineTuneListToUse) {
                    /**
                     * @type {string}
                     */
                    let fineTuneAsDescription =
                        // @ts-ignore
                        (familyKey === "family" ? fineTuneDescriptionsFamily : fineTunesDescriptions)[fineTune];

                    /**
                     * @type {Array<"n/a" | "slight" | "moderate" | "strong">}
                     */
                    let attractionLevelsToUse = fineTune.endsWith("_a") ? FINE_TUNE_WITH_ATTRACTION_POTENTIALS_BASIC_FRIENDSHIP_FOESHIP : ["n/a"];
                    if (fineTune.endsWith("_a")) {
                        if (romanticInterestKey === "slightRomanticInterest_10_20") {
                            attractionLevelsToUse = FINE_TUNE_WITH_ATTRACTION_POTENTIALS_SLIGHT_ROMANTIC_INTEREST;
                        } else if (romanticInterestKey === "romanticInterest_20_35") {
                            attractionLevelsToUse = FINE_TUNE_WITH_ATTRACTION_POTENTIALS_ROMANTIC_INTEREST;
                        } else if (romanticInterestKey === "strongRomanticInterest_35_50") {
                            attractionLevelsToUse = FINE_TUNE_WITH_ATTRACTION_POTENTIALS_STRONG_ROMANTIC_INTEREST;
                        } else if (romanticInterestKey === "deepInLove_50_100") {
                            attractionLevelsToUse = FINE_TUNE_WITH_ATTRACTION_POTENTIALS_STRONG_ROMANTIC_INTEREST;
                        }
                    }

                    for (const attractionLevel of attractionLevelsToUse) {
                        const fineTuneValue = getFineTuneValueWithAttractionLevel(fineTuneAsDescription, attractionLevel);

                        const actualFamilyValue = familyValue.replace("{}", fineTuneValue);

                        const fineTuneComment = fineTune + (attractionLevel !== "n/a" ? "_" + attractionLevel : "");
                        if (hasSpecialComment(familySectionDescription.body, fineTuneComment)) {
                            continue;
                        }

                        let allExtraInfo = "";

                        // First openToAffection for each intimacy modifier
                        let extraInfoOpenToAffection = "";
                        let allIsNotReceptive = true;
                        // @ts-ignore
                        if (fineTuneConditions[fineTune] !== "true") {
                            // @ts-ignore
                            familySectionOpenToAffection.body.push(`if (${getAttractionLevelCondition(fineTuneConditions[fineTune], attractionLevel)}) {`);
                        }

                        const options = getAllPotentialOptions(scriptgenerator.state, relationshipKey, isAsexualValue, isAsexualValue || !isIncestuousValue);

                        const getFineTuneReferenceDefaultPrefix = () => {
                            const suffix = fineTuneComment + "_";

                            // family relationships inherit from their non-family counterpart, the closest already answered question
                            if (familyKey === "family") {
                                return relationshipKey + "_" + romanticInterestKey + "_nonFamily_any_character_";
                            }

                            // higher romantic interests inherit from the previous (lower) romantic interest of the same relationship
                            const romanticInterestIndex = SETTINGS_ORDER_SECOND_LAYER.indexOf(romanticInterestKey);
                            if (romanticInterestIndex > 0) {
                                return relationshipKey + "_" + SETTINGS_ORDER_SECOND_LAYER[romanticInterestIndex - 1] + "_" + familyKey + "_" + suffix;
                            }

                            // no romantic interest: inherit from the closest relationship already asked following the
                            // questioning order in SETTINGS_ORDER_FIRST_LAYER. The first relationship of each chain
                            // (acquaintance and unpleasant) inherits from the closest stranger impression instead.
                            /** @type {Record<string, string>} */
                            const noRomanticInterestBaseSource = {
                                "acquaintance_0_10": "strangerGood_5_100",
                                "friendly_10_20": "acquaintance_0_10_noRomanticInterest_0_10_nonFamily",
                                "goodFriend_20_35": "friendly_10_20_noRomanticInterest_0_10_nonFamily",
                                "closeFriend_35_50": "goodFriend_20_35_noRomanticInterest_0_10_nonFamily",
                                "bestFriend_50_100": "closeFriend_35_50_noRomanticInterest_0_10_nonFamily",
                                "unpleasant_n10_0": "strangerBad_n100_n5",
                                "unfriendly_n20_n10": "unpleasant_n10_0_noRomanticInterest_0_10_nonFamily",
                                "antagonistic_n35_n20": "unfriendly_n20_n10_noRomanticInterest_0_10_nonFamily",
                                "hostile_n50_n35": "antagonistic_n35_n20_noRomanticInterest_0_10_nonFamily",
                                "foe_n100_n50": "hostile_n50_n35_noRomanticInterest_0_10_nonFamily",
                            };

                            return (noRomanticInterestBaseSource[relationshipKey] || "strangerGood_5_100") + "_" + suffix;
                        }

                        const defaultReferencePrefix = getFineTuneReferenceDefaultPrefix();
                        // The computed default may point to a source that was never
                        // generated and is therefore absent from `options` (e.g. the
                        // family branch always targets the nonFamily `any_character`
                        // counterpart). In that case snap it to the closest available
                        // option so `askOption` is always given a valid default.
                        const resolvedDefaultReferencePrefix = getClosestOptionByValue(defaultReferencePrefix, options) || defaultReferencePrefix;

                        const fineTuneReferencePrefix = options.length !== 0 ? (await guider.askOption(
                            "refkey_" + relationshipKey + "_" + romanticInterestKey + "_" + familyKey + "_" + fineTuneComment,
                            "Select a reference to inherit answer for " + actualFamilyValue,
                            options,
                            resolvedDefaultReferencePrefix,
                        )).value : defaultReferencePrefix;

                        const fineTuneReferenceLabel = options.find(o => o.value === fineTuneReferencePrefix)?.label || fineTuneReferencePrefix;

                        const messageAboutAnswersFrom = fineTuneReferenceLabel ? "\n\nThe answers were obtained from " + fineTuneReferenceLabel : "";

                        /**
                         * 
                         * @param {string} intimateModifier 
                         * @param {string} key 
                         * @returns 
                         */
                        const getFineTuneReference = (intimateModifier, key) => {
                            return scriptgenerator.state[fineTuneReferencePrefix + intimateModifier + "_" + key];
                        }

                        for (const intimateModifier of MODIFIERS_INTIMACY_ORDER) {
                            const fineTuneCommentWithIntimacyModifier = fineTuneComment + "_" + intimateModifier;

                            const openToAffectionReference = getFineTuneReference(intimateModifier, "open-to-affection");
                            const guiderResult = await guider.askOption(
                                relationshipKey + "_" + romanticInterestKey + "_" + familyKey + "_" + fineTuneCommentWithIntimacyModifier + "_open-to-affection",
                                "How receptive to affection is " + name + " towards " + actualFamilyValue + " when they are " + intimateModifier.toLowerCase() + "?" + messageAboutAnswersFrom, [
                                "not receptive",
                                "slightly receptive",
                                "moderately receptive",
                                "very receptive",
                            ], openToAffectionReference || "not receptive");

                            const answerTrimmed = guiderResult.value.trim().toLowerCase();
                            if (answerTrimmed !== "not receptive") {
                                allIsNotReceptive = false;
                            }

                            /**
                             * @type {Record<string, string>}
                             */
                            const toValue = {
                                "not receptive": "not",
                                "slightly receptive": "slight",
                                "moderately receptive": "moderate",
                                "very receptive": "very",
                            }

                            const valueAnswer = toValue[answerTrimmed];

                            extraInfoOpenToAffection += `\n${name} is ${answerTrimmed} to affection from this other character when they are ${intimateModifier.toLowerCase()}`;

                            // @ts-ignore
                            const modifierInfo = MODIFIERS_INTIMACY[intimateModifier];
                            const condition = modifierInfo.condition;
                            if (condition !== "true") {
                                familySectionOpenToAffection.body.push(`if (${condition}) {`);
                            }

                            const openToAffectionReasonReference = getFineTuneReference(intimateModifier, "open-to-affection-reason");
                            /**
                             * @type {string | null}
                             */
                            let reason = await chooseReason(
                                relationshipKey + "_" + romanticInterestKey + "_" + familyKey + "_" + fineTuneCommentWithIntimacyModifier + "_open-to-affection-reason",
                                guider,
                                modifierInfo,
                                valueAnswer,
                                name,
                                describeFamilyContext(relationshipKey, romanticInterestKey, familyKey, valueAnswer === "not", false),
                                "What is the reason for " + name + " being " + answerTrimmed + " to affection from this other character when they are " + intimateModifier.toLowerCase() + "?" + messageAboutAnswersFrom,
                                openToAffectionReasonReference,
                                attractionLevel,
                                fineTune,
                            );

                            familySectionOpenToAffection.body.push(`return {value: ${JSON.stringify(valueAnswer)}, reason: ${reason ? toTemplateLiteralNoInfo(reason, name) : "null"}};`);
                            if (condition !== "true") {
                                familySectionOpenToAffection.body.push(`}`);
                            }
                        }

                        if (allIsNotReceptive) {
                            extraInfoOpenToAffection = `\n${name} is not receptive to affection from this other character in any context.`;
                        }
                        allExtraInfo += extraInfoOpenToAffection;
                        // @ts-ignore
                        if (fineTuneConditions[fineTune] !== "true") {
                            // @ts-ignore
                            familySectionOpenToAffection.body.push(`}`);
                        }
                        // done openToAffection

                        // Next openToIntimateAffection for each intimacy modifier
                        let extraInfoOpenToIntimateAffection = "";
                        let allIsNotReceptiveIntimateAffection = true;
                        // @ts-ignore
                        if (fineTuneConditions[fineTune] !== "true") {
                            // @ts-ignore
                            familySectionOpenToIntimateAffection.body.push(`if (${getAttractionLevelCondition(fineTuneConditions[fineTune], attractionLevel)}) {`);
                        }

                        for (const intimateModifier of MODIFIERS_INTIMACY_ORDER) {
                            const fineTuneCommentWithIntimacyModifier = fineTuneComment + "_" + intimateModifier;

                            const openToIntimateAffectionReference = getFineTuneReference(intimateModifier, "open-to-intimate-affection");
                            const guiderResult = await guider.askOption(
                                relationshipKey + "_" + romanticInterestKey + "_" + familyKey + "_" + fineTuneCommentWithIntimacyModifier + "_open-to-intimate-affection",
                                "How receptive to intimate affection is " + name + " towards " + actualFamilyValue + " when they are " + intimateModifier.toLowerCase() + "?" + messageAboutAnswersFrom, [
                                "not receptive",
                                "slightly receptive",
                                "moderately receptive",
                                "very receptive",
                            ], openToIntimateAffectionReference || "not receptive");

                            const answerTrimmed = guiderResult.value.trim().toLowerCase();
                            if (answerTrimmed !== "not receptive") {
                                allIsNotReceptiveIntimateAffection = false;
                            }

                            /**
                             * @type {Record<string, string>}
                             */
                            const toValue = {
                                "not receptive": "not",
                                "slightly receptive": "slight",
                                "moderately receptive": "moderate",
                                "very receptive": "very",
                            }

                            const valueAnswer = toValue[answerTrimmed];

                            extraInfoOpenToIntimateAffection += `\n${name} is ${answerTrimmed} to intimate affection from this other character when they are ${intimateModifier.toLowerCase()}`;

                            // @ts-ignore
                            const modifierInfo = MODIFIERS_INTIMACY[intimateModifier];
                            const condition = modifierInfo.condition;
                            if (condition !== "true") {
                                familySectionOpenToIntimateAffection.body.push(`if (${condition}) {`);
                            }

                            const openToIntimateAffectionReasonReference = getFineTuneReference(intimateModifier, "open-to-intimate-affection-reason");
                            /**
                             * @type {string | null}
                             */
                            let reason = await chooseReason(
                                relationshipKey + "_" + romanticInterestKey + "_" + familyKey + "_" + fineTuneCommentWithIntimacyModifier + "_open-to-intimate-affection-reason",
                                guider,
                                modifierInfo,
                                valueAnswer,
                                name,
                                describeFamilyContext(relationshipKey, romanticInterestKey, familyKey, valueAnswer === "not", true),
                                "What is the reason for " + name + " being " + answerTrimmed + " to intimate affection from this other character when they are " + intimateModifier.toLowerCase() + "?" + messageAboutAnswersFrom,
                                openToIntimateAffectionReasonReference,
                                attractionLevel,
                                fineTune,
                            );

                            familySectionOpenToIntimateAffection.body.push(`return {value: ${JSON.stringify(valueAnswer)}, reason: ${reason ? toTemplateLiteralNoInfo(reason, name) : "null"}};`);
                            if (condition !== "true") {
                                familySectionOpenToIntimateAffection.body.push(`}`);
                            }
                        }
                        if (allIsNotReceptiveIntimateAffection) {
                            extraInfoOpenToIntimateAffection = `\n${name} is not receptive to intimate affection from this other character in any context.`;
                        }
                        allExtraInfo += extraInfoOpenToIntimateAffection;
                        // @ts-ignore
                        if (fineTuneConditions[fineTune] !== "true") {
                            // @ts-ignore
                            familySectionOpenToIntimateAffection.body.push(`}`);
                        }
                        // done openToIntimateAffection

                        // Next openToSex for each intimacy modifier
                        let extraInfoOpenToSex = "";
                        let allIsNotReceptiveOpenToSex = true;
                        // @ts-ignore
                        if (fineTuneConditions[fineTune] !== "true") {
                            // @ts-ignore
                            familySectionOpenToSex.body.push(`if (${getAttractionLevelCondition(fineTuneConditions[fineTune], attractionLevel)}) {`);
                        }
                        for (const intimateModifier of MODIFIERS_INTIMACY_ORDER) {
                            const fineTuneCommentWithIntimacyModifier = fineTuneComment + "_" + intimateModifier;

                            const openToSexReference = getFineTuneReference(intimateModifier, "open-to-sex");
                            const guiderResult = await guider.askOption(
                                relationshipKey + "_" + romanticInterestKey + "_" + familyKey + "_" + fineTuneCommentWithIntimacyModifier + "_open-to-sex",
                                "How receptive to sex is " + name + " towards " + actualFamilyValue + " when they are " + intimateModifier.toLowerCase() + "?" + messageAboutAnswersFrom, [
                                "not receptive",
                                "slightly receptive",
                                "moderately receptive",
                                "very receptive",
                            ], openToSexReference || "not receptive");

                            const answerTrimmed = guiderResult.value.trim().toLowerCase();
                            if (answerTrimmed !== "not receptive") {
                                allIsNotReceptiveOpenToSex = false;
                            }

                            /**
                             * @type {Record<string, string>}
                             */
                            const toValue = {
                                "not receptive": "not",
                                "slightly receptive": "slight",
                                "moderately receptive": "moderate",
                                "very receptive": "very",
                            }

                            const valueAnswer = toValue[answerTrimmed];

                            extraInfoOpenToSex += `\n${name} is ${answerTrimmed} to sex with this other character when they are ${intimateModifier.toLowerCase()}`;

                            // @ts-ignore
                            const modifierInfo = MODIFIERS_INTIMACY[intimateModifier];
                            const condition = modifierInfo.condition;
                            if (condition !== "true") {
                                familySectionOpenToSex.body.push(`if (${condition}) {`);
                            }

                            const openToSexReasonReference = getFineTuneReference(intimateModifier, "open-to-sex-reason");
                            /**
                             * @type {string | null}
                             */
                            let reason = await chooseReason(
                                relationshipKey + "_" + romanticInterestKey + "_" + familyKey + "_" + fineTuneCommentWithIntimacyModifier + "_open-to-sex-reason",
                                guider,
                                modifierInfo,
                                valueAnswer,
                                name,
                                describeFamilyContext(relationshipKey, romanticInterestKey, familyKey, valueAnswer === "not", true),
                                "What is the reason for " + name + " being " + answerTrimmed + " to sex with this other character when they are " + intimateModifier.toLowerCase() + "?" + messageAboutAnswersFrom,
                                openToSexReasonReference,
                                attractionLevel,
                                fineTune,
                            );

                            familySectionOpenToSex.body.push(`return {value: ${JSON.stringify(valueAnswer)}, reason: ${reason ? toTemplateLiteralNoInfo(reason, name) : "null"}};`);
                            if (condition !== "true") {
                                familySectionOpenToSex.body.push(`}`);
                            }
                        }
                        if (allIsNotReceptiveOpenToSex) {
                            extraInfoOpenToSex = `\n${name} is not receptive to sex with this other character in any context.`;
                        }
                        allExtraInfo += extraInfoOpenToSex;
                        // @ts-ignore
                        if (fineTuneConditions[fineTune] !== "true") {
                            // @ts-ignore
                            familySectionOpenToSex.body.push(`}`);
                        }
                        // done openToSex

                        // Next proneToInitiatingAffection for each intimacy modifier
                        let extraInfoProneToInitiatingAffection = "";
                        let allIsNotProneToInitiatingAffection = true;
                        // @ts-ignore
                        if (fineTuneConditions[fineTune] !== "true") {
                            // @ts-ignore
                            familySectionProneToInitiatingAffection.body.push(`if (${getAttractionLevelCondition(fineTuneConditions[fineTune], attractionLevel)}) {`);
                        }
                        for (const intimateModifier of MODIFIERS_INTIMACY_ORDER) {
                            const fineTuneCommentWithIntimacyModifier = fineTuneComment + "_" + intimateModifier;

                            const proneToInitiatingAffectionReference = getFineTuneReference(intimateModifier, "prone-to-initiating-affection");
                            const guiderResult = await guider.askOption(
                                relationshipKey + "_" + romanticInterestKey + "_" + familyKey + "_" + fineTuneCommentWithIntimacyModifier + "_prone-to-initiating-affection",
                                "How likely is " + name + " to initiate non-romantic physical affection towards " + actualFamilyValue + " when they are " + intimateModifier.toLowerCase() + "?" + messageAboutAnswersFrom,
                                PROBABILITY_OPTIONS,
                                proneToInitiatingAffectionReference || PROBABILITY_OPTIONS[0],
                            );

                            const probability = probabilityFromAnswer(guiderResult.value);

                            if (probability > 0) {
                                allIsNotProneToInitiatingAffection = false;
                                const odds = probability >= 0.7 ? "very likely" : probability >= 0.4 ? "somewhat likely" : "slightly likely";
                                extraInfoProneToInitiatingAffection += `\n${name} is ${odds} to initiate physical affection towards this other character when they are ${intimateModifier.toLowerCase()}`;
                            } else {
                                extraInfoProneToInitiatingAffection += `\n${name} is not likely to initiate physical affection towards this other character when they are ${intimateModifier.toLowerCase()}`;
                            }

                            // @ts-ignore
                            const modifierInfo = MODIFIERS_INTIMACY[intimateModifier];
                            const condition = modifierInfo.condition;
                            if (condition !== "true") {
                                familySectionProneToInitiatingAffection.body.push(`if (${condition}) {`);
                            }
                            familySectionProneToInitiatingAffection.body.push(`return ${probability};`);
                            if (condition !== "true") {
                                familySectionProneToInitiatingAffection.body.push(`}`);
                            }
                        }
                        if (allIsNotProneToInitiatingAffection) {
                            extraInfoProneToInitiatingAffection = `\n${name} is not likely to initiate physical affection towards this other character in any context.`;
                        } else {
                            allExtraInfo += extraInfoProneToInitiatingAffection;
                        }
                        // @ts-ignore
                        if (fineTuneConditions[fineTune] !== "true") {
                            // @ts-ignore
                            familySectionProneToInitiatingAffection.body.push(`}`);
                        }
                        // done proneToInitiatingAffection

                        // Next proneToInitiatingIntimateAffection for each intimacy modifier
                        let extraInfoProneToInitiatingIntimateAffection = "";
                        let allIsNotProneToInitiatingIntimateAffection = true;
                        // @ts-ignore
                        if (fineTuneConditions[fineTune] !== "true") {
                            // @ts-ignore
                            familySectionProneToInitiatingIntimateAffection.body.push(`if (${getAttractionLevelCondition(fineTuneConditions[fineTune], attractionLevel)}) {`);
                        }
                        for (const intimateModifier of MODIFIERS_INTIMACY_ORDER) {
                            const fineTuneCommentWithIntimacyModifier = fineTuneComment + "_" + intimateModifier;

                            const proneToInitiatingIntimateAffectionReference = getFineTuneReference(intimateModifier, "prone-to-initiating-intimate-affection");
                            const guiderResult = await guider.askOption(
                                relationshipKey + "_" + romanticInterestKey + "_" + familyKey + "_" + fineTuneCommentWithIntimacyModifier + "_prone-to-initiating-intimate-affection",
                                "How likely is " + name + " to initiate romantic or sexual physical affection towards " + actualFamilyValue + " when they are " + intimateModifier.toLowerCase() + "?" + messageAboutAnswersFrom,
                                PROBABILITY_OPTIONS,
                                proneToInitiatingIntimateAffectionReference || PROBABILITY_OPTIONS[0],
                            );

                            const probability = probabilityFromAnswer(guiderResult.value);

                            if (probability > 0) {
                                allIsNotProneToInitiatingIntimateAffection = false;
                                const odds = probability >= 0.7 ? "very likely" : probability >= 0.4 ? "somewhat likely" : "slightly likely";
                                extraInfoProneToInitiatingIntimateAffection += `\n${name} is ${odds} to initiate romantic or sexual physical affection towards this other character when they are ${intimateModifier.toLowerCase()}`;
                            } else {
                                extraInfoProneToInitiatingIntimateAffection += `\n${name} is not likely to initiate romantic or sexual physical affection towards this other character when they are ${intimateModifier.toLowerCase()}`;
                            }

                            // @ts-ignore
                            const modifierInfo = MODIFIERS_INTIMACY[intimateModifier];
                            const condition = modifierInfo.condition;
                            if (condition !== "true") {
                                familySectionProneToInitiatingIntimateAffection.body.push(`if (${condition}) {`);
                            }
                            familySectionProneToInitiatingIntimateAffection.body.push(`return ${probability};`);
                            if (condition !== "true") {
                                familySectionProneToInitiatingIntimateAffection.body.push(`}`);
                            }
                        }
                        // @ts-ignore
                        if (fineTuneConditions[fineTune] !== "true") {
                            // @ts-ignore
                            familySectionProneToInitiatingIntimateAffection.body.push(`}`);
                        }
                        // done proneToInitiatingIntimateAffection
                        if (allIsNotProneToInitiatingIntimateAffection) {
                            extraInfoProneToInitiatingIntimateAffection = `\n${name} is not likely to initiate romantic or sexual physical affection towards this other character in any context.`;
                        } else {
                            allExtraInfo += extraInfoProneToInitiatingIntimateAffection;
                        }

                        // Next proneToInitiatingSex for each intimacy modifier
                        let extraInfoProneToInitiatingSex = "";
                        let allIsNotProneToInitiatingSex = true;
                        // @ts-ignore
                        if (fineTuneConditions[fineTune] !== "true") {
                            // @ts-ignore
                            familySectionProneToInitiatingSex.body.push(`if (${getAttractionLevelCondition(fineTuneConditions[fineTune], attractionLevel)}) {`);
                        }
                        for (const intimateModifier of MODIFIERS_INTIMACY_ORDER) {
                            const fineTuneCommentWithIntimacyModifier = fineTuneComment + "_" + intimateModifier;

                            const proneToInitiatingSexReference = getFineTuneReference(intimateModifier, "prone-to-initiating-sex");
                            const guiderResult = await guider.askOption(
                                relationshipKey + "_" + romanticInterestKey + "_" + familyKey + "_" + fineTuneCommentWithIntimacyModifier + "_prone-to-initiating-sex",
                                "How likely is " + name + " to initiate sex towards " + actualFamilyValue + " when they are " + intimateModifier.toLowerCase() + "?" + messageAboutAnswersFrom,
                                PROBABILITY_OPTIONS,
                                proneToInitiatingSexReference || PROBABILITY_OPTIONS[0],
                            );

                            const probability = probabilityFromAnswer(guiderResult.value);

                            if (probability > 0) {
                                allIsNotProneToInitiatingSex = false;
                                const odds = probability >= 0.7 ? "very likely" : probability >= 0.4 ? "somewhat likely" : "slightly likely";
                                extraInfoProneToInitiatingSex += `\n${name} is ${odds} to initiate sex towards this other character when they are ${intimateModifier.toLowerCase()}`;
                            } else {
                                extraInfoProneToInitiatingSex += `\n${name} is not likely to initiate sex towards this other character when they are ${intimateModifier.toLowerCase()}`;
                            }

                            // @ts-ignore
                            const modifierInfo = MODIFIERS_INTIMACY[intimateModifier];
                            const condition = modifierInfo.condition;
                            if (condition !== "true") {
                                familySectionProneToInitiatingSex.body.push(`if (${condition}) {`);
                            }

                            familySectionProneToInitiatingSex.body.push(`return ${probability};`);

                            if (condition !== "true") {
                                familySectionProneToInitiatingSex.body.push(`}`);
                            }
                        }
                        if (allIsNotProneToInitiatingSex) {
                            extraInfoProneToInitiatingSex = `\n${name} is not likely to initiate sex towards this other character in any context.`;
                        } else {
                            allExtraInfo += extraInfoProneToInitiatingSex;
                        }
                        // @ts-ignore
                        if (fineTuneConditions[fineTune] !== "true") {
                            // @ts-ignore
                            familySectionProneToInitiatingSex.body.push(`}`);
                        }
                        // done proneToInitiatingSex

                        let guidanceGivenAllExtraInfo = allExtraInfo;
                        let guidanceGiven = "";
                        let redoGuidance = false;
                        let descriptionValue = "";
                        let originalReferenceDescription = scriptgenerator.state[fineTuneReferencePrefix + "description"];
                        while (true) {
                            let redidGuidance = false;
                            if (redoGuidance) {
                                redidGuidance = true;
                                const guiderResult = await guider.askOpen(
                                    {
                                        id: relationshipKey + "_" + romanticInterestKey + "_" + familyKey + "_" + fineTuneComment + "_description_guidance",
                                        reask: true,
                                        step: false,
                                    },
                                    "What are some important things to keep in mind when writing about a relationship with " + actualFamilyValue + " in the context of " + name + "'s character and personality?",
                                    guidanceGiven,
                                );
                                if (guiderResult) {
                                    guidanceGiven = guiderResult.value.trim();
                                }
                                redoGuidance = false;
                            }

                            const isAnimalFineTune = fineTune.startsWith("animal_");
                            let baseInstructions = "NEVER ask for clarification or more information. ALWAYS directly write the description paragraph. Invent any specific details as needed. The response should use the word 'OTHER_CHARACTER' to refer to the other character name. Write in clear, direct, objective terms about how " + name + " views, feels about, and behaves towards OTHER_CHARACTER — describe the nature of the relationship, attitudes, and behaviors concretely. Avoid flowery language, metaphors about physical sensations (e.g. warm feelings in the chest, fuzzy warmth), and purple prose. State facts about the relationship plainly: whether " + name + " has romantic or sexual interest in OTHER_CHARACTER or not, how they behave towards them, and what they expect from the relationship. Crucially, also describe how " + name + "'s personality and typical behavior shifts specifically because of this bond — for example, if they are normally guarded or sarcastic, do they drop that around OTHER_CHARACTER? If they are shy, do they become more open? Do they become more protective, more aggressive, more vulnerable, or act out of character in any way? These behavioral changes due to the bond are important to capture. Do not describe specific physical micro-actions or sensory body-part details (e.g. eyes tracking someone, 'blue orbs', specific hand gestures). Broad behavioral tendencies are fine (e.g. they may withdraw from their presence, they may act shyly around them).";
                            if (isAnimalFineTune && speciesType !== "animal") {
                                baseInstructions = "NEVER ask for clarification or more information. ALWAYS directly write the description paragraph. Invent any specific details as needed. The response should use the word 'OTHER_CHARACTER' to refer to the animal (pet or wild beast) in question. Write in clear, direct, objective terms about how " + name + " views, feels about, and behaves towards OTHER_CHARACTER — describe their attitudes and behaviors concretely. Avoid flowery language and purple prose. Do not describe specific physical micro-actions or sensory body-part details. Broad behavioral tendencies are fine (e.g. they may hide from it, they may want to approach it). State plainly whether " + name + " has any sexual feelings towards OTHER_CHARACTER or not, and describe how " + name + " would interact with this pet or wild animal, including whether they would want to care for it, be afraid of it, or want to befriend it. Also note any shifts in " + name + "'s typical personality or behavior caused by this animal's presence."
                            }
                            if (guidanceGivenAllExtraInfo) {
                                baseInstructions += "\n\nThe following information has been provided based on the previous questions and answers:\n\n" + guidanceGivenAllExtraInfo;
                            }
                            if (guidanceGiven) {
                                baseInstructions += "\n\n# MANDATORY REQUIREMENTS — ACTIVE OVERRIDE:\n\nThe following requirements MUST be reflected in your answer. Treat them as hard constraints that take absolute priority over any conflicting instruction above. Do NOT ignore or dilute them:\n\n" + guidanceGiven;
                            }

                            console.log(relationshipKey + "_" + romanticInterestKey + "_" + familyKey + "_" + fineTuneComment + "_description");

                            const guiderResult = await guider.askAccept(
                                { id: relationshipKey + "_" + romanticInterestKey + "_" + familyKey + "_" + fineTuneComment + "_description", reask: redidGuidance, step: true, recalcdefault: true },
                                "Description of a relationship with " + actualFamilyValue + messageAboutAnswersFrom,
                                async () => {
                                    console.log("Generating description for " + relationshipKey + "_" + romanticInterestKey + "_" + familyKey + "_" + fineTuneComment + "_description");
                                    if (originalReferenceDescription && !redidGuidance) {
                                        return originalReferenceDescription;
                                    }
                                    await prime();

                                    const descriptionBehaviour = await generator.next({
                                        maxCharacters: 500,
                                        maxSafetyCharacters: 900,
                                        maxParagraphs: 1,
                                        nextQuestion: "Provide a concise description (2-3 sentences) of how " + name + " feels about and acts towards " + actualFamilyValue + ". Cover their overall attitude and emotional stance, how they typically behave around this person, and importantly any ways their usual personality shifts because of this bond — for example becoming more open, dropping defenses, acting more protective or aggressive, or behaving out of character in some way.",
                                        stopAfter: [],
                                        stopAt: ["\n"],
                                        instructions: baseInstructions,
                                        grammar: "root ::= " + JSON.stringify("Regarding OTHER_CHARACTER " + name + " will treat them like ") + " [a-zA-Z0-9 ,;.'_\\n]+",
                                    });

                                    if (descriptionBehaviour.done) {
                                        throw new Error("Generator ended unexpectedly while generating description for " + relationshipKey + " > " + romanticInterestKey + " > " + familyKey);
                                    }

                                    const actualDescriptionBehavour = replaceOtherCharNameWithPlaceholder(descriptionBehaviour.value.trim(), name);

                                    return actualDescriptionBehavour;

                                    // const descriptionInternalFeelings = await generator.next({
                                    //     maxCharacters: 200,
                                    //     maxSafetyCharacters: 600,
                                    //     maxParagraphs: 1,
                                    //     nextQuestion: "Provide a concise and short one sentence description of how " + name + " feels internally towards " + actualFamilyValue + ". Focus on the emotional and psychological aspects of their perception, rather than physical details. This should capture the essence of their feelings towards this person in a way that informs their interactions and relationship dynamics.",
                                    //     stopAfter: [],
                                    //     stopAt: ["\n"],
                                    //     instructions: baseInstructions,
                                    //     grammar: "root ::= " + JSON.stringify(name + " feels that OTHER_CHARACTER is ") + " [a-zA-Z0-9 ,;.'_\\n]+",
                                    // });

                                    // if (descriptionInternalFeelings.done) {
                                    //     throw new Error("Generator ended unexpectedly while generating description for " + relationshipKey + " > " + romanticInterestKey + " > " + familyKey);
                                    // }

                                    // const actualDescriptionInternalFeelings = replaceOtherCharNameWithPlaceholder(descriptionInternalFeelings.value.trim(), name);

                                    // return actualDescriptionBehavour + "\n\n" + actualDescriptionInternalFeelings;
                                },
                            );
                            if (guiderResult.value === null) {
                                redoGuidance = true;
                                descriptionValue = "";
                                continue;
                            } else {
                                descriptionValue = guiderResult.value.trim();
                                break;
                            }
                        }

                        const useCreepyRomanticPrefixes = isAsexualValue || (familyKey === "family" && !isIncestuousValue);
                        // @ts-ignore
                        const romanticNamePrefix = (useCreepyRomanticPrefixes ? ROMANTIC_PREFIXES_CREEPY : ROMANTIC_PREFIXES)[romanticInterestKey];
                        // @ts-ignore
                        const relationshipNameDefault = romanticNamePrefix + SETTINGS_RELATIONSHIP_NAMES[relationshipKey][familyKey];

                        const relationshipNameResult = await guider.askOpen(
                            relationshipKey + "_" + romanticInterestKey + "_" + familyKey + "_" + fineTuneComment + "_relationship-name",
                            "What is the name of the relationship between " + name + " and " + actualFamilyValue + "?" + (familyKey === "family" ? " You may use the template {{other_family_relation}} which represents the family bond (e.g. cousin, father, mother) of the other character." : ""),
                            relationshipNameDefault,
                        );

                        insertSpecialComment(familySectionDescription.body, fineTune + (attractionLevel !== "n/a" ? "_" + attractionLevel : ""));
                        // @ts-ignore
                        if (fineTuneConditions[fineTune] === "true") {
                            // @ts-ignore
                            familySectionDescription.body.push(`return ${toTemplateLiteral(descriptionValue, name)};`);
                            familySectionRelationshipName.body.push(`return ${toTemplateLiteral(relationshipNameResult.value.trim(), name)};`);
                        } else {
                            // @ts-ignore
                            familySectionDescription.body.push(`if (${getAttractionLevelCondition(fineTuneConditions[fineTune], attractionLevel)}) {`);
                            familySectionDescription.body.push(`return ${toTemplateLiteral(descriptionValue, name)};`);
                            familySectionDescription.body.push(`}`);

                            // @ts-ignore
                            familySectionRelationshipName.body.push(`if (${getAttractionLevelCondition(fineTuneConditions[fineTune], attractionLevel)}) {`);
                            familySectionRelationshipName.body.push(`return ${toTemplateLiteral(relationshipNameResult.value.trim(), name)};`);
                            familySectionRelationshipName.body.push(`}`);
                        }
                    }
                }
            }
        }
    }

    if (isAsexualValue && !hasSpecialComment(optionsSection.body, "bonds-asexual-replacements")) {
        const replacementsForCreepyBond = {
            "deepInLove_50_100": "sexualAbuseInterest_50_100",
            "strongRomanticInterest_35_50": "stalkingInterest_35_50",
            "romanticInterest_20_35": "obsessiveInterest_20_35",
            "slightRomanticInterest_10_20": "creepyInterest_10_20",
            "noRomanticInterest_0_10": "noRomance_0_10",
        }
        /**
         * 
         * @param {Array<*>} lines 
         */
        const applyReplacements = (lines) => {
            for (let i = 0; i < lines.length; i++) {
                let line = lines[i];
                if (typeof line === "string") {
                    Object.entries(replacementsForCreepyBond).forEach(([original, replacement]) => {
                        if (line.includes(original)) {
                            line = line.split(original).join(replacement);
                        }
                    });
                    lines[i] = line;
                } else if (typeof line === "object" && line.type === "section") {
                    Object.entries(replacementsForCreepyBond).forEach(([original, replacement]) => {
                        if (line.commentId.includes(original)) {
                            line.commentId = line.commentId.split(original).join(replacement);
                        }
                    });
                    applyReplacements(line.head);
                    applyReplacements(line.body);
                    applyReplacements(line.foot);
                }
            }
        };
        applyReplacements(optionsSection.body);
        insertSpecialComment(optionsSection.body, "bonds-asexual-replacements");
    }

    if (primed) {
        await generator.next(null); // end the generator
    }
}