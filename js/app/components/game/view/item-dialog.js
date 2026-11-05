import { IdentifierDetail } from './identifier-detail.js';
import { getItemTreeContext, loadItemNode, loadItemGroups } from './item-tree-data.js';
import { createItemTree } from './item-node.js';
import { createItemTags } from './item-tags.js';

export class ItemDialog extends IdentifierDetail {
    constructor() { super(); this.kind = 'Item'; this.layout = 'item'; }

    /** @param {DECharacterPerspective} perspective */
    getDisplayData(perspective) {
        const id = this.getAttribute('identifier-id') || '';
        const context = getItemTreeContext(perspective);
        const node = loadItemNode(id, context, true);
        const content = createItemTree(loadItemGroups(node, context), context, [id]);
        content.prepend(createItemTags(node.tags));
        return { name: node.label, description: node.item.description, portrait: node.asset, content };
    }

    /** @param {DECharacterPerspective} perspective */
    getDebugSections(perspective) {
        const id = this.getAttribute('identifier-id') || '';
        const context = getItemTreeContext(perspective);
        const node = loadItemNode(id, context, true);
        return [{ title: 'Item in perspective (at the time) (User\'s perspective)', value: node.item }];
    }
}
customElements.define('app-game-item-dialog', ItemDialog);
