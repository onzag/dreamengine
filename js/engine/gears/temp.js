/** @typedef {import("../index.js").DEngine} DEngine */

/**
 * Clear temporary state after triggers and their dependent gears have finished.
 * @param {DEngine} engine
 */
export default async function deleteTemp(engine) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }

    engine.deObject.world.temp = {};

    for (const locationId in engine.deObject.world.locations) {
        const location = engine.deObject.world.locations[locationId];
        location.temp = {};

        for (const slotId in location.slots) {
            const slot = location.slots[slotId];
            slot.temp = {};
        }
    }

    for (const connectionName in engine.deObject.world.connections) {
        const connection = engine.deObject.world.connections[connectionName];
        connection.temp = {};
    }

    for (const characterName in engine.deObject.characters) {
        const character = engine.deObject.characters[characterName];
        character.temp = {};
    }
}

