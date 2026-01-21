import { DEngine } from "./index.js";

/**
 * @type {Object.<string, {run: (engine: DEngine, args: string[]) => Promise<string>, help: string, cheat?: boolean}>}
 */
export const commands = {
    "whereami": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }


            return `You are at: ${engine.deObject.world.currentLocation}, at the slot: ${engine.deObject.world.currentLocationSlot}\n\n` +
                // @ts-ignore
                (await engine.deObject.world.locations[engine.deObject.world.currentLocation].description.execute(engine.deObject, engine.userCharacter, undefined, undefined, undefined, undefined) || "No location description available.") + "\n\n" +
                // @ts-ignore
                (await engine.deObject.world.locations[engine.deObject.world.currentLocation].slots[engine.deObject.world.currentLocationSlot].description.execute(engine.deObject, engine.userCharacter, undefined, undefined, undefined, undefined) || "No slot description available.");
        },
        help: "Displays your current location in the world.",
        cheat: false,
    },
    "whatcanisee": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (!engine.userCharacter) {
                throw new Error("DEngine has no user character defined");
            }
            const info = engine.describeItemsAvailableToCharacterForInference(engine.userCharacter.name);
            return info;
        },
        help: "Lists the objects you can see in your current location.",
        cheat: false,
    },
    "whatcanticarry": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (!engine.userCharacter) {
                throw new Error("DEngine has no user character defined");
            }
            const info = engine.getItemsCharacterMayCarryWithReasons("cannot", engine.userCharacter.name, engine.deObject.world.currentLocation, false, false);
            return info.join("\n") || "You can carry all items in this location.";
        },
        help: "Lists the objects you cannot carry in your current location, along with reasons.",
        cheat: false,
    },
    "whatcanicarry": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (!engine.userCharacter) {
                throw new Error("DEngine has no user character defined");
            }
            const info = engine.getItemsCharacterMayCarryWithReasons("can", engine.userCharacter.name, engine.deObject.world.currentLocation, false, false);
            return info.join("\n") || "You cannot carry any items in this location.";
        },
        help: "Lists the objects you can carry in your current location, along with reasons.",
        cheat: false,
    },
    "whatcaniwear": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (!engine.userCharacter) {
                throw new Error("DEngine has no user character defined");
            }
            const info = engine.getItemsCharacterMayWearWithReasons("can", engine.userCharacter.name, engine.deObject.world.currentLocation);
            return info.join("\n") || "You cannot wear anything in this location.";
        },
        help: "Lists the wearable items you can wear, along with reasons.",
        cheat: false,
    },
    "whatcantiwear": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (!engine.userCharacter) {
                throw new Error("DEngine has no user character defined");
            }
            const info = engine.getItemsCharacterMayWearWithReasons("cannot", engine.userCharacter.name, engine.deObject.world.currentLocation);
            return info.join("\n") || "You can wear all wearable items you have.";
        },
        help: "Lists the wearable items you cannot wear, along with reasons.",
        cheat: false,
    },
    "whocanticarry": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (!engine.userCharacter) {
                throw new Error("DEngine has no user character defined");
            }
            const info = engine.getItemsCharacterMayCarryWithReasons("cannot", engine.userCharacter.name, engine.deObject.world.currentLocation, true, true);
            return info.join("\n") || "You can carry everyone in this location.";
        },
        help: "Lists the characters that you cannot carry in your current location",
        cheat: false,
    },
    "whocanicarry": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (!engine.userCharacter) {
                throw new Error("DEngine has no user character defined");
            }
            const info = engine.getItemsCharacterMayCarryWithReasons("can", engine.userCharacter.name, engine.deObject.world.currentLocation, true, true);
            return info.join("\n") || "You cannot carry anyone in this location.";
        },
        help: "Lists the characters that you can carry in your current location",
        cheat: false,
    },
    "whocanisee": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (!engine.userCharacter) {
                throw new Error("DEngine has no user character defined");
            }
            return "TODO"
        },
        help: "Lists the characters that you can see in your current location",
        cheat: false,
    },
    "whoiswithme": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (!engine.userCharacter) {
                throw new Error("DEngine has no user character defined");
            }
            return "TODO"
        },
        help: "Lists the characters that are interacting with you (locally or remotely) in your current location",
        cheat: false,
    },
    "wherecanigo": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (!engine.userCharacter) {
                throw new Error("DEngine has no user character defined");
            }
            return "TODO"
        },
        help: "Lists the locations you can go to from your current location",
        cheat: false,
    },
};