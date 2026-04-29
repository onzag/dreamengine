import { createCardStructureFrom, isCardTypeFile } from '../../cardtype/base.js';
import { playCancelSound, playConfirmSound, playHoverSound, playPauseSound, setTempSoundDisable } from '../sound.js';

/**
 * 
 * @param {string} str 
 * @returns 
 */
function escapeHTML(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

class WorldOverlay extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });

        this.currentWorldId = "";
        this.currentWorldNamespace = "";
        this.currentSectionIndex = 0;
    }

    async connectedCallback() {
        this.currentWorldId = this.getAttribute("world-id") || "";
        this.currentWorldNamespace = this.getAttribute("world-namespace") || "";

        if (!this.currentWorldId || !this.currentWorldNamespace) {
            await this.createNewFile();
        }

        if (!this.currentWorldId || !this.currentWorldNamespace) {
            // User cancelled world creation, close the overlay
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
        this.root.querySelector("app-overlay").addEventListener('confirm', async () => {
            playConfirmSound();
            setTempSoundDisable();

            try {
                await this.saveProfileImage();
            } finally {
                this.dispatchEvent(new CustomEvent('close'));
                this.remove();
            }
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
        const lastNamespace = localStorage.getItem('lastWorldNamespace') || '';

        return new Promise((resolve) => {
            const dialog = document.createElement('app-dialog');
            dialog.setAttribute('dialog-title', 'Create New World Script');
            dialog.setAttribute('confirmation', 'true');
            dialog.setAttribute('confirm-text', 'Create');
            dialog.setAttribute('cancel-text', 'Cancel');
            dialog.innerHTML = `
                <app-overlay-input
                    label="World Name"
                    input-placeholder="e.g. my-world"
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
                    await window.API.newScriptFile(namespace, name, "//@placeholder\n\nengine.exports = {type: \"world\"}");
                    localStorage.setItem('lastWorldNamespace', namespace);
                    this.currentWorldId = name;
                    this.currentWorldNamespace = namespace;
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

    async saveProfileImage() {
        const tabsContainer = this.root.querySelector('app-overlay-tabs');
        if (!tabsContainer) return;
        const profileImage = tabsContainer.querySelector('app-profile-image');
        if (!profileImage) return;
        // @ts-ignore
        if (typeof profileImage.saveValueToUserData === 'function') {
            try {
                // @ts-ignore
                await profileImage.saveValueToUserData();
            } catch (err) {
                console.error('Failed to save character image:', err);
            }
        }
    }

    async renderSection() {
        const tabsContainer = this.root.querySelector('app-overlay-tabs');
        if (!tabsContainer) return;

        const isSystemNamespace = this.currentWorldNamespace.startsWith('@');
        const worldImageUrl = `assets/${this.currentWorldNamespace}/${this.currentWorldId}/image`;

        if (this.currentSectionIndex === 0) {
            const scriptSource = await window.ENGINE_WORKER_CLIENT.getRawScriptSource({ namespace: this.currentWorldNamespace, id: this.currentWorldId });

            const isNewFile = scriptSource.src.startsWith("//@placeholder");
            const isCardType = isCardTypeFile(scriptSource.src);

            const infoMap = await window.ENGINE_WORKER_CLIENT.jsEngineGetInfoMap();
            const thisFileInfo = infoMap[this.currentWorldNamespace + "/" + this.currentWorldId];

            let worldBuilderContent = '';

            if (isNewFile || isCardType) {
                worldBuilderContent = `<app-overlay-section section-title="World Builder">
                    <p>
                        The World Builder lets you define the locations, factions, lore and rules that shape your world.
                    </p>
                    <app-overlay-button id="world-builder-btn">Enter World Builder</app-overlay-button>
                </app-overlay-section>`;
            } else {
                worldBuilderContent = `<app-overlay-section section-title="World Builder">
                    <p>
                        This world script was not generated by the World Builder, so it can only be edited manually.
                    </p>
                </app-overlay-section>`;
            }

            const description = thisFileInfo?.description || "No description available";

            tabsContainer.innerHTML = `<app-overlay-section section-title="World Image">
                    <div class="world-image-container-parent">
                        <div class="world-image-container">
                            <app-profile-image world="true" image-url="${escapeHTML(worldImageUrl)}"${isSystemNamespace ? '' : ' editable="true"'}></app-profile-image>
                        </div>
                    </div>
                </app-overlay-section>
                <app-overlay-section section-title="Description">
                    <p>${escapeHTML(description)}</p>
                </app-overlay-section>
                ${worldBuilderContent}`;

            tabsContainer.querySelector('#world-builder-btn')?.addEventListener('button-click', () => {
                const builder = document.createElement('app-world-builder');
                builder.setAttribute('world-namespace', this.currentWorldNamespace);
                builder.setAttribute('world-id', this.currentWorldId);
                builder.addEventListener('builder-closed', () => this.renderSection());
                document.body.appendChild(builder);
            });
        } else if (this.currentSectionIndex === 1) {
            tabsContainer.innerHTML = `<app-overlay-section section-title="Script Info">
                <app-script-info
                    script-id="${this.currentWorldId.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}"
                    script-namespace="${this.currentWorldNamespace.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}"
                ></app-script-info>
            </app-overlay-section>`;
        }
    }

    render() {
        this.root.innerHTML = `
            <style>
                @import "./components/world.css";
            </style>
            <app-overlay
                overlay-title="Working on: ${(this.currentWorldNamespace.replace("@", "(System|ReadOnly) ") + " / " + this.currentWorldId).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}"
                confirm-text="Apply Changes"
                cancel-text="Go Back"
            >
                <app-overlay-tabs current="${this.currentSectionIndex}" sections='["Configure", "Script Info"]'>
                </app-overlay-tabs>
            </app-overlay>
        `;
    }
}

customElements.define('app-world', WorldOverlay);
