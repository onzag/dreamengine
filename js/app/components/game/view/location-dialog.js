import { IdentifierDetail } from './identifier-detail.js';

export class LocationDialog extends IdentifierDetail {
    constructor() { super(); this.kind = 'Location'; }

    /** @param {DECharacterPerspective} perspective */
    getDisplayData(perspective) {
        const location = perspective.ownLocation;
        if (location.locationId !== this.getAttribute('identifier-id')) {
            throw new Error('Location is not available in this perspective.');
        }
        return { name: location.locationName, description: location.description, banner: location.locationMetadata.asset || '' };
    }

    /** @param {DECharacterPerspective} perspective */
    getDebugSections(perspective) {
        return [{ title: 'Location in perspective (at the time) (User\'s perspective)', value: perspective.ownLocation }];
    }
}
customElements.define('app-game-location-dialog', LocationDialog);
