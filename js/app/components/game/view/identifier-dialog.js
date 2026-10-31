import '../../dialog.js';
import './character-dialog.js';
import './location-dialog.js';
import './location-slot-dialog.js';
import './item-dialog.js';

/** @type {IdentifierDialog[]} */
const dialogStack = [];

/** Find the focused control, including controls inside item-tree shadow roots. */
function getFocusedElement() {
    let active = document.activeElement;
    while (active instanceof HTMLElement && active.shadowRoot?.activeElement) {
        active = active.shadowRoot.activeElement;
    }
    return active instanceof HTMLElement ? active : null;
}

/** Routes `identifier-id` and `found-as` to one of four detail views. */
export class IdentifierDialog extends HTMLElement {
    constructor() {
        super();
        /** @type {HTMLElement|null} */
        this.previousFocus = null;
        /** @type {HTMLElement|null} */
        this.resumeFocus = null;
    }

    connectedCallback() {
        dialogStack[dialogStack.length - 1]?.setActive(false);
        dialogStack.push(this);
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
            openIdentifierDialog(identifier, foundAs, getFocusedElement() || this);
        });
        dialog.append(view);
        // Keep the shared dialog in the light DOM so existing modal guards can find it.
        this.replaceChildren(dialog);
        dialog.shadowRoot?.getElementById('dialog-title')?.focus();
    }

    /** Hide a covered view without recreating it or losing its scroll/expansion state.
     * @param {boolean} active
     */
    setActive(active) {
        if (!active) this.resumeFocus = this.contains(document.activeElement) ? getFocusedElement() : null;
        this.hidden = !active;
        this.inert = !active;
        const dialog = this.querySelector('app-dialog')?.shadowRoot;
        dialog?.querySelector('.dialog')?.toggleAttribute('data-de-aria-group-active', active);
        if (active) {
            // Let the accessibility observer re-enable the restored view's controls.
            queueMicrotask(() => {
                if (!this.isConnected || this.hidden) return;
                const target = this.resumeFocus?.isConnected ? this.resumeFocus : dialog?.getElementById('dialog-title');
                target?.focus({ preventScroll: true });
            });
        }
    }

    disconnectedCallback() {
        const index = dialogStack.indexOf(this);
        if (index < 0) return;
        const wasTop = index === dialogStack.length - 1;
        dialogStack.splice(index, 1);
        if (!wasTop) return;
        const previous = dialogStack[dialogStack.length - 1];
        if (previous) previous.setActive(true);
        else queueMicrotask(() => {
            if (!dialogStack.length && this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
        });
    }
}

customElements.define('app-game-identifier-dialog', IdentifierDialog);

/**
 * @param {string} identifier
 * @param {DEConversationMessageFragmentIdentifier['foundAs']} foundAs
 * @param {HTMLElement} trigger
 */
export function openIdentifierDialog(identifier, foundAs, trigger) {
    const dialog = /** @type {IdentifierDialog} */ (document.createElement('app-game-identifier-dialog'));
    dialog.setAttribute('identifier-id', identifier);
    dialog.setAttribute('found-as', foundAs);
    dialog.previousFocus = trigger;
    document.body.append(dialog);
    return dialog;
}
