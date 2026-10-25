export class MessageView extends HTMLElement {
    connectedCallback() {
        const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
        root.innerHTML = `
            <link rel="stylesheet" href="${new URL('./message-view.css', import.meta.url).href}">
            <section class="glass" aria-label="Narration"><p>The last light settles over the hills. For a moment, everything is still.</p><p>A path disappears into the trees ahead. You have the feeling that something is waiting just beyond the mist.</p></section>`;
    }
}
customElements.define('app-game-message-view', MessageView);
