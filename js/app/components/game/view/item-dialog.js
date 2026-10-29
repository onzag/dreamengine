import { IdentifierDetail } from './identifier-detail.js';

export class ItemDialog extends IdentifierDetail {
    constructor() { super(); this.kind = 'Item'; this.layout = 'item'; }

    /** @param {string} userId */
    async getDisplayData(userId) {
        const client = window.ENGINE_WORKER_CLIENT;
        const id = this.getAttribute('identifier-id') || '';
        const [item, name, description] = await Promise.all([
            client.queryDEObject({ path: ['utils', 'items', 'getItemById'], call: [id], pick: ['metadata'] }),
            client.queryDEObject({ path: ['utils', 'templates', 'formatItemName'], call: [id, userId, { __type: 'object', value: { justName: true, capitalize: true, type: "plain" } }] }),
            client.queryDEObject({ path: ['utils', 'items', 'getDescriptionOfItem'], call: [id, userId] }),
        ]);
        return { name, description, portrait: item?.metadata?.asset || '' };
    }
}
customElements.define('app-game-item-dialog', ItemDialog);
