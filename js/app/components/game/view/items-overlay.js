import './location-items-slot-view.js';
import './character-items-view.js';

export class ItemsOverlay extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.root.innerHTML = `
            <link rel="stylesheet" href="${new URL('./items-overlay.css', import.meta.url).href}">
            <dialog class="glass" aria-labelledby="items-title" aria-describedby="items-note">
                <header><div><p>Take a look around</p><h1 id="items-title">Belongings & vicinity</h1></div><button type="button" autofocus>Close <kbd>Tab / Esc</kbd></button></header>
                <div class="columns">
                    <section aria-labelledby="vicinity-title"><h2 id="vicinity-title">Vicinity <span>Nearby places</span></h2><div class="slots"><app-location-items-slot-view slot-label="Slot A" variant="a"></app-location-items-slot-view><app-location-items-slot-view slot-label="Slot B" variant="b"></app-location-items-slot-view><app-location-items-slot-view slot-label="Slot C" variant="c"></app-location-items-slot-view></div></section>
                    <section aria-labelledby="character-title"><h2 id="character-title">Character <span>On your person</span></h2><app-character-items-view></app-character-items-view></section>
                </div>
                <footer id="items-note">Inventory preview · items and locations are illustrative</footer>
            </dialog>`;
        const dialog = /** @type {HTMLDialogElement} */ (this.root.querySelector('dialog'));
        this.root.querySelector('button')?.addEventListener('click', () => this.close());
        dialog.addEventListener('close', () => this.notify());
        dialog.addEventListener('click', event => { if (event.target === dialog) {
            const rect = dialog.getBoundingClientRect();
            if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) this.close();
        } });
    }

    get open() { return !!this.root.querySelector('dialog')?.open; }

    show() {
        let active = document.activeElement;
        while (active instanceof HTMLElement && active.shadowRoot?.activeElement) {
            active = active.shadowRoot.activeElement;
        }
        this.previousFocus = active;
        this.root.querySelector('dialog')?.showModal();
        this.notify();
    }

    close() { this.root.querySelector('dialog')?.close(); }

    notify() {
        this.dispatchEvent(new Event('toggle'));
        if (!this.open && this.previousFocus instanceof HTMLElement && this.previousFocus.isConnected) this.previousFocus.focus();
    }
}
customElements.define('app-game-items-overlay', ItemsOverlay);
