/** @typedef {{id: string, name: string, image: string, locationSlot: string, conversationId: string|null}} SurroundingCharacter */
/** @typedef {{id: string, primary: boolean, characters: SurroundingCharacter[]}} SurroundingGroup */

/** Remove the redundant player portrait and omit groups left empty by that.
 * @param {SurroundingGroup[]} groups
 * @param {string} userId
 * @returns {SurroundingGroup[]}
 */
export function getVisibleSurroundingGroups(groups, userId) {
    return groups.map(group => ({ ...group, characters: group.characters.filter(c => c.id !== userId) }))
        .filter(group => group.characters.length > 0)
        .sort((a, b) => Number(b.primary) - Number(a.primary));
}

/**
 * Resolve overlapping conversation membership once, before creating any DOM.
 * A character's current conversation wins; otherwise prefer the user's group,
 * then conversation ID for a deterministic result. Off-location participants
 * never appear, even when they belong to a conversation at this location.
 * @param {{conversations: Array<{id: string, participants: string[], remoteParticipants: string[]}>, foundCharacters: string[], leftoverCharacters: string[]}} scene
 * @param {string} userId
 * @param {SurroundingCharacter[]} characters
 * @returns {SurroundingGroup[]}
 */
export function buildSurroundingGroups(scene, userId, characters) {
    const present = new Set(scene.foundCharacters);
    const byId = new Map(characters.filter(c => present.has(c.id)).map(c => [c.id, c]));
    const conversations = scene.conversations.map(c => ({
        id: c.id,
        members: new Set([...c.participants, ...c.remoteParticipants].filter(id => byId.has(id))),
    })).sort((a, b) => a.id.localeCompare(b.id));
    const userConversation = byId.get(userId)?.conversationId;
    const primary = conversations.find(c => c.id === userConversation && c.members.has(userId))
        || conversations.find(c => c.members.has(userId));
    /** @type {Map<string, SurroundingCharacter[]>} */
    const assigned = new Map();
    for (const character of byId.values()) {
        const choices = conversations.filter(c => c.members.has(character.id));
        const chosen = choices.find(c => c.id === character.conversationId)
            || choices.find(c => c === primary) || choices[0];
        const key = chosen ? `conversation:${chosen.id}` : `solo:${character.id}`;
        const members = assigned.get(key) || [];
        members.push(character);
        assigned.set(key, members);
    }
    return [...assigned.values()].map(members => {
        members.sort((a, b) => Number(b.id === userId) - Number(a.id === userId) || a.id.localeCompare(b.id));
        // Membership-based keys avoid animating a no-op conversation ID change.
        // All one-person groups, including leftovers, have identical treatment.
        return {
            id: JSON.stringify(members.map(c => c.id).sort()),
            primary: members.some(c => c.id === userId),
            characters: members,
        };
    }).sort((a, b) => Number(b.primary) - Number(a.primary) || a.id.localeCompare(b.id));
}
