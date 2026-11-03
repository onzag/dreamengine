import { sharedStyles, itemTagStyles } from './shared-styles.js';
import '../../world-image.js';
import { createItemTags } from './item-tags.js';
import { loadItemGroups } from './item-tree-data.js';
import { parsePerspectiveNarration } from './perspective-data.js';

const itemNodeStyles = `
${sharedStyles}
${itemTagStyles}
:host { display: block; min-width: 0; font-size: 2vh; --item-image-blur: 0vh; }
:host([data-blindness="partial-good"]) { --item-image-blur: .45vh; }
:host([data-blindness="partial-bad"]) { --item-image-blur: 1.2vh; }
:host([data-blindness="full"]) { --item-image-blur: 3vh; }
.item-tree { min-width: 0; font-size: 2vh; }
.item-tree-group { margin-top: 1.4vh; min-width: 0; }
.item-tree-group > h3 { margin: 0 0 .7vh; color: var(--accent, #a7d9ff); font-size: 2vh; font-weight: 600; }
.item-tree-list { list-style: none; margin: 0; padding: 0; display: grid; gap: .7vh; }
.item-tree-list > li { min-width: 0; }
.item-node-row { display: grid; grid-template-columns: 2.8vh minmax(0, 1fr); align-items: center; gap: .5vh; }
.item-toggle, .item-open { border: 0; background: transparent; padding: .5vh; border-radius: .5vh; }
.item-toggle { grid-column: 1; min-height: 3.5vh; font-size: 2.3vh; color: var(--accent, #a7d9ff); }
.item-open { grid-column: 2; display: flex; align-items: flex-start; gap: 1vh; text-align: left; min-width: 0; width: 100%; }
.item-open:hover, .item-toggle:hover { background: rgba(167, 217, 255, .1); }
.item-node-text { display: flex; flex-wrap: wrap; align-items: center; gap: 1vh; min-width: 0; overflow-wrap: anywhere; padding-top: 0.5vh; }
.item-node-title { max-width: 100%; font-size: 2.5vh; line-height: 1.35; }
.item-node-label { font-size: 2.5vh; }
.item-node-text > .item-tags:not([hidden]) { display: contents; }
.item-node-count { color: var(--muted, #b3c7da); white-space: nowrap; font-size: 2.5vh; }
.item-node-children { margin: .5vh 0 1vh 3.3vh; padding-left: 1.2vh; border-left: .15vh solid var(--border, #a7d9ff40); }
.item-node-children[hidden], .item-toggle[hidden], .item-node-count[hidden] { display: none; }
.item-tree-message { margin: .5vh 0; color: var(--muted, #b3c7da); font-size: 2vh; line-height: 1.5; }
.item-tree-retry { background: transparent; border: .1vh solid var(--border, #a7d9ff40); border-radius: .4vh; padding: .5vh 1vh; font-size: 2vh; }
.item-open app-asset-image { display: block; flex: 0 0 6vh; width: 6vh; height: 6vh; --asset-image-border-width: .1vh; }
.item-open app-asset-image::part(asset-image) { filter: blur(var(--item-image-blur)); border-radius: .5vh; }
.item-open app-asset-image::part(asset-image-container) { border-radius: .5vh; }
@media (max-width: 700px) { .item-node-children { margin-left: 1.2vh; padding-left: .7vh; } }

.item-node-description { color: var(--muted, #b3c7da); font-size: 2vh; }
`;


/** @typedef {import('./item-tree-data.js').ItemNodeData | import('./item-tree-data.js').CharacterNodeData} ItemNodeData */
/** @typedef {import('./item-tree-data.js').ItemTreeContext} ItemTreeContext */
/** @typedef {import('./item-tree-data.js').ItemGroupData} ItemGroupData */

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
                if (item.kind !== 'character' && ancestors.includes(item.id)) {
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
    const style = document.createElement('style');
    style.textContent = itemNodeStyles;
    tree.append(style, createGroups(groups, context, 0, ancestors));
    return tree;
}

/** A single grouped item. Snapshot children are rendered when its branch is opened. */
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
        this.root.innerHTML = `<style>${itemNodeStyles}</style>
            <div class="item-node-row">
                <button type="button" class="item-toggle" aria-controls="children"></button>
                <button type="button" class="item-open"><app-asset-image no-transition="true" aria-hidden="true"></app-asset-image>
                    <span class="item-node-text"><span class="item-node-title"><span class="item-node-label"></span> <span class="item-node-count"></span></span></span>
                </button>
            </div>
            <div id="children" class="item-node-children" hidden></div>`;
        // The player always sees their own character clearly, regardless of their blindness.
        this.dataset.blindness = this.data.kind === 'character' && this.data.id === this.context.userId ? 'no' : this.context.blindness;
        const image = /** @type {HTMLElement} */ (this.root.querySelector('app-asset-image'));
        image.setAttribute('default-image', new URL(this.data.kind === 'character' ? '../../../images/default-profile.png' : '../../../images/default-item.png', import.meta.url).href);
        image.setAttribute('image-url', this.data.asset);
        const label = /** @type {HTMLElement} */ (this.root.querySelector('.item-node-label'));
        label.textContent = this.data.label;
        if (this.data.kind === 'character' && this.data.description) {
            const description = document.createElement('span');
            description.className = 'item-node-description';
            description.textContent = this.data.description;
            this.root.querySelector('.item-node-title')?.append(description);
            void this.renderDescription(description, this.data.description);
        }
        this.root.querySelector('.item-node-text')?.append(createItemTags(this.data.tags));
        const count = /** @type {HTMLElement} */ (this.root.querySelector('.item-node-count'));
        count.textContent = this.data.amount > 1 ? `(x${this.data.amount})` : '';
        count.setAttribute('aria-label', `${this.data.amount} items`);
        count.hidden = this.data.amount <= 1 || (this.data.kind === 'item' && !!this.data.item.nameInAmount);
        const open = /** @type {HTMLButtonElement} */ (this.root.querySelector('.item-open'));
        open.title = `View ${this.data.label}`;
        open.addEventListener('click', () => this.dispatchEvent(new CustomEvent('identifier-navigate', {
            bubbles: true, composed: true, detail: { identifier: this.data?.id, foundAs: this.data?.kind === 'character' ? 'character' : 'item' },
        })));
        this.root.querySelector('.item-toggle')?.addEventListener('click', () => {
            if (!this.context || !this.data) return;
            rememberItemExpansion(this.context, this.data.id, !this.expanded);
            this.setExpanded(!this.expanded);
        });
        if (this.data.kind === 'character') {
            const toggle = /** @type {HTMLButtonElement} */ (this.root.querySelector('.item-toggle'));
            toggle.hidden = true;
        } else {
            this.setExpanded(isItemExpanded(this.context, this.data.id, this.depth));
        }
    }

    disconnectedCallback() { this.version++; }

    /** @param {HTMLElement} element @param {string} text */
    async renderDescription(element, text) {
        const version = this.version;
        try {
            const fragments = await parsePerspectiveNarration(text);
            if (!this.isConnected || version !== this.version) return;
            // The row is already a button, so render parsed identifiers as text here.
            element.textContent = ' - ' + fragments.map(fragment =>
                typeof fragment === 'string' ? fragment : fragment.text).join('');
        } catch (error) {
            if (this.isConnected && version === this.version) console.warn('Unable to parse character position', error);
        }
    }

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
        if (!this.data || !this.context || this.data.kind === 'character') return;
        const version = this.version;
        this.loading = true;
        const children = /** @type {HTMLElement} */ (this.root.getElementById('children'));
        children.replaceChildren(message('Loading items…'));
        children.setAttribute('aria-busy', 'true');
        try {
            const groups = loadItemGroups(this.data, this.context);
            if (!this.isConnected || version !== this.version) return;
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
