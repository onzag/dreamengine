import './overlay.js';
import "./profile-image.js";
import { playCancelSound, playConfirmSound, playHoverSound, playPauseSound } from '../sound.js';

const ATTRIBS = {
    "withcatai": {
        "url": "https://github.com/withcatai",
        "for": "Node Llama CCP library used for local AI features in local non-vllm DreamServer",
        "license": "MIT License"
    },
    "Onza (The Author)": {
        "url": "https://github.com/onzag",
        "for": "Theme Music",
        "license": "Creative Commons BY-SA 4.0 License"
    },
    "Feraly_": {
        "url": "https://freesound.org/people/Feraly_/",
        "for": "UI Sound Effects",
        "license": "CC0 (Public Domain)"
    },
}

class OtherAttributions extends HTMLElement {
    constructor() {
        super();
        /**
         * @type {ShadowRoot}
         */
        this.root = this.attachShadow({ mode: 'open' });

        this.onCloseOtherAttributions = this.onCloseOtherAttributions.bind(this);
    }

    connectedCallback() {
        this.render();

        // @ts-expect-error
        this.root.querySelector('app-overlay').addEventListener('confirm', this.onCloseOtherAttributions);
    }

    onCloseOtherAttributions() {
        playCancelSound();
        this.dispatchEvent(new CustomEvent('close'));
    }

    render() {
        const attribItems = Object.entries(ATTRIBS).map(([name, info]) => `
            <div class="attrib-item">
                <p><strong><a href="${info.url}" target="_blank">${name}</a></strong></p>
                <p>${info.for}</p>
                <p class="attrib-license">${info.license}</p>
            </div>
        `).join('');

        this.root.innerHTML = `
        <style>
            .profile-image-spacer {
                height: 4vh;
            }
            .main-profile-image-container {
                width: 20vw;
                height: 20vw;
            }
            .attrib-content {
                padding: 10vh 10vh;
                font-size: 4vh;
                text-align: left;
            }
            .attrib-item {
                margin: 0 0 5vh 0;
            }
            .attrib-item p {
                margin: 0;
            }
            .attrib-item a {
                color: inherit;
                text-decoration: underline;
            }
            .attrib-license {
                font-style: italic;
                opacity: 0.7;
            }
        </style>
        <app-overlay overlay-title="Other Attributions" confirm-text="Close">
            <div class="attrib-content">
                ${attribItems}
            </div>
        </app-overlay>`;
    }
}

customElements.define('app-other-attributions', OtherAttributions);