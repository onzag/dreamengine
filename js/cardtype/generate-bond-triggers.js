import { DEngine } from "../engine/index.js";
import { createGrammarListFromList, parseListFromGrammarResponse } from "../engine/util/grammar.js";
import { createCardStructureFrom, getJsCard, getSection, hasSpecialComment, insertSpecialComment, toTemplateLiteral, toTemplateLiteralNoInfo } from "./base.js";
import { replaceAllCharNameWithPlaceholder } from "./generate-base.js";
import { BASIC_EMOTIONAL_STATES, BASIC_EMOTIONAL_STATES_OPTIONS } from "./generate-basic-states.js";

/**
 * 
 * @param {string} text
 * @param {string} charName
 * @returns 
 */
export function replaceOtherCharNameWithPlaceholder(text, charName) {
    return replaceAllCharNameWithPlaceholder(text.replace(/OTHER_CHARACTER|OTHER CHARACTER|[Oo]ther character/g, "{{other}}"), charName);
}

/**
 * @param {DEngine} engine
 * @param {import('./base.js').CardTypeCard} card
 * @param {import('./base.js').CardTypeGuider | null} guider
 * @param {import('./base.js').CardTypeAutoSave | null} autosave
 * @return {Promise<void>}
 */
export async function generateBondTriggers(engine, card, guider, autosave) {
    card.config.bondTriggers = card.config.bondTriggers || {};

    const initializeSection = getSection(card.body, "initialize");
    if (!initializeSection) {
        throw new Error("Initialize section not found");
    }

    const inferenceAdapter = engine.inferenceAdapter;
    if (!inferenceAdapter) {
        throw new Error("No inference adapter found on engine");
    }

    const systemPrompt = inferenceAdapter.buildSystemPromptForQuestioningAgent(
        `You are a helpful assistant that will answer and assist in defining a character for a game based on their description, you are allowed free rein to interpret the character's description and generate the code that defines them in the game, you will be asked questions about the character and you should answer them as best as you can`,
        [],
        `# Character Card:\n\n${card.card}`
    );

    if (!hasSpecialComment(card.imports, "basic-bond-questions-import")) {
        insertSpecialComment(card.imports, "basic-bond-questions-import");
        card.imports.push(`const basicBondQuestions = await importScript("@bond-systems", "basic-bond-questions");`);
        initializeSection.body.push(`basicBondQuestions.addBasicBondQuestions(DE, DE.characters[${JSON.stringify(card.config.name)}]);`);
    }

    const generator = inferenceAdapter.runQuestioningCustomAgentOn("cardtype-gen", {
        contextInfoAfter: null,
        contextInfoBefore: null,
        messages: [],
        system: systemPrompt,
    });

    const isAsexualValue = card.config.isAsexual;
    const isIncestuousValue = card.config.isIncestuous;
    const name = card.config.name;

    /**
     * @type {string[]}
     */
    let EMOTIONAL_STATES_TO_CHECK_AGAINST = card.config.emotionalStatesToCheckAgainst || [...BASIC_EMOTIONAL_STATES];
    if (isAsexualValue) {
        EMOTIONAL_STATES_TO_CHECK_AGAINST = EMOTIONAL_STATES_TO_CHECK_AGAINST.filter(state => !["Flirty", "Loving", "Aroused"].includes(state));
    }

    if (guider && !card.config.emotionalStatesToCheckAgainst) {
        const guiderResult = await guider.askArbitraryList(`Emotional states to check against for ${name}`, EMOTIONAL_STATES_TO_CHECK_AGAINST);
        if (guiderResult.value) {
            EMOTIONAL_STATES_TO_CHECK_AGAINST = Array.from(new Set(guiderResult.value.map(em => em.trim()).filter(em => em.length > 0)));
        }
        card.config.emotionalStatesToCheckAgainst = EMOTIONAL_STATES_TO_CHECK_AGAINST;
    }

    /**
     * @type {*}
     */
    const EMOTIONAL_STATES_TO_CHECK_AGAINST_AS_RECORD = { ...BASIC_EMOTIONAL_STATES_OPTIONS };

    const customEmotionalStates = EMOTIONAL_STATES_TO_CHECK_AGAINST.filter(state => !BASIC_EMOTIONAL_STATES.includes(state));

    // @ts-ignore
    EMOTIONAL_STATES_TO_CHECK_AGAINST_AS_RECORD.Positive.filter(state => !EMOTIONAL_STATES_TO_CHECK_AGAINST.includes(state));
    // @ts-ignore
    EMOTIONAL_STATES_TO_CHECK_AGAINST_AS_RECORD.Negative.filter(state => !EMOTIONAL_STATES_TO_CHECK_AGAINST.includes(state));

    if (customEmotionalStates.length > 0) {
        EMOTIONAL_STATES_TO_CHECK_AGAINST_AS_RECORD.Custom = customEmotionalStates;
    }

    if (isAsexualValue) {
        // @ts-ignore
        EMOTIONAL_STATES_TO_CHECK_AGAINST_AS_RECORD.Positive = EMOTIONAL_STATES_TO_CHECK_AGAINST_AS_RECORD.Positive.filter(state => !["Flirty", "Loving", "Aroused"].includes(state));
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
    const askYesNo = async (id, amount, reasoning, trail, consideringInQuestion, consideringInStatement, condition, yesCode, altCondition, altYesCode, altConsidering, severeAndExtremeWithUndo) => {
        if (hasSpecialComment(initializeSection.body, "bond-trigger-" + id)) {
            return [card.config.bondTriggers[id].causes, card.config.bondTriggers[id].questions];
        }

        insertSpecialComment(initializeSection.body, "bond-trigger-" + id);

        let yesNoQuestionValue = "";
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
            if (guider && redoGuidance) {
                const guiderResult = await guider.askOpen("Guidance for generating yes/no questions about " + JSON.stringify(reasoning) + ". What are some important things to keep in mind when writing about that in the context of " + name + "'s character and personality?");
                if (guiderResult) {
                    guidanceGiven = guiderResult.value.trim();
                }
                redoGuidance = false;
            }

            let instructions = "The list should be in 3rd person and formatted as a markdown list with each question as a separate bullet point, use OTHER CHARACTER as a placeholder for the other character's name. OTHER CHARACTER must always be included, the questions should be in past tense and 3rd person, do not use you, your, I, we, or similar words that indicate second or first person";
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
                nextQuestion: (overrideWholeReasoning ? reasoning : "Make a list of yes/no questions that provided a positive (yes) answer would make " + name + " " + reasoning) + ", " + consideringInQuestion + "; give " + amount + " questions, make the question as long and as expressive as needed, but not too long 100 words at most",
                stopAfter: [
                    " you ",
                    " You ",
                    " your ",
                    " Your ",
                    " I'm ",
                    " I ",
                ],
                stopAt: [],
                instructions: instructions,
                grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(amount) + "\nbulletPoint ::= \"- \" (\"Was\" | \"Did\") \" OTHER CHARACTER \" [a-zA-Z0-9 ,?'!_]+ \"\\n\"",
                answerTrail: overrideWholeReasoning ? "#" + trail + ":\n\n" : "# List of yes/no questions that would make " + name + " " + trail + ":\n\n",
            });

            if (yesNoQuestions.done) {
                throw new Error("Generator finished without producing output");
            }

            yesNoQuestionValue = yesNoQuestions.value.trim();

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

            questionsParsed = yesNoQuestionValue.split("\n").map(line => line.trim()).filter(line => line.startsWith("- "))
                .map(line => line.substring(2).trim()).map(line => replaceOtherCharNameWithPlaceholder(line, name));

            if (guider) {
                const guiderResult = await guider.askAcceptArbitraryList("Yes/no questions about " + JSON.stringify(reasoning), questionsParsed);
                if (!guiderResult.value) {
                    redoGuidance = true;
                    continue;
                }

                questionsParsed = guiderResult.value.map(q => q.trim()).filter(q => q.length > 0);
            }
            break;
        }

        for (let i = 0; i < questionsParsed.length; i++) {
            const question = questionsParsed[i];
            generatedQuestions.push(question);
            console.log("Generated question:", question);

            initializeSection.body.push(`DE.utils.newTrigger(DE, ${JSON.stringify(name)}, {`);
            initializeSection.body.push(`type: "yes_no",`);
            initializeSection.body.push(`askPer: "conversing_character",`);
            initializeSection.body.push(condition);
            initializeSection.body.push(`question: (DE, info) => ${toTemplateLiteral(question)},`);
            initializeSection.body.push(`onValue: (answer, char, other) => {`);

            const causeValue = await generator.next({
                maxCharacters: 100,
                maxSafetyCharacters: 0,
                maxParagraphs: 1,
                nextQuestion: `What would be a short "yes" answer to the question "${question}", it should be very short`,
                stopAfter: [],
                stopAt: [],
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
                instructions: "Do not include the phrase OTHER CHARACTER in the answer, just give a short statement of what the yes answer would mean for " + name + "; the answer must be in past tense and be very short and concise, 10 words at most",
                answerTrail: `# The short statement is:\n\nyes, ${name} `,
            });

            if (causeValue.done) {
                throw new Error("Generator finished without producing output");
            }

            let description = causeValue.value.trim();

            if (guider) {
                const guiderResult = await guider.askOpen(`Short yes answer for ${JSON.stringify(question)}\n\nThis answer does not contain the name of any character on purpose, it's a nameless statement for a reason they are experiencing an emotion; think of it as it starts with "yes, ${name} ...`, description);
                if (guiderResult.value) {
                    description = guiderResult.value.trim();
                }
            }

            causesValue.push(description);

            if (severeAndExtremeWithUndo) {
                const bondShiftId = `${id}-severe-shift-${i}`;
                initializeSection.body.push(`const bondShiftId = ${JSON.stringify(bondShiftId)};`);
                initializeSection.body.push(`const bondShiftAmount = DE.utils.determineExtremeHostileShift(DE, char, other);`);

                const yesNoQuestionClearMisunderstanding = await generator.next({
                    maxCharacters: 5000,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 10,
                    nextQuestion: `Make a single yes/no question that would cause ${name} to forgive or clear a misunderstanding after ${JSON.stringify(question)}, received a yes answer`,
                    stopAfter: [
                        " you ",
                        " You ",
                        " your ",
                        " Your ",
                        " I'm ",
                        " I ",
                    ],
                    stopAt: [],
                    contextInfo: inferenceAdapter.buildContextInfoInstructions("The yes answer meant that " + name + " " + JSON.stringify(description)),
                    instructions: "Make a single yes/no question no matter how difficult to achieve it might be, it either clears a misunderstanding or provides a plausible acceptable reason for the severe action that " + name + " would accept provided a yes answer, use OTHER CHARACTER to specify the character name that caused that situation, the question should be in past tense and 3rd person",
                    grammar: "root ::= (\"Was\" | \"Did\") \" OTHER CHARACTER \" [a-zA-Z0-9 ,?'!_]+ \"\\n\"",
                    answerTrail: "# Yes/no question that would make " + name + " forgive, accept or clear the misunderstanding:\n\n",
                });

                if (yesNoQuestionClearMisunderstanding.done) {
                    throw new Error("Generator finished without producing output");
                }

                let altQuestion = replaceOtherCharNameWithPlaceholder(yesNoQuestionClearMisunderstanding.value.trim(), name);
                if (guider) {
                    const guiderResult = await guider.askOpen(`Yes/no question that would make ${name} forgive or clear the misunderstanding after ${JSON.stringify(question)}, received a yes answer`, altQuestion);
                    if (guiderResult.value) {
                        altQuestion = guiderResult.value.trim();
                    }
                }
                
                initializeSection.body.push(`const bondShiftAmount = DE.utils.determineExtremeSuddenHostileShift(DE, char, other);`);
                initializeSection.body.push(`const bondShiftUndoQuestion = ${toTemplateLiteralNoInfo(altQuestion)})`);
            }

            initializeSection.body.push(`if (answer) {`);
            if (altCondition && altYesCode && altConsidering) {
                initializeSection.body.push(`if (!(${altCondition})) {`);
            }
            initializeSection.body.push(yesCode);

            const listOfEmotions = await generator.next({
                maxCharacters: 5,
                maxSafetyCharacters: 0,
                maxParagraphs: 1,
                nextQuestion: `"${name} ${description}", ${consideringInStatement}, how would ${name} feel? answer with 3 of the most likely emotions`,
                stopAfter: [],
                stopAt: [],
                instructions: "Answer with a comma separated list of the 3 most likely of the following emotions: " + EMOTIONAL_STATES_TO_CHECK_AGAINST.join(", "),
                grammar: createGrammarListFromList(engine, EMOTIONAL_STATES_TO_CHECK_AGAINST, 3).grammar,
            });

            if (listOfEmotions.done) {
                throw new Error("Generator finished without producing output");
            }

            let parsedEmotionalStates = parseListFromGrammarResponse(listOfEmotions.value).map(emState => emState[0].toUpperCase() + emState.slice(1).toLowerCase()); // capitalize first letter to match the emotional states format

            if (guider) {
                const guiderResult = await guider.askList(`"${name} ${description}", ${consideringInStatement}, how would ${name} feel?`, EMOTIONAL_STATES_TO_CHECK_AGAINST_AS_RECORD, parsedEmotionalStates);
                if (guiderResult.value) {
                    parsedEmotionalStates = guiderResult.value.map(em => em.trim()).filter(em => EMOTIONAL_STATES_TO_CHECK_AGAINST.includes(em));
                }
            }

            for (const emotionalState of parsedEmotionalStates) {
                initializeSection.body.push(`DE.utils.shiftState(DE, char, ${JSON.stringify(emotionalState)}, ${shiftStateByOverride + 1}, ${shiftStateByOverride + 2}, [{causant: {name: other.name, type: "character"}, description: ${JSON.stringify(description)}}}]);`);
            }

            if (altCondition && altYesCode && altConsidering) {
                initializeSection.body.push(`} else {`);
                initializeSection.body.push(altYesCode);

                const listOfEmotions2 = await generator.next({
                    maxCharacters: 5,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: `"${name} ${description}", ${altConsidering}, how would ${name} feel? answer with 3 of the most likely emotions`,
                    stopAfter: [],
                    stopAt: [],
                    instructions: "Answer with a comma separated list of the 3 most likely of the following emotions: " + EMOTIONAL_STATES_TO_CHECK_AGAINST.join(", "),
                    grammar: createGrammarListFromList(engine, EMOTIONAL_STATES_TO_CHECK_AGAINST, 3).grammar,
                });

                if (listOfEmotions2.done) {
                    throw new Error("Generator finished without producing output");
                }

                let parsedEmotionalStates2 = parseListFromGrammarResponse(listOfEmotions2.value).map(emState => emState[0].toUpperCase() + emState.slice(1).toLowerCase()); // capitalize first letter to match the emotional states format
                if (guider) {
                    const guiderResult = await guider.askList(`"${name} ${description}", ${altConsidering}, how would ${name} feel?`, EMOTIONAL_STATES_TO_CHECK_AGAINST_AS_RECORD, parsedEmotionalStates2);
                    if (guiderResult.value) {
                        parsedEmotionalStates2 = guiderResult.value.map(em => em.trim()).filter(em => EMOTIONAL_STATES_TO_CHECK_AGAINST.includes(em));
                    }
                }

                for (const emotionalState of parsedEmotionalStates2) {
                    initializeSection.body.push(`DE.utils.shiftState(DE, char, ${JSON.stringify(emotionalState)}, ${shiftStateByOverride + 1}, ${shiftStateByOverride + 2}, [{causant: {name: other.name, type: "character"}, description: ${JSON.stringify(description)}}}]);`);
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

        card.config.bondTriggers[id] = {
            causes: causesValue,
            questions: generatedQuestions,
        };
        await autosave?.save();

        return [causesValue, generatedQuestions];
    }

    // yes/no questions that would make the character really like or dislike the regardless of the relationship level
    initializeSection.body.push(`// Yes/no questions about liking in all relationship levels`);
    const [likeAtAnyLevelValue, likeAtAnyLevelQuestions] = await askYesNo(
        "like-at-any-level",
        10,
        "like another character at any relationship level",
        "like another character at any relationship level",
        "this can include anyone from strangers, enemies, aquitances, friends, close friends, to best friends towards each other",
        "it was done by another character",
        `runIf: (char, other) => true,`,
        `DE.utils.shiftBond(DE, char, other, 1, 0);`,
    );

    initializeSection.body.push(`// Yes/no questions about disliking in all relationship levels`);
    const [dislikeAtAnyLevelValue, dislikeAtAnyLevelQuestions] = await askYesNo(
        "dislike-at-any-level",
        10,
        "dislike slightly another character at any relationship level, do not include extreme cases that would cause intense hatred or sworn enmity, focus on more mild cases of dislike that would just cause a bond decrease but not intense hatred (e.g. getting annoyed by them, disliking their habits, finding them irritating, getting into a petty argument, etc)",
        "dislike slightly another character at any relationship level",
        "this can include anyone from strangers, enemies, aquitances, friends, close friends, to best friends towards each other",
        "it was done by another character",
        `runIf: (char, other) => true,`,
        `DE.utils.shiftBond(DE, char, other, -1, 0);`,
    );

    // yes/no questions that would make the character really like or dislike another character when they are strangers that just met
    initializeSection.body.push(`// Yes/no questions about liking strangers`);
    doNotIncludeQuestions = likeAtAnyLevelQuestions;
    const [likeAtStrangersValue, likeAtStrangersQuestions] = await askYesNo(
        "like-strangers",
        6,
        "like another provided they just met and have no prior relationship (the question must be specific to first impressions and first impressions only)",
        "like another character when they are strangers",
        "they are strangers towards each other",
        "it was done by a stranger",
        `runIf: (char, other) => DE.utils.isStrangerTowards(DE, char, other),`,
        `DE.utils.shiftBond(DE, char, other, 1, 0);`,
    );

    initializeSection.body.push(`// Yes/no questions about disliking strangers`);
    doNotIncludeQuestions = dislikeAtAnyLevelQuestions;
    const [dislikeAtStrangersValue, dislikeAtStrangersQuestions] = await askYesNo(
        "dislike-strangers",
        6,
        "dislike another character provided they just met and have no prior relationship (the question must be specific to first impressions and first impressions only)",
        "dislike another character when they are strangers",
        "they are strangers towards each other",
        "it was done by a stranger",
        `runIf: (char, other) => DE.utils.isStrangerTowards(DE, char, other),`,
        `DE.utils.shiftBond(DE, char, other, -1, -1);`,
    );

    let isLoveAtFirstSightValue = false;
    if (typeof card.config.loveAtFirstSight === "undefined") {
        // would char be one that would feel love at first sight?
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

        if (guider) {
            const guiderResult = await guider.askBoolean("Can " + name + " feel love at first sight?", isLoveAtFirstSightValue);
            if (guiderResult) {
                isLoveAtFirstSightValue = guiderResult.value;
            }
        }

        isLoveAtFirstSightValue = isLoveAtFirstSight.value.trim().toLowerCase() === "yes";

        card.config.loveAtFirstSight = isLoveAtFirstSightValue;
    } else {
        isLoveAtFirstSightValue = card.config.loveAtFirstSight;
    }

    if (isLoveAtFirstSightValue) {
        initializeSection.body.push(`// Yes/no questions about love at first sight`);
        doNotIncludeQuestions = [...likeAtAnyLevelQuestions, ...likeAtStrangersQuestions];
        await askYesNo(
            "love-at-first-sight",
            5,
            "feel love (romantic and sexual) at first sight towards another character they just met and have no prior relationship with (focus on physical attraction, chemistry, sexual tension, romantic feelings, etc)",
            "feel love (romantic and sexual) at first sight towards another when they are strangers",
            "they are strangers towards each other but " + name + " can feel love at first sight",
            "it was love at first sight with a stranger",
            `runIf: (char, other) => DE.utils.isStrangerTowards(DE, char, other) && DE.utils.isAttractedTo(DE, char, other),`,
            `DE.utils.shiftBond(DE, char, other, 1, DE.utils.isAttractedToWithLevelAsNumber(DE, char, other));`,
        );
    }

    initializeSection.body.push(`// Yes/no questions about hate at first sight`);
    doNotIncludeQuestions = [...dislikeAtAnyLevelQuestions, ...dislikeAtStrangersQuestions];
    const [hateAtFirstSightValue, hateAtFirstSightQuestions] = await askYesNo(
        "hate-at-first-sight",
        5,
        "feel hate at first sight towards another character they just met and have no prior relationship with (focus on intense dislike, and serious causes, things like severe annoyance, strong negative first impression, strong aversion, etc; do NOT include mild things like getting slightly annoyed, disliking their habits, finding them irritating, getting into a petty argument, etc)",
        "feel hate at first sight towards another when they are strangers",
        "they are strangers towards each other",
        "it was hate at first sight with a stranger",
        `runIf: (char, other) => DE.utils.isStrangerTowards(DE, char, other),`,
        `DE.utils.shiftBond(DE, char, other, -3, -1);`,
    );

    // yes/no questions that would make the character really like or dislike another character when they are acquaintances
    initializeSection.body.push(`// Yes/no questions about acquaintances`);
    doNotIncludeQuestions = likeAtAnyLevelQuestions;
    const [likeAtAcquaintancesValue, likeAtAcquaintancesQuestions] = await askYesNo(
        "like-acquaintances",
        5,
        "like another character provided they are acquaintances but not close friends (the behaviour/action showcase that they can be potential friends, it must be specific to something that showcases they can be a friend but they are not close friends yet)",
        "like another character when they are acquaintances",
        "they are acquaintances but not close friends towards each other",
        "it was done by an aquaintance showcasing friendship potential",
        `runIf: (char, other) => DE.utils.isNotStrangersTowards(DE, char, other) && DE.utils.isAcquaintanceOrWorseTowards(DE, char, other),`,
        `DE.utils.shiftBond(DE, char, other, 1, 0);`,
    );

    doNotIncludeQuestions = dislikeAtAnyLevelQuestions;
    const [dislikeAtAcquaintancesValue, dislikeAtAcquaintancesQuestions] = await askYesNo(
        "dislike-acquaintances",
        8, // added more in this case because general all levels contradicted often
        "dislike another character provided they are acquaintances but not close friends (the behaviour/action is otherwise acceptable with close friends, but not with acquaintances)",
        "dislike another character when they are acquaintances",
        "they are acquaintances but not close friends towards each other",
        "it was done by an aquaintance but it would only be acceptable if it was a close friend",
        `runIf: (char, other) => DE.utils.isNotStrangersTowards(DE, char, other) && DE.utils.isAcquaintanceOrWorseTowards(DE, char, other),`,
        `DE.utils.shiftBond(DE, char, other, -1, -1);`,
    );

    // idea create bond shifts with markers that can be undone, eg. did {{other}} just kill somebody?... and then the marker gets created, and the question did {{other}} provide a plausible reason for "killing someone"?
    initializeSection.body.push(`// Yes/no questions about sudden intense hatred and instant sworn enmity`);
    shiftStateByOverride = 2;
    await askYesNo(
        "sudden-hatred-sworn-enemies",
        4,
        "feel a sudden intense hatred towards another and become sworn enemies instantly (the cause MUST be extreme and severe: murder, killing someone they love, physical abuse, torture, genocide, enslavement, catastrophic betrayal, destruction of their home, or similarly devastating acts; do NOT include mild things like threats, insults, rudeness or general mistreatment)",
        "feel a sudden intense hatred towards another and become sworn enemies instantly due to extreme acts",
        "this can include anyone at any relationship level; the act must be severe enough to warrant instant sworn enmity such as killing, abuse, torture, or destruction",
        "it was done by another character and it is an extreme unforgivable act that triggers instant sworn enmity",
        `runIf: (char, other) => !DE.utils.hasBondShiftWithId(DE, char, other, bondShiftId),`,
        `DE.utils.shiftBondWithUndo(DE, char, other, bondShiftAmount, 0, 0.8, bondShiftId, bondShiftUndoQuestion),`,

        undefined,
        undefined,
        undefined,

        true,
    );

    // mild misunderstandings are fine, they don't mess things too much
    initializeSection.body.push(`// Yes/no questions about clearing a mild misunderstanding`);
    await askYesNo(
        "clear-mild-misunderstanding",
        1,
        "Clear up a misunderstanding that had caused hostility (the cause must be mild and not extreme: a petty argument, a misunderstanding, a minor betrayal, a small offense, a minor annoyance, or similar acts that can cause hostility but are not severe enough to warrant sworn enmity)",
        "feel sudden relief about the misunderstanding that was cleared",
        "this can include anyone at any relationship level",
        "it was done by another character that is clearing out a mild misunderstanding",
        `runIf: (char, other) => true,`,
        `DE.utils.shiftBond(DE, char, other, 2, 0);`,
    );

    // STRONG POSITIVE BONDS

    // yes/no questions that would make the character really like another character when they are close friends and be unacceptable otherwise (non-romantic)
    initializeSection.body.push(`// Yes/no questions close friends behaviours that are only acceptable because of the close friendship bond`);
    doNotIncludeQuestions = [...likeAtAnyLevelQuestions, ...likeAtAcquaintancesQuestions];
    const [likeAtCloseFriendsValue, likeAtCloseFriendsQuestions] = await askYesNo(
        "like-close-friends-only",
        7,
        "like another character more ONLY because they are already close friends; the behaviour/action described MUST be something that is exclusively acceptable between close friends (e.g. showing up unannounced, playful teasing, sharing personal secrets, physical affection like hugs); if they are NOT close friends, the same behaviour would be seen as invasive, inappropriate, or unacceptable by " + name,
        "like another character more when they are close friends and find it unacceptable otherwise",
        "they are close friends towards each other and the behaviour is only acceptable because of that friendship bond",
        "it was done by a close friend and they find it acceptable so they shouldn't get angry or hostile",
        `runIf: (char, other) => true,`,
        `DE.utils.shiftBond(DE, char, other, 1, 0);`,

        `!DE.utils.isFriendsOrBetterWith(DE, char, other)`,
        `DE.utils.shiftBond(DE, char, other, -0.5, 0);`,
        "they are NOT close friends and " + name + " finds the behaviour/action unacceptable, invasive, and inappropriate",
    );

    // BEST FRIENDS
    initializeSection.body.push(`// Yes/no questions about elevating friendship towards best friendship`);
    doNotIncludeQuestions = [...likeAtAnyLevelQuestions, ...likeAtAcquaintancesQuestions, ...likeAtStrangersQuestions, ...likeAtCloseFriendsQuestions];
    const [elevateToBestFriendValue, elevateToBestFriendQuestions] = await askYesNo(
        "elevate-to-best-friend",
        7,
        "elevate a character friendship towards a best friendship and really like them, these must be serious reasons that would cause a strong increase in bond and elevate them to best friends, it must be something that is not acceptable or would not cause such a strong bond increase if they were not already friends (e.g. being there for them during a traumatic event, saving their life, making a huge sacrifice for them, etc); the reason must be something that can only be acceptable because they are already friends, if they were strangers or acquaintances it would be seen as invasive, inappropriate, or even creepy",
        "elevate a character friendship towards a best friendship",
        "this can include anyone from strangers, enemies, aquitances, friends, close friends, to best friends towards each other",
        "they are already friends",
        // TODO this isFriendsOrBetter must be used something from the bond system to know what is the graduation
        `runIf: (char, other) => DE.utils.isFriendsOrBetterWith(DE, char, other),`,
        `DE.utils.shiftBond(DE, char, other, 1, 0);`,

        `!DE.utils.isFriendsOrBetterWith(DE, char, other)`,
        `DE.utils.shiftBond(DE, char, other, -0.5, 0);`,
        "they are NOT close friends and " + name + " finds the behaviour/action unacceptable, invasive, and inappropriate",
    );

    // ======= ROMANTIC ======

    if (!isAsexualValue) {

        const levelsOfRomanticBond = {
            "very easy": 0,
            "easy": 10,
            "somewhat easy": 15,
            "neutral": 25,
            "somewhat difficult": 50,
            "difficult": 60,
            "very difficult": 70,
        }

        /**
         * @type {*}
         */
        const attractionToFn = {
            "male": "isMale",
            "female": "isFemale",
        }

        let romanticBondValueMale = 100;
        let romanticBondValueFemale = 100;

        let generalConditionForAttraction = "";
        if (card.config.attractions.includes("ambiguous")) {
            /**
             * @type {number}
             */
            let romanticBondValue;
            if (typeof card.config.attractionEasyOrDifficult === "undefined") {
                const generatedValue = await generator.next({
                    maxCharacters: 200,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: `How easy or difficult is to get ${name} to engage sexually with another character?`,
                    stopAfter: [],
                    stopAt: [],
                    grammar: `root ::= "very easy" | "easy" | "somewhat easy" | "neutral" | "somewhat difficult" | "difficult" | "very difficult"`,
                    instructions: `Answer with one of the following options: "very easy", "easy", "somewhat easy", "neutral", "somewhat difficult", "difficult", "very difficult"`,
                });

                if (generatedValue.done) {
                    throw new Error("Generator finished without producing output");
                }

                let valueParsed = generatedValue.value.trim().toLowerCase();

                if (guider) {
                    const guiderResult = await guider.askOption("How difficult is it to get " + name + " to engage sexually/romantically with another character? (in general)", Object.keys(levelsOfRomanticBond), valueParsed);

                    if (guiderResult.value) {
                        valueParsed = guiderResult.value;
                    }
                }

                // @ts-ignore
                romanticBondValue = await levelsOfRomanticBond[valueParsed];

                card.config.attractionEasyOrDifficult = valueParsed;
                await autosave?.save();
            } else {
                // @ts-ignore
                romanticBondValue = levelsOfRomanticBond[card.config.attractionEasyOrDifficult];
            }

            generalConditionForAttraction += `(basicConditionsForAttractionFn(DE, char, other) && DE.utils.isSecondBondEqOrMoreThan(DE, char, other, ${romanticBondValue}))`;
            romanticBondValueMale = romanticBondValue;
            romanticBondValueFemale = romanticBondValue;
        } else {
            for (const attraction of card.config.attractions) {
                if (attraction === "ambiguous") {
                    continue;
                }
                const key = "attractionEasyOrDifficult_" + attraction;
                /**
             * @type {number}
             */
                let romanticBondValue;
                if (typeof card.config[key] !== "undefined") {
                    const generatedValue = await generator.next({
                        maxCharacters: 200,
                        maxSafetyCharacters: 0,
                        maxParagraphs: 1,
                        nextQuestion: `How easy or difficult is to get ${name} to engage sexually with other ${attraction} character?`,
                        stopAfter: [],
                        stopAt: [],
                        grammar: `root ::= "very easy" | "easy" | "somewhat easy" | "neutral" | "somewhat difficult" | "difficult" | "very difficult"`,
                        instructions: `Answer with one of the following options: "very easy", "easy", "somewhat easy", "neutral", "somewhat difficult", "difficult", "very difficult"`,
                    });

                    if (generatedValue.done) {
                        throw new Error("Generator finished without producing output");
                    }

                    let valueParsed = generatedValue.value.trim().toLowerCase();
                    if (guider) {
                        const guiderResult = await guider.askOption("How difficult is it to get " + name + " to engage sexually/romantically with " + attraction + " characters?", Object.keys(levelsOfRomanticBond), valueParsed);
                        if (guiderResult.value) {
                            valueParsed = guiderResult.value;
                        }
                    }

                    // @ts-ignore
                    romanticBondValue = await levelsOfRomanticBond[valueParsed];

                    card.config[key] = valueParsed;
                    await autosave?.save();
                } else {
                    // @ts-ignore
                    romanticBondValue = levelsOfRomanticBond[card.config[key]];
                }

                if (generalConditionForAttraction) {
                    generalConditionForAttraction += " || ";
                }

                if (attraction === "male") {
                    romanticBondValueMale = romanticBondValue;
                } else if (attraction === "female") {
                    romanticBondValueFemale = romanticBondValue;
                }

                generalConditionForAttraction += `(DE.utils.${attractionToFn[attraction]}(DE, other) &&  basicConditionsForAttractionFn(DE, char, other) && DE.utils.isSecondBondEqOrMoreThan(DE, char, other, ${romanticBondValue}))`;
            }
        }

        if (typeof card.config.kinks === "undefined") {
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
                const guiderResult = await guider.askList("Provide a list of kinks and special sexual/romantic interests for " + name, null, kinksParsed);
                if (guiderResult.value) {
                    kinksParsed = guiderResult.value;
                }
            }

            card.config.kinks = kinksParsed;

            await autosave?.save();
        }

        if (typeof card.config.reversedKinks === "undefined") {
            const reversedKinks = await generator.next({
                maxCharacters: 200,
                maxSafetyCharacters: 200,
                maxParagraphs: 1,
                nextQuestion: `List specific kinks and fetishes that ${name} would absolutely refuse, find repulsive, or be a hard no, as a comma separated list of short 1-2 word items. These must be actual kinks and fetishes that disgust or repulse ${name}, NOT generic dislikes. Examples: scat, vore, gore, feet worship, infantilism, humiliation, needle play, blood play, etc. Infer what ${name} would specifically hate based on their personality and background. List 5 to 10 unique items.`,
                stopAfter: [],
                stopAt: [],
                instructions: "Each item must be a specific kink or fetish that " + name + " finds repulsive. Do NOT include any of the following as those are things " + name + " enjoys: " + card.config.kinks.join(", "),
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

        overrideWholeReasoning = true;
        await askYesNo(
            "like-kinks",
            7,
            "Considering the kinks " + JSON.stringify(card.config.kinks.join(" ,")) + ". Make a list of yes/no questions about activities that involve these kinks that " + name + " would absolutely enjoy with another character, be explicit",
            "list of questions about activities that involve " + name + "'s kinks that they would enjoy with a character",
            "they are romantically and sexually attracted towards each other with strong sexual tension",
            "it was done by other character performed a sexual or intimate act that " + name + " finds arousing and pleasurable",
            `runIf: (char, other) => true,`,
            `DE.utils.shiftBond(DE, char, other, 2, 3);`,

            `!(${generalConditionForAttraction})`,
            `DE.utils.shiftBond(DE, char, other, -3, 0);`,
            "they are not that close for this to be acceptable and " + name + " would find it unacceptable/inappropiate",
        );

        overrideWholeReasoning = true;
        await askYesNo(
            "dislike-kinks",
            7,
            "Considering the kinks " + JSON.stringify(card.config.reversedKinks.join(" ,")) + ". Make a list of yes/no questions about activities that involve these kinks that " + name + " would absolutely dislike and find repulsive with another character, be explicit",
            "list of questions about activities that involve " + name + "'s reversed kinks that they would dislike with a character",
            "they are romantically and sexually attracted towards each other with strong sexual tension but there are certain activities that " + name + " finds repulsive",
            "it was done by other character performed a sexual or intimate act that " + name + " finds repulsive and disgusting",
            `runIf: (char, other) => true,`,
            `DE.utils.shiftBond(DE, char, other, 0, -3);`,

            `!(${generalConditionForAttraction})`,
            `DE.utils.shiftBond(DE, char, other, -5, -2.5);`,
            "they are not that close for this to be acceptable and " + name + " would find it unacceptable/inappropiate",
        );

        overrideWholeReasoning = true;
        await askYesNo(
            "like-sex-and-romance-general",
            7,
            "Make a list of yes/no questions about activities that involve sexual, explicit and intimate acts that " + name + " might like and enjoy with another character",
            "list of yes/no questions about sexual, explicit and intimate acts that " + name + " might like and enjoy with another character",
            "they are romantically and sexually attracted towards each other with strong sexual tension",
            "it was done by other character performed a sexual or intimate act that " + name + " finds arousing and pleasurable",
            `runIf: (char, other) => true,`,
            `DE.utils.shiftBond(DE, char, other, 2, 3);`,

            `!(${generalConditionForAttraction})`,
            `DE.utils.shiftBond(DE, char, other, -3, 0);`,
            "they are not that close for this to be acceptable and " + name + " would find it unacceptable/inappropiate",
        );

        if (!hasSpecialComment(card.body, "other-sexual-acts-to-reject")) {
            insertSpecialComment(card.body, "other-sexual-acts-to-reject");

            const otherQuestionsJustToReject = [
                "has {{other}} tried to do something sexual or intimate with {{char}}?",
                "has {{other}} asked or attempted to kiss {{char}} in the mouth?",
                "has {{other}} tried to cuddle with {{char}} in an intimate manner?",
                "has {{other}} tried to touch {{char}} in a sexual or intimate way (e.g. grabbing their butt, touching their chest, etc)?",
                "has {{other}} tried to undress {{char}} or be undressed by them in a sexual or intimate way?",
                "has {{other}} tried to seduce {{char}} with flirtatious behaviour, suggestive conversation, romantic gestures, or sexual energy?",
            ];

            const descriptionsForQuestions = [
                "was tried to do something sexual or intimate with",
                "was asked or attempted to be kissed in the mouth",
                "was tried to be cuddled in an intimate manner",
                "was tried to be touched in a sexual or intimate way",
                "was tried to be undressed or be undressed by them in a sexual or intimate way",
                "was tried to be seduced with flirtatious behaviour, suggestive conversation, romantic gestures, or sexual energy",
            ]

            for (let i = 0; i < otherQuestionsJustToReject.length; i++) {
                const question = otherQuestionsJustToReject[i];
                initializeSection.body.push(`DE.utils.newTrigger(DE, ${JSON.stringify(name)}, {`)
                initializeSection.body.push(`type: "yes_no",`);
                initializeSection.body.push(`askPer: "conversing_character",`);
                initializeSection.body.push(`runIf: (char, other) => !(${generalConditionForAttraction}),`);
                initializeSection.body.push(`question: DE.utils.newHandlebarsTemplate(DE, ${JSON.stringify(question)}),`);
                initializeSection.body.push(`onValue: (answer, char, other) => {`);
                initializeSection.body.push(`if (answer) {`);
                initializeSection.body.push(`DE.utils.shiftBond(DE, char, other, -5, -2.5);`);

                const listOfEmotions = await generator.next({
                    maxCharacters: 5,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: `"${name} ${descriptionsForQuestions[i]}", considering they do not feel sexual attraction towards them, how would ${name} feel? answer with 3 of the most likely emotions`,
                    stopAfter: [],
                    stopAt: [],
                    instructions: "Answer with a comma separated list of the 3 most likely of the following emotions: " + EMOTIONAL_STATES_TO_CHECK_AGAINST.join(", "),
                    grammar: createGrammarListFromList(engine, EMOTIONAL_STATES_TO_CHECK_AGAINST, 3).grammar,
                });

                if (listOfEmotions.done) {
                    throw new Error("Generator finished without producing output");
                }

                const parsedEmotionalStates = parseListFromGrammarResponse(listOfEmotions.value).map(emState => emState[0].toUpperCase() + emState.slice(1).toLowerCase()); // capitalize first letter to match the emotional states format

                for (const emotionalState of parsedEmotionalStates) {
                    initializeSection.body.push(`DE.utils.shiftState(DE, char, ${JSON.stringify(emotionalState)}, 2, 4, [{name: other?.name, type: "character"}], [{characterCausant: other?.name, description: ${JSON.stringify(descriptionsForQuestions[i])}}]);`);
                }

                initializeSection.body.push(`}`);
                initializeSection.body.push(`}`);
                initializeSection.body.push(`});`);
            }

            await autosave?.save();
        }


        card.config.attractions = ["male"]
        for (const attraction of card.config.attractions) {

            if (attraction === "ambiguous") {
                continue; // skip ambiguous attraction
            }

            let conditionForAttraction = `DE.utils.${attractionToFn[attraction]}(DE, other) && basicConditionsForAttractionFn(DE, char, other)`;
            if (card.config.attractions.includes("ambiguous")) {
                conditionForAttraction = `(DE.utils.${attractionToFn[attraction]}(DE, other) || DE.utils.isAmbiguous(DE, other)) && basicConditionsForAttractionFn(DE, char, other)`;
            }

            await askYesNo(
                "attraction-physical-" + attraction,
                7,
                "make " + name + " feel sexually and romantically attracted towards another character (" + attraction + " character); focus ONLY on physical attraction: the other character's physical appearance, body, style, scent, voice, the way they move, their clothing, grooming, or similar physical/sensory attributes that would spark sexual or romantic interest in " + name + "; do NOT include personality traits, kindness, friendship behaviours, or emotional connection — strictly physical and sensory attraction",
                "feel sexually and romantically attracted based on physical/sensory attributes of a " + attraction + " character",
                "there is sexual and romantic tension between them based on physical attraction",
                "it was done by other " + attraction + " character displayed physical or sensory attributes that trigger sexual and romantic attraction in " + name + ", so it should be a positive sexual and arousing experience for " + name,
                `runIf: (char, other) => ${conditionForAttraction},`,
                `DE.utils.shiftBond(DE, char, other, 0.2, 2.5);`,
            );

            await askYesNo(
                "attraction-chemistry-" + attraction,
                7,
                "make " + name + " feel sexually and romantically attracted towards another character (" + attraction + " character); focus ONLY on sexual tension, romantic chemistry, flirtatious behaviour, seductive actions, intimate body language, suggestive conversation, romantic gestures, and sexual energy between them; do NOT include things like being nice, helpful, friendly, or having shared interests — strictly sexual tension and romantic chemistry",
                "feel sexually and romantically attracted based on sexual tension and romantic chemistry with a " + attraction + " character",
                "there is sexual tension and romantic chemistry building between them",
                "it was done by other " + attraction + " character did something that creates sexual tension or romantic chemistry with " + name + ", so it should be a positive and arousing experience for " + name,
                `runIf: (char, other) => ${conditionForAttraction},`,
                `DE.utils.shiftBond(DE, char, other, 0.2, 2.5);`,
            );

            await askYesNo(
                "attraction-turnoff-" + attraction,
                7,
                "make " + name + " feel less sexually and romantically attracted towards another character (" + attraction + " character); the causes MUST be specifically romantic/sexual turn-offs that do NOT damage friendship: things like bad hygiene, unattractive physical traits, lack of sexual chemistry, incompatible romantic style, being sexually boring or clumsy, dressing unattractively, having mannerisms that kill the mood, or simply not being their type; do NOT include things like being mean, rude, threatening, or dishonest as those would also damage a friendship",
                "feel less sexually and romantically attracted because the other character is not their type or has romantic/sexual turn-offs",
                "they have a good friendship but " + name + " is losing romantic/sexual interest specifically",
                "it was done by other " + attraction + " character did or displayed something that is a romantic/sexual turn-off but would not affect a friendship",
                `runIf: (char, other) => ${conditionForAttraction},`,
                `DE.utils.shiftBond(DE, char, other, 0, -2.5);`,
            );

            await askYesNo(
                "attraction-completely-destroy-" + attraction,
                5,
                "completely destroy any sexual or romantic interest " + name + " might have towards another character (" + attraction + " character); the causes MUST be extreme romantic/sexual dealbreakers that specifically kill attraction without destroying the friendship: things like discovering they have a deeply incompatible sexuality or kink that disgusts " + name + ", finding their body or smell physically repulsive, witnessing something that permanently makes them sexually unappealing, being so romantically incompatible that it is impossible for " + name + " to see them that way ever again; do NOT include general bad behaviour like cruelty, betrayal, or dishonesty as those would also destroy a friendship",
                "completely destroy any sexual or romantic interest because of extreme romantic/sexual incompatibility or repulsion",
                "they may still be friends but " + name + " can never see them romantically or sexually again",
                "it was done by other " + attraction + " character revealed or displayed something that is an absolute romantic/sexual dealbreaker for " + name + " but does not affect friendship",
                `runIf: (char, other) => ${conditionForAttraction},`,
                `DE.utils.shiftBond(DE, char, other, 0, -2.5);`,
            );

            overrideWholeReasoning = true;
            await askYesNo(
                "like-intimate-" + attraction,
                7,
                "Make a list of yes/no questions about activities that involve sexual, explicit and intimate acts that " + name + " might like and enjoy with another character (" + attraction + " character), because this is about a " + attraction + " character, focus on things that can only be done with a " + attraction + " character",
                "list of yes/no questions about sexual, explicit and intimate acts that " + name + " might like and enjoy with another character",
                "they are romantically and sexually attracted towards each other with strong sexual tension",
                "it was done by other " + attraction + " character performed a sexual or intimate act that " + name + " finds arousing and pleasurable",
                `runIf: (char, other) => true,`,
                `DE.utils.shiftBond(DE, char, other, 2, 3);`,

                `DE.utils.isBondLessThan(DE, char, other, ${attraction === "male" ? romanticBondValueMale : romanticBondValueFemale})`,
                `DE.utils.shiftBond(DE, char, other, -3, 0);`,
                "they are not that close for this to be acceptable and " + name + " would find it unacceptable/inappropiate",
            );
        }
    } else {
        // TODO creepy bonds
    }

    if (!isIncestuousValue) {
        // TODO creepy bonds for incest
    }

    delete card.config.bondTriggers;
    await autosave?.save();
}