import { ALL_VARIABLES_FNS } from "../schema/variables.js";

import "../../codemirror/bundle.js";

import { playCancelSound, playConfirmSound, playHoverSound, playPauseSound } from '../sound.js';

// @ts-ignore
const EditorView = window.EditorView;
// @ts-ignore
const basicSetup = window.basicSetup;
// @ts-ignore
const handlebarsLanguage = window.handlebarsLanguage;
// @ts-ignore
const indentWithTab = window.indentWithTab;
// @ts-ignore
const keymap = window.keymap;
// @ts-ignore
const placeholder = window.placeholder;
// @ts-ignore
const getMatchDecorator = window.getMatchDecorator;
// @ts-ignore
const javascriptLanguage = window.javascriptLanguage;
// @ts-ignore
const initializeTVSFS = window.initializeTVSFS;
// @ts-ignore
const tsErrorLinter = window.tsErrorLinter;
// @ts-ignore
const tsComplete = window.tsComplete;
// @ts-ignore
const linter = window.linter;
// @ts-ignore
const tsvfsViewPlugin = window.tsvfsViewPlugin;
// @ts-ignore
const autocompletion = window.autocompletion;
// @ts-ignore
const convertTsToJs = window.convertTsToJs;

let IS_TVSFS_INITIALIZED = false;
/**
 * @type {Promise<void>|null}
 */
let TVSFS_INITIALIZE_PROMISE = null;

const usedMatchDecorator = getMatchDecorator(ALL_VARIABLES_FNS);

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
        // @ts-expect-error
        document.querySelector('.sky').style.display = 'block';
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

        this.saveValueToUserData = this.saveValueToUserData.bind(this);
        this.originalValue = "";

        this.editorInitializedInMode = null;

        this.switchCodeMirrorMode = this.switchCodeMirrorMode.bind(this);
    }

    switchCodeMirrorMode() {
        const newMode = this.editorInitializedInMode === "typescript" ? "handlebars" : "typescript";
        const currentValue = this.editor.state.doc.toString();
        this.editor.destroy();
        this.initializeEditor(newMode, currentValue, false, false);
    }

    /**
     * 
     * @param {string} mode 
     * @param {string} doc 
     * @param {boolean} updateOriginalValue 
     * @param {boolean} allowUseDefault 
     */
    async initializeEditor(mode, doc, updateOriginalValue, allowUseDefault) {
        const extensions = [basicSetup, keymap.of(indentWithTab), null, placeholder(mode === "typescript" ? this.getAttribute("input-placeholder-ts") || this.getAttribute("input-placeholder") : this.getAttribute("input-placeholder")), EditorView.lineWrapping]
        if (mode === "handlebars") {
            extensions[2] = handlebarsLanguage;
            extensions.push(usedMatchDecorator)
        } else if (mode === "typescript") {
            extensions[2] = javascriptLanguage;
            if (!IS_TVSFS_INITIALIZED) {
                if (!TVSFS_INITIALIZE_PROMISE) {
                    TVSFS_INITIALIZE_PROMISE = fetch("../../types/DE.d.ts").then(res => res.text()).then(tsDecls => {
                        IS_TVSFS_INITIALIZED = true;
                        initializeTVSFS(tsDecls);
                    });
                }
                await TVSFS_INITIALIZE_PROMISE;
            }
            extensions.push(linter(tsErrorLinter, {
                delay: 0,
            }));
            extensions.push(autocompletion({ override: [tsComplete] }));
            extensions.push(tsvfsViewPlugin(this));
        }
        if (allowUseDefault && this.getAttribute("input-default-value")) {
            this.editor = new EditorView({
                lineWrapping: true,
                doc: doc || this.getAttribute("input-default-value"),
                extensions,
                parent: this.root.querySelector('.codemirror-wrapper'),
            });
            if (updateOriginalValue) {
                this.originalValue = doc || this.getAttribute("input-default-value") || "";
            }
            this.editorInitializedInMode = mode;
        } else {
            this.editor = new EditorView({
                lineWrapping: true,
                doc: doc || '',
                extensions,
                parent: this.root.querySelector('.codemirror-wrapper'),
            });
            if (updateOriginalValue) {
                this.originalValue = doc || '';
            }
            this.editorInitializedInMode = mode;
        }

        const modeSwitcherButton = this.root.querySelector('.code-mirror-mode-switcher');
        if (modeSwitcherButton) {
            // @ts-expect-error
            modeSwitcherButton.innerText = mode === "typescript" ? "Switch to Handlebars" : "Switch to TypeScript";
        }
    }

    initializeImporter() {
        // Implementation for showcasing the importer
        const importLocation = this.getAttribute("input-allows-imports-from");
        if (!importLocation) {
            return;
        }
        const importButton = this.root.querySelector('.code-mirror-import-button');
        if (!importButton) {
            return;
        }

        importButton.addEventListener('mouseenter', playHoverSound);
        importButton.addEventListener('click', () => {
            const dialog = document.createElement('app-dialog');
            const scriptselector = document.createElement('app-manage-scripts');
            scriptselector.setAttribute('force-context', importLocation);
            scriptselector.setAttribute('no-new-button', 'true');
            scriptselector.setAttribute("widget-mode", "true");
            scriptselector.addEventListener('script-selected', (e) => {
                // @ts-expect-error
                const scriptFile = e.detail.scriptFile;
                // @ts-expect-error
                const scriptName = e.detail.scriptName;
                document.body.removeChild(dialog);
                // @ts-expect-error
                this.root.querySelector('.code-mirror-import-list').innerHTML += `<div class="imported-script-item" data-script-file="${scriptFile}">${scriptName} <span class="remove-import">[remove]</span></div>`;
            });
            dialog.setAttribute('dialog-title', 'Select a Script to Import');
            dialog.appendChild(scriptselector);
            document.body.appendChild(dialog);
            dialog.addEventListener("cancel", () => {
                document.body.removeChild(dialog);
            });
        });
    }

    async connectedCallback() {
        this.render();

        this.initializeImporter();

        const modeSwitcher = this.root.querySelector('.code-mirror-mode-switcher');
        modeSwitcher?.addEventListener('click', this.switchCodeMirrorMode);
        modeSwitcher?.addEventListener('mouseenter', playHoverSound);
        modeSwitcher?.addEventListener('click', playConfirmSound);

        const isNumber = this.getAttribute('input-type') === 'number';
        const isPercentage = this.getAttribute('input-is-percentage') === 'true';
        const isCodeMirror = this.getAttribute('multiline') === 'true' && this.getAttribute("input-is-codemirror");

        if (!isCodeMirror) {
            if (this.getAttribute("input-default-value")) {
                const inputElement = this.root.querySelector('input, textarea');
                if (isNumber) {
                    // @ts-expect-error
                    const numericValue = parseFloat(this.getAttribute("input-default-value"));
                    if (isPercentage) {
                        // @ts-expect-error
                        inputElement.value = (numericValue * 100).toString();
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
                });
            }
        }

        let dataLocation = this.getAttribute('input-data-location');
        const dataLocationOriginal = dataLocation;
        if (isCodeMirror === "typescript") {
            dataLocation += ".ts";
        } else if (isCodeMirror) {
            dataLocation += ".src";
        }

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
                if (isCodeMirror) {
                    const newValue = value.toString();

                    if (isCodeMirror === "typescript") {
                        this.initializeEditor("typescript", newValue, true, true);
                    } else {
                        // check the mode
                        // @ts-ignore
                        window.electronAPI.loadValueFromUserData(dataLocationOriginal + ".js", cacheFile).then((value) => {
                            if (value !== null) {
                                this.initializeEditor("typescript", newValue, true, true);
                            } else {
                                this.initializeEditor("handlebars", newValue, true, true);
                            }
                        });
                    }
                } else {
                    const potentialTextArea = this.root.querySelector('input, textarea');
                    if (isPercentage && isNumber) {
                        const numberValue = parseFloat(value);
                        // @ts-expect-error
                        potentialTextArea.value = (numberValue * 100).toString();
                    } else {
                        // @ts-expect-error
                        potentialTextArea.value = value.toString();
                    }
                    this.originalValue = value.toString();

                    if (potentialTextArea && this.getAttribute('multiline') === 'true') {
                        // @ts-expect-error
                        textarea.style.height = 'auto';
                        // @ts-expect-error
                        textarea.style.height = textarea.scrollHeight + 'px';
                    }
                }
            } else if (isCodeMirror) {
                if (isCodeMirror === "typescript") {
                    this.initializeEditor("typescript", "", true, true);
                } else {
                    this.initializeEditor("handlebars", "", true, true);
                }
            }
        }).catch(err => {
            console.error(err);
        });
    }

    async saveValueToUserData() {
        let value;
        const isCodeMirror = this.getAttribute('multiline') === 'true' && this.getAttribute("input-is-codemirror");

        if (!isCodeMirror) {
            // @ts-expect-error
            value = this.root.querySelector('input, textarea').value;
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
        } else {
            value = this.editor.state.doc.toString();
        }

        const dataLocationOriginal = this.getAttribute('input-data-location');
        let dataLocation = dataLocationOriginal;
        if (isCodeMirror === "typescript") {
            dataLocation += ".ts";
        } else if (isCodeMirror) {
            dataLocation += ".src";
        }

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
        await window.electronAPI.setValueIntoUserData(dataLocation, cacheFile, value);
        const dataLocationJs = dataLocationOriginal + ".js";
        const dataLocationImports = dataLocationOriginal + ".imports";
        if (isCodeMirror === "typescript" || this.editorInitializedInMode === "typescript") {
            // @ts-ignore
            await window.electronAPI.setValueIntoUserData(dataLocationJs, cacheFile, convertTsToJs(value));
            // @ts-ignore
            await window.electronAPI.setValueIntoUserData(dataLocationImports, cacheFile, this.getCurrentImports());
        } else if (isCodeMirror && this.editorInitializedInMode === "handlebars") {
            // @ts-ignore
            await window.electronAPI.setValueIntoUserData(dataLocationJs, cacheFile, null);
            // @ts-ignore
            await window.electronAPI.setValueIntoUserData(dataLocationImports, cacheFile, this.getCurrentImports());
        }
        this.originalValue = value;
    }

    hasBeenModified() {
        const isCodeMirror = this.getAttribute('multiline') === 'true' && this.getAttribute("input-is-codemirror");
        if (isCodeMirror) {
            const currentValue = this.editor.state.doc.toString();
            return currentValue.trim() !== this.originalValue.trim();
        }
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
            return value !== parseFloat(this.originalValue);
        }
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
        const isCodeMirror = this.getAttribute("multiline") === 'true' && this.getAttribute("input-is-codemirror");
        if (isCodeMirror) {
            wrapperClass += " codemirror-wrapper";
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

            if (this.getAttribute('input-is-percentage') === 'true') {
                wrapperClass += ` special-input percent-input`;
            }
            if (this.getAttribute('input-number-unit')) {
                wrapperClass += ` special-input ${this.getAttribute('input-number-unit')}-input`;
            }
        }

        let inputItself = multiline ? `<textarea placeholder="${placeholder}"></textarea>` : `<input type="${type}" placeholder="${placeholder}" ${extraAttributes} />`;
        if (isCodeMirror) {
            inputItself = "";
        }
        let codeMirrorModeSwitcher = "";
        let codeMirrorImporter = "";
        if (isCodeMirror === "typescript") {

        } else if (isCodeMirror) {
            codeMirrorModeSwitcher = `<button class="code-mirror-mode-switcher"></button>`;
        }

        if ((isCodeMirror === "handlebars" || isCodeMirror === "typescript") && this.getAttribute("input-allows-imports-from")) {
            codeMirrorImporter = `<div class="code-mirror-importer"><button class="code-mirror-import-button">Add Script</button><div class="code-mirror-import-list"></div></div>`;
        }

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
            boder-sizing: border-box;
        }
        .error-message {
            font-size: 4vh;
            height: 4vh;
            text-align: left;
            color: #FF6B6B;
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

.input-wrapper.cm-input::after {
  content: 'cm';
}

.input-wrapper.m-input::after {
  content: 'm';
}

.input-wrapper.km-input::after {
  content: 'km';
}

.code-mirror-importer {
    width: 100%;
}
.code-mirror-import-list {
    width: 100%;
}

.code-mirror-mode-switcher, .code-mirror-import-button {
    font-size: 2.5vh;
    background: black;
    color: white;
    border: solid 1px #ccc;
    border-radius: 2px;
    font-family: 'Cabin Sketch', sans-serif;
    padding: 1vh;
    cursor: pointer;
    }
    .code-mirror-mode-switcher:hover, .code-mirror-import-button:hover {
        color: #FF6B6B;
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
    .cm-tooltip-autocomplete, .cm-tooltip {
        background-color: rgba(0, 0, 0, 0.8) !important;
        backdrop-filter: blur(4px) !important;
        border: solid 1px #ccc !important;
        font-family: 'Cabin Sketch', sans-serif !important;
    }
    .cm-tooltip-autocomplete ul::-webkit-scrollbar {
  width: 12px !important;
}

.cm-tooltip-autocomplete ul::-webkit-scrollbar-track {
  background: rgba(100, 0, 200, 0.3) !important;
}

.cm-tooltip-autocomplete ul::-webkit-scrollbar-thumb {
  background: rgba(50, 0, 100, 0.8) !important;
  border: 1px solid #ccc !important;
  border-radius: 6px !important;
}

.cm-tooltip-autocomplete ul::-webkit-scrollbar-thumb:hover {
  background: rgba(70, 0, 140, 0.9) !important;
}

* .cm-tooltip.cm-tooltip-autocomplete > ul, .cm-diagnosticText { font-family: 'Cabin Sketch', sans-serif !important; }

.cm-completionIcon { display: none !important; }

    .cm-editor .cm-cursor, .cm-dropCursor { border-left-color: white !important; background-color: white !important; }
    .cm-specialkeyword { color: #FF6B6B !important; font-weight: bold !important; border: solid 1px #FF6B6B !important; border-radius: 0.3vh !important; }
      </style>
      <div class="overlay-input">
        <label>${label}</label>
        ${codeMirrorImporter}
        ${codeMirrorModeSwitcher}
        <div class="${wrapperClass}" ${isCodeMirror ? 'title=""' : ''}>
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

        this.saveValueToUserData = this.saveValueToUserData.bind(this);
        this.originalValue = "";
    }

    connectedCallback() {
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
                // @ts-expect-error
                this.root.querySelector('select').value = value;
                this.originalValue = value;
            }
        }).catch(err => {
            console.error(err);
        });
    }

    async saveValueToUserData() {
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

        // @ts-ignore
        const value = this.root.querySelector('select').value;
        // @ts-ignore
        await window.electronAPI.setValueIntoUserData(dataLocation, cacheFile, value.trim());
        this.originalValue = value;
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
            font-size: 4vh;
            height: 4vh;
            text-align: left;
            color: #FF6B6B;
        }
      </style>
      <div class="overlay-input">
        <label>${label}</label>
        <select value="">
            ${options.map((opt, index) => `<option value="${opt}" title="${optionsDescriptions[index] || ''}">${opt[0].toUpperCase() + opt.slice(1)}</option>`).join('')}
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