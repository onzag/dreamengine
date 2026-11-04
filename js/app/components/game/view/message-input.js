import { sharedStyles } from './shared-styles.js';
import '../../world-image.js';
import './tooltip.js';

/** Drafts survive history navigation; only an accepted submission clears them. */
export class MessageInput extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        this.root.innerHTML = `<style>
${sharedStyles}
:host { display: block; }
:host([hidden]), [hidden] { display: none !important; }
.turn { display: flex; gap: 2vh; align-items: flex-start; min-height: 14vh; }
.user { width: 14vh; flex: 0 0 14vh; font-size: 2.2vh; color: var(--accent); overflow-wrap: anywhere; }
app-game-tooltip { display: block; width: 14vh; height: 14vh; margin-bottom: .6vh; }
app-world-image { display: block; width: 14vh; height: 14vh; }
.body { flex: 1; min-width: 0; }
label { display: block; margin-bottom: .8vh; font-size: 2.2vh; }
textarea { display: block; resize: vertical; width: 100%; min-height: 10vh; max-height: 25vh; padding: 1vh; font: inherit; font-size: 2.5vh; line-height: 1.55; color: var(--ink); background: #09192b99; border: 1px solid var(--border, #c9e2ff); border-radius: .5vh; }
.submitted { white-space: pre-wrap; font-size: 2.5vh; line-height: 1.55; overflow-wrap: anywhere; max-height: 28vh; overflow-y: auto; }
</style><div class="turn"><div class="user"><app-game-tooltip align-with="top"><app-world-image default-image="./images/default-profile.png" aria-hidden="true"></app-world-image></app-game-tooltip><span class="name"></span></div>
<div class="body"><form><label for="reply">Player's Turn</label><textarea id="reply" placeholder="Dialogue or action\u2026" aria-label="Player's message"></textarea></form><div class="submitted" hidden></div></div></div>`;
        this.textarea = /** @type {HTMLTextAreaElement} */ (this.root.querySelector('textarea'));
        this.form = /** @type {HTMLFormElement} */ (this.root.querySelector('form'));
        this.submitted = /** @type {HTMLElement} */ (this.root.querySelector('.submitted'));
        /** @type {Map<string, string>} */
        this.drafts = new Map();
        this.draftKey = '';
        this.userKey = '';
        /** @type {DECharacterPerspective | null} */
        this.currentPerspective = null;
        this.enabled = false;
        this.form.addEventListener('submit', event => { event.preventDefault(); this.submit(); });
        this.textarea.addEventListener('input', () => {
            this.drafts.set(this.draftKey, this.textarea.value);
            this.setEnabled(this.enabled);
            this.dispatchEvent(new Event('draft-change'));
        });
        this.textarea.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
                event.preventDefault();
                event.stopPropagation();
                if (!event.repeat) this.submit();
            }
        });
    }

    /** @param {DECharacterPerspective | null} perspective @param {string} draftKey */
    updateUser(perspective, draftKey) {
        this.currentPerspective = perspective;
        if (this.draftKey !== draftKey) {
            this.draftKey = draftKey;
            this.textarea.value = this.drafts.get(draftKey) || '';
        }
        if (this.form.hidden) this.form.hidden = false;
        if (!this.submitted.hidden) this.submitted.hidden = true;
        const name = perspective?.ownName || perspective?.self.characterNameSimple || 'Player';
        const image = perspective?.self.characterMetadata.assets?.neutral || '';
        const id = perspective?.self.characterId || '';
        const description = perspective?.self.characterExternalDescription || '';
        const key = JSON.stringify([name, image, id, description]);
        if (key === this.userKey) return;
        this.userKey = key;
        const label = /** @type {HTMLElement} */ (this.root.querySelector('.name'));
        label.textContent = name;
        const turn = /** @type {HTMLElement} */ (this.root.querySelector('label'));
        turn.textContent = `${name}'s Turn`;
        this.textarea.setAttribute('aria-label', `${name}'s message`);
        const tooltip = /** @type {HTMLElement} */ (this.root.querySelector('app-game-tooltip'));
        tooltip.setAttribute('aria-label', name);
        tooltip.setAttribute('text', description);
        for (const [attribute, value] of Object.entries({
            'identifier-id': id, 'found-as': 'character',
            'tabindex': '0', 'role': 'button', 'aria-haspopup': 'dialog',
        })) {
            if (id) tooltip.setAttribute(attribute, value);
            else tooltip.removeAttribute(attribute);
        }
        this.root.querySelector('app-world-image')?.setAttribute('image-url', image);
    }

    /** @param {boolean} enabled */
    setEnabled(enabled) {
        this.enabled = enabled;
        this.textarea.disabled = !enabled;
    }

    get canSubmit() { return this.enabled && !!this.textarea.value.trim(); }

    focusInput() { this.textarea.focus(); }

    submit() {
        const text = this.textarea.value.trim();
        if (!this.enabled || !text) return;
        this.dispatchEvent(new CustomEvent('message-submit', { detail: text }));
    }

    /** @param {string} text */
    accept(text) {
        this.drafts.delete(this.draftKey);
        this.textarea.value = '';
        this.setEnabled(false);
        this.form.hidden = true;
        this.submitted.textContent = text;
        this.submitted.hidden = false;
    }
}
customElements.define('app-game-message-input', MessageInput);
