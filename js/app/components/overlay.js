import { playCancelSound, playConfirmSound, playHoverSound, playPauseSound } from '../sound.js';

class Overlay extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });

        this.onDocumentKeydown = this.onDocumentKeydown.bind(this);
        this.onCloseOverlay = this.onCloseOverlay.bind(this);
        this.onAcceptDialog = this.onAcceptDialog.bind(this);
        this.onAcceptButtonClick = this.onAcceptButtonClick.bind(this);
        this.onCancelButtonClick = this.onCancelButtonClick.bind(this);
    }

    connectedCallback() {
        this.render();

        // hide stars when overlay is active
        // @ts-expect-error
        document.querySelector('.sky').style.display = 'none';

        document.addEventListener("keydown", this.onDocumentKeydown);

        if (this.root.getElementById('confirm-btn')) {
            // @ts-expect-error
            this.root.getElementById('confirm-btn').addEventListener('click', this.onAcceptButtonClick);
        }
        if (this.root.getElementById('cancel-btn')) {
            // @ts-expect-error
            this.root.getElementById('cancel-btn').addEventListener('click', this.onCancelButtonClick);
        }

        this.root.querySelectorAll('.overlay-buttons div').forEach(btn => {
            btn.addEventListener('mouseenter', playHoverSound);
        });

        const specialButton = this.root.querySelector('.special-button');
        if (specialButton) {
            specialButton.addEventListener('mouseenter', playHoverSound);
            specialButton.addEventListener('click', () => {
                this.dispatchEvent(new CustomEvent('special-button-click'));
            });
        }
    }

    /**
     * 
     * @param {KeyboardEvent} e 
     */
    onDocumentKeydown(e) {
        if (e.key === "Escape") {
            this.onCloseOverlay();
        }
    }

    onAcceptButtonClick() {
        this.onAcceptDialog();
    }

    onCancelButtonClick() {
        this.onCloseOverlay();
    }

    onCloseOverlay() {
        // dispatch cancel event
        this.dispatchEvent(new CustomEvent('cancel'));
    }

    onAcceptDialog() {
        // dispatch confirm event
        this.dispatchEvent(new CustomEvent('confirm'));
    }

    disconnectedCallback() {
        document.removeEventListener("keydown", this.onDocumentKeydown);
        // show stars when overlay is inactive
        // @ts-expect-error
        document.querySelector('.sky').style.display = 'block';
    }

    /**
     * 
     * @param {string} name 
     * @param {string|null} oldValue 
     * @param {string|null} newValue 
     */
    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue && this.root.querySelector('.overlay')) {
            if (name === 'overlay-title') {
                // @ts-expect-error
                this.root.querySelector('.overlay-title-text').innerHTML = newValue;
            } else if (name === 'cancel-text') {
                // @ts-expect-error
                this.root.getElementById('cancel-btn').innerHTML = newValue;
            } else if (name === 'confirm-text') {
                // @ts-expect-error
                this.root.getElementById('confirm-btn').innerHTML = newValue;
            }
        }
    }

    static get observedAttributes() {
        return ['overlay-title', 'cancel-text', 'confirm-text'];
    }

    render() {
        const title = this.getAttribute('overlay-title') || 'Overlay Title';
        const cancelText = this.getAttribute('cancel-text') || null;
        const confirmText = this.getAttribute('confirm-text') || null;
        let specialButtonHTML = "";

        if (this.getAttribute('special-button-text')) {
            specialButtonHTML = `<div class="special-button">${this.getAttribute('special-button-text')}</div>`;
        }

        this.root.innerHTML = `
      <style>
      *::-webkit-scrollbar {
  width: 12px !important;
}

*::-webkit-scrollbar-track {
  background: rgba(100, 0, 200, 0.3) !important;
}

*::-webkit-scrollbar-thumb {
  background: rgba(50, 0, 100, 0.8) !important;
  border: 1px solid #ccc !important;
  border-radius: 6px !important;
}

*::-webkit-scrollbar-thumb:hover {
  background: rgba(70, 0, 140, 0.9) !important;
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
    #0a0005 8%,
    #0f0008 16%,
    #12000b 24%,
    #150010 35%,
    #1a0015 48%,
    #1f0018 58%,
    #25001d 68%,
    #2a0022 76%,
    #2d0025 82%,
    #30002a 88%,
    #33002f 93%,
    #360033 98%,
    #380035 100%
  );
    color: white;
    z-index: 20;
    box-sizing: border-box;
        }
        .overlay-title {
            font-size: 3vh;
            padding: 2vh 4vh;
            border-bottom: solid 2px #ccc;
            width: 100%;
            background-color: rgba(255,255,255, 0.1);
        }
        .special-button {
        position: fixed;
        background: rgba(0, 0, 0, 1);
        border: solid 2px #ccc;
        padding: 1vw;
        right: 6vh;
        top: 2vh;
        cursor: pointer;
        z-index: 21;
    }
        .special-button:hover {
            color: #FF6B6B;
        }
        .overlay-content {
            flex: 1;
            width: 100%;
            overflow-y: auto;
        }
        .overlay-buttons {
                display: flex;
    justify-content: space-between;
    align-items: flex-end;
    width: 100%;
    padding: 2vh 4vh 2vh 4vh;
    box-sizing: border-box;
    border-top: solid 2px #ccc;
    background-color: rgba(255,255,255, 0.1);
        }
        .overlay-buttons div {
            font-size: 5vh;
            cursor: pointer;
        }
        .overlay-buttons div:hover {
            color: #FF6B6B;
        }
      </style>
      <div class="overlay">
        <div class="overlay-title">
            <div class="overlay-title-text">
                ${title}
            </div>
            ${specialButtonHTML}
        </div>
        <div class="overlay-content">
            <slot></slot>
        </div>
        <div class="overlay-buttons">
                ${cancelText ? `<div id="cancel-btn">${cancelText}</div>` : ''}
                ${confirmText ? `<div id="confirm-btn">${confirmText}</div>` : ''}
            </div>
      </div>
    `;
    }
}

customElements.define('app-overlay', Overlay);

class OverlaySection extends HTMLElement {
    constructor() {
        super();
        /**
         * @type {ShadowRoot}
         */
        this.root = this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.render();
    }

    render() {
        this.root.innerHTML = `
      <style>
        .overlay-section {
            padding: 4vh;
            border-bottom: solid 1px #ccc;
        }
        .section-title h2 {
            margin: 0;
            font-size: 3vh;
            margin-bottom: 2vh;
        }
        .section-content {
            font-size: 2vh;
        }
      </style>
      <div class="overlay-section">
        <div class="section-title">
            <h2>${this.getAttribute('section-title') || 'Section Title'}</h2>
        </div>
        <div class="section-content">
            <slot></slot>
        </div>
      </div>
    `;
    }
}
