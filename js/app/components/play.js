import { playCancelSound, playConfirmSound, playHoverSound, playSound, stopAllAmbiencesAndStartNewOne } from '../sound.js';
import { PlayWorldStep } from './play/world.js';
import { PlayLoadNewStep } from './play/load-new.js';
import { PlayPartyStep } from './play/party.js';

/** Hosts the play setup steps and their shared state. */
class PlayOverlay extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        /** @type {{ namespace: string, id: string } | null} */
        this.selectedWorld = null;
        this.currentStepIndex = 0;
        /** @type {'new' | 'load' | null} */
        this.selectedMode = null;
        /** @type {string | null} */
        this.selectedSaveId = null;
        this.selectedDreamStability = 'stable';
        /** @type {import('./play/party.js').PartyMember[]} */
        this.selectedPartyCharacters = [];
        /** @type {Set<string>} */
        this.expandedPartyNamespaces = new Set();
        // Rendering and navigation use this list; adding a step needs no index branches.
        this.steps = [
            { id: 'world', label: 'World', create: () => this.createWorldStep(), canContinue: () => !!this.selectedWorld },
            { id: 'mode', label: 'Mode', create: () => this.createModeStep(), canContinue: () => this.selectedMode === 'new' && !!this.selectedDreamStability },
            { id: 'party', label: 'Party', create: () => this.createPartyStep(), canContinue: () => true },
        ];
        this.startedGame = false;
        this.ambienceId = '';
        /** @type {ReturnType<typeof setTimeout> | null} */
        this.hideSkyTimer = null;
        /** @type {HTMLElement | null} */
        this.sky = null;
        this.previousSkyDisplay = '';
        this.onDocumentKeydown = this.onDocumentKeydown.bind(this);
    }

    connectedCallback() {
        this.root.innerHTML = `
            <link rel="stylesheet" href="${new URL('./play.css', import.meta.url).href}">
            <section class="play-overlay" role="dialog" aria-modal="true" aria-labelledby="play-title"
                data-de-aria-group="static" data-de-aria-group-use-inert data-de-aria-group-active>
                <header class="play-header">
                    <h1 id="play-title" data-de-aria-text tabindex="0">Play</h1>
                    <div class="play-step" aria-current="step"><span>1</span> World</div>
                </header>
                <main class="play-body" data-de-aria-scroller tabindex="-1"></main>
                <footer class="play-footer">
                    <button class="play-back" type="button" aria-label="Back to main menu"
                        data-de-aria-key="x" data-de-aria-action="click">Back</button>
                    <button class="play-start" type="button" disabled>Continue</button>
                </footer>
            </section>`;

        const back = this.root.querySelector('.play-back');
        back?.addEventListener('mouseenter', playHoverSound);
        back?.addEventListener('click', () => this.onBack());
        const next = /** @type {HTMLButtonElement | null} */ (this.root.querySelector('.play-start'));
        next?.addEventListener('mouseenter', () => {
            if (!next.disabled) playHoverSound();
        });
        next?.addEventListener('click', () => this.onContinue());
        this.ambienceId = '';
        this.renderStep();
        document.addEventListener('keydown', this.onDocumentKeydown);

        this.sky = document.querySelector('.sky');
        this.previousSkyDisplay = this.sky?.style.display || '';
        this.hideSkyTimer = setTimeout(() => {
            if (this.isConnected && this.sky) this.sky.style.display = 'none';
            this.hideSkyTimer = null;
        }, 200);
    }

    renderStep() {
        const body = this.root.querySelector('.play-body');
        const definition = this.steps[this.currentStepIndex];
        if (!body || !definition) return;
        body.replaceChildren(definition.create());
        body.scrollTop = 0;
        const indicator = this.root.querySelector('.play-step');
        if (indicator) {
            const number = document.createElement('span');
            number.textContent = String(this.currentStepIndex + 1);
            indicator.replaceChildren(number, document.createTextNode(` ${definition.label}`));
        }
        const back = this.root.querySelector('.play-back');
        const previous = this.steps[this.currentStepIndex - 1];
        back?.setAttribute('aria-label', previous ? `Back to ${previous.label.toLowerCase()} selection` : 'Back to main menu');
        this.updateFooter();
        this.applyTheme();
    }

    createWorldStep() {
        const step = new PlayWorldStep();
        step.selectedWorld = this.selectedWorld;
        step.addEventListener('world-select', event => {
            const world = /** @type {CustomEvent<{namespace: string, id: string}>} */ (event).detail;
            if (world.namespace !== this.selectedWorld?.namespace || world.id !== this.selectedWorld?.id) {
                this.selectedMode = null;
                this.selectedSaveId = null;
                this.selectedDreamStability = 'stable';
                this.selectedPartyCharacters = [];
                this.expandedPartyNamespaces.clear();
            }
            this.selectedWorld = world;
            this.updateFooter();
            this.applyTheme();
        });
        return step;
    }

    createModeStep() {
        const step = new PlayLoadNewStep();
        step.world = this.selectedWorld;
        step.mode = this.selectedMode;
        step.dreamStability = this.selectedDreamStability;
        step.addEventListener('mode-change', event => {
            const detail = /** @type {CustomEvent<{mode: 'new' | 'load', dreamStability: string}>} */ (event).detail;
            this.selectedMode = detail.mode;
            this.selectedSaveId = null;
            this.selectedDreamStability = detail.dreamStability;
            this.applyTheme();
            this.updateFooter();
        });
        step.addEventListener('save-select', event => {
            if (this.startedGame || this.selectedMode !== 'load') return;
            this.selectedSaveId = /** @type {CustomEvent<{saveId: string}>} */ (event).detail.saveId;
            this.startSavedGame();
        });
        return step;
    }

    createPartyStep() {
        const step = new PlayPartyStep();
        step.selectedPartyCharacters = this.selectedPartyCharacters.map(c => ({ ...c, details: { ...c.details } }));
        step.expandedNamespaces = this.expandedPartyNamespaces;
        step.addEventListener('party-change', event => {
            this.selectedPartyCharacters = /** @type {CustomEvent<import('./play/party.js').PartyMember[]>} */ (event).detail;
            this.updateFooter();
        });
        return step;
    }

    updateFooter() {
        const next = /** @type {HTMLButtonElement | null} */ (this.root.querySelector('.play-start'));
        if (!next) return;
        const definition = this.steps[this.currentStepIndex];
        next.disabled = this.startedGame || !definition?.canContinue();
        next.textContent = definition?.id === 'mode' && this.selectedMode === 'load' ? 'Start' : 'Continue';
    }

    onBack() {
        if (this.startedGame) return;
        if (this.currentStepIndex === 0) return this.close();
        playCancelSound();
        this.currentStepIndex -= 1;
        this.renderStep();
    }

    onContinue() {
        if (this.startedGame || !this.steps[this.currentStepIndex]?.canContinue()) return;
        if (!this.steps[this.currentStepIndex + 1]) return;
        playConfirmSound();
        this.currentStepIndex += 1;
        this.renderStep();
    }

    applyTheme() {
        const overlay = this.root.querySelector('.play-overlay');
        const stability = this.selectedMode === 'new' ? this.selectedDreamStability : 'stable';
        overlay?.classList.toggle('stability-unstable', stability === 'unstable');
        overlay?.classList.toggle('stability-very-unstable', stability === 'very unstable');
        const id = stability === 'unstable' ? 'awakening-lucid' : stability === 'very unstable' ? 'awakening-astral' : 'awakening-ambience';
        if (id === this.ambienceId || this.startedGame) return;
        this.ambienceId = id;
        stopAllAmbiencesAndStartNewOne([{
            id, srcs: [{ src: `./sounds/${id}.mp3`, fadeDurationMs: stability === 'very unstable' ? 2000 : 1000, volume: 1.5 }],
        }], 1000);
    }

    startSavedGame() {
        if (this.startedGame || !this.selectedWorld || !this.selectedSaveId || this.selectedMode !== 'load') return;
        this.startedGame = true;
        this.updateFooter();
        this.root.querySelector('.play-overlay')?.setAttribute('inert', '');
        const fade = document.createElement('div');
        fade.className = 'play-light-fade';
        this.root.appendChild(fade);
        requestAnimationFrame(() => fade.classList.add('visible'));
        setTimeout(() => { if (this.isConnected) playSound('./sounds/transition.mp3', 0.8); }, 300);
        stopAllAmbiencesAndStartNewOne([], 1000);
        this.dispatchEvent(new CustomEvent('start', {
            detail: {
                world: { ...this.selectedWorld },
                mode: 'load',
                saveId: this.selectedSaveId,
                dreamStability: this.selectedDreamStability,
            },
        }));
    }

    async disconnectedCallback() {
        document.removeEventListener('keydown', this.onDocumentKeydown);
        if (this.hideSkyTimer !== null) clearTimeout(this.hideSkyTimer);
        this.hideSkyTimer = null;
        if (this.startedGame) return;
        if (this.sky) this.sky.style.display = this.previousSkyDisplay;
        await stopAllAmbiencesAndStartNewOne([{
            id: 'dream-ambience',
            srcs: [{
                src: window.DREAM_AMBIENCE_CHOSEN,
                fadeDurationMs: 2000,
                volume: window.DREAM_AMBIENCE_CHOSEN_VOLUME,
            }],
        }], 1000);
    }

    /** @param {KeyboardEvent} event */
    onDocumentKeydown(event) {
        if (event.key !== 'Escape' || document.querySelector('app-dialog')) return;
        let host = /** @type {HTMLElement} */ (this);
        while (host.getRootNode() instanceof ShadowRoot) {
            host = /** @type {HTMLElement} */ (/** @type {ShadowRoot} */ (host.getRootNode()).host);
        }
        if (document.body.lastElementChild === host) this.close();
    }

    close() {
        if (this.startedGame) return;
        playCancelSound();
        this.dispatchEvent(new CustomEvent('cancel'));
    }
}

customElements.define('app-play', PlayOverlay);
