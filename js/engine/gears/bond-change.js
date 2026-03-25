/**
 * Gear that calculates state changes for a character based on recent interactions.
 */

import { DEngine } from "../index.js";

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
 */
export default async function calculateBondsChangesDueToMessages(engine, character) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    } else if (!engine.inferenceAdapter) {
        throw new Error("Inference adapter not initialized");
    } else if (!character.bonds) {
        throw new Error(`Character ${character.name} has no bonds defined.`);
    }

    // TODO strangerBreakawayBondWeightAbsolute is basically what this should do

    await updateAllStrangerBonds(engine, character);
    await engine.informDEObjectUpdated();

    engine.informCycleState("info", `Finished updating bonds from ${character.name} towards other characters.`);
}