import { sharedStyles, identifierLinkStyles, itemTagStyles, characterTagStyles } from './shared-styles.js';
import '../../world-image.js';
import { createCharacterTags } from './character-tags.js';
import { createNarrationNodes } from './narration.js';
import { parsePerspectiveNarration } from './perspective-data.js';

/** @typedef {{name: string, description: string, portrait?: string, banner?: string, content?: HTMLElement, states?: DECharacterStateInPerspective[];}} IdentifierDetailData */
/** @typedef {{title: string, value: unknown}} DebugSection */

/** JSON stringify that tolerates circular references and functions.
 * @param {unknown} value */
function debugStringify(value) {
    const seen = new WeakSet();
    return JSON.stringify(value, (key, val) => {
        if (typeof val === 'function') return `[Function ${val.name || 'anonymous'}]`;
        if (typeof val === 'object' && val !== null) {
            if (seen.has(val)) return '[Circular]';
            seen.add(val);
        }
        return val;
    }, 2);
}

/** Shared loading, vision treatment and narration for the four detail views. */
export class IdentifierDetail extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        this.loadVersion = 0;
        /** @type {DECharacterPerspective | null} */
        this.currentPerspective = null;
        this.kind = 'Details';
        this.layout = 'location';
        /** @type {boolean | null} Whether the simulation is a debug build (null until resolved). */
        this.isDebugMode = null;
    }

    connectedCallback() {
        this.root.innerHTML = `<style>
${sharedStyles}
${identifierLinkStyles}
${itemTagStyles}
${characterTagStyles}
:host { display: block; --ink: #edf6ff; --muted: #b3c7da; --accent: #a7d9ff; color: var(--ink); }
.detail { --image-blur: 0vh; min-width: 0; padding: 0 1vh 2vh; }
.detail[data-blindness="partial-good"] { --image-blur: .45vh; }
.detail[data-blindness="partial-bad"] { --image-blur: 1.2vh; }
.detail[data-blindness="full"] { --image-blur: 3vh; }
.hero { position: relative; margin-bottom: 2vh; }
.hero[hidden] { display: none; }
app-asset-image { --asset-image-border-width: .2vh; }
app-asset-image::part(asset-image) { filter: blur(var(--image-blur)); border-radius: .8vh; }
app-asset-image::part(asset-image-container) { border-radius: .8vh; }
.banner { width: 100%; height: 25vh; aspect-ratio: auto; }
.portrait { width: 22vh; height: 22vh; max-width: 100%; aspect-ratio: 1; }
.character .with-banner { padding-bottom: 10vh; }
.character .with-banner .portrait { position: absolute; bottom: 0; left: 3vh; }
.copy { min-width: 0; }
.character-stats { margin: 0 0 2vh; }
.description { font-size: 2.7vh; line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; max-width: 80ch; }
.item { display: grid; grid-template-columns: 24vh minmax(0, 1fr); gap: 0 3vh; }
.detail-extra { grid-column: 1 / -1; min-width: 0; margin-top: 2vh; }
@media (max-width: 700px) { .item { grid-template-columns: minmax(0, 1fr); } .banner { height: 20vh; } .portrait { width: 18vh; height: 18vh; } }

.character-tags { margin: 0 0 2vh; }
.description[hidden] { display: none; }
.view-tabs { display: flex; gap: .6vh; padding: 0 1vh 1.5vh; }
.view-tabs[hidden] { display: none; }
.view-tab { font-size: 2vh; padding: .8vh 2vh; border-radius: .6vh; border: .2vh solid transparent; background: rgba(255, 255, 255, .06); color: var(--muted); cursor: pointer; }
.view-tab:hover { background: rgba(255, 255, 255, .12); }
.view-tab[aria-selected="true"] { color: #ffd6ea; border-color: #ff44aa; background: rgba(255, 30, 100, .14); }
.detail[hidden] { display: none; }
.debug-view { min-width: 0; padding: 0 1vh 2vh; }
.debug-view[hidden] { display: none; }
.debug-section { margin-bottom: 1vh; border: .15vh solid rgba(255, 68, 170, .3); border-radius: .6vh; overflow: hidden; }
.debug-section > summary { font-size: 2vh; color: #ff88c0; padding: 1vh 1.5vh; background: rgba(255, 30, 100, .1); cursor: pointer; user-select: none; }
.debug-section > summary:hover { background: rgba(255, 30, 100, .18); }
.debug-json { margin: 0; padding: 1.5vh; background: rgba(0, 0, 0, .4); font-family: monospace; font-size: 1.8vh; line-height: 1.4; white-space: pre-wrap; overflow-wrap: anywhere; }
            </style>
            <div class="view-tabs" role="tablist" hidden>
                <button type="button" class="view-tab" data-view="normal" role="tab" aria-selected="true">Normal view</button>
                <button type="button" class="view-tab" data-view="debug" role="tab" aria-selected="false">Debug</button>
            </div>
            <article class="detail" data-blindness="full" aria-busy="true">
                <div class="hero" hidden></div>
                <section class="copy"><div class="description" role="status">Loading details…</div></section>
            </article>
            <div class="debug-view" role="tabpanel" hidden></div>`;
        this.root.querySelector('.detail')?.classList.add(this.layout);
        this.setupTabs();
        void this.load();
    }

    setupTabs() {
        const tabs = this.root.querySelectorAll('.view-tab');
        const detail = /** @type {HTMLElement} */ (this.root.querySelector('.detail'));
        const debugView = /** @type {HTMLElement} */ (this.root.querySelector('.debug-view'));
        for (const tab of tabs) {
            tab.addEventListener('click', () => {
                const isDebug = tab.getAttribute('data-view') === 'debug';
                for (const other of tabs) other.setAttribute('aria-selected', String(other === tab));
                detail.hidden = isDebug;
                debugView.hidden = !isDebug;
            });
        }
    }

    disconnectedCallback() { this.loadVersion++; }

    /** @param {DECharacterPerspective} perspective @returns {IdentifierDetailData} */
    getDisplayData(perspective) { throw new Error('A detail view must provide its display data.'); }

    /** Debug-only sections to inspect the perspective data that produced this view.
     * @param {DECharacterPerspective} perspective @returns {Promise<DebugSection[]> | DebugSection[]} */
    getDebugSections(perspective) { return []; }

    async load() {
        const version = ++this.loadVersion;
        const article = /** @type {HTMLElement} */ (this.root.querySelector('.detail'));
        const description = /** @type {HTMLElement} */ (this.root.querySelector('.description'));
        try {
            const perspective = this.currentPerspective;
            if (!perspective) throw new Error('No perspective available.');
            if (this.isDebugMode === null) {
                try {
                    this.isDebugMode = (await window.ENGINE_WORKER_CLIENT.queryDEObject({ path: ['userMode'] })) === 'debug';
                } catch { this.isDebugMode = false; }
                if (!this.isConnected || version !== this.loadVersion) return;
            }
            const data = this.getDisplayData(perspective);
            const isSelf = this.layout === 'character' && this.getAttribute('identifier-id') === perspective.ownId;
            article.dataset.blindness = isSelf ? 'no' : perspective.ownCharacterBlindness;
            this.dispatchEvent(new CustomEvent('identifier-title-change', {
                bubbles: true, composed: true, detail: data.name,
            }));
            const hero = /** @type {HTMLElement} */ (this.root.querySelector('.hero'));
            const images = [];
            if (data.banner || this.layout === 'location') images.push(this.createImage('banner', data.banner || '', 'default-world.png', `${data.name} banner`));
            if (data.portrait !== undefined) images.push(this.createImage('portrait', data.portrait,
                this.layout === 'item' ? 'default-item.png' : 'default-profile.png', data.name));
            hero.classList.toggle('with-banner', Boolean(data.banner));
            hero.replaceChildren(...images);
            hero.hidden = !images.length;
            this.root.querySelector('.character-tags')?.remove();
            if (data.states?.length) {
                const tags = document.createElement('div');
                tags.className = 'character-tags';
                tags.append(...createCharacterTags(data.states));
                description.before(tags);
            }
            description.removeAttribute('role');
            description.hidden = !data.description;
            description.textContent = data.description;
            this.root.querySelector('.detail-extra')?.remove();
            if (data.content) {
                data.content.classList.add('detail-extra');
                article.append(data.content);
            }
            const tabs = /** @type {HTMLElement} */ (this.root.querySelector('.view-tabs'));
            const debugView = /** @type {HTMLElement} */ (this.root.querySelector('.debug-view'));
            debugView.replaceChildren();
            tabs.hidden = true;
            article.hidden = false;
            debugView.hidden = true;
            for (const tab of this.root.querySelectorAll('.view-tab')) {
                tab.setAttribute('aria-selected', String(tab.getAttribute('data-view') === 'normal'));
            }
            if (this.isDebugMode) {
                try {
                    const sections = await this.getDebugSections(perspective);
                    if (!this.isConnected || version !== this.loadVersion) return;
                    if (sections.length) {
                        debugView.append(...sections.map(section => this.createDebugSection(section)));
                        tabs.hidden = false;
                    }
                } catch (error) {
                    if (!this.isConnected || version !== this.loadVersion) return;
                    console.warn('Unable to load debug sections', error);
                }
            }
            if (data.description) {
                // Keep the description readable if narration parsing is temporarily unavailable.
                try {
                    const fragments = await parsePerspectiveNarration(data.description);
                    if (!this.isConnected || version !== this.loadVersion) return;
                    description.replaceChildren(...createNarrationNodes(fragments, (identifier, foundAs) => {
                        this.dispatchEvent(new CustomEvent('identifier-navigate', {
                            bubbles: true, composed: true, detail: { identifier, foundAs },
                        }));
                    }));
                } catch (error) {
                    console.warn('Unable to parse detail description', error);
                }
            }
        } catch (error) {
            if (!this.isConnected || version !== this.loadVersion) return;
            this.dispatchEvent(new CustomEvent('identifier-title-change', {
                bubbles: true, composed: true, detail: `${this.kind} unavailable`,
            }));
            description.textContent = 'These details are not available in this perspective.';
            console.warn('Unable to load identifier details', error);
        } finally {
            if (this.isConnected && version === this.loadVersion) article.setAttribute('aria-busy', 'false');
        }
    }

    /** @param {string} className @param {string} asset @param {string} fallback @param {string} label */
    createImage(className, asset, fallback, label) {
        const image = document.createElement('app-asset-image');
        image.className = className;
        image.setAttribute('default-image', new URL(`../../../images/${fallback}`, import.meta.url).href);
        image.setAttribute('image-url', asset);
        image.setAttribute('no-transition', 'true');
        image.setAttribute('role', 'img');
        image.setAttribute('aria-label', label);
        return image;
    }

    /** @param {DebugSection} section */
    createDebugSection(section) {
        const details = document.createElement('details');
        details.className = 'debug-section';
        details.open = false;
        const summary = document.createElement('summary');
        summary.textContent = section.title;
        const pre = document.createElement('pre');
        pre.className = 'debug-json';
        pre.textContent = debugStringify(section.value);
        details.append(summary, pre);
        return details;
    }
}
