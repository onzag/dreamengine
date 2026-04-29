class ScriptInfo extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });

        /** @type {string} */
        this.scriptId = "";
        /** @type {string} */
        this.scriptNamespace = "";
        /** @type {Record<string, { id: string, namespace: string, description: string, type: string, exposeProperties: object, exposeCharacters: object }> | null} */
        this.infoMap = null;
    }

    connectedCallback() {
        this.scriptId = this.getAttribute("script-id") || "";
        this.scriptNamespace = this.getAttribute("script-namespace") || "";
        this.renderLoading();
        this.refresh();
    }

    async refresh() {
        try {
            await window.JS_ENGINE_RECREATE();
            this.infoMap = await window.ENGINE_WORKER_CLIENT.jsEngineGetInfoMapForScripts({
                scripts: [{ namespace: this.scriptNamespace, id: this.scriptId }]
            });
            console.log(this.infoMap);
        } catch (err) {
            console.error("Failed to fetch script info:", err);
            this.infoMap = null;
        }
        this.render();
    }

    renderLoading() {
        this.root.innerHTML = `
            <style>${ScriptInfo.styles}</style>
            <div class="script-info">Loading...</div>
        `;
    }

    render() {
        const key = `${this.scriptNamespace}/${this.scriptId}`;
        const info = this.infoMap?.[key];

        const isSystemScript = this.scriptNamespace.startsWith("@");
        const isReadOnly = isSystemScript;

        // Everything in the map that isn't the target script is a dependency
        const dependencies = this.infoMap
            ? Object.values(this.infoMap).filter(entry => `${entry.namespace}/${entry.id}` !== key)
            : [];

        this.root.innerHTML = `
            <style>${ScriptInfo.styles}</style>
            <div class="script-info">
                <div class="toolbar">
                    <app-overlay-button id="refresh-btn">Refresh</app-overlay-button>
                    <app-overlay-button id="view-btn">View Source</app-overlay-button>
                    ${isReadOnly || window.API.mode === "web" ? '' : '<app-overlay-button id="open-btn">Edit File</app-overlay-button>'}
                </div>
                ${info ? `
                    <div class="section">
                        <div class="label">ID</div>
                        <div class="value">${this.#esc(info.id)}</div>
                    </div>
                    <div class="section">
                        <div class="label">Namespace</div>
                        <div class="value">${this.#esc(info.namespace.replace("@", "(System) "))}</div>
                    </div>
                    <div class="section">
                        <div class="label">Type</div>
                        <div class="value">${this.#esc(info.type)}</div>
                    </div>
                    <div class="section">
                        <div class="label">Description</div>
                        <div class="value">${this.#esc(info.description)}</div>
                    </div>
                    ${Object.keys(info.exposeProperties).length > 0 ? `
                        <div class="section">
                            <div class="label">Exposed Properties</div>
                            <div class="props-list">
                                ${Object.entries(info.exposeProperties).map(([name, prop]) => `
                                    <div class="prop-item">
                                        <span class="prop-name">${this.#esc(name)}</span>
                                        <span class="prop-type">${this.#esc(/** @type {any} */(prop).type)}</span>
                                        <span class="prop-location">${this.#esc(/** @type {any} */(prop).propertyLocation)}</span>
                                        ${/** @type {any} */ (prop).description ? `<span class="prop-desc">${this.#esc(/** @type {any} */(prop).description)}</span>` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    ${Object.keys(info.exposeCharacters).length > 0 ? `
                        <div class="section">
                            <div class="label">Exposed Characters</div>
                            <div class="props-list">
                                ${Object.entries(info.exposeCharacters).map(([name, char]) => `
                                    <div class="props-item">
                                        <span class="prop-name">${this.#esc(name)}</span>
                                        ${/** @type {any} */ (char).description ? `<span class="prop-desc">${this.#esc(/** @type {any} */(char).description)}</span>` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    ${dependencies.length > 0 ? `
                        <div class="section">
                            <div class="label">Dependencies (${dependencies.length})</div>
                            <div class="deps-list">
                                ${dependencies.map(dep => `
                                    <div class="dep-item">${this.#esc(dep.namespace.replace("@", "(System) "))}/${this.#esc(dep.id)}</div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                ` : `
                    <div class="section">
                        <div class="value none">No info available for this script.</div>
                    </div>
                `}
            </div>
        `;

        this.root.getElementById('refresh-btn')?.addEventListener('button-click', () => {
            this.renderLoading();
            this.refresh();
        });


        this.root.getElementById('open-btn')?.addEventListener('button-click', async () => {
            const isSystem = this.scriptNamespace.startsWith('@');
            const basePath = isSystem
                ? window.DREAMENGINE_DEFAULT_SCRIPTS_HOME
                : window.DREAMENGINE_HOME + "/scripts";
            const filePath = basePath + "/" + this.scriptNamespace + "/" + this.scriptId + ".js";

            try {
                const editorCmd = await this.#pickEditor();
                if (!editorCmd) return; // user cancelled

                await window.API.openInEditor(filePath, editorCmd);
            } catch (err) {
                console.error('Failed to open in editor:', err);
            }
        });

        this.root.getElementById('view-btn')?.addEventListener('button-click', async () => {
            try {
                const { srcUrl } = await window.ENGINE_WORKER_CLIENT.getScriptSourceURL({ namespace: this.scriptNamespace, id: this.scriptId });
                await window.API.viewSource(srcUrl);
            } catch (err) {
                console.error('Failed to view source:', err);
            }
        });
    }

    /**
     * @param {string} str
     * @returns {string}
     */
    #esc(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * Show a dialog to pick a preferred code editor. Detects installed editors.
     * @returns {Promise<string|null>} The chosen editor command, or null if cancelled.
     */
    async #pickEditor() {
        const editors = await window.API.detectEditors();

        return new Promise((resolve) => {
            const dialog = document.createElement('app-dialog');
            dialog.setAttribute('dialog-title', 'Choose Code Editor');
            dialog.setAttribute('confirmation', 'true');
            dialog.setAttribute('confirm-text', 'Use Selected');
            dialog.setAttribute('cancel-text', 'Cancel');

            const optionsJson = JSON.stringify(editors.map(e => e.name));

            dialog.innerHTML = `
                <app-overlay-select
                    label="Editor"
                    input-options='${optionsJson.replace(/'/g, "&#39;")}'
                    input-data-location="editor"
                    input-default-value="${this.#esc(editors[0]?.name || 'System Default')}"
                ></app-overlay-select>
            `;

            dialog.addEventListener('confirm', async () => {
                // @ts-ignore
                const select = dialog.querySelector('app-overlay-select');
                // @ts-ignore
                const selectedName = select?.getValue?.() || '';
                const selected = editors.find(e => e.name === selectedName);
                const cmd = selected?.cmd || '__system__';

                document.body.removeChild(dialog);
                resolve(cmd);
            });

            dialog.addEventListener('cancel', () => {
                document.body.removeChild(dialog);
                resolve(null);
            });

            document.body.appendChild(dialog);
        });
    }

    static get styles() {
        return /* css */`
            .script-info {
                display: flex;
                flex-direction: column;
                gap: 4vh;
            }

            .toolbar {
                display: flex;
                gap: 4vh;
            }

            .section {
                display: flex;
                flex-direction: column;
                gap: 0.5vh;
            }

            .label {
                font-size: 3.5vh;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                color: rgba(255, 255, 255, 0.5);
            }

            .value {
                font-size: 4vh;
                color: #fff;
            }

            .none {
                color: #FF6B6B;
            }

            .props-list, .deps-list {
                display: flex;
                flex-direction: column;
                gap: 1vh;
                padding-left: 2vh;
            }

            .prop-item {
                display: flex;
                gap: 1.5vh;
                align-items: center;
                flex-wrap: wrap;
            }

            .prop-name {
                font-size: 3vh;
                font-weight: bold;
                color: #fff;
            }

            .prop-type {
                font-size: 2.5vh;
                color: rgba(255, 200, 100, 0.8);
                background: rgba(255, 200, 100, 0.1);
                padding: 0.2vh 1vh;
                border-radius: 0.5vh;
            }

            .prop-location {
                font-size: 3vh;
                color: rgba(100, 200, 255, 0.8);
                background: rgba(100, 200, 255, 0.1);
                padding: 0.2vh 1vh;
                border-radius: 0.5vh;
            }

            .prop-desc {
                font-size: 2.5vh;
                color: rgba(255, 255, 255, 0.6);
                width: 100%;
            }

            .dep-item {
                font-size: 3vh;
                color: rgba(255, 255, 255, 0.8);
                padding: 0.5vh 0;
            }
        `;
    }
}

customElements.define('app-script-info', ScriptInfo);
