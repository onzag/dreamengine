import { AIHubExposeBase } from './base.js';

/**
 * Image expose: choose a source (a canvas layer combination or an upload) and
 * keep a live blob of the resulting image. The blob is refreshed (debounced by
 * the selector) whenever the canvas changes, unless the user uploaded a custom
 * image.
 */
export class AIHubExposeImageComponent extends AIHubExposeBase {
    constructor() {
        super();
        /** @type {Blob | null} */
        this._blob = null;
        /** @type {string | null} */
        this._previewUrl = null;
        /** @type {Blob | null} custom uploaded image */
        this._uploadedBlob = null;
    }

    defaultValue() { return this._expose.data.type || 'merged_image'; }

    /** @returns {string} the source type, locked by the expose definition. */
    currentType() { return this._expose.data.type || 'merged_image'; }

    render() {
        const d = this._expose.data;
        const type = this.currentType();
        this.root.innerHTML = `
            <style>${this.baseStyle()}</style>
            <div class="field" title="${this.escapeAttr(d.tooltip)}">
                <label>${this.escapeText(d.label || d.id)}${d.optional ? ' (optional)' : ''}</label>
                <div class="upload-controls" style="${type === 'upload' ? '' : 'display:none;'}">
                    <div class="row" style="margin-top:0.5vh;">
                        <input type="file" accept="image/*" class="upload-input grow" />
                        <div class="btn snapshot-btn">Snapshot</div>
                    </div>
                </div>
                <img class="preview" alt="" />
            </div>
        `;
        const fileInput = /** @type {HTMLInputElement} */ (this.root.querySelector('.upload-input'));
        const snapshot = /** @type {HTMLElement|null} */ (this.root.querySelector('.snapshot-btn'));

        fileInput?.addEventListener('change', () => {
            const file = fileInput.files && fileInput.files[0];
            if (!file) return;
            this._uploadedBlob = file;
            this._setBlob(file);
            if (this._context) this._context.notifyChange();
        });
        snapshot?.addEventListener('click', () => {
            this._uploadedBlob = null;
            this.refreshFromCanvas();
        });

        this.refreshFromCanvas();
    }

    onImageChanged() {
        // Keep an uploaded image untouched; otherwise track the canvas.
        if (this.currentType() === 'upload' && this._uploadedBlob) return;
        this.refreshFromCanvas();
    }

    /** Regenerate the preview and blob from the current canvas state. */
    refreshFromCanvas() {
        const canvas = this._context && this._context.getCanvas && this._context.getCanvas();
        if (!canvas || typeof canvas.getImageCanvasForType !== 'function') return;
        const type = this.currentType();
        if (type === 'upload' && this._uploadedBlob) return;
        const source = canvas.getImageCanvasForType(type);
        if (!source) return;
        // @ts-ignore
        source.toBlob((blob) => { if (blob) this._setBlob(blob); });
    }

    /**
     * @param {Blob} blob
     */
    _setBlob(blob) {
        this._blob = blob;
        if (this._previewUrl) URL.revokeObjectURL(this._previewUrl);
        this._previewUrl = URL.createObjectURL(blob);
        const img = /** @type {HTMLImageElement|null} */ (this.root.querySelector('.preview'));
        if (img) img.src = this._previewUrl;
    }

    getValue() { return this._blob; }
}
customElements.define('aihub-expose-image', AIHubExposeImageComponent);

/** Behaves identically to the image expose from a UI perspective. */
export class AIHubExposeImageInfoOnlyComponent extends AIHubExposeImageComponent { }
customElements.define('aihub-expose-image-info-only', AIHubExposeImageInfoOnlyComponent);

/**
 * Image batch expose. Supports combining all layers as separate images or a
 * user-supplied, orderable upload list. Returns an array of blobs.
 */
export class AIHubExposeImageBatchComponent extends AIHubExposeBase {
    constructor() {
        super();
        /** @type {Blob[]} */
        this._uploads = [];
        /** @type {Blob[]} */
        this._layerBlobs = [];
    }

    defaultValue() {
        // "all_frames" is video related and treated as upload here.
        const t = this._expose.data.type;
        return t === 'all_frames' ? 'upload' : (t || 'upload');
    }
    currentType() { return this._value || this.defaultValue(); }

    render() {
        const d = this._expose.data;
        const type = this.currentType();
        this.root.innerHTML = `
            <style>${this.baseStyle()}</style>
            <div class="field" title="${this.escapeAttr(d.tooltip)}">
                <label>${this.escapeText(d.label || d.id)}</label>
                <select class="type-select">
                    <option value="all_layers_at_image_size" ${type === 'all_layers_at_image_size' ? 'selected' : ''}>All layers</option>
                    <option value="upload" ${type === 'upload' ? 'selected' : ''}>Upload list</option>
                </select>
                <div class="upload-controls" style="${type === 'upload' ? '' : 'display:none;'}">
                    <input type="file" accept="image/*" multiple class="upload-input" style="margin-top:0.5vh;" />
                    <div class="list upload-list" style="margin-top:0.5vh;"></div>
                </div>
            </div>
        `;
        const select = /** @type {HTMLSelectElement} */ (this.root.querySelector('.type-select'));
        const uploadControls = /** @type {HTMLElement} */ (this.root.querySelector('.upload-controls'));
        const fileInput = /** @type {HTMLInputElement} */ (this.root.querySelector('.upload-input'));

        select.addEventListener('change', () => {
            uploadControls.style.display = select.value === 'upload' ? '' : 'none';
            this.setValue(select.value);
            if (select.value === 'all_layers_at_image_size') this.refreshFromCanvas();
        });
        fileInput.addEventListener('change', () => {
            this._uploads = Array.from(fileInput.files || []);
            this._renderUploadList();
            if (this._context) this._context.notifyChange();
        });
        this._renderUploadList();
        if (type === 'all_layers_at_image_size') this.refreshFromCanvas();
    }

    _renderUploadList() {
        const list = /** @type {HTMLElement|null} */ (this.root.querySelector('.upload-list'));
        if (!list) return;
        list.innerHTML = this._uploads.map((f, i) => `
            <div class="row" data-index="${i}">
                <span class="grow">${this.escapeText(/** @type {File} */(f).name || ('image ' + i))}</span>
                <div class="btn up-btn">&#9650;</div>
                <div class="btn down-btn">&#9660;</div>
            </div>`).join('');
        list.querySelectorAll('.row').forEach((row) => {
            const i = parseInt(row.getAttribute('data-index') || '0', 10);
            row.querySelector('.up-btn')?.addEventListener('click', () => this._move(i, -1));
            row.querySelector('.down-btn')?.addEventListener('click', () => this._move(i, 1));
        });
    }

    /**
     * 
     * @param {number} index 
     * @param {number} dir 
     * @returns {void}
     */
    _move(index, dir) {
        const to = index + dir;
        if (to < 0 || to >= this._uploads.length) return;
        const [item] = this._uploads.splice(index, 1);
        this._uploads.splice(to, 0, item);
        this._renderUploadList();
        if (this._context) this._context.notifyChange();
    }

    onImageChanged() {
        if (this.currentType() === 'all_layers_at_image_size') this.refreshFromCanvas();
    }

    /** Rebuild one blob per visible layer. */
    refreshFromCanvas() {
        const canvas = this._context && this._context.getCanvas && this._context.getCanvas();
        if (!canvas || typeof canvas.getLayerCanvases !== 'function') return;
        const canvases = canvas.getLayerCanvases();
        this._layerBlobs = [];
        let pending = canvases.length;
        if (!pending && this._context) this._context.notifyChange();
        // @ts-ignore
        canvases.forEach((c, i) => {
            // @ts-ignore
            c.toBlob((blob) => {
                if (blob) this._layerBlobs[i] = blob;
                if (--pending <= 0 && this._context) this._context.notifyChange();
            });
        });
    }

    getValue() {
        return this.currentType() === 'upload'
            ? this._uploads.slice()
            : this._layerBlobs.filter(Boolean);
    }
}
customElements.define('aihub-expose-image-batch', AIHubExposeImageBatchComponent);

/** Shared single-file upload expose (frame / video / audio / latent). */
class FileUploadExposeBase extends AIHubExposeBase {
    /** @returns {string} the accept attribute for the file input. */
    acceptType() { return '*/*'; }
    render() {
        const d = this._expose.data;
        this.root.innerHTML = `
            <style>${this.baseStyle()}</style>
            <div class="field" title="${this.escapeAttr(d.tooltip)}">
                <label>${this.escapeText(d.label || d.id)}${d.optional ? ' (optional)' : ''}</label>
                <input type="file" accept="${this.acceptType()}" />
            </div>
        `;
        const input = /** @type {HTMLInputElement} */ (this.root.querySelector('input'));
        input.addEventListener('change', () => {
            this._value = input.files && input.files[0] ? input.files[0] : null;
            if (this._context) this._context.notifyChange();
        });
    }
    getValue() { return this._value ?? null; }
}

/** Frame expose (video related) treated as an image upload. */
export class AIHubExposeFrameComponent extends FileUploadExposeBase {
    acceptType() { return 'image/*'; }
}
customElements.define('aihub-expose-frame', AIHubExposeFrameComponent);

/** Video upload expose. */
export class AIHubExposeVideoComponent extends FileUploadExposeBase {
    acceptType() { return 'video/*'; }
}
customElements.define('aihub-expose-video', AIHubExposeVideoComponent);

/** Audio upload expose. */
export class AIHubExposeAudioComponent extends FileUploadExposeBase {
    acceptType() { return 'audio/*'; }
}
customElements.define('aihub-expose-audio', AIHubExposeAudioComponent);

/** Latent upload expose. */
export class AIHubExposeLatentComponent extends FileUploadExposeBase {
    acceptType() { return '*/*'; }
}
customElements.define('aihub-expose-latent', AIHubExposeLatentComponent);
