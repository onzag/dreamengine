/** @typedef {import('../index.js').DEngine} DEngine */
import { debug } from '../debug.js';
import { convertMessagesToSimpleList, getHistoryFragment } from '../util/messages.js';
import { runQuestion } from './triggers-run-1.js';
import { runStateTriggers } from './triggers-run-2.js';
import { runBondTriggers } from './triggers-run-3.js';

export { runQuestion };

/**
 * @param {DEngine} engine
 * @param {DECompleteCharacterReference} character
 * @returns {Promise<{microInjections: string[], microVoices: DEVoiceDescription[]}>}
 */
export default async function runAllTriggersFor(engine, character) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    } else if (!engine.inferenceAdapter) {
        throw new Error("Inference adapter not initialized");
    } else if (!character.bonds) {
        throw new Error(`Character ${character.id} has no bonds defined.`);
    }

    const deObject = engine.getDEObject();
    const characterName = deObject.utils.templates.formatCharacterName(character, character);

    if (!debug.ENABLED_TRIGGERS) {
        return { microInjections: [], microVoices: [] };
    }

    const lastCycleMessagesInfo = await getHistoryFragment(engine, character, {
        msgLimit: "ALL_UNPROCESSED_MESSAGES_UNTIL_FIRST_PROCESSED_MESSAGE",
        includeDebugMessages: false,
        includeRejectedMessages: false,
        perspective: "character",
    });

    const systemPrompt = `You are an assistant and social dynamics analyst that helps analyze interactions involving ${characterName}.`;
    const questioningAgent = engine.inferenceAdapter.runQuestioningCustomAgentOn(
        "questions-run",
        {
            system: engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(systemPrompt, [
                "The character might have been referred as its id " + JSON.stringify(character.id) + " in the story to analyze, as the id part of an <id:name> identifier, if the id is the same, the character is the same, make sure to check for that as well.",
            ], null),
            contextInfoBefore: null,
            messages: convertMessagesToSimpleList(lastCycleMessagesInfo.messages),
            contextInfoAfter: null,
        },
    );

    let initialized = false;

    const initializeAgent = async () => {
        if (initialized) {
            return;
        }
        const ready = await questioningAgent.next();
        if (ready.done) {
            throw new Error("Failed to initialize questioning agent");
        }
        initialized = true;
    }

    for (const trigger of character.triggers) {
        await runQuestion(engine, character, trigger, {
            lastCycleMessagesInfo,
            questioningAgent,
            initializeAgent,
        });
    }

    /** @type {import('./triggers-run-2.js').TriggerContext} */
    const context = {
        engine, character, deObject, characterName, lastCycleMessagesInfo, questioningAgent, initializeAgent,
        microInjections: [], microVoices: [], smallQuestionsCache: {},
    };

    await runStateTriggers(context);
    await runBondTriggers(context);

    if (initialized) {
        await questioningAgent.next(null);
        await questioningAgent.return();
    }

    return {
        microInjections: context.microInjections,
        microVoices: context.microVoices,
    };
}
