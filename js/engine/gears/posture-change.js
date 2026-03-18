import { DEngine } from "../index.js";
import { getBasicPostures, getExternalDescriptionOfCharacter, postureToText } from "../util/character-info.js";
import { getHistoryFragmentForCharacter } from "../util/messages.js";

/**
 * @param {DEngine} engine
 * @param {DECompleteCharacterReference} character
 * @returns {Promise<void>}
 */
export default async function calculatePostureChange(engine, character) {
    if (!engine.deObject) {
        throw new Error("DEngine object not initialized");
    } else if (!engine.inferenceAdapter) {
        throw new Error("Inference adapter not initialized");
    }

    const basicPostures = getBasicPostures();

    const yesNoGrammar = `root ::= ("yes" | "no" | "Yes" | "No" | "YES" | "NO") ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\n`;

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

        // @ts-ignore
        const postureHumanReadable = postureToText(posture);

        const question = "Has " + character.name + "'s posture changed to " + postureHumanReadable + "?";
        console.log("Asking question: " + question);

        const answer = await agent.next({
            maxCharacters: 100,
            maxParagraphs: 1,
            maxSafetyCharacters: 0,
            grammar: yesNoGrammar,
            nextQuestion: question,
            stopAfter: ["yes", "no", "Yes", "No", "YES", "NO"],
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

    // end the agent
    await agent.next(null);

    if (!foundAPostureChange) {
        console.log("No posture change detected by questioning agent for character " + character.name);
    }

    // TODO Need to check climbed out, atop, inside, to force a potential posture first
    // TODO this needs to be done with item changes, they need to be calculated even for the initial case, add a variable to this function, that specifies item changes resulting
    // calculated and then use that to know if the character does not have a known position
}