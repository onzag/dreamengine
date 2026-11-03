import { IdentifierDetail } from './identifier-detail.js';
import { getItemTreeContext, loadLocationSlotItemGroups } from './item-tree-data.js';
import { getPerspectiveIndex } from './perspective-data.js';
import { createItemTree } from './item-node.js';

export class LocationSlotDialog extends IdentifierDetail {
    constructor() { super(); this.kind = 'Location slot'; }

    /** @param {DECharacterPerspective} perspective */
    getDisplayData(perspective) {
        const id = this.getAttribute('identifier-id') || '';
        const slot = getPerspectiveIndex(perspective).slots.get(id);
        if (!slot) throw new Error('Location slot is not available in this perspective.');
        const context = getItemTreeContext(perspective);
        const content = createItemTree(loadLocationSlotItemGroups(id, context), context);
        return { name: slot.slotName, description: slot.description, banner: slot.slotMetadata.asset || '', content };
    }
}
customElements.define('app-game-location-slot-dialog', LocationSlotDialog);
