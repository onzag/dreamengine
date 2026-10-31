import '../../world-image.js';
import { getItemTreeContext, loadLocationSlotItemGroups } from './item-tree-data.js';
import { createItemTree } from './item-node.js';

/** A live location slot with the same item tree as its detail dialog. */
export class LocationItemsSlotView extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        this.version = 0;
        /** @type {import('./item-tree-data.js').ItemTreeContext | null} */
        this.context = null;
    }

    /** @param {string} slotId @param {import('./item-tree-data.js').ItemTreeContext} context */
    configure(slotId, context) {
        this.setAttribute('slot-id', slotId);
        this.context = context;
    }

    connectedCallback() {
        this.root.innerHTML = `
            <link rel="stylesheet" href="${new URL('./location-items-slot-view.css', import.meta.url).href}">
            <article>
                <h3><button class="slot-link" type="button" disabled aria-haspopup="dialog">
                    <app-asset-image no-transition="true" aria-hidden="true"></app-asset-image>
                    <span class="slot-name">Loading slot…</span>
                    <span class="open-icon" aria-hidden="true">↗</span>
                </button></h3>
                <div class="items" role="status">Loading items…</div>
            </article>`;
        this.root.querySelector('.slot-link')?.addEventListener('click', () => {
            this.dispatchEvent(new CustomEvent('identifier-navigate', {
                bubbles: true, composed: true, detail: { identifier: this.getAttribute('slot-id'), foundAs: 'location-slot' },
            }));
        });
        void this.refresh();
    }

    disconnectedCallback() { this.version++; }

    async refresh() {
        const version = ++this.version;
        const items = /** @type {HTMLElement} */ (this.root.querySelector('.items'));
        const name = /** @type {HTMLElement} */ (this.root.querySelector('.slot-name'));
        const button = /** @type {HTMLButtonElement} */ (this.root.querySelector('.slot-link'));
        items.setAttribute('aria-busy', 'true');
        try {
            const client = window.ENGINE_WORKER_CLIENT;
            const context = this.context || await getItemTreeContext(await client.queryDEObject({ path: ['user'] }));
            const id = this.getAttribute('slot-id') || '';
            const [slot, label, groups] = await Promise.all([
                client.queryDEObject({ path: ['utils', 'world', 'getLocationSlotById'], call: [id], pick: ['metadata'] }),
                client.queryDEObject({ path: ['utils', 'templates', 'formatLocationSlotName'], call: [id, context.userId,
                    { __type: 'object', value: { justName: true } }] }),
                loadLocationSlotItemGroups(id, context),
            ]);
            if (!this.isConnected || version !== this.version) return;
            if (!slot) throw new Error(`Location slot ${id} no longer exists`);
            this.dataset.blindness = context.blindness;
            name.textContent = label;
            button.disabled = false;
            button.setAttribute('aria-label', `View ${label}`);
            const image = /** @type {HTMLElement} */ (this.root.querySelector('app-asset-image'));
            image.setAttribute('default-image', new URL('../../../images/default-world.png', import.meta.url).href);
            image.setAttribute('image-url', slot.metadata?.asset || '');
            items.replaceChildren(createItemTree(groups, context));
            items.removeAttribute('role');
        } catch (error) {
            if (!this.isConnected || version !== this.version) return;
            name.textContent = 'Slot unavailable';
            button.disabled = true;
            items.textContent = 'Items in this slot could not be loaded.';
            console.warn('Unable to load location slot items', error);
        } finally {
            if (version === this.version) items.removeAttribute('aria-busy');
        }
    }
}
customElements.define('app-location-items-slot-view', LocationItemsSlotView);
