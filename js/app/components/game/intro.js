import { playHoverSound, playConfirmSound } from '../../sound.js';

/** The world introduction. play(messages) resolves when finished or skipped. */
export class GameIntro extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        /** @type {(() => void) | null} */
        this._cancel = null;
        /** @type {((event: KeyboardEvent) => void) | null} */
        this._introKeydownHandler = null;
    }

    disconnectedCallback() {
        this._cancel?.();
    }

    /**
     * @param {Array<{ title?: string, subtitle?: string, delay?: number }>} messages
     * @returns {Promise<void>}
     */
    play(messages) {
        this._cancel?.();
        return new Promise(resolve => {
            const intro = document.createElement('div');
            intro.className = 'light-fade-intro';
            intro.setAttribute('role', 'group');
            intro.setAttribute('aria-label', 'World introduction');
            intro.innerHTML = `
                <button class="light-fade-intro-skip game-action-button" type="button">Skip</button>
                <div class="light-fade-intro-stage" aria-live="polite">
                    <div class="light-fade-intro-title"></div>
                    <div class="light-fade-intro-subtitle"></div>
                </div>
                <div class="light-fade-intro-footer">
                    <div class="light-fade-intro-progress" aria-hidden="true"></div>
                    <div class="light-fade-intro-action">
                        <button class="light-fade-intro-continue game-action-button" type="button"></button>
                        <div class="light-fade-intro-hint"><span>Click anywhere to continue</span></div>
                    </div>
                </div>`;
            this.root.replaceChildren();
            const style = document.createElement('link');
            style.rel = 'stylesheet';
            style.href = new URL('./intro.css', import.meta.url).href;
            this.root.append(style, intro);

            const stage = /** @type {HTMLElement} */ (intro.querySelector('.light-fade-intro-stage'));
            const titleEl = /** @type {HTMLElement} */ (intro.querySelector('.light-fade-intro-title'));
            const subtitleEl = /** @type {HTMLElement} */ (intro.querySelector('.light-fade-intro-subtitle'));
            const progressEl = /** @type {HTMLElement} */ (intro.querySelector('.light-fade-intro-progress'));
            const skipBtn = /** @type {HTMLButtonElement} */ (intro.querySelector('.light-fade-intro-skip'));
            const continueBtn = /** @type {HTMLButtonElement} */ (intro.querySelector('.light-fade-intro-continue'));
            const hintEl = /** @type {HTMLElement} */ (intro.querySelector('.light-fade-intro-hint'));

            // One progress dot per message (hidden for a lone message).
            const dots = messages.map(() => {
                const dot = document.createElement('span');
                dot.className = 'light-fade-intro-dot';
                progressEl.appendChild(dot);
                return dot;
            });
            if (messages.length < 2) progressEl.style.display = 'none';

            let skipped = false;
            let finished = false;
            /** @type {(() => void) | null} */
            let resolveStep = null;

            // A wait the player can cut short by advancing or skipping.
            /** @param {number} ms */
            const interruptibleWait = (ms) => new Promise(res => {
                const finish = () => {
                    clearTimeout(timer);
                    resolveStep = null;
                    res(undefined);
                };
                const timer = setTimeout(finish, ms);
                resolveStep = finish;
            });

            // A wait with no timer: only the player (the Continue button, a
            // click, a key, or Skip) can end it. Used for messages that omit
            // their `delay`.
            const waitForContinue = () => new Promise(res => {
                resolveStep = () => {
                    resolveStep = null;
                    res(undefined);
                };
            });

            const advance = () => {
                if (finished || !resolveStep) return;
                playHoverSound();
                resolveStep();
            };
            const skip = () => {
                if (finished) return;
                skipped = true;
                if (resolveStep) resolveStep();
            };

            /** @param {KeyboardEvent} e */
            const onKeyDown = (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    skip();
                    return;
                }
                // If a control button is focused, let it handle its own
                // activation (Enter / Space) rather than double-firing.
                const active = this.root.activeElement;
                if ((active === skipBtn || active === continueBtn) && (e.key === 'Enter' || e.key === ' ')) return;
                if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    advance();
                }
            };

            intro.addEventListener('click', advance);
            skipBtn.addEventListener('mouseenter', () => playHoverSound());
            skipBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                playConfirmSound();
                skip();
            });
            continueBtn.addEventListener('mouseenter', () => playHoverSound());
            continueBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (finished || !resolveStep) return;
                playConfirmSound();
                resolveStep();
            });
            document.addEventListener('keydown', onKeyDown);
            this._introKeydownHandler = onKeyDown;
            this._cancel = () => { skip(); cleanup(); };

            const cleanup = () => {
                if (finished) return;
                finished = true;
                document.removeEventListener('keydown', onKeyDown);
                this._introKeydownHandler = null;
                this._cancel = null;
                if (resolveStep) resolveStep();
                // Fade the intro furniture out, then drop it so the caller is
                // left with a clean white overlay to fade away.
                intro.classList.add('leaving');
                setTimeout(() => {
                    intro.remove();
                    resolve();
                }, 600);
            };

            (async () => {
                // Let the blank white screen settle before the first words.
                await interruptibleWait(700);

                for (let i = 0; i < messages.length; i++) {
                    if (skipped || finished) break;

                    const msg = /** @type {{ title?: string, subtitle?: string, delay?: number }} */ (messages[i] || {});
                    const title = typeof msg.title === 'string' ? msg.title : '';
                    const subtitle = typeof msg.subtitle === 'string' ? msg.subtitle : '';
                    const hasDelay = typeof msg.delay === 'number' && isFinite(msg.delay);
                    const isLast = i === messages.length - 1;

                    titleEl.textContent = title;
                    subtitleEl.textContent = subtitle;
                    subtitleEl.style.display = subtitle ? '' : 'none';

                    dots.forEach((dot, di) => {
                        dot.classList.toggle('active', di === i);
                        dot.classList.toggle('seen', di < i);
                    });

                    // A message with a `delay` auto-advances (but can still be
                    // cut short); one without it waits for the player to press
                    // the explicit Continue button (or click / a key / Skip).
                    // The button and hint share a fixed-size slot and cross-fade
                    // via the `visible` class, and the button's label is set
                    // while it's still invisible so it never flashes "Continue"
                    // before settling on "Begin".
                    if (hasDelay) {
                        continueBtn.classList.remove('visible');
                        hintEl.classList.add('visible');
                    } else {
                        hintEl.classList.remove('visible');
                        continueBtn.textContent = isLast ? 'Begin' : 'Continue';
                        continueBtn.classList.add('visible');
                    }

                    // Restart the enter transition, then reveal the message.
                    stage.classList.remove('visible', 'leaving');
                    void stage.offsetWidth;
                    stage.classList.add('visible');

                    if (!hasDelay) continueBtn.focus();

                    // Hold on screen: a timed (but skippable) hold when a delay
                    // is given, otherwise wait indefinitely for the player.
                    if (hasDelay) {
                        await interruptibleWait(Math.max(1400, /** @type {number} */(msg.delay)));
                    } else {
                        await waitForContinue();
                    }

                    // Fade the message out before the next one (or the finish),
                    // taking the button/hint with it so the action slot fades in
                    // step with the words rather than snapping away.
                    continueBtn.classList.remove('visible');
                    hintEl.classList.remove('visible');
                    stage.classList.remove('visible');
                    stage.classList.add('leaving');
                    if (!skipped) await interruptibleWait(450);
                }

                stage.classList.remove('visible');
                stage.classList.add('leaving');
                cleanup();
            })();
        });
    }

}

customElements.define('app-game-intro', GameIntro);
