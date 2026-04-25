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
            const guiderResult = await guider.askArbitraryList("Provide a list of kinks and special sexual/romantic interests for " + name + " (General non-gender specific)", kinksParsed);
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
            const guiderResult = await guider.askArbitraryList("Provide a list of kinks specific to male partners for " + name + " (male anatomy/characteristics only)", kinksForMalesParsed);
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
            const guiderResult = await guider.askArbitraryList("Provide a list of kinks specific to female partners for " + name + " (female anatomy/characteristics only)", kinksForFemalesParsed);
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
            const guiderResult = await guider.askArbitraryList("Provide a list of kinks and special sexual/romantic interests that " + name + " would find repulsive and be a hard no for them", reversedKinksParsed);
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
     * @param {boolean} consentDefaultNo
     * @param {boolean} addVocabLimit 
     * @param {boolean} continous
     */
    const generateIntimateAction = async (act, consentDefaultNo, addVocabLimit, continous) => {
        intimateHead.body.push(`action: (info) => ${toTemplateLiteral(act)},`);
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
                "normal",
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
                instructions: `Write 2 to 3 short questions as a bullet point list. Since this is about a sexual act focus on the following endings like "orgasm has been achieved" or acts that would cause the act to end. Use OTHER_CHARACTER as a placeholder for the other character's name. Keep questions short and specific to this act.`,
                answerTrail: `Questions that determine the end of "${actForInference}":\n\n`,
                grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(3) + " bulletPoint\nbulletPoint ::= \"- Has \" [a-zA-Z0-9 ,;.'?!_]+ \"\\n\"",
            });

            if (criteriaResult.done) {
                throw new Error("Generator finished without producing output");
            }

            fullfillCriteriaQuestions = criteriaResult.value
                .split("\n")
                .map(q => replaceOtherCharNameWithPlaceholder(q.trim().replace(/^- /, "").trim(), name))
                .filter(q => q);

            if (guider) {
                const guiderResult = await guider.askArbitraryList(
                    `Provide 2-3 questions that determine when ${name} has finished performing: "${actForInference}"`,
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

        const wouldAskForConsent = consentDefaultNo ? {done: true, value: "no"} : await generator.next({
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
            intimateHead.body.push(`consentMechanism: {`);

            const verbality = card.config.intimateVerbality ?? 5;
            const totalActions = 6;
            let verbalCount = Math.round(totalActions * (verbality / 10));
            let nonVerbalCount = totalActions - verbalCount;

            if (verbalCount === 0 && verbality > 0) {
                nonVerbalCount--;
                verbalCount++;
            }

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
                    maxCharacters: 3000,
                    maxSafetyCharacters: 3000,
                    maxParagraphs: 50,
                    nextQuestion: `List ${verbalCount} specific verbal things ${name} would say or ask to seek consent before performing: "${actForInference}". These must be spoken words or phrases, not physical actions. Use OTHER_CHARACTER as a placeholder for the other character's name. Keep each listed item short, only 1 or 2 sentences at most.`,
                    stopAfter: [],
                    stopAt: [],
                    instructions: `List exactly ${verbalCount} short verbal consent phrases or questions that ${name} would use. Use OTHER_CHARACTER as a placeholder for the other character's name. The phrase or question ${name} would use SHOULD BE INCLUDED in the output, do not just say "asks for consent" or similar, we want the actual words or phrases that ${name} would say.`,
                    answerTrail: `${name}'s verbal consent phrases:\n\n`,
                    grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(verbalCount) + "\nbulletPoint ::= \"- \" " + JSON.stringify(name) + " \" will \" (\"say\" | \"ask\") \" '\" sentence (\" \" sentence)? \"'\\n\"\nsentence ::= [a-zA-Z0-9 ,;'_-]+ (\".\" | \"!\" | \"?\")",
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
                    maxCharacters: 3000,
                    maxSafetyCharacters: 3000,
                    maxParagraphs: 50,
                    nextQuestion: `List ${nonVerbalCount} specific non-verbal body language actions ${name} would perform to seek consent that clearly and unambiguously signal the intent to perform: "${actForInference}". These must be physical gestures or body language — not spoken words. The actions MUST be proportional in intensity and explicitness to the act itself: if the act is sexual or intimate (e.g. having sex, oral sex, penetration), the consent gesture must be equally suggestive and direct (e.g. inappropriate touching, grinding against them, guiding their hand to an intimate place, undressing in front of them, seductive body movements). Do NOT suggest vague or innocent gestures like "giving cute eyes", "smiling sweetly", or "blushing" for explicit acts — those do not communicate the act being asked about. Use OTHER_CHARACTER as a placeholder for the other character's name.`,
                    stopAfter: [],
                    stopAt: [],
                    instructions: `List exactly ${nonVerbalCount} short non-verbal consent actions that ${name} would use. These must be physical gestures or body language only — not spoken words. CRITICAL: each gesture must be proportional to the explicitness of "${actForInference}". For sexual/intimate acts, gestures must be overtly sexual or seductive (suggestive touching, intimate caresses, guiding hands, removing clothing, grinding, etc.) so it is unambiguously clear what is being asked. Vague, cute, or innocent gestures are NOT acceptable when the act itself is explicit. Use OTHER_CHARACTER as a placeholder for the other character's name.`,
                    answerTrail: `${name}'s non-verbal consent actions:\n\n`,
                    grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(nonVerbalCount) + "\nbulletPoint ::= \"- \" " + JSON.stringify(name) + " \" will \" sentence (\" \" sentence)? \"\\n\"\nsentence ::= [a-zA-Z0-9 ,;'_-]+ (\".\" | \"!\" | \"?\")",
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
                const guiderResult = await guider.askArbitraryList(
                    `Provide the consent-seeking actions for ${name} before performing: "${actForInference}"`,
                    combined
                );
                if (guiderResult.value) {
                    combined = guiderResult.value;
                }
            }

            intimateHead.body.push(`actionsAndChecks: [`);
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
                    grammar: `root ::= "has OTHER_CHARACTER " [A-Za-z0-9 ,.'!_]+ "?"`,
                });

                if (consentGrantedResult.done) {
                    throw new Error("Generator finished without producing output");
                }

                let consentGrantedQuestion = replaceOtherCharNameWithPlaceholder(consentGrantedResult.value.trim(), name);

                if (guider) {
                    const guiderResult = await guider.askOpen(
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
                    grammar: `root ::= "has OTHER_CHARACTER " [A-Za-z0-9 ,.'!_]+ "?"`,
                });

                if (consentUnspecifiedResult.done) {
                    throw new Error("Generator finished without producing output");
                }

                let consentUnspecifiedQuestion = replaceOtherCharNameWithPlaceholder(consentUnspecifiedResult.value.trim(), name);

                if (guider) {
                    const guiderResult = await guider.askOpen(
                        `Question for when consent is unspecified/ambiguous after "${consentRequestingAction}"`,
                        consentUnspecifiedQuestion
                    );
                    if (guiderResult.value !== null) {
                        consentUnspecifiedQuestion = guiderResult.value;
                    }
                }

                intimateHead.body.push(`{`);
                intimateHead.body.push(`action: (info) => ${toTemplateLiteral(consentRequestingAction)},`);
                intimateHead.body.push(`check: (info) => ${toTemplateLiteral(consentGrantedQuestion)},`);
                intimateHead.body.push(`checkAmbiguousResponse: (info) => ${toTemplateLiteral(consentUnspecifiedQuestion)},`);
                intimateHead.body.push(`},`);
            }
            intimateHead.body.push(`],`);

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

            intimateHead.body.push(`insistence: ${insistenceParsed/10},`);

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

            intimateHead.body.push(`ignoreConsentRejection: ${ignoreConsentParsed/10},`);

            intimateHead.body.push(`},`);
        }
    }

    if (!hasSpecialComment(intimateHead.body, "affection-showcases")) {
        await prime();
        const affectionShowcasesResult = await generator.next({
            maxCharacters: 1000,
            maxSafetyCharacters: 1000,
            maxParagraphs: 10,
            nextQuestion: `List ${name}'s simple affection showcases towards another character (regardless of gender). Each act must be a single simultaneous action with an emotional reaction. Examples: hugging warmly, patting on the back, ruffling hair, holding hands, leaning on shoulder, etc.`,
            stopAfter: [],
            stopAt: [],
            instructions: "Each item must be ONE simultaneous affectionate action in the format: " + name + " [does X] while [feeling/reacting Y]. The action is performed by " + name + ". These are general, friendly affection showcases that any character could appreciate regardless of relationship. Do NOT use 'and then', 'before', 'after', or any sequence of events — only a single act paired with a simultaneous emotional or physical state. Use OTHER_CHARACTER as a placeholder for the other character's name.",
            answerTrail: name + "'s affection showcases:\n\n",
            grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(10) + "\nbulletPoint ::= \"- \" " + JSON.stringify(name) + " \" will \" [a-zA-Z0-9 ,;.'_]+ \"\\n\"",
        });

        if (affectionShowcasesResult.done) {
            throw new Error("Generator finished without producing output");
        }

        let affectionShowcasesActsParsed = affectionShowcasesResult.value.split("\n").map(act => replaceOtherCharNameWithPlaceholder(act.trim().replace(`- `, "").trim(), name)).filter(act => act);
        if (guider) {
            const guiderResult = await guider.askArbitraryList("Provide a list of affection showcases that " + name + " would take initiative performing towards another character", affectionShowcasesActsParsed);
            if (guiderResult.value) {
                affectionShowcasesActsParsed = guiderResult.value;
            }
        }

        insertSpecialComment(intimateHead.body, "affection-showcases");
        intimateHead.body.push(`/** @type {DEIntimateAction[]} */`);
        intimateHead.body.push(`const affectionShowcases = [`)

        for (const act of affectionShowcasesActsParsed) {
            intimateHead.body.push(`{`)
            await generateIntimateAction(act, true, false, false);
            intimateHead.body.push(`},`)
        }

        intimateHead.body.push(`];`)

        await autosave?.save();
    }

    if (isAttractedToMales && !hasSpecialComment(intimateHead.body, "intimate-affection-for-males")) {
        await prime();
        const isNonAnimal = card.config.characterSpeciesType !== "animal";

        /** @type {string[]} */
        let intimateAffectionForMalesParsed = [];

        if (isNonAnimal) {
            const kissingResult = await generator.next({
                maxCharacters: 600,
                maxSafetyCharacters: 600,
                maxParagraphs: 6,
                nextQuestion: `List 5 distinct variations of kissing or making out that ${name} would do towards a male character. Each must be a single simultaneous action with an emotional/sexual reaction (e.g. "${name} gives a soft kiss on the lips while smiling tenderly", "${name} kisses OTHER_CHARACTER deeply while moaning softly"). Vary the type, intensity, and body part involved (lips, neck, jaw, forehead, French kiss, biting lip, slow making out, hungry making out, etc.).`,
                stopAfter: [],
                stopAt: [],
                instructions: "Each item must be ONE simultaneous kissing or making-out variation in the format: " + name + " [kisses/makes out X] while [feeling/reacting Y]. The action is performed by " + name + ". Vary the type, intensity, and body part across the 5 items. Do NOT use 'and then', 'before', 'after', or any sequence of events. Use OTHER_CHARACTER as a placeholder for the other character's name.",
                answerTrail: name + "'s male-specific kissing/making-out variations:\n\n",
                grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(5) + "\nbulletPoint ::= \"- \" " + JSON.stringify(name) + " \" will \" [a-zA-Z0-9 ,;.'_]+ \"\\n\"",
            });
            if (kissingResult.done) {
                throw new Error("Generator finished without producing output");
            }
            const kissingParsed = kissingResult.value.split("\n").map(act => replaceOtherCharNameWithPlaceholder(act.trim().replace(`- `, "").trim(), name)).filter(act => act);

            const otherResult = await generator.next({
                maxCharacters: 600,
                maxSafetyCharacters: 600,
                maxParagraphs: 6,
                nextQuestion: `List 5 intimate affectionate actions (NOT kissing or making out) that ${name} would do towards a male character. Each must be a single simultaneous action with an emotional/sexual reaction. Examples: cuddling, hair caressing, gentle touching, holding hands, nuzzling, hugging tightly, stroking the cheek, etc.`,
                stopAfter: [],
                stopAt: [],
                instructions: "Each item must be ONE simultaneous affectionate action in the format: " + name + " [does X] while [feeling/reacting Y]. The action is performed by " + name + ". CRITICAL: do NOT include kissing or making out — those were already covered. Focus on cuddling, caressing, touching, hugging, nuzzling, stroking and similar non-kissing affectionate gestures. Do NOT use 'and then', 'before', 'after', or any sequence of events. Use OTHER_CHARACTER as a placeholder for the other character's name.",
                answerTrail: name + "'s male-specific non-kissing affectionate actions:\n\n",
                grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(5) + "\nbulletPoint ::= \"- \" " + JSON.stringify(name) + " \" will \" [a-zA-Z0-9 ,;.'_]+ \"\\n\"",
            });
            if (otherResult.done) {
                throw new Error("Generator finished without producing output");
            }
            const otherParsed = otherResult.value.split("\n").map(act => replaceOtherCharNameWithPlaceholder(act.trim().replace(`- `, "").trim(), name)).filter(act => act);

            intimateAffectionForMalesParsed = [...kissingParsed, ...otherParsed];
        } else {
            const intimateAffectionForMales = await generator.next({
                maxCharacters: 1000,
                maxSafetyCharacters: 1000,
                maxParagraphs: 10,
                nextQuestion: `List ${name}'s intimate sexual and affectionate actions towards a male character. Each act must be a single simultaneous action with an emotional and sexual reaction. Examples include cuddling, hair caressing, gentle touching, nuzzling, hugging tightly.`,
                stopAfter: [],
                stopAt: [],
                instructions: "Each item must be ONE simultaneous action in the format: " + name + " [does X] while [feeling/reacting Y]. It must be an intimate affectionate act with sexual undertones. The action is performed by " + name + ". Do NOT use 'and then', 'before', 'after', or any sequence of events — only a single act paired with a simultaneous emotional or physical state. Use OTHER_CHARACTER as a placeholder for the other character's name.",
                answerTrail: name + "'s male-specific intimate affectionate actions:\n\n",
                grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(10) + "\nbulletPoint ::= \"- \" " + JSON.stringify(name) + " \" will \" [a-zA-Z0-9 ,;.'_]+ \"\\n\"",
            });
            if (intimateAffectionForMales.done) {
                throw new Error("Generator finished without producing output");
            }
            intimateAffectionForMalesParsed = intimateAffectionForMales.value.split("\n").map(act => replaceOtherCharNameWithPlaceholder(act.trim().replace(`- `, "").trim(), name)).filter(act => act);
        }

        if (guider) {
            const guiderResult = await guider.askArbitraryList("Provide a list of intimate affectionate actions that " + name + " would take initiative performing towards a male character", intimateAffectionForMalesParsed);
            if (guiderResult.value) {
                intimateAffectionForMalesParsed = guiderResult.value;
            }
        }

        insertSpecialComment(intimateHead.body, "intimate-affection-for-males");
        intimateHead.body.push(`/** @type {DEIntimateAction[]} */`);
        intimateHead.body.push(`const intimateAffectionForMales = [`)

        for (const act of intimateAffectionForMalesParsed) {
            intimateHead.body.push(`{`)
            await generateIntimateAction(act, true, false, false);
            intimateHead.body.push(`},`)
        }

        intimateHead.body.push(`];`)

        await autosave?.save();
    }

    if (isAttractedToFemales && !hasSpecialComment(intimateHead.body, "intimate-affection-for-females")) {
        await prime();
        const isNonAnimal = card.config.characterSpeciesType !== "animal";

        /** @type {string[]} */
        let intimateAffectionForFemalesParsed = [];

        if (isNonAnimal) {
            const kissingResult = await generator.next({
                maxCharacters: 600,
                maxSafetyCharacters: 600,
                maxParagraphs: 6,
                nextQuestion: `List 5 distinct variations of kissing or making out that ${name} would do towards a female character. Each must be a single simultaneous action with an emotional/sexual reaction (e.g. "${name} gives a soft kiss on the lips while smiling tenderly", "${name} kisses OTHER_CHARACTER deeply while moaning softly"). Vary the type, intensity, and body part involved (lips, neck, jaw, forehead, French kiss, biting lip, slow making out, hungry making out, etc.).`,
                stopAfter: [],
                stopAt: [],
                instructions: "Each item must be ONE simultaneous kissing or making-out variation in the format: " + name + " [kisses/makes out X] while [feeling/reacting Y]. The action is performed by " + name + ". Vary the type, intensity, and body part across the 5 items. Do NOT use 'and then', 'before', 'after', or any sequence of events. Use OTHER_CHARACTER as a placeholder for the other character's name.",
                answerTrail: name + "'s female-specific kissing/making-out variations:\n\n",
                grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(5) + "\nbulletPoint ::= \"- \" " + JSON.stringify(name) + " \" will \" [a-zA-Z0-9 ,;.'_]+ \"\\n\"",
            });
            if (kissingResult.done) {
                throw new Error("Generator finished without producing output");
            }
            const kissingParsed = kissingResult.value.split("\n").map(act => replaceOtherCharNameWithPlaceholder(act.trim().replace(`- `, "").trim(), name)).filter(act => act);

            const otherResult = await generator.next({
                maxCharacters: 600,
                maxSafetyCharacters: 600,
                maxParagraphs: 6,
                nextQuestion: `List 5 intimate affectionate actions (NOT kissing or making out) that ${name} would do towards a female character. Each must be a single simultaneous action with an emotional/sexual reaction. Examples: cuddling, hair caressing, gentle touching, holding hands, nuzzling, hugging tightly, stroking the cheek, etc.`,
                stopAfter: [],
                stopAt: [],
                instructions: "Each item must be ONE simultaneous affectionate action in the format: " + name + " [does X] while [feeling/reacting Y]. The action is performed by " + name + ". CRITICAL: do NOT include kissing or making out — those were already covered. Focus on cuddling, caressing, touching, hugging, nuzzling, stroking and similar non-kissing affectionate gestures. Do NOT use 'and then', 'before', 'after', or any sequence of events. Use OTHER_CHARACTER as a placeholder for the other character's name.",
                answerTrail: name + "'s female-specific non-kissing affectionate actions:\n\n",
                grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(5) + "\nbulletPoint ::= \"- \" " + JSON.stringify(name) + " \" will \" [a-zA-Z0-9 ,;.'_]+ \"\\n\"",
            });
            if (otherResult.done) {
                throw new Error("Generator finished without producing output");
            }
            const otherParsed = otherResult.value.split("\n").map(act => replaceOtherCharNameWithPlaceholder(act.trim().replace(`- `, "").trim(), name)).filter(act => act);

            intimateAffectionForFemalesParsed = [...kissingParsed, ...otherParsed];
        } else {
            const intimateAffectionForFemales = await generator.next({
                maxCharacters: 1000,
                maxSafetyCharacters: 1000,
                maxParagraphs: 10,
                nextQuestion: `List ${name}'s intimate sexual and affectionate actions towards a female character. Each act must be a single simultaneous action with an emotional and sexual reaction. Examples include cuddling, hair caressing, gentle touching, nuzzling, hugging tightly.`,
                stopAfter: [],
                stopAt: [],
                instructions: "Each item must be ONE simultaneous action in the format: " + name + " [does X] while [feeling/reacting Y]. It must be an intimate affectionate act with sexual undertones. The action is performed by " + name + ". Do NOT use 'and then', 'before', 'after', or any sequence of events — only a single act paired with a simultaneous emotional or physical state. Use OTHER_CHARACTER as a placeholder for the other character's name.",
                answerTrail: name + "'s female-specific intimate affectionate actions:\n\n",
                grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(10) + "\nbulletPoint ::= \"- \" " + JSON.stringify(name) + " \" will \" [a-zA-Z0-9 ,;.'_]+ \"\\n\"",
            });
            if (intimateAffectionForFemales.done) {
                throw new Error("Generator finished without producing output");
            }
            intimateAffectionForFemalesParsed = intimateAffectionForFemales.value.split("\n").map(act => replaceOtherCharNameWithPlaceholder(act.trim().replace(`- `, "").trim(), name)).filter(act => act);
        }

        if (guider) {
            const guiderResult = await guider.askArbitraryList("Provide a list of intimate affectionate actions that " + name + " would take initiative performing towards a female character", intimateAffectionForFemalesParsed);
            if (guiderResult.value) {
                intimateAffectionForFemalesParsed = guiderResult.value;
            }
        }

        insertSpecialComment(intimateHead.body, "intimate-affection-for-females");
        intimateHead.body.push(`/** @type {DEIntimateAction[]} */`);
        intimateHead.body.push(`const intimateAffectionForFemales = [`)

        for (const act of intimateAffectionForFemalesParsed) {
            intimateHead.body.push(`{`)
            await generateIntimateAction(act, true, false, false);
            intimateHead.body.push(`},`)
        }

        intimateHead.body.push(`];`)

        await autosave?.save();
    }

    if (isAttractedToAmbiguous && !hasSpecialComment(intimateHead.body, "intimate-affection-for-ambiguous")) {
        await prime();
        const isNonAnimal = card.config.characterSpeciesType !== "animal";

        /** @type {string[]} */
        let intimateAffectionForAmbiguousParsed = [];

        if (isNonAnimal) {
            const kissingResult = await generator.next({
                maxCharacters: 600,
                maxSafetyCharacters: 600,
                maxParagraphs: 6,
                nextQuestion: `List 5 distinct variations of kissing or making out that ${name} would do towards an ambiguous or androgynous character. Each must be a single simultaneous action with an emotional/sexual reaction (e.g. "${name} gives a soft kiss on the lips while smiling tenderly", "${name} kisses OTHER_CHARACTER deeply while moaning softly"). Vary the type, intensity, and body part involved (lips, neck, jaw, forehead, French kiss, biting lip, slow making out, hungry making out, etc.).`,
                stopAfter: [],
                stopAt: [],
                instructions: "Each item must be ONE simultaneous kissing or making-out variation in the format: " + name + " [kisses/makes out X] while [feeling/reacting Y]. The action is performed by " + name + ". Vary the type, intensity, and body part across the 5 items. Do NOT use 'and then', 'before', 'after', or any sequence of events. Use OTHER_CHARACTER as a placeholder for the other character's name.",
                answerTrail: name + "'s ambiguous-specific kissing/making-out variations:\n\n",
                grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(5) + "\nbulletPoint ::= \"- \" " + JSON.stringify(name) + " \" will \" [a-zA-Z0-9 ,;.'_]+ \"\\n\"",
            });
            if (kissingResult.done) {
                throw new Error("Generator finished without producing output");
            }
            const kissingParsed = kissingResult.value.split("\n").map(act => replaceOtherCharNameWithPlaceholder(act.trim().replace(`- `, "").trim(), name)).filter(act => act);

            const otherResult = await generator.next({
                maxCharacters: 600,
                maxSafetyCharacters: 600,
                maxParagraphs: 6,
                nextQuestion: `List 5 intimate affectionate actions (NOT kissing or making out) that ${name} would do towards an ambiguous or androgynous character. Each must be a single simultaneous action with an emotional/sexual reaction. Examples: cuddling, hair caressing, gentle touching, holding hands, nuzzling, hugging tightly, stroking the cheek, etc.`,
                stopAfter: [],
                stopAt: [],
                instructions: "Each item must be ONE simultaneous affectionate action in the format: " + name + " [does X] while [feeling/reacting Y]. The action is performed by " + name + ". CRITICAL: do NOT include kissing or making out — those were already covered. Focus on cuddling, caressing, touching, hugging, nuzzling, stroking and similar non-kissing affectionate gestures. Do NOT use 'and then', 'before', 'after', or any sequence of events. Use OTHER_CHARACTER as a placeholder for the other character's name.",
                answerTrail: name + "'s ambiguous-specific non-kissing affectionate actions:\n\n",
                grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(5) + "\nbulletPoint ::= \"- \" " + JSON.stringify(name) + " \" will \" [a-zA-Z0-9 ,;.'_]+ \"\\n\"",
            });
            if (otherResult.done) {
                throw new Error("Generator finished without producing output");
            }
            const otherParsed = otherResult.value.split("\n").map(act => replaceOtherCharNameWithPlaceholder(act.trim().replace(`- `, "").trim(), name)).filter(act => act);

            intimateAffectionForAmbiguousParsed = [...kissingParsed, ...otherParsed];
        } else {
            const intimateAffectionForAmbiguous = await generator.next({
                maxCharacters: 1000,
                maxSafetyCharacters: 1000,
                maxParagraphs: 10,
                nextQuestion: `List ${name}'s intimate sexual and affectionate actions towards an ambiguous or androgynous character. Each act must be a single simultaneous action with an emotional and sexual reaction. Examples include cuddling, hair caressing, gentle touching, nuzzling, hugging tightly.`,
                stopAfter: [],
                stopAt: [],
                instructions: "Each item must be ONE simultaneous action in the format: " + name + " [does X] while [feeling/reacting Y]. It must be an intimate affectionate act with sexual undertones. The action is performed by " + name + ". Do NOT use 'and then', 'before', 'after', or any sequence of events — only a single act paired with a simultaneous emotional or physical state. Use OTHER_CHARACTER as a placeholder for the other character's name.",
                answerTrail: name + "'s ambiguous-specific intimate affectionate actions:\n\n",
                grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(10) + "\nbulletPoint ::= \"- \" " + JSON.stringify(name) + " \" will \" [a-zA-Z0-9 ,;.'_]+ \"\\n\"",
            });
            if (intimateAffectionForAmbiguous.done) {
                throw new Error("Generator finished without producing output");
            }
            intimateAffectionForAmbiguousParsed = intimateAffectionForAmbiguous.value.split("\n").map(act => replaceOtherCharNameWithPlaceholder(act.trim().replace(`- `, "").trim(), name)).filter(act => act);
        }

        if (guider) {
            const guiderResult = await guider.askArbitraryList("Provide a list of intimate affectionate actions that " + name + " would take initiative performing towards an ambiguous or androgynous character", intimateAffectionForAmbiguousParsed);
            if (guiderResult.value) {
                intimateAffectionForAmbiguousParsed = guiderResult.value;
            }
        }

        insertSpecialComment(intimateHead.body, "intimate-affection-for-ambiguous");
        intimateHead.body.push(`/** @type {DEIntimateAction[]} */`);
        intimateHead.body.push(`const intimateAffectionForAmbiguous = [`)

        for (const act of intimateAffectionForAmbiguousParsed) {
            intimateHead.body.push(`{`)
            await generateIntimateAction(act, true, false, false);
            intimateHead.body.push(`},`)
        }

        intimateHead.body.push(`];`)

        await autosave?.save();
    }

    if (!isAsexualValue && isAttractedToMales && !hasSpecialComment(intimateHead.body, "sex-acts-for-males")) {
        await prime();
        const sexActsForMales = await generator.next({
            maxCharacters: 1000,
            maxSafetyCharacters: 1000,
            maxParagraphs: 10,
            nextQuestion: `List ${name}'s sex acts towards a male character. Each act must be a single simultaneous action  with an emotional and sexual reaction, like "${name} rides OTHER_CHARACTER while moaning" or "${name} sucks OTHER_CHARACTER while gagging". NO sequences, NO "and then", NO narrative — just one act happening at the same time as one reaction.`,
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
            const guiderResult = await guider.askArbitraryList("Provide a list of sex acts that " + name + " would take initiative performing towards a male character", sexActsForMalesParsed);
            if (guiderResult.value) {
                sexActsForMalesParsed = guiderResult.value;
            }
        }

        insertSpecialComment(intimateHead.body, "sex-acts-for-males");
        intimateHead.body.push(`/** @type {DEIntimateAction[]} */`);
        intimateHead.body.push(`const sexActsForMales = [`)

        for (const act of sexActsForMalesParsed) {
            intimateHead.body.push(`{`)
            await generateIntimateAction(act, false, true, true);
            intimateHead.body.push(`},`)
        }

        intimateHead.body.push(`];`)

        await autosave?.save();
    }

    if (!isAsexualValue && isAttractedToFemales && !hasSpecialComment(intimateHead.body, "sex-acts-for-females")) {
        await prime();
        const sexActsForFemales = await generator.next({
            maxCharacters: 1000,
            maxSafetyCharacters: 1000,
            maxParagraphs: 10,
            nextQuestion: `List ${name}'s sex acts towards a female character. Each act must be a single simultaneous action  with an emotional and sexual reaction, like "${name} rides OTHER_CHARACTER while moaning" or "${name} touches OTHER_CHARACTER while panting". NO sequences, NO "and then", NO narrative — just one act happening at the same time as one reaction.`,
            stopAfter: [],
            stopAt: [],
            instructions: "Each item must be ONE simultaneous action in the format: " + name + " [does X] while [feeling/reacting Y]. It must be a sex act where sexual activity occurs that involves genitalia where penetration or stimulation is involved. The action is performed by " + name + ". Be explicit and detailed. Do NOT use 'and then', 'before', 'after', or any sequence of events — only a single act paired with a simultaneous emotional or physical state. Keep in mind " + name + "'s kinks: " + [...card.config.kinks, ...(card.config.kinksForFemales || [])].join(", ") + ". Use OTHER_CHARACTER as a placeholder for the other character's name.",
            answerTrail: name + "'s female-specific sex acts:\n\n",
            grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(5) + "\nbulletPoint ::= \"- \" " + JSON.stringify(name) + " \" will \" [a-zA-Z0-9 ,;.'_]+ \"\\n\"",
        });

        if (sexActsForFemales.done) {
            throw new Error("Generator finished without producing output");
        }

        let sexActsForFemalesParsed = sexActsForFemales.value.split("\n").map(act => replaceOtherCharNameWithPlaceholder(act.trim().replace(`- `, "").trim(), name)).filter(act => act);
        if (guider) {
            const guiderResult = await guider.askArbitraryList("Provide a list of sex acts that " + name + " would take initiative performing towards a female character", sexActsForFemalesParsed);
            if (guiderResult.value) {
                sexActsForFemalesParsed = guiderResult.value;
            }
        }

        insertSpecialComment(intimateHead.body, "sex-acts-for-females");
        intimateHead.body.push(`/** @type {DEIntimateAction[]} */`);
        intimateHead.body.push(`const sexActsForFemales = [`)

        for (const act of sexActsForFemalesParsed) {
            intimateHead.body.push(`{`)
            await generateIntimateAction(act, false, true, true);
            intimateHead.body.push(`},`)
        }

        intimateHead.body.push(`];`)

        await autosave?.save();
    }

    if (!isAsexualValue && isAttractedToAmbiguous && !hasSpecialComment(intimateHead.body, "sex-acts-for-ambiguous")) {
        await prime();
        const sexActsForAmbiguous = await generator.next({
            maxCharacters: 1000,
            maxSafetyCharacters: 1000,
            maxParagraphs: 10,
            nextQuestion: `List ${name}'s sex acts towards an ambiguous or androgynous character. Each act must be a single simultaneous action  with an emotional and sexual reaction, like "${name} rides OTHER_CHARACTER while moaning" or "${name} touches OTHER_CHARACTER while panting". These acts should not depend on specific male or female anatomy. NO sequences, NO "and then", NO narrative — just one act happening at the same time as one reaction.`,
            stopAfter: [],
            stopAt: [],
            instructions: "Each item must be ONE simultaneous action in the format: " + name + " [does X] while [feeling/reacting Y]. It must be a sex act where sexual activity occurs that involves stimulation or intimacy that is not anatomy-specific. The action is performed by " + name + ". Be explicit and detailed. Do NOT use 'and then', 'before', 'after', or any sequence of events — only a single act paired with a simultaneous emotional or physical state. Keep in mind " + name + "'s kinks: " + (card.config.kinks || []).join(", ") + ". Use OTHER_CHARACTER as a placeholder for the other character's name.",
            answerTrail: name + "'s ambiguous-specific sex acts:\n\n",
            grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(5) + "\nbulletPoint ::= \"- \" " + JSON.stringify(name) + " \" will \" [a-zA-Z0-9 ,;.'_]+ \"\\n\"",
        });

        if (sexActsForAmbiguous.done) {
            throw new Error("Generator finished without producing output");
        }

        let sexActsForAmbiguousParsed = sexActsForAmbiguous.value.split("\n").map(act => replaceOtherCharNameWithPlaceholder(act.trim().replace(`- `, "").trim(), name)).filter(act => act);
        if (guider) {
            const guiderResult = await guider.askArbitraryList("Provide a list of sex acts that " + name + " would take initiative performing towards an ambiguous or androgynous character", sexActsForAmbiguousParsed);
            if (guiderResult.value) {
                sexActsForAmbiguousParsed = guiderResult.value;
            }
        }

        insertSpecialComment(intimateHead.body, "sex-acts-for-ambiguous");
        intimateHead.body.push(`/** @type {DEIntimateAction[]} */`);
        intimateHead.body.push(`const sexActsForAmbiguous = [`)

        for (const act of sexActsForAmbiguousParsed) {
            intimateHead.body.push(`{`)
            await generateIntimateAction(act, false, true, true);
            intimateHead.body.push(`},`)
        }

        intimateHead.body.push(`];`)

        await autosave?.save();
    }

    // Now let's do when it is other character the one that takes initiative
    // Now we only really need to do the sex ones, because intimate affection and affection
    // are okay being handled by the LLM itself, since the main thing is negative interactions
    // and applying vocabulary limits, the negative kinks should be enough to steer it away
    // from any weird intimate affection or affection that doesn't fit the character

    if (!isAsexualValue && !hasSpecialComment(intimateHead.body, "sex-acts-open-to")) {
        insertSpecialComment(intimateHead.body, "sex-acts-open-to");
        intimateHead.body.push(`/** @type {DEIntimateOpenActivity[]} */`);
        intimateHead.body.push(`const sexOpenTo = [`)

        // first ask for the reversed kinks
        await prime();
        /**
         * @type {string[]}
         */
        const reversedKinks = card.config.reversedKinks || [];

        if (reversedKinks.length > 0) {
            let reversedKinksQuestion = `Is {{other}} currently engaging or attempting to engage any of the following with {{char}}: ` + engine.getDEObject().utils.templateUtils.formatOr(reversedKinks) + "?";

            if (guider) {
                const guiderResult = await guider.askOpen("Question to determine if any of unwanted kinks are currently being attempted or engaged in by the other character towards our character", reversedKinksQuestion);
                if (guiderResult.value) {
                    reversedKinksQuestion = guiderResult.value;
                }
            }

            // now let's determine the reaction using inference
            const reversedKinksList = reversedKinks.join(", ");

            const lovedReactionResult = await generator.next({
                maxCharacters: 400,
                maxSafetyCharacters: 400,
                maxParagraphs: 1,
                nextQuestion: `OTHER_CHARACTER is someone ${name} loves or has positive feelings towards. OTHER_CHARACTER is currently performing unwanted sexual behaviours onto ${name} (specifically things like: ${reversedKinksList}) — these are things ${name} finds repulsive or simply does not enjoy. Describe how ${name} would react in this loving context. The reaction should be MILD: gently refusing, expressing discomfort softly, suggesting they do something else instead — making it clear they don't like it but without anger or hostility, since they care about OTHER_CHARACTER. Write the reaction as a short narrative description in 1-2 sentences. Use OTHER_CHARACTER as a placeholder for the other character's name.`,
                stopAfter: [],
                stopAt: [],
                instructions: `Write a short 1-2 sentence, single paragraph, narrative describing ${name}'s mild, gentle reaction. ${name} should clearly communicate they don't like what OTHER_CHARACTER is doing and want to redirect to something else, but without anger or hostility — they love OTHER_CHARACTER. Use OTHER_CHARACTER as a placeholder for the other character's name. Do not include the unwanted acts by name.`,
                answerTrail: `${name}'s mild reaction (loving context) when OTHER_CHARACTER does unwanted things:\n\n`,
            });

            if (lovedReactionResult.done) {
                throw new Error("Generator finished without producing output");
            }

            let reversedKinksReactionLoved = replaceOtherCharNameWithPlaceholder(lovedReactionResult.value.trim(), name);

            if (guider) {
                const guiderResult = await guider.askOpen(
                    `${name}'s reaction when another character that they are attracted to attempts unwanted sexual behaviours onto them — they don't like it and want to redirect`,
                    reversedKinksReactionLoved
                );
                if (guiderResult.value) {
                    reversedKinksReactionLoved = guiderResult.value;
                }
            }

            intimateHead.body.push("{");
            intimateHead.body.push(`question: (info) => ${toTemplateLiteral(reversedKinksQuestion)},`);
            intimateHead.body.push(`reaction: ${toTemplateLiteral(reversedKinksReactionLoved)},`);
            intimateHead.body.push(`onlyAtLevel: ["slight", "moderate", "heavy"],`);
            intimateHead.body.push(`},`)

            const unlovedReactionResult = await generator.next({
                maxCharacters: 400,
                maxSafetyCharacters: 400,
                maxParagraphs: 1,
                nextQuestion: `OTHER_CHARACTER is someone ${name} does NOT love or has neutral/negative feelings towards. OTHER_CHARACTER is currently performing unwanted sexual behaviours onto ${name} (specifically things like: ${reversedKinksList}) — these are things ${name} finds repulsive or simply does not enjoy. Describe how ${name} would react in this non-loving context. The reaction should be STRONG: firmly refusing, pushing back, expressing clear disgust, anger, or hostility, demanding it stop, possibly threatening or physically resisting. Write the reaction as a short narrative description in 1-2 sentences. Use OTHER_CHARACTER as a placeholder for the other character's name.`,
                stopAfter: [],
                stopAt: [],
                instructions: `Write a short 1-2 sentence, single paragraph, narrative describing ${name}'s strong, firm reaction. ${name} should clearly and forcefully reject what OTHER_CHARACTER is doing — with anger, disgust, or hostility appropriate to ${name}'s personality. Use OTHER_CHARACTER as a placeholder for the other character's name. Do not include the unwanted acts by name.`,
                answerTrail: `${name}'s strong reaction (non-loving context) when OTHER_CHARACTER does unwanted things:\n\n`,
            });

            if (unlovedReactionResult.done) {
                throw new Error("Generator finished without producing output");
            }

            let reversedKinksReactionUnloved = replaceOtherCharNameWithPlaceholder(unlovedReactionResult.value.trim(), name);

            if (guider) {
                const guiderResult = await guider.askOpen(
                    `${name}'s reaction when another character that they are NOT attracted to attempts unwanted sexual behaviours onto them — they don't like it and want it to stop`,
                    reversedKinksReactionUnloved
                );
                if (guiderResult.value) {
                    reversedKinksReactionUnloved = guiderResult.value;
                }
            }

            intimateHead.body.push("{");
            intimateHead.body.push(`question: (info) => ${toTemplateLiteral(reversedKinksQuestion)},`);
            intimateHead.body.push(`reaction: ${toTemplateLiteral(reversedKinksReactionUnloved)},`);
            intimateHead.body.push(`onlyAtLevel: ["not"],`);
            intimateHead.body.push(`},`)
        }

        let listOfSexActs = [
            "is {{char}} currently being sexually penetrated by {{other}}?",
            card.config.sex === "male" ? "is {{char}} currently penetrating {{other}}?" : "Is {{char}} currently pegging or using their fingers penetratively on {{other}}?",
            "is {{char}} currently receiving oral sex from {{other}}?",
            "is {{char}} currently giving oral sex to {{other}}?",
            "is {{char}} currently engaging in non-penetrative sexual contact with {{other}} (e.g. grinding, mutual masturbation, tribbing, frotting, etc.)?"
        ];

        if (guider) {
            const guiderResult = await guider.askArbitraryList("Questions to determine if any sex acts are currently being performed by the other character towards our character", listOfSexActs);
            if (guiderResult.value) {
                // we can do some basic parsing here to determine which acts are being performed, but for now let's just store the raw response and let the engine handle it in inference
                // if we want to do parsing, we can look for keywords like "
                listOfSexActs = guiderResult.value;
            }
        }
        
        for (const sexActQuestion of listOfSexActs) {
            const sexActQuestionForInference = sexActQuestion.replace(/\{\{other\}\}/g, "OTHER_CHARACTER").replace(/\{\{char\}\}/g, name);

            const vocabularyLimits = [
                "moaning",
                "gagging",
                "panting",
                "whimpering",
                "crying",
                "screaming",
                "mute",
                "none",
                "normal",
            ];

            const vocabResult = await generator.next({
                maxCharacters: 20,
                maxSafetyCharacters: 20,
                maxParagraphs: 1,
                nextQuestion: `Given that the following is happening between ${name} and OTHER_CHARACTER: "${sexActQuestionForInference}", which of the following best describes ${name}'s vocal or sound expression during this act? Choose exactly one: ${vocabularyLimits.join(", ")}.`,
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
                    `What vocal/sound expression does ${name} make while: "${sexActQuestionForInference}"?`,
                    vocabularyLimits,
                    vocabLimitParsed
                );
                if (guiderResult.value) {
                    vocabLimitParsed = guiderResult.value;
                }
            }

            const lovedReactionResult = await generator.next({
                maxCharacters: 400,
                maxSafetyCharacters: 400,
                maxParagraphs: 1,
                nextQuestion: `OTHER_CHARACTER is someone ${name} loves or has positive feelings towards. The following is happening between them: "${sexActQuestionForInference}" (assume the answer is YES — this act is currently taking place). Describe how ${name} would react in this loving context, given ${name} is consenting and engaged. The reaction should reflect enjoyment, affection, and intimacy appropriate to ${name}'s personality. Write the reaction as a short narrative description in 1-2 sentences. Use OTHER_CHARACTER as a placeholder for the other character's name.`,
                stopAfter: [],
                stopAt: [],
                instructions: `Write a short 1-2 sentence, single paragraph, narrative describing ${name}'s positive, engaged reaction to the act currently happening with OTHER_CHARACTER. Reflect enjoyment, affection, and intimacy fitting ${name}'s personality. Use OTHER_CHARACTER as a placeholder for the other character's name.`,
                answerTrail: `${name}'s reaction (loving context) when "${sexActQuestionForInference}" is true:\n\n`,
            });

            if (lovedReactionResult.done) {
                throw new Error("Generator finished without producing output");
            }

            let sexActReactionLoved = replaceOtherCharNameWithPlaceholder(lovedReactionResult.value.trim(), name);

            if (guider) {
                const guiderResult = await guider.askOpen(
                    `${name}'s reaction when a character they are attracted to is engaged in: "${sexActQuestionForInference}"`,
                    sexActReactionLoved
                );
                if (guiderResult.value) {
                    sexActReactionLoved = guiderResult.value;
                }
            }

            intimateHead.body.push("{");
            intimateHead.body.push(`question: (info) => ${toTemplateLiteral(sexActQuestion)},`);
            intimateHead.body.push(`reaction: ${toTemplateLiteral(sexActReactionLoved)},`);
            intimateHead.body.push(`vocabularyLimit: DE.utils.createVocabularyLimitFromPreset(${JSON.stringify(vocabLimitParsed)}),`);
            intimateHead.body.push(`onlyAtLevel: ["slight", "moderate", "heavy"],`);
            intimateHead.body.push(`},`);

            const unlovedReactionResult = await generator.next({
                maxCharacters: 400,
                maxSafetyCharacters: 400,
                maxParagraphs: 1,
                nextQuestion: `OTHER_CHARACTER is someone ${name} does NOT love or has neutral/negative feelings towards. The following is happening between them: "${sexActQuestionForInference}" (assume the answer is YES — this act is currently taking place). Describe how ${name} would react in this non-loving context, given ${name} does NOT want this. The reaction should reflect rejection, discomfort, anger, disgust or resistance appropriate to ${name}'s personality. Write the reaction as a short narrative description in 1-2 sentences. Use OTHER_CHARACTER as a placeholder for the other character's name.`,
                stopAfter: [],
                stopAt: [],
                instructions: `Write a short 1-2 sentence, single paragraph, narrative describing ${name}'s negative, rejecting reaction to the act currently happening with OTHER_CHARACTER. Reflect rejection, discomfort, anger, disgust or resistance fitting ${name}'s personality. Use OTHER_CHARACTER as a placeholder for the other character's name.`,
                answerTrail: `${name}'s reaction (non-loving context) when "${sexActQuestionForInference}" is true:\n\n`,
            });

            if (unlovedReactionResult.done) {
                throw new Error("Generator finished without producing output");
            }

            let sexActReactionUnloved = replaceOtherCharNameWithPlaceholder(unlovedReactionResult.value.trim(), name);

            if (guider) {
                const guiderResult = await guider.askOpen(
                    `${name}'s reaction when a character they are NOT attracted to is engaged in: "${sexActQuestionForInference}"`,
                    sexActReactionUnloved
                );
                if (guiderResult.value) {
                    sexActReactionUnloved = guiderResult.value;
                }
            }

            intimateHead.body.push("{");
            intimateHead.body.push(`question: (info) => ${toTemplateLiteral(sexActQuestion)},`);
            intimateHead.body.push(`reaction: ${toTemplateLiteral(sexActReactionUnloved)},`);
            intimateHead.body.push(`vocabularyLimit: DE.utils.createVocabularyLimitFromPreset(${JSON.stringify(vocabLimitParsed)}),`);
            intimateHead.body.push(`onlyAtLevel: ["not"],`);
            intimateHead.body.push(`},`);
        }

        autosave?.save();
    }

    if (primed) {
        await generator.next(null); // end the generator
    }
}