import '../../world-image.js';
import { getItemTreeContext, loadLocationSlotItemGroups } from './item-tree-data.js';
import { getPerspectiveFor, getPerspectiveIndex } from './perspective-data.js';
import { createItemTree } from './item-node.js';

/** A location slot and its item tree from one perspective. */
export class LocationItemsSlotView extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        /** @type {DECharacterPerspective | null} */
        this.currentPerspective = null;
    }

    /** @param {string} slotId @param {import('./item-tree-data.js').ItemTreeContext} context */
    configure(slotId, context) {
        this.setAttribute('slot-id', slotId);
        this.updatePerspective(context.perspective);
    }

    connectedCallback() {
        this.root.innerHTML = `
            <link rel="stylesheet" href="${new URL('./location-items-slot-view.css', import.meta.url).href}">
            <article>
                <h3><button class="slot-link" type="button" disabled aria-haspopup="dialog">
                    <app-asset-image no-transition="true" aria-hidden="true"></app-asset-image>
                    <span class="slot-name"></span><span class="open-icon" aria-hidden="true">&#8599;</span>
                </button></h3>
                <div class="items"></div>
            </article>`;
        this.root.querySelector('.slot-link')?.addEventListener('click', () => {
            this.dispatchEvent(new CustomEvent('identifier-navigate', {
                bubbles: true, composed: true, detail: { identifier: this.getAttribute('slot-id'), foundAs: 'location-slot' },
            }));
        });
        this.updatePerspective(this.currentPerspective || getPerspectiveFor(this.parentNode));
    }

    /** @param {DECharacterPerspective | null} perspective */
    updatePerspective(perspective) {
        this.currentPerspective = perspective;
        const article = this.root.querySelector('article');
        if (!article) return;
        article.hidden = !perspective;
        if (!perspective) return;
        const id = this.getAttribute('slot-id') || '';
        const slot = getPerspectiveIndex(perspective).slots.get(id);
        if (!slot) { article.hidden = true; return; }
        const context = getItemTreeContext(perspective);
        this.dataset.blindness = perspective.ownCharacterBlindness;
        const name = this.root.querySelector('.slot-name');
        if (name) name.textContent = slot.slotName;
        const button = /** @type {HTMLButtonElement} */ (this.root.querySelector('.slot-link'));
        button.disabled = false;
        button.setAttribute('aria-label', `View ${slot.slotName}`);
        const image = /** @type {HTMLElement} */ (this.root.querySelector('app-asset-image'));
        image.setAttribute('default-image', new URL('../../../images/default-world.png', import.meta.url).href);
        image.setAttribute('image-url', slot.slotMetadata.asset || '');
        this.root.querySelector('.items')?.replaceChildren(createItemTree(loadLocationSlotItemGroups(id, context), context));
    }
}
customElements.define('app-location-items-slot-view', LocationItemsSlotView);
