import { IdentifierDetail } from './identifier-detail.js';
import { getItemTreeContext, loadItemNode, loadItemGroups } from './item-tree-data.js';
import { createItemTree } from './item-node.js';
import { createItemTags } from './item-tags.js';

export class ItemDialog extends IdentifierDetail {
    constructor() { super(); this.kind = 'Item'; this.layout = 'item'; }

    /** @param {string} userId */
    async getDisplayData(userId) {
        const client = window.ENGINE_WORKER_CLIENT;
        const id = this.getAttribute('identifier-id') || '';
        const [context, description] = await Promise.all([
            getItemTreeContext(userId),
            client.queryDEObject({ path: ['utils', 'items', 'getDescriptionOfItem'], call: [id, userId] }),
        ]);
        const item = await loadItemNode(id, context);
        const content = createItemTree(await loadItemGroups(item, context), context, [id]);
        content.prepend(createItemTags(item.tags));
        return { name: item.label, description, portrait: item.asset, content };
    }
}
customElements.define('app-game-item-dialog', ItemDialog);
