/** @typedef {{id: string, name: string, image: string, positionDescription: string, externalDescription: string, locationSlot: string, states: DECharacterStateInPerspective[]}} SurroundingCharacter */
/** @typedef {{id: string, primary: boolean, characters: SurroundingCharacter[]}} SurroundingGroup */

/** The engine has already determined group membership and visibility.
 * @param {DECharacterPerspective} perspective @returns {SurroundingGroup[]}
 */
export function buildSurroundingGroups(perspective) {
    const { socialGroups, ownId } = perspective;
    /** @param {DECharacterPerspectiveCharacter[]} characters @param {boolean} primary */
    const group = (characters, primary) => ({
        id: JSON.stringify(characters.map(character => character.characterId).sort()),
        primary,
        characters: characters.filter(character => character.characterId !== ownId).map(character => ({
            id: character.characterId,
            name: character.characterNameComplex,
            image: character.characterMetadata.assets?.neutral || '',
            externalDescription: character.characterExternalDescriptionForUser,
            positionDescription: character.characterPlaceAndPostureDescription,
            states: character.states,
            locationSlot: perspective.ownLocation.slots.find(slot =>
                slot.characters.some(member => member.characterId === character.characterId))?.slotId || '',
        })),
    });
    return [
        group(socialGroups.ownGroup, true),
        ...socialGroups.otherGroups.map(characters => group(characters, false)),
        ...socialGroups.soloCharacters.map(character => group([character], false)),
    ].filter(group => group.characters.length);
}
