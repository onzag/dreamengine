import { playCancelSound, playConfirmSound, playHoverSound } from '../../sound.js';
import "../script.js";


/**
 * @param {string} namespace 
 * @returns {string}
 */
function namespaceDisplayer(namespace) {
    if (namespace.startsWith('@')) {
        return namespace.slice(1);
    }
    return namespace;
}

/**
 * @param {string} namespace
 * @returns {string}
 */
function namespaceHeaderDisplay(namespace) {
    if (!namespace) return '';
    const isSystem = namespace.startsWith('@');
    const name = namespaceDisplayer(namespace);
    return isSystem ? `/ (System) ${name}` : `/ ${name}`;
}

/**
 * @param {string} name
 * @returns {string}
 */
function formatName(name) {
    return name.replace(/[-_]/g, match => `<wbr><span class="separator">${match}</span>`);
}

class AppManageScripts extends HTMLElement {
    constructor() {
        super();
        /**
         * @type ShadowRoot
         */
        this.root = this.attachShadow({ mode: 'open' });

        this.currentNamespace = localStorage.getItem('lastScriptNamespace') || "";
    }

    connectedCallback() {
        this.render();

        if (this.currentNamespace) {
            // @ts-expect-error
            this.root.querySelector('.namespace-name').textContent = namespaceHeaderDisplay(this.currentNamespace);
        }

        if (this.currentNamespace) {
            this.reloadScripts();
            // @ts-expect-error
            this.root.querySelector('.go-back-button-container').classList.remove('hidden');
        } else {
            this.reloadScriptNamespaces();
            // @ts-expect-error
            this.root.querySelector('.go-back-button-container').classList.add('hidden');
        }

        this.root.querySelector('app-overlay-button')?.addEventListener('click', async () => {
            // TODO new script
        });
        // @ts-expect-error
        this.root.querySelector('.go-back-button-container').addEventListener('click', () => {
            this.onGoBackScriptNamespaces();
        });
        // @ts-expect-error
        this.root.querySelector('.go-back-button-container').addEventListener('mouseenter', () => {
            playHoverSound();
        });
    }

    reloadCurrentLocation() {
        if (this.currentNamespace) {
            this.reloadScripts();
        } else {
            this.reloadScriptNamespaces();
        }
    }

    async reloadScripts() {
        if (this.getAttribute("force-context")) {
            // @ts-expect-error
            this.root.querySelector('.go-back-button-container').classList.add('hidden');
        } else {
            // @ts-expect-error
            this.root.querySelector('.go-back-button-container').classList.remove('hidden');
        }

        const infoMap = await window.ENGINE_WORKER_CLIENT.jsEngineGetInfoMap();

        const infoMapForNamespace = Object.values(infoMap).filter(info => info.namespace === this.currentNamespace && info.type !== "characters" && info.type !== "world");

        if (infoMapForNamespace.length === 0) {
            const hasNewButton = this.getAttribute("no-new-button") !== "true";

            // @ts-expect-error
            this.root.querySelector('.script-list').innerHTML = `
                <div class="no-scripts-placeholder">
                    You have no scripts yet.${hasNewButton ? ' Click "New Script" to create one.' : ''}
                </div>
            `;
            return;
        }

        const scriptElements = infoMapForNamespace.map(scriptInfo => `
                <div class="script-item" data-script-file="${scriptInfo.namespace}/${scriptInfo.id}" data-script-namespace="${scriptInfo.namespace}">
                    <div class="script-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
                            <path fill="#ccc" d="M304 112L192 112C183.2 112 176 119.2 176 128L176 512C176 520.8 183.2 528 192 528L448 528C456.8 528 464 520.8 464 512L464 272L376 272C336.2 272 304 239.8 304 200L304 112zM444.1 224L352 131.9L352 200C352 213.3 362.7 224 376 224L444.1 224zM128 128C128 92.7 156.7 64 192 64L325.5 64C342.5 64 358.8 70.7 370.8 82.7L493.3 205.3C505.3 217.3 512 233.6 512 250.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128z"/>
                        </svg>
                    </div>
                    <div class="script-type">
                        ${scriptInfo.type}
                    </div>
                    <div class="script-name">
                        ${formatName(scriptInfo.id)}
                    </div>
                </div>
            `).join('');
        // @ts-expect-error
        this.root.querySelector('.script-list').innerHTML = scriptElements;
        this.root.querySelectorAll('.script-item').forEach(item => {
            item.addEventListener('click', (e) => this.onScriptSelected(e));
            item.addEventListener('mouseenter', (e) => {
                playHoverSound();
                // @ts-expect-error
                e.currentTarget.querySelector("svg path").setAttribute("fill", "#FF6B6B");
            });
            item.addEventListener('mouseleave', (e) => {
                // @ts-expect-error
                e.currentTarget.querySelector("svg path").setAttribute("fill", "#ccc");
            });
        });
    }

    async reloadScriptNamespaces() {
        const infoMap = await window.ENGINE_WORKER_CLIENT.jsEngineGetInfoMap();
        const allNamespaces = Array.from(new Set(Object.values(infoMap).filter(info => info.type !== "characters" && info.type !== "world").map(info => info.namespace)));
        if (allNamespaces.length === 0) {
            const hasNewButton = this.getAttribute("no-new-button") !== "true";

            // @ts-expect-error
            this.root.querySelector('.script-list').innerHTML = `
                <div class="no-scripts-placeholder">
                    You have no scripts yet.${hasNewButton ? ' Click "New Script" to create one.' : ''}
                </div>
            `;
            return;
        } else {
            const namespaceElements = allNamespaces.map(namespace => `
                <div class="script-namespace-item" data-script-namespace="${namespace}">
                    <div class="script-namespace-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
                            <path fill="#ccc" d="M128 464L512 464C520.8 464 528 456.8 528 448L528 208C528 199.2 520.8 192 512 192L362.7 192C345.4 192 328.5 186.4 314.7 176L276.3 147.2C273.5 145.1 270.2 144 266.7 144L128 144C119.2 144 112 151.2 112 160L112 448C112 456.8 119.2 464 128 464zM512 512L128 512C92.7 512 64 483.3 64 448L64 160C64 124.7 92.7 96 128 96L266.7 96C280.5 96 294 100.5 305.1 108.8L343.5 137.6C349 141.8 355.8 144 362.7 144L512 144C547.3 144 576 172.7 576 208L576 448C576 483.3 547.3 512 512 512z"/>
                        </svg>
                    </div>
                    ${namespace.startsWith('@') ? '<div class="system-label">System</div>' : ''}
                    <div class="script-namespace-name">
                        ${namespaceDisplayer(namespace)}
                    </div>
                </div>
            `).join('');
            // @ts-expect-error
            this.root.querySelector('.script-list').innerHTML = namespaceElements;

            this.root.querySelectorAll('.script-namespace-item').forEach(item => {
                item.addEventListener('click', (e) => this.onScriptNamespaceSelected(e));
                item.addEventListener('mouseenter', (e) => {
                    playHoverSound();
                    // @ts-expect-error
                    e.currentTarget.querySelector("svg path").setAttribute("fill", "#FF6B6B");
                });
                item.addEventListener('mouseleave', (e) => {
                    // @ts-expect-error
                    e.currentTarget.querySelector("svg path").setAttribute("fill", "#ccc");
                });
            });
        }
    }

    /**
     * 
     * @param {Event} e 
     */
    onScriptNamespaceSelected(e) {
        // @ts-expect-error
        this.root.querySelector('.go-back-button-container').classList.remove('hidden');
        // @ts-expect-error
        this.currentNamespace = e.currentTarget.dataset.scriptNamespace;
        // @ts-expect-error
        this.root.querySelector('.namespace-name').textContent = namespaceHeaderDisplay(this.currentNamespace);
        localStorage.setItem('lastScriptNamespace', this.currentNamespace);
        playConfirmSound();
        this.reloadScripts();
    }

    onGoBackScriptNamespaces() {
        // @ts-expect-error
        this.root.querySelector('.go-back-button-container').classList.add('hidden');
        this.currentNamespace = "";
        localStorage.removeItem('lastScriptNamespace');
        playCancelSound();
        this.reloadScriptNamespaces();
        // @ts-expect-error
        this.root.querySelector('.namespace-name').textContent = "";
    }

    /**
     * 
     * @param {Event} e 
     * @returns 
     */
    onScriptSelected(e) {
        if (this.getAttribute("widget-mode")) {
            this.dispatchEvent(new CustomEvent('script-selected', {
                detail: {
                    // @ts-expect-error
                    scriptNamespace: e.currentTarget.dataset.scriptNamespace,
                    // @ts-expect-error
                    scriptFile: e.currentTarget.dataset.scriptFile,
                },
                bubbles: true,
                composed: true
            }));
            return;
        }
        // @ts-expect-error
        const scriptFile = e.currentTarget.dataset.scriptFile;
        const overlay = document.createElement("app-script");
        overlay.setAttribute("script-file", scriptFile);
        document.body.appendChild(overlay);
        overlay.addEventListener('close', () => {
            document.body.removeChild(overlay);
            this.reloadCurrentLocation();
        });
    }

    render() {
        const hasNewButton = this.getAttribute("no-new-button") !== "true";
        this.root.innerHTML = `
            <style>
               .script-list {
                   display: flex;
                    flex-direction: row;
                    row-gap: 4vh;
                    column-gap: 4vh;
                    flex-wrap: wrap;
               }
                .script-item, .script-namespace-item {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-direction: column;
                    cursor: pointer;
                }
                .script-icon, .script-namespace-icon {
                    width: 20vh;
                    height: 20vh;
                }
                .script-type {
                    font-size: 2vh;
                }
                .script-name, .script-namespace-name {
                    font-size: 4vh;
                    overflow-wrap: break-word;
                    word-break: break-word;
                    max-width: 30vh;
                    text-align: center;
                }
                .separator {
                    opacity: 0.2;
                }
                .script-item:hover .script-name, .script-item:hover .script-type, .script-namespace-item:hover .script-namespace-name, .script-namespace-item:hover .system-label {
                    color: #FF6B6B;
                }
                .system-label {
                    font-size: 2vh;
                    opacity: 0.7;
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
                <h2><span>Scripts</span>&nbsp;<span class="namespace-name"></span></h2>
                <div class="go-back-button-container">&lt; Back to Namespaces</div>
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