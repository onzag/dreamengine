import {
    getListOfCarriedCharactersByCharacter,
    getExternalDescriptionOfCharacter,
    getInternalDescriptionOfCharacter,
    getBondDeclarationFromBondDescription,
    getFamilyBondRelation,
    getRelationship,
    getExternalDescriptionOfCharacterPostureOnly,
} from './character-info.js';
import {
    getNameIdentificationForOneCharacterTowardsAnother,
    getNameIdentificationForOneCharacterTowardsAnotherOnlyName,
} from './messages.js';
import { getPerceivedItemLabel } from './visibility.js';

/**
 * Builds a snapshot of the world from a single character's point of view, mirroring
 * exactly what the UI surfaces (scene characters, carried/worn/slot items, and what the
 * observer can or cannot make out) through the same engine utilities the views consume.
 *
 * @param {DEObject} DE
 * @param {DECompleteCharacterReference | string} character
 * @returns {Promise<DECharacterPerspective>}
 */
export async function getPerspective(DE, character) {
    const ownId = typeof character === 'string' ? character : character.id;
    const ownChar = DE.characters[ownId];
    if (!ownChar) {
        throw new Error(`Character ${ownId} not found.`);
    }
    const ownState = DE.stateFor[ownId];
    if (!ownState) {
        throw new Error(`Character state for ${ownId} not found.`);
    }

    const locationId = ownState.location;
    const location = DE.world.locations[locationId];
    if (!location) {
        throw new Error(`Location ${locationId} not found.`);
    }
    const slotId = ownState.locationSlot;
    const slot = location.slots[slotId] || null;

    const self = await buildPerspectiveCharacter(DE, ownId, ownId, 'visible');
    const ownLocation = await buildPerspectiveLocation(DE, locationId, ownId);

    return {
        self,
        ownId,
        ownName: ownChar.name,
        ownLocationId: locationId,
        ownLocationName: location.name,
        ownLocationSlotId: slotId,
        ownLocationSlotName: slot ? slot.name : '',
        ownLocation,
        ownCharacterBlindness: ownChar.blindness || 'no',
    };
}

/**
 * @param {DEObject} DE
 * @param {string} locationId
 * @param {string} observerId
 * @returns {Promise<DECharacterPerspectiveLocation>}
 */
async function buildPerspectiveLocation(DE, locationId, observerId) {
    const location = DE.world.locations[locationId];
    if (!location) {
        throw new Error(`Location ${locationId} not found.`);
    }

    const slots = [];
    for (const slotId of Object.keys(location.slots)) {
        slots.push(await buildPerspectiveLocationSlot(DE, locationId, slotId, observerId));
    }

    return {
        locationMetadata: location.metadata || {},
        locationId,
        locationName: location.name,
        weatherName: location.internalState?.currentWeather || '',
        slots,
    };
}

/**
 * @param {DEObject} DE
 * @param {string} locationId
 * @param {string} slotId
 * @param {string} observerId
 * @returns {Promise<DECharacterPerspectiveLocationSlot>}
 */
async function buildPerspectiveLocationSlot(DE, locationId, slotId, observerId) {
    const location = DE.world.locations[locationId];
    const slot = location.slots[slotId];
    if (!slot) {
        throw new Error(`Location slot ${slotId} not found in location ${locationId}.`);
    }

    const observerName = DE.utils.templates.formatCharacterName(observerId, observerId, {
        justName: true,
        type: 'definite',
        capitalize: true,
    });
    const locationPerception = DE.utils.world.whatCanTheyMakeOfALocation(slotId, observerId);

    const items = await buildItemsInPerspective(DE, slot.items || [], observerId);

    // Characters at this slot, excluding the observer, that the observer can at least perceive.
    /** @type {DECharacterPerspectiveCharacter[]} */
    const characters = [];
    const slotCharacterIds = DE.utils.world.getCharacterIdsAtLocationSlot(slotId);
    for (const charId of slotCharacterIds) {
        if (charId === observerId) continue;
        const visibility = DE.utils.characterInfo.canSeeCharacter(charId, observerId);
        if (visibility === 'invisible') continue;
        characters.push(await buildPerspectiveCharacter(DE, charId, observerId, visibility));
    }

    const canSeeItems = !locationPerception.isUnclear;
    const canSeeCharacters = !locationPerception.isUnclear;

    return {
        slotMetadata: slot.metadata || {},
        slotId,
        slotName: slot.name,
        items,
        canSeeItems,
        itemListsAreUnclear: unclearReason(locationPerception, observerName, 'items'),
        characters,
        canSeeCharacters,
        characterListsAreUnclear: unclearReason(locationPerception, observerName, 'characters'),
    };
}

/**
 * Describes whether a list obtained from a place is reliable, matching the vagueness the UI shows.
 * @param {{ isUnclear: boolean, hasHighPerception: boolean }} perception
 * @param {string} observerName
 * @param {'items' | 'characters'} kind
 * @returns {false | string}
 */
function unclearReason(perception, observerName, kind) {
    if (perception.isUnclear) {
        return `${observerName} cannot clearly perceive the ${kind} here.`;
    }
    if (!perception.hasHighPerception) {
        return `${observerName}'s perception is not sharp enough, some ${kind} might be missing.`;
    }
    return false;
}

/**
 * @param {DEObject} DE
 * @param {string} targetId
 * @param {string} observerId
 * @param {'visible' | 'perceived'} perceptionForm
 * @returns {Promise<DECharacterPerspectiveCharacter>}
 */
async function buildPerspectiveCharacter(DE, targetId, observerId, perceptionForm) {
    const target = DE.characters[targetId];
    if (!target) {
        throw new Error(`Character ${targetId} not found.`);
    }
    const observer = DE.characters[observerId];
    if (!observer) {
        throw new Error(`Character ${observerId} not found.`);
    }
    const targetState = DE.stateFor[targetId];
    if (!targetState) {
        throw new Error(`Character state for ${targetId} not found.`);
    }

    const isSelf = targetId === observerId;

    const activeBond = DE.bonds[observerId]?.active.find(b => b.towards === targetId) || null;
    const exBond = activeBond ? null : (DE.bonds[observerId]?.ex.find(b => b.towards === targetId) || null);
    const bond = activeBond || exBond;

    const perception = DE.utils.characterInfo.whatCanTheyMakeOfAnotherCharacter(targetId, observerId);

    const characterName = getNameIdentificationForOneCharacterTowardsAnotherOnlyName(DE, observer, target);

    /** @type {string[]} */
    let characterAllNames;
    if (isSelf) {
        characterAllNames = [target.name];
    } else if (bond && bond.knowsAs.length > 0) {
        characterAllNames = [...new Set(bond.knowsAs.map(k => k.name))];
    } else {
        characterAllNames = [target.unknownName];
    }

    const familyRelation = isSelf ? null : getFamilyBondRelation(observer, target);
    const bondDescription = isSelf ? '' : await buildBondDescription(DE, observer, target);

    const characterExternalDescription = await getExternalDescriptionOfCharacter(DE, targetId, observerId, false, false);
    const characterPlaceAndPostureDescription = isSelf
        ? getExternalDescriptionOfCharacterPostureOnly(DE, targetId, observerId)
        : bondDescription;

    const characterCarryingItems = perception.canTellDetailsOfClothingOrCarriedItems ? await buildItemsInPerspective(DE, targetState.carrying || [], observerId) : [];
    const characterWearingItems = perception.canTellDetailsOfClothingOrCarriedItems ? await buildItemsInPerspective(DE, targetState.wearing || [], observerId) : [];

    const carriedCharacters = getListOfCarriedCharactersByCharacter(DE, targetId)
        .map(c => c.carriedId)
        .filter(carriedId => isSelf || DE.utils.characterInfo.canSeeCharacter(carriedId, observerId) !== 'invisible');

    return {
        characterMetadata: target.metadata || {},
        characterId: targetId,
        characterName,
        characterAllNames,
        bond: isSelf ? 0 : (bond ? bond.bond : 0),
        bond2: isSelf ? 0 : (bond ? bond.bond2 : 0),
        stranger: isSelf ? false : (bond ? bond.stranger : true),
        perceivedGender: perception.canTellGender ? target.gender : 'unknown',
        familyRelation,
        bondDescription,
        canTellHeight: perception.canTellHeight,
        canTellWeight: perception.canTellWeight,
        characterHeightCm: perception.canTellHeight ? target.heightCm : 0,
        characterWeightKg: perception.canTellWeight ? target.weightKg : 0,
        characterExternalDescription,
        characterPlaceAndPostureDescription,
        perceptionForm,
        canTellDetailsOfClothingOrCarriedItems: perception.canTellDetailsOfClothingOrCarriedItems,
        characterCarryingItems,
        characterWearingItems,
        characterCarryingOtherCharactersIds: carriedCharacters,
    };
}

/**
 * Reconstructs the relationship text the observer holds about the target, reusing the same bond
 * declarations that feed the character system prompts. Returns an empty string when no bond applies.
 * @param {DEObject} DE
 * @param {DECompleteCharacterReference} observer
 * @param {DECompleteCharacterReference} target
 * @returns {Promise<string>}
 */
async function buildBondDescription(DE, observer, target) {
    try {
        let bond = DE.bonds[observer.id]?.active.find(b => b.towards === target.id)
            || DE.bonds[observer.id]?.ex.find(b => b.towards === target.id)
            || null;
        if (!bond) {
            bond = /** @type {DESingleBondDescription} */ ({
                towards: target.id,
                stranger: true,
                bond: 0,
                bond2: 0,
                knowsAs: [],
                createdAt: DE.currentTime,
                undoableShifts: {},
            });
        }

        const bondDeclaration = getBondDeclarationFromBondDescription(DE, observer, bond);
        if (!bondDeclaration) {
            return '';
        }

        const familyRelation = getFamilyBondRelation(observer, target);
        const generalRelationship = await getRelationship(DE, observer, target);
        const templateInfo = {
            char: observer,
            other: target,
            otherFamilyRelation: familyRelation,
            otherRelationship: generalRelationship,
        };

        let result = typeof bondDeclaration.description === 'string'
            ? bondDeclaration.description
            : (await bondDeclaration.description(templateInfo)).trim();

        if (bondDeclaration.bondAdditionalDescription) {
            if (!result.endsWith('. ') && !result.endsWith(' ')) {
                result += ' ';
            }
            result += typeof bondDeclaration.bondAdditionalDescription === 'string'
                ? bondDeclaration.bondAdditionalDescription
                : (await bondDeclaration.bondAdditionalDescription(templateInfo)).trim();
        }

        const selfRef = getNameIdentificationForOneCharacterTowardsAnother(DE, observer, observer);
        const otherRef = getNameIdentificationForOneCharacterTowardsAnother(DE, observer, target);

        if (bond.knowsAs.length === 0 && bond.stranger) {
            result += `\n\n${otherRef} is a stranger to ${selfRef}, ${selfRef} does not know their name.`;
        } else if (bond.knowsAs.length === 0) {
            result += `\n\n${otherRef} is an acquaintance to ${selfRef}, but ${selfRef} does not know their name!`;
        } else if (bond.stranger) {
            result += `\n\n${otherRef} is a stranger to ${selfRef}, but ${selfRef} knows their name and some details about them.`;
        } else {
            result += `\n\n${otherRef} is known to ${selfRef}, ${selfRef} knows their name and many details about them.`;
        }

        if (familyRelation) {
            result += `\n\n${otherRef} is ${selfRef}'s ${familyRelation}.`;
        }

        const isAttractive = DE.utils.bonds.isAttractedToWithReasoning(observer, target.id);
        if (isAttractive && isAttractive.reasoning) {
            result += `\n\n${isAttractive.reasoning}.`;
        }

        return result.trim();
    } catch (error) {
        console.warn(`Unable to build bond description from ${observer.id} towards ${target.id}`, error);
        return '';
    }
}

/**
 * Recursively builds the items an observer can make out from a raw item list, dropping anything
 * invisible to them and honouring whether they can peer inside or on top of each container.
 * @param {DEObject} DE
 * @param {DEItem[]} items
 * @param {string} observerId
 * @returns {Promise<DEItemInPerspective[]>}
 */
async function buildItemsInPerspective(DE, items, observerId) {
    const observer = DE.characters[observerId];
    /** @type {DEItemInPerspective[]} */
    const result = [];

    for (const item of items) {
        const visibility = DE.utils.items.canSeeItem(item, observerId);
        if (visibility === 'invisible') continue;

        const perception = DE.utils.items.whatCanTheyMakeOfAnItem(item, observerId);

        const canSeeContents = perception.canSeeContents === 'YES';
        const canSeeOntop = perception.canSeeOntop === 'YES';

        /** @type {DEItemInPerspective} */
        const node = {
            ...item,
            ontop: [],
            containing: [],
            containingCharacters: [],
            ontopCharacters: [],
            canSeeContents,
            contentsIsUnclear: containerUnclearReason(perception, 'contents'),
            canSeeOntop,
            ontopIsUnclear: containerUnclearReason(perception, 'ontop'),
        };

        // When the observer cannot discern the exact item, obscure identifying detail the same way
        // the engine's item name/description formatters do for perceived-only items.
        if (!perception.canTellTheirExactDescription && observer) {
            const label = getPerceivedItemLabel(item, observer);
            node.name = label;
            node.description = `An indistinct ${label} whose details cannot be made out.`;
        }
        if (!perception.canTellTheirVolume) node.volumeLiters = 0;
        if (!perception.canTellTheirWeight) node.weightKg = 0;

        if (canSeeContents) {
            node.containing = await buildItemsInPerspective(DE, item.containing || [], observerId);
            node.containingCharacters = visibleCharacterIds(DE, item.containingCharacters, observerId);
        }
        if (canSeeOntop) {
            node.ontop = await buildItemsInPerspective(DE, item.ontop || [], observerId);
            node.ontopCharacters = visibleCharacterIds(DE, item.ontopCharacters, observerId);
        }

        result.push(node);
    }

    return result;
}

/**
 * @param {DEObject} DE
 * @param {Array<{ id: string }> | undefined} entries
 * @param {string} observerId
 * @returns {string[]}
 */
function visibleCharacterIds(DE, entries, observerId) {
    if (!entries) return [];
    return entries
        .map(entry => entry.id)
        .filter(id => DE.utils.characterInfo.canSeeCharacter(id, observerId) !== 'invisible');
}

/**
 * @param {DEItemPerception} perception
 * @param {'contents' | 'ontop'} kind
 * @returns {false | string}
 */
function containerUnclearReason(perception, kind) {
    const permission = kind === 'contents' ? perception.canSeeContents : perception.canSeeOntop;
    const where = kind === 'contents' ? 'inside' : 'what is on top';
    if (permission === 'YES') {
        return perception.hasHighPerception
            ? false
            : `Perception is not sharp enough; some ${kind === 'contents' ? 'contents' : 'items on top'} might be missing.`;
    }
    if (permission === 'NO_BECAUSE_CLOSED') return `It is closed, so ${where} cannot be seen.`;
    if (permission === 'NO_BECAUSE_BAD_VISION') return `Vision is not clear enough to see ${where}.`;
    if (permission === 'NO') return `Cannot see ${where}.`;
    // NOT_A_CONTAINER
    return false;
}