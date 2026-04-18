import { DEngine } from '../engine/index.js';
import { createCardStructureFrom, getJsCard, getSection, hasSpecialComment, insertSection, insertSpecialComment, toTemplateLiteral } from './base.js';
import { replaceOtherCharNameWithPlaceholder } from './generate-bond-triggers.js';

if (typeof process !== "undefined" && process.versions && process.versions.node) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

/**
 * @param {DEngine} engine
 * @param {import('./base.js').CardTypeCard} card
 * @param {import('./base.js').CardTypeGuider | null} guider
 * @param {import('./base.js').CardTypeAutoSave | null} autosave
 * @return {Promise<void>}
 */
export async function generateBonds(engine, card, guider, autosave) {
    const inferenceAdapter = engine.inferenceAdapter;
    if (!inferenceAdapter) {
        throw new Error("No inference adapter found on engine");
    }

    const systemPrompt = inferenceAdapter.buildSystemPromptForQuestioningAgent(
        `You are a helpful assistant that will answer and assist in defining a character for a game based on their description, you are allowed free rein to interpret the character's description and generate the code that defines them in the game, you will be asked questions about the character and you should answer them as best as you can`,
        [],
        `# Character Card:\n\n${card.card}`
    );

    const generator = inferenceAdapter.runQuestioningCustomAgentOn("cardtype-gen", {
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

    const isAsexualValue = card.config.isAsexual;
    const name = card.config.name;

    if (!card.config.affectionShowcases) {
        const affectionShowcases = await generator.next({
            maxCharacters: 500,
            maxSafetyCharacters: 500,
            maxParagraphs: 1,
            nextQuestion: `List ${name}'s specific way that they show non-romantic, non-sexual physical affection towards others, as a comma separated list of short 1-3 word items. These should be specific actions or behaviors that ${name} would perform to showcase physical affection. List 7 to 10 unique items.`,
            stopAfter: [],
            stopAt: [],
            instructions: "Each item must be a specific way that " + name + " shows non-romantic affection. Do NOT say generic things like showing affection or being nice to others. We want specific actions or behaviors.",
            answerTrail: name + "'s non-romantic physical affection showcases:\n\n",
        });
        if (affectionShowcases.done) {
            throw new Error("Generator finished without producing output");
        }
        let affectionShowcasesParsed = affectionShowcases.value.split("\n").join(",").split(",").map(item => item.trim().replace("- ", " ").trim()).filter(item => item);

        if (guider) {
            const guiderResult = await guider.askList("Provide a list of specific ways that " + name + " shows non-romantic, non-sexual physical affection towards others", null, affectionShowcasesParsed);
            if (guiderResult.value) {
                affectionShowcasesParsed = guiderResult.value;
            }
        }

        card.config.affectionShowcases = affectionShowcasesParsed;

        await autosave?.save();
    }

    if (!isAsexualValue && !card.config.intimateAffectionShowcases) {
        const intimateAffectionShowcases = await generator.next({
            maxCharacters: 500,
            maxSafetyCharacters: 500,
            maxParagraphs: 1,
            nextQuestion: `List ${name}'s specific way that they show romantic or sexual physical affection towards others, these must be explicit sexual actions, as a comma separated list of short 1-3 word items. These should be specific actions or behaviors that ${name} would perform to showcase sexual physical affection. List 7 to 10 unique items.`,
            stopAfter: [],
            stopAt: [],
            instructions: "Each item must be a specific way that " + name + " shows romantic or sexual physical affection. Do NOT include any of the following " + card.config.affectionShowcases.join(", ") + " as those are non-romantic ways that " + name + " shows physical affection. We want specific romantic or sexual actions or behaviors.",
            answerTrail: name + "'s romantic or sexual physical affection showcases:\n\n",
        });
        if (intimateAffectionShowcases.done) {
            throw new Error("Generator finished without producing output");
        }
        let intimateAffectionShowcasesParsed = intimateAffectionShowcases.value.split("\n").join(",").split(",").map(item => item.trim().replace("- ", " ").trim()).filter(item => item);

        if (guider) {
            const guiderResult = await guider.askList("Provide a list of specific ways that " + name + " shows romantic or sexual physical affection towards others", null, intimateAffectionShowcasesParsed);
            if (guiderResult.value) {
                intimateAffectionShowcasesParsed = guiderResult.value;
            }
        }

        card.config.intimateAffectionShowcases = intimateAffectionShowcasesParsed;

        await autosave?.save();
    }

    const isAttractedToMales = card.config.attractions?.includes("male");
    const isAttractedToFemales = card.config.attractions?.includes("female");

    if (!isAsexualValue && typeof card.config.kinks === "undefined") {
        const kinks = await generator.next({
            maxCharacters: 200,
            maxSafetyCharacters: 200,
            maxParagraphs: 1,
            nextQuestion: `List ${name}'s specific kinks and fetishes as a comma separated list of short 1-2 word items. These must be actual kinks and fetishes, NOT vanilla activities. Do NOT include generic things like cuddling, kissing, hugging, or hand holding. Examples of what we want: bondage, dominance, submission, biting, scratching, rough play, voyeurism, exhibitionism, roleplay, sensory deprivation, choking, hair pulling, praise kink, degradation, pet play, etc. Infer what ${name} would specifically be into based on their personality and background. List 3 to 7 unique items.`,
            stopAfter: [],
            stopAt: [],
            instructions: "Each item must be a specific kink or fetish, not a generic romantic activity. Do NOT say cuddling, kissing, hugging, hand holding, or similar vanilla activities.",
            answerTrail: name + "'s kinks and fetishes:\n\n",
        });
        if (kinks.done) {
            throw new Error("Generator finished without producing output");
        }
        let kinksParsed = kinks.value.split("\n").join(",").split(",").map(kink => kink.trim().replace("- ", " ").trim()).filter(kink => kink);

        if (guider) {
            const guiderResult = await guider.askList("Provide a list of kinks and special sexual/romantic interests for " + name + " (General non-gender specific)", null, kinksParsed);
            if (guiderResult.value) {
                kinksParsed = guiderResult.value;
            }
        }

        card.config.kinks = kinksParsed;

        await autosave?.save();
    }

    if (!isAsexualValue && isAttractedToMales && typeof card.config.kinksForMales === "undefined") {
        const kinksForMales = await generator.next({
            maxCharacters: 200,
            maxSafetyCharacters: 200,
            maxParagraphs: 1,
            nextQuestion: `List ${name}'s specific kinks and fetishes that are exclusive to male partners, as a comma separated list of short 1-3 word items. These must involve male-specific anatomy or secondary sex characteristics (e.g. penis, balls, deep voice, Adam's apple, masculine build, body hair, etc.). These should be things that can ONLY be done with or to a male body. Do NOT include generic kinks. Infer what ${name} would specifically enjoy about male partners based on their personality and background. List 3 to 5 unique items.`,
            stopAfter: [],
            stopAt: [],
            instructions: "Each item must be a kink or fetish specific to male anatomy or male secondary sex characteristics. Do NOT include any of the following general kinks: " + card.config.kinks.join(", ") + ". We want ONLY things exclusive to male bodies. eg. male domination, male smell, things related to male genitalia",
            answerTrail: name + "'s male-specific kinks and fetishes:\n\n",
        });
        if (kinksForMales.done) {
            throw new Error("Generator finished without producing output");
        }
        let kinksForMalesParsed = kinksForMales.value.split("\n").join(",").split(",").map(kink => kink.trim().replace("- ", " ").trim()).filter(kink => kink);

        if (guider) {
            const guiderResult = await guider.askList("Provide a list of kinks specific to male partners for " + name + " (male anatomy/characteristics only)", null, kinksForMalesParsed);
            if (guiderResult.value) {
                kinksForMalesParsed = guiderResult.value;
            }
        }

        card.config.kinksForMales = kinksForMalesParsed;

        await autosave?.save();
    }

    if (!isAsexualValue && isAttractedToFemales && typeof card.config.kinksForFemales === "undefined") {
        const kinksForFemales = await generator.next({
            maxCharacters: 200,
            maxSafetyCharacters: 200,
            maxParagraphs: 1,
            nextQuestion: `List ${name}'s specific kinks and fetishes that are exclusive to female partners, as a comma separated list of short 1-3 word items. These must involve female-specific anatomy or secondary sex characteristics (e.g. breasts, vagina, clitoris, curves, wide hips, soft skin, etc.). These should be things that can ONLY be done with or to a female body. Do NOT include generic kinks. Infer what ${name} would specifically enjoy about female partners based on their personality and background. List 3 to 5 unique items.`,
            stopAfter: [],
            stopAt: [],
            instructions: "Each item must be a kink or fetish specific to female anatomy or female secondary sex characteristics. Do NOT include any of the following general kinks: " + card.config.kinks.join(", ") + ". We want ONLY things exclusive to female bodies, eg. boob-play, dominatrix, pegging, things related to female genitalia",
            answerTrail: name + "'s female-specific kinks and fetishes:\n\n",
        });
        if (kinksForFemales.done) {
            throw new Error("Generator finished without producing output");
        }
        let kinksForFemalesParsed = kinksForFemales.value.split("\n").join(",").split(",").map(kink => kink.trim().replace("- ", " ").trim()).filter(kink => kink);

        if (guider) {
            const guiderResult = await guider.askList("Provide a list of kinks specific to female partners for " + name + " (female anatomy/characteristics only)", null, kinksForFemalesParsed);
            if (guiderResult.value) {
                kinksForFemalesParsed = guiderResult.value;
            }
        }

        card.config.kinksForFemales = kinksForFemalesParsed;

        await autosave?.save();
    }

    if (!isAsexualValue && typeof card.config.reversedKinks === "undefined") {
        const reversedKinks = await generator.next({
            maxCharacters: 200,
            maxSafetyCharacters: 200,
            maxParagraphs: 1,
            nextQuestion: `List specific kinks and fetishes that ${name} would absolutely refuse, find repulsive, or be a hard no, as a comma separated list of short 1-2 word items. These must be actual kinks and fetishes that disgust or repulse ${name}, NOT generic dislikes. Examples: scat, vore, gore, feet worship, infantilism, humiliation, needle play, blood play, etc. Infer what ${name} would specifically hate based on their personality and background. List 5 to 10 unique items.`,
            stopAfter: [],
            stopAt: [],
            instructions: "Each item must be a specific kink or fetish that " + name + " finds repulsive. Do NOT include any of the following as those are things " + name + " enjoys: " + [...card.config.kinks, ...card.config.kinksForMales, ...card.config.kinksForFemales].join(", "),
            answerTrail: name + "'s hard limit kinks and fetishes:\n\n",
        });
        if (reversedKinks.done) {
            throw new Error("Generator finished without producing output");
        }
        let reversedKinksParsed = reversedKinks.value.split(",").map(kink => kink.trim()).filter(kink => kink);

        if (guider) {
            const guiderResult = await guider.askList("Provide a list of kinks and special sexual/romantic interests that " + name + " would find repulsive and be a hard no for them", null, reversedKinksParsed);
            if (guiderResult.value) {
                reversedKinksParsed = guiderResult.value;
            }
        }

        card.config.reversedKinks = reversedKinksParsed;

        await autosave?.save();
    }

    const initializeSection = getSection(card.body, "initialize");

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
    if (!hasSpecialComment(optionsSection.body, "bonds-incestuous")) {
        if (!isAsexualValue) {
            await prime();
            const isIncestuous = await generator.next({
                maxCharacters: 5,
                maxSafetyCharacters: 0,
                maxParagraphs: 1,
                nextQuestion: "Does " + name + " have an incestuous attraction towards family members? Answer with yes or no.",
                stopAfter: [],
                stopAt: [],
                grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`,
            });

            if (isIncestuous.done) {
                throw new Error("Generator finished without producing output");
            }

            isIncestuousValue = isIncestuous.value.trim().toLowerCase() === "yes";
        }

        if (guider) {
            const guiderResponse = await guider.askBoolean("Should family relationships be excluded from romantic possibilities for " + name + "?", !isIncestuousValue);
            if (guiderResponse.value === false) {
                isIncestuousValue = true;
            } else {
                isIncestuousValue = false;
            }
        }

        card.config.isIncestuous = isIncestuousValue;
        insertSpecialComment(optionsSection.body, "bonds-incestuous");
        await autosave?.save();
    } else {
        isIncestuousValue = card.config.isIncestuous || false;
    }

    if (!hasSpecialComment(optionsSection.body, "bonds-type")) {
        optionsSection.body.push(isAsexualValue ? `type: "4d_creepy",` : `type: "4d_standard",`);
        if (isIncestuousValue) {
            optionsSection.body.push(`familyCreepy: false,`);
        } else {
            optionsSection.body.push(`familyCreepy: true,`);
        }
        insertSpecialComment(optionsSection.body, "bonds-type");
        await autosave?.save();
    }

    const fineTunesDescriptions = {
        "any_character": `Any character regardless of species, gender, or attraction`,

        "humanoid_character_male_na": `A MALE human or humanoid character (Non physically attractive for ${name})`,
        "humanoid_character_male_a": `A MALE human or humanoid character ([] for ${name})`,
        "humanoid_character_female_na": `A FEMALE human or humanoid character (Non physically attractive for ${name})`,
        "humanoid_character_female_a": `A FEMALE human or humanoid character ([] for ${name})`,
        "humanoid_character_ambiguous_na": "A human or humanoid character with AMBIGUOUS gender (Non physically attractive for " + name + ")",
        "humanoid_character_ambiguous_a": "A human or humanoid character with AMBIGUOUS gender ([] for " + name + ")",
        "humanoid_character_any_na": `A human or humanoid character of any gender/sex (Non physically attractive for ${name})`,
        "animal_character_male_na": card.config.characterSpeciesType === "animal" ? "Another animal, a MALE (Non physically attractive for " + name + ")" : "A MALE animal, a pet or wild creature without verbal capabilities (Non physically attractive for " + name + ")",
        "animal_character_male_a": card.config.characterSpeciesType === "animal" ? "Another animal, a MALE ([] for " + name + ")" : "A MALE animal, a pet or wild creature without verbal capabilities ([] for " + name + ")",
        "animal_character_female_na": card.config.characterSpeciesType === "animal" ? "Another animal, a FEMALE (Non physically attractive for " + name + ")" : "A FEMALE animal, a pet or wild creature without verbal capabilities (Non physically attractive for " + name + ")",
        "animal_character_female_a": card.config.characterSpeciesType === "animal" ? "Another animal, a FEMALE ([] for " + name + ")" : "A FEMALE animal, a pet or wild creature without verbal capabilities ([] for " + name + ")",
        "animal_character_ambiguous_na": card.config.characterSpeciesType === "animal" ? "Another animal with AMBIGUOUS gender (Non physically attractive for " + name + ")" : "An animal with AMBIGUOUS gender, a pet or wild creature without verbal capabilities (Non physically attractive for " + name + ")",
        "animal_character_ambiguous_a": card.config.characterSpeciesType === "animal" ? "Another animal with AMBIGUOUS gender ([] for " + name + ")" : "An animal with AMBIGUOUS gender, a pet or wild creature without verbal capabilities ([] for " + name + ")",
        "animal_character_any_na": card.config.characterSpeciesType === "animal" ? "Another animal of any gender/sex (Non physically attractive for " + name + ")" : "An animal of any gender/sex, a pet or wild creature without verbal capabilities (Non physically attractive for " + name + ")",
        "feral_character_male_na": card.config.characterSpeciesType === "feral" ? "Another creature with evolved cognitive abilities but in a bestial or feral form, a MALE one (Non physically attractive for " + name + ")" : "A MALE creature with evolved cognitive abilities but in a bestial or feral form (Non physically attractive for " + name + ")",
        "feral_character_male_a": card.config.characterSpeciesType === "feral" ? "Another creature with evolved cognitive abilities but in a bestial or feral form, a MALE one ([] for " + name + ")" : "A MALE creature with evolved cognitive abilities but in a bestial or feral form ([] for " + name + ")",
        "feral_character_female_na": card.config.characterSpeciesType === "feral" ? "Another creature with evolved cognitive abilities but in a bestial or feral form, a FEMALE one (Non physically attractive for " + name + ")" : "A FEMALE creature with evolved cognitive abilities but in a bestial or feral form (Non physically attractive for " + name + ")",
        "feral_character_female_a": card.config.characterSpeciesType === "feral" ? "Another creature with evolved cognitive abilities but in a bestial or feral form, a FEMALE one ([] for " + name + ")" : "A FEMALE creature with evolved cognitive abilities but in a bestial or feral form ([] for " + name + ")",
        "feral_character_ambiguous_na": card.config.characterSpeciesType === "feral" ? "Another creature with evolved cognitive abilities but in a bestial or feral form, with AMBIGUOUS gender (Non physically attractive for " + name + ")" : "A creature with evolved cognitive abilities but in a bestial or feral form with AMBIGUOUS gender (Non physically attractive for " + name + ")",
        "feral_character_ambiguous_a": card.config.characterSpeciesType === "feral" ? "Another creature with evolved cognitive abilities but in a bestial or feral form, with AMBIGUOUS gender ([] for " + name + ")" : "A creature with evolved cognitive abilities but in a bestial or feral form with AMBIGUOUS gender ([] for " + name + ")",
        "feral_character_any_na": card.config.characterSpeciesType === "feral" ? "Another creature with evolved cognitive abilities but in a bestial or feral form of any gender/sex (Non physically attractive for " + name + ")" : "A creature with evolved cognitive abilities but in a bestial or feral form of any gender/sex (Non physically attractive for " + name + ")",
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

        "humanoid_character_male_na": "info.other.speciesType === \"humanoid\" && info.other.gender === \"male\"",
        "humanoid_character_male_a": "info.other.speciesType === \"humanoid\" && info.other.gender === \"male\" && DE.utils.isAttractedToWithLevel(info.char, info.other) === []",
        "humanoid_character_female_na": "info.other.speciesType === \"humanoid\" && info.other.gender === \"female\"",
        "humanoid_character_female_a": "info.other.speciesType === \"humanoid\" && info.other.gender === \"female\" && DE.utils.isAttractedToWithLevel(info.char, info.other) === []",
        "humanoid_character_ambiguous_na": "info.other.speciesType === \"humanoid\" && info.other.gender === \"ambiguous\"",
        "humanoid_character_ambiguous_a": "info.other.speciesType === \"humanoid\" && info.other.gender === \"ambiguous\" && DE.utils.isAttractedToWithLevel(info.char, info.other) === []",
        "humanoid_character_any_na": "info.other.speciesType === \"humanoid\"",
        "animal_character_male_na": "info.other.speciesType === \"animal\" && info.other.gender === \"male\"",
        "animal_character_male_a": "info.other.speciesType === \"animal\" && info.other.gender === \"male\" && DE.utils.isAttractedToWithLevel(info.char, info.other) === []",
        "animal_character_female_na": "info.other.speciesType === \"animal\" && info.other.gender === \"female\"",
        "animal_character_female_a": "info.other.speciesType === \"animal\" && info.other.gender === \"female\" && DE.utils.isAttractedToWithLevel(info.char, info.other) === []",
        "animal_character_ambiguous_na": "info.other.speciesType === \"animal\" && info.other.gender === \"ambiguous\"",
        "animal_character_ambiguous_a": "info.other.speciesType === \"animal\" && info.other.gender === \"ambiguous\" && DE.utils.isAttractedToWithLevel(info.char, info.other) === []",
        "animal_character_any_na": "info.other.speciesType === \"animal\"",
        "feral_character_male_na": "info.other.speciesType === \"feral\" && info.other.gender === \"male\"",
        "feral_character_male_a": "info.other.speciesType === \"feral\" && info.other.gender === \"male\" && DE.utils.isAttractedToWithLevel(info.char, info.other) === []",
        "feral_character_female_na": "info.other.speciesType === \"feral\" && info.other.gender === \"female\"",
        "feral_character_female_a": "info.other.speciesType === \"feral\" && info.other.gender === \"female\" && DE.utils.isAttractedToWithLevel(info.char, info.other) === []",
        "feral_character_ambiguous_na": "info.other.speciesType === \"feral\" && info.other.gender === \"ambiguous\"",
        "feral_character_ambiguous_a": "info.other.speciesType === \"feral\" && info.other.gender === \"ambiguous\" && DE.utils.isAttractedToWithLevel(info.char, info.other) === []",
        "feral_character_any_na": "info.other.speciesType === \"feral\"",

        "family_character_male_na": "info.other.gender === \"male\"",
        "family_character_male_a": "info.other.gender === \"male\" && DE.utils.isAttractedToWithLevel(info.char, info.other) === []",
        "family_character_female_na": "info.other.gender === \"female\"",
        "family_character_female_a": "info.other.gender === \"female\" && DE.utils.isAttractedToWithLevel(info.char, info.other) === []",
        "family_character_ambiguous_na": "info.other.gender === \"ambiguous\"",
        "family_character_ambiguous_a": "info.other.gender === \"ambiguous\" && DE.utils.isAttractedToWithLevel(info.char, info.other) === []",
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
        if (card.config.characterSpeciesType === "humanoid") {
            defaultFineTunes.push("humanoid_character_male_na");
            if (card.config.attractions.includes("male")) {
                defaultFineTunes.push("humanoid_character_male_a");
                defaultFineTunesAfterRomanticInterest.push("humanoid_character_male_a");
            }
            defaultFineTunes.push("humanoid_character_female_na");
            if (card.config.attractions.includes("female")) {
                defaultFineTunes.push("humanoid_character_female_a");
                defaultFineTunesAfterRomanticInterest.push("humanoid_character_female_a");
            }
            defaultFineTunes.push("humanoid_character_ambiguous_na");
            if (card.config.attractions.includes("ambiguous")) {
                defaultFineTunes.push("humanoid_character_ambiguous_a");
                defaultFineTunesAfterRomanticInterest.push("humanoid_character_ambiguous_a");
            }
        } else {
            defaultFineTunes.push("humanoid_character_any_na");
        }

        if (card.config.characterSpeciesType === "animal") {
            defaultFineTunes.push("animal_character_male_na");
            if (card.config.attractions.includes("male")) {
                defaultFineTunes.push("animal_character_male_a");
                defaultFineTunesAfterRomanticInterest.push("animal_character_male_a");
            }
            defaultFineTunes.push("animal_character_female_na");
            if (card.config.attractions.includes("female")) {
                defaultFineTunes.push("animal_character_female_a");
                defaultFineTunesAfterRomanticInterest.push("animal_character_female_a");
            }
            defaultFineTunes.push("animal_character_ambiguous_na");
            if (card.config.attractions.includes("ambiguous")) {
                defaultFineTunes.push("animal_character_ambiguous_a");
                defaultFineTunesAfterRomanticInterest.push("animal_character_ambiguous_a");
            }
        } else {
            defaultFineTunes.push("animal_character_any_na");
        }

        if (card.config.characterSpeciesType === "feral") {
            defaultFineTunes.push("feral_character_male_na");
            if (card.config.attractions.includes("male")) {
                defaultFineTunes.push("feral_character_male_a");
                defaultFineTunesAfterRomanticInterest.push("feral_character_male_a");
            }
            defaultFineTunes.push("feral_character_female_na");
            if (card.config.attractions.includes("female")) {
                defaultFineTunes.push("feral_character_female_a");
                defaultFineTunesAfterRomanticInterest.push("feral_character_female_a");
            }
            defaultFineTunes.push("feral_character_ambiguous_na");
            if (card.config.attractions.includes("ambiguous")) {
                defaultFineTunes.push("feral_character_ambiguous_a");
                defaultFineTunesAfterRomanticInterest.push("feral_character_ambiguous_a");
            }
        } else {
            defaultFineTunes.push("feral_character_any_na");
        }

        defaultFineTunes = defaultFineTunes.sort(sortAEndingFirst);

        defaultFineTunes.push("any_character");
        defaultFineTunesAfterRomanticInterest.push("any_character");

        if (isIncestuousValue) {
            defaultFamilyFineTunes.push("family_character_male_na");
            if (card.config.attractions.includes("male")) {
                defaultFamilyFineTunes.push("family_character_male_a");
                defaultFamilyFineTunesAfterRomanticInterest.push("family_character_male_a");
            }
            defaultFamilyFineTunes.push("family_character_female_na");
            if (card.config.attractions.includes("female")) {
                defaultFamilyFineTunes.push("family_character_female_a");
                defaultFamilyFineTunesAfterRomanticInterest.push("family_character_female_a");
            }
            defaultFamilyFineTunes.push("family_character_ambiguous_na");
            if (card.config.attractions.includes("ambiguous")) {
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


    let selectedFineTunes = card.config.bondsFineTunes || defaultFineTunes;
    let selectedFamilyFineTunes = card.config.bondsFamilyFineTunes || defaultFamilyFineTunes;
    let selectedFineTunesAfterRomanticInterest = card.config.bondsFineTunesAfterRomanticInterest || defaultFineTunesAfterRomanticInterest;
    let selectedFamilyFineTunesAfterRomanticInterest = card.config.bondsFamilyFineTunesAfterRomanticInterest || defaultFamilyFineTunesAfterRomanticInterest;

    const selectFineTunes = async () => {
        if (guider) {
            const value = await guider.askList(
                "Select the fine-tunes that best fit " + name + " and the relationships they can build, or add your own (these will be used to determine the types of bonds " + name + " forms with other characters, and how they interact with them)\n\n" +
                "Note that these fine tunes will have no effect if no such bond or attraction can be formed based on the previously selected potential attractions for " + name,
                fineTunesRecord,
                // @ts-ignore
                selectedFineTunes.filter((v) => v !== "any_character").map(key => fineTunesDesriptionsForList[key])
            );

            selectedFineTunes = [];
            value.value.map(val => {
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

            card.config.bondsFineTunes = selectedFineTunes;
            await autosave?.save();
        } else {
            selectedFineTunes = defaultFineTunes;
        }
    }

    if (!card.config.bondsFineTunes) {
        await selectFineTunes();
    }

    const selectFineTunesAfterRomanticInterest = async () => {
        if (guider) {
            const value = await guider.askList(
                "Select the fine-tunes that best fit " + name + "'s romantic and sexual attractions they can build, or add your own (these will be used to determine the types of romantic bonds " + name + " forms with other characters, and how they interact with them)\n\n" +
                "Note that these fine tunes will have no effect if no such bond or attraction can be formed based on the previously selected potential attractions for " + name,
                fineTunesRecord,
                // @ts-ignore
                selectedFineTunesAfterRomanticInterest.filter((v) => v !== "any_character").map(key => fineTunesDesriptionsForList[key])
            );

            selectedFineTunesAfterRomanticInterest = [];
            value.value.map(val => {
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

            card.config.bondsFineTunesAfterRomanticInterest = selectedFineTunesAfterRomanticInterest;
            await autosave?.save();
        } else {
            selectedFineTunesAfterRomanticInterest = defaultFineTunesAfterRomanticInterest;
        }
    }

    if (!card.config.bondsFineTunesAfterRomanticInterest) {
        await selectFineTunesAfterRomanticInterest();
    }

    const selectFamilyFineTunes = async () => {
        if (guider) {
            const value = await guider.askList(
                "Select the fine-tunes that best fit " + name + "'s relationship with family, or add your own (these will be used to determine the types of bonds " + name + " forms with other family members, and how they interact with them)\n\n" +
                "Note that these fine tunes will have no effect if no such bond can be formed for " + name,
                fineTunesFamilyRecord,
                // @ts-ignore
                selectedFamilyFineTunes.filter((v) => v !== "any_family_character").map(key => fineTunesDescriptionsFamilyForList[key])
            );

            selectedFamilyFineTunes = [];
            value.value.map(val => {
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

            card.config.bondsFamilyFineTunes = selectedFamilyFineTunes;
            if (!isIncestuousValue) {
                card.config.bondsFamilyFineTunesAfterRomanticInterest = selectedFamilyFineTunes;
                selectedFamilyFineTunesAfterRomanticInterest = selectedFamilyFineTunes;
            }
            await autosave?.save();
        } else {
            selectedFamilyFineTunes = defaultFamilyFineTunes;
            if (!isIncestuousValue) {
                selectedFamilyFineTunesAfterRomanticInterest = defaultFamilyFineTunesAfterRomanticInterest;
            }
        }
    }

    if (!card.config.bondsFamilyFineTunes) {
        await selectFamilyFineTunes();
    }

    const selectFamilyFineTunesAfterRomanticInterest = async () => {
        if (guider) {
            const value = await guider.askList(
                "Select the fine-tunes that best fit " + name + "'s relationship with family after they have a romantic interest, or add your own (these will be used to determine the types of bonds " + name + " forms with other family members, and how they interact with them)\n\n" +
                "Note that these fine tunes will have no effect if no such bond can be formed for " + name,
                fineTunesFamilyRecord,
                // @ts-ignore
                selectedFamilyFineTunesAfterRomanticInterest.filter((v) => v !== "any_family_character").map(key => fineTunesDescriptionsFamilyForList[key])
            );

            selectedFamilyFineTunesAfterRomanticInterest = [];
            value.value.map(val => {
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

            card.config.bondsFamilyFineTunesAfterRomanticInterest = selectedFamilyFineTunesAfterRomanticInterest;
            await autosave?.save();
        } else {
            selectedFamilyFineTunesAfterRomanticInterest = defaultFamilyFineTunes;
        }
    }

    if (!card.config.bondsFamilyFineTunesAfterRomanticInterest && isIncestuousValue) {
        await selectFamilyFineTunesAfterRomanticInterest();
    }


    let wouldUseViolenceTowardsEnemiesValue = false;
    if (!hasSpecialComment(optionsSection.body, "bonds-violence")) {
        await prime();
        const wouldUseViolenceTowardsEnemies = await generator.next({
            maxCharacters: 5,
            maxSafetyCharacters: 0,
            maxParagraphs: 1,
            nextQuestion: "If " + name + " has an extremely hostile and abusive relationship with another character, would they be willing use violence towards that character if they had the opportunity? Answer with yes or no.",
            stopAfter: [],
            stopAt: [],
            grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`,
        });

        if (wouldUseViolenceTowardsEnemies.done) {
            throw new Error("Generator finished without producing output");
        }

        wouldUseViolenceTowardsEnemiesValue = wouldUseViolenceTowardsEnemies.value.trim().toLowerCase() === "yes";

        if (guider) {
            const guiderResponse = await guider.askBoolean("Would " + name + " use violence towards people they have a hostile relationship with?", wouldUseViolenceTowardsEnemiesValue);
            if (guiderResponse.value === false) {
                wouldUseViolenceTowardsEnemiesValue = false;
            } else {
                wouldUseViolenceTowardsEnemiesValue = true;
            }
        }

        card.config.wouldUseViolence = wouldUseViolenceTowardsEnemiesValue;
        insertSpecialComment(optionsSection.body, "bonds-violence");
        await autosave?.save();
    } else {
        wouldUseViolenceTowardsEnemiesValue = card.config.wouldUseViolence || false;
    }

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

    const STRANGERS = {
        "strangerNeutral_n5_5": "a stranger, {} that " + name + " just met and has no feelings towards them either positive or negative",
        "strangerGood_5_100": "a stranger, {} that " + name + " just met but has already formed a good impression of and has positive feelings towards them",
        "strangerBad_n100_n5": "a stranger, {} that " + name + " just met but has already formed a bad impression of and has negative feelings towards them",
    };

    const FINE_TUNE_WITH_ATTRACTION_POTENTIAL_TO_DESCRIPTION = [
        "SLIGHTLY Physically Attractive for " + name + ", a minor level of attraction but there nonetheless",
        "MODERATELY Physically Attractive for " + name + ", a clear and noticeable level of attraction that influences how they perceive and feel about this person",
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
    const getDeeperFineTuneDescription = (fineTuneRaw, v) => {
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
    const getDeeperFineTuneCondition = (fineTuneConditionRaw, v) => {
        if (!v || v === "n/a") {
            return fineTuneConditionRaw;
        }

        return fineTuneConditionRaw.replace("[]", JSON.stringify(v));
    }

    const MODIFIERS_INTIMACY = {
        "In public around friends": {
            condition: "DE.utils.isAroundFriendsOrBetter(char, {exclude: other, excludeFamily: true})",
            reasonYes: "they are around friends",
            reasonNo: "they are around friends, and that makes it uncomfortable"
        },
        "In public around family": {
            condition: "DE.utils.isAroundFamily(char, {exclude: other})",
            reasonYes: "they are around family members",
            reasonNo: "they are around family members, and that makes it uncomfortable"
        },
        "In private": {
            condition: "DE.utils.isAloneWith(char, other) && DE.utils.isInPrivateLocation(char)",
            reasonYes: "they are alone together in a private location",
            reasonNo: "they are alone together in a private location",
        },
        "In public": {
            condition: "true",
            reasonYes: "they are in public",
            reasonNo: "they are in public",
        },
    };

    const MODIFIERS_INTIMACY_ORDER = [
        "In private",
        "In public around friends",
        "In public around family",
        "In public",
    ];

    for (const [strangerKey, strangerValue] of Object.entries(STRANGERS)) {

        const strangerSectionBase = insertSection(optionsSection.body, strangerKey, (s) => {
            s.head.push(`${strangerKey}: {`);
            s.head.push(`relationshipName: null,`);
            s.foot.push(`},`);
        });

        const strangerSectionDescription = insertSection(strangerSectionBase.body, "description", (s) => {
            s.head.push(`description: (DE, info) => {`);
            s.foot.push(`},`);
        });

        const strangerSectionOpenToAffection = insertSection(strangerSectionBase.body, "openToAffection", (s) => {
            s.head.push(`openToAffection: (DE, char, other) => {`);
            s.foot.push(`},`);
        });

        const strangerSectionOpenToIntimateAffection = insertSection(strangerSectionBase.body, "openToIntimateAffection", (s) => {
            s.head.push(`openToIntimateAffection: (DE, char, other) => {`);
            s.foot.push(`},`);
        });

        const strangerSectionOpenToSex = insertSection(strangerSectionBase.body, "openToSex", (s) => {
            s.head.push(`openToSex: (DE, char, other) => {`);
            s.foot.push(`},`);
        });

        const strangerSectionProneToInitiatingAffection = insertSection(strangerSectionBase.body, "proneToInitiatingAffection", (s) => {
            s.head.push(`proneToInitiatingAffection: (DE, char, other) => {`);
            s.foot.push(`},`);
        });

        const strangerSectionProneToInitiatingIntimateAffection = insertSection(strangerSectionBase.body, "proneToInitiatingIntimateAffection", (s) => {
            s.head.push(`proneToInitiatingIntimateAffection: (DE, char, other) => {`);
            s.foot.push(`},`);
        });

        const strangerSectionProneToInitiatingSex = insertSection(strangerSectionBase.body, "proneToInitiatingSex", (s) => {
            s.head.push(`proneToInitiatingSex: (DE, char, other) => {`);
            s.foot.push(`},`);
        });

        for (const fineTune of selectedFineTunes) {
            /**
             * @type {string}
             */
            let fineTuneValueOriginal =
                // @ts-ignore
                fineTunesDescriptions[fineTune];

            /**
             * @type {Array<"n/a" | "slight" | "moderate" | "strong">}
             */
            let internalFineTuneToUse = fineTune.endsWith("_a") ? FINE_TUNE_WITH_ATTRACTION_POTENTIALS_STRANGER : ["n/a"];

            for (const deeperFineTune of internalFineTuneToUse) {
                if (hasSpecialComment(strangerSectionBase.body, fineTune + (deeperFineTune !== "n/a" ? "_" + deeperFineTune : ""))) {
                    continue;
                }

                const fineTuneValue = getDeeperFineTuneDescription(fineTuneValueOriginal, deeperFineTune);

                const actualStrangerValue = strangerValue.replace("{}", fineTuneValue);

                let allExtraInfo = "";

                // First openToAffection for each intimacy modifier
                let extraInfoOpenToAffection = "";
                let allIsNotReceptive = true;
                // @ts-ignore
                if (fineTuneConditions[fineTune] !== "true") {
                    // @ts-ignore
                    strangerSectionOpenToAffection.body.push(`if (${getDeeperFineTuneCondition(fineTuneConditions[fineTune], deeperFineTune)}) {`);
                }
                for (const intimateModifier of MODIFIERS_INTIMACY_ORDER) {
                    const openToAffectionQuestion = "How receptive to affection is " + name + " towards " + actualStrangerValue + " when they are " + intimateModifier.toLowerCase() + "?";
                    const answer = await generator.next({
                        maxCharacters: 50,
                        maxSafetyCharacters: 0,
                        maxParagraphs: 1,
                        nextQuestion: openToAffectionQuestion,
                        stopAfter: [],
                        stopAt: [],
                        instructions: "Answer with one of the following options: 'Not receptive', 'Slightly receptive', 'Moderately receptive', 'Very receptive'. Consider the nature of the relationship and the specific modifier of intimacy when determining the level of openness to affection.",
                    });

                    if (answer.done) {
                        throw new Error("Generator ended unexpectedly while generating openToAffection for " + strangerKey);
                    }

                    if (guider) {
                        const guiderResult = await guider.askOption("How receptive to affection is " + name + " towards " + actualStrangerValue + " when they are " + intimateModifier.toLowerCase(), [
                            "Not receptive",
                            "Slightly receptive",
                            "Moderately receptive",
                            "Very receptive",
                        ], answer.value);
                        if (guiderResult.value) {
                            answer.value = guiderResult.value;
                        }
                    }

                    const answerTrimmed = answer.value.trim().toLowerCase();
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
                    let reason = null;
                    if (valueAnswer === "not") {
                        reason = modifierInfo.reasonNo;
                    } else {
                        reason = modifierInfo.reasonYes;
                    }
                    strangerSectionOpenToAffection.body.push(`return {value: ${JSON.stringify(valueAnswer)}, reason: ${JSON.stringify(reason)}};`);
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
                    strangerSectionOpenToIntimateAffection.body.push(`if (${getDeeperFineTuneCondition(fineTuneConditions[fineTune], deeperFineTune)}) {`);
                }
                for (const intimateModifier of MODIFIERS_INTIMACY_ORDER) {
                    const openToIntimateAffectionQuestion = "How receptive to intimate affection is " + name + " towards " + actualStrangerValue + " when they are " + intimateModifier.toLowerCase() + "?";
                    const answer = await generator.next({
                        maxCharacters: 50,
                        maxSafetyCharacters: 0,
                        maxParagraphs: 1,
                        nextQuestion: openToIntimateAffectionQuestion,
                        stopAfter: [],
                        stopAt: [],
                        instructions: "Answer with one of the following options: 'Not receptive', 'Slightly receptive', 'Moderately receptive', 'Very receptive'. Consider the nature of the relationship and the specific modifier of intimacy when determining the level of openness to intimate affection.",
                    });

                    if (answer.done) {
                        throw new Error("Generator ended unexpectedly while generating openToIntimateAffection for " + strangerKey);
                    }

                    if (guider) {
                        const guiderResult = await guider.askOption("How receptive to intimate affection is " + name + " towards " + actualStrangerValue + " when they are " + intimateModifier.toLowerCase(), [
                            "Not receptive",
                            "Slightly receptive",
                            "Moderately receptive",
                            "Very receptive",
                        ], answer.value);
                        if (guiderResult.value) {
                            answer.value = guiderResult.value;
                        }
                    }

                    const answerTrimmed = answer.value.trim().toLowerCase();
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
                    let reason = null;
                    if (valueAnswer === "not") {
                        reason = modifierInfo.reasonNo;
                    } else {
                        reason = modifierInfo.reasonYes;
                    }
                    strangerSectionOpenToIntimateAffection.body.push(`return {value: ${JSON.stringify(valueAnswer)}, reason: ${JSON.stringify(reason)}};`);
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
                    strangerSectionOpenToSex.body.push(`if (${getDeeperFineTuneCondition(fineTuneConditions[fineTune], deeperFineTune)}) {`);
                }
                for (const intimateModifier of MODIFIERS_INTIMACY_ORDER) {
                    const openToSexQuestion = "How receptive to sex is " + name + " towards " + actualStrangerValue + " when they are " + intimateModifier.toLowerCase() + "?";
                    const answer = await generator.next({
                        maxCharacters: 50,
                        maxSafetyCharacters: 0,
                        maxParagraphs: 1,
                        nextQuestion: openToSexQuestion,
                        stopAfter: [],
                        stopAt: [],
                        instructions: "Answer with one of the following options: 'Not receptive', 'Slightly receptive', 'Moderately receptive', 'Very receptive'. Consider the nature of the relationship and the specific modifier of intimacy when determining the level of openness to sex.",
                    });

                    if (answer.done) {
                        throw new Error("Generator ended unexpectedly while generating openToSex for " + strangerKey);
                    }

                    if (guider) {
                        const guiderResult = await guider.askOption("How receptive to sex is " + name + " towards " + actualStrangerValue + " when they are " + intimateModifier.toLowerCase(), [
                            "Not receptive",
                            "Slightly receptive",
                            "Moderately receptive",
                            "Very receptive",
                        ], answer.value);
                        if (guiderResult.value) {
                            answer.value = guiderResult.value;
                        }
                    }

                    const answerTrimmed = answer.value.trim().toLowerCase();
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
                    let reason = null;
                    if (valueAnswer === "not") {
                        reason = modifierInfo.reasonNo;
                    } else {
                        reason = modifierInfo.reasonYes;
                    }
                    strangerSectionOpenToSex.body.push(`return {value: ${JSON.stringify(valueAnswer)}, reason: ${JSON.stringify(reason)}};`);
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

                let guidanceGiven = allExtraInfo;
                let redoGuidance = false;
                let descriptionValueUnprocessed = "";
                let descriptionValue = "";
                while (true) {
                    if (guider && redoGuidance) {
                        const guiderResult = await guider.askOpen("What are some important things to keep in mind when writing about a relationship with " + actualStrangerValue + " in the context of " + name + "'s character and personality?", guidanceGiven);
                        if (guiderResult) {
                            guidanceGiven = guiderResult.value.trim();
                        }
                        redoGuidance = false;
                    }

                    const isAnimalFineTune = fineTune.startsWith("animal_");
                    let baseInstructions = "NEVER ask for clarification or more information. ALWAYS directly write the description short paragraph. Invent any specific details as needed. The response should use the word 'OTHER_CHARACTER' to refer to the other character name, ensure to specify whether " + name + " has any romantic feelings towards OTHER_CHARACTER or not, and how they would feel or react regarding sexual interactions, intimacy and other interactions, include friendship, emotional, romantic and sexual aspects"
                    if (isAnimalFineTune && card.config.characterSpeciesType !== "animal") {
                        baseInstructions = "NEVER ask for clarification or more information. ALWAYS directly write the description short paragraph. Invent any specific details as needed. The response should use the word 'OTHER_CHARACTER' to refer to the animal (pet or wild beast) in question, ensure to specify whether " + name + " would have any sexual feelings towards OTHER_CHARACTER or not, and otherwise describe their relationship in terms of how " + name + " would interact with this pet or wild animal, including whether they would want to care for it, be afraid of it, want to befriend it."
                    }
                    if (guidanceGiven) {
                        baseInstructions += "\n\n# MANDATORY REQUIREMENTS — ACTIVE OVERRIDE:\n\nThe following requirements MUST be reflected in your answer. Treat them as hard constraints that take absolute priority over any conflicting instruction above. Do NOT ignore or dilute them:\n\n" + guidanceGiven;
                    }
                    await prime();
                    const descriptionQuestion = await generator.next({
                        maxCharacters: 200,
                        maxSafetyCharacters: 0,
                        maxParagraphs: 1,
                        nextQuestion: "Provide a concise and short one paragraph description of how " + name + " perceives and feels about " + actualStrangerValue + ". Focus on the emotional and psychological aspects of their perception, rather than physical details. This should capture the essence of their feelings and attitudes towards this person in a way that informs their interactions and relationship dynamics. Keep the paragraph short, ideally under 100 words.",
                        stopAfter: [],
                        stopAt: [],
                        instructions: baseInstructions,
                    });

                    if (descriptionQuestion.done) {
                        throw new Error("Generator ended unexpectedly while generating description for " + strangerKey);
                    }
                    descriptionValueUnprocessed = descriptionQuestion.value.trim();

                    if (descriptionValueUnprocessed.includes("OTHER_CHARACTER") || descriptionValueUnprocessed.includes("OTHER CHARACTER")) {
                        descriptionValue = replaceOtherCharNameWithPlaceholder(descriptionValueUnprocessed, name);
                        if (guider) {
                            const guiderResult = await guider.askAccept("Description of a relationship with " + actualStrangerValue, descriptionValue);
                            if (guiderResult.value === null) {
                                redoGuidance = true;
                                descriptionValue = "";
                                continue;
                            } else {
                                descriptionValue = guiderResult.value.trim();
                                break;
                            }
                        } else {
                            break;
                        }
                    }
                }

                insertSpecialComment(strangerSectionDescription.body, fineTune + (deeperFineTune !== "n/a" ? "_" + deeperFineTune : ""));
                // @ts-ignore
                if (fineTuneConditions[fineTune] === "true") {
                    // @ts-ignore
                    strangerSectionDescription.body.push(`return ${toTemplateLiteral(descriptionValue)};`);
                } else {
                    // @ts-ignore
                    strangerSectionDescription.body.push(`if (${getDeeperFineTuneCondition(fineTuneConditions[fineTune], deeperFineTune)}) {`);
                    strangerSectionDescription.body.push(`return ${toTemplateLiteral(descriptionValue)};`);
                    strangerSectionDescription.body.push(`}`);
                }

                await autosave?.save();
            }
        }
    }

    for (const [relationshipKey, relationshipValue] of Object.entries(SETTINGS)) {

        const relationshipsSection = insertSection(optionsSection.body, relationshipKey, (s) => {
            s.head.push(`${relationshipKey}: {`);
            s.foot.push(`},`);
        });

        for (const [romanticInterestKey, romanticInterestValue] of Object.entries(relationshipValue)) {

            const romanticInterestSection = insertSection(relationshipsSection.body, romanticInterestKey, (s) => {
                s.head.push(`${romanticInterestKey}: {`);
                s.foot.push(`},`);
            });

            for (const [familyKey, familyValue] of Object.entries(romanticInterestValue)) {

                const familySection = insertSection(romanticInterestSection.body, familyKey, (s) => {
                    s.head.push(`${familyKey}: {`);
                    s.head.push(`relationshipName: null, // fill if you want this relationship to have a name`);
                    s.head.push(`description: (DE, info) => {`);
                    s.foot.push(`},`);
                    s.foot.push(`},`);
                });

                let fineTuneListToUse = familyKey === "family" ? selectedFamilyFineTunes : selectedFineTunes;
                if (romanticInterestKey !== "noRomanticInterest_0_10") {
                    fineTuneListToUse = familyKey === "family" ? selectedFamilyFineTunesAfterRomanticInterest : selectedFineTunesAfterRomanticInterest;
                }

                for (const fineTune of fineTuneListToUse) {
                    let fineTuneValueOriginal =
                        // @ts-ignore
                        (familyKey === "family" ? fineTuneDescriptionsFamily : fineTunesDescriptions)[fineTune];

                    /**
                     * @type {Array<"n/a" | "slight" | "moderate" | "strong">}
                     */
                    let internalFineTuneToUse = fineTune.endsWith("_a") ? FINE_TUNE_WITH_ATTRACTION_POTENTIALS_BASIC_FRIENDSHIP_FOESHIP : ["n/a"];
                    if (fineTune.endsWith("_a")) {
                        if (romanticInterestKey === "slightRomanticInterest_10_20") {
                            internalFineTuneToUse = FINE_TUNE_WITH_ATTRACTION_POTENTIALS_SLIGHT_ROMANTIC_INTEREST;
                        } else if (romanticInterestKey === "romanticInterest_20_35") {
                            internalFineTuneToUse = FINE_TUNE_WITH_ATTRACTION_POTENTIALS_ROMANTIC_INTEREST;
                        } else if (romanticInterestKey === "strongRomanticInterest_35_50") {
                            internalFineTuneToUse = FINE_TUNE_WITH_ATTRACTION_POTENTIALS_STRONG_ROMANTIC_INTEREST;
                        } else if (romanticInterestKey === "deepInLove_50_100") {
                            internalFineTuneToUse = FINE_TUNE_WITH_ATTRACTION_POTENTIALS_STRONG_ROMANTIC_INTEREST;
                        }
                    }

                    for (const deeperFineTune of internalFineTuneToUse) {
                        const fineTuneValue = getDeeperFineTuneDescription(fineTuneValueOriginal, deeperFineTune);

                        const actualFamilyValue = familyValue.replace("{}", fineTuneValue);

                        if (hasSpecialComment(familySection.body, fineTune + (deeperFineTune !== "n/a" ? "_" + deeperFineTune : ""))) {
                            continue;
                        }

                        let guidanceGiven = "";
                        let redoGuidance = false;
                        let descriptionValueUnprocessed = "";
                        let descriptionValue = "";
                        while (true) {
                            if (guider && redoGuidance) {
                                const guiderResult = await guider.askOpen("What are some important things to keep in mind when writing about a relationship with " + actualFamilyValue + " in the context of " + name + "'s character and personality?");
                                if (guiderResult) {
                                    guidanceGiven = guiderResult.value.trim();
                                }
                                redoGuidance = false;
                            }

                            const isAnimalFineTune = fineTune.startsWith("animal_");
                            let baseInstructions = "NEVER ask for clarification or more information. ALWAYS directly write the description paragraph. Invent any specific details as needed. The response should use the word 'OTHER_CHARACTER' to refer to the other character name, ensure to specify whether " + name + " has any romantic feelings towards OTHER_CHARACTER or not, and how they would feel or react regarding sexual interactions, intimacy and other interactions, include friendship, emotional, romantic and sexual aspects";
                            if (isAnimalFineTune && card.config.characterSpeciesType !== "animal") {
                                baseInstructions = "NEVER ask for clarification or more information. ALWAYS directly write the description paragraph. Invent any specific details as needed. The response should use the word 'OTHER_CHARACTER' to refer to the animal (pet or wild beast) in question, ensure to specify whether " + name + " would have any sexual feelings towards OTHER_CHARACTER or not, and otherwise describe their relationship in terms of how " + name + " would interact with this pet or wild animal, including whether they would want to care for it, be afraid of it, want to befriend it."
                            }
                            if (guidanceGiven) {
                                baseInstructions += "\n\n# MANDATORY REQUIREMENTS — ACTIVE OVERRIDE:\n\nThe following requirements MUST be reflected in your answer. Treat them as hard constraints that take absolute priority over any conflicting instruction above. Do NOT ignore or dilute them:\n\n" + guidanceGiven;
                            }
                            await prime();
                            const descriptionQuestion = await generator.next({
                                maxCharacters: 200,
                                maxSafetyCharacters: 0,
                                maxParagraphs: 1,
                                nextQuestion: "Provide a concise and short one paragraph description of how " + name + " perceives and feels about " + actualFamilyValue + ". Focus on the emotional and psychological aspects of their perception, rather than physical details. This should capture the essence of their feelings and attitudes towards this person in a way that informs their interactions and relationship dynamics. Keep the paragraph short, ideally under 100 words.",
                                stopAfter: [],
                                stopAt: [],
                                instructions: baseInstructions,
                            });

                            if (descriptionQuestion.done) {
                                throw new Error("Generator ended unexpectedly while generating description for " + relationshipKey + " > " + romanticInterestKey + " > " + familyKey);
                            }
                            descriptionValueUnprocessed = descriptionQuestion.value.trim();

                            if (descriptionValueUnprocessed.includes("OTHER_CHARACTER") || descriptionValueUnprocessed.includes("OTHER CHARACTER")) {
                                descriptionValue = replaceOtherCharNameWithPlaceholder(descriptionValueUnprocessed, name);
                                if (guider) {
                                    const guiderResult = await guider.askAccept("Description of a relationship with " + actualFamilyValue, descriptionValue);
                                    if (guiderResult.value === null) {
                                        redoGuidance = true;
                                        descriptionValue = "";
                                        continue;
                                    } else {
                                        descriptionValue = guiderResult.value.trim();
                                        break;
                                    }
                                } else {
                                    break;
                                }
                            }
                        }

                        insertSpecialComment(familySection.body, fineTune + (deeperFineTune !== "n/a" ? "_" + deeperFineTune : ""));
                        // @ts-ignore
                        if (fineTuneConditions[fineTune] === "true") {
                            // @ts-ignore
                            familySection.body.push(`return ${toTemplateLiteral(descriptionValue)};`);
                        } else {
                            // @ts-ignore
                            familySection.body.push(`if (${getDeeperFineTuneCondition(fineTuneConditions[fineTune], deeperFineTune)}) {`);
                            familySection.body.push(`return ${toTemplateLiteral(descriptionValue)};`);
                            familySection.body.push(`}`);
                        }
                        await autosave?.save();
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
        await autosave?.save();
    }

    if (primed) {
        await generator.next(null); // end the generator
    }
}