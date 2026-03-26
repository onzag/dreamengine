// const needsReversed = !isIncestuousValue || isAsexualValue;

import { DEngine } from "../engine/index.js";
import { createCardStructureFrom, getJsCard } from "./base.js";
import { replaceAllCharNameWithPlaceholder } from "./generate-base.js";

/**
 * 
 * @param {string} text
 * @param {string} charName
 * @returns 
 */
function replaceOtherCharNameWithPlaceholder(text, charName) {
    return replaceAllCharNameWithPlaceholder(text.replace(/OTHER_CHARACTER|OTHER CHARACTER|[Oo]ther character/g, "{{other}}"), charName);
}

/**
 * @param {DEngine} engine
 * @param {string} jsSource
 * @return {Promise<string>}
 */
export async function generateBondTriggers(engine, jsSource) {
    const card = createCardStructureFrom(jsSource);

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

    const isAsexualValue = card.config.isAsexual;
    const name = card.config.name;

    const EMOTIONAL_STATES_TO_CHECK_AGAINST = [
        "Angry",
        "Annoyed",
        "Anxious",
        "Ashamed",
        "Disgusted",
        "Sad",
        "Scared",
        "Fearful",
        "Shy",
        "Happy",
        "Affectionate",
        "Grateful",
        "Proud",
        "Amused",
        "Relieved",
        "Curious",
        "Jealous",
    ]

    if (!isAsexualValue) {
        EMOTIONAL_STATES_TO_CHECK_AGAINST.push("Flirty", "Loving", "Aroused");
    }

    const ready = await generator.next(); // start the generator with an empty message to get it going
    if (ready.done) {
        throw new Error("Generator finished without producing output");
    }

    /**
     * 
     * @param {string} reasoning 
     * @param {string} trail 
     * @param {string} considering
     * @param {string} condition
     * @param {string} yesCode
     * @param {string} [noCode]
     */
    const askYesNo = async (reasoning, trail, considering, condition, yesCode, noCode) => {
        const yesNoQuestions = await generator.next({
            maxCharacters: 500,
            maxSafetyCharacters: 0,
            maxParagraphs: 10,
            nextQuestion: "Make a list of yes/no questions that provided a positive (yes) answer would make " + name + " " + reasoning + "; give at most 3 questions, make the question as long and as expressive as needed",
            stopAfter: [],
            stopAt: [],
            instructions: "The list should be in 3rd person and formatted as a markdown list with each question as a separate bullet point, use OTHER_CHARACTER as a placeholder for the other character's name. OTHER_CHARACTER must always be included",
            grammar: "root ::= list\nlist ::= bulletPoint+\nbulletPoint ::= \"-\" [a-zA-Z0-9 ,?]+ \"\\n\"",
            answerTrail: "# List of yes/no questions that would make " + name + " " + trail + ":\n\n",
        });

        if (yesNoQuestions.done) {
            throw new Error("Generator finished without producing output");
        }

        const yesNoQuestionValue = yesNoQuestions.value.trim();
        const questionsParsed = yesNoQuestionValue.split("\n").map(line => line.trim()).filter(line => line.startsWith("- "))
            .map(line => line.substring(2).trim());

        for (let i = 0; i < questionsParsed.length; i++) {
            const question = questionsParsed[i];
            const questionReplaced = replaceOtherCharNameWithPlaceholder(question, name);

            card.body.push(`DE.utils.newTrigger(DE, ${JSON.stringify(name)}, {`)
            card.body.push(`type: "yes_no",`);
            card.body.push(`askPer: "conversing_character",`);
            card.body.push(condition);
            card.body.push(`question: DE.utils.newHandlebarsTemplate(DE, ${JSON.stringify(questionReplaced)}),`);
            card.body.push(`onValue: (answer, char, other) => {`);
            card.body.push(`if (answer) {`);
            card.body.push(yesCode);

            const causeValue = await generator.next({
                maxCharacters: 100,
                maxSafetyCharacters: 0,
                maxParagraphs: 1,
                nextQuestion: `What would be a short "yes" statement of the question "${question}", it should be very short`,
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
                instructions: "Do not include the word OTHER_CHARACTER in the answer, just give a short statement of what the yes answer would mean for " + name,
                answerTrail: `# The short statement is:\n\nyes, ${name} `,
            });

            if (causeValue.done) {
                throw new Error("Generator finished without producing output");
            }

            const description = causeValue.value.trim();

            for (const emotionalState of EMOTIONAL_STATES_TO_CHECK_AGAINST) {
                const wouldYesCauseAReaction = await generator.next({
                    maxCharacters: 5,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: `If the answer to the question "${question}" is yes, considering ${considering}, would that cause "${name}" to feel ${emotionalState}? Answer with "yes" or "no".`,
                    stopAfter: [],
                    stopAt: [],
                    grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`,
                });

                if (wouldYesCauseAReaction.done) {
                    throw new Error("Generator finished without producing output");
                }

                const answer = wouldYesCauseAReaction.value.trim().toLowerCase();

                if (answer === "yes") {
                    card.body.push(`DE.utils.tickleState(DE, char, ${JSON.stringify(emotionalState)}, 1, 2, [{name: other?.name, type: "character"}], [{characterCausant: other?.name, description: ${JSON.stringify(description)}}]);`);
                }
            }

            if (noCode) {
                card.body.push(`} else {`);
                card.body.push(noCode);

                for (const emotionalState of EMOTIONAL_STATES_TO_CHECK_AGAINST) {
                    const wouldYesCauseAReaction = await generator.next({
                        maxCharacters: 5,
                        maxSafetyCharacters: 0,
                        maxParagraphs: 1,
                        nextQuestion: `If the answer to the question "${question}" is no, considering ${considering}, would that cause "${name}" to feel ${emotionalState}? Answer with "yes" or "no".`,
                        stopAfter: [],
                        stopAt: [],
                        grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`,
                    });

                    if (wouldYesCauseAReaction.done) {
                        throw new Error("Generator finished without producing output");
                    }

                    const answer = wouldYesCauseAReaction.value.trim().toLowerCase();

                    if (answer === "yes") {
                        card.body.push(`DE.utils.tickleState(DE, char, ${JSON.stringify(emotionalState)}, 1, 2, [{name: other?.name, type: "character"}], [{characterCausant: other?.name, description: ${JSON.stringify(description)}}]);`);
                    }
                }
            }

            card.body.push(`}`);
            card.body.push(`}`); // end onAnswer
            card.body.push(`});`); // end trigger
        }
    }

    // -- NON ROMANTIC MAKE SURE NOT TO INCLUDE ANYTHING ROMANTIC OR SEXUAL IN THE QUESTIONS UNLESS ASEXUAL IS TRUE --

    // STRANGERS

    // yes/no questions that would make the character really like or dislike another when they are strangers that just met
    await askYesNo(
        "really like (strongly like) another provided they just met and have no prior relationship",
        "really like another when they are strangers",
        "they are strangers towards each other",
        `runIf: (char, other) => DE.utils.isStrangerTowards(DE, char, other),`,
        `DE.utils.shiftBond(DE, char, other, 1, 0);`,
    );
    await askYesNo(
        "really dislike (strongly dislike) another provided they just met and have no prior relationship",
        "really dislike another when they are strangers",
        "they are strangers towards each other",
        `runIf: (char, other) => DE.utils.isStrangerTowards(DE, char, other),`,
        `DE.utils.shiftBond(DE, char, other, -1, -1);`,
    );


    // yes/no questions that would make the character somewhat like or dislike another when they are strangers that just met
    await askYesNo(
        "like another slightly (a small effect) provided they just met and have no prior relationship",
        "like another slightly (a small effect) when they are strangers",
        "they are strangers towards each other",
        `runIf: (char, other) => DE.utils.isStrangerTowards(DE, char, other),`,
        `DE.utils.shiftBond(DE, char, other, 0.5, 0);`,
    );
    await askYesNo(
        "dislike another slightly (a small effect) provided they just met and have no prior relationship",
        "dislike another slightly (a small effect) when they are strangers",
        "they are strangers towards each other",
        `runIf: (char, other) => DE.utils.isStrangerTowards(DE, char, other),`,
        `DE.utils.shiftBond(DE, char, other, -0.5, -0.5);`,
    );

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

    const isLoveAtFirstSightValue = isLoveAtFirstSight.value.trim().toLowerCase() === "yes";

    card.config.loveAtFirstSight = isLoveAtFirstSightValue;

    if (isLoveAtFirstSightValue) {
        await askYesNo(
            "feel love at first sight towards another character they just met and have no prior relationship with",
            "feel love at first sight towards another when they are strangers",
            "they are strangers towards each other but " + name + " can feel love at first sight",
            `runIf: (char, other) => DE.utils.isStrangerTowards(DE, char, other),`,
            `DE.utils.shiftBond(DE, char, other, 1, 0);`,
        );
    }

    await askYesNo(
        "feel hate at first sight towards another character they just met and have no prior relationship with",
        "feel hate at first sight towards another when they are strangers",
        "they are strangers towards each other",
        `runIf: (char, other) => DE.utils.isStrangerTowards(DE, char, other),`,
        `DE.utils.shiftBond(DE, char, other, -1, -1);`,
    );

    // yes/no questions that would make the character really like or dislike another when they are acquaintances
    await askYesNo(
        "really like (strongly like) another provided they are acquaintances but not close friends",
        "really like another when they are acquaintances",
        "they are acquaintances but not close friends towards each other",
        `runIf: (char, other) => DE.utils.isAcquaintanceTowards(DE, char, other),`,
        `DE.utils.shiftBond(DE, char, other, 1, 0);`,
    );
    await askYesNo(
        "really dislike (strongly dislike) another provided they are acquaintances but not close friends",
        "really dislike another when they are acquaintances",
        "they are acquaintances but not close friends towards each other",
        `runIf: (char, other) => DE.utils.isAcquaintanceTowards(DE, char, other),`,
        `DE.utils.shiftBond(DE, char, other, -1, -1);`,
    );


    // yes/no questions that would make the character somewhat like or dislike another when they are acquaintances
    await askYesNo(
        "like another slightly (a small effect) provided they are acquaintances but not close friends",
        "like another slightly (a small effect) when they are acquaintances",
        "they are acquaintances but not close friends towards each other",
        `runIf: (char, other) => DE.utils.isAcquaintanceTowards(DE, char, other),`,
        `DE.utils.shiftBond(DE, char, other, 0.5, 0);`,
    );
    await askYesNo(
        "dislike another slightly (a small effect) provided they are acquaintances but not close friends",
        "dislike another slightly (a small effect) when they are acquaintances",
        "they are acquaintances but not close friends towards each other",
        `runIf: (char, other) => DE.utils.isAcquaintanceTowards(DE, char, other),`,
        `DE.utils.shiftBond(DE, char, other, -0.5, -0.5);`,
    );


    // IN GENERAL (ALL LEVELS)

    // yes/no questions that would make the character really like or dislike the regardless of the relationship level
    await askYesNo(
        "really like another (strongly like) at any relationship level, from strangers, enemies, aquitances, friends, close friends, to best friends",
        "really like another (strongly like) at any relationship level",
        "this can include anyone from strangers, enemies, aquitances, friends, close friends, to best friends towards each other",
        `runIf: (char, other) => true,`,
        `DE.utils.shiftBond(DE, char, other, 1, 0);`,
    );
    await askYesNo(
        "really dislike another (strongly dislike) at any relationship level, from strangers, enemies, aquitances, friends, close friends, to best friends",
        "really dislike another (strongly dislike) at any relationship level",
        "this can include anyone from strangers, enemies, aquitances, friends, close friends, to best friends towards each other",
        `runIf: (char, other) => true,`,
        `DE.utils.shiftBond(DE, char, other, -1, -1);`,
    );

    // yes/no questions that would make the character somewhat like or dislike another regardless of the relationship level
    await askYesNo(
        "like another slightly (a small effect) at any relationship level, from strangers, enemies, aquitances, friends, close friends, to best friends",
        "like another slightly (a small effect) at any relationship level",
        "this can include anyone from strangers, enemies, aquitances, friends, close friends, to best friends towards each other",
        `runIf: (char, other) => true,`,
        `DE.utils.shiftBond(DE, char, other, 0.5, 0);`,
    );
    await askYesNo(
        "dislike another slightly (a small effect) at any relationship level, from strangers, enemies, aquitances, friends, close friends, to best friends",
        "dislike another slightly (a small effect) at any relationship level",
        "this can include anyone from strangers, enemies, aquitances, friends, close friends, to best friends towards each other",
        `runIf: (char, other) => true,`,
        `DE.utils.shiftBond(DE, char, other, -0.5, -0.5);`,
    );

    // yes/no questions that would make a character feel sudden hatred and make them instant sworn enemies (abuse towards, witnessing crime, etc)
    await askYesNo(
        "feel a sudden intense hatred towards another and become sworn enemies instantly at any relationship level, from strangers, enemies, aquitances, friends, close friends, to best friends",
        "feel a sudden intense hatred towards another and become sworn enemies instantly at any relationship level",
        "this can include anyone from strangers, enemies, aquitances, friends, close friends, to best friends towards each other",
        `runIf: (char, other) => true,`,
        `DE.utils.shiftBond(DE, char, other, -50, -25);`,
    );

    // STRONG POSITIVE BONDS

    // yes/no questions that would make the character really like another when they are close friends and be unacceptable otherwise (non-romantic)
    await askYesNo(
        "really like another (strongly like) when they are close friends and be unacceptable otherwise, even for people in friendly terms, only close friends (non-romantic)",
        "really like another (strongly like) when they are close friends and be unacceptable otherwise",
        null,
        `runIf: (char, other) => true,`,
        `DE.utils.shiftBond(DE, char, other, 1, 0);`,
        `DE.utils.shiftBond(DE, char, other, -1, -1);`,
    );

    // yes/no questions that would make the character somewhat like another when they are close friends and be unacceptable otherwise (non-romantic)

    // BEST FRIENDS

    // yes/no questions that would make the character really like another when they are best friends and be unacceptable otherwise (non-romantic)
    // yes/no questions that would make the character somewhat like another when they are best friends and be unacceptable otherwise (non-romantic)

    // STRONG NEGATIVE BONDS AND SWORN ENEMIES

    // yes/no questions that would make the character feel conflicted and like a character they don't like a bit more (non-romantic)
    // yes/no questions that would make the character feel conflicted and like a character they don't like a lot more (non-romantic)

    // (yes/no questions that clear a misunderstanding)

    // ======= ROMANTIC ======

    // NO ATTRACTION
    // yes/no romance/affection/interest questions that would make the character uncomfortable when there's no romantic interest

    // IN GENERAL (ALL SECOND BONDS)
    // yes/no questions that would make the character really sexually and romantically like or dislike another regardless of the relationship level
    // yes/no questions that would make the character somewhat sexually and romantically like or dislike another regardless of the relationship level

    // SOME ATTRACTION
    // yes/no questions that would make the character really sexually and romantically like another when they have a slight romantic interest, and be unacceptable otherwise
    // yes/no questions that would make the character somewhat sexually and romantically like another when they have a slight romantic interest, and be unacceptable otherwise

    // STRONG ATTRACTION
    // yes/no questions that would make the character really sexually and romantically like another when they have a romantic interest, and be unacceptable otherwise
    // yes/no questions that would make the character somewhat sexually and romantically like another when they have a romantic interest, and be unacceptable otherwise

    return getJsCard(card);
}