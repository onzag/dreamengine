import { playConfirmSound, playHoverSound } from '../../sound.js';
import '../world-image.js';

/** @typedef {{ namespace: string, id: string }} WorldReference */
/** @typedef {WorldReference & { type: string, language?: string, metadata?: Record<string, any> }} WorldInfo */

/** World selection owns its loading, cards, and selection UI. */
export class PlayWorldStep extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        /** @type {WorldReference | null} */
        this.selectedWorld = null;
        this.loadVersion = 0;
    }

    connectedCallback() {
        this.root.innerHTML = `
            <style>
:host {
    display: block;
    max-width: 140vh;
    margin: 0 auto;
}

* { box-sizing: border-box; }
header { margin-bottom: 4vh; }
h2 { margin: 0 0 0.8vh; color: #fff1de; font-size: 3.6vh; font-weight: 300; letter-spacing: 0.06em; }
p { margin: 0; color: #e8c6ad; font-size: 2vh; }
.world-content { color: #e8c6ad; font-size: 2vh; }
.world-group { margin-bottom: 4vh; }
h3 { display: flex; align-items: center; gap: 1.5vh; margin: 0 0 2vh; padding-bottom: 1vh; border-bottom: 1px solid #ffffff30; font-size: 2.4vh; font-weight: 400; letter-spacing: 0.15em; }
.system-tag { padding: 0.2vh 1vh; border: 1px solid #ffffff50; border-radius: 1vh; font-size: 1.5vh; letter-spacing: 0.1em; text-transform: uppercase; }
.world-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(22vh, 100%), 1fr)); gap: 3vh; }
.world-card { display: flex; flex-direction: column; align-items: center; gap: 1.6vh; padding: 2vh 1.5vh; border: 1px solid #ffc89630; border-radius: 1.2vh; background: #00000030; color: #fff1de; font: inherit; cursor: pointer; transition: background 150ms, border-color 150ms; }
.world-card:hover:enabled { background: #ffb87a14; border-color: #ffb87a90; }
.world-card[aria-pressed="true"] { background: #ffb87a26; border-color: #ffb87a; box-shadow: 0 0 2vh #ffb87a50; }
.world-card:focus-visible, button:focus-visible { outline: 2px solid #ffb87a; outline-offset: 4px; }
.world-card:disabled { opacity: 0.5; cursor: not-allowed; }
app-world-image { display: block; width: 16vh; height: 16vh; }
.world-name { max-width: 100%; overflow-wrap: anywhere; font-size: 2.2vh; }
.disabled-note { font-size: 1.7vh; line-height: 1.5; }
            </style>
            <section aria-labelledby="world-heading">
                <header>
                    <h2 id="world-heading">Choose a world</h2>
                    <p>Select the world you want to dream in.</p>
                </header>
                <div class="world-content" aria-live="polite"></div>
            </section>`;
        this.loadWorlds();
    }

    disconnectedCallback() {
        this.loadVersion += 1;
    }

    async loadWorlds() {
        const version = ++this.loadVersion;
        const content = this.root.querySelector('.world-content');
        if (!content) return;
        content.textContent = 'Loading worlds…';
        content.setAttribute('aria-busy', 'true');
        try {
            const infoMap = await window.ENGINE_WORKER_CLIENT.jsEngineGetInfoMap();
            if (!this.isConnected || version !== this.loadVersion) return;
            const worlds = Object.values(infoMap).filter(info => info.type === 'world');
            this.renderWorlds(content, worlds);
        } catch (error) {
            if (!this.isConnected || version !== this.loadVersion) return;
            console.error('Failed to load worlds:', error);
            content.textContent = 'Could not load worlds. ';
            const retry = document.createElement('button');
            retry.type = 'button';
            retry.textContent = 'Try again';
            retry.addEventListener('click', () => this.loadWorlds());
            content.appendChild(retry);
        } finally {
            if (version === this.loadVersion) content.removeAttribute('aria-busy');
        }
    }

    /** @param {Element} content @param {WorldInfo[]} worlds */
    renderWorlds(content, worlds) {
        content.replaceChildren();
        if (worlds.length === 0) {
            content.textContent = 'No worlds are available. You can create one from the Manage screen.';
            return;
        }

        const namespaces = [...new Set(worlds.map(world => world.namespace))].sort((a, b) =>
            Number(a.startsWith('@')) - Number(b.startsWith('@')) || a.localeCompare(b)
        );
        for (const namespace of namespaces) {
            const group = document.createElement('section');
            group.className = 'world-group';
            const heading = document.createElement('h3');
            heading.textContent = namespace.startsWith('@') ? namespace.slice(1) : namespace;
            if (namespace.startsWith('@')) {
                const tag = document.createElement('span');
                tag.className = 'system-tag';
                tag.textContent = 'System';
                heading.appendChild(tag);
            }
            const grid = document.createElement('div');
            grid.className = 'world-grid';
            for (const world of worlds.filter(world => world.namespace === namespace).sort((a, b) => a.id.localeCompare(b.id))) {
                grid.appendChild(this.createCard(world));
            }
            group.append(heading, grid);
            content.appendChild(group);
        }
    }

    /** @param {WorldInfo} world */
    createCard(world) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'world-card';
        card.dataset.namespace = world.namespace;
        card.dataset.id = world.id;
        card.setAttribute('aria-pressed', String(this.selectedWorld?.namespace === world.namespace && this.selectedWorld.id === world.id));
        card.setAttribute('data-de-aria-action', 'click');

        const image = document.createElement('app-world-image');
        const isSystem = world.namespace.startsWith('@');
        image.setAttribute('image-url', `${isSystem ? '@' : ''}assets/${isSystem ? world.namespace.slice(1) : world.namespace}/${world.id}/image`);
        image.setAttribute('aria-hidden', 'true');
        const name = document.createElement('span');
        name.className = 'world-name';
        name.textContent = world.id;
        card.append(image, name);

        const reason = this.disabledReason(world);
        card.disabled = !!reason;
        if (reason) {
            const note = document.createElement('span');
            note.className = 'disabled-note';
            note.textContent = reason;
            card.appendChild(note);
        }
        card.addEventListener('mouseenter', () => { if (!card.disabled) playHoverSound(); });
        card.addEventListener('click', () => {
            if (card.disabled) return;
            this.selectedWorld = { namespace: world.namespace, id: world.id };
            this.root.querySelectorAll('.world-card').forEach(other => other.setAttribute('aria-pressed', String(other === card)));
            playConfirmSound();
            this.dispatchEvent(new CustomEvent('world-select', {
                detail: { ...this.selectedWorld }, bubbles: true, composed: true,
            }));
        });
        return card;
    }

    /** @param {WorldInfo} world */
    disabledReason(world) {
        if (world.metadata?.__placeholder) return 'Not ready — no content in the file.';
        if (world.metadata?.__in_progress) return 'Not ready — still in progress.';
        const language = world.language || 'en';
        const engineLanguage = window.DREAMENGINE_LANGUAGE || 'en';
        if (language !== '*' && language.split('-')[0] !== engineLanguage.split('-')[0]) {
            return `Not compatible — world is in ${language}, engine is in ${engineLanguage}.`;
        }
        return '';
    }
}

customElements.define('app-play-world', PlayWorldStep);
