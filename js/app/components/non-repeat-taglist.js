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
         * @type {string[]}
         */
        this.originalValue = [];
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
            tagDiv.innerHTML = `
        <select>
            ${optionsHtml}
        </select>
        <button class="remove-button">x</button>
      `;
        } else {
            // Create a text input
            tagDiv.innerHTML = `
        <input type="text" value="${value ? value.replace(/"/g, '&quot;') : ''}" />
        <button class="remove-button">x</button>
      `;
        }
        const removeButton = tagDiv.querySelector('.remove-button');
        // @ts-expect-error
        removeButton.addEventListener('click', () => {
            tagDiv.remove();
            this.checkValue();
        });
        // @ts-expect-error
        container.appendChild(tagDiv);

        // @ts-expect-error
        tagDiv.querySelector('input').addEventListener('change', () => {
            this.checkValue();
        });
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
                const propertyNameRegex = /^[A-Za-z_][A-Za-z0-9_]*$/;
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
                errorMessageDiv.textContent = 'Error: Property names must start with a letter or underscore, and can only contain letters, numbers, and underscores.';
            }
        } else if (hasNotFoundValueErrorAll) {
            // @ts-expect-error
            errorMessageDiv.textContent = 'Error: Invalid value(s) found, not in the list of possible values.';
        } else {
            // @ts-expect-error
            errorMessageDiv.textContent = '';
        }
        this.hasErrors = hasErrorAll || hasInvalidValueErrorAll || hasNotFoundValueErrorAll;
    }

    connectedCallback() {
        this.render();

        // @ts-ignore
        this.root.querySelector('overlay-button').addEventListener('button-click', this.onAddOneClicked);

        if (this.getAttribute("input-default-value")) {
            // @ts-expect-error
            this.originalValue = JSON.parse(this.getAttribute("input-default-value"));
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
                this.originalValue = value;
            }
        }).catch(err => {
            console.error(err);
        });
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

        const value = this.root.querySelectorAll('.tag:not(.error) input, .tag:not(.error) select');
        /**
         * @type {string[]}
         */
        const valueArray = [];
        value.forEach((input) => {
            // @ts-expect-error
            valueArray.push(input.value.trim());
        });
        // @ts-ignore
        await window.electronAPI.setValueIntoUserData(dataLocation, cacheFile, valueArray);
        this.originalValue = valueArray;
    }

    hasBeenModified() {
        const value = this.root.querySelectorAll('.tag:not(.error) input, .tag:not(.error) select');
        /**
         * @type {string[]}
         */
        const valueArray = [];
        value.forEach((input) => {
            // @ts-expect-error
            valueArray.push(input.value.trim());
        });

        return JSON.stringify(valueArray) !== JSON.stringify(this.originalValue);
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
    }

    render() {
        const label = this.getAttribute('label') || 'Input Label';

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
        .input-list {
            display: flex;
            flex-direction: row;
            margin-bottom: 2vh;
            margin-top: 2vh;
            font-size: 4vh;
            flex-wrap: wrap;
        }
        input {
            font-size: 4vh;
            padding: 1vh;
            border-radius: 0.5vh;
            border: solid 1px #ccc;
            font-family: 'Cabin Sketch', sans-serif;
            font-weight: bold;
            box-shadow: inset 0 0 10px rgba(100,0,200,0.3);
            background-color: rgba(0, 0, 0, 0.9);
            color: white;
            resize: none;
            boder-sizing: border-box;
            display: inline-block;
        }
        select {
            display: inline-block;
            font-size: 4vh;
            padding: 1vh;
            border-radius: 0.5vh;
            border: solid 1px #ccc;
            font-family: 'Cabin Sketch', sans-serif;
            font-weight: bold;
            box-shadow: inset 0 0 10px rgba(100,0,200,0.3);
            background-color: rgba(0, 0, 0, 0.9);
            color: white;
            appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><path fill="%23ccc" d="M6 9L1 4h10z"/></svg>');
  background-repeat: no-repeat;
  background-position: right 10px center;  /* 10px from right for small gap */
  padding-right: 30px;
  border: 1px solid #ccc;
  cursor: pointer;
        }
  .error-message {
            font-size: 4vh;
            height: 4vh;
            text-align: left;
            color: #FF6B6B;
        }
      </style>
      <div class="non-repeat-taglist">
        <label>${label}</label>
        <div class="input-list">
            <div class="input-list-container">
            </div>
            <overlay-button>Add Value</overlay-button>
        </div>
        <div class="error-message"></div>
      </div>
    `;
    }
}

customElements.define('non-repeat-taglist', NonRepeatingTagList);