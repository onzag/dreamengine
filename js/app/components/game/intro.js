import { playHoverSound, playConfirmSound } from '../../sound.js';

const introStyles = `
/* Shared geometry and typography; each button keeps its own colors. */
.overlay-button,
.game-action-button {
    appearance: none;
    font: inherit;
    font-size: 2vh;
    line-height: normal;
    letter-spacing: normal;
    text-transform: none;
    padding: 2vh 4vh;
    border-width: 2px;
    border-style: solid;
    border-radius: .5vh;
    text-align: center;
    user-select: none;
    cursor: pointer;
    display: inline-block;
}


:host { position: absolute; inset: 0; display: block; background: white; }

.light-fade-intro {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    padding: 12vh 8vw;
    text-align: center;
    color: #243149;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    opacity: 0;
    animation: light-fade-intro-in 0.9s ease forwards;
}

.light-fade-intro.leaving {
    animation: light-fade-intro-out 0.55s ease forwards;
    pointer-events: none;
}

@keyframes light-fade-intro-in {
    from { opacity: 0; }
    to   { opacity: 1; }
}

@keyframes light-fade-intro-out {
    from { opacity: 1; }
    to   { opacity: 0; }
}

/* Message block: fades as a whole; its lines rise + un-blur with a stagger. */
.light-fade-intro-stage {
    max-width: min(64vw, 110vh);
    opacity: 0;
    transition: opacity 0.7s ease;
}

.light-fade-intro-stage.visible {
    opacity: 1;
}

.light-fade-intro-stage.leaving {
    opacity: 0;
    transition-duration: 0.45s;
}

.light-fade-intro-title,
.light-fade-intro-subtitle {
    transform: translateY(2.6vh);
    filter: blur(0.5vh);
    transition: transform 0.85s cubic-bezier(0.22, 0.61, 0.36, 1), filter 0.85s ease;
}

.light-fade-intro-stage.visible .light-fade-intro-title {
    transform: translateY(0);
    filter: blur(0);
}

.light-fade-intro-stage.visible .light-fade-intro-subtitle {
    transform: translateY(0);
    filter: blur(0);
    transition-delay: 0.14s;
}

.light-fade-intro-stage.leaving .light-fade-intro-title,
.light-fade-intro-stage.leaving .light-fade-intro-subtitle {
    transform: translateY(-1.8vh);
    filter: blur(0.5vh);
    transition-duration: 0.45s;
    transition-delay: 0s;
}

.light-fade-intro-title {
    font-size: 6.2vh;
    font-weight: 600;
    line-height: 1.12;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #212e46;
}

.light-fade-intro-title:empty {
    display: none;
}

.light-fade-intro-subtitle {
    margin-top: 2.6vh;
    font-size: 3vh;
    line-height: 1.5;
    letter-spacing: 0.015em;
}

/* Skip control, tucked into the top-right corner. */
.light-fade-intro-skip {
    position: absolute;
    top: 3.6vh;
    right: 3.4vw;
    color: rgba(36, 49, 73, 0.6);
    border-color: rgba(36, 49, 73, 0.25);
    background: rgba(36, 49, 73, 0.03);
    cursor: pointer;
    transition: color 0.2s ease, border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
}

.light-fade-intro-skip:hover {
    color: rgba(28, 38, 60, 0.95);
    border-color: rgba(36, 49, 73, 0.5);
    background: rgba(36, 49, 73, 0.08);
    transform: translateY(-0.2vh);
}

.light-fade-intro-skip:active {
    transform: translateY(0);
}

/* Footer: progress dots above a gently pulsing "continue" hint. */
.light-fade-intro-footer {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 5vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.6vh;
    pointer-events: none;
}

.light-fade-intro-progress {
    display: flex;
    gap: 1vh;
}

.light-fade-intro-dot {
    width: 0.95vh;
    height: 0.95vh;
    border-radius: 50%;
    background: rgba(36, 49, 73, 0.18);
    transition: background 0.35s ease, transform 0.35s ease;
}

.light-fade-intro-dot.seen {
    background: rgba(36, 49, 73, 0.4);
}

.light-fade-intro-dot.active {
    background: rgba(36, 49, 73, 0.85);
    transform: scale(1.4);
}

/* Action slot: holds the mutually-exclusive Continue button and auto-advance
   hint stacked in the same grid cell, so switching between them — or fading
   either in or out — never changes the footer's height or nudges anything.
   The cell sizes to the taller child (the button, which always occupies its
   layout space even at opacity 0), reserving its room up front. */
.light-fade-intro-action {
    display: grid;
    justify-items: center;
    align-items: center;
    pointer-events: none;
}
.light-fade-intro-action > .light-fade-intro-continue,
.light-fade-intro-action > .light-fade-intro-hint {
    grid-area: 1 / 1;
}

/* Continue button: the primary affordance shown for messages that omit a
   \`delay\`, so the player explicitly clicks to move on. Filled (vs. the quiet
   Skip button) to read as the main action. Hidden by default; it cross-fades in
   via \`.visible\` so its label can be set while invisible (no Continue→Begin
   flash) and it never snaps in or out. */
.light-fade-intro-continue {
    color: #f4f7fb;
    border-color: rgba(28, 38, 60, 0.9);
    background: rgba(36, 49, 73, 0.92);
    cursor: pointer;
    pointer-events: none;
    opacity: 0;
    transform: translateY(0.7vh);
    box-shadow: 0 0.4vh 1.6vh rgba(36, 49, 73, 0.28);
    transition: opacity 0.45s ease, transform 0.45s ease, background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.light-fade-intro-continue.visible {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
}

.light-fade-intro-continue:hover {
    background: rgba(24, 33, 53, 1);
    border-color: rgba(20, 28, 46, 1);
    transform: translateY(-0.25vh);
    box-shadow: 0 0.7vh 2.2vh rgba(36, 49, 73, 0.38);
}

.light-fade-intro-continue:active {
    transform: translateY(0);
    box-shadow: 0 0.3vh 1.2vh rgba(36, 49, 73, 0.3);
}

.light-fade-intro-continue:focus-visible {
    outline: none;
    box-shadow: 0 0 0 0.3vh rgba(36, 49, 73, 0.3), 0 0.4vh 1.6vh rgba(36, 49, 73, 0.28);
}

/* Auto-advance hint: shown for delayed messages. The outer element cross-fades
   via \`.visible\` while the inner span keeps the gentle pulse — nested opacity
   multiplies, so the fade stays smooth even mid-pulse. */
.light-fade-intro-hint {
    font-size: 1.5vh;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgba(36, 49, 73, 0.42);
    opacity: 0;
    transition: opacity 0.45s ease;
}

.light-fade-intro-hint.visible {
    opacity: 1;
}

.light-fade-intro-hint > span {
    display: inline-block;
    animation: light-fade-intro-hint-pulse 2.6s ease-in-out infinite;
}

@keyframes light-fade-intro-hint-pulse {
    0%, 100% { opacity: 0.32; }
    50%      { opacity: 0.85; }
}

@media (prefers-reduced-motion: reduce) {
    .light-fade-intro-title,
    .light-fade-intro-subtitle {
        transition-duration: 0.01ms;
        transform: none;
        filter: none;
    }

    .light-fade-intro-continue,
    .light-fade-intro-continue.visible {
        transform: none;
    }

    .light-fade-intro-continue {
        transition: opacity 0.01ms ease, background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
    }

    .light-fade-intro-hint {
        transition-duration: 0.01ms;
    }

    .light-fade-intro-hint > span {
        animation: none;
    }
}
`;


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
            const style = document.createElement('style');
            style.textContent = introStyles;
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
