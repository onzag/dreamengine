import { playConfirmSound } from "../../sound.js";

class ScriptInfo extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });

        /** @type {string} */
        this.scriptId = "";
        /** @type {string} */
        this.scriptNamespace = "";
        /** @type {Record<string, { id: string, namespace: string, description: string, type: string, exposeProperties: object, exposeCharacters: object, metadata?: Record<string, any> }> | null} */
        this.infoMap = null;
    }

    connectedCallback() {
        this.scriptId = this.getAttribute("script-id") || "";
        this.scriptNamespace = this.getAttribute("script-namespace") || "";
        this.renderLoading();
        this.refresh(true);
    }

    /**
     * @param {boolean} initial 
     */
    async refresh(initial) {
        try {
            if (!initial) {
                // If this is a refresh (not the initial load), we want to update the JS engine
                // so that any changes to the script file are reflected in the info we fetch.
                await window.JS_ENGINE_UPDATE(
                    this.scriptNamespace,
                    this.scriptId,
                );
            }
            this.infoMap = await window.ENGINE_WORKER_CLIENT.jsEngineGetInfoMapForScripts({
                scripts: [{ namespace: this.scriptNamespace, id: this.scriptId }]
            });
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
                    <app-overlay-button id="refresh-btn" aria-key="r">Refresh</app-overlay-button>
                    <app-overlay-button id="view-btn" aria-key="v">View Source</app-overlay-button>
                    ${isReadOnly || window.API.mode === "web" ? '' : '<app-overlay-button id="open-btn" aria-key="e">Edit File</app-overlay-button>'}
                    ${isReadOnly ? '' : '<app-overlay-button play-sound-on-click="false" id="delete-btn" aria-key="d">Delete File</app-overlay-button>'}
                    ${isReadOnly ? '' : '<app-overlay-button play-sound-on-click="false" id="move-btn" aria-key="m">Move/Rename File</app-overlay-button>'}
                </div>
                ${info ? `
                    <div class="section" data-de-aria-text="true" tabindex="0">
                        <div class="label">ID</div>
                        <div class="value">${this.#esc(info.id)}</div>
                    </div>
                    <div class="section" data-de-aria-text="true" tabindex="0">
                        <div class="label">Namespace</div>
                        <div class="value">${this.#esc(info.namespace.replace("@", "(System) "))}</div>
                    </div>
                    <div class="section" data-de-aria-text="true" tabindex="0">
                        <div class="label">Type</div>
                        <div class="value">${this.#esc(info.type)}</div>
                    </div>
                    <div class="section" data-de-aria-text="true" tabindex="0">
                        <div class="label">Description</div>
                        <div class="value">${this.#esc(info.description)}</div>
                    </div>
                    ${Object.keys(info.exposeProperties).length > 0 ? `
                        <div class="section">
                            <div class="label" data-de-aria-text="true" tabindex="0">Exposed Properties</div>
                            <div class="props-list">
                                ${Object.entries(info.exposeProperties).map(([name, prop]) => `
                                    <div class="prop-item" data-de-aria-text="true" tabindex="0">
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
                            <div class="label" data-de-aria-text="true" tabindex="0">Exposed Characters</div>
                            <div class="props-list">
                                ${Object.entries(info.exposeCharacters).map(([name, char]) => `
                                    <div class="props-item" data-de-aria-text="true" tabindex="0">
                                        <span class="prop-name">${this.#esc(name)}</span>
                                        ${/** @type {any} */ (char).description ? `<span class="prop-desc">${this.#esc(/** @type {any} */(char).description)}</span>` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    ${dependencies.length > 0 ? `
                        <div class="section">
                            <div class="label" data-de-aria-text="true" tabindex="0">Dependencies (${dependencies.length})</div>
                            <div class="deps-list">
                                ${dependencies.map(dep => `
                                    <div class="dep-item" data-de-aria-text="true" tabindex="0">${this.#esc(dep.namespace.replace("@", "(System) "))}/${this.#esc(dep.id)}</div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                ` : `
                    <div class="section">
                        <div class="value none" data-de-aria-text="true" tabindex="0">No info available for this script.</div>
                    </div>
                `}
            </div>
        `;

        this.root.getElementById('refresh-btn')?.addEventListener('button-click', () => {
            this.renderLoading();
            this.refresh(false);
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

        this.root.getElementById('delete-btn')?.addEventListener('button-click', () => {
            this.#confirmAndDelete();
        });

        this.root.getElementById('move-btn')?.addEventListener('button-click', () => {
            this.#promptAndMove();
        });
    }

    /**
     * Prompt the user for confirmation and then delete the underlying script file.
     * On success, dispatches `close` on the enclosing overlay host (app-script /
     * app-character / app-world) and removes it so the parent list refreshes.
     */
    #confirmAndDelete() {
        const key = `${this.scriptNamespace}/${this.scriptId}`;
        const info = this.infoMap?.[key];
        const type = info?.type || 'script';

        const dialog = document.createElement('app-dialog');
        dialog.setAttribute('dialog-title', 'Delete Script');
        dialog.setAttribute('confirmation', 'true');
        dialog.setAttribute('confirm-text', 'Delete');
        dialog.setAttribute('cancel-text', 'Cancel');
        dialog.innerHTML = `
            <p>Are you sure you want to permanently delete
            <strong>${this.#esc(this.scriptNamespace)}/${this.#esc(this.scriptId)}</strong>?</p>
            <br>
            <p>This will remove the underlying file from disk.
            Any ${this.#esc(type)} or other scripts that depend on it may stop working.</p>
            <br>
            <p>This action cannot be undone.</p>
        `;

        const onCancel = () => {
            document.body.removeChild(dialog);
        };

        const onConfirm = async () => {
            // Prevent double-clicks while the deletion is in flight.
            dialog.removeEventListener('confirm', onConfirm);
            dialog.removeEventListener('cancel', onCancel);
            try {
                await window.API.deleteScriptFile(this.scriptNamespace, this.scriptId);
                await window.JS_ENGINE_UPDATE(this.scriptNamespace, this.scriptId, {deleted: true});
            } catch (err) {
                console.error('Failed to delete script file:', err);
                document.body.removeChild(dialog);
                const errorDialog = document.createElement('app-dialog');
                errorDialog.setAttribute('dialog-title', 'Error');
                // @ts-ignore
                errorDialog.textContent = (err && err.message) || 'Failed to delete script file.';
                const closeError = () => document.body.removeChild(errorDialog);
                errorDialog.addEventListener('cancel', closeError);
                errorDialog.addEventListener('confirm', closeError);
                document.body.appendChild(errorDialog);
                return;
            }

            document.body.removeChild(dialog);
            playConfirmSound();

            // Close the enclosing overlay (app-script / app-character / app-world)
            // so the parent list view can reload and reflect the deletion.
            const root = this.getRootNode();
            // @ts-ignore - ShadowRoot exposes `host`
            const host = root && root.host ? root.host : null;
            if (host) {
                host.dispatchEvent(new CustomEvent('close'));
                host.remove();
            }
        };

        dialog.addEventListener('confirm', onConfirm);
        dialog.addEventListener('cancel', onCancel);

        document.body.appendChild(dialog);
    }

    /**
     * Show a dialog letting the user pick a new namespace and id for the script,
     * then call `moveScriptFile`. On success, close the enclosing overlay so the
     * parent list reloads at the new location.
     */
    #promptAndMove() {
        const dialog = document.createElement('app-dialog');
        dialog.setAttribute('dialog-title', 'Move / Rename Script');
        dialog.setAttribute('confirmation', 'true');
        dialog.setAttribute('confirm-text', 'Move');
        dialog.setAttribute('cancel-text', 'Cancel');
        dialog.innerHTML = `
            <p>Choose a new namespace and id for
            <strong>${this.#esc(this.scriptNamespace)}/${this.#esc(this.scriptId)}</strong>.</p>
            <br>
            <p>Namespaces and ids cannot start with "@" (reserved for system scripts).
            Anything that imports this script by its old path will break.</p>
            <br>
            <app-overlay-input
                label="New Namespace"
                input-placeholder="e.g. my-scripts"
                id="new-namespace-input"
                input-default-value="${this.#esc(this.scriptNamespace)}"
            ></app-overlay-input>
            <app-overlay-input
                label="New Script Name"
                input-placeholder="e.g. my-script"
                id="new-name-input"
                input-default-value="${this.#esc(this.scriptId)}"
            ></app-overlay-input>
            <div class="error-msg" style="color:#FF6B6B; margin-top:1vh; min-height:2.5vh;"></div>
        `;

        const namespaceInput = dialog.querySelector('app-overlay-input#new-namespace-input');
        const nameInput = dialog.querySelector('app-overlay-input#new-name-input');

        const showError = (/** @type {string} */ msg) => {
            const el = dialog.querySelector('.error-msg');
            if (el) el.textContent = msg;
        };

        const onCancel = () => {
            document.body.removeChild(dialog);
        };

        const onConfirm = async () => {
            // @ts-ignore
            const newNamespace = (namespaceInput?.getValue?.() || '').trim();
            // @ts-ignore
            const newId = (nameInput?.getValue?.() || '').trim();

            if (!newNamespace || !newId) {
                showError('Namespace and name are required.');
                return;
            }
            if (newNamespace.startsWith('@') || newId.startsWith('@')) {
                showError('Namespace and name cannot start with "@".');
                return;
            }
            // Disallow path separators / weird characters that would break on disk.
            if (/[\\\/]/.test(newNamespace) || /[\\\/]/.test(newId)) {
                showError('Namespace and name cannot contain slashes.');
                return;
            }
            if (newNamespace === this.scriptNamespace && newId === this.scriptId) {
                showError('New location is the same as the current one.');
                return;
            }

            // Prevent double-clicks while in flight.
            dialog.removeEventListener('confirm', onConfirm);
            dialog.removeEventListener('cancel', onCancel);

            try {
                await window.API.moveScriptFile(this.scriptNamespace, this.scriptId, newNamespace, newId);
                await window.JS_ENGINE_UPDATE(
                    this.scriptNamespace,
                    this.scriptId,
                    { moved: { newNamespace, newId } }
                );
            } catch (err) {
                console.error('Failed to move script file:', err);
                // Re-arm listeners so the user can correct and retry.
                dialog.addEventListener('confirm', onConfirm);
                dialog.addEventListener('cancel', onCancel);
                // @ts-ignore
                showError((err && err.message) || 'Failed to move script file.');
                return;
            }

            document.body.removeChild(dialog);
            playConfirmSound();

            // Close the enclosing overlay so the parent list view can reload
            // and reflect the move. The user can reopen at the new location.
            const root = this.getRootNode();
            // @ts-ignore - ShadowRoot exposes `host`
            const host = root && root.host ? root.host : null;
            if (host) {
                host.dispatchEvent(new CustomEvent('close'));
                host.remove();
            }
        };

        dialog.addEventListener('confirm', onConfirm);
        dialog.addEventListener('cancel', onCancel);

        document.body.appendChild(dialog);
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
