import { DEngine } from "../index.js";
import { getBasicPostures, getExtendedPosturesOf, getExternalDescriptionOfCharacter, humanReadablePostureToPosture, POSTURE_MAP, postureToText } from "../util/character-info.js";
import { createGrammarFromList, yesNoGrammar } from "../util/grammar.js";
import { getHistoryFragmentForCharacter } from "../util/messages.js";

/**
 * @param {DEngine} engine
 * @param {DECompleteCharacterReference} character
 * @param {{ [charName: string]: { reason: string; }}} knownCharactersThatMoved - a map of character names to reasons for why they moved, this is used to help determine if a character's posture might have changed due to them moving
 * @returns {Promise<void>}
 */
export default async function calculatePostureChange(engine, character, knownCharactersThatMoved) {
    if (!engine.deObject) {
        throw new Error("DEngine object not initialized");
    } else if (!engine.inferenceAdapter) {
        throw new Error("Inference adapter not initialized");
    }

    const basicPostures = getBasicPostures();

    const yesNoGrammarObject = yesNoGrammar(engine);

    const characterState = engine.deObject.stateFor[character.name];

    const characterDescription = engine.inferenceAdapter.buildSystemCharacterDescription(
        character,
        // hide the posture in the description, so the agent needs to find it out by itself
        await getExternalDescriptionOfCharacter(engine, character.name, true, true),
        null,
        [],
        [],
        null,
        null,
    );

    const systemPrompt = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(
        "You are an assistant that checks for changes in posture of a character named " + character.name + " in a story, you will be asked questions about the posture and you will answer with yes or not",
        [
            "Answer 'yes' only if the character's posture has been specified to change in the last story fragment, otherwise answer 'no'",
        ],
        characterDescription,
    );

    const lastCycle = await getHistoryFragmentForCharacter(engine, character, {
        msgLimit: "LAST_CYCLE",
    });

    const agent = engine.inferenceAdapter.runQuestioningCustomAgentOn(
        systemPrompt,
        null,
        lastCycle.messages,
        null,
        true,
    );

    // prime the agent
    const ready = await agent.next();
    if (ready.done) {
        throw new Error("Agent finished unexpectedly while priming");
    }

    let foundAPostureChange = false;
    for (const posture of basicPostures) {
        if (characterState.posture === posture) {
            continue;
        }

        if (characterState.posture.startsWith(posture)) {
            // @ts-ignore
            const allExtendedPostures = getExtendedPosturesOf(posture);
            for (const extendedPosture of allExtendedPostures) {
                if (characterState.posture === extendedPosture) {
                    continue;
                }

                // @ts-ignore
                const postureHumanReadable = postureToText(extendedPosture);

                const question = "By the end of the last story fragment, has " + character.name + "'s posture changed to " + postureHumanReadable + "?";
                console.log("Asking question: " + question);

                const answer = await agent.next({
                    maxCharacters: 100,
                    maxParagraphs: 1,
                    maxSafetyCharacters: 0,
                    grammar: yesNoGrammarObject.grammar,
                    nextQuestion: question,
                    stopAfter: yesNoGrammarObject.stopAfter,
                    stopAt: [],
                    instructions: "Answer 'yes' only if the character's posture has been specified to change to " + JSON.stringify(postureHumanReadable) + " in the last story fragment, otherwise answer 'no'",
                });

                if (answer.done) {
                    throw new Error("Agent finished unexpectedly while answering question about posture " + posture);
                }

                const answerText = answer.value.trim().toLowerCase();
                console.log("Received answer: " + answerText);
                if (answerText === "yes") {
                    console.log("Posture change detected for posture " + posture);
                    // @ts-ignore
                    characterState.posture = posture;
                    foundAPostureChange = true;
                    break;
                }
            }

            continue;
        }

        // @ts-ignore
        const postureHumanReadable = postureToText(posture);

        const question = "By the end of the last story fragment, has " + character.name + "'s posture changed to " + postureHumanReadable + "?";
        console.log("Asking question: " + question);

        const answer = await agent.next({
            maxCharacters: 100,
            maxParagraphs: 1,
            maxSafetyCharacters: 0,
            grammar: yesNoGrammarObject.grammar,
            nextQuestion: question,
            stopAfter: yesNoGrammarObject.stopAfter,
            stopAt: [],
            instructions: "Answer 'yes' only if the character's posture has been specified to change to " + JSON.stringify(postureHumanReadable) + " in the last story fragment, otherwise answer 'no'",
        });

        if (answer.done) {
            throw new Error("Agent finished unexpectedly while answering question about posture " + posture);
        }

        const answerText = answer.value.trim().toLowerCase();
        console.log("Received answer: " + answerText);

        if (answerText === "yes") {
            console.log("Posture change detected for posture " + posture);
            // @ts-ignore
            characterState.posture = posture;
            foundAPostureChange = true;

            // @ts-ignore
            const extendedPostures = getExtendedPosturesOf(posture);

            for (const extendedPosture of extendedPostures) {
                // @ts-ignore
                const postureHumanReadable = postureToText(extendedPosture);

                const question = "By the end of the last story fragment, has " + character.name + "'s posture changed to " + postureHumanReadable + "?";
                console.log("Asking question: " + question);

                const answer = await agent.next({
                    maxCharacters: 100,
                    maxParagraphs: 1,
                    maxSafetyCharacters: 0,
                    grammar: yesNoGrammarObject.grammar,
                    nextQuestion: question,
                    stopAfter: yesNoGrammarObject.stopAfter,
                    stopAt: [],
                    instructions: "Answer 'yes' only if the character's posture has been specified to change to " + JSON.stringify(postureHumanReadable) + " in the last story fragment, otherwise answer 'no'",
                });

                if (answer.done) {
                    throw new Error("Agent finished unexpectedly while answering question about posture " + posture);
                }

                const answerText = answer.value.trim().toLowerCase();
                console.log("Received answer: " + answerText);
                if (answerText === "yes") {
                    console.log("Posture change detected for posture " + posture);
                    // @ts-ignore
                    characterState.posture = posture;
                    foundAPostureChange = true;
                    break;
                }
            }
        }
    }

    // end the agent
    await agent.next(null);

    if (!foundAPostureChange) {
        console.log("No posture change detected by questioning agent for character " + character.name);
        if (knownCharactersThatMoved[character.name]) {
            console.log("However, " + character.name + " is known to have moved due to " + knownCharactersThatMoved[character.name].reason + ", so we will assume their posture has changed as well.");

            const allPosturesAndExtended = Object.values(POSTURE_MAP);

            const systemPrompt = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(
                "You are an assistant that figures out the most likely posture of " + character.name + " in a story, you will be asked questions about the most likely posture and youw will answer with one",
                [
                    "The list of potential postures are " + allPosturesAndExtended.map(p => JSON.stringify(p)).join(", ") + ".",
                ],
                characterDescription,
            );

            const agent = engine.inferenceAdapter.runQuestioningCustomAgentOn(
                systemPrompt,
                null,
                lastCycle.messages,
                null,
                true,
            );

            // prime the agent
            const ready = await agent.next();
            if (ready.done) {
                throw new Error("Agent finished unexpectedly while priming for most likely posture");
            }

            const question = "Given that " + character.name + " is known to have moved in the last story fragment due to " + JSON.stringify(knownCharactersThatMoved[character.name].reason) + ", what is the most likely posture of " + character.name + " by the end of the last story fragment?";
            console.log("Asking question: " + question);

            const listGrammar = createGrammarFromList(engine, allPosturesAndExtended);

            const answer = await agent.next({
                maxCharacters: 100,
                maxParagraphs: 1,
                maxSafetyCharacters: 0,
                grammar: listGrammar.grammar,
                nextQuestion: question,
                stopAfter: listGrammar.stopAfter,
                stopAt: [],
                answerTrail: "Most likely posture:\n\n",
                instructions: "Answer with the most likely posture of " + character.name + " by the end of the last story fragment, given that they are known to have moved. The list of potential postures are " + allPosturesAndExtended.map(p => JSON.stringify(p)).join(", ") + ".",
            });

            if (answer.done) {
                throw new Error("Agent finished unexpectedly while answering question about most likely posture");
            }

            const answerText = answer.value.trim();
            console.log("Received answer: " + answerText);

            const postureMatched = humanReadablePostureToPosture(answerText);
            if (postureMatched) {
                console.log("Most likely posture detected as " + postureMatched + " for character " + character.name);
                // @ts-ignore
                characterState.posture = postureMatched;
            } else {
                console.log("Failed to parse posture from agent answer, received answer was: " + answerText);
            }
        }
    }
}