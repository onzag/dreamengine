import { AIHubExposeBase } from './base.js';

/** Renders as a text field (or textarea when multiline). */
export class AIHubExposeStringComponent extends AIHubExposeBase {
    render() {
        const d = this._expose.data;
        this.root.innerHTML = `
            <style>${this.baseStyle()}</style>
            <div class="field" title="${this.escapeAttr(d.tooltip)}">
                <label>${this.escapeText(d.label || d.id)}</label>
                ${d.multiline
                ? `<textarea rows="4">${this.escapeText(this._value ?? '')}</textarea>`
                : `<input type="text" value="${this.escapeAttr(this._value ?? '')}" />`}
            </div>
        `;
        const input = /** @type {HTMLInputElement|HTMLTextAreaElement} */ (
            this.root.querySelector(d.multiline ? 'textarea' : 'input')
        );
        input.addEventListener('input', () => {
            let v = input.value;
            const max = this.resolveBound(d.maxlen, d.maxlen_expose_id, d.maxlen_expose_offset);
            if (typeof max === 'number' && max > 0 && v.length > max) {
                v = v.slice(0, max);
                input.value = v;
            }
            this.setValue(v);
        });
    }
}
customElements.define('aihub-expose-string', AIHubExposeStringComponent);

/** Renders as a dropdown select of strings. */
export class AIHubExposeStringSelectionComponent extends AIHubExposeBase {
    render() {
        const d = this._expose.data;
        const options = String(d.options || '').split('\n').filter((o) => o.length);
        const labels = String(d.options_label || '').split('\n');
        this.root.innerHTML = `
            <style>${this.baseStyle()}</style>
            <div class="field" title="${this.escapeAttr(d.tooltip)}">
                <label>${this.escapeText(d.label || d.id)}</label>
                <select>
                    ${options.map((opt, i) => `
                        <option value="${this.escapeAttr(opt)}" ${opt === this._value ? 'selected' : ''}>
                            ${this.escapeText(labels[i] || opt)}
                        </option>`).join('')}
                </select>
            </div>
        `;
        const select = /** @type {HTMLSelectElement} */ (this.root.querySelector('select'));
        select.addEventListener('change', () => this.setValue(select.value));
    }
}
customElements.define('aihub-expose-string-selection', AIHubExposeStringSelectionComponent);
