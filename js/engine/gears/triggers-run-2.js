// State apologies and completion tracking; shared trigger context.
import { runQuestion } from "./triggers-run-1.js";

/**
 * Shared state for one character's trigger cycle.
 * @typedef {Object} TriggerContext
 * @property {import('../index.js').DEngine} engine
 * @property {DECompleteCharacterReference} character
 * @property {DEObject} deObject
 * @property {string} characterName
 * @property {Awaited<ReturnType<typeof import('../util/messages.js').getHistoryFragment>>} lastCycleMessagesInfo
 * @property {import('../inference/base.js').QuestionAgentGeneratorResponse} questioningAgent
 * @property {() => Promise<void>} initializeAgent
 * @property {string[]} microInjections
 * @property {DEVoiceDescription[]} microVoices
 * @property {Record<string, boolean>} smallQuestionsCache
 */

/** @param {TriggerContext} context */
export async function runStateTriggers(context) {
    const {
        engine, character, deObject, characterName, lastCycleMessagesInfo, questioningAgent,
        initializeAgent, microInjections, smallQuestionsCache,
    } = context;

    for (const stateForCharacter of deObject.stateFor[character.id].states) {
        if (stateForCharacter.causes) {
            for (const cause of stateForCharacter.causes) {
                let removed = false;
                if (cause.causant?.type === "character") {
                    if (!lastCycleMessagesInfo.mentionedCharacters.includes(cause.causant.id)) {
                        continue; // skip causants that are not relevant
                    }
                    const causantCharacter = deObject.characters[cause.causant.id];
                    const causantName = causantCharacter
                        ? deObject.utils.templates.formatCharacterName(causantCharacter)
                        : `<${cause.causant.id}:Unknown Character>`;
                    if (cause.causant.apologizable) {
                        const question = "Has " + causantName + " apologized to " + characterName + " for causing them to become " + stateForCharacter.state + ": " + JSON.stringify(characterName + " " + cause.description) + " (done by " + causantName + ")?";
                        if (!smallQuestionsCache[question]) {
                            await runQuestion(engine, character, {
                                type: "yes_no",
                                question: question,
                                onValue: async (answer) => {
                                    smallQuestionsCache[question] = answer;
                                },
                            }, {
                                lastCycleMessagesInfo,
                                questioningAgent,
                                initializeAgent,
                            });
                        }

                        if (smallQuestionsCache[question]) {
                            const apologySuccessful = Math.random() < cause.causant.apologizable;
                            if (apologySuccessful) {
                                microInjections.push(characterName + " accepted the apology from " + causantName + " for causing them to become " + stateForCharacter.state);
                                stateForCharacter.causes = stateForCharacter.causes.filter(c => c !== cause);
                                removed = true;
                            } else {
                                microInjections.push(characterName + " did not accept the apology from " + causantName + " for causing them to become " + stateForCharacter.state);
                            }
                        }
                    }
                }

                if (!removed) {
                    // More?
                }
            }
        }
    }

    const sexualFullfillmentQuestion = "Has " + characterName + " had an orgasm or completed a sexual act in the last story fragment?";
    await runQuestion(engine, character, {
        type: "yes_no",
        question: sexualFullfillmentQuestion,
        onValue: async (answer) => {
            smallQuestionsCache[sexualFullfillmentQuestion] = answer;
        },
    }, {
        lastCycleMessagesInfo,
        questioningAgent,
        initializeAgent,
    });

    const isSexuallyFullfiled = smallQuestionsCache[sexualFullfillmentQuestion];

    if (isSexuallyFullfiled) {
        character.state["last_sexual_fullfillment_act"] = deObject.currentTime.time;
    }

    // TODO force an orgasm sometimes if already engaged in sex
    // TODO add vocalizations for intimate acts and sexual acts if not defined one, using the default system
}
