import './debug-json.js';

/**
 * Debug overlay for inspecting a single message box (narration or dialogue
 * block) within an app-game-message.
 *
 * Attributes:
 *  - gid          The message GID.
 *  - sender-name  The sender's display name (empty for story-master narration).
 *  - index        0-based index of this box within the parent message.
 *
 * Usage (inside an app-dialog):
 *   <app-debug-message gid="123" sender-name="Alice" index="2"></app-debug-message>
 */
class DebugMessage extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.render();
        this.retrieveMessageData();
    }

    async retrieveMessageData() {
        const gid = this.getAttribute('gid') || '';
        const index = this.getAttribute('index') || '0';
        const realId = `${gid}__${index}`;
        const jsonEl = /** @type {any} */ (this.root.querySelector('.debug-message-json'));
        try {
            const info = await window.ENGINE_WORKER_CLIENT.getDebugInfoForMessage({
                message__debug_id: realId,
            });
            if (jsonEl) {
                jsonEl.setJSON(info ?? { error: `No debug info found for GID "${gid}" index "${index}"` });
            }
        } catch (err) {
            if (jsonEl) jsonEl.setJSON({ error: String(err) });
        }
    }

    render() {
        this.root.innerHTML = `
            <style>
                :host {
                    display: block;
                    min-width: 32vw;
                    max-width: 60vw;
                }
            </style>
            <app-debug-json class="debug-message-json"></app-debug-json>
        `;
    }
}

customElements.define('app-debug-message', DebugMessage);
