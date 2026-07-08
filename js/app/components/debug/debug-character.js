/**
 * Debug overlay for inspecting a character's raw engine state.
 *
 * Attributes:
 *  - character-name  The engine-side name of the character to inspect.
 *
 * Usage (inside an app-dialog):
 *   <app-debug-character character-name="Alice"></app-debug-character>
 */
class DebugCharacter extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.render();

        this.retrieveCharacterData();
    }

    async retrieveCharacterData() {
        const info = await window.ENGINE_WORKER_CLIENT.getDebugInfoForCharacter({
            characterName: this.getAttribute('character-name') || '',
        });

        const infoEl = this.root.querySelector('.debug-character-info');
        if (infoEl) {
            infoEl.textContent = info.info;
        }
    }

    render() {
        const name = this.getAttribute('character-name') || '';
        this.root.innerHTML = `
            <style>
                :host {
                    display: block;
                    min-width: 32vw;
                    max-width: 60vw;
                }
                .debug-character-info {
                    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
                    font-size: 1.4vh;
                    line-height: 1.5;
                    white-space: pre-wrap;
                    word-break: break-word;
                    padding: 1vh 1.2vh;
                    background: rgba(0, 0, 0, 0.25);
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    border-radius: 0.6vh;
                    color: #d4f7c5;
                    overflow: auto;
                    max-height: 50vh;
                    user-select: text;
                    -webkit-user-select: text;
                }
            </style>
            <code class="debug-character-info"></code>
        `;
    }
}

customElements.define('app-debug-character', DebugCharacter);
