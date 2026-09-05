/**
 * Shuffles an array in place using the Fisher-Yates algorithm.
 * @template T
 * @param {T[]} arr
 * @returns {T[]}
 */
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
    return arr;
}

/**
 * Builds a randomised BFS location visit order starting from `startLocationId`.
 *
 * Within each BFS depth level the locations are shuffled so the character does
 * not always take from the same neighbour first.  At shallow depths there is a
 * decreasing probability of swapping the current depth level with the next one,
 * so the character sometimes looks further away before checking the nearest
 * spot.  The probability is highest at depth 0 (the character's own location)
 * and reaches zero by depth 3, ensuring the character still strongly prefers
 * clothing that is actually nearby.
 *
 * @param {DEWorld} world
 * @param {string} startLocationId
 * @returns {string[]}
 */
function buildClothingSearchOrder(world, startLocationId) {
    /** @type {string[][]} */
    const byDepth = [[startLocationId]];
    const visited = new Set([startLocationId]);
    const queue = [{ locationId: startLocationId, depth: 0 }];

    while (queue.length > 0) {
        // @ts-ignore
        const { locationId, depth } = queue.shift();
        const location = world.locations[locationId];
        if (!location) continue;

        // Collect unique unvisited neighbours from every connection that touches this location.
        const nextIds = [];
        const seenNext = new Set();
        for (const conn of Object.values(world.connections)) {
            let nextId = null;
            if (conn.from === locationId && !visited.has(conn.to)) {
                nextId = conn.to;
            } else if (conn.bidirectional && conn.to === locationId && !visited.has(conn.from)) {
                nextId = conn.from;
            }
            if (nextId && !seenNext.has(nextId)) {
                seenNext.add(nextId);
                nextIds.push(nextId);
            }
        }

        // Randomise the order in which neighbours are queued so the character
        // does not always favour the same connection direction.
        shuffleArray(nextIds);
        for (const id of nextIds) {
            visited.add(id);
            if (!byDepth[depth + 1]) byDepth[depth + 1] = [];
            byDepth[depth + 1].push(id);
            queue.push({ locationId: id, depth: depth + 1 });
        }
    }

    // Build the final ordered list.  At each depth level we decide (with
    // decreasing probability) whether to put the *next* depth level before this
    // one, biasing the search towards connections before the current location at
    // shallow depths and towards the current location at deeper depths.
    //   depth 0 → ~75 % chance to check connections first
    //   depth 1 → ~45 % chance
    //   depth 2 → ~15 % chance
    //   depth 3+ → never swap
    const finalOrder = [];
    let d = 0;
    while (d < byDepth.length) {
        const currentLevel = shuffleArray([...byDepth[d]]);
        const swapProb = Math.max(0, 0.75 - d * 0.30);
        const doSwap = Math.random() < swapProb && d + 1 < byDepth.length;

        if (doSwap) {
            finalOrder.push(...shuffleArray([...byDepth[d + 1]]));
            finalOrder.push(...currentLevel);
            d += 2;
        } else {
            finalOrder.push(...currentLevel);
            d += 1;
        }
    }

    return finalOrder;
}

/**
 * Recursively collects all items from an item tree (containing + ontop) that
 * satisfy `matchFn`.
 * @param {DEItem} item
 * @param {(item: DEItem) => boolean} matchFn
 * @param {DEItem[]} out
 */
function collectMatchingItems(item, matchFn, out) {
    if (matchFn(item)) out.push(item);
    for (const child of item.containing) collectMatchingItems(child, matchFn, out);
    for (const child of item.ontop) collectMatchingItems(child, matchFn, out);
}

/**
 * Searches every location in `searchOrder` for an item that satisfies `matchFn`.
 * Items within each location are checked in a randomised order so different
 * calls return variety even when the same location is visited.
 *
 * @param {DEWorld} world
 * @param {string[]} searchOrder
 * @param {(item: DEItem) => boolean} matchFn
 * @returns {DEItem | null}
 */
function findClothingItem(world, searchOrder, matchFn) {
    for (const locationId of searchOrder) {
        const location = world.locations[locationId];
        if (!location) continue;

        /**
         * @type {DEItem[]}
         */
        const candidates = [];
        for (const slot of Object.values(location.slots)) {
            for (const item of slot.items) {
                collectMatchingItems(item, matchFn, candidates);
            }
        }

        if (candidates.length > 0) {
            return candidates[Math.floor(Math.random() * candidates.length)];
        }
    }
    return null;
}

/**
 * @param {DEItem} item 
 * @param {DECompleteCharacterReference} character
 * @param {"tight" | "loose" | "normal"} fitment
 */
export function resizeClothingItem(item, character, fitment) {
    const newItem = structuredClone(item);
    newItem.amount = 1; // ensure we only give one of the item, not a stack
    if (!newItem.wearableProperties) return newItem; // narrows type; structuredClone doesn't carry through the guard above
    const idealWeightForItem = (newItem.wearableProperties.volumeRangeMaxLiters + newItem.wearableProperties.volumeRangeMinLiters) / 2;
    const step = (newItem.wearableProperties.volumeRangeMaxLiters - newItem.wearableProperties.volumeRangeMinLiters);
    const scaleFactor = character.weightKg / idealWeightForItem;
    if (fitment === "normal") {
        const alreadyFits = character.weightKg >= newItem.wearableProperties.volumeRangeMinLiters && character.weightKg <= newItem.wearableProperties.volumeRangeMaxLiters;
        if (alreadyFits) return newItem;
        newItem.wearableProperties.volumeRangeMaxLiters *= scaleFactor;
        newItem.wearableProperties.volumeRangeMinLiters *= scaleFactor;
        newItem.wearableProperties.volumeRangeFlexibilityLeewaySnug *= scaleFactor;
        newItem.wearableProperties.volumeRangeFlexibilityLeewayLoose *= scaleFactor;
    } else if (fitment === "tight") {
        if (newItem.wearableProperties.volumeRangeFlexibilityLeewaySnug) {
            const actualMaxWeightForItem = newItem.wearableProperties.volumeRangeMinLiters;
            const actualMinWeightForItem = newItem.wearableProperties.volumeRangeMinLiters - newItem.wearableProperties.volumeRangeFlexibilityLeewaySnug;

            const alreadyFitsTightly = character.weightKg > actualMinWeightForItem && character.weightKg < actualMaxWeightForItem;
            if (alreadyFitsTightly) return newItem;

            const idealTightWeightForItem = (actualMaxWeightForItem + actualMinWeightForItem) / 2;
            const tightScaleFactor = character.weightKg / idealTightWeightForItem;
            newItem.wearableProperties.volumeRangeMaxLiters *= tightScaleFactor;
            newItem.wearableProperties.volumeRangeMinLiters *= tightScaleFactor;
            newItem.wearableProperties.volumeRangeFlexibilityLeewaySnug *= tightScaleFactor;
            newItem.wearableProperties.volumeRangeFlexibilityLeewayLoose *= tightScaleFactor;
        } else {
            const tightWeightForItem = newItem.wearableProperties.volumeRangeMinLiters + (step * 0.9);
            const tightScaleFactor = character.weightKg / tightWeightForItem;
            newItem.wearableProperties.volumeRangeMaxLiters *= tightScaleFactor;
            newItem.wearableProperties.volumeRangeMinLiters *= tightScaleFactor;
            newItem.wearableProperties.volumeRangeFlexibilityLeewaySnug *= tightScaleFactor;
            newItem.wearableProperties.volumeRangeFlexibilityLeewayLoose *= tightScaleFactor;
        }
    } else if (fitment === "loose") {
        if (newItem.wearableProperties.volumeRangeFlexibilityLeewayLoose) {
            const actualMaxWeightForItem = newItem.wearableProperties.volumeRangeMaxLiters + newItem.wearableProperties.volumeRangeFlexibilityLeewayLoose;
            const actualMinWeightForItem = newItem.wearableProperties.volumeRangeMaxLiters;

            const alreadyFitsLoosely = character.weightKg > actualMinWeightForItem && character.weightKg < actualMaxWeightForItem;
            if (alreadyFitsLoosely) return newItem;

            const idealLooseWeightForItem = (actualMaxWeightForItem + actualMinWeightForItem) / 2;
            const looseScaleFactor = character.weightKg / idealLooseWeightForItem;
            newItem.wearableProperties.volumeRangeMaxLiters *= looseScaleFactor;
            newItem.wearableProperties.volumeRangeMinLiters *= looseScaleFactor;
            newItem.wearableProperties.volumeRangeFlexibilityLeewaySnug *= looseScaleFactor;
            newItem.wearableProperties.volumeRangeFlexibilityLeewayLoose *= looseScaleFactor;
        } else {
            const looseWeightForItem = newItem.wearableProperties.volumeRangeMaxLiters - (step * 0.9);
            const looseScaleFactor = character.weightKg / looseWeightForItem;
            newItem.wearableProperties.volumeRangeMaxLiters *= looseScaleFactor;
            newItem.wearableProperties.volumeRangeMinLiters *= looseScaleFactor;
            newItem.wearableProperties.volumeRangeFlexibilityLeewaySnug *= looseScaleFactor;
            newItem.wearableProperties.volumeRangeFlexibilityLeewayLoose *= looseScaleFactor;
        }
    }
    return newItem;
}

/**
 * 
 * @param {DECompleteCharacterReference} character
 * @param {DEStateForCharacterWithHistory} charState
 * @param {DEWorld} world
 * @param {"tight" | "loose" | "normal"} fitment
 */
export function giveCharacterRandomClothing(character, charState, world, fitment) {
    let isNotWearingBottomClothes = !charState.wearing.some(item => item.wearableProperties?.coversBottomNakedness && !item.wearableProperties.underwear);
    let isNotWearingBottomUnderwear = !charState.wearing.some(item => item.wearableProperties?.coversBottomNakedness && item.wearableProperties.underwear);
    let isNotWearingTopClothes = !charState.wearing.some(item => item.wearableProperties?.coversTopNakedness && !item.wearableProperties.underwear);
    // we don't want to give a male character top underwear so it defaults to true for male
    let isNotWearingTopUnderwear = character.gender === "male" ? false : !charState.wearing.some(item => item.wearableProperties?.coversTopNakedness && item.wearableProperties.underwear);

    /**
     * Returns true when the item's preferred gender is compatible with this character.
     * Items marked "any" always match; characters with an ambiguous gender may wear
     * anything (male-coded, female-coded, or gender-neutral clothing).
     * @param {DEItem} item
     * @returns {boolean}
     */
    const isGenderCompatible = (item) => {
        const preferred = item.wearableProperties?.preferredGender;
        if (preferred === "any") return true;
        if (character.gender === "ambiguous") return true;
        return preferred === character.gender;
    };

    const searchOrder = buildClothingSearchOrder(world, charState.location);

    if (isNotWearingBottomClothes) {
        let item = findClothingItem(world, searchOrder, (item) =>
            !!item.wearableProperties &&
            item.wearableProperties.coversBottomNakedness &&
            !item.wearableProperties.underwear &&
            !item.wearableProperties.noRandomClothingSpawn &&
            (fitment === "normal" ? true : (fitment === "tight" ? !!item.wearableProperties.volumeRangeFlexibilityLeewaySnug : !!item.wearableProperties.volumeRangeFlexibilityLeewayLoose)) &&
            isGenderCompatible(item)
        );
        if (!item && fitment !== "normal") {
            // If we didn't find a tight/loose bottom clothing item, try again without the fitment requirement.
            item = findClothingItem(world, searchOrder, (item) =>
                !!item.wearableProperties &&
                item.wearableProperties.coversBottomNakedness &&
                !item.wearableProperties.underwear &&
                !item.wearableProperties.noRandomClothingSpawn &&
                isGenderCompatible(item)
            );
        }
        if (item) {
            charState.wearing.push(resizeClothingItem(item, character, fitment));
            if (item.wearableProperties?.coversTopNakedness) {
                isNotWearingTopClothes = false;
            }
        }
    }

    if (isNotWearingBottomUnderwear) {
        const item = findClothingItem(world, searchOrder, (item) =>
            !!item.wearableProperties &&
            item.wearableProperties.coversBottomNakedness &&
            item.wearableProperties.underwear &&
            !item.wearableProperties.noRandomClothingSpawn &&
            isGenderCompatible(item)
        );
        if (item) {
            charState.wearing.push(resizeClothingItem(item, character, fitment));
            if (item.wearableProperties?.coversTopNakedness) {
                isNotWearingTopUnderwear = false;
            }
        }
    }

    if (isNotWearingTopClothes) {
        let item = findClothingItem(world, searchOrder, (item) =>
            !!item.wearableProperties &&
            item.wearableProperties.coversTopNakedness &&
            !item.wearableProperties.underwear &&
            !item.wearableProperties.noRandomClothingSpawn &&
            (fitment === "normal" ? true : (fitment === "tight" ? !!item.wearableProperties.volumeRangeFlexibilityLeewaySnug : !!item.wearableProperties.volumeRangeFlexibilityLeewayLoose)) &&
            isGenderCompatible(item)
        );
        if (!item && fitment !== "normal") {
            // If we didn't find a tight/loose top clothing item, try again without the fitment requirement.
            item = findClothingItem(world, searchOrder, (item) =>
                !!item.wearableProperties &&
                item.wearableProperties.coversTopNakedness &&
                !item.wearableProperties.underwear &&
                !item.wearableProperties.noRandomClothingSpawn &&
                isGenderCompatible(item)
            );
        }
        if (item) charState.wearing.push(resizeClothingItem(item, character, fitment));
    }

    // Top underwear (e.g. bras) is only relevant for non-male characters.
    // isNotWearingTopUnderwear is always true for males (see above), so the
    // extra gender guard here is what actually prevents males from receiving it.
    if (character.gender !== "male" && isNotWearingTopUnderwear) {
        const item = findClothingItem(world, searchOrder, (item) =>
            !!item.wearableProperties &&
            item.wearableProperties.coversTopNakedness &&
            item.wearableProperties.underwear &&
            !item.wearableProperties.noRandomClothingSpawn &&
            isGenderCompatible(item)
        );
        if (item) charState.wearing.push(resizeClothingItem(item, character, fitment));
    }
}