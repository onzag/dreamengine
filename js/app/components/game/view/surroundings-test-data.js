/** @typedef {import('./surrounding-groups.js').SurroundingCharacter} SurroundingCharacter */
/**
 * Input snapshot before grouping, shared by the live adapter and demo updates.
 * @typedef {object} SurroundingsSceneState
 * @property {string} location
 * @property {string} userId
 * @property {{conversations: Array<{id: string, participants: string[], remoteParticipants: string[]}>, foundCharacters: string[], leftoverCharacters: string[]}} scene
 * @property {SurroundingCharacter[]} characters
 */

/** Fresh editable snapshots; blank image paths use the default portrait.
 * @returns {Array<{label: string, state: SurroundingsSceneState}>}
 */
export function createSurroundingsTestStates() {
    const names = ['Rowan Vale', 'Mira Finch', 'Cassian Reed', 'Tess Marlow', 'Orin Bell', 'Lyra Moss', 'Felix Wren', 'Nia Sol'];
    const slots = ['Lantern alcove', 'Copper fountain', 'Mossy stairway', 'Glass arcade', 'Moonlit balcony', 'Clockwork kiosk', 'Quiet courtyard', 'Amber doorway'];
    /** @type {SurroundingCharacter[]} */
    const characters = names.map((name, index) => ({
        id: index === 0 ? 'demo-user' : `demo-${index}`, name, image: '',
        locationSlot: slots[index], conversationId: null,
    }));
    /** @type {SurroundingsSceneState} */
    const base = {
        location: 'Starling Market', userId: 'demo-user', characters: characters.slice(0, 6),
        scene: {
            foundCharacters: characters.slice(0, 6).map(c => c.id),
            leftoverCharacters: ['demo-5'],
            conversations: [
                { id: 'lantern-chat', participants: ['demo-user', 'demo-1'], remoteParticipants: [] },
                { id: 'fountain-chat', participants: ['demo-2', 'demo-3'], remoteParticipants: [] },
                // Only demo-4 is present: this displays just like a leftover solo.
                { id: 'radio-chat', participants: ['offsite-operator'], remoteParticipants: ['demo-4'] },
            ],
        },
    };
    base.characters[0].conversationId = base.characters[1].conversationId = 'lantern-chat';
    base.characters[0].locationSlot = base.characters[1].locationSlot = slots[0];
    base.characters[2].conversationId = base.characters[3].conversationId = 'fountain-chat';
    base.characters[2].locationSlot = base.characters[3].locationSlot = slots[1];
    base.characters[4].conversationId = 'radio-chat';
    const arrival = structuredClone(base);
    arrival.characters.push({ ...characters[6], conversationId: 'lantern-chat', locationSlot: slots[0] });
    arrival.scene.foundCharacters.push('demo-6');
    arrival.scene.conversations[0].participants.push('demo-6');
    const move = structuredClone(arrival);
    const mira = requireCharacter(move, 'demo-1');
    mira.conversationId = 'fountain-chat';
    mira.locationSlot = slots[1];
    // Intentional overlapping membership tests deduplication during a handoff.
    move.scene.conversations[1].participants.push('demo-1');
    const departure = structuredClone(move);
    departure.scene.foundCharacters = departure.scene.foundCharacters.filter(id => !['demo-3', 'demo-5'].includes(id));
    departure.characters = departure.characters.filter(c => departure.scene.foundCharacters.includes(c.id));
    departure.scene.leftoverCharacters = [];
    const returnAndMove = structuredClone(departure);
    returnAndMove.characters.push({ ...characters[3], conversationId: null, locationSlot: slots[6] });
    returnAndMove.scene.foundCharacters.push('demo-3');
    returnAndMove.scene.conversations[1].participants = returnAndMove.scene.conversations[1].participants.filter(id => id !== 'demo-3');
    returnAndMove.scene.leftoverCharacters.push('demo-3');
    requireCharacter(returnAndMove, 'demo-4').locationSlot = slots[7];
    const userSolo = structuredClone(returnAndMove);
    userSolo.scene.conversations[0].participants = ['demo-6'];
    userSolo.scene.conversations[1].participants.push('demo-7');
    userSolo.characters.push({ ...characters[7], conversationId: 'fountain-chat', locationSlot: slots[1] });
    userSolo.scene.foundCharacters.push('demo-7');
    userSolo.scene.leftoverCharacters.push('demo-user');
    userSolo.characters[0].conversationId = null;
    return [
        { label: 'Initial scene: two groups and two solos', state: base },
        { label: 'Felix arrives in your group', state: arrival },
        { label: 'Mira moves from your group to the fountain', state: move },
        { label: 'Tess and Lyra leave the scene', state: departure },
        { label: 'Tess returns solo; Orin changes places', state: returnAndMove },
        { label: 'You become solo; Nia joins the fountain group', state: userSolo },
        { label: 'Empty scene: everyone exits', state: { ...structuredClone(base), characters: [], scene: { conversations: [], foundCharacters: [], leftoverCharacters: [] } } },
        { label: 'Initial scene returns', state: structuredClone(base) },
    ];
}

/**
 * @param {SurroundingsSceneState} state
 * @param {string} id
 * @returns {SurroundingCharacter}
 */
function requireCharacter(state, id) {
    const character = state.characters.find(c => c.id === id);
    if (!character) throw new Error(`Missing demo character: ${id}`);
    return character;
}
