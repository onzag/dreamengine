import { playCancelSound, playConfirmSound, playHoverSound } from '../../sound.js';
import "../profile-image.js";

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

class AppManageCharacters extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });

        this.currentNamespace = localStorage.getItem('lastCharacterNamespace') || "";
    }

    connectedCallback() {
        this.render();

        if (this.currentNamespace) {
            // @ts-expect-error
            this.root.querySelector('.namespace-name').textContent = namespaceHeaderDisplay(this.currentNamespace);
        }

        if (this.currentNamespace) {
            this.reloadCharacters();
            // @ts-expect-error
            this.root.querySelector('.go-back-button-container').classList.remove('hidden');
        } else {
            this.reloadCharacterNamespaces();
            // @ts-expect-error
            this.root.querySelector('.go-back-button-container').classList.add('hidden');
        }

        this.root.querySelector('app-overlay-button')?.addEventListener('click', async () => {
            const overlay = document.createElement("app-character");
            document.body.appendChild(overlay);
            overlay.addEventListener('close', () => {
                document.body.removeChild(overlay);
                this.reloadCurrentLocation();
            });
        });
        // @ts-expect-error
        this.root.querySelector('.go-back-button-container').addEventListener('click', () => {
            this.onGoBackCharacterNamespaces();
        });
        // @ts-expect-error
        this.root.querySelector('.go-back-button-container').addEventListener('mouseenter', () => {
            playHoverSound();
        });
    }

    reloadCurrentLocation() {
        if (this.currentNamespace) {
            this.reloadCharacters();
        } else {
            this.reloadCharacterNamespaces();
        }
    }

    async reloadCharacters() {
        // Logic to reload character list can be added here
        const infoMap = await window.ENGINE_WORKER_CLIENT.jsEngineGetInfoMap();

        const infoMapForNamespace = Object.values(infoMap).filter(info => info.namespace === this.currentNamespace && info.type === "characters");

        const characterElements = infoMapForNamespace.map(characterFile => `
                <div class="character-item" data-character-id="${characterFile.id}" data-character-namespace="${this.currentNamespace}">
                    <div class="character-icon">
                        <app-profile-image image-url="assets/${this.currentNamespace}/${characterFile.id}/profile"></app-profile-image>
                    </div>
                    <div class="character-name">
                        ${formatName(characterFile.id)}
                    </div>
                </div>
            `).join('');
        // @ts-expect-error
        this.root.querySelector('.character-list').innerHTML = characterElements;
        this.root.querySelectorAll('.character-item').forEach(item => {
            item.addEventListener('click', (e) => this.onCharacterSelected(e));
            item.addEventListener('mouseenter', (e) => {
                playHoverSound();
            });
        });
    }

    async reloadCharacterNamespaces() {
        // Logic to reload character groups can be added here
        const infoMap = await window.ENGINE_WORKER_CLIENT.jsEngineGetInfoMap();
        const allNamespaces = Array.from(new Set(Object.values(infoMap).filter(info => info.type === "characters").map(info => info.namespace)));
        if (allNamespaces.length === 0) {
            const hasNewButton = this.getAttribute("no-new-button") !== "true";

            // @ts-expect-error
            this.root.querySelector('.character-list').innerHTML = `
                <div class="no-characters-placeholder">
                    You have no characters yet.${hasNewButton ? ' Click "New Character" to create one.' : ''}
                </div>
            `;
            return;
        } else {
            const namespaceElements = allNamespaces.map(namespace => `
                <div class="character-group-item" data-character-group="${namespace}">
                    <div class="character-group-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
                            <path fill="#ccc" d="M128 464L512 464C520.8 464 528 456.8 528 448L528 208C528 199.2 520.8 192 512 192L362.7 192C345.4 192 328.5 186.4 314.7 176L276.3 147.2C273.5 145.1 270.2 144 266.7 144L128 144C119.2 144 112 151.2 112 160L112 448C112 456.8 119.2 464 128 464zM512 512L128 512C92.7 512 64 483.3 64 448L64 160C64 124.7 92.7 96 128 96L266.7 96C280.5 96 294 100.5 305.1 108.8L343.5 137.6C349 141.8 355.8 144 362.7 144L512 144C547.3 144 576 172.7 576 208L576 448C576 483.3 547.3 512 512 512z"/>
                        </svg>
                    </div>
                    ${namespace.startsWith('@') ? '<div class="system-label">System</div>' : ''}
                    <div class="character-group-name">
                        ${namespaceDisplayer(namespace)}
                    </div>
                </div>
            `).join('');
            // @ts-expect-error
            this.root.querySelector('.character-list').innerHTML = namespaceElements;

            this.root.querySelectorAll('.character-group-item').forEach(item => {
                item.addEventListener('click', (e) => this.onCharacterNamespaceSelected(e));
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
    onCharacterNamespaceSelected(e) {
        // @ts-expect-error
        this.root.querySelector('.go-back-button-container').classList.remove('hidden');
        // @ts-expect-error
        this.currentNamespace = e.currentTarget.dataset.characterGroup;
        // @ts-expect-error
        this.root.querySelector('.namespace-name').textContent = namespaceHeaderDisplay(this.currentNamespace);
        localStorage.setItem('lastCharacterNamespace', this.currentNamespace);
        playConfirmSound();
        this.reloadCharacters();
    }

    onGoBackCharacterNamespaces() {
        // @ts-expect-error
        this.root.querySelector('.go-back-button-container').classList.add('hidden');
        this.currentNamespace = "";
        localStorage.removeItem('lastCharacterNamespace');
        playCancelSound();
        this.reloadCharacterNamespaces();
        // @ts-expect-error
        this.root.querySelector('.namespace-name').textContent = "";
    }

    /**
     * 
     * @param {Event} e 
     * @returns 
     */
    onCharacterSelected(e) {
        if (this.getAttribute("widget-mode")) {
            this.dispatchEvent(new CustomEvent('character-selected', {
                detail: {
                    // @ts-expect-error
                    characterNamespace: e.currentTarget.dataset.characterNamespace,
                    // @ts-expect-error
                    characterId: e.currentTarget.dataset.characterId,
                },
                bubbles: true,
                composed: true
            }));
            return;
        }
        // @ts-expect-error
        const characterId = e.currentTarget.dataset.characterId;
        // @ts-expect-error
        const characterNamespace = e.currentTarget.dataset.characterNamespace;
        const overlay = document.createElement("app-character");
        overlay.setAttribute("character-namespace", characterNamespace);
        overlay.setAttribute("character-id", characterId);
        document.body.appendChild(overlay);
        playConfirmSound();
        overlay.addEventListener('close', () => {
            document.body.removeChild(overlay);
            this.reloadCurrentLocation();
        });
    }

    render() {
        const hasNewButton = this.getAttribute("no-new-button") !== "true";
        this.root.innerHTML = `
            <style>
               .character-list {
                   display: flex;
                    flex-direction: row;
                    row-gap: 4vh;
                    column-gap: 4vh;
                    flex-wrap: wrap;
               }
                .character-group-item, .character-item {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-direction: column;
                    cursor: pointer;
                }
                .character-group-icon, .character-icon {
                    width: 20vh;
                    height: 20vh;
                }
                .character-group-name, .character-name {
                    font-size: 4vh;
                    overflow-wrap: break-word;
                    word-break: break-word;
                    max-width: 30vh;
                    text-align: center;
                }
                .separator {
                    opacity: 0.2;
                }
                .character-group-item:hover .character-group-name, .character-item:hover .character-name, .character-group-item:hover .system-label {
                    color: #FF6B6B;
                }
                .system-label {
                    font-size: 2vh;
                    opacity: 0.7;
                }
                .character-item:hover app-profile-image::part(profile-image-container) {
                    box-shadow: 0 0 2vh #FF6B6B;
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
            ${hasNewButton ? '<app-overlay-button play-sound-on-click="false">New Character</app-overlay-button>' : ''}
            <div class="characters-container">
                <h2><span>Characters</span>&nbsp;<span class="namespace-name"></span></h2>
                <div class="go-back-button-container">&lt; Back to Namespaces</div>
                <div class="character-list">
                    <div class="no-characters-placeholder">
                        You have no characters yet.${hasNewButton ? ' Click "New Character" to create one.' : ''}
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('app-manage-characters', AppManageCharacters);