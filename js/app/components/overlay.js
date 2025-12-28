const hoverSound = document.getElementById('hoverSound');
const confirmSound = document.getElementById('confirmSound');
const cancelSound = document.getElementById('cancelSound');
import { ALL_VARIABLES_FNS } from "../schema/variables.js";

import "../../codemirror/bundle.js";

const EditorView = window.EditorView;
const basicSetup = window.basicSetup;
const handlebarsLanguage = window.handlebarsLanguage;
const indentWithTab = window.indentWithTab;
const keymap = window.keymap;
const placeholder = window.placeholder;
const getMatchDecorator = window.getMatchDecorator;

const usedMatchDecorator = getMatchDecorator(ALL_VARIABLES_FNS);

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

class Overlay extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        this.onDocumentKeydown = this.onDocumentKeydown.bind(this);
        this.onCloseOverlay = this.onCloseOverlay.bind(this);
        this.onAcceptDialog = this.onAcceptDialog.bind(this);
        this.onAcceptButtonClick = this.onAcceptButtonClick.bind(this);
        this.onCancelButtonClick = this.onCancelButtonClick.bind(this);
    }

    connectedCallback() {
        this.render();

        // hide stars when overlay is active
        document.querySelector('.sky').style.display = 'none';

        document.addEventListener("keydown", this.onDocumentKeydown);

        this.shadowRoot.getElementById('confirm-btn').addEventListener('click', this.onAcceptButtonClick);
        this.shadowRoot.getElementById('cancel-btn').addEventListener('click', this.onCancelButtonClick);

        this.shadowRoot.querySelectorAll('.overlay-buttons div').forEach(btn => {
            btn.addEventListener('mouseenter', playHoverSound);
        });

        const specialButton = this.shadowRoot.querySelector('.special-button');
        if (specialButton) {
            specialButton.addEventListener('mouseenter', playHoverSound);
            specialButton.addEventListener('click', () => {
                this.dispatchEvent(new CustomEvent('special-button-click'));
            });
        }
    }

    onDocumentKeydown(e) {
        if (e.key === "Escape") {
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
        // show stars when overlay is inactive
        document.querySelector('.sky').style.display = 'block';
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue && this.shadowRoot.querySelector('.overlay')) {
            if (name === 'overlay-title') {
                this.shadowRoot.querySelector('.overlay-title-text').innerHTML = newValue;
            } else if (name === 'cancel-text') {
                this.shadowRoot.getElementById('cancel-btn').innerHTML = newValue;
            } else if (name === 'confirm-text') {
                this.shadowRoot.getElementById('confirm-btn').innerHTML = newValue;
            }
        }
    }

    static get observedAttributes() {
        return ['overlay-title', 'cancel-text', 'confirm-text'];
    }

    render() {
        const title = this.getAttribute('overlay-title') || 'Overlay Title';
        const cancelText = this.getAttribute('cancel-text') || 'Cancel';
        const confirmText = this.getAttribute('confirm-text') || 'Confirm';
        let specialButtonHTML = "";

        if (this.getAttribute('special-button-text')) {
            specialButtonHTML = `<div class="special-button">${this.getAttribute('special-button-text')}</div>`;
        }

        this.shadowRoot.innerHTML = `
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
                <div id="cancel-btn">${cancelText}</div>
                <div id="confirm-btn">${confirmText}</div>
            </div>
      </div>
    `;
    }
}

customElements.define('app-overlay', Overlay);

class OverlaySection extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.render();
    }

    render() {
        this.shadowRoot.innerHTML = `
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
        this.attachShadow({ mode: 'open' });

        this.saveValueToUserData = this.saveValueToUserData.bind(this);
        this.originalValue = "";
    }

    connectedCallback() {
        this.render();

        const isNumber = this.getAttribute('input-type') === 'number';
        const isPercentage = this.getAttribute('input-is-percentage') === 'true';
        const isCodeMirror = this.getAttribute("input-is-codemirror") === "true" && this.getAttribute('multiline') === 'true';

        if (!isCodeMirror) {
            if (this.getAttribute("input-default-value")) {
                const inputElement = this.shadowRoot.querySelector('input, textarea');
                if (isNumber) {
                    const numericValue = parseFloat(this.getAttribute("input-default-value"));
                    if (isPercentage) {
                        inputElement.value = (numericValue * 100).toString();
                    } else {
                        inputElement.value = numericValue.toString();
                    }
                } else {
                    inputElement.value = this.getAttribute("input-default-value");
                }
                this.originalValue = this.getAttribute("input-default-value");
            }

            const textarea = this.shadowRoot.querySelector('textarea');
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
                });
            }
        } else {
            if (this.getAttribute("input-default-value")) {
                this.editor = new EditorView({
                    lineWrapping: true,
                    doc: this.getAttribute("input-default-value"),
                    extensions: [basicSetup, keymap.of(indentWithTab), handlebarsLanguage, placeholder(this.getAttribute("input-placeholder")), EditorView.lineWrapping, usedMatchDecorator],
                    parent: this.shadowRoot.querySelector('.codemirror-wrapper'),
                });
                this.originalValue = this.getAttribute("input-default-value");
            } else {
                this.editor = new EditorView({
                    lineWrapping: true,
                    extensions: [basicSetup, keymap.of(indentWithTab), handlebarsLanguage, placeholder(this.getAttribute("input-placeholder")), EditorView.lineWrapping, usedMatchDecorator],
                    parent: this.shadowRoot.querySelector('.codemirror-wrapper'),
                });
            }
        }

        window.electronAPI.loadValueFromUserData(this.getAttribute('input-data-location'), this.getAttribute("input-data-character-file")).then((value) => {
            if (value !== null) {
                if (isCodeMirror) {
                    this.editor.dispatch({
                        changes: { from: 0, to: this.editor.state.doc.length, insert: value.toString() }
                    });
                    this.originalValue = value.toString();
                } else {
                    const potentialTextArea = this.shadowRoot.querySelector('input, textarea');
                    if (isPercentage && isNumber) {
                        const numberValue = parseFloat(value);
                        potentialTextArea.value = (numberValue * 100).toString();
                    } else {
                        potentialTextArea.value = value.toString();
                    }
                    this.originalValue = value.toString();

                    if (potentialTextArea && this.getAttribute('multiline') === 'true') {
                        textarea.style.height = 'auto';
                        textarea.style.height = textarea.scrollHeight + 'px';
                    }
                }
            }
        });
    }

    async saveValueToUserData() {
        let value = this.shadowRoot.querySelector('input, textarea').value;
        const type = this.getAttribute('input-type') || 'text';
        const isPercentage = this.getAttribute('input-is-percentage') === 'true';
        if (type === 'number') {
            value = parseFloat(value);
            if (isNaN(value)) {
                value = 0;
            }
            if (isPercentage) {
                value = value / 100;
            }
        }
        await window.electronAPI.setValueIntoUserData(this.getAttribute('input-data-location'), this.getAttribute("input-data-character-file"), value);
    }

    hasBeenModified() {
        const currentValue = this.shadowRoot.querySelector('input').value;
        return currentValue.trim() !== this.originalValue.trim();
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
        let isCodeMirror = false;
        if (this.getAttribute("input-is-codemirror") === "true" && multiline) {
            wrapperClass += " codemirror-wrapper";
            isCodeMirror = true;
        }

        let extraAttributes = "";
        if (type === 'number') {
            const min = this.getAttribute('input-number-min');
            const max = this.getAttribute('input-number-max');
            if (min !== null && min !== '') {
                extraAttributes += ` min="${min}"`;
            }
            if (max !== null && max !== '') {
                extraAttributes += ` max="${max}"`;
            }

            if (this.getAttribute('input-is-percentage') === 'true') {
                wrapperClass += ` percent-input`;
            }
        }

        let inputItself = multiline ? `<textarea placeholder="${placeholder}"></textarea>` : `<input type="${type}" placeholder="${placeholder}" ${extraAttributes} />`;
        if (isCodeMirror) {
            inputItself = "";
        }

        this.shadowRoot.innerHTML = `
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
            font-size: 4vh;
            height: 4vh;
            text-align: left;
            color: #FF6B6B;
        }
            input::-webkit-inner-spin-button,
input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.input-wrapper {
    position: relative;
    display: block;
    width: 100%;
    margin: 0;
    padding: 0;
}

.input-wrapper input, .input-wrapper textarea {
    width: 100%   
}

.input-wrapper.percent-input::after {
  content: '%';
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: #FF6B6B;
  font-weight: bold;
}
  
.cm-gutterElement, .cm-gutters {
    background-color: rgba(0, 0, 0, 0.9) !important;
    color: white !important;
}
.cm-gutters {
    border-right: none !important;
    border-radius: 0.5vh 0 0 0.5vh !important;
}
.cm-editor {
    border-radius: 0.5vh !important;
    box-shadow: inset 0 0 10px rgba(100,0,200,0.3) !important;
    background-color: rgba(255, 255, 255, 0.05) !important;
    border: solid 1px #ccc !important;
    font-family: 'Cabin Sketch', sans-serif !important;
    caret-color: white !important;
}
.cm-line {
font-family: 'Cabin Sketch', sans-serif !important;
}
.cm-gutterElement {
font-family: 'Cabin Sketch', sans-serif !important;
}
.cm-activeLine {
    background-color: rgba(0, 0, 0, 0.3) !important;
    caret-color: white !important;
}
.ͼb {
    color: rgb(219, 112, 236) !important;
}
.ͼi {
    color: rgb(135, 206, 250) !important;
}
    .cm-editor .cm-cursor, .cm-dropCursor { border-left-color: white !important; background-color: white !important; }
    .cm-specialkeyword { color: #FF6B6B !important; font-weight: bold !important; border: solid 1px #FF6B6B !important; border-radius: 0.3vh !important; }
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
        this.attachShadow({ mode: 'open' });

        this.saveValueToUserData = this.saveValueToUserData.bind(this);
        this.originalValue = "";
    }

    connectedCallback() {
        this.render();

        if (this.getAttribute("input-default-value")) {
            const inputElement = this.shadowRoot.querySelector('input, textarea');
            inputElement.value = this.getAttribute("input-default-value");
            this.originalValue = this.getAttribute("input-default-value");
        }

        window.electronAPI.loadValueFromUserData(this.getAttribute('input-data-location'), this.getAttribute("input-data-character-file")).then((value) => {
            if (value !== null) {
                this.shadowRoot.querySelector('select').value = value;
                this.originalValue = value;
            }
        });
    }

    async saveValueToUserData() {
        const value = this.shadowRoot.querySelector('select').value;
        await window.electronAPI.setValueIntoUserData(this.getAttribute('input-data-location'), this.getAttribute("input-data-character-file"), value.trim());
    }

    hasBeenModified() {
        const currentValue = this.shadowRoot.querySelector('select').value;
        return currentValue.trim() !== this.originalValue.trim();
    }

    render() {
        const label = this.getAttribute('label') || 'Input Label';

        const options = JSON.parse(this.getAttribute('input-options') || '[]');

        this.shadowRoot.innerHTML = `
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
            font-size: 4vh;
            height: 4vh;
            text-align: left;
            color: #FF6B6B;
        }
      </style>
      <div class="overlay-input">
        <label>${label}</label>
        <select value="">
            ${options.map(opt => `<option value="${opt}">${opt[0].toUpperCase() + opt.slice(1)}</option>`).join('')}
        </select>
        <div class="error-message"></div>
      </div>
    `;
    }
}

class OverlayInputWarning extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.render();
    }

    render() {
        this.shadowRoot.innerHTML = `
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

class OverlayTabs extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        this.onTabClick = this.onTabClick.bind(this);
    }

    connectedCallback() {
        this.render();

        this.shadowRoot.querySelectorAll('.tab').forEach((tab, index) => {
            tab.addEventListener('click', (e) => {
                if (!tab.classList.contains('active')) {
                    this.onTabClick(index);
                    playConfirmSound();
                } else {
                    playCancelSound();
                }
            });
            tab.addEventListener('mouseenter', playHoverSound);
        });
    }

    onTabClick(index) {
        const current = parseInt(this.getAttribute('current')) || 0;
        this.dispatchEvent(new CustomEvent('tab-change', {
            detail: {
                newIndex: index
            }
        }));
        this.shadowRoot.querySelectorAll('.tab').forEach((tab, tabIndex) => {
            if (tabIndex === index) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
    }

    render() {
        const sections = JSON.parse(this.getAttribute('sections') || '[]');
        const current = parseInt(this.getAttribute('current')) || 0;

        this.shadowRoot.innerHTML = `
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