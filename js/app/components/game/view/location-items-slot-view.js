import { createItemList } from './item-list.js';

/** One vicinity slot; later the world supplies the name, image and items. */
export class LocationItemsSlotView extends HTMLElement {
    connectedCallback() {
        const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
        root.innerHTML = `
            <link rel="stylesheet" href="${new URL('./location-items-slot-view.css', import.meta.url).href}">
            <article><div class="picture"><img src="./images/default-world.png" alt="Placeholder landscape for a nearby slot"></div><div class="content"><header><h3></h3><small>Vicinity</small></header><p>Within reach</p><div class="items"></div></div></article>`;
        const heading = root.querySelector('h3');
        if (heading) heading.textContent = this.getAttribute('slot-label') || 'Slot';
        /** @type {Record<string, import('./item-list.js').PreviewItem[]>} */
        const examples = {
            a: [{ name: 'Wooden crate', icon: '📦', onTop: [
                { name: 'Lantern', icon: '🏮', detail: 'Unlit' },
            ], inside: [
                { name: 'Cloth pouch', icon: '👝', inside: [{ name: 'Old coins', icon: '🪙', quantity: 5 }] },
                { name: 'Apples', icon: '🍎', quantity: 3 },
            ] }],
            b: [
                { name: 'Loose stones', icon: '🪨', quantity: 3 },
                { name: 'Dry branches', icon: '🪵', quantity: 2 },
            ],
            c: [{ name: 'Travel trunk', icon: '🧳', onTop: [
                { name: 'Folded blanket', icon: '🧶' },
            ], inside: [{ name: 'Rope', icon: '🪢', detail: 'Coiled neatly' }] }],
        };
        root.querySelector('.items')?.append(createItemList(examples[this.getAttribute('variant') || 'a'] || examples.a));
    }
}
customElements.define('app-location-items-slot-view', LocationItemsSlotView);
