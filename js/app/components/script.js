import { playCancelSound, playConfirmSound, playHoverSound, playPauseSound, setTempSoundDisable } from '../sound.js';
import './scripting/script-info.js';

class ScriptOverlay extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });

        this.currentScriptId = "";
        this.currentScriptNamespace = "";
    }

    async connectedCallback() {
        this.currentScriptId = this.getAttribute("script-id") || "";
        this.currentScriptNamespace = this.getAttribute("script-namespace") || "";

        if (!this.currentScriptId || !this.currentScriptNamespace) {
            await this.createNewFile();
        }

        if (!this.currentScriptId || !this.currentScriptNamespace) {
            this.dispatchEvent(new CustomEvent('close'));
            return;
        }

        this.render();

        // @ts-expect-error
        this.root.querySelector("app-overlay").addEventListener('cancel', () => {
            playCancelSound();
            setTempSoundDisable();
            this.remove();
        });
    }

    async createNewFile() {
        const lastNamespace = localStorage.getItem('lastScriptNamespace') || '';

        return new Promise((resolve) => {
            const dialog = document.createElement('app-dialog');
            dialog.setAttribute('dialog-title', 'Create New Script');
            dialog.setAttribute('confirmation', 'true');
            dialog.setAttribute('confirm-text', 'Create');
            dialog.setAttribute('cancel-text', 'Cancel');
            dialog.innerHTML = `
                <app-overlay-input
                    label="Script Name"
                    input-placeholder="e.g. my-script"
                    input-data-location="name"
                ></app-overlay-input>
                <app-overlay-input
                    label="Namespace"
                    input-placeholder="e.g. my-scripts"
                    input-data-location="namespace"
                    ${lastNamespace ? `value="${lastNamespace}"` : ''}
                ></app-overlay-input>
            `;

            const nameInput = dialog.querySelector('app-overlay-input[input-data-location="name"]');
            const namespaceInput = dialog.querySelector('app-overlay-input[input-data-location="namespace"]');

            if (lastNamespace && namespaceInput) {
                namespaceInput.setAttribute('value', lastNamespace);
            }

            dialog.addEventListener('confirm', async () => {
                // @ts-ignore
                const name = nameInput?.getValue?.() || '';
                // @ts-ignore
                const namespace = namespaceInput?.getValue?.() || '';

                if (!name || !namespace) {
                    return;
                }

                try {
                    await window.API.newScriptFile(namespace, name, "//@placeholder\n\nengine.exports = {}");
                    await window.JS_ENGINE_RECREATE();
                    localStorage.setItem('lastScriptNamespace', namespace);
                    this.currentScriptId = name;
                    this.currentScriptNamespace = namespace;
                    playConfirmSound();
                } catch (err) {
                    console.error('Failed to create script file:', err);
                    dialog.style.display = 'none';
                    const errorDialog = document.createElement('app-dialog');
                    errorDialog.setAttribute('dialog-title', 'Error');
                    // @ts-ignore
                    errorDialog.textContent = err.message || 'Failed to create script file.';
                    document.body.appendChild(errorDialog);
                    const closeError = () => {
                        document.body.removeChild(errorDialog);
                        dialog.style.display = '';
                    };
                    errorDialog.addEventListener('cancel', closeError);
                    errorDialog.addEventListener('confirm', closeError);
                    return;
                }

                document.body.removeChild(dialog);
                // @ts-ignore
                resolve();
            });

            dialog.addEventListener('cancel', () => {
                document.body.removeChild(dialog);
                playCancelSound();
                // @ts-ignore
                resolve();
            });

            document.body.appendChild(dialog);
        });
    }

    render() {
        this.root.innerHTML = `
            <style>
                @import "./components/script.css";
            </style>
            <app-overlay
                overlay-title="Script: ${(this.currentScriptNamespace.replace("@", "(System|ReadOnly) ") + " / " + this.currentScriptId).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}"
                cancel-text="Go Back"
            >
                <div class="internal-content-area">
                    <app-script-info
                        script-id="${this.currentScriptId.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}"
                        script-namespace="${this.currentScriptNamespace.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}"
                    ></app-script-info>
                </div>
            </app-overlay>
        `;
    }
}

customElements.define('app-script', ScriptOverlay);