import { IdentifierDetail } from './identifier-detail.js';
import { getItemTreeContext, loadCharacterItemGroups } from './item-tree-data.js';
import { createItemTree } from './item-node.js';
import { getPerspectiveIndex } from './perspective-data.js';

export class CharacterDialog extends IdentifierDetail {
    constructor() { super(); this.kind = 'Character'; this.layout = 'character'; }

    /** @param {DECharacterPerspective} perspective */
    getDisplayData(perspective) {
        const id = this.getAttribute('identifier-id') || '';
        const character = getPerspectiveIndex(perspective).characters.get(id);
        if (!character) throw new Error('Character is not available in this perspective.');
        const context = getItemTreeContext(perspective);
        const content = createItemTree(loadCharacterItemGroups(id, context), context);
        return {
            name: character.characterNameComplex,
            description: character.characterExternalDescriptionForUser,
            states: character.states,
            portrait: character.characterMetadata.assets?.neutral || '',
            banner: character.characterMetadata.banner || '',
            content,
        };
    }

    /** @param {DECharacterPerspective} perspective */
    async getDebugSections(perspective) {
        const id = this.getAttribute('identifier-id') || '';
        const character = getPerspectiveIndex(perspective).characters.get(id);
        if (!character) return [];
        const characterInternalDescription = await window.ENGINE_WORKER_CLIENT.queryDEObject({ path: ['utils', 'characterInfo', 'getInternalDescriptionOfCharacter'], call: [id]});
        const characterSurrounding = await window.ENGINE_WORKER_CLIENT.queryDEObject({ path: ['utils', 'characterInfo', 'getSurroundingCharacters'], call: [id, true]});
        return [
            {
                title: 'Character in perspective (at the time) (User\'s perspective)',
                value: character,
            },
            {
                title: "Surrounding Perspective Characters (realtime) (Character's perspective)",
                value: characterSurrounding,
            },
            {
                title: 'Character internal description (realtime) (Character\'s perspective)',
                value: characterInternalDescription,
            },
        ];
    }
}
customElements.define('app-game-character-dialog', CharacterDialog);
