export class Background extends HTMLElement {
    constructor() {
        super();
        this.defaultBackground = new URL('../../../images/default-world.png', import.meta.url).href;
        this.root = this.attachShadow({ mode: 'open' });
        /** @type {DECharacterPerspective | null} */
        this.currentPerspective = null;
    }

    connectedCallback() {
        this.root.innerHTML = `
            <link rel="stylesheet" href="${new URL('./background.css', import.meta.url).href}">
            <img alt="" aria-hidden="true" hidden>`;
        const image = /** @type {HTMLImageElement} */ (this.root.querySelector('img'));
        image.addEventListener('error', () => {
            if (image.src !== this.defaultBackground) image.src = this.defaultBackground;
        });
        this.updatePerspective(this.currentPerspective);
    }

    /** @param {DECharacterPerspective | null} perspective */
    updatePerspective(perspective) {
        this.currentPerspective = perspective;
        const image = this.root.querySelector('img');
        if (!image) return;
        image.hidden = !perspective;
        if (!perspective) { image.removeAttribute('src'); return; }
        image.toggleAttribute('data-totally-blind', perspective.ownCharacterBlindness === 'full');
        const slot = perspective.ownLocation.slots.find(slot => slot.slotId === perspective.ownLocationSlotId);
        const asset = slot?.slotMetadata.asset || perspective.ownLocation.locationMetadata.asset;
        let src = this.defaultBackground;
        if (typeof asset === 'string' && asset) {
            const system = asset.startsWith('@');
            const base = system ? window.DREAMENGINE_DEFAULT_SCRIPTS_HOME : window.DREAMENGINE_HOME;
            src = `${base}/${system ? asset.slice(1) : asset}`;
        }
        if (image.getAttribute('src') !== src) image.src = src;
    }
}
customElements.define('app-game-background', Background);
