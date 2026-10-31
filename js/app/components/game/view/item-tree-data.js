import { formatCharacterPosition } from './character-position.js';

/**
 * @typedef {{userId: string, userName: string, blindness: DECompleteCharacterReference['blindness'], memoryScope: string}} ItemTreeContext
 * @typedef {'communicator' | 'consumable' | 'container' | 'open' | 'closed' | 'locked' | 'eye' | 'eye-off' | 'rigid' | 'flexible' | 'tag'} ItemTagIcon
 * @typedef {{label: string, source: 'item' | 'state', type: 'communicator' | 'consumable' | 'container' | 'open' | 'closed' | 'locked' | 'capacity-weight' | 'capacity-volume' | 'weight' | 'volume' | 'relative-position' | 'posture' | 'tag', icons?: ItemTagIcon[], description?: string}} ItemTagData
 * @typedef {{kind?: 'item', id: string, label: string, amount: number, asset: string, tags: ItemTagData[], perception: DEItemPerception}} ItemNodeData
 * @typedef {{kind: 'character', id: string, label: string, descriptionFragments?: DEConversationMessageNarrationFragment[], amount: number, asset: string, tags: ItemTagData[]}} CharacterNodeData
 * @typedef {{label: string, message: string, items: (ItemNodeData | CharacterNodeData)[]}} ItemGroupData
 */

/** @param {string} userId @returns {Promise<ItemTreeContext>} */
export async function getItemTreeContext(userId) {
    const client = window.ENGINE_WORKER_CLIENT;
    const [blindness, worldName, userName] = await Promise.all([
        client.queryDEObject({ path: ['characters', userId, 'blindness'] }),
        client.queryDEObject({ path: ['world', 'name'] }),
        client.queryDEObject({ path: ['utils', 'templates', 'formatCharacterName'], call: [userId, userId,
            { __type: 'object', value: { justName: true, type: 'definite', capitalize: true } }] }),
    ]);
    return { userId, userName, blindness: blindness || 'no', memoryScope: JSON.stringify([worldName, userId]) };
}

/** @param {(ItemNodeData | CharacterNodeData)[]} items @param {string} emptyMessage @param {ItemTreeContext} context @param {boolean} hasHighPerception */
function itemListMessage(items, emptyMessage, context, hasHighPerception) {
    if (items.length) return hasHighPerception ? '' : `${context.userName} might be missing some items.`;
    return hasHighPerception ? emptyMessage : `${context.userName} cannot see any items.`;
}

/** @param {number} value @param {'weight' | 'volume'} kind @param {boolean} exact */
export function formatItemMeasurement(value, kind, exact) {
    const small = value > 0 && value < 1;
    const converted = small ? value * 1000 : value;
    const unit = kind === 'weight' ? (small ? 'g' : 'kg') : (small ? 'mL' : 'L');
    return `${exact ? '' : '≈ '}${exact ? converted : Number(converted.toPrecision(2))} ${unit}`;
}

/**
 * Derived item properties and explicit state tags keep their own provenance.
 * @param {Pick<DEItem, 'communicator' | 'consumableProperties' | 'containerProperties' | 'wearableProperties' | 'state'>} item
 * @param {DEItemPerception} perception
 * @returns {ItemTagData[]}
 */
function getItemTags(item, perception) {
    if (!perception.canTellTheirExactDescription) return [];
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
        if (perception.canTellTheirWeight && Number.isFinite(container.capacityKg) && container.capacityKg >= 0) {
            tags.push({ label: formatItemMeasurement(container.capacityKg, 'weight', perception.hasHighPerception),
                source: 'item', type: 'capacity-weight', icons: ['container'] });
        }
        if (perception.canTellTheirVolume && Number.isFinite(container.capacityLiters) && container.capacityLiters >= 0) {
            tags.push({ label: formatItemMeasurement(container.capacityLiters, 'volume', perception.hasHighPerception),
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

/**
 * The root of an explicit item dialog may be known without being detectable.
 * Lists always filter representatives before requesting their names or images.
 * @param {string} id @param {ItemTreeContext} context @param {number} [amount]
 * @param {DEItemPerception} [perception]
 * @returns {Promise<ItemNodeData>}
 */
export async function loadItemNode(id, context, amount = 1, perception) {
    const client = window.ENGINE_WORKER_CLIENT;
    perception ||= await client.queryDEObject({ path: ['utils', 'items', 'whatCanTheyMakeOfAnItem'], call: [id, context.userId] });
    if (!perception) throw new Error('Item perception unavailable');
    const [item, label] = await Promise.all([
        client.queryDEObject({ path: ['utils', 'items', 'getItemById'], call: [id], pick: ['metadata', 'weightKg', 'volumeLiters', 'communicator', 'consumableProperties', 'containerProperties', 'wearableProperties', 'state', 'relativePosition'] }),
        client.queryDEObject({ path: ['utils', 'templates', 'formatItemLabel'], call: [id, context.userId,
            { __type: 'object', value: { justName: true, capitalize: true, type: 'plain' } }] }),
    ]);
    if (!item) throw new Error(`Item ${id} no longer exists`);
    /** @type {ItemTagData[]} */
    const tags = [];
    if (perception.canTellTheirWeight && Number.isFinite(item.weightKg) && item.weightKg >= 0) {
        tags.push({ label: formatItemMeasurement(item.weightKg, 'weight', perception.hasHighPerception), source: 'item', type: 'weight' });
    }
    if (perception.canTellTheirVolume && Number.isFinite(item.volumeLiters) && item.volumeLiters >= 0) {
        tags.push({ label: formatItemMeasurement(item.volumeLiters, 'volume', perception.hasHighPerception), source: 'item', type: 'volume' });
    }
    tags.push(...getItemTags(item, perception), ...getRelativePositionTags(item.relativePosition));
    return { id, label, amount, asset: item.metadata?.asset || '', tags, perception };
}

/**
 * @param {'items' | 'characterInfo' | 'world'} category
 * @param {string} method @param {string} id @param {ItemTreeContext} context
 * @returns {Promise<ItemNodeData[]>}
 */
export async function loadRepresentativeNodes(category, method, id, context) {
    const client = window.ENGINE_WORKER_CLIENT;
    // Only IDs and counts are needed here; do not transfer entire nested inventories.
    /** @type {Array<{item: {id: string}, amount: number}>} */
    const representatives = await client.queryDEObject({ path: ['utils', category, method], call: [id], depth: 1 });
    const nodes = await Promise.all(representatives.map(async ({ item, amount }) => {
        const visibility = await client.queryDEObject({ path: ['utils', 'items', 'canSeeItem'], call: [item.id, context.userId] });
        if (visibility === 'invisible') return null;
        return loadItemNode(item.id, context, amount);
    }));
    return nodes.filter(node => node !== null);
}

/** @param {string | null | undefined} position @returns {ItemTagData[]} */
function getRelativePositionTags(position) {
    return position?.trim() ? [{ label: position.trim(), source: 'item', type: 'relative-position' }] : [];
}

/** @param {string} itemId @param {'containingCharacters' | 'ontopCharacters'} relation
 * @param {ItemTreeContext} context @returns {Promise<CharacterNodeData[]>} */
async function loadCharacterNodes(itemId, relation, context) {
    const client = window.ENGINE_WORKER_CLIENT;
    const item = await client.queryDEObject({ path: ['utils', 'items', 'getItemById'], call: [itemId], pick: [relation] });
    /** @type {Array<{id: string, relativePosition?: string | null}>} */
    const characters = item?.[relation] || [];
    const nodes = await Promise.all(characters.map(async ({ id, relativePosition }) => {
        const visibility = await client.queryDEObject({ path: ['utils', 'characterInfo', 'canSeeCharacter'], call: [id, context.userId] });
        if (visibility === 'invisible') return null;
        const [label, metadata, state] = await Promise.all([
            client.queryDEObject({ path: ['utils', 'templates', 'formatCharacterName'], call: [id, context.userId,
                { __type: 'object', value: { justName: true, type: 'indefinite', capitalize: true } }] }),
            client.queryDEObject({ path: ['characters', id, 'metadata'], pick: ['assets'] }),
            client.queryDEObject({ path: ['stateFor', id], pick: ['posture'] }),
        ]);
        return /** @type {CharacterNodeData} */ ({ kind: 'character', id, label, amount: 1,
            asset: metadata?.assets?.neutral || '', tags: [{ label: formatCharacterPosition(state.posture, relativePosition), source: 'item', type: 'posture' }] });
    }));
    return nodes.filter(node => node !== null);
}

/** @param {ItemNodeData} item @param {ItemTreeContext} context @returns {Promise<ItemGroupData[]>} */
export async function loadItemGroups(item, context) {
    const { canSeeContents, canSeeOntop } = item.perception;
    /** @type {Array<{label: string, method: string, characters: 'containingCharacters' | 'ontopCharacters', permission: DEItemPerception['canSeeContents'], location: string}>} */
    const relations = [
        { label: 'Inside', method: 'getRepresentativeContents', characters: 'containingCharacters', permission: canSeeContents, location: 'items inside' },
        { label: 'On top', method: 'getRepresentativeOntop', characters: 'ontopCharacters', permission: canSeeOntop, location: 'items on top' },
    ];
    return Promise.all(relations.filter(relation => relation.permission !== 'NOT_A_CONTAINER').map(async relation => {
        if (relation.permission !== 'YES') {
            const message = relation.permission === "NO" ? `${context.userName} cannot see inside.` : (relation.permission === 'NO_BECAUSE_CLOSED'
                ? `${context.userName} cannot see inside because it is closed.`
                : relation.label === 'Inside' ? `${context.userName}'s vision is not clear enough to see inside.` : `${context.userName}'s vision is not clear enough to see what is on top.`);
            return { label: relation.label, message, items: [] };
        }
        const [itemNodes, characterNodes] = await Promise.all([
            loadRepresentativeNodes('items', relation.method, item.id, context),
            loadCharacterNodes(item.id, relation.characters, context),
        ]);
        const items = [...itemNodes, ...characterNodes];
        return { label: relation.label, message: itemListMessage(items, `There are no ${relation.location.replace("items", "items or characters")}.`, context,
            item.perception.hasHighPerception), items };
    }));
}

/** @param {string} characterId @param {ItemTreeContext} context @returns {Promise<ItemGroupData[]>} */
export async function loadCharacterItemGroups(characterId, context) {
    const client = window.ENGINE_WORKER_CLIENT;
    const [name, perception] = await Promise.all([
        client.queryDEObject({ path: ['utils', 'templates', 'formatCharacterName'], call: [characterId, context.userId,
            { __type: 'object', value: { justName: true, type: 'definite', capitalize: true } }] }),
        client.queryDEObject({ path: ['utils', 'characterInfo', 'whatCanTheyMakeOfAnotherCharacter'], call: [characterId, context.userId], pick: ['hasHighPerception'] }),
    ]);
    return Promise.all(['Carrying', 'Wearing'].map(async label => {
        const items = await loadRepresentativeNodes('characterInfo', `getRepresentative${label}`, characterId, context);
        const message = itemListMessage(items, `${name} is not ${label.toLowerCase()} any items.`, context, perception.hasHighPerception);
        return { label, message, items };
    }));
}

/** @param {string} slotId @param {ItemTreeContext} context @param {string} [slotName] @returns {Promise<ItemGroupData[]>} */
export async function loadLocationSlotItemGroups(slotId, context, slotName) {
    const [items, perception, characters] = await Promise.all([
        loadRepresentativeNodes('world', 'getRepresentativeItemsAtLocationSlot', slotId, context),
        window.ENGINE_WORKER_CLIENT.queryDEObject({ path: ['utils', 'world', 'whatCanTheyMakeOfALocation'], call: [slotId, context.userId], pick: ['hasHighPerception'] }),
        loadLocationSlotCharacters(slotId, context),
    ]);
    if (!items.length && perception.hasHighPerception && !slotName) {
        slotName = await window.ENGINE_WORKER_CLIENT.queryDEObject({ path: ['utils', 'templates', 'formatLocationSlotName'],
            call: [slotId, context.userId, { __type: 'object', value: { justName: true } }] });
    }
    return [
        { label: 'Characters', message: perception.hasHighPerception
            ? (characters.length ? '' : 'There are no characters here.')
            : `${context.userName} ${characters.length ? 'might be missing some characters' : 'cannot see any characters'}.`, items: characters },
        { label: 'Items', message: itemListMessage(items, `There are no items at ${slotName}.`, context, perception.hasHighPerception), items },
    ];
}

/** Flat slot overview intentionally also includes characters shown within item branches.
 * @param {string} slotId @param {ItemTreeContext} context @returns {Promise<CharacterNodeData[]>} */
async function loadLocationSlotCharacters(slotId, context) {
    const client = window.ENGINE_WORKER_CLIENT;
    /** @type {string[]} */
    const ids = await client.queryDEObject({ path: ['utils', 'world', 'getCharacterIdsAtLocationSlot'], call: [slotId] });
    const nodes = await Promise.all(ids.map(async id => {
        const visibility = await client.queryDEObject({ path: ['utils', 'characterInfo', 'canSeeCharacter'], call: [id, context.userId] });
        if (visibility === 'invisible') return null;
        const [label, metadata, description] = await Promise.all([
            client.queryDEObject({ path: ['utils', 'templates', 'formatCharacterName'], call: [id, context.userId,
                { __type: 'object', value: { justName: true, type: 'indefinite', capitalize: true } }] }),
            client.queryDEObject({ path: ['characters', id, 'metadata'], pick: ['assets'] }),
            client.queryDEObject({ path: ['utils', 'characterInfo', 'getExternalDescriptionOfCharacterLocationSpecifics'], call: [id, context.userId, false, true] }),
        ]);
        const descriptionFragments = description ? await client.queryDEObject({
            path: ['utils', 'templates', 'parseNarration'], call: [description],
        }) : [];
        return /** @type {CharacterNodeData} */ ({ kind: 'character', id, label, descriptionFragments,
            amount: 1, asset: metadata?.assets?.neutral || '', tags: [] });
    }));
    return nodes.filter(node => node !== null);
}
