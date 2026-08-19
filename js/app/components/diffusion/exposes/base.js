/**
 * Shared context handed to every expose component by the AIHubCustomSelector.
 *
 * @typedef {Object} AIHubExposeContext
 * @property {import("../../../../engine/diffusion/adapter-aihub.js").AiHubInfoList} infoList
 * @property {(import("../../../../engine/diffusion/adapter-aihub.js").DiffusionAdapterAIHub | null)} adapter - diffusion adapter, used for asset URLs
 * @property {() => (import("../image-edit.js").ImageEdit | any)} getCanvas - accessor to the owning image editor
 * @property {(id: string) => any} getExposeValueById - read the current value of a sibling expose (for dynamic bounds)
 * @property {string} workflowId - the id of the currently selected workflow
 * @property {(key: string) => any} loadSaved - read a persisted value (scoped to the workflow)
 * @property {(key: string, value: any) => void} saveValue - persist a value (scoped to the workflow)
 * @property {() => void} notifyChange - notify the selector that a value changed
 */

/**
 * Base class for all AIHub expose components. Provides the shadow root,
 * configuration plumbing, persistence helpers and a shared style sheet.
 *
 * Sub-classes implement {@link render} and optionally override
 * {@link getValue}, {@link defaultValue} and {@link onImageChanged}.
 */
export class AIHubExposeBase extends HTMLElement {
    constructor() {
        super();
        /** @type {ShadowRoot} */
        this.root = this.attachShadow({ mode: 'open' });
        /** @type {any} */
        this._expose = null;
        /** @type {AIHubExposeContext | null} */
        this._context = null;
        /** @type {any} */
        this._value = undefined;
    }

    /**
     * override this method to handle file uploads. The default implementation does nothing.
     * @returns {Promise<void>}
     */
    async uploadFile() {

    }

    /**
     * Configure the component with its expose definition and shared context.
     * @param {any} expose
     * @param {AIHubExposeContext} context
     * @returns {this}
     */
    configure(expose, context) {
        this._expose = expose;
        this._context = context;
        const saved = context.loadSaved(expose.data.id);
        this._value = saved !== undefined ? saved : this.defaultValue();
        this.render();
        return this;
    }

    /**
     * The value to use when nothing has been persisted yet.
     * @returns {any}
     */
    defaultValue() {
        return this._expose?.data?.value;
    }

    /**
     * The current value of this expose. Overridden by exposes that compute
     * their value (seed, image, model, ...).
     * @returns {any}
     */
    getValue() {
        return this._value;
    }

    /**
     * Store a new value, persist it and notify the selector.
     * @param {any} value
     */
    setValue(value) {
        this._value = value;
        if (this._context && this._expose) {
            this._context.saveValue(this._expose.data.id, value);
            this._context.notifyChange();
        }
    }

    /** Render the component UI. Overridden by sub-classes. */
    render() { }

    /** Hook invoked (debounced) when the canvas image changes. */
    onImageChanged() { }

    /**
     * Resolve a numeric bound that can be driven by another expose's value.
     * @param {number} base
     * @param {string} exposeId
     * @param {number} offset
     * @returns {number}
     */
    resolveBound(base, exposeId, offset) {
        if (exposeId && this._context) {
            const other = Number(this._context.getExposeValueById(exposeId));
            if (!Number.isNaN(other)) return other + (offset || 0);
        }
        return base;
    }

    /**
     * Escape a string for safe use inside an HTML attribute.
     * @param {any} s
     * @returns {string}
     */
    escapeAttr(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    /**
     * Escape a string for safe use as HTML text content.
     * @param {any} s
     * @returns {string}
     */
    escapeText(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    /**
     * Shared style sheet used by every expose UI.
     * @returns {string}
     */
    baseStyle() {
        return `
            :host { display: block; margin-bottom: 1.2vh; }
            .field { display: flex; flex-direction: column; gap: 0.5vh; }
            label { font-size: 1.6vh; color: #c9a7ff; }
            .tooltip { font-size: 1.3vh; color: #a98fd0; }
            input[type="text"], input[type="number"], textarea, select {
                width: 100%; box-sizing: border-box;
                background: rgba(20,0,35,0.85); color: #fff;
                border: 0.15vh solid rgba(150,80,220,0.5);
                border-radius: 0.5vh; padding: 0.6vh; font-size: 1.5vh;
                font-family: sans-serif;
            }
            input[type="range"] { width: 100%; accent-color: #8a2be2; }
            input[type="checkbox"] { accent-color: #8a2be2; width: 1.8vh; height: 1.8vh; }
            input[type="file"] { font-size: 1.3vh; color: #ddd; }
            .row { display: flex; gap: 0.7vh; align-items: center; }
            .grow { flex: 1 1 auto; }
            .preview {
                max-width: 100%; margin-top: 0.5vh;
                border: 0.15vh solid rgba(150,80,220,0.5);
                border-radius: 0.5vh; image-rendering: pixelated; background:
                    repeating-conic-gradient(#2b2b2b 0% 25%, #3a3a3a 0% 50%) 50% / 2vh 2vh;
            }
            .btn {
                padding: 0.6vh 1vh; font-size: 1.4vh; text-align: center;
                border-radius: 0.6vh; cursor: pointer; color: #fff;
                background: rgba(80,0,140,0.6);
                border: 0.15vh solid rgba(150,80,220,0.5); user-select: none;
            }
            .btn:hover { background: rgba(110,0,190,0.8); }
            .list { display: flex; flex-direction: column; gap: 0.5vh; }
        `;
    }
}
