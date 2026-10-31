import { getItemTreeContext, loadCharacterItemGroups } from './item-tree-data.js';
import { createItemTree } from './item-node.js';

/** Carrying and wearing, optionally for a character other than the current user. */
export class CharacterItemsView extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        this.version = 0;
    }

    connectedCallback() {
        this.root.innerHTML = `
            <link rel="stylesheet" href="${new URL('./character-items-view.css', import.meta.url).href}">
            <div class="inventory" role="status">Loading belongings…</div>`;
        void this.refresh();
    }

    disconnectedCallback() { this.version++; }

    async refresh() {
        const version = ++this.version;
        const inventory = /** @type {HTMLElement} */ (this.root.querySelector('.inventory'));
        if (!inventory) return;
        inventory.setAttribute('aria-busy', 'true');
        try {
            const userId = await window.ENGINE_WORKER_CLIENT.queryDEObject({ path: ['user'] });
            const context = await getItemTreeContext(userId);
            const characterId = this.getAttribute('character-id') || userId;
            const groups = await loadCharacterItemGroups(characterId, context);
            if (!this.isConnected || version !== this.version) return;
            inventory.replaceChildren(createItemTree(groups, context));
            inventory.removeAttribute('role');
        } catch (error) {
            if (!this.isConnected || version !== this.version) return;
            inventory.textContent = 'These belongings could not be loaded.';
            console.warn('Unable to load character belongings', error);
        } finally {
            if (version === this.version) inventory.removeAttribute('aria-busy');
        }
    }
}
customElements.define('app-character-items-view', CharacterItemsView);
