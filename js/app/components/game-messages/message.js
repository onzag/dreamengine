import '../world-image.js';

/**
 * A single chat/narration message in the in-dream story feed.
 *
 * Attributes (set before appending to DOM):
 *  - is-narration         (boolean) Story-master narration; no avatar or name shown.
 *  - is-self              (boolean) Message sent by the player's own character.
 *  - is-group-start       (boolean) First message in a consecutive run from one sender.
 *  - sender-name          Display name of the sender.
 *  - text                 Initial message body. Streamed token-by-token unless
 *                         no-stream-simulation is set.
 *  - image-url            Asset path for the sender's portrait.
 *  - no-stream-simulation (boolean) When present, adds the initial text instantly;
 *                         addText() still works for real streaming afterward.
 *
 * Public API:
 *  - addText(chunk)  Append a text chunk live with a fade-in animation. Can be
 *                    called at any time for real LLM streaming.
 */
class GameMessage extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        /** @type {ReturnType<typeof setTimeout> | null} */
        this._streamTimer = null;
        /** @type {boolean} */
        this._streaming = false;
    }

    // 'text' and 'no-stream-simulation' are intentionally NOT observed —
    // they are read once inside connectedCallback.
    static get observedAttributes() {
        return ['is-narration', 'is-self', 'is-group-start', 'sender-name', 'image-url'];
    }

    connectedCallback() {
        this.render();
        const text = this.getAttribute('text') || '';
        if (text) {
            if (this.hasAttribute('no-stream-simulation')) {
                this._addTextImmediate(text);
            } else {
                this._simulateStream(text);
            }
        }
    }

    disconnectedCallback() {
        if (this._streamTimer !== null) {
            clearTimeout(this._streamTimer);
            this._streamTimer = null;
        }
        this._streaming = false;
    }

    /**
     * @param {string} name
     * @param {string | null} oldValue
     * @param {string | null} newValue
     * @returns {void}
     */
    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue || !this.isConnected) return;
        // Fast-path: update only the changed part without wiping the streamed text.
        if (name === 'image-url') {
            const img = this.root.querySelector('app-asset-image');
            if (img) img.setAttribute('image-url', newValue || '');
            return;
        }
        if (name === 'sender-name') {
            const nameEl = this.root.querySelector('.name');
            if (nameEl) nameEl.textContent = newValue || '';
            return;
        }
        // Structural change (shouldn't happen after initial attach, but handle gracefully).
        this.render();
    }

    /**
     * Append a text chunk to the message with a fade-in animation.
     * Safe to call at any time — used both by the stream simulation and
     * by external callers doing real LLM streaming.
     * @param {string} chunk
     */
    addText(chunk) {
        if (!chunk) return;
        const textEl = this.root.querySelector('.msg-text, .narration-text');
        if (!textEl) return;

        const cursor = this.root.querySelector('.cursor');

        const span = document.createElement('span');
        span.className = 'token';
        span.textContent = chunk;

        if (cursor) {
            textEl.insertBefore(span, cursor);
        } else {
            textEl.appendChild(span);
        }

        this._scrollParent();
    }

    // ── Private helpers ──────────────────────────────────────────────

    /**
     * Add full text at once, no animation — used when no-stream-simulation is set.
     * @param {string} text
     */
    _addTextImmediate(text) {
        const textEl = this.root.querySelector('.msg-text, .narration-text');
        if (!textEl) return;
        const span = document.createElement('span');
        span.textContent = text;
        textEl.appendChild(span);
        this._scrollParent();
        this.dispatchEvent(new CustomEvent('on-simulated-stream-finished', { bubbles: true, composed: true }));
    }

    /**
     * Split text into LLM-style tokens: whole words with trailing whitespace
     * attached, but longer words occasionally split mid-way to mimic sub-word
     * tokenisation.
     * @param {string} text
     * @returns {string[]}
     */
    _tokenize(text) {
        const result = [];
        const parts = text.split(/(\s+)/);
        for (const part of parts) {
            if (!part) continue;
            if (/^\s+$/.test(part)) {
                // Attach whitespace to the previous token (words arrive with their space).
                if (result.length > 0) {
                    result[result.length - 1] += part;
                } else {
                    result.push(part);
                }
            } else if (part.length > 5 && Math.random() < 0.28) {
                // Split longer words at a random natural point (30–70% through).
                const splitAt = Math.max(1, Math.floor(part.length * (0.3 + Math.random() * 0.4)));
                result.push(part.slice(0, splitAt));
                result.push(part.slice(splitAt));
            } else {
                result.push(part);
            }
        }
        return result;
    }

    /**
     * Drip-feed tokens from `text` with randomised timing and occasional bursts
     * to mimic LLM token streaming.
     * @param {string} text
     */
    _simulateStream(text) {
        const tokens = this._tokenize(text);
        if (!tokens.length) return;

        let i = 0;
        this._streaming = true;
        this._showCursor();

        const next = () => {
            if (!this._streaming || i >= tokens.length) {
                this._streaming = false;
                this._hideCursor();
                this.dispatchEvent(new CustomEvent('on-simulated-stream-finished', { bubbles: true, composed: true }));
                return;
            }

            // 25% chance to burst two tokens at once.
            const burst = (Math.random() < 0.25 && i + 1 < tokens.length) ? 2 : 1;
            this.addText(tokens.slice(i, i + burst).join(''));
            i += burst;

            // Mostly fast (22–77 ms), occasional longer pause (~8% of the time).
            const base = 22 + Math.random() * 55;
            const delay = Math.random() < 0.08 ? base * (3 + Math.random() * 4) : base;
            this._streamTimer = setTimeout(next, delay);
        };

        next();
    }

    /** Insert a blinking block cursor at the end of the text element. */
    _showCursor() {
        const textEl = this.root.querySelector('.msg-text, .narration-text');
        if (!textEl || this.root.querySelector('.cursor')) return;
        const cur = document.createElement('span');
        cur.className = 'cursor';
        cur.setAttribute('aria-hidden', 'true');
        textEl.appendChild(cur);
    }

    /** Remove the blinking cursor. */
    _hideCursor() {
        const cur = this.root.querySelector('.cursor');
        if (cur) cur.remove();
    }

    /**
     * Scroll the nearest `.game-story-content` container so newly appended
     * tokens stay visible. Works across the shadow-DOM boundary.
     */
    _scrollParent() {
        try {
            // `this.getRootNode()` returns the GameOverlay shadow root when
            // app-game-message is a child of .game-story-content-list.
            const root = /** @type {ShadowRoot | Document} */ (this.getRootNode());
            const container = root.querySelector?.('.game-story-content');
            if (container) container.scrollTop = container.scrollHeight;
        } catch (_) {
            // Ignore — element may have been detached.
        }
    }

    render() {
        const isNarration = this.hasAttribute('is-narration');
        const isSelf = this.hasAttribute('is-self');
        const isGroupStart = this.hasAttribute('is-group-start');
        const senderName = this.getAttribute('sender-name') || '';
        const imageUrl = this.getAttribute('image-url') || '';

        const cls = [
            'message',
            isNarration ? 'narration' : 'chat',
            !isNarration && isSelf ? 'self' : '',
            !isNarration && isGroupStart ? 'group-start' : '',
        ].filter(Boolean).join(' ');

        let inner;
        if (isNarration) {
            inner = `<p class="narration-text"></p>`;
        } else if (isGroupStart) {
            inner = `
                <div class="avatar">
                    <app-asset-image
                        image-url="${escapeHtml(imageUrl)}"
                        default-image="./images/default-profile.png"
                        no-transition="true"></app-asset-image>
                </div>
                <div class="body">
                    <div class="name">${escapeHtml(senderName)}</div>
                    <div class="msg-text"></div>
                </div>`;
        } else {
            inner = `
                <div class="avatar-spacer" aria-hidden="true"></div>
                <div class="body">
                    <div class="msg-text"></div>
                </div>`;
        }

        this.root.innerHTML = `
            <link rel="stylesheet" href="components/game-messages/message.css">
            <div class="${cls}">${inner}</div>`;
    }
}

/**
 * @param {string} str
 */
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

customElements.define('app-game-message', GameMessage);
