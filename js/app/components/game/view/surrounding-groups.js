import { getPerspectiveIndex } from './perspective-data.js';

/** @typedef {{id: string, name: string, image: string, positionDescription: string, externalDescription: string, locationSlot: string, states: DECharacterStateInPerspective[]}} SurroundingCharacter */
/** @typedef {{id: string, primary: boolean, characters: SurroundingCharacter[]}} SurroundingGroup */

/** The engine has already determined group membership and visibility.
 * @param {DEPerspective} perspective @returns {SurroundingGroup[]}
 */
export function buildSurroundingGroups(perspective) {
    const { ownId } = perspective;
    const socialGroups = /** @type {DESocialGroupsInPerspective} */ (perspective.socialGroups);
    const { characters } = getPerspectiveIndex(perspective);
    /** @param {string[]} ids @param {boolean} primary */
    const group = (ids, primary) => ({
        id: JSON.stringify([...ids].sort()),
        primary,
        characters: ids.filter(id => id !== ownId).flatMap(id => {
            const character = characters.get(id);
            return character ? [{
                id: character.characterId,
                name: character.nameComplex,
                image: character.metadata.assets?.neutral || '',
                externalDescription: character.externalDescriptionForUser,
                positionDescription: character.placeAndPostureDescription,
                states: character.states,
                locationSlot: perspective.ownLocation.slots.find(slot =>
                    slot.characters.includes(character.characterId))?.slotId || '',
            }] : [];
        }),
    });
    return [
        group(socialGroups.ownGroup, true),
        ...socialGroups.otherGroups.map(characters => group(characters, false)),
        ...socialGroups.soloCharacters.map(character => group([character], false)),
    ].filter(group => group.characters.length);
}
