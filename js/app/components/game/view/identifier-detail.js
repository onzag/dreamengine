import '../../world-image.js';
import { createNarrationNodes } from './narration.js';

/** @typedef {{name: string, description: string, portrait?: string, banner?: string, stats?: Array<{label: string, value: string, icon: string}>}} IdentifierDetailData */

/** Shared loading, vision treatment and narration for the four detail views. */
export class IdentifierDetail extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        this.loadVersion = 0;
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

    /** @param {string} userId @returns {Promise<IdentifierDetailData>} */
    async getDisplayData(userId) { throw new Error('A detail view must provide its display data.'); }

    async load() {
        const version = ++this.loadVersion;
        const article = /** @type {HTMLElement} */ (this.root.querySelector('.detail'));
        const description = /** @type {HTMLElement} */ (this.root.querySelector('.description'));
        try {
            const client = window.ENGINE_WORKER_CLIENT;
            const userId = await client.queryDEObject({ path: ['user'] });
            const [blindness, data] = await Promise.all([
                client.queryDEObject({ path: ['characters', userId, 'blindness'] }),
                this.getDisplayData(userId),
            ]);
            if (!this.isConnected || version !== this.loadVersion) return;
            const isSelf = this.layout === 'character' && this.getAttribute('identifier-id') === userId;
            article.dataset.blindness = isSelf ? 'no' : blindness || 'no';
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
            this.root.querySelector('.character-stats')?.remove();
            if (data.stats?.length) {
                const stats = document.createElement('dl');
                stats.className = 'character-stats';
                stats.setAttribute('aria-label', 'Character details');
                for (const stat of data.stats) {
                    const row = document.createElement('div');
                    const label = document.createElement('dt');
                    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    icon.setAttribute('viewBox', '0 0 24 24');
                    icon.setAttribute('aria-hidden', 'true');
                    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    path.setAttribute('d', stat.icon);
                    icon.append(path);
                    label.append(icon, stat.label);
                    const value = document.createElement('dd');
                    value.textContent = stat.value;
                    row.append(label, value);
                    stats.append(row);
                }
                description.before(stats);
            }
            description.removeAttribute('role');
            description.textContent = data.description || 'No description available.';
            if (data.description) {
                // Keep the description readable if narration parsing is temporarily unavailable.
                try {
                    const fragments = await client.queryDEObject({ path: ['utils', 'templates', 'parseNarration'], call: [data.description] });
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
            description.textContent = 'These details are no longer available.';
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
