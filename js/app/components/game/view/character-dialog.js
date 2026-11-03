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
        return { name: character.characterNameComplex, description: character.characterExternalDescription, states: character.states,
            portrait: character.characterMetadata.assets?.neutral || '',
            banner: character.characterMetadata.banner || '', content };
    }
}
customElements.define('app-game-character-dialog', CharacterDialog);
