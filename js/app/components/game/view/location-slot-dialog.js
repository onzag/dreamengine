import { IdentifierDetail } from './identifier-detail.js';

export class LocationSlotDialog extends IdentifierDetail {
    constructor() { super(); this.kind = 'Location slot'; }

    /** @param {string} userId */
    async getDisplayData(userId) {
        const client = window.ENGINE_WORKER_CLIENT;
        const id = this.getAttribute('identifier-id') || '';
        const [slot, name, description] = await Promise.all([
            client.queryDEObject({ path: ['utils', 'world', 'getLocationSlotById'], call: [id], pick: ['metadata'] }),
            client.queryDEObject({ path: ['utils', 'templates', 'formatLocationSlotName'], call: [id, userId, { __type: 'object', value: { justName: true } }] }),
            client.queryDEObject({ path: ['utils', 'world', 'getDescriptionOfLocationSlot'], call: [id, userId] }),
        ]);
        return { name, description, banner: slot?.metadata?.asset || '' };
    }
}
customElements.define('app-game-location-slot-dialog', LocationSlotDialog);
