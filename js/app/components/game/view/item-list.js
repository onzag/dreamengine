const itemListStyles = `
.item-list { list-style: none; padding: 0; margin: 1vh 0 0; display: grid; gap: .8vh; }
.item-row { display: flex; align-items: center; gap: 1vh; font-size: .9em; min-width: 0; }
.item-icon { display: grid; place-items: center; width: 3.2vh; height: 3.2vh; min-width: 22px; min-height: 22px; flex-shrink: 0; border: 1px solid var(--border); border-radius: .5vh; background: #ffffff08; font-size: 1.1em; }
.item-text { min-width: 0; overflow-wrap: anywhere; }
.item-text small { display: block; margin-top: .2vh; color: var(--muted); font-size: .85em; }
.item-count { margin-left: auto; color: var(--muted); white-space: nowrap; }
.item-contents { margin: .7vh 0 .3vh 1.6vh; padding-left: 2.6vh; border-left: 1px solid var(--border); }
.item-relation { color: var(--accent); font-size: .75em; letter-spacing: .04em; }
.item-contents .item-list { margin-top: .5vh; }
`;

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
 * @param {boolean} [includeStyles] Include styles on the outermost list.
 * @returns {HTMLUListElement}
 */
export function createItemList(items, includeStyles = true) {
    const list = document.createElement('ul');
    list.className = 'item-list';
    if (includeStyles) {
        const style = document.createElement('style');
        style.textContent = itemListStyles;
        list.append(style);
    }
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
            const nested = createItemList(children, false);
            nested.setAttribute('aria-label', `${label} ${item.name}`);
            group.append(heading, nested);
            entry.append(group);
        }
        list.append(entry);
    }
    return list;
}
