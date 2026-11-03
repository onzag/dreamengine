import { getPerspectiveIndex } from './perspective-data.js';

/**
 * @typedef {{perspective: DECharacterPerspective, userId: string, userName: string, blindness: DECharacterPerspective['ownCharacterBlindness'], memoryScope: string}} ItemTreeContext
 * @typedef {'communicator' | 'consumable' | 'container' | 'open' | 'closed' | 'locked' | 'eye' | 'eye-off' | 'rigid' | 'flexible' | 'tag'} ItemTagIcon
 * @typedef {{label: string, source: 'item' | 'state', type: 'communicator' | 'consumable' | 'container' | 'open' | 'closed' | 'locked' | 'capacity-weight' | 'capacity-volume' | 'weight' | 'volume' | 'relative-position' | 'posture' | 'tag', icons?: ItemTagIcon[], description?: string}} ItemTagData
 * @typedef {{kind: 'item', id: string, label: string, amount: number, asset: string, tags: ItemTagData[], item: DEItemInPerspective}} ItemNodeData
 * @typedef {{kind: 'character', id: string, label: string, description: string, amount: number, asset: string, tags: ItemTagData[]}} CharacterNodeData
 * @typedef {{label: string, message: string, items: (ItemNodeData | CharacterNodeData)[]}} ItemGroupData
 */

/** @param {DECharacterPerspective} perspective @returns {ItemTreeContext} */
export function getItemTreeContext(perspective) {
    return { perspective, userId: perspective.ownId, userName: perspective.ownName,
        blindness: perspective.ownCharacterBlindness, memoryScope: perspective.ownId };
}

/** @param {number} value @param {'weight' | 'volume'} kind */
export function formatItemMeasurement(value, kind) {
    const small = value > 0 && value < 1;
    const converted = small ? value * 1000 : value;
    const unit = kind === 'weight' ? (small ? 'g' : 'kg') : (small ? 'mL' : 'L');
    return `${converted} ${unit}`;
}

/**
 * Derived item properties and explicit state tags keep their own provenance.
 * @param {Pick<DEItem, 'communicator' | 'consumableProperties' | 'containerProperties' | 'wearableProperties' | 'state'>} item
 * @returns {ItemTagData[]}
 */
function getItemTags(item) {
    /** @type {ItemTagData[]} */
    const tags = [];
    if (item.communicator) tags.push({ label: 'Communicator', source: 'item', type: 'communicator' });
    if (item.consumableProperties) tags.push({ label: 'Consumable', source: 'item', type: 'consumable' });
    if (item.containerProperties) {
        const container = item.containerProperties;
        const structure = container.structure === 'flexible' ? 'flexible' : 'rigid';
        const visibilityIcon = container.canSeeContentsFromOutside ? 'eye' : 'eye-off';
        const visibilityDescription = container.canSeeContentsFromOutside ? 'Contents visible from outside' : 'Contents concealed when closed';
        tags.push({ label: item.wearableProperties ? 'Can Hold Items' : 'Container', source: 'item', type: 'container',
            icons: container.openable ? ['container', structure] : ['container', structure, visibilityIcon],
            description: `${structure} container${container.openable ? '' : `; ${visibilityDescription}`}` });
        if (container.openable) {
            const state = item.state?.opened ? 'open' : container.usesLock && item.state?.locked ? 'locked' : 'closed';
            tags.push({ label: state.charAt(0).toUpperCase() + state.slice(1), source: 'item', type: state,
                icons: [state, visibilityIcon], description: visibilityDescription });
        }
        if (Number.isFinite(container.capacityKg) && container.capacityKg >= 0) {
            tags.push({ label: formatItemMeasurement(container.capacityKg, 'weight'),
                source: 'item', type: 'capacity-weight', icons: ['container'] });
        }
        if (Number.isFinite(container.capacityLiters) && container.capacityLiters >= 0) {
            tags.push({ label: formatItemMeasurement(container.capacityLiters, 'volume'),
                source: 'item', type: 'capacity-volume', icons: ['container'] });
        }
    }
    const seen = new Set();
    for (const rawTag of Array.isArray(item.state?.tags) ? item.state.tags : []) {
        if (typeof rawTag !== 'string') continue;
        const text = rawTag.trim();
        const key = text.toLowerCase();
        if (!text || seen.has(key)) continue;
        seen.add(key);
        tags.push({ label: text.charAt(0).toUpperCase() + text.slice(1), source: 'state', type: 'tag' });
    }
    return tags;
}


/** @param {DEItemInPerspective} item @param {string} [id] @returns {ItemNodeData} */
function itemNode(item, id = item.ids[0].id, useSimpleName = false) {
    /** @type {ItemTagData[]} */
    const tags = [];
    // Zero is also the snapshot's sentinel for an unknown measurement.
    if (Number.isFinite(item.weightKg) && item.weightKg > 0) {
        tags.push({ label: formatItemMeasurement(item.weightKg, 'weight'), source: 'item', type: 'weight' });
    }
    if (Number.isFinite(item.volumeLiters) && item.volumeLiters > 0) {
        tags.push({ label: formatItemMeasurement(item.volumeLiters, 'volume'), source: 'item', type: 'volume' });
    }
    tags.push(...getItemTags(item));
    if (item.relativePosition) tags.push({ label: item.relativePosition, source: 'item', type: 'relative-position' });
    return { kind: 'item', id, label: useSimpleName ? item.name : item.nameInAmount || item.name, amount: item.amount,
        asset: item.metadata?.asset || '', tags, item };
}

/** All underlying IDs in a merged stack resolve to the same snapshot item.
 * @param {string} id @param {ItemTreeContext} context @returns {ItemNodeData}
 */
export function loadItemNode(id, context, useSimpleName = false) {
    const item = getPerspectiveIndex(context.perspective).items.get(id);
    if (!item) throw new Error('Item is not available in this perspective.');
    return itemNode(item, id, useSimpleName);
}

/** @param {DECharacterPerspectiveCharacter} character @returns {CharacterNodeData} */
function characterNode(character) {
    return { kind: 'character', id: character.characterId, label: character.characterNameComplex, amount: 1,
        asset: character.characterMetadata.assets?.neutral || '', tags: [],
        description: character.characterPlaceAndPostureDescription };
}

/** @param {string[]} ids @param {ItemTreeContext} context */
function characterNodes(ids, context) {
    const { characters } = getPerspectiveIndex(context.perspective);
    return ids.flatMap(id => {
        const character = characters.get(id);
        return character ? [characterNode(character)] : [];
    });
}

/** @param {ItemNodeData} node @param {ItemTreeContext} context @returns {ItemGroupData[]} */
export function loadItemGroups(node, context) {
    const item = node.item;
    /** @type {ItemGroupData[]} */
    const groups = [];
    if (item.containerProperties || item.containing.length || item.containingCharacters.length || item.contentsIsUnclear) {
        const items = item.canSeeContents
            ? [...item.containing.map(item => itemNode(item)), ...characterNodes(item.containingCharacters, context)] : [];
        groups.push({ label: 'Inside', items, message: item.contentsIsUnclear ||
            (!item.canSeeContents ? 'Cannot see inside.' : items.length ? '' : 'There are no items or characters inside.') });
    }
    const items = item.canSeeOntop
        ? [...item.ontop.map(item => itemNode(item)), ...characterNodes(item.ontopCharacters, context)] : [];
    if (items.length || item.ontopIsUnclear || item.maxVolumeOnTopLiters || item.maxWeightOnTopKg) {
        groups.push({ label: 'On top', items, message: item.ontopIsUnclear ||
            (!item.canSeeOntop ? 'Cannot see what is on top.' : items.length ? '' : 'There are no items or characters on top.') });
    }
    return groups;
}

/** @param {string} characterId @param {ItemTreeContext} context @returns {ItemGroupData[]} */
export function loadCharacterItemGroups(characterId, context) {
    const character = getPerspectiveIndex(context.perspective).characters.get(characterId);
    if (!character) throw new Error('Character is not available in this perspective.');
    const visible = character.canTellDetailsOfClothingOrCarriedItems;
    return ['Carrying', 'Wearing'].map(label => {
        const items = visible ? (label === 'Carrying' ? character.characterCarryingItems : character.characterWearingItems)
            .map(item => itemNode(item)) : [];
        /** @type {(ItemNodeData | CharacterNodeData)[]} */
        const nodes = [...items];
        if (label === 'Carrying') nodes.push(...characterNodes(character.characterCarryingOtherCharactersIds, context));
        return { label, items: nodes, message: !visible ? (label === 'Carrying' ? 'Cannot see carried objects.' : 'Cannot see clothing or accessories.')
            : nodes.length ? '' : character.characterNameDefinite + ' is not ' + label.toLowerCase() + ' any items.' };
    });
}

/** @param {string} slotId @param {ItemTreeContext} context @returns {ItemGroupData[]} */
export function loadLocationSlotItemGroups(slotId, context) {
    const { perspective } = context;
    const slot = getPerspectiveIndex(perspective).slots.get(slotId);
    if (!slot) throw new Error('Location slot is not available in this perspective.');
    const characters = slot.characters.map(character => characterNode(character));
    if (slotId === perspective.ownLocationSlotId) characters.unshift(characterNode(perspective.self));
    const items = slot.items.map(item => itemNode(item));
    return [
        { label: 'Characters', items: characters, message: slot.characterListsAreUnclear ||
            (!slot.canSeeCharacters ? 'Cannot see the characters here.' : characters.length ? '' : 'There are no characters here.') },
        { label: 'Items', items, message: slot.itemListsAreUnclear ||
            (!slot.canSeeItems ? 'Cannot see the items here.' : items.length ? '' : 'There are no items at ' + slot.slotName + '.') },
    ];
}
