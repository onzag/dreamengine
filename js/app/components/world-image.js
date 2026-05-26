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
        /** @type {boolean} - true after the first image has been set, so subsequent changes crossfade */
        this._hasShownImage = false;
    }

    static get observedAttributes() {
        return ['image-url', 'default-image'];
    }

    connectedCallback() {
        this.render();

        // Wire up error fallback on both layers.
        for (const img of /** @type {NodeListOf<HTMLImageElement>} */ (this.root.querySelectorAll('.asset-image'))) {
            img.addEventListener('error', () => {
                const fallback = this.getAttribute('default-image') || './images/default-world.png';
                if (img.src === fallback || img.src.endsWith(fallback)) return; // avoid loop
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
        if (name === 'image-url') {
            this._transitionTo(resolveAssetUrl(newValue || ''));
        }
    }

    /**
     * Switch to a new image URL, crossfading if this is not the first image.
     * @param {string} newSrc
     */
    _transitionTo(newSrc) {
        const back  = /** @type {HTMLImageElement | null} */ (this.root.querySelector('.asset-image-back'));
        const front = /** @type {HTMLImageElement | null} */ (this.root.querySelector('.asset-image-front'));
        if (!back || !front) return;

        if (!this._hasShownImage) {
            // First image: show immediately with no fade.
            back.src = newSrc || '';
            this._hasShownImage = !!newSrc;
            return;
        }

        // Subsequent changes: crossfade via the front layer.
        // Reset front without transition so it starts fully transparent.
        front.style.transition = 'none';
        front.style.opacity = '0';
        front.src = newSrc || '';

        const doFade = () => {
            // Force a reflow so the browser registers the opacity:0 before
            // we add the transition and animate to opacity:1.
            void front.offsetWidth;
            front.style.transition = 'opacity 1000ms ease';
            front.style.opacity = '1';

            const onDone = () => {
                front.removeEventListener('transitionend', onDone);
                // Silently swap: back takes the new image, front resets.
                back.src = newSrc || '';
                front.style.transition = 'none';
                front.style.opacity = '0';
            };
            front.addEventListener('transitionend', onDone, { once: true });
        };

        if (front.complete && front.naturalWidth > 0) {
            doFade();
        } else {
            front.addEventListener('load', doFade, { once: true });
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
                    position: absolute;
                    inset: 0;
                    width: 100%;
                    height: 100%;
                    border-radius: 10%;
                    object-fit: cover;
                    display: block;
                    box-sizing: border-box;
                    border: solid 1px black;
                }
                .asset-image-back  { z-index: 1; }
                .asset-image-front { z-index: 2; opacity: 0; }
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
                <img class="asset-image asset-image-back"  part="asset-image" src="${resolved}" />
                <img class="asset-image asset-image-front" src="" />
            </div>
        `;
        this._hasShownImage = !!resolved;
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
