import './overlay.js';
import "./profile-image.js";
import { playCancelSound, playConfirmSound, playHoverSound, playPauseSound } from '../sound.js';

class Settings extends HTMLElement {
    constructor() {
        super();
        /**
         * @type {ShadowRoot}
         */
        this.root = this.attachShadow({ mode: 'open' });

        this.closeSettings = this.closeSettings.bind(this);
        this.onCancelSettings = this.onCancelSettings.bind(this);
        this.onSaveAndCloseSettings = this.onSaveAndCloseSettings.bind(this);

        this.currentSectionIndex = 0;
    }

    connectedCallback() {
        this.render();

        playPauseSound();
        // @ts-expect-error
        this.root.querySelector('app-overlay').addEventListener('cancel', this.onCancelSettings);
        // @ts-expect-error
        this.root.querySelector('app-overlay').addEventListener('confirm', () => {
            // check everything is valid
            const someInvalid = Array.from(this.root.querySelectorAll('app-overlay-input, app-overlay-select, non-repeat-taglist')).some(inputComponent => {
                // @ts-expect-error
                return inputComponent.hasErrorsPresent();
            });
            if (someInvalid) {
                const dialog = document.createElement('app-dialog');
                dialog.setAttribute('dialog-title', 'Cannot Save Changes');
                dialog.innerHTML = `
                    <p>There are some invalid fields in the settings configuration. Please correct them before saving.</p>
                `;
                this.root.appendChild(dialog);
                dialog.addEventListener('cancel', () => {
                    this.root.removeChild(dialog);
                });
                return;
            } else {
                this.onSaveAndCloseSettings();
            }
        });

        this.renderSection()

        // @ts-expect-error
        this.root.querySelector('app-overlay-tabs').addEventListener('pre-tab-change', (e) => {
            // @ts-ignore
            this.onCheckForUnsavedChanges(null, playConfirmSound, e.detail.denyTabChange, e.detail.executeTabChange, null);
        });

        // @ts-expect-error
        this.root.querySelector('app-overlay-tabs').addEventListener('tab-change', (e) => {
            // @ts-ignore
            this.currentSectionIndex = e.detail.newIndex;
            this.renderSection()
        });
    }

    renderSection() {
        const tabsContainer = this.root.querySelector('app-overlay-tabs');

        if (this.currentSectionIndex === 0 && tabsContainer) {
            const debug_desc = "Debug mode is not meant for playing, allows you to hear the voices of schizophrenic characters, see the system inference reasoning, rolling chances, you get debug commands, and more. Only use this mode for testing and debugging purposes.";
            const easy_desc = "Easy mode shows characters hidden states, bond strengths, second bond strength, and shows how they feel about each other, making it easier to role-play and interact with them; editing messages is fully allowed in this mode.";
            const normal_desc = "Normal mode is the default gameplay experience, characters will have hidden states and feelings, making interactions more immersive and challenging, editing is limited to typos and minor changes but you still are able to undo inferences, and get back to a previous state. (multiple timelines)";
            const hard_desc = "Hard mode increases the challenge by removing the ability to undo inferences, making choices permanent; (single timeline)";
            const diff_array = [debug_desc, easy_desc, normal_desc, hard_desc];

            tabsContainer.innerHTML = `<app-overlay-section section-title="User">
            <div class="main-profile-image-container">
                <app-profile-image image-url="profile" editable="true"></app-profile-image>
            </div>
                <div class="profile-image-spacer"></div>
                <app-overlay-input-warning>Changing any of these options will not affect previous game campaigns, only new ones.</app-overlay-input-warning>
                <app-overlay-input
                    label="Username"
                    input-placeholder="Draxkor"
                    title="This name will be the name that the AI uses to refer to you in-game, make sure to pick something unique and that you like; always present yourself to the AI as this name."
                    input-data-location="user.username"
                ></app-overlay-input>
                <app-overlay-select
                    label="Gender"
                    input-options='["male", "female", "ambiguous"]'
                    title="The gender will affect how the AI interacts with your character in-game, how characters perceive you in appearance and spirit, choose wisely based on your preferred role-playing style."
                    input-data-location="user.gender"
                ></app-overlay-select>
                <app-overlay-select
                    label="Sex"
                    input-options='["male", "female", "intersex", "none"]'
                    title="The sex will affect how the AI interacts with your character in-game, it represents what it's actually physically present in your character's body; some characters may take this into account when interacting with you."
                    input-data-location="user.sex"
                ></app-overlay-select>
                <app-overlay-input
                    label="Height"
                    title="This is your character's height, in centimeters, which may influence how other characters perceive and interact with you in the game world."
                    input-data-location="user.heightCm"
                    input-placeholder="175"
                    input-type="number"
                    input-number-min="50"
                    input-number-max="3000"
                    input-number-step="1"
                    input-number-unit="cm"
                ></app-overlay-input>
                <app-overlay-input
                    label="Weight"
                    title="This is your character's weight, in kilograms, which may influence how other characters perceive and interact with you in the game world."
                    input-data-location="user.weightKg"
                    input-placeholder="70"
                    input-type="number"
                    input-number-min="50"
                    input-number-max="3000"
                    input-number-step="1"
                    input-number-unit="kg"
                ></app-overlay-input>
                <app-overlay-input
                    label="Mantenience Calories per day"
                    title="Mantenience Calories per day"
                    input-data-location="user.maintenanceCaloriesPerDay"
                    input-placeholder="2000"
                    input-type="number"
                    input-number-min="0"
                    input-number-max="30000"
                    input-number-step="1"
                    input-number-unit="kcal"
                ></app-overlay-input>
                <app-overlay-input
                    label="Mantenience Water per day"
                    title="Mantenience Water per day"
                    input-data-location="user.maintenanceWaterLitersPerDay"
                    input-placeholder="2"
                    input-type="number"
                    input-number-min="0"
                    input-number-max="300"
                    input-number-step="1"
                    input-number-unit="L"
                ></app-overlay-input>
                <app-overlay-input
                    label="Carrying Capacity (Liters)"
                    title="This is your character's carrying capacity in liters"
                    input-data-location="user.carryingCapacityLiters"
                    input-placeholder="50"
                    input-type="number"
                    input-number-min="50"
                    input-number-max="300"
                    input-number-step="1"
                    input-number-unit="L"
                ></app-overlay-input>
                <app-overlay-input
                    label="Carrying Capacity (Kilograms)"
                    title="This is your character's carrying capacity in kilograms"
                    input-data-location="user.carryingCapacityKg"
                    input-placeholder="50"
                    input-type="number"
                    input-number-min="50"
                    input-number-max="300"
                    input-number-step="1"
                    input-number-unit="L"
                ></app-overlay-input>
                <app-overlay-input
                    label="Short Description"
                    title="This short description provides a brief overview of your character's physical appearance and notable traits, helping the AI to visualize and role-play your character more effectively."
                    input-data-location="user.short"
                    input-placeholder="An elderly overweight witch with a hunched back and a long crooked nose."
                ></app-overlay-input>
                <app-overlay-select
                    label="Difficulty"
                    input-options='["Debug", "Easy", "Normal", "Hard"]'
                    input-default-value="Normal"
                    input-options-descriptions='${JSON.stringify(diff_array)}'
                    title="The difficulty level will affect the challenge and complexity of the game, choose based on your preferred gameplay experience."
                    input-data-location="difficulty"
                ></app-overlay-select>
            </app-overlay-section>`;
        } else if (this.currentSectionIndex === 1 && tabsContainer) {
            tabsContainer.innerHTML = `<app-overlay-section section-title="AI Inference Settings">
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
        };
    }

    /**
     * Check for unsaved changes and optionally run callbacks.
     *
     * @param {() => void} [onceDoneFn]
     * @param {() => void} [onceDoneFnNoResistance]
     * @param {() => void} [resistanceAppliedFn]
     * @param {() => void} [onAllowFn]
     * @param {() => void} [onceCancelFn]
     */
    onCheckForUnsavedChanges(onceDoneFn, onceDoneFnNoResistance, resistanceAppliedFn, onAllowFn, onceCancelFn) {
        let hasUnsavedChanges = false;
        this.root.querySelectorAll('app-overlay-input, app-overlay-select, app-profile-image').forEach(inputComponent => {
            // @ts-ignore
            if (inputComponent.hasBeenModified()) {
                hasUnsavedChanges = true;
            }
        });

        if (hasUnsavedChanges) {
            resistanceAppliedFn && resistanceAppliedFn();
            const dialog = document.createElement('app-dialog');
            dialog.setAttribute('dialog-title', 'You have unsaved changes. Are you sure you want to discard them?');
            dialog.setAttribute("confirmation", "true");
            dialog.setAttribute("confirm-text", "Discard");
            dialog.setAttribute("cancel-text", "Cancel");
            dialog.addEventListener('confirm', () => {
                playCancelSound();
                document.body.removeChild(dialog);
                onAllowFn && onAllowFn();
                onceDoneFn && onceDoneFn();
            });
            dialog.addEventListener('cancel', () => {
                document.body.removeChild(dialog);
                playCancelSound();
                onceCancelFn && onceCancelFn();
            });
            document.body.appendChild(dialog);
        } else {
            onceDoneFn && onceDoneFn();
            onceDoneFnNoResistance && onceDoneFnNoResistance();
        }
    }

    onCancelSettings() {
        this.onCheckForUnsavedChanges(this.closeSettings, playCancelSound);
    }

    async onSaveAndCloseSettings() {
        this.closeSettings();
        playConfirmSound();

        await Promise.all(Array.from(this.root.querySelectorAll('app-overlay-input, app-overlay-select, app-profile-image')).map(inputComponent =>
            // @ts-ignore
            inputComponent.saveValueToUserData()
        ));

        window.electronAPI.saveSettingsToDisk();
    }

    closeSettings() {
        this.dispatchEvent(new CustomEvent('close'));
    }

    render() {
        this.root.innerHTML = `
        <style>
            .profile-image-spacer {
                height: 4vh;
            }
            .main-profile-image-container {
                width: 20vw;
                height: 20vw;
            }
        </style>
        <app-overlay overlay-title="Settings" cancel-text="Cancel" confirm-text="Save & Close">
            <app-overlay-tabs current="${this.currentSectionIndex}" sections='["General", "AI Settings"]'>              
            </app-overlay-tabs>
        </app-overlay>`;
    }
}

customElements.define('app-settings', Settings);