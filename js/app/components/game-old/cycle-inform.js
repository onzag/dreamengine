/**
 * <app-cycle-inform>
 *
 * Stacks transient cycle-inform notifications in the top-right corner of the
 * story content area. Each call to addMessage() appends a new pill below any
 * existing ones; it holds for 2.5 s then fades out over 0.5 s before being
 * removed from the DOM.
 *
 * The host element is absolutely positioned (via :host CSS) so it floats over
 * the story content without disrupting layout.
 *
 * Public API:
 *   addMessage(level, message)
 *     level   — "info" | "warning" | "error"
 *     message — plain-text string to display
 */
class CycleInform extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.root.innerHTML = `
            <style>
                :host {
                    display: block;
                    position: absolute;
                    top: 1vh;
                    right: 1vh;
                    z-index: 50;
                    pointer-events: none;
                    width: max(200px, 22vw);
                    max-width: calc(100% - 12vh - 3vh);
                }

                .stack {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-end;
                    gap: 0.6vh;
                }

                .notify {
                    display: flex;
                    align-items: flex-start;
                    gap: 0.5em;
                    width: 100%;
                    padding: 0.6vh 0.9vh 0.6vh 0.75vh;
                    box-sizing: border-box;
                    border-radius: 0.5vh;
                    font-size: clamp(10px, 1.25vh, 14px);
                    font-family: inherit;
                    line-height: 1.45;
                    backdrop-filter: blur(12px) saturate(160%);
                    -webkit-backdrop-filter: blur(12px) saturate(160%);
                    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
                    opacity: 1;
                    transition: opacity 0.5s ease;
                    word-break: break-word;
                }

                .notify.info {
                    background: rgba(18, 50, 95, 0.82);
                    border: 1px solid rgba(110, 170, 240, 0.55);
                    color: #cce3ff;
                }

                .notify.warning {
                    background: rgba(90, 58, 5, 0.84);
                    border: 1px solid rgba(230, 175, 45, 0.6);
                    color: #ffe59a;
                }

                .notify.error {
                    background: rgba(100, 14, 14, 0.84);
                    border: 1px solid rgba(230, 65, 65, 0.6);
                    color: #ffc0c0;
                }

                .notify-icon {
                    flex-shrink: 0;
                    line-height: 1.45;
                }

                .notify-text {
                    flex: 1;
                    min-width: 0;
                }

                .notify.fading {
                    opacity: 0;
                }
            </style>
            <div class="stack" role="log" aria-live="polite" aria-label="Cycle notifications"></div>
        `;
    }

    /**
     * @param {"info" | "warning" | "error"} level
     * @param {string} message
     */
    addMessage(level, message) {
        const stack = this.root.querySelector('.stack');
        if (!stack) return;

        /** @type {Record<string, string>} */
        const ICONS = { info: 'ℹ️', warning: '⚠️', error: '🔴' };
        const icon = ICONS[level] || 'ℹ️';
        const safeLevel = ['info', 'warning', 'error'].includes(level) ? level : 'info';

        const el = document.createElement('div');
        el.className = `notify ${safeLevel}`;

        const iconEl = document.createElement('span');
        iconEl.className = 'notify-icon';
        iconEl.setAttribute('aria-hidden', 'true');
        iconEl.textContent = icon;

        const textEl = document.createElement('span');
        textEl.className = 'notify-text';
        textEl.textContent = message;

        el.appendChild(iconEl);
        el.appendChild(textEl);
        stack.appendChild(el);

        const HOLD_MS = 2500;
        const FADE_MS = 500;

        setTimeout(() => {
            el.classList.add('fading');
            setTimeout(() => el.remove(), FADE_MS);
        }, HOLD_MS);
    }
}

customElements.define('app-cycle-inform', CycleInform);
