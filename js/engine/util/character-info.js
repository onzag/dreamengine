import { DEngine } from "../index.js";

/**
 * @param {DEngine} engine 
 * @param {string} characterName
 * @return {{
 *    carrierName: string,
 *    carrierLocation: string,
 *    carrierLocationSlot: string,
 *    directlyCarried: boolean,
 *    itemPath: Array<string | number> | null,
 *    itemPathEnd: "containingCharacters" | "ontopCharacters" | null,
 *    item: DEItem | null,
 * } | null}
 */
export function getBeingCarriedByCharacter(engine, characterName) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    const charState = engine.deObject.stateFor[characterName];
    if (!charState) {
        throw new Error(`Character ${characterName} not found in engine state.`);
    }
    for (const otherCharName in engine.deObject.stateFor) {
        const otherCharState = engine.deObject.stateFor[otherCharName];
        if (otherCharName === characterName || charState.location !== otherCharState.location) {
            continue;
        }

        if (otherCharState.carryingCharactersDirectly && otherCharState.carryingCharactersDirectly.includes(characterName)) {
            return {
                carrierName: otherCharName,
                carrierLocation: otherCharState.location,
                carrierLocationSlot: otherCharState.locationSlot,
                directlyCarried: true,
                itemPath: null,
                itemPathEnd: null,
                item: null,
            };
        }

        const found = findLocationOfCharInsideOrAtopItemRecursive(characterName, otherCharState.carrying, ["characters", otherCharName, "carrying"]);
        if (found) {
            return {
                carrierName: otherCharName,
                carrierLocation: otherCharState.location,
                carrierLocationSlot: otherCharState.locationSlot,
                directlyCarried: false,
                itemPath: found.path,
                itemPathEnd: found.end,
                item: found.item,
            };
        }
    }

    return null;
}

/**
 * @param {string} otherCharName
 * @param {DEItem[]} list
 * @param {Array<string | number>} pathSoFar
 * @returns {{
 *   path: Array<string | number>,
 *   end: "containingCharacters" | "ontopCharacters",
 *   item: DEItem,
 * } | null}
 */
export function findLocationOfCharInsideOrAtopItemRecursive(otherCharName, list, pathSoFar) {
    for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (item.amount === 0) {
            continue;
        }
        if (item.containingCharacters && item.containingCharacters.includes(otherCharName)) {
            return {
                path: [...pathSoFar, i],
                end: "containingCharacters",
                item: item,
            }
        } else if (item.ontopCharacters && item.ontopCharacters.includes(otherCharName)) {
            return {
                path: [...pathSoFar, i],
                end: "ontopCharacters",
                item: item,
            }
        } else {
            const found = findLocationOfCharInsideOrAtopItemRecursive(otherCharName, item.containing, [...pathSoFar, i, "containing"]);
            if (found) {
                return found;
            }
            const foundAtop = findLocationOfCharInsideOrAtopItemRecursive(otherCharName, item.ontop, [...pathSoFar, i, "ontop"]);
            if (foundAtop) {
                return foundAtop;
            }
        }
    }
    return null;
}

/**
 * @param {DEItem[]} list
 * @param {Array<string | number>} pathSoFar
 * @param  {Array<{
 *   path: Array<string | number>,
 *   end: "containingCharacters" | "ontopCharacters",
 *   item: DEItem,
 *   char: string,
 * }>} resultsSoFar
 * @returns {Array<{
 *   path: Array<string | number>,
 *   end: "containingCharacters" | "ontopCharacters",
 *   item: DEItem,
 *   char: string,
 * }>}
 */
export function findLocationOfAnyCharInsideOrAtopItemRecursive(list, pathSoFar, resultsSoFar) {
    for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (item.amount === 0) {
            continue;
        }
        if (item.containingCharacters) {
            for (const char of item.containingCharacters) {
                resultsSoFar.push({
                    path: [...pathSoFar, i],
                    end: "containingCharacters",
                    item: item,
                    char: char,
                });
            }
        }
        if (item.ontopCharacters) {
            for (const char of item.ontopCharacters) {
                resultsSoFar.push({
                    path: [...pathSoFar, i],
                    end: "ontopCharacters",
                    item: item,
                    char: char,
                });
            }
        }
        findLocationOfAnyCharInsideOrAtopItemRecursive(item.containing, [...pathSoFar, i, "containing"], resultsSoFar);
        findLocationOfAnyCharInsideOrAtopItemRecursive(item.ontop, [...pathSoFar, i, "ontop"], resultsSoFar);
    }
    return resultsSoFar;
}


/**
 * 
 * @param {DEngine} engine 
 * @param {string} characterName 
 * @returns {{
 *   location: string,
 *   beingCarriedBy: string | null,
 *   itemPath: Array<string | number> | null,
 *   item: DEItem | null,
 *   itemPathEnd: "containingCharacters" | "ontopCharacters" | null,
 * }}
 */
export function getCharacterExactLocation(engine, characterName) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    const charState = engine.deObject.stateFor[characterName];
    if (!charState) {
        throw new Error(`Character ${characterName} not found in engine state.`);
    }
    const beingCarriedInfo = getBeingCarriedByCharacter(engine, characterName);
    if (beingCarriedInfo) {
        return {
            location: beingCarriedInfo.carrierLocation,
            beingCarriedBy: beingCarriedInfo.carrierName,
            itemPath: beingCarriedInfo.itemPath,
            item: beingCarriedInfo.item,
            itemPathEnd: beingCarriedInfo.itemPathEnd,
        };
    }
    const location = charState.location;
    for (const slot in engine.deObject.world.locations[location].slots) {
        const slotInfo = engine.deObject.world.locations[location].slots[slot];
        const foundChar = findLocationOfCharInsideOrAtopItemRecursive(characterName, slotInfo.items, ["slots", slot, "items"]);
        if (foundChar) {
            return {
                location: location,
                beingCarriedBy: null,
                itemPath: foundChar.path,
                item: foundChar.item,
                itemPathEnd: foundChar.end,
            };
        }
    }
    return {
        location: location,
        beingCarriedBy: null,
        itemPath: null,
        item: null,
        itemPathEnd: null,
    };
}

/**
 * 
 * @param {DEngine} engine 
 * @param {string} characterName 
 */
export function getAllItemsCharacterIsInsideOf(engine, characterName) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }

    const exactLocation = getCharacterExactLocation(engine, characterName);
    if (!exactLocation.itemPath) {
        return [];
    }

    /**
     * @type {DEItem[]}
     */
    const items = [];

    const characterLocationInfo = engine.deObject.stateFor[characterName].location;
    const locationState = engine.deObject.world.locations[characterLocationInfo];

    const expectedPath = [...exactLocation.itemPath, exactLocation.itemPathEnd]

    /**
     * @type {*}
     */
    let base;
    if (exactLocation.itemPath[0] === "slots") {
        base = locationState.slots[exactLocation.itemPath[1]].items;
    } else if (exactLocation.itemPath[0] === "characters") {
        base = engine.deObject.stateFor[exactLocation.itemPath[1]].carrying;
    } else {
        throw new Error(`Invalid item path for character ${characterName}: ${exactLocation.itemPath}`);
    }

    for (let i = 3; i < expectedPath.length; i++) {
        const pathPart = expectedPath[i];
        const pathPartAhead = expectedPath[i + 1];
        // @ts-ignore
        base = base[pathPart];

        if (pathPartAhead === "containingCharacters") {
            items.push(base);
        }
    }

    return items;
}

/**
 * 
 * @param {DEngine} engine 
 * @param {string} characterName
 * @returns {Array<{
 *   carriedName: string,
 *   itemPath: Array<string | number> | null,
 *   item: DEItem | null,
 *   itemPathEnd: "containingCharacters" | "ontopCharacters" | null,
 * }>}
 */
export function getListOfCarriedCharactersByCharacter(engine, characterName) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }

    const results1 = findLocationOfAnyCharInsideOrAtopItemRecursive(engine.deObject.stateFor[characterName].carrying, ["characters", characterName, "carrying"], []);
    findLocationOfAnyCharInsideOrAtopItemRecursive(engine.deObject.stateFor[characterName].wearing, ["characters", characterName, "wearing"], results1);

    return (engine.deObject.stateFor[characterName].carryingCharactersDirectly).map((carriedCharName) => ({
        carriedName: carriedCharName,
        itemPath: null,
        item: null,
        itemPathEnd: null,
        // @ts-ignore typescript bugs
    })).concat(results1.map((result) => ({
        carriedName: result.char,
        itemPath: result.path,
        item: result.item,
        itemPathEnd: result.end,
    })));
}

/**
 * @param {DEngine} engine
 * @param {string} characterName
 * @returns {boolean}
 */
export function isTopNaked(engine, characterName) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }

    const charState = engine.deObject.stateFor[characterName];
    if (!charState) {
        throw new Error(`Character ${characterName} not found in engine state.`);
    }

    const wearingItems = charState.wearing;
    for (const item of wearingItems) {
        if (item.amount > 0) {
            continue;
        }
        if (item.wearableProperties?.coversTopNakedness) {
            return false;
        }
    }
    return true;
}

/**
 * @param {DEngine} engine
 * @param {string} characterName
 * @returns {boolean}
 */
export function isBottomNaked(engine, characterName) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }

    const charState = engine.deObject.stateFor[characterName];
    if (!charState) {
        throw new Error(`Character ${characterName} not found in engine state.`);
    }

    const wearingItems = charState.wearing;
    for (const item of wearingItems) {
        if (item.amount > 0) {
            continue;
        }
        if (item.wearableProperties?.coversBottomNakedness) {
            return false;
        }
    }
    return true;
}

/**
 * @param {DEngine} engine
 * @param {string} characterName
 * @returns {{
 *   location: string,
 *   nonStrangers: string[],
 *   totalStrangers: string[],
 * }}
 */
export function getSurroundingCharacters(engine, characterName) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }

    const charState = engine.deObject.stateFor[characterName];
    if (!charState) {
        throw new Error(`Character ${characterName} not found in engine state.`);
    }

    const location = charState.location;
    const locationState = engine.deObject.world.locations[location];
    const nonStrangers = [];
    const totalStrangers = [];
    for (const charToCheck in engine.deObject.stateFor) {
        const charStateToCheck = engine.deObject.stateFor[charToCheck];
        if (charStateToCheck.location !== location || charToCheck === characterName) {
            continue;
        }
        if (engine.deObject.social.bonds[characterName].active.find(b => b.towards === charToCheck) || engine.deObject.social.bonds[characterName].ex.find(b => b.towards === charToCheck)) {
            nonStrangers.push(charToCheck);
        } else {
            totalStrangers.push(charToCheck);
        }
    }

    return {
        location,
        nonStrangers,
        totalStrangers,
    };
}
