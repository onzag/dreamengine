import { playCancelSound, playHoverSound, playPauseSound } from '../sound.js';

class Dialog extends HTMLElement {
    constructor() {
        super();
        /**
         * @type {ShadowRoot}
         */
        this.root = this.attachShadow({ mode: 'open' });

        this.onCloseDialog = this.onCloseDialog.bind(this);
        this.onDocumentKeydown = this.onDocumentKeydown.bind(this);
        this.onBackdropClick = this.onBackdropClick.bind(this);
        this.onAcceptDialog = this.onAcceptDialog.bind(this);
        this.onAcceptButtonClick = this.onAcceptButtonClick.bind(this);
        this.onCancelButtonClick = this.onCancelButtonClick.bind(this);
    }

    connectedCallback() {
        this.render();

        playPauseSound();
        document.addEventListener("keydown", this.onDocumentKeydown);
        // @ts-expect-error
        this.root.querySelector('.backdrop').addEventListener('click', this.onBackdropClick);

        if (this.getAttribute('confirmation') === 'true') {
            // @ts-expect-error
            this.root.getElementById('confirm-btn').addEventListener('click', this.onAcceptButtonClick);
            // @ts-expect-error
            this.root.getElementById('cancel-btn').addEventListener('click', this.onCancelButtonClick);
            // @ts-expect-error
            this.root.getElementById('confirm-btn').focus();

            this.root.querySelectorAll('.dialog-buttons div').forEach(btn => {
                btn.addEventListener('mouseenter', playHoverSound);
            });
        }
    }

    /**
     * 
     * @param {KeyboardEvent} e 
     */
    onDocumentKeydown(e) {
        if (e.key === "Escape") {
            this.onCloseDialog();
            playCancelSound();
        }
    }

    onAcceptButtonClick() {
        this.onAcceptDialog();
    }

    onCancelButtonClick() {
        this.onCloseDialog();
        playCancelSound();
    }

    onBackdropClick() {
        this.onCloseDialog();
        playCancelSound();
    }

    onCloseDialog() {
        // dispatch cancel event
        this.dispatchEvent(new CustomEvent('cancel'));
    }

    onAcceptDialog() {
        // dispatch confirm event
        this.dispatchEvent(new CustomEvent('confirm'));
    }

    disconnectedCallback() {
        document.removeEventListener("keydown", this.onDocumentKeydown);
    }

    render() {
        const title = this.getAttribute('dialog-title') || 'Dialog Title';
        let dialogButtons = '';
        if (this.getAttribute('confirmation') === 'true') {
            const confirmText = this.getAttribute('confirm-text') || 'Yes';
            const cancelText = this.getAttribute('cancel-text') || 'No';
            dialogButtons = `
            <div class="dialog-buttons">
                <div id="cancel-btn">${cancelText}</div>
                <div id="confirm-btn">${confirmText}</div>
            </div>
            `;
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
        .dialog {
            position: fixed;
            width: 90%;
            max-width: 60vw;
            background: rgba(0, 0, 0, 0.5);
            color: white;
            padding: 5vh;
            border-radius: 1vh;
            box-shadow: 0 0 2vh rgba(0, 0, 0, 0.5);
            z-index: 50;
            left: 50%;
            transform: translate(-50%, -50%);
            top: 50%;
            border: solid 2px black;
            box-shadow: 0 0 10px 2px rgba(100, 0, 200, 0.5);
        }
        .backdrop {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(4px);
            z-index: 35;
        }
        .dialog-title {
            font-size: 5vh;
            font-weight: bold;
            margin-bottom: 2vh;
            text-align: left;
            border-bottom: solid 1px #ccc;
            padding-bottom: 2vh;
        }
        .dialog-content {
            font-size: 2vh;
            max-height: 60vh;
            overflow-y: auto;
        }
        .dialog-buttons {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-top: 4vh;
        }
        .dialog-buttons div {
            font-size: 5vh;
            cursor: pointer;
        }
        .dialog-buttons div:hover, .dialog-buttons div:focus, .dialog-buttons div:active {
            color: #FF6B6B;
        }
      </style>
      <div class="backdrop"></div>
      <div class="dialog">
        <div class="dialog-title">
            ${title}
        </div>
        <div class="dialog-content">
            <slot></slot>
        </div>
        ${dialogButtons}
      </div>
    `;
    }
}

customElements.define('app-dialog', Dialog);