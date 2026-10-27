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
    }

    connectedCallback() {
        this.controller = new AbortController();
        const { signal } = this.controller;
        this.tip.textContent = this.getAttribute('text') || '';
        this.addEventListener('pointerenter', () => this.show(), { signal });
        this.addEventListener('pointerleave', () => this.scheduleHide(), { signal });
        this.addEventListener('focusin', () => this.show(), { signal });
        this.addEventListener('focusout', () => this.scheduleHide(), { signal });
        this.tip.addEventListener('pointerenter', () => window.clearTimeout(this.hideTimer), { signal });
        this.tip.addEventListener('pointerleave', () => this.scheduleHide(), { signal });
        this.root.addEventListener('focusout', () => this.scheduleHide(), { signal });
        // Escape also dismisses a hover-only tooltip without moving focus.
        window.addEventListener('keydown', event => {
            if (event.key === 'Escape') this.hide();
        }, { signal });
    }

    disconnectedCallback() {
        this.hide();
        this.controller?.abort();
        this.controller = null;
    }

    attributeChangedCallback() {
        this.tip.textContent = this.getAttribute('text') || '';
        this.geometry = '';
        if (!this.tip.textContent.trim()) this.hide();
        else if (this.tip.matches(':popover-open')) this.position();
    }

    show() {
        window.clearTimeout(this.hideTimer);
        if (!this.isConnected || !this.tip.textContent.trim()) return;
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
            if (!this.matches(':hover, :focus-within') && !this.tip.matches(':hover, :focus-within')) this.hide();
        }, 120);
    }

    hide() {
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
