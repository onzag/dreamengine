import { playCancelSound, playConfirmSound, playHoverSound } from '../sound.js';

class Overlay extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });

        this.onDocumentKeydown = this.onDocumentKeydown.bind(this);
        this.onCloseOverlay = this.onCloseOverlay.bind(this);
        this.onAcceptDialog = this.onAcceptDialog.bind(this);
        this.onAcceptButtonClick = this.onAcceptButtonClick.bind(this);
        this.onCancelButtonClick = this.onCancelButtonClick.bind(this);
    }

    connectedCallback() {
        this.render();

        // hide stars when overlay is active
        // @ts-expect-error
        document.querySelector('.sky').style.display = 'none';

        document.addEventListener("keydown", this.onDocumentKeydown);

        if (this.root.getElementById('confirm-btn')) {
            // @ts-expect-error
            this.root.getElementById('confirm-btn').addEventListener('click', this.onAcceptButtonClick);
        }
        if (this.root.getElementById('cancel-btn')) {
            // @ts-expect-error
            this.root.getElementById('cancel-btn').addEventListener('click', this.onCancelButtonClick);
        }

        this.root.querySelectorAll('.overlay-buttons div').forEach(btn => {
            btn.addEventListener('mouseenter', playHoverSound);
        });

        const specialButton = this.root.querySelector('.special-button');
        if (specialButton) {
            specialButton.addEventListener('mouseenter', playHoverSound);
            specialButton.addEventListener('click', () => {
                this.dispatchEvent(new CustomEvent('special-button-click'));
            });
        }
    }

    /**
     * 
     * @param {KeyboardEvent} e 
     */
    onDocumentKeydown(e) {
        if (e.key === "Escape") {
            if (document.querySelector('app-dialog')) return;
            // Find the host element that contains this overlay in its shadow DOM
            let host = this;
            while (host.getRootNode() !== document) {
                // @ts-ignore
                host = host.getRootNode().host;
            }
            // Check if this host is the last child of body (topmost overlay)
            const bodyChildren = Array.from(document.body.children);
            if (bodyChildren[bodyChildren.length - 1] !== host) return;
            this.onCloseOverlay();
        }
    }

    onAcceptButtonClick() {
        this.onAcceptDialog();
    }

    onCancelButtonClick() {
        this.onCloseOverlay();
    }

    onCloseOverlay() {
        // dispatch cancel event
        this.dispatchEvent(new CustomEvent('cancel'));
    }

    onAcceptDialog() {
        // dispatch confirm event
        this.dispatchEvent(new CustomEvent('confirm'));
    }

    disconnectedCallback() {
        document.removeEventListener("keydown", this.onDocumentKeydown);
        // only show stars if no other overlay is still active
        const remainingOverlays = document.querySelectorAll('app-character, app-world, app-settings, app-play, app-manage, app-license, app-other-attributions, app-cardtype-wizard');
        if (remainingOverlays.length === 0) {
            // @ts-expect-error
            document.querySelector('.sky').style.display = 'block';
        }
    }

    /**
     * 
     * @param {string} name 
     * @param {string|null} oldValue 
     * @param {string|null} newValue 
     */
    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue && this.root.querySelector('.overlay')) {
            if (name === 'overlay-title') {
                // @ts-expect-error
                this.root.querySelector('.overlay-title-text').innerHTML = newValue;
            } else if (name === 'cancel-text') {
                // @ts-expect-error
                this.root.getElementById('cancel-btn').innerHTML = newValue;
            } else if (name === 'confirm-text') {
                // @ts-expect-error
                this.root.getElementById('confirm-btn').innerHTML = newValue;
            }
        }
    }

    static get observedAttributes() {
        return ['overlay-title', 'cancel-text', 'confirm-text'];
    }

    render() {
        const title = this.getAttribute('overlay-title') || 'Overlay Title';
        const cancelText = this.getAttribute('cancel-text') || null;
        const confirmText = this.getAttribute('confirm-text') || null;
        let specialButtonHTML = "";

        if (this.getAttribute('special-button-text')) {
            specialButtonHTML = `<div class="special-button">${this.getAttribute('special-button-text')}</div>`;
        }

        this.root.innerHTML = `
      <style>
      *::-webkit-scrollbar {
  width: 12px !important;
}

*::-webkit-scrollbar-track {
  background: rgba(100, 0, 200, 0.3) !important;
}

*::-webkit-scrollbar-thumb {
  background: rgba(50, 0, 100, 0.8) !important;
  border: 1px solid #ccc !important;
  border-radius: 6px !important;
}

*::-webkit-scrollbar-thumb:hover {
  background: rgba(70, 0, 140, 0.9) !important;
}
        .overlay {
                position: fixed;
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;
    display: flex;
    justify-content: flex-start;
    flex-direction: column;
    align-items: flex-start;
    background: linear-gradient(
    to bottom,
    #000000 0%,
    #0a0005 8%,
    #0f0008 16%,
    #12000b 24%,
    #150010 35%,
    #1a0015 48%,
    #1f0018 58%,
    #25001d 68%,
    #2a0022 76%,
    #2d0025 82%,
    #30002a 88%,
    #33002f 93%,
    #360033 98%,
    #380035 100%
  );
    color: white;
    z-index: 20;
    box-sizing: border-box;
        }
        .overlay-title {
            font-size: 3vh;
            padding: 2vh 4vh;
            border-bottom: solid 2px #ccc;
            width: 100%;
            background-color: rgba(255,255,255, 0.1);
        }
        .special-button {
        position: fixed;
        background: rgba(0, 0, 0, 1);
        border: solid 2px #ccc;
        padding: 1vw;
        right: 6vh;
        top: 2vh;
        cursor: pointer;
        z-index: 21;
    }
        .special-button:hover {
            color: #FF6B6B;
        }
        .overlay-content {
            flex: 1;
            width: 100%;
            overflow-y: auto;
        }
        .overlay-buttons {
                display: flex;
    justify-content: space-between;
    align-items: flex-end;
    width: 100%;
    padding: 2vh 4vh 2vh 4vh;
    box-sizing: border-box;
    border-top: solid 2px #ccc;
    background-color: rgba(255,255,255, 0.1);
        }
        .overlay-buttons div {
            font-size: 5vh;
            cursor: pointer;
        }
        .overlay-buttons div:hover {
            color: #FF6B6B;
        }
      </style>
      <div class="overlay">
        <div class="overlay-title">
            <div class="overlay-title-text">
                ${title}
            </div>
            ${specialButtonHTML}
        </div>
        <div class="overlay-content">
            <slot></slot>
        </div>
        <div class="overlay-buttons">
                ${cancelText ? `<div id="cancel-btn">${cancelText}</div>` : ''}
                ${confirmText ? `<div id="confirm-btn">${confirmText}</div>` : ''}
            </div>
      </div>
    `;
    }
}

customElements.define('app-overlay', Overlay);

class OverlaySection extends HTMLElement {
    constructor() {
        super();
        /**
         * @type {ShadowRoot}
         */
        this.root = this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.render();
    }

    render() {
        this.root.innerHTML = `
      <style>
        .overlay-section {
            padding: 4vh;
            border-bottom: solid 1px #ccc;
        }
        .section-title h2 {
            margin: 0;
            font-size: 3vh;
            margin-bottom: 2vh;
        }
        .section-content {
            font-size: 2vh;
        }
      </style>
      <div class="overlay-section">
        <div class="section-title">
            <h2>${this.getAttribute('section-title') || 'Section Title'}</h2>
        </div>
        <div class="section-content">
            <slot></slot>
        </div>
      </div>
    `;
    }
}

class OverlayInput extends HTMLElement {
    constructor() {
        super();
        /**
         * @type {ShadowRoot}
         */
        this.root = this.attachShadow({ mode: 'open' });
        this.checkValue = this.checkValue.bind(this);

        this.originalValue = "";
    }

    async connectedCallback() {
        this.render();

        const isNumber = this.getAttribute('input-type') === 'number';
        const isPercentage = this.getAttribute('input-is-percentage') === 'true';
        const isInteger = this.getAttribute('input-is-integer') === 'true';

        const inputElement = this.root.querySelector('input, textarea');

        const dataLocation = this.getAttribute('input-data-location');
        const dataValue = dataLocation ? await window.API.getConfigValue(dataLocation) : null;

        // @ts-expect-error
        inputElement.addEventListener('input', this.checkValue);

        if (dataValue === null && this.getAttribute("input-default-value")) {
            if (isNumber) {
                // @ts-expect-error
                const numericValue = parseFloat(this.getAttribute("input-default-value"));
                if (isPercentage) {
                    // @ts-expect-error
                    inputElement.value = (numericValue * 100).toString();
                } else if (isInteger) {
                    // @ts-expect-error
                    inputElement.value = Math.round(numericValue).toString();
                } else {
                    // @ts-expect-error
                    inputElement.value = numericValue.toString();
                }
            } else {
                // @ts-expect-error
                inputElement.value = this.getAttribute("input-default-value");
            }
            // @ts-expect-error
            this.originalValue = this.getAttribute("input-default-value");
        } else if (dataValue !== null) {
            if (isNumber) {
                if (isPercentage) {
                    // @ts-expect-error
                    inputElement.value = (dataValue * 100).toString();
                } else if (isInteger) {
                    // @ts-expect-error
                    inputElement.value = Math.round(numericValue).toString();
                } else {
                    // @ts-expect-error
                    inputElement.value = dataValue.toString();
                }
            } else {
                // @ts-expect-error
                inputElement.value = dataValue.toString();
            }

            this.originalValue = dataValue;
        }

        const textarea = this.root.querySelector('textarea');
        if (textarea) {
            // Measure placeholder height
            textarea.value = textarea.placeholder;
            textarea.style.height = 'auto';
            const placeholderHeight = textarea.scrollHeight;
            textarea.style.minHeight = placeholderHeight + 'px';
            textarea.value = '';  // Clear it

            textarea.addEventListener('input', function () {
                this.style.height = 'auto';
                this.style.height = this.scrollHeight + 'px';
                this.dispatchEvent(new Event('input-detected', { bubbles: true }));
            });
        }

        const input = this.root.querySelector('input');
        if (input) {
            if (this.getAttribute('input-enforce-lowercase') === 'true') {
                input.addEventListener('input', () => {
                    const pos = input.selectionStart;
                    input.value = input.value.toLowerCase();
                    input.selectionStart = pos;
                    input.selectionEnd = pos;
                });
            }
            input.addEventListener('input', () => {
                this.dispatchEvent(new Event('input-detected', { bubbles: true }));
            });
        }
    }

    hasErrorsPresent() {
        return this.hasError;
    }

    checkValue() {
        const min = this.getAttribute('input-number-min');
        const max = this.getAttribute('input-number-max');
        const isPercentage = this.getAttribute('input-is-percentage') === 'true';
        let hasError = false;
        let errorMessage = "";
        if (this.getAttribute('input-type') === 'number') {
            // @ts-expect-error
            let value = parseFloat(this.root.querySelector('input').value);
            if (isNaN(value)) {
                value = 0;
            }
            if (isPercentage) {
                value = value / 100;
            }
            if (min !== null && min !== '' && value < parseFloat(min)) {
                hasError = true;
                if (isPercentage) {
                    errorMessage = `Value must be at least ${parseFloat(min) * 100}%.`;
                } else {
                    errorMessage = `Value must be at least ${min}.`;
                }
            }
            if (max !== null && max !== '' && value > parseFloat(max)) {
                hasError = true;
                if (isPercentage) {
                    errorMessage = `Value must be at most ${parseFloat(max) * 100}%.`;
                } else {
                    errorMessage = `Value must be at most ${max}.`;
                }
            }
            const isInteger = this.getAttribute('input-is-integer') === 'true';
            if (isInteger && !Number.isInteger(value)) {
                hasError = true;
                errorMessage = `Value must be an integer.`;
            }
        } else {
            const minLength = this.getAttribute('input-minlength');
            const maxLength = this.getAttribute('input-maxlength');
            // @ts-expect-error
            const value = this.root.querySelector('input, textarea').value;
            if (minLength !== null && minLength !== '' && value.length < parseInt(minLength)) {
                hasError = true;
                errorMessage = `Value must be at least ${minLength} characters long.`;
            }
            if (maxLength !== null && maxLength !== '' && value.length > parseInt(maxLength)) {
                hasError = true;
                errorMessage = `Value must be at most ${maxLength} characters long.`;
            }
        }

        // @ts-expect-error
        this.root.querySelector('.error-message').innerHTML = errorMessage;
        this.hasError = hasError;
    }

    getValue() {
        const isNumber = this.getAttribute('input-type') === 'number';
        const isInteger = this.getAttribute('input-is-integer') === 'true';
        const isPercentage = this.getAttribute('input-is-percentage') === 'true';
        if (isNumber) {
            // @ts-expect-error
            let value = parseFloat(this.root.querySelector('input').value);
            if (isNaN(value)) {
                value = 0;
            }
            if (isPercentage) {
                value = value / 100;
            }
            if (isInteger) {
                value = Math.round(value);
            }
            return value;
        }
        // @ts-expect-error
        return this.root.querySelector('input, textarea').value;
    }

    hasBeenModified() {
        // @ts-expect-error
        const currentValue = this.root.querySelector('input, textarea').value;
        if (this.getAttribute('input-type') === 'number') {
            const isPercentage = this.getAttribute('input-is-percentage') === 'true';
            let value = parseFloat(currentValue);
            if (isNaN(value)) {
                value = 0;
            }
            if (isPercentage) {
                value = value / 100;
            }
            return value !== (parseFloat(this.originalValue) || 0);
        }
        return currentValue.trim() !== this.originalValue.trim();
    }

    async saveValueToUserData() {
        if (!this.hasBeenModified()) {
            return;
        }
        const dataLocation = this.getAttribute('input-data-location');
        if (!dataLocation) {
            return;
        }
        // @ts-expect-error
        const currentValue = this.root.querySelector('input, textarea').value;
        let actualValue = currentValue.trim();
        if (this.getAttribute('input-type') === 'number') {
            const isPercentage = this.getAttribute('input-is-percentage') === 'true';
            let value = parseFloat(currentValue);
            if (isNaN(value)) {
                value = 0;
            }
            if (isPercentage) {
                value = value / 100;
            }
            actualValue = value;
        }
        await window.API.setConfigValue(dataLocation, actualValue);
    }

    render() {
        const label = this.getAttribute('label') || 'Input Label';
        const type = this.getAttribute('input-type') || 'text';
        const placeholder = this.getAttribute('input-placeholder') || '';
        const multiline = this.getAttribute('multiline') === 'true';
        let wrapperClass = "input-wrapper";
        if (multiline) {
            wrapperClass += " textarea-wrapper";
        }

        let extraAttributes = "";
        if (type === 'number') {
            const min = this.getAttribute('input-number-min');
            const max = this.getAttribute('input-number-max');
            const step = this.getAttribute('input-number-step');
            if (step !== null && step !== '') {
                extraAttributes += ` step="${step}"`;
            }
            if (min !== null && min !== '') {
                extraAttributes += ` min="${min}"`;
            }
            if (max !== null && max !== '') {
                extraAttributes += ` max="${max}"`;
            }

            if (this.getAttribute('input-is-integer') === 'true') {
                extraAttributes += ` step="1"`;
            }

            if (this.getAttribute('input-is-percentage') === 'true') {
                wrapperClass += ` special-input percent-input`;
            }
            if (this.getAttribute('input-number-unit')) {
                wrapperClass += ` special-input ${this.getAttribute('input-number-unit')}-input`;
            }
        }

        let inputItself = multiline ? `<textarea placeholder="${placeholder}"></textarea>` : `<input type="${type}" placeholder="${placeholder}" ${extraAttributes} />`;

        this.root.innerHTML = `
      <style>
        .overlay-input {
            display: flex;
            flex-direction: column;
            margin-bottom: 2vh;
            margin-top: 2vh;
            font-size: 4vh;
        }
        .overlay-input label {
            font-size: 4vh;
            margin-bottom: 1vh;
        }
        .overlay-input input, .overlay-input textarea {
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
        }
        .error-message {
            font-size: 2vh;
            height: 4vh;
            text-align: left;
            color: #FF6B6B;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
        }
            .hidden {
                display: none;
            }

        input::-webkit-inner-spin-button,
input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

input {
    box-sizing: border-box;
}

.input-wrapper {
    position: relative;
    display: block;
    width: 100%;
    margin: 0;
    padding: 0;
}

.input-wrapper input, .input-wrapper textarea {
    width: 100%;
    box-sizing: border-box;
}

.input-wrapper.special-input::after {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: #FF6B6B;
  font-weight: bold;
}

.input-wrapper.percent-input::after {
  content: '%';
}

.input-wrapper.L-input::after {
  content: 'Liters';
}

.input-wrapper.kcal-input::after {
  content: 'kcal';
}

.input-wrapper.aura-input::after {
  content: 'aura';
}

.input-wrapper.mps-input::after {
  content: 'm/s';
}

.input-wrapper.kg-input::after {
  content: 'kg';
}

.input-wrapper.cm-input::after {
  content: 'cm';
}

.input-wrapper.m-input::after {
  content: 'm';
}

.input-wrapper.km-input::after {
  content: 'km';
}

.input-wrapper.min-input::after {
  content: 'minutes';
}

.input-wrapper.hour-input::after {
  content: 'hours';
}
      </style>
      <div class="overlay-input">
        <label>${label}</label>
        <div class="${wrapperClass}">
            ${inputItself}
        </div>
        <div class="error-message"></div>
      </div>
    `;
    }
}

class OverlayInputSelect extends HTMLElement {
    constructor() {
        super();

        /**
         * @type {ShadowRoot}
         */
        this.root = this.attachShadow({ mode: 'open' });

        this.originalValue = "";
        this.readyPromise = new Promise((resolve) => {
            this._resolveReady = resolve;
        });
    }

    isReady() {
        return this.readyPromise;
    }

    hasErrorsPresent() {
        return false;
    }

    checkValue() {
        return;
    }

    async connectedCallback() {
        this.render();

        if (this.getAttribute("input-default-value")) {
            const inputElement = this.root.querySelector('select');
            // @ts-expect-error
            inputElement.value = this.getAttribute("input-default-value");
            // @ts-expect-error
            this.originalValue = this.getAttribute("input-default-value");
        } else {
            // @ts-expect-error
            this.originalValue = this.root.querySelector('select').value;
        }

        const dataLocation = this.getAttribute('input-data-location');
        if (!dataLocation) {
            // @ts-ignore
            this._resolveReady();
            return;
        }

        const dataValue = await window.API.getConfigValue(dataLocation);
        if (dataValue !== null && dataValue !== undefined) {
            const selectElement = this.root.querySelector('select');
            // @ts-expect-error
            selectElement.value = dataValue.toString();
            this.originalValue = dataValue.toString();
        }

        // @ts-ignore
        this._resolveReady();
    }

    async saveValueToUserData() {
        if (!this.hasBeenModified()) {
            return;
        }
        const dataLocation = this.getAttribute('input-data-location');
        if (!dataLocation) {
            return;
        }
        // @ts-expect-error
        const currentValue = this.root.querySelector('select').value;
        await window.API.setConfigValue(dataLocation, currentValue);
    }

    getValue() {
        // @ts-expect-error
        return this.root.querySelector('select').value;
    }

    hasBeenModified() {
        // @ts-expect-error
        const currentValue = this.root.querySelector('select').value;
        return currentValue.trim() !== this.originalValue.trim();
    }

    render() {
        const label = this.getAttribute('label') || 'Input Label';

        /**
         * @type {string[]}
         */
        const options = JSON.parse(this.getAttribute('input-options') || '[]');
        const optionsDescriptions = JSON.parse(this.getAttribute('input-options-descriptions') || '[]');

        this.root.innerHTML = `
      <style>
        .overlay-input {
            display: flex;
            flex-direction: column;
            margin-bottom: 2vh;
            margin-top: 2vh;
            font-size: 4vh;
        }
        .overlay-input label {
            font-size: 4vh;
            margin-bottom: 1vh;
        }
        .overlay-input select {
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
            font-size: 2vh;
            height: 4vh;
            text-align: left;
            color: #FF6B6B;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
        }
      </style>
      <div class="overlay-input">
        <label>${label}</label>
        <select value="">
            ${options.map((opt, index) => `<option value="${opt}" title="${optionsDescriptions[index] || ''}">${opt.split("_").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")}</option>`).join('')}
        </select>
        <div class="error-message"></div>
      </div>
    `;
    }
}

class OverlayInputWarning extends HTMLElement {
    constructor() {
        super();
        /**
         * @type {ShadowRoot}
         */
        this.root = this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.render();
    }

    render() {
        this.root.innerHTML = `
      <style>
        .overlay-input-warning {
            font-size: 2vh;
            color: #FF6B6B;
            margin-bottom: 2vh;
            border: solid 1px #FF6B6B;
            padding: 1vh;
            border-radius: 0.5vh;
            background-color: rgba(255, 107, 107, 0.1);
        }
      </style>
      <div class="overlay-input-warning">
        <slot></slot>
      </div>
    `;
    }
}

customElements.define('app-overlay-select', OverlayInputSelect);
customElements.define('app-overlay-input-warning', OverlayInputWarning);
customElements.define('app-overlay-input', OverlayInput);
customElements.define('app-overlay-section', OverlaySection);

class OverlayListInput extends HTMLElement {
    constructor() {
        super();
        /**
         * @type {ShadowRoot}
         */
        this.root = this.attachShadow({ mode: 'open' });
        /**
         * @type {string[]}
         */
        this.items = [];
        /**
         * @type {string[]}
         */
        this.originalItems = [];
    }

    async connectedCallback() {
        const dataLocation = this.getAttribute('input-data-location');
        const dataValue = dataLocation ? await window.API.getConfigValue(dataLocation) : null;

        if (dataValue !== null && Array.isArray(dataValue)) {
            this.items = [...dataValue];
        } else if (this.getAttribute('input-default-value')) {
            try {
                // @ts-ignore
                this.items = JSON.parse(this.getAttribute('input-default-value'));
            } catch (e) {
                this.items = [];
            }
        }

        this.originalItems = [...this.items];
        this.render();
    }

    hasErrorsPresent() {
        return false;
    }

    getValue() {
        return [...this.items];
    }

    hasBeenModified() {
        if (this.items.length !== this.originalItems.length) return true;
        return this.items.some((item, i) => item !== this.originalItems[i]);
    }

    async saveValueToUserData() {
        if (!this.hasBeenModified()) {
            return;
        }
        const dataLocation = this.getAttribute('input-data-location');
        if (!dataLocation) {
            return;
        }
        await window.API.setConfigValue(dataLocation, [...this.items]);
    }

    addItem() {
        const input = this.root.querySelector('.new-item-input');
        // @ts-expect-error
        const value = input.value.trim();
        if (!value) return;

        const enforceLowercase = this.getAttribute('input-enforce-lowercase') === 'true';
        this.items.push(enforceLowercase ? value.toLowerCase() : value);
        // @ts-expect-error
        input.value = '';
        this.renderItems();
        this.dispatchEvent(new Event('input-detected', { bubbles: true }));
    }

    /**
     * 
     * @param {number} index 
     */
    removeItem(index) {
        this.items.splice(index, 1);
        this.renderItems();
        this.dispatchEvent(new Event('input-detected', { bubbles: true }));
    }

    renderItems() {
        const list = this.root.querySelector('.list-items');
        if (!list) return;
        list.innerHTML = this.items.map((item, index) => `
            <div class="list-item">
                <span class="list-item-text">${item}</span>
                <button class="remove-btn" data-index="${index}">✕</button>
            </div>
        `).join('');

        list.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // @ts-expect-error
                const index = parseInt(e.target.dataset.index);
                this.removeItem(index);
            });
        });
    }

    render() {
        const label = this.getAttribute('label') || 'List Input';
        const placeholder = this.getAttribute('input-placeholder') || 'Add item...';

        this.root.innerHTML = `
      <style>
        .overlay-input {
            display: flex;
            flex-direction: column;
            margin-bottom: 2vh;
            margin-top: 2vh;
            font-size: 4vh;
        }
        .overlay-input label {
            font-size: 4vh;
            margin-bottom: 1vh;
        }
        .overlay-input input {
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
            flex: 1;
            min-width: 0;
        }
        .add-row {
            display: flex;
            gap: 1vh;
            align-items: center;
        }
        .add-btn, .remove-btn {
            font-size: 3vh;
            padding: 0.5vh 1.5vh;
            border-radius: 0.5vh;
            border: solid 1px #ccc;
            font-family: 'Cabin Sketch', sans-serif;
            font-weight: bold;
            background-color: rgba(0, 0, 0, 0.9);
            color: white;
            cursor: pointer;
            box-shadow: inset 0 0 10px rgba(100,0,200,0.3);
        }
        .add-btn:hover, .remove-btn:hover {
            background-color: rgba(100, 0, 200, 0.3);
        }
        .list-items {
            display: flex;
            flex-direction: column;
            gap: 0.5vh;
            margin-top: 1vh;
        }
        .list-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0.8vh 1vh;
            border-radius: 0.5vh;
            border: solid 1px #555;
            background-color: rgba(0, 0, 0, 0.7);
            color: white;
            font-size: 3.5vh;
        }
        .list-item-text {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .remove-btn {
            font-size: 2.5vh;
            padding: 0.3vh 1vh;
            margin-left: 1vh;
            color: #FF6B6B;
            border-color: #FF6B6B;
            flex-shrink: 0;
        }
      </style>
      <div class="overlay-input">
        <label>${label}</label>
        <div class="add-row">
            <input class="new-item-input" type="text" placeholder="${placeholder}" />
            <button class="add-btn">+</button>
        </div>
        <div class="list-items"></div>
      </div>
    `;

        this.root.querySelector('.add-btn')?.addEventListener('click', () => this.addItem());
        this.root.querySelector('.new-item-input')?.addEventListener('keydown', (e) => {
            // @ts-expect-error
            if (e.key === 'Enter') {
                e.preventDefault();
                this.addItem();
            }
        });

        if (this.getAttribute('input-enforce-lowercase') === 'true') {
            const input = this.root.querySelector('.new-item-input');
            input?.addEventListener('input', () => {
                // @ts-expect-error
                const pos = input.selectionStart;
                // @ts-expect-error
                input.value = input.value.toLowerCase();
                // @ts-expect-error
                input.selectionStart = pos;
                // @ts-expect-error
                input.selectionEnd = pos;
            });
        }

        this.renderItems();
    }
}

customElements.define('app-overlay-list-input', OverlayListInput);

class OverlayTabs extends HTMLElement {
    constructor() {
        super();
        /**
         * @type {ShadowRoot}
         */
        this.root = this.attachShadow({ mode: 'open' });

        this.onTabClick = this.onTabClick.bind(this);
    }

    connectedCallback() {
        this.render();

        this.root.querySelectorAll('.tab').forEach((tab, index) => {
            tab.addEventListener('click', (e) => {
                if (!tab.classList.contains('active')) {
                    this.onTabClick(index);
                } else {
                    playCancelSound();
                }
            });
            tab.addEventListener('mouseenter', playHoverSound);
        });
    }

    /**
     * 
     * @param {number} index 
     * @returns 
     */
    onTabClick(index) {
        let allowsTabChange = true;
        const executeTabChange = () => {
            this.dispatchEvent(new CustomEvent('tab-change', {
                detail: {
                    newIndex: index
                }
            }));
            this.root.querySelectorAll('.tab').forEach((tab, tabIndex) => {
                if (tabIndex === index) {
                    tab.classList.add('active');
                } else {
                    tab.classList.remove('active');
                }
            });
        }
        this.dispatchEvent(new CustomEvent('pre-tab-change', {
            detail: {
                newIndex: index,
                denyTabChange: () => {
                    allowsTabChange = false;
                },
                executeTabChange,
            }
        }));

        if (!allowsTabChange) {
            return;
        }
        executeTabChange();
    }

    render() {
        /**
         * @type {string[]}
         */
        const sections = JSON.parse(this.getAttribute('sections') || '[]');
        // @ts-expect-error
        const current = parseInt(this.getAttribute('current')) || 0;

        this.root.innerHTML = `
      <style>
        .tabs {
            display: flex;
            border-bottom: solid 2px #ccc;
            background-color: rgba(255,255,255, 0.1);
            overflow-x: auto;
        }
            .tabs::-webkit-scrollbar {
  height: 12px !important;
}

.tabs::-webkit-scrollbar-track {
  background: rgba(100, 0, 200, 0.3) !important;
}

.tabs::-webkit-scrollbar-thumb {
  background: rgba(50, 0, 100, 0.8) !important;
  border: 1px solid #ccc !important;
  border-radius: 6px !important;
}

.tabs::-webkit-scrollbar-thumb:hover {
  background: rgba(70, 0, 140, 0.9) !important;
}
        .tab {
            padding: 2vh 4vh;
            font-size: 3vh;
            cursor: pointer;
            white-space: nowrap;
        }
        .tab.active {
            border-bottom: solid 4px #FF6B6B;
            font-weight: bold;
        }
        .tab:hover {
            color: #FF6B6B;
        }
      </style>
      <div class="tabs-container">
      <div class="tabs">
        ${sections.map((section, index) => `
            <div class="tab ${index === current ? 'active' : ''}">${section}</div>
        `).join('')}
      </div>
      <slot></slot>
      </div>
    `;
    }
}

customElements.define('app-overlay-tabs', OverlayTabs);

class OverlayButton extends HTMLElement {
    constructor() {
        super();
        /**
         * @type {ShadowRoot}
         */
        this.root = this.attachShadow({ mode: 'open' });

        this.onButtonClick = this.onButtonClick.bind(this);
    }

    connectedCallback() {
        this.render();

        // @ts-expect-error
        this.root.querySelector('div').addEventListener('click', this.onButtonClick);
        // @ts-expect-error
        this.root.querySelector('div').addEventListener('mouseenter', playHoverSound);
    }

    static get observedAttributes() {
        return ['disabled'];
    }

    /**
     * 
     * @param {string} name 
     * @param {string|null} oldValue 
     * @param {string|null} newValue 
     */
    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'disabled') {
            const div = this.root.querySelector('div');
            if (div) {
                div.className = `overlay-button${newValue === 'true' ? ' disabled' : ''}`;
            }
        }
    }

    onButtonClick() {
        this.dispatchEvent(new CustomEvent('button-click'));
        if (this.getAttribute('play-sound-on-click') === 'false') {
            return;
        }
        playConfirmSound();
    }

    render() {
        this.root.innerHTML = `
      <style>
        .overlay-button {
            padding: 2vh 4vh;
            font-size: 3vh;
            cursor: pointer;
            border: solid 2px #ccc;
            border-radius: 0.5vh;
            background-color: rgba(255,255,255, 0.1);
            text-align: center;
            user-select: none;
            display: inline-block;
        }
        .overlay-button:hover {
            color: #FF6B6B;
        }
        .overlay-button.disabled {
            cursor: not-allowed;
            opacity: 0.5;
        }
        .overlay-button.disabled:hover {
            color: inherit;
        }
      </style>
      <div class="overlay-button${this.getAttribute('disabled') === 'true' ? ' disabled' : ''}">
        <slot></slot>
      </div>
    `;
    }
}

customElements.define('app-overlay-button', OverlayButton);

class OverlayInputBoolean extends HTMLElement {
    constructor() {
        super();
        /**
         * @type {ShadowRoot}
         */
        this.root = this.attachShadow({ mode: 'open' });
        this.onCheckboxChange = this.onCheckboxChange.bind(this);
        this.originalValue = false;
        this.readyPromise = new Promise((resolve) => {
            this._resolveReady = resolve;
        });
    }

    isReady() {
        return this.readyPromise;
    }

    checkValue() {
        return;
    }
    connectedCallback() {
        this.render();
        const inputElement = this.root.querySelector('input[type="checkbox"]');
        if (this.getAttribute("input-default-value") === "true") {
            // @ts-expect-error
            inputElement.checked = true;
            this.originalValue = true;
        }
        // @ts-expect-error
        inputElement.addEventListener('change', () => {
            this.onCheckboxChange();
            this.dispatchEvent(new Event('input-detected', { bubbles: true }));
        });

        const dataLocation = this.getAttribute('input-data-location');
        if (!dataLocation) {
            // @ts-ignore
            this._resolveReady();
            return;
        }

        const cacheFile = this.getAttribute("input-data-file") ? {
            fileName: this.getAttribute("input-data-file"),
            fileType: this.getAttribute("input-data-type"),
        } : null;

        // @ts-ignore
        window.electronAPI.loadValueFromUserData(dataLocation, cacheFile).then((value) => {
            if (value !== null) {
                const boolValue = value === true || value === "true";
                // @ts-expect-error
                inputElement.checked = boolValue;
                this.originalValue = boolValue;
            }
            // @ts-ignore
            this._resolveReady();
        });
    }
    onCheckboxChange() {
        this.dispatchEvent(new CustomEvent('input-change'));
    }
    getValue() {
        const inputElement = this.root.querySelector('input[type="checkbox"]');
        // @ts-expect-error
        return inputElement.checked;
    }
    hasBeenModified() {
        const inputElement = this.root.querySelector('input[type="checkbox"]');
        // @ts-expect-error
        return inputElement.checked !== this.originalValue;
    }
    hasErrorsPresent() {
        return false;
    }
    render() {
        const label = this.getAttribute('label') || 'Input Label';
        this.root.innerHTML = `
      <style>
        .overlay-input-boolean {
            display: flex;
            align-items: center;
            margin-bottom: 2vh;
            margin-top: 2vh;
            font-size: 4vh;
        }
        .overlay-input-boolean label {
            font-size: 4vh;
            margin-left: 1vh;
            user-select: none;
        }
        .overlay-input-boolean input[type="checkbox"] {
            width: 4vh;
            height: 4vh;
            cursor: pointer;
        }
      </style>
      <div class="overlay-input-boolean">
        <input type="checkbox" />
        <label>${label}</label>
      </div>
    `;
    }
}

customElements.define('app-overlay-input-boolean', OverlayInputBoolean);