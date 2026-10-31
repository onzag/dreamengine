import '../../world-image.js';
import { loadItemGroups } from './item-tree-data.js';

/** @typedef {import('./item-tree-data.js').ItemNodeData} ItemNodeData */
/** @typedef {import('./item-tree-data.js').ItemTreeContext} ItemTreeContext */
/** @typedef {import('./item-tree-data.js').ItemGroupData} ItemGroupData */

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
        if (tag.type === 'weight') category = 'Weight';
        if (tag.type === 'volume') category = 'Volume';
        if (tag.type === 'capacity-weight') category = 'Container weight capacity';
        if (tag.type === 'capacity-volume') category = 'Container volume capacity';
        badge.title = `${category}: ${tag.label}${tag.description ? `; ${tag.description}` : ''}`;
        badge.setAttribute('aria-label', badge.title);
        const icons = tag.icons || (Object.prototype.hasOwnProperty.call(tagIcons, tag.type) ? [/** @type {import('./item-tree-data.js').ItemTagIcon} */ (tag.type)] : []);
        for (const iconName of icons) {
            const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            icon.setAttribute('viewBox', '0 0 24 24');
            icon.setAttribute('aria-hidden', 'true');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', tagIcons[iconName]);
            icon.append(path);
            badge.append(icon);
        }
        const label = document.createElement('span');
        label.textContent = tag.label;
        badge.append(label);
        row.append(badge);
    }
    return row;
}

/** @type {Map<string, boolean>} */
const expansionMemory = new Map();
/** @param {ItemTreeContext} context @param {string} id */
const memoryKey = (context, id) => `item-tree:${context.memoryScope}:${id}`;

/** First three item levels are visible: levels zero and one start expanded.
 * @param {ItemTreeContext} context @param {string} id @param {number} depth
 */
export function isItemExpanded(context, id, depth) {
    const key = memoryKey(context, id);
    if (expansionMemory.has(key)) return expansionMemory.get(key) === true;
    try {
        const saved = sessionStorage.getItem(key);
        if (saved !== null) return saved === 'true';
    } catch { /* Session memory still works if browser storage is unavailable. */ }
    return depth < 2;
}

/** @param {ItemTreeContext} context @param {string} id @param {boolean} expanded */
export function rememberItemExpansion(context, id, expanded) {
    const key = memoryKey(context, id);
    expansionMemory.set(key, expanded);
    try { sessionStorage.setItem(key, String(expanded)); } catch { /* Keep in-memory state. */ }
}

/** @param {string} text */
function message(text) {
    const paragraph = document.createElement('p');
    paragraph.className = 'item-tree-message';
    paragraph.textContent = text;
    return paragraph;
}

/**
 * @param {ItemGroupData[]} groups @param {ItemTreeContext} context
 * @param {number} depth @param {string[]} ancestors
 */
function createGroups(groups, context, depth, ancestors) {
    const fragment = document.createDocumentFragment();
    for (const group of groups) {
        const section = document.createElement('section');
        section.className = 'item-tree-group';
        const heading = document.createElement('h3');
        heading.textContent = group.label;
        section.append(heading);
        if (group.items.length) {
            const list = document.createElement('ul');
            list.className = 'item-tree-list';
            list.setAttribute('aria-label', group.label);
            for (const item of group.items) {
                const entry = document.createElement('li');
                if (ancestors.includes(item.id)) {
                    entry.append(message('This item is already shown above.'));
                } else {
                    const node = /** @type {ItemNode} */ (document.createElement('app-item-node'));
                    node.configure(item, context, depth, ancestors);
                    entry.append(node);
                }
                list.append(entry);
            }
            section.append(list);
        }
        if (group.message) section.append(message(group.message));
        fragment.append(section);
    }
    return fragment;
}

/** Shared tree for item contents, character inventories and other item lists.
 * @param {ItemGroupData[]} groups @param {ItemTreeContext} context @param {string[]} [ancestors]
 */
export function createItemTree(groups, context, ancestors = []) {
    const tree = document.createElement('div');
    tree.className = 'item-tree';
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = new URL('./item-node.css', import.meta.url).href;
    tree.append(style, createGroups(groups, context, 0, ancestors));
    return tree;
}

/** A single grouped item. Children are fetched only when its branch is opened. */
export class ItemNode extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        /** @type {ItemNodeData | null} */
        this.data = null;
        /** @type {ItemTreeContext | null} */
        this.context = null;
        this.depth = 0;
        /** @type {string[]} */
        this.ancestors = [];
        this.expanded = false;
        this.loaded = false;
        this.loading = false;
        this.version = 0;
    }

    /** @param {ItemNodeData} data @param {ItemTreeContext} context @param {number} depth @param {string[]} ancestors */
    configure(data, context, depth, ancestors) {
        this.data = data;
        this.context = context;
        this.depth = depth;
        this.ancestors = [...ancestors, data.id];
    }

    connectedCallback() {
        if (!this.data || !this.context) return;
        this.loaded = false;
        this.loading = false;
        this.version++;
        this.root.innerHTML = `<link rel="stylesheet" href="${new URL('./item-node.css', import.meta.url).href}">
            <div class="item-node-row">
                <button type="button" class="item-toggle" aria-controls="children"></button>
                <button type="button" class="item-open"><app-asset-image no-transition="true" aria-hidden="true"></app-asset-image>
                    <span class="item-node-text"><span class="item-node-title"><span class="item-node-label"></span> <span class="item-node-count"></span></span></span>
                </button>
            </div>
            <div id="children" class="item-node-children" hidden></div>`;
        this.dataset.blindness = this.context.blindness;
        const image = /** @type {HTMLElement} */ (this.root.querySelector('app-asset-image'));
        image.setAttribute('default-image', new URL('../../../images/default-item.png', import.meta.url).href);
        image.setAttribute('image-url', this.data.asset);
        const label = /** @type {HTMLElement} */ (this.root.querySelector('.item-node-label'));
        label.textContent = this.data.label;
        this.root.querySelector('.item-node-text')?.append(createItemTags(this.data.tags));
        const count = /** @type {HTMLElement} */ (this.root.querySelector('.item-node-count'));
        count.textContent = this.data.amount > 1 ? `(x${this.data.amount})` : '';
        count.setAttribute('aria-label', `${this.data.amount} items`);
        count.hidden = this.data.amount <= 1;
        const open = /** @type {HTMLButtonElement} */ (this.root.querySelector('.item-open'));
        open.title = `View ${this.data.label}`;
        open.addEventListener('click', () => this.dispatchEvent(new CustomEvent('identifier-navigate', {
            bubbles: true, composed: true, detail: { identifier: this.data?.id, foundAs: 'item' },
        })));
        this.root.querySelector('.item-toggle')?.addEventListener('click', () => {
            if (!this.context || !this.data) return;
            rememberItemExpansion(this.context, this.data.id, !this.expanded);
            this.setExpanded(!this.expanded);
        });
        this.setExpanded(isItemExpanded(this.context, this.data.id, this.depth));
    }

    disconnectedCallback() { this.version++; }

    /** @param {boolean} expanded */
    setExpanded(expanded) {
        this.expanded = expanded;
        const toggle = /** @type {HTMLButtonElement} */ (this.root.querySelector('.item-toggle'));
        toggle.textContent = expanded ? '▾' : '▸';
        toggle.setAttribute('aria-expanded', String(expanded));
        toggle.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} ${this.data?.label}`);
        const children = /** @type {HTMLElement} */ (this.root.getElementById('children'));
        children.hidden = !expanded;
        if (expanded && !this.loaded && !this.loading) void this.loadChildren();
    }

    async loadChildren() {
        if (!this.data || !this.context) return;
        const version = this.version;
        this.loading = true;
        const children = /** @type {HTMLElement} */ (this.root.getElementById('children'));
        children.replaceChildren(message('Loading items…'));
        children.setAttribute('aria-busy', 'true');
        try {
            let groups = await loadItemGroups(this.data, this.context);
            if (!this.isConnected || version !== this.version) return;
            // Ordinary leaves need no empty "On top" section or disclosure button.
            if (this.data.perception.canSeeContents === 'NOT_A_CONTAINER' && this.data.perception.canSeeOntop === 'YES') {
                groups = groups.filter(group => group.items.length);
            }
            children.replaceChildren(createGroups(groups, this.context, this.depth + 1, this.ancestors));
            this.loaded = true;
            if (!groups.length) {
                const toggle = /** @type {HTMLButtonElement} */ (this.root.querySelector('.item-toggle'));
                toggle.hidden = true;
                children.hidden = true;
            }
        } catch (error) {
            if (!this.isConnected || version !== this.version) return;
            const retry = document.createElement('button');
            retry.type = 'button';
            retry.className = 'item-tree-retry';
            retry.textContent = 'Retry';
            retry.addEventListener('click', () => { if (!this.loading) void this.loadChildren(); });
            children.replaceChildren(message('These items are no longer available or could not be loaded.'), retry);
            console.warn('Unable to load item branch', error);
        } finally {
            if (version === this.version) {
                this.loading = false;
                children.removeAttribute('aria-busy');
            }
        }
    }
}

customElements.define('app-item-node', ItemNode);
