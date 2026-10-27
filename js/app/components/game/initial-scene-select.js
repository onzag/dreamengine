import { playConfirmSound, playHoverSound } from '../../sound.js';
import { GameIntro } from './intro.js';
import '../world-image.js';

/**
 * Owns the intro, loading screen and initial-scene picker. It never starts a
 * scene or initializes the engine; select() returns control to the caller.
 */
export class InitialSceneSelect extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        this.controller = new AbortController();
        /** @type {() => void} */
        this.finishIntro = () => {};
        this.introFinished = new Promise(resolve => { this.finishIntro = () => resolve(undefined); });
        /** @type {() => void} */
        this.beginReveal = () => {};
        this.revealStarted = new Promise(resolve => { this.beginReveal = () => resolve(undefined); });
    }

    disconnectedCallback() {
        this.controller.abort();
        this.finishIntro();
        this.beginReveal();
    }

    /**
     * Start after mounting. Initialization can run behind the intro; its errors
     * are observed immediately and reported once the intro has ended.
     * @param {{ ready: Promise<unknown>, introMessages?: Array<{ title?: string, subtitle?: string, delay?: number }> }} options
     * @returns {Promise<{ sceneName: string | null, alreadySelected: boolean }>}
     */
    async select({ ready, introMessages = [] }) {
        const initialization = ready.then(
            () => ({ ok: true, error: undefined }),
            error => ({ ok: false, error }),
        );
        this.render();
        const signal = this.controller.signal;
        const fade = /** @type {HTMLElement} */ (this.root.querySelector('.light-fade'));
        if (introMessages.length) {
            const intro = new GameIntro();
            fade.appendChild(intro);
            await intro.play(introMessages);
        } else {
            await this.wait(1000);
        }
        signal.throwIfAborted();
        fade.classList.add('fade-out');
        this.beginReveal();
        await this.wait(1100);
        fade.remove();
        this.dispatchEvent(new CustomEvent('phase-change', { detail: { phase: 'loading' } }));
        this.finishIntro();

        const { ok, error } = await initialization;
        signal.throwIfAborted();
        if (!ok) throw error;
        const selectedScene = await window.ENGINE_WORKER_CLIENT.queryDEObject({ path: ['world', 'selectedScene'] });
        signal.throwIfAborted();
        if (selectedScene) return { sceneName: selectedScene, alreadySelected: true };

        const actualUserName = await window.ENGINE_WORKER_CLIENT.queryDEObject({ path: ['user'] });
        const sceneNames = await window.ENGINE_WORKER_CLIENT.queryDEObject({ path: ['world', 'initialScenes'] });
        /** @type {Record<string, string>} */
        const options = {};
        for (const sceneName of sceneNames || []) {
            signal.throwIfAborted();
            options[sceneName] = await window.ENGINE_WORKER_CLIENT.callCharOnlyTemplate({
                path: ['world', 'scenes', sceneName, 'narration'],
                characterId: actualUserName,
                stripIdentifierIds: true,
            });
        }
        signal.throwIfAborted();
        if (!Object.keys(options).length) return { sceneName: null, alreadySelected: false };
        return { sceneName: await this.prompt(options), alreadySelected: false };
    }

    /** @param {number} ms */
    wait(ms) {
        const signal = this.controller.signal;
        return new Promise((resolve, reject) => {
            signal.throwIfAborted();
            const abort = () => { clearTimeout(timer); reject(signal.reason); };
            const timer = setTimeout(() => {
                signal.removeEventListener('abort', abort);
                resolve(undefined);
            }, ms);
            signal.addEventListener('abort', abort, { once: true });
        });
    }

    /** @param {Record<string, string>} options @param {string} [heading] @returns {Promise<string>} */
    prompt(options, heading = 'How does the dream begin?') {
        const signal = this.controller.signal;
        signal.throwIfAborted();
        this.dispatchEvent(new CustomEvent('phase-change', { detail: { phase: 'select' } }));
        this.root.querySelector('.game-background-message')?.remove();
        const picker = document.createElement('section');
        picker.className = 'game-scene-picker';
        picker.setAttribute('aria-label', 'Choose an initial scene');
        picker.innerHTML = `
            <div class="game-scene-picker-title">How does the dream begin?</div>
            <div class="game-scene-picker-list"></div>
            <div class="game-scene-picker-footer">
                <button class="game-scene-picker-begin" type="button" disabled>Begin</button>
            </div>`;
        const list = /** @type {HTMLElement} */ (picker.querySelector('.game-scene-picker-list'));
        const title = picker.querySelector('.game-scene-picker-title');
        if (title) title.textContent = heading;
        const begin = /** @type {HTMLButtonElement} */ (picker.querySelector('.game-scene-picker-begin'));
        /** @type {string | null} */
        let selected = null;
        for (const [name, narration] of Object.entries(options)) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'game-scene-option';
            button.dataset.scene = name;
            button.setAttribute('aria-pressed', 'false');
            const title = document.createElement('div');
            title.className = 'game-scene-option-title';
            title.textContent = name;
            const description = document.createElement('div');
            description.className = 'game-scene-option-desc';
            description.textContent = narration;
            button.append(title, description);
            button.addEventListener('mouseenter', playHoverSound, { signal });
            button.addEventListener('click', () => {
                if (selected === name) return;
                playConfirmSound();
                selected = name;
                for (const option of list.children) {
                    option.classList.toggle('selected', option === button);
                    option.setAttribute('aria-pressed', String(option === button));
                }
                begin.disabled = false;
            }, { signal });
            list.appendChild(button);
        }
        this.root.querySelector('.game-background')?.appendChild(picker);
        begin.addEventListener('mouseenter', () => { if (!begin.disabled) playHoverSound(); }, { signal });
        return new Promise((resolve, reject) => {
            const abort = () => reject(signal.reason);
            signal.addEventListener('abort', abort, { once: true });
            begin.addEventListener('click', () => {
                if (selected === null) return;
                signal.removeEventListener('abort', abort);
                playConfirmSound();
                resolve(selected);
            }, { signal, once: true });
        });
    }

    render() {
        this.dispatchEvent(new CustomEvent('phase-change', { detail: { phase: 'intro' } }));
        this.root.innerHTML = `
            <link rel="stylesheet" href="${new URL('./initial-scene-select.css', import.meta.url).href}">
            <div class="game-background">
                <app-asset-image class="game-background-image game-background-loading" default-image="./images/default-world.png"></app-asset-image>
                <div class="game-background-message" role="status">
                    <div class="game-background-message-title">Entering dream...</div>
                    <div class="game-background-message-subtitle"></div>
                </div>
            </div>
            <div class="light-fade"></div>`;
        const namespace = this.getAttribute('world-namespace') || '';
        const id = this.getAttribute('world-id') || '';
        const subtitle = this.root.querySelector('.game-background-message-subtitle');
        if (subtitle) subtitle.textContent = id;
        this.root.querySelector('app-asset-image')?.setAttribute('image-url',
            `${namespace.startsWith('@') ? '@' : ''}assets/${namespace.replace(/^@/, '')}/${id}/image`);
    }
}

customElements.define('app-initial-scene-select', InitialSceneSelect);
