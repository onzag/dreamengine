import '../../world-image.js';
import { createCharacterTags } from './character-tags.js';
import { createNarrationNodes } from './narration.js';
import { parsePerspectiveNarration } from './perspective-data.js';

/** @typedef {{name: string, description: string, portrait?: string, banner?: string, content?: HTMLElement, states?: DECharacterStateInPerspective[]}} IdentifierDetailData */

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
    }

    connectedCallback() {
        this.root.innerHTML = `<link rel="stylesheet" href="${new URL('./identifier-detail.css', import.meta.url).href}">
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

    async load() {
        const version = ++this.loadVersion;
        const article = /** @type {HTMLElement} */ (this.root.querySelector('.detail'));
        const description = /** @type {HTMLElement} */ (this.root.querySelector('.description'));
        try {
            const perspective = this.currentPerspective;
            if (!perspective) throw new Error('No perspective available.');
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
}
