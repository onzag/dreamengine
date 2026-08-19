import { AIHUB_EXPOSE_TAGS } from './exposes/index.js';

const STORAGE_PREFIX = 'aihub-custom-selector:';

/**
 * Wrapper component that consumes an AIHub info list, lets the user pick a
 * category + workflow (limited to a given context / project-type), renders one
 * expose component per workflow expose, and exposes a combined {@link getValue}.
 *
 * It also bridges the owning image editor: image-based exposes are refreshed
 * (debounced by the editor) whenever the canvas changes.
 */
export class AIHubCustomSelector extends HTMLElement {
    constructor() {
        super();
        /** @type {ShadowRoot} */
        this.root = this.attachShadow({ mode: 'open' });
        /** @type {import("../../../engine/diffusion/adapter-aihub.js").AiHubInfoList | null} */
        this._infoList = null;
        /** @type {any} the owning image editor */
        this._canvas = null;
        /** @type {import("../../../engine/diffusion/adapter-aihub.js").DiffusionAdapterAIHub | null} */
        this._adapter = null;
        /** @type {{ context: string, projectType: (string|null) }} */
        this._limit = { context: 'image', projectType: null };
        /** @type {import("./exposes/base.js").AIHubExposeBase[]} */
        this._exposeComponents = [];
        this._selectedCategory = '';
        this._selectedWorkflowId = '';
        this._onCanvasImageChanged = this._onCanvasImageChanged.bind(this);
    }

    /**
     * @param {{
     *   infoList: import("../../../engine/diffusion/adapter-aihub.js").AiHubInfoList,
     *   canvas: any,
     *   adapter?: import("../../../engine/diffusion/adapter-aihub.js").DiffusionAdapterAIHub,
     *   limit?: { context: string, projectType?: (string|null) }
     * }} options
     */
    configure({ infoList, canvas, adapter, limit }) {
        if (this._canvas && typeof this._canvas.removeImageChangeListener === 'function') {
            this._canvas.removeImageChangeListener(this._onCanvasImageChanged);
        }
        this._infoList = infoList;
        this._canvas = canvas;
        if (adapter) this._adapter = adapter;
        if (limit) this._limit = { context: limit.context, projectType: limit.projectType ?? null };
        if (canvas && typeof canvas.addImageChangeListener === 'function') {
            canvas.addImageChangeListener(this._onCanvasImageChanged);
        }
        this._restoreSelection();
        this._build();
    }

    /** @returns {import("../../../engine/diffusion/adapter-aihub.js").AIHubWorkflow[]} */
    _workflows() {
        const workflows = this._infoList?.workflows || {};
        return Object.values(workflows).filter((w) =>
            !w.project_type &&
            w.context === this._limit.context);
    }

    /** @returns {string[]} */
    _categories() {
        const set = new Set();
        for (const w of this._workflows()) set.add(w.category || 'General');
        return [...set];
    }

    /** @returns {import("../../../engine/diffusion/adapter-aihub.js").AIHubWorkflow[]} */
    _workflowsInCategory() {
        return this._workflows().filter((w) => (w.category || 'General') === this._selectedCategory);
    }

    /** @returns {import("../../../engine/diffusion/adapter-aihub.js").AIHubWorkflow | null} */
    _selectedWorkflow() {
        return this._workflows().find((w) => w.id === this._selectedWorkflowId) || null;
    }

    _restoreSelection() {
        try {
            this._selectedCategory = localStorage.getItem(STORAGE_PREFIX + 'category') || '';
            this._selectedWorkflowId = localStorage.getItem(STORAGE_PREFIX + 'workflow') || '';
        } catch { /* ignore */ }

        const categories = this._categories();
        if (!categories.includes(this._selectedCategory)) {
            this._selectedCategory = categories[0] || '';
        }
        const inCategory = this._workflowsInCategory();
        if (!inCategory.some((w) => w.id === this._selectedWorkflowId)) {
            this._selectedWorkflowId = inCategory[0]?.id || '';
        }
    }

    _persistSelection() {
        try {
            localStorage.setItem(STORAGE_PREFIX + 'category', this._selectedCategory);
            localStorage.setItem(STORAGE_PREFIX + 'workflow', this._selectedWorkflowId);
        } catch { /* ignore */ }
    }

    _build() {
        const categories = this._categories();
        const workflows = this._workflowsInCategory();
        this.root.innerHTML = `
            <style>
                :host { display: block; }
                .section-title { font-size: 2vh; font-weight: bold; color: #d9b8ff; margin-bottom: 0.5vh; }
                .field { display: flex; flex-direction: column; gap: 0.5vh; margin-bottom: 1vh; }
                label { font-size: 1.6vh; color: #c9a7ff; }
                select {
                    width: 100%; box-sizing: border-box;
                    background: rgba(20,0,35,0.85); color: #fff;
                    border: 0.15vh solid rgba(150,80,220,0.5);
                    border-radius: 0.5vh; padding: 0.6vh; font-size: 1.5vh;
                }
                .empty { font-size: 1.4vh; color: #a98fd0; }
                .advanced-toggle {
                    font-size: 1.4vh; color: #d9b8ff; cursor: pointer; user-select: none;
                    margin: 0.8vh 0; display: inline-block;
                }
                .advanced-body { display: none; border-top: 0.15vh solid rgba(150,80,220,0.3); padding-top: 1vh; }
                .advanced-body.open { display: block; }
                .workflow-image {
                    display: none; width: 100%; box-sizing: border-box;
                    border-radius: 0.5vh; margin-bottom: 1vh;
                    border: 0.15vh solid rgba(150,80,220,0.5);
                }
            </style>
            <div class="section-title">Workflow</div>
            ${categories.length ? `
                <div class="field">
                    <label>Category</label>
                    <select class="category-select">
                        ${categories.map((c) => `
                            <option value="${c}" ${c === this._selectedCategory ? 'selected' : ''}>${c}</option>`).join('')}
                    </select>
                </div>
                <div class="field">
                    <label>Workflow</label>
                    <select class="workflow-select">
                        ${workflows.map((w) => `
                            <option value="${w.id}" ${w.id === this._selectedWorkflowId ? 'selected' : ''}>
                                ${w.label || w.id}
                            </option>`).join('')}
                    </select>
                </div>
                <img class="workflow-image" alt="" />
                <div class="exposes"></div>
                <span class="advanced-toggle" style="display:none;">&#9662; Show advanced</span>
                <div class="advanced-body"></div>
            ` : `<div class="empty">No workflows available for this context.</div>`}
        `;

        const categorySelect = /** @type {HTMLSelectElement|null} */ (this.root.querySelector('.category-select'));
        const workflowSelect = /** @type {HTMLSelectElement|null} */ (this.root.querySelector('.workflow-select'));
        categorySelect?.addEventListener('change', () => {
            this._selectedCategory = categorySelect.value;
            const first = this._workflowsInCategory()[0];
            this._selectedWorkflowId = first ? first.id : '';
            this._persistSelection();
            this._build();
        });
        workflowSelect?.addEventListener('change', () => {
            this._selectedWorkflowId = workflowSelect.value;
            this._persistSelection();
            this._renderExposes();
        });

        const toggle = /** @type {HTMLElement|null} */ (this.root.querySelector('.advanced-toggle'));
        toggle?.addEventListener('click', () => {
            const body = /** @type {HTMLElement} */ (this.root.querySelector('.advanced-body'));
            const open = body.classList.toggle('open');
            toggle.innerHTML = (open ? '&#9652; Hide advanced' : '&#9662; Show advanced');
        });

        this._renderExposes();
    }

    _renderExposes() {
        const normal = /** @type {HTMLElement|null} */ (this.root.querySelector('.exposes'));
        const advanced = /** @type {HTMLElement|null} */ (this.root.querySelector('.advanced-body'));
        const toggle = /** @type {HTMLElement|null} */ (this.root.querySelector('.advanced-toggle'));
        if (!normal || !advanced) return;
        normal.innerHTML = '';
        advanced.innerHTML = '';
        this._exposeComponents = [];

        const workflow = this._selectedWorkflow();
        if (!workflow) return;

        this._loadWorkflowImage(workflow);

        const context = this._makeContext(workflow);
        const exposes = [...Object.values(workflow.expose || {})].sort(
            // @ts-ignore
            (a, b) => (b.data?.index || 0) - (a.data?.index || 0));

        let hasAdvanced = false;
        for (const expose of exposes) {
            const tag = AIHUB_EXPOSE_TAGS[expose.type];
            if (!tag) continue;
            const el = /** @type {any} */ (document.createElement(tag));
            el.configure(expose, context);
            this._exposeComponents.push(el);
            // @ts-ignore
            if (expose.data?.advanced) {
                advanced.appendChild(el);
                hasAdvanced = true;
            } else {
                normal.appendChild(el);
            }
        }
        if (toggle) toggle.style.display = hasAdvanced ? 'inline-block' : 'none';

        // Populate any image exposes from the current canvas state.
        this._onCanvasImageChanged();
    }

    /**
     * Load the workflow's preview image (workflowId + ".png"). The image may
     * not exist (e.g. 404), in which case the element stays hidden.
     * @param {import("../../../engine/diffusion/adapter-aihub.js").AIHubWorkflow} workflow
     */
    _loadWorkflowImage(workflow) {
        const img = /** @type {HTMLImageElement|null} */ (this.root.querySelector('.workflow-image'));
        if (!img || !this._adapter) return;
        img.style.display = 'none';
        img.onload = () => { img.style.display = 'block'; };
        img.onerror = () => { img.style.display = 'none'; };
        img.src = this._adapter.getImageURLForWorkflowId(workflow.id);
    }

    /**
     * @param {import("../../../engine/diffusion/adapter-aihub.js").AIHubWorkflow} workflow
     * @returns {import("./exposes/base.js").AIHubExposeContext}
     */
    _makeContext(workflow) {
        const self = this;
        const scope = STORAGE_PREFIX + 'wf:' + workflow.id + ':';
        return {
            // @ts-ignore infoList is set before exposes render
            infoList: this._infoList,
            workflowId: workflow.id,
            adapter: this._adapter,
            getCanvas: () => self._canvas,
            getExposeValueById: (id) => {
                const c = self._exposeComponents.find((comp) => comp._expose?.data?.id === id);
                return c ? c.getValue() : undefined;
            },
            loadSaved: (key) => {
                try {
                    const raw = localStorage.getItem(scope + key);
                    return raw === null ? undefined : JSON.parse(raw);
                } catch { return undefined; }
            },
            saveValue: (key, value) => {
                try { localStorage.setItem(scope + key, JSON.stringify(value)); } catch { /* not serializable */ }
            },
            notifyChange: () => self._emitChange(),
        };
    }

    _onCanvasImageChanged() {
        for (const c of this._exposeComponents) {
            if (typeof c.onImageChanged === 'function') c.onImageChanged();
        }
    }

    _emitChange() {
        this.dispatchEvent(new CustomEvent('change', { detail: this.getValue() }));
    }

    /**
     * The combined, best-guess value of the current selection. The consumer is
     * expected to further shape this into a request.
     * @returns {{ category: string, workflowId: (string|null), values: Record<string, any> }}
     */
    getValue() {
        const workflow = this._selectedWorkflow();
        /** @type {Record<string, any>} */
        const values = {};
        for (const c of this._exposeComponents) {
            if (c._expose?.data?.id) values[c._expose.data.id] = c.getValue();
        }
        return {
            category: this._selectedCategory,
            workflowId: workflow ? workflow.id : null,
            values,
        };
    }

    async uploadAllFiles() {
        // Do it in order as it matters due to the header and then the binary upload needing to be sequential.
        for (const c of this._exposeComponents) {
            if (typeof c.uploadFile === 'function') {
                await c.uploadFile();
            }
        }
    }

    disconnectedCallback() {
        if (this._canvas && typeof this._canvas.removeImageChangeListener === 'function') {
            this._canvas.removeImageChangeListener(this._onCanvasImageChanged);
        }
    }
}
customElements.define('aihub-custom-selector', AIHubCustomSelector);
