import { AIHubExposeBase } from './base.js';

/** Shared dropdown renderer sourced from the info list (samplers / schedulers). */
class ListSelectExposeBase extends AIHubExposeBase {
    /** @returns {string[]} the available options. */
    options() { return []; }
    render() {
        const d = this._expose.data;
        const options = this.options();
        const current = this._value ?? d.value;
        this.root.innerHTML = `
            <style>${this.baseStyle()}</style>
            <div class="field" title="${this.escapeAttr(d.tooltip)}">
                <label>${this.escapeText(d.label || d.id)}</label>
                <select>
                    ${options.map((opt) => `
                        <option value="${this.escapeAttr(opt)}" ${opt === current ? 'selected' : ''}>
                            ${this.escapeText(opt)}
                        </option>`).join('')}
                </select>
            </div>
        `;
        const select = /** @type {HTMLSelectElement} */ (this.root.querySelector('select'));
        select.addEventListener('change', () => this.setValue(select.value));
    }
}

/** Sampler dropdown, sourced from the info list samplers. */
export class AIHubExposeSamplerComponent extends ListSelectExposeBase {
    options() { return this._context?.infoList?.samplers || []; }
}
customElements.define('aihub-expose-sampler', AIHubExposeSamplerComponent);

/** Scheduler dropdown, sourced from the info list schedulers. */
export class AIHubExposeSchedulerComponent extends ListSelectExposeBase {
    options() { return this._context?.infoList?.schedulers || []; }
}
customElements.define('aihub-expose-scheduler', AIHubExposeSchedulerComponent);

/** Scheduler dropdown with per-expose blacklist / extra additions. */
export class AIHubExposeExtendableSchedulerComponent extends ListSelectExposeBase {
    options() {
        const d = this._expose.data;
        const base = d.blacklist_all ? [] : (this._context?.infoList?.schedulers || []);
        const blacklist = new Set(String(d.blacklist || '').split('\n').filter((s) => s.length));
        const extras = String(d.extras || '').split('\n').filter((s) => s.length);
        const result = base.filter((s) => !blacklist.has(s));
        for (const extra of extras) if (!result.includes(extra)) result.push(extra);
        return result;
    }
}
customElements.define('aihub-expose-extendable-scheduler', AIHubExposeExtendableSchedulerComponent);

/**
 * Full model selector: a model dropdown (filtered by family / group) plus an
 * "add lora" flow. Each added lora shows its preview image, name and a 0..1
 * strength slider. The model preview image is shown when available.
 *
 * The persisted / returned value is an object describing the model choice:
 * `{ model, loras, loras_strengths }` (loras / strengths are comma separated).
 */
export class AIHubExposeModelComponent extends AIHubExposeBase {
    constructor() {
        super();
        /** @type {{ model: string, loras: Array<{ file: string, strength: number }> }} */
        this._state = { model: '', loras: [] };
    }

    /** @returns {import("../../../../engine/diffusion/adapter-aihub.js").AIHubModel[]} */
    availableModels() {
        const d = this._expose.data;
        const models = this._context?.infoList?.models || [];
        return models.filter((m) =>
            (!d.limit_to_family || m.family === d.limit_to_family) &&
            (!d.limit_to_group || m.group === d.limit_to_group));
    }
    /** @returns {import("../../../../engine/diffusion/adapter-aihub.js").AIHubLora[]} */
    availableLoras() {
        return this._context?.infoList?.loras || [];
    }

    /**
     * Find a model by its file name.
     * @param {string} file
     * @returns {import("../../../../engine/diffusion/adapter-aihub.js").AIHubModel | undefined}
     */
    modelByFile(file) {
        return (this._context?.infoList?.models || []).find((m) => m.file === file);
    }

    /**
     * Find a lora by its file name.
     * @param {string} file
     * @returns {import("../../../../engine/diffusion/adapter-aihub.js").AIHubLora | undefined}
     */
    loraByFile(file) {
        return (this._context?.infoList?.loras || []).find((l) => l.file === file);
    }

    /**
     * Loras compatible with the currently selected model. A lora is compatible
     * when its family / group / model limits are empty or match the model.
     * @returns {import("../../../../engine/diffusion/adapter-aihub.js").AIHubLora[]}
     */
    compatibleLoras() {
        const model = this.modelByFile(this._state.model);
        return this.availableLoras().filter((l) => {
            if (!model) return true;
            if (l.limit_to_family && l.limit_to_family !== model.family) return false;
            if (l.limit_to_group && l.limit_to_group !== model.group) return false;
            if (l.limit_to_model && l.limit_to_model !== model.file && l.limit_to_model !== model.id) return false;
            return true;
        });
    }

    /** @returns {string|null} the URL of the selected model's preview image. */
    modelImageURL() {
        const adapter = this._context?.adapter;
        const model = this.modelByFile(this._state.model);
        if (!adapter || !model) return null;
        return adapter.getImageURLForModelId(model.id);
    }

    /**
     * @param {string} file
     * @returns {string|null} the URL of a lora's preview image.
     */
    loraImageURL(file) {
        const adapter = this._context?.adapter;
        const lora = this.loraByFile(file);
        if (!adapter || !lora) return null;
        return adapter.getImageURLForLoraId(lora.id);
    }

    defaultValue() {
        const d = this._expose.data;
        return {
            model: d.model || '',
            loras: d.loras || '',
            loras_strengths: d.loras_strengths || '',
        };
    }
    /** @returns {boolean} whether lora selection is exposed to the user. */
    disableLoras() { return !!this._expose.data.disable_loras_selection; }
    /** @returns {boolean} whether model selection is exposed to the user. */
    disableModelSelect() { return !!this._expose.data.disable_model_selection; }

    /**
     * Parse the persisted value into an internal working state:
     * `{ model, loras: [{ file, strength }] }`.
     */
    _readState() {
        const value = this._value || this.defaultValue();
        const files = String(value.loras || '').split(',').filter((s) => s.length);
        const strengths = String(value.loras_strengths || '').split(',');
        this._state = {
            model: value.model || '',
            loras: files.map((file, i) => ({
                file,
                strength: this._clampStrength(parseFloat(strengths[i])),
            })),
        };
    }

    /**
     * @param {number} n
     * @returns {number} strength clamped to 0..1 (defaults to 1).
     */
    _clampStrength(n) {
        if (Number.isNaN(n)) return 1;
        return Math.max(0, Math.min(1, n));
    }

    /** Remove any selected loras that are not compatible with the model. */
    _pruneIncompatibleLoras() {
        const compatible = new Set(this.compatibleLoras().map((l) => l.file));
        this._state.loras = this._state.loras.filter((l) => compatible.has(l.file));
    }

    render() {
        this._readState();
        const d = this._expose.data;
        const models = this.availableModels();
        const modelImg = this.modelImageURL();

        this.root.innerHTML = `
            <style>
                ${this.baseStyle()}
                .model-image, .lora-image {
                    display: none; border-radius: 0.5vh;
                    border: 0.15vh solid rgba(150,80,220,0.5);
                    object-fit: cover; background: rgba(20,0,35,0.85);
                }
                .model-image { width: 100%; max-height: 22vh; margin-top: 0.6vh; }
                .lora-image { width: 5vh; height: 5vh; flex: 0 0 auto; }
                .lora-card {
                    display: flex; align-items: center; gap: 0.8vh;
                    padding: 0.8vh; margin-top: 0.6vh; border-radius: 0.7vh;
                    background: rgba(40,0,70,0.5);
                    border: 0.15vh solid rgba(150,80,220,0.4);
                }
                .lora-card .lora-body { flex: 1 1 auto; min-width: 0; }
                .lora-card .lora-name {
                    font-size: 1.5vh; color: #e7d5ff; overflow: hidden;
                    text-overflow: ellipsis; white-space: nowrap;
                }
                .lora-card .strength-row { display: flex; align-items: center; gap: 0.6vh; }
                .lora-card .strength-row input[type="range"] { flex: 1 1 auto; }
                .lora-card .strength-val {
                    font-size: 1.4vh; color: #c9a7ff; min-width: 4vh; text-align: right;
                }
                .lora-remove {
                    flex: 0 0 auto; cursor: pointer; color: #ff9d9d;
                    font-size: 1.9vh; padding: 0 0.5vh; user-select: none;
                }
                .lora-remove:hover { color: #ff5b5b; }
                .add-lora-row { display: flex; gap: 0.6vh; margin-top: 0.8vh; }
                .add-lora-row select { flex: 1 1 auto; }
                .subtitle { font-size: 1.5vh; color: #c9a7ff; margin-top: 1vh; }
            </style>
            <div class="field" title="${this.escapeAttr(d.tooltip)}">
                <label>${this.escapeText(d.label || d.id)}</label>
                ${this.disableModelSelect()
                ? `<div class="tooltip">${this.escapeText(this._state.model || '(fixed model)')}</div>`
                : `<select class="model-select">
                        ${models.map((m) => `
                            <option value="${this.escapeAttr(m.file)}" ${m.file === this._state.model ? 'selected' : ''}>
                                ${this.escapeText(m.name)}
                            </option>`).join('')}
                    </select>`}
                <img class="model-image" alt="" ${modelImg ? `src="${this.escapeAttr(modelImg)}"` : ''} />
                ${this.disableLoras() ? '' : `
                    <div class="subtitle">Loras</div>
                    <div class="loras-list"></div>
                    <div class="add-lora-row">
                        <select class="add-lora-select"></select>
                        <div class="btn add-lora-btn">+ Add</div>
                    </div>`}
            </div>
        `;

        const modelImageEl = /** @type {HTMLImageElement|null} */ (this.root.querySelector('.model-image'));
        if (modelImageEl && modelImg) {
            modelImageEl.onload = () => { modelImageEl.style.display = 'block'; };
            modelImageEl.onerror = () => { modelImageEl.style.display = 'none'; };
        }

        const modelSelect = /** @type {HTMLSelectElement|null} */ (this.root.querySelector('.model-select'));
        modelSelect?.addEventListener('change', () => {
            this._state.model = modelSelect.value;
            this._pruneIncompatibleLoras();
            this._commit();
            this.render();
        });

        if (!this.disableLoras()) {
            this._renderLoras();
            const addBtn = /** @type {HTMLElement|null} */ (this.root.querySelector('.add-lora-btn'));
            addBtn?.addEventListener('click', () => {
                const sel = /** @type {HTMLSelectElement|null} */ (this.root.querySelector('.add-lora-select'));
                if (!sel || !sel.value) return;
                const lora = this.loraByFile(sel.value);
                const strength = this._clampStrength(lora?.default_strength ?? 1);
                this._state.loras.push({ file: sel.value, strength });
                this._commit();
                this.render();
            });
        }
    }

    /** Render the added-lora cards and refresh the "add lora" dropdown. */
    _renderLoras() {
        const list = /** @type {HTMLElement|null} */ (this.root.querySelector('.loras-list'));
        const addSelect = /** @type {HTMLSelectElement|null} */ (this.root.querySelector('.add-lora-select'));
        const addBtn = /** @type {HTMLElement|null} */ (this.root.querySelector('.add-lora-btn'));
        if (!list || !addSelect) return;

        const selectedFiles = new Set(this._state.loras.map((l) => l.file));

        // Selected lora cards.
        list.innerHTML = '';
        for (const entry of this._state.loras) {
            const lora = this.loraByFile(entry.file);
            const imgURL = this.loraImageURL(entry.file);
            const card = document.createElement('div');
            card.className = 'lora-card';
            card.setAttribute('data-lora', entry.file);
            card.innerHTML = `
                <img class="lora-image" alt="" ${imgURL ? `src="${this.escapeAttr(imgURL)}"` : ''} />
                <div class="lora-body">
                    <div class="lora-name">${this.escapeText(lora?.name || entry.file)}</div>
                    <div class="strength-row">
                        <input type="range" class="lora-strength" min="0" max="1" step="0.01" value="${entry.strength}" />
                        <span class="strength-val">${entry.strength.toFixed(2)}</span>
                    </div>
                </div>
                <span class="lora-remove" title="Remove">&times;</span>
            `;
            const imgEl = /** @type {HTMLImageElement|null} */ (card.querySelector('.lora-image'));
            if (imgEl && imgURL) {
                imgEl.onload = () => { imgEl.style.display = 'block'; };
                imgEl.onerror = () => { imgEl.style.display = 'none'; };
            }
            const slider = /** @type {HTMLInputElement} */ (card.querySelector('.lora-strength'));
            const valEl = /** @type {HTMLElement} */ (card.querySelector('.strength-val'));
            slider.addEventListener('input', () => {
                entry.strength = this._clampStrength(parseFloat(slider.value));
                valEl.textContent = entry.strength.toFixed(2);
                this._commit();
            });
            const removeEl = /** @type {HTMLElement} */ (card.querySelector('.lora-remove'));
            removeEl.addEventListener('click', () => {
                this._state.loras = this._state.loras.filter((l) => l.file !== entry.file);
                this._commit();
                this.render();
            });
            list.appendChild(card);
        }

        // Loras available to add (compatible and not already selected).
        const addable = this.compatibleLoras().filter((l) => !selectedFiles.has(l.file));
        addSelect.innerHTML = addable.length
            ? addable.map((l) => `<option value="${this.escapeAttr(l.file)}">${this.escapeText(l.name)}</option>`).join('')
            : '<option value="">No compatible loras</option>';
        addSelect.disabled = addable.length === 0;
        if (addBtn) {
            /** @type {HTMLElement} */ (addBtn).style.opacity = addable.length ? '' : '0.45';
            /** @type {HTMLElement} */ (addBtn).style.pointerEvents = addable.length ? '' : 'none';
        }
    }

    /** Serialize the internal state back into the persisted / returned value. */
    _commit() {
        this.setValue({
            model: this._state.model,
            loras: this._state.loras.map((l) => l.file).join(','),
            loras_strengths: this._state.loras.map((l) => l.strength).join(','),
        });
    }

    getValue() {
        const model = this.modelByFile(this._state.model);
        return {
            model: this._state.model,
            is_diffusion_model: model?.is_diffusion_model ?? false,
            diffusion_model_weight_dtype: model?.diffusion_model_weight_dtype ?? "default",
            optional_vae: model?.vae_file ?? '',
            optional_clip: model?.clip_file ?? '',
            optional_clip_type: model?.clip_type ?? '',
            loras: this._state.loras.map((l) => l.file).join(','),
            loras_strengths: this._state.loras.map((l) => l.strength).join(','),
            loras_use_loader_model_only: this._state.loras.map((l) => {
                const lora = this.loraByFile(l.file);
                return lora?.use_loader_model_only ? 't' : 'f';
            }).join(','),
        };
    }
}
customElements.define('aihub-expose-model', AIHubExposeModelComponent);


/** Simplified model selector (model dropdown only). */
export class AIHubExposeModelSimpleComponent extends AIHubExposeModelComponent {
}
customElements.define('aihub-expose-model-simple', AIHubExposeModelSimpleComponent);
