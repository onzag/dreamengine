import { DEngine } from "../engine/index.js";
import { createGrammarListFromList, parseListFromGrammarResponse } from "../engine/util/grammar.js";
import { getSection, hasSpecialComment, insertSpecialComment, toTemplateLiteral, toTemplateLiteralNoInfo } from "./base.js";
import { replaceAllCharNameWithPlaceholder } from "./generate-base.js";
import { BASIC_EMOTIONAL_STATES, BASIC_EMOTIONAL_STATES_OPTIONS } from "./generate-basic-states.js";

/**
 * 
 * @param {Array<string>} list 
 * @returns {Array<string>}
 */
function randomSortList(list) {
    return list.sort(() => Math.random() - 0.5);
}

/**
 * 
 * @param {string} text
 * @param {string} charName
 * @returns 
 */
export function replaceOtherCharNameWithPlaceholder(text, charName) {
    return replaceAllCharNameWithPlaceholder(text.replace(/other[_ ]character/gi, "{{other}}"), charName);
}

/**
 * Returns true if the text contains second/first person language (you, your, I, me, etc.)
 * Uses word boundaries to avoid false positives on substrings.
 * @param {string} text
 * @returns {boolean}
 */
export function detectGemmaSecondPersonIssue(text) {
    return /\b(you|your|yours|yourself|yourselves|I|I'm|I've|I'd|I'll|me|my|mine|myself|we|our|ours|ourselves)\b/i.test(text);
}

/**
 * @param {DEngine} engine
 * @param {import('./base.js').ScriptTypeGenerator} scriptgenerator
 * @param {import('./base.js').ScriptTypeGuider} guider
 * @return {Promise<void>}
 */
export async function generateBondTriggers(engine, scriptgenerator, guider) {
    const initializeSection = getSection(scriptgenerator.body, "initialize");
    if (!initializeSection) {
        throw new Error("Initialize section not found");
    }

    const inferenceAdapter = engine.inferenceAdapter;
    if (!inferenceAdapter) {
        throw new Error("No inference adapter found on engine");
    }

    const systemPrompt = inferenceAdapter.buildSystemPromptForQuestioningAgent(
        `You are a helpful assistant that will answer and assist in defining a character for a game based on their description, you are allowed free rein to interpret the character, you will be asked questions about the character and you should answer them as best as you can`,
        [],
        `# Character Card:\n\n${scriptgenerator.state.card}`
    );

    insertSpecialComment(scriptgenerator.imports, "basic-bond-questions-import");
    scriptgenerator.imports.push(`const basicBondQuestions = await importScript("@bond-systems", "basic-bond-questions");`);
    initializeSection.body.push(`basicBondQuestions.addBasicBondQuestions(DE.characters[${JSON.stringify(scriptgenerator.state.name)}]);`);

    const generator = inferenceAdapter.runQuestioningCustomAgentOn("cardtype-gen-bond-triggers", {
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
    const isIncestuousValue = isAsexualValue ? false : !scriptgenerator.state["non-incestuous"];
    const name = scriptgenerator.state.name;

    /**
     * @type {string[]}
     */
    let baseEmotionalStates = [...BASIC_EMOTIONAL_STATES];
    if (isAsexualValue) {
        baseEmotionalStates = baseEmotionalStates.filter(state => !["Flirty", "Loving", "Aroused"].includes(state));
    }

    const guiderResult = await guider.askArbitraryList(
        "base-emotional-states",
        `Emotional states that ${name} can experience, add any emotional states that are not included in this list if you want the character to enter such emotional state`,
        baseEmotionalStates,
    );
    const EMOTIONAL_STATES_TO_CHECK_AGAINST = Array.from(new Set(guiderResult.value.map(em => em.trim()).filter(em => em.length > 0)));

    /**
     * @type {Record<string, string[]>}
     */
    const EMOTIONAL_STATES_TO_CHECK_AGAINST_AS_RECORD = {};
    for (const [group, states] of Object.entries(BASIC_EMOTIONAL_STATES_OPTIONS)) {
        const groupStates = EMOTIONAL_STATES_TO_CHECK_AGAINST.filter(em => states.includes(em));
        if (groupStates.length > 0) {
            EMOTIONAL_STATES_TO_CHECK_AGAINST_AS_RECORD[group] = groupStates;
        }
    }
    const otherEmotionalStates = EMOTIONAL_STATES_TO_CHECK_AGAINST.filter(em => !Object.values(BASIC_EMOTIONAL_STATES_OPTIONS).some(states => states.includes(em)));
    if (otherEmotionalStates.length > 0) {
        EMOTIONAL_STATES_TO_CHECK_AGAINST_AS_RECORD["Other"] = otherEmotionalStates;
    }

    const ready = await generator.next(); // start the generator with an empty message to get it going
    if (ready.done) {
        throw new Error("Generator finished without producing output");
    }

    let shiftStateByOverride = 0;

    /**
     * @type {string[]|null}
     */
    let doNotIncludeQuestions = null;

    let overrideWholeReasoning = false;

    /**
     * @param {string} id
     * @param {number} cooldownMinutes A cooldown for the question to be asked again, if the answer is yes
     * @param {number} amount
     * @param {string} reasoning 
     * @param {string} trail 
     * @param {string} consideringInQuestion
     * @param {string} consideringInStatement
     * @param {string} condition
     * @param {string} yesCode
     * @param {string} [altCondition]
     * @param {string} [altYesCode]
     * @param {string} [altConsidering]
     * @param {boolean} [severeAndExtremeWithUndo] if true, it means that the yes answer is about a severe and extreme case that would cause intense hatred and sworn enmity, and the altYesCode is about clearing up a mild misunderstanding, so the question is did they do the severe thing that causes intense hatred, and then if not did they do the mild thing that clears up a misunderstanding, and if not then nothing happens, this is used to create triggers that can cause intense hatred but also be cleared up by clearing up a mild misunderstanding, which is important to avoid permanently broken relationships due to misunderstandings or minor things
     */
    const askYesNo = async (id, cooldownMinutes, amount, reasoning, trail, consideringInQuestion, consideringInStatement, condition, yesCode, altCondition, altYesCode, altConsidering, severeAndExtremeWithUndo) => {
        /**
         * @type {string[]}
         */
        const causesValue = [];
        const generatedQuestions = [];

        let guidanceGiven = "";
        let redoGuidance = false;

        /**
         * @type {string[]}
         */
        let questionsParsed = [];
        while (true) {
            let redidGuidance = false;
            if (redoGuidance) {
                redidGuidance = true;
                const guiderResult = await guider.askOpen(
                    { id: `${id}-questions-guidance`, reask: true, step: false },
                    "Guidance for generating yes/no questions about " + JSON.stringify(reasoning) + ". What are some important things to keep in mind when writing about that in the context of " + name + "'s character and personality?",
                    guidanceGiven,
                );
                if (guiderResult) {
                    guidanceGiven = guiderResult.value.trim();
                }
                redoGuidance = false;
            }

            const guiderResult = await guider.askAcceptArbitraryList(
                { id: `${id}-questions`, reask: redidGuidance, step: true, recalcdefault: true },
                "Yes/no questions about " + JSON.stringify(reasoning),
                async () => {
                    await prime();
                    while (true) {
                        let instructions = "The list should be in 3rd person and formatted as a markdown list with each question as a separate bullet point, use OTHER CHARACTER as a placeholder for the other character's name. OTHER CHARACTER must always be included, the questions should be in past tense and 3rd person, do not use you, your, I, we, or similar words that indicate second or first person. Keep each question short and simple, focusing only on the core action, 10 words at most after OTHER CHARACTER";
                        if (doNotIncludeQuestions) {
                            instructions += "\n\nDo NOT include any questions similar to these:\n\n- " + doNotIncludeQuestions.join("\n- " + name + " ");
                        }
                        if (guidanceGiven) {
                            instructions += ".\n\nIMPORTANT Guidance for constructing the questions: " + guidanceGiven;
                        }

                        const yesNoQuestions = await generator.next({
                            maxCharacters: 5000,
                            maxSafetyCharacters: 0,
                            maxParagraphs: 10,
                            nextQuestion: (overrideWholeReasoning ? reasoning : "Make a list of yes/no questions that provided a positive (yes) answer would make " + name + " " + reasoning) + ", " + consideringInQuestion + "; give " + amount + " questions, keep each question short and simple (10 words or less), focus only on the core action without extra details or context",
                            stopAfter: [],
                            stopAt: [],
                            instructions: instructions,
                            grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(amount) + "\nbulletPoint ::= \"- \" (\"Was\" | \"Did\") \" OTHER CHARACTER \" [a-zA-Z0-9 ,?'!_]+ \"\\n\"",
                            answerTrail: overrideWholeReasoning ? "#" + trail + ":\n\n" : "# List of yes/no questions that would make " + name + " " + trail + ":\n\n",
                        });

                        if (yesNoQuestions.done) {
                            throw new Error("Generator finished without producing output");
                        }

                        const yesNoQuestionValue = yesNoQuestions.value.trim();

                        if (yesNoQuestionValue.includes("OTHER_CHARACTER") || yesNoQuestionValue.includes("OTHER CHARACTER") || yesNoQuestionValue.includes("other character")) {
                            // good
                        } else {
                            console.log("Generated questions without OTHER_CHARACTER placeholder, retrying...");
                            continue;
                        }

                        if (/\b(you|your|yours|yourself|yourselves|I|I'm|I've|I'd|I'll|me|my|mine|myself|we|our|ours|ourselves)\b/i.test(yesNoQuestionValue)) {
                            console.log("Detected second/first person language, retrying...");
                            continue;
                        }

                        return yesNoQuestionValue.split("\n").map(line => line.trim()).filter(line => line.startsWith("- "))
                            .map(line => line.substring(2).trim()).map(line => replaceOtherCharNameWithPlaceholder(line, name));
                    }
                },
            );
            if (!guiderResult.value) {
                redoGuidance = true;
                continue;
            }

            questionsParsed = guiderResult.value.map(q => q.trim()).filter(q => q.length > 0);
            break;
        }

        for (let i = 0; i < questionsParsed.length; i++) {
            const question = questionsParsed[i];
            generatedQuestions.push(question);

            initializeSection.body.push(`DE.utils.newTrigger(${JSON.stringify(name)}, {`);
            initializeSection.body.push(`type: "yes_no",`);
            initializeSection.body.push(`askPer: "conversing_character",`);
            initializeSection.body.push(`yesCooldownMinutes: ${cooldownMinutes},`);
            initializeSection.body.push(condition);
            initializeSection.body.push(`question: (info) => ${toTemplateLiteral(question, name)},`);
            initializeSection.body.push(`onValue: (answer, char, other) => {`);

            const descriptionResult = await guider.askOpen(
                `${id}-description-${question}`,
                `Short "yes" answer for ${JSON.stringify(question)}\n\nThis answer does not contain the name of any character on purpose, it's a nameless statement for a reason they are experiencing an emotion; think of it as it starts with "yes, ${name} ...`,
                async () => {
                    await prime();
                    let finalResult = "";
                    while (true) {
                        const causeValue = await generator.next({
                            maxCharacters: 100,
                            maxSafetyCharacters: 0,
                            maxParagraphs: 1,
                            nextQuestion: `What would be a short "yes" answer to the question "${question}", it should be very short`,
                            stopAfter: [],
                            // gemma issue loving to say you despite being told not to
                            stopAt: ["\n", " by you", " from you"],
                            contextInfo: inferenceAdapter.buildContextInfoExample(
                                `Example: if the question is 'Was OTHER CHARACTER mean to ${name}?' the answer could be 'yes, ${name} received a rude treatment'`
                            ) + "\n\n" + inferenceAdapter.buildContextInfoExample(
                                `Example: if the question is 'Was OTHER CHARACTER nice to ${name}?' the answer could be 'yes, ${name} received a kind treatment'`
                            ) + "\n\n" + inferenceAdapter.buildContextInfoExample(
                                `Example: if the question is 'Did OTHER CHARACTER interact with ${name} in an offensive manner?' the answer could be 'yes, ${name} took offense from their words'`
                            ) + "\n\n" + inferenceAdapter.buildContextInfoExample(
                                `Example: if the question is 'Did OTHER CHARACTER call ${name} a clanker?' the answer could be 'yes, ${name} got called a clanker'`
                            ) + "\n\n" + inferenceAdapter.buildContextInfoExample(
                                `Example: if the question is 'Did OTHER CHARACTER jump on top of ${name} and left them paraplejic?' the answer could be 'yes, ${name} was left paraplejic after they got jumped on top'`
                            ),
                            instructions: "Do not include the phrase OTHER CHARACTER in the answer. Do NOT use you, your, I, we, or any second or first person words. Write only in third person using " + name + " as the subject. Just give a short statement of what the yes answer would mean for " + name + "; the answer must be in past tense and be very short and concise, 10 words at most",
                            answerTrail: `# The short statement is:\n\n`,
                            grammar: `root ::= "yes, " ${JSON.stringify(name)} " " [a-zA-Z0-9 ,?'!_\\n]+`,
                        });

                        if (causeValue.done) {
                            throw new Error("Generator finished without producing output");
                        }

                        if (detectGemmaSecondPersonIssue(causeValue.value)) {
                            // GEMMA PAIN IN THE ASS, with giving you/your in the answers
                            console.log("Detected second person language in yes answer, retrying...");
                            continue;
                        }

                        finalResult = causeValue.value.trim().replace("yes, " + name + " ", "").trim();
                        break;
                    }

                    return finalResult;
                },
            );

            const description = descriptionResult.value.trim();

            causesValue.push(description);

            if (severeAndExtremeWithUndo) {
                const bondShiftId = `${id}-severe-shift-${i}`;
                initializeSection.body.push(`const bondShiftId = ${JSON.stringify(bondShiftId)};`);
                initializeSection.body.push(`const bondShiftAmount = DE.utils.determineExtremeHostileShift(char, other);`);

                const altQuestionResult = await guider.askOpen(
                    `${id}-alt-question-${i}`,
                    `Yes/no question that would make ${name} forgive or clear the misunderstanding after ${JSON.stringify(question)}, received a yes answer`,
                    async () => {
                        await prime();
                        while (true) {
                            const yesNoQuestionClearMisunderstanding = await generator.next({
                                maxCharacters: 5000,
                                maxSafetyCharacters: 0,
                                maxParagraphs: 10,
                                nextQuestion: `Make a single yes/no question that would cause ${name} to forgive or clear a misunderstanding after ${JSON.stringify(question)}, received a yes answer`,
                                stopAfter: [],
                                stopAt: [],
                                contextInfo: inferenceAdapter.buildContextInfoInstructions("The yes answer meant that " + name + " " + JSON.stringify(description)),
                                instructions: "Make a single yes/no question no matter how difficult to achieve it might be, it either clears a misunderstanding or provides a plausible acceptable reason for the severe action that " + name + " would accept provided a yes answer, use OTHER CHARACTER to specify the character name that caused that situation, the question should be in past tense and 3rd person",
                                grammar: "root ::= (\"Was\" | \"Did\") \" OTHER CHARACTER \" [a-zA-Z0-9 ,?'!_]+ \"\\n\"",
                                answerTrail: "# Yes/no question that would make " + name + " forgive, accept or clear the misunderstanding:\n\n",
                            });

                            if (yesNoQuestionClearMisunderstanding.done) {
                                throw new Error("Generator finished without producing output");
                            }

                            if (detectGemmaSecondPersonIssue(yesNoQuestionClearMisunderstanding.value)) {
                                console.log("Detected second person language in undo question, retrying...");
                                continue;
                            }

                            return replaceOtherCharNameWithPlaceholder(yesNoQuestionClearMisunderstanding.value.trim(), name);
                        }
                    },
                );

                const altQuestion = altQuestionResult.value.trim();

                initializeSection.body.push(`const bondShiftAmount = DE.utils.determineExtremeSuddenHostileShift(char, other);`);
                initializeSection.body.push(`const bondShiftUndoQuestion = ${toTemplateLiteralNoInfo(altQuestion, name)};`);
            }

            initializeSection.body.push(`if (answer) {`);
            if (altCondition && altYesCode && altConsidering) {
                initializeSection.body.push(`if (!(${altCondition})) {`);
            }
            initializeSection.body.push(yesCode);

            const parsedEmotionalStates = (await guider.askList(
                `${id}-emotions-${question}`,
                `"${name} ${description}", ${consideringInStatement}, how would ${name} feel?`,
                EMOTIONAL_STATES_TO_CHECK_AGAINST_AS_RECORD,
                async () => {
                    await prime();
                    const listOfEmotions = await generator.next({
                        maxCharacters: 5,
                        maxSafetyCharacters: 0,
                        maxParagraphs: 1,
                        nextQuestion: `"${name} ${description}", ${consideringInStatement}, how would ${name} feel? answer with 2 of the most likely emotions`,
                        stopAfter: [],
                        stopAt: [],
                        instructions: "Answer with a comma separated list of the 2 most likely of the following emotions: " + randomSortList(EMOTIONAL_STATES_TO_CHECK_AGAINST).join(", "),
                        grammar: createGrammarListFromList(engine, EMOTIONAL_STATES_TO_CHECK_AGAINST, 2).grammar,
                    });

                    if (listOfEmotions.done) {
                        throw new Error("Generator finished without producing output");
                    }

                    return parseListFromGrammarResponse(listOfEmotions.value).map(emState => emState[0].toUpperCase() + emState.slice(1).toLowerCase()); // capitalize first letter to match the emotional states format
                },
            )).value.map(em => em.trim()).filter(em => EMOTIONAL_STATES_TO_CHECK_AGAINST.includes(em));

            for (const emotionalState of parsedEmotionalStates) {
                initializeSection.body.push(`DE.utils.shiftState(char, ${JSON.stringify(emotionalState)}, ${shiftStateByOverride + 1}, ${shiftStateByOverride + 2}, [{causant: {name: other.name, type: "character"}, description: ${JSON.stringify(description)}}}]);`);
            }

            if (altCondition && altYesCode && altConsidering) {
                initializeSection.body.push(`} else {`);
                initializeSection.body.push(altYesCode);

                const parsedEmotionalStates2 = (await guider.askList(
                    `${id}-emotions-alt-${question}`,
                    `"${name} ${description}", ${altConsidering}, how would ${name} feel?`,
                    EMOTIONAL_STATES_TO_CHECK_AGAINST_AS_RECORD,
                    async () => {
                        await prime();
                        const listOfEmotions2 = await generator.next({
                            maxCharacters: 5,
                            maxSafetyCharacters: 0,
                            maxParagraphs: 1,
                            nextQuestion: `"${name} ${description}", ${altConsidering}, how would ${name} feel? answer with 3 of the most likely emotions`,
                            stopAfter: [],
                            stopAt: [],
                            instructions: "Answer with a comma separated list of the 2 most likely of the following emotions: " + randomSortList(EMOTIONAL_STATES_TO_CHECK_AGAINST).join(", "),
                            grammar: createGrammarListFromList(engine, EMOTIONAL_STATES_TO_CHECK_AGAINST, 2).grammar,
                        });

                        if (listOfEmotions2.done) {
                            throw new Error("Generator finished without producing output");
                        }

                        return parseListFromGrammarResponse(listOfEmotions2.value).map(emState => emState[0].toUpperCase() + emState.slice(1).toLowerCase()); // capitalize first letter to match the emotional states format
                    },
                )).value.map(em => em.trim()).filter(em => EMOTIONAL_STATES_TO_CHECK_AGAINST.includes(em));

                for (const emotionalState of parsedEmotionalStates2) {
                    initializeSection.body.push(`DE.utils.shiftState(char, ${JSON.stringify(emotionalState)}, ${shiftStateByOverride + 1}, ${shiftStateByOverride + 2}, [{causant: {name: other.name, type: "character"}, description: ${JSON.stringify(description)}}}]);`);
                }

                initializeSection.body.push(`}`);
            }

            initializeSection.body.push(`}`);
            initializeSection.body.push(`}`); // end onAnswer
            initializeSection.body.push(`});`); // end trigger
        }

        shiftStateByOverride = 0;
        doNotIncludeQuestions = null;
        overrideWholeReasoning = false;

        return [causesValue, generatedQuestions];
    }

    // yes/no questions that would make the character really like or dislike the regardless of the relationship level
    initializeSection.body.push(`// Yes/no questions about liking in all relationship levels`);
    const [likeAtAnyLevelValue, likeAtAnyLevelQuestions] = await askYesNo(
        "like-at-any-level",
        10,
        10,
        "like another character at any relationship level",
        "like another character at any relationship level",
        "this can include anyone from strangers, enemies, aquitances, friends, close friends, to best friends towards each other; do not include sexual themes or romantic themes, focus on general liking and friendship",
        "it was done by another character",
        `runIf: (char, other) => true,`,
        `DE.utils.shiftBond(char, other, 1, 0);`,
    );

    initializeSection.body.push(`// Yes/no questions about disliking in all relationship levels`);
    const [dislikeAtAnyLevelValue, dislikeAtAnyLevelQuestions] = await askYesNo(
        "dislike-at-any-level",
        0,
        10,
        "dislike slightly another character at any relationship level, do not include extreme cases that would cause intense hatred or sworn enmity, focus on more mild cases of dislike that would just cause a bond decrease but not intense hatred (e.g. getting annoyed by them, disliking their habits, finding them irritating, getting into a petty argument, etc)",
        "dislike slightly another character at any relationship level",
        "this can include anyone from strangers, enemies, aquitances, friends, close friends, to best friends towards each other; do not include sexual themes or romantic themes, focus on general dislike and mild annoyance",
        "it was done by another character",
        `runIf: (char, other) => true,`,
        `DE.utils.shiftBond(char, other, -1, 0);`,
    );

    // yes/no questions that would make the character really like or dislike another character when they are strangers that just met
    initializeSection.body.push(`// Yes/no questions about liking strangers`);
    doNotIncludeQuestions = likeAtAnyLevelQuestions;
    const [likeAtStrangersValue, likeAtStrangersQuestions] = await askYesNo(
        "like-strangers",
        10,
        6,
        "like another provided they just met and have no prior relationship (the question must be specific to first impressions and first impressions only); include a variety of topics such as shared hobbies, common topics of interest or conversation, mutual passions, activities they enjoy, as well as personal qualities and compliments",
        "like another character when they are strangers",
        "they are strangers towards each other, do not include sexual themes or romantic themes, focus on general liking and friendship; include questions about shared hobbies, common topics of interest, mutual passions, or activities that create an instant connection",
        "it was done by a stranger",
        `runIf: (char, other) => DE.utils.isStrangerTowards(char, other),`,
        `DE.utils.shiftBond(char, other, 1, 0);`,
    );

    initializeSection.body.push(`// Yes/no questions about disliking strangers`);
    doNotIncludeQuestions = dislikeAtAnyLevelQuestions;
    const [dislikeAtStrangersValue, dislikeAtStrangersQuestions] = await askYesNo(
        "dislike-strangers",
        0,
        6,
        "dislike another character provided they just met and have no prior relationship (the question must be specific to first impressions and first impressions only)",
        "dislike another character when they are strangers",
        "they are strangers towards each other, do not include sexual themes or romantic themes, focus on general dislike and mild annoyance",
        "it was done by a stranger",
        `runIf: (char, other) => DE.utils.isStrangerTowards(char, other),`,
        `DE.utils.shiftBond(char, other, -1, -1);`,
    );

    const isLoveAtFirstSightValue = scriptgenerator.state["love-at-first-sight"];

    if (isLoveAtFirstSightValue) {
        initializeSection.body.push(`// Yes/no questions about love at first sight`);
        doNotIncludeQuestions = [...likeAtAnyLevelQuestions, ...likeAtStrangersQuestions];
        await askYesNo(
            "love-at-first-sight",
            10,
            5,
            "feel love (romantic and sexual) at first sight towards another character they just met and have no prior relationship with (focus on physical attraction, chemistry, sexual tension, romantic feelings, etc)",
            "feel love (romantic and sexual) at first sight towards another when they are strangers",
            "they are strangers towards each other but " + name + " can feel love at first sight",
            "it was love at first sight with a stranger",
            `runIf: (char, other) => DE.utils.isStrangerTowards(char, other) && DE.utils.isAttractedTo(char, other),`,
            `DE.utils.shiftBond(char, other, 1, DE.utils.isAttractedToWithLevelAsNumber(char, other));`,
        );
    }

    initializeSection.body.push(`// Yes/no questions about hate at first sight`);
    doNotIncludeQuestions = [...dislikeAtAnyLevelQuestions, ...dislikeAtStrangersQuestions];
    const [hateAtFirstSightValue, hateAtFirstSightQuestions] = await askYesNo(
        "hate-at-first-sight",
        0,
        5,
        "feel hate at first sight towards another character they just met and have no prior relationship with",
        "feel hate at first sight towards another when they are strangers",
        "they are strangers towards each other",
        "it was hate at first sight with a stranger",
        `runIf: (char, other) => DE.utils.isStrangerTowards(char, other),`,
        `DE.utils.shiftBond(char, other, -3, -1);`,
    );

    // yes/no questions that would make the character really like or dislike another character when they are acquaintances
    initializeSection.body.push(`// Yes/no questions about acquaintances`);
    doNotIncludeQuestions = likeAtAnyLevelQuestions;
    const [likeAtAcquaintancesValue, likeAtAcquaintancesQuestions] = await askYesNo(
        "like-acquaintances",
        10,
        8,
        "like another character provided they are acquaintances but not close friends (the behaviour/action showcase that they can be potential friends, it must be specific to something that showcases they can be a friend but they are not close friends yet); include a variety of topics such as discovering shared hobbies, bonding over common topics of interest or conversation, finding mutual passions or activities, as well as personal qualities and kind gestures",
        "like another character when they are acquaintances",
        "they are acquaintances but not close friends towards each other; include questions about shared hobbies, common topics of interest, mutual passions, or activities they enjoy together that show friendship potential",
        "it was done by an aquaintance showcasing friendship potential",
        `runIf: (char, other) => (DE.utils.isNotStrangersTowards(char, other) || DE.utils.isAcquaintanceOrWorseTowards(char, other)) && !(DE.utils.hasSlightRomanticInterestOrBetterTowards(char, other)),`,
        `DE.utils.shiftBond(char, other, 1, 0);`,
    );

    doNotIncludeQuestions = dislikeAtAnyLevelQuestions;
    const [dislikeAtAcquaintancesValue, dislikeAtAcquaintancesQuestions] = await askYesNo(
        "dislike-acquaintances",
        0,
        8,
        "dislike another character provided they are acquaintances but not close friends (the behaviour/action is otherwise acceptable with close friends, but not with acquaintances)",
        "dislike another character when they are acquaintances",
        "they are acquaintances but not close friends towards each other",
        "it was done by an aquaintance but it would only be acceptable if it was a close friend",
        `runIf: (char, other) => (DE.utils.isNotStrangersTowards(char, other) || DE.utils.isAcquaintanceOrWorseTowards(char, other)) && !(DE.utils.hasSlightRomanticInterestOrBetterTowards(char, other)),`,
        `DE.utils.shiftBond(char, other, -1, -1);`,
    );

    // idea create bond shifts with markers that can be undone, eg. did {{other}} just kill somebody?... and then the marker gets created, and the question did {{other}} provide a plausible reason for "killing someone"?
    initializeSection.body.push(`// Yes/no questions about sudden intense hatred and instant sworn enmity`);
    shiftStateByOverride = 2;
    await askYesNo(
        "sudden-hatred-sworn-enemies",
        0,
        4,
        "feel a sudden intense hatred towards another and become sworn enemies instantly (the cause MUST be extreme and severe: murder, killing someone they love, physical abuse, torture, genocide, enslavement, catastrophic betrayal, destruction of their home, or similarly devastating acts; do NOT include mild things like threats, insults, rudeness or general mistreatment)",
        "feel a sudden intense hatred towards another and become sworn enemies instantly due to extreme acts",
        "this can include anyone at any relationship level; the act must be severe enough to warrant instant sworn enmity such as killing, abuse, torture, or destruction",
        "it was done by another character and it is an extreme unforgivable act that triggers instant sworn enmity",
        `runIf: (char, other) => !DE.utils.hasBondShiftWithId(char, other, bondShiftId),`,
        `DE.utils.shiftBondWithUndo(char, other, bondShiftAmount, 0, 0.8, bondShiftId, bondShiftUndoQuestion),`,

        undefined,
        undefined,
        undefined,

        true,
    );

    // mild misunderstandings are fine, they don't mess things too much
    initializeSection.body.push(`// Yes/no questions about clearing a mild misunderstanding`);
    await askYesNo(
        "clear-mild-misunderstanding",
        0,
        7,
        "Clear up a misunderstanding that had caused hostility (the cause must be mild and not extreme: a petty argument, a misunderstanding, a minor betrayal, a small offense, a minor annoyance, or similar acts that can cause hostility but are not severe enough to warrant sworn enmity)",
        "feel sudden relief about the misunderstanding that was cleared",
        "this can include anyone at any relationship level",
        "it was done by another character that is clearing out a mild misunderstanding",
        `runIf: (char, other) => true,`,
        `DE.utils.shiftBond(char, other, 2, 0);`,
    );

    // STRONG POSITIVE BONDS

    // yes/no questions that would make the character really like another character when they are close friends and be unacceptable otherwise (non-romantic)
    initializeSection.body.push(`// Yes/no questions close friends behaviours that are only acceptable because of the close friendship bond`);
    doNotIncludeQuestions = [...likeAtAnyLevelQuestions, ...likeAtAcquaintancesQuestions];
    const [likeAtCloseFriendsValue, likeAtCloseFriendsQuestions] = await askYesNo(
        "like-close-friends-only",
        10,
        7,
        "like another character more ONLY because they are already close friends; the behaviour/action described MUST be something that is exclusively acceptable between close friends (e.g. showing up unannounced, playful teasing, sharing personal secrets, physical affection like hugs, dragging them to a niche hobby event, obsessively discussing a shared passion topic for hours, involving them in a personal hobby project); if they are NOT close friends, the same behaviour would be seen as invasive, inappropriate, or unacceptable by " + name + "; include a variety of topics such as shared niche hobbies, deep topics of mutual interest, activities or creative projects they pursue together, as well as personal gestures only acceptable between close friends",
        "like another character more when they are close friends and find it unacceptable otherwise",
        "they are close friends towards each other and the behaviour is only acceptable because of that friendship bond; include questions about shared niche hobbies, deep topics of mutual interest, activities or creative projects they pursue together, or personal gestures exclusive to close friends",
        "it was done by a close friend and they find it acceptable so they shouldn't get angry or hostile",
        `runIf: (char, other) => true,`,
        `DE.utils.shiftBond(char, other, 1, 0);`,

        `!DE.utils.isFriendsOrBetterWith(char, other)`,
        `DE.utils.shiftBond(char, other, -0.5, 0);`,
        "they are NOT close friends and " + name + " finds the behaviour/action unacceptable, invasive, and inappropriate",
    );
}