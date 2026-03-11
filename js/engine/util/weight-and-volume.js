import { DEngine } from "../index.js";

/**
 * @param {DEngine} engine 
 * @param {string} characterName 
 */
export function getCharacterWeight(engine, characterName) {
    if (!engine.deObject?.characters?.[characterName]) {
        throw new Error(`Character ${characterName} not found in engine`);
    }
    let singularWeight = 0;

    const character = engine.deObject.characters[characterName];
    const charState = engine.deObject.stateFor[characterName];
    singularWeight += character.weightKg;

    for (const childItem of charState.wearing) {
        const results = getItemWeight(engine, childItem);
        singularWeight += results.completeWeight;
    }
    for (const childItem of charState.carrying) {
        const results = getItemWeight(engine, childItem);
        singularWeight += results.completeWeight;
    }
    for (const directlyCarried of charState.carryingCharactersDirectly) {
        const results = getCharacterWeight(engine, directlyCarried);
        singularWeight += results.weight;
    }
    return {
        weight: singularWeight
    }
}

/**
 * @param {DEngine} engine 
 * @param {string} characterName 
 */
export function getCharacterVolume(engine, characterName) {
    if (!engine.deObject?.characters?.[characterName]) {
        throw new Error(`Character ${characterName} not found in engine`);
    }
    let singularVolume = 0;

    const character = engine.deObject.characters[characterName];
    const charState = engine.deObject.stateFor[characterName];
    singularVolume += character.weightKg; // assume water density, so same as weight in kg

    for (const childItem of charState.wearing) {
        if (childItem.wearableProperties) {
            singularVolume += childItem.wearableProperties.extraBodyVolumeWhenWornLiters;
        }
    }
    for (const childItem of charState.carrying) {
        const results = getItemVolume(engine, childItem);
        singularVolume += results.completeVolume;
    }
    for (const directlyCarried of charState.carryingCharactersDirectly) {
        const results = getCharacterVolume(engine, directlyCarried);
        singularVolume += results.volume;
    }
    return {
        volume: singularVolume
    }
}

/**
 * @param {DEngine} engine
 * @param {DEItem} item 
 */
export function getItemWeight(engine, item) {
    let singularWeight = 0;

    if (item.amount === 0) {
        return {
            singularWeight: 0,
            completeWeight: 0,
            amount: 0,
            allCharactersInvolved: [],
            charactersOnlyDirectlyInside: [],
            charactersOnlyDirectlyOnTop: [],
        }
    }

    singularWeight += item.weightKg;

    /**
     * @type {string[]}
     */
    const charactersOnlyDirectlyInside = [];
    /**
     * @type {string[]}
     */
    const charactersOnlyDirectlyOnTop = [];
    /**
     * @type {string[]}
     */
    const allCharactersInvolved = [];

    for (const childItem of item.containing) {
        const results = getItemWeight(engine, childItem);
        allCharactersInvolved.push(...results.allCharactersInvolved, ...results.charactersOnlyDirectlyInside, ...results.charactersOnlyDirectlyOnTop);
        singularWeight += results.completeWeight;
    }
    for (const childItem of item.ontop) {
        const results = getItemWeight(engine, childItem);
        allCharactersInvolved.push(...results.allCharactersInvolved, ...results.charactersOnlyDirectlyInside, ...results.charactersOnlyDirectlyOnTop);
        singularWeight += results.completeWeight;
    }
    for (const character of item.ontopCharacters) {
        const results = getCharacterWeight(engine, character);
        charactersOnlyDirectlyOnTop.push(character);
        allCharactersInvolved.push(character);
        singularWeight += results.weight;
    }
    for (const character of item.containingCharacters) {
        const results = getCharacterWeight(engine, character);
        charactersOnlyDirectlyInside.push(character);
        allCharactersInvolved.push(character);
        singularWeight += results.weight;
    }

    return {
        singularWeight,
        completeWeight: singularWeight * item.amount,
        amount: item.amount,
        allCharactersInvolved,
        charactersOnlyDirectlyInside,
        charactersOnlyDirectlyOnTop,
    }
}

/**
 * @param {DEngine} engine
 * @param {DEItem} item 
 */
export function getItemVolume(engine, item) {
    let singularVolume = 0;

    if (item.amount === 0) {
        return {
            singularVolume: 0,
            completeVolume: 0,
            amount: 0,
            allCharactersInvolved: [],
            charactersOnlyDirectlyInside: [],
            charactersOnlyDirectlyOnTop: [],
        }
    }

    /**
     * @type {string[]}
     */
    const charactersOnlyDirectlyOnTop = [];
    /**
     * @type {string[]}
     */
    const charactersOnlyDirectlyInside = [];
    /**
     * @type {string[]}
     */
    const allCharactersInvolved = [];

    singularVolume += item.volumeLiters;
    const isRigid = item.containerProperties ? item.containerProperties.structure === "rigid" : true;
    for (const childItem of item.containing) {
        const results = getItemVolume(engine, childItem);
        allCharactersInvolved.push(...results.allCharactersInvolved, ...results.charactersOnlyDirectlyInside, ...results.charactersOnlyDirectlyOnTop);
        if (!isRigid) {
            singularVolume += results.completeVolume;
        }
    }
    for (const character of item.containingCharacters) {
        const results = getCharacterVolume(engine, character);
        allCharactersInvolved.push(character);
        charactersOnlyDirectlyInside.push(character);
        if (!isRigid) {
            singularVolume += results.volume;
        }
    }
    for (const childItem of item.ontop) {
        const results = getItemVolume(engine, childItem);
        allCharactersInvolved.push(...results.allCharactersInvolved, ...results.charactersOnlyDirectlyInside, ...results.charactersOnlyDirectlyOnTop);
        singularVolume += results.completeVolume;
    }
    for (const character of item.ontopCharacters) {
        allCharactersInvolved.push(character);
        charactersOnlyDirectlyOnTop.push(character);
        const results = getCharacterVolume(engine, character);
        singularVolume += results.volume;
    }

    return {
        singularVolume,
        completeVolume: singularVolume * item.amount,
        amount: item.amount,
        allCharactersInvolved,
        charactersOnlyDirectlyInside,
        charactersOnlyDirectlyOnTop,
    }
}

/**
 * 
 * @param {DEngine} engine 
 * @param {string} characterName 
 */
export function getCharacterCarryingCapacity(engine, characterName) {
    if (!engine.deObject?.characters?.[characterName]) {
        throw new Error(`Character ${characterName} not found in engine`);
    }

    const character = engine.deObject.characters[characterName];
    let carryingCapacityKg = character.carryingCapacityKg;
    let carryingCapacityLiters = character.carryingCapacityLiters;

    const wearableItems = engine.deObject.stateFor[characterName].wearing;
    for (const item of wearableItems) {
        if (item.wearableProperties) {
            carryingCapacityKg += item.wearableProperties.addedCarryingCapacityKg;
            carryingCapacityLiters += item.wearableProperties.addedCarryingCapacityLiters;
        }
    }

    return {
        carryingCapacityKg,
        carryingCapacityLiters,
    };
}

/**
 * @param {DEngine} engine 
 * @param {DEItem} item 
 */
export function getItemExcessElements(engine, item) {
    const capacityInVolume = item.containerProperties ? item.containerProperties.capacityKg : 0;
    const capacityInWeight = item.containerProperties ? item.containerProperties.capacityLiters : 0;

    const capacityOnTopWeight = item.maxWeightOnTopKg ? item.maxWeightOnTopKg : 0;
    const capacityOnTopVolume = item.maxVolumeOnTopLiters ? item.maxVolumeOnTopLiters : 0;
    // first we do weight, which would cause the item to break, so everything falls off

    const sortedByJustPlacedContaining = item.containing.slice().sort((a, b) => {
        // @ts-ignore
        const aJustPlaced = a._just_placed ? 0 : 1;
        // @ts-ignore
        const bJustPlaced = b._just_placed ? 0 : 1;
        return bJustPlaced - aJustPlaced; // just placed items go last, so they get expelled first if over capacity, otherwise they would never get expelled since they are the last ones to be added
    });
    const sortedByJustPlacedOntop = item.ontop.slice().sort((a, b) => {
        // @ts-ignore
        const aJustPlaced = a._just_placed ? 0 : 1;
        // @ts-ignore
        const bJustPlaced = b._just_placed ? 0 : 1;
        return bJustPlaced - aJustPlaced; // just placed items go last, so they get expelled first if over capacity, otherwise they would never get expelled since they are the last ones to be added
    });

    let carriedWeight = 0;
    let ontopWeight = 0;
    let isOverweightAndBreaks = false;
    let breakReasonsItemsAndCharacters = [];
    for (const childItem of sortedByJustPlacedContaining) {
        const results = getItemWeight(engine, childItem);
        if (carriedWeight + results.completeWeight > capacityInWeight) {
            isOverweightAndBreaks = true;
            breakReasonsItemsAndCharacters.push(childItem.name);
        } else {
            carriedWeight += results.completeWeight;
        }
    }

    for (const childCharacter of item.containingCharacters) {
        const results = getCharacterWeight(engine, childCharacter);
        if (carriedWeight + results.weight > capacityInWeight) {
            isOverweightAndBreaks = true;
            breakReasonsItemsAndCharacters.push(childCharacter);
        } else {
            carriedWeight += results.weight;
        }
    }

    if (isOverweightAndBreaks) {
        return {
            expelledContainedCharacters: item.containingCharacters,
            expelledOntopCharacters: item.ontopCharacters,
            expelledContainedItems: item.containing.map(i => ({
                item: i,
                amount: i.amount,
            })),
            expelledOntopItems: item.ontop.map(i => ({
                item: i,
                amount: i.amount,
            })),
            breaks: true,
            breakStyle: "overweight",
            breakReason: `${engine.deObject?.functions.format_and(engine.deObject, null, breakReasonsItemsAndCharacters)} causes ${item.name} to be overweight and break`,
        }
    }

    for (const childItem of sortedByJustPlacedOntop) {
        const results = getItemWeight(engine, childItem);
        if (ontopWeight + results.completeWeight > capacityOnTopWeight) {
            isOverweightAndBreaks = true;
            breakReasonsItemsAndCharacters.push(childItem.name);
        } else {
            ontopWeight += results.completeWeight;
        }
    }

    for (const childCharacter of item.ontopCharacters) {
        const results = getCharacterWeight(engine, childCharacter);
        if (ontopWeight + results.weight > capacityOnTopWeight) {
            isOverweightAndBreaks = true;
            breakReasonsItemsAndCharacters.push(childCharacter);
        } else {
            ontopWeight += results.weight;
        }
    }

    if (isOverweightAndBreaks) {
        return {
            expelledContainedCharacters: item.containingCharacters,
            expelledOntopCharacters: item.ontopCharacters,
            expelledContainedItems: item.containing.map(i => ({
                item: i,
                amount: i.amount,
            })),
            expelledOntopItems: item.ontop.map(i => ({
                item: i,
                amount: i.amount,
            })),
            breaks: true,
            breakStyle: "crushed",
            breakReason: `${engine.deObject?.functions.format_and(engine.deObject, null, breakReasonsItemsAndCharacters)} causes ${item.name} to be overloaded and break`,
        }
    }

    // now we have handled everything that causes the item to break, when volume is the question, the item would just be expelled or fall down

    const expelledContainedCharacters = [];
    const expelledOntopCharacters = [];
    const expelledContainedItems = [];
    const expelledOntopItems = [];

    let carriedVolume = 0;
    let ontopVolume = 0;

    for (const childItem of sortedByJustPlacedContaining) {
        const results = getItemVolume(engine, childItem);
        const remainingCapacity = capacityInVolume - carriedVolume;
        const howManyCanFit = Math.floor(remainingCapacity / (results.completeVolume / (results.amount || 1)));
        if (howManyCanFit <= 0) {
            expelledContainedItems.push({
                item: childItem,
                amount: childItem.amount,
            });
        } else if (howManyCanFit < (childItem.amount || 1)) {
            expelledContainedItems.push({
                item: childItem,
                amount: (childItem.amount || 1) - howManyCanFit,
            });
            carriedVolume += howManyCanFit * results.singularVolume;
        } else {
            carriedVolume += results.completeVolume;
        }
    }

    for (const childCharacter of item.containingCharacters) {
        const results = getCharacterVolume(engine, childCharacter);
        if (carriedVolume + results.volume > capacityInVolume) {
            expelledContainedCharacters.push(childCharacter);
        } else {
            carriedVolume += results.volume;
        }
    }

    for (const childItem of sortedByJustPlacedOntop) {
        const results = getItemVolume(engine, childItem);
        const remainingCapacity = capacityOnTopVolume - ontopVolume;
        const howManyCanFit = Math.floor(remainingCapacity / (results.completeVolume / (results.amount || 1)));
        if (howManyCanFit <= 0) {
            expelledOntopItems.push({
                item: childItem,
                amount: childItem.amount,
            });
        } else if (howManyCanFit < (childItem.amount || 1)) {
            expelledOntopItems.push({
                item: childItem,
                amount: (childItem.amount || 1) - howManyCanFit,
            });
            ontopVolume += howManyCanFit * results.singularVolume;
        } else {
            ontopVolume += results.completeVolume;
        }
    }

    for (const childCharacter of item.ontopCharacters) {
        const results = getCharacterVolume(engine, childCharacter);
        if (ontopVolume + results.volume > capacityOnTopVolume) {
            expelledOntopCharacters.push(childCharacter);
        } else {
            ontopVolume += results.volume;
        }
    }

    return {
        expelledContainedCharacters,
        expelledOntopCharacters,
        expelledContainedItems,
        expelledOntopItems,
        breaks: false,
        breakStyle: null,
        breakReason: null,
    }
}

/** 
 * @param {DEngine} engine 
 * @param {DEItem} item 
 * @param {string} character
 * @param {boolean} [isNotBeingCurrentlyWorn] this is used for example when we want to check the fitment of an item that is currently being worn, in that case we want to ignore the extra body volume that it provides, because it is already being worn, so it is not providing that extra body volume to itself
 * @returns {{
 *       fitment: string,
 *       shouldFallDown: boolean,
 *       shouldBreak: boolean,
 *    }}
 */
export function getWearableFitment(engine, item, character, isNotBeingCurrentlyWorn = false) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    if (item.wearableProperties) {
        let extraAddedExtraTraitsAtTheEnd = []
        for (const trait of item.wearableProperties.otherFitmentTraitsAny || []) {
            extraAddedExtraTraitsAtTheEnd.push(trait);
        }

        let removeBodyVolume = item.wearableProperties.extraBodyVolumeWhenWornLiters || 0;
        let totalBodyVolume = engine.deObject.characters[character].weightKg; // assume water density, so same as weight in kg
        const currentlyWornItems = engine.deObject.stateFor[character].wearing;
        for (const wornItem of currentlyWornItems) {
            if (wornItem.wearableProperties) {
                totalBodyVolume += wornItem.wearableProperties.extraBodyVolumeWhenWornLiters || 0;
            }
        }
        if (!isNotBeingCurrentlyWorn) {
            totalBodyVolume -= removeBodyVolume;
        }
        const minSizePerfectFit = item.wearableProperties.volumeRangeMinLiters;
        const maxSizePerfectFit = item.wearableProperties.volumeRangeMaxLiters;
        const fitIdeally = totalBodyVolume >= minSizePerfectFit && totalBodyVolume <= maxSizePerfectFit;
        const fitTooSmall = totalBodyVolume > maxSizePerfectFit;

        if (fitIdeally) {
            for (const trait of item.wearableProperties.otherFitmentTraitsIdeal || []) {
                extraAddedExtraTraitsAtTheEnd.push(trait);
            }
            return {
                fitment: engine.deObject.functions.format_and(engine.deObject, null, ["fits perfectly", ...extraAddedExtraTraitsAtTheEnd]),
                shouldFallDown: false,
                shouldBreak: false,
            }
        } else if (fitTooSmall) {
            for (const trait of item.wearableProperties.otherFitmentTraitsSnug || []) {
                extraAddedExtraTraitsAtTheEnd.push(trait);
            }

            const largestSizeItCanFit = maxSizePerfectFit + (item.wearableProperties.volumeRangeFlexibilityLeewaySnug || 0);
            const pointOfExtremeTightness = maxSizePerfectFit + ((item.wearableProperties.volumeRangeFlexibilityLeewaySnug || 0) / 2);

            let fitmentDescription = "fits snugly";
            if (totalBodyVolume > pointOfExtremeTightness) {
                fitmentDescription = "fits extremely tightly";
            }

            return {
                fitment: engine.deObject.functions.format_and(engine.deObject, null, [fitmentDescription, ...extraAddedExtraTraitsAtTheEnd]),
                shouldFallDown: false,
                shouldBreak: totalBodyVolume > largestSizeItCanFit,
            }
        } else {
            for (const trait of item.wearableProperties.otherFitmentTraitsLoose || []) {
                extraAddedExtraTraitsAtTheEnd.push(trait);
            }

            const smallestSizeItCanFit = minSizePerfectFit - (item.wearableProperties.volumeRangeFlexibilityLeewayLoose || 0);
            const pointOfExtremeLooseness = minSizePerfectFit - ((item.wearableProperties.volumeRangeFlexibilityLeewayLoose || 0) / 2);

            let fitmentDescription = "fits loosely";
            if (totalBodyVolume < pointOfExtremeLooseness) {
                fitmentDescription = "fits extremely loosely";
            }

            return {
                fitment: engine.deObject.functions.format_and(engine.deObject, null, [fitmentDescription, ...extraAddedExtraTraitsAtTheEnd]),
                shouldFallDown: totalBodyVolume < smallestSizeItCanFit,
                shouldBreak: false,
            }
        }
    } else {
        return {
            fitment: "does not fit",
            shouldFallDown: true,
            shouldBreak: false,
        };
    }
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
 * @param {DEngine} engine
 * @param {string} location
 * @param {string|null} owner
 * @param {number} amount 
 * @param {string} item
 * @param {boolean} [capitalize] whether to capitalize the first letter of the item, this is used for example when the item is at the beginning of a sentence, so we want to make sure the message looks good
 * @param {boolean} [forceThe] whether to force "the" in front of the item, this is used for example when we want to refer to a specific item that we know is present, so we want to make sure the message reflects that, even if there is only one of that item, for example "the apple" instead of just "an apple"
 */
export function utilItemCount(engine, location, owner, amount, item, capitalize = false, forceThe = false) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }

    const itemTrimmedLower = item.trim().toLowerCase();
    // List of common irregular plurals

    let toReturn = "";
    if (amount === 1 && itemTrimmedLower.startsWith("the ") && !owner) {
        toReturn = item;
    } else if (amount === 1 && owner) {
        if (forceThe) {
            toReturn = `the ${item} of ${owner}`;
        } else {
            toReturn = `${owner}'s ${item}`;
        }
    } else if (amount === 1) {
        const isOneOfAKind = checkItemIsOneOfAKindAtLocation(engine, location, item);
        if (forceThe || isOneOfAKind) {
            toReturn = `the ${item}`;
        } else if (itemTrimmedLower.startsWith("a")) {
            toReturn = `an ${item}`;
        } else {
            toReturn = `a ${item}`;
        }
    } else {
        // Try to pluralize using irregulars first
        const lastWord = itemTrimmedLower.split(" ").slice(-1)[0];
        if (!owner) {
            // @ts-ignore
            if (irregularPlurals[lastWord]) {
                // Replace only the last word with its irregular plural
                const words = item.split(" ");
                // @ts-ignore
                words[words.length - 1] = irregularPlurals[lastWord];
                toReturn = `${forceThe ? "the " : ""}${amount} ${words.join(" ")}`;
            } else if (lastWord.endsWith("s") || lastWord.endsWith("x") || lastWord.endsWith("z") || lastWord.endsWith("ch") || lastWord.endsWith("sh")) {
                toReturn = `${forceThe ? "the " : ""}${amount} ${item}es`;
            } else if (lastWord.endsWith("y") && !["a", "e", "i", "o", "u"].includes(lastWord.slice(-2, -1))) {
                toReturn = `${forceThe ? "the " : ""}${amount} ${item.slice(0, -1)}ies`;
            } else {
                toReturn = `${forceThe ? "the " : ""}${amount} ${item}s`;
            }
        } else {
            if (forceThe) {
                // @ts-ignore
                if (irregularPlurals[lastWord]) {
                    // Replace only the last word with its irregular plural
                    const words = item.split(" ");
                    // @ts-ignore
                    words[words.length - 1] = irregularPlurals[lastWord];
                    toReturn = `the ${amount} ${words.join(" ")} of ${owner}`;
                } else if (lastWord.endsWith("s") || lastWord.endsWith("x") || lastWord.endsWith("z") || lastWord.endsWith("ch") || lastWord.endsWith("sh")) {
                    toReturn = `the ${amount} ${item}es of ${owner}`;
                } else if (lastWord.endsWith("y") && !["a", "e", "i", "o", "u"].includes(lastWord.slice(-2, -1))) {
                    toReturn = `the ${amount} ${item.slice(0, -1)}ies of ${owner}`;
                } else {
                    toReturn = `the ${amount} ${item}s of ${owner}`;
                }
            } else {
                // @ts-ignore
                if (irregularPlurals[lastWord]) {
                    // Replace only the last word with its irregular plural
                    const words = item.split(" ");
                    // @ts-ignore
                    words[words.length - 1] = irregularPlurals[lastWord];
                    toReturn = `${owner}'s ${amount} ${words.join(" ")}`;
                } else if (lastWord.endsWith("s") || lastWord.endsWith("x") || lastWord.endsWith("z") || lastWord.endsWith("ch") || lastWord.endsWith("sh")) {
                    toReturn = `${owner}'s ${amount} ${item}es`;
                } else if (lastWord.endsWith("y") && !["a", "e", "i", "o", "u"].includes(lastWord.slice(-2, -1))) {
                    toReturn = `${owner}'s ${amount} ${item.slice(0, -1)}ies`;
                } else {
                    toReturn = `${owner}'s ${amount} ${item}s`;
                }
            }
        }
    }
    if (capitalize) {
        toReturn = toReturn.charAt(0).toUpperCase() + toReturn.slice(1);
    }
    return toReturn;
}

/**
 * 
 * @param {DEngine} engine
 * @param {string} location
 * @param {string} item
 */
export function checkItemIsOneOfAKindAtLocation(engine, location, item) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    let totalCount = 0;
    const itemTrimmedLower = item.trim().toLowerCase();

    /**
     * @param {DEItem[]} itemList 
     */
    const countInList = (itemList) => {
        for (const itemInList of itemList) {
            // @ts-ignore
            if (itemInList._moved_to) {
                continue; // skip items that have been moved, as they are not really present in the location anymore
            }
            if (itemInList.name.trim().toLowerCase() === itemTrimmedLower) {
                totalCount += itemInList.amount || 1;
            } else if (itemInList.name.trim().toLowerCase().includes(itemTrimmedLower)) {
                // we also check if the item name includes the item we are looking for, this is just to increase the chances of finding
                totalCount += itemInList.amount || 1;
            }
            if (totalCount > 1) {
                return;
            }
            countInList(itemInList.containing);
            if (totalCount > 1) {
                return;
            }
            countInList(itemInList.ontop);
            if (totalCount > 1) {
                return;
            }
        }
    }

    const allCharactersToCheck = [];
    for (const charName in engine.deObject.characters) {
        const charState = engine.deObject.stateFor[charName];
        if (charState.location === location) {
            allCharactersToCheck.push(charName);
        }
    }
    for (const charName of allCharactersToCheck) {
        const characterState = engine.deObject.stateFor[charName];
        countInList(characterState.carrying);
        if (totalCount > 1) {
            return;
        }
        countInList(characterState.wearing);
        if (totalCount > 1) {
            return;
        }
    }
    for (const [slotName, slot] of Object.entries(engine.deObject.world.locations[location].slots)) {
        countInList(slot.items);
        if (totalCount > 1) {
            return;
        }
    }

    return totalCount <= 1;
}

/**
 * @param {DEngine} engine
 * @param {string} characterName
 * @param {string} currentLocation
 * @param {Array<string | number>} locationPath
 * @param {boolean} [ignoreCarrierWearer] whether to ignore the carrier/wearer in the message, this is used for example when we are trying to figure out if an item is being worn by a character, as the LLM may refer to the item in a different way than how it is named in the world state, for example it may say "hat" instead of "red hat", so we want to ignore case and also check if the item name includes the name we are looking for instead of checking for an exact match, this is just to increase the chances of finding the item and thus accepting feasible changes even if they are not perfectly formatted
 */
export function locationPathToMessage(engine, characterName, currentLocation, locationPath, ignoreCarrierWearer = false) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    let base = "";
    /**
     * @type {*}
     */
    let elementToFollow = null;
    if (locationPath[0] === "characters") {
        base = ignoreCarrierWearer ? "" : `${locationPath[2] === "carrying" ? "carried" : "worn"} by ${locationPath[1]}`;
        // @ts-ignore
        elementToFollow = engine.deObject.stateFor[locationPath[1]][locationPath[2]];
    } else if (locationPath[0] === "slots") {
        let locationSlotNameToUse = /** @type {string} */ (locationPath[1]);
        if (!locationSlotNameToUse.toLowerCase().startsWith("a ") && !locationSlotNameToUse.toLowerCase().startsWith("an ") && !locationSlotNameToUse.toLowerCase().startsWith("the ")) {
            locationSlotNameToUse = "the " + locationSlotNameToUse;
        }
        base = `in ${locationSlotNameToUse}`;
        elementToFollow = engine.deObject.world.locations[currentLocation].slots[locationPath[1]].items;
    }

    for (let i = 3; i < locationPath.length; i += 2) {
        const itemId = locationPath[i];
        const relation = locationPath[i + 1];

        let itemNameToUse = elementToFollow[itemId].name;
        if (!itemNameToUse.toLowerCase().startsWith("a ") && !itemNameToUse.toLowerCase().startsWith("an ") && !itemNameToUse.toLowerCase().startsWith("the ")) {
            if (checkItemIsOneOfAKindAtLocation(engine, engine.deObject.stateFor[characterName].location, elementToFollow[itemId].name)) {
                itemNameToUse = "the " + itemNameToUse;
            } else if (itemNameToUse.toLowerCase().startsWith("a")) {
                itemNameToUse = "an " + itemNameToUse;
            } else {
                itemNameToUse = "a " + itemNameToUse;
            }
        }
        if (relation === "containing" || relation === "containingCharacters") {
            base = `inside ${itemNameToUse}, ${base}`;
        } else if (relation === "ontop" || relation === "ontopCharacters") {
            base = `on top of ${itemNameToUse}, ${base}`;
        } else {
            base = `${itemNameToUse}, ${base}`;
        }
        elementToFollow = elementToFollow[itemId][relation];
    }

    return base;
}

/**
 * @param {DEngine} engine
 * @param {string} currentLocation
 * @param {Array<string | number>} path
 * @return {{
 *   resolved: *,
 *   pathToResolved: Array<string | number>
 * }}
 */
export function resolvePath(engine, currentLocation, path) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    /**
     * @type {*}
     */
    let current = path[0] === "slots" ? engine.deObject.world.locations[currentLocation].slots[path[1]] : engine.deObject.stateFor[path[1]];
    const startIndex = 2;
    for (let i = startIndex; i < path.length; i++) {
        // console.log(current)
        const part = path[i];
        // @ts-ignore
        current = current[part];
    }
    if (current._moved_to) {
        return resolvePath(engine, currentLocation, current._moved_to);
    }
    return {
        resolved: current,
        pathToResolved: path,
    };
}