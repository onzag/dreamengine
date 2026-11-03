import './view/background.js';
import './view/stats.js';
import './view/character-surrounding-view.js';
import './view/message-view.js';
import './view/items-overlay.js';
import './view/menu.js';
import { playHoverSound } from '../../sound.js';

/** Presentation shell. Engine turns and live data will be connected later. */
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

                if (nextValue) {
                    this.nextConversation = nextValue.conversation || null;
                    this.nextConversationMessage = nextValue.message || null;
                    this.nextConversationMessageContent = nextValue.message?.content?.[0] || null;
                    this.nextConversationMessageContentIndex = 0;
                }
            }

            if (recalculatePrev) {
                const prevValue =
                    await window.ENGINE_WORKER_CLIENT.queryDEObject({ path: ['utils', 'conversations', 'getPreviousConversationAndMessageForCharacter'], call: [this.currentUserId, this.currentConversationId, this.currentMessageId] });

                if (prevValue) {
                    this.prevConversation = prevValue.conversation || null;
                    this.prevConversationMessage = prevValue.message || null;
                    this.prevConversationMessageContentIndex = prevValue.message?.content?.length - 1 || -1;
                    this.prevConversationMessageContent = prevValue.message?.content?.[this.prevConversationMessageContentIndex] || null;
                }
            }
        }
    }
    
    async goPrevMessage() {
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
    }

    async goNextMessage() {
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
    }

    async connectedCallback() {
        this.currentUserId = this.getAttribute('initial-user-id') || '';
        this.currentConversationId = this.getAttribute('initial-conversation-id') || '';
        this.currentMessageId = this.getAttribute('initial-message-id') || '';
        this.currentPerspectiveId = this.getAttribute('initial-perspective-id') || '';
        
        this.root.innerHTML = `
            <link rel="stylesheet" href="${new URL('./view.css', import.meta.url).href}">
            <div class="container">
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
            <app-game-items-overlay></app-game-items-overlay>`;
        const button = /** @type {HTMLButtonElement} */ (this.root.querySelector('.items-toggle'));
        const overlay = /** @type {import('./view/items-overlay.js').ItemsOverlay} */ (this.root.querySelector('app-game-items-overlay'));
        button.addEventListener('click', () => overlay.show());
        overlay.addEventListener('toggle', () => {
            button.setAttribute('aria-expanded', String(overlay.open));
            const container = /** @type {HTMLElement} */ (this.root.querySelector('.container'));
            container.inert = overlay.open;
        });
        this.controller = new AbortController();
        button.addEventListener("mouseenter", () => playHoverSound());
        window.addEventListener('keydown', event => {
            if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || document.querySelector('app-dialog')) return;
            if (event.key === 'Tab' && !event.shiftKey) {
                event.preventDefault();
                if (overlay.open) overlay.close();
                else overlay.show();
            }
        }, { signal: this.controller.signal });

        this.unsubscribe = window.ENGINE_WORKER_CLIENT.addDEObjectUpdatedListener(() => { void this.updatePerspective(); });
        void this.updatePerspective();
    }

    async updatePerspective() {
        try {
            const perspectiveId = this.currentPerspectiveId;
            await this.recalculateMessageView(true, true, true);
            console.log(this.currentPerspectiveId);
            if (perspectiveId !== this.currentPerspectiveId) {
                this.currentPerspective = await window.ENGINE_WORKER_CLIENT.queryDEObject({ path: ['utils', 'characterInfo', 'getStoredPerspective'], call: [this.currentPerspectiveId] });
                document.querySelector("app-game-background").updatePerspective(this.currentPerspective);
                document.querySelector("app-game-character-surrounding-view").updatePerspective(this.currentPerspective);
                document.querySelector("app-game-stats").updatePerspective(this.currentPerspective);
            }
            console.log(this.currentConversation);
        } catch (error) {
            // TODO make the error visual
            console.error('Failed to update perspective:', error);
        }
    }

    disconnectedCallback() {
        this.controller?.abort();
        this.controller = null;
        this.unsubscribe?.();
        this.unsubscribe = null;
    }
}

customElements.define('app-game-view', GameView);
