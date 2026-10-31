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
        this.version = 0;
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
            openIdentifierDialog(identifier, foundAs, getFocusedElement() || this.root.querySelector('.close') || this);
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
        this.version++;
        this.controller?.abort();
        unregisterDialog(this);
        this.removeAttribute('open');
    }

    show() {
        if (this.open || !this.isConnected) return;
        this.previousFocus = getFocusedElement();
        registerDialog(this);
        this.setAttribute('open', '');
        this.hidden = false;
        this.root.querySelector('.panel')?.setAttribute('data-de-aria-group-active', '');
        queueMicrotask(() => { if (this.open && isTopDialog(this)) this.root.getElementById('items-title')?.focus(); });
        this.notify();
        void this.refresh();
    }

    close() {
        if (!this.open) return;
        this.version++;
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

    async refresh() {
        const version = ++this.version;
        const slots = /** @type {HTMLElement} */ (this.root.querySelector('.slots'));
        const locationButton = /** @type {HTMLButtonElement} */ (this.root.querySelector('.location-banner'));
        const characterButton = /** @type {HTMLButtonElement} */ (this.root.querySelector('.character-name'));
        const locationName = /** @type {HTMLElement} */ (this.root.querySelector('.banner-name'));
        this.locationId = '';
        this.userId = '';
        locationButton.disabled = true;
        characterButton.disabled = true;
        slots.setAttribute('aria-busy', 'true');
        slots.textContent = 'Loading surroundings…';
        locationName.textContent = 'Loading location…';
        characterButton.textContent = 'Loading character…';
        this.root.querySelector('.inventory')?.replaceChildren();
        this.root.querySelector('app-asset-image')?.setAttribute('image-url', '');
        try {
            const client = window.ENGINE_WORKER_CLIENT;
            const userId = await client.queryDEObject({ path: ['user'] });
            const [state, context, userName] = await Promise.all([
                client.queryDEObject({ path: ['stateFor', userId], pick: ['location'] }),
                getItemTreeContext(userId),
                client.queryDEObject({ path: ['utils', 'templates', 'formatCharacterName'], call: [userId, userId,
                    { __type: 'object', value: { justName: true, type: 'definite', capitalize: true } }] }),
            ]);
            if (!this.isConnected || !this.open || version !== this.version) return;
            this.userId = userId;
            characterButton.textContent = userName;
            characterButton.disabled = false;
            this.dataset.blindness = context.blindness;
            const inventory = document.createElement('app-character-items-view');
            inventory.setAttribute('character-id', userId);
            this.root.querySelector('.inventory')?.replaceChildren(inventory);
            if (!state?.location) throw new Error('Current location unavailable');
            const locationId = state.location;
            const [location, name, locationSlots] = await Promise.all([
                client.queryDEObject({ path: ['world', 'locations', locationId], pick: ['metadata'] }),
                client.queryDEObject({ path: ['utils', 'templates', 'formatLocationName'], call: [locationId, userId,
                    { __type: 'object', value: { justName: true } }] }),
                client.queryDEObject({ path: ['world', 'locations', locationId, 'slots'], depth: 0 }),
            ]);
            if (!this.isConnected || !this.open || version !== this.version) return;
            if (!location) throw new Error('Current location no longer exists');
            this.locationId = locationId;
            locationName.textContent = name;
            locationButton.disabled = false;
            locationButton.setAttribute('aria-label', `View ${name}`);
            const image = /** @type {HTMLElement} */ (this.root.querySelector('app-asset-image'));
            image.setAttribute('default-image', new URL('../../../images/default-world.png', import.meta.url).href);
            image.setAttribute('image-url', location.metadata?.asset || '');
            slots.replaceChildren(...Object.keys(locationSlots || {}).map(slotId => {
                const slot = /** @type {import('./location-items-slot-view.js').LocationItemsSlotView} */ (document.createElement('app-location-items-slot-view'));
                slot.configure(slotId, context);
                return slot;
            }));
            slots.removeAttribute('role');
            if (!slots.childElementCount) slots.textContent = 'This location has no slots.';
        } catch (error) {
            if (!this.isConnected || !this.open || version !== this.version) return;
            locationName.textContent = 'Location unavailable';
            slots.textContent = 'The surroundings could not be loaded.';
            console.warn('Unable to load surroundings', error);
        } finally {
            if (version === this.version) slots.removeAttribute('aria-busy');
        }
    }
}
customElements.define('app-game-items-overlay', ItemsOverlay);
