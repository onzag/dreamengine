/**
 * Gear that calculates state changes for a character based on recent interactions.
 */

import { DEngine } from "../index.js";
import { getBondDeclarationFromBondDescription, getInternalDescriptionOfCharacter } from "../util/character-info.js";
import { isYes, yesNoGrammar } from "../util/grammar.js";
import { getHistoryFragmentForCharacter } from "../util/messages.js";

/**
 * 
 * @param {DEngine} engine 
 * @param {DECompleteCharacterReference} character 
 */
async function updateAllStrangerBonds(engine, character) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    if (!character.bonds) {
        throw new Error(`Character ${character.name} has no bonds defined.`);
    }
    const strangerBonds = engine.deObject.social.bonds[character.name].active.filter(bond => bond.stranger);

    for (const bond of strangerBonds) {
        const timeSinceCreatedMilliseconds = engine.deObject.currentTime.time - bond.createdAt.time;
        const timeSinceCreatedMinutes = timeSinceCreatedMilliseconds / (1000 * 60);

        // TODO I think I was going for forgetting/weakening of stranger bonds
        if (timeSinceCreatedMinutes >= character.bonds.strangerBreakawayTimeMinutes) {
            // now we can check if the actual interaction time between the characters is more than those minutes, for that we would look at conversation history
            // between the two characters
            const otherCharacterName = bond.towards;

        }
    }
}

/**
 * @param {DEngine} engine
 * @param {DECompleteCharacterReference} character 
 */
export default async function calculateBondsChangesDueToMessages(engine, character) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    } else if (!engine.inferenceAdapter) {
        throw new Error("Inference adapter not initialized");
    } else if (!character.bonds) {
        throw new Error(`Character ${character.name} has no bonds defined.`);
    }

    const yesNoGrammarObject = yesNoGrammar(engine);

    // first we need to update the bonds towards the character, for that we need to get a whole extended cycle
    // gather all the other characters that talked inbetween, and update bonds for each
    const lastCycle = await getHistoryFragmentForCharacter(engine, character, {
        msgLimit: "LAST_CYCLE",
        includeDebugMessages: false,
        includeRejectedMessages: false,
    });

    /**
     * @type {Set<string>} all characters that talked to the character in the last cycle, and that we need to update bonds towards
     */
    const allCharactersToUpdateBondsTowards = new Set();
    lastCycle.mentionedCharacters.forEach(charName => {
        if (charName !== character.name) {
            allCharactersToUpdateBondsTowards.add(charName);
        }
    });

    // well that is weird, they talk and talked again themselves?
    if (allCharactersToUpdateBondsTowards.size === 0) {
        engine.informCycleState("info", `No messages from other characters to update ${character.name} bonds`);
        return;
    } else {
        engine.informCycleState("info", `Updating bonds for ${character.name} towards: ${Array.from(allCharactersToUpdateBondsTowards).join(", ")}`);
    }

    const thisCharacterDescription = (await getInternalDescriptionOfCharacter(engine, character.name)).general;
    const thisCharacterDescriptionConverted = engine.inferenceAdapter.buildSystemCharacterDescription(
        character,
        thisCharacterDescription,
        null,
        [],
        [],
        null,
        null,
    );

    for (const characterNameToGetBondTowards of allCharactersToUpdateBondsTowards) {
        engine.informCycleState("info", `Updating bonds for ${character.name} towards ${characterNameToGetBondTowards}`);
        const characterStateToUpdate = engine.deObject.stateFor[characterNameToGetBondTowards];
        if (characterStateToUpdate.deadEnded) {
            engine.informCycleState("info", `Character ${characterNameToGetBondTowards} is dead-ended, skipping bond updates, sending them to ex`);
            const currentBondExists = engine.deObject.social.bonds[character.name].active.find(bond => bond.towards === characterNameToGetBondTowards);
            if (currentBondExists) {
                engine.deObject.social.bonds[character.name].active = engine.deObject.social.bonds[character.name].active.filter(bond => bond.towards !== characterNameToGetBondTowards);
                engine.deObject.social.bonds[character.name].ex.push(currentBondExists);
                await engine.informDEObjectUpdated();
            }
            continue;
        }
        let currentBond = engine.deObject.social.bonds[character.name].active.find(bond => bond.towards === characterNameToGetBondTowards);
        if (!currentBond) {
            engine.informCycleState("info", `Character ${character.name} has no bond towards ${characterNameToGetBondTowards}, creating a stranger bond`);
            currentBond = {
                towards: characterNameToGetBondTowards,
                bond: 0,
                bond2: 0,
                stranger: true,
                knowsName: false,
                createdAt: { ...engine.deObject.currentTime },
            };
            engine.deObject.social.bonds[character.name].active.push(currentBond);
            await engine.informDEObjectUpdated();
        }

        const currentBondDescription = getBondDeclarationFromBondDescription(character, currentBond);
        if (!currentBondDescription) {
            // must be the user or some oddball character that cannot develop bonds
            if (character.name !== engine.userCharacter?.name) {
                // give an error if it's not the user, otherwise just ignore it as the user bonds are not managed
                // since those are managed by the user themselves and not by the engine, so it would be normal to not have a bond declaration for the user character
                engine.informCycleState("error", `Bond declaration not found for bond: stranger ${currentBond.stranger}, bond ${currentBond.bond}, bond2 ${currentBond.bond2}, for character ${character.name}, towards ${characterNameToGetBondTowards}`);
            }
        } else {
            const systemPrompt = `You are an assistant and social dynamics analyst that helps analyze interactions between ${character.name} and ${characterNameToGetBondTowards}`;
            const systemPromptBuilt = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(
                systemPrompt,
                [
                    "You must answer with either 'yes' or 'No' depending on the question asked",
                ],
                [
                    thisCharacterDescriptionConverted,
                    // Do not think we need the description of the other, since this is unknowable by the character
                    // engine.inferenceAdapter.buildSystemCharacterDescription(
                    //     engine.deObject.characters[characterNameToGetBondTowards],
                    //     (await getInternalDescriptionOfCharacter(engine, characterNameToGetBondTowards)).general,
                    //     null,
                    //     [],
                    //     [],
                    //     null,
                    //     null,
                    // ),
                ]
            );

            const questioningAgent = engine.inferenceAdapter.runQuestioningCustomAgentOn("bonds-change", systemPromptBuilt, null, lastCycle.messages, null);
            let isQuestioningAgentInitialized = false;

            if (!currentBond.knowsName) {
                if (!isQuestioningAgentInitialized) {
                    // initialize the questioning agent
                    const generatedResult = await questioningAgent.next();
                    if (generatedResult.done) {
                        throw new Error(`Questioning agent terminated unexpectedly while processing bond condition for bond from ${character.name} towards ${characterNameToGetBondTowards} on question about knowing the name`);
                    }
                    isQuestioningAgentInitialized = true;
                }
                const question = `In the story provided, has ${character.name} been made aware of ${characterNameToGetBondTowards}'s name? If it is explicitly stated or very heavily implied that they have learned the name, answer yes, otherwise answer no.`;
                console.log("Asking question: " + question)
                const questioningAgentResult = await questioningAgent.next({
                    maxCharacters: 100,
                    maxParagraphs: 1,
                    nextQuestion: question,
                    stopAfter: yesNoGrammarObject.stopAfter,
                    stopAt: [],
                    grammar: yesNoGrammarObject.grammar,
                    maxSafetyCharacters: 0,
                });
                if (questioningAgentResult.done) {
                    throw new Error(`Questioning agent terminated unexpectedly while processing bond condition for bond from ${character.name} towards ${characterNameToGetBondTowards} on question about knowing the name`);
                }
                const trimmed = questioningAgentResult.value.trim();

                console.log("Received answer: " + trimmed);
                const answer = isYes(trimmed);
                if (answer) {
                    console.log(`Updating bond for ${character.name} towards ${characterNameToGetBondTowards} to know the name based on question about knowing the name, answer was yes`);
                    currentBond.knowsName = true;
                    await engine.informDEObjectUpdated();
                } else {
                    console.log(`Not updating bond for ${character.name} towards ${characterNameToGetBondTowards} to know the name based on question about knowing the name, answer was no`);
                }
            }

            // now we can process the messages to update the bond
            for (const condition of currentBondDescription.bondConditions) {
                const conditionMultiplier = (currentBond.stranger ? (condition.weight < 0 ? character.bonds.strangerNegativeMultiplier : character.bonds.strangerPositiveMultiplier) : (condition.weight < 0 ? character.bonds.bondChangeNegativityBias : character.bonds.bondChangeFineTune));
                const conditionYesValue = condition.weight * conditionMultiplier;

                // let's check if it will be pointless to ask, eg maxed out bond or zeroed or so forth
                let wouldModifyPrimaryBond = false;
                if (condition.affectsBonds === "primary" || condition.affectsBonds === "both") {
                    if (currentBond.bond < 100 && conditionYesValue > 0) {
                        wouldModifyPrimaryBond = true;
                    } else if (currentBond.bond > -100 && conditionYesValue < 0) {
                        wouldModifyPrimaryBond = true;
                    }
                }
                let wouldModifySecondaryBond = false;
                if (condition.affectsBonds === "secondary" || condition.affectsBonds === "both") {
                    if (currentBond.bond2 < 100 && conditionYesValue > 0) {
                        wouldModifySecondaryBond = true;
                    } else if (currentBond.bond2 > 0 && conditionYesValue < 0) {
                        wouldModifySecondaryBond = true;
                    }
                }

                // asking this would be pointless as it would not change anything, so we skip it and save the questioning agent usage for other conditions that might actually change the bond
                if (!wouldModifyPrimaryBond && !wouldModifySecondaryBond) {
                    engine.informCycleState("info", `Bond condition with template ${JSON.stringify(condition.template)} for bond from ${character.name} towards ${characterNameToGetBondTowards} would not modify any bond, skipping`);
                    continue;
                }

                const result = typeof condition.template === "string" ? condition.template :
                    (await condition.template(engine.deObject, {
                        char: character,
                        other: engine.deObject.characters[characterNameToGetBondTowards],
                        // TODO bond relationship
                    })).trim();
                if (result === "yes" || result === "Yes" || result === "YES") {
                    console.log(`Bond condition is a statement which matched for bond from ${character.name} towards ${characterNameToGetBondTowards}, applying bond changes: bond ${conditionYesValue}, on ${condition.affectsBonds}`);
                    if (condition.affectsBonds === "primary" || condition.affectsBonds === "both") {
                        currentBond.bond += conditionYesValue;
                        if (currentBond.bond < 0) {
                            currentBond.bond = 0;
                        } else if (currentBond.bond > 100) {
                            currentBond.bond = 100;
                        }
                    }
                    if (condition.affectsBonds === "secondary" || condition.affectsBonds === "both") {
                        currentBond.bond2 += conditionYesValue;
                        if (currentBond.bond2 < 0) {
                            currentBond.bond2 = 0;
                        } else if (currentBond.bond2 > 100) {
                            currentBond.bond2 = 100;
                        }
                    }
                    await engine.informDEObjectUpdated();
                } else if (result.endsWith("?")) {
                    console.log(`Bond condition is a question ${JSON.stringify(result)}, requesting inference`);
                    if (!isQuestioningAgentInitialized) {
                        // initialize the questioning agent
                        const generatedResult = await questioningAgent.next();
                        if (generatedResult.done) {
                            throw new Error(`Questioning agent terminated unexpectedly while processing bond condition for bond from ${character.name} towards ${characterNameToGetBondTowards}`);
                        }
                        isQuestioningAgentInitialized = true;
                    }

                    console.log("Asking question: " + result)

                    const questioningAgentResult = await questioningAgent.next({
                        maxCharacters: 100,
                        maxParagraphs: 1,
                        nextQuestion: result,
                        stopAfter: yesNoGrammarObject.stopAfter,
                        stopAt: [],
                        grammar: yesNoGrammarObject.grammar,
                        maxSafetyCharacters: 0,
                    });

                    if (questioningAgentResult.done) {
                        throw new Error(`Questioning agent terminated unexpectedly while processing bond condition for bond from ${character.name} towards ${characterNameToGetBondTowards}`);
                    }

                    const trimmed = questioningAgentResult.value.trim();

                    console.log("Received answer: " + trimmed);

                    const answer = isYes(trimmed);

                    if (answer) {
                        console.log(`Bond condition matched for bond from ${character.name} towards ${characterNameToGetBondTowards} via questioning agent on question ${JSON.stringify(result)}, applying bond changes: bond ${conditionYesValue}, on ${condition.affectsBonds}`);
                        if (condition.affectsBonds === "primary" || condition.affectsBonds === "both") {
                            currentBond.bond += conditionYesValue;
                            if (currentBond.bond < 0) {
                                currentBond.bond = 0;
                            }
                            else if (currentBond.bond > 100) {
                                currentBond.bond = 100;
                            }
                        }
                        if (condition.affectsBonds === "secondary" || condition.affectsBonds === "both") {
                            currentBond.bond2 += conditionYesValue;
                            if (currentBond.bond2 < 0) {
                                currentBond.bond2 = 0;
                            }
                            else if (currentBond.bond2 > 100) {
                                currentBond.bond2 = 100;
                            }
                        }
                        await engine.informDEObjectUpdated();
                    }
                }
            }

            if (isQuestioningAgentInitialized) {
                // finish the questioning agent
                await questioningAgent.next(null);
            }
        }
    }

    await updateAllStrangerBonds(engine, character);

    engine.informCycleState("info", `Finished updating bonds from ${character.name} towards other characters.`);
}