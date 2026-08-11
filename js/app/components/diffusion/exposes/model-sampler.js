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
 * optional lora picker with per-lora strengths.
 *
 * The persisted / returned value is an object describing the model choice.
 */
export class AIHubExposeModelComponent extends AIHubExposeBase {
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

    render() {
        const d = this._expose.data;
        const state = this._value || this.defaultValue();
        const models = this.availableModels();
        const loras = this.availableLoras();
        const selectedLoras = new Set(String(state.loras || '').split(',').filter((s) => s.length));
        const strengthList = String(state.loras_strengths || '').split(',');
        const strengthByFile = {};
        // @ts-ignore
        [...selectedLoras].forEach((file, i) => { strengthByFile[file] = strengthList[i]; });

        this.root.innerHTML = `
            <style>${this.baseStyle()}</style>
            <div class="field" title="${this.escapeAttr(d.tooltip)}">
                <label>${this.escapeText(d.label || d.id)}</label>
                ${this.disableModelSelect()
                ? `<div class="tooltip">${this.escapeText(state.model || '(fixed model)')}</div>`
                : `<select class="model-select">
                        ${models.map((m) => `
                            <option value="${this.escapeAttr(m.file)}" ${m.file === state.model ? 'selected' : ''}>
                                ${this.escapeText(m.name)}
                            </option>`).join('')}
                    </select>`}
                ${this.disableLoras() ? '' : `
                    <div class="list" style="margin-top:0.6vh;">
                        ${loras.length ? '' : '<div class="tooltip">No loras available.</div>'}
                        ${loras.map((l) => {
                    const checked = selectedLoras.has(l.file);
                    // @ts-ignore
                    const strength = strengthByFile[l.file] ?? (l.default_strength ?? 1);
                    return `
                            <label class="row" data-lora="${this.escapeAttr(l.file)}">
                                <input type="checkbox" class="lora-check" ${checked ? 'checked' : ''} />
                                <span class="grow">${this.escapeText(l.name)}</span>
                                <input type="number" class="lora-strength" step="0.05" value="${strength}"
                                    style="width:8vh;" />
                            </label>`;
                }).join('')}
                    </div>`}
            </div>
        `;

        const modelSelect = /** @type {HTMLSelectElement|null} */ (this.root.querySelector('.model-select'));
        if (modelSelect) modelSelect.addEventListener('change', () => this._commit());
        this.root.querySelectorAll('.lora-check, .lora-strength').forEach((el) =>
            el.addEventListener('input', () => this._commit()));
    }

    _commit() {
        const modelSelect = /** @type {HTMLSelectElement|null} */ (this.root.querySelector('.model-select'));
        const model = modelSelect ? modelSelect.value : (this._value?.model || this._expose.data.model || '');
        /**
         * @type {string[]}
         */
        const files = [];
        /**
         * @type {string[]}
         */
        const strengths = [];
        this.root.querySelectorAll('label[data-lora]').forEach((label) => {
            const check = /** @type {HTMLInputElement} */ (label.querySelector('.lora-check'));
            const strength = /** @type {HTMLInputElement} */ (label.querySelector('.lora-strength'));
            if (check.checked) {
                // @ts-ignore
                files.push(label.getAttribute('data-lora'));
                strengths.push(strength.value);
            }
        });
        this.setValue({
            model,
            loras: files.join(','),
            loras_strengths: strengths.join(','),
        });
    }
}
customElements.define('aihub-expose-model', AIHubExposeModelComponent);

/** Simplified model selector (model dropdown only). */
export class AIHubExposeModelSimpleComponent extends AIHubExposeModelComponent {
    disableLoras() { return true; }
    disableModelSelect() { return false; }
}
customElements.define('aihub-expose-model-simple', AIHubExposeModelSimpleComponent);
