import { openIdentifierDialog } from './identifier-dialog.js';
import { createNarrationNodes } from './narration.js';
import { DIALOG_OPENED_EVENT, hasOpenDialogs } from '../../dialog-state.js';

/** A top-layer tooltip: scroll containers never clip its content. */
export class GameTooltip extends HTMLElement {
    static get observedAttributes() { return ['text', 'align-with']; }

    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        this.root.innerHTML = `<link rel="stylesheet" href="${new URL('./tooltip.css', import.meta.url).href}">
            <slot></slot><div class="tip" role="tooltip" popover="manual"></div>`;
        this.tip = /** @type {HTMLElement} */ (this.root.querySelector('.tip'));
        /** @type {AbortController|null} */
        this.controller = null;
        /** @type {AbortController|null} */
        this.tracking = null;
        this.frame = 0;
        this.hideTimer = 0;
        this.geometry = '';
        this.textVersion = 0;
        this.dismissedForDialog = false;
        this.shownForFocus = false;
    }

    connectedCallback() {
        this.controller = new AbortController();
        const { signal } = this.controller;
        this.dismissedForDialog = hasOpenDialogs();
        document.addEventListener(DIALOG_OPENED_EVENT, () => this.dismissForDialog(), { signal });
        void this.renderText();
        this.addEventListener('pointerenter', () => this.show(), { signal });
        this.addEventListener('pointermove', () => {
            // A restored focus or a backdrop disappearing is not a new hover intent.
            if (this.dismissedForDialog && !hasOpenDialogs()) {
                this.dismissedForDialog = false;
                this.show();
            }
        }, { signal });
        const leave = () => {
            if (!hasOpenDialogs()) this.dismissedForDialog = false;
            this.scheduleHide();
        };
        this.addEventListener('pointerleave', leave, { signal });
        this.addEventListener('focusin', () => this.show('focus'), { signal });
        this.addEventListener('focusout', leave, { signal });
        this.tip.addEventListener('pointerenter', () => window.clearTimeout(this.hideTimer), { signal });
        this.tip.addEventListener('pointerleave', () => this.scheduleHide(), { signal });
        this.root.addEventListener('focusout', leave, { signal });
        // Portrait tooltips opt into opening their own entity; tooltip links open theirs.
        this.addEventListener('click', event => {
            if (!event.composedPath().includes(this.tip)) this.openTarget();
        }, { signal });
        this.addEventListener('keydown', event => {
            if ((event.key === 'Enter' || event.key === ' ') && !event.composedPath().includes(this.tip)
                && this.hasAttribute('identifier-id')) {
                event.preventDefault();
                this.openTarget();
            }
        }, { signal });
        // Escape also dismisses a hover-only tooltip without moving focus.
        window.addEventListener('keydown', event => {
            if (event.key === 'Escape') this.hide();
        }, { signal });
    }

    disconnectedCallback() {
        this.textVersion++;
        this.hide();
        this.controller?.abort();
        this.controller = null;
    }

    /** @param {string} name @param {string|null} oldValue @param {string|null} newValue */
    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return;
        if (name === 'text' && this.isConnected) void this.renderText();
        this.geometry = '';
        if (!this.tip.textContent.trim()) this.hide();
        else if (this.tip.matches(':popover-open')) this.position();
    }

    /** Parse every description here so all tooltip callers get the same identifier links. */
    async renderText() {
        const version = ++this.textVersion;
        const text = this.getAttribute('text') || '';
        this.tip.textContent = text;
        this.tip.setAttribute('role', 'tooltip');
        this.geometry = '';
        if (!text.trim()) { this.hide(); return; }
        const client = window.ENGINE_WORKER_CLIENT;
        if (!client) return;
        try {
            /** @type {DEConversationMessageNarrationFragment[]} */
            const fragments = await client.queryDEObject({ path: ['utils', 'templates', 'parseNarration'], call: [text] });
            if (!this.isConnected || version !== this.textVersion) return;
            this.tip.replaceChildren(...createNarrationNodes(fragments, (id, foundAs) => this.openIdentifier(id, foundAs)));
            // Interactive descriptions are non-modal popovers rather than text-only tooltips.
            if (fragments.some(fragment => typeof fragment !== 'string')) {
                this.tip.setAttribute('role', 'dialog');
                this.tip.setAttribute('aria-label', 'Description');
            } else this.tip.removeAttribute('aria-label');
            this.geometry = '';
            if (this.tip.matches(':popover-open')) this.position();
        } catch (error) {
            if (this.isConnected && version === this.textVersion) console.warn('Unable to parse tooltip description', error);
        }
    }

    openTarget() {
        const identifier = this.getAttribute('identifier-id');
        const foundAs = this.getAttribute('found-as');
        if (identifier && (foundAs === 'character' || foundAs === 'location' || foundAs === 'location-slot' || foundAs === 'item')) {
            this.openIdentifier(identifier, foundAs);
        }
    }

    /** @param {string} identifier @param {DEConversationMessageFragmentIdentifier['foundAs']} foundAs */
    openIdentifier(identifier, foundAs) {
        this.dismissForDialog();
        const trigger = this.querySelector('[tabindex], button, a');
        openIdentifierDialog(identifier, foundAs, trigger instanceof HTMLElement ? trigger : this);
    }

    /** @param {'pointer' | 'focus'} [source] */
    show(source = 'pointer') {
        window.clearTimeout(this.hideTimer);
        if (hasOpenDialogs() || this.dismissedForDialog || !this.isConnected || !this.tip.textContent.trim()) return;
        this.shownForFocus = source === 'focus';
        if (this.tip.matches(':popover-open')) return;
        this.tip.style.visibility = 'hidden';
        this.tip.showPopover();
        this.tracking = new AbortController();
        const { signal } = this.tracking;
        // Native scroll events inside a shadow root do not reach window.
        let ancestor = this.parentNode;
        while (ancestor) {
            ancestor.addEventListener('scroll', () => this.position(), { signal, passive: true });
            ancestor = ancestor.parentNode || (ancestor instanceof ShadowRoot ? ancestor.host : null);
        }
        window.addEventListener('resize', () => this.position(), { signal, passive: true });
        window.visualViewport?.addEventListener('resize', () => this.position(), { signal, passive: true });
        window.visualViewport?.addEventListener('scroll', () => this.position(), { signal, passive: true });
        this.geometry = '';
        this.position();
        this.tip.style.visibility = '';
        // Scroll events don't cross all shadow boundaries. While open, tracking
        // geometry also covers nested scrolling, resize and animated triggers.
        const follow = () => {
            if (!this.tip.matches(':popover-open')) return;
            this.position();
            if (this.tip.matches(':popover-open')) this.frame = requestAnimationFrame(follow);
        };
        this.frame = requestAnimationFrame(follow);
    }

    scheduleHide() {
        window.clearTimeout(this.hideTimer);
        // Allow the pointer to cross the 1vh gap to scroll long descriptions.
        this.hideTimer = window.setTimeout(() => {
            const keepForFocus = this.shownForFocus && this.matches(':focus-within');
            if (!this.matches(':hover') && !keepForFocus && !this.tip.matches(':hover, :focus-within')) this.hide();
        }, 120);
    }

    dismissForDialog() {
        this.dismissedForDialog = true;
        this.hide();
    }

    hide() {
        this.shownForFocus = false;
        this.tracking?.abort();
        this.tracking = null;
        window.clearTimeout(this.hideTimer);
        cancelAnimationFrame(this.frame);
        if (this.tip.matches(':popover-open')) this.tip.hidePopover();
    }

    position() {
        const anchor = this.getBoundingClientRect();
        const viewport = window.visualViewport;
        const leftEdge = viewport?.offsetLeft || 0;
        const topEdge = viewport?.offsetTop || 0;
        const width = viewport?.width || window.innerWidth;
        const height = viewport?.height || window.innerHeight;
        const gap = window.innerHeight / 100;
        const margin = gap;
        const rightEdge = leftEdge + width;
        const bottomEdge = topEdge + height;

        // Don't leave a detached-looking tooltip when its trigger scrolls away.
        let visibleLeft = Math.max(leftEdge, anchor.left);
        let visibleRight = Math.min(rightEdge, anchor.right);
        let visibleTop = Math.max(topEdge, anchor.top);
        let visibleBottom = Math.min(bottomEdge, anchor.bottom);
        let parent = this.parentElement || /** @type {ShadowRoot} */ (this.getRootNode()).host;
        while (parent) {
            const style = getComputedStyle(parent);
            const rect = parent.getBoundingClientRect();
            if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
                visibleLeft = Math.max(visibleLeft, rect.left);
                visibleRight = Math.min(visibleRight, rect.right);
            }
            if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
                visibleTop = Math.max(visibleTop, rect.top);
                visibleBottom = Math.min(visibleBottom, rect.bottom);
            }
            parent = parent.parentElement || /** @type {ShadowRoot} */ (parent.getRootNode()).host;
        }
        if (visibleRight <= visibleLeft || visibleBottom <= visibleTop) { this.hide(); return; }

        const rtl = getComputedStyle(this).direction === 'rtl';
        const key = [anchor.left, anchor.right, anchor.top, anchor.bottom, width, height, leftEdge, topEdge, gap, rtl, this.getAttribute('align-with')].join(':');
        if (key === this.geometry) return;
        this.geometry = key;
        this.tip.style.maxWidth = `${Math.max(1, Math.min(window.innerHeight * .34, width - margin * 2))}px`;
        this.tip.style.maxHeight = 'none';
        const desiredHeight = this.tip.getBoundingClientRect().height;
        const below = Math.max(0, bottomEdge - margin - anchor.bottom - gap);
        const above = Math.max(0, anchor.top - gap - topEdge - margin);
        let top = this.getAttribute('align-with') === 'top';
        // Honour the requested side unless the other side has more room and
        // this one cannot fit. Constrain tall text without covering the pill.
        if (desiredHeight > (top ? above : below) && (top ? below > above : above > below)) top = !top;
        this.tip.style.maxHeight = `${top ? above : below}px`;
        const bounds = this.tip.getBoundingClientRect();
        const preferredLeft = rtl ? anchor.right - bounds.width : anchor.left;
        this.tip.style.left = `${Math.max(leftEdge + margin, Math.min(rightEdge - margin - bounds.width, preferredLeft))}px`;
        this.tip.style.top = `${top ? anchor.top - gap - bounds.height : anchor.bottom + gap}px`;
    }
}
customElements.define('app-game-tooltip', GameTooltip);
