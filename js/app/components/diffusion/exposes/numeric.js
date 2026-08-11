import { AIHubExposeBase } from './base.js';

/** Shared number-input renderer for integer / float style exposes. */
class NumberExposeBase extends AIHubExposeBase {
    /** @returns {boolean} whether the value should be parsed as a float. */
    isFloat() { return false; }
    /** @returns {boolean} whether to also render a slider. */
    hasSlider() { return false; }
    /** @returns {number} the minimum allowed value. */
    minValue() {
        const d = this._expose.data;
        return this.resolveBound(d.min, d.min_expose_id, d.min_expose_offset);
    }
    /** @returns {number} the maximum allowed value. */
    maxValue() {
        const d = this._expose.data;
        return this.resolveBound(d.max, d.max_expose_id, d.max_expose_offset);
    }
    /** @returns {number} the step size. */
    stepValue() { return this._expose.data.step ?? (this.isFloat() ? 0.01 : 1); }

    render() {
        const d = this._expose.data;
        const min = this.minValue();
        const max = this.maxValue();
        const step = this.stepValue();
        const hasMin = typeof min === 'number' && !Number.isNaN(min);
        const hasMax = typeof max === 'number' && !Number.isNaN(max);
        this.root.innerHTML = `
            <style>${this.baseStyle()}</style>
            <div class="field" title="${this.escapeAttr(d.tooltip)}">
                <label>${this.escapeText(d.label || d.id)}</label>
                <div class="row">
                    <input class="grow" type="number" value="${this._value ?? 0}"
                        ${hasMin ? `min="${min}"` : ''} ${hasMax ? `max="${max}"` : ''} step="${step}" />
                </div>
                ${this.hasSlider() && hasMin && hasMax
                ? `<input type="range" value="${this._value ?? 0}" min="${min}" max="${max}" step="${step}" />`
                : ''}
            </div>
        `;
        const number = /** @type {HTMLInputElement} */ (this.root.querySelector('input[type="number"]'));
        const range = /** @type {HTMLInputElement|null} */ (this.root.querySelector('input[type="range"]'));
        /**
         * 
         * @param {string} v 
         * @returns {number}
         */
        const parse = (v) => this.isFloat() ? parseFloat(v) : parseInt(v, 10);
        /**
         * 
         * @param {number} v 
         * @returns {number}
         */
        const clamp = (v) => {
            if (hasMin && v < min) v = min;
            if (hasMax && v > max) v = max;
            return v;
        };
        number.addEventListener('input', () => {
            let v = clamp(parse(number.value));
            if (Number.isNaN(v)) v = hasMin ? min : 0;
            this.setValue(v);
            if (range) range.value = String(v);
        });
        if (range) {
            range.addEventListener('input', () => {
                const v = parse(range.value);
                number.value = String(v);
                this.setValue(v);
            });
        }
    }
}

/** Integer number input. */
export class AIHubExposeIntegerComponent extends NumberExposeBase { }
customElements.define('aihub-expose-integer', AIHubExposeIntegerComponent);

/** Float number input, optionally with a slider. */
export class AIHubExposeFloatComponent extends NumberExposeBase {
    isFloat() { return true; }
    hasSlider() { return !!this._expose.data.slider; }
}
customElements.define('aihub-expose-float', AIHubExposeFloatComponent);

/** CFG number input (float, non-negative, driven by the selected model's default). */
export class AIHubExposeCfgComponent extends NumberExposeBase {
    isFloat() { return true; }
    minValue() { return 0; }
    maxValue() { return NaN; }
    stepValue() { return 0.01; }
}
customElements.define('aihub-expose-cfg', AIHubExposeCfgComponent);

/** Steps number input (integer, driven by the selected model's default). */
export class AIHubExposeStepsComponent extends NumberExposeBase {
    minValue() { return 1; }
    maxValue() { return NaN; }
    stepValue() { return 1; }
}
customElements.define('aihub-expose-steps', AIHubExposeStepsComponent);

/** Checkbox boolean input. */
export class AIHubExposeBooleanComponent extends AIHubExposeBase {
    defaultValue() { return !!this._expose.data.value; }
    render() {
        const d = this._expose.data;
        this.root.innerHTML = `
            <style>${this.baseStyle()}</style>
            <div class="field" title="${this.escapeAttr(d.tooltip)}">
                <label class="row">
                    <input type="checkbox" ${this._value ? 'checked' : ''} />
                    <span>${this.escapeText(d.label || d.id)}</span>
                </label>
            </div>
        `;
        const box = /** @type {HTMLInputElement} */ (this.root.querySelector('input'));
        box.addEventListener('change', () => this.setValue(box.checked));
    }
}
customElements.define('aihub-expose-boolean', AIHubExposeBooleanComponent);

/**
 * Seed input: a random / fixed selector plus a number input when fixed.
 * The persisted value is `{ mode, seed }`; getValue() resolves to an integer.
 */
export class AIHubExposeSeedComponent extends AIHubExposeBase {
    defaultValue() { return { mode: 'random', seed: this._expose.data.value ?? 0 }; }
    render() {
        const d = this._expose.data;
        const state = this._value || this.defaultValue();
        this.root.innerHTML = `
            <style>${this.baseStyle()}</style>
            <div class="field" title="${this.escapeAttr(d.tooltip)}">
                <label>${this.escapeText(d.label || d.id)}</label>
                <div class="row">
                    <select>
                        <option value="random" ${state.mode === 'random' ? 'selected' : ''}>Random</option>
                        <option value="fixed" ${state.mode === 'fixed' ? 'selected' : ''}>Fixed</option>
                    </select>
                    <input class="grow" type="number" step="1" min="0" value="${state.seed ?? 0}"
                        style="${state.mode === 'fixed' ? '' : 'display:none;'}" />
                </div>
            </div>
        `;
        const select = /** @type {HTMLSelectElement} */ (this.root.querySelector('select'));
        const input = /** @type {HTMLInputElement} */ (this.root.querySelector('input[type="number"]'));
        const update = () => {
            input.style.display = select.value === 'fixed' ? '' : 'none';
            this.setValue({ mode: select.value, seed: parseInt(input.value, 10) || 0 });
        };
        select.addEventListener('change', update);
        input.addEventListener('input', update);
    }
    getValue() {
        const state = this._value || this.defaultValue();
        if (state.mode === 'random') return Math.floor(Math.random() * 0xffffffff);
        return state.seed ?? 0;
    }
}
customElements.define('aihub-expose-seed', AIHubExposeSeedComponent);
