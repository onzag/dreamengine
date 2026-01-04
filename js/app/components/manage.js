import { playCancelSound, playConfirmSound, playPauseSound } from '../sound.js';
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
        /**
         * @type {ShadowRoot}
         */
        this.root = this.attachShadow({ mode: 'open' });

        this.currentSectionIndex = 0;
    }

    connectedCallback() {
        this.render();
        playPauseSound();

        // @ts-expect-error
        this.root.querySelector("app-overlay").addEventListener('cancel', () => {
            this.remove();
            playCancelSound();
        });

        // @ts-expect-error
        this.root.querySelector('app-overlay-tabs').addEventListener('tab-change', (e) => {
            // @ts-expect-error
            this.currentSectionIndex = e.detail.newIndex;
            this.buildChildrenMap();
            playConfirmSound();
        });

        this.buildChildrenMap();
    }

    buildChildrenMap() {
        const contentArea = this.root.querySelector('.internal-content-area');
        if (this.currentSectionIndex === 0) {
            // @ts-expect-error
            contentArea.innerHTML = '<app-manage-characters></app-manage-characters>';
        } else if (this.currentSectionIndex === 1) {
            // @ts-expect-error
            contentArea.innerHTML = '<app-manage-worlds></app-manage-worlds>';
        } else if (this.currentSectionIndex === 2) {
            // @ts-expect-error
            contentArea.innerHTML = '<app-manage-scripts></app-manage-scripts>';
        }
    }

    render() {
        this.root.innerHTML = `
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