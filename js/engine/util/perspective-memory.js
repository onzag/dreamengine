import { utilItemCount } from './items.js';
import { millisecondsToDuration, millisecondsToTime } from './time.js';

/** @param {DEPerspectiveMemory} memory @param {number} currentTime */
export function isPerspectiveMemoryRetained(memory, currentTime) {
    // Durations match DEItemInPerspective.memory: five minutes, day, week, thirty days, forever.
    const lifetimes = [0, 5 * 60000, 86400000, 7 * 86400000, 30 * 86400000, Infinity];
    if (!memory || memory.level === 0) return false;
    if (memory.level === 5) return true;
    // Undated legacy memories cannot establish that their retention window is still open.
    return Number.isFinite(memory.createdTime) &&
        Math.max(0, currentTime - memory.createdTime) < lifetimes[memory.level];
}

/**
 * Search concrete IDs in stacks and nested items, first in the last scene and
 * inventories, then in remembered locations. No live world data is consulted.
 * @param {DEPerspective | null} perspective
 * @param {string} itemId
 * @returns {DEItemInPerspective[]}
 */
function findItemSightings(perspective, itemId) {
    if (!perspective) return [];
    /** @type {DEItemInPerspective[]} */
    const result = [];
    const visited = new Set();
    /** @param {DEItemInPerspective[]} items */
    function visit(items) {
        for (const item of items) {
            if (visited.has(item)) continue;
            visited.add(item);
            if (item.ids.some(entry => entry.id === itemId)) result.push(item);
            visit(item.containing);
            visit(item.ontop);
        }
    }

    const characters = [perspective.self, ...perspective.perspectiveCharacters.filter(c => c.perceptionForm !== "invisible")];
    for (const character of characters) {
        visit(character.carryingItems ?? []);
        visit(character.wearingItems ?? []);
    }
    for (const slot of perspective.ownLocation.slots) visit(slot.items);

    for (const location of perspective.rememberedLocations ?? []) {
        for (const slot of location.slots) visit(slot.items);
    }
    /** @param {DEPerspectiveCharacterMemory[]} memories */
    function visitCharacters(memories) {
        for (const character of memories) {
            visit(character.carryingItems ?? []);
            visit(character.wearingItems ?? []);
        }
    }
    visitCharacters(perspective.rememberedCharacters ?? []);
    return result;
}

/** @param {DEPerspective | null} perspective @param {string} itemId @returns {DEItemInPerspective | null} */
export function findItemInPerspective(perspective, itemId) {
    return findItemSightings(perspective, itemId)[0] ?? null;
}

/**
 * Find a sighting across every character list in a snapshot, including self.
 * @param {DEPerspective | null} perspective
 * @param {string} characterId
 * @returns {DEPerspectiveCharacter | DEPerspectiveCharacterMemory | null}
 */
export function findCharacterInPerspective(perspective, characterId) {
    if (!perspective) return null;
    if (perspective.self.characterId === characterId) return perspective.self;
    for (const character of perspective.perspectiveCharacters) {
        if (character.characterId === characterId) {
            if (character.perceptionForm === "invisible") return null;
            return character;
        };
    }
    for (const characterMemory of perspective.rememberedCharacters ?? []) {
        if (characterMemory.characterId === characterId) return characterMemory;
    }
    return null;
}

/**
 * Calculate retention from attention, salience and time spent in view. Time going
 * backwards never reduces an existing imprint; levels always remain between 0 and 5.
 * @param {number} memorability the memorability score that it calculated, a number between 0 and 2, where 0 is not memorable at all and 2 is very memorable
 * Expect something of average memorability to be 0.5, the reason it exceeds 1 is bonuses
 * @param {number} attention the attention level of the character, usually 0.5 for normal attention, 1 for perfect attention and 0 for absurd levels of ADHD
 * @param {DEPerspective | null} previousPerspective
 * @param {DEPerspectiveMemory | null} previousMemory
 * @param {number} elapsedMilliseconds
 * @param {number} currentTime
 * @param {boolean} passive whether the memory is being calculated passively, which means the character did not interact with the object or mentioned it in
 * any way shape or form
 * @returns {DEPerspectiveMemory}
 */
export function calculatePerspectiveMemory(memorability, attention, previousPerspective, previousMemory, elapsedMilliseconds, currentTime, passive) {
    // the actual rate of the memory depends on attention, so since memorability should cap at 2, and most normal items might get low values, eg. 0.2 to 0.5
    // a normal rate would be something very low like 0.1; for passive interactions
    const rate = Math.max(0, memorability * attention);

    const isContiguousMemory = previousMemory && previousMemory.createdTime === previousPerspective?.timeOfPerspective.time;

    // check if previous memory is still active, if it is not, we will reset the previous memory to null so that it does not affect the new memory calculation
    if (
        previousMemory &&
        !isPerspectiveMemoryRetained(previousMemory, currentTime) &&
        !isContiguousMemory
    ) {
        previousMemory = null;
    }

    // previous memory might have a stored memorability
    const previousMemorySoftLevel = previousMemory ? previousMemory.softLevel : 0;

    const timeOfActionInHours = Math.max(0, elapsedMilliseconds) / 3600000; // convert milliseconds to hours
    const timeOfActionInMinutes = Math.max(0, elapsedMilliseconds) / 60000; // convert milliseconds to minutes

    // passive memories climb slower, so we will use hours for passive and minutes for active
    const timeToUse = passive ? timeOfActionInHours : timeOfActionInMinutes;

    // the soft level gets added upon the rate and depending how long the action took with the given item
    const newSoftLevel = previousMemorySoftLevel + (rate * timeToUse);

    // in fact most of anything, given a 0.1 rate, will be forgotten as it will be stuck at zero, they might need to be 5 hours at a given location to
    // get a soft level of 0.5 which will round to 1, and will be remembered for like 5 minutes
    const softLevel = Math.min(5, newSoftLevel);
    return {
        level: /** @type {0 | 1 | 2 | 3 | 4 | 5} */ (Math.round(softLevel)),
        softLevel,
        createdTime: currentTime,
    };
}

/**
 * Small visit counts are remembered individually; larger counts become approximate.
 * @param {number} visits
 * @returns {DEPerspectiveLocation['hasBeenTimesEstimate']}
 */
export function estimateLocationVisits(visits) {
    return visits <= 5 ? visits : visits < 20 ? 'some' : 'many';
}

/**
 * Calculate the current visit and retention from saved location knowledge. Only
 * continuous presence reinforces memory over elapsed time; time away does not.
 * Legacy snapshots start counting at their first recorded visit. A clock rewind
 * restarts the visit duration without inventing another arrival.
 * @param {DEPerspective | null} previousPerspective
 * @param {string} locationId
 * @param {DETimeDescription} currentTime
 * @param {number} attention
 * @param {number} [identifierMentions]
 * @returns {Pick<DEPerspectiveLocation, 'memory' | 'hasBeenSince' | 'hasBeenFor' | 'hasBeenTimesExact' | 'hasBeenTimesEstimate'>}
 */
export function calculateLocationVisitHistory(previousPerspective, locationId, currentTime, attention, identifierMentions = 0) {
    const previous = previousPerspective?.ownLocationId === locationId ? previousPerspective.ownLocation : null;
    const remembered = previousPerspective?.rememberedLocations?.find(location => location.locationId === locationId);
    const known = previous ?? remembered;
    const previousTime = previousPerspective?.timeOfPerspective;
    const continuous = previous && previousTime && currentTime.time >= previousTime.time;
    const hasBeenSince = { ...(continuous ? previous.hasBeenSince ?? previousTime : currentTime) };
    const hasBeenTimesExact = Math.max(1, known?.hasBeenTimesExact ?? 1) + (!previous && remembered ? 1 : 0);
    // Presence contributes one point out of two; explicit mentions add half-point bonuses.
    const memorability = (1 + Math.max(0, identifierMentions) * 0.5) / 2;
    return {
        // always deem locations as active
        memory: calculatePerspectiveMemory(memorability, attention, previousPerspective, known?.memory ?? null,
            continuous ? currentTime.time - previousTime.time : 0, currentTime.time, true),
        hasBeenSince,
        hasBeenFor: millisecondsToDuration(Math.max(0, currentTime.time - hasBeenSince.time)),
        hasBeenTimesExact,
        hasBeenTimesEstimate: estimateLocationVisits(hasBeenTimesExact),
    };
}

/**
 * Derive encounter history exclusively from the observer's saved snapshot. A
 * continuous sighting keeps its start time; a remembered encounter starts anew.
 * lastSeen describes the previous snapshot or the last remembered encounter.
 * Older snapshots without history fields are accepted.
 * @param {DEPerspective | null} previousPerspective
 * @param {string} characterId
 * @param {DETimeDescription} currentTime
 * @returns {Pick<DEPerspectiveCharacter, 'hasSeenFor' | 'hasSeenSince' | 'lastSeen' | 'lastSeenDuration' | 'lastSeenLocationId' | 'lastSeenLocationName' | 'lastSeenWithCharacters' | 'lastSeenOtherRememberedLocations'>}
 */
export function calculateCharacterSightingHistory(previousPerspective, characterId, currentTime) {
    const known = findCharacterInPerspective(previousPerspective, characterId);
    // Only a character in the scene can continue a sighting; memories keep their own last-seen data.
    const previous = known && 'nameSimple' in known ? known : null;
    const remembered = known && !('nameSimple' in known) ? known
        : previousPerspective?.rememberedCharacters?.find(c => c.characterId === characterId);
    const previousTime = previousPerspective?.timeOfPerspective;
    const continuous = previous && previousTime && currentTime.time >= previousTime.time;
    const hasSeenSince = { ...(continuous ? previous.hasSeenSince ?? previousTime : currentTime) };
    const history = {
        hasSeenSince,
        hasSeenFor: millisecondsToDuration(Math.max(0, currentTime.time - hasSeenSince.time)),
        lastSeen: remembered ? { ...remembered.lastSeen } : null,
        lastSeenDuration: remembered ? { ...remembered.lastSeenDuration } : null,
        lastSeenLocationId: remembered?.lastSeenLocationId ?? null,
        lastSeenLocationName: remembered?.lastSeenLocationName ?? null,
        lastSeenWithCharacters: remembered?.lastSeenWithCharacters?.map(c => ({ ...c })) ?? null,
        lastSeenOtherRememberedLocations: remembered?.lastSeenOtherRememberedLocations?.map(location => ({
            ...location, memory: { ...location.memory }, duration: { ...location.duration },
        })) ?? null,
    };
    if (!previous || !previousPerspective || !previousTime) return history;

    // The slot list is the only saved source of a target's precise location.
    const slot = previousPerspective.ownLocation.slots.find(s => characterId === previousPerspective.ownId
        ? s.slotId === previousPerspective.ownLocationSlotId
        : s.characters.includes(characterId));
    const companions = slot ? [...slot.characters] : [
        previousPerspective.ownId,
        ...previousPerspective.socialGroups.soloCharacters,
        ...previousPerspective.socialGroups.ownGroup,
        ...previousPerspective.socialGroups.otherGroups.flat(),
    ];
    if (slot?.slotId === previousPerspective.ownLocationSlotId) companions.push(previousPerspective.ownId);
    history.lastSeen = { ...previousTime };
    history.lastSeenDuration = { ...(previous.hasSeenFor ?? millisecondsToDuration(0)) };
    history.lastSeenLocationId = previousPerspective.ownLocationId;
    history.lastSeenLocationName = previousPerspective.ownLocationName;
    history.lastSeenWithCharacters = [...new Map(companions
        .filter(id => id !== characterId)
        .map(id => findCharacterInPerspective(previousPerspective, id))
        .filter(c => c !== null && 'nameSimple' in c)
        .map(c => [c.characterId, { id: c.characterId, name: c.nameSimple }])).values()];
    history.lastSeenOtherRememberedLocations = previous.lastSeenOtherRememberedLocations?.map(location => ({
        ...location, memory: { ...location.memory }, duration: { ...location.duration },
    })) ?? [];
    if (previous.lastSeenLocationId && previous.lastSeenLocationName && previous.lastSeenDuration &&
        previous.lastSeenLocationId !== history.lastSeenLocationId) {
        history.lastSeenOtherRememberedLocations = history.lastSeenOtherRememberedLocations
            .filter(location => location.locationId !== previous.lastSeenLocationId && location.locationId !== history.lastSeenLocationId);
        history.lastSeenOtherRememberedLocations.push({
            memory: { ...previous.memory },
            locationId: previous.lastSeenLocationId,
            locationName: previous.lastSeenLocationName,
            duration: { ...previous.lastSeenDuration },
        });
    }
    return history;
}

/**
 * Copy only remembered item details, without retaining world or missing-content data.
 * @param {DEItemInPerspective} item
 * @returns {DEItemInPerspective}
 */
function convertItemToMemory(item) {
    return {
        memory: { ...item.memory },
        ids: item.ids.map(entry => ({ ...entry })),
        amount: item.amount,
        name: item.name,
        nameInAmount: item.nameInAmount,
        description: item.description,
        relativePosition: item.relativePosition,
        volumeLiters: item.canTellTheirVolume ? item.volumeLiters : 0,
        weightKg: item.canTellTheirWeight ? item.weightKg : 0,
        canTellTheirVolume: item.canTellTheirVolume,
        canTellTheirWeight: item.canTellTheirWeight,
        state: {
            ...(typeof item.state.opened === 'boolean' ? { opened: item.state.opened } : {}),
            ...(typeof item.state.locked === 'boolean' ? { locked: item.state.locked } : {}),
            ...(item.state.tags ? { tags: [...item.state.tags] } : {}),
        },
        common: item.common,
        metadata: {},
        owner: null,
        classes: [],
        oneOfAKind: false,
        communicator: null,
        consumableProperties: null,
        containerProperties: null,
        wearableProperties: null,
        carriableProperties: {},
        maxVolumeOnTopLiters: null,
        maxWeightOnTopKg: null,
        containing: item.containing.map(convertItemToMemory),
        ontop: item.ontop.map(convertItemToMemory),
        containingCharacters: [...item.containingCharacters],
        ontopCharacters: [...item.ontopCharacters],
        canSeeContents: item.canSeeContents,
        contentsIsUnclear: item.contentsIsUnclear,
        canSeeOntop: item.canSeeOntop,
        ontopIsUnclear: item.ontopIsUnclear,
        missingContaining: [],
        missingOntop: [],
        missingContainingCharacters: [],
        missingOntopCharacters: [],
    };
}

/**
 * @param {DEPerspectiveCharacter} character
 * @param {DEPerspective} perspective The snapshot in which the character was last seen.
 * @returns {DEPerspectiveCharacterMemory | null}
 */
export function convertCharacterToMemory(character, perspective) {
    if (character.perceptionForm === 'invisible') return null;
    const slot = perspective.ownLocation.slots.find(s => character.characterId === perspective.ownId
        ? s.slotId === perspective.ownLocationSlotId
        : s.characters.includes(character.characterId));
    const companions = new Set(slot ? slot.characters : [
        perspective.ownId,
        ...perspective.socialGroups.soloCharacters,
        ...perspective.socialGroups.ownGroup,
        ...perspective.socialGroups.otherGroups.flat(),
    ]);
    if (slot?.slotId === perspective.ownLocationSlotId) companions.add(perspective.ownId);
    companions.delete(character.characterId);
    const lastSeenWithCharacters = [...new Map([perspective.self, ...perspective.perspectiveCharacters]
        .filter(c => companions.has(c.characterId) && c.perceptionForm !== 'invisible')
        .map(c => [c.characterId, { id: c.characterId, name: c.nameSimple }])).values()];
    const lastSeenOtherRememberedLocations = (character.lastSeenOtherRememberedLocations ?? [])
        .filter(location => location.locationId !== perspective.ownLocationId);
    if (character.lastSeenLocationId && character.lastSeenLocationName && character.lastSeenDuration &&
        character.lastSeenLocationId !== perspective.ownLocationId) {
        const previousIndex = lastSeenOtherRememberedLocations.findIndex(location => location.locationId === character.lastSeenLocationId);
        if (previousIndex !== -1) lastSeenOtherRememberedLocations.splice(previousIndex, 1);
        lastSeenOtherRememberedLocations.push({
            memory: character.memory,
            locationId: character.lastSeenLocationId,
            locationName: character.lastSeenLocationName,
            duration: character.lastSeenDuration,
        });
    }
    const memory = structuredClone({
        memory: character.memory,
        characterId: character.characterId,
        characterNameComplex: character.nameComplex,
        characterNameSimple: character.nameSimple,
        characterNameDefinite: character.nameDefinite,
        characterNameIndefinite: character.nameIndefinite,
        perceptionForm: character.perceptionForm,
        states: character.states,
        slotId: slot?.slotId ?? null,
        slotName: slot?.slotName ?? null,
        lastSeen: perspective.timeOfPerspective,
        lastSeenDuration: character.hasSeenFor,
        lastSeenLocationId: perspective.ownLocationId,
        lastSeenLocationName: perspective.ownLocationName,
        lastSeenWithCharacters,
        lastSeenOtherRememberedLocations,
        carryingOtherCharacters: character.carryingOtherCharacters,
    });
    return {
        ...memory,
        carryingItems: character.carryingItems.map(convertItemToMemory),
        wearingItems: character.wearingItems.map(convertItemToMemory),
    };
}

/**
 * @param {DEPerspectiveLocation} location
 * @param {DETimeDescription} [lastBeen]
 * @returns {DEPerspectiveLocationMemory}
 */
export function convertLocationToMemory(location, lastBeen = millisecondsToTime(location.memory.createdTime)) {
    return {
        memory: { ...location.memory },
        locationId: location.locationId,
        locationName: location.locationName,
        slots: location.slots.map(slot => ({
            slotId: slot.slotId,
            slotName: slot.slotName,
            items: slot.items.map(convertItemToMemory),
        })),
        lastBeen: { ...lastBeen },
        lastBeenForTime: { ...location.hasBeenFor },
        hasBeenTimesExact: location.hasBeenTimesExact,
        hasBeenTimesEstimate: location.hasBeenTimesEstimate,
    };
}

/**
 * @param {DEObject} DE
 * @param {DEPerspective} perspective 
 * @param {DEPerspective | null} previousPerspective 
 * @param {number} currentTime 
 * @param {string[]} destroyedItems
 * @returns {DEPerspective}
 */
export function passPerspectiveThroughMemory(DE, perspective, previousPerspective, currentTime, destroyedItems) {
    if (!previousPerspective) return perspective;

    // first we will find characters that are gone between the previous perspective and the current perspective
    const charactersThatAreGone = previousPerspective.perspectiveCharacters
        .filter(c => !perspective.perspectiveCharacters.some(pc => pc.characterId === c.characterId));

    for (const character of charactersThatAreGone) {
        const characterMemory = convertCharacterToMemory(character, previousPerspective);
        if (characterMemory) perspective.rememberedCharacters.push(characterMemory);
    }

    for (const oldCharacterMemory of previousPerspective.rememberedCharacters) {
        const isPresentInCurrentPerspective = perspective.perspectiveCharacters.some(c => c.characterId === oldCharacterMemory.characterId);
        const isAlreadyInRemembered = perspective.rememberedCharacters.some(c => c.characterId === oldCharacterMemory.characterId);
        if (!isPresentInCurrentPerspective && !isAlreadyInRemembered) {
            perspective.rememberedCharacters.push(oldCharacterMemory);
        }
    }

    const allItemIdsInCurrentPerspective = new Set();
    /**
     * @param {Array<DEItemInPerspective>} items
     */
    const gatherItems = (items) => {
        for (const item of items) {
            for (const { id } of item.ids) allItemIdsInCurrentPerspective.add(id);
            gatherItems(item.containing);
            gatherItems(item.ontop);
        }
    }

    for (const character of perspective.perspectiveCharacters) {
        gatherItems(character.carryingItems);
        gatherItems(character.wearingItems);
    }

    for (const slot of perspective.ownLocation.slots) {
        gatherItems(slot.items);
    }

    // filter out any remembered characters that are no longer retained in memory
    perspective.rememberedCharacters = perspective.rememberedCharacters.filter(c => isPerspectiveMemoryRetained(c.memory, currentTime));

    const changedLocation = previousPerspective.ownLocationId !== perspective.ownLocationId;
    if (changedLocation) {
        const locationMemory = convertLocationToMemory(previousPerspective.ownLocation, previousPerspective.timeOfPerspective);
        perspective.rememberedLocations.push(locationMemory);
    }

    /**
     * 
     * @param {Array<string>} characters
     * @param {boolean} removeIfPresentInCurrentPerspective
     * @returns {Array<string>}
     */
    const filterCharacters = (characters, removeIfPresentInCurrentPerspective) => {
        return characters.filter(c => {
            const isPresentInCurrentPerspective = perspective.perspectiveCharacters.some(pc => pc.characterId === c);
            const isRemembered = perspective.rememberedCharacters.some(rc => rc.characterId === c);
            if (removeIfPresentInCurrentPerspective && isPresentInCurrentPerspective) {
                return false;
            }
            if (!isRemembered) {
                return false;
            }
            return true;
        })
    };

    /**
     * 
     * @param {Array<DEItemInPerspective>} items
     * @param {Array<string>} removedParents
     * @param {boolean} removeIfPresentInCurrentPerspective
     * @param {Map<string, DEItemInPerspective>} [latestItems]
     * @returns {Array<DEItemInPerspective>}
     */
    const filterItems = (items, removedParents, removeIfPresentInCurrentPerspective, latestItems) => {
        return items.filter(i => {
            if (!isPerspectiveMemoryRetained(i.memory, currentTime)) {
                return false;
            }

            /**
             * @type {Array<string>}
             */
            const removedArrayIds = [];
            const survivingIds = i.ids.filter(entry => {
                if (removeIfPresentInCurrentPerspective && allItemIdsInCurrentPerspective.has(entry.id)) {
                    removedArrayIds.push(entry.id);
                    return false;
                }
                if (destroyedItems.includes(entry.id)) {
                    removedArrayIds.push(entry.id);
                    return false;
                }
                if (entry.parent && removedParents.includes(entry.parent)) {
                    removedArrayIds.push(entry.id);
                    return false;
                }
                if (latestItems) {
                    if (latestItems.get(entry.id) !== i) {
                        removedArrayIds.push(entry.id);
                        return false;
                    }
                    latestItems.delete(entry.id);
                }
                return true;
            });

            if (survivingIds.length === 0) {
                return false;
            }

            if (survivingIds.length !== i.ids.length) {
                i.ids = survivingIds;
                i.amount = survivingIds.length;
                i.nameInAmount = utilItemCount(DE, null, !!i.oneOfAKind && i.ids.length === 1, i.common, i.owner, i.ids.length, i.name, i.ids[0].id, true, false, true);
            }

            i.containing = filterItems(i.containing, removedArrayIds, removeIfPresentInCurrentPerspective, latestItems);
            i.ontop = filterItems(i.ontop, removedArrayIds, removeIfPresentInCurrentPerspective, latestItems);
            i.containingCharacters = filterCharacters(i.containingCharacters, removeIfPresentInCurrentPerspective);
            i.ontopCharacters = filterCharacters(i.ontopCharacters, removeIfPresentInCurrentPerspective);
            return true;
        });
    }

    // filter that too
    for (const character of perspective.rememberedCharacters) {
        character.carryingItems = filterItems(character.carryingItems, [], true);
        character.wearingItems = filterItems(character.wearingItems, [], true);
        character.carryingOtherCharacters = filterCharacters(character.carryingOtherCharacters, true);
    }

    // now we need to visit all the items and all the remembered locations to see if they are still retained in memory, if they are not we will remove them from the perspective
    perspective.rememberedLocations = perspective.rememberedLocations.filter(l => isPerspectiveMemoryRetained(l.memory, currentTime));
    for (const location of perspective.rememberedLocations) {
        location.slots = location.slots.filter(s => s.items.some(i => isPerspectiveMemoryRetained(i.memory, currentTime)));
        for (const slot of location.slots) {
            // this needs to be done recursively because items can contain other items, and those items can contain other items, and so on
            slot.items = filterItems(slot.items, [], true);
        }
    }

    /**
     * @template {{ memory: DEPerspectiveMemory }} T
     * @param {T[]} memories
     * @param {(entry: T) => string} getId
     * @returns {T[]}
     */
    const keepLatest = (memories, getId) => {
        const latest = new Map();
        for (const entry of memories) {
            const id = getId(entry);
            const previous = latest.get(id);
            if (!previous || (entry.memory.createdTime ?? -Infinity) > (previous.memory.createdTime ?? -Infinity)) {
                latest.set(id, entry);
            }
        }
        return [...latest.values()];
    };

    perspective.rememberedLocations = keepLatest(perspective.rememberedLocations, l => l.locationId);
    perspective.rememberedCharacters = keepLatest(perspective.rememberedCharacters, c => c.characterId);

    /** @type {Map<string, DEItemInPerspective>} */
    const latestItems = new Map();
    /** @param {DEItemInPerspective[]} items */
    const indexItems = (items) => {
        for (const item of items) {
            for (const { id } of item.ids) {
                const previous = latestItems.get(id);
                if (!previous || (item.memory.createdTime ?? -Infinity) > (previous.memory.createdTime ?? -Infinity)) {
                    latestItems.set(id, item);
                }
            }
            indexItems(item.containing);
            indexItems(item.ontop);
        }
    };
    for (const location of perspective.rememberedLocations) {
        for (const slot of location.slots) indexItems(slot.items);
    }
    for (const character of perspective.rememberedCharacters) {
        indexItems(character.carryingItems);
        indexItems(character.wearingItems);
    }
    for (const location of perspective.rememberedLocations) {
        for (const slot of location.slots) slot.items = filterItems(slot.items, [], true, latestItems);
    }
    for (const character of perspective.rememberedCharacters) {
        character.carryingItems = filterItems(character.carryingItems, [], true, latestItems);
        character.wearingItems = filterItems(character.wearingItems, [], true, latestItems);
    }

    return perspective;
}
