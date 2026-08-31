import "./diffusion/image-edit.js";

/** @type {Map<string, number>} */
export const profileImageCacheVersions = new Map();

/**
 * Bump the cache-buster for a specific image URL so any subsequently rendered
 * `app-profile-image` instances pointing to it will fetch a fresh copy.
 * @param {string} imageUrl
 */
export function invalidateProfileImageCache(imageUrl) {
    if (!imageUrl) return;
    profileImageCacheVersions.set(imageUrl, (profileImageCacheVersions.get(imageUrl) || 0) + 1);
}

class ProfileImage extends HTMLElement {
    constructor() {
        super();
        /**
         * @type {ShadowRoot}
         */
        this.root = this.attachShadow({ mode: 'open' });

        this.currentObjectUrl = null;
        this.currentFileObject = null;
        this.triedFallback = false;
    }

    /**
     * Resolve a DE asset path (optionally `@`-prefixed) into an absolute URL.
     * Absolute http(s)/blob/data URLs are returned unchanged.
     * @param {string} url
     * @returns {string}
     */
    resolveAssetUrl(url) {
        if (!url) return url;
        if (/^(https?:|blob:|data:|\.\/)/.test(url)) return url;
        const isSystemAsset = url.startsWith('@');
        const base = isSystemAsset ? window.DREAMENGINE_DEFAULT_SCRIPTS_HOME : window.DREAMENGINE_HOME;
        return base + "/" + (isSystemAsset ? url.slice(1) : url);
    }

    connectedCallback() {
        this.render();

        // @ts-expect-error
        this.root.querySelector('.profile-image').addEventListener('error', () => {
            const isWorld = this.getAttribute("world") === "true";
            const fallbackUrl = this.getAttribute('fallback-url');
            const imgEl = this.root.querySelector('.profile-image');
            // If the primary image is missing, fall back to the provided
            // fallback source (used as the editing base too) before giving up
            // on the generic default image.
            if (fallbackUrl && !this.triedFallback) {
                this.triedFallback = true;
                // @ts-expect-error
                imgEl.src = this.resolveAssetUrl(fallbackUrl);
                return;
            }
            // @ts-expect-error
            imgEl.src = isWorld ? './images/default-world.png' : './images/default-profile.png';
        });

        if (this.hasAttribute('editable')) {
            const fileInput = this.root.querySelector('input[type="file"]');
            const editOverlay = this.root.querySelector('.edit-overlay');

            // @ts-expect-error
            editOverlay.addEventListener('click', async () => {

                const supportsDiffusion = await window.API.getConfigValue("diffusionEnabled");
                const diffusionHost = await window.API.getConfigValue("diffusionHost");
                const actuallySupportsDiffusion = diffusionHost && diffusionHost.length > 0 && supportsDiffusion;

                if (actuallySupportsDiffusion) {
                    this.openImageSourceChoiceDialog();
                } else {
                    // @ts-expect-error
                    fileInput.click();
                }
            });

            // @ts-expect-error
            fileInput.addEventListener('change', async (event) => {
                // @ts-expect-error
                const file = event.target.files[0];
                if (file) {
                    const urlBlob = URL.createObjectURL(file);
                    if (this.currentObjectUrl) {
                        URL.revokeObjectURL(this.currentObjectUrl);
                    }
                    this.currentObjectUrl = urlBlob;
                    this.currentFileObject = file;
                    // @ts-expect-error
                    this.root.querySelector('.profile-image').src = urlBlob;
                }
            });
        }
    }

    /**
     * Present a choice between generating/editing the image in the image editor
     * or uploading a file. Diffusion support has already been verified.
     */
    openImageSourceChoiceDialog() {
        const dialog = document.createElement('app-dialog');
        dialog.setAttribute('dialog-title', 'Change Image');
        dialog.setAttribute('extra-z-index', '200');
        dialog.innerHTML = `
            <style>
                .image-source-choices {
                    display: flex;
                    gap: 2vh;
                    justify-content: center;
                    flex-wrap: wrap;
                    padding: 2vh 0;
                }
                .image-source-choice {
                    font-size: 3vh;
                    padding: 2vh 3vh;
                    border-radius: 1vh;
                    background: rgba(100, 0, 200, 0.3);
                    border: solid 2px black;
                    cursor: pointer;
                    color: white;
                    user-select: none;
                }
                .image-source-choice:hover, .image-source-choice:focus {
                    background: rgba(100, 0, 200, 0.6);
                    color: #FF6B6B;
                }
            </style>
            <div class="image-source-choices">
                <div class="image-source-choice" id="choice-editor" role="button" tabindex="0" data-de-aria-key="e">Use Image Editor</div>
                <div class="image-source-choice" id="choice-upload" role="button" tabindex="0" data-de-aria-key="u">Upload Image</div>
            </div>
        `;
        document.body.appendChild(dialog);

        const closeDialog = () => {
            if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
        };

        dialog.addEventListener('cancel', closeDialog);

        // @ts-expect-error
        dialog.querySelector('#choice-upload').addEventListener('click', () => {
            closeDialog();
            const fileInput = this.root.querySelector('input[type="file"]');
            // @ts-expect-error
            fileInput.click();
        });

        // @ts-expect-error
        dialog.querySelector('#choice-editor').addEventListener('click', () => {
            closeDialog();
            this.openImageEditorDialog();
        });
    }

    /**
     * Open the image editor seeded with the current image (if any), enforcing a
     * 1024x1024 canvas. On accept, the merged layers become the new image.
     */
    openImageEditorDialog() {
        const currentSrc = this.currentObjectUrl
            // @ts-expect-error
            || (this.root.querySelector('.profile-image')?.src || '');

        const dialog = document.createElement('app-dialog');
        dialog.setAttribute('dialog-title', 'Image Editor');
        dialog.setAttribute('confirmation', 'true');
        dialog.setAttribute('confirm-text', 'Accept');
        dialog.setAttribute('cancel-text', 'Cancel');
        dialog.setAttribute('extra-z-index', '200');
        dialog.setAttribute('large', 'true');
        dialog.setAttribute('pre-expand', 'true');

        const editorWidth = this.getAttribute('editor-width') || '1024';
        const editorHeight = this.getAttribute('editor-height') || '1024';

        const editor = document.createElement('image-edit');
        editor.setAttribute('image-width', editorWidth);
        editor.setAttribute('image-height', editorHeight);
        editor.setAttribute('lock-size', 'true');
        if (this.hasAttribute('dont-handle-diffusion-executable')) {
            editor.setAttribute('dont-handle-diffusion-executable', 'true');
        }
        if (currentSrc) editor.setAttribute('img-src', currentSrc);
        dialog.appendChild(editor);

        document.body.appendChild(dialog);

        const closeDialog = () => {
            if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
        };

        dialog.addEventListener('cancel', closeDialog);

        dialog.addEventListener('confirm', () => {
            // @ts-ignore
            const merged = editor.getCombinedLayers && editor.getCombinedLayers();
            if (!merged) {
                closeDialog();
                return;
            }
            merged.toBlob((/** @type {Blob | null} */ blob) => {
                if (blob) {
                    const urlBlob = URL.createObjectURL(blob);
                    if (this.currentObjectUrl) {
                        URL.revokeObjectURL(this.currentObjectUrl);
                    }
                    this.currentObjectUrl = urlBlob;
                    this.currentFileObject = new File([blob], 'image.webp', { type: 'image/webp' });
                    // @ts-expect-error
                    this.root.querySelector('.profile-image').src = urlBlob;
                }
                closeDialog();
            }, 'image/webp', 0.8);
        });
    }

    hasBeenModified() {
        return this.currentObjectUrl !== null;
    }

    /**
     * Load an external reference image and treat it as a user-provided change so
     * that {@link saveValueToUserData} will copy it to this element's `image-url`
     * path. The displayed image and image editor seed are updated to match.
     * @param {string} referenceUrl - a DE asset path (optionally `@`-prefixed) or an absolute http(s)/blob/data URL
     */
    async loadReferenceImage(referenceUrl) {
        if (!referenceUrl) return;

        let resolved = referenceUrl;
        if (!/^(https?:|blob:|data:)/.test(referenceUrl)) {
            const isSystemAsset = referenceUrl.startsWith('@');
            const base = isSystemAsset ? window.DREAMENGINE_DEFAULT_SCRIPTS_HOME : window.DREAMENGINE_HOME;
            resolved = base + "/" + (isSystemAsset ? referenceUrl.slice(1) : referenceUrl);
        }

        try {
            const response = await fetch(resolved);
            if (!response.ok) return;
            const blob = await response.blob();
            const urlBlob = URL.createObjectURL(blob);
            if (this.currentObjectUrl) {
                URL.revokeObjectURL(this.currentObjectUrl);
            }
            this.currentObjectUrl = urlBlob;
            const ext = (blob.type && blob.type.split('/')[1]) || 'webp';
            this.currentFileObject = new File([blob], 'image.' + ext, { type: blob.type || 'image/webp' });
            const imgEl = this.root.querySelector('.profile-image');
            // @ts-expect-error
            if (imgEl) imgEl.src = urlBlob;
        } catch (err) {
            console.error('Failed to load reference image:', err);
        }
    }

    // on dismount revoke any created object URLs to free memory
    disconnectedCallback() {
        if (this.currentObjectUrl) {
            URL.revokeObjectURL(this.currentObjectUrl);
        }
    }

    async saveValueToUserData() {
        if (!this.hasBeenModified()) {
            return;
        }
        const imageUrl = this.getAttribute('image-url') || '';
        await window.API.uploadFileToDEPath(imageUrl, this.currentFileObject);
        invalidateProfileImageCache(imageUrl);
    }

    render() {
        const imageUrl = this.getAttribute('image-url') || '';
        const isEditable = this.hasAttribute('editable');
        const cacheVersion = profileImageCacheVersions.get(imageUrl) || 0;
        const cacheBuster = cacheVersion ? `?v=${cacheVersion}` : '';
        const isSystemAsset = imageUrl.startsWith('@');
        this.root.innerHTML = `
            <style>
                :host {
                    display: block;
                    width: 100%;
                    height: 100%;
                    aspect-ratio: 1 / 1;
                }
                .profile-image {
                    width: 100%;
                    height: 100%;
                    border-radius: 10%;
                    object-fit: cover;
                    display: block;
                    box-sizing: border-box;
                    border: solid 1px black;
                }
                .profile-image-container {
                    width: 100%;
                    height: 100%;
                    overflow: hidden;
                    border-radius: 10%;
                    border: 1vh solid white;
                    box-shadow: 0 0 1vh rgba(0, 0, 0, 0.5);
                    box-sizing: border-box;
                    background-color: transparent;
                    cursor: "pointer";
                    position: relative;
                }
                
                .edit-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    border-radius: 10%;
                    opacity: 0;
                    background-color: rgba(0, 0, 0, 0.3);
                    backdrop-filter: blur(2px) saturate(150%);
                }
                .edit-overlay:hover, .edit-overlay:focus-within, .edit-overlay:focus {
                    opacity: 1;
                    transition: background-color 0.3s, opacity 0.3s;
                    cursor: pointer;
                }
                .edit-overlay-icon {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 50%;
                    height: 50%;
                    text-align: center;
                    font-size: 3vw;
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                }
            </style>
            <div class="profile-image-container" part="profile-image-container">
                <img
                    class="profile-image"
                    part="profile-image"
                    alt="${(this.getAttribute('alt') || 'Profile Image')}"
                    tabindex="${isEditable ? '-1' : this.getAttribute('tabindex') || '0'}"
                    src="${(isSystemAsset ? window.DREAMENGINE_DEFAULT_SCRIPTS_HOME : window.DREAMENGINE_HOME) + "/" + (isSystemAsset ? imageUrl.slice(1) : imageUrl) + cacheBuster}" />
                ${isEditable ? `<div class="edit-overlay" data-de-aria-offset-x="-2vh" data-de-aria-offset-y="1vh" role="img" aria-disabled="false" tabindex="0" data-de-aria-action="click" data-de-aria-key="i" aria-label="${(this.getAttribute('alt') || 'Profile Image') + (isEditable ? ", press enter to edit" : "")}"><svg class="edit-overlay-icon" width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
                    <path fill="#fff" d="M441 58.9L453.1 71c9.4 9.4 9.4 24.6 0 33.9L424 134.1 377.9 88 407 58.9c9.4-9.4 24.6-9.4 33.9 0zM209.8 256.2L344 121.9 390.1 168 255.8 302.2c-2.9 2.9-6.5 5-10.4 6.1l-58.5 16.7 16.7-58.5c1.1-3.9 3.2-7.5 6.1-10.4zM373.1 25L175.8 222.2c-8.7 8.7-15 19.4-18.3 31.1l-28.6 100c-2.4 8.4-.1 17.4 6.1 23.6s15.2 8.5 23.6 6.1l100-28.6c11.8-3.4 22.5-9.7 31.1-18.3L487 138.9c28.1-28.1 28.1-73.7 0-101.8L474.9 25C446.8-3.1 401.2-3.1 373.1 25zM88 64C39.4 64 0 103.4 0 152L0 424c0 48.6 39.4 88 88 88l272 0c48.6 0 88-39.4 88-88l0-112c0-13.3-10.7-24-24-24s-24 10.7-24 24l0 112c0 22.1-17.9 40-40 40L88 464c-22.1 0-40-17.9-40-40l0-272c0-22.1 17.9-40 40-40l112 0c13.3 0 24-10.7 24-24s-10.7-24-24-24L88 64z"/>
                    </svg></div>` : ''}
            </div>
            <input type="file" accept="image/*" style="display:none;" />
        `;
    }
}

customElements.define('app-profile-image', ProfileImage);