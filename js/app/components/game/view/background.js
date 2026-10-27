export class Background extends HTMLElement {
    constructor() {
        super();
        this.defaultBackground = new URL('../../../images/default-world.png', import.meta.url).href;
        this.updateVersion = 0;
        /** @type {(() => void) | null} */
        this.unsubscribe = null;

        this.root = this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.root.innerHTML = `
            <link rel="stylesheet" href="${new URL('./background.css', import.meta.url).href}">
            <img src="${this.defaultBackground}" alt="" aria-hidden="true">`;
        const image = /** @type {HTMLImageElement} */ (this.root.querySelector('img'));
        image.addEventListener('error', () => {
            if (image.src === this.defaultBackground) return;
            console.warn('No background found', image.src);
            image.src = this.defaultBackground;
        });
        this.unsubscribe = window.ENGINE_WORKER_CLIENT.addDEObjectUpdatedListener(() => { void this.updateBackground(); });
        void this.updateBackground();
    }

    async updateBackground() {
        const version = ++this.updateVersion;
        try {
            const location = await window.ENGINE_WORKER_CLIENT.queryDEObject({ path: ['world', 'currentLocation'] });
            const locationSlot = await window.ENGINE_WORKER_CLIENT.queryDEObject({ path: ['world', 'currentLocationSlot'] });
            if (!this.isConnected || version !== this.updateVersion) return;
            const assetLocationSlot = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ['world', 'locations', location, "slots", locationSlot, 'metadata', 'asset'],
            });
            const assetToUse = assetLocationSlot ? assetLocationSlot : await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ['world', 'locations', location, 'metadata', 'asset'],
            });
            if (!this.isConnected || version !== this.updateVersion) return;

            let src = this.defaultBackground;
            if (typeof assetToUse === 'string' && assetToUse) {
                const isSystemAsset = assetToUse.startsWith('@');
                const base = isSystemAsset ? window.DREAMENGINE_DEFAULT_SCRIPTS_HOME : window.DREAMENGINE_HOME;
                src = `${base}/${isSystemAsset ? assetToUse.slice(1) : assetToUse}`;
            } else {
                console.warn('No background found', location);
            }
            const image = /** @type {HTMLImageElement} */ (this.root.querySelector('img'));
            if (image.getAttribute('src') !== src) image.src = src;
        } catch (error) {
            if (!this.isConnected || version !== this.updateVersion) return;
            console.warn('No background found', error);
            const image = /** @type {HTMLImageElement} */ (this.root.querySelector('img'));
            image.src = this.defaultBackground;
        }
    }

    disconnectedCallback() {
        this.unsubscribe?.();
        this.unsubscribe = null;
        // Ignore queries that finish after disconnecting or reconnecting.
        this.updateVersion++;
    }
}
customElements.define('app-game-background', Background);
