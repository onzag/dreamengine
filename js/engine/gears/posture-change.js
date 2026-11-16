import { debug } from "../debug.js";
import { DEngine } from "../index.js";
import { getBasicPostures, getExtendedPosturesOf, getExternalDescriptionOfCharacter, getExternalDescriptionOfCharacterPostureOnly, humanReadablePostureToPosture, POSTURE_MAP, postureToText } from "../util/character-info.js";
import { createGrammarFromList, yesNoGrammar } from "../util/grammar.js";
import { convertMessagesToSimpleList, getHistoryFragment } from "../util/messages.js";

/**
 * @param {DEngine} engine
 * @param {DECompleteCharacterReference} character
 * @returns {Promise<string[]>} - an array of messages for storymaster
 */
export default async function calculatePostureChange(engine, character) {
    if (!engine.deObject) {
        throw new Error("DEngine object not initialized");
    } else if (!engine.inferenceAdapter) {
        throw new Error("Inference adapter not initialized");
    }

    if (!debug.ENABLED_POSTURE_CHANGE) {
        return [];
    }

    const basicPostures = getBasicPostures();

    const characterState = engine.deObject.stateFor[character.id];
    const currentPosture = characterState.posture;

    const yesNoGrammarObject = yesNoGrammar(engine);

    const systemPrompt = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(
        "You are an assistant that checks for changes in posture of a character named " + character.name + " in a story who is identified with the character id " + JSON.stringify(character.id) + ", you will be asked questions about which basic posture the character has changed to",
        [
            "Answer 'yes' only if the character's posture has been specified to change in the last story fragment, otherwise answer 'no'",
            "The character might have been referred as its id " + JSON.stringify(character.id) + " in the last story fragment",
            "Before the story to analyze the character's posture was " + JSON.stringify(currentPosture),
            "The list of potential postures are " + basicPostures.map(p => JSON.stringify(p)).join(", ") + ".",
        ],
        null,
    );

    const lastCycle = await getHistoryFragment(engine, character, {
        msgLimit: "ALL_UNPROCESSED_MESSAGES_UNTIL_FIRST_PROCESSED_MESSAGE",
        perspective: "character",
    });

    const agent = engine.inferenceAdapter.runQuestioningCustomAgentOn(
        "posture-change",
        {
            system: systemPrompt,
            contextInfoBefore: null,
            messages: convertMessagesToSimpleList(lastCycle.messages),
            contextInfoAfter: null,
        },
    );

    // prime the agent
    const ready = await agent.next();
    if (ready.done) {
        throw new Error("Agent finished unexpectedly while priming");
    }

    let foundAPostureChange = false;

    const answer = await agent.next({
        maxCharacters: 10,
        maxParagraphs: 1,
        maxSafetyCharacters: 10,
        nextQuestion: "Has the character's posture changed from " + JSON.stringify(currentPosture) + " in the last story fragment? Answer 'yes' or 'no'",
        stopAfter: yesNoGrammarObject.stopAfter,
        grammar: yesNoGrammarObject.grammar,
        stopAt: [],
        instructions: "Make sure to answer 'yes' if it is highly likely that the character posture changed even if it is not explicitly stated in the story fragment, otherwise answer 'no'.",
    });

    if (answer.done) {
        throw new Error("Agent finished unexpectedly while asking about posture change");
    }

    if (answer.value.text.trim().toLowerCase() === "yes") {
        foundAPostureChange = true;
    }

    if (foundAPostureChange) {
        const basicPosturesGrammar = createGrammarFromList(basicPostures);
        const answer = await agent.next({
            maxCharacters: 100,
            maxParagraphs: 1,
            maxSafetyCharacters: 100,
            nextQuestion: "What is the new posture of the character? Answer with the most likely posture from the list of potential postures.",
            stopAfter: basicPosturesGrammar.stopAfter,
            grammar: basicPosturesGrammar.grammar,
            stopAt: [],
            instructions: "Make sure to answer with one of the following postures: " + basicPostures.map(p => JSON.stringify(p)).join(", "),
            answerTrail: "The new posture of the character is: ",
        });

        if (answer.done) {
            throw new Error("Agent finished unexpectedly while asking about new posture");
        }

        /** @type {DEPosture} */
        let newPosture = /** @type {DEPosture} */ (answer.value.text.trim().toLowerCase());
        if (!basicPostures.includes((newPosture))) {
            throw new Error("Agent returned an invalid posture: " + JSON.stringify(newPosture));
        }

        if (newPosture === currentPosture) {
            // If the agent says the posture is the same, we can assume it didn't change
            foundAPostureChange = false;
        }

        if (foundAPostureChange) {
            // let's see if it has a specific
            const extendedPostures = getExtendedPosturesOf(newPosture);
            if (extendedPostures.length > 0) {
                const extendedPosturesGrammar = createGrammarFromList(extendedPostures);
                // @ts-ignore
                extendedPostures.push(newPosture + "+unspecified");
                // @ts-ignore
                extendedPostures.push(newPosture + "+unknown");
                // @ts-ignore
                extendedPostures.push(newPosture + "+unclear");
                // @ts-ignore
                extendedPostures.push(newPosture + "+default");

                const answer = await agent.next({
                    maxCharacters: 100,
                    maxParagraphs: 1,
                    maxSafetyCharacters: 100,
                    nextQuestion: "Choose from a further specification of the posture " + JSON.stringify(newPosture) + " from the list of potential postures. Answer with the most likely posture from the list of potential postures " + extendedPostures.map(p => JSON.stringify(p)).join(", ") + ".",
                    stopAfter: extendedPosturesGrammar.stopAfter,
                    grammar: extendedPosturesGrammar.grammar,
                    stopAt: [],
                    instructions: "Make sure to answer with one of the following postures: " + extendedPostures.map(p => JSON.stringify(p)).join(", "),
                    answerTrail: "The new specific posture of the character is: ",
                });

                if (answer.done) {
                    throw new Error("Agent finished unexpectedly while asking about specific new posture");
                }

                /** @type {DEPosture} */
                const specificNewPosture = /** @type {DEPosture} */ (answer.value.text.trim().toLowerCase());

                if (!extendedPostures.includes((specificNewPosture))) {
                    throw new Error("Agent returned an invalid specific posture: " + JSON.stringify(specificNewPosture));
                } else {
                    // update the newPosture to the specific one only if non-unspecified
                    if (!specificNewPosture.endsWith("+unspecified") && !specificNewPosture.endsWith("+unknown") && !specificNewPosture.endsWith("+unclear") && !specificNewPosture.endsWith("+default")) {
                        newPosture = specificNewPosture;
                    }

                    if (newPosture === currentPosture) {
                        // If the agent says the posture is the same, we can assume it didn't change
                        foundAPostureChange = false;
                    }
                }
            }
        }
    }

    if (foundAPostureChange) {
        return [
            getExternalDescriptionOfCharacterPostureOnly(engine.deObject, character.id, character.id, false),
        ]
    };

    return [];
}