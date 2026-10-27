import { playConfirmSound, playHoverSound } from '../../../sound.js';

/** Game actions, kept separate from the story and inventory presentation. */
export class GameMenu extends HTMLElement {
    connectedCallback() {
        const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
        root.innerHTML = `
            <link rel="stylesheet" href="${new URL('./menu.css', import.meta.url).href}">
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
