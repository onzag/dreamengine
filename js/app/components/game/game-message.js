import '../world-image.js';
import '../dialog.js';
import '../debug/debug-message.js';

/**
 * A single message in the in-dream story feed.
 *
 * Unlike the previous implementation, this component does NOT parse raw text
 * into dialogue/narration. The engine (talk.js) now streams already-structured
 * events, and this component simply materialises them into stacked UI blocks.
 *
 * ── Event model ─────────────────────────────────────────────────────
 * A message is built from a stream of events (see EngineConversationEvent):
 *
 *   - "add-narration-block"  Start a new block of pure textual narration.
 *   - "add-dialogue-block"   Start a new dialogue block. A dialogue block is
 *                            itself composed of dialogue and inline-narration
 *                            fragments, delivered as the events below.
 *   - "add-narration"        Append narration text. Inside a narration block it
 *                            grows the narration paragraph; inside a dialogue
 *                            block it grows (or opens) an inline-narration
 *                            fragment.
 *   - "add-dialogue"         Append spoken text to the current dialogue block.
 *   - "done"                 The message is complete; no more events will come.
 *
 * A block is considered finished when the next block starts or when "done"
 * arrives. This lets us run per-block async hooks (see below).
 *
 * ── Buffered, paced consumption ─────────────────────────────────────
 * Events are never rendered synchronously. They are pushed into an internal
 * buffer and drained by a single async pump at a deliberately measured pace so
 * the story never appears to flash into existence — but also never lags too
 * far behind. If the buffer grows large (a burst of events arrived) the pump
 * speeds up so it stays close to real time without looking robotic.
 *
 * ── Per-block async hooks ───────────────────────────────────────────
 * Callers may assign two async functions that gate block consumption. While a
 * hook is awaited the pump is paused and further events simply accumulate in
 * the buffer:
 *
 *   element.beforeBlock = async (info) => { ... };  // before a block renders
 *   element.afterBlock  = async (info) => { ... };  // after a block finishes
 *
 * `info` is `{ type: 'narration' | 'dialogue', index, message }`.
 *
 * ── Loading existing messages ───────────────────────────────────────
 * `loadContent(content, { stream })` converts an already-stored message body
 * (a content array of DEConversationMessageNarration | DEConversationMessage-
 * Dialogue, or a plain narration string) into the same event stream. When
 * `stream` is true it pseudo-streams exactly like a freshly generated message;
 * when false it renders instantly (used when loading history).
 *
 * ── Attributes ──────────────────────────────────────────────────────
 *  - is-self          (boolean) Message sent by the player's own character.
 *  - is-group-start   (boolean) First message in a consecutive run from one
 *                     sender; when false the first dialogue block omits the
 *                     avatar/name to continue the previous message visually.
 *  - show-avatar      (boolean) Whether dialogue blocks render the avatar/name
 *                     (Discord-like). Toggled by the host (game.js). Live.
 *  - sender-name      Display name of the sender. Live.
 *  - image-url        Asset path for the sender's portrait. Live.
 *  - debug            (boolean-ish "true"/"false") Enables the per-block debug
 *                     dialog on click. Live.
 *
 * ── Public API ──────────────────────────────────────────────────────
 *  - pushEngineEvent(data)   Enqueue a raw EngineConversationEvent.
 *  - loadContent(content, opts)  Enqueue a stored message body as events.
 *  - beforeBlock / afterBlock   Assignable async hooks (see above).
 *
 * ── Events ──────────────────────────────────────────────────────────
 *  - on-stream-finished   Fired once the buffer has fully drained after a
 *                         "done" event (or after instant load). Used by the
 *                         host to append the next message in sequence.
 */
class GameMessage extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });

        /**
         * Pending events awaiting consumption by the pump.
         * @type {Array<{ kind: 'narration-block' | 'dialogue-block' | 'narration' | 'dialogue' | 'done', text?: string }>}
         */
        this._queue = [];

        /** Whether the pump loop is currently running. */
        this._pumping = false;

        /** When true, text is materialised instantly with no per-token delay. */
        this._instant = false;

        /**
         * The currently open block, or null.
         * @type {null | {
         *   type: 'narration' | 'dialogue',
         *   index: number,
         *   box: HTMLElement,
         *   textEl: HTMLElement,
         *   fragEl: HTMLElement | null,
         *   fragType: null | 'narration' | 'dialogue',
         * }}
         */
        this._current = null;

        /** Running count of blocks created (also the debug index). */
        this._blockIndex = 0;

        /** Whether any dialogue block has already rendered its avatar/name. */
        this._firstDialogueRendered = false;

        /** @type {HTMLElement | null} */
        this._blocksEl = null;

        /**
         * Optional async hook run immediately before a block is rendered.
         * @type {null | ((info: { type: 'narration' | 'dialogue', index: number, message: GameMessage }) => Promise<any> | any)}
         */
        this.beforeBlock = null;

        /**
         * Optional async hook run immediately after a block is finished.
         * @type {null | ((info: { type: 'narration' | 'dialogue', index: number, message: GameMessage }) => Promise<any> | any)}
         */
        this.afterBlock = null;
    }

    static get observedAttributes() {
        return ['sender-name', 'image-url', 'debug', 'show-avatar'];
    }

    connectedCallback() {
        this.render();
    }

    disconnectedCallback() {
        // Abandon any in-flight pump; the buffer is discarded with the element.
        this._pumping = false;
        this._queue = [];
    }

    /**
     * @param {string} name
     * @param {string | null} oldValue
     * @param {string | null} newValue
     */
    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue || !this.isConnected) return;
        if (name === 'image-url') {
            for (const img of Array.from(this.root.querySelectorAll('app-asset-image'))) {
                img.setAttribute('image-url', newValue || '');
            }
        } else if (name === 'sender-name') {
            for (const nameEl of Array.from(this.root.querySelectorAll('.name'))) {
                nameEl.textContent = newValue || '';
            }
        }
        // `debug` and `show-avatar` are read live where needed.
    }

    render() {
        this.root.innerHTML = `
            <link rel="stylesheet" href="components/game-messages/game-message.css">
            <div class="blocks"></div>`;
        this._blocksEl = /** @type {HTMLElement} */ (this.root.querySelector('.blocks'));
    }

    // ── Public API ───────────────────────────────────────────────────

    /**
     * Enqueue a raw engine conversation event.
     * @param {import('../../../engine/index.js').EngineConversationEvent} data
     */
    pushEngineEvent(data) {
        if (!data || !data.event) return;
        switch (data.event) {
            case 'add-narration-block':
                this._enqueue({ kind: 'narration-block' });
                break;
            case 'add-dialogue-block':
                this._enqueue({ kind: 'dialogue-block' });
                break;
            case 'add-narration':
                this._enqueue({ kind: 'narration', text: data.text || '' });
                break;
            case 'add-dialogue':
                this._enqueue({ kind: 'dialogue', text: data.text || '' });
                break;
            case 'done':
                this._enqueue({ kind: 'done' });
                break;
            default:
                // add-hidden-block and any unknown events are ignored here.
                break;
        }
    }

    /**
     * Convert a stored message body into the same event stream and enqueue it.
     * @param {string | Array<DEConversationMessageNarration | DEConversationMessageDialogue>} content
     * @param {{ stream?: boolean }} [opts]
     */
    loadContent(content, opts = {}) {
        this._instant = !opts.stream;

        if (typeof content === 'string') {
            const text = content.trim();
            if (text) {
                this._enqueue({ kind: 'narration-block' });
                this._enqueue({ kind: 'narration', text });
            }
        } else if (Array.isArray(content)) {
            for (const block of content) {
                if (!block) continue;
                if (block.type === 'narration') {
                    this._enqueue({ kind: 'narration-block' });
                    if (block.text) this._enqueue({ kind: 'narration', text: block.text });
                } else if (block.type === 'dialogue') {
                    this._enqueue({ kind: 'dialogue-block' });
                    for (const frag of (block.fragments || [])) {
                        if (!frag || !frag.text) continue;
                        this._enqueue({
                            kind: frag.type === 'narration' ? 'narration' : 'dialogue',
                            text: frag.text,
                        });
                    }
                }
            }
        }

        this._enqueue({ kind: 'done' });
    }

    // ── Buffered pump ────────────────────────────────────────────────

    /**
     * @param {{ kind: 'narration-block' | 'dialogue-block' | 'narration' | 'dialogue' | 'done', text?: string }} ev
     */
    _enqueue(ev) {
        this._queue.push(ev);
        this._ensurePump();
    }

    _ensurePump() {
        if (this._pumping) return;
        this._pumping = true;
        // Kick off asynchronously so a burst of _enqueue calls batches up first.
        Promise.resolve().then(() => this._pump());
    }

    async _pump() {
        while (this._queue.length) {
            const ev = /** @type {any} */ (this._queue.shift());
            if (!this.isConnected) { this._pumping = false; return; }
            await this._handleEvent(ev);
        }
        this._pumping = false;
        // Guard against events enqueued during the final await.
        if (this._queue.length) this._ensurePump();
    }

    /**
     * @param {{ kind: string, text?: string }} ev
     */
    async _handleEvent(ev) {
        switch (ev.kind) {
            case 'narration-block':
                await this._closeCurrentBlock();
                await this._openBlock('narration');
                break;
            case 'dialogue-block':
                await this._closeCurrentBlock();
                await this._openBlock('dialogue');
                break;
            case 'narration':
                await this._appendText(ev.text || '', 'narration');
                break;
            case 'dialogue':
                await this._appendText(ev.text || '', 'dialogue');
                break;
            case 'done':
                await this._closeCurrentBlock();
                this._finish();
                break;
        }
    }

    _finish() {
        this._hideCursor();
        this.dispatchEvent(new CustomEvent('on-stream-finished', { bubbles: true, composed: true }));
    }

    // ── Block lifecycle ──────────────────────────────────────────────

    /**
     * @param {'narration' | 'dialogue'} type
     */
    async _openBlock(type) {
        if (typeof this.beforeBlock === 'function') {
            await this.beforeBlock({ type, index: this._blockIndex, message: this });
        }
        if (type === 'narration') this._createNarrationBlock();
        else this._createDialogueBlock();
    }

    async _closeCurrentBlock() {
        const block = this._current;
        if (!block) return;
        this._hideCursor();
        this._current = null;
        if (typeof this.afterBlock === 'function') {
            await this.afterBlock({ type: block.type, index: block.index, message: this });
        }
    }

    _createNarrationBlock() {
        const box = document.createElement('div');
        box.className = 'message narration';
        const p = document.createElement('p');
        p.className = 'narration-text';
        box.appendChild(p);
        this._blocksEl?.appendChild(box);
        this._current = { type: 'narration', index: this._blockIndex, box, textEl: p, fragEl: null, fragType: null };
        this._wireBlockDebugClick(box, this._blockIndex);
        this._blockIndex++;
        this._scrollParent();
    }

    _createDialogueBlock() {
        const showAvatar = this.getAttribute('show-avatar') !== 'false';
        const isSelf = this.hasAttribute('is-self');
        const isGroupStart = this.hasAttribute('is-group-start');
        // The first dialogue block of a continuation message (not a group start)
        // hides the avatar/name so it reads as part of the previous message.
        const continuation = !this._firstDialogueRendered && !isGroupStart;
        const drawAvatar = showAvatar && !continuation;

        const box = document.createElement('div');
        box.className = 'message chat' + (isSelf ? ' self' : '') + (isGroupStart ? ' group-start' : '');

        const body = document.createElement('div');
        body.className = 'body';

        if (showAvatar) {
            if (drawAvatar) {
                const avatar = document.createElement('div');
                avatar.className = 'avatar';
                const img = document.createElement('app-asset-image');
                img.setAttribute('image-url', this.getAttribute('image-url') || '');
                img.setAttribute('default-image', './images/default-profile.png');
                img.setAttribute('no-transition', 'true');
                avatar.appendChild(img);
                box.appendChild(avatar);

                const nameEl = document.createElement('div');
                nameEl.className = 'name';
                nameEl.textContent = this.getAttribute('sender-name') || '';
                body.appendChild(nameEl);
            } else {
                const spacer = document.createElement('div');
                spacer.className = 'avatar-spacer';
                spacer.setAttribute('aria-hidden', 'true');
                box.appendChild(spacer);
            }
        }

        const txt = document.createElement('div');
        txt.className = 'msg-text';
        body.appendChild(txt);
        box.appendChild(body);

        this._blocksEl?.appendChild(box);
        this._current = { type: 'dialogue', index: this._blockIndex, box, textEl: txt, fragEl: null, fragType: null };
        this._firstDialogueRendered = true;
        this._wireBlockDebugClick(box, this._blockIndex);
        this._blockIndex++;
        this._scrollParent();
    }

    // ── Text materialisation ─────────────────────────────────────────

    /**
     * Append text to the current block, dripping it token-by-token unless in
     * instant mode.
     * @param {string} text
     * @param {'narration' | 'dialogue'} mode
     */
    async _appendText(text, mode) {
        if (!text) return;
        if (!this._current) {
            // Defensive: a stray text event with no block — open a narration one.
            await this._openBlock('narration');
        }
        const block = /** @type {any} */ (this._current);

        // Resolve the target element the text should grow into.
        let target;
        if (block.type === 'narration') {
            target = block.textEl;
        } else {
            // Within a dialogue block, dialogue and narration alternate as
            // fragments. A change of fragment type starts a new fragment span.
            if (block.fragType !== mode || !block.fragEl) {
                const span = document.createElement('span');
                span.className = mode === 'narration' ? 'inline-narration' : 'dialogue-frag';
                // Separate consecutive fragments with a space when needed.
                if (block.textEl.textContent && !/\s$/.test(block.textEl.textContent) && !/^\s/.test(text)) {
                    block.textEl.appendChild(document.createTextNode(' '));
                }
                block.textEl.appendChild(span);
                block.fragEl = span;
                block.fragType = mode;
            }
            target = block.fragEl;
        }

        text = text.replace(/\*/g, '');
        if (!text) return;

        if (this._instant) {
            const span = document.createElement('span');
            span.className = 'token-instant';
            span.textContent = text;
            target.appendChild(span);
            this._scrollParent();
            return;
        }

        await this._drip(target, text);
    }

    /**
     * Drip text into a target element one token at a time at a measured pace.
     * @param {HTMLElement} target
     * @param {string} text
     */
    async _drip(target, text) {
        const tokens = this._tokenize(text);
        for (const tok of tokens) {
            if (!this.isConnected) return;
            this._hideCursor();
            const span = document.createElement('span');
            span.className = 'token';
            span.textContent = tok;
            target.appendChild(span);
            this._placeCursor(target);
            this._scrollParent();
            await this._delay();
        }
    }

    /**
     * Compute the per-token delay. Deliberately unhurried, but adaptive: the
     * larger the pending buffer, the faster it drains so it never lags behind.
     * @returns {Promise<void>}
     */
    _delay() {
        const backlog = this._queue.length;
        // Base pace: gentle, human-readable.
        let base = 26 + Math.random() * 30; // 26–56 ms
        // Occasional longer beat for a natural rhythm (~7% of the time).
        if (Math.random() < 0.07) base *= 2.4 + Math.random() * 2;
        // Speed up progressively as the buffer builds so we stay close to live.
        if (backlog > 24) base *= 0.28;
        else if (backlog > 12) base *= 0.5;
        else if (backlog > 6) base *= 0.72;
        return new Promise(resolve => setTimeout(resolve, base));
    }

    /**
     * Split text into LLM-style tokens: whole words with trailing whitespace
     * attached, with longer words occasionally split mid-way.
     * @param {string} text
     * @returns {string[]}
     */
    _tokenize(text) {
        const result = [];
        const parts = text.split(/(\s+)/);
        for (const part of parts) {
            if (!part) continue;
            if (/^\s+$/.test(part)) {
                if (result.length > 0) result[result.length - 1] += part;
                else result.push(part);
            } else if (part.length > 5 && Math.random() < 0.28) {
                const splitAt = Math.max(1, Math.floor(part.length * (0.3 + Math.random() * 0.4)));
                result.push(part.slice(0, splitAt));
                result.push(part.slice(splitAt));
            } else {
                result.push(part);
            }
        }
        return result;
    }

    // ── Cursor & scrolling ───────────────────────────────────────────

    /** @param {HTMLElement} target */
    _placeCursor(target) {
        if (!target) return;
        let cur = this.root.querySelector('.cursor');
        if (!cur) {
            cur = document.createElement('span');
            cur.className = 'cursor';
            cur.setAttribute('aria-hidden', 'true');
        }
        target.appendChild(cur);
    }

    _hideCursor() {
        const cur = this.root.querySelector('.cursor');
        if (cur) cur.remove();
    }

    _scrollParent() {
        try {
            const root = /** @type {ShadowRoot | Document} */ (this.getRootNode());
            const container = root.querySelector?.('.game-story-content');
            if (container) container.scrollTop = container.scrollHeight;
        } catch (_) {
            // Element may have been detached.
        }
    }

    // ── Debug ────────────────────────────────────────────────────────

    /**
     * Attach a click handler that opens the debug-message dialog for this
     * block when the `debug` attribute is "true".
     * @param {HTMLElement} box
     * @param {number} index
     */
    _wireBlockDebugClick(box, index) {
        box.addEventListener('click', () => {
            if (this.getAttribute('debug') !== 'true') return;
            const gid = this.dataset.gid || this.getAttribute('data-gid') || this.getAttribute('gid') || '';
            const senderName = this.getAttribute('sender-name') || '';
            const dialog = document.createElement('app-dialog');
            dialog.setAttribute('dialog-title', `Message debug — block ${index}`);
            dialog.setAttribute('confirmation', 'true');
            dialog.setAttribute('confirm-text', 'Close');
            dialog.setAttribute('cancel-text-disable', 'true');
            dialog.setAttribute('extra-z-index', '100');
            dialog.setAttribute('large', 'true');
            dialog.setAttribute('pre-expand', 'true');

            const panel = document.createElement('app-debug-message');
            panel.setAttribute('gid', gid);
            panel.setAttribute('sender-name', senderName);
            panel.setAttribute('index', String(index));
            dialog.appendChild(panel);

            const close = () => { if (dialog.parentNode) dialog.parentNode.removeChild(dialog); };
            dialog.addEventListener('confirm', close);
            dialog.addEventListener('cancel', close);

            document.body.appendChild(dialog);
        });
    }
}

customElements.define('app-game-message', GameMessage);
