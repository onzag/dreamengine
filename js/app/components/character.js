import schema from '../../schema/character.js';
import { character, world, utils, specials } from '../../schema/functions.js';
import { playCancelSound, playConfirmSound, playHoverSound, playPauseSound } from '../sound.js';

/**
 * 
 * @param {string} str 
 * @returns 
 */
function escapeHTML(str) {
    if (typeof str === "undefined" || str === null) {
        return '';
    }
    if (typeof str !== 'string') {
        return str;
    }
    return str.replace(/[&<>"']/g, function (match) {
        const escapeMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };
        // @ts-ignore
        return escapeMap[match];
    });
}

/**
 * @type {{title: string, description?: string, fields: [string, string[]][], testing?: boolean}[]}
 */
const WIZARD_SECTIONS = [
    {
        title: "Basic Information",
        fields: [
            [
                "Character Overview",
                [
                    "name",
                    "group",
                    "gender",
                    "sex",
                    "heightCm",
                    "weightKg",
                    "carryingCapacityLiters",
                    "carryingCapacityKg",
                    "general",
                    "short"
                ],
            ],
            [
                "Initiative and Behaviour",
                [
                    "initiative",
                    "stranger_initiative",
                    "stranger_rejection",
                    "autism",
                    "schizophrenia",
                ],
            ]
        ]
    },
    {
        title: "States",
        description: "States are not emotions, they are mental or physical conditions that affect your character's behavior and interactions. They can influence how your character reacts to situations and other characters.\n\n" +
            "Note that each state behavioural effect must be defined in the character bonds section. For example, if your character has the 'needs_affection' state, you should define how other characters respond to this state in their bonds towards your character. Some characters may be stoic and not show it, while others may display it more openly. This adds depth to character interactions and relationships and is defined by the bond strength and type.\n\n" +
            "A state or behaviour that isn't defined here does not mean the character won't display it, that depends on the underlying AI Model, you should always ensure to deny behaviours or states that you don't want explicilty in the bonds section; having the behaviours that you want as states just helps to guide the AI better and adds depth to the character; but it is not a strict limitation, for that reason be sure to limit unwanted behaviours in the bonds section.",
        fields: [
            [
                "Character States",
                [
                    "states",
                ]
            ]
        ]
    },
    {
        title: "Emotions",
        description: "Emotions are feelings that your character experiences, they do not influence behaviour as they are more akin what other characters perceive about your character's current mood or feelings.\n\n" +
        "Emotions are based on the rolling text model using text analysis to pick emptions from your character's dialogue, as well as emotions shown by the character states; note that emotions should be assigned an image that represents them visually when displayed in the chat interface.",
        fields: [
            [
                "Emotional Configuration",
                [
                    "emotions",
                ]
            ]
        ]
    },
    {
        title: "Bonds",
        fields: [
            [
                "Character Bonds",
                [
                    "bonds",
                ]
            ],
        ],
    },
    {
        title: "Image and Video",
        fields: []
    },
    {
        title: "Properties",
        fields: [
            [
                "Character Properties",
                [
                    "properties",
                ]
            ]
        ]
    },
    {
        title: "Advanced",
        fields: [
            [
                "Scripting and Customization",
                [
                    "advanced_spawn_script",
                ]
            ]
        ]
    },
    {
        title: "Test",
        fields: [],
        testing: true,
    }
]

class CharacterOverlay extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });

        this.currentSectionIndex = 0;

        this.onCancel = this.onCancel.bind(this);
    }

    async connectedCallback() {
        this.currentCharacterFile = this.getAttribute("character-file") || "";
        this.currentCharacterName = "";

        window.electronAPI.loadValueFromUserData("name", {
            fileName: this.currentCharacterFile,
            fileType: "character",
        }).then((name) => {
            if (name) {
                this.currentCharacterName = name;
            } else {
                this.currentCharacterName = "Unnamed Character";
            }
            // @ts-expect-error
            this.root.querySelector('app-overlay').setAttribute("overlay-title", `Working on: ${JSON.stringify(escapeHTML(this.currentCharacterName))}`);
        });

        this.render();
        playPauseSound();
        await this.buildChildrenMap();
        // @ts-expect-error
        this.root.querySelector('app-overlay').addEventListener('special-button-click', () => {
            const dialog = document.createElement('app-dialog');
            dialog.setAttribute('dialog-title', 'Character Creation Help');
            dialog.innerHTML = `
                <p>The character creator uses handlebars for templating.</p>
                <p>For more information on how to use it, please visit <a href="https://handlebarsjs.com/" target="_blank">the official Handlebars website</a>.</p>
                <p>Available values for templating are the following:</p>
                <h3>Character Variables</h3>
                <table>
                <thead>
                    <tr><th>Variable</th><th>Description</th></tr>
                    </thead>
                    <tbody>
                    ${character.map(varInfo => `<tr title=${JSON.stringify(escapeHTML(varInfo[2]))}><td>${varInfo[0]}</td><td>${escapeHTML(varInfo[1])}</td></tr>`).join('')}
                </tbody>
                </table>
                <h3>World Variables</h3>
                <table>
                <thead>
                    <tr><th>Variable</th><th>Description</th></tr>
                    </thead>
                    <tbody>
                    ${world.map(varInfo => `<tr title=${JSON.stringify(escapeHTML(varInfo[2]))}><td>${varInfo[0]}</td><td>${escapeHTML(varInfo[1])}</td></tr>`).join('')}
                </tbody>
                </table>
                <h3>Special Variables</h3>
                <table>
                <thead>
                    <tr><th>Variable</th><th>Description</th></tr>
                    </thead>
                    <tbody>
                    ${specials.map(varInfo => `<tr title=${JSON.stringify(escapeHTML(varInfo[2]))}><td>${varInfo[0]}</td><td>${escapeHTML(varInfo[1])}</td></tr>`).join('')}
                </tbody>
                </table>
                <h3 Utility Functions</h3>
                <table>
                <thead>
                    <tr><th>Function</th><th>Description</th></tr>
                    </thead>
                    <tbody>
                    ${utils.map(funcInfo => `<tr title=${JSON.stringify(escapeHTML(funcInfo[2]))}><td>${funcInfo[0]}</td><td>${escapeHTML(funcInfo[1])}</td></tr>`).join('')}
                </tbody>
                </table>
            `;
            this.root.appendChild(dialog);
            dialog.addEventListener('cancel', () => {
                this.root.removeChild(dialog);
            });
        });
        // @ts-expect-error
        this.root.querySelector('app-overlay').addEventListener('confirm', () => {
            // check everything is valid
            const someInvalid = Array.from(this.root.querySelectorAll('app-overlay-input, app-overlay-select, non-repeat-taglist, app-overlay-input-boolean')).some(inputComponent => {
                // @ts-expect-error
                return inputComponent.hasErrorsPresent();
            });
            if (someInvalid) {
                const dialog = document.createElement('app-dialog');
                dialog.setAttribute('dialog-title', 'Cannot Save Changes');
                dialog.innerHTML = `
                    <p>There are some invalid fields in the character configuration. Please correct them before saving.</p>
                `;
                this.root.appendChild(dialog);
                dialog.addEventListener('cancel', () => {
                    this.root.removeChild(dialog);
                });
                return;
            } else {
                this.saveCurrent();
            }
        });
        // @ts-expect-error
        this.root.querySelector('app-overlay').addEventListener('cancel', this.onCancel);
        // @ts-expect-error
        this.root.querySelector('app-overlay-tabs').addEventListener('pre-tab-change', (e) => {
            // @ts-expect-error
            this.onCheckForUnsavedChanges(null, playConfirmSound, e.detail.denyTabChange, e.detail.executeTabChange, null);
        });
        // @ts-expect-error
        this.root.querySelector('app-overlay-tabs').addEventListener('tab-change', (e) => {
            // @ts-expect-error
            this.currentSectionIndex = e.detail.newIndex;
            this.buildChildrenMap();
        });
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
        Array.from(this.root.querySelectorAll('app-overlay-input, app-overlay-select, non-repeat-taglist, app-overlay-input-boolean')).forEach(inputComponent => {
            // @ts-expect-error
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

    onCancel() {
        const onceDone = () => {
            this.dispatchEvent(new CustomEvent("close"));
        }
        this.onCheckForUnsavedChanges(onceDone, playCancelSound);
    }

    buildTestingSection() {
        // @ts-expect-error
        this.root.querySelector('app-overlay-tabs').innerHTML = `
            <app-overlay-section section-title="Singular Testing Environment">
                You will be placed with your character in a temporary chat session in the Lunar Station world; you and your character are alone in this world, and can interact freely to test how your character behaves based on the settings you have configured so far.
                <br><br>
                The Lunar Station world is a simple enclosed environment that has no extra world rules, so you can focus on interacting with your character without any distractions.
                <br><br>
                <div>
                    <app-overlay-button id="startTestingButton">Start Testing Session</app-overlay-button>
                </div>
            </app-overlay-section>
            <app-overlay-section section-title="Interactive Testing Environment">
                You will be placed with your character in a temporary chat session in the Artic Station world, along with two other test characters of your choice; you can interact freely with your character and the test characters to see how your character behaves in a social setting based on the settings you have configured so far.
                <br><br>
                The Artic Station world is a simple environment with only one extra rule (no item spawn), it has 3 rooms, a common area, a bedroom, and a kitchen; you can also go outside to the snowy environment but it is dangerous, staying outside for too long may lead to hypothermia and death.
                <br><br>
                <div id="test-characters-selected">Test Characters Selected: <span id="test-characters-selected-names" class="none">You haven't selected any test characters</span></div>
                <br><br>
                <div>
                    <app-overlay-button id="startTestingButton">Choose Test Characters</app-overlay-button>
                    <app-overlay-button disabled="true" id="startTestingButton">Start Testing Session</app-overlay-button>
                </div>
            </app-overlay-section>
        `;
    }

    async buildChildrenMap() {
        const sectionToDisplay = WIZARD_SECTIONS[this.currentSectionIndex];
        if (sectionToDisplay.testing) {
            this.buildTestingSection();
            return;
        }
        if (sectionToDisplay.title === "Bonds") {
            // check if bonds are frozen
            // @ts-ignore
            const frozenBonds = await window.electronAPI.areBondsFrozenForCharacterFile(this.currentCharacterFile);
            if (frozenBonds) {
                // bonds are frozen, show message instead
                // @ts-expect-error
                this.root.querySelector('app-overlay-tabs').innerHTML = `
                    <app-overlay-section section-title="Character Bonds">
                        <p>The bonds for this character are frozen by a script and cannot be modified.</p>
                    </app-overlay-section>
                `;
                return;
            }
        }
        
        const fields = sectionToDisplay.fields;
        const fieldsAsHTML = fields.map(fieldGroup => {
            const fieldName = fieldGroup[0];
            const groupFields = fieldGroup[1];
            const fieldsHTML = groupFields.map(fieldName => {
                if (schema.properties[fieldName].type === "string" || schema.properties[fieldName].code_language) {
                    if (schema.properties[fieldName].enum) {
                        // It's a select input
                        return `<app-overlay-select
                                    class="${fieldName}"
                                    label="${escapeHTML(schema.properties[fieldName].title)}" 
                                    title="${escapeHTML(schema.properties[fieldName].description || '')}"
                                    input-data-location="${fieldName}"
                                    input-data-file="${this.currentCharacterFile}"
                                    input-data-type="character"
                                    input-options='${JSON.stringify(schema.properties[fieldName].enum)}'
                                    input-options-descriptions='${JSON.stringify(schema.properties[fieldName].enumDescriptions || [])}'
                                    input-default-value="${escapeHTML(schema.properties[fieldName].default || '')}"
                                >
                                </app-overlay-select>`;
                    } else {
                        // It's a text input
                        const isMultiline = schema.properties[fieldName].multiline || false;
                        return `<app-overlay-input
                                    class="${fieldName}"
                                    label="${escapeHTML(schema.properties[fieldName].title)}" 
                                    title="${escapeHTML(schema.properties[fieldName].description || '')}" 
                                    input-data-location="${fieldName}"
                                    input-data-file="${this.currentCharacterFile}"
                                    input-data-type="character"
                                    input-minlength="${schema.properties[fieldName].minLength !== undefined ? schema.properties[fieldName].minLength : ''}"
                                    input-maxlength="${schema.properties[fieldName].maxLength !== undefined ? schema.properties[fieldName].maxLength : ''}"
                                    input-placeholder="${escapeHTML(schema.properties[fieldName].placeholder || '')}"
                                    input-default-value="${escapeHTML(schema.properties[fieldName].default || '')}"
                                    input-placeholder-ts="${escapeHTML(schema.properties[fieldName].placeholder_ts || '')}"
                                    input-allows-imports-from="${schema.properties[fieldName].code_context || ''}"
                                    ${isMultiline ? 'multiline="true"' + (schema.properties[fieldName].code_language ? ' input-is-codemirror="' + (schema.properties[fieldName].code_language) + '"' : '') : ''}
                                >
                                </app-overlay-input>`;
                    }
                } else if (schema.properties[fieldName].type === "number" || schema.properties[fieldName].type === "integer") {
                    return `<app-overlay-input
                                    class="${fieldName}"
                                    label="${escapeHTML(schema.properties[fieldName].title)}" 
                                    title="${escapeHTML(schema.properties[fieldName].description || '')}"
                                    input-is-integer="${schema.properties[fieldName].type === 'integer' ? 'true' : ''}"
                                    input-type="number"
                                    input-number-min="${schema.properties[fieldName].minimum !== undefined ? schema.properties[fieldName].minimum : ''}"
                                    input-number-max="${schema.properties[fieldName].maximum !== undefined ? schema.properties[fieldName].maximum : ''}"
                                    input-data-location="${fieldName}"
                                    input-data-file="${this.currentCharacterFile}"
                                    input-data-type="character"
                                    input-placeholder="${escapeHTML(schema.properties[fieldName].placeholder || '')}"
                                    input-default-value="${escapeHTML(schema.properties[fieldName].default)}"
                                    input-is-percentage="${schema.properties[fieldName].percentage ? 'true' : ''}"
                                    input-number-unit="${schema.properties[fieldName].unit || ''}"
                                >
                                </app-overlay-input>`;
                } else if (
                    schema.properties[fieldName].real_type === "arbitrary_property_object" ||
                    schema.properties[fieldName].real_type === "arbitrary_state_object" ||
                    schema.properties[fieldName].real_type === "known_state_string" ||
                    schema.properties[fieldName].real_type === "arbitrary_object" ||
                    schema.properties[fieldName].real_type === "for_properties_input" ||
                    schema.properties[fieldName].real_type === "arbitrary_emotion_object" ||
                    schema.properties[fieldName].real_type === "not_known_state_string"
                ) {
                    let inputType = "";
                    if (schema.properties[fieldName].real_type === "known_state_string") {
                        inputType = "known_state";
                    } else if (schema.properties[fieldName].real_type === "arbitrary_state_object") {
                        inputType = "state";
                    } else if (schema.properties[fieldName].real_type === "arbitrary_property_object") {
                        inputType = "property";
                    } else if (schema.properties[fieldName].real_type === "arbitrary_object") {
                        inputType = "arbitrary";
                    } else if (schema.properties[fieldName].real_type === "not_known_state_string") {
                        inputType = "not_known_state";
                    } else if (schema.properties[fieldName].real_type === "for_properties_input") {
                        inputType = "for_properties_input";
                    } else if (schema.properties[fieldName].real_type === "arbitrary_emotion_object") {
                        inputType = "emotion";
                    }
                    return `<non-repeat-taglist
                                class="${fieldName}"
                                label="${escapeHTML(schema.properties[fieldName].title)}"
                                title="${escapeHTML(schema.properties[fieldName].description || '')}"
                                input-data-location="${fieldName}"
                                input-data-file="${this.currentCharacterFile}"
                                input-data-type="character"
                                input-type="${inputType}"
                                children-schema='${schema.properties[fieldName].additionalProperties ? escapeHTML(JSON.stringify(schema.properties[fieldName].additionalProperties.properties)) : ""}'
                                input-default-value='${escapeHTML(JSON.stringify(schema.properties[fieldName].default || {}))}'
                            >
                            </non-repeat-taglist>`;
                }
            }).join('');

            return `<app-overlay-section section-title="${escapeHTML(fieldName)}">${fieldsHTML}</app-overlay-section>`;
        }).join('');

        // @ts-expect-error
        this.root.querySelector('app-overlay-tabs').innerHTML = fieldsAsHTML;

        const bondsTagList = this.root.querySelector('non-repeat-taglist.bonds');
        if (bondsTagList) {
            // @ts-expect-error
            bondsTagList.setMoreErrorsFunction((currentValue) => {
                // we are going to check whether there are missing bond gaps or overlaps
                const entries = Object.entries(currentValue);
                const strengthValues = entries.map(entry => {
                    const entryName = entry[0];
                    const minBondValue = entry[1].min_bond_level;
                    const maxBondValue = entry[1].max_bond_level;
                    const min2BondValue = entry[1].min_2nd_bond_level;
                    const max2BondValue = entry[1].max_2nd_bond_level;
                    return [entryName, minBondValue, maxBondValue, min2BondValue, max2BondValue];
                });

                // find overlaps on the first bond levels
                for (let i = 0; i < strengthValues.length; i++) {
                    const [nameA, minA, maxA, min2A, max2A] = strengthValues[i];
                    for (let j = i + 1; j < strengthValues.length; j++) {
                        if (i === j) continue;
                        const [nameB, minB, maxB, min2B, max2B] = strengthValues[j];
                        // check for overlap on both bond levels, the overlap is inclusive of the min value,
                        // so the max of one bond can be the same as the min of another bond without overlapping
                        const overlapOnFirstBond = (minA < maxB) && (maxA > minB);
                        const overlapOnSecondBond = (min2A < max2B) && (max2A > min2B);
                        if (overlapOnFirstBond && overlapOnSecondBond) {
                            return `Bond strength levels for "${nameA}" and "${nameB}" overlap on the primary and secondary bonds.`;
                        }
                    }
                }

                // now we need to check that there are no gaps in the bonds level
                const minBoxBondLevel = -100;
                const maxBoxBondLevel = 100;
                const min2BoxBondLevel = 0;
                const max2BoxBondLevel = 100;

                // Mathematically complete coverage check using sweep line algorithm
                // Collect all unique x-coordinates from rectangle boundaries
                const xCoords = new Set([minBoxBondLevel, maxBoxBondLevel]);
                for (const [name, min1, max1, min2, max2] of strengthValues) {
                    xCoords.add(min1);
                    xCoords.add(max1);
                }
                const sortedXCoords = Array.from(xCoords).sort((a, b) => a - b);
                
                // For each x-interval, check if y-dimension is fully covered
                for (let i = 0; i < sortedXCoords.length - 1; i++) {
                    const xStart = sortedXCoords[i];
                    const xEnd = sortedXCoords[i + 1];
                    
                    // Collect all y-intervals that cover this x-range
                    const yIntervals = [];
                    for (const [name, min1, max1, min2, max2] of strengthValues) {
                        // Rectangle covers this x-range if xStart and xEnd are both within [min1, max1]
                        if (min1 <= xStart && xEnd <= max1) {
                            yIntervals.push([min2, max2]);
                        }
                    }
                    
                    // Sort y-intervals by start point
                    yIntervals.sort((a, b) => a[0] - b[0]);
                    
                    // Check if y-intervals cover [min2BoxBondLevel, max2BoxBondLevel] without gaps
                    let currentY = min2BoxBondLevel;
                    for (const [yStart, yEnd] of yIntervals) {
                        if (yStart > currentY) {
                            // Gap found between currentY and yStart
                            return `Bond strength levels have a gap at x∈[${xStart}, ${xEnd}], y∈[${currentY}, ${yStart}]. Ensure bond ranges touch at boundaries.`;
                        }
                        currentY = Math.max(currentY, yEnd);
                    }
                    
                    if (currentY < max2BoxBondLevel) {
                        // Gap at the end
                        return `Bond strength levels have a gap at x∈[${xStart}, ${xEnd}], y∈[${currentY}, ${max2BoxBondLevel}]. The y-dimension is not fully covered.`;
                    }
                }
                
                return null; // No errors
            });
        }
    }

    async saveCurrent() {
        this.updateCharacterFileOnDisk();
        playConfirmSound();
    }

    async updateCharacterFileOnDisk() {
        // save each field
        await Promise.all(Array.from(this.root.querySelectorAll('app-overlay-input, app-overlay-select, non-repeat-taglist, app-overlay-input-boolean')).map(inputComponent =>
            // @ts-expect-error
            inputComponent.saveValueToUserData()
        ));

        await window.electronAPI.updateCharacterFileFromCache(
            // @ts-ignore
            this.currentCharacterFile
        ).then((characterFileContents) => {
            this.currentCharacterName = characterFileContents.name || this.currentCharacterName;
            // @ts-expect-error
            this.root.querySelector('app-overlay').setAttribute("overlay-title", `Working on: ${JSON.stringify(escapeHTML(this.currentCharacterName))}`);
        });
    }

    render() {
        this.root.innerHTML = `
            <style>
                @import "./components/character.css";
            </style>
            <app-overlay overlay-title="Working on: ${JSON.stringify(escapeHTML(this.currentCharacterName))}" confirm-text="Apply Changes" cancel-text="Go Back" special-button-text="Help">
                <app-overlay-tabs current="${this.currentSectionIndex}" sections='${JSON.stringify(WIZARD_SECTIONS.map(section => section.title))}'>
                </app-overlay-tabs>
            </app-overlay>
        `;
    }
}

customElements.define('app-character', CharacterOverlay);