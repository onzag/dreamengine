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
        if (this.getAttribute("initial-section")) {
            // @ts-ignore
            const initialSection = parseInt(this.getAttribute("initial-section"));
            if (!isNaN(initialSection)) {
                this.currentSectionIndex = initialSection;
            }
        }

        this.render();

        playPauseSound();
        // @ts-expect-error
        this.root.querySelector('app-overlay').addEventListener('cancel', this.onCancelSettings);
        // @ts-expect-error
        this.root.querySelector('app-overlay').addEventListener('confirm', () => {
            // check everything is valid
            const someInvalid = Array.from(this.root.querySelectorAll('app-overlay-input, app-overlay-select')).some(inputComponent => {
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
                    input-data-location="user.name"
                ></app-overlay-input>
                <app-overlay-input
                    label="Species"
                    input-placeholder="human"
                    title="This is your character's species, which may influence how other characters perceive and interact with you in the game world."
                    input-data-location="user.species"
                    input-default-value="human"
                    input-enforce-lowercase="true"
                ></app-overlay-input>
                <app-overlay-select
                    label="Species Type"
                    input-options='["humanoid", "feral", "animal"]'
                    title="The type of species will affect how the AI interacts with your character in-game, influencing behaviors and interactions based on the species type."
                    input-data-location="user.speciesType"
                    input-default-value="humanoid"
                ></app-overlay-select>
                <app-overlay-input
                    label="Race"
                    input-placeholder="forest elf"
                    title="This is your character's race, which may influence how other characters perceive and interact with you in the game world, and may also affect social interactions and preferences based on race."
                    input-data-location="user.race"
                    input-default-value=""
                    input-enforce-lowercase="true"
                ></app-overlay-input>
                <app-overlay-list-input
                    label="Group Belonging"
                    input-placeholder="e.g. american, catholic, etc..."
                    title="Groups your character belongs to, such as nationality, religion, creed, or other social groups. These may influence how other characters perceive and interact with you."
                    input-data-location="user.groupBelonging"
                    input-enforce-lowercase="true"
                ></app-overlay-list-input>
                <app-overlay-select
                    label="Sex"
                    input-options='["male", "female", "intersex", "none"]'
                    title="The sex will affect how the AI interacts with your character in-game, it represents what it's actually physically present in your character's body; some characters may take this into account when interacting with you."
                    input-data-location="user.sex"
                ></app-overlay-select>
                <app-overlay-select
                    label="Gender"
                    input-options='["male", "female", "ambiguous"]'
                    title="The gender will affect how the AI interacts with your character in-game, how characters perceive you in appearance and spirit, choose wisely based on your preferred role-playing style."
                    input-data-location="user.gender"
                ></app-overlay-select>
                <app-overlay-input
                    label="Short Description"
                    title="This short description provides a brief overview of your character's physical appearance and notable traits, helping the AI to visualize and role-play your character more effectively."
                    input-data-location="user.shortDescription"
                    input-placeholder="An elderly overweight witch with a hunched back and a long crooked nose."
                ></app-overlay-input>
                <app-overlay-input
                    label="Short Description (Top Naked)"
                    title="An additional short description appended when your character is top naked. Leave empty if not applicable."
                    input-data-location="user.shortDescriptionTopNakedAdd"
                    input-placeholder="Revealing a muscular torso with a scar across the chest."
                ></app-overlay-input>
                <app-overlay-input
                    label="Short Description (Bottom Naked)"
                    title="An additional short description appended when your character is bottom naked. Leave empty if not applicable."
                    input-data-location="user.shortDescriptionBottomNakedAdd"
                    input-placeholder="Revealing toned legs with a tattoo on the left thigh."
                ></app-overlay-input>
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
                    label="Age"
                    title="This is your character's age, in years, which may influence how other characters perceive and interact with you in the game world."
                    input-data-location="user.ageYears"
                    input-placeholder="25"
                    input-type="number"
                    input-number-min="0"
                    input-number-max="150"
                    input-number-step="1"
                    input-number-unit="years"
                ></app-overlay-input>
                <app-overlay-input
                    label="Carrying Capacity (Kilograms)"
                    title="This is your character's carrying capacity in kilograms, represents how much weight your character can carry, which will influence gameplay mechanics such as inventory management."
                    input-data-location="user.carryingCapacityKg"
                    input-placeholder="50"
                    input-type="number"
                    input-number-min="10"
                    input-number-max="100"
                    input-number-step="1"
                    input-number-unit="kg"
                ></app-overlay-input>
                <app-overlay-input
                    label="Carrying Capacity (Liters)"
                    title="This is your character's carrying capacity in liters, represents how much volume your character can carry, which will influence gameplay mechanics such as inventory management."
                    input-data-location="user.carryingCapacityLiters"
                    input-placeholder="50"
                    input-type="number"
                    input-number-min="10"
                    input-number-max="100"
                    input-number-step="1"
                    input-number-unit="L"
                ></app-overlay-input>
                <app-overlay-input
                    label="Maintenance Calories per day"
                    title="This is your character's maintenance calories per day, which represents the amount of energy your character needs to maintain their current weight and activity level."
                    input-data-location="user.maintenanceCaloriesPerDay"
                    input-placeholder="2000"
                    input-type="number"
                    input-number-min="0"
                    input-number-max="30000"
                    input-number-step="1"
                    input-number-unit="kcal"
                ></app-overlay-input>
                <app-overlay-input
                    label="Maintenance Water per day"
                    title="This is your character's maintenance water per day, which represents the amount of water your character needs to maintain their current hydration level."
                    input-data-location="user.maintenanceHydrationLitersPerDay"
                    input-placeholder="2"
                    input-type="number"
                    input-number-min="0"
                    input-number-max="300"
                    input-number-step="1"
                    input-number-unit="L"
                ></app-overlay-input>
                <app-overlay-input
                    label="Range of Locomotion"
                    title="This is your character's maximum range of locomotion in meters, representing how far your character can travel before needing rest."
                    input-data-location="user.rangeMeters"
                    input-placeholder="10000"
                    input-type="number"
                    input-number-min="0"
                    input-number-max="100000"
                    input-number-step="1"
                    input-number-unit="m"
                ></app-overlay-input>
                <app-overlay-input
                    label="Locomotion Speed"
                    title="This is your character's maximum speed of locomotion in meters per second, representing how fast your character can move."
                    input-data-location="user.locomotionSpeedMetersPerSecond"
                    input-placeholder="1.4"
                    input-type="number"
                    input-number-min="0"
                    input-number-max="100"
                    input-number-step="0.1"
                    input-number-unit="mps"
                ></app-overlay-input>
                <app-overlay-input
                    label="Stealth"
                    title="A value representing how likely your character is to perform stealthy actions. Higher means more sneaky. Used when determining if others notice your actions like robberies."
                    input-data-location="user.stealth"
                    input-placeholder="50"
                    input-type="number"
                    input-is-percentage="true"
                ></app-overlay-input>
                <app-overlay-input
                    label="Perception"
                    title="A value representing how perceptive your character is. Higher means more observant. Used when determining if your character notices events like robberies happening around them."
                    input-data-location="user.perception"
                    input-placeholder="50"
                    input-type="number"
                    input-is-percentage="true"
                ></app-overlay-input>
                <app-overlay-input
                    label="Attractiveness"
                    title="A value representing how attractive your character is. Higher means more attractive and more likely to be approached by other characters and have romantic interactions."
                    input-data-location="user.attractiveness"
                    input-placeholder="50"
                    input-type="number"
                    input-is-percentage="true"
                ></app-overlay-input>
                <app-overlay-input
                    label="Charisma"
                    title="A value representing how charismatic your character is. Higher means more charismatic and more likely to influence other characters and have strong social interactions."
                    input-data-location="user.charisma"
                    input-placeholder="50"
                    input-type="number"
                    input-is-percentage="true"
                ></app-overlay-input>
                <app-overlay-select
                    label="Power Tier"
                    input-options='["insect", "critter", "human", "apex", "street_level", "block_level", "city_level", "country_level", "continental", "planetary", "stellar", "galactic", "universal", "multiversal", "limitless"]'
                    input-default-value="human"
                    title="The overall power level of your character on the power scale. Characters in higher tiers will overpower those in lower tiers regardless of tier value."
                    input-data-location="user.tier"
                ></app-overlay-select>
                <app-overlay-input
                    label="Tier Value"
                    title="A value from 0 to 100 representing your character's strength within their power tier. 0 means barely makes it, 100 means peak condition. Used for comparisons against characters in the same tier."
                    input-data-location="user.tierValue"
                    input-placeholder="50"
                    input-type="number"
                    input-number-min="0"
                    input-number-max="100"
                    input-number-step="1"
                    input-number-unit="aura"
                ></app-overlay-input>
                <app-overlay-input
                    label="Power Growth Rate"
                    title="A value from 0 to 1 representing how fast your character grows on their power scale after interactions or events. 0.25 is standard for a human, 0.5 to 1 for fast-growing characters like shonen protagonists."
                    input-data-location="user.powerGrowthRate"
                    input-placeholder="25"
                    input-type="number"
                    input-is-percentage="true"
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
                    title="This is the host address for DreamServer, you can define all parameters here for the remote server, for example wss://myserver.com:1234?model=custom&param=value, the protocol must be ws:// or wss://"
                    input-data-location="host"
                ></app-overlay-input>
                <app-overlay-input
                    label="Inference api secret"
                    input-placeholder="Enter inference api secret"
                    title="This is the API secret used by the AI inference DreamServer"
                    input-data-location="secret"
                ></app-overlay-input>
                <app-overlay-input-boolean
                    label="Allow self-signed SSL certificates"
                    title="Allow connecting to inference servers with self-signed SSL certificates, only enable this if you are connecting to a trusted server with a self-signed certificate, enabling this will make your connection less secure and vulnerable"
                    input-data-location="allowSelfSigned"
                ></app-overlay-input-boolean>
                <div style="margin-top:1vh;color:#ff6b6b;font-size:3vh;">&#9888; The app must be restarted after changing the inference host, secret or self-signed SSL certificate settings.</div>
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
        this.root.querySelectorAll('app-overlay-input, app-overlay-select, app-profile-image, app-overlay-list-input, app-overlay-input-boolean').forEach(inputComponent => {
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
        playConfirmSound();

        await Promise.all(Array.from(this.root.querySelectorAll('app-overlay-input, app-overlay-select, app-profile-image, app-overlay-list-input, app-overlay-input-boolean')).map(inputComponent =>
            // @ts-ignore
            inputComponent.saveValueToUserData()
        ));

        this.closeSettings();

        await window.API.saveConfig();
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
                min-width: 200px;
                min-height: 200px;
            }
        </style>
        <app-overlay overlay-title="Settings" cancel-text="Cancel" confirm-text="Save & Close">
            <app-overlay-tabs current="${this.currentSectionIndex}" sections='["General", "AI Settings"]'>              
            </app-overlay-tabs>
        </app-overlay>`;
    }
}

customElements.define('app-settings', Settings);