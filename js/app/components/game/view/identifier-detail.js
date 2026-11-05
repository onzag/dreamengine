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
.detail-debug { grid-column: 1 / -1; min-width: 0; margin-top: 2vh; }
.debug-toggle { font-size: 2.2vh; padding: 1vh 2vh; border-radius: .6vh; border: .2vh solid #ff44aa; background: rgba(255, 30, 100, .12); color: #ffd6ea; cursor: pointer; }
.debug-toggle:hover { background: rgba(255, 30, 100, .22); }
.debug-info { margin-top: 1.5vh; }
.debug-info[hidden] { display: none; }
.debug-section-title { font-size: 2vh; color: #ff88c0; margin: 1.5vh 0 .5vh; }
.debug-json { padding: 1.5vh; border-radius: .6vh; background: rgba(0, 0, 0, .4); font-family: monospace; font-size: 1.8vh; line-height: 1.4; white-space: pre-wrap; overflow-wrap: anywhere; }
            </style>
            <article class="detail" data-blindness="full" aria-busy="true">
                <div class="hero" hidden></div>
                <section class="copy"><div class="description" role="status">Loading details…</div></section>
            </article>`;
        this.root.querySelector('.detail')?.classList.add(this.layout);
        void this.load();
    }

    disconnectedCallback() { this.loadVersion++; }

    /** @param {DECharacterPerspective} perspective @returns {IdentifierDetailData} */
    getDisplayData(perspective) { throw new Error('A detail view must provide its display data.'); }

    /** Debug-only sections to inspect the perspective data that produced this view.
     * @param {DECharacterPerspective} perspective @returns {DebugSection[]} */
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
            this.root.querySelector('.detail-debug')?.remove();
            if (this.isDebugMode) {
                const sections = this.getDebugSections(perspective);
                if (sections.length) article.append(this.createDebugPanel(sections));
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

    /** @param {DebugSection[]} sections */
    createDebugPanel(sections) {
        const wrapper = document.createElement('div');
        wrapper.className = 'detail-debug';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'debug-toggle';
        button.textContent = 'View debug information';
        const panel = document.createElement('div');
        panel.className = 'debug-info';
        panel.hidden = true;
        for (const { title, value } of sections) {
            const heading = document.createElement('h3');
            heading.className = 'debug-section-title';
            heading.textContent = title;
            const pre = document.createElement('pre');
            pre.className = 'debug-json';
            pre.textContent = debugStringify(value);
            panel.append(heading, pre);
        }
        button.addEventListener('click', () => {
            panel.hidden = !panel.hidden;
            button.textContent = panel.hidden ? 'View debug information' : 'Hide debug information';
        });
        wrapper.append(button, panel);
        return wrapper;
    }
}
