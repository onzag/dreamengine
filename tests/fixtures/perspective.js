export function makePerspective() {
    const item = (id, overrides = {}) => ({
        ids: [{ id, parent: null }], amount: 1, name: id, nameInAmount: id,
        description: 'Description of ' + id, metadata: { asset: 'items/' + id },
        weightKg: 0, volumeLiters: 0, state: { tags: [] },
        canSeeContents: false, contentsIsUnclear: false, canSeeOntop: true, ontopIsUnclear: false,
        containing: [], ontop: [], containingCharacters: [], ontopCharacters: [], ...overrides,
    });
    const character = (id, overrides = {}) => ({
        characterId: id, characterName: id, characterAllNames: [id],
        characterMetadata: { assets: { neutral: 'characters/' + id } },
        characterExternalDescription: 'Description of ' + id, characterPlaceAndPostureDescription: 'Standing.',
        canTellHeight: true, canTellWeight: true, characterHeightCm: 170, characterWeightKg: 70,
        perceivedGender: 'ambiguous', perceptionForm: 'visible',
        canTellDetailsOfClothingOrCarriedItems: true, characterCarryingItems: [], characterWearingItems: [],
        characterCarryingOtherCharactersIds: [], states: [], ...overrides,
    });
    const coins = item('coin-a', { ids: [{ id: 'coin-a', parent: 'bag' }, { id: 'coin-b', parent: 'bag' }],
        amount: 2, name: 'coin', nameInAmount: 'Two coins', description: 'Found near <character-friend:Friend>.' });
    const bag = item('bag', { canSeeContents: true, containing: [coins],
        contentsIsUnclear: 'Some contents may be missing.', containerProperties: { structure: 'flexible', openable: true } });
    const self = character('self', { characterName: 'Snapshot Self', characterCarryingItems: [bag],
        states: [{ stateName: 'Very Tired', type: 'INTENSITY_EXPRESSIVE', dominant: true, level: 2,
            relieving: true, causes: ['<character-friend:Friend> kept them awake.'] }] });
    const friend = character('character-friend', { characterName: 'Snapshot Friend',
        states: [{ stateName: 'Blind', type: 'INTERNAL', dominant: true },
            { stateName: 'Very Tired', type: 'INTENSITY_EXPRESSIVE', dominant: false, level: 2, relieving: true,
                causes: ['<character-friend:Friend> stayed awake.'] }],
        characterPlaceAndPostureDescription: 'Standing by <item-table:the table>.' });
    const stranger = character('stranger', { characterName: 'Someone nearby', perceptionForm: 'perceived' });
    const slot = { slotId: 'room', slotName: 'Snapshot Room', slotMetadata: { asset: 'places/room' },
        items: [item('table', { ontop: [item('cup')], ontopCharacters: ['character-friend'] })],
        characters: [friend, stranger], canSeeItems: true, canSeeCharacters: true,
        itemListsAreUnclear: false, characterListsAreUnclear: false };
    return {
        self, ownId: 'self', ownName: 'Snapshot Self', ownLocationId: 'house',
        ownLocationName: 'Snapshot House', ownLocationSlotId: 'room', ownLocationSlotName: slot.slotName,
        ownLocation: { locationId: 'house', locationName: 'Snapshot House', locationMetadata: { asset: 'places/house' },
            weatherName: 'Snapshot Rain', slots: [slot] },
        ownCharacterBlindness: 'partial-bad',
        socialGroups: { ownGroup: [friend], soloCharacters: [stranger], otherGroups: [],
            canSeeCharacters: true, characterListsAreUnclear: 'Some people may be missing.' },
        timeOfPerspective: { time: Date.UTC(2040, 1, 3, 4, 5) },
    };
}
