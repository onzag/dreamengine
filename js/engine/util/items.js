import { DEngine } from "../index.js";
import { getCharacterExactLocation, getListOfCarriedCharactersByCharacter } from "./character-info.js";
import { locationPathToMessage } from "./weight-and-volume.js";

/**
 * @param {DEngine} engine
 * @param {string} characterName
 * @return {{complete: string, cheapList: string[]}}
 */
export function describeItemsAvailableToCharacterForInference(engine, characterName) {
    /**
     * @type {string[]}
     */
    const cheapList = [];
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    const characterState = engine.deObject.stateFor[characterName];
    if (!characterState) {
        throw new Error(`Character state for ${characterName} not found.`);
    }
    const locationName = characterState.location;

    const location = engine.deObject.world.locations[locationName];
    if (!location) {
        throw new Error(`Location ${locationName} not found.`);
    }
    const slotNames = Object.keys(location.slots);
    let noItemsInAnySlot = true;
    for (const slotName of slotNames) {
        const slot = location.slots[slotName];
        if (slot.items.length > 0) {
            noItemsInAnySlot = false;
            break;
        }
    }

    let message = "# Items at the location:\n";

    /**
     * @param {string} space 
     * @param {DEItem} item
     */
    const listItems = (space, item) => {
        message += `${space}- ${item.owner ? item.owner + "'s " : ""}${item.name}${item.amount >= 2 || item.amount === 0 ? " x" + item.amount : ""}\n`;
        if (item.containing.length !== 0) {
            message += `${space}  Containing:\n`;
        }
        for (const containedItem of item.containing) {
            listItems(space + "  ", containedItem);
        }
        for (const ontopItem of item.ontop) {
            listItems(space + "  ", ontopItem);
        }
        cheapList.push(`${item.owner ? item.owner + "'s " : ""}${item.name}${item.amount >= 2 ? " x" + item.amount : ""}`);
    }
    if (noItemsInAnySlot) {
        message += "No items available at the location.\n";
    } else {
        for (const slotName of slotNames) {
            const slot = location.slots[slotName];
            message += `\n## Items at ${slotName}:\n`;
            for (const item of slot.items) {
                listItems("", item);
            }
        }
    }

    // now let's check each character excluding our own for now
    for (const otherCharName in engine.deObject.stateFor) {
        if (otherCharName === characterName) continue;
        const otherCharState = engine.deObject.stateFor[otherCharName];
        if (otherCharState.location === locationName) {
            message += `\n## Items worn by ${otherCharName}:\n`;
            if (otherCharState.wearing.length === 0) {
                message += `${otherCharName} Is currently naked.\n`;
            } else {
                for (const item of otherCharState.wearing) {
                    listItems("", item);
                }
            }
            
            message += `\n## Items carried by ${otherCharName}:\n`;
            if (otherCharState.carrying.length === 0) {
                message += `No items carried by ${otherCharName}.\n`;
            } else {
                for (const item of otherCharState.carrying) {
                    listItems("", item);
                }
            }
        }
    }

    // now let's do our own character
    message += `\n## Items worn by ${characterName}:\n`;
    if (characterState.wearing.length === 0) {
        message += `${characterName} Is currently naked.\n`;
    } else {
        for (const item of characterState.wearing) {
            listItems("", item);
        }
    }

    message += `\n## Items carried by ${characterName}:\n`;
    if (characterState.carrying.length === 0) {
        message += `No items or characters carried by ${characterName}.\n`;
    } else {
        for (const item of characterState.carrying) {
            listItems("", item);
        }
    }

    return { complete: message, cheapList };
}

/**
 * @param {DEngine} engine
 * @param {string} locationName 
 */
export function getFullItemListAtLocation(engine, locationName) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    const location = engine.deObject.world.locations[locationName];
    if (!location) {
        throw new Error(`Location ${locationName} not found.`);
    }
    /**
     * @type {string[]}
     */
    const items = [];
    /**
     * 
     * @param {DEItem[]} itemList 
     */
    const processItemList = (itemList) => {
        for (const item of itemList) {
            if (!items.includes(item.name)) {
                items.push(item.name);
            }
            processItemList(item.containing);
            processItemList(item.ontop);
        }
    }
    for (const locationSlotName in location.slots) {
        const locationSlot = location.slots[locationSlotName];
        processItemList(locationSlot.items);
    }
    // @ts-ignore
    const charactersAtLocation = Object.keys(engine.deObject.stateFor).filter(charName => engine.deObject.stateFor[charName].location === locationName);
    for (const charName of charactersAtLocation) {
        const charState = engine.deObject.stateFor[charName];
        processItemList(charState.wearing);
        processItemList(charState.carrying);
    }
    return items;
}