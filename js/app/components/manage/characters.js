import { playCancelSound, playConfirmSound, playHoverSound } from '../../sound.js';

class AppManageCharacters extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });

        this.currentCharacterGroup = localStorage.getItem('lastCharacterGroup') || "";
    }

    connectedCallback() {
        this.render();

        if (this.currentCharacterGroup) {
            this.reloadCharacters();
            // @ts-expect-error
            this.root.querySelector('.go-back-button-container').classList.remove('hidden');
        } else {
            this.reloadCharacterGroups();
            // @ts-expect-error
            this.root.querySelector('.go-back-button-container').classList.add('hidden');
        }

        // @ts-expect-error
        this.root.querySelector('app-overlay-button').addEventListener('click', async () => {
            const rs = await window.electronAPI.createEmptyCharacterFile();
            const overlay = document.createElement("app-character");
            overlay.setAttribute("character-group", rs.group);
            overlay.setAttribute("character-file", rs.characterFile);
            document.body.appendChild(overlay);
            overlay.addEventListener('close', () => {
                document.body.removeChild(overlay);
                this.reloadCurrentLocation();
            });
        });
        // @ts-expect-error
        this.root.querySelector('.go-back-button-container').addEventListener('click', () => {
            this.onGoBackCharacterGroups();
        });
        // @ts-expect-error
        this.root.querySelector('.go-back-button-container').addEventListener('mouseenter', () => {
            playHoverSound();
        });
    }

    reloadCurrentLocation() {
        if (this.currentCharacterGroup) {
            this.reloadCharacters();
        } else {
            this.reloadCharacterGroups();
        }
    }

    async reloadCharacters() {
        // Logic to reload character list can be added here
        const charactersForGroup = await window.electronAPI.listCharacterFiles(this.currentCharacterGroup);
        
        const characterElements = charactersForGroup.map(characterFile => `
                <div class="character-item" data-character-file="${characterFile.file}" data-character-group="${this.currentCharacterGroup}">
                    <div class="character-icon">
                        <app-profile-image image-url="character-assets/${characterFile.file}/profile"></app-profile-image>
                    </div>
                    <div class="character-name">
                        ${characterFile.name}
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

    async reloadCharacterGroups() {
        // Logic to reload character groups can be added here
        const groups = await window.electronAPI.listCharacterGroups();
        if (groups.length === 0) {
            const hasNewButton = this.getAttribute("no-new-button") !== "true";

            // @ts-expect-error
            this.root.querySelector('.character-list').innerHTML = `
                <div class="no-characters-placeholder">
                    You have no characters yet.${hasNewButton ? ' Click "New Character" to create one.' : ''}
                </div>
            `;
            return;
        } else {
            const groupElements = groups.map(group => `
                <div class="character-group-item" data-character-group="${group}">
                    <div class="character-group-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
                            <path fill="#ccc" d="M128 464L512 464C520.8 464 528 456.8 528 448L528 208C528 199.2 520.8 192 512 192L362.7 192C345.4 192 328.5 186.4 314.7 176L276.3 147.2C273.5 145.1 270.2 144 266.7 144L128 144C119.2 144 112 151.2 112 160L112 448C112 456.8 119.2 464 128 464zM512 512L128 512C92.7 512 64 483.3 64 448L64 160C64 124.7 92.7 96 128 96L266.7 96C280.5 96 294 100.5 305.1 108.8L343.5 137.6C349 141.8 355.8 144 362.7 144L512 144C547.3 144 576 172.7 576 208L576 448C576 483.3 547.3 512 512 512z"/>
                        </svg>
                    </div>
                    <div class="character-group-name">
                        ${group}
                    </div>
                </div>
            `).join('');
            // @ts-expect-error
            this.root.querySelector('.character-list').innerHTML = groupElements;

            this.root.querySelectorAll('.character-group-item').forEach(item => {
                item.addEventListener('click', (e) => this.onCharacterGroupSelected(e));
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
    onCharacterGroupSelected(e) {
        // @ts-expect-error
        this.root.querySelector('.go-back-button-container').classList.remove('hidden');
        // @ts-expect-error
        this.currentCharacterGroup = e.currentTarget.dataset.characterGroup;
        localStorage.setItem('lastCharacterGroup', this.currentCharacterGroup);
        playConfirmSound();
        this.reloadCharacters();
    }

    onGoBackCharacterGroups() {
        // @ts-expect-error
        this.root.querySelector('.go-back-button-container').classList.add('hidden');
        this.currentCharacterGroup = "";
        localStorage.removeItem('lastCharacterGroup');
        playCancelSound();
        this.reloadCharacterGroups();
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
                    characterGroup: e.currentTarget.dataset.characterGroup,
                    // @ts-expect-error
                    characterFile: e.currentTarget.dataset.characterFile,
                },
                bubbles: true,
                composed: true
            }));
            return;
        }
        // @ts-expect-error
        const characterFile = e.currentTarget.dataset.characterFile;
        // @ts-expect-error
        const characterGroup = e.currentTarget.dataset.characterGroup;
        const overlay = document.createElement("app-character");
        overlay.setAttribute("character-group", characterGroup);
        overlay.setAttribute("character-file", characterFile);
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
                }
                .character-group-item:hover .character-group-name, .character-item:hover .character-name {
                    color: #FF6B6B;
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
                <h2>Your Characters</h2>
                <div class="go-back-button-container">&lt; Back to Groups</div>
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