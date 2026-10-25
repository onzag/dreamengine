export class EntryInput extends HTMLElement {
    connectedCallback() {
        const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
        root.innerHTML = `
            <link rel="stylesheet" href="${new URL('./entry-input.css', import.meta.url).href}">
            <div class="field glass"><textarea id="action" rows="1" aria-label="Your action" placeholder="Speak or act..."></textarea><button type="button" aria-label="Continue" disabled><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 14-7-5 14-3-6-6-1Z"></path><path d="m11 13 8-8"></path></svg></button></div>`;
    }
}
customElements.define('app-game-entry-input', EntryInput);
