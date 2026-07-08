/**
 * Collapsible JSON tree viewer for debug overlays.
 *
 * Public API:
 *  - setJSON(value)  Set the data to display. Safe to call before or after connect.
 *
 * Data is never passed as an attribute — always via setJSON() to avoid
 * serialising large objects into the DOM.
 */
class DebugJson extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        this._data = undefined;
        this._ready = false;
    }

    connectedCallback() {
        if (!this._ready) {
            this._init();
            this._ready = true;
        }
        if (this._data !== undefined) this._update();
    }

    /** @param {any} data */
    setJSON(data) {
        this._data = data;
        if (!this._ready && this.isConnected) {
            this._init();
            this._ready = true;
        }
        if (this._ready) this._update();
    }

    _init() {
        const style = document.createElement('style');
        style.textContent = `
            :host {
                display: block;
                font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
                font-size: 1.35vh;
                line-height: 1.65;
            }
            .root {
                overflow: auto;
                max-height: 55vh;
                padding: 0.4vh 0;
                user-select: text;
                -webkit-user-select: text;
            }
            .entry { display: flex; flex-direction: column; }
            .row {
                display: flex;
                align-items: baseline;
                flex-wrap: wrap;
                padding: 0.05vh 0;
                gap: 0;
            }
            .toggle {
                cursor: pointer;
                color: #7c8190;
                width: 1.4ch;
                display: inline-block;
                flex-shrink: 0;
                font-size: 0.75em;
                line-height: 1;
                align-self: center;
            }
            .toggle:hover { color: #cdd6f4; }
            .key { color: #89b4fa; }
            .colon { color: #6c7086; margin: 0 0.35ch; }
            .val-str { color: #a6e3a1; }
            .val-num { color: #fab387; }
            .val-bool { color: #cba6f7; }
            .val-null { color: #6c7086; font-style: italic; }
            .bracket { color: #cdd6f4; cursor: pointer; }
            .bracket:hover { color: #ffffff; }
            .summary { color: #6c7086; font-style: italic; font-size: 0.85em; margin-left: 0.4ch; }
            .children {
                padding-left: 2.4ch;
                border-left: 1px solid rgba(255, 255, 255, 0.07);
                margin-left: 0.7ch;
            }
            .children.hidden { display: none; }
            .closer { padding: 0.05vh 0; }
            .str-preview { color: #a6e3a1; }
            .expand-btn {
                cursor: pointer;
                color: #74c7ec;
                font-size: 0.78em;
                margin-left: 0.6ch;
                opacity: 0.75;
            }
            .expand-btn:hover { opacity: 1; }
            .text-block {
                white-space: pre-wrap;
                word-break: break-word;
                background: rgba(0, 0, 0, 0.28);
                border: 1px solid rgba(255, 255, 255, 0.09);
                border-radius: 0.5vh;
                padding: 0.6vh 0.9vh;
                margin: 0.25vh 0 0.25vh 0;
                color: #a6e3a1;
                font-size: 0.95em;
                overflow: auto;
                max-height: 28vh;
                display: block;
            }
            .text-block.hidden { display: none; }
        `;
        this.root.appendChild(style);
        const wrap = document.createElement('div');
        wrap.className = 'root';
        this.root.appendChild(wrap);
    }

    _update() {
        const wrap = this.root.querySelector('.root');
        if (!wrap) return;
        wrap.innerHTML = '';
        wrap.appendChild(this._node(this._data, null, 0));
    }

    /**
     * @param {any} val
     * @param {string | number | null} key  null = root (no key label)
     * @param {number} depth
     * @returns {HTMLElement}
     */
    _node(val, key, depth) {
        const entry = document.createElement('div');
        entry.className = 'entry';

        const row = document.createElement('div');
        row.className = 'row';
        entry.appendChild(row);

        /**
         * Append the key + colon to a parent element.
         * @param {HTMLElement} parent
         */
        const appendKey = (parent) => {
            if (key === null) return;
            const k = document.createElement('span');
            k.className = 'key';
            k.textContent = typeof key === 'number' ? String(key) : `"${key}"`;
            const colon = document.createElement('span');
            colon.className = 'colon';
            colon.textContent = ':';
            parent.appendChild(k);
            parent.appendChild(colon);
        };

        // ── null / undefined ────────────────────────────────────────
        if (val === null || val === undefined) {
            appendKey(row);
            const v = document.createElement('span');
            v.className = 'val-null';
            v.textContent = val === null ? 'null' : 'undefined';
            row.appendChild(v);
            return entry;
        }

        // ── boolean ─────────────────────────────────────────────────
        if (typeof val === 'boolean') {
            appendKey(row);
            const v = document.createElement('span');
            v.className = 'val-bool';
            v.textContent = String(val);
            row.appendChild(v);
            return entry;
        }

        // ── number ──────────────────────────────────────────────────
        if (typeof val === 'number') {
            appendKey(row);
            const v = document.createElement('span');
            v.className = 'val-num';
            v.textContent = String(val);
            row.appendChild(v);
            return entry;
        }

        // ── string ──────────────────────────────────────────────────
        if (typeof val === 'string') {
            appendKey(row);
            const hasNL = val.includes('\n');
            const isLong = val.length > 100;
            if (!hasNL && !isLong) {
                const v = document.createElement('span');
                v.className = 'val-str';
                v.textContent = `"${val}"`;
                row.appendChild(v);
            } else {
                // Short preview + expand button, full text in a hidden <pre>.
                const firstLine = val.split('\n')[0];
                const preview = document.createElement('span');
                preview.className = 'str-preview';
                preview.textContent = `"${firstLine.slice(0, 60)}${firstLine.length > 60 || hasNL || isLong ? '…' : ''}"`;

                const btn = document.createElement('span');
                btn.className = 'expand-btn';
                btn.textContent = '▶ expand';

                const block = document.createElement('pre');
                block.className = 'text-block hidden';
                block.textContent = val;

                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const nowHidden = block.classList.toggle('hidden');
                    btn.textContent = nowHidden ? '▶ expand' : '▼ collapse';
                });

                row.appendChild(preview);
                row.appendChild(btn);
                entry.appendChild(block);
            }
            return entry;
        }

        // ── object / array ──────────────────────────────────────────
        const isArr = Array.isArray(val);
        const pairs = /** @type {Array<[string | number, any]>} */ (
            isArr ? val.map((v, i) => [i, v]) : Object.entries(val)
        );
        const count = pairs.length;
        const ob = isArr ? '[' : '{';
        const cb = isArr ? ']' : '}';

        // Toggle arrow (always first in the row).
        const toggleEl = document.createElement('span');
        toggleEl.className = 'toggle';
        row.appendChild(toggleEl);

        appendKey(row);

        const obSpan = document.createElement('span');
        obSpan.className = 'bracket';
        obSpan.textContent = ob;
        row.appendChild(obSpan);

        const summary = document.createElement('span');
        summary.className = 'summary';
        row.appendChild(summary);

        const children = document.createElement('div');
        children.className = 'children';
        entry.appendChild(children);

        const closeRow = document.createElement('div');
        closeRow.className = 'closer';
        const cbSpan = document.createElement('span');
        cbSpan.className = 'bracket';
        cbSpan.textContent = cb;
        closeRow.appendChild(cbSpan);
        entry.appendChild(closeRow);

        for (const [k, v] of pairs) {
            children.appendChild(this._node(v, k, depth + 1));
        }

        let open = true;

        const sync = () => {
            toggleEl.textContent = open ? '▼' : '▶';
            children.classList.toggle('hidden', !open);
            closeRow.style.display = open ? '' : 'none';
            summary.textContent = open
                ? (count > 0 ? ` // ${count}` : '')
                : ` ${count} item${count !== 1 ? 's' : ''}…`;
        };

        // Auto-collapse deeply nested or large nodes.
        if (depth >= 2 || count > 20) open = false;
        sync();

        const toggle = () => { open = !open; sync(); };
        toggleEl.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
        obSpan.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });

        return entry;
    }
}

customElements.define('app-debug-json', DebugJson);
