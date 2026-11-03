import { sharedStyles } from './shared-styles.js';
import { getItemTreeContext, loadCharacterItemGroups } from './item-tree-data.js';
import { getPerspectiveFor } from './perspective-data.js';
import { createItemTree } from './item-node.js';

/** Carrying and wearing from the containing view's snapshot. */
export class CharacterItemsView extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        /** @type {DECharacterPerspective | null} */
        this.currentPerspective = null;
    }

    connectedCallback() {
        this.root.innerHTML = `
            <style>
${sharedStyles}
:host { display: block; min-width: 0; font-size: 2vh; }
.inventory { font-size: 2vh; line-height: 1.5; }
.item-tree { display: grid; gap: 1.5vh; }
.inventory .item-tree-group { margin: 0; border: 1px solid var(--border, #a7d9ff40); border-radius: .8vh; padding: 1.4vh; background: #ffffff05; }
.inventory .item-tree-group > h3 { font-size: 2.3vh; }
            </style>
            <div class="inventory"></div>`;
        this.updatePerspective(this.currentPerspective || getPerspectiveFor(this.parentNode));
    }

    /** @param {DECharacterPerspective | null} perspective */
    updatePerspective(perspective) {
        this.currentPerspective = perspective;
        const inventory = this.root.querySelector('.inventory');
        if (!inventory) return;
        inventory.replaceChildren();
        if (!perspective) return;
        const context = getItemTreeContext(perspective);
        const characterId = this.getAttribute('character-id') || perspective.ownId;
        inventory.append(createItemTree(loadCharacterItemGroups(characterId, context), context));
    }
}
customElements.define('app-character-items-view', CharacterItemsView);
