/**
 * Gear that calculates state changes for a character based on recent interactions.
 */

import { DEngine } from "..";

/**
 * 
 * @param {DEngine} engine 
 * @param {DECompleteCharacterReference} character 
 */
async function updateAllStrangerBonds(engine, character) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    const strangerBonds = engine.deObject.social.bonds[character.name].active.filter(bond => bond.stranger);

    for (const bond of strangerBonds) {
        const timeSinceCreatedMilliseconds = engine.deObject.currentTime.time - bond.createdAt.time;
        const timeSinceCreatedMinutes = timeSinceCreatedMilliseconds / (1000 * 60);

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
    }

    await updateAllStrangerBonds(engine, character);

    // first we need to update the bonds towards the character, for that we need to get a whole extended cycle
    // gather all the other characters that talked inbetween, and update bonds for each
    const historyGenerator = engine.getHistoryForCharacter(character, {});

    /**
     * @type {Array<{name: string, message: string}>}
     */
    let messagesToAdd = [];

    let generator = await historyGenerator.next(true);
    while (!generator.done) {
        if (!generator.value.debug && !generator.value.rejected) {
            const shouldStopAddingMessages = generator.value.name === character.name;

            messagesToAdd.push({
                name: generator.value.name,
                message: generator.value.message,
            });

            if (shouldStopAddingMessages) {
                await historyGenerator.return();
                break;
            }
        }
        generator = await historyGenerator.next(true);
    }

    messagesToAdd = messagesToAdd.reverse();

    const allCharactersToUpdateBondsTowards = new Set();
    messagesToAdd.forEach(msg => {
        allCharactersToUpdateBondsTowards.add(msg.name);
    });

    // well that is weird, they talk and talked again themselves?
    if (allCharactersToUpdateBondsTowards.size === 0) {
        engine.informCycleState("info", `No messages from other characters to update bonds towards ${character.name}`);
        return;
    }

    for (const characterNameToUpdate of allCharactersToUpdateBondsTowards) {
        engine.informCycleState("info", `Updating bonds from ${character.name} towards ${characterNameToUpdate}`);
        const characterState = engine.deObject.stateFor[characterNameToUpdate];
        if (characterState.deadEnded) {
            engine.informCycleState("info", `Character ${characterNameToUpdate} is dead-ended, skipping bond updates, sending them to ex`);
            const currentBondExists = engine.deObject.social.bonds[character.name].active.find(bond => bond.towards === characterNameToUpdate);
            if (currentBondExists) {
                engine.deObject.social.bonds[character.name].active = engine.deObject.social.bonds[character.name].active.filter(bond => bond.towards !== characterNameToUpdate);
                engine.deObject.social.bonds[character.name].ex.push(currentBondExists);
                await engine.informDEObjectUpdated();
            }
            continue;
        }
        let currentBond = engine.deObject.social.bonds[character.name].active.find(bond => bond.towards === characterNameToUpdate);
        if (!currentBond) {
            engine.informCycleState("info", `Character ${character.name} has no bond towards ${characterNameToUpdate}, creating a stranger bond`);
            currentBond = {
                towards: characterNameToUpdate,
                bond: 0,
                bond2: 0,
                stranger: true,
                createdAt: {...engine.deObject.currentTime},
            };
            engine.deObject.social.bonds[character.name].active.push(currentBond);
            await engine.informDEObjectUpdated();
        }
        const currentBondDescription = engine.getBondDeclarationFromBondDescription(character, currentBond);
        if (!currentBondDescription) {
            throw new Error(`Panic: No bond declaration found for bond from ${character.name} towards ${characterNameToUpdate} with bond levels ${currentBond.bond}, ${currentBond.bond2}`);
        }

        const systemPrompt = `You are an assistant and social dynamics analyst that helps analyze interactions between ${character.name} and ${characterNameToUpdate}`;
        const systemPromptBuilt = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(
            systemPrompt,
            [
                "You must answer with either 'yes' or 'No' depending on the question asked",
            ],
            // we will add a very basic description of the character in case to give some context
            engine.inferenceAdapter.buildSystemCharacterDescription(
                character,
                // @ts-ignore
                (await character.general.execute(engine.deObject, character, undefined, undefined, undefined, undefined)).trim(),
                null,
                [],
                [],
                null,
                null,
            ),
        );

        const questioningAgent = engine.inferenceAdapter.runQuestioningCustomAgentOn(character, systemPromptBuilt, null, messagesToAdd, "ALL", null);
        let isQuestioningAgentInitialized = false;

        // now we can process the messages to update the bond
        for (const condition of currentBondDescription.bondConditions) {
            const conditionMultiplier = (currentBond.stranger ? (condition.weight < 0 ? character.bonds.strangerNegativeMultiplier : character.bonds.strangerPositiveMultiplier) : (condition.weight < 0 ? character.bonds.bondChangeNegativityBias : character.bonds.bondChangeFineTune));
            // @ts-ignore
            const result = (await condition.template.execute(engine.deObject, character, engine.deObject.characters[characterNameToUpdate], undefined, undefined, undefined)).trim();
            if (result === "yes" || result === "Yes") {
                console.log(`Bond condition is a statement which matched for bond from ${character.name} towards ${characterNameToUpdate}, applying bond changes: bond ${condition.weight}, on ${condition.affectsBonds}`);
                if (condition.affectsBonds === "primary" || condition.affectsBonds === "both") {
                    currentBond.bond += condition.weight * conditionMultiplier;
                    if (currentBond.bond < 0) {
                        currentBond.bond = 0;
                    } else if (currentBond.bond > 100) {
                        currentBond.bond = 100;
                    }
                }
                if (condition.affectsBonds === "secondary" || condition.affectsBonds === "both") {
                    currentBond.bond2 += condition.weight * conditionMultiplier;
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
                        throw new Error(`Questioning agent terminated unexpectedly while processing bond condition for bond from ${character.name} towards ${characterNameToUpdate}`);
                    }
                    isQuestioningAgentInitialized = true;
                }

                const questioningAgentResult = await questioningAgent.next({
                    maxCharacters: 100,
                    maxParagraphs: 1,
                    nextQuestion: result,
                    stopAfter: ["yes", "no"],
                    stopAt: [],
                    grammar: `root ::= ("yes" | "no") .*`,
                });

                if (questioningAgentResult.done) {
                    throw new Error(`Questioning agent terminated unexpectedly while processing bond condition for bond from ${character.name} towards ${characterNameToUpdate}`);
                }

                const answer = questioningAgentResult.value.trim().includes("yes");

                if (answer) {
                    console.log(`Bond condition matched for bond from ${character.name} towards ${characterNameToUpdate} via questioning agent on question ${JSON.stringify(result)}, applying bond changes: bond ${condition.weight}, on ${condition.affectsBonds}`);
                    if (condition.affectsBonds === "primary" || condition.affectsBonds === "both") {
                        currentBond.bond += condition.weight * conditionMultiplier;
                        if (currentBond.bond < 0) {
                            currentBond.bond = 0;
                        }
                        else if (currentBond.bond > 100) {
                            currentBond.bond = 100;
                        }
                    }
                    if (condition.affectsBonds === "secondary" || condition.affectsBonds === "both") {
                        currentBond.bond2 += condition.weight * conditionMultiplier;
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

    await updateAllStrangerBonds(engine, character);

    engine.informCycleState("info", `Finished updating bonds from ${character.name} towards other characters.`);
}