import { sharedStyles, messageButtonStyles } from './shared-styles.js';
import { playConfirmSound, playHoverSound } from '../../../sound.js';
import { hasOpenDialogs } from '../../dialog-state.js';
import './message-object.js';
import './message-input.js';

/** Owns navigation and the local user turn; duplicate engine updates preserve the UI. */
export class MessageView extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        this.root.innerHTML = `<style>
${sharedStyles}
${messageButtonStyles}
:host { display: block; min-height: 0; }
:host([hidden]), [hidden] { display: none !important; }
section { padding: 1.5vh 2vh; }
nav { display: flex; align-items: center; justify-content: space-between; gap: 1vh; margin-top: 1vh; min-height: 4vh; }
.next, .loading { margin-left: auto; }
.loading { display: inline-flex; align-items: center; gap: 1vh; color: var(--muted); font-size: 2vh; }
.spinner { width: 1em; height: 1em; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; }
kbd { opacity: .7; margin-left: 1vh; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
</style><section class="black-glass" aria-label="Conversation">
<app-game-message-object></app-game-message-object>
<app-game-message-input hidden></app-game-message-input>
<nav aria-label="Message navigation">
<button class="prev" type="button" aria-label="Previous message">&#9664; Back</button>
<span class="loading" role="status" hidden><span class="spinner" aria-hidden="true"></span><span class="status"></span></span>
<button class="next" type="button" aria-keyshortcuts="Space Enter"><span>Next &#9654;</span><kbd>Space / Enter</kbd></button>
</nav></section>`;
        this.messageObject = /** @type {import('./message-object.js').MessageObject} */ (this.root.querySelector('app-game-message-object'));
        this.input = /** @type {import('./message-input.js').MessageInput} */ (this.root.querySelector('app-game-message-input'));
        this.prev = /** @type {HTMLButtonElement} */ (this.root.querySelector('.prev'));
        this.next = /** @type {HTMLButtonElement} */ (this.root.querySelector('.next'));
        this.loading = /** @type {HTMLElement} */ (this.root.querySelector('.loading'));
        /** @type {DECharacterPerspective | null} */
        this.currentPerspective = null;
        /** @type {(() => void | Promise<void>) | null} */
        this.onNext = null;
        /** @type {(() => void | Promise<void>) | null} */
        this.onPrev = null;
        /** @type {AbortController | null} */
        this.controller = null;
        this.messageKey = '';
        this.selectionKey = '';
        this.frozenKey = '';
        this.hasCurrent = false;
        this.hasPrev = false;
        this.hasNext = false;
        this.processing = false;
        this.isInputMode = false;
        this.navigating = false;
        this.controlsKey = '';
        this.prev.addEventListener('click', () => { void this.goBack(); });
        this.next.addEventListener('click', () => {
            if (this.isInputMode) this.input.submit();
            else void this.advance();
        });
        this.input.addEventListener('draft-change', () => {
            if (this.isInputMode) this.next.disabled = !this.input.canSubmit;
        });
        for (const button of [this.prev, this.next]) {
            button.addEventListener('mouseenter', () => { if (!button.disabled) playHoverSound(); });
        }
        this.messageObject.addEventListener('stream-change', () => this.renderControls());
        this.input.addEventListener('message-submit', event => {
            event.stopPropagation();
            if (this.frozenKey || !this.isInputMode || this.processing || this.navigating) return;
            const text = /** @type {CustomEvent<string>} */ (event).detail;
            playConfirmSound();
            this.frozenKey = this.messageKey;
            this.input.accept(text);
            this.renderControls();
            this.dispatchEvent(new CustomEvent('message-input', { detail: text, bubbles: true, composed: true }));
        });
    }

    connectedCallback() {
        this.controller?.abort();
        this.controller = new AbortController();
        this.renderControls();
        window.addEventListener('keydown', event => {
            if (event.defaultPrevented || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey
                || this.hidden || hasOpenDialogs() || !this.getClientRects().length) return;
            // Shadow-root inputs, identifier links and native buttons own their keys.
            if (event.composedPath().some(node => node instanceof HTMLElement &&
                (node.inert || node.matches('input, textarea, select, button, a, [role="button"], [contenteditable]:not([contenteditable="false"])')))) return;
            let ancestor = /** @type {Node | null} */ (this);
            while (ancestor) {
                if (ancestor instanceof HTMLElement && ancestor.inert) return;
                ancestor = ancestor.parentNode || (ancestor instanceof ShadowRoot ? ancestor.host : null);
            }
            if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault();
                void this.advance();
            } else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                void this.goBack();
            }
        }, { signal: this.controller.signal });
    }

    disconnectedCallback() { this.controller?.abort(); }

    /**
     * @param {DECharacterPerspective | null} perspective
     * @param {DEConversation | null} conversation
     * @param {DEConversationMessage | null} message
     * @param {DEConversationMessageDialogue | DEConversationMessageNarration | null} content
     * @param {boolean} hasPrev
     * @param {boolean} hasNext
     * @param {number} [contentIndex]
     */
    updateMessageView(perspective, conversation, message, content, hasPrev, hasNext, contentIndex = 0) {
        this.hasCurrent = !!(conversation && message && content);
        if (!conversation || !message || !content) {
            this.messageObject.pause();
            this.renderControls();
            return;
        }
        const messageKey = JSON.stringify([conversation.id, message.id]);
        // Submission is a latch: even edits to the old message must not reopen its controls.
        if (this.frozenKey === messageKey) { this.renderControls(); return; }
        const selectionKey = JSON.stringify([perspective?.ownId, messageKey, contentIndex]);
        if (selectionKey !== this.selectionKey) this.isInputMode = false;
        this.frozenKey = '';
        this.messageKey = messageKey;
        this.selectionKey = selectionKey;
        this.currentPerspective = perspective;
        this.hasPrev = hasPrev;
        this.hasNext = hasNext;
        this.processing = message.isProcessingSideEffects === true;
        this.messageObject.updateMessage(perspective, message, content, selectionKey);
        this.input.updateUser(perspective, JSON.stringify([perspective?.ownId, conversation.id]));
        // A next message may arrive while an unsent draft is open. Keep the draft for later.
        if (this.isInputMode && (hasNext || this.processing)) this.isInputMode = false;
        this.renderControls();
    }

    renderControls() {
        const userName = this.currentPerspective?.ownName || this.currentPerspective?.self.characterNameSimple || 'Player';
        const key = JSON.stringify([this.hasCurrent, this.isInputMode, this.frozenKey, this.processing,
            this.hasPrev, this.hasNext, this.navigating, this.messageObject.streaming, userName]);
        if (key === this.controlsKey) return;
        this.controlsKey = key;
        this.hidden = !this.hasCurrent;
        this.messageObject.hidden = this.isInputMode;
        this.input.hidden = !this.isInputMode;
        this.input.setEnabled(this.hasCurrent && this.isInputMode && !this.frozenKey && !this.processing && !this.navigating);
        this.prev.hidden = !!this.frozenKey || !(this.isInputMode || this.hasPrev);
        this.prev.disabled = this.navigating;
        this.next.hidden = !!this.frozenKey || this.processing || this.navigating;
        this.next.disabled = this.isInputMode && !this.input.canSubmit;
        const shortcut = /** @type {HTMLElement} */ (this.next.querySelector('kbd'));
        shortcut.hidden = this.isInputMode;
        this.next.setAttribute('aria-keyshortcuts', this.isInputMode ? 'Enter' : 'Space Enter');
        const label = this.isInputMode ? 'Ok \u25b6' : this.messageObject.streaming ? 'Reveal text' : this.hasNext ? 'Next \u25b6' : `${userName}'s Turn \u25b6`;
        const nextLabel = /** @type {HTMLElement} */ (this.next.querySelector('span'));
        if (nextLabel.textContent !== label) nextLabel.textContent = label;
        this.loading.hidden = !(this.frozenKey || this.processing || this.navigating);
        const status = /** @type {HTMLElement} */ (this.loading.querySelector('.status'));
        const statusText = this.frozenKey ? 'Waiting...' : 'Processing\u2026';
        if (status.textContent !== statusText) status.textContent = statusText;
    }

    async advance() {
        if (!this.hasCurrent || this.frozenKey || this.processing || this.navigating || this.isInputMode) return;
        playConfirmSound();
        if (this.messageObject.streaming) { this.messageObject.finish(); return; }
        if (!this.hasNext) {
            this.isInputMode = true;
            this.renderControls();
            this.input.focusInput();
        } else await this.navigate(this.onNext);
    }

    async goBack() {
        if (!this.hasCurrent || this.frozenKey || this.navigating) return;
        if (this.isInputMode) {
            playConfirmSound();
            this.isInputMode = false;
            this.renderControls();
        } else if (this.hasPrev) {
            playConfirmSound();
            await this.navigate(this.onPrev);
        }
    }

    /** @param {(() => void | Promise<void>) | null} callback */
    async navigate(callback) {
        if (!callback) return;
        this.navigating = true;
        this.renderControls();
        try { await callback(); }
        catch (error) { console.error('Unable to navigate conversation', error); }
        finally { this.navigating = false; this.renderControls(); }
    }
}
customElements.define('app-game-message-view', MessageView);
