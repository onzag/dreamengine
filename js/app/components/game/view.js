import './view/background.js';
import './view/stats.js';
import './view/character-surrounding-view.js';
import './view/message-view.js';
import './view/items-overlay.js';
import './view/menu.js';
import { playHoverSound } from '../../sound.js';

/** Coordinates message selection and hands its stored perspective to every display. */
export class GameView extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });

        this.currentUserId = this.getAttribute('initial-user-id') || '';
        this.currentConversationId = this.getAttribute('initial-conversation-id') || '';
        this.currentMessageId = this.getAttribute('initial-message-id') || '';
        this.currentPerspectiveId = this.getAttribute('initial-perspective-id') || '';

        /**
         * @type {DECharacterPerspective | null}
         */
        this.currentPerspective = null;
        this.loadedPerspectiveId = '';
        this.lifecycle = 0;
        this.perspectiveVersion = 0;
        this.perspectiveUpdateQueued = false;
        /** @type {Promise<void> | null} */
        this.pendingPerspectiveUpdate = null;
        /** @type {Animation | null} */
        this.blackOverlayAnimation = null;

        /**
         * @type {DEConversation | null}
         */
        this.currentConversation = null;
        /**
         * @type {DEConversationMessage | null}
         */
        this.currentConversationMessage = null;
        /**
         * @type {DEConversationMessageDialogue | DEConversationMessageNarration | null}
         */
        this.currentConversationMessageContent = null;
        /**
         * @type {number}
         */
        this.currentConversationMessageContentIndex = -1;

        /**
         * @type {DEConversation | null}
         */
        this.nextConversation = null;
        /**
         * @type {DEConversationMessage | null}
         */
        this.nextConversationMessage = null;
        /**
         * @type {DEConversationMessageDialogue | DEConversationMessageNarration | null}
         */
        this.nextConversationMessageContent = null;
        /**
         * @type {number}
         */
        this.nextConversationMessageContentIndex = -1;
         
        /**
         * @type {DEConversation | null}
         */
        this.prevConversation = null;
        /**
         * @type {DEConversationMessage | null}
         */
        this.prevConversationMessage = null;
        /**
         * @type {DEConversationMessageDialogue | DEConversationMessageNarration | null}
         */
        this.prevConversationMessageContent = null;
        /**
         * @type {number}
         */
        this.prevConversationMessageContentIndex = -1;
    }

    async recalculateMessageView(recalculatePrev = true, recalculateCurrent = true, recalculateNext = true) {
        // can't do without this
        if (!this.currentUserId) return;

        if (!this.currentConversationId || !this.currentMessageId) {
            const firstValue =
                await window.ENGINE_WORKER_CLIENT.queryDEObject({ path: ['utils', 'conversations', 'getFirstConversationAndMessageForCharacter'], call: [this.currentUserId] });

            if (firstValue) {
                this.currentConversationId = firstValue.conversation?.id || '';
                this.currentMessageId = firstValue.message?.id || '';

                this.currentConversation = firstValue.conversation || null;
                this.currentConversationMessage = firstValue.message || null;
                this.currentConversationMessageContent = firstValue.message?.content?.[0] || null;
                this.currentConversationMessageContentIndex = 0;
                const potentialPerspectiveInfo = this.currentConversationMessage?.perspectiveByCharacterId?.[this.currentUserId];
                this.currentPerspectiveId = potentialPerspectiveInfo?.after || potentialPerspectiveInfo?.before || '';
            }
        }

        if (this.currentConversationId && this.currentMessageId) {
            if (recalculateCurrent) {
                this.currentConversation = await window.ENGINE_WORKER_CLIENT.queryDEObject({ path: ['utils', 'conversations', 'getConversation'], call: [this.currentConversationId] });
                this.currentConversationMessage = this.currentConversation?.messages?.find(m => m.id === this.currentMessageId) || null;
                this.currentConversationMessageContentIndex = 0;
                this.currentConversationMessageContent = this.currentConversationMessage?.content?.[0] || null;
                const potentialPerspectiveInfo = this.currentConversationMessage?.perspectiveByCharacterId?.[this.currentUserId];
                this.currentPerspectiveId = potentialPerspectiveInfo?.after || potentialPerspectiveInfo?.before || '';
            }

            if (recalculateNext) {
                const nextValue =
                    await window.ENGINE_WORKER_CLIENT.queryDEObject({ path: ['utils', 'conversations', 'getNextConversationAndMessageForCharacter'], call: [this.currentUserId, this.currentConversationId, this.currentMessageId] });

                this.nextConversation = nextValue?.conversation || null;
                this.nextConversationMessage = nextValue?.message || null;
                this.nextConversationMessageContent = nextValue?.message?.content?.[0] || null;
                this.nextConversationMessageContentIndex = this.nextConversationMessageContent ? 0 : -1;
            }

            if (recalculatePrev) {
                const prevValue =
                    await window.ENGINE_WORKER_CLIENT.queryDEObject({ path: ['utils', 'conversations', 'getPreviousConversationAndMessageForCharacter'], call: [this.currentUserId, this.currentConversationId, this.currentMessageId] });

                this.prevConversation = prevValue?.conversation || null;
                this.prevConversationMessage = prevValue?.message || null;
                this.prevConversationMessageContentIndex = (prevValue?.message?.content?.length || 0) - 1;
                this.prevConversationMessageContent = prevValue?.message?.content?.[this.prevConversationMessageContentIndex] || null;
            }
        }
    }
    
    async goPrevMessage() {
        await this.pendingPerspectiveUpdate;
        if (!this.prevConversation || !this.prevConversationMessage || !this.prevConversationMessageContent) return;

        this.currentConversationId = this.prevConversation.id;
        this.currentMessageId = this.prevConversationMessage.id;

        this.nextConversation = this.currentConversation;
        this.nextConversationMessage = this.currentConversationMessage;
        this.nextConversationMessageContentIndex = this.currentConversationMessageContentIndex;
        this.nextConversationMessageContent = this.currentConversationMessageContent;

        this.currentConversation = this.prevConversation;
        this.currentConversationMessage = this.prevConversationMessage;
        this.currentConversationMessageContentIndex = this.prevConversationMessageContentIndex;
        this.currentConversationMessageContent = this.prevConversationMessageContent;

        const potentialPerspectiveInfo = this.currentConversationMessage?.perspectiveByCharacterId?.[this.currentUserId];
        this.currentPerspectiveId = potentialPerspectiveInfo?.after || potentialPerspectiveInfo?.before || '';

        await this.recalculateMessageView(true, false, false);
        await this.renderCurrentPerspective();
    }

    async goNextMessage() {
        await this.pendingPerspectiveUpdate;
        if (!this.nextConversation || !this.nextConversationMessage || !this.nextConversationMessageContent) return;

        this.currentConversationId = this.nextConversation.id;
        this.currentMessageId = this.nextConversationMessage.id;

        this.prevConversation = this.currentConversation;
        this.prevConversationMessage = this.currentConversationMessage;
        this.prevConversationMessageContentIndex = this.currentConversationMessageContentIndex;
        this.prevConversationMessageContent = this.currentConversationMessageContent;

        this.currentConversation = this.nextConversation;
        this.currentConversationMessage = this.nextConversationMessage;
        this.currentConversationMessageContentIndex = this.nextConversationMessageContentIndex;
        this.currentConversationMessageContent = this.nextConversationMessageContent;

        const potentialPerspectiveInfo = this.currentConversationMessage?.perspectiveByCharacterId?.[this.currentUserId];
        this.currentPerspectiveId = potentialPerspectiveInfo?.after || potentialPerspectiveInfo?.before || '';

        await this.recalculateMessageView(false, false, true);
        await this.renderCurrentPerspective();
    }

    async connectedCallback() {
        this.lifecycle++;
        this.currentPerspective = null;
        this.loadedPerspectiveId = '';
        this.controller?.abort();
        this.unsubscribe?.();
        this.currentUserId = this.getAttribute('initial-user-id') || '';
        this.currentConversationId = this.getAttribute('initial-conversation-id') || '';
        this.currentMessageId = this.getAttribute('initial-message-id') || '';
        this.currentPerspectiveId = this.getAttribute('initial-perspective-id') || '';
        
        this.root.innerHTML = `
            <link rel="stylesheet" href="${new URL('./view.css', import.meta.url).href}">
            <div class="container" inert style="visibility: hidden">
                <app-game-background></app-game-background>
                <div class="sidebar">
                    <div class="toolbar">
                        <app-game-menu></app-game-menu>
                        <button class="items-toggle glass" type="button" aria-haspopup="dialog" aria-expanded="false" id="surroundings">Surroundings <kbd>Tab</kbd></button>
                    </div>
                    <app-game-stats></app-game-stats>
                </div>
                <app-game-character-surrounding-view></app-game-character-surrounding-view>
                <div class="story">
                    <app-game-message-view></app-game-message-view>
                </div>
            </div>
            <app-game-items-overlay></app-game-items-overlay>
            <div class="black-overlay" style="position:absolute;inset:0;background:#000;z-index:1000" aria-hidden="true"></div>`;
        const button = /** @type {HTMLButtonElement} */ (this.root.querySelector('.items-toggle'));
        const overlay = /** @type {import('./view/items-overlay.js').ItemsOverlay} */ (this.root.querySelector('app-game-items-overlay'));
        button.addEventListener('click', () => overlay.show());
        overlay.addEventListener('toggle', () => {
            button.setAttribute('aria-expanded', String(overlay.open));
            const container = /** @type {HTMLElement} */ (this.root.querySelector('.container'));
            container.inert = !this.currentPerspective || overlay.open;
        });
        this.controller = new AbortController();
        button.addEventListener("mouseenter", () => playHoverSound());
        window.addEventListener('keydown', event => {
            if (!this.currentPerspective || event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || document.querySelector('app-dialog')) return;
            if (event.key === 'Tab' && !event.shiftKey) {
                event.preventDefault();
                if (overlay.open) overlay.close();
                else overlay.show();
            }
        }, { signal: this.controller.signal });

        this.unsubscribe = window.ENGINE_WORKER_CLIENT.addDEObjectUpdatedListener(() => { void this.updatePerspective(); });
        void this.updatePerspective();
    }

    /** Serialize engine notifications so an older message query cannot win a race. */
    async updatePerspective() {
        this.perspectiveUpdateQueued = true;
        if (this.pendingPerspectiveUpdate) return this.pendingPerspectiveUpdate;
        const lifecycle = this.lifecycle;
        this.pendingPerspectiveUpdate = (async () => {
            while (this.perspectiveUpdateQueued && this.isConnected && lifecycle === this.lifecycle) {
                this.perspectiveUpdateQueued = false;
                try {
                    await this.recalculateMessageView(true, true, true);
                    if (!this.isConnected || lifecycle !== this.lifecycle) return;
                    if (!this.perspectiveUpdateQueued) await this.renderCurrentPerspective();
                } catch (error) {
                    console.error('Failed to update perspective:', error);
                }
            }
        })();
        try { await this.pendingPerspectiveUpdate; }
        finally {
            this.pendingPerspectiveUpdate = null;
            if (this.perspectiveUpdateQueued && this.isConnected) void this.updatePerspective();
        }
    }

    async renderCurrentPerspective() {
        const id = this.currentPerspectiveId;
        // A missing snapshot is retried even when the message's ID has not changed.
        if (this.currentPerspective && id === this.loadedPerspectiveId) return;
        const version = ++this.perspectiveVersion;
        const perspective = id ? await window.ENGINE_WORKER_CLIENT.queryDEObject({
            path: ['utils', 'characterInfo', 'getStoredPerspective'], call: [id],
        }) : null;
        if (!this.isConnected || version !== this.perspectiveVersion || id !== this.currentPerspectiveId) return;
        this.currentPerspective = perspective;
        this.loadedPerspectiveId = perspective ? id : '';
        const background = /** @type {import('./view/background.js').Background | null} */ (this.root.querySelector('app-game-background'));
        const surroundings = /** @type {import('./view/character-surrounding-view.js').CharacterSurroundingView | null} */ (this.root.querySelector('app-game-character-surrounding-view'));
        const stats = /** @type {import('./view/stats.js').Stats | null} */ (this.root.querySelector('app-game-stats'));
        const items = /** @type {import('./view/items-overlay.js').ItemsOverlay | null} */ (this.root.querySelector('app-game-items-overlay'));
        background?.updatePerspective(perspective);
        surroundings?.updatePerspective(perspective);
        stats?.updatePerspective(perspective);
        items?.updatePerspective(perspective);
        if (perspective) this.removePotentialBlackOverlay();
        else this.showBlackOverlay();
    }

    showBlackOverlay() {
        this.blackOverlayAnimation?.cancel();
        this.blackOverlayAnimation = null;
        const container = /** @type {HTMLElement | null} */ (this.root.querySelector('.container'));
        if (container) { container.inert = true; container.style.visibility = 'hidden'; }
        let overlay = this.root.querySelector('.black-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'black-overlay';
            overlay.setAttribute('aria-hidden', 'true');
            this.root.append(overlay);
        }
    }

    removePotentialBlackOverlay() {
        if (!this.currentPerspective) return;
        const container = /** @type {HTMLElement | null} */ (this.root.querySelector('.container'));
        const items = /** @type {import('./view/items-overlay.js').ItemsOverlay | null} */ (this.root.querySelector('app-game-items-overlay'));
        if (container) { container.style.visibility = ''; container.inert = !!items?.open; }
        const overlay = this.root.querySelector('.black-overlay');
        if (!overlay || this.blackOverlayAnimation) return;
        const animation = overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, easing: 'ease-out', fill: 'forwards' });
        this.blackOverlayAnimation = animation;
        animation.finished.then(() => {
            if (this.blackOverlayAnimation !== animation) return;
            overlay.remove();
            this.blackOverlayAnimation = null;
        }).catch(() => { /* Cancelled when perspective disappears or the view disconnects. */ });
    }

    disconnectedCallback() {
        this.lifecycle++;
        this.perspectiveVersion++;
        this.blackOverlayAnimation?.cancel();
        this.blackOverlayAnimation = null;
        this.controller?.abort();
        this.controller = null;
        this.unsubscribe?.();
        this.unsubscribe = null;
    }
}

customElements.define('app-game-view', GameView);
