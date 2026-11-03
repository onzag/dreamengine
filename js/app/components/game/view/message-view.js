import { sharedStyles } from './shared-styles.js';
﻿export class MessageView extends HTMLElement {
    connectedCallback() {
        const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
        root.innerHTML = `
            <style>
${sharedStyles}
:host { display: block; min-height: 0; }
section { padding: 1.5vh 2vh; }
p { font: inherit; line-height: 1.55; margin: 0 0 .8vh; text-shadow: 0 1px 3px #0009; font-size: 2.5vh; }
p:last-child { margin-bottom: 0; }
            </style>
            <section class="black-glass" aria-label="Narration"><p>The last light settles over the hills. For a moment, everything is still.</p><p>A path disappears into the trees ahead. You have the feeling that something is waiting just beyond the mist.</p></section>`;
    }
}
customElements.define('app-game-message-view', MessageView);
