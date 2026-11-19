/**
 * Gear that calculates state changes for a character based on recent interactions.
 */

import { debug } from "../debug.js";
import { DEngine } from "../index.js";
import { getFamilyBondRelation, getRelationship } from "../util/character-info.js";
import { yesNoGrammar } from "../util/grammar.js";
import { convertMessagesToSimpleList, getHistoryFragment } from "../util/messages.js";

/**
 * 
 * @param {DEngine} engine 
 * @param {DECompleteCharacterReference} character 
 * @param {string[]} conversingCharacters
 * @param {string | null} lastPerspectiveId
 * @returns {Promise<void>}
 */
async function updateAllStrangerBonds(engine, character, conversingCharacters, lastPerspectiveId) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    if (!character.bonds) {
        throw new Error(`Character ${character.name} has no bonds defined.`);
    }

    if (!lastPerspectiveId) {
        // cannot find the perspective, so we cannot check for stranger bonds
        console.warn(`No last perspective ID provided for character ${character.name}, skipping stranger bond updates.`);
        return;
    }

    const perspectiveOfCharacter = await engine.deObject.database.getPerspectiveById(lastPerspectiveId);

    if (!perspectiveOfCharacter) {
        // cannot find the perspective, so we cannot check for stranger bonds
        console.warn(`Perspective with ID ${lastPerspectiveId} not found for character ${character.name}, skipping stranger bond updates.`);
        return;
    }

    const allBondsExisting = engine.deObject.bonds[character.id].active.map(bond => bond.towards)
        .concat(engine.deObject.bonds[character.id].ex.map(bond => bond.towards));

    const forgottenBonds = allBondsExisting.filter(bondCharacterId =>
        !conversingCharacters.includes(bondCharacterId) &&
        !perspectiveOfCharacter.rememberedCharacters.find(c => c.characterId === bondCharacterId) &&
        !perspectiveOfCharacter.perspectiveCharacters.find(c => c.characterId === bondCharacterId && c.perceptionForm !== "invisible")
    );

    engine.deObject.bonds[character.id].active = engine.deObject.bonds[character.id].active.filter(b => forgottenBonds.indexOf(b.towards) === -1);
    engine.deObject.bonds[character.id].ex = engine.deObject.bonds[character.id].ex.filter(b => forgottenBonds.indexOf(b.towards) === -1);

    const strangerBonds = engine.deObject.bonds[character.id].active.filter(bond => bond.stranger);

    for (const bond of strangerBonds) {
        if (character.bonds.strangerBreakawayBondWeightAbsolute) {
            if (Math.abs(bond.bond) > Math.abs(character.bonds.strangerBreakawayBondWeightAbsolute)) {
                console.log(`Removing stranger bond from ${character.name} towards ${bond.towards} because the bond weight ${bond.bond} is above the absolute breakaway threshold ${character.bonds.strangerBreakawayBondWeightAbsolute}.`);
                bond.stranger = false;
                continue;
            }
        }

        const characterInPerspectiveOrMemory = perspectiveOfCharacter.perspectiveCharacters.find(c => c.characterId === bond.towards) ||
            perspectiveOfCharacter.rememberedCharacters.find(c => c.characterId === bond.towards);

        if (characterInPerspectiveOrMemory && characterInPerspectiveOrMemory.timeSpentTogetherTotal.inMinutes > character.bonds.strangerBreakawayTimeMinutes) {
            console.log(`Removing stranger bond from ${character.name} towards ${bond.towards} because the time spent together ${characterInPerspectiveOrMemory.timeSpentTogetherTotal.inMinutes} minutes exceeds the breakaway threshold ${character.bonds.strangerBreakawayTimeMinutes} minutes.`);
            bond.stranger = false;
        }
    }
}

/**
 * @param {DEngine} engine
 * @param {DECompleteCharacterReference} character
 */
export default async function calculateBondsChange(engine, character) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    } else if (!engine.inferenceAdapter) {
        throw new Error("Inference adapter not initialized");
    } else if (!character.bonds) {
        throw new Error(`Character ${character.name} has no bonds defined.`);
    }

    if (!debug.ENABLED_BOND_CHANGE) {
        return;
    }

    const allUnprocessedMessages = (await getHistoryFragment(engine, character, {
        includeRejectedMessages: false,
        msgLimit: "ALL_UNPROCESSED_MESSAGES_UNTIL_FIRST_PROCESSED_MESSAGE",
        perspective: "character",
    }));

    const deObject = engine.getDEObject();

    const systemPrompt = `You are an assistant and social dynamics analyst that helps analyze interactions involving ${deObject.utils.templates.formatCharacterName(character)}.`;
    const questioningAgent = engine.inferenceAdapter.runQuestioningCustomAgentOn(
        "questions-run",
        {
            system: engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(systemPrompt, [
                "The character might have been referred as its id " + JSON.stringify(character.id) + " in the story to analyze, as the id part of an <id:name> identifier, if the id is the same, the character is the same, make sure to check for that as well.",
            ], null),
            contextInfoBefore: null,
            messages: convertMessagesToSimpleList(allUnprocessedMessages.messages),
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
        if (ready.done) {
            throw new Error("Questioning agent finished unexpectedly while priming.");
        }
    };

    const yesNoGrammarObject = yesNoGrammar(engine);

    for (const interactedCharacterId of allUnprocessedMessages.mentionedCharacters) {
        const bond = engine.deObject.bonds[character.id].active.find(b => b.towards === interactedCharacterId);
        if (bond) {
            const otherCharacter = engine.deObject.characters[interactedCharacterId];
            if (Object.keys(bond.undoableShifts).length > 0) {
                for (const shiftId in bond.undoableShifts) {
                    const question = bond.undoableShifts[shiftId].undoQuestion;

                    if (bond.undoableShifts[shiftId].undoQuestionRequiresPrescenceOfOtherCharacter) {
                        if (allUnprocessedMessages.conversingCharacters.indexOf(interactedCharacterId) === -1) {
                            console.log(`Bond shift with id ${shiftId} for bond from ${character.name} towards ${otherCharacter.name} requires presence of ${otherCharacter.name} in the conversation, but they are not present, skipping.`);
                            continue;
                        }
                    }

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
                        newSession: true,
                    });

                    if (followUp.done) {
                        throw new Error("Questioning agent finished unexpectedly while asking a follow up question about a bond undo.");
                    }

                    const followUpAnswer = followUp.value.text.trim().toLowerCase();
                    if (followUpAnswer === "yes") {
                        console.log("Undoing the bond shift for " + interactedCharacterId + " with the id " + shiftId + " based on the follow up question.");
                        deObject.utils.bonds.shiftBond(character, otherCharacter, -toRecoverAmountBond, -toRecoverAmountBond2);
                    }
                }
            }
        }
    }

    if (primed) {
        // end the generator
        await questioningAgent.next(null);
    }

    for (const interactedCharacterName of allUnprocessedMessages.conversingCharacters) {
        const bond = engine.deObject.bonds[character.id].active.find(b => b.towards === interactedCharacterName);
        if (bond) {
            const otherCharacter = engine.deObject.characters[interactedCharacterName];
            if (!deObject.utils.bonds.hasBondBeenShiftedThisCycle(character, otherCharacter)) {
                // neutral shift
                const maxBondShift = (character.bonds.bondGraduation.goodFriend - character.bonds.bondGraduation.friend) / 2;
                const minBondShift = (character.bonds.bondGraduation.unfriendly - character.bonds.bondGraduation.unpleasant) / 2;

                const neutralChange = character.bonds.neutralInteractionBondChange;
                // Match shiftBond's multiplier so the limits apply to the effective change.
                const multiplier = bond.stranger
                    ? (neutralChange < 0 ? character.bonds.strangerNegativeMultiplier : character.bonds.strangerPositiveMultiplier)
                    : (neutralChange < 0 ? character.bonds.bondChangeNegativityBias : character.bonds.bondChangeFineTune);
                let bondChange = neutralChange * multiplier;

                // Neutral interactions stop at the boundary without pulling existing bonds back into range.
                if (bondChange > 0) {
                    bondChange = Math.max(0, Math.min(bondChange, maxBondShift - bond.bond));
                } else if (bondChange < 0) {
                    bondChange = Math.min(0, Math.max(bondChange, minBondShift - bond.bond));
                }

                if (bondChange !== 0) {
                    deObject.utils.bonds.shiftBond(character, otherCharacter, bondChange / multiplier, 0);
                }
            }
        }
    }

    await updateAllStrangerBonds(engine, character, allUnprocessedMessages.conversingCharacters, allUnprocessedMessages.lastPerspectiveId);
    await engine.informDEObjectUpdated();

    engine.inform("info", `Finished updating bonds from ${character.name} towards other characters.`);
}
