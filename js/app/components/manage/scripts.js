import { playCancelSound, playConfirmSound, playHoverSound } from '../../sound.js';
import "../script.js";

class AppManageScripts extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        this.currentContext = this.getAttribute("force-context") || localStorage.getItem('lastScriptContext') || "";
    }

    connectedCallback() {
        this.render();

        // buggy behaviour in this, it wont load properly the value if we do it before render
        this.currentContext = this.getAttribute("force-context") || localStorage.getItem('lastScriptContext') || "";
        if (this.currentContext) {
            this.reloadScripts(this.currentContext);
        } else {
            this.reloadScriptContexts();
        }

        const newButton = this.shadowRoot.querySelector('app-overlay-button');
        if (newButton) newButton.addEventListener('click', async () => {
            const rs = await window.electronAPI.createEmptyScriptFile();
            const overlay = document.createElement("app-script");
            overlay.setAttribute("script-file", rs.scriptFile);
            document.body.appendChild(overlay);
            overlay.addEventListener('close', () => {
                document.body.removeChild(overlay);
                this.reloadCurrentLocation();
            });
        });
        this.shadowRoot.querySelector('.go-back-button-container').addEventListener('click', () => {
            this.onGoBackContext();
        });
        this.shadowRoot.querySelector('.go-back-button-container').addEventListener('mouseenter', () => {
            playHoverSound();
        });
    }

    onGoBackContext() {
        this.shadowRoot.querySelector('.go-back-button-container').classList.add('hidden');
        this.currentContext = "";
        localStorage.removeItem('lastContext');
        playConfirmSound();
        this.reloadScriptContexts();
    }

    reloadCurrentLocation() {
        if (this.currentContext) {
            this.reloadScripts(this.currentContext);
        } else {
            this.reloadScriptContexts();
        }
    }

    async reloadScriptContexts() {
        this.shadowRoot.querySelector('.go-back-button-container').classList.add('hidden');
        // Logic to reload character groups can be added here
        const contexts = await window.electronAPI.listScriptContexts();
        if (contexts.length === 0) {
            const hasNewButton = this.getAttribute("no-new-button") !== "true";

            this.shadowRoot.querySelector('.character-list').innerHTML = `
                <div class="no-scripts-placeholder">
                    You have no scripts yet.${hasNewButton ? ' Click "New Script" to create one.' : ''}
                </div>
            `;
            return;
        } else {
            const contextElements = contexts.map(context => `
                <div class="script-context-item" data-context="${context}">
                    <div class="script-context-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
                            <path fill="#ccc" d="M128 464L512 464C520.8 464 528 456.8 528 448L528 208C528 199.2 520.8 192 512 192L362.7 192C345.4 192 328.5 186.4 314.7 176L276.3 147.2C273.5 145.1 270.2 144 266.7 144L128 144C119.2 144 112 151.2 112 160L112 448C112 456.8 119.2 464 128 464zM512 512L128 512C92.7 512 64 483.3 64 448L64 160C64 124.7 92.7 96 128 96L266.7 96C280.5 96 294 100.5 305.1 108.8L343.5 137.6C349 141.8 355.8 144 362.7 144L512 144C547.3 144 576 172.7 576 208L576 448C576 483.3 547.3 512 512 512z"/>
                        </svg>
                    </div>
                    <div class="script-context-name">
                        ${context}
                    </div>
                </div>
            `).join('');
            this.shadowRoot.querySelector('.script-list').innerHTML = contextElements;

            this.shadowRoot.querySelectorAll('.script-context-item').forEach(item => {
                item.addEventListener('click', (e) => this.onContextSelected(e));
                item.addEventListener('mouseenter', (e) => {
                    playHoverSound();
                    e.currentTarget.querySelector("svg path").setAttribute("fill", "#FF6B6B");
                });
                item.addEventListener('mouseleave', (e) => {
                    e.currentTarget.querySelector("svg path").setAttribute("fill", "#ccc");
                });
            });
        }
    }

    onContextSelected(e) {
        this.shadowRoot.querySelector('.go-back-button-container').classList.remove('hidden');
        this.currentContext = e.currentTarget.dataset.context;
        localStorage.setItem('lastContext', this.currentContext);
        playConfirmSound();
        this.reloadScripts();
    }

    async reloadScripts() {
        // Logic to reload script list can be added here
        if (this.getAttribute("force-context")) {
            this.shadowRoot.querySelector('.go-back-button-container').classList.add('hidden');
        } else {
            this.shadowRoot.querySelector('.go-back-button-container').classList.remove('hidden');
        }

        const scripts = await window.electronAPI.listScriptFiles(this.currentContext);

        if (scripts.length === 0) {
            const hasNewButton = this.getAttribute("no-new-button") !== "true";

            this.shadowRoot.querySelector('.script-list').innerHTML = `
                <div class="no-scripts-placeholder">
                    You have no scripts yet.${hasNewButton ? ' Click "New Script" to create one.' : ''}
                </div>
            `;
            return;
        }

        const scriptElements = scripts.map(scriptFile => `
                <div class="script-item" data-script-file="${scriptFile.file}">
                    <div class="script-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
                            <path fill="#ccc" d="M304 112L192 112C183.2 112 176 119.2 176 128L176 512C176 520.8 183.2 528 192 528L448 528C456.8 528 464 520.8 464 512L464 272L376 272C336.2 272 304 239.8 304 200L304 112zM444.1 224L352 131.9L352 200C352 213.3 362.7 224 376 224L444.1 224zM128 128C128 92.7 156.7 64 192 64L325.5 64C342.5 64 358.8 70.7 370.8 82.7L493.3 205.3C505.3 217.3 512 233.6 512 250.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128z"/>
                        </svg>
                    </div>
                    <div class="script-name">
                        ${scriptFile.name}
                    </div>
                </div>
            `).join('');
        this.shadowRoot.querySelector('.script-list').innerHTML = scriptElements;
        this.shadowRoot.querySelectorAll('.script-item').forEach(item => {
            item.addEventListener('click', (e) => this.onScriptSelected(e));
            item.addEventListener('mouseenter', (e) => {
                playHoverSound();
                e.currentTarget.querySelector("svg path").setAttribute("fill", "#FF6B6B");
            });
            item.addEventListener('mouseleave', (e) => {
                e.currentTarget.querySelector("svg path").setAttribute("fill", "#ccc");
            });
        });
    }

    onScriptSelected(e) {
        if (this.getAttribute("widget-mode")) {
            this.dispatchEvent(new CustomEvent('script-selected', {
                detail: {
                    scriptFile: e.currentTarget.dataset.scriptFile,
                    scriptName: e.currentTarget.querySelector('.script-name').innerText,
                },
                bubbles: true,
                composed: true
            }));
            return;
        }
        const scriptFile = e.currentTarget.dataset.scriptFile;
        const overlay = document.createElement("app-script");
        overlay.setAttribute("script-file", scriptFile);
        document.body.appendChild(overlay);
        overlay.addEventListener('close', () => {
            document.body.removeChild(overlay);
            this.reloadScripts();
        });
    }

    render() {
        const hasNewButton = this.getAttribute("no-new-button") !== "true";
        this.shadowRoot.innerHTML = `
            <style>
               .script-list {
                   display: flex;
                    flex-direction: row;
                    row-gap: 4vh;
                    column-gap: 4vh;
                    flex-wrap: wrap;
               }
                .script-item, .script-context-item {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-direction: column;
                    cursor: pointer;
                }
                .script-icon, .script-context-icon {
                    width: 20vh;
                    height: 20vh;
                }
                .script-name, .script-context-name {
                    font-size: 4vh;
                }
                .script-item:hover .script-name, .script-context-item:hover .script-context-name {
                    color: #FF6B6B;
                }
                .go-back-button-container {
                    font-size: 3vh;
                    color: #ccc;
                    margin-bottom: 4vh;
                    cursor: pointer;
                }
                .go-back-button-container:hover {
                    color: #FF6B6B;
                }
                .go-back-button-container.hidden {
                    display: none;
                }
            </style>
            ${hasNewButton ? '<app-overlay-button play-sound-on-click="false">New Script</app-overlay-button>' : ''}
            <div class="scripts-container">
                <h2>Your Scripts</h2>
                <div class="go-back-button-container">&lt; Back to Contexts</div>
                <div class="script-list">
                    <div class="no-scripts-placeholder">
                        You have no scripts yet.${hasNewButton ? ' Click "New Script" to create one.' : ''}
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('app-manage-scripts', AppManageScripts);