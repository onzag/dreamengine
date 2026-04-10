import { playCancelSound, playConfirmSound, playHoverSound, playPauseSound, setTempSoundDisable } from '../sound.js';

class CharacterOverlay extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });

        this.currentCharacterId = "";
        this.currentCharacterNamespace = "";
        this.currentSectionIndex = 0;
    }

    async connectedCallback() {
        this.currentCharacterId = this.getAttribute("character-id") || "";
        this.currentCharacterNamespace = this.getAttribute("character-namespace") || "";

        if (!this.currentCharacterId || !this.currentCharacterNamespace) {
            await this.createNewFile();
        }

        if (!this.currentCharacterId || !this.currentCharacterNamespace) {
            // User cancelled character creation, close the overlay
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

        // @ts-expect-error
        this.root.querySelector("app-overlay").addEventListener('confirm', () => {
            // Here you would typically gather any changes made in the UI and save them back to the script file
            // For this example, we'll just close the overlay
            playConfirmSound();
            setTempSoundDisable();
            this.remove();
        });

        this.renderSection();

        // @ts-expect-error
        this.root.querySelector('app-overlay-tabs').addEventListener('tab-change', (e) => {
            // @ts-ignore
            this.currentSectionIndex = e.detail.newIndex;
            this.renderSection();
        });
    }

    async createNewFile() {
        const lastNamespace = localStorage.getItem('lastCharacterNamespace') || '';

        return new Promise((resolve) => {
            const dialog = document.createElement('app-dialog');
            dialog.setAttribute('dialog-title', 'Create New Character Script');
            dialog.setAttribute('confirmation', 'true');
            dialog.setAttribute('confirm-text', 'Create');
            dialog.setAttribute('cancel-text', 'Cancel');
            dialog.innerHTML = `
                <app-overlay-input
                    label="Character Name"
                    input-placeholder="e.g. my-character"
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
                    await window.API.newScriptFile(namespace, name, "//@placeholder\n\nengine.exports = {type: \"characters\"}");
                    document.dispatchEvent(new CustomEvent("jsEngineRecreate"));
                    localStorage.setItem('lastCharacterNamespace', namespace);
                    this.currentCharacterId = name;
                    this.currentCharacterNamespace = namespace;
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

    renderSection() {
        const tabsContainer = this.root.querySelector('app-overlay-tabs');
        if (!tabsContainer) return;

        if (this.currentSectionIndex === 0) {
            tabsContainer.innerHTML = `<app-overlay-section section-title="Configure">
            </app-overlay-section>`;
        } else if (this.currentSectionIndex === 1) {
            tabsContainer.innerHTML = `<app-overlay-section section-title="Script Info">
                <app-script-info
                    script-id="${this.currentCharacterId.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}"
                    script-namespace="${this.currentCharacterNamespace.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}"
                ></app-script-info>
            </app-overlay-section>`;
        }
    }

    render() {
        this.root.innerHTML = `
            <style>
                @import "./components/character.css";
            </style>
            <app-overlay
                overlay-title="Working on: ${(this.currentCharacterNamespace.replace("@", "(System|ReadOnly) ") + " / " + this.currentCharacterId).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}"
                confirm-text="Apply Changes"
                cancel-text="Go Back"
            >
                <app-overlay-tabs current="${this.currentSectionIndex}" sections='["Configure", "Script Info"]'>
                </app-overlay-tabs>
            </app-overlay>
        `;
    }
}

customElements.define('app-character', CharacterOverlay);