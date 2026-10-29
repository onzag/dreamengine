/** @typedef {{id: string, name: string, image: string, externalDescription: string, locationSlot: string, locationSlotName: string, conversationId: string|null, visibility: DEVisibility, remote: boolean, communicatorName: string}} SurroundingCharacter */
/** @typedef {{id: string, primary: boolean, characters: SurroundingCharacter[]}} SurroundingGroup */
/** @typedef {Pick<DEConversation, 'id'|'participants'|'locations'|'communicators'>} SurroundingConversation */
/** @typedef {{conversations: SurroundingConversation[], foundCharacters: string[], leftoverCharacters: string[]}} SurroundingScene */

/** Remove the player and unseen outsiders. Perceived outsiders have no name;
 * conversation partners remain identifiable regardless of sight.
 * Keep the original membership keys so changes in visibility don't relocate
 * everyone else in the group.
 * @param {SurroundingGroup[]} groups
 * @param {string} userId
 * @returns {SurroundingGroup[]}
 */
export function getVisibleSurroundingGroups(groups, userId) {
    return groups.map(group => ({ ...group, characters: group.characters
        .filter(c => c.id !== userId && (group.primary || (!c.remote && (c.visibility === 'visible' || c.visibility === 'perceived'))))
        .map(c => !group.primary && c.visibility === 'perceived' ? { ...c, name: '' } : c),
    }))
        .filter(group => group.characters.length > 0)
        .sort((a, b) => Number(b.primary) - Number(a.primary));
}

/**
 * Resolve overlapping conversation membership once, before creating any DOM.
 * A character's current conversation wins; otherwise prefer the user's group,
 * then conversation ID for a deterministic result. Only the user's group may
 * include participants at other locations; different slots remain local.
 * @param {SurroundingScene} scene
 * @param {string} userId
 * @param {SurroundingCharacter[]} characters
 * @param {string} currentLocation
 * @returns {SurroundingGroup[]}
 */
export function buildSurroundingGroups(scene, userId, characters, currentLocation) {
    const present = new Set(scene.foundCharacters);
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
        const choices = memberships.filter(c => c === primary || c.locations[character.id]?.locationId === currentLocation);
        const chosen = choices.find(c => c.id === character.conversationId)
            || choices.find(c => c === primary) || choices[0];
        // Never turn a filtered remote outsider into a standalone local portrait.
        if (!chosen && (memberships.length || !present.has(character.id))) continue;
        const key = chosen ? `conversation:${chosen.id}` : `solo:${character.id}`;
        const members = assigned.get(key) || [];
        const location = chosen?.locations[character.id];
        members.push({
            ...character,
            locationSlot: location?.locationSlotId || character.locationSlot,
            locationSlotName: location?.locationSlotNameAtTheTime || character.locationSlotName,
            remote: chosen ? location?.locationId !== currentLocation : false,
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
            characters: members,
        };
    }).sort((a, b) => Number(b.primary) - Number(a.primary) || a.id.localeCompare(b.id));
}
