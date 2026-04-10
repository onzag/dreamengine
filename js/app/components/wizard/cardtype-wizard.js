import { playCancelSound, playHoverSound, setTempSoundDisable } from '../../sound.js';

class CardTypeWizard extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        this.onDocumentKeydown = this.onDocumentKeydown.bind(this);
    }

    connectedCallback() {
        this.render();

        // hide stars when overlay is active
        // @ts-expect-error
        document.querySelector('.sky').style.display = 'none';

        document.addEventListener('keydown', this.onDocumentKeydown);

        this.root.getElementById('cancel-btn')?.addEventListener('click', () => {
            playCancelSound();
            setTempSoundDisable();
            this.remove();
        });

        this.root.querySelectorAll('.wizard-buttons div').forEach(btn => {
            btn.addEventListener('mouseenter', playHoverSound);
        });
    }

    disconnectedCallback() {
        document.removeEventListener('keydown', this.onDocumentKeydown);
        // @ts-expect-error
        document.querySelector('.sky').style.display = 'block';
    }

    /** @param {KeyboardEvent} e */
    onDocumentKeydown(e) {
        if (e.key === 'Escape') {
            if (document.querySelector('app-dialog')) return;
            const bodyChildren = Array.from(document.body.children);
            if (bodyChildren[bodyChildren.length - 1] !== this) return;
            playCancelSound();
            setTempSoundDisable();
            this.remove();
        }
    }

    render() {
        this.root.innerHTML = `
      <style>
        *::-webkit-scrollbar {
            width: 10px !important;
        }
        *::-webkit-scrollbar-track {
            background: rgba(0, 15, 30, 0.6) !important;
        }
        *::-webkit-scrollbar-thumb {
            background: rgba(0, 60, 90, 0.8) !important;
            border: 1px solid rgba(80, 180, 220, 0.3) !important;
            border-radius: 5px !important;
        }
        *::-webkit-scrollbar-thumb:hover {
            background: rgba(0, 80, 120, 0.9) !important;
        }

        .wizard-overlay {
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
                160deg,
                #000000 0%,
                #000508 6%,
                #000a12 12%,
                #00101a 20%,
                #001420 28%,
                #001825 36%,
                #001a2a 44%,
                #001c2f 52%,
                #001e32 60%,
                #002035 68%,
                #002238 76%,
                #00243b 84%,
                #00263e 92%,
                #002840 100%
            );
            color: #c8dce8;
            z-index: 20;
            box-sizing: border-box;
        }

        .wizard-title {
            font-size: 3vh;
            padding: 2vh 4vh;
            border-bottom: solid 1px rgba(80, 180, 220, 0.25);
            width: 100%;
            background: linear-gradient(
                to right,
                rgba(0, 40, 70, 0.4),
                rgba(0, 20, 40, 0.2)
            );
            box-sizing: border-box;
            letter-spacing: 0.1em;
            text-shadow: 0 0 12px rgba(60, 160, 220, 0.15);
        }

        .wizard-content {
            flex: 1;
            width: 100%;
            overflow-y: auto;
        }

        .wizard-buttons {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            width: 100%;
            padding: 2vh 4vh;
            box-sizing: border-box;
            border-top: solid 1px rgba(80, 180, 220, 0.25);
            background: linear-gradient(
                to right,
                rgba(0, 20, 40, 0.2),
                rgba(0, 40, 70, 0.4)
            );
        }

        .wizard-buttons div {
            font-size: 5vh;
            cursor: pointer;
            color: rgba(120, 200, 240, 0.7);
            transition: color 0.2s ease, text-shadow 0.2s ease;
        }
        .wizard-buttons div:hover {
            color: #60d0ff;
            text-shadow: 0 0 14px rgba(60, 180, 255, 0.4);
        }
      </style>
      <div class="wizard-overlay">
        <div class="wizard-title">CardType Wizard</div>
        <div class="wizard-content">
            <slot></slot>
        </div>
        <div class="wizard-buttons">
            <div id="cancel-btn">Go Back</div>
        </div>
      </div>
    `;
    }
}

customElements.define('app-cardtype-wizard', CardTypeWizard);
