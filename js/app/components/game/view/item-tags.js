/** @type {Record<import('./item-tree-data.js').ItemTagIcon, string>} */
const tagIcons = {
    communicator: 'M8 5h8v14H8zM10 8h4M11 16h2M5 8a7 7 0 0 0 0 8M19 8a7 7 0 0 1 0 8',
    consumable: 'M12 21s-7-4-7-9a7 7 0 0 1 14 0c0 5-7 9-7 9ZM12 5V2m0 3c0-3 3-3 4-3',
    container: 'm3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10',
    open: 'M4 10h16v11H4zM3 6l17-3 1 4-17 3M8 14h8',
    closed: 'M4 8h16v13H4zM3 4h18v4H3zM9 12h6',
    locked: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4M12 15v2',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm7 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
    'eye-off': 'm3 3 18 18M10 5a12 12 0 0 1 12 7 16 16 0 0 1-3 4M6 6a17 17 0 0 0-4 6s4 7 10 7a14 14 0 0 0 5-1M9 9a4 4 0 0 0 6 6',
    rigid: 'M4 4h16v16H4zM4 9h16M9 4v16',
    flexible: 'M7 3h10l-2 4c5 4 6 7 6 10 0 3-4 4-9 4s-9-1-9-4c0-3 1-6 6-10L7 3Zm2 4h6M8 12c-2 3 0 4-1 6M15 12c-1 2 2 4 1 6',
    tag: 'M3 3h8l10 10-8 8L3 11V3ZM7 7h.01',
};

/** Compact badges shared by tree rows and the selected item's details.
 * @param {import('./item-tree-data.js').ItemTagData[]} tags
 */
export function createItemTags(tags) {
    const row = document.createElement('span');
    row.className = 'item-tags';
    row.hidden = !tags.length;
    for (const tag of tags) {
        const badge = document.createElement('span');
        badge.className = `item-tag item-tag-${tag.source}`;
        badge.dataset.tagType = tag.type;
        let category = tag.source === 'state' ? 'State tag' : ['open', 'closed', 'locked'].includes(tag.type) ? 'Container state' : 'Item property';
        if (tag.type === 'posture') category = 'Posture and position';
        if (tag.type === 'relative-position') category = 'Relative position';
        if (tag.type === 'weight') category = 'Weight';
        if (tag.type === 'volume') category = 'Volume';
        if (tag.type === 'capacity-weight') category = 'Container weight capacity';
        if (tag.type === 'capacity-volume') category = 'Container volume capacity';
        const icons = tag.icons || (Object.prototype.hasOwnProperty.call(tagIcons, tag.type) ? [/** @type {import('./item-tree-data.js').ItemTagIcon} */ (tag.type)] : []);
        fillTag(badge, tag.label, `${category}: ${tag.label}${tag.description ? `; ${tag.description}` : ''}`, icons.map(name => tagIcons[name]));
        row.append(badge);
    }
    return row;
}


/** @param {HTMLElement} badge @param {string} text @param {string} title @param {string[]} icons */
function fillTag(badge, text, title, icons) {
    badge.title = title;
    badge.setAttribute('aria-label', title);
    for (const iconPath of icons) {
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.setAttribute('aria-hidden', 'true');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', iconPath);
        icon.append(path);
        badge.append(icon);
    }
    const label = document.createElement('span');
    label.textContent = text;
    badge.append(label);
}

/** Basic character stats use the same badges while retaining their own icons.
 * @param {Array<{label: string, value: string, icon: string}>} stats
 */
export function createStatTags(stats) {
    const row = document.createElement('div');
    row.className = 'item-tags character-stats';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', 'Character details');
    row.hidden = !stats.length;
    for (const stat of stats) {
        const badge = document.createElement('span');
        badge.className = 'item-tag item-tag-item';
        badge.dataset.tagType = stat.label.toLowerCase().replace(/ /g, '-');
        fillTag(badge, stat.value, `${stat.label}: ${stat.value}`, [stat.icon]);
        row.append(badge);
    }
    return row;
}
