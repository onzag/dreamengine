/** Snapshot lookups shared by views, narration and identifier dialogs. */

/** @param {Node | null} node @returns {DECharacterPerspective | null} */
export function getPerspectiveFor(node) {
    while (node) {
        if ('currentPerspective' in node) {
            return /** @type {{currentPerspective: DECharacterPerspective | null}} */ (node).currentPerspective;
        }
        node = node.parentNode || (node instanceof ShadowRoot ? node.host : null);
    }
    return null;
}

/** @type {WeakMap<DECharacterPerspective, ReturnType<typeof buildIndex>>} */
const indexes = new WeakMap();

/** @param {DECharacterPerspective} perspective */
function buildIndex(perspective) {
    /** @type {Map<string, DECharacterPerspectiveCharacter>} */
    const characters = new Map();
    /** @type {Map<string, DEItemInPerspective>} */
    const items = new Map();
    const slots = new Map(perspective.ownLocation.slots.map(slot => [slot.slotId, slot]));
    /** @param {DEItemInPerspective[]} list */
    const addItems = list => {
        for (const item of list) {
            for (const { id } of item.ids) items.set(id, item);
            if (item.canSeeContents) addItems(item.containing);
            if (item.canSeeOntop) addItems(item.ontop);
        }
    };
    const { socialGroups } = perspective;
    const visibleCharacters = [perspective.self, ...socialGroups.ownGroup,
        ...socialGroups.soloCharacters, ...socialGroups.otherGroups.flat(),
        ...perspective.ownLocation.slots.flatMap(slot => slot.characters)];
    for (const character of visibleCharacters) {
        if (characters.has(character.characterId)) continue;
        characters.set(character.characterId, character);
        if (character.canTellDetailsOfClothingOrCarriedItems) {
            addItems(character.characterCarryingItems);
            addItems(character.characterWearingItems);
        }
    }
    for (const slot of slots.values()) if (slot.canSeeItems) addItems(slot.items);
    return { characters, items, slots };
}

/** @param {DECharacterPerspective} perspective */
export function getPerspectiveIndex(perspective) {
    let index = indexes.get(perspective);
    if (!index) {
        index = buildIndex(perspective);
        indexes.set(perspective, index);
    }
    return index;
}

/** Parse the perspective's already formatted narration with the engine parser.
 * @param {string} text
 * @returns {Promise<DEConversationMessageNarrationFragment[]>}
 */
export async function parsePerspectiveNarration(text) {
    if (!text.trim()) return [];
    return window.ENGINE_WORKER_CLIENT.queryDEObject({
        path: ['utils', 'narrationAndDialogue', 'parseNarration'], call: [text],
    });
}
