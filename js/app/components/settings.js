import './overlay.js';

// Sound effects
const hoverSound = document.getElementById('hoverSound');
const confirmSound = document.getElementById('confirmSound');
const cancelSound = document.getElementById('cancelSound');
const pauseSound = document.getElementById('pauseSound');

function playHoverSound() {
    hoverSound.currentTime = 0;
    hoverSound.play().catch(err => console.log('Hover sound play failed:', err));
}

function playConfirmSound() {
    confirmSound.currentTime = 0;
    confirmSound.play().catch(err => console.log('Confirm sound play failed:', err));
}

function playCancelSound() {
    cancelSound.currentTime = 0;
    cancelSound.play().catch(err => console.log('Cancel sound play failed:', err));
}

function playPauseSound() {
    pauseSound.currentTime = 0;
    pauseSound.play().catch(err => console.log('Pause sound play failed:', err));
}

class Settings extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        this.onCancelSettings = this.onCancelSettings.bind(this);
        this.onSaveAndCloseSettings = this.onSaveAndCloseSettings.bind(this);

        this.currentSectionIndex = 0;
    }

    connectedCallback() {
        this.render();

        playPauseSound();
        this.shadowRoot.querySelector('app-overlay').addEventListener('cancel', this.onCancelSettings);
        this.shadowRoot.querySelector('app-overlay').addEventListener('confirm', this.onSaveAndCloseSettings);

        this.renderSection()

        this.shadowRoot.querySelector('app-overlay-tabs').addEventListener('tab-change', (e) => {
            this.currentSectionIndex = e.detail.newIndex;
            this.renderSection()
        });
    }

    renderSection() {
        const tabsContainer = this.shadowRoot.querySelector('app-overlay-tabs');

        if (this.currentSectionIndex === 0) {
            tabsContainer.innerHTML = `<app-overlay-section section-title="User">
                <app-overlay-input-warning>Changing any of these options will not affect previous game campaigns, only new ones.</app-overlay-input-warning>
                <app-overlay-input
                    label="Username"
                    input-placeholder="Enter in game username"
                    title="This name will be the name that the AI uses to refer to you in-game, make sure to pick something unique and that you like; always present yourself to the AI as this name."
                    input-data-location="user.username"
                ></app-overlay-input>
                <app-overlay-select
                    label="Gender"
                    input-options='["Male", "Female", "Ambiguous"]'
                    title="The gender will affect how the AI interacts with your character in-game, how characters perceive you in appearance and spirit, choose wisely based on your preferred role-playing style."
                    input-data-location="user.gender"
                ></app-overlay-select>
                <app-overlay-select
                    label="Sex"
                    input-options='["Male", "Female", "Intersex"]'
                    title="The sex will affect how the AI interacts with your character in-game, it represents what it's actually physically present in your character's body; some characters may take this into account when interacting with you."
                    input-data-location="user.sex"
                ></app-overlay-select>
            </app-overlay-section>
            <app-overlay-section section-title="AI Inference Settings">
                <app-overlay-input
                    label="Inference host"
                    input-placeholder="Enter inference host"
                    title="This is the host address for the AI inference server, if not given it will default to 127.0.0.1:8075"
                    input-data-location="inference.host"
                ></app-overlay-input>
                <app-overlay-input
                    label="Inference host model"
                    input-placeholder="Enter inference host model"
                    title="This is the model used by the AI inference server, if it supports multiple models."
                    input-data-location="inference.model"
                ></app-overlay-input>
                <app-overlay-input
                    label="Inference api key"
                    input-placeholder="Enter inference api key"
                    title="This is the API key used by the AI inference server, if it requires authentication."
                    input-data-location="inference.apiKey"
                ></app-overlay-input>
            </app-overlay-section>
            <app-overlay-section section-title="ComfyUI Integration Settings">
                <app-overlay-input-warning>Your ComfyUI integration must be enabled with AIHub, with the workflows, character_generation, character_edit, environment_generation, character_animate, environment_animate</app-overlay-input-warning>
                <app-overlay-input
                    label="ComfyUI host"
                    input-placeholder="Enter ComfyUI host"
                    title="This is the host address for the ComfyUI server"
                    input-data-location="comfyui.host"
                ></app-overlay-input>
                <app-overlay-input
                    label="ComfyUI AIHub API Key"
                    input-placeholder="Enter ComfyUI AIHub API Key"
                    title="This is the API key for the ComfyUI AIHub integration"
                    input-data-location="comfyui.apiKey"
                ></app-overlay-input>
            </app-overlay-section>
            <app-overlay-section section-title="External Apps">
                <app-overlay-input
                    label="External Image Editor Path"
                    input-placeholder="Enter external image editor path"
                    title="This is the file path to your external image editor application, used to edit images generated by the AI."
                    input-data-location="externalApps.imageEditorPath"
                ></app-overlay-input>
            </app-overlay-section>`;
        } else if (this.currentSectionIndex === 1) {
            tabsContainer.innerHTML = ""
        };
    }

    onCancelSettings() {
        let hasUnsavedChanges = false;
        this.shadowRoot.querySelectorAll('app-overlay-input').forEach(inputComponent => {
            if (inputComponent.hasBeenModified()) {
                hasUnsavedChanges = true;
            }
        });
        if (!hasUnsavedChanges) {
            this.shadowRoot.querySelectorAll('app-overlay-select').forEach(selectComponent => {
                if (selectComponent.hasBeenModified()) {
                    hasUnsavedChanges = true;
                }
            });
        }

        if (hasUnsavedChanges) {
            const dialog = document.createElement('app-dialog');
            dialog.setAttribute('dialog-title', 'You have unsaved changes. Are you sure you want to discard them?');
            dialog.setAttribute("confirmation", "true");
            dialog.setAttribute("confirm-text", "Discard");
            dialog.setAttribute("cancel-text", "Cancel");
            dialog.addEventListener('confirm', () => {
                this.closeSettings();
                playCancelSound();
                document.body.removeChild(dialog);
            });
            dialog.addEventListener('cancel', () => {
                document.body.removeChild(dialog);
                playCancelSound();
            });
            document.body.appendChild(dialog);
        } else {
            this.closeSettings();
            playCancelSound();
        }
    }

    async onSaveAndCloseSettings() {
        this.closeSettings();
        playConfirmSound();

        await Promise.all(Array.from(this.shadowRoot.querySelectorAll('app-overlay-input')).map(inputComponent =>
            inputComponent.saveValueToUserData()
        ));

        await Promise.all(Array.from(this.shadowRoot.querySelectorAll('app-overlay-select')).map(selectComponent => {
            return selectComponent.saveValueToUserData();
        }));

        window.electronAPI.saveSettingsToDisk();
    }

    closeSettings() {
        this.dispatchEvent(new CustomEvent('close'));
    }

    render() {
        this.shadowRoot.innerHTML = `<app-overlay overlay-title="Settings" cancel-text="Cancel" confirm-text="Save & Close">
            <app-overlay-tabs current="${this.currentSectionIndex}" sections='["General", "Advanced AI Inference"]'>              
            </app-overlay-tabs>
        </app-overlay>`;
    }
}

customElements.define('app-settings', Settings);