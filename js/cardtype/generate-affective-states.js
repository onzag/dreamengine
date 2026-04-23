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
export async function generateAffectiveStates(engine, card, guider, autosave) {
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
        await prime();
        const affectionShowcases = await generator.next({
            maxCharacters: 500,
            maxSafetyCharacters: 500,
            maxParagraphs: 1,
            nextQuestion: `List ${name}'s specific ways that they show non-romantic, non-sexual physical affection towards others, as a comma separated list of actions. These should be specific actions or behaviors that ${name} would perform to showcase physical affection. List 7 to 10 unique items.`,
            stopAfter: [],
            stopAt: [],
            instructions: "Each item must be a specific way that " + name + " shows non-romantic affection and it must not depend on any items or particular circumstances, they should always be possible. Do NOT say generic things like showing affection or being nice to others. We want specific actions or behaviors.",
            answerTrail: name + "'s non-romantic physical affection showcases:\n\n",
            grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(7) + "\nbulletPoint ::= \"- \" [a-zA-Z0-9 ,;.'_]+ \"\\n\"",
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
        await prime();
        const intimateAffectionShowcases = await generator.next({
            maxCharacters: 500,
            maxSafetyCharacters: 500,
            maxParagraphs: 1,
            nextQuestion: `List ${name}'s specific way that they show romantic or sexual physical affection towards others, these must be explicit sexual actions, as a comma separated list of short 1-3 word items. These should be specific actions or behaviors that ${name} would perform to showcase sexual physical affection. List 7 to 10 unique items.`,
            stopAfter: [],
            stopAt: [],
            instructions: "Each item must be a specific way that " + name + " shows romantic or sexual physical affection and it must not depend on any items or particular circumstances, they should always be possible. Do NOT include any of the following " + card.config.affectionShowcases.join(", ") + " as those are non-romantic ways that " + name + " shows physical affection. We want specific romantic or sexual actions or behaviors.",
            answerTrail: name + "'s romantic or sexual physical affection showcases:\n\n",
            grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(7) + "\nbulletPoint ::= \"- \" [a-zA-Z0-9 ,;.'_]+ \"\\n\"",
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
    const isAttractedToAmbiguous = card.config.attractions?.includes("ambiguous");

    if (!isAsexualValue && typeof card.config.kinks === "undefined") {
        await prime();
        const kinks = await generator.next({
            maxCharacters: 200,
            maxSafetyCharacters: 500,
            maxParagraphs: 1,
            nextQuestion: `List ${name}'s specific kinks and fetishes as a comma separated list of short 1-2 word items. These must be actual kinks and fetishes, NOT vanilla activities. Do NOT include generic things like cuddling, kissing, hugging, or hand holding. Examples of what we want: bondage, dominance, submission, biting, scratching, rough play, voyeurism, exhibitionism, roleplay, sensory deprivation, choking, hair pulling, praise kink, degradation, pet play, etc. Infer what ${name} would specifically be into based on their personality and background. List 3 to 7 unique items.`,
            stopAfter: [],
            stopAt: [],
            instructions: "Each item must be a specific kink or fetish, not a generic romantic activity and it must not depend on any items or particular circumstances, they should always be possible. Do NOT say cuddling, kissing, hugging, hand holding, or similar vanilla activities. Always specify the target of the kink eg. being dominated or dominating instead of domination",
            answerTrail: name + "'s kinks and fetishes:\n\n",
            grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(7) + "\nbulletPoint ::= \"- \" [a-zA-Z0-9 ,;.'_]+ \"\\n\"",
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
        await prime();
        const kinksForMales = await generator.next({
            maxCharacters: 200,
            maxSafetyCharacters: 500,
            maxParagraphs: 1,
            nextQuestion: `List ${name}'s specific kinks and fetishes that are exclusive to male partners, as a comma separated list of short 1-3 word items. These must involve male-specific anatomy or secondary sex characteristics (e.g. penis, balls, deep voice, Adam's apple, masculine build, body hair, etc.). These should be things that can ONLY be done with or to a male body. Do NOT include generic kinks. Infer what ${name} would specifically enjoy about male partners based on their personality and background. List 3 to 5 unique items.`,
            stopAfter: [],
            stopAt: [],
            instructions: "Each item must be a kink or fetish specific to male anatomy or male secondary sex characteristics and it must not depend on any items or particular circumstances, they should always be possible. Do NOT include any of the following general kinks: " + card.config.kinks.join(", ") + ". We want ONLY things exclusive to male bodies. eg. male domination, male smell, things related to male genitalia. Always specify the target of the kink eg. being dominated or dominating instead of domination",
            answerTrail: name + "'s male-specific kinks and fetishes:\n\n",
            grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(4) + "\nbulletPoint ::= \"- \" [a-zA-Z0-9 ,;.'_]+ \"\\n\"",
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
        await prime();
        const kinksForFemales = await generator.next({
            maxCharacters: 200,
            maxSafetyCharacters: 500,
            maxParagraphs: 1,
            nextQuestion: `List ${name}'s specific kinks and fetishes that are exclusive to female partners, as a comma separated list of short 1-3 word items. These must involve female-specific anatomy or secondary sex characteristics (e.g. breasts, vagina, clitoris, curves, wide hips, soft skin, etc.). These should be things that can ONLY be done with or to a female body. Do NOT include generic kinks. Infer what ${name} would specifically enjoy about female partners based on their personality and background. List 3 to 5 unique items.`,
            stopAfter: [],
            stopAt: [],
            instructions: "Each item must be a kink or fetish specific to female anatomy or female secondary sex characteristics and it must not depend on any items or particular circumstances, they should always be possible. Do NOT include any of the following general kinks: " + card.config.kinks.join(", ") + ". We want ONLY things exclusive to female bodies, eg. boob-play, dominatrix, pegging, things related to female genitalia. Always specify the target of the kink eg. being dominated or dominating instead of domination",
            answerTrail: name + "'s female-specific kinks and fetishes:\n\n",
            grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(4) + "\nbulletPoint ::= \"- \" [a-zA-Z0-9 ,;.'_]+ \"\\n\"",
        });
        if (kinksForFemales.done) {
            throw new Error("Generator finished without producing output");
        }
        let kinksForFemalesParsed = kinksForFemales.value.split("\n").map(kink => kink.trim().replace("- ", " ").trim()).filter(kink => kink);

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
        await prime();
        const reversedKinks = await generator.next({
            maxCharacters: 200,
            maxSafetyCharacters: 200,
            maxParagraphs: 1,
            nextQuestion: `List specific kinks and fetishes that ${name} would absolutely refuse, find repulsive, or be a hard no, as a comma separated list of short 1-2 word items. These must be actual kinks and fetishes that disgust or repulse ${name}, NOT generic dislikes. Examples: scat, vore, gore, feet worship, infantilism, humiliation, needle play, blood play, etc. Infer what ${name} would specifically hate based on their personality and background. List 5 to 10 unique items.`,
            stopAfter: [],
            stopAt: [],
            instructions: "Each item must be a specific kink or fetish that " + name + " finds repulsive. Do NOT include any of the following as those are things " + name + " enjoys: " + [...card.config.kinks, ...card.config.kinksForMales, ...card.config.kinksForFemales].join(", ") + ". Always specify the target of the kink eg. being dominated or dominating instead of domination",
            answerTrail: name + "'s hard limit kinks and fetishes:\n\n",
            grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(7) + "\nbulletPoint ::= \"- \" [a-zA-Z0-9 ,;.'_]+ \"\\n\"",
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

    if (!isAsexualValue && isAttractedToMales && typeof card.config.sexActsForMales === "undefined") {
        await prime();
        const sexActsForMales = await generator.next({
            maxCharacters: 200,
            maxSafetyCharacters: 500,
            maxParagraphs: 1,
            nextQuestion: `List ${name}'s sex acts that ` + name + ` would take initiative performing towards a clearly male character, as a comma separated list of short 3-5 word items. These must involve sex acts with a clearly male character`,
            stopAfter: [],
            stopAt: [],
            instructions: "Each item must be sexual in nature. Keep in mind " + name + " kinks: " + [...card.config.kinks, ...card.config.kinksForMales].join(", ") + ". We want ONLY things exclusive to male bodies. Always specify the target of the kink eg. being penetrated or penetrating instead of domination",
            answerTrail: name + "'s male-specific kinks and fetishes:\n\n",
            grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(4) + "\nbulletPoint ::= \"- \" [a-zA-Z0-9 ,;.'_]+ \"\\n\"",
        });

        if (sexActsForMales.done) {
            throw new Error("Generator finished without producing output");
        }

        let sexActsForMalesParsed = sexActsForMales.value.split("\n").join(",").split(",").map(act => act.trim().replace("- ", " ").trim()).filter(act => act);
        if (guider) {
            const guiderResult = await guider.askList("Provide a list of sex acts that " + name + " would take initiative performing towards a clearly male character", null, sexActsForMalesParsed);
            if (guiderResult.value) {
                sexActsForMalesParsed = guiderResult.value;
            }
        }
        card.config.sexActsForMales = sexActsForMalesParsed;
        await autosave?.save();
    }

    if (!isAsexualValue && isAttractedToFemales && typeof card.config.sexActsForFemales === "undefined") {
        await prime();
        const sexActsForFemales = await generator.next({
            maxCharacters: 200,
            maxSafetyCharacters: 500,
            maxParagraphs: 1,
            nextQuestion: `List ${name}'s sex acts that ` + name + ` would take initiative performing towards a clearly female character, as a comma separated list of short 3-5 word items. These must involve sex acts with a clearly female character`,
            stopAfter: [],
            stopAt: [],
            instructions: "Each item must be sexual in nature. Keep in mind " + name + " kinks: " + [...card.config.kinks, ...card.config.kinksForFemales].join(", ") + ". We want ONLY things exclusive to female bodies. Always specify the target of the kink eg. being penetrated or penetrating instead of domination",
            answerTrail: name + "'s female-specific kinks and fetishes:\n\n",
            grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(4) + "\nbulletPoint ::= \"- \" [a-zA-Z0-9 ,;.'_]+ \"\\n\"",
        });

        if (sexActsForFemales.done) {
            throw new Error("Generator finished without producing output");
        }

        let sexActsForFemalesParsed = sexActsForFemales.value.split("\n").join(",").split(",").map(act => act.trim().replace("- ", " ").trim()).filter(act => act);
        if (guider) {
            const guiderResult = await guider.askList("Provide a list of sex acts that " + name + " would take initiative performing towards a clearly female character", null, sexActsForFemalesParsed);
            if (guiderResult.value) {
                sexActsForFemalesParsed = guiderResult.value;
            }
        }
        card.config.sexActsForFemales = sexActsForFemalesParsed;
        await autosave?.save();
    }

    if (!isAsexualValue && isAttractedToAmbiguous && typeof card.config.sexActsForAmbiguous === "undefined") {
        await prime();
        const sexActsForAmbiguous = await generator.next({
            maxCharacters: 200,
            maxSafetyCharacters: 500,
            maxParagraphs: 1,
            nextQuestion: `List ${name}'s sex acts that ` + name + ` would take initiative performing towards a character of ambiguous or non-binary gender, as a comma separated list of short 3-5 word items. These must involve sex acts with an ambiguous or non-binary character`,
            stopAfter: [],
            stopAt: [],
            instructions: "Each item must be sexual in nature. Keep in mind " + name + " kinks: " + [...card.config.kinks].join(", ") + ". We want things suited to bodies that may not conform to typical male or female anatomy. Always specify the target of the kink eg. being penetrated or penetrating instead of domination",
            answerTrail: name + "'s ambiguous-specific kinks and fetishes:\n\n",
            grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(4) + "\nbulletPoint ::= \"- \" [a-zA-Z0-9 ,;.'_]+ \"\\n\"",
        });

        if (sexActsForAmbiguous.done) {
            throw new Error("Generator finished without producing output");
        }

        let sexActsForAmbiguousParsed = sexActsForAmbiguous.value.split("\n").join(",").split(",").map(act => act.trim().replace("- ", " ").trim()).filter(act => act);
        if (guider) {
            const guiderResult = await guider.askList("Provide a list of sex acts that " + name + " would take initiative performing towards a character of ambiguous or non-binary gender", null, sexActsForAmbiguousParsed);
            if (guiderResult.value) {
                sexActsForAmbiguousParsed = guiderResult.value;
            }
        }
        card.config.sexActsForAmbiguous = sexActsForAmbiguousParsed;
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

    if (primed) {
        await generator.next(null); // end the generator
    }
}