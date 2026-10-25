import { InitialSceneSelect } from './game/initial-scene-select.js';
import { initializeNewGame, initializeSavedGame } from './game/initialize.js';
import './game/view.js';
import { playConfirmSound, playHoverSound, stopAllAmbiencesAndStartNewOne } from '../sound.js';
import './dialog.js';

/** Coordinates initialization and hands off once the initial scene is ready. */
export class GameOverlay extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        this.initialized = false;
        /** @type {Promise<void> | null} */
        this.setupPromise = null;
        /** @type {HTMLElement | null} */
        this.exitDialog = null;
        /** @type {Array<{ element: HTMLElement, zIndex: string, visibility: string }>} */
        this.controlLayers = [];
    }

    connectedCallback() {
        this.root.innerHTML = `
            <link rel="stylesheet" href="${new URL('./game.css', import.meta.url).href}">
            <main class="game-root">
                <div class="game-content"></div>
                <button class="game-exit" type="button" aria-label="Exit game" hidden>
                    <svg viewBox="0 0 24 24" width="2.2vh" height="2.2vh" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                        <polyline points="16 17 21 12 16 7"></polyline>
                        <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                    <span>Wake up</span>
                </button>
            </main>`;
        const exit = this.root.querySelector('.game-exit');
        exit?.addEventListener('mouseenter', playHoverSound);
        exit?.addEventListener('click', () => this.onExitClick());
        for (const element of document.querySelectorAll('.fx, .ambience')) {
            if (element instanceof HTMLElement) {
                this.controlLayers.push({ element, zIndex: element.style.zIndex, visibility: element.style.visibility });
                element.style.zIndex = '50';
                element.style.visibility = 'hidden';
            }
        }
        this.initialize();
    }

    async initialize() {
        const selector = new InitialSceneSelect();
        selector.addEventListener('phase-change', event => {
            this.setSetupPhase(/** @type {CustomEvent} */ (event).detail.phase);
        });
        for (const name of ['world-namespace', 'world-id']) {
            selector.setAttribute(name, this.getAttribute(name) || '');
        }
        this.root.querySelector('.game-root')?.appendChild(selector);
        try {
            const loadingSave = !!this.getAttribute('save-id');
            const introMessages = loadingSave ? [] : await this.getIntroMessages();
            if (!this.isConnected) return;
            const ready = loadingSave ? initializeSavedGame(this) : initializeNewGame(this);
            this.setupPromise = ready;
            this.startInitialThemeSong(ready, selector.revealStarted);
            const result = await selector.select({ ready, introMessages });
            if (!this.isConnected) return;
            this.setSetupPhase('ready');
            selector.remove();
            await this.onInitialSceneSelected(result);
        } catch (error) {
            if (!this.isConnected) return;
            this.setSetupPhase('error');
            selector.remove();
            const message = document.createElement('p');
            message.setAttribute('role', 'alert');
            message.textContent = error instanceof Error ? error.message : String(error);
            this.root.querySelector('.game-content')?.replaceChildren(message);
            this.dispatchEvent(new CustomEvent('initialization-error', { detail: { error } }));
        }
    }

    /** @param {string} phase */
    setSetupPhase(phase) {
        const isIntro = phase === 'intro';
        this.root.querySelector('.game-root')?.classList.toggle('intro', isIntro);
        const exit = /** @type {HTMLButtonElement | null} */ (this.root.querySelector('.game-exit'));
        if (exit) exit.hidden = !isIntro && phase !== 'select';
        for (const { element, visibility } of this.controlLayers) {
            element.style.visibility = isIntro ? 'hidden' : visibility;
        }
    }

    async getIntroMessages() {
        const namespace = this.getAttribute('world-namespace') || '';
        const id = this.getAttribute('world-id') || '';
        try {
            const info = await window.ENGINE_WORKER_CLIENT.jsEngineGetInfoMapForScripts({ scripts: [{ namespace, id }] });
            const intro = info?.[`${namespace}/${id}`]?.metadata?.__intro;
            return Array.isArray(intro) ? intro : [];
        } catch (error) {
            console.error('Failed to load world introduction:', error);
            return [];
        }
    }

    /** @param {Promise<void>} ready @param {Promise<unknown>} revealStarted */
    async startInitialThemeSong(ready, revealStarted) {
        try {
            await ready;
            if (!this.isConnected) return;
            const theme = await window.ENGINE_WORKER_CLIENT.queryDEObject({ path: ['world', 'metadata', 'theme'] });
            if (!theme?.asset) return;
            await revealStarted;
            if (!this.isConnected) return;
            const isSystemAsset = theme.asset.startsWith('@');
            const base = isSystemAsset ? window.DREAMENGINE_DEFAULT_SCRIPTS_HOME : window.DREAMENGINE_HOME;
            const src = `${base}/${isSystemAsset ? theme.asset.slice(1) : theme.asset}`;
            await stopAllAmbiencesAndStartNewOne([
                { id: src, srcs: [{ src, fadeDurationMs: 1000, volume: theme.volume ?? 1 }] },
            ], 1000);
        } catch (error) {
            console.error('Failed to start world theme:', error);
        }
    }

    onExitClick() {
        if (this.exitDialog || document.querySelector('app-dialog')) return;
        const dialog = document.createElement('app-dialog');
        this.exitDialog = dialog;
        dialog.setAttribute('dialog-title', 'Wake up?');
        dialog.setAttribute('confirmation', 'true');
        dialog.setAttribute('confirm-text', 'Wake up');
        dialog.setAttribute('cancel-text', 'Stay');
        dialog.setAttribute('extra-z-index', '100');
        dialog.textContent = 'Are you sure you want to leave the dream? Any unsaved progress will be lost.';
        const close = () => {
            dialog.remove();
            this.exitDialog = null;
        };
        dialog.addEventListener('confirm', () => {
            playConfirmSound();
            close();
            this.dispatchEvent(new CustomEvent('exit', { bubbles: true, composed: true }));
        });
        // app-dialog plays the cancel sound for Stay, Escape and backdrop clicks.
        dialog.addEventListener('cancel', close);
        document.body.appendChild(dialog);
    }

    /** @param {{ sceneName: string | null, alreadySelected: boolean }} result */
    async onInitialSceneSelected(result) {
        if (result.sceneName && !result.alreadySelected) {
            // TODO uncomment this
            // await window.ENGINE_WORKER_CLIENT.startScene({ sceneName: result.sceneName });
        }
        if (!this.isConnected) return;
        const view = document.createElement('app-game-view');
        view.addEventListener('wake-up', () => this.onExitClick());
        this.root.querySelector('.game-content')?.replaceChildren(view);
        this.initialized = true;
        this.dispatchEvent(new CustomEvent('ready', { detail: result }));
    }

    disconnectedCallback() {
        this.exitDialog?.remove();
        this.exitDialog = null;
        const sky = document.querySelector('.sky');
        if (sky instanceof HTMLElement) sky.style.display = 'block';
        for (const { element, zIndex, visibility } of this.controlLayers) {
            element.style.zIndex = zIndex;
            element.style.visibility = visibility;
        }
        this.controlLayers = [];
        stopAllAmbiencesAndStartNewOne([
            { id: 'dream-ambience', srcs: [{ src: window.DREAM_AMBIENCE_CHOSEN, fadeDurationMs: 2000, volume: window.DREAM_AMBIENCE_CHOSEN_VOLUME }] },
        ], 1000).catch(error => console.error('Failed to restore dream ambience:', error));
        // Removing the selectors cancels pending input and intro key listeners.
        this.root.querySelectorAll('app-initial-scene-select').forEach(selector => selector.remove());
        if (!this.setupPromise) return;
        // Setup may still be running in the worker. Let it settle before ending
        // the simulation so a late initialize() cannot leave a closed game alive.
        Promise.resolve(this.setupPromise).catch(() => {}).then(() =>
            window.ENGINE_WORKER_CLIENT.endSimulation(),
        ).catch(error => console.error('Failed to end simulation:', error));
    }
}

customElements.define('app-game', GameOverlay);
