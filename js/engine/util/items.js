import { DEngine } from "../index.js";

/**
 * Compares two items for equality, ignoring their `id` fields (at every level,
 * including nested items in `containing` and `ontop`). Every other property
 * difference matters. Returns true only if the items are structurally identical
 * apart from their ids.
 *
 * @param {DEItem} a
 * @param {DEItem} b
 * @returns {boolean}
 */
export function itemsEqualIgnoringId(a, b) {
    return deepEqualIgnoringId(a, b);
}

/**
 * Recursively compares two values for deep equality, ignoring any property named
 * `id` found on objects.
 *
 * @param {any} a
 * @param {any} b
 * @returns {boolean}
 */
function deepEqualIgnoringId(a, b) {
    if (a === b) {
        return true;
    }

    // Different types, or one is null and the other isn't.
    if (typeof a !== typeof b) {
        return false;
    }
    if (a === null || b === null) {
        return a === b;
    }

    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b)) {
            return false;
        }
        if (a.length !== b.length) {
            return false;
        }
        for (let i = 0; i < a.length; i++) {
            if (!deepEqualIgnoringId(a[i], b[i])) {
                return false;
            }
        }
        return true;
    }

    if (typeof a === 'object') {
        const keysA = Object.keys(a).filter(k => k !== 'id');
        const keysB = Object.keys(b).filter(k => k !== 'id');
        if (keysA.length !== keysB.length) {
            return false;
        }
        for (const key of keysA) {
            if (!Object.prototype.hasOwnProperty.call(b, key)) {
                return false;
            }
            if (!deepEqualIgnoringId(a[key], b[key])) {
                return false;
            }
        }
        return true;
    }

    // Primitives that weren't strictly equal above.
    return false;
}

/**
 * 
 * @param {DEItem[]} items
 * @param {number} [minRangeCount=3]
 * @returns {Array<{
 *    representative: DEItem;
 *    amount: number;
 *    range: string;
 *    usesRangedMode: boolean;
 * }>}
 */
export function getItemsContiguousDescription(items, minRangeCount = 3) {
    // Group items that are identical except for their id.
    /** @type {DEItem[][]} */
    const groups = [];
    for (const item of items) {
        const existingGroup = groups.find(group => itemsEqualIgnoringId(group[0], item));
        if (existingGroup) {
            existingGroup.push(item);
        } else {
            groups.push([item]);
        }
    }

    // Matches an id that ends in a numeric suffix, capturing the prefix and number.
    const numericSuffixPattern = /^(.*?)(\d+)$/;

    /** @type {Array<{representative: DEItem; amount: number; range: string; usesRangedMode: boolean;}>} */
    const result = [];

    for (const group of groups) {
        const representative = group[0];
        const amount = group.length;
        const ids = group.map(item => item.id);

        // Try to split every id into a shared text prefix and a numeric suffix.
        const parsed = ids.map(id => {
            const match = id.match(numericSuffixPattern);
            return match ? { prefix: match[1], num: parseInt(match[2], 10) } : null;
        });

        const everyIdIsNumeric = parsed.every(p => p !== null);
        const sharedPrefix = everyIdIsNumeric && new Set(parsed.map(p => p.prefix)).size === 1;
        const worthRanging = amount >= minRangeCount;

        if (everyIdIsNumeric && sharedPrefix && worthRanging) {
            const prefix = parsed[0].prefix;
            const sortedNums = parsed.map(p => p.num).sort((a, b) => a - b);
            result.push({
                representative,
                amount,
                range: `${prefix}[${collapseNumbersToRanges(sortedNums).join(',')}]`,
                usesRangedMode: true,
            });
        } else {
            // Fall back to listing each id individually, sorted.
            const sortedIds = sortIds(ids, numericSuffixPattern);
            result.push({
                representative,
                amount,
                range: sortedIds.join(', '),
                usesRangedMode: false,
            });
        }
    }

    return result;
}

/**
 * Collapses a sorted ascending list of numbers into range notation parts.
 * For example [1,2,3,4,8,10,11,12] becomes ["1-4", "8", "10-12"].
 *
 * @param {number[]} sortedNums
 * @returns {string[]}
 */
function collapseNumbersToRanges(sortedNums) {
    /** @type {string[]} */
    const parts = [];
    let start = sortedNums[0];
    let end = sortedNums[0];
    for (let i = 1; i < sortedNums.length; i++) {
        if (sortedNums[i] === end + 1) {
            end = sortedNums[i];
        } else {
            parts.push(start === end ? `${start}` : `${start}-${end}`);
            start = sortedNums[i];
            end = sortedNums[i];
        }
    }
    parts.push(start === end ? `${start}` : `${start}-${end}`);
    return parts;
}

/**
 * Sorts ids so that ids sharing a text prefix are ordered by their numeric
 * suffix, and everything else falls back to plain string ordering.
 *
 * @param {string[]} ids
 * @param {RegExp} numericSuffixPattern
 * @returns {string[]}
 */
function sortIds(ids, numericSuffixPattern) {
    return [...ids].sort((a, b) => {
        const matchA = a.match(numericSuffixPattern);
        const matchB = b.match(numericSuffixPattern);
        if (matchA && matchB && matchA[1] === matchB[1]) {
            return parseInt(matchA[2], 10) - parseInt(matchB[2], 10);
        }
        return a.localeCompare(b);
    });
}

/**
 * @param {DEngine} engine
 * @param {string} characterName
 * @return {{complete: string, cheapList: string[], usedRangedMode: boolean}}
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

    let usedRangedMode = false;

    /**
     * @param {string} space 
     * @param {DEItem} representativeItem
     * @param {number} amount
     * @param {string} range
     */
    const listItems = (space, representativeItem, amount, range) => {
        message += `${space}- ${representativeItem.owner ? representativeItem.owner + "'s " : ""}${representativeItem.name}${amount >= 2 || amount === 0 ? " x" + amount : ""} -> ${range}\n`;

        if (representativeItem.relativePosition) {
            message += `${space}  Position: ${representativeItem.relativePosition}\n`;
        }

        if (representativeItem.containing.length !== 0) {
            if (amount === 1) {
                message += `${space}  Contains:\n`;
            } else {
                message += `${space}  Each ${representativeItem.name} Containing:\n`;
            }

            const groupedContainedItems = getItemsContiguousDescription(representativeItem.containing);
            for (const containedItem of groupedContainedItems) {
                if (containedItem.usesRangedMode) {
                    usedRangedMode = true;
                }
                listItems(space + "  ", containedItem.representative, containedItem.amount, containedItem.range);
            }
        }

        if (representativeItem.ontop.length !== 0) {
            if (amount === 1) {
                message += `${space}  On Top:\n`;
            } else {
                message += `${space}  Each ${representativeItem.name} has on top:\n`;
            }

            const groupedOntopItems = getItemsContiguousDescription(representativeItem.ontop);
            for (const ontopItem of groupedOntopItems) {
                if (ontopItem.usesRangedMode) {
                    usedRangedMode = true;
                }
                listItems(space + "  ", ontopItem.representative, ontopItem.amount, ontopItem.range);
            }
        }
        cheapList.push(`${representativeItem.owner ? representativeItem.owner + "'s " : ""}${representativeItem.name}${amount >= 2 ? " x" + amount : ""}`);
    }

    if (noItemsInAnySlot) {
        message += "No items available at the location.\n";
    } else {
        for (const slotName of slotNames) {
            const slot = location.slots[slotName];
            message += `\n## Items at ${slotName}:\n`;

            const groupedItems = getItemsContiguousDescription(slot.items);
            for (const groupedItem of groupedItems) {
                if (groupedItem.usesRangedMode) {
                    usedRangedMode = true;
                }
                listItems("", groupedItem.representative, groupedItem.amount, groupedItem.range);
            }
        }
    }

    // now let's check each character excluding our own for now
    for (const otherCharName in engine.deObject.stateFor) {
        if (otherCharName === characterName) continue;
        const otherCharState = engine.deObject.stateFor[otherCharName];
        if (otherCharState.location === locationName) {
            const deceasedAddition = otherCharState.dead ? " (Deceased)" : "";
            message += `\n## Items worn by ${otherCharName}${deceasedAddition}:\n`;
            if (otherCharState.wearing.length === 0) {
                message += `${otherCharName} Is currently naked.\n`;
            } else {
                const groupedWearingItems = getItemsContiguousDescription(otherCharState.wearing);
                for (const groupedItem of groupedWearingItems) {
                    if (groupedItem.usesRangedMode) {
                        usedRangedMode = true;
                    }
                    listItems("", groupedItem.representative, groupedItem.amount, groupedItem.range);
                }
            }
            
            message += `\n## Items carried by ${otherCharName}${deceasedAddition}:\n`;
            if (otherCharState.carrying.length === 0) {
                message += `No items carried by ${otherCharName}${deceasedAddition}.\n`;
            } else {
                const groupedCarryingItems = getItemsContiguousDescription(otherCharState.carrying);
                for (const groupedItem of groupedCarryingItems) {
                    if (groupedItem.usesRangedMode) {
                        usedRangedMode = true;
                    }
                    listItems("", groupedItem.representative, groupedItem.amount, groupedItem.range);
                }
            }
        }
    }

    // now let's do our own character
    const deceasedAddition = characterState.dead ? " (Deceased)" : "";
    message += `\n## Items worn by ${characterName}${deceasedAddition}:\n`;
    if (characterState.wearing.length === 0) {
        message += `${characterName} Is currently naked.\n`;
    } else {
        const groupedWearingItems = getItemsContiguousDescription(characterState.wearing);
        for (const groupedItem of groupedWearingItems) {
            if (groupedItem.usesRangedMode) {
                usedRangedMode = true;
            }
            listItems("", groupedItem.representative, groupedItem.amount, groupedItem.range);
        }
    }

    message += `\n## Items carried by ${characterName}${deceasedAddition}:\n`;
    if (characterState.carrying.length === 0) {
        message += `No items or characters carried by ${characterName}.\n`;
    } else {
        const groupedCarryingItems = getItemsContiguousDescription(characterState.carrying);
        for (const groupedItem of groupedCarryingItems) {
            if (groupedItem.usesRangedMode) {
                usedRangedMode = true;
            }
            listItems("", groupedItem.representative, groupedItem.amount, groupedItem.range);
        }
    }

    return { complete: message, cheapList, usedRangedMode };
}

/**
 * @param {DEngine} engine
 * @param {string} locationName
 * @returns {Array<{id: string, name: string}>}
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
     * @type {Array<{id: string, name: string}>}
     */
    const items = [];
    /**
     * 
     * @param {DEItem[]} itemList 
     */
    const processItemList = (itemList) => {
        for (const item of itemList) {
            if (!items.find(i => i.name === item.name)) {
                items.push({ id: item.id, name: item.name });
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