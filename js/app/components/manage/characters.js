class AppManageCharacters extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        this.currentCharacterGroup = localStorage.getItem('lastCharacterGroup') || "";
    }

    connectedCallback() {
        this.render();

        if (this.currentCharacterGroup) {
            this.reloadCharacters();
        } else {
            this.reloadCharacterGroups();
        }

        this.shadowRoot.querySelector('app-overlay-button').addEventListener('click', async () => {
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
    }

    reloadCurrentLocation() {
        if (this.currentCharacterGroup) {
            this.reloadCharacters();
        } else {
            this.reloadCharacterGroups();
        }
    }

    reloadCharacters() {
        // Logic to reload character list can be added here
    }

    async reloadCharacterGroups() {
        // Logic to reload character groups can be added here
        const groups = await window.electronAPI.listCharacterGroups();
        if (groups.length === 0) {
            const hasNewButton = this.getAttribute("no-new-button") !== "true";

            this.shadowRoot.querySelector('.character-list').innerHTML = `
                <div class="no-characters-placeholder">
                    You have no characters yet.${hasNewButton ? ' Click "New Character" to create one.' : ''}
                </div>
            `;
            return;
        } else {
            const groupElements = groups.map(group => `
                <div class="character-group-item" data-character-group="${group}">
                    ${group}
                </div>
            `).join('');
            this.shadowRoot.querySelector('.character-list').innerHTML = groupElements;

            this.shadowRoot.querySelectorAll('.character-group-item').forEach(item => {
                item.addEventListener('click', (e) => this.onCharacterGroupSelected(e));
            });
        }
    }

    onCharacterGroupSelected(e) {
        this.currentCharacterGroup = e.target.data.characterGroup;
        localStorage.setItem('lastCharacterGroup', this.currentCharacterGroup);
        this.reloadCharacters();
    }

    onGoBackCharacterGroups() {
        this.currentCharacterGroup = "";
        localStorage.removeItem('lastCharacterGroup');
        this.reloadCharacterGroups();
    }

    onCharacterSelected(e) {
        this.dispatchEvent(new CustomEvent('character-selected', {
            detail: { characterFile: e.detail.characterFile, characterGroup: e.detail.characterGroup }
        }));
    }

    render() {
        const hasNewButton = this.getAttribute("no-new-button") !== "true";
        this.shadowRoot.innerHTML = `
            <style>
               
            </style>
            ${hasNewButton ? '<app-overlay-button play-sound-on-click="false">New Character</app-overlay-button>' : ''}
            <div class="characters-container">
                <h2>Your Characters</h2>
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