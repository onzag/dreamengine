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
 * @param {string} characterId
 * @return {{complete: string, cheapList: string[], usedRangedMode: boolean}}
 */
export function describeItemsAvailableToCharacterForInference(engine, characterId) {
    /**
     * @type {string[]}
     */
    const cheapList = [];
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    const characterState = engine.deObject.stateFor[characterId];
    if (!characterState) {
        throw new Error(`Character state for ${characterId} not found.`);
    }
    const locationId = characterState.location;

    const location = engine.deObject.world.locations[locationId];
    if (!location) {
        throw new Error(`Location ${locationId} not found.`);
    }
    const slotIds = Object.keys(location.slots);
    let noItemsInAnySlot = true;
    for (const slotId of slotIds) {
        const slot = location.slots[slotId];
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
        for (const slotId of slotIds) {
            const slot = location.slots[slotId];
            const slotName = engine.deObject.utils.templates.formatLocationSlotName(slot, characterId, { type: "default" });
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
    for (const otherCharacterId in engine.deObject.stateFor) {
        if (otherCharacterId === characterId) continue;
        const otherCharState = engine.deObject.stateFor[otherCharacterId];
        if (otherCharState.location === locationId) {
            const deceasedAddition = otherCharState.dead ? " (Deceased)" : "";
            const otherCharName = engine.deObject.utils.templates.formatCharacterName(otherCharacterId, characterId, { type: "definite" });
            message += `\n## Items worn by ${otherCharName}${deceasedAddition}:\n`;
            if (otherCharState.wearing.length === 0) {
                message += `${otherCharName} is currently naked.\n`;
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

    const characterName = engine.deObject.utils.templates.formatCharacterName(characterId, characterId, { type: "definite" });

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
 * @param {string} locationId
 * @returns {Array<{id: string, name: string}>}
 */
export function getFullItemListAtLocation(engine, locationId) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    const location = engine.deObject.world.locations[locationId];
    if (!location) {
        throw new Error(`Location ${locationId} not found.`);
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
    const charactersAtLocation = Object.keys(engine.deObject.stateFor).filter(charName => engine.deObject.stateFor[charName].location === locationId);
    for (const charName of charactersAtLocation) {
        const charState = engine.deObject.stateFor[charName];
        processItemList(charState.wearing);
        processItemList(charState.carrying);
    }
    return items;
}

const irregularPlurals = {
    // Inanimate objects/items only
    "axis": "axes",
    "basis": "bases",
    "cactus": "cacti",
    "focus": "foci",
    "fungus": "fungi",
    "nucleus": "nuclei",
    "syllabus": "syllabi",
    "analysis": "analyses",
    "diagnosis": "diagnoses",
    "oasis": "oases",
    "thesis": "theses",
    "crisis": "crises",
    "phenomenon": "phenomena",
    "criterion": "criteria",
    "datum": "data",
    "index": "indices",
    "appendix": "appendices",
    "bacterium": "bacteria",
    "medium": "media",
    "radius": "radii",
    "formula": "formulae",
    "vertebra": "vertebrae",
    "curriculum": "curricula",
    "aircraft": "aircraft",
    "species": "species",
    "fish": "fish",
    "sheep": "sheep",
    "deer": "deer",
    "dice": "dice",
    "die": "dice",
    "leaf": "leaves",
    "loaf": "loaves",
    "knife": "knives",
    "life": "lives",
    "wife": "wives",
    "self": "selves",
    "wolf": "wolves",
    "calf": "calves",
    "elf": "elves",
    "scarf": "scarves",
    "hoof": "hooves",
    "tomato": "tomatoes",
    "potato": "potatoes",
    "torpedo": "torpedoes",
    "veto": "vetoes",
    "echo": "echoes",
    "hero": "heroes",
    "zero": "zeroes"
};

/**
 * @param {DEObject} deObject
 * @param {string|null} locationToCheckOneOfAKind
 * @param {boolean} oneOfAKind
 * @param {string|null} owner
 * @param {number} amount 
 * @param {string} itemName
 * @param {string} itemId
 * @param {boolean} [capitalize] whether to capitalize the first letter of the item, this is used for example when the item is at the beginning of a sentence, so we want to make sure the message looks good
 * @param {boolean} [forceThe] whether to force "the" in front of the item, this is used for example when we want to refer to a specific item that we know is present, so we want to make sure the message reflects that, even if there is only one of that item, for example "the apple" instead of just "an apple"
 * @param {boolean} [forcePlain] whether to force the item to be plain, this is used for example when we want to refer to a specific item that we know is present, so we want to make sure the message reflects that, even if there is only one of that item, for example "apple" instead of just "an apple"
 */
export function utilItemCount(deObject, locationToCheckOneOfAKind, oneOfAKind, owner, amount, itemName, itemId, capitalize = false, forceThe = false, forcePlain = false) {
    const itemTrimmedLower = itemName.trim().toLowerCase();
    const itemIsAlreadyPlural = isAlreadyPlural(itemTrimmedLower);
    const itemIsSingularOfPlural = isSingularOfPlural(itemTrimmedLower);

    let toReturn = "";
    if (amount === 1 && itemTrimmedLower.startsWith("the ") && !owner) {
        toReturn = itemName;
    } else if (amount === 1 && owner) {
        if (forceThe) {
            toReturn = `the ${itemName} of ${owner}`;
        } else {
            toReturn = `${owner}'s ${itemName}`;
        }
    } else if (amount === 1) {
        if (itemIsSingularOfPlural) {
            // "pair of glasses" -> "the pair of glasses" or "a pair of glasses"
            const isOneOfAKind = oneOfAKind || (!locationToCheckOneOfAKind ? false : checkItemIsOneOfAKindAtLocation(deObject, locationToCheckOneOfAKind, itemName, itemId));
            if (forceThe || isOneOfAKind) {
                toReturn = `the ${itemName}`;
            } else if (forcePlain) {
                toReturn = `${itemName}`;
            } else if (itemTrimmedLower.startsWith("a")) {
                toReturn = `an ${itemName}`;
            } else {
                toReturn = `a ${itemName}`;
            }
        } else if (itemIsAlreadyPlural) {
            // "glasses" -> "the glasses" (can't say "a glasses")
            toReturn = `the ${itemName}`;
        } else {
            const isOneOfAKind = oneOfAKind || (!locationToCheckOneOfAKind ? false : checkItemIsOneOfAKindAtLocation(deObject, locationToCheckOneOfAKind, itemName, itemId));
            if (forceThe || isOneOfAKind) {
                toReturn = `the ${itemName}`;
            } else if (forcePlain) {
                toReturn = `${itemName}`;
            } else if (itemTrimmedLower.startsWith("a")) {
                toReturn = `an ${itemName}`;
            } else {
                toReturn = `a ${itemName}`;
            }
        }
    } else {
        if (itemIsAlreadyPlural) {
            // Already plural, don't add suffix: "2 glasses" not "2 glasseses"
            if (!owner) {
                toReturn = `${forceThe ? "the " : ""}${amount} ${itemName}`;
            } else if (forceThe) {
                toReturn = `the ${amount} ${itemName} of ${owner}`;
            } else {
                toReturn = `${owner}'s ${amount} ${itemName}`;
            }
        } else if (itemIsSingularOfPlural) {
            // "pair of glasses" -> "2 pairs of glasses"
            const spaceIdx = itemName.indexOf(' ');
            const unitWord = spaceIdx !== -1 ? itemName.slice(0, spaceIdx) : itemName;
            const rest = spaceIdx !== -1 ? itemName.slice(spaceIdx) : '';
            const unitWordLower = unitWord.toLowerCase();
            let pluralUnit;
            if (unitWordLower.endsWith("ch") || unitWordLower.endsWith("sh") || unitWordLower.endsWith("x") || unitWordLower.endsWith("z") || unitWordLower.endsWith("s")) {
                pluralUnit = unitWord + "es";
            } else if (unitWordLower.endsWith("y") && !["a", "e", "i", "o", "u"].includes(unitWordLower.slice(-2, -1))) {
                pluralUnit = unitWord.slice(0, -1) + "ies";
            } else {
                pluralUnit = unitWord + "s";
            }
            const pluralized = pluralUnit + rest;
            if (!owner) {
                toReturn = `${forceThe ? "the " : ""}${amount} ${pluralized}`;
            } else if (forceThe) {
                toReturn = `the ${amount} ${pluralized} of ${owner}`;
            } else {
                toReturn = `${owner}'s ${amount} ${pluralized}`;
            }
        } else {
            // Try to pluralize using irregulars first
            const lastWord = itemTrimmedLower.split(" ").slice(-1)[0];
            if (!owner) {
                // @ts-ignore
                if (irregularPlurals[lastWord]) {
                    // Replace only the last word with its irregular plural
                    const words = itemName.split(" ");
                    // @ts-ignore
                    words[words.length - 1] = irregularPlurals[lastWord];
                    toReturn = `${forceThe ? "the " : ""}${amount} ${words.join(" ")}`;
                } else if (lastWord.endsWith("s") || lastWord.endsWith("x") || lastWord.endsWith("z") || lastWord.endsWith("ch") || lastWord.endsWith("sh")) {
                    toReturn = `${forceThe ? "the " : ""}${amount} ${itemName}es`;
                } else if (lastWord.endsWith("y") && !["a", "e", "i", "o", "u"].includes(lastWord.slice(-2, -1))) {
                    toReturn = `${forceThe ? "the " : ""}${amount} ${itemName.slice(0, -1)}ies`;
                } else {
                    toReturn = `${forceThe ? "the " : ""}${amount} ${itemName}s`;
                }
            } else {
                if (forceThe) {
                    // @ts-ignore
                    if (irregularPlurals[lastWord]) {
                        // Replace only the last word with its irregular plural
                        const words = itemName.split(" ");
                        // @ts-ignore
                        words[words.length - 1] = irregularPlurals[lastWord];
                        toReturn = `the ${amount} ${words.join(" ")} of ${owner}`;
                    } else if (lastWord.endsWith("s") || lastWord.endsWith("x") || lastWord.endsWith("z") || lastWord.endsWith("ch") || lastWord.endsWith("sh")) {
                        toReturn = `the ${amount} ${itemName}es of ${owner}`;
                    } else if (lastWord.endsWith("y") && !["a", "e", "i", "o", "u"].includes(lastWord.slice(-2, -1))) {
                        toReturn = `the ${amount} ${itemName.slice(0, -1)}ies of ${owner}`;
                    } else {
                        toReturn = `the ${amount} ${itemName}s of ${owner}`;
                    }
                } else {
                    // @ts-ignore
                    if (irregularPlurals[lastWord]) {
                        // Replace only the last word with its irregular plural
                        const words = itemName.split(" ");
                        // @ts-ignore
                        words[words.length - 1] = irregularPlurals[lastWord];
                        toReturn = `${owner}'s ${amount} ${words.join(" ")}`;
                    } else if (lastWord.endsWith("s") || lastWord.endsWith("x") || lastWord.endsWith("z") || lastWord.endsWith("ch") || lastWord.endsWith("sh")) {
                        toReturn = `${owner}'s ${amount} ${itemName}es`;
                    } else if (lastWord.endsWith("y") && !["a", "e", "i", "o", "u"].includes(lastWord.slice(-2, -1))) {
                        toReturn = `${owner}'s ${amount} ${itemName.slice(0, -1)}ies`;
                    } else {
                        toReturn = `${owner}'s ${amount} ${itemName}s`;
                    }
                }
            }
        }
    }
    if (capitalize) {
        toReturn = toReturn.charAt(0).toUpperCase() + toReturn.slice(1);
    }
    return toReturn;
}

// Words that are inherently plural (pluralia tantum) - they don't change form for plural
const alreadyPluralNouns = new Set([
    "glasses", "sunglasses", "eyeglasses", "scissors", "pants", "trousers", "shorts",
    "jeans", "pliers", "tongs", "tweezers", "binoculars", "goggles", "shears",
    "leggings", "stockings", "tights", "clippers", "forceps", "bellows",
    "remains", "ruins", "ashes", "embers", "debris", "dregs", "suds",
    "clothes", "riches", "goods", "belongings", "surroundings", "stairs",
    "handcuffs", "shackles", "knickers", "briefs", "boxers", "pajamas",
    "overalls", "dungarees", "chaps", "suspenders", "braces", "fragments",
]);

// Patterns that indicate the name is a singular expression wrapping a plural noun
// e.g. "a pair of glasses", "a dozen eggs", "a set of keys"
const singularOfPluralPrefixes = [
    "pair of ", "set of ", "bunch of ", "pack of ", "bundle of ",
    "dozen ", "dozen of ", "handful of ", "stack of ", "pile of ",
    "box of ", "bag of ", "crate of ", "barrel of ", "basket of ",
    "collection of ", "group of ", "batch of ", "cluster of ",
    "roll of ", "spool of ", "jar of ", "can of ", "bottle of ",
    "tube of ", "piece of ", "slab of ", "chunk of ", "strip of ",
    "sheet of ", "bolt of ", "length of ", "string of ", "strand of ",
];

/**
 * Checks if the last word of an item name is already a plural noun (pluralia tantum).
 * e.g. "reading glasses" -> true, "red scissors" -> true, "sword" -> false
 * @param {string} itemNameLower - lowercased item name
 * @returns {boolean}
 */
export function isAlreadyPlural(itemNameLower) {
    const lastWord = itemNameLower.split(" ").slice(-1)[0];
    return alreadyPluralNouns.has(lastWord);
}

/**
 * Checks if an item name is a singular expression wrapping a plural noun.
 * e.g. "a pair of glasses" -> true, "a dozen eggs" -> true, "sword" -> false
 * @param {string} itemNameLower - lowercased item name
 * @returns {boolean}
 */
export function isSingularOfPlural(itemNameLower) {
    return singularOfPluralPrefixes.some(prefix => itemNameLower.startsWith(prefix));
}

/**
 * 
 * @param {DEObject} deObject
 * @param {string} locationId
 * @param {string} itemName
 * @param {string} itemId
 * @returns {boolean} true if the item is one of a kind at the location, false otherwise
 */
export function checkItemIsOneOfAKindAtLocation(deObject, locationId, itemName, itemId) {
    let foundAnother = false
    const itemTrimmedLower = itemName.trim().toLowerCase();

    /**
     * @param {DEItem[]} itemList 
     */
    const countInList = (itemList) => {
        for (const itemInList of itemList) {
            // @ts-ignore TODO whaT?
            if (itemInList._moved_to) {
                continue; // skip items that have been moved, as they are not really present in the location anymore
            }
            if (itemInList.name.trim().toLowerCase() === itemTrimmedLower && itemInList.id !== itemId) {
                foundAnother = true;
                return;
            } else if (itemInList.name.trim().toLowerCase().includes(itemTrimmedLower) && itemInList.id !== itemId) {
                // we also check if the item name includes the item we are looking for, this is just to increase the chances of finding
                foundAnother = true;
                return;
            }
            if (foundAnother) {
                return;
            }
            countInList(itemInList.containing);
            if (foundAnother) {
                return;
            }
            countInList(itemInList.ontop);
            if (foundAnother) {
                return;
            }
        }
    }

    if (foundAnother) {
        return false;
    }

    const allCharactersToCheck = [];
    for (const charName in deObject.characters) {
        const charState = deObject.stateFor[charName];
        if (charState.location === locationId) {
            allCharactersToCheck.push(charName);
        }
    }
    for (const charName of allCharactersToCheck) {
        const characterState = deObject.stateFor[charName];
        countInList(characterState.carrying);
        if (foundAnother) {
            return false;
        }
        countInList(characterState.wearing);
        if (foundAnother) {
            return false;
        }
    }
    for (const [slotName, slot] of Object.entries(deObject.world.locations[locationId].slots)) {
        countInList(slot.items);
        if (foundAnother) {
            return false;
        }
    }

    return !foundAnother;
}

/**
 * @param {DEObject} deObject
 * @param {string} itemName
 * @param {string} itemId
 * @returns {boolean}
 */
export function checkItemIsOneOfAKindAtWorld(deObject, itemName, itemId) {
    for (const locationId in deObject.world.locations) {
        if (checkItemIsOneOfAKindAtLocation(deObject, locationId, itemName, itemId) === false) {
            return false;
        }
    }
    return true;
}