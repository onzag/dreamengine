// Bond responses and observed affection or intimacy.
import { runQuestion } from "./triggers-run-1.js";
import { getBondDeclarationFromBondDescription, getFamilyBondRelation, getRelationship } from "../util/character-info.js";
import { runIntimacyActions } from "./triggers-run-4.js";

/**
 * @typedef {import('./triggers-run-2.js').TriggerContext & {
 *   bond: DESingleBondDescription,
 *   bondDeclaration: DEBondDeclaration,
 *   otherName: string,
 *   otherFamilyRelation: DEFamilyRelation | null,
 *   otherRelationship: string | null,
 *   multiplier: number,
 *   alreadyInAffectionateAct: boolean,
 *   alreadyInIntimateAct: boolean,
 *   alreadyInSex: boolean,
 * }} BondTriggerContext
 */

/** @param {import('./triggers-run-2.js').TriggerContext} context */
export async function runBondTriggers(context) {
    const {
        engine, character, deObject, characterName, lastCycleMessagesInfo, questioningAgent,
        initializeAgent, microInjections, microVoices, smallQuestionsCache,
    } = context;

    for (const bond of deObject.bonds[character.id].active) {
        if (lastCycleMessagesInfo.mentionedCharacters.includes(bond.towards)) {
            const otherName = deObject.characters[bond.towards]
                ? deObject.utils.templates.formatCharacterName(bond.towards)
                : `<${bond.towards}:Unknown Character>`;
            let rejectIntimacy = character.temp["rejectIntimacy_" + bond.towards];
            if (rejectIntimacy) {
                console.log("Intimacy towards " + otherName + " is currently rejected for " + characterName + " because of a recent negative interaction");
            }

            if (character.temp["alreadyShiftedBondPrimary_" + bond.towards] < 0 || character.temp["alreadyShiftedBondSecondary_" + bond.towards] < 0) {
                console.log("Intimacy towards " + otherName + " is currently rejected for " + characterName + " because of a negative interaction or already shifted bond");
                rejectIntimacy = true;
            }

            let multiplier = rejectIntimacy ? 0 : 1;

            const allActiveStates = deObject.stateFor[character.id].states;
            for (const activeState of allActiveStates) {
                const stateDef = character.stateDefinitions[activeState.state];
                if (typeof stateDef.intimacyMultiplier === "number" && stateDef.intimacyMultiplier !== 1) {
                    const applies = stateDef.intimacyMultiplierDirectionality === "everyone" ? true : activeState.causes?.some(cause => cause.causant?.type === "character" && cause.causant.id === bond.towards);
                    if (applies) {
                        multiplier *= stateDef.intimacyMultiplier;
                    }
                }
            }

            const bondDeclaration = getBondDeclarationFromBondDescription(deObject, character, bond);
            if (bondDeclaration) {
                let alreadyInIntimateAct = false;
                let alreadyInSex = false;
                let negativeInteraction = false;
                let alreadyInAffectionateAct = false;

                /**
                 * @type {DEOpenToIntimacyResponse}
                 */
                const rejectedIntimacyNegative = {
                    value: "not",
                    reason: "A recent negative interaction",
                    bondChangeEngaged: {
                        primary: 0,
                        secondary: 0,
                    },
                };

                const openToAffectionDefault = await bondDeclaration.intimacy.openToAffection(character, deObject.characters[bond.towards]);
                const openToIntimateAffectionDefault = await bondDeclaration.intimacy.openToIntimateAffection(character, deObject.characters[bond.towards]);
                const openToSexDefault = await bondDeclaration.intimacy.openToSex(character, deObject.characters[bond.towards]);

                const openToAffection = rejectIntimacy && openToAffectionDefault.value !== "not" ? rejectedIntimacyNegative : openToAffectionDefault;
                const openToIntimateAffection = rejectIntimacy && openToAffectionDefault.value !== "not" ? rejectedIntimacyNegative : openToIntimateAffectionDefault;
                const openToSex = rejectIntimacy && openToAffectionDefault.value !== "not" ? rejectedIntimacyNegative : openToSexDefault;

                const openToAffectionQuestions = bondDeclaration.intimacy.openToAffectionResponses.filter(r => !r.onlyAtLevel || r.onlyAtLevel.includes(openToAffection.value));
                const openToIntimateAffectionQuestions = bondDeclaration.intimacy.openToIntimateAffectionResponses.filter(r => !r.onlyAtLevel || r.onlyAtLevel.includes(openToIntimateAffection.value));
                const openToSexQuestions = bondDeclaration.intimacy.openToSexResponses.filter(r => !r.onlyAtLevel || r.onlyAtLevel.includes(openToSex.value));

                const allQuestionsToAsk = [...openToAffectionQuestions, ...openToIntimateAffectionQuestions, ...openToSexQuestions];

                const otherFamilyRelation = getFamilyBondRelation(character, deObject.characters[bond.towards]);
                const otherRelationship = await getRelationship(deObject, character, deObject.characters[bond.towards]);

                for (const questionToAsk of allQuestionsToAsk) {
                    const questionText = typeof questionToAsk.question === "string" ? questionToAsk.question : await questionToAsk.question({
                        char: character,
                        other: deObject.characters[bond.towards],
                        otherFamilyRelation,
                        otherRelationship,
                    });
                    if (!smallQuestionsCache[questionText]) {
                        await runQuestion(engine, character, {
                            type: "yes_no",
                            question: questionText,
                            onValue: async (answer) => {
                                smallQuestionsCache[questionText] = answer;
                            },
                        }, {
                            lastCycleMessagesInfo,
                            questioningAgent,
                            initializeAgent,
                        });
                    }

                    if (smallQuestionsCache[questionText]) {
                        const injection = typeof questionToAsk.reaction === "string" ? questionToAsk.reaction : await questionToAsk.reaction({
                            char: character,
                            other: deObject.characters[bond.towards],
                            otherFamilyRelation,
                            otherRelationship,
                        });

                        microInjections.push(injection);

                        if (questionToAsk.voice) {
                            microVoices.push(questionToAsk.voice);
                        }
                    }
                }

                const descriptionExtraForAmount = {
                    "slight": ", slightly means that the character is open but may cast doubts or be hesitant, and may not be fully comfortable with the act, but is willing to engage in it",
                    "moderate": ", moderately means that the character is open and comfortable with the act, and may even enjoy it, but may not be fully committed right away",
                    "very": ", very means that the character is very open and enthusiastic about the act",
                };

                const descriptionForText = {
                    "slight": "slightly",
                    "moderate": "moderately",
                    "very": "very",
                }

                const questionOfSex = "In the last story fragment, has " + characterName + " engaged in sexual activities or sexual acts?";
                const questionOfProposedSex = "In the last story fragment, has " + otherName + " proposed to engage in sexual activities or sexual acts with " + characterName + "?";

                const characterLibido = character.libido || 0;

                let extraSexMessageProposal = "";
                let extraSexMessageEngaged = "";
                if (characterLibido >= 0.9) {
                    extraSexMessageEngaged = ", " + characterName + " has a very high libido, so they are actually very eager and enthusiastic about engaging in sexual activities with " + otherName;
                    extraSexMessageProposal = extraSexMessageEngaged;
                } else {
                    // basically amount of ms ago when they had last sex
                    const timeSinceLastSex = deObject.currentTime.time - (character.state["last_sexual_fullfillment_act"] || 0);
                    const cooldownPeriodHours = (1 - characterLibido) * 48; // from 0 hours at libido 1 to 48 hours at libido 0
                    const timeSinceLastSexHours = timeSinceLastSex / (60 * 60 * 1000);

                    if (timeSinceLastSexHours <= cooldownPeriodHours * 0.25) {
                        extraSexMessageEngaged = ", " + characterName + " has recently fullfilled their sexual activities and is still in a cooldown period, so they are not be fully comfortable";
                        extraSexMessageProposal = ", " + characterName + " has recently fullfilled their sexual activities and is still in a cooldown period, so they may be adamant on engaging in sexual activities";
                    } else if (timeSinceLastSexHours <= cooldownPeriodHours * 0.5) {
                        extraSexMessageEngaged = ", " + characterName + " has recently fullfilled their sexual activities and is still in a cooldown period";
                        extraSexMessageProposal = ", " + characterName + " has recently fullfilled their sexual activities and is more recovered, so they may show little interest in engaging in sexual activities, but they may yield";
                    } else if (timeSinceLastSexHours <= cooldownPeriodHours * 0.75) {
                        extraSexMessageEngaged = ", " + characterName + " has recently fullfilled their sexual activities and is still in a cooldown period";
                        extraSexMessageProposal = ", " + characterName + " has recently fullfilled their sexual activities and is more recovered, so they may not be fully comfortable to engaging in sexual activities, but they may yield";
                    }
                }

                if (!smallQuestionsCache[questionOfSex]) {
                    await runQuestion(engine, character, {
                        type: "yes_no",
                        question: questionOfSex,
                        onValue: async (answer) => {
                            smallQuestionsCache[questionOfSex] = answer;
                        },
                    }, {
                        lastCycleMessagesInfo,
                        questioningAgent,
                        initializeAgent,
                    });
                }

                const engagedInSex = smallQuestionsCache[questionOfSex];

                if (!engagedInSex && !smallQuestionsCache[questionOfProposedSex] && character.speciesType !== "animal") {
                    await runQuestion(engine, character, {
                        type: "yes_no",
                        question: questionOfProposedSex,
                        onValue: async (answer) => {
                            smallQuestionsCache[questionOfProposedSex] = answer;
                        },
                    }, {
                        lastCycleMessagesInfo,
                        questioningAgent,
                        initializeAgent,
                    });
                }

                const proposedToEngageInSex = smallQuestionsCache[questionOfProposedSex];

                if (engagedInSex) {
                    alreadyInIntimateAct = true;
                    alreadyInSex = true;
                    if (openToSex.value === "not") {
                        negativeInteraction = true;
                        microInjections.push(characterName + " is engaging in sexual activities with " + otherName + " but " + characterName + " is not open to sex with them, this might cause serious tension, trauma, or conflict in their interactions");
                    } else {
                        microInjections.push(characterName + " is engaging in sexual activities with " + otherName + " and " + characterName + " is " + descriptionForText[openToSex.value] + " open to sex with them, this might significantly deepen their bond and intimacy" + descriptionExtraForAmount[openToSex.value] + extraSexMessageEngaged);
                        // TODO tell it about its kinks in the way I wrote the message in telegram
                    }

                    character.state["last_sexual_act"] = deObject.currentTime.time;
                } else {
                    if (proposedToEngageInSex) {
                        if (openToSex.value === "not") {
                            negativeInteraction = true;
                            microInjections.push(otherName + " is proposing to engage in sexual activities with " + characterName + " but " + characterName + " is not open to sex with them, this might cause tension or conflict in their interactions");
                        } else {
                            microInjections.push(otherName + " is proposing to engage in sexual activities with " + characterName + " and " + characterName + " is " + descriptionForText[openToSex.value] + " open to sex with them, this might lead to a positive development in their bond and intimacy" + descriptionExtraForAmount[openToSex.value] + extraSexMessageProposal);
                        }
                    }

                    const questionOfIntimateAffection = "In the last story fragment, has " + characterName + " received intimate affection from " + otherName + "? eg. kissing with arousing/sexual intent, making out, intimate actions with romantic/sexual interest, etc.";

                    if (!smallQuestionsCache[questionOfIntimateAffection]) {
                        await runQuestion(engine, character, {
                            type: "yes_no",
                            question: questionOfIntimateAffection,
                            onValue: async (answer) => {
                                smallQuestionsCache[questionOfIntimateAffection] = answer;
                            },
                        }, {
                            lastCycleMessagesInfo,
                            questioningAgent,
                            initializeAgent,
                        });
                    }

                    const questionOfProposedIntimateAffection = "In the last story fragment, has " + characterName + " proposed to receive intimate affection from " + otherName + "? eg. kissing with arousing/sexual intent, making out, intimate actions with romantic/sexual interest, etc.";

                    const receivedIntimateAffection = smallQuestionsCache[questionOfIntimateAffection];

                    if (!receivedIntimateAffection && !smallQuestionsCache[questionOfProposedIntimateAffection] && character.speciesType !== "animal") {
                        await runQuestion(engine, character, {
                            type: "yes_no",
                            question: questionOfProposedIntimateAffection,
                            onValue: async (answer) => {
                                smallQuestionsCache[questionOfProposedIntimateAffection] = answer;
                            }
                        }, {
                            lastCycleMessagesInfo,
                            questioningAgent,
                            initializeAgent,
                        });
                    }

                    const proposedToReceiveIntimateAffection = smallQuestionsCache[questionOfProposedIntimateAffection];

                    if (receivedIntimateAffection) {
                        alreadyInIntimateAct = true;
                        if (openToIntimateAffection.value === "not") {
                            negativeInteraction = true;
                            microInjections.push(characterName + " is receiving intimate affection from " + otherName + " but " + characterName + " is not open to intimate affection from them, this might cause significant tension, discomfort, or conflict in their interactions");
                        } else {
                            microInjections.push(characterName + " is receiving intimate affection from " + otherName + " and " + characterName + " is " + descriptionForText[openToIntimateAffection.value] + " open to intimate affection from them, this might deepen their bond and have a very positive effect on their interactions" + descriptionExtraForAmount[openToIntimateAffection.value]);
                        }

                        character.state["last_intimate_affection_act"] = deObject.currentTime.time;
                    } else {
                        if (proposedToReceiveIntimateAffection) {
                            if (openToIntimateAffection.value === "not") {
                                negativeInteraction = true;
                                microInjections.push(otherName + " is proposing intimate affection with " + characterName + " but " + characterName + " is not open to intimate affection from them, this might cause tension or conflict in their interactions");
                            } else {
                                microInjections.push(otherName + " is proposing intimate affection with " + characterName + " and " + characterName + " is " + descriptionForText[openToIntimateAffection.value] + " open to intimate affection from them, this might lead to a positive development in their bond and intimacy" + descriptionExtraForAmount[openToIntimateAffection.value]);
                            }
                        }

                        const questionOfAffection = "In the last story fragment, has " + characterName + " received affection from " + otherName + "? eg. hugging, caressing, holding hands, affectionate words, etc.";

                        if (!smallQuestionsCache[questionOfAffection]) {
                            await runQuestion(engine, character, {
                                type: "yes_no",
                                question: questionOfAffection,
                                onValue: async (answer) => {
                                    smallQuestionsCache[questionOfAffection] = answer;
                                },
                            }, {
                                lastCycleMessagesInfo,
                                questioningAgent,
                                initializeAgent,
                            });
                        }

                        const receivedAffection = smallQuestionsCache[questionOfAffection];

                        const questionOfProposedAffection = "In the last story fragment, has " + characterName + " proposed to receive affection from " + otherName + "? eg. hugging, caressing, holding hands, affectionate words, etc.";

                        if (!receivedAffection && !smallQuestionsCache[questionOfProposedAffection] && character.speciesType !== "animal") {
                            await runQuestion(engine, character, {
                                type: "yes_no",
                                question: questionOfProposedAffection,
                                onValue: async (answer) => {
                                    smallQuestionsCache[questionOfProposedAffection] = answer;
                                },
                            }, {
                                lastCycleMessagesInfo,
                                questioningAgent,
                                initializeAgent,
                            });
                        }

                        const proposedAffection = smallQuestionsCache[questionOfProposedAffection];

                        if (receivedAffection) {
                            alreadyInAffectionateAct = true;
                            if (openToAffection.value === "not") {
                                negativeInteraction = true;
                                microInjections.push(characterName + " just received affection from " + otherName + " but " + characterName + " is not open to affection from them, this might cause some tension or discomfort in their interactions");
                            } else {
                                microInjections.push(characterName + " just received affection from " + otherName + " and " + characterName + " is " + descriptionForText[openToAffection.value] + " open to affection from them, this might have a positive effect on their interactions" + descriptionExtraForAmount[openToAffection.value]);
                            }

                            character.state["last_affectionate_act"] = deObject.currentTime.time;
                        } else {
                            if (proposedAffection) {
                                if (openToAffection.value === "not") {
                                    negativeInteraction = true;
                                    microInjections.push(otherName + " is proposing affective acts with " + characterName + " but " + characterName + " is not open to affection from them, this might cause some tension or discomfort in their interactions");
                                } else {
                                    microInjections.push(otherName + " is proposing affective acts with " + characterName + " and " + characterName + " is " + descriptionForText[openToAffection.value] + " open to affection from them, this might have a positive effect on their interactions" + descriptionExtraForAmount[openToAffection.value]);
                                }
                            }
                        }
                    }
                }

                if (!negativeInteraction) {
                    await runIntimacyActions({
                        ...context, bond, bondDeclaration, otherName, otherFamilyRelation, otherRelationship,
                        multiplier, alreadyInAffectionateAct, alreadyInIntimateAct, alreadyInSex,
                    });
                } else {
                    delete character.state["last_is_waiting_for_affection_consent_response_from_" + bond.towards];
                }
            }
        }
    }
}
