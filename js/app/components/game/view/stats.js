export class Stats extends HTMLElement {
    connectedCallback() {
        const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
        root.innerHTML = `
            <link rel="stylesheet" href="${new URL('./stats.css', import.meta.url).href}">
            <section class="glass" aria-label="Character stats"><header>Dreamer</header><dl><div><dt>Vitality</dt><dd>100 <span>/ 100</span></dd></div><div><dt>Resolve</dt><dd>80 <span>/ 100</span></dd></div><div><dt>Condition</dt><dd>Rested</dd></div></dl></section>`;
    }
}
customElements.define('app-game-stats', Stats);
