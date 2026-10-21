import { playCancelSound, playConfirmSound, playHoverSound } from '../../sound.js';
import '../world-image.js';
import { escapeHTML } from './character-details.js';
import { collectExposedCharacters, renderCharacterCard } from './character-card.js';

/** @typedef {'player' | 'narrator' | 'voice-in-the-head'} PlayMode */
/** @typedef {{mode: PlayMode, scriptGivenId: string | null}} IdentitySelection A null scriptGivenId means self-insert. */
/** @typedef {import('./party.js').PartyMember & {disabledReason?: string}} IdentityCharacter */

export class PlayIdentityStep extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        /** @type {{namespace: string, id: string} | null} */
        this.world = null;
        /** @type {import('./party.js').PartyMember[]} */
        this.partyCharacters = [];
        /** @type {IdentitySelection | null} */
        this.selection = null;
        /** @type {PlayMode} */
        this.playMode = 'player';
        /** @type {IdentityCharacter[]} */
        this.worldCharacters = [];
        this.selfName = 'Unnamed Dreamer';
        this.loadVersion = 0;
    }

    connectedCallback() {
        this.root.innerHTML = `
            <style>:host { display: block; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
button { font: inherit; color: inherit; text-align: inherit; }
button:focus-visible, input:focus-visible { outline: 2px solid #ffb87a; outline-offset: 4px; }
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

.special-modes {
    display: flex;
    flex-direction: column;
    gap: 1.4vh;
    margin-bottom: 3.5vh;
    padding: 2vh 2.4vh;
    border: 1px solid rgba(255, 200, 150, 0.18);
    border-radius: 1.2vh;
    background: rgba(0, 0, 0, 0.18);
}

.special-mode-toggle {
    display: flex;
    align-items: center;
    gap: 1.2vh;
    cursor: pointer;
    user-select: none;
    color: rgba(255, 220, 180, 0.85);
    font-size: 2vh;
    letter-spacing: 0.04em;
}

.special-mode-toggle input[type="checkbox"] {
    appearance: none;
    -webkit-appearance: none;
    width: 2.4vh;
    height: 2.4vh;
    border: 1px solid rgba(255, 200, 150, 0.45);
    border-radius: 0.4vh;
    background: rgba(0, 0, 0, 0.3);
    cursor: pointer;
    position: relative;
    transition: border-color 0.2s ease, background 0.2s ease;
    flex-shrink: 0;
}

.special-mode-toggle input[type="checkbox"]:hover {
    border-color: #ffb87a;
}

.special-mode-toggle input[type="checkbox"]:checked {
    background: rgba(255, 184, 122, 0.6);
    border-color: #ffb87a;
}

.special-mode-toggle input[type="checkbox"]:checked::after {
    content: '';
    position: absolute;
    left: 0.6vh;
    top: 0.1vh;
    width: 0.7vh;
    height: 1.3vh;
    border: solid #1a0f08;
    border-width: 0 0.3vh 0.3vh 0;
    transform: rotate(45deg);
}

.special-mode-toggle:hover .special-mode-label {
    color: #ffd9b0;
}

.special-mode-message {
    font-size: 1.8vh;
    line-height: 1.5;
    color: rgba(255, 220, 180, 0.7);
    padding: 1.2vh 1.6vh;
    border-left: 2px solid rgba(255, 184, 122, 0.5);
    background: rgba(255, 184, 122, 0.05);
    border-radius: 0.4vh;
    letter-spacing: 0.02em;
}

.character-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(24vh, 1fr));
    gap: 3vh;
}

.character-sections {
    display: flex;
    flex-direction: column;
    gap: 3.6vh;
}

.character-section-heading {
    font-size: 1.9vh;
    font-weight: 600;
    color: rgba(255, 220, 180, 0.85);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    margin: 0 0 1.6vh 0;
    padding-bottom: 0.8vh;
    border-bottom: 1px solid rgba(255, 200, 150, 0.2);
}

.character-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2.4vh 1.8vh;
    border-radius: 1.2vh;
    background: rgba(0, 0, 0, 0.18);
    border: 1px solid rgba(255, 200, 150, 0.18);
    cursor: pointer;
    transition: transform 0.2s ease, border-color 0.2s ease,
                background 0.2s ease, box-shadow 0.2s ease;
}

.character-card:hover {
    transform: translateY(-0.4vh);
    background: rgba(255, 184, 122, 0.08);
    border-color: rgba(255, 184, 122, 0.55);
    box-shadow: 0 0 1.6vh rgba(255, 184, 122, 0.2);
}

.character-card.selected {
    background: rgba(255, 184, 122, 0.15);
    border-color: #ffb87a;
    box-shadow: 0 0 2vh rgba(255, 184, 122, 0.45);
}

.character-card.self-insert {
    border-style: dashed;
}

.character-card.disabled {
    opacity: 0.35;
    cursor: not-allowed;
    filter: grayscale(0.6);
}

.character-card.disabled:hover {
    transform: none;
    background: rgba(0, 0, 0, 0.18);
    border-color: rgba(255, 200, 150, 0.18);
    box-shadow: none;
}

.character-card-disabled-note {
    font-size: 1.4vh;
    color: rgba(255, 200, 150, 0.7);
    margin-top: 0.6vh;
    text-align: center;
    letter-spacing: 0.05em;
    text-transform: uppercase;
}

.character-card-mcs {
    font-size: 2vh;
    color: rgba(255, 255, 255, 0.7);
    margin-bottom: 0.6vh;
    text-align: center;
    letter-spacing: 0.05em;
}

.character-card-image {
    width: 16vh;
    height: 16vh;
    margin-bottom: 1.6vh;
}

.character-card-image .character-default {
    width: 100%;
    height: 100%;
    border-radius: 10%;
    object-fit: cover;
    border: 1vh solid white;
    box-sizing: border-box;
    box-shadow: 0 0 1vh rgba(0, 0, 0, 0.5);
}

.character-card-name {
    font-size: 3vh;
    text-align: center;
    color: #fff1de;
    letter-spacing: 0.04em;
    margin-bottom: 0.6vh;
}

.character-card-desc {
    font-size: 1.6vh;
    text-align: center;
    color: rgba(255, 220, 180, 0.65);
    letter-spacing: 0.02em;
    line-height: 1.4;
    max-width: 24vh;
}

.character-card-details {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.6vh;
    margin-top: 0.4vh;
    max-width: 24vh;
}

.character-detail-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.4vh;
    padding: 0.4vh 0.9vh;
    border-radius: 1vh;
    background: rgba(0, 0, 0, 0.28);
    border: 1px solid rgba(255, 200, 150, 0.25);
    color: rgba(255, 230, 200, 0.85);
    letter-spacing: 0.02em;
    max-width: calc(100% - 5vh);
    height: auto;
    text-align: center;
    font-size: 2vh;
}

.character-detail-icon {
    font-size: 1.5vh;
    line-height: 1;
}

.character-detail-value {
    font-weight: 500;
}

/* ── Placeholder pane (kept for empty states) ── */
.placeholder-pane {
    padding: 8vh 2vh;
    text-align: center;
    font-size: 2.2vh;
    color: rgba(255, 220, 180, 0.55);
    border: 1px dashed rgba(255, 200, 150, 0.25);
    border-radius: 1.2vh;
    background: rgba(0, 0, 0, 0.12);
    letter-spacing: 0.05em;
}

</style>
            <section class="step-pane" aria-labelledby="identity-heading">
                <header class="step-heading">
                    <h2 id="identity-heading">Choose your character</h2>
                    <p class="step-sub">Pick the character you want to play as.</p>
                </header>
                <div class="special-modes">
                    <label class="special-mode-toggle">
                        <input type="checkbox" data-mode="narrator">
                        <span class="special-mode-label">Use narrator mode</span>
                    </label>
                    <label class="special-mode-toggle">
                        <input type="checkbox" data-mode="voice-in-the-head">
                        <span class="special-mode-label">Use schizophrenia mode</span>
                    </label>
                    <div class="special-mode-message" hidden aria-live="polite"></div>
                </div>
                <div class="character-sections"></div>
                <div class="world-error" role="status"></div>
            </section>`;
        this.root.querySelectorAll('input[data-mode]').forEach(input => {
            input.addEventListener('change', () => {
                const checkbox = /** @type {HTMLInputElement} */ (input);
                this.setMode(checkbox.checked ? /** @type {PlayMode} */ (checkbox.getAttribute('data-mode')) : 'player');
            });
        });
        this.renderOptions();
        this.loadCharacters();
    }

    disconnectedCallback() {
        this.loadVersion += 1;
    }

    async loadCharacters() {
        const version = ++this.loadVersion;
        const world = this.world;
        const error = this.root.querySelector('.world-error');
        if (error) error.textContent = '';
        const [userResult, worldResult] = await Promise.allSettled([
            window.API.getConfigValue('user.name'),
            world ? window.ENGINE_WORKER_CLIENT.jsEngineGetInfoMapForScripts({ scripts: [world] }) : Promise.resolve({}),
        ]);
        if (!this.isConnected || version !== this.loadVersion) return;
        if (userResult.status === 'fulfilled' && typeof userResult.value === 'string' && userResult.value.trim()) {
            this.selfName = userResult.value;
        }
        if (worldResult.status === 'fulfilled') {
            // This category belongs to the selected world itself, not its dependencies.
            /** @type {Record<string, import('./character-card.js').CharacterScript>} */
            const infoMap = worldResult.value;
            const script = world ? infoMap[`${world.namespace}/${world.id}`] : undefined;
            const partyIds = new Set(this.partyCharacters.map(c => c.scriptGivenId));
            this.worldCharacters = collectExposedCharacters(script ? [script] : [])
                .filter(c => !partyIds.has(c.scriptGivenId));
        } else {
            this.worldCharacters = [];
            console.error('Failed to load world identities:', worldResult.reason);
            if (error) {
                error.textContent = 'Could not load world characters. ';
                const retry = document.createElement('button');
                retry.type = 'button';
                retry.textContent = 'Try again';
                retry.addEventListener('click', () => this.loadCharacters());
                error.appendChild(retry);
            }
        }
        if (this.selection?.scriptGivenId && !this.availableCharacters().some(c =>
            c.scriptGivenId === this.selection?.scriptGivenId && !c.disabledReason
        )) this.selection = null;
        this.renderOptions();
        this.notifyChange();
    }

    /** @returns {IdentityCharacter[]} */
    availableCharacters() {
        return [...this.partyCharacters, ...this.worldCharacters];
    }

    renderOptions() {
        const sections = this.root.querySelector('.character-sections');
        if (!sections) return;
        const self = {
            namespace: '', id: '', scriptGivenId: '', name: this.selfName,
            asset: 'profile', description: 'A self-insert: play as yourself.', details: {},
        };
        const categories = [
            { title: 'Play as yourself', cards: renderCharacterCard(self, { self: true }) },
            { title: 'Play as a party character', cards: this.partyCharacters.map(c => renderCharacterCard(c)).join('') },
            { title: 'Play as a known world character', cards: this.worldCharacters.map(c => renderCharacterCard(c)).join('') },
        ];
        sections.innerHTML = categories.filter(category => category.cards).map(category => `
            <section class="character-section">
                <h3 class="character-section-heading">${escapeHTML(category.title)}</h3>
                <div class="character-grid">${category.cards}</div>
            </section>`).join('');
        sections.querySelectorAll('.character-card').forEach(card => {
            card.addEventListener('mouseenter', () => { if (!card.hasAttribute('disabled')) playHoverSound(); });
            card.addEventListener('click', () => {
                if (card.hasAttribute('disabled')) return;
                this.selectIdentity(card.getAttribute('data-self') === 'true' ? null : card.getAttribute('data-script-given-id'));
            });
        });
        this.syncSelection();
    }

    /** @param {string | null} scriptGivenId */
    selectIdentity(scriptGivenId) {
        if (scriptGivenId === null) {
            if (this.playMode !== 'player') return;
        } else if (!this.availableCharacters().some(c => c.scriptGivenId === scriptGivenId && !c.disabledReason)) {
            return;
        }
        this.selection = { mode: this.playMode, scriptGivenId };
        playConfirmSound();
        this.syncSelection();
        this.notifyChange();
    }

    /** @param {PlayMode} mode */
    setMode(mode) {
        this.playMode = mode;
        if (this.selection) {
            this.selection = this.selection.scriptGivenId === null && mode !== 'player'
                ? null : { ...this.selection, mode };
        }
        if (mode === 'player') playCancelSound();
        else playConfirmSound();
        this.syncSelection();
        this.notifyChange();
    }

    syncSelection() {
        this.root.querySelectorAll('input[data-mode]').forEach(input => {
            /** @type {HTMLInputElement} */ (input).checked = input.getAttribute('data-mode') === this.playMode;
        });
        const message = /** @type {HTMLElement | null} */ (this.root.querySelector('.special-mode-message'));
        if (message) {
            message.hidden = this.playMode === 'player';
            message.textContent = this.playMode === 'narrator'
                ? "As a narrator you become part of the Story Master, you will not play directly as the character but instead narrate their lives, affecting how they behave. Your words cannot affect other characters and you should write in 3rd person. You will know the mental states of your character and how they feel about things, and ultimately you have the final word about how they live."
                : this.playMode === 'voice-in-the-head'
                    ? `You become a voice in the character's head (named "${this.selfName}") that they hear directly, and none else but that character can hear you and may reply back.` : '';
        }
        this.root.querySelectorAll('.character-card').forEach(card => {
            const self = card.getAttribute('data-self') === 'true';
            const disabled = self && this.playMode !== 'player';
            if (self) {
                /** @type {HTMLButtonElement} */ (card).disabled = disabled;
                card.classList.toggle('disabled', disabled);
                const note = /** @type {HTMLElement | null} */ (card.querySelector('.character-card-disabled-note'));
                if (note) {
                    note.hidden = !disabled;
                    note.textContent = disabled ? 'Not available with this mode' : '';
                }
            }
            const selected = !!this.selection && !disabled && (self
                ? this.selection.scriptGivenId === null
                : this.selection.scriptGivenId === card.getAttribute('data-script-given-id'));
            card.classList.toggle('selected', selected);
            card.setAttribute('aria-pressed', String(selected));
        });
    }

    notifyChange() {
        const selected = this.selection?.scriptGivenId
            ? this.availableCharacters().find(c => c.scriptGivenId === this.selection?.scriptGivenId) : null;
        const character = !this.selection ? null : this.selection.scriptGivenId === null
            ? { name: this.selfName, asset: 'profile' }
            : selected ? { name: selected.name, asset: selected.asset, scriptKey: `${selected.namespace}/${selected.id}` } : null;
        this.dispatchEvent(new CustomEvent('identity-change', {
            detail: { mode: this.playMode, selection: this.selection ? { ...this.selection } : null, character },
            bubbles: true, composed: true,
        }));
    }
}

customElements.define('app-play-identity', PlayIdentityStep);
