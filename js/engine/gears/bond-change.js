/**
 * Gear that calculates state changes for a character based on recent interactions.
 */

import { DEngine } from "../index.js";
import { getFamilyBondRelation, getRelationship } from "../util/character-info.js";
import { yesNoGrammar } from "../util/grammar.js";
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
    const strangerBonds = engine.deObject.bonds[character.name].active.filter(bond => bond.stranger);

    for (const bond of strangerBonds) {
        const timeSinceCreatedMilliseconds = engine.deObject.currentTime.time - bond.createdAt.time;
        const timeSinceCreatedMinutes = timeSinceCreatedMilliseconds / (1000 * 60);

        // TODO I think I was going for forgetting/weakening of stranger bonds
        if (timeSinceCreatedMinutes >= character.bonds.strangerBreakawayTimeMinutes) {
            // now we can check if the actual interaction time between the characters is more than those minutes, for that we would look at conversation history
            // between the two characters
            const otherCharacterName = bond.towards;
            // TODO the bond must never be deleted, just zeroed and strangered
        }
    }
}

/**
 * @param {DEngine} engine
 * @param {DECompleteCharacterReference} character 
 * @param {string[]} interactedCharactersAccordingToItemChange
 */
export default async function calculateBondsChangesDueToMessages(engine, character, interactedCharactersAccordingToItemChange) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    } else if (!engine.inferenceAdapter) {
        throw new Error("Inference adapter not initialized");
    } else if (!character.bonds) {
        throw new Error(`Character ${character.name} has no bonds defined.`);
    }

    const lastCycleExpanded = (await getHistoryFragmentForCharacter(engine, character, {
        includeDebugMessages: false,
        includeRejectedMessages: false,
        msgLimit: "LAST_CYCLE_EXPANDED",
    }));

    const deObject = engine.getDEObject();

    const systemPrompt = `You are an assistant and social dynamics analyst that helps analyze interactions involving ${character.name}`;
    const questioningAgent = engine.inferenceAdapter.runQuestioningCustomAgentOn(
        "questions-run",
        {
            system: engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(systemPrompt, [], null),
            contextInfoBefore: null,
            messages: lastCycleExpanded.messages,
            contextInfoAfter: null,
        },
    );

    let primed = false;
    const prime = async () => {
        if (primed) {
            return;
        }
        primed = true;
        const ready = await questioningAgent.next();
        if (ready.value !== "ready") {
            throw new Error("Questioning agent could not be started properly.");
        }
    }

    const yesNoGrammarObject = yesNoGrammar(engine);

    for (const interactedCharacterName of interactedCharactersAccordingToItemChange) {
        const bond = engine.deObject.bonds[character.name].active.find(b => b.towards === interactedCharacterName);
        if (bond) {
            const otherCharacter = engine.deObject.characters[interactedCharacterName];
            if (Object.keys(bond.undoableShifts).length > 0) {
                for (const shiftId in bond.undoableShifts) {
                    const question = bond.undoableShifts[shiftId].undoQuestion;

                    if (!question) {
                        console.log(`Bond shift with id ${shiftId} for bond from ${character.name} towards ${otherCharacter.name} has no undo question defined, skipping.`);
                        continue;
                    }

                    const toRecoverAmountBond = bond.undoableShifts[shiftId].amountBond * bond.undoableShifts[shiftId].recoveryRate;
                    const toRecoverAmountBond2 = bond.undoableShifts[shiftId].amountBond2 * bond.undoableShifts[shiftId].recoveryRate;

                    await prime();

                    const followUp = await questioningAgent.next({
                        maxCharacters: 0,
                        maxSafetyCharacters: 10,
                        grammar: yesNoGrammarObject.grammar,
                        stopAfter: yesNoGrammarObject.stopAfter,
                        maxParagraphs: 1,
                        nextQuestion: question,
                        stopAt: [],
                        instructions: "Answer with 'yes' or 'no'",
                    });

                    if (followUp.done) {
                        throw new Error("Questioning agent finished unexpectedly while asking a follow up question about a bond undo.");
                    }

                    const followUpAnswer = followUp.value.trim().toLowerCase();
                    if (followUpAnswer === "yes") {
                        console.log("Undoing the bond shift for " + interactedCharacterName + " with the id " + shiftId + " based on the follow up question.");
                        deObject.utils.shiftBond(deObject, character, otherCharacter, -toRecoverAmountBond, -toRecoverAmountBond2);
                    }
                }
            }
        }
    }

    if (primed) {
        // end the generator
        await questioningAgent.next(null);
    }

    for (const interactedCharacterName of lastCycleExpanded.conversingCharacters) {
        const bond = engine.deObject.bonds[character.name].active.find(b => b.towards === interactedCharacterName);
        if (bond) {
            const otherCharacter = engine.deObject.characters[interactedCharacterName];
            if (!deObject.utils.hasBondBeenShiftedThisCycle(deObject, character, otherCharacter)) {
                // neutral shift
                const maxBondShift = (character.bonds.bondGraduation.goodFriend - character.bonds.bondGraduation.friend) / 2;
                const minBondShift = (character.bonds.bondGraduation.unfriendly - character.bonds.bondGraduation.antagonistic) / 2;

                let bondChange = character.bonds.neutralInteractionBondChange * (character.bonds.bondChangeFineTune);
                if (bondChange < 0) {
                    bondChange *= character.bonds.bondChangeNegativityBias;
                    if (bond.stranger) {
                        bondChange *= character.bonds.strangerNegativeMultiplier;
                    }
                } else {
                    if (bond.stranger) {
                        bondChange *= character.bonds.strangerPositiveMultiplier;
                    }
                }

                const currentBondValue = bond.bond;
                const finalExpectedBondValue = bond.bond + bondChange;

                if (finalExpectedBondValue > maxBondShift) {
                    // recalculate the bond shift so it maxes at the max bond shift
                    bondChange = maxBondShift - currentBondValue;
                } else if (finalExpectedBondValue < minBondShift) {
                    // recalculate the bond shift so it maxes at the min bond shift
                    bondChange = minBondShift - currentBondValue;
                }

                if (bondChange !== 0) {
                    deObject.utils.shiftBond(deObject, character, otherCharacter, bondChange, 0);
                }
            }
        }
    }

    // TODO strangerBreakawayBondWeightAbsolute is basically what this should do

    await updateAllStrangerBonds(engine, character);
    await engine.informDEObjectUpdated();

    engine.informCycleState("info", `Finished updating bonds from ${character.name} towards other characters.`);
}