import '../world-image.js';
import '../dialog.js';
import '../debug/debug-message.js';
import { emotionsGrouped } from '../../../engine/util/emotions.js';
import { playNarration } from '../../sound.js';

/**
 * A SINGLE story block in the in-dream feed.
 *
 * Each `app-game-message` element now represents exactly ONE block — either a
 * narration block or a dialogue block — as opposed to a whole message. The
 * host (game.js) creates one element per content piece and drives it in one of
 * two ways:
 *
 *   • Pseudo-stream (`pseudostream="true"`): the host already has the finished
 *     block object (a `DEConversationMessageNarration` or
 *     `DEConversationMessageDialogue`) and calls `pseudostreamContent(piece)`
 *     once. The element simulates a token stream and, when done, runs the
 *     shared async finaliser and fires `on-pseudostream-finished`.
 *
 *   • Real stream (`stream="true"`): the block is being generated live. The
 *     host feeds raw engine events through `feedEvent(data)` as they arrive
 *     (`add-narration`, `add-dialogue`, `done`). The element regenerates the
 *     same block object internally while it writes, and on `done` runs the
 *     shared async finaliser and fires `on-stream-finished`.
 *
 * A dialogue block may contain both dialogue and narration fragments; an em
 * dash ( — ) is rendered between adjacent fragments of differing kind so it
 * reads like the novel it represents. A narration block only accepts
 * narration; a dialogue block accepts both. A `stream` that feeds `add-dialogue`
 * to a narration block is rejected.
 *
 * The element inserts ITSELF into the story list (`.game-story-content-list`
 * inside the `app-game` shadow root) the first time it is driven, because the
 * host does not append it.
 *
 * ── Attributes (set before driving) ─────────────────────────────────
 *  - type           "narration" | "dialogue"  — the kind of block.
 *  - gid            Message global id (shared by every block of a message).
 *  - content-index  Index of this block within its message's content array.
 *  - debug-id       The block's `__debug_id` (gid + "__" + index).
 *  - image-url      Portrait asset path (dialogue blocks with an avatar).
 *  - sender-name    Display name (dialogue blocks with an avatar).
 *  - show-avatar    "true" | "false" — whether to draw the avatar + name.
 *  - stream         "true" | "false" — this block is a live stream.
 *  - pseudostream   "true" | "false" — this block is a simulated stream.
 *  - debug          "true" | "false" — enable the per-block debug dialog.
 *
 * ── Public API ──────────────────────────────────────────────────────
 *  - pseudostreamContent(piece)  Simulate a stream of a finished block object.
 *  - feedEvent(data)             Feed one live engine conversation event.
 *  - isStreaming()               True while a live stream is in progress.
 *  - finalizeBlock()             Overridable async hook run right before the
 *                                block signals completion (both stream types).
 *
 * ── Events ──────────────────────────────────────────────────────────
 *  - on-stream-finished          Real stream complete (after finalizeBlock).
 *  - on-pseudostream-finished    Pseudo stream complete (after finalizeBlock).
 */
class GameMessage extends HTMLElement {
    /**
     * Shared serialisation chain for block finalisers across all instances, so
     * concurrently-created live blocks can't run their finalizeBlock (voice)
     * work at the same time.
     * @type {Promise<any>}
     */
    static _finalizerChain = Promise.resolve();

    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });

        /** Whether the shadow DOM box has been built. */
        this._rendered = false;

        /** Whether a real (live) stream has fully finished. */
        this._finished = false;

        /**
         * Regenerated block object, built as the stream progresses. Matches
         * DEConversationMessageNarration | DEConversationMessageDialogue.
         * @type {any}
         */
        this._piece = null;

        // ── Dialogue-block fragment bookkeeping ──
        /** @type {HTMLElement | null} */
        this._msgTextEl = null;
        /** @type {HTMLElement | null} */
        this._curFragEl = null;
        /** @type {null | 'narration' | 'dialogue'} */
        this._curFragType = null;

        // ── Narration-block target ──
        /** @type {HTMLElement | null} */
        this._narrationTextEl = null;

        /**
         * The rendered `.message` box for this block (narration or dialogue),
         * used as the mount point for the replay button.
         * @type {HTMLElement | null}
         */
        this._blockBoxEl = null;

        /**
         * Object URL of the synthesized audio for this block, if any. Set once
         * the Vocalizer finishes rendering; drives the replay button.
         * @type {string | null}
         */
        this._audioSrc = null;

        // ── Live-stream drip queue ──
        /**
         * Pending live text chunks waiting to be dripped in. Live events append
         * here instantly (never blocking the real stream) and a background pump
         * (_runDripPump) animates them, speeding up when a backlog builds so it
         * never adds more time than the real stream's own pace.
         * @type {Array<{ mode: 'narration' | 'dialogue', text: string }>}
         */
        this._pendingChunks = [];
        /** Whether the background drip pump is currently running. */
        this._dripPumping = false;
        /**
         * Promise for the in-flight drip pump, awaited by the "done" handler so
         * finalisation waits for every queued token to be rendered.
         * @type {Promise<void> | null}
         */
        this._dripPumpPromise = null;
    }

    static get observedAttributes() {
        return ['sender-name', 'image-url'];
    }

    connectedCallback() {
        this._ensureRendered();
    }

    /**
     * @param {string} name
     * @param {string | null} _oldValue
     * @param {string | null} newValue
     */
    attributeChangedCallback(name, _oldValue, newValue) {
        if (!this.isConnected) return;
        if (name === 'image-url') {
            for (const img of Array.from(this.root.querySelectorAll('app-asset-image'))) {
                img.setAttribute('image-url', newValue || '');
            }
        } else if (name === 'sender-name') {
            const nameEl = this.root.querySelector('.name');
            if (nameEl) nameEl.textContent = newValue || '';
        }
    }

    // ── Block kind ───────────────────────────────────────────────────

    /** @returns {'narration' | 'dialogue'} */
    _blockType() {
        return this.getAttribute('type') === 'narration' ? 'narration' : 'dialogue';
    }

    // ── Public API ───────────────────────────────────────────────────

    /**
     * True while a live stream is in progress (created with stream="true" and
     * not yet finalised). Pseudo-stream and static blocks report false.
     * @returns {boolean}
     */
    isStreaming() {
        return this.getAttribute('stream') === 'true' && !this._finished;
    }

    /**
     * Feed a single live engine conversation event into this block. Text events
     * are appended to the drip queue INSTANTLY (they never block the real
     * stream); a background pump animates them, catching up when batched. The
     * "done" event waits for the queue to fully drain before finalising.
     * @param {import('../../../engine/index.js').EngineConversationEvent} data
     * @returns {Promise<void>}
     */
    async feedEvent(data) {
        if (!data || !data.event) return;
        //this._attachToList();
        this._ensureRendered();

        switch (data.event) {
            case 'add-narration':
                this._enqueueLiveText('narration', data.text || '');
                break;
            case 'add-dialogue':
                if (this._blockType() === 'narration') {
                    console.error('game-message: narration block rejected an add-dialogue event.', data);
                    return;
                }
                this._enqueueLiveText('dialogue', data.text || '');
                break;
            case 'done':
            case 'add-narration-block':
            case 'add-dialogue-block':
            case 'add-hidden-block':
                // Wait for EVERY queued token to finish dripping in (the drip
                // pump may restart if a chunk arrived late), then run the shared
                // finaliser. Looping on the live promise guarantees a fully
                // drained queue before finalisation.
                while (this._dripPumping || this._pendingChunks.length > 0) {
                    await this._dripPumpPromise;
                }
                await this._finishRealStream();
                break;
            default:
                // Block-start events are handled by the host (they spawn a new
                // element); nothing to do here.
                break;
        }
    }

    /**
     * Queue a chunk of live text for animated rendering and ensure the drip
     * pump is running. Returns immediately so incoming events are never
     * throttled by the animation.
     * @param {'narration' | 'dialogue'} mode
     * @param {string} text
     */
    _enqueueLiveText(mode, text) {
        text = (text || '').replace(/\*/g, '');
        if (!text) return;
        this._pendingChunks.push({ mode, text });
        if (!this._dripPumping) {
            this._dripPumpPromise = this._runDripPump();
        }
    }

    /**
     * Background loop that drips queued live-stream chunks token-by-token. The
     * per-token delay adapts to the backlog: with little pending text (the real
     * stream is keeping pace) it drips at a natural reading rhythm; as the
     * backlog grows (batched / late-arriving events) it accelerates — down to
     * zero — so it never adds more latency than the real stream itself.
     * @returns {Promise<void>}
     */
    async _runDripPump() {
        this._dripPumping = true;
        try {
            while (this._pendingChunks.length > 0) {
                const chunk = this._pendingChunks.shift();
                if (!chunk) break;

                const target = this._blockType() === 'narration'
                    ? this._narrationTextEl
                    : this._ensureDialogueFragment(chunk.mode);
                if (!target) continue;

                for (const tok of this._tokenize(chunk.text)) {
                    // Keep the regenerated piece object in sync with the DOM.
                    if (this._blockType() === 'narration') {
                        this._piece.text += tok;
                    } else {
                        const frags = this._piece.fragments;
                        frags[frags.length - 1].text += tok;
                    }

                    if (!this.isConnected) {
                        this._writeInstant(target, tok);
                        continue;
                    }
                    this._hideCursor();
                    const span = document.createElement('span');
                    span.className = 'token';
                    span.textContent = tok;
                    target.appendChild(span);
                    this._placeCursor(target);
                    this._scrollParent();
                    await this._adaptiveDelay();
                }
            }
        } finally {
            this._dripPumping = false;
        }
    }

    /** Total characters still queued to be dripped in. */
    _pendingChars() {
        return this._pendingChunks.reduce((sum, c) => sum + c.text.length, 0);
    }

    /**
     * Per-token delay for the LIVE stream, scaled by the current backlog so the
     * animation never falls behind the real event pace.
     * @returns {Promise<void>}
     */
    _adaptiveDelay() {
        const backlog = this._pendingChars();
        let base;
        if (backlog > 240) base = 0;          // far behind: dump as fast as possible
        else if (backlog > 120) base = 5;
        else if (backlog > 40) base = 14;
        else {
            base = 26 + Math.random() * 30;   // caught up: natural rhythm
            if (Math.random() < 0.07) base *= 2.4 + Math.random() * 2;
        }
        return new Promise(resolve => setTimeout(resolve, base));
    }

    /**
     * Simulate a stream of an already-finished block object, then finalise.
     * @param {DEConversationMessageNarration | DEConversationMessageDialogue} piece
     */
    async pseudostreamContent(piece) {
        //this._attachToList();
        this._ensureRendered();

        if (this._blockType() === 'narration' && piece.type !== 'narration') {
            console.error('game-message: narration block cannot pseudo-stream a dialogue piece.', piece);
            await this._finishPseudostream();
            return;
        }

        if (piece.type === 'narration') {
            await this._appendFragment('narration', /** @type {any} */(piece).text || '', true);
        } else {
            for (const frag of (/** @type {any} */(piece).fragments || [])) {
                if (!frag || !frag.text) continue;
                const mode = frag.type === 'narration' ? 'narration' : 'dialogue';
                await this._appendFragment(mode, frag.text, true);
            }
        }

        await this._finishPseudostream();
    }

    /**
     * Overridable async hook run right before a block signals completion, for
     * BOTH the real and pseudo streams. Resolves immediately by default; the
     * host may replace it to perform extra work (e.g. voice playback) before
     * the finished event fires. To be defined later.
     * @param {DEConversationMessageNarration | DEConversationMessageDialogue} piece
     * @returns {Promise<void>}
     */
    async finalizeBlock(piece) {
        if (piece.type === "narration") {
            const narratorVoice = await this.getNarratorVoice();
            if (!narratorVoice) return;
            await this.speakNarration(piece, narratorVoice);
        } else {
            const narratorVoice = await this.getNarratorVoice();

            if (!narratorVoice) return;

            const characterName = this.getAttribute('sender-name');

            let characterVoiceInfo = !characterName ? {
                neutral: narratorVoice,
            } : await window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ["characters", characterName, "metadata", "voice"],
            });

            if (!characterVoiceInfo || !characterVoiceInfo.neutral) {
                characterVoiceInfo = {
                    neutral: narratorVoice,
                };
            }

            await this.speakDialogue(piece, narratorVoice, characterVoiceInfo);
        }
    }

    /**
     * Synthesize and play a narration block through the global Vocalizer
     * session. A single speech segment is rendered with the narrator voice.
     * @param {DEConversationMessageNarration} piece
     * @param {CharacterVoiceEntry} narratorVoice
     */
    async speakNarration(piece, narratorVoice) {
        const session = window.GAME_VOCALIZER;
        if (!session) return;

        const segment = await session.buildSpeechSegment(piece.text, narratorVoice);
        if (!segment) return;

        this._showVoiceGenerating();
        const audioSrc = await this.getSrcFromVocalizer([segment]);
        if (!audioSrc) { this._hideVoiceGenerating(); return; }

        this._setAudioSource(audioSrc);
        await playNarration(audioSrc, 1);
    }

    /**
     * Synthesize and play a dialogue block. Each fragment becomes its own
     * speech segment: narration fragments use the narrator voice, dialogue
     * fragments use the character's emotion-matched voice (falling back through
     * grouped emotions, then neutral, then the narrator). All segments render
     * into a single continuous clip.
     * @param {DEConversationMessageDialogue} piece
     * @param {CharacterVoiceEntry} narratorVoice
     * @param {CharacterVoiceAssets} characterVoiceInfo
     */
    async speakDialogue(piece, narratorVoice, characterVoiceInfo) {
        const session = window.GAME_VOCALIZER;
        if (!session) return;

        /** @type {import("../../../engine/voice/base.js").VocalizerSpeechSegment[]} */
        const segments = [];

        let crashed = false;
        for (const frag of piece.fragments) {
            let voice;
            if (frag.type === "narration") {
                voice = narratorVoice;
            } else {
                voice = this._resolveFragmentVoice(narratorVoice, characterVoiceInfo);
            }
            const segment = await session.buildSpeechSegment(frag.text, voice);
            if (!segment) {
                crashed = true;
                break;
            };
            if (segment) segments.push(segment);
        }

        if (crashed) {
            console.error("GameMessage: failed to build one or more speech segments for dialogue block, skipping voice playback.");
        }

        this._showVoiceGenerating();
        const audioSrc = await this.getSrcFromVocalizer(segments);
        if (!audioSrc) { this._hideVoiceGenerating(); return; }

        this._setAudioSource(audioSrc);
        await playNarration(audioSrc, 1);
    }

    /**
     * Pick the character voice for a dialogue fragment based on the block's
     * `emotion` attribute, falling back through the emotion's group, then
     * neutral, then the narrator voice.
     * @param {CharacterVoiceEntry} narratorVoice
     * @param {CharacterVoiceAssets} characterVoiceInfo
     * @returns {CharacterVoiceEntry}
     */
    _resolveFragmentVoice(narratorVoice, characterVoiceInfo) {
        const emotion = this.getAttribute("emotion") || "neutral";
        // @ts-ignore
        let specificVoice = /** @type {CharacterVoiceEntry} */ (characterVoiceInfo[emotion]);
        if (!specificVoice) {
            const keyOfEmotion = Object.keys(emotionsGrouped).find((groupKey) => {
                if (emotionsGrouped[groupKey].includes(emotion)) {
                    return true;
                }
            });

            const alternatives = keyOfEmotion ? emotionsGrouped[keyOfEmotion] : [];
            for (const altEmotion of alternatives) {
                if (altEmotion === emotion) continue;
                // @ts-ignore
                specificVoice = /** @type {CharacterVoiceEntry} */ (characterVoiceInfo[altEmotion]);
                if (specificVoice) {
                    break;
                }
            }

            if (!specificVoice) {
                // @ts-ignore
                specificVoice = /** @type {CharacterVoiceEntry} */ (characterVoiceInfo["neutral"]);
            }
        }

        if (!specificVoice || !specificVoice.asset || specificVoice.asset === "@none" || typeof specificVoice.asset !== "string") {
            specificVoice = narratorVoice;
        }

        return specificVoice;
    }

    /**
     * Render a list of Vocalizer speech segments into a playable audio object
     * URL via the global session.
     * @param {import("../../../engine/voice/base.js").VocalizerSpeechSegment[]} segments
     * @return {Promise<string|null>} the object URL of the generated audio, or null
     */
    async getSrcFromVocalizer(segments) {
        const session = window.GAME_VOCALIZER;
        if (!session) return null;
        return session.renderSegments(segments);
    }

    /**
     * Show a small pulsing "generating voice" indicator on the message box.
     * Safe to call multiple times; only one indicator is ever inserted.
     */
    _showVoiceGenerating() {
        const box = this._blockBoxEl;
        if (!box || box.querySelector('.voice-gen-indicator')) return;
        const el = document.createElement('span');
        el.className = 'voice-gen-indicator';
        el.setAttribute('aria-label', 'Generating voice…');
        el.title = 'Generating voice…';
        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('span');
            dot.className = 'dot';
            el.appendChild(dot);
        }
        box.appendChild(el);
    }

    /** Remove the generating indicator (called when audio arrives or fails). */
    _hideVoiceGenerating() {
        this._blockBoxEl?.querySelector('.voice-gen-indicator')?.remove();
    }

    /**
     * Record the synthesized audio source for this block, remove the
     * generating indicator, and reveal a replay button.
     * @param {string} src
     */
    _setAudioSource(src) {
        this._hideVoiceGenerating();
        this._audioSrc = src;
        const box = this._blockBoxEl;
        if (!box || box.querySelector('.replay-btn')) return;

        const btn = document.createElement('button');
        btn.className = 'replay-btn';
        btn.title = 'Replay voice';
        btn.setAttribute('aria-label', 'Replay voice');
        btn.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:60%;height:60%;pointer-events:none;"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';
        btn.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
        btn.addEventListener('mouseleave', () => { btn.style.opacity = '0.75'; });
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.playNarration();
        });
        box.appendChild(btn);
    }

    async playNarration() {
        if (this._audioSrc) {
            await playNarration(this._audioSrc, 1);
            // find a potential next message next to this one and play its voice if it has one
            const nextMsg = this.nextElementSibling;
            if (nextMsg instanceof GameMessage && nextMsg._audioSrc) {
                nextMsg.playNarration();
            }
        }
    }

    // ── Finalisation ─────────────────────────────────────────────────

    async _finishRealStream() {
        if (this._finished) return;
        this._hideCursor();
        await GameMessage._runFinalizer(() => this.finalizeBlock(this._piece));
        this._finished = true;
        this.dispatchEvent(new CustomEvent('on-stream-finished', { bubbles: true, composed: true }));
    }

    async _finishPseudostream() {
        this._hideCursor();
        await GameMessage._runFinalizer(() => this.finalizeBlock(this._piece));
        this.dispatchEvent(new CustomEvent('on-pseudostream-finished', { bubbles: true, composed: true }));
    }

    /**
     * Run a block finaliser serially across ALL game-message instances. Live
     * blocks are created independently as engine events arrive, so without this
     * their finalizeBlock calls (e.g. voice synthesis + playback) would overlap.
     * Chaining them guarantees each block fully completes before the next one
     * begins.
     * @param {() => Promise<void>} task
     * @returns {Promise<void>}
     */
    static _runFinalizer(task) {
        const run = GameMessage._finalizerChain.then(task, task);
        // Swallow errors on the chain so one failure doesn't wedge the queue,
        // but still surface them to the caller of _runFinalizer.
        GameMessage._finalizerChain = run.catch(() => { });
        return run;
    }

    // // ── Self-insertion into the story list ───────────────────────────

    // _attachToList() {
    //     if (this.isConnected) return;
    //     const overlay = document.querySelector('app-game');
    //     const list = overlay && overlay.shadowRoot
    //         ? overlay.shadowRoot.querySelector('.game-story-content-list')
    //         : null;
    //     if (list) list.appendChild(this);
    // }

    // ── Rendering ────────────────────────────────────────────────────

    _ensureRendered() {
        if (this._rendered) return;
        this._rendered = true;

        this.root.innerHTML = `
            <link rel="stylesheet" href="components/game/game-message.css">
            <div class="block-root"></div>`;
        const rootEl = /** @type {HTMLElement} */ (this.root.querySelector('.block-root'));

        if (this._blockType() === 'narration') {
            this._piece = { type: 'narration', text: '' };
            this._buildNarrationBox(rootEl);
        } else {
            this._piece = { type: 'dialogue', fragments: [] };
            this._buildDialogueBox(rootEl);
        }
    }

    /** @param {HTMLElement} rootEl */
    _buildNarrationBox(rootEl) {
        const box = document.createElement('div');
        box.className = 'message narration';
        const p = document.createElement('p');
        p.className = 'narration-text';
        box.appendChild(p);
        rootEl.appendChild(box);
        this._narrationTextEl = p;
        this._blockBoxEl = box;
        this._wireBlockDebugClick(box);
    }

    /** @param {HTMLElement} rootEl */
    _buildDialogueBox(rootEl) {
        const showAvatar = this.getAttribute('show-avatar') === 'true';
        const isSelf = this.hasAttribute('is-self') || this.getAttribute('is-self') === 'true';

        const box = document.createElement('div');
        box.className = 'message chat' + (isSelf ? ' self' : '') + (showAvatar ? ' group-start' : '');

        const body = document.createElement('div');
        body.className = 'body';

        if (showAvatar) {
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

        const txt = document.createElement('div');
        txt.className = 'msg-text';
        body.appendChild(txt);
        box.appendChild(body);
        rootEl.appendChild(box);
        this._msgTextEl = txt;
        this._blockBoxEl = box;
        this._wireBlockDebugClick(box);
    }

    // ── Text materialisation ─────────────────────────────────────────

    /**
     * Append (and record) a chunk of text to the current block. For dialogue
     * blocks the text is routed into a dialogue/narration fragment, with an em
     * dash inserted between fragments of differing kind. When `animate` is
     * true the text drips token-by-token; otherwise it is written instantly.
     * @param {'narration' | 'dialogue'} mode
     * @param {string} text
     * @param {boolean} animate
     */
    async _appendFragment(mode, text, animate) {
        text = (text || '').replace(/\*/g, '');
        if (!text) return;

        let target;
        if (this._blockType() === 'narration') {
            this._piece.text += text;
            target = this._narrationTextEl;
        } else {
            target = this._ensureDialogueFragment(mode);
            const frags = this._piece.fragments;
            frags[frags.length - 1].text += text;
        }
        if (!target) return;

        if (animate) await this._drip(target, text);
        else this._writeInstant(target, text);
    }

    /**
     * Ensure there is an open fragment span of the given kind in the dialogue
     * box, inserting an em dash before it when switching kinds. Returns the
     * span the text should grow into.
     * @param {'narration' | 'dialogue'} mode
     * @returns {HTMLElement}
     */
    _ensureDialogueFragment(mode) {
        if (this._curFragType !== mode || !this._curFragEl) {
            if (this._curFragEl && this._msgTextEl) {
                const dash = document.createElement('span');
                dash.className = 'em-dash';
                dash.textContent = ' — ';
                this._msgTextEl.appendChild(dash);
            }
            const span = document.createElement('span');
            span.className = mode === 'narration' ? 'inline-narration' : 'dialogue-frag';
            /** @type {HTMLElement} */ (this._msgTextEl).appendChild(span);
            this._curFragEl = span;
            this._curFragType = mode;
            this._piece.fragments.push({ type: mode, text: '' });
        }
        return /** @type {HTMLElement} */ (this._curFragEl);
    }

    /**
     * @param {HTMLElement} target
     * @param {string} text
     */
    _writeInstant(target, text) {
        const span = document.createElement('span');
        span.className = 'token';
        span.textContent = text;
        target.appendChild(span);
        this._scrollParent();
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
     * Per-token delay for the pseudo-stream. Deliberately unhurried but with a
     * natural rhythm.
     * @returns {Promise<void>}
     */
    _delay() {
        let base = 26 + Math.random() * 30; // 26–56 ms
        if (Math.random() < 0.07) base *= 2.4 + Math.random() * 2;
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

    /**
     * 
     * @returns {Promise<CharacterVoiceEntry|null>}
     */
    async getNarratorVoice() {
        const supportsVocalizer = await window.API.getConfigValue("vocalizerEnabled");
        if (!supportsVocalizer) return null;
        // TODO use the transcript
        let narrator = (await window.ENGINE_WORKER_CLIENT.queryDEObject({
            path: ["state", "__INTERNAL_NARRATOR_OVERRIDE"],
        })) || await window.ENGINE_WORKER_CLIENT.queryDEObject({
            path: ["world", "metadata", "narrationVoice"],
        });
        const defaultNarrator = await window.ENGINE_WORKER_CLIENT.queryDEObject({
            path: ["state", "__INTERNAL_NARRATOR"],
        });
        narrator = narrator || defaultNarrator;
        const narratorValue = {
            asset: narrator?.asset || defaultNarrator?.asset || null,
            transcript: narrator?.transcript || defaultNarrator?.transcript || null,
            tags: narrator?.tags || defaultNarrator?.tags || [
                "expressive",
                "warm",
                "engaging",
            ],
        };
        if (narratorValue?.asset === "@none" || !narratorValue?.asset) {
            return null;
        }
        return narratorValue;
    }

    // ── Debug ────────────────────────────────────────────────────────

    /**
     * Attach a click handler that opens the debug-message dialog for this
     * block when the `debug` attribute is "true".
     * @param {HTMLElement} box
     */
    _wireBlockDebugClick(box) {
        box.addEventListener('click', () => {
            if (this.getAttribute('debug') !== 'true') return;
            const gid = this.getAttribute('gid') || '';
            const index = this.getAttribute('content-index') || '0';
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