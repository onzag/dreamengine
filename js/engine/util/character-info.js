import { DEngine } from "../index.js";
import { getWearableFitment, locationPathToMessage } from "./weight-and-volume.js";

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

/**
 * @param {DEngine} engine 
 * @param {string} characterName 
 */
export function getPowerLevel(engine, characterName) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    const character = engine.deObject.characters[characterName];
    if (!character) {
        throw new Error(`Character ${characterName} not found in engine.`);
    }

    return getPowerLevelFromCharacter(character);
}

/**
 * @param {DECompleteCharacterReference} character
 */
export function getPowerLevelFromCharacter(character) {
    const baseMultipliers = {
        "insect": 1,
        "critter": 2,
        "human": 3,
        "apex": 4,
        "street_level": 5,
        "block_level": 6,
        "city_level": 7,
        "country_level": 8,
        "continental": 9,
        "planetary": 10,
        "stellar": 11,
        "galactic": 12,
        "universal": 13,
        "multiversal": 14,
        "limitless": 15
    };

    const powerLevel = (baseMultipliers[character.tier] || 1) * (character.tierValue || 1);
    return powerLevel;
}

/**
 * @param {DEngine} engine
 * @param {string} characterName 
 * @param {boolean} onlyBasics
 * @returns {Promise<string>}
 */
export async function getExternalDescriptionOfCharacter(engine, characterName, onlyBasics = false) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    const character = engine.deObject.characters[characterName];
    if (!character) {
        throw new Error(`Character ${characterName} not found.`);
    }
    const characterState = engine.deObject.stateFor[characterName];
    if (!characterState) {
        throw new Error(`Character state for ${characterName} not found.`);
    }
    let finalDescription = character.shortDescription;
    if (!finalDescription.endsWith(".")) {
        finalDescription += ".";
    }

    for (const state of characterState.states) {
        const stateInfo = character.states[state.state];
        let toAdd = "";
        if (stateInfo.relieving) {
            if (stateInfo.relievingGeneralCharacterExternalDescriptionInjection) {
                if (typeof stateInfo.relievingGeneralCharacterExternalDescriptionInjection === "string") {
                    toAdd = stateInfo.relievingGeneralCharacterExternalDescriptionInjection;
                } else {
                    toAdd = await stateInfo.relievingGeneralCharacterExternalDescriptionInjection(engine.deObject, {
                        char: character,
                        causants: state.causants || undefined,
                    });
                }
            }
        } else {
            if (stateInfo.generalCharacterExternalDescriptionInjection) {
                if (typeof stateInfo.generalCharacterExternalDescriptionInjection === "string") {
                    toAdd = stateInfo.generalCharacterExternalDescriptionInjection;
                } else {
                    toAdd = await stateInfo.generalCharacterExternalDescriptionInjection(engine.deObject, {
                        char: character,
                        causants: state.causants || undefined,
                    });
                }
            }
        }


        toAdd = toAdd.trim();
        if (toAdd) {
            if (!toAdd.endsWith(".")) {
                toAdd += ".";
            }
            finalDescription += " " + toAdd;
        }
    }

    const topNaked = isTopNaked(engine, characterName);
    const bottomNaked = isBottomNaked(engine, characterName);

    const hasItemsCoveringTopNakedness = !topNaked;
    if (!hasItemsCoveringTopNakedness && character.shortDescriptionTopNakedAdd) {
        finalDescription += ` ${character.shortDescriptionTopNakedAdd}`;
        if (!finalDescription.endsWith(".")) {
            finalDescription += ".";
        }
    }
    const hasItemsCoveringBottomNakedness = !bottomNaked;
    if (!hasItemsCoveringBottomNakedness && character.shortDescriptionBottomNakedAdd) {
        finalDescription += ` ${character.shortDescriptionBottomNakedAdd}`;
        if (!finalDescription.endsWith(".")) {
            finalDescription += ".";
        }
    }
    if (characterState.wearing.length > 0) {
        finalDescription += " Wearing " + engine.deObject.functions.format_and(engine.deObject, null, characterState.wearing.map(item => item.amount >= 2 ? item.amount + " of " + item.description + " (" + getWearableFitment(engine, item, characterName).fitment + ")" : item.description + " (" + getWearableFitment(engine, item, characterName).fitment + ")")) + ".";
    } else {
        finalDescription += " Not wearing any clothes or accessories.";
    }

    const characterExactLocation = getCharacterExactLocation(engine, characterName);

    if (!onlyBasics) {
        if (characterState.carrying.length > 0) {
            finalDescription += " Carrying " + engine.deObject.functions.format_and(engine.deObject, null, characterState.carrying.map(item => item.amount >= 2 ? item.amount + " of " + item.description : item.description)) + ".";
        } else {
            finalDescription += " Not carrying any items.";
        }

        if (characterExactLocation.beingCarriedBy) {
            finalDescription += ` Being carried by ${characterExactLocation.beingCarriedBy}.`;
        }

        const carriedCharacters = getListOfCarriedCharactersByCharacter(engine, characterName);
        if (carriedCharacters.length > 0) {
            finalDescription += ` Carrying characters: ` + engine.deObject.functions.format_and(engine.deObject, null, carriedCharacters.map((v) => v.carriedName)) + ".";
        }
    }

    const posturesThatDoNotSpecifyGround = [
        "standing",
        "flying",
        "floating",
        "swimming",
    ]

    let postureAppliedOnDescription = (posturesThatDoNotSpecifyGround.includes(characterState.posture)) ? "at the " + characterState.locationSlot : "on the ground at the " + characterState.locationSlot;
    if (characterExactLocation.itemPathEnd === "ontopCharacters" && characterExactLocation.itemPath) {
        postureAppliedOnDescription = locationPathToMessage(engine, characterName, characterState.location, [...characterExactLocation.itemPath, characterExactLocation.itemPathEnd]);
    } else if (characterExactLocation.itemPathEnd === "containingCharacters" && characterExactLocation.itemPath) {
        postureAppliedOnDescription = locationPathToMessage(engine, characterName, characterState.location, [...characterExactLocation.itemPath, characterExactLocation.itemPathEnd]);
    }

    finalDescription += " " + character.name + " is currently " + characterState.posture.replace("_", " ") + " " + postureAppliedOnDescription + ".";

    return finalDescription;
}

/**
 * @param {DEngine} engine
 * @param {string} characterName 
 * @returns {Promise<{
 *   general: string,
 *   expressiveStates: string[],
 *   relationships: string[],
 *   stateDominance: number,
 *   applyingStates: DEApplyingState[],
 *   rejectedStates: DEApplyingState[],
 * }>} complete description, list of states, list of relationships
 */
export async function getInternalDescriptionOfCharacter(engine, characterName) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }

    const character = engine.deObject.characters[characterName];
    if (!character) {
        throw new Error(`Character ${characterName} not found.`);
    }

    const characterState = engine.deObject.stateFor[characterName];
    if (!characterState) {
        throw new Error(`Character state for ${characterName} not found.`);
    }

    let general = typeof character.general === "string" ? character.general : await character.general(engine.deObject, {
        char: character,
    });

    for (const injectable of Object.values(character.generalCharacterDescriptionInjection)) {
        const injectableV = typeof injectable === "string" ? injectable : await injectable(engine.deObject, {
            char: character,
        });
        if (injectableV) {
            if (!general.endsWith("\n\n")) {
                general += "\n\n";
            }
            general += injectableV;
        }
    }

    const applyingStates = [];
    const rejectedStates = [];

    let maxStateDominance = 0;
    for (const state of characterState.states) {
        const stateInfo = character.states[state.state];
        let dominanceOfThisState = stateInfo.dominance;
        if (state.relieving && typeof stateInfo.dominanceAfterRelief === "number") {
            dominanceOfThisState = stateInfo.dominanceAfterRelief;
        }
        if (dominanceOfThisState > maxStateDominance) {
            maxStateDominance = dominanceOfThisState;
        }
    }

    /**
     * @type {string[]}
     */
    const statesDescriptions = [];
    for (const state of characterState.states) {
        const stateInfo = character.states[state.state];

        let dominanceOfThisState = stateInfo.dominance;
        if (state.relieving && typeof stateInfo.dominanceAfterRelief === "number") {
            dominanceOfThisState = stateInfo.dominanceAfterRelief;
        }

        if (dominanceOfThisState < maxStateDominance) {
            rejectedStates.push(state);
            continue;
        }

        applyingStates.push(state);

        let stateDescription = stateInfo.behaviourType !== "HIDDEN" ? state.state.split("_").map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ") : null;
        if (!state.relieving) {
            if (stateInfo.behaviourType === "INTENSITY_EXPRESSIVE") {
                if (state.intensity >= 1.5) {
                    stateDescription = `Very ${stateDescription}`;
                } else if (state.intensity >= 2.5) {
                    stateDescription = `Extremely ${stateDescription}`;
                } else if (state.intensity >= 3.5) {
                    stateDescription = `Overwhelmingly ${stateDescription}`;
                }
            }

            if (stateInfo.relievingGeneralCharacterDescriptionInjection) {
                const relievingInjection = typeof stateInfo.relievingGeneralCharacterDescriptionInjection === "string" ? stateInfo.relievingGeneralCharacterDescriptionInjection : (await stateInfo.relievingGeneralCharacterDescriptionInjection(engine.deObject, {
                    char: character,
                })).trim();
                if (relievingInjection) {
                    if (!general.endsWith("\n\n")) {
                        general += "\n\n";
                    }
                    general += relievingInjection;
                }
            }
        } else {
            if (stateInfo.behaviourType !== "HIDDEN") {
                if (state.intensity >= 1.5) {
                    stateDescription = `Relieving from being ${stateDescription}, nonetheless still ${stateDescription}`;
                } else if (state.intensity >= 2.5) {
                    stateDescription = `Relieving from being ${stateDescription}, nonetheless still Very ${stateDescription}`;
                } else if (state.intensity >= 3.5) {
                    stateDescription = `Relieving from being ${stateDescription}, nonetheless still Extremely ${stateDescription}`;
                }
            }

            if (stateInfo.generalCharacterDescriptionInjection) {
                const injection = typeof stateInfo.generalCharacterDescriptionInjection === "string" ? stateInfo.generalCharacterDescriptionInjection : (await stateInfo.generalCharacterDescriptionInjection(engine.deObject, {
                    char: character,
                })).trim();
                if (injection) {
                    if (!general.endsWith("\n\n")) {
                        general += "\n\n";
                    }
                    general += injection;
                }
            }
        }

        if (stateDescription) {
            statesDescriptions.push(stateDescription);
        }
    }

    const bonds = engine.deObject.social.bonds[characterName];
    /**
     * @type {string[]}
     */
    const relationships = [];

    for (const activeBond of bonds.active) {
        if (!character.bonds) {
            throw new Error(`Character ${characterName} has no bonds defined.`);
        }
        const bondDeclaration = character.bonds.declarations.find(bondDecl => bondDecl.strangerBond === activeBond.stranger && bondDecl.minBondLevel <= activeBond.bond && activeBond.bond < (bondDecl.maxBondLevel === 100 ? 200 : bondDecl.maxBondLevel) && bondDecl.min2BondLevel <= activeBond.bond2 && activeBond.bond2 < (bondDecl.max2BondLevel === 100 ? 200 : bondDecl.max2BondLevel));
        if (bondDeclaration) {
            let result = typeof bondDeclaration.description === "string" ? bondDeclaration.description : (await bondDeclaration.description(engine.deObject, {
                char: character,
                other: engine.deObject.characters[activeBond.towards],
            })).trim();
            if (bondDeclaration.bondAdditionalDescription) {
                if (!result.endsWith(". ")) {
                    result += ". ";
                } else if (!result.endsWith(" ")) {
                    result += " ";
                }
                result += typeof bondDeclaration.bondAdditionalDescription === "string" ? bondDeclaration.bondAdditionalDescription : (await bondDeclaration.bondAdditionalDescription(engine.deObject, {
                    char: character,
                    other: engine.deObject.characters[activeBond.towards],
                })).trim();
            }
            relationships.push(result);

            if (bondDeclaration.generalCharacterDescriptionInjection) {
                const injection = typeof bondDeclaration.generalCharacterDescriptionInjection === "string" ? bondDeclaration.generalCharacterDescriptionInjection : (await bondDeclaration.generalCharacterDescriptionInjection(engine.deObject, {
                    char: character,
                    other: engine.deObject.characters[activeBond.towards],
                })).trim();
                if (injection) {
                    if (!general.endsWith("\n\n")) {
                        general += "\n\n";
                    }
                    general += injection;
                }
            }
        }
    }

    // ex bonds only inject system prompts, as they are not active relationships but ex-relationships
    // they may be mourning or have other effects on the character's mindset so only relevant to system prompt injections
    for (const exBond of bonds.ex) {
        if (!character.bonds) {
            throw new Error(`Character ${characterName} has no bonds defined.`);
        }
        const bondDeclaration = character.bonds.declarations.find(bondDecl => bondDecl.strangerBond === exBond.stranger && bondDecl.minBondLevel <= exBond.bond && exBond.bond < (bondDecl.maxBondLevel === 100 ? 200 : bondDecl.maxBondLevel) && bondDecl.min2BondLevel <= exBond.bond2 && exBond.bond2 < (bondDecl.max2BondLevel === 100 ? 200 : bondDecl.max2BondLevel));
        if (bondDeclaration) {
            if (bondDeclaration.generalCharacterDescriptionInjectionEx) {
                const injection = typeof bondDeclaration.generalCharacterDescriptionInjectionEx === "string" ? bondDeclaration.generalCharacterDescriptionInjectionEx : (await bondDeclaration.generalCharacterDescriptionInjectionEx(engine.deObject, {
                    char: character,
                    other: engine.deObject.characters[exBond.towards],
                })).trim();
                if (injection) {
                    if (!general.endsWith("\n\n")) {
                        general += "\n\n";
                    }
                    general += injection;
                }
            }
        }
    }

    // make final descriptions for total strangers for the standard stranger bond
    if (!character.bonds) {
        throw new Error(`Character ${characterName} has no bonds defined.`);
    }
    const strangerBondDeclaration = character.bonds.declarations.find(bondDecl => bondDecl.strangerBond === true && bondDecl.minBondLevel <= 0 && 0 < (bondDecl.maxBondLevel === 100 ? 200 : bondDecl.maxBondLevel) && bondDecl.min2BondLevel <= 0 && 0 < (bondDecl.max2BondLevel === 100 ? 200 : bondDecl.max2BondLevel));
    if (strangerBondDeclaration) {
        // these do apply to all the total strangers
        const surroundingChars = getSurroundingCharacters(engine, characterName);
        const allSurroundingTotalStrangers = surroundingChars.totalStrangers;
        for (const strangerName of allSurroundingTotalStrangers) {
            const strangerCharacter = engine.deObject.characters[strangerName];
            if (strangerCharacter) {
                let result = typeof strangerBondDeclaration.description === "string" ? strangerBondDeclaration.description : (await strangerBondDeclaration.description(engine.deObject, {
                    char: character,
                    other: strangerCharacter,
                })).trim();
                if (strangerBondDeclaration.bondAdditionalDescription) {
                    if (!result.endsWith(". ")) {
                        result += ". ";
                    } else if (!result.endsWith(" ")) {
                        result += " ";
                    }
                    result += typeof strangerBondDeclaration.bondAdditionalDescription === "string" ? strangerBondDeclaration.bondAdditionalDescription : (await strangerBondDeclaration.bondAdditionalDescription(engine.deObject, {
                        char: character,
                        other: strangerCharacter,
                    })).trim();
                }
                relationships.push(result);
            }

            if (strangerBondDeclaration.generalCharacterDescriptionInjection) {
                const injection = typeof strangerBondDeclaration.generalCharacterDescriptionInjection === "string" ? strangerBondDeclaration.generalCharacterDescriptionInjection : (await strangerBondDeclaration.generalCharacterDescriptionInjection(engine.deObject, {
                    char: character,
                    other: strangerCharacter,
                })).trim();
                if (injection) {
                    if (!general.endsWith("\n\n")) {
                        general += "\n\n";
                    }
                    general += injection;
                }
            }
        }
    }

    return {
        general: general.trim(),
        expressiveStates: statesDescriptions,
        relationships,
        stateDominance: maxStateDominance,
        applyingStates,
        rejectedStates,
    };
}

/**
 * @param {DECompleteCharacterReference} character 
 * @param {DESingleBondDescription} bond 
 */
export function getBondDeclarationFromBondDescription(character, bond) {
    if (!character.bonds || !character.bonds.declarations) {
        return null;
    }
    const bondDeclaration =
        character.bonds.declarations.find(bondDecl => bondDecl.strangerBond === bond.stranger && bondDecl.minBondLevel <= bond.bond && bond.bond < (bondDecl.maxBondLevel === 100 ? 200 : bondDecl.maxBondLevel) && bondDecl.min2BondLevel <= bond.bond2 && bond.bond2 < (bondDecl.max2BondLevel === 100 ? 200 : bondDecl.max2BondLevel));

    if (!bondDeclaration) {
        return null;
    }
    return bondDeclaration;
}