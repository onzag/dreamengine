import { createCardStructureFrom, isCardTypeFile } from '../../cardtype/base.js';
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
                    await window.JS_ENGINE_RECREATE();
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

    async renderSection() {
        const tabsContainer = this.root.querySelector('app-overlay-tabs');
        if (!tabsContainer) return;

        if (this.currentSectionIndex === 0) {
            const scriptSource = await window.ENGINE_WORKER_CLIENT.getRawScriptSource({ namespace: this.currentCharacterNamespace, id: this.currentCharacterId });

            const isNewFile = scriptSource.src.startsWith("//@placeholder");
            const isCardType = isCardTypeFile(scriptSource.src);

            let cardtypeWizardContent = '';

            if (isNewFile) {
                cardtypeWizardContent = `<app-overlay-section section-title="CardType Wizard">
                    <p>
                        In DreamEngine characters are not just descriptions, they are highly complex lifetime scripts that have their own internal state.
                    </p>

                    <p>
                        A character script describes how a character behaves, makes friendships, falls in love, stores memories, how they feel about other characters, and much more.
                    </p>

                    <p>
                        Since character scripts can be extremely complex, the best way to create them is to start with a simple base generated by the Wizard, and then modify and expand on it from there.
                    </p>

                    <p>
                        The Guided Wizard will ask you several hundreds of questions about your character (yes, expect to spend some time), and then generate a custom character script based on your answers.
                    </p>

                    <p>
                        The Automatic Wizard will generate a character script based on a simple description of your character. Just enter a few sentences about your character, and the Automatic Wizard will do its best to create a fitting character script.
                    </p>

                    <p>
                        Use the Guided Wizard for main characters that you want to have a lot of control over, and use the Automatic Wizard for side characters or NPCs where you just want a simple character script without too much hassle.
                    </p>

                    <app-overlay-button id="guided-wizard-btn">Guided Wizard</app-overlay-button>
                    <app-overlay-button id="auto-wizard-btn">Automatic Wizard</app-overlay-button>
                </app-overlay-section>`;
            } else if (!isCardType) {
                cardtypeWizardContent = `<app-overlay-section section-title="CardType Wizard">
                    <p>
                        This character script was not generated by the character wizard, so it can only be edited manually.
                    </p>
                </app-overlay-section>`;
            } else {
                const parsedCardType = createCardStructureFrom(scriptSource.src);
                if (parsedCardType.config.guidedWizardInProgress) {
                    cardtypeWizardContent = `<app-overlay-section section-title="CardType Wizard">
                        <p>
                            This character script is in progress of being created by the Guided Wizard.
                        </p>
                        <app-overlay-button id="guided-wizard-btn">Continue Guided Wizard</app-overlay-button>
                    </app-overlay-section>`;
                } else if (parsedCardType.config.automaticWizardInProgress) {
                    cardtypeWizardContent = `<app-overlay-section section-title="CardType Wizard">
                        <p>
                            This character script is in progress of being created by the Automatic Wizard.
                        </p>
                        <app-overlay-button id="auto-wizard-btn">Continue Automatic Wizard</app-overlay-button>
                    </app-overlay-section>`;
                } else if (parsedCardType.config.guidedWizardCompleted || parsedCardType.config.automaticWizardCompleted) {
                    // TODO add more options here, for the states
                    cardtypeWizardContent = `<app-overlay-section section-title="CardType Wizard">
                        <p>
                            This character script was created by the ${parsedCardType.config.guidedWizardCompleted ? 'Guided Wizard' : 'Automatic Wizard'}.
                        </p>
                    </app-overlay-section>`;
                } else {
                    cardtypeWizardContent = `<app-overlay-section section-title="CardType Wizard">
                        <p>
                            This character script was generated by a character wizard uncompatible with the current version, so it can only be edited manually.
                        </p>
                    </app-overlay-section>`;
                }
            }

            tabsContainer.innerHTML = `${cardtypeWizardContent}`;

            tabsContainer.querySelector('#guided-wizard-btn')?.addEventListener('button-click', () => {
                const wizard = document.createElement('app-cardtype-wizard');
                document.body.appendChild(wizard);
            });
            tabsContainer.querySelector('#auto-wizard-btn')?.addEventListener('button-click', () => {
                const wizard = document.createElement('app-cardtype-wizard');
                document.body.appendChild(wizard);
            });
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
                overlay-title="Working on: ${(this.currentCharacterNamespace.replace("@", "(System|ReadOnly) ") + " / " + this.currentCharacterId).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}"
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