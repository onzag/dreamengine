// Talk should save in temp.
// otherwise we use the same strategy as talk to get the new emotions.

import { DEngine } from "../index.js";
import { getExternalDescriptionOfCharacter, getInternalDescriptionOfCharacter } from "../util/character-info.js";
import { emotions } from "../util/emotions.js";
import { createGrammarFromList, parseListFromGrammarResponse } from "../util/grammar.js";
import { convertMessagesToSimpleList, getHistoryFragment, getNameIdentificationForOneCharacterTowardsAnother } from "../util/messages.js";

/**
 * @param {DEngine} engine 
 * @param {DECompleteCharacterReference} character
 */
export async function calculateEmotionForCharacter(engine, character) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    } else if (!engine.inferenceAdapter) {
        throw new Error("Inference adapter not initialized");
    } else if (!engine.deObject.characters[character.id]) {
        throw new Error(`Character ${character.id} not found in the engine`);
    } else if (!engine.dataManager) {
        throw new Error("Data manager not initialized");
    }

    const internalDescription = await getInternalDescriptionOfCharacter(engine.deObject, character.id);
    const externalDescription = await getExternalDescriptionOfCharacter(engine.deObject, character.id, character.id);
    const ourCharacterName = getNameIdentificationForOneCharacterTowardsAnother(engine.deObject, character, character);

    /**
     * @type {DEEmotionNames | null}
     */
    let primaryEmotion = null;
    let primaryEmotionDominance = -1;
    /**
     * @type {DEEmotionNames[]}
     */
    let emotionalRange = [];

    for (const state of internalDescription.activeStates) {
        const stateDominance = state.stateInfo.dominance || 0;
        if (state.stateInfo.primaryEmotion) {
            if (stateDominance > primaryEmotionDominance) {
                primaryEmotion = state.stateInfo.primaryEmotion;
                primaryEmotionDominance = stateDominance;
                emotionalRange = [];
            } else if (stateDominance === primaryEmotionDominance) {
                emotionalRange.push(state.stateInfo.primaryEmotion);
            }
        }

        if (state.stateInfo.emotionalRange) {
            if (stateDominance > primaryEmotionDominance) {
                emotionalRange = [...state.stateInfo.emotionalRange];
            } else if (stateDominance === primaryEmotionDominance) {
                emotionalRange = emotionalRange.concat(state.stateInfo.emotionalRange.filter((emotion) => !emotionalRange.includes(emotion)));
            }
        }
    }

    if (!primaryEmotion && emotionalRange.length > 0) {
        // pick one emotion at random
        primaryEmotion = emotionalRange[Math.floor(Math.random() * emotionalRange.length)];
    }

    const allMessagesForStory = await getHistoryFragment(engine, character, {
        includeRejectedMessages: false,
        msgLimit: "ALL",
        useExponentialShrinkingSelectiveContextWindowStrategy: true,
        perspective: "character",
    });

    if (!primaryEmotion) {
        const systemPromptForEmotion = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(
            `You are an assistant that analyzes the emotional state of a character ${ourCharacterName} based on their current situation, active states, and the actions they are about to take.\n` +
            "You must decide which emotions from the list of potential emotions is the character about to primarily feel",
            [
                "You must answer with a list of emotions that is comma separated, and the first emotion in the list will be the primary emotion that the character is feeling. The rest of the emotions in the list are also part of the emotional range of the character, but are not as strongly felt as the primary emotion.",
            ],
            ([
                "## " + ourCharacterName + "'s Description:" +
                externalDescription.descriptionForUser,
                internalDescription.general,
            ]).join("\n\n"),
        );

        const emotionsCharacterCantFeel = Object.keys(character.emotions).filter((emotion) =>
            // @ts-ignore
            character.emotions[emotion].unable
        );

        const availableEmotions = emotions.filter((emotion) => !emotionsCharacterCantFeel.includes(emotion));

        const emotionsList = "## Possible emotions:\n\n" + availableEmotions.map((emotion) => `- ${emotion}`).join("\n") + "\n\n";

        const expressiveStatesAsTextList = internalDescription.activeStates.filter((state) => state.expressive).map((state) => `- ${ourCharacterName} is ${state.expressive}`).join("\n");
        const keepInMindText = expressiveStatesAsTextList ? "## Keep in mind:\n\n" + expressiveStatesAsTextList : "";

        const generator = engine.inferenceAdapter.runQuestioningCustomAgentOn("talk", {
            system: systemPromptForEmotion,
            contextInfoBefore: null,
            messages: convertMessagesToSimpleList(allMessagesForStory.messages),
            contextInfoAfter: ([
                emotionsList,
                keepInMindText,
            ]).filter((section) => !!section).join("\n\n"),
        });

        const ready = await generator.next();
        if (ready.done) {
            throw new Error("Inference adapter questioning generator ended unexpectedly while trying to determine primary emotion.");
        }

        const nextQuestion = `Based on the character's situation, active states, and upcoming actions, which emotions from the list of possible emotions is ${ourCharacterName} primarily feeling? Please provide a comma separated list with the primary emotion first.`;

        const emotionResponse = await generator.next({
            maxCharacters: 100,
            maxParagraphs: 1,
            maxSafetyCharacters: 100,
            maxCharactersCutOnDot: true,
            nextQuestion: nextQuestion,
            stopAt: ["\n"],
            stopAfter: [],
            grammar: createGrammarFromList(availableEmotions).grammar,
        });

        if (emotionResponse.done || !emotionResponse.value) {
            throw new Error("Inference adapter questioning generator ended unexpectedly while trying to determine primary emotion.");
        }

        const emotionResponseText = emotionResponse.value.text.trim();

        console.log("Received emotion response: " + emotionResponseText);

        await generator.next(null); // close the generator

        const resultEmotions = parseListFromGrammarResponse(emotionResponseText);
        if (resultEmotions.length > 0) {
            // @ts-ignore
            primaryEmotion = resultEmotions[0].toLowerCase();
        } else {
            console.warn("No valid emotions were parsed from the response, defaulting to no emotions.");
            primaryEmotion = "neutral";
        }
    }

    console.log("Determined primary emotion for " + ourCharacterName + ": " + primaryEmotion);
    console.log("Determined emotional range for " + ourCharacterName + ": " + emotionalRange.join(", "));

    engine.deObject.stateFor[character.id].primaryEmotion = primaryEmotion || "neutral";
    engine.deObject.stateFor[character.id].emotionalRange = emotionalRange;
}