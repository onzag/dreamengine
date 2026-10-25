/**
 * @typedef {Object} PreviewItem
 * @property {string} name
 * @property {string} icon
 * @property {string} [detail]
 * @property {number} [quantity]
 * @property {PreviewItem[]} [inside]
 * @property {PreviewItem[]} [onTop]
 */

/** Shared, recursive presentation for items in the world and on the character.
 * @param {PreviewItem[]} items
 * @returns {HTMLUListElement}
 */
export function createItemList(items) {
    const list = document.createElement('ul');
    list.className = 'item-list';
    for (const item of items) {
        const entry = document.createElement('li');
        const row = document.createElement('div');
        row.className = 'item-row';
        const icon = document.createElement('span');
        icon.className = 'item-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = item.icon;
        const text = document.createElement('div');
        text.className = 'item-text';
        const name = document.createElement('span');
        name.textContent = item.name;
        text.append(name);
        if (item.detail) {
            const detail = document.createElement('small');
            detail.textContent = item.detail;
            text.append(detail);
        }
        row.append(icon, text);
        if (item.quantity) {
            const count = document.createElement('span');
            count.className = 'item-count';
            count.textContent = `× ${item.quantity}`;
            row.append(count);
        }
        entry.append(row);
        for (const [label, children] of /** @type {Array<[string, PreviewItem[] | undefined]>} */ ([['On top', item.onTop], ['Inside', item.inside]])) {
            if (!children?.length) continue;
            const group = document.createElement('div');
            group.className = 'item-contents';
            const heading = document.createElement('div');
            heading.className = 'item-relation';
            heading.textContent = label;
            const nested = createItemList(children);
            nested.setAttribute('aria-label', `${label} ${item.name}`);
            group.append(heading, nested);
            entry.append(group);
        }
        list.append(entry);
    }
    return list;
}
