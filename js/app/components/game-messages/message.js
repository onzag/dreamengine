import '../world-image.js';

/**
 * A single message in the in-dream story feed.
 *
 * A message is NOT rendered as one flat block. Its text is parsed into
 * paragraphs (split on newlines) and each paragraph becomes its own "box":
 *
 *   • Narration message (is-narration): every paragraph → a narration box.
 *
 *   • Character message (sender-name, is-narration false): each paragraph is
 *     classified as either
 *       - DIALOGUE  when it begins with "<sender-name>:". The prefix is
 *         dropped and the avatar/name are shown. Within the dialogue a " - "
 *         or "—" toggles an inline narration chunk: the delimiter is shown as
 *         an em-dash and the chunk is styled like narration. Surrounding
 *         double quotes are dropped from each segment (leading/trailing only,
 *         never interior ones).
 *       - NARRATION otherwise. The whole paragraph is consumed verbatim and
 *         rendered exactly like a narration-message box.
 *     Consecutive dialogue paragraphs merge into a single dialogue box,
 *     separated by newlines. A narration paragraph breaks the run so the next
 *     dialogue paragraph starts a fresh dialogue box (with its own avatar).
 *
 * Parsing is fully incremental so it behaves identically whether the text is
 * added immediately, fake-streamed (simulated), or streamed for real via
 * addText() — a single message can therefore appear as several UI boxes that
 * grow token-by-token.
 *
 * Attributes (set before appending to DOM):
 *  - is-narration         (boolean) Whole message is story-master narration.
 *  - is-self              (boolean) Message sent by the player's own character.
 *  - is-group-start       (boolean) First message in a consecutive run from one
 *                         sender; when false the first dialogue box omits the
 *                         avatar/name to continue the previous message visually.
 *  - sender-name          Display name of the sender (also the dialogue prefix).
 *  - text                 Initial message body. Fake-streamed token-by-token
 *                         unless no-stream-simulation is set.
 *  - image-url            Asset path for the sender's portrait.
 *  - no-stream-simulation (boolean) Add the initial text instantly; addText()
 *                         still streams for real afterward.
 *
 * Public API:
 *  - addText(chunk)  Append a real streamed chunk, parsed and animated the same
 *                    way as the simulated stream. Safe to call at any time.
 *
 * Events:
 *  - on-simulated-stream-finished  Fired once the initial text has finished
 *                    rendering (immediately for no-stream-simulation, or when
 *                    the fake stream completes). Not fired for external
 *                    addText() streaming, whose end is controlled by the caller.
 */
class GameMessage extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        /** @type {ReturnType<typeof setTimeout> | null} */
        this._streamTimer = null;
        /** @type {boolean} */
        this._streaming = false;
        /** @type {HTMLElement | null} */
        this._boxesEl = null;
        /** @type {any} */
        this._ps = null;
    }

    // is-narration / is-self / is-group-start / text / no-stream-simulation are
    // read once at connect. Only image-url and sender-name are live-updatable.
    static get observedAttributes() {
        return ['sender-name', 'image-url'];
    }

    connectedCallback() {
        this.render();
        this._initParseState();

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
        // Live-patch without wiping streamed content.
        if (name === 'image-url') {
            for (const img of Array.from(this.root.querySelectorAll('app-asset-image'))) {
                img.setAttribute('image-url', newValue || '');
            }
            if (this._ps) this._ps.imageUrl = newValue || '';
            return;
        }
        if (name === 'sender-name') {
            for (const nameEl of Array.from(this.root.querySelectorAll('.name'))) {
                nameEl.textContent = newValue || '';
            }
            if (this._ps) {
                this._ps.senderName = newValue || '';
                this._ps.prefix = (newValue || '') + ':';
            }
        }
    }

    /**
     * Append a real streamed chunk. Parsed and animated exactly like the
     * simulated stream, so callers can build a message up over time.
     * @param {string} chunk
     */
    addText(chunk) {
        if (!chunk) return;
        // A real chunk supersedes any in-flight fake stream.
        if (this._streaming) {
            this._streaming = false;
            if (this._streamTimer !== null) {
                clearTimeout(this._streamTimer);
                this._streamTimer = null;
            }
            this._hideCursor();
        }
        this._feed(chunk, true);
    }

    // ── Private helpers ──────────────────────────────────────────────

    _initParseState() {
        const senderName = this.getAttribute('sender-name') || '';
        this._ps = {
            decided: false,
            /** @type {null | 'dialogue' | 'narration'} */
            lineType: null,
            prefixBuf: '',
            // Dialogue box persists across paragraphs so consecutive dialogue
            // paragraphs merge into one box.
            /** @type {HTMLElement | null} */
            dialogueTextEl: null,
            dialogueNeedsSeparator: false,
            // Inline " - " / "—" delimited narration chunk within a dialogue.
            inNarration: false,
            /** @type {HTMLElement | null} */
            inlineNarrationEl: null,
            // Per-segment (text between delimiters) state.
            segStarted: false,
            segLeadQuoteDropped: false,
            // Held trailing whitespace/quote awaiting a segment boundary.
            tail: '',
            // A '-' awaiting a following space to confirm it's a delimiter.
            /** @type {null | '-'} */
            pendingDash: null,
            firstDialogueRendered: false,
            // Narration box: one per paragraph.
            /** @type {HTMLElement | null} */
            narrationTextEl: null,
            narrationParaOpen: false,
            // Static message info.
            isNarrationMsg: this.hasAttribute('is-narration'),
            isSelf: this.hasAttribute('is-self'),
            isGroupStart: this.hasAttribute('is-group-start'),
            senderName,
            prefix: senderName + ':',
            imageUrl: this.getAttribute('image-url') || '',
        };
    }

    /**
     * Add the full text at once with no per-token animation.
     * @param {string} text
     */
    _addTextImmediate(text) {
        this._feed(text, false);
        this._finishStreaming();
    }

    _finishStreaming() {
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
     * Fake an LLM token stream: drip tokens through the same parser used for
     * real streaming, with randomised timing and occasional bursts.
     * @param {string} text
     */
    _simulateStream(text) {
        const tokens = this._tokenize(text);
        if (!tokens.length) {
            this._finishStreaming();
            return;
        }

        let i = 0;
        this._streaming = true;

        const next = () => {
            if (!this._streaming || i >= tokens.length) {
                this._streaming = false;
                this._hideCursor();
                this._finishStreaming();
                return;
            }

            // 25% chance to burst two tokens at once.
            const burst = (Math.random() < 0.25 && i + 1 < tokens.length) ? 2 : 1;
            this._hideCursor();
            this._feed(tokens.slice(i, i + burst).join(''), true);
            this._placeCursor();
            i += burst;

            // Mostly fast (22–77 ms), occasional longer pause (~8% of the time).
            const base = 22 + Math.random() * 55;
            const delay = Math.random() < 0.08 ? base * (3 + Math.random() * 4) : base;
            this._streamTimer = setTimeout(next, delay);
        };

        next();
    }

    /** Move (or create) the blinking cursor to the currently growing target. */
    _placeCursor() {
        const ps = this._ps;
        if (!ps) return;
        const target = ps.inlineNarrationEl || ps.dialogueTextEl || ps.narrationTextEl;
        if (!target) return;
        let cur = this.root.querySelector('.cursor');
        if (!cur) {
            cur = document.createElement('span');
            cur.className = 'cursor';
            cur.setAttribute('aria-hidden', 'true');
        }
        target.appendChild(cur);
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
        this.root.innerHTML = `
            <link rel="stylesheet" href="components/game-messages/message.css">
            <div class="boxes"></div>`;
        this._boxesEl = /** @type {HTMLElement} */ (this.root.querySelector('.boxes'));
    }

    /**
     * Feed a chunk of raw text through the paragraph/dialogue parser, creating
     * and growing boxes as needed. Contiguous characters bound for the same
     * target are batched into a single token span.
     * @param {string} str
     * @param {boolean} animate - whether appended spans should fade in.
     */
    _feed(str, animate) {
        const ps = this._ps;
        if (!ps || !this._boxesEl) return;

        let buf = '';
        /** @type {HTMLElement | null} */
        let bufTarget = null;

        const flush = () => {
            if (buf && bufTarget) {
                const span = document.createElement('span');
                span.className = animate ? 'token' : 'token-instant';
                span.textContent = buf;
                bufTarget.appendChild(span);
            }
            buf = '';
            bufTarget = null;
        };

        /**
         * @param {string} s
         * @param {HTMLElement | null} target
         */
        const emit = (s, target) => {
            if (!s || !target) return;
            if (target !== bufTarget) {
                flush();
                bufTarget = target;
            }
            buf += s;
        };

        /** @param {string} c */
        const isSpace = (c) => c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v';

        // Current emit target within a dialogue paragraph: an inline-narration
        // span while inside a delimiter-bounded narration chunk, otherwise the
        // dialogue text element.
        const dialogueTarget = () => {
            if (ps.inNarration) {
                if (!ps.inlineNarrationEl) {
                    flush();
                    const s = document.createElement('span');
                    s.className = 'inline-narration';
                    /** @type {HTMLElement} */(ps.dialogueTextEl).appendChild(s);
                    ps.inlineNarrationEl = s;
                }
                return ps.inlineNarrationEl;
            }
            return ps.dialogueTextEl;
        };

        const ensureDialogueBox = () => {
            if (!ps.dialogueTextEl) {
                flush();
                this._createDialogueBox(ps);
                ps.dialogueNeedsSeparator = false;
            } else if (ps.dialogueNeedsSeparator) {
                flush();
                ps.dialogueTextEl.appendChild(document.createTextNode('\n'));
                ps.dialogueNeedsSeparator = false;
            }
        };

        const flushTailAsIs = () => {
            if (ps.tail) {
                emit(ps.tail, dialogueTarget());
                ps.tail = '';
            }
        };

        // Resolve the segment's held tail at a boundary: drop trailing
        // whitespace and a single trailing double quote, emit the interior rest.
        const resolveTail = () => {
            let t = ps.tail.replace(/\s+$/, '');
            if (t.endsWith('"')) t = t.slice(0, -1);
            t = t.replace(/\s+$/, '');
            if (t) emit(t, dialogueTarget());
            ps.tail = '';
        };

        // A confirmed " - " / "—" delimiter: close the current segment, toggle
        // dialogue<->narration, show an em-dash, reset per-segment state.
        const commitDelimiter = () => {
            resolveTail();
            ps.inNarration = !ps.inNarration;
            ps.inlineNarrationEl = null;
            emit(' — ', /** @type {HTMLElement} */(ps.dialogueTextEl));
            ps.segStarted = false;
            ps.segLeadQuoteDropped = false;
        };

        /** @param {string} ch */
        const processDialogueChar = (ch) => {
            ensureDialogueBox();

            // Resolve a pending '-' — was it a " - " delimiter or a hyphen?
            if (ps.pendingDash) {
                ps.pendingDash = null;
                if (isSpace(ch)) {
                    commitDelimiter();
                    return; // consume the delimiter's trailing space
                }
                // No trailing space → literal hyphen.
                flushTailAsIs();
                emit('-', dialogueTarget());
                // fall through to handle ch
            }

            // Leading phase: skip leading whitespace, drop one leading quote.
            if (!ps.segStarted) {
                if (isSpace(ch)) return;
                if (ch === '"' && !ps.segLeadQuoteDropped) {
                    ps.segLeadQuoteDropped = true;
                    return;
                }
                ps.segStarted = true;
            }

            if (ch === '—') {
                commitDelimiter();
                return;
            }

            if (ch === '-') {
                if (/\s$/.test(ps.tail)) {
                    // Space before → potential " - " delimiter; await next char.
                    ps.pendingDash = '-';
                    return;
                }
                flushTailAsIs();
                emit('-', dialogueTarget());
                return;
            }

            if (isSpace(ch) || ch === '"') {
                // Hold — might be interior, or trailing to drop at a boundary.
                ps.tail += ch;
                return;
            }

            flushTailAsIs();
            emit(ch, dialogueTarget());
        };

        /** @param {string} ch */
        const emitNarration = (ch) => {
            if (!ps.narrationParaOpen) {
                flush();
                ps.dialogueTextEl = null; // a narration paragraph breaks the dialogue run
                ps.dialogueNeedsSeparator = false;
                ps.inNarration = false;
                this._createNarrationBox(ps);
                ps.narrationParaOpen = true;
            }
            emit(ch, ps.narrationTextEl);
        };

        const endLine = () => {
            if (ps.lineType === 'dialogue') {
                ps.pendingDash = null;
                resolveTail();
                ps.inNarration = false;
                ps.inlineNarrationEl = null;
                ps.segStarted = false;
                ps.segLeadQuoteDropped = false;
                // Keep the dialogue box open so a following dialogue paragraph
                // merges into it (separated by a newline).
                if (ps.dialogueTextEl) ps.dialogueNeedsSeparator = true;
            }
            flush();
            ps.narrationParaOpen = false;
            ps.narrationTextEl = null;
            ps.decided = false;
            ps.lineType = null;
            ps.prefixBuf = '';
        };

        for (const ch of str) {
            // DECIDING PHASE — classify the current paragraph.
            if (!ps.decided) {
                if (ps.isNarrationMsg) {
                    ps.decided = true;
                    ps.lineType = 'narration';
                    // fall through to processing below
                } else if (ch === '\n') {
                    // Paragraph ended before we could match the prefix → narration.
                    for (const c of ps.prefixBuf) emitNarration(c);
                    ps.prefixBuf = '';
                    ps.lineType = 'narration';
                    endLine();
                    continue;
                } else {
                    const candidate = ps.prefixBuf + ch;
                    if (ps.prefix && candidate === ps.prefix) {
                        // Matched "<name>:" → dialogue; drop the prefix.
                        ps.prefixBuf = '';
                        ps.decided = true;
                        ps.lineType = 'dialogue';
                        continue;
                    } else if (ps.prefix && ps.prefix.startsWith(candidate)) {
                        // Still potentially the prefix — keep buffering.
                        ps.prefixBuf = candidate;
                        continue;
                    } else {
                        // Diverged from the prefix → narration paragraph.
                        ps.decided = true;
                        ps.lineType = 'narration';
                        for (const c of ps.prefixBuf) emitNarration(c);
                        ps.prefixBuf = '';
                        emitNarration(ch);
                        continue;
                    }
                }
            }

            // DECIDED PHASE.
            if (ps.lineType === 'narration') {
                if (ch === '\n') endLine();
                else emitNarration(ch);
            } else {
                if (ch === '\n') endLine();
                else processDialogueChar(ch);
            }
        }

        flush();
        this._scrollParent();
    }

    /** @param {any} ps */
    _createNarrationBox(ps) {
        const box = document.createElement('div');
        box.className = 'message narration';
        const p = document.createElement('p');
        p.className = 'narration-text';
        box.appendChild(p);
        this._boxesEl?.appendChild(box);
        ps.narrationTextEl = p;
    }

    /** @param {any} ps */
    _createDialogueBox(ps) {
        // A continuation message (not a group start) hides the avatar/name on
        // its first dialogue box so it reads as part of the previous message.
        const continuation = !ps.firstDialogueRendered && !ps.isGroupStart;

        const box = document.createElement('div');
        box.className = 'message chat' + (ps.isSelf ? ' self' : '');

        const body = document.createElement('div');
        body.className = 'body';

        if (continuation) {
            const spacer = document.createElement('div');
            spacer.className = 'avatar-spacer';
            spacer.setAttribute('aria-hidden', 'true');
            box.appendChild(spacer);
        } else {
            const avatar = document.createElement('div');
            avatar.className = 'avatar';
            const img = document.createElement('app-asset-image');
            img.setAttribute('image-url', ps.imageUrl || '');
            img.setAttribute('default-image', './images/default-profile.png');
            img.setAttribute('no-transition', 'true');
            avatar.appendChild(img);
            box.appendChild(avatar);

            const nameEl = document.createElement('div');
            nameEl.className = 'name';
            nameEl.textContent = ps.senderName;
            body.appendChild(nameEl);
        }

        const txt = document.createElement('div');
        txt.className = 'msg-text';
        body.appendChild(txt);
        box.appendChild(body);

        this._boxesEl?.appendChild(box);
        ps.dialogueTextEl = txt;
        ps.firstDialogueRendered = true;
    }
}

customElements.define('app-game-message', GameMessage);
