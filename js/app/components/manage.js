import { playCancelSound, playPauseSound } from '../sound.js';
import "./manage/characters.js";
import "./manage/worlds.js";
import "./manage/scripts.js";

const MANAGE_SECTIONS = [
    { title: 'Characters' },
    { title: 'Worlds' },
    { title: 'Custom Scripts' },
];

class ManageOverlay extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        this.currentSectionIndex = 0;
    }

    connectedCallback() {
        this.render();
        playPauseSound();

        this.shadowRoot.querySelector("app-overlay").addEventListener('cancel', () => {
            this.remove();
            playCancelSound();
        });

        this.shadowRoot.querySelector('app-overlay-tabs').addEventListener('tab-change', (e) => {
            this.currentSectionIndex = e.detail.newIndex;
            this.buildChildrenMap();
        });

        this.buildChildrenMap();
    }

    buildChildrenMap() {
        const contentArea = this.shadowRoot.querySelector('.internal-content-area');
        if (this.currentSectionIndex === 0) {
            contentArea.innerHTML = '<app-manage-characters></app-manage-characters>';
        } else if (this.currentSectionIndex === 1) {
            contentArea.innerHTML = '<app-manage-worlds></app-manage-worlds>';
        } else if (this.currentSectionIndex === 2) {
            contentArea.innerHTML = '<app-manage-scripts></app-manage-scripts>';
        }
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                @import "./components/manage.css";
            </style>
            <app-overlay overlay-title="Manage" cancel-text="Go Back">
                <app-overlay-tabs current="${this.currentSectionIndex}" sections='${JSON.stringify(MANAGE_SECTIONS.map(section => section.title))}'>
                    <div class="internal-content-area">
                    </div>
                </app-overlay-tabs>
            </app-overlay>
        `;
    }
}

customElements.define('app-manage', ManageOverlay);