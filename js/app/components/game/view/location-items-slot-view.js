import { sharedStyles } from './shared-styles.js';
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
            <style>
${sharedStyles}
:host { display: block; min-width: 0; font-size: 2vh; --slot-image-blur: 0vh; }
:host([data-blindness="partial-good"]) { --slot-image-blur: .45vh; }
:host([data-blindness="partial-bad"]) { --slot-image-blur: 1.2vh; }
:host([data-blindness="full"]) { --slot-image-blur: 3vh; }
article { min-width: 0; border: 1px solid var(--border, #a7d9ff40); border-radius: .8vh; background: #ffffff05; }
h3 { margin: 0; font-size: 2.5vh; }
.slot-link { display: flex; align-items: center; gap: 1.2vh; width: 100%; min-width: 0; border: 0; border-bottom: 1px solid var(--border, #a7d9ff40); background: #ffffff04; padding: 1vh 1.4vh; font-size: 2.5vh; font-weight: 600; text-align: left; border-radius: .8vh .8vh 0 0; }
.slot-link:hover { background: #a7d9ff12; }
.slot-name { min-width: 0; overflow-wrap: anywhere; }
.open-icon { margin-left: auto; color: var(--accent, #a7d9ff); font-size: 2.5vh; }
app-asset-image { display: block; width: 7vh; height: 6vh; flex: 0 0 7vh; --asset-image-border-width: .1vh; }
app-asset-image::part(asset-image) { filter: blur(var(--slot-image-blur)); border-radius: .5vh; }
app-asset-image::part(asset-image-container) { border-radius: .5vh; }
.items { min-width: 0; padding: 0 1.4vh 1.4vh; font-size: 2vh; line-height: 1.5; }
            </style>
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
