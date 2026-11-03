import { sharedStyles } from './shared-styles.js';
﻿import { playConfirmSound, playHoverSound } from '../../../sound.js';

/** Game actions, kept separate from the story and inventory presentation. */
export class GameMenu extends HTMLElement {
    connectedCallback() {
        const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
        root.innerHTML = `
            <style>
${sharedStyles}
:host { display: flex; }
button { display: flex; align-items: center; justify-content: space-between; gap: 1.2vh; min-height: var(--control-height); padding: 1vh 2vh; font-size: 3vh; }
.trigger { width: 100%; anchor-name: --game-menu; }
[popover] { position: fixed; position-anchor: --game-menu; inset: auto; top: anchor(bottom); left: anchor(left); margin: .8vh 0 0; min-width: 20vh; padding: .6vh; color: var(--ink); }
[popover] button { width: 100%; border: 0; border-radius: .5vh; background: transparent; text-align: left; }
button:hover:not(:disabled) { background-color: rgba(80, 130, 180, .35); }
.wake-up { color: #f4dada; }
@supports not (top: anchor(bottom)) { [popover] { top: calc(var(--edge) + var(--control-height)); left: var(--edge); } }
            </style>
            <button class="trigger glass" type="button" popovertarget="game-options" aria-expanded="false">Menu <span aria-hidden="true">☰</span></button>
            <div id="game-options" class="glass" popover aria-label="Game options">
                <button type="button" disabled>Save</button>
                <button class="wake-up" type="button">Wake up</button>
            </div>`;
        const trigger = /** @type {HTMLButtonElement} */ (root.querySelector('.trigger'));
        const options = /** @type {HTMLElement} */ (root.querySelector('[popover]'));
        options.addEventListener('toggle', () => {
            trigger.setAttribute('aria-expanded', String(options.matches(':popover-open')));
        });
        for (const button of root.querySelectorAll('button:not(:disabled)')) {
            button.addEventListener('mouseenter', playHoverSound);
        }
        root.querySelector('.wake-up')?.addEventListener('click', () => {
            options.hidePopover();
            trigger.focus();
            this.dispatchEvent(new CustomEvent('wake-up', { bubbles: true, composed: true }));
        });
    }
}
customElements.define('app-game-menu', GameMenu);
