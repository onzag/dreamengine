import { DEngine } from "../index.js";
import { makeTimestamp } from "./messages.js";
import { getWearableFitment, locationPathToMessage } from "./weight-and-volume.js";
import { getWeatherSystemForLocationAndWeather } from "./world.js";

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
export function getCurrentlyInteractingCharacters(engine, characterName) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    // find the current conversation the character is engaging at
    const charState = engine.deObject.stateFor[characterName];

    if (!charState) {
        throw new Error(`Character ${characterName} not found in engine state.`);
    }

    const convId = charState.conversationId;

    if (!convId) {
        return [];
    }

    const conversation = engine.deObject.conversations[convId];
    if (!conversation) {
        return [];
    }

    return conversation.participants.filter(participant => participant !== characterName);
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
 * @param {boolean} hideCurrentPosture
 * @returns {Promise<string>}
 */
export async function getExternalDescriptionOfCharacter(engine, characterName, onlyBasics = false, hideCurrentPosture = false) {
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

    for (const state of characterState.states) {
        const stateInfo = character.states[state.state];

        let dominanceOfThisState = stateInfo.dominance;
        if (state.relieving && typeof stateInfo.dominanceAfterRelief === "number") {
            dominanceOfThisState = stateInfo.dominanceAfterRelief;
        }

        if (dominanceOfThisState < maxStateDominance && stateInfo.doNotIgnoreDominanceWhenInjectingExternalDescription) {
            continue;
        }

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

    finalDescription += " " + getExternalDescriptionOfCharacterPostureOnly(engine, characterName, hideCurrentPosture);

    return finalDescription;
}

/**
 * @param {DEngine} engine
 * @param {string} characterName 
 * @param {boolean} hideCurrentPosture
 * @returns {string}
 */
export function getExternalDescriptionOfCharacterPostureOnly(engine, characterName, hideCurrentPosture = false) {
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

    const posturesThatDoNotSpecifyGround = [
        "standing",
        "flying",
        "floating",
        "swimming",
    ]

    const characterExactLocation = getCharacterExactLocation(engine, characterName);

    let postureAppliedOnDescription = (posturesThatDoNotSpecifyGround.includes(characterState.posture)) ? "at the " + characterState.locationSlot : "on the ground at the " + characterState.locationSlot;
    if (characterExactLocation.itemPathEnd === "ontopCharacters" && characterExactLocation.itemPath) {
        postureAppliedOnDescription = locationPathToMessage(engine, characterName, characterState.location, [...characterExactLocation.itemPath, characterExactLocation.itemPathEnd]);
    } else if (characterExactLocation.itemPathEnd === "containingCharacters" && characterExactLocation.itemPath) {
        postureAppliedOnDescription = locationPathToMessage(engine, characterName, characterState.location, [...characterExactLocation.itemPath, characterExactLocation.itemPathEnd]);
    }

    if (!hideCurrentPosture) {
        return character.name + " is currently " + postureToText(characterState.posture) + " " + postureAppliedOnDescription + ".";
    } else {
        return character.name + " is currently " + postureAppliedOnDescription + ".";
    }
}

/**
 * 
 * @param {DEPosture} posture 
 */
export function postureToText(posture) {
    switch (posture) {
        case "lying_down":
            return "lying down";
        case "lying_down+belly_down":
            return "lying down on the belly";
        case "lying_down+belly_up":
            return "lying down on the back";
        case "on_all_fours":
            return "on all fours";
        default:
            return posture;
    }
}

const allPostures = [
    "standing",
    "crawling",
    "climbing",
    "sitting",
    "lying_down",
    "lying_down+belly_up",
    "lying_down+belly_down",
    "on_all_fours",
    "crouching",
    "kneeling",
    "hanging",
    "floating",
    "flying",
    "swimming",
]

export function getBasicPostures() {
    return allPostures.filter(posture => !posture.includes("+"));
}

/**
 * @param {DEPosture} posture 
 */
export function getExtendedPosturesOf(posture) {
    return allPostures.filter(p => p.startsWith(posture + "+"));
}

/**
 * @type {Record<string, string>}
 */
export const POSTURE_MAP = {};
/**
 * @type {Record<string, string>}
 */
export const REVERSE_POSTURE_MAP = {};
for (const posture of allPostures) {
    // @ts-ignore
    POSTURE_MAP[posture] = postureToText(posture);
    // @ts-ignore
    REVERSE_POSTURE_MAP[postureToText(posture).toLowerCase().replace(/\s+/g, "_")] = posture;
}

/**
 * @param {string} humanReadable 
 */
export function humanReadablePostureToPosture(humanReadable) {
    const normalized = humanReadable.toLowerCase().replace(/\s+/g, "_");
    return REVERSE_POSTURE_MAP[normalized] || null;
}

/**
 * @param {DEngine} engine
 * @param {string} characterName 
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
    /**
     * @type {Array<{
     *   applyingState: DEApplyingState | null,
     *   action: DEActionPromptInjectionWithIntensity | DEActionPromptInjection,
     *   stateInfo: DECharacterStateDefinition | null,
     * }>}
     */
    const actions = [];
    for (const injectable of Object.values(character.actionPromptInjection)) {
        actions.push({
            applyingState: null,
            action: injectable,
            stateInfo: null,
        });
    }
    for (const state of characterState.states) {
        const stateInfo = character.states[state.state];

        let dominanceOfThisState = stateInfo.dominance;
        if (state.relieving && typeof stateInfo.dominanceAfterRelief === "number") {
            dominanceOfThisState = stateInfo.dominanceAfterRelief;
        }

        if (dominanceOfThisState >= maxStateDominance || stateInfo.ignoreDominanceForActionPromptInjection) {
            const origin = state.relieving ? stateInfo.relievingActionPromptInjection : stateInfo.actionPromptInjection;
            if (origin) {
                for (const actionPromptInjectableKey in origin) {
                    const actionPromptInjectable = origin[actionPromptInjectableKey];
                    actions.push({
                        applyingState: state,
                        action: actionPromptInjectable,
                        stateInfo,
                    });
                }
            }
        }

        if (dominanceOfThisState < maxStateDominance && !stateInfo.ignoreDominanceWhenInjectedGeneralCharacterDescription) {
            continue;
        }

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
        actions,
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

/**
 * 
 * @param {DEngine} engine 
 * @param {string} characterName 
 */
export async function getSysPromptForCharacter(engine, characterName) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    if (!engine.inferenceAdapter) {
        throw new Error("DEngine has no inference adapter defined");
    }
    const character = engine.deObject.characters[characterName];
    if (!character) {
        throw new Error(`Character ${characterName} not found.`);
    }

    const characterState = engine.deObject.stateFor[characterName];
    if (!characterState) {
        throw new Error(`No state found for character "${characterName}".`);
    }

    const externalDescription = await getExternalDescriptionOfCharacter(engine, characterName, true);
    const internalDescription = await getInternalDescriptionOfCharacter(engine, characterName);

    /**
     * @type {string|null}
     */
    let lore = null;

    if (engine.deObject.world.lore) {
        // @ts-ignore
        lore = typeof engine.deObject.world.lore === "string" ? engine.deObject.world.lore : await engine.deObject.world.lore(engine.deObject, {
            char: character,
        });
        if (lore.trim().length === 0) {
            lore = null;
        }
    }

    /**
     * @type {Array<string>}
     */
    const interactingCharacters = [];
    const potentialConversationId = engine.deObject.stateFor[characterName].conversationId;
    if (potentialConversationId) {
        const conversation = engine.deObject.conversations[potentialConversationId];
        interactingCharacters.push(...conversation.participants.filter(name => name !== characterName));
    }

    /**
     * @type {Array<string>}
     */
    const worldRules = [];
    if (engine.deObject.worldRules) {
        for (const rule of Object.values(engine.deObject.worldRules)) {
            const ruleText = typeof rule.rule === "string" ? rule.rule : (await rule.rule(engine.deObject, {
                char: character,
            })).trim();
            if (ruleText.length > 0) {
                worldRules.push(ruleText);
            }
        }
    }

    /**
     * @type {Array<string>}
     */
    const characterRules = [];
    if (character.characterRules) {
        for (const rule of Object.values(character.characterRules)) {
            // @ts-ignore
            const ruleText = typeof rule.rule === "string" ? rule.rule : (await rule.rule(engine.deObject, {
                char: character,
            })).trim();
            if (ruleText.length > 0) {
                characterRules.push(ruleText);
            }
        }
    }

    let scenario = "";
    const currentLocation = engine.deObject.world.locations[engine.deObject.stateFor[characterName].location];
    if (currentLocation) {
        scenario = `## Location\n\n${engine.deObject.stateFor[characterName].location}, ` + (typeof currentLocation.description === "string" ? currentLocation.description : await currentLocation.description(engine.deObject, {
            char: character,
        }));
    }
    const currentLocationSlot = currentLocation.slots[engine.deObject.stateFor[characterName].locationSlot];
    if (currentLocationSlot) {
        scenario += `\nSpecifically at: ${engine.deObject.stateFor[characterName].locationSlot}, ` + (typeof currentLocationSlot.description === "string" ? currentLocationSlot.description : await currentLocationSlot.description(engine.deObject, {
            char: character,
        }));
    }

    scenario += `\n\n${await whatIsWeatherLikeForCharacter(engine, characterName)}`;

    scenario += `\n\nCurrent time and date in the world: ${await makeTimestamp(engine, engine.deObject.currentTime, false)}`;
    

    const sysprompt = engine.inferenceAdapter.buildSystemPromptForCharacter(
        character,
        internalDescription.general,
        externalDescription,
        internalDescription.relationships,
        internalDescription.expressiveStates,
        scenario,
        lore,
        interactingCharacters,
        characterRules,
        worldRules,
    );

    return {
        sysprompt,
        internalDescription,
        externalDescription,
        scenario,
        lore,
        interactingCharacters,
        characterRules,
        worldRules,
    };
}

/**
 * @param {DEngine} engine 
 * @param {string} characterName 
 * @returns 
 */
async function whatIsWeatherLikeForCharacter(engine, characterName) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    if (!engine.deObject.stateFor[characterName]) {
        throw new Error(`No state found for character "${characterName}".`);
    }
    const character = engine.deObject.characters[characterName];
    const characterState = engine.deObject.stateFor[characterName];
    const characterLocation = characterState.location;
    const characterLocationSlot = characterState.locationSlot;
    const location = engine.deObject.world.locations[characterLocation];
    const weatherThere = location.currentWeather;
    const isSheltered = await isCharacterShelteredFromWeather(engine, characterName, weatherThere, characterLocation, characterLocationSlot);
    if (isSheltered.fullySheltered) {
        const noEffectDescription = typeof location.currentWeatherNoEffectDescription === "string" ? location.currentWeatherNoEffectDescription : await location.currentWeatherNoEffectDescription(engine.deObject, { char: character });
        return `The current weather where "${characterName}" is (${characterLocation}, ${characterLocationSlot}) is "${weatherThere}". However, "${characterName}" is fully sheltered from its effects. ${isSheltered.reason || ""}, therefore ${noEffectDescription || "no weather effects apply to them."}`;
    } else if (isSheltered.partiallySheltered) {
        const partialEffectDescription = typeof location.currentWeatherPartialEffectDescription === "string" ? location.currentWeatherPartialEffectDescription : await location.currentWeatherPartialEffectDescription(engine.deObject, { char: character });
        return `The current weather where "${characterName}" is (${characterLocation}, ${characterLocationSlot}) is "${weatherThere}". "${characterName}" is partially sheltered from its effects. ${isSheltered.reason || ""}, therefore ${partialEffectDescription || "some weather effects may apply to them."}`;
    } else if (isSheltered.negativelyExposed) {
        const negativeEffectsDescription = typeof location.currentWeatherNegativelyExposedDescription === "string" ? location.currentWeatherNegativelyExposedDescription : await location.currentWeatherNegativelyExposedDescription(engine.deObject, { char: character });
        return `The current weather where "${characterName}" is (${characterLocation}, ${characterLocationSlot}) is "${weatherThere}". "${characterName}" is negatively exposed to its effects. ${isSheltered.reason || ""}, therefore ${negativeEffectsDescription || "strongly negative weather effects apply to them."}`;
    } else {
        const effectDescription = typeof location.currentWeatherFullEffectDescription === "string" ? location.currentWeatherFullEffectDescription : await location.currentWeatherFullEffectDescription(engine.deObject, { char: character });
        return `The current weather where "${characterName}" is (${characterLocation}, ${characterLocationSlot}) is "${weatherThere}". ${isSheltered.reason || ""}, therefore ${effectDescription || "all weather effects apply to them."}`;
    }
}

/**
 * Determines if a character is fully or partially sheltered from a certain weather condition
 * by their current location or surroundings, or by an item they are carrying or wearing.
 * @param {DEngine} engine
 * @param {string} characterName 
 * @param {string} weatherName
 * @param {string} locationName
 * @param {string} slotName
 */
export async function isCharacterShelteredFromWeather(engine, characterName, weatherName, locationName, slotName) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    const returnInformation = {
        fullySheltered: false,
        partiallySheltered: false,
        negativelyExposed: false,
        reason: `${characterName} is fully exposed to the weather condition "${weatherName}"`,
    }

    const weatherSystem = getWeatherSystemForLocationAndWeather(engine, locationName, weatherName);

    const character = engine.deObject.characters[characterName];
    if (!character) {
        throw new Error(`Character ${characterName} not found in world.`);
    }

    const locationInfo = engine.deObject.world.locations[locationName];
    if (!locationInfo) {
        throw new Error(`Location ${locationName} not found in world.`);
    }

    const slotInfo = locationInfo.slots[slotName];
    if (!slotInfo) {
        throw new Error(`Slot ${slotName} not found in location ${locationName}.`);
    }

    const characterState = engine.deObject.stateFor[characterName];
    if (!characterState) {
        throw new Error(`Character state for ${characterName} not found.`);
    }

    /**
     * @type {DEItem[]}
     */
    const potentiallyProtectingItemsCharacterIsInsideOf = getAllItemsCharacterIsInsideOf(engine, characterName);

    // FULLY PROTECTED CHECKS
    // check for location based sheltering
    if ((slotInfo.slotFullyBlocksWeather || locationInfo.locationFullyBlocksWeather).includes(weatherName)) {
        returnInformation.fullySheltered = true;
        returnInformation.reason = `The location "${locationName}" fully blocks the weather condition "${weatherName}"`;
        return returnInformation;
    }

    // check if an item the character is carrying or wearing provides full sheltering
    for (const item of characterState.wearing) {
        if (item.wearableProperties?.fullyProtectsFromWeathers?.includes(weatherName)) {
            returnInformation.fullySheltered = true;
            returnInformation.reason = `The item "${item.name}" worn by "${characterName}" fully protects from the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }
    for (const item of characterState.carrying) {
        if (item.carriableProperties?.fullyProtectsFromWeathers?.includes(weatherName)) {
            returnInformation.fullySheltered = true;
            returnInformation.reason = `The item "${item.name}" carried by "${characterName}" fully protects from the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }

    if (weatherSystem.fullyProtectedNaked) {
        returnInformation.fullySheltered = true;
        returnInformation.reason = `Because ${characterName} is naked ${characterName} is immune to the weather condition "${weatherName}"`;
        return returnInformation;
    }
    if (weatherSystem.fullyProtectingWornItems.length > 0) {
        for (const item of characterState.wearing) {
            if (weatherSystem.fullyProtectingWornItems.includes(item.name)) {
                returnInformation.fullySheltered = true;
                returnInformation.reason = `The item "${item.name}" worn by "${characterName}" fully protects from the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }
    }
    if (weatherSystem.fullyProtectingCarriedItems.length > 0) {
        for (const item of characterState.carrying) {
            if (weatherSystem.fullyProtectingCarriedItems.includes(item.name)) {
                returnInformation.fullySheltered = true;
                returnInformation.reason = `The item "${item.name}" carried by "${characterName}" fully protects from the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }
    }
    for (const potentialProtectingItem of potentiallyProtectingItemsCharacterIsInsideOf || []) {
        if (potentialProtectingItem.containerProperties?.fullyProtectsFromWeathers?.includes(weatherName)) {
            returnInformation.fullySheltered = true;
            returnInformation.reason = `The item "${potentialProtectingItem.name}" that "${characterName}" is inside of fully protects from the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }

    if (weatherSystem.fullyProtectingStates.length > 0) {
        for (const state of characterState.states) {
            if (weatherSystem.fullyProtectingStates.includes(state.state)) {
                returnInformation.fullySheltered = true;
                // TODO improve this description of the state
                returnInformation.reason = `Because "${characterName}" is in a state of "${state.state}", ${characterName} is immune to the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }
    }
    if (weatherSystem.fullyProtectedTemplate) {
        const hasFullProtect = typeof weatherSystem.fullyProtectedTemplate === "string" ? weatherSystem.fullyProtectedTemplate : await weatherSystem.fullyProtectedTemplate(engine.deObject, { char: character });
        if (hasFullProtect) {
            returnInformation.fullySheltered = true;
            returnInformation.reason = `Because ${hasFullProtect}, ${characterName} is immune to the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }

    // PARTIALLY PROTECTED CHECKS
    // check for location based sheltering
    if ((slotInfo.slotPartiallyBlocksWeather || locationInfo.locationPartiallyBlocksWeather).includes(weatherName)) {
        returnInformation.partiallySheltered = true;
        returnInformation.reason = `The location "${locationName}" partially blocks the weather condition "${weatherName}"`;
        return returnInformation;
    }

    //check if an item the character is carrying or wearing provides partial sheltering
    for (const item of characterState.wearing) {
        if (item.wearableProperties?.partiallyProtectsFromWeathers?.includes(weatherName)) {
            returnInformation.partiallySheltered = true;
            returnInformation.reason = `The item "${item.name}" worn by "${characterName}" partially protects from the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }
    for (const item of characterState.carrying) {
        if (item.carriableProperties?.partiallyProtectsFromWeathers?.includes(weatherName)) {
            returnInformation.partiallySheltered = true;
            returnInformation.reason = `The item "${item.name}" carried by "${characterName}" partially protects from the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }
    if (weatherSystem.partiallyProtectedNaked) {
        const isNaked = characterState.wearing.filter(item => item.wearableProperties?.coversTopNakedness || item.wearableProperties?.coversBottomNakedness).length === 0;
        if (isNaked) {
            returnInformation.partiallySheltered = true;
            returnInformation.reason = `Because ${characterName} is partially/totally naked, ${characterName} is partially immune to the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }

    if (weatherSystem.partiallyProtectingWornItems.length > 0) {
        for (const item of characterState.wearing) {
            if (weatherSystem.partiallyProtectingWornItems.includes(item.name)) {
                returnInformation.partiallySheltered = true;
                returnInformation.reason = `The item "${item.name}" worn by "${characterName}" partially protects from the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }
    }

    if (weatherSystem.partiallyProtectingCarriedItems.length > 0) {
        for (const item of characterState.carrying) {
            if (weatherSystem.partiallyProtectingCarriedItems.includes(item.name)) {
                returnInformation.partiallySheltered = true;
                returnInformation.reason = `The item "${item.name}" carried by "${characterName}" partially protects from the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }
    }

    for (const potentialProtectingItem of potentiallyProtectingItemsCharacterIsInsideOf || []) {
        if (potentialProtectingItem.containerProperties?.partiallyProtectsFromWeathers?.includes(weatherName)) {
            returnInformation.partiallySheltered = true;
            returnInformation.reason = `The item "${potentialProtectingItem.name}" that "${characterName}" is inside of partially protects from the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }

    if (weatherSystem.partiallyProtectingStates.length > 0) {
        for (const state of characterState.states) {
            if (weatherSystem.partiallyProtectingStates.includes(state.state)) {
                returnInformation.partiallySheltered = true;
                // TODO improve this description of the state
                returnInformation.reason = `Because "${characterName}" is in a state of "${state.state}", ${characterName} is partially protected from the weather condition "${weatherName}".`;
                return returnInformation;
            }
        }
    }

    if (weatherSystem.partiallyProtectedTemplate) {
        const hasPartialEffect = typeof weatherSystem.partiallyProtectedTemplate === "string" ? weatherSystem.partiallyProtectedTemplate : await weatherSystem.partiallyProtectedTemplate(engine.deObject, { char: character });
        if (hasPartialEffect) {
            returnInformation.partiallySheltered = true;
            returnInformation.reason = `Because ${hasPartialEffect}, ${characterName} is partially protected from the weather condition "${weatherName}".`;
            return returnInformation;
        }
    }

    // NEGATIVELY EXPOSED CHECKS
    // check for location based negative exposure
    if ((slotInfo.slotNegativelyExposesCharactersToWeather || locationInfo.locationNegativelyExposesCharactersToWeather).includes(weatherName)) {
        returnInformation.negativelyExposed = true;
        returnInformation.reason = `The location "${locationName}" negatively exposes to the weather condition "${weatherName}".`;
        return returnInformation;
    }

    // check if an item the character is carrying or wearing provides negative exposure
    for (const item of characterState.wearing) {
        if (item.wearableProperties?.negativelyExposesToWeathers?.includes(weatherName)) {
            returnInformation.negativelyExposed = true;
            returnInformation.reason = `The item "${item.name}" worn by "${characterName}" negatively exposes to the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }

    for (const item of characterState.carrying) {
        if (item.carriableProperties?.negativelyExposesToWeathers?.includes(weatherName)) {
            returnInformation.negativelyExposed = true;
            returnInformation.reason = `The item "${item.name}" carried by "${characterName}" negatively exposes to the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }

    if (weatherSystem.negativelyAffectedNaked) {
        const isNaked = characterState.wearing.filter(item => item.wearableProperties?.coversTopNakedness || item.wearableProperties?.coversBottomNakedness).length === 0;
        if (isNaked) {
            returnInformation.negativelyExposed = true;
            returnInformation.reason = `Because ${characterName} is partially/totally naked, ${characterName} is negatively exposed to the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }

    if (weatherSystem.negativelyAffectingWornItems.length > 0) {
        for (const item of characterState.wearing) {
            if (weatherSystem.negativelyAffectingWornItems.includes(item.name)) {
                returnInformation.negativelyExposed = true;
                returnInformation.reason = `The item "${item.name}" worn by "${characterName}" negatively exposes to the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }
    }

    if (weatherSystem.negativelyAffectingCarriedItems.length > 0) {
        for (const item of characterState.carrying) {
            if (weatherSystem.negativelyAffectingCarriedItems.includes(item.name)) {
                returnInformation.negativelyExposed = true;
                returnInformation.reason = `The item "${item.name}" carried by "${characterName}" negatively exposes to the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }
    }

    for (const potentialProtectingItem of potentiallyProtectingItemsCharacterIsInsideOf || []) {
        if (potentialProtectingItem.containerProperties?.negativelyExposesToWeathers?.includes(weatherName)) {
            returnInformation.negativelyExposed = true;
            returnInformation.reason = `The item "${potentialProtectingItem.name}" that "${characterName}" is inside of negatively exposes ${characterName} to the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }

    if (weatherSystem.negativelyAffectingStates.length > 0) {
        for (const state of characterState.states) {
            if (weatherSystem.negativelyAffectingStates.includes(state.state)) {
                returnInformation.negativelyExposed = true;
                // TODO improve this description of the state
                returnInformation.reason = `Because "${characterName}" is in a state of "${state.state}", ${characterName} is negatively exposed to the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }
    }

    if (weatherSystem.negativelyAffectedTemplate) {
        const hasNegativeEffect = typeof weatherSystem.negativelyAffectedTemplate === "string" ? weatherSystem.negativelyAffectedTemplate : await weatherSystem.negativelyAffectedTemplate(engine.deObject, { char: character });
        if (hasNegativeEffect) {
            returnInformation.negativelyExposed = true;
            returnInformation.reason = `Because ${hasNegativeEffect}, ${characterName} is negatively exposed to the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }

    return returnInformation;
}