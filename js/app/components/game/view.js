import './view/background.js';
import './view/stats.js';
import './view/character-surrounding-view.js';
import './view/message-view.js';
import './view/items-overlay.js';
import './view/menu.js';
import { playHoverSound } from '../../sound.js';

/** Presentation shell. Engine turns and live data will be connected later. */
export class GameView extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.root.innerHTML = `
            <link rel="stylesheet" href="${new URL('./view.css', import.meta.url).href}">
            <div class="container">
                <app-game-background></app-game-background>
                <div class="sidebar">
                    <div class="toolbar">
                        <app-game-menu></app-game-menu>
                        <button class="items-toggle glass" type="button" aria-haspopup="dialog" aria-expanded="false" id="surroundings">Surroundings <kbd>Tab</kbd></button>
                    </div>
                    <app-game-stats></app-game-stats>
                </div>
                <app-game-character-surrounding-view></app-game-character-surrounding-view>
                <div class="story">
                    <app-game-message-view></app-game-message-view>
                </div>
            </div>
            <app-game-items-overlay></app-game-items-overlay>`;
        const button = /** @type {HTMLButtonElement} */ (this.root.querySelector('.items-toggle'));
        const overlay = /** @type {import('./view/items-overlay.js').ItemsOverlay} */ (this.root.querySelector('app-game-items-overlay'));
        button.addEventListener('click', () => overlay.show());
        overlay.addEventListener('toggle', () => {
            button.setAttribute('aria-expanded', String(overlay.open));
            const container = /** @type {HTMLElement} */ (this.root.querySelector('.container'));
            container.inert = overlay.open;
        });
        this.controller = new AbortController();
        button.addEventListener("mouseenter", () => playHoverSound());
        window.addEventListener('keydown', event => {
            if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || document.querySelector('app-dialog')) return;
            if (event.key === 'Tab' && !event.shiftKey) {
                event.preventDefault();
                if (overlay.open) overlay.close();
                else overlay.show();
            }
        }, { signal: this.controller.signal });
    }

    disconnectedCallback() {
        this.controller?.abort();
    }
}

customElements.define('app-game-view', GameView);
