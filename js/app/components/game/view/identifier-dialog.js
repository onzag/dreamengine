import '../../dialog.js';
import './character-dialog.js';
import './location-dialog.js';
import './location-slot-dialog.js';
import './item-dialog.js';

/** Routes `identifier-id` and `found-as` to one of four detail views. */
export class IdentifierDialog extends HTMLElement {
    constructor() {
        super();
        /** @type {HTMLElement|null} */
        this.previousFocus = null;
    }

    connectedCallback() {
        const views = {
            character: ['app-game-character-dialog', 'Character'],
            location: ['app-game-location-dialog', 'Location'],
            'location-slot': ['app-game-location-slot-dialog', 'Location slot'],
            item: ['app-game-item-dialog', 'Item'],
        };
        const foundAs = /** @type {keyof typeof views} */ (this.getAttribute('found-as'));
        const [tag] = views[foundAs] || views.item;
        const dialog = document.createElement('app-dialog');
        dialog.setAttribute('dialog-title', 'Loading details…');
        dialog.setAttribute('pre-expand', 'true');
        dialog.setAttribute('large', 'true');
        dialog.addEventListener('cancel', () => this.remove());
        const view = document.createElement(tag);
        view.setAttribute('identifier-id', this.getAttribute('identifier-id') || '');
        view.addEventListener('identifier-title-change', event => {
            dialog.setAttribute('dialog-title', /** @type {CustomEvent<string>} */ (event).detail);
        });
        view.addEventListener('identifier-navigate', event => {
            const { identifier, foundAs } = /** @type {CustomEvent<DEConversationMessageFragmentIdentifier>} */ (event).detail;
            openIdentifierDialog(identifier, foundAs, this.previousFocus || this);
        });
        dialog.append(view);
        // Keep the shared dialog in the light DOM so existing modal guards can find it.
        this.replaceChildren(dialog);
        dialog.shadowRoot?.getElementById('dialog-title')?.focus();
    }

    disconnectedCallback() {
        if (this.previousFocus?.isConnected) this.previousFocus.focus();
    }
}

customElements.define('app-game-identifier-dialog', IdentifierDialog);

/**
 * @param {string} identifier
 * @param {DEConversationMessageFragmentIdentifier['foundAs']} foundAs
 * @param {HTMLElement} trigger
 */
export function openIdentifierDialog(identifier, foundAs, trigger) {
    // Following a description link replaces the current view while preserving its original trigger.
    for (const current of /** @type {NodeListOf<IdentifierDialog>} */ (document.querySelectorAll('app-game-identifier-dialog'))) {
        trigger = current.previousFocus || trigger;
        current.previousFocus = null;
        current.remove();
    }
    const dialog = /** @type {IdentifierDialog} */ (document.createElement('app-game-identifier-dialog'));
    dialog.setAttribute('identifier-id', identifier);
    dialog.setAttribute('found-as', foundAs);
    dialog.previousFocus = trigger;
    document.body.append(dialog);
    return dialog;
}
