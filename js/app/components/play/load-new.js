import { playConfirmSound, playHoverSound } from '../../sound.js';

const STABILITY_OPTIONS = [
    { id: 'stable', label: 'Normal', description: 'Normal dreams are consistent and coherent, with a clear narrative and logical progression, making them easier to navigate and interact with.' },
    { id: 'unstable', label: 'Vivid Dream', description: 'Vivid dreams may have sudden changes in setting, characters, or narrative, creating a more surreal and challenging experience. A vivid dream might turn into a lucid dream or nightmare.' },
    { id: 'very unstable', label: 'Astral Dream', description: 'Astral dreams can suddenly become chaotic and fragmented, with nightmarish and lucid elements, characters may become self aware, making them difficult to navigate and interact with, and may lead to a dream collapse.' },
];

/** Selects how to begin in the chosen world. */
export class PlayLoadNewStep extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        /** @type {{namespace: string, id: string} | null} */
        this.world = null;
        /** @type {'new' | 'load' | null} */
        this.mode = null;
        this.dreamStability = 'stable';
        this.loadVersion = 0;
    }

    connectedCallback() {
        this.root.innerHTML = `
            <style>
                :host { display: block; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
button { font: inherit; text-align: left; color: inherit; }
button:focus-visible { outline: 2px solid #ffb87a; outline-offset: 4px; }
.mode-card-title, .mode-card-desc { display: block; }
h3 { font-weight: 400; }
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

.world-pill {
    display: inline-block;
    padding: 0.3vh 1.2vh;
    margin-left: 0.6vh;
    border: 1px solid rgba(255, 200, 150, 0.4);
    border-radius: 1vh;
    background: rgba(255, 184, 122, 0.08);
    color: #ffe6c8;
    font-size: 1.9vh;
    letter-spacing: 0.04em;
}

.mode-options {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3vh;
    margin-bottom: 4vh;
}

.mode-card {
    padding: 4vh 3vh;
    border-radius: 1.2vh;
    background: rgba(0, 0, 0, 0.18);
    border: 1px solid rgba(255, 200, 150, 0.2);
    cursor: pointer;
    transition: transform 0.2s ease, border-color 0.2s ease,
                background 0.2s ease, box-shadow 0.2s ease;
}

.mode-card:hover {
    transform: translateY(-0.4vh);
    background: rgba(255, 184, 122, 0.08);
    border-color: rgba(255, 184, 122, 0.55);
    box-shadow: 0 0 1.6vh rgba(255, 184, 122, 0.2);
}

.mode-card.selected {
    background: rgba(255, 184, 122, 0.15);
    border-color: #ffb87a;
    box-shadow: 0 0 2vh rgba(255, 184, 122, 0.45);
}

.mode-card-title {
    font-size: 3vh;
    font-weight: 300;
    color: #fff1de;
    letter-spacing: 0.08em;
    margin-bottom: 1vh;
}

.mode-card-desc {
    font-size: 1.9vh;
    color: rgba(255, 220, 180, 0.7);
    letter-spacing: 0.03em;
}

.saves-panel {
    border-top: 1px solid rgba(255, 200, 150, 0.18);
    padding-top: 3vh;
    animation: step-fade-in 220ms ease-out;
}

.saves-panel.hidden {
    display: none;
}

.stability-panel {
    border-top: 1px solid rgba(255, 200, 150, 0.18);
    padding-top: 3vh;
    margin-top: 3vh;
    animation: step-fade-in 220ms ease-out;
}

.stability-panel.hidden {
    display: none;
}

.saves-panel-title {
    font-size: 2.2vh;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: rgba(255, 220, 180, 0.8);
    margin-bottom: 2vh;
}

.saves-list {
    display: flex;
    flex-direction: column;
    gap: 1.2vh;
}

.save-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.8vh;
    padding: 1.6vh 2.4vh;
    border-radius: 0.8vh;
    background: rgba(0, 0, 0, 0.18);
    border: 1px solid rgba(255, 200, 150, 0.2);
    cursor: pointer;
    transition: border-color 0.2s ease, background 0.2s ease,
                box-shadow 0.2s ease;
}

.save-item:hover {
    background: rgba(255, 184, 122, 0.08);
    border-color: rgba(255, 184, 122, 0.5);
}

.save-item.selected {
    background: rgba(255, 184, 122, 0.15);
    border-color: #ffb87a;
    box-shadow: 0 0 1.4vh rgba(255, 184, 122, 0.35);
}

.save-item-name {
    font-size: 2.1vh;
    color: #fff1de;
    letter-spacing: 0.03em;
}

.save-item-meta {
    font-size: 1.7vh;
    color: rgba(255, 220, 180, 0.55);
    letter-spacing: 0.05em;
}

.save-item-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6vh 1vh;
}

.save-meta-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.4vh;
    padding: 0.3vh 0.9vh;
    border-radius: 0.5vh;
    background: rgba(255, 184, 122, 0.1);
    border: 1px solid rgba(255, 184, 122, 0.25);
    font-size: 1.5vh;
}

.save-meta-key {
    color: rgba(255, 220, 180, 0.55);
    letter-spacing: 0.04em;
}

.save-meta-key::after {
    content: ':';
    margin-right: 0.3vh;
}

.save-meta-value {
    color: #fff1de;
    letter-spacing: 0.03em;
}

@media (max-width: 600px) { .mode-options { grid-template-columns: 1fr; } }
            </style>
            <section class="step-pane" aria-labelledby="mode-heading">
                <header class="step-heading">
                    <h2 id="mode-heading">How would you like to begin?</h2>
                    <p class="step-sub">World: <span class="world-pill"></span></p>
                </header>
                <div class="mode-options">
                    <button type="button" class="mode-card" data-mode="new" aria-pressed="false">
                        <span class="mode-card-title">New Dream</span>
                        <span class="mode-card-desc">Start a fresh dream in this world.</span>
                    </button>
                    <button type="button" class="mode-card" data-mode="load" aria-pressed="false">
                        <span class="mode-card-title">Load Saved Dream</span>
                        <span class="mode-card-desc">Continue from a previous dream.</span>
                    </button>
                </div>
                <section class="saves-panel" hidden>
                    <h3 class="saves-panel-title">Pick a save</h3>
                    <div class="saves-list" aria-live="polite"></div>
                </section>
                <section class="stability-panel" hidden>
                    <h3 class="saves-panel-title">Dream Stability</h3>
                    <div class="saves-list">
                        ${STABILITY_OPTIONS.map(option => `
                            <button type="button" class="save-item stability-item" data-stability-id="${option.id}" aria-pressed="false">
                                <span class="save-item-name">${option.label}</span>
                                <span class="save-item-meta">${option.description}</span>
                            </button>`).join('')}
                    </div>
                </section>
            </section>`;
        const label = this.root.querySelector('.world-pill');
        if (label && this.world) label.textContent = `${this.world.namespace.replace(/^@/, '')} / ${this.world.id}`;
        this.root.querySelectorAll('.mode-card').forEach(card => {
            card.addEventListener('mouseenter', playHoverSound);
            card.addEventListener('click', () => {
                playConfirmSound();
                this.selectMode(/** @type {'new' | 'load'} */(card.getAttribute('data-mode')));
            });
        });
        this.root.querySelectorAll('.stability-item').forEach(item => {
            item.addEventListener('mouseenter', playHoverSound);
            item.addEventListener('click', () => {
                this.dreamStability = item.getAttribute('data-stability-id') || 'stable';
                this.syncSelection();
                playConfirmSound();
                this.notifyChange();
            });
        });
        this.syncSelection();
        if (this.mode === 'load') this.loadSaves();
    }

    disconnectedCallback() {
        this.loadVersion += 1;
    }

    /** @param {'new' | 'load'} mode */
    selectMode(mode) {
        this.loadVersion += 1;
        this.mode = mode;
        this.syncSelection();
        this.notifyChange();
        if (mode === 'load') this.loadSaves();
    }

    notifyChange() {
        this.dispatchEvent(new CustomEvent('mode-change', {
            detail: { mode: this.mode, dreamStability: this.dreamStability },
            bubbles: true, composed: true,
        }));
    }

    syncSelection() {
        this.root.querySelectorAll('.mode-card').forEach(card => {
            const selected = card.getAttribute('data-mode') === this.mode;
            card.classList.toggle('selected', selected);
            card.setAttribute('aria-pressed', String(selected));
        });
        this.root.querySelectorAll('.stability-item').forEach(item => {
            const selected = item.getAttribute('data-stability-id') === this.dreamStability;
            item.classList.toggle('selected', selected);
            item.setAttribute('aria-pressed', String(selected));
        });
        const saves = /** @type {HTMLElement | null} */ (this.root.querySelector('.saves-panel'));
        const stability = /** @type {HTMLElement | null} */ (this.root.querySelector('.stability-panel'));
        if (saves) saves.hidden = this.mode !== 'load';
        if (stability) stability.hidden = this.mode !== 'new';
    }

    async loadSaves() {
        if (!this.world) return;
        const version = ++this.loadVersion;
        const list = this.root.querySelector('.saves-panel .saves-list');
        if (!list) return;
        list.textContent = 'Loading saves…';
        list.setAttribute('aria-busy', 'true');
        try {
            const saves = await window.API.listSaveFiles(this.world.namespace, this.world.id);
            if (!this.isConnected || version !== this.loadVersion || this.mode !== 'load') return;
            list.replaceChildren();
            if (saves.length === 0) list.textContent = 'No saves found for this world.';
            for (const save of saves) {
                const saveId = save.filePath.split(/[\\/]/).pop()?.replace(/\.gz$/, '') || '';
                if (!saveId) continue;
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'save-item';
                item.dataset.saveId = saveId;
                const name = document.createElement('span');
                name.className = 'save-item-name';
                name.textContent = save.saveName;
                item.appendChild(name);
                if (save.metadata && typeof save.metadata === 'object') {
                    const chips = document.createElement('span');
                    chips.className = 'save-item-chips';
                    for (const [key, value] of Object.entries(save.metadata)) {
                        const chip = document.createElement('span');
                        chip.className = 'save-meta-chip';
                        const label = document.createElement('span');
                        label.className = 'save-meta-key';
                        label.textContent = key;
                        const text = document.createElement('span');
                        text.className = 'save-meta-value';
                        text.textContent = String(value);
                        chip.append(label, text);
                        chips.appendChild(chip);
                    }
                    item.appendChild(chips);
                }
                item.addEventListener('mouseenter', playHoverSound);
                item.addEventListener('click', () => {
                    if (this.mode !== 'load') return;
                    playConfirmSound();
                    this.dispatchEvent(new CustomEvent('save-select', {
                        detail: { saveId }, bubbles: true, composed: true,
                    }));
                });
                list.appendChild(item);
            }
        } catch (error) {
            if (!this.isConnected || version !== this.loadVersion || this.mode !== 'load') return;
            console.error('Failed to load saves:', error);
            list.textContent = 'Could not load save files. ';
            const retry = document.createElement('button');
            retry.type = 'button';
            retry.textContent = 'Try again';
            retry.addEventListener('click', () => this.loadSaves());
            list.appendChild(retry);
        } finally {
            if (version === this.loadVersion) list.removeAttribute('aria-busy');
        }
    }
}

customElements.define('app-play-load-new', PlayLoadNewStep);
