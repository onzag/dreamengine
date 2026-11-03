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
            <link rel="stylesheet" href="${new URL('./character-items-view.css', import.meta.url).href}">
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
