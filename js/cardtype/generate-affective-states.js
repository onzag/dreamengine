import { DEngine } from '../engine/index.js';
import { yesNoGrammar } from '../engine/util/grammar.js';
import { createCardStructureFrom, getJsCard, getSection, hasSpecialComment, insertSection, insertSpecialComment, toTemplateLiteral, unshiftSection } from './base.js';
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

    const yesNo = yesNoGrammar(engine);

    const initializeSection = getSection(card.body, "initialize");

    if (initializeSection === null) {
        throw new Error("Initialize section not found");
    }

    const newCharacterSection = getSection(initializeSection.body, "new-character");

    if (newCharacterSection === null) {
        throw new Error("New character section not found");
    }

    const intimateHead = unshiftSection(newCharacterSection.head, "intimate-affection-showcases");

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
            instructions: "Each item must be a specific kink or fetish that " + name + " finds repulsive. Do NOT include any of the following as those are things " + name + " enjoys: " + [...(card.config.kinks || []), ...(card.config.kinksForMales || []), ...(card.config.kinksForFemales || [])].join(", ") + ". Always specify the target of the kink eg. being dominated or dominating instead of domination",
            answerTrail: name + "'s hard limit kinks and fetishes:\n\n",
            grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(7) + "\nbulletPoint ::= \"- \" [a-zA-Z0-9 ,;.'_]+ \"\\n\"",
        });
        if (reversedKinks.done) {
            throw new Error("Generator finished without producing output");
        }
        let reversedKinksParsed = reversedKinks.value.split("\n").map(kink => kink.trim().replace("- ", " ").trim()).filter(kink => kink);

        if (guider) {
            const guiderResult = await guider.askList("Provide a list of kinks and special sexual/romantic interests that " + name + " would find repulsive and be a hard no for them", null, reversedKinksParsed);
            if (guiderResult.value) {
                reversedKinksParsed = guiderResult.value;
            }
        }

        card.config.reversedKinks = reversedKinksParsed;

        await autosave?.save();
    }

    if (typeof card.config.intimateVerbality === "undefined") {
        await prime();
        const verbalityResult = await generator.next({
            maxCharacters: 10,
            maxSafetyCharacters: 10,
            maxParagraphs: 1,
            nextQuestion: `On a scale of 0 to 10, how verbally expressive is ${name} when seeking consent or communicating during intimate situations? 0 means they rely entirely on body language and non-verbal cues, 10 means they are very vocal and explicitly verbal. Based on ${name}'s personality, prefer lower numbers that reflect body language over words.`,
            stopAfter: [],
            stopAt: [],
            instructions: `Reply with a single integer from 0 to 10. Prefer lower numbers (0-4) since body language is more natural than excessive verbal communication. Base the number on ${name}'s personality and communication style.`,
            answerTrail: `${name}'s intimate verbality score (0-10): `,
            grammar: `root ::= "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10"`,
        });

        if (verbalityResult.done) {
            throw new Error("Generator finished without producing output");
        }

        let verbalityParsed = parseInt(verbalityResult.value.trim(), 10);
        if (isNaN(verbalityParsed) || verbalityParsed < 0 || verbalityParsed > 10) {
            verbalityParsed = 3;
        }

        if (guider) {
            const guiderResult = await guider.askNumber(
                `How verbal is ${name} when seeking consent or communicating during intimate situations? (0 = body language only, 10 = very vocal/explicit).`,
                verbalityParsed
            );
            if (guiderResult.value !== undefined && guiderResult.value !== null) {
                verbalityParsed = guiderResult.value;
            }
        }

        card.config.intimateVerbality = verbalityParsed;

        await autosave?.save();
    }

    /**
     * 
     * @param {string} act 
     * @param {boolean} addVocabLimit 
     * @param {boolean} continous
     */
    const generateIntimateAction = async (act, addVocabLimit, continous) => {
        intimateHead.body.push(`action: (info) => ${toTemplateLiteral(act)}`);
        intimateHead.body.push(`probability: 1,`);

        const actForInference = act.replace(/{{other}}/g, "other character").replace(/{{char}}/g, name);

        if (addVocabLimit) {
            const vocabularyLimits = [
                "moaning",
                "gagging",
                "panting",
                "whimpering",
                "crying",
                "screaming",
                "mute",
                "none",
            ];

            const vocabResult = await generator.next({
                maxCharacters: 20,
                maxSafetyCharacters: 20,
                maxParagraphs: 1,
                nextQuestion: `Given that ${name} is performing the following act: "${actForInference}", which of the following best describes ${name}'s vocal or sound expression during this act? Choose exactly one: ${vocabularyLimits.join(", ")}.`,
                stopAfter: [],
                stopAt: [],
                instructions: `Reply with only one word from this list: ${vocabularyLimits.join(", ")}. Choose the one that best fits the act described.`,
                answerTrail: `${name}'s vocal expression during this act: `,
                grammar: `root ::= ${vocabularyLimits.map(v => JSON.stringify(v)).join(" | ")}`,
            });

            if (vocabResult.done) {
                throw new Error("Generator finished without producing output");
            }

            let vocabLimitParsed = vocabResult.value.trim().toLowerCase();
            if (!vocabularyLimits.includes(vocabLimitParsed)) {
                vocabLimitParsed = "none";
            }

            if (guider) {
                const guiderResult = await guider.askOption(
                    `What vocal/sound expression does ${name} make while performing: "${actForInference}"?`,
                    vocabularyLimits,
                    vocabLimitParsed
                );
                if (guiderResult.value) {
                    vocabLimitParsed = guiderResult.value;
                }
            }

            intimateHead.body.push(`vocabularyLimit: DE.utils.createVocabularyLimitFromPreset(${JSON.stringify(vocabLimitParsed)}),`);
        }

        /**
         * @type {string[]}
         */
        let fullfillCriteriaQuestions = [];
        if (continous) {
            const criteriaResult = await generator.next({
                maxCharacters: 300,
                maxSafetyCharacters: 300,
                maxParagraphs: 3,
                nextQuestion: `Given that ${name} is performing the following act: "${actForInference}", write 2 to 3 short questions that would determine when this act has ended or been completed. Each question should describe a condition or event that signals the act is over. Use OTHER_CHARACTER as a placeholder for the other character's name.`,
                stopAfter: [],
                stopAt: [],
                instructions: `Write 2 to 3 short questions as a bullet point list. Each question must describe a condition that ends the act "${actForInference}". Use OTHER_CHARACTER as a placeholder for the other character's name. Keep questions short and specific to this act.`,
                answerTrail: `Questions that determine the end of "${actForInference}":\n\n`,
                grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(2) + " bulletPoint\nbulletPoint ::= \"- \" [a-zA-Z0-9 ,;.'?!_]+ \"\\n\"",
            });

            if (criteriaResult.done) {
                throw new Error("Generator finished without producing output");
            }

            fullfillCriteriaQuestions = criteriaResult.value
                .split("\n")
                .map(q => replaceOtherCharNameWithPlaceholder(q.trim().replace(/^- /, "").trim(), name))
                .filter(q => q);

            if (guider) {
                const guiderResult = await guider.askList(
                    `Provide 2-3 questions that determine when ${name} has finished performing: "${actForInference}"`,
                    null,
                    fullfillCriteriaQuestions
                );
                if (guiderResult.value) {
                    fullfillCriteriaQuestions = guiderResult.value;
                }
            }

            intimateHead.body.push(`fullfillCriteriaQuestions: [`);
            fullfillCriteriaQuestions.forEach(q => {
                intimateHead.body.push(`(info) => ${toTemplateLiteral(q)},`);
            });
            intimateHead.body.push(`],`);
        }

        const wouldAskForConsent = await generator.next({
            maxCharacters: 20,
            maxSafetyCharacters: 20,
            maxParagraphs: 1,
            nextQuestion: `Given that ${name} is performing the following act: "${actForInference}", would ${name} ask for consent before performing this act? Answer with yes or no.`,
            stopAfter: yesNo.stopAfter,
            stopAt: [],
            instructions: `Answer with only "yes" or "no".`,
            grammar: yesNo.grammar
        });

        if (wouldAskForConsent.done) {
            throw new Error("Generator finished without producing output");
        }

        let wouldAskForConsentParsed = wouldAskForConsent.value.trim().toLowerCase();
        if (wouldAskForConsentParsed !== "yes" && wouldAskForConsentParsed !== "no") {
            wouldAskForConsentParsed = "no";
        }

        let wouldAskForConsentValue = wouldAskForConsentParsed === "yes";

        if (guider) {
            const guiderResult = await guider.askBoolean(
                `Would ${name} ask for consent before performing: "${actForInference}"?`,
                wouldAskForConsentValue
            );
            if (guiderResult.value !== null) {
                wouldAskForConsentValue = guiderResult.value;
            }
        }

        if (wouldAskForConsentValue) {
            newCharacterSection.head.push(`consentMechanism: {`);

            const verbality = card.config.intimateVerbality ?? 5;
            const totalActions = 6;
            const verbalCount = Math.round(totalActions * (verbality / 10));
            const nonVerbalCount = totalActions - verbalCount;

            /**
             * @type {string[]}
             */
            let verbalActions = [];
            /**
             * @type {string[]}
             */
            let nonVerbalActions = [];

            if (verbalCount > 0) {
                const verbalResult = await generator.next({
                    maxCharacters: 300,
                    maxSafetyCharacters: 300,
                    maxParagraphs: verbalCount,
                    nextQuestion: `List ${verbalCount} specific verbal things ${name} would say or ask to seek consent before performing: "${actForInference}". These must be spoken words or phrases, not physical actions. Use OTHER_CHARACTER as a placeholder for the other character's name.`,
                    stopAfter: [],
                    stopAt: [],
                    instructions: `List exactly ${verbalCount} short verbal consent phrases or questions that ${name} would use. Use OTHER_CHARACTER as a placeholder for the other character's name.`,
                    answerTrail: `${name}'s verbal consent phrases:\n\n`,
                    grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(verbalCount) + "\nbulletPoint ::= \"- \" " + JSON.stringify(name) + " \" will\" [a-zA-Z0-9 ,;.'?!_ ]+ \"\\n\"",
                });
                if (verbalResult.done) {
                    throw new Error("Generator finished without producing output");
                }
                verbalActions = verbalResult.value
                    .split("\n")
                    .map(q => replaceOtherCharNameWithPlaceholder(q.trim().replace(/^- /, "").trim(), name))
                    .filter(q => q);
            }

            if (nonVerbalCount > 0) {
                const nonVerbalResult = await generator.next({
                    maxCharacters: 300,
                    maxSafetyCharacters: 300,
                    maxParagraphs: nonVerbalCount,
                    nextQuestion: `List ${nonVerbalCount} specific non-verbal body language actions ${name} would perform to seek consent before performing: "${actForInference}". These must be physical gestures or body language — not spoken words. Use OTHER_CHARACTER as a placeholder for the other character's name.`,
                    stopAfter: [],
                    stopAt: [],
                    instructions: `List exactly ${nonVerbalCount} short non-verbal consent actions that ${name} would use. These must be physical gestures or body language only — not spoken words. Use OTHER_CHARACTER as a placeholder for the other character's name.`,
                    answerTrail: `${name}'s non-verbal consent actions:\n\n`,
                    grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(nonVerbalCount) + "\nbulletPoint ::= \"- \" " + JSON.stringify(name) + " \" will\" [a-zA-Z0-9 ,;.'?!_ ]+ \"\\n\"",
                });
                if (nonVerbalResult.done) {
                    throw new Error("Generator finished without producing output");
                }
                nonVerbalActions = nonVerbalResult.value
                    .split("\n")
                    .map(q => replaceOtherCharNameWithPlaceholder(q.trim().replace(/^- /, "").trim(), name))
                    .filter(q => q);
            }


            let combined = [...verbalActions, ...nonVerbalActions];
            if (guider) {
                const guiderResult = await guider.askList(
                    `Provide the consent-seeking actions for ${name} before performing: "${actForInference}"`,
                    null,
                    combined
                );
                if (guiderResult.value) {
                    combined = guiderResult.value;
                }
            }

            newCharacterSection.head.push(`actionsAndChecks: [`);
            for (const consentRequestingAction of combined) {
                const consentRequestingActionForInference = consentRequestingAction.replace(/{{other}}/g, "other character").replace(/{{char}}/g, name);

                const consentGrantedResult = await generator.next({
                    maxCharacters: 100,
                    maxSafetyCharacters: 100,
                    maxParagraphs: 1,
                    nextQuestion: `${name} performed the following consent request: "${consentRequestingActionForInference}". Write a single question that captures whether OTHER_CHARACTER gave consent in response to this specific request. The question should be broad enough to cover both verbal and non-verbal consent, but specific enough to be tied to this consent request and act.`,
                    stopAfter: [],
                    stopAt: [],
                    instructions: `Write a single short question ending with "?" that asks whether OTHER_CHARACTER consented after "${consentRequestingActionForInference}". Be broad enough to include verbal and non-verbal consent but specific to this request and act. Use OTHER_CHARACTER as a placeholder.`,
                    answerTrail: `Consent granted question: `,
                    grammar: `root ::= has OTHER_CHARACTER [A-Za-z0-9 ,.'!_]+ "?"`,
                });

                if (consentGrantedResult.done) {
                    throw new Error("Generator finished without producing output");
                }

                let consentGrantedQuestion = replaceOtherCharNameWithPlaceholder(consentGrantedResult.value.trim(), name);

                if (guider) {
                    const guiderResult = await guider.askAccept(
                        `Question for when consent is granted after "${consentRequestingAction}"`,
                        consentGrantedQuestion
                    );
                    if (guiderResult.value !== null) {
                        consentGrantedQuestion = guiderResult.value;
                    }
                }

                const consentUnspecifiedResult = await generator.next({
                    maxCharacters: 100,
                    maxSafetyCharacters: 100,
                    maxParagraphs: 1,
                    nextQuestion: `${name} performed the following consent request: "${consentRequestingActionForInference}". Write a single question that captures whether OTHER_CHARACTER gave a vague or ambiguous response — neither a clear yes nor a clear no — in response to this specific request.`,
                    stopAfter: [],
                    stopAt: [],
                    instructions: `Write a single short question ending with "?" that asks whether OTHER_CHARACTER gave a vague or unclear response after "${consentRequestingActionForInference}". The question should capture non-committal or ambiguous signals. Use OTHER_CHARACTER as a placeholder.`,
                    answerTrail: `Consent unspecified question: `,
                    grammar: `root ::= has OTHER_CHARACTER [A-Za-z0-9 ,.'!_]+ "?"`,
                });

                if (consentUnspecifiedResult.done) {
                    throw new Error("Generator finished without producing output");
                }

                let consentUnspecifiedQuestion = replaceOtherCharNameWithPlaceholder(consentUnspecifiedResult.value.trim(), name);

                if (guider) {
                    const guiderResult = await guider.askAccept(
                        `Question for when consent is unspecified/ambiguous after "${consentRequestingAction}"`,
                        consentUnspecifiedQuestion
                    );
                    if (guiderResult.value !== null) {
                        consentUnspecifiedQuestion = guiderResult.value;
                    }
                }

                newCharacterSection.head.push(`{`);
                newCharacterSection.head.push(`action: (info) => ${toTemplateLiteral(consentRequestingAction)},`);
                newCharacterSection.head.push(`check: (info) => ${toTemplateLiteral(consentRequestingAction)},`);
                newCharacterSection.head.push(`checkAmbiguousResponse: (info) => ${toTemplateLiteral(consentUnspecifiedQuestion)},`);
                newCharacterSection.head.push(`},`);
            }
            newCharacterSection.head.push(`],`);

            const insistenceResult = await generator.next({
                maxCharacters: 2,
                maxSafetyCharacters: 2,
                maxParagraphs: 1,
                nextQuestion: `On a scale of 0 to 10, how insistent would ${name} be in trying to get consent after receiving a "no" for the act "${actForInference}"? 0 means they immediately accept the refusal and stop, 10 means they persistently try to persuade or wear down resistance.`,
                stopAfter: [],
                stopAt: [],
                instructions: `Reply with a single integer from 0 to 10 based on ${name}'s personality. Base the number on how pushy or persistent ${name} would be after being refused.`,
                answerTrail: `${name}'s insistence after refusal (0-10): `,
                grammar: `root ::= "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10"`,
            });

            if (insistenceResult.done) {
                throw new Error("Generator finished without producing output");
            }

            let insistenceParsed = parseInt(insistenceResult.value.trim(), 10);
            if (isNaN(insistenceParsed) || insistenceParsed < 0 || insistenceParsed > 10) {
                insistenceParsed = 3;
            }

            if (guider) {
                const guiderResult = await guider.askNumber(
                    `How insistent would ${name} be in trying to get consent after a refusal for "${actForInference}"? (0 = accepts no immediately, 10 = very persistent)`,
                    insistenceParsed
                );
                if (guiderResult.value !== undefined && guiderResult.value !== null) {
                    insistenceParsed = guiderResult.value;
                }
            }

            newCharacterSection.head.push(`insistence: ${insistenceParsed/10},`);

            const ignoreConsentResult = await generator.next({
                maxCharacters: 2,
                maxSafetyCharacters: 2,
                maxParagraphs: 1,
                nextQuestion: `On a scale of 0 to 10, how likely is ${name} to ignore a "no" and proceed with the act "${actForInference}" anyway? 0 means they would never proceed without consent, 10 means they would almost certainly proceed regardless of refusal.`,
                stopAfter: [],
                stopAt: [],
                instructions: `Reply with a single integer from 0 to 10 based on ${name}'s personality and moral character. Base the number on how likely ${name} is to disregard consent and proceed.`,
                answerTrail: `${name}'s likelihood to ignore refusal (0-10): `,
                grammar: `root ::= "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10"`,
            });

            if (ignoreConsentResult.done) {
                throw new Error("Generator finished without producing output");
            }

            let ignoreConsentParsed = parseInt(ignoreConsentResult.value.trim(), 10);
            if (isNaN(ignoreConsentParsed) || ignoreConsentParsed < 0 || ignoreConsentParsed > 10) {
                ignoreConsentParsed = 0;
            }

            if (guider) {
                const guiderResult = await guider.askNumber(
                    `How likely is ${name} to ignore consent and proceed with "${actForInference}" after a refusal? (0 = never, 10 = always)`,
                    ignoreConsentParsed
                );
                if (guiderResult.value !== undefined && guiderResult.value !== null) {
                    ignoreConsentParsed = guiderResult.value;
                }
            }

            newCharacterSection.head.push(`ignoreConsentRejection: ${ignoreConsentParsed/10},`);

            newCharacterSection.head.push(`},`);
        }
    }

    if (!isAsexualValue && isAttractedToMales && hasSpecialComment(intimateHead.body, "sex-acts-for-males")) {
        await prime();
        const sexActsForMales = await generator.next({
            maxCharacters: 1000,
            maxSafetyCharacters: 1000,
            maxParagraphs: 10,
            nextQuestion: `List ${name}'s sex acts towards a male character. Each act must be a single simultaneous action with an emotional or physical reaction, like "${name} rides OTHER_CHARACTER while moaning" or "${name} sucks OTHER_CHARACTER while gagging". NO sequences, NO "and then", NO narrative — just one act happening at the same time as one reaction.`,
            stopAfter: [],
            stopAt: [],
            instructions: "Each item must be ONE simultaneous action in the format: " + name + " [does X] while [feeling/reacting Y]. It must be a sex act where sexual activity occurs that involves genitalia where penetration or stimulation is involved. The action is performed by " + name + ". Be explicit and detailed. Do NOT use 'and then', 'before', 'after', or any sequence of events — only a single act paired with a simultaneous emotional or physical state. Keep in mind " + name + "'s kinks: " + [...card.config.kinks, ...card.config.kinksForMales].join(", ") + ". Use OTHER_CHARACTER as a placeholder for the other character's name.",
            answerTrail: name + "'s male-specific sex acts:\n\n",
            grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(5) + "\nbulletPoint ::= \"- \" " + JSON.stringify(name) + " \" will \" [a-zA-Z0-9 ,;.'_]+ \"\\n\"",
        });

        if (sexActsForMales.done) {
            throw new Error("Generator finished without producing output");
        }

        let sexActsForMalesParsed = sexActsForMales.value.split("\n").map(act => replaceOtherCharNameWithPlaceholder(act.trim().replace(`- `, "").trim(), name)).filter(act => act);
        if (guider) {
            const guiderResult = await guider.askList("Provide a list of sex acts that " + name + " would take initiative performing towards a male character", null, sexActsForMalesParsed);
            if (guiderResult.value) {
                sexActsForMalesParsed = guiderResult.value;
            }
        }

        insertSpecialComment(intimateHead.body, "sex-acts-for-males");
        intimateHead.body.push(`/** @type {DEIntimateAction[]} */`);
        intimateHead.body.push(`const sexActsForMales = [`)

        for (const act of sexActsForMalesParsed) {
            intimateHead.body.push(`{`)
            await generateIntimateAction(act, true, true);
            intimateHead.body.push(`},`)
        }

        intimateHead.body.push(`];`)

        await autosave?.save();
    }

    if (primed) {
        await generator.next(null); // end the generator
    }
}