import { sharedStyles, identifierLinkStyles } from './shared-styles.js';
import { createNarrationNodes } from './narration.js';
import { getPerspectiveIndex } from './perspective-data.js';
import { openIdentifierDialog } from './identifier-dialog.js';
import { emotionsGrouped } from '../../../../engine/util/emotions.js';
import '../../world-image.js';
import './tooltip.js';
import { startPlayTypingSound, stopPlayTypingSound } from '../../../sound.js';

/** One narration, dialogue or thought value, with a cancellable word-by-word reveal. */
export class MessageObject extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        this.root.innerHTML = `<style>
${sharedStyles}
${identifierLinkStyles}
:host { display: block; }
:host([hidden]), [hidden] { display: none !important; }
article { display: flex; align-items: flex-start; gap: 2vh; min-height: 14vh; }
article[data-type="thought"] { --accent: #b9d9ff; background: rgba(105, 160, 210, .09); }
.body { flex: 1; min-width: 0; }
.thought-label { display: inline-block; max-width: 100%; margin-bottom: .6vh; padding: .25vh .8vh; border: 1px solid rgba(150, 195, 235, .35); border-radius: .4vh; background: rgba(105, 160, 210, .14); font-size: 2vh; line-height: 1.4; color: #b9d9ff; overflow-wrap: anywhere; }
.speaker { width: 14vh; flex: 0 0 14vh; }
app-game-tooltip, app-world-image { display: block; width: 14vh; height: 14vh; }
.name { font-size: 2.2vh; margin-top: .6vh; color: var(--accent); overflow-wrap: anywhere; }
.text { flex: 1; min-width: 0; max-height: 28vh; overflow-y: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 2.5vh; line-height: 1.68; color: rgba(230, 240, 255, .93); letter-spacing: .012em; }
.text[data-type="narration"] { font-style: italic; color: #fff; letter-spacing: .04em; }
.text[data-type="thought"] { color: #c8def5; }
.aside { font-style: italic; color: rgba(255, 224, 165, .86); letter-spacing: .02em; }
.dialogue { font-style: normal; }
.em-dash { color: rgba(230, 240, 255, .7); font-style: normal; white-space: pre; }
.sound { display: inline-block; vertical-align: baseline; margin: 0 .3vh; padding: 0 1vh; border-radius: .5vh; background: rgba(255, 224, 165, .86); color: var(--ink, #eaf3ff); font-style: italic; font-weight: 800; }
.sound:empty { display: none; }
.identifier:empty { display: none; }
</style><article><div class="speaker" hidden>
<app-game-tooltip align-with="top"><app-world-image default-image="./images/default-profile.png" aria-hidden="true"></app-world-image></app-game-tooltip>
<div class="name"></div></div><div class="body"><div class="thought-label" hidden>Thinking...</div><div class="text" aria-label="Message"></div></div></article>`;
        this.text = /** @type {HTMLElement} */ (this.root.querySelector('.text'));
        /** @type {DECharacterPerspective | null} */
        this.currentPerspective = null;
        this.contentKey = '';
        this.speakerKey = '';
        this.timer = 0;
        this.cursor = 0;
        /** @type {{node: Text, word: string}[]} */
        this.words = [];
    }

    get streaming() { return this.cursor < this.words.length; }
    connectedCallback() { this.resume(); }
    disconnectedCallback() { this.pause(); }
    pause() { window.clearTimeout(this.timer); this.timer = 0; }

    /**
     * @param {DECharacterPerspective | null} perspective
     * @param {DEConversationMessage} message
     * @param {DEConversationMessageDialogue | DEConversationMessageNarration | DEConversationMessageThought} content
     * @param {string} selectionKey
     */
    updateMessage(perspective, message, content, selectionKey) {
        this.currentPerspective = perspective;
        const character = content.type !== 'narration' && perspective && message.characterId
            ? getPerspectiveIndex(perspective).characters.get(message.characterId) : null;
        // The message's primary emotion is stored as `emotion`. Use the same
        // related-emotion order as the old renderer before falling back to neutral.
        const emotion = message.emotion || 'neutral';
        const relatedEmotions = Object.values(emotionsGrouped).find(group => group.includes(emotion)) || [];
        const assets = character?.characterMetadata.assets;
        const image = [emotion, ...relatedEmotions, 'neutral'].map(key => assets?.[key]).find(Boolean) || '';
        const speaker = {
            visible: content.type !== 'narration', id: character?.characterId || '',
            name: character?.characterNameSimple || 'Unknown speaker',
            description: character?.characterExternalDescriptionForUser || '',
            image,
        };
        const speakerKey = JSON.stringify(speaker);
        if (speakerKey !== this.speakerKey) {
            this.speakerKey = speakerKey;
            const panel = /** @type {HTMLElement} */ (this.root.querySelector('.speaker'));
            panel.hidden = !speaker.visible;
            const tooltip = /** @type {HTMLElement} */ (this.root.querySelector('app-game-tooltip'));
            tooltip.setAttribute('aria-label', speaker.name);
            tooltip.setAttribute('text', speaker.description);
            for (const [name, value] of Object.entries({
                'identifier-id': speaker.id, 'found-as': 'single-character',
                'tabindex': '0', 'role': 'button', 'aria-haspopup': 'dialog',
            })) {
                if (speaker.id) tooltip.setAttribute(name, value);
                else tooltip.removeAttribute(name);
            }
            this.root.querySelector('app-world-image')?.setAttribute('image-url', speaker.image);
            const name = /** @type {HTMLElement} */ (this.root.querySelector('.name'));
            name.textContent = speaker.name;
        }
        // Snapshot rendered values, never retain object identity or processing metadata.
        const narrationKey = (/** @type {DEConversationMessageNarrationFragment[]} */ fragments) =>
            fragments.map(fragment => typeof fragment === 'string' ? fragment
                : [fragment.text, fragment.identifiers, fragment.foundAs]);
        const renderedFragments = content.type !== 'dialogue' ? narrationKey(content.fragments)
            : content.fragments.map(fragment => [fragment.type,
                fragment.type === 'sound' ? fragment.text : narrationKey(fragment.fragments)]);
        const key = JSON.stringify([selectionKey, content.type, renderedFragments]);
        if (key === this.contentKey) { this.resume(); return; }
        this.contentKey = key;
        this.pause();
        this.text.replaceChildren();
        const article = /** @type {HTMLElement} */ (this.root.querySelector('article'));
        article.dataset.type = content.type;
        const thoughtLabel = /** @type {HTMLElement} */ (this.root.querySelector('.thought-label'));
        thoughtLabel.hidden = content.type !== 'thought';
        this.text.setAttribute('aria-label', content.type === 'thought' ? 'Thought' : 'Message');
        this.text.dataset.type = content.type;
        this.text.scrollTop = 0;
        const onIdentifier = (/** @type {string} */ id, /** @type {DEConversationMessageFragmentIdentifier['foundAs']} */ foundAs) =>
            openIdentifierDialog(id, foundAs, this, this.currentPerspective);
        if (content.type !== 'dialogue') {
            this.text.append(...createNarrationNodes(content.fragments, onIdentifier));
        } else {
            let previousText = '';
            let previousMode = '';
            for (const fragment of content.fragments) {
                const span = document.createElement('span');
                span.className = fragment.type === 'narration' ? 'aside' : fragment.type;
                if (fragment.type === 'sound') span.textContent = fragment.text;
                else span.append(...createNarrationNodes(fragment.fragments, onIdentifier));
                const text = span.textContent || '';
                if (!text.trim()) continue;
                // Sounds belong to the spoken run. Outer blocks supply no spacing;
                // inner text/identifier fragments already contain their own spacing.
                const mode = fragment.type === 'narration' ? 'narration' : 'dialogue';
                if (previousText) {
                    const before = /\s$/u.test(previousText) ? '' : ' ';
                    if (previousMode !== mode) {
                        const dash = document.createElement('span');
                        dash.className = 'em-dash';
                        dash.textContent = `${before}\u2014${/^\s/u.test(text) ? '' : ' '}`;
                        this.text.append(dash);
                    } else if (before && !/^\s/u.test(text)) {
                        this.text.append(document.createTextNode(' '));
                    }
                }
                this.text.append(span);
                previousText = text;
                previousMode = mode;
            }
        }
        this.words = [];
        this.cursor = 0;
        const walker = document.createTreeWalker(this.text, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            const textNode = /** @type {Text} */ (node);
            for (const word of textNode.data.match(/\s*\S+\s*|\s+/gu) || []) this.words.push({ node: textNode, word });
            textNode.data = '';
        }
        this.text.querySelectorAll('.identifier').forEach(link => { /** @type {HTMLElement} */ (link).tabIndex = -1; });
        this.notify();
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) this.finish();
        else this.resume();
    }

    resume() {
        if (!this.isConnected || this.timer || !this.streaming) return;
        startPlayTypingSound();
        this.timer = window.setTimeout(() => {
            this.timer = 0;
            this.revealWord();
            if (this.streaming) this.resume();
            else { stopPlayTypingSound(); this.notify(); }
        }, 65);
    }

    revealWord() {
        const word = this.words[this.cursor++];
        if (!word) return;
        const atBottom = this.text.scrollTop + this.text.clientHeight >= this.text.scrollHeight - 4;
        word.node.appendData(word.word);
        const link = word.node.parentElement?.closest('.identifier');
        if (link instanceof HTMLElement) link.tabIndex = 0;
        if (atBottom) this.text.scrollTop = this.text.scrollHeight;
    }

    finish() {
        this.pause();
        const atBottom = this.text.scrollTop + this.text.clientHeight >= this.text.scrollHeight - 4;
        while (this.streaming) {
            const { node, word } = this.words[this.cursor++];
            node.appendData(word);
        }
        this.text.querySelectorAll('.identifier').forEach(link => { /** @type {HTMLElement} */ (link).tabIndex = 0; });
        if (atBottom) this.text.scrollTop = this.text.scrollHeight;
        this.notify();
        stopPlayTypingSound();
    }

    notify() { this.dispatchEvent(new Event('stream-change')); }
}
customElements.define('app-game-message-object', MessageObject);
