import './location-items-slot-view.js';
import './character-items-view.js';
import '../../world-image.js';
import { openIdentifierDialog } from './identifier-dialog.js';
import { registerDialog, unregisterDialog, hasOpenDialogs, isTopDialog } from '../../dialog-state.js';
import { getItemTreeContext } from './item-tree-data.js';

function getFocusedElement() {
    let active = document.activeElement;
    while (active instanceof HTMLElement && active.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return active instanceof HTMLElement ? active : null;
}

export class ItemsOverlay extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        /** @type {DECharacterPerspective | null} */
        this.currentPerspective = null;
        this.locationId = '';
        this.userId = '';
        /** @type {HTMLElement | null} */
        this.previousFocus = null;
        /** @type {AbortController | null} */
        this.controller = null;
    }

    connectedCallback() {
        this.controller?.abort();
        this.controller = new AbortController();
        const { signal } = this.controller;
        this.hidden = true;
        this.root.innerHTML = `
            <link rel="stylesheet" href="${new URL('./items-overlay.css', import.meta.url).href}">
            <div class="backdrop" aria-hidden="true"></div>
            <section class="panel glass" role="dialog" aria-modal="true" aria-labelledby="items-title" data-de-aria-group="static" data-de-aria-group-use-inert>
                <header class="panel-header"><h1 id="items-title" tabindex="-1">Surroundings</h1><button class="close" type="button">Close <kbd>Tab / Esc</kbd></button></header>
                <div class="columns">
                    <section class="location" aria-labelledby="location-name">
                        <button class="location-banner" type="button" disabled aria-haspopup="dialog">
                            <app-asset-image no-transition="true" aria-hidden="true"></app-asset-image>
                            <span class="banner-name" id="location-name">Loading location…</span>
                        </button>
                        <div class="slots" role="status">Loading surroundings…</div>
                    </section>
                    <section class="character" aria-labelledby="character-name">
                        <h2><button class="character-name" id="character-name" type="button" disabled aria-haspopup="dialog">Loading character…</button></h2>
                        <div class="inventory"></div>
                    </section>
                </div>
            </section>`;
        this.root.querySelector('.close')?.addEventListener('click', () => this.close());
        this.root.querySelector('.backdrop')?.addEventListener('click', () => { if (isTopDialog(this)) this.close(); });
        this.root.addEventListener('identifier-navigate', event => {
            const { identifier, foundAs } = /** @type {CustomEvent<DEConversationMessageFragmentIdentifier>} */ (event).detail;
            event.stopPropagation();
            openIdentifierDialog(identifier, foundAs, getFocusedElement() || this.root.querySelector('.close') || this, this.currentPerspective);
        }, { signal });
        const locationButton = /** @type {HTMLButtonElement} */ (this.root.querySelector('.location-banner'));
        locationButton.addEventListener('click', () => { if (this.locationId) openIdentifierDialog(this.locationId, 'location', locationButton); });
        const characterButton = /** @type {HTMLButtonElement} */ (this.root.querySelector('.character-name'));
        characterButton.addEventListener('click', () => { if (this.userId) openIdentifierDialog(this.userId, 'character', characterButton); });
        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || event.defaultPrevented || !this.open || !isTopDialog(this)) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            this.close();
        }, { signal });
    }

    get open() { return this.hasAttribute('open'); }

    disconnectedCallback() {
        this.controller?.abort();
        unregisterDialog(this);
        this.removeAttribute('open');
    }

    show() {
        if (this.open || !this.isConnected || !this.currentPerspective) return;
        this.previousFocus = getFocusedElement();
        registerDialog(this);
        this.setAttribute('open', '');
        this.hidden = false;
        this.root.querySelector('.panel')?.setAttribute('data-de-aria-group-active', '');
        queueMicrotask(() => { if (this.open && isTopDialog(this)) this.root.getElementById('items-title')?.focus(); });
        this.notify();
        this.refresh();
    }

    close() {
        if (!this.open) return;
        this.removeAttribute('open');
        this.hidden = true;
        this.root.querySelector('.panel')?.removeAttribute('data-de-aria-group-active');
        unregisterDialog(this);
        this.notify();
        queueMicrotask(() => {
            if (!hasOpenDialogs() && this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
        });
    }

    notify() {
        this.dispatchEvent(new Event('toggle'));
    }

    /** @param {DECharacterPerspective | null} perspective */
    updatePerspective(perspective) {
        this.currentPerspective = perspective;
        if (!perspective) {
            this.close();
            this.root.querySelector('.slots')?.replaceChildren();
            this.root.querySelector('.inventory')?.replaceChildren();
            this.locationId = '';
            this.userId = '';
        } else if (this.open) this.refresh();
    }

    refresh() {
        const perspective = this.currentPerspective;
        if (!perspective || !this.isConnected) return;
        const context = getItemTreeContext(perspective);
        this.userId = perspective.ownId;
        this.locationId = perspective.ownLocation.locationId;
        this.dataset.blindness = perspective.ownCharacterBlindness;
        const characterButton = /** @type {HTMLButtonElement} */ (this.root.querySelector('.character-name'));
        characterButton.textContent = perspective.ownName;
        characterButton.disabled = false;
        const inventory = /** @type {import('./character-items-view.js').CharacterItemsView} */ (document.createElement('app-character-items-view'));
        inventory.setAttribute('character-id', perspective.ownId);
        inventory.updatePerspective(perspective);
        this.root.querySelector('.inventory')?.replaceChildren(inventory);

        const locationButton = /** @type {HTMLButtonElement} */ (this.root.querySelector('.location-banner'));
        locationButton.disabled = false;
        locationButton.setAttribute('aria-label', 'View ' + perspective.ownLocation.locationName);
        const locationName = this.root.querySelector('.banner-name');
        if (locationName) locationName.textContent = perspective.ownLocation.locationName;
        const image = /** @type {HTMLElement} */ (this.root.querySelector('app-asset-image'));
        image.setAttribute('default-image', new URL('../../../images/default-world.png', import.meta.url).href);
        image.setAttribute('image-url', perspective.ownLocation.locationMetadata.asset || '');
        const slots = /** @type {HTMLElement} */ (this.root.querySelector('.slots'));
        slots.replaceChildren(...perspective.ownLocation.slots.map(data => {
            const slot = /** @type {import('./location-items-slot-view.js').LocationItemsSlotView} */ (document.createElement('app-location-items-slot-view'));
            slot.configure(data.slotId, context);
            return slot;
        }));
        slots.removeAttribute('role');
        if (!slots.childElementCount) slots.textContent = 'This location has no slots.';
    }
}
customElements.define('app-game-items-overlay', ItemsOverlay);
