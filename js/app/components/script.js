import schema from '../schema/script.js';
import { playCancelSound, playConfirmSound, playHoverSound, playPauseSound } from '../sound.js';
import "./non-repeat-taglist.js";

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
 * @type {Array<{title: string, description?: string, fields: Array<[string, Array<string>]>}>}
 */
const WIZARD_SECTIONS = [
    {
        title: "Script Source",
        fields: [
            [
                "Basic Information",
                [
                    "name",
                    "description",
                    "context",
                ],
            ],
            [
                "Script",
                [
                    "script",
                ],
            ]
        ]
    },
    {
        title: "Properties",
        description: "Properties to use in the script as configurable properties.",
        fields: [
            [
                "Configurable Properties",
                [
                    "configurable_properties",
                ],
            ],
            [
                "Freeze Settings",
                [
                    "freeze_states",
                    "freeze_root_properties",
                    "freeze_bonds",
                ],
            ],
        ]
    },
]

class ScriptOverlay extends HTMLElement {
    constructor() {
        super();
        /**
         * @type {ShadowRoot}
         */
        this.root = this.attachShadow({ mode: 'open' });

        this.currentSectionIndex = 0;

        this.onCancel = this.onCancel.bind(this);
    }

    connectedCallback() {
        this.currentScriptFile = this.getAttribute("script-file") || null;
        this.currentScriptName = "";

        if (!this.currentScriptFile) {
            throw new Error("Script file attribute is required for <app-script> component.");
        }
        window.electronAPI.loadValueFromUserData("name", {
            fileName: this.currentScriptFile,
            fileType: "script",
        }).then((name) => {
            if (name) {
                this.currentScriptName = name;
            } else {
                this.currentScriptName = "Unnamed Script";
            }
            // @ts-expect-error
            this.root.querySelector('app-overlay').setAttribute("overlay-title", `Working on: ${JSON.stringify(escapeHTML(this.currentScriptName))}`);
        });

        this.render();
        playPauseSound();
        this.buildChildrenMap();

        // @ts-expect-error
        this.root.querySelector('app-overlay').addEventListener('confirm', () => {
            // check everything is valid
            const someInvalid = Array.from(this.root.querySelectorAll('app-overlay-input, app-overlay-select, non-repeat-taglist, app-overlay-input-boolean')).some(inputComponent => {
                // @ts-expect-error
                inputComponent.hasErrorsPresent();
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
                playCancelSound();
                return;
            } else {
                this.saveCurrent();
            }
        });
        // @ts-expect-error
        this.root.querySelector('app-overlay').addEventListener('cancel', this.onCancel);
        // @ts-expect-error
        this.root.querySelector('app-overlay-tabs').addEventListener('pre-tab-change', (e) => {
            // @ts-ignore
            this.onCheckForUnsavedChanges(null, playConfirmSound, e.detail.denyTabChange, e.detail.executeTabChange, null);
        });
        // @ts-expect-error
        this.root.querySelector('app-overlay-tabs').addEventListener('tab-change', (e) => {
            // @ts-ignore
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

    buildChildrenMap() {
        const sectionToDisplay = WIZARD_SECTIONS[this.currentSectionIndex];

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
                                    input-data-file="${this.currentScriptFile}"
                                    input-data-type="script"
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
                                    input-data-file="${this.currentScriptFile}"
                                    input-data-type="script"
                                    input-placeholder="${escapeHTML(schema.properties[fieldName].placeholder || '')}"
                                    input-default-value="${escapeHTML(schema.properties[fieldName].default || '')}"
                                    input-placeholder-ts="${escapeHTML(schema.properties[fieldName].placeholder_ts || '')}"
                                    ${isMultiline ? 'multiline="true"' + (schema.properties[fieldName].code_language ? ' input-is-codemirror="' + (schema.properties[fieldName].code_language) + '"' : '') : ''}
                                >
                                </app-overlay-input>`;
                    }
                } else if (schema.properties[fieldName].type === "number") {
                    return `<app-overlay-input
                                    class="${fieldName}"
                                    label="${escapeHTML(schema.properties[fieldName].title)}" 
                                    title="${escapeHTML(schema.properties[fieldName].description || '')}"
                                    input-type="number"
                                    input-number-min="${schema.properties[fieldName].minimum !== undefined ? schema.properties[fieldName].minimum : ''}"
                                    input-number-max="${schema.properties[fieldName].maximum !== undefined ? schema.properties[fieldName].maximum : ''}"
                                    input-data-location="${fieldName}"
                                    input-data-file="${this.currentScriptFile}"
                                    input-data-type="script"
                                    input-placeholder="${escapeHTML(schema.properties[fieldName].placeholder || '')}"
                                    input-default-value="${escapeHTML(schema.properties[fieldName].default)}"
                                    input-is-percentage="${schema.properties[fieldName].percentage ? 'true' : ''}"
                                >
                                </app-overlay-input>`;
                } else if (schema.properties[fieldName].type === "boolean") {
                    return `<app-overlay-input-boolean
                                    class="${fieldName}"
                                    label="${escapeHTML(schema.properties[fieldName].title)}" 
                                    title="${escapeHTML(schema.properties[fieldName].description || '')}"
                                    input-data-location="${fieldName}"
                                    input-data-file="${this.currentScriptFile}"
                                    input-data-type="script"
                                    input-default-value="${schema.properties[fieldName].default || ''}"
                                >
                                </app-overlay-input-boolean>`;
                } else if (schema.properties[fieldName].real_type === "arbitrary_property_object" || schema.properties[fieldName].real_type === "arbitrary_state_object") {
                    const childrenSchema = schema.properties[fieldName]?.additionalProperties?.properties;
                    return `<non-repeat-taglist
                                class="${fieldName}"
                                label="${escapeHTML(schema.properties[fieldName].title)}"
                                title="${escapeHTML(schema.properties[fieldName].description || '')}"
                                input-data-location="${fieldName}"
                                input-data-file="${this.currentScriptFile}"
                                input-data-type="script"
                                input-type="${schema.properties[fieldName].real_type === "arbitrary_property_object" ? 'property' : 'state'}"
                                children-schema="${childrenSchema ? escapeHTML(JSON.stringify(childrenSchema)) : ''}"
                            >
                            </non-repeat-taglist>`;
                }
            }).join('');

            return `<app-overlay-section section-title="${escapeHTML(fieldName)}">${fieldsHTML}</app-overlay-section>`;
        }).join('');

        // @ts-ignore
        this.root.querySelector('app-overlay-tabs').innerHTML = fieldsAsHTML;
    }

    async saveCurrent() {
        this.updateScriptFileOnDisk();
        playConfirmSound();
    }

    async updateScriptFileOnDisk() {
        // save each field
        await Promise.all(Array.from(this.root.querySelectorAll('app-overlay-input, app-overlay-select, non-repeat-taglist, app-overlay-input-boolean')).map(inputComponent =>
            // @ts-ignore
            inputComponent.saveValueToUserData()
        ));

        if (!this.currentScriptFile) {
            throw new Error("No script file specified to save.");
        }

        await window.electronAPI.updateScriptFileFromCache(
            this.currentScriptFile
        ).then((scriptFileContents) => {
            this.currentScriptName = scriptFileContents.name || this.currentScriptName;
            // @ts-expect-error
            this.root.querySelector('app-overlay').setAttribute("overlay-title", `Working on: ${JSON.stringify(escapeHTML(this.currentScriptName))}`);
        });
    }

    render() {
        this.root.innerHTML = `
            <style>
                @import "./components/script.css";
            </style>
            <app-overlay overlay-title="Working on: ${JSON.stringify(escapeHTML(this.currentScriptName))}" confirm-text="Apply Changes" cancel-text="Go Back">
                <app-overlay-tabs current="${this.currentSectionIndex}" sections='${JSON.stringify(WIZARD_SECTIONS.map(section => section.title))}'>
                </app-overlay-tabs>
            </app-overlay>
        `;
    }
}

customElements.define('app-script', ScriptOverlay);