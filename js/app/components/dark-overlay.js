import { playHoverSound } from '../sound.js';

/**
 * A simpler, darker alternative to <app-overlay>.
 * Used for read-only informational overlays (license, attributions).
 * Only supports a single confirm/close button.
 *
 * Attributes:
 *  - overlay-title: title shown in the header
 *  - confirm-text: label of the close button (defaults to "Close")
 *
 * Events:
 *  - confirm: dispatched when the close button is clicked or Escape pressed
 */
class DarkOverlay extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });

        this.onDocumentKeydown = this.onDocumentKeydown.bind(this);
        this.onConfirmClick = this.onConfirmClick.bind(this);
    }

    connectedCallback() {
        this.render();

        // hide stars while overlay is active (match app-overlay behavior)
        const sky = document.querySelector('.sky');
        // @ts-expect-error
        if (sky) sky.style.display = 'none';

        document.addEventListener('keydown', this.onDocumentKeydown);

        const confirmBtn = this.root.getElementById('confirm-btn');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', this.onConfirmClick);
            confirmBtn.addEventListener('mouseenter', playHoverSound);
        }
    }

    disconnectedCallback() {
        document.removeEventListener('keydown', this.onDocumentKeydown);
        // restore stars only if no other overlay remains
        const remainingOverlays = document.querySelectorAll(
            'app-character, app-world, app-settings, app-play, app-manage, app-license, app-other-attributions, app-cardtype-wizard'
        );
        if (remainingOverlays.length === 0) {
            const sky = document.querySelector('.sky');
            // @ts-expect-error
            if (sky) sky.style.display = 'block';
        }
    }

    /**
     * @param {KeyboardEvent} e
     */
    onDocumentKeydown(e) {
        if (e.key !== 'Escape') return;
        if (document.querySelector('app-dialog')) return;

        // only respond if this is the topmost overlay host
        let host = this;
        while (host.getRootNode() !== document) {
            // @ts-ignore
            host = host.getRootNode().host;
        }
        const bodyChildren = Array.from(document.body.children);
        if (bodyChildren[bodyChildren.length - 1] !== host) return;

        this.dispatchEvent(new CustomEvent('confirm'));
    }

    onConfirmClick() {
        this.dispatchEvent(new CustomEvent('confirm'));
    }

    /**
     * @param {string} name
     * @param {string|null} oldValue
     * @param {string|null} newValue
     */
    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue || !this.root.querySelector('.overlay')) return;
        if (name === 'overlay-title') {
            const titleEl = this.root.querySelector('.overlay-title-text');
            // @ts-expect-error
            if (titleEl) titleEl.innerHTML = newValue;
        } else if (name === 'confirm-text') {
            const btn = this.root.getElementById('confirm-btn');
            // @ts-expect-error
            if (btn) btn.innerHTML = newValue;
        }
    }

    static get observedAttributes() {
        return ['overlay-title', 'confirm-text'];
    }

    render() {
        const title = this.getAttribute('overlay-title') || '';
        const confirmText = this.getAttribute('confirm-text') || 'Close';

        this.root.innerHTML = `
        <style>
            *::-webkit-scrollbar {
                width: 12px !important;
            }
            *::-webkit-scrollbar-track {
                background: rgba(5, 10, 20, 0.8) !important;
            }
            *::-webkit-scrollbar-thumb {
                background: rgba(30, 60, 100, 0.85) !important;
                border: 1px solid #3a6080 !important;
                border-radius: 6px !important;
            }
            *::-webkit-scrollbar-thumb:hover {
                background: rgba(50, 90, 140, 0.95) !important;
            }
            .overlay {
                position: fixed;
                width: 100%;
                height: 100%;
                top: 0;
                left: 0;
                display: flex;
                justify-content: flex-start;
                flex-direction: column;
                align-items: flex-start;
                background: linear-gradient(
                    to bottom,
                    #000000 0%,
                    #010408 25%,
                    #02060e 55%,
                    #030810 80%,
                    #040a14 100%
                );
                color: #ddeeff;
                z-index: 20;
                box-sizing: border-box;
            }
            .overlay-title {
                font-size: 3vh;
                padding: 2vh 4vh;
                border-bottom: solid 2px #1a3a5c;
                width: 100%;
                background-color: rgba(10, 30, 60, 0.35);
                box-sizing: border-box;
            }
            .overlay-content {
                flex: 1;
                width: 100%;
                overflow-y: auto;
            }
            .overlay-buttons {
                display: flex;
                justify-content: flex-end;
                align-items: flex-end;
                width: 100%;
                padding: 2vh 4vh;
                box-sizing: border-box;
                border-top: solid 2px #1a3a5c;
                background-color: rgba(10, 30, 60, 0.35);
            }
            .overlay-buttons div {
                font-size: 5vh;
                cursor: pointer;
                color: #b0ccee;
            }
            .overlay-buttons div:hover {
                color: #ffffff;
            }
        </style>
        <div class="overlay">
            <div class="overlay-title">
                <div class="overlay-title-text">${title}</div>
            </div>
            <div class="overlay-content">
                <slot></slot>
            </div>
            <div class="overlay-buttons">
                <div id="confirm-btn">${confirmText}</div>
            </div>
        </div>
        `;
    }
}

customElements.define('app-dark-overlay', DarkOverlay);
