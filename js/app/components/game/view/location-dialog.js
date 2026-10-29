import { IdentifierDetail } from './identifier-detail.js';

export class LocationDialog extends IdentifierDetail {
    constructor() { super(); this.kind = 'Location'; }

    /** @param {string} userId */
    async getDisplayData(userId) {
        const client = window.ENGINE_WORKER_CLIENT;
        const id = this.getAttribute('identifier-id') || '';
        const [location, name, description] = await Promise.all([
            client.queryDEObject({ path: ['world', 'locations', id], pick: ['metadata'] }),
            client.queryDEObject({ path: ['utils', 'templates', 'formatLocationName'], call: [id, userId, { __type: 'object', value: { justName: true } }] }),
            client.queryDEObject({ path: ['utils', 'world', 'getDescriptionOfLocation'], call: [id, userId] }),
        ]);
        return { name, description, banner: location?.metadata?.asset || '' };
    }
}
customElements.define('app-game-location-dialog', LocationDialog);
