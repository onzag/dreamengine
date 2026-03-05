import { DEngine } from "..";

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
        }
    }

    singularWeight += item.weightKg;

    for (const childItem of item.containing) {
        const results = getItemWeight(engine, childItem);
        singularWeight += results.completeWeight;
    }
    for (const childItem of item.ontop) {
        const results = getItemWeight(engine, childItem);
        singularWeight += results.completeWeight;
    }
    for (const character of item.ontopCharacters) {
        const results = getCharacterWeight(engine, character);
        singularWeight += results.weight;
    }
    for (const character of item.containingCharacters) {
        const results = getCharacterWeight(engine, character);
        singularWeight += results.weight;
    }

    return {
        singularWeight,
        completeWeight: singularWeight * item.amount,
        amount: item.amount,
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
        }
    }

    singularVolume += item.volumeLiters;
    const isRigid = item.containerProperties ? item.containerProperties.structure === "rigid" : true;
    if (!isRigid) {
        for (const childItem of item.containing) {
            const results = getItemVolume(engine, childItem);
            singularVolume += results.completeVolume;
        }
        for (const character of item.containingCharacters) {
            const results = getCharacterVolume(engine, character);
            singularVolume += results.volume;
        }
    }
    for (const childItem of item.ontop) {
        const results = getItemVolume(engine, childItem);
        singularVolume += results.completeVolume;
    }
    for (const character of item.ontopCharacters) {
        const results = getCharacterVolume(engine, character);
        singularVolume += results.volume;
    }

    return {
        singularVolume,
        completeVolume: singularVolume * item.amount,
        amount: item.amount,
    }
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
        breakReason: null,
    }
}