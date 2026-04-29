import './dark-overlay.js';
import "./profile-image.js";
import { playCancelSound, playConfirmSound, playHoverSound, playPauseSound } from '../sound.js';

class License extends HTMLElement {
    constructor() {
        super();
        /**
         * @type {ShadowRoot}
         */
        this.root = this.attachShadow({ mode: 'open' });

        this.onCloseLicense = this.onCloseLicense.bind(this);
    }

    connectedCallback() {
        this.render();

        // @ts-expect-error
        this.root.querySelector('app-dark-overlay').addEventListener('confirm', this.onCloseLicense);
    }

    onCloseLicense() {
        playCancelSound();
        this.dispatchEvent(new CustomEvent('close'));
    }

    render() {
        this.root.innerHTML = `
        <style>
            .profile-image-spacer {
                height: 4vh;
            }
            .main-profile-image-container {
                width: 20vw;
                height: 20vw;
            }
            .license-content {
                padding: 10vh 10vh;
                font-size: 4vh;
                text-align: left;
            }
            .license-content p {
                margin: 0 0 5vh 0;
            }
        </style>
        <app-dark-overlay overlay-title="License" confirm-text="Close">
            <div class="license-content">
                <p>This program is published under the <strong>GNU General Public License v3.0 (GPLv3)</strong>.</p>
                <p>All derivative works must remain open source under the same license terms unless agreed by the developer.</p>
                <p>For alternative licensing agreements, please contact the developer.</p>
            </div>
        </app-dark-overlay>`;
    }
}

customElements.define('app-license', License);