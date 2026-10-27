import { checkItemIsOneOfAKindAtLocation, utilItemCount } from "./items.js";

/**
 * @param {DEObject} deObject
 * @param {string} characterId 
 */
export function getCharacterWeight(deObject, characterId) {
    if (!deObject.characters?.[characterId]) {
        throw new Error(`Character ${characterId} not found in engine`);
    }
    let singularWeight = 0;

    const character = deObject.characters[characterId];
    const charState = deObject.stateFor[characterId];
    singularWeight += character.weightKg;

    for (const childItem of charState.wearing) {
        const results = getItemWeight(deObject, childItem);
        singularWeight += results.completeWeight;
    }
    for (const childItem of charState.carrying) {
        const results = getItemWeight(deObject, childItem);
        singularWeight += results.completeWeight;
    }
    for (const directlyCarried of charState.carryingCharactersDirectly) {
        const results = getCharacterWeight(deObject, directlyCarried.id);
        singularWeight += results.weight;
    }
    return {
        weight: singularWeight
    }
}

/**
 * @param {DEObject} deObject
 * @param {string} characterId 
 */
export function getCharacterVolume(deObject, characterId) {
    if (!deObject.characters?.[characterId]) {
        throw new Error(`Character ${characterId} not found in engine`);
    }
    let singularVolume = 0;

    const character = deObject.characters[characterId];
    const charState = deObject.stateFor[characterId];
    singularVolume += character.weightKg; // assume water density, so same as weight in kg

    for (const childItem of charState.wearing) {
        if (childItem.wearableProperties) {
            singularVolume += childItem.wearableProperties.extraBodyVolumeWhenWornLiters;
        }
    }
    for (const childItem of charState.carrying) {
        const results = getItemVolume(deObject, childItem);
        singularVolume += results.completeVolume;
    }
    for (const directlyCarried of charState.carryingCharactersDirectly) {
        const results = getCharacterVolume(deObject, directlyCarried.id);
        singularVolume += results.volume;
    }
    return {
        volume: singularVolume
    }
}

/**
 * @param {DEObject} deObject
 * @param {DEItem} item 
 */
export function getItemWeight(deObject, item) {
    let singularWeight = 0;

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
        const results = getItemWeight(deObject, childItem);
        allCharactersInvolved.push(...results.allCharactersInvolved, ...results.charactersOnlyDirectlyInside, ...results.charactersOnlyDirectlyOnTop);
        singularWeight += results.completeWeight;
    }
    for (const childItem of item.ontop) {
        const results = getItemWeight(deObject, childItem);
        allCharactersInvolved.push(...results.allCharactersInvolved, ...results.charactersOnlyDirectlyInside, ...results.charactersOnlyDirectlyOnTop);
        singularWeight += results.completeWeight;
    }
    for (const character of item.ontopCharacters) {
        const results = getCharacterWeight(deObject, character.id);
        charactersOnlyDirectlyOnTop.push(character.id);
        allCharactersInvolved.push(character.id);
        singularWeight += results.weight;
    }
    for (const character of item.containingCharacters) {
        const results = getCharacterWeight(deObject, character.id);
        charactersOnlyDirectlyInside.push(character.id);
        allCharactersInvolved.push(character.id);
        singularWeight += results.weight;
    }

    return {
        singularWeight,
        completeWeight: singularWeight,
        amount: 1,
        allCharactersInvolved,
        charactersOnlyDirectlyInside,
        charactersOnlyDirectlyOnTop,
    }
}

/**
 * @param {DEObject} deObject
 * @param {DEItem} item 
 */
export function getItemVolume(deObject, item) {
    let singularVolume = 0;

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
        const results = getItemVolume(deObject, childItem);
        allCharactersInvolved.push(...results.allCharactersInvolved, ...results.charactersOnlyDirectlyInside, ...results.charactersOnlyDirectlyOnTop);
        if (!isRigid) {
            singularVolume += results.completeVolume;
        }
    }
    for (const character of item.containingCharacters) {
        const results = getCharacterVolume(deObject, character.id);
        allCharactersInvolved.push(character.id);
        charactersOnlyDirectlyInside.push(character.id);
        if (!isRigid) {
            singularVolume += results.volume;
        }
    }
    for (const childItem of item.ontop) {
        const results = getItemVolume(deObject, childItem);
        allCharactersInvolved.push(...results.allCharactersInvolved, ...results.charactersOnlyDirectlyInside, ...results.charactersOnlyDirectlyOnTop);
        singularVolume += results.completeVolume;
    }
    for (const character of item.ontopCharacters) {
        allCharactersInvolved.push(character.id);
        charactersOnlyDirectlyOnTop.push(character.id);
        const results = getCharacterVolume(deObject, character.id);
        singularVolume += results.volume;
    }

    return {
        singularVolume,
        completeVolume: singularVolume,
        amount: 1,
        allCharactersInvolved,
        charactersOnlyDirectlyInside,
        charactersOnlyDirectlyOnTop,
    }
}

/**
 * 
 * @param {DEObject} deObject 
 * @param {string} characterId 
 */
export function getCharacterCarryingCapacity(deObject, characterId) {
    if (!deObject.characters?.[characterId]) {
        throw new Error(`Character ${characterId} not found in engine`);
    }

    const character = deObject.characters[characterId];
    let carryingCapacityKg = character.carryingCapacityKg;
    let carryingCapacityLiters = character.carryingCapacityLiters;

    const wearableItems = deObject.stateFor[characterId].wearing;
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
 * For a given item, it returns the characters/items that are on top or inside it
 * that are in excess of the item capacity, either weight or volume, and that would cause the item to break or fall down, along with the reason and style of the break if it breaks
 * 
 * @param {DEObject} deObject 
 * @param {DEItem} item 
 */
export function getItemExcessElements(deObject, item) {
    const capacityInVolume = item.containerProperties ? item.containerProperties.capacityKg : 0;
    const capacityInWeight = item.containerProperties ? item.containerProperties.capacityLiters : 0;

    const capacityOnTopWeight = item.maxWeightOnTopKg;
    const capacityOnTopVolume = item.maxVolumeOnTopLiters;
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

    /**
     * @type {Array<string|DEItem>}
     */
    const breakReasonsItemsAndCharacters = [];
    for (const childItem of sortedByJustPlacedContaining) {
        const results = getItemWeight(deObject, childItem);
        if (carriedWeight + results.completeWeight > capacityInWeight) {
            isOverweightAndBreaks = true;
            breakReasonsItemsAndCharacters.push(childItem);
        } else {
            carriedWeight += results.completeWeight;
        }
    }

    for (const childCharacter of item.containingCharacters) {
        const results = getCharacterWeight(deObject, childCharacter.id);
        if (carriedWeight + results.weight > capacityInWeight) {
            isOverweightAndBreaks = true;
            breakReasonsItemsAndCharacters.push(childCharacter.id);
        } else {
            carriedWeight += results.weight;
        }
    }

    const itemNameForText = utilItemCount(deObject, null, item.oneOfAKind || false, item.owner, 1, item.name, false, true);

    if (isOverweightAndBreaks) {
        const breakList = breakReasonsItemsAndCharacters.map((i, ind) => typeof i === "string" ? i : utilItemCount(deObject, null, i.oneOfAKind || false, i.owner, 1, i.name, false, true));
        const listOfItems = deObject?.utils.templates.formatAnd(breakList);
        const overweightReasons = [
            `${listOfItems} causes ${itemNameForText} to be overweight and break`,
            `${itemNameForText} bursts apart from the sheer amount of ${listOfItems} stuffed inside`,
            `${itemNameForText} ruptures and blows open, unable to contain ${listOfItems}`,
            `the weight of ${listOfItems} overwhelms ${itemNameForText}, causing it to split open`,
            `${itemNameForText} can't hold ${listOfItems} any longer and explodes outward`,
        ];
        const reason = overweightReasons[Math.floor(Math.random() * overweightReasons.length)];

        return {
            expelledContainedCharacters: item.containingCharacters,
            expelledOntopCharacters: item.ontopCharacters,
            expelledContainedItems: item.containing.map(i => ({
                item: i,
                amount: 1,
            })),
            expelledOntopItems: item.ontop.map(i => ({
                item: i,
                amount: 1,
            })),
            breaks: true,
            breakStyle: "overweight",
            breakReason: reason.charAt(0).toUpperCase() + reason.slice(1),
        }
    }

    for (const childItem of sortedByJustPlacedOntop) {
        const results = getItemWeight(deObject, childItem);
        if (capacityOnTopWeight !== null && ontopWeight + results.completeWeight > capacityOnTopWeight) {
            isOverweightAndBreaks = true;
            breakReasonsItemsAndCharacters.push(childItem);
        } else {
            ontopWeight += results.completeWeight;
        }
    }

    for (const childCharacter of item.ontopCharacters) {
        const results = getCharacterWeight(deObject, childCharacter.id);
        if (capacityOnTopWeight !== null && ontopWeight + results.weight > capacityOnTopWeight) {
            isOverweightAndBreaks = true;
            breakReasonsItemsAndCharacters.push(childCharacter.id);
        } else {
            ontopWeight += results.weight;
        }
    }

    if (isOverweightAndBreaks) {
        const breakList = breakReasonsItemsAndCharacters.map((i, ind) => typeof i === "string" ? i : utilItemCount(deObject, null, i.oneOfAKind || false, i.owner, 1, i.name, false, true));
        const listOfItems = deObject?.utils.templates.formatAnd(breakList);
        const crushedReasons = [
            `${listOfItems} causes ${itemNameForText} to be overloaded and it breaks under the weight`,
            `${itemNameForText} collapses under the crushing weight of ${listOfItems}`,
            `the weight of ${listOfItems} proves too much and ${itemNameForText} buckles and gives way`,
            `${itemNameForText} crumples as ${listOfItems} bears down too heavily on top of it`,
            `${itemNameForText} shatters beneath ${listOfItems}, unable to support the load`,
        ];
        const reason = crushedReasons[Math.floor(Math.random() * crushedReasons.length)];

        return {
            expelledContainedCharacters: item.containingCharacters,
            expelledOntopCharacters: item.ontopCharacters,
            expelledContainedItems: item.containing.map(i => ({
                item: i,
                amount: 1,
            })),
            expelledOntopItems: item.ontop.map(i => ({
                item: i,
                amount: 1,
            })),
            breaks: true,
            breakStyle: "crushed",
            breakReason: reason.charAt(0).toUpperCase() + reason.slice(1),
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
        const results = getItemVolume(deObject, childItem);
        const remainingCapacity = capacityInVolume - carriedVolume;
        const howManyCanFit = Math.floor(remainingCapacity / (results.completeVolume / (results.amount || 1)));
        if (howManyCanFit <= 0) {
            expelledContainedItems.push({
                item: childItem,
                amount: 1,
            });
        } else if (howManyCanFit < 1) {
            expelledContainedItems.push({
                item: childItem,
                amount: 1 - howManyCanFit,
            });
            carriedVolume += howManyCanFit * results.singularVolume;
        } else {
            carriedVolume += results.completeVolume;
        }
    }

    for (const childCharacter of item.containingCharacters) {
        const results = getCharacterVolume(deObject, childCharacter.id);
        if (carriedVolume + results.volume > capacityInVolume) {
            expelledContainedCharacters.push(childCharacter);
        } else {
            carriedVolume += results.volume;
        }
    }

    for (const childItem of sortedByJustPlacedOntop) {
        const results = getItemVolume(deObject, childItem);
        const remainingCapacity = capacityOnTopVolume !== null ? capacityOnTopVolume - ontopVolume : Infinity;
        const howManyCanFit = Math.floor(remainingCapacity / (results.completeVolume / (results.amount || 1)));
        if (howManyCanFit <= 0) {
            expelledOntopItems.push({
                item: childItem,
                amount: 1,
            });
        } else if (howManyCanFit < 1) {
            expelledOntopItems.push({
                item: childItem,
                amount: 1 - howManyCanFit,
            });
            ontopVolume += howManyCanFit * results.singularVolume;
        } else {
            ontopVolume += results.completeVolume;
        }
    }

    for (const childCharacter of item.ontopCharacters) {
        const results = getCharacterVolume(deObject, childCharacter.id);
        if (capacityOnTopVolume !== null && ontopVolume + results.volume > capacityOnTopVolume) {
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
 * @param {DEObject} deObject 
 * @param {DEItem} item 
 * @param {string} character
 * @param {boolean} [isNotBeingCurrentlyWorn] this is used for example when we want to check the fitment of an item that is currently being worn, in that case we want to ignore the extra body volume that it provides, because it is already being worn, so it is not providing that extra body volume to itself
 * @returns {{
 *       fitment: string,
 *       shouldFallDown: boolean,
 *       shouldBreak: boolean,
 *       breakReason: string|null,
 *    }}
 */
export function getWearableFitment(deObject, item, character, isNotBeingCurrentlyWorn = false) {
    if (item.wearableProperties) {
        let extraAddedExtraTraitsAtTheEnd = []
        for (const trait of item.wearableProperties.otherFitmentTraitsAny || []) {
            extraAddedExtraTraitsAtTheEnd.push(trait);
        }

        let removeBodyVolume = item.wearableProperties.extraBodyVolumeWhenWornLiters || 0;
        let totalBodyVolume = deObject.characters[character].weightKg; // assume water density, so same as weight in kg
        const currentlyWornItems = deObject.stateFor[character].wearing;
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
                fitment: deObject.utils.templates.formatAnd(["fits perfectly", ...extraAddedExtraTraitsAtTheEnd]),
                shouldFallDown: false,
                shouldBreak: false,
                breakReason: null,
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

            const itemNameForText = utilItemCount(deObject, null, item.oneOfAKind || false, item.owner, 1, item.name, false, true);

            return {
                fitment: deObject.utils.templates.formatAnd([fitmentDescription, ...extraAddedExtraTraitsAtTheEnd]),
                shouldFallDown: false,
                shouldBreak: totalBodyVolume > largestSizeItCanFit,
                breakReason: totalBodyVolume > largestSizeItCanFit ? (() => {
                    const _breakReasons = [
                        `${itemNameForText} got worn by {{char}} so tightly that it broke`,
                        `${itemNameForText} was stretched beyond its limit by {{char}}'s body and tore apart`,
                        `${itemNameForText} split at the seams from being forced on too tightly on {{char}}'s body`,
                        `${itemNameForText} burst open, unable to contain {{char}}'s body`,
                    ];
                    return _breakReasons[Math.floor(Math.random() * _breakReasons.length)];
                })() : null,
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
                fitment: deObject.utils.templates.formatAnd([fitmentDescription, ...extraAddedExtraTraitsAtTheEnd]),
                shouldFallDown: totalBodyVolume < smallestSizeItCanFit,
                shouldBreak: false,
                breakReason: null,
            }
        }
    } else {
        return {
            fitment: "does not fit",
            shouldFallDown: true,
            shouldBreak: false,
            breakReason: null,
        };
    }
}

/**
 * @param {DEObject} deObject
 * @param {string} characterId
 * @param {string} currentLocation
 * @param {Array<string | number>} locationPath
 * @param {boolean} [ignoreCarrierWearer] whether to ignore the carrier/wearer in the message, this is used for example when we are trying to figure out if an item is being worn by a character, as the LLM may refer to the item in a different way than how it is named in the world state, for example it may say "hat" instead of "red hat", so we want to ignore case and also check if the item name includes the name we are looking for instead of checking for an exact match, this is just to increase the chances of finding the item and thus accepting feasible changes even if they are not perfectly formatted
 */
export function locationPathToMessageWithoutItemName(deObject, characterId, currentLocation, locationPath, ignoreCarrierWearer = false) {
    if (!deObject) {
        throw new Error("DEngine not initialized");
    }
    // make a copy of the path
    const pathCopy = [...locationPath];
    // delete the last in the path
    pathCopy.pop();
    if (typeof pathCopy[pathCopy.length - 1] === "number") {
        pathCopy.pop();
    }

    return locationPathToMessage(deObject, characterId, currentLocation, pathCopy, ignoreCarrierWearer);
}

/**
 * @param {DEObject} deObject
 * @param {string} characterId
 * @param {string} currentLocation
 * @param {Array<string | number>} locationPath
 * @param {boolean} [ignoreCarrierWearer] whether to ignore the carrier/wearer in the message, this is used for example when we are trying to figure out if an item is being worn by a character, as the LLM may refer to the item in a different way than how it is named in the world state, for example it may say "hat" instead of "red hat", so we want to ignore case and also check if the item name includes the name we are looking for instead of checking for an exact match, this is just to increase the chances of finding the item and thus accepting feasible changes even if they are not perfectly formatted
 */
export function locationPathToMessage(deObject, characterId, currentLocation, locationPath, ignoreCarrierWearer = false) {
    if (!deObject) {
        throw new Error("DEngine not initialized");
    }
    let base = "";
    /**
     * @type {*}
     */
    let elementToFollow = null;
    if (locationPath[0] === "characters") {
        const carrierWearerName = deObject.characters[locationPath[1]]?.name ?? locationPath[1];
        base = ignoreCarrierWearer ? "" : `${locationPath[2] === "carrying" ? "carried" : "worn"} by ${carrierWearerName}`;
        // @ts-ignore
        elementToFollow = engine.deObject.stateFor[locationPath[1]][locationPath[2]];
    } else if (locationPath[0] === "slots") {
        let locationSlotNameToUse = /** @type {string} */ (locationPath[1]);
        if (!locationSlotNameToUse.toLowerCase().startsWith("a ") && !locationSlotNameToUse.toLowerCase().startsWith("an ") && !locationSlotNameToUse.toLowerCase().startsWith("the ")) {
            locationSlotNameToUse = "the " + locationSlotNameToUse;
        }
        base = `in ${locationSlotNameToUse}`;
        elementToFollow = deObject.world.locations[currentLocation].slots[locationPath[1]].items;
    }

    for (let i = 3; i < locationPath.length; i += 2) {
        const itemId = locationPath[i];
        const relation = locationPath[i + 1];

        let itemNameToUse = elementToFollow[itemId].name;
        if (!itemNameToUse.toLowerCase().startsWith("a ") && !itemNameToUse.toLowerCase().startsWith("an ") && !itemNameToUse.toLowerCase().startsWith("the ")) {
            if (checkItemIsOneOfAKindAtLocation(deObject, deObject.stateFor[characterId].location, elementToFollow[itemId].name)) {
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
 * @param {DEObject} deObject
 * @param {string} currentLocation
 * @param {Array<string | number>} path
 * @return {{
 *   resolved: *,
 *   pathToResolved: Array<string | number>
 * }}
 */
export function resolvePath(deObject, currentLocation, path) {
    /**
     * @type {*}
     */
    let current = path[0] === "slots" ? deObject.world.locations[currentLocation].slots[path[1]] : deObject.stateFor[path[1]];
    const startIndex = 2;
    for (let i = startIndex; i < path.length; i++) {
        // console.log(current)
        const part = path[i];
        // @ts-ignore
        current = current[part];
    }
    if (current._moved_to) {
        return resolvePath(deObject, currentLocation, current._moved_to);
    }
    return {
        resolved: current,
        pathToResolved: path,
    };
}