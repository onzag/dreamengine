import { playConfirmSound, playHoverSound } from "../sound.js";

const XMARK = '&#10005;'; // Unicode multiplication sign (×) for better appearance

class NonRepeatingTagList extends HTMLElement {
    constructor() {
        super();

        /**
         * @type {ShadowRoot}
         */
        this.root = this.attachShadow({ mode: 'open' });

        this.saveValueToUserData = this.saveValueToUserData.bind(this);
        this.addOne = this.addOne.bind(this);
        this.onAddOneClicked = this.addOne.bind(this, null);
        this.checkValue = this.checkValue.bind(this);
        this.hasErrors = false
        /**
         * @type {any}
         */
        this.originalValue = [];
        this.childrenSchema = null;
    }

    /**
     * 
     * @param {string | null} value 
     */
    addOne(value) {
        const container = this.root.querySelector('.input-list-container');
        const tagDiv = document.createElement('div');
        /**
         * @type {string[]}
         */
        const allPossibleValues = JSON.parse(this.getAttribute('all-possible-values') || "[]");
        tagDiv.classList.add('tag');

        if (allPossibleValues.length > 0) {
            // Create a select dropdown
            let optionsHtml = '<option value=""></option>'; // empty option
            allPossibleValues.forEach((possibleValue) => {
                const selectedAttr = (possibleValue === value) ? 'selected' : '';
                optionsHtml += `<option value="${possibleValue.replace(/"/g, '&quot;')}" ${selectedAttr}>${possibleValue}</option>`;
            });
            tagDiv.innerHTML = `<div class="tag-input-container">
        <select>
            ${optionsHtml}
        </select>
        <button class="remove-button">${XMARK}</button>
        </div>
      `;
        } else {
            // Create a text input
            tagDiv.innerHTML = `<div class="tag-input-container">
        <input type="text" value="${value ? value.replace(/"/g, '&quot;') : ''}" />
        <button class="remove-button">${XMARK}</button>
        </div>
      `;
        }
        const removeButton = tagDiv.querySelector('.remove-button');
        // @ts-expect-error
        removeButton.addEventListener('click', () => {
            tagDiv.remove();
            playConfirmSound();
            this.checkValue();
        });
        // @ts-expect-error
        removeButton.title = "Remove this value";
        // @ts-expect-error
        removeButton.addEventListener('mouseenter', () => {
            playHoverSound();
        });
        // @ts-expect-error
        container.appendChild(tagDiv);

        // @ts-expect-error
        tagDiv.querySelector('input').addEventListener('input', () => {
            this.checkValue();
        });

        if (this.childrenSchema) {
            const currentKey = value;

            const childrenSchemaDiv = document.createElement('div');
            childrenSchemaDiv.classList.add('children-schema');
            tagDiv.appendChild(childrenSchemaDiv);
            let finalInnerHTML = "";
            for (const [childKey, childSchema] of Object.entries(this.childrenSchema)) {
                const wholePath = currentKey ? `${this.getAttribute('input-data-location')}.${currentKey}.${childKey}` : "";
                let childHTML = "";

                if (childSchema.type === "string") {
                    if (childSchema.enum) {
                        // It's a select input
                        childHTML = `<app-overlay-select
                                    class="${childKey}"
                                    label="${childSchema.title}" 
                                    title="${childSchema.description || ''}"
                                    input-data-location="${wholePath}"
                                    input-data-file="${this.getAttribute('input-data-file')}"
                                    input-data-type="${this.getAttribute('input-data-type')}"
                                    input-options='${JSON.stringify(childSchema.enum)}'
                                    input-options-descriptions='${JSON.stringify(childSchema.enumDescriptions || [])}'
                                    input-default-value="${childSchema.default || ''}"
                                    input-key="${childKey}"
                                >
                                </app-overlay-select>`;
                    } else {
                        // It's a text input
                        const isMultiline = childSchema.multiline || false;
                        childHTML = `<app-overlay-input
                                    class="${childKey}"
                                    label="${childSchema.title}" 
                                    title="${childSchema.description || ''}" 
                                    input-data-location="${wholePath}"
                                    input-data-file="${this.getAttribute('input-data-file')}"
                                    input-data-type="${this.getAttribute('input-data-type')}"
                                    input-placeholder="${childSchema.placeholder || ''}"
                                    input-default-value="${childSchema.default || ''}"
                                    ${isMultiline ? 'multiline="true"' : ''}
                                    input-key="${childKey}"
                                >
                                </app-overlay-input>`;
                    }
                } else if (childSchema.type === "number") {
                    return `<app-overlay-input
                                    class="${childKey}"
                                    label="${childSchema.title}" 
                                    title="${childSchema.description || ''}"
                                    input-type="number"
                                    input-number-min="${childSchema.minimum !== undefined ? childSchema.minimum : ''}"
                                    input-number-max="${childSchema.maximum !== undefined ? childSchema.maximum : ''}"
                                    input-data-location="${wholePath}"
                                    input-data-file="${this.getAttribute('input-data-file')}"
                                    input-data-type="${this.getAttribute('input-data-type')}"
                                    input-placeholder="${childSchema.placeholder || ''}"
                                    input-default-value="${childSchema.default || ''}"
                                    input-is-percentage="${childSchema.percentage ? 'true' : ''}"
                                    input-key="${childKey}"
                                >
                                </app-overlay-input>`;
                } else if (childSchema.real_type === "arbitrary_property_string_array" || childSchema.real_type === "arbitrary_state_string_array") {
                    return `<non-repeat-taglist
                                class="${childKey}"
                                label="${childSchema.title}"
                                title="${childSchema.description || ''}"
                                input-data-location="${wholePath}"
                                input-data-file="${this.getAttribute('input-data-file')}"
                                input-data-type="${this.getAttribute('input-data-type')}"
                                input-type="${childSchema.real_type === "arbitrary_property_string_array" ? 'property' : 'state'}"
                                input-key="${childKey}"
                            >
                            </non-repeat-taglist>`;
                }

                finalInnerHTML += childHTML;
            }

            childrenSchemaDiv.innerHTML = finalInnerHTML;
        }
    }

    checkValue() {
        const inputs = this.root.querySelectorAll('.tag input, .tag select');

        const isStateInputs = this.getAttribute('input-type') === 'state';
        const isPropertyInputs = this.getAttribute('input-type') === 'property';

        /**
         * @type {string[]}
         */
        const allPossibleValues = JSON.parse(this.getAttribute('all-possible-values') || "[]");

        const seenValues = new Set();
        let hasErrorAll = false;
        let hasInvalidValueErrorAll = false;
        let hasNotFoundValueErrorAll = false;

        inputs.forEach((input) => {
            // @ts-expect-error
            const value = input.value.trim();

            let hasError = false;
            let hasInvalidValueError = false;
            let hasNotFoundValueError = false;

            if (isStateInputs) {
                // validate they can only be uppercase characters, and underscores
                const stateNameRegex = /^[A-Z0-9_]+$/;
                if (!stateNameRegex.test(value) && value !== '') {
                    // Mark as error
                    // @ts-expect-error
                    input.parentElement.classList.add('error');
                    hasInvalidValueError = true;
                } else {
                    // @ts-expect-error
                    input.parentElement.classList.remove('error');
                }
            } else if (isPropertyInputs) {
                // validate they can only be alphanumeric characters and underscores, and cannot start with a number
                const propertyNameRegex = /^[a-z_][a-z0-9_]*$/;
                if (!propertyNameRegex.test(value) && value !== '') {
                    // Mark as error
                    // @ts-expect-error
                    input.parentElement.classList.add('error');
                    hasInvalidValueError = true;
                } else {
                    // @ts-expect-error
                    input.parentElement.classList.remove('error');
                }
            }

            if (allPossibleValues.length > 0 && !allPossibleValues.includes(value) && value !== '') {
                // Mark as error
                // @ts-expect-error
                input.parentElement.classList.add('error');
                hasNotFoundValueError = true;
            }

            const tagDiv = input.parentElement;
            if (seenValues.has(value) && value !== '') {
                // Mark as error
                // @ts-expect-error
                tagDiv.classList.add('error');
                hasError = true;
            } else if (!hasInvalidValueError && !hasNotFoundValueError) {
                // @ts-expect-error
                tagDiv.classList.remove('error');
                seenValues.add(value);
            }

            if (hasInvalidValueError) {
                hasInvalidValueErrorAll = true;
            }
            if (hasError) {
                hasErrorAll = true;
            }
            if (hasNotFoundValueError) {
                hasNotFoundValueErrorAll = true;
            }
        });

        const errorMessageDiv = this.root.querySelector('.error-message');
        if (hasErrorAll) {
            // @ts-expect-error
            errorMessageDiv.textContent = 'Error: Duplicate values are not allowed.';
        } else if (hasInvalidValueErrorAll) {
            if (isStateInputs) {
                // @ts-expect-error
                errorMessageDiv.textContent = 'Error: State names can only contain uppercase letters, numbers, and underscores.';
            } else if (isPropertyInputs) {
                // @ts-expect-error
                errorMessageDiv.textContent = 'Error: Property names must start with a lowercase letter or underscore, and can only contain lowercase letters, numbers, and underscores.';
            }
        } else if (hasNotFoundValueErrorAll) {
            // @ts-expect-error
            errorMessageDiv.textContent = 'Error: Invalid value(s) found, not in the list of possible values.';
        } else {
            // @ts-expect-error
            errorMessageDiv.textContent = '';
        }
        this.hasErrors = hasErrorAll || hasInvalidValueErrorAll || hasNotFoundValueErrorAll;

        if (this.childrenSchema) {
            this.root.querySelectorAll("app-overlay-input, app-overlay-select, non-repeat-taglist").forEach((childInput) => {
                // @ts-expect-error
                const hasError = childInput.checkValue();
                if (hasError) {
                    this.hasErrors = true;
                }
            });
        }
    }

    connectedCallback() {
        this.render();

        const childrenSchemaSrc = this.getAttribute('children-schema');
        if (childrenSchemaSrc) {
            this.childrenSchema = JSON.parse(childrenSchemaSrc);
        }

        // @ts-ignore
        this.root.querySelector('app-overlay-button').addEventListener('button-click', this.onAddOneClicked);

        if (this.getAttribute("input-default-value")) {
            if (childrenSchemaSrc) {
                this.originalValue = JSON.parse(this.getAttribute("input-default-value") || "{}");
            } else {
                this.originalValue = JSON.parse(this.getAttribute("input-default-value") || "[]");
            }
        } else if (childrenSchemaSrc) {
            this.originalValue = {};
        }

        const dataLocation = this.getAttribute('input-data-location');
        if (!dataLocation) {
            throw new Error("input-data-location attribute is required");
        }

        const cacheFile = this.getAttribute("input-data-file") ? {
            fileName: this.getAttribute("input-data-file"),
            fileType: this.getAttribute("input-data-type"),
        } : null;

        if (!cacheFile) {
            throw new Error("input-data-file and input-data-type attributes are required for cached inputs");
        }

        // @ts-ignore
        window.electronAPI.loadValueFromUserData(dataLocation, cacheFile).then((value) => {
            if (value !== null) {
                this.updateWithValue(value);
            } else {
                this.updateWithValue(this.originalValue);
            }
            this.checkValue();
        }).catch(err => {
            console.error(err);
        });
    }

    getValue() {
        const value = this.root.querySelectorAll('.tag:not(.error) input, .tag:not(.error) select');
        /**
         * @type {string[]}
         */
        const valueArray = [];
        value.forEach((input) => {
            // @ts-expect-error
            valueArray.push(input.value.trim());
        });
        if (this.childrenSchema) {
            const valueObject = {};
            const childValues = this.root.querySelectorAll('.tag:not(.error) .children-schema');
            for (let i = 0; i < childValues.length; i++) {
                // @ts-expect-error
                valueObject[valueArray[i]] = {};
                const childInputs = childValues[i].querySelectorAll('app-overlay-input, app-overlay-select, non-repeat-taglist');
                childInputs.forEach((childInput) => {
                    // @ts-expect-error
                    valueObject[valueArray[i]][childInput.getAttribute('input-key')] = childInput.getValue();
                });
            }
            return valueObject;
        }
        return valueArray;
    }

    async saveValueToUserData() {
        if (this.hasErrors) {
            throw new Error("Cannot save value: there are errors present.");
        }
        const cacheFile = this.getAttribute("input-data-file") ? {
            fileName: this.getAttribute("input-data-file"),
            fileType: this.getAttribute("input-data-type"),
        } : null;
        const dataLocation = this.getAttribute('input-data-location');
        if (!dataLocation) {
            throw new Error("input-data-location attribute is required");
        }

        if (!cacheFile) {
            throw new Error("input-data-file and input-data-type attributes are required for cached inputs");
        }

        const value = this.getValue();
        // @ts-ignore
        await window.electronAPI.setValueIntoUserData(dataLocation, cacheFile, value);
        this.originalValue = value;
    }

    hasBeenModified() {
        const value = this.getValue();
        return JSON.stringify(value) !== JSON.stringify(this.originalValue);
    }

    hasErrorsPresent() {
        return this.hasErrors;
    }

    /**
     * 
     * @param {string[]} value 
     */
    updateWithValue(value) {
        this.originalValue = value;

        if (this.childrenSchema) {
            for (const val of Object.keys(value)) {
                this.addOne(val);
            }
        } else {
            for (const val of value) {
                this.addOne(val);
            }
        }
    }

    render() {
        const label = this.getAttribute('label') || 'Input Label';
        const childrenSchemaSrc = this.getAttribute('children-schema');

        this.root.innerHTML = `
      <style>
        .non-repeat-taglist {
            display: block;
            flex-direction: column;
            margin-bottom: 2vh;
            margin-top: 2vh;
            font-size: 4vh;
            width: 100%;
        }
        .non-repeat-taglist label {
            font-size: 4vh;
            margin-bottom: 1vh;
        }
        .input-list, .input-list-container {
            display: flex;
            margin-bottom: 2vh;
            margin-top: 2vh;
            font-size: 4vh;
            flex-wrap: wrap;
        }
            .input-list {
            flex-direction: column;
            }
            .input-list-container {
                row-gap: 1vh;
                column-gap: 1vh;
                flex-direction: row;
                flex-grow: 1;
            }
                .tag {
                display: flex;
                flex-direction: row;
                align-items: center;

                }
        input {
            font-size: 4vh;
            padding: 1vh;
            border-radius: 0.5vh 0 0 0.5vh;
            border: solid 2px #ccc;
            font-family: 'Cabin Sketch', sans-serif;
            font-weight: bold;
            box-shadow: inset 0 0 10px rgba(100,0,200,0.3);
            background-color: rgba(0, 0, 0, 0.9);
            color: white;
            resize: none;
            box-sizing: border-box;
            display: inline-block;
            flex: 1 1 auto;
            height: 6vh;
        }
        select {
            display: inline-block;
            font-size: 4vh;
            box-sizing: border-box;
            padding: 1vh;
            border-radius: 0.5vh 0 0 0.5vh;
            border: solid 2px #ccc;
            font-family: 'Cabin Sketch', sans-serif;
            font-weight: bold;
            box-shadow: inset 0 0 10px rgba(100,0,200,0.3);
            background-color: rgba(0, 0, 0, 0.9);
            color: white;
            appearance: none;
            height: 6vh;
  -webkit-appearance: none;
  -moz-appearance: none;
  background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><path fill="%23ccc" d="M6 9L1 4h10z"/></svg>');
  background-repeat: no-repeat;
  background-position: right 10px center;  /* 10px from right for small gap */
  padding-right: 30px;
  border: 1px solid #ccc;
  cursor: pointer;
  flex: 1 1 auto;
        }
        .error input, .error select {
            border-color: #FF6B6B;
            box-shadow: 0 0 10px rgba(255,107,107,0.8);
        }
  .error-message {
            font-size: 4vh;
            height: 4vh;
            text-align: left;
            color: #FF6B6B;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
        }
            button {
                height: 6vh;
    appearance: none;
    box-sizing: border-box;
    border: solid 2px #ccc;
    border-radius: 0 0.5vh 0.5vh 0;
    background: rgba(0, 0, 0);
    color: white;
    width: 4vh;
    border-left: none;
    font-size: 3vh;
    vertical-align: text-top;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
            }
            button:hover {
                color: #FF6B6B;
            }
            .tag-input-container {
                display: flex;
                flex-direction: row;
                align-items: center;
                justify-content: center;
                flex: 1 1 auto;
            }

            .with-children-schema .tag {
                width: 100%;
                flex-direction: column;
            }
            .with-children-schema .tag-input-container {
                width: 100%;
                margin-bottom: 4vh;
            }
            .with-children-schema .children-schema {
                flex: 1 1 auto;
    padding-left: 10vh;
    width: 100%;
    box-sizing: border-box;
    }

      </style>
      <div class="non-repeat-taglist">
        <label>${label}</label>
        <div class="input-list">
            <div class="input-list-container ${childrenSchemaSrc ? 'with-children-schema' : ''}">
            </div>
            <app-overlay-button>Add Value</app-overlay-button>
        </div>
        <div class="error-message"></div>
      </div>
    `;
    }
}

customElements.define('non-repeat-taglist', NonRepeatingTagList);