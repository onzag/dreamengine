import { playCancelSound, setTempSoundDisable } from '../../sound.js';

class CardTypeWizard extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.render();

        // @ts-expect-error
        this.root.querySelector("app-overlay").addEventListener('cancel', () => {
            playCancelSound();
            setTempSoundDisable();
            this.remove();
        });
    }

    render() {
        this.root.innerHTML = `
            <app-overlay
                overlay-title="CardType Wizard"
                cancel-text="Go Back"
            >
            </app-overlay>
        `;
    }
}

customElements.define('app-cardtype-wizard', CardTypeWizard);
