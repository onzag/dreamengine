// Intimate affection actions, consent, and ongoing action checks.
import { runQuestion } from "./triggers-run-1.js";
import { getBondDeclarationFromName, getFamilyBondRelation, getRelationship } from "../util/character-info.js";
import { weightedRandomWithNullsIfNoWeight } from "../../util/random.js";

/**
 * @param {import('./triggers-run-3.js').BondTriggerContext} context
 * @param {number} proneToInitiateIntimateAffectionProbability
 */
export async function runIntimateAffectionActions(context, proneToInitiateIntimateAffectionProbability) {
    const {
        engine, character, deObject, characterName, lastCycleMessagesInfo, questioningAgent,
        initializeAgent, microInjections, microVoices, smallQuestionsCache, bond, bondDeclaration,
        otherName, otherFamilyRelation, otherRelationship,
    } = context;

    const lastIsWaitingForIntimateAffectionConsent = character.state["last_is_waiting_for_intimate_affection_consent_from_" + bond.towards];
    const lastIsExecutingIntimateAffectionateAct = character.state["last_continous_intimate_affectionate_act_initiated_towards_" + bond.towards];
    const referenceToUseIntimate = lastIsExecutingIntimateAffectionateAct || lastIsWaitingForIntimateAffectionConsent;
    if (Math.random() < proneToInitiateIntimateAffectionProbability || referenceToUseIntimate) {
        const realBondDeclaration = /** @type {DEBondDeclaration} */ (referenceToUseIntimate ?
            getBondDeclarationFromName(deObject, character, referenceToUseIntimate.decl) :
            bondDeclaration);
        if (!realBondDeclaration) {
            console.warn("Could not find bond declaration for " + characterName + " towards " + otherName + " with name " + referenceToUseIntimate.decl + ", skipping intimate affectionate action");
        } else {
            const actionToChoose = referenceToUseIntimate ? (
                realBondDeclaration.intimacy.proneToInitiatingIntimateAffection.actions[referenceToUseIntimate.actionIndex]
            ) : weightedRandomWithNullsIfNoWeight(bondDeclaration.intimacy.proneToInitiatingIntimateAffection.actions, (i) => i.probability(character, deObject.characters[bond.towards]));
            if (actionToChoose) {
                const otherFamilyRelation = getFamilyBondRelation(character, deObject.characters[bond.towards]);
                const otherRelationship = await getRelationship(deObject, character, deObject.characters[bond.towards]);

                /**
                 * Proceeded despite the lack of consent
                 * @param {boolean} proceedAnyway
                 */
                const injectBehaviour = async (proceedAnyway = false) => {
                    const behaviour = typeof actionToChoose.action === "string" ? actionToChoose.action : await actionToChoose.action({
                        char: character,
                        other: deObject.characters[bond.towards],
                        otherFamilyRelation,
                        otherRelationship,
                    });

                    if (proceedAnyway) {
                        microInjections.push("Even though " + characterName + " did not receive consent: " + behaviour);
                    } else {
                        microInjections.push(behaviour);
                    }

                    if (actionToChoose.voice) {
                        microVoices.push(actionToChoose.voice);
                    }

                    character.state["last_intimate_affectionate_act_initiated_towards_" + bond.towards] = deObject.currentTime;
                    character.state["last_intimate_affectionate_act"] = deObject.currentTime;

                    if ((actionToChoose.fullfillCriteriaQuestions || []).length > 0) {
                        character.state["last_continous_intimate_affectionate_act_initiated_towards_" + bond.towards] = {
                            decl: realBondDeclaration.name,
                            actionIndex: realBondDeclaration.intimacy.proneToInitiatingIntimateAffection.actions.indexOf(actionToChoose),
                        };
                    } else {
                        delete character.state["last_continous_intimate_affectionate_act_initiated_towards_" + bond.towards];
                    }

                    delete character.state["last_is_waiting_for_intimate_affection_consent_response_from_" + bond.towards];
                }

                /**
                 * @param {boolean} retry
                 */
                const injectConsentQuestion = async (retry) => {
                    if (actionToChoose.consentMechanism) {
                        const consentActionIndex = Math.floor(Math.random() * actionToChoose.consentMechanism.actionsAndChecks.length);
                        const actionToAskForConsent = typeof actionToChoose.consentMechanism.actionsAndChecks[consentActionIndex].action === "string" ? actionToChoose.consentMechanism.actionsAndChecks[consentActionIndex].action : await actionToChoose.consentMechanism.actionsAndChecks[consentActionIndex].action({
                            char: character,
                            other: deObject.characters[bond.towards],
                            otherFamilyRelation,
                            otherRelationship,
                        });
                        if (retry) {
                            microInjections.push(characterName + " will insist on the behaviour: " + actionToAskForConsent);
                        } else {
                            microInjections.push(actionToAskForConsent);
                        }
                        if (!lastIsExecutingIntimateAffectionateAct) {
                            if (lastIsWaitingForIntimateAffectionConsent) {
                                lastIsWaitingForIntimateAffectionConsent.tries++;
                            } else {
                                character.state["last_is_waiting_for_intimate_affection_consent_response_from_" + bond.towards] = {
                                    decl: realBondDeclaration.name,
                                    actionIndex: realBondDeclaration.intimacy.proneToInitiatingIntimateAffection.actions.indexOf(actionToChoose),
                                    consentActionIndex,
                                    tries: 0,
                                };
                            }
                        }
                    } else {
                        await injectBehaviour();
                    }
                }

                if (lastIsExecutingIntimateAffectionateAct) {
                    let isFullfilled = actionToChoose.fullfillCriteriaQuestions && actionToChoose.fullfillCriteriaQuestions.length > 0 ? false : true;

                    const behaviour = typeof actionToChoose.action === "string" ? actionToChoose.action : await actionToChoose.action({
                        char: character,
                        other: deObject.characters[bond.towards],
                        otherFamilyRelation,
                        otherRelationship,
                    });

                    const question = "Has the following action that was started before stopped: " + behaviour + " ? Answer 'yes' if the action has clearly stopped or is not being performed anymore, answer 'no' if the action is still being performed.";
                    const fullfillQuestions = actionToChoose.fullfillCriteriaQuestions || [];
                    fullfillQuestions.unshift(question);

                    for (const question of fullfillQuestions) {
                        const questionValue = (typeof question === "string" ? question : await question({
                            char: character,
                            other: deObject.characters[bond.towards],
                            otherFamilyRelation,
                            otherRelationship,
                        })).trim();
                        await runQuestion(engine, character, {
                            type: "yes_no",
                            question: questionValue,
                            /**
                             * @param {boolean} answer 
                             */
                            onValue: async (answer) => {
                                smallQuestionsCache[questionValue] = answer;
                            },
                        }, {
                            lastCycleMessagesInfo,
                            questioningAgent,
                            initializeAgent,
                        });

                        if (smallQuestionsCache[questionValue]) {
                            isFullfilled = true;
                            break;
                        }
                    }

                    if (!isFullfilled) {
                        await injectBehaviour();
                    } else {
                        delete character.state["last_continous_intimate_affectionate_act_initiated_towards_" + bond.towards];
                        delete character.state["last_is_waiting_for_intimate_affection_consent_response_from_" + bond.towards];

                        // suggest a continous act we need to inform it to be completed
                        if ((actionToChoose.fullfillCriteriaQuestions || []).length > 0) {
                            microInjections.push(characterName + " has fullfilled the intimate affectionate act: " + behaviour + " towards " + otherName);
                        }
                    }
                } else if (actionToChoose.consentMechanism) {
                    if (lastIsWaitingForIntimateAffectionConsent) {
                        const consentActionIndex = lastIsWaitingForIntimateAffectionConsent.consentActionIndex;
                        const questionAmbigous = (typeof actionToChoose.consentMechanism.actionsAndChecks[consentActionIndex].checkAmbiguousResponse === "string" ? actionToChoose.consentMechanism.actionsAndChecks[consentActionIndex].checkAmbiguousResponse : await actionToChoose.consentMechanism.actionsAndChecks[consentActionIndex].checkAmbiguousResponse({
                            char: character,
                            other: deObject.characters[bond.towards],
                            otherFamilyRelation,
                            otherRelationship,
                        })).trim();
                        let answerAmbigousBool = false;
                        if (questionAmbigous.toLowerCase() === "yes" || questionAmbigous.toLowerCase() === "no") {
                            answerAmbigousBool = questionAmbigous.toLowerCase() === "yes";
                        } else if (!smallQuestionsCache[questionAmbigous]) {
                            await runQuestion(engine, character, {
                                type: "yes_no",
                                question: questionAmbigous,
                                /**
                                 * @param {boolean} answer 
                                 */
                                onValue: async (answer) => {
                                    smallQuestionsCache[questionAmbigous] = answer;
                                },
                            }, {
                                lastCycleMessagesInfo,
                                questioningAgent,
                                initializeAgent,
                            });
                            answerAmbigousBool = smallQuestionsCache[questionAmbigous];
                        }

                        if (answerAmbigousBool) {
                            // insist for a clear reply on it
                            // will insist because too ambiguous
                            await injectConsentQuestion(true);
                        } else {
                            const question = (typeof actionToChoose.consentMechanism.actionsAndChecks[consentActionIndex].check === "string" ? actionToChoose.consentMechanism.actionsAndChecks[consentActionIndex].check : await actionToChoose.consentMechanism.actionsAndChecks[consentActionIndex].check({
                                char: character,
                                other: deObject.characters[bond.towards],
                                otherFamilyRelation,
                                otherRelationship,
                            })).trim();
                            let answerBool = false;
                            if (question.toLowerCase() === "yes" || question.toLowerCase() === "no") {
                                answerBool = question.toLowerCase() === "yes";
                            } else if (!smallQuestionsCache[question]) {
                                await runQuestion(engine, character, {
                                    type: "yes_no",
                                    question: question,
                                    /**
                                     * @param {boolean} answer 
                                     */
                                    onValue: async (answer) => {
                                        smallQuestionsCache[question] = answer;
                                    },
                                }, {
                                    lastCycleMessagesInfo,
                                    questioningAgent,
                                    initializeAgent,
                                });
                                answerBool = smallQuestionsCache[question];
                            }
                            if (answerBool) {
                                // consent given
                                await injectBehaviour();
                            } else {
                                // consent refused, let's see if we insist or not
                                if (Math.random() < actionToChoose.consentMechanism.insistence) {
                                    // try to insist
                                    await injectConsentQuestion(true);
                                } else if (Math.random() < actionToChoose.consentMechanism.ignoreConsentRejection) {
                                    // proceed anyway after receiving a no
                                    await injectBehaviour(true);
                                } else {
                                    delete character.state["last_continous_intimate_affectionate_act_initiated_towards_" + bond.towards];
                                    delete character.state["last_is_waiting_for_intimate_affection_consent_response_from_" + bond.towards];
                                }
                            }
                        }
                    } else {
                        await injectConsentQuestion(false);
                    }
                } else {
                    await injectBehaviour();
                }
            } else {
                console.warn("No action to choose for " + characterName + " towards " + otherName + " for intimate affection initiation, skipping");
            }
        }
    }

}
