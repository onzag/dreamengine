import { createItemList } from './item-list.js';

/** The character has precisely two item groups: carrying and wearing. */
export class CharacterItemsView extends HTMLElement {
    connectedCallback() {
        const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
        root.innerHTML = `
            <link rel="stylesheet" href="${new URL('./character-items-view.css', import.meta.url).href}">
            <div class="character" aria-hidden="true"><img src="./images/default-profile.png" alt=""><span>Your belongings</span></div>
            <section class="carrying" aria-labelledby="carrying-title"><header><h3 id="carrying-title">Carrying</h3><span>2 items</span></header></section>
            <section class="wearing" aria-labelledby="wearing-title"><header><h3 id="wearing-title">Wearing</h3><span>1 item</span></header></section>`;
        root.querySelector('.carrying')?.append(createItemList([
            { name: 'Satchel', icon: '🎒', inside: [
                { name: 'Field journal', icon: '📓', detail: 'A few unwritten pages' },
                { name: 'Water flask', icon: '🧴', detail: 'Half full' },
            ] },
            { name: 'Walking stick', icon: '🦯' },
        ]));
        root.querySelector('.wearing')?.append(createItemList([
            { name: 'Traveler’s coat', icon: '🧥', detail: 'Worn, but warm', inside: [
                { name: 'Brass key', icon: '🔑', detail: 'Tucked in a pocket' },
            ] },
        ]));
    }
}
customElements.define('app-character-items-view', CharacterItemsView);
