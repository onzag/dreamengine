import '../world-image.js';
import '../dialog.js';
import '../debug/debug-message.js';
import { emotions, emotionsGrouped } from '../../../engine/util/emotions.js';
import { playNarration } from '../../sound.js';

/**
 * One narration or dialogue block. The host supplies identity, sender and
 * emotion; the element resolves its own portrait and sender grouping.
 *
 * setContent(piece) displays a finished piece immediately. feedEvent(event)
 * appends live text immediately, without a separate stream mode.
 * pseudostreamContent(piece) stages the original piece without displaying it.
 * runPseudostream() prepares audio while waiting for the previous sibling,
 * then starts animation and playback together. Its promise and
 * on-pseudostream-finished event complete only after both have finished.
 */
class GameMessage extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        // Keep empty/staged hosts out of layout even before the CSS loads.
        this.root.innerHTML = `
            <style>:host { display: none; } :host([data-visible]) { display: block; }</style>
            <link rel="stylesheet" href="components/game/game-message.css">
            <div class="block-root"></div>`;
        /** @type {DEConversationMessageNarration | DEConversationMessageDialogue | null} */
        this._piece = null;
        this._rendered = false;
        /** @type {HTMLElement | null} */
        this._blockBoxEl = null;
        /** @type {HTMLElement | null} */
        this._msgTextEl = null;
        /** @type {HTMLElement | null} */
        this._narrationTextEl = null;
        /** @type {HTMLElement | null} */
        this._curFragEl = null;
        /** @type {'narration' | 'dialogue' | null} */
        this._curFragType = null;
        /** @type {'idle' | 'staged' | 'preparing' | 'running' | 'finished'} */
        this._pseudostreamState = 'idle';
        /** @type {Promise<void> | null} */
        this._pseudostreamPromise = null;
        /** @type {Promise<void> | null} */
        this._preparationPromise = null;
        /** @type {Promise<void> | null} */
        this._pseudostreamFinishedPromise = null;
        /** @type {(() => void) | null} */
        this._resolvePseudostreamFinished = null;
        /** @type {Promise<void> | null} */
        this._pseudoStreamInitPromise = null;
        /** @type {(() => void) | null} */
        this._resolvePseudoStreamInitPromise = null;
        /** @type {string | null} */
        this._audioSrc = null;
        this._audioController = new AbortController();
        this._presentationVersion = 0;
        this._cancelled = false;
        /** @type {(() => void) | null} */
        this._resolveCancellation = null;
        /** @type {Promise<void>} */
        this._cancellation = new Promise(resolve => { this._resolveCancellation = resolve; });

        /**
         * @type {Array<string>}
         */
        this._locallyUploadedAssets = [];
    }

    static get observedAttributes() {
        return ['sender-name', 'emotion'];
    }

    connectedCallback() {
        if (this._rendered) this._refreshPresentation();
    }

    disconnectedCallback() {
        this._cancelled = true;
        this._audioController.abort();
        this._presentationVersion++;
        this._resolveCancellation?.();
        if (this._pseudostreamState !== 'idle') this._finishPseudostream();
        if (this._audioSrc) URL.revokeObjectURL(this._audioSrc);
        this._audioSrc = null;
    }

    attributeChangedCallback() {
        if (this._rendered) this._refreshPresentation();
    }

    /** @returns {'narration' | 'dialogue'} */
    _blockType() {
        return this._piece?.type || (this.getAttribute('type') === 'narration' ? 'narration' : 'dialogue');
    }

    /** @returns {Array<DEConversationMessageDialogueFragment>} */
    _fragments() {
        if (!this._piece) return [];
        return this._piece.type === 'narration'
            ? [{ type: 'narration', text: this._piece.text }]
            : this._piece.fragments;
    }

    _hasContent() {
        return this._fragments().some(fragment => (fragment.text || '').trim());
    }

    /** Display a complete piece immediately, without voice or animation.
     * @param {DEConversationMessageNarration | DEConversationMessageDialogue | null} piece
     */
    setContent(piece) {
        if (this._pseudostreamState !== 'idle') return;
        this._piece = piece;
        this._clearContent();
        if (!this._hasContent()) return;
        this._ensureRendered();
        for (const fragment of this._fragments()) {
            if (fragment.type === 'sound') {
                const pseudoSoundsAndModes = ["normal", "normal voice", "pause", "short pause", "medium pause", "long pause", ...emotions];
                this._appendSound(fragment.soundInfo.sound || fragment.soundInfo.mode || { label: fragment.text || 'unknown', replacement: pseudoSoundsAndModes.includes((fragment.text || '').trim().toLowerCase()) ? '' : '—{{char}} does ' + (fragment.text || 'a sound') });
            } else {
                this._appendInstant(fragment.type, fragment.text);
            }
        }
    }

    /** @param {import('../../../engine/index.js').EngineConversationEvent} data */
    feedEvent(data) {
        if (!data || this._pseudostreamState !== 'idle') return;
        switch (data.event) {
            case 'add-narration':
            case 'add-dialogue': {
                const mode = data.event === 'add-narration' ? 'narration' : 'dialogue';
                if (mode === 'dialogue' && this._blockType() === 'narration') return;
                this._appendInstant(mode, data.text || '');
                break;
            }
            case 'add-sound': {
                // we do nothing because we want to wait for all of the data of the sound to be added before we display it, so we will wait for the end-add-sound event
                break;
            }
            case 'end-add-narration':
            case 'end-add-dialogue':
                // do nothing here because we stream the text as it comes in, so we don't need to do anything when the end-add event is received
                break;
            case 'end-add-sound':
                // we will display the sound here because we want to wait for all of the data of the sound to be added before we display it

                // there is no sound in narration, this is dialogue specific
                if (this._blockType() === 'narration') return;

                if (data.soundInfo && (data.soundInfo.sound || data.soundInfo.mode)) {
                    // @ts-ignore
                    this._appendSound(data.soundInfo.sound || data.soundInfo.mode);
                } else {
                    const pseudoSoundsAndModes = ["normal", "normal voice", "pause", "short pause", "medium pause", "long pause", ...emotions];
                    if (data.text && pseudoSoundsAndModes.includes(data.text.trim().toLowerCase())) {
                        // if the text is a pseudo sound or mode, we will not display it as a sound, but as a normal text
                        this._appendSound({ label: data.text || 'unknown', replacement: '' });
                        return;
                    }
                    console.warn('GameMessage: received end-add-sound event without soundInfo.');
                    this._appendSound({ label: data.text || 'unknown', replacement: '—{{char}} does ' + (data.text || 'a sound') });
                }
                
                break;
            case 'end-narration-block':
            case 'end-dialogue-block':
            case 'done':
                this._hideCursor();
                break;
        }
    }

    /** Stage the complete piece without rendering, synthesis, or mutation.
     * @param {DEConversationMessageNarration | DEConversationMessageDialogue} piece
     */
    pseudostreamContent(piece) {
        if (this._pseudostreamState !== 'idle' && this._pseudostreamState !== 'staged') {
            throw new Error('GameMessage: cannot pseudostreamContent while running or finished.');
        };
        this._piece = piece;
        this._clearContent();
        this._pseudostreamState = 'staged';
        if (!this._pseudostreamFinishedPromise) {
            this._pseudostreamFinishedPromise = new Promise(resolve => {
                this._resolvePseudostreamFinished = resolve;
            });
        }
        if (!this._pseudoStreamInitPromise) {
            this._pseudoStreamInitPromise = new Promise(resolve => { this._resolvePseudoStreamInitPromise = resolve; });
        }
    }

    isPseudoStreamAwait() {
        return this._pseudostreamState === 'staged';
    }

    /** Start once; every caller receives the same completion promise. */
    /**
     * @returns {Promise<void>}
     */
    runPseudostream() {
        if (this._pseudostreamPromise) return this._pseudostreamPromise;
        if (!this.isPseudoStreamAwait()) return Promise.resolve();
        this._pseudostreamState = 'preparing';
        this._pseudostreamPromise = this._runPseudostream();
        return this._pseudostreamPromise;
    }

    /** Generate audio and wait for the previous sibling concurrently.
     * A staged predecessor has a completion promise before it is started.
     * @returns {Promise<void>}
     */
    pseudostreamPrepare() {
        if (!this._preparationPromise) {
            const previous = this.previousElementSibling;
            const predecessorPseudoFinished = previous instanceof GameMessage
                ? previous._pseudostreamFinishedPromise : null;
            const predecessorInitFinished = previous instanceof GameMessage
                ? previous._pseudoStreamInitPromise || Promise.resolve() : Promise.resolve();

            const audio = predecessorInitFinished.then(() => this._prepareAudio()).then(src => {
                if (this._cancelled) {
                    if (src) URL.revokeObjectURL(src);
                } else {
                    this._audioSrc = src;
                }
            }).catch(error => {
                console.error('GameMessage: voice preparation failed.', error);
            });
            this._preparationPromise = Promise.all([audio, predecessorPseudoFinished]).then(() => {});
        }
        return this._preparationPromise;
    }

    async _runPseudostream() {
        try {
            await Promise.race([this.pseudostreamPrepare(), this._cancellation]);
            if (this._cancelled) {
                this.dispatchEvent(new CustomEvent('on-pseudostream-cancelled', { bubbles: true, composed: true }));
            }
            if (this._cancelled || !this._hasContent()) return;
            this._pseudostreamState = 'running';
            this._ensureRendered();
            // Both branches start in the same turn; neither gates the other.
            const results = await Promise.race([
                Promise.allSettled([
                    this._animateContent(),
                    this._audioSrc ? playNarration(this._audioSrc, 1, this._audioController.signal) : Promise.resolve(),
                ]),
                this._cancellation.then(() => []),
            ]);
            for (const result of results) {
                if (result.status === 'rejected') console.error('GameMessage: pseudostream failed.', result.reason);
            }
        } catch (error) {
            console.error('GameMessage: pseudostream failed.', error);
        } finally {
            this._finishPseudostream();
        }
    }

    _finishPseudostream() {
        if (this._pseudostreamState === 'finished') return;
        this._hideCursor();
        this._pseudostreamState = 'finished';
        if (!this._cancelled) this._showReplayButton();
        this._resolvePseudostreamFinished?.();
        this.dispatchEvent(new CustomEvent('on-pseudostream-finished', { bubbles: true, composed: true }));
    }

    async _animateContent() {
        for (const fragmentSrc of this._fragments()) {
            let fragment = fragmentSrc;
            if (this._cancelled) return;
            const text = (fragment.text || '');
            let markAsSound = false;
            if (!text) continue;
            if (fragment.type === 'sound') {
                const pseudoSoundsAndModes = ["normal", "normal voice", "pause", "short pause", "medium pause", "long pause", ...emotions];
                const soundInfo = fragment.soundInfo.sound || fragment.soundInfo.mode || { label: fragment.text || 'unknown', replacement: pseudoSoundsAndModes.includes(fragment.text.trim().toLowerCase()) ? '' : '—{{char}} does ' + (fragment.text || 'a sound') };
                const resolved = this._appendSound(soundInfo, true);
                if (resolved) {
                    fragment = {
                        text: resolved.text,
                        // @ts-ignore
                        type: resolved.type
                    };
                    markAsSound = true;
                } else {
                    console.warn('GameMessage: could not resolve sound fragment.', soundInfo);
                    continue;
                }
            }
            const target = this._blockType() === 'narration'
                // @ts-ignore guaranteed not to be sound
                ? this._narrationTextEl : this._ensureDialogueFragment(fragment.type);
            if (target) await this._drip(target, text, markAsSound);
        }
        this._hideCursor();
    }

    /** Synthesis only: playback belongs to the run phase.
     * @returns {Promise<string | null>}
     */
    async _prepareAudio() {
        const session = window.GAME_VOCALIZER;

        if (!session || !this._hasContent()) {
            this._resolvePseudoStreamInitPromise?.();
            this._pseudoStreamInitPromise = null;
            this._resolvePseudoStreamInitPromise = null;
            return null;
        };

        const narratorVoice = await this.getNarratorVoice();
        const sender = this.getAttribute('sender-name');

        /**
         * @type {CharacterVoiceAssets | null}
         */
        const characterVoices = this._blockType() === 'dialogue' && sender
            ? await window.ENGINE_WORKER_CLIENT.queryDEObject({ path: ['characters', sender, 'metadata', 'voice'] })
            : null;

        /**
         * @type {CharacterVoiceModifiersAssets | null}
         */
        const characterVoiceModifiers = this._blockType() === 'dialogue' && sender
            ? await window.ENGINE_WORKER_CLIENT.queryDEObject({ path: ['characters', sender, 'metadata', 'voiceModifiers'] })
            : null;

        /**
         * @type {CharacterSoundAssets | null}
         */
        const characterSounds = this._blockType() === 'dialogue' && sender
            ? await window.ENGINE_WORKER_CLIENT.queryDEObject({ path: ['characters', sender, 'metadata', 'sounds'] })
            : null;
        /** @type {Array<import('../../../engine/voice/base.js').VocalizerSpeechSegment|import('../../../engine/voice/base.js').VocalizerDelaySegment|import('../../../engine/voice/base.js').VocalizerAudioSegment>} */
        const segments = [];

        const emotion = this.getAttribute('emotion') || 'neutral';

        /**
         * @type {string}
         */
        let lastMode = emotion;
        for (const fragment of this._fragments()) {
            if (this._cancelled) return null;
            if (!(fragment.text || '').trim()) continue;
            
            if (fragment.type === "dialogue" || fragment.type === "narration") {
                const voice = fragment.type === 'narration' ? narratorVoice
                    : this._resolveFragmentVoice(narratorVoice, characterVoices, characterVoiceModifiers, lastMode);
                const segment = await session.buildSpeechSegment(fragment.text, voice);
                segments.push(segment);
            } else if (fragment.type === "sound") {
                const soundInfoMode = fragment.soundInfo.mode;
                if (soundInfoMode) {
                    lastMode = soundInfoMode.label;
                } else if (fragment.text) {
                    const lowered = fragment.text.trim().toLowerCase();
                    if (lowered === "normal" || lowered === "normal voice") {
                        lastMode = emotion;
                    } else if (emotions.includes(lowered)) {
                        lastMode = lowered;
                    }
                } else {
                    // we assume it is a sound
                    const soundInfoSound = fragment.soundInfo.sound;
                    if (soundInfoSound) {
                        const sound = characterSounds?.[soundInfoSound.label];
                        if (sound?.asset) {
                            sound.preGapRange = sound.preGapRange || [0, 0];
                            segments.push({ duration_ms: sound.preGapRange });

                            const refInfo = await session.ensureAssetUploaded(sound.asset, this._locallyUploadedAssets);
                            const refName = refInfo ? refInfo[0] : null;
                            const assetPath = refInfo ? refInfo[1] : null;
                            if (refName) {
                                segments.push({ ref: refName });
                                if (assetPath) this._locallyUploadedAssets.push(assetPath);
                            }

                            sound.postGapRange = sound.postGapRange || [0, 0];
                            segments.push({ duration_ms: sound.postGapRange });
                        }
                    } else {
                        const lowered = fragment.text.trim().toLowerCase();
                        if (lowered === "pause" || lowered === "short pause" || lowered === "medium pause" || lowered === "long pause") {
                            segments.push({ duration_ms: lowered === "short pause" ? [300, 500] : lowered === "medium pause" ? [700, 1000] : lowered === "long pause" ? [1500, 2000] : [700, 1000] });
                        } else {
                            console.warn('GameMessage: unrecognized sound fragment text, treating as a short pause.', fragment.text);
                            segments.push({ duration_ms: [300, 500] });
                        }
                    }
                }
            }
        }
        return session.renderSegments(segments, () => {
            setTimeout(() => {
                this._resolvePseudoStreamInitPromise?.();
                this._pseudoStreamInitPromise = null;
                this._resolvePseudoStreamInitPromise = null;
            }, 10); // yield to the event loop so the caller can attach a listener
        });
    }

    /**
     * @param {CharacterVoiceEntry | null} narratorVoice
     * @param {CharacterVoiceAssets | null} characterVoiceInfo
     * @param {CharacterVoiceModifiersAssets | null} characterVoiceModifiers
     * @param {string} lastMode
     * @returns {CharacterVoiceEntry | null}
     */
    _resolveFragmentVoice(narratorVoice, characterVoiceInfo, characterVoiceModifiers, lastMode) {
        const emotion = this.getAttribute('emotion') || 'neutral';
        for (const key of this._emotionFallbacks(emotion)) {
            const voice = (characterVoiceInfo?.[/** @type {keyof CharacterVoiceAssets} */ (key)]) || (characterVoiceModifiers?.[/** @type {keyof CharacterVoiceModifiersAssets} */ (key)]);
            if (voice?.asset === '@none') return null;
            if (voice?.asset === '@narrator') return narratorVoice;
            if (voice?.asset) return voice;
        }
        return null;
    }

    /** @param {string} emotion */
    _emotionFallbacks(emotion) {
        const group = Object.values(emotionsGrouped).find(emotions => emotions.includes(emotion)) || [];
        return [...new Set([emotion, ...group, 'neutral'])];
    }

    _showReplayButton() {
        const box = this._blockBoxEl;
        if (!box || !this._audioSrc || box.querySelector('.replay-btn')) return;
        const button = document.createElement('button');
        button.className = 'replay-btn';
        button.title = 'Replay voice';
        button.setAttribute('aria-label', 'Replay voice');
        button.innerHTML = '<svg viewBox="0 0 24 24" style="width:60%;height:60%;pointer-events:none;"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';
        button.addEventListener('click', event => {
            event.stopPropagation();
            this.playNarration();
        });
        box.appendChild(button);
    }

    async playNarration() {
        if (!this._audioSrc || this._cancelled) return;
        const completed = await playNarration(this._audioSrc, 1, this._audioController.signal);
        const next = this.nextElementSibling;
        if (completed && !this._cancelled && next instanceof GameMessage && next._pseudostreamState === 'finished' && next._audioSrc) {
            await next.playNarration();
        }
    }

    _clearContent() {
        this.removeAttribute('data-visible');
        this.root.querySelector('.block-root')?.replaceChildren();
        this._presentationVersion++;
        this._rendered = false;
        this._blockBoxEl = this._msgTextEl = this._narrationTextEl = this._curFragEl = null;
        this._curFragType = null;
    }

    _ensureRendered() {
        if (this._rendered) return;
        this._rendered = true;
        const root = /** @type {HTMLElement} */ (this.root.querySelector('.block-root'));
        if (this._blockType() === 'narration') this._buildNarrationBox(root);
        else this._buildDialogueBox(root);
        this.setAttribute('data-visible', '');
        this._refreshPresentation();
    }

    /** Resolve portrait and player identity inside the component. */
    async _refreshPresentation() {
        if (this._blockType() !== 'dialogue' || !this._blockBoxEl) return;
        const version = ++this._presentationVersion;
        const box = this._blockBoxEl;
        const sender = this.getAttribute('sender-name') || '';
        const name = box.querySelector('.name');
        if (name) name.textContent = sender;
        const client = window.ENGINE_WORKER_CLIENT;
        if (!client) return;
        try {
            const [user, assets] = await Promise.all([
                client.queryDEObject({ path: ['user'] }),
                sender && box.querySelector('app-asset-image')
                    ? client.queryDEObject({ path: ['characters', sender, 'metadata', 'assets'] })
                    : null,
            ]);
            if (version !== this._presentationVersion) return;
            box.classList.toggle('self', sender === user);
            const emotion = this.getAttribute('emotion') || 'neutral';
            const asset = this._emotionFallbacks(emotion).map(key => assets?.[key]).find(Boolean) || '';
            box.querySelector('app-asset-image')?.setAttribute('image-url', asset);
        } catch (error) {
            console.error('GameMessage: could not load sender presentation.', error);
        }
    }

    /**
     * 
     * @param {DEVoiceMode | DEVoiceSound} soundInfo
     * @param {boolean} returnForDrip
     */
    _appendSound(soundInfo, returnForDrip = false) {
        const soundInfoAsVoiceSound = /** @type {DEVoiceSound} */ (soundInfo);
        const replacements = soundInfoAsVoiceSound.replacement || [];
        const replacementsAsArray = Array.isArray(replacements) ? replacements : [replacements];

        // get the current text that exists in the whole message
        let numericSeed = ((this.getAttribute('gid') || "null") + this.getAttribute("content-index")).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

        // move that seed a bit according to how many sounds have already been added
        const existingSoundCount = this.querySelectorAll('.token-sound').length;
        numericSeed += existingSoundCount;

        // use the numeric seed to select a replacement from the array of replacements
        const replacementIndex = numericSeed % replacementsAsArray.length;
        const replacement = replacementsAsArray[replacementIndex];

        // if the replacement is empty, add a space
        if (!replacement || !replacement.trim()) {
            console.warn('GameMessage: replacement for sound ' + soundInfoAsVoiceSound.label + ' is empty, adding a space.');
            if (returnForDrip) return { type: 'dialogue', text: ' ' };
            this._appendInstant('dialogue', ' ', true);
            return { type: 'dialogue', text: ' ' };
        }

        // check what type of replacement we have, if the replacement has a em dash then it is narrative
        if (replacement.includes('—')) {
            // remove all em dashes and replace {{char}} with the sender name
            const value = replacement.replace(/—/g, '').replace(/{{char}}/g, this.getAttribute('sender-name') || '').trim();
            if (returnForDrip) return { type: 'narration', text: value };
            this._appendInstant('narration', value, true);
            return { type: 'narration', text: value };
        } else {
            // append as it is and as dialogue
            if (returnForDrip) return { type: 'dialogue', text: replacement };
            this._appendInstant('dialogue', replacement, true);
            return { type: 'dialogue', text: replacement };
        }
    }

    /**
     * @param {'narration' | 'dialogue'} mode
     * @param {string} text
     * @param {boolean} markAsSound - Whether to mark this text as a sound
     */
    _appendInstant(mode, text, markAsSound = false) {
        text = (text || '').replace(/\*/g, '');
        if (!text || (!this._rendered && !text.trim())) return;
        this._ensureRendered();
        const target = this._blockType() === 'narration'
            ? this._narrationTextEl : this._ensureDialogueFragment(mode);
        if (target) this._writeInstant(target, text, markAsSound);
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
        let previous = this.previousElementSibling;
        while (previous instanceof GameMessage && !previous.hasAttribute('data-visible')) {
            previous = previous.previousElementSibling;
        }
        const showAvatar = !(previous instanceof GameMessage)
            || previous._blockType() !== 'dialogue'
            || previous.getAttribute('sender-name') !== this.getAttribute('sender-name');

        const box = document.createElement('div');
        box.className = 'message chat' + (showAvatar ? ' group-start' : '');

        const body = document.createElement('div');
        body.className = 'body';

        if (showAvatar) {
            const avatar = document.createElement('div');
            avatar.className = 'avatar';
            const img = document.createElement('app-asset-image');
            img.setAttribute('image-url', '');
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
        }
        return /** @type {HTMLElement} */ (this._curFragEl);
    }

    /**
     * @param {HTMLElement} target
     * @param {string} text
     * @param {boolean} markAsSound
     */
    _writeInstant(target, text, markAsSound = false) {
        // check if the previous element (if any in this target) is a sound type, if so, we will add a space before the new text to separate it from the previous sound
        const lastChild = target.lastElementChild;
        const previousIsSound = lastChild && lastChild.classList.contains('token-sound');
        if (previousIsSound || (markAsSound && lastChild)) {
            text = ', ' + text;
        }

        // should add end dot and remove it? is it better?

        const span = document.createElement('span');
        span.className = 'token-instant';
        if (markAsSound) span.classList.add('token-sound');
        span.textContent = text;
        target.appendChild(span);
        this._scrollParent();
    }

    /**
     * Drip text into a target element one token at a time at a measured pace.
     * @param {HTMLElement} target
     * @param {string} text
     * @param {boolean} markAsSound
     */
    async _drip(target, text, markAsSound = false) {
        const tokens = markAsSound ? [text] : this._tokenize(text);
        for (const toksrc of tokens) {
            let tok = toksrc;
            if (this._cancelled) return;
            this._hideCursor();

            const lastChild = target.lastElementChild;
            const previousIsSound = lastChild && lastChild.classList.contains('token-sound');
            if (previousIsSound || (markAsSound && lastChild)) {
                tok = ', ' + tok;
            }

            const span = document.createElement('span');
            span.className = 'token';
            if (markAsSound) span.classList.add('token-sound');
            span.textContent = tok;
            target.appendChild(span);
            this._placeCursor(target);
            this._scrollParent();
            await Promise.race([this._delay(), this._cancellation]);
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
