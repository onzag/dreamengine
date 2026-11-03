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
            <style>
:host { display: block; overflow: hidden; background: #000; }
img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center; filter: blur(1vh); }
img[data-totally-blind] { filter: contrast(500%) grayscale(100%) sepia(100%) hue-rotate(180deg) blur(2vh); }
:host::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(transparent 50%, rgba(8, 21, 23, .2)); }

img[hidden] { display: none; }
            </style>
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
