export class Background extends HTMLElement {
    connectedCallback() {
        const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
        root.innerHTML = `
            <link rel="stylesheet" href="${new URL('./background.css', import.meta.url).href}">
            <img src="${new URL('../../../images/default-world.png', import.meta.url).href}" alt="" aria-hidden="true">`;
    }
}
customElements.define('app-game-background', Background);
