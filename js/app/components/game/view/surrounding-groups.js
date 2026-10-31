/** @typedef {{id: string, name: string, image: string, externalDescription: string, locationSlot: string, locationSlotName: string, conversationId: string|null, visibility: DEVisibility, remote: boolean, communicatorName: string}} SurroundingCharacter */
/** @typedef {{id: string, primary: boolean, characters: SurroundingCharacter[]}} SurroundingGroup */
/** @typedef {Pick<DEConversation, 'id'|'participants'|'locations'|'communicators'>} SurroundingConversation */
/** @typedef {{conversations: SurroundingConversation[], foundCharacters: string[], leftoverCharacters: string[]}} SurroundingScene */

/**
 * Group the local characters already filtered by the engine's visibility result.
 * A character's current conversation wins; otherwise prefer the user's group,
 * then conversation ID for a deterministic result.
 * @param {SurroundingScene} scene
 * @param {string} userId
 * @param {SurroundingCharacter[]} characters
 * @returns {SurroundingGroup[]}
 */
export function buildSurroundingGroups(scene, userId, characters) {
    const byId = new Map(characters.map(c => [c.id, c]));
    const conversations = scene.conversations.map(c => ({
        ...c,
        members: new Set(c.participants.filter(id => byId.has(id))),
    })).sort((a, b) => a.id.localeCompare(b.id));
    const userConversation = byId.get(userId)?.conversationId;
    const primary = conversations.find(c => c.id === userConversation && c.members.has(userId))
        || conversations.find(c => c.members.has(userId));
    /** @type {Map<string, SurroundingCharacter[]>} */
    const assigned = new Map();
    for (const character of byId.values()) {
        const memberships = conversations.filter(c => c.members.has(character.id));
        const chosen = memberships.find(c => c.id === character.conversationId)
            || memberships.find(c => c === primary) || memberships[0];
        const key = chosen ? `conversation:${chosen.id}` : `solo:${character.id}`;
        const members = assigned.get(key) || [];
        const location = chosen?.locations[character.id];
        members.push({
            ...character,
            locationSlot: location?.locationSlotId || character.locationSlot,
            locationSlotName: location?.locationSlotNameAtTheTime || character.locationSlotName,
            remote: false,
            communicatorName: chosen?.communicators[character.id]?.communicatorName || '',
        });
        assigned.set(key, members);
    }
    return [...assigned.values()].map(members => {
        members.sort((a, b) => Number(b.id === userId) - Number(a.id === userId) || a.id.localeCompare(b.id));
        // Membership-based keys avoid animating a no-op conversation ID change.
        // All one-person groups, including leftovers, have identical treatment.
        return {
            id: JSON.stringify(members.map(c => c.id).sort()),
            primary: members.some(c => c.id === userId),
            characters: members.filter(c => c.id !== userId),
        };
    }).filter(group => group.characters.length).sort((a, b) => Number(b.primary) - Number(a.primary) || a.id.localeCompare(b.id));
}
