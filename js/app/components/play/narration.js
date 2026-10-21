import { playConfirmSound, playHoverSound, playNarration, stopNarration } from '../../sound.js';
import { escapeHTML } from './character-details.js';

/** @typedef {string | null} NarrationChoice Null keeps the world default; @none explicitly disables narration. */

/** Optional narrator selection and reference-audio preview. */
export class PlayNarrationStep extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        /** @type {CharacterVoiceEntryWithLanguage[]} */
        this.narrators = [];
        this.selectedNarrator = '@world';
        this.loadVersion = 0;
    }

    connectedCallback() {
        this.root.innerHTML = `
            <style>:host { display: block; }
* { box-sizing: border-box; }
button { font: inherit; color: inherit; }
button:focus-visible, input:focus-visible { outline: 2px solid #ffb87a; outline-offset: 4px; }
.narrator-status { margin-top: 2vh; }
.step-pane {
    max-width: 140vh;
    margin: 0 auto;
    animation: step-fade-in 220ms ease-out;
}

@keyframes step-fade-in {
    from { opacity: 0; transform: translateY(1vh); }
    to { opacity: 1; transform: translateY(0); }
}

.step-heading {
    margin-bottom: 4vh;
}

.step-heading h2 {
    font-size: 3.6vh;
    font-weight: 300;
    margin: 0 0 0.8vh 0;
    letter-spacing: 0.06em;
    color: #fff1de;
}

.step-heading .step-sub {
    margin: 0;
    font-size: 2vh;
    color: rgba(255, 220, 180, 0.7);
    letter-spacing: 0.05em;
}

.narrator-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(20vh, 1fr));
    gap: 2vh;
    margin-top: 2vh;
}

.narrator-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1vh;
    padding: 2.4vh 1.8vh;
    border-radius: 1.2vh;
    background: rgba(0, 0, 0, 0.18);
    border: 1px solid rgba(255, 200, 150, 0.18);
    cursor: pointer;
    transition: transform 0.2s ease, border-color 0.2s ease,
                background 0.2s ease, box-shadow 0.2s ease;
}

.narrator-card:hover {
    transform: translateY(-0.4vh);
    background: rgba(255, 184, 122, 0.08);
    border-color: rgba(255, 184, 122, 0.55);
    box-shadow: 0 0 1.6vh rgba(255, 184, 122, 0.2);
}

.narrator-card.selected {
    background: rgba(255, 184, 122, 0.15);
    border-color: #ffb87a;
    box-shadow: 0 0 2vh rgba(255, 184, 122, 0.45);
}

.narrator-card-icon {
    font-size: 4vh;
    line-height: 1;
}

.narrator-card-name {
    font-size: 2.2vh;
    text-align: center;
    color: #fff1de;
    letter-spacing: 0.03em;
    word-break: break-word;
}

</style>
            <section class="step-pane" aria-labelledby="narration-heading">
                <header class="step-heading">
                    <h2 id="narration-heading">Choose a narrator voice</h2>
                    <p class="step-sub">Use the world?s narrator, choose a voice, or turn narration off. Select a voice to hear a preview.</p>
                </header>
                <div class="narrator-grid"></div>
                <div class="narrator-status" role="status"></div>
            </section>`;
        this.renderCards();
        this.loadNarrators();
    }

    disconnectedCallback() {
        this.finish();
    }

    finish() {
        this.loadVersion += 1;
        stopNarration();
    }

    async loadNarrators() {
        const version = ++this.loadVersion;
        const status = this.root.querySelector('.narrator-status');
        if (status) status.textContent = 'Loading narrators…';
        try {
            const narrators = await window.API.listNarrators(window.DREAMENGINE_LANGUAGE);
            if (!this.isConnected || version !== this.loadVersion) return;
            this.narrators = narrators;
            const saved = localStorage.getItem('narratorVoice') || '@world';
            this.selectedNarrator = saved === '@world' || saved === '@none' ? saved
                : narrators.find(n => n.asset === saved)?.asset || '@world';
            if (status) status.textContent = '';
            this.renderCards();
            this.notifyChange();
            if (this.selectedNarrator !== '@none' && this.selectedNarrator !== '@world') this.preview(this.selectedNarrator);
        } catch (error) {
            if (!this.isConnected || version !== this.loadVersion) return;
            console.error('Failed to list narrators:', error);
            this.narrators = [];
            this.selectedNarrator = '@world';
            this.renderCards();
            this.notifyChange();
            if (status) {
                status.textContent = 'Could not load narrator voices. ';
                const retry = document.createElement('button');
                retry.type = 'button';
                retry.textContent = 'Try again';
                retry.addEventListener('click', () => this.loadNarrators());
                status.appendChild(retry);
            }
        }
    }

    renderCards() {
        const grid = this.root.querySelector('.narrator-grid');
        if (!grid) return;
        const voices = [{ asset: '@world', name: 'Use world narrator' }, { asset: '@none', name: 'No narrator' }, ...this.narrators.map(n => ({
            asset: n.asset,
            name: `${n.asset.startsWith('@') ? '(System) ' : ''}${n.asset.split('/').pop()?.replace(/\.[^/.]+$/, '') || n.asset}`,
        }))];
        grid.innerHTML = voices.map(voice => `
            <button type="button" class="narrator-card${voice.asset === this.selectedNarrator ? ' selected' : ''}"
                data-value="${escapeHTML(voice.asset)}" aria-pressed="${voice.asset === this.selectedNarrator}">
                <span class="narrator-card-icon">${voice.asset === '@world' ? '🌐' : voice.asset === '@none' ? '🔇' : '🎙️'}</span>
                <span class="narrator-card-name">${escapeHTML(voice.name)}</span>
            </button>`).join('');
        grid.querySelectorAll('.narrator-card').forEach(card => {
            card.addEventListener('mouseenter', playHoverSound);
            card.addEventListener('click', () => this.selectNarrator(card.getAttribute('data-value') || '@none'));
        });
    }

    /** @param {string} asset */
    selectNarrator(asset) {
        if (asset !== '@world' && asset !== '@none' && !this.narrators.some(n => n.asset === asset)) return;
        this.selectedNarrator = asset;
        localStorage.setItem('narratorVoice', asset);
        this.root.querySelectorAll('.narrator-card').forEach(card => {
            const selected = card.getAttribute('data-value') === asset;
            card.classList.toggle('selected', selected);
            card.setAttribute('aria-pressed', String(selected));
        });
        if (asset === '@none' || asset === '@world') {
            stopNarration();
            playConfirmSound();
        } else this.preview(asset);
        this.notifyChange();
    }

    /** @param {string} asset */
    preview(asset) {
        const system = asset.startsWith('@');
        const base = system ? window.DREAMENGINE_DEFAULT_SCRIPTS_HOME : window.DREAMENGINE_HOME;
        playNarration(`${base}/${system ? asset.slice(1) : asset}`);
    }

    notifyChange() {
        const choice = this.selectedNarrator === '@world' ? null : this.selectedNarrator;
        this.dispatchEvent(new CustomEvent('narration-change', { detail: choice, bubbles: true, composed: true }));
    }
}

customElements.define('app-play-narration', PlayNarrationStep);
