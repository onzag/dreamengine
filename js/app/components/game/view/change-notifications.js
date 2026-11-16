import { sharedStyles, identifierLinkStyles } from './shared-styles.js';
import { getChangeNotifications } from './message-perspective.js';
import { parsePerspectiveNarration } from './perspective-data.js';
import { createNarrationNodes } from './narration.js';
import { openIdentifierDialog } from './identifier-dialog.js';
import { playSound } from '../../../sound.js';

/** A single readable notification at a time, scoped to the selected final fragment. */
export class ChangeNotifications extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        this.root.innerHTML = `<style>
${sharedStyles}
${identifierLinkStyles}
:host { position: absolute; top: 10vh; right: 2vh; width: min(440px, calc(100% - 4vh)); z-index: 100; pointer-events: none; }
[hidden] { display: none !important; }
article { position: relative; pointer-events: auto; overflow: hidden; padding: 2vh 5vh; border: 0.1vh solid #b4ddff65; background: linear-gradient(125deg, #6588ac35, #122034c9), #0c1729b8; backdrop-filter: blur(20px) saturate(150%); -webkit-backdrop-filter: blur(20px) saturate(150%); box-shadow: 0 12px 36px #0006, inset 0 1px #effaff26; color: #eef7ff; animation: arrive .3s ease-out; }
header { display: flex; align-items: center; gap: 10px; color: #b9e5ff; font-size: 11px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; }
header::before { content: '\u25c7'; font-size: 20px; }
.count { margin-left: auto; white-space: nowrap; color: #a5bacd; letter-spacing: .05em; }
.description { margin: 10px 0 0; font-size: clamp(14px, 1.9vh, 18px); line-height: 1.6; overflow-wrap: anywhere; max-height: 35vh; overflow-y: auto; }
button { position: absolute; top: 8px; right: 8px; width: 32px; height: 32px; border: 0; border-radius: 4px; background: transparent; color: #bdcfe1; font-size: 24px; }
button:hover { background: #b4ddff22; color: white; }
.meter { position: absolute; bottom: 0; left: 0; height: 2px; width: 100%; background: linear-gradient(90deg, #5c8cb9, #c9eeff); transform-origin: left; }
@keyframes arrive { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { article { animation: none; } .meter { display: none; } }
</style><article hidden><header><span class="label"></span><span class="count"></span></header>
<div class="description" role="status" aria-live="polite" aria-atomic="true"></div>
<button type="button" aria-label="Dismiss notification">\u00d7</button><div class="meter" aria-hidden="true"></div></article>`;
        this.card = /** @type {HTMLElement} */ (this.root.querySelector('article'));
        this.description = /** @type {HTMLElement} */ (this.root.querySelector('.description'));
        this.key = '';
        this.version = 0;
        this.timer = 0;
        this.duration = 0;
        this.position = 0;
        /** @type {ReturnType<typeof getChangeNotifications>} */
        this.entries = [];
        /** @type {DEPerspective | null} */
        this.currentPerspective = null;
        /** @type {Animation | null} */
        this.meter = null;
        this.root.querySelector('button')?.addEventListener('click', () => this.dismiss());
        this.card.addEventListener('mouseenter', () => this.pause());
        this.card.addEventListener('mouseleave', () => this.resume());
        this.card.addEventListener('focusin', () => this.pause());
        this.card.addEventListener('focusout', () => queueMicrotask(() => this.resume()));
    }

    connectedCallback() {
        this.controller = new AbortController();
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.pause();
            else if (this.card.hidden && this.entries.length) void this.showNext();
            else this.resume();
        }, { signal: this.controller.signal });
    }

    disconnectedCallback() { this.controller?.abort(); this.clear(); }

    clear() {
        this.version++;
        this.pause();
        this.meter?.cancel();
        this.meter = null;
        this.key = '';
        this.entries = [];
        this.position = 0;
        this.currentPerspective = null;
        this.card.hidden = true;
        this.description.replaceChildren();
    }

    /** @param {string} key @param {DEPerspective} perspective */
    showChanges(key, perspective) {
        if (key === this.key) return;
        this.clear();
        this.key = key;
        this.currentPerspective = perspective;
        this.entries = getChangeNotifications(perspective.changes);
        void this.showNext();
    }

    async showNext() {
        if (!this.isConnected || document.hidden || !this.card.hidden) return;
        const entry = this.entries[this.position];
        if (!entry) return;
        const version = ++this.version;
        let fragments;
        try { fragments = await parsePerspectiveNarration(entry.description); }
        catch {
            // Keep descriptions readable even if the worker is temporarily unavailable.
            fragments = [entry.description.replace(/<[^:<>]+:([^<>]*)>/g, '$1')];
        }
        if (version !== this.version || !this.isConnected || document.hidden) return;
        this.description.replaceChildren(...createNarrationNodes(fragments, (id, foundAs) =>
            openIdentifierDialog(id, foundAs, this, this.currentPerspective)));
        const label = /** @type {HTMLElement} */ (this.root.querySelector('.label'));
        const count = /** @type {HTMLElement} */ (this.root.querySelector('.count'));
        label.textContent = entry.label;
        count.textContent = `${this.position + 1} / ${this.entries.length}`;
        this.card.hidden = false;
        this.description.scrollTop = 0;
        const words = (this.description.textContent || '').trim().split(/\s+/).length;
        this.duration = Math.max(5500, 2000 + words * 350);
        const meter = /** @type {HTMLElement} */ (this.root.querySelector('.meter'));
        this.meter = meter.animate(
            [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: this.duration, fill: 'forwards' });
        this.resume();
        playSound(new URL('../../../sounds/notification.wav', import.meta.url).href, .55);
    }

    pause() { window.clearTimeout(this.timer); this.timer = 0; this.meter?.pause(); }

    resume() {
        // Hiding a dismissed card emits focus/hover events; preserve the next-card timer.
        if (this.card.hidden) return;
        if (document.hidden || this.card.matches(':hover') || this.root.activeElement) {
            this.pause();
            return;
        }
        window.clearTimeout(this.timer);
        this.meter?.play();
        const elapsed = Number(this.meter?.currentTime || 0);
        this.timer = window.setTimeout(() => this.dismiss(), Math.max(0, this.duration - elapsed));
    }

    dismiss() {
        if (this.card.hidden) return;
        this.pause();
        this.meter?.cancel();
        this.meter = null;
        this.card.hidden = true;
        this.position++;
        this.timer = window.setTimeout(() => { void this.showNext(); }, 700);
    }
}
customElements.define('app-game-change-notifications', ChangeNotifications);
