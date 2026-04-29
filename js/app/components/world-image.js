import { profileImageCacheVersions } from './profile-image.js';

/**
 * Resolve a DreamEngine asset path (e.g. "assets/@foo/bar/image" or
 * "assets/myns/world1/image") to a fully-qualified URL, picking the right
 * base host depending on whether the asset belongs to a system namespace.
 *
 * Adds a cache-buster query string when the URL has been invalidated via
 * {@link import('./profile-image.js').invalidateProfileImageCache}.
 *
 * @param {string} imageUrl
 * @returns {string}
 */
function resolveAssetUrl(imageUrl) {
    if (!imageUrl) return '';
    const isSystemAsset = imageUrl.startsWith('assets/@');
    const base = isSystemAsset
        ? window.DREAMENGINE_DEFAULT_SCRIPTS_HOME
        : window.DREAMENGINE_HOME;
    const cacheVersion = profileImageCacheVersions.get(imageUrl) || 0;
    const cacheBuster = cacheVersion ? `?v=${cacheVersion}` : '';
    return `${base}/${imageUrl}${cacheBuster}`;
}

/**
 * View-only image asset element.
 *
 * Attributes:
 *  - image-url: DreamEngine asset path (e.g. `assets/@ns/id/image`).
 *  - default-image: fallback URL when the asset fails to load.
 *                   Defaults to `./images/default-world.png`.
 */
class AssetImage extends HTMLElement {
    constructor() {
        super();
        /** @type {ShadowRoot} */
        this.root = this.attachShadow({ mode: 'open' });
    }

    static get observedAttributes() {
        return ['image-url', 'default-image'];
    }

    connectedCallback() {
        this.render();

        const img = /** @type {HTMLImageElement | null} */ (this.root.querySelector('.asset-image'));
        if (img) {
            img.addEventListener('error', () => {
                const fallback = this.getAttribute('default-image') || './images/default-world.png';
                if (img.src.endsWith(fallback)) return; // avoid loop
                img.src = fallback;
            });
        }
    }

    /**
     * @param {string} name
     * @param {string|null} oldValue
     * @param {string|null} newValue
     */
    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return;
        const img = /** @type {HTMLImageElement | null} */ (this.root.querySelector('.asset-image'));
        if (!img) return;
        if (name === 'image-url') {
            img.src = resolveAssetUrl(newValue || '');
        }
    }

    render() {
        const imageUrl = this.getAttribute('image-url') || '';
        const resolved = resolveAssetUrl(imageUrl);
        this.root.innerHTML = `
            <style>
                :host {
                    display: block;
                    width: 100%;
                    height: 100%;
                    aspect-ratio: 1 / 1;
                }
                .asset-image {
                    width: 100%;
                    height: 100%;
                    border-radius: 10%;
                    object-fit: cover;
                    display: block;
                    box-sizing: border-box;
                    border: solid 1px black;
                }
                .asset-image-container {
                    width: 100%;
                    height: 100%;
                    overflow: hidden;
                    border-radius: 10%;
                    border: 1vh solid white;
                    box-shadow: 0 0 1vh rgba(0, 0, 0, 0.5);
                    box-sizing: border-box;
                    background-color: transparent;
                    position: relative;
                }
            </style>
            <div class="asset-image-container" part="asset-image-container">
                <img class="asset-image" part="asset-image" src="${resolved}" />
            </div>
        `;
    }
}

customElements.define('app-asset-image', AssetImage);

/**
 * Backward-compatible alias used by the worlds UI. Same behavior as
 * <app-asset-image>, but exposes the legacy `world-image-container` shadow
 * part name and identifies as `app-world-image` for existing CSS selectors.
 */
class WorldImage extends AssetImage {
    render() {
        super.render();
        const container = this.root.querySelector('.asset-image-container');
        if (container) {
            container.setAttribute('part', 'world-image-container');
        }
    }
}

customElements.define('app-world-image', WorldImage);
