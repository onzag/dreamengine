import { isScriptTypeGeneratorFile, parseScriptGeneratorFrom } from '../../script-generation/base.js';
import { setAllAmbiencesVolume, playCancelSound, playConfirmSound, playHoverSound, playPauseSound, restoreAllAmbiencesVolume, setTempSoundDisable } from '../sound.js';
import './profile-image.js';
import './profile-voice.js';
import './wizard/character-overview.js';
import { emotions, emotionsGrouped, emotionsToVoicePromptDescription } from '../../engine/util/emotions.js';

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

class CharacterOverlay extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });

        this.currentCharacterId = "";
        this.currentCharacterNamespace = "";
        this.currentSectionIndex = 0;
    }

    disconnectedCallback() {
        restoreAllAmbiencesVolume();
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
            this.dispatchEvent(new CustomEvent('close'));
            this.remove();
        });

        // @ts-expect-error
        this.root.querySelector("app-overlay").addEventListener('confirm', async () => {
            // Here you would typically gather any changes made in the UI and save them back to the script file
            // For this example, we'll just close the overlay
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
        const lastNamespace = localStorage.getItem('lastCharacterNamespace') || '';

        return new Promise((resolve) => {
            const dialog = document.createElement('app-dialog');
            dialog.setAttribute('dialog-title', 'Create New Character Script');
            dialog.setAttribute('confirmation', 'true');
            dialog.setAttribute('confirm-text', 'Create');
            dialog.setAttribute('cancel-text', 'Cancel');
            dialog.innerHTML = `
                <app-overlay-input
                    id="name-input"
                    label="Character Name"
                    input-placeholder="e.g. my-character"
                    aria-key="n"
                ></app-overlay-input>
                <app-overlay-input
                    id="namespace-input"
                    label="Namespace"
                    input-placeholder="e.g. my-scripts"
                    aria-key="s"
                    ${lastNamespace ? `input-default-value="${lastNamespace}"` : ''}
                ></app-overlay-input>
            `;

            const nameInput = dialog.querySelector('app-overlay-input#name-input');
            const namespaceInput = dialog.querySelector('app-overlay-input#namespace-input');

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
                    await window.JS_ENGINE_UPDATE(namespace, name);
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

    async saveProfileImage() {
        const tabsContainer = this.root.querySelector('app-overlay-tabs');
        if (!tabsContainer) return;
        // Save every editable profile image/voice currently rendered in the
        // active section (the character image as well as per-emotion assets).
        const editables = tabsContainer.querySelectorAll('app-profile-image, app-profile-voice');
        for (const el of editables) {
            // @ts-ignore
            if (typeof el.saveValueToUserData === 'function') {
                try {
                    // @ts-ignore
                    await el.saveValueToUserData();
                } catch (err) {
                    console.error('Failed to save character asset:', err);
                }
            }
        }
    }

    async renderSection() {
        const tabsContainer = this.root.querySelector('app-overlay-tabs');
        if (!tabsContainer) return;

        const scriptSource = await window.ENGINE_WORKER_CLIENT.getRawScriptSource({ namespace: this.currentCharacterNamespace, id: this.currentCharacterId });
        const infoMap = await window.ENGINE_WORKER_CLIENT.jsEngineGetInfoMapForScripts({
            scripts: [
                { namespace: this.currentCharacterNamespace, id: this.currentCharacterId },
            ]
        });
        const thisFileInfo = infoMap[this.currentCharacterNamespace + "/" + this.currentCharacterId];

        const isNewFile = scriptSource.src.startsWith("//@placeholder");
        const isCardType = isScriptTypeGeneratorFile(scriptSource.src);
        const isStandard = isNewFile || isCardType || scriptSource.src.startsWith("//@standard");

        if (this.currentSectionIndex === 0) {
            restoreAllAmbiencesVolume();

            let cardtypeWizardContent = '';

            if (isNewFile) {
                cardtypeWizardContent = `<app-overlay-section section-title="CardType Wizard">
                    <p data-de-aria-text="true" tabindex="0">
                        In DreamEngine characters are not just descriptions, they are highly complex lifetime scripts that have their own internal state.
                    </p>

                    <p data-de-aria-text="true" tabindex="0">
                        A character script describes how a character behaves, makes friendships, falls in love, stores memories, how they feel about other characters, and much more.
                    </p>

                    <p data-de-aria-text="true" tabindex="0">
                        Since character scripts can be extremely complex, the best way to create them is to start with a simple base generated by the Wizard, and then modify and expand on it from there.
                    </p>

                    <p data-de-aria-text="true" tabindex="0">
                        The Guided Wizard will ask you several hundreds of questions about your character (yes, expect to spend some time), and then generate a custom character script based on your answers.
                    </p>

                    <p data-de-aria-text="true" tabindex="0">
                        The Automatic Wizard will generate a character script based on a simple description of your character. Just enter a few sentences about your character, and the Automatic Wizard will do its best to create a fitting character script.
                    </p>

                    <p data-de-aria-text="true" tabindex="0">
                        Use the Guided Wizard for main characters that you want to have a lot of control over, and use the Automatic Wizard for side characters or NPCs where you just want a simple character script without too much hassle.
                    </p>

                    <app-overlay-button id="guided-wizard-btn" aria-key="g">Guided Wizard</app-overlay-button>
                    <app-overlay-button id="auto-wizard-btn" aria-key="a">Automatic Wizard</app-overlay-button>
                </app-overlay-section>`;
            } else if (!isCardType) {
                cardtypeWizardContent = `<app-overlay-section section-title="CardType Wizard">
                    <p>
                        This character script was not generated by the character wizard, so it can only be edited manually.
                    </p>
                </app-overlay-section>`;
            } else {
                try {
                    const parsedCardType = parseScriptGeneratorFrom(scriptSource.src);
                    if (parsedCardType.state.version && parsedCardType.state.version !== 2) {
                        cardtypeWizardContent = `<app-overlay-section section-title="CardType Wizard">
                            <p data-de-aria-text="true" tabindex="0">
                                This character script was generated with version ${parsedCardType.state.version} of the wizard, but you are currently running version 2. There may be incompatibilities that prevent the wizard from working correctly. Please update your character script by copying its content, creating a new character with the latest version of the wizard, and pasting the content into the new character's script.
                            </p>
                        </app-overlay-section>`;
                    } else if (!parsedCardType.state.language || parsedCardType.state.language.split("-")[0] !== window.DREAMENGINE_LANGUAGE.split("-")[0]) {
                        cardtypeWizardContent = `<app-overlay-section section-title="CardType Wizard">
                            <p data-de-aria-text="true" tabindex="0">
                                This character script is in a different language (${parsedCardType.state.language || 'unknown'}) than the engine (${window.DREAMENGINE_LANGUAGE}). The wizard may not function correctly.
                            </p>
                        </app-overlay-section>`;
                    } else if (parsedCardType.state.guidedWizardInProgress) {
                        cardtypeWizardContent = `<app-overlay-section section-title="CardType Wizard">
                            <p data-de-aria-text="true" tabindex="0">
                                This character script is in progress of being created by the Guided Wizard.
                            </p>
                            <app-overlay-button id="guided-wizard-btn" aria-key="g">Continue Guided Wizard</app-overlay-button>
                            <app-overlay-button id="show-overview-btn" aria-key="o" play-sound-on-click="false">Show Overview</app-overlay-button>
                        </app-overlay-section>`;
                    } else if (parsedCardType.state.automaticWizardInProgress) {
                        cardtypeWizardContent = `<app-overlay-section section-title="CardType Wizard">
                            <p data-de-aria-text="true" tabindex="0">
                                This character script is in progress of being created by the Automatic Wizard.
                            </p>
                            <app-overlay-button id="auto-wizard-btn" aria-key="a">Continue Automatic Wizard</app-overlay-button>
                            <app-overlay-button id="show-overview-btn" aria-key="o" play-sound-on-click="false">Show Overview</app-overlay-button>
                        </app-overlay-section>`;
                    } else if (parsedCardType.state.guidedWizardCompleted || parsedCardType.state.automaticWizardCompleted) {
                        // TODO add more options here, for the states
                        cardtypeWizardContent = `<app-overlay-section section-title="CardType Wizard">
                            <p data-de-aria-text="true" tabindex="0">
                                This character script was created by the ${parsedCardType.state.guidedWizardCompleted ? 'Guided Wizard' : 'Automatic Wizard'}.
                            </p>
                            <app-overlay-button id="show-overview-btn" aria-key="o" play-sound-on-click="false">Show Overview</app-overlay-button>
                        </app-overlay-section>`;
                    } else {
                        cardtypeWizardContent = `<app-overlay-section section-title="CardType Wizard">
                            <p data-de-aria-text="true" tabindex="0">
                                This character script was generated by a character wizard uncompatible with the current version, so it can only be edited manually.
                            </p>
                        </app-overlay-section>`;
                    }
                } catch (err) {
                    cardtypeWizardContent = `<app-overlay-section section-title="CardType Wizard">
                        <p data-de-aria-text="true" tabindex="0">
                            This character script was generated by a character wizard but it is corrupted, so it can only be edited manually.
                        </p>
                    </app-overlay-section>`;
                }
            }

            const description = thisFileInfo?.description || "No description available";

            const isSystemNamespace = this.currentCharacterNamespace.startsWith('@');
            const profileImageUrl = `${isSystemNamespace ? '@' : ''}assets/${isSystemNamespace ? this.currentCharacterNamespace.slice(1) : this.currentCharacterNamespace}/${this.currentCharacterId}/profile`;

            tabsContainer.innerHTML = `
                <app-overlay-section section-title="Character Image">
                    <div class="character-profile-image-container-parent">
                        <div class="character-profile-image-container">
                            <app-profile-image image-url="${escapeHTML(profileImageUrl)}"${isSystemNamespace ? '' : ' editable="true"'}></app-profile-image>
                        </div>
                    </div>
                </app-overlay-section>
                <app-overlay-section section-title="Description">
                    <p data-de-aria-text="true" tabindex="0">${escapeHTML(description)}</p>
                </app-overlay-section>
                ${cardtypeWizardContent}
            `;

            tabsContainer.querySelector('#guided-wizard-btn')?.addEventListener('button-click', () => {
                const wizard = document.createElement('app-cardtype-wizard');
                wizard.setAttribute('character-namespace', this.currentCharacterNamespace);
                wizard.setAttribute('character-id', this.currentCharacterId);
                wizard.setAttribute('wizard-expectation', "guided");
                wizard.addEventListener('wizard-closed', () => this.renderSection());
                document.body.appendChild(wizard);
            });
            tabsContainer.querySelector('#auto-wizard-btn')?.addEventListener('button-click', () => {
                const wizard = document.createElement('app-cardtype-wizard');
                wizard.setAttribute('character-namespace', this.currentCharacterNamespace);
                wizard.setAttribute('character-id', this.currentCharacterId);
                wizard.setAttribute('wizard-expectation', "automatic");
                wizard.addEventListener('wizard-closed', () => this.renderSection());
                document.body.appendChild(wizard);
            });
            tabsContainer.querySelector('#show-overview-btn')?.addEventListener('button-click', () => {
                const overview = document.createElement('app-character-overview');
                overview.setAttribute('character-namespace', this.currentCharacterNamespace);
                overview.setAttribute('character-id', this.currentCharacterId);
                document.body.appendChild(overview);
            });
        } else if (this.currentSectionIndex === 3) {
            restoreAllAmbiencesVolume();
            tabsContainer.innerHTML = `<app-overlay-section section-title="Script Info">
                <app-script-info
                    script-id="${this.currentCharacterId.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}"
                    script-namespace="${this.currentCharacterNamespace.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}"
                ></app-script-info>
            </app-overlay-section>`;
        } else if (this.currentSectionIndex === 1) {
            if (isStandard) {
                restoreAllAmbiencesVolume();
                const isSystemNamespace = this.currentCharacterNamespace.startsWith('@');
                const baseUrl = `${isSystemNamespace ? '@' : ''}assets/${isSystemNamespace ? this.currentCharacterNamespace.slice(1) : this.currentCharacterNamespace}/${this.currentCharacterId}`;
                tabsContainer.innerHTML = `<app-overlay-section section-title="Emotions">
                        <div class="emotions-groups">
                            ${Object.keys(emotionsGrouped).map(emotionKey => `
                                <div class="emotions-group">
                                    <h3 class="emotions-group-title">${escapeHTML(emotionKey[0].toUpperCase() + emotionKey.slice(1))}</h3>
                                    <div class="emotions-grid">
                                        ${emotionsGrouped[emotionKey].map(emotion => `
                                            <div class="emotion-item">
                                                <app-profile-image image-url="${escapeHTML(baseUrl)}/${emotion}" fallback-url="${escapeHTML(baseUrl)}/profile"${isSystemNamespace ? '' : ' editable="true"'}></app-profile-image>
                                                <span class="emotion-label">${escapeHTML(emotion)}</span>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                </app-overlay-section>`;
            } else {
                tabsContainer.innerHTML = `<app-overlay-section section-title="Emotions">
                    <p data-de-aria-text="true" tabindex="0">
                        This character script is in non-standard format. Emotions are not available for this character.
                    </p>
                </app-overlay-section>`;
            }
        } else if (this.currentSectionIndex === 2) {
            if (isStandard) {
                setAllAmbiencesVolume(0.3);
                const isSystemNamespace = this.currentCharacterNamespace.startsWith('@');
                const baseUrl = `${isSystemNamespace ? '@' : ''}assets/${isSystemNamespace ? this.currentCharacterNamespace.slice(1) : this.currentCharacterNamespace}/${this.currentCharacterId}`;
                tabsContainer.innerHTML = `<app-overlay-section section-title="Emotional Vocal Effects">
                    <div class="emotions-groups">
                        ${Object.keys(emotionsGrouped).map(emotionKey => `
                            <div class="emotions-group">
                                <h3 class="emotions-group-title">${escapeHTML(emotionKey[0].toUpperCase() + emotionKey.slice(1))}</h3>
                                <div class="emotions-grid">
                                    ${emotionsGrouped[emotionKey].map(emotion => `
                                        <div class="emotion-item">
                                            <app-profile-voice
                                                voice-url="${escapeHTML(baseUrl)}/voice_${emotion}"
                                                fallback-url="${escapeHTML(baseUrl)}/voice"
                                                download-name="voice_${emotion}"${isSystemNamespace ? '' : ' editable="true"'}
                                                voice-prompt="${escapeHTML(emotionsToVoicePromptDescription[emotion] || 'No description available')}"
                                                reference-name="voice_${emotion}"
                                            ></app-profile-voice>
                                            <span class="emotion-label">${escapeHTML(emotion)}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </app-overlay-section>`;
            } else {
                tabsContainer.innerHTML = `<app-overlay-section section-title="Emotional Vocal Effects">
                    <p data-de-aria-text="true" tabindex="0">
                        This character script is in non-standard format. Emotional vocal effects are not available for this character.
                    </p>
                </app-overlay-section>`;
            }
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
                <app-overlay-tabs current="${this.currentSectionIndex}" sections='["Configure", "Emotions", "Vocal Expressions", "Script Info"]'>
                </app-overlay-tabs>
            </app-overlay>
        `;
    }
}

customElements.define('app-character', CharacterOverlay);