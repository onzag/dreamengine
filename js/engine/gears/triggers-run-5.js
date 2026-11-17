// Affection actions, consent, and ongoing action checks.
import { runQuestion } from "./triggers-run-1.js";
import { getBondDeclarationFromName } from "../util/character-info.js";
import { weightedRandomWithNullsIfNoWeight } from "../../util/random.js";

/**
 * @param {import('./triggers-run-3.js').BondTriggerContext} context
 * @param {number} proneToInitiateAffectionProbability
 */
export async function runAffectionActions(context, proneToInitiateAffectionProbability) {
    const {
        engine, character, deObject, characterName, lastCycleMessagesInfo, questioningAgent,
        initializeAgent, microInjections, microVoices, smallQuestionsCache, bond, bondDeclaration,
        otherName, otherFamilyRelation, otherRelationship,
    } = context;

    const lastIsWaitingForAffectionConsent = character.state["last_is_waiting_for_affection_consent_from_" + bond.towards];
    const lastIsExecutingAffectionateAct = character.state["last_continous_affectionate_act_initiated_towards_" + bond.towards];
    const referenceToUse = lastIsExecutingAffectionateAct || lastIsWaitingForAffectionConsent;
    if (proneToInitiateAffectionProbability > 0 || referenceToUse) {
        // affection showcase is not subject to libido
        if (Math.random() < proneToInitiateAffectionProbability || referenceToUse) {
            const realBondDeclaration = /** @type {DEBondDeclaration} */ (referenceToUse ?
                getBondDeclarationFromName(deObject, character, referenceToUse.decl) :
                bondDeclaration);
            if (!realBondDeclaration) {
                console.warn("Could not find bond declaration for " + characterName + " towards " + otherName + " with name " + referenceToUse.decl + ", skipping affectionate action");
            } else {
                const actionToChoose = referenceToUse ? (
                    realBondDeclaration.intimacy.proneToInitiatingAffection.actions[referenceToUse.actionIndex]
                ) : weightedRandomWithNullsIfNoWeight(bondDeclaration.intimacy.proneToInitiatingAffection.actions, (i) => i.probability(character, deObject.characters[bond.towards]));
                if (actionToChoose) {
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

                        character.state["last_affectionate_act_initiated_towards_" + bond.towards] = deObject.currentTime;
                        character.state["last_affectionate_act"] = deObject.currentTime;

                        if ((actionToChoose.fullfillCriteriaQuestions || []).length > 0) {
                            character.state["last_continous_affectionate_act_initiated_towards_" + bond.towards] = {
                                decl: realBondDeclaration.name,
                                actionIndex: realBondDeclaration.intimacy.proneToInitiatingAffection.actions.indexOf(actionToChoose),
                            };
                        } else {
                            delete character.state["last_continous_affectionate_act_initiated_towards_" + bond.towards];
                        }

                        delete character.state["last_is_waiting_for_affection_consent_response_from_" + bond.towards];
                    }

                    /**
                     * @param {boolean} retry
                     */
                    const injectConsentQuestion = async (retry) => {
                        if (actionToChoose.consentMechanism && actionToChoose.consentMechanism.actionsAndChecks.length > 0) {
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
                            if (!lastIsExecutingAffectionateAct) {
                                if (lastIsWaitingForAffectionConsent) {
                                    lastIsWaitingForAffectionConsent.tries++;
                                } else {
                                    character.state["last_is_waiting_for_affection_consent_response_from_" + bond.towards] = {
                                        decl: realBondDeclaration.name,
                                        actionIndex: realBondDeclaration.intimacy.proneToInitiatingAffection.actions.indexOf(actionToChoose),
                                        consentActionIndex: consentActionIndex,
                                        tries: 0,
                                    };
                                }
                            }
                        } else {
                            await injectBehaviour();
                        }
                    }

                    if (lastIsExecutingAffectionateAct) {
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
                            delete character.state["last_continous_affectionate_act_initiated_towards_" + bond.towards];
                            delete character.state["last_is_waiting_for_affection_consent_response_from_" + bond.towards];

                            // suggest a continous act we need to inform it to be completed
                            if ((actionToChoose.fullfillCriteriaQuestions || []).length > 0) {
                                microInjections.push(characterName + " has fullfilled the affectionate act: " + behaviour + " towards " + otherName);
                            }
                        }
                    } else if (actionToChoose.consentMechanism) {
                        if (lastIsWaitingForAffectionConsent) {
                            const consentActionIndex = lastIsWaitingForAffectionConsent.consentActionIndex;
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
                                        delete character.state["last_continous_affectionate_act_initiated_towards_" + bond.towards];
                                        delete character.state["last_is_waiting_for_affection_consent_response_from_" + bond.towards];
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
                    console.warn("No action to choose for " + characterName + " towards " + otherName + " for affection initiation, skipping");
                }
            }
        }
    }

}
