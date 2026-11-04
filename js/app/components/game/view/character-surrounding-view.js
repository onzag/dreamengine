import { sharedStyles, identifierLinkStyles, characterTagStyles } from './shared-styles.js';
import '../../world-image.js';
import './tooltip.js';
import { createNarrationNodes } from './narration.js';
import { openIdentifierDialog } from './identifier-dialog.js';
import { buildSurroundingGroups } from './surrounding-groups.js';
import { parsePerspectiveNarration } from './perspective-data.js';
import { createCharacterTags } from './character-tags.js';

/** @typedef {import('./surrounding-groups.js').SurroundingCharacter} SurroundingCharacter */
/** @typedef {import('./surrounding-groups.js').SurroundingGroup} SurroundingGroup */
/** @typedef {{location: string, locationName: string, blindness: DECharacterPerspective['ownCharacterBlindness'], notice: string, groups: SurroundingGroup[]}} SurroundingsDisplayData */

export class CharacterSurroundingView extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        this.lifecycle = 0;
        /** @type {DECharacterPerspective | null} */
        this.currentPerspective = null;
        /** @type {Map<string, {element: HTMLElement, placement: string, primary: boolean}>} */
        this.cards = new Map();
        /** @type {Set<Animation>} */
        this.animations = new Set();
        /** @type {SurroundingsDisplayData|null} */
        this.pending = null;
        this.rendering = false;
    }

    connectedCallback() {
        this.lifecycle++;
        this.root.innerHTML = `<style>
${sharedStyles}
${identifierLinkStyles}
${characterTagStyles}
:host { display: block; min-width: 0; min-height: 0; }
.scene { height: 100%; min-width: 0; overflow-y: auto; overflow-x: hidden; overflow-wrap: anywhere; overscroll-behavior: contain; background: transparent; }
.groups { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 2vh; min-width: 0; }
.group { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 1.5vh; max-width: 100%; min-width: 0; padding: 2vh; border: .15vh solid var(--border); background: rgba(12, 26, 42, .24); }
.group.primary { flex-basis: 100%; border-color: var(--accent); background: rgba(20, 43, 65, .3); }
.group-title { flex-basis: 100%; margin: 0 0 .3vh; color: var(--accent); font-size: 2.2vh; font-weight: 600; line-height: 1.3; }
.surroundings-heading { display: flex; align-items: center; gap: 1.2vh; flex-basis: 100%; min-width: 0; margin: .5vh 0 0; color: var(--muted); font-size: 2vh; font-weight: 500; line-height: 1.35; }
.surroundings-heading::after { content: ''; flex: 1; min-width: 2vh; height: .15vh; background: var(--border); }
.group.solo:not(.primary) { border-color: transparent; background: transparent; }
.character { width: 9vh; max-width: 100%; min-width: 0; margin: 0; color: var(--ink); }
.primary .character { width: 13vh; }
.portrait-tooltip { display: block; width: 100%; aspect-ratio: 1; }
.portrait-tooltip:focus-visible { outline: .2vh solid var(--accent); outline-offset: .3vh; }
app-world-image { --asset-image-border-width: .2vh; display: block; width: 100%; height: auto; aspect-ratio: 1; }
/* Filter the portrait inside its clipped frame, leaving borders and labels sharp. */
.groups { --portrait-blur: 0vh; }
.groups[data-blindness="partial-good"] { --portrait-blur: .45vh; }
.groups[data-blindness="partial-bad"] { --portrait-blur: 1.2vh; }
.groups[data-blindness="full"] { --portrait-blur: 3vh; }
app-world-image::part(asset-image) { filter: blur(var(--portrait-blur)); }
figcaption { margin-top: .6vh; line-height: 1.25; }
.name { display: block; font-size: 1.8vh; }
.primary .name { font-size: 2.2vh; }
.position { display: block; margin-top: .3vh; min-height: 2vh; color: var(--muted); font-size: 2vh; }
.communicator { display: block; margin-top: .4vh; color: var(--accent); font-size: 1.5vh; }
.character.remote .portrait-tooltip { outline: .15vh dashed var(--accent); outline-offset: .3vh; }
.character.remote .portrait-tooltip:focus-visible { outline-style: solid; outline-width: .2vh; }
.name:empty, .position:empty, .communicator:empty { display: none; }
.blindness-notice { margin: 1.5vh 0 0; padding: 1vh 1.4vh; border-left: .2vh solid var(--border); color: var(--muted); font-size: 2vh; line-height: 1.45; }

.character-tags { margin-top: .5vh; }
.character-tags:empty { display: none; }
.character-tags .information-chip, .character-tags .state-chip { min-height: 2.8vh; padding: 1vh 2vh; font-size: 2vh; }
            </style>
            <section class="scene" aria-label="Characters in the scene"><div class="groups"></div><p class="blindness-notice" role="status" hidden></p></section>`;
        this.cards.clear();
        this.rendering = false;
        this.updatePerspective(this.currentPerspective);
    }

    disconnectedCallback() {
        this.lifecycle++;
        this.pending = null;
        for (const animation of this.animations) animation.cancel();
        this.animations.clear();
    }

    /** @param {DECharacterPerspective | null} perspective */
    updatePerspective(perspective) {
        this.currentPerspective = perspective;
        if (!perspective) {
            this.lifecycle++;
            this.pending = null;
            this.rendering = false;
            for (const animation of this.animations) animation.cancel();
            this.animations.clear();
            this.cards.clear();
            this.root.querySelector('.groups')?.replaceChildren();
            const notice = this.root.querySelector('.blindness-notice');
            if (notice instanceof HTMLElement) notice.hidden = true;
            return;
        }
        const groups = buildSurroundingGroups(perspective);
        this.setDisplayData({
            location: perspective.ownLocationId, locationName: perspective.ownLocationName,
            blindness: perspective.ownCharacterBlindness, groups,
            notice: perspective.socialGroups.characterListsAreUnclear ||
                (groups.length ? '' : 'There are no other characters at ' + perspective.ownLocationName + '.'),
        });
    }

    /** Queue the latest engine snapshot for the animation pipeline.
     * @param {SurroundingsDisplayData} data
     */
    setDisplayData(data) {
        this.pending = data;
        if (this.isConnected && !this.rendering) void this.drain();
    }

    async drain() {
        const lifecycle = this.lifecycle;
        this.rendering = true;
        try {
            while (this.pending && this.isConnected && lifecycle === this.lifecycle) {
                const data = this.pending;
                this.pending = null;
                await this.reconcile(data, lifecycle);
            }
        } finally {
            if (lifecycle === this.lifecycle) this.rendering = false;
        }
    }

    /** @param {HTMLElement} element @param {Keyframe[]} frames @returns {Promise<void>} */
    async animateCard(element, frames) {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const animation = element.animate(frames, { duration: 230, easing: 'ease-out' });
        this.animations.add(animation);
        try { await animation.finished; } catch { /* Cancelled on disconnect. */ }
        finally { this.animations.delete(animation); }
    }

    /** Future audio integration can listen for this event and check `primary`.
     * @param {'enter'|'exit'} phase @param {string} characterId @param {boolean} primary
     */
    notifyTransition(phase, characterId, primary) {
        this.dispatchEvent(new CustomEvent('scene-character-transition', {
            bubbles: true, composed: true, detail: { phase, characterId, primary },
        }));
    }

    /** @param {HTMLElement} element @param {string} text @param {number} lifecycle */
    async renderPosition(element, text, lifecycle) {
        try {
            const fragments = await parsePerspectiveNarration(text);
            if (!element.isConnected || lifecycle !== this.lifecycle || element.dataset.narration !== text) return;
            element.replaceChildren(...createNarrationNodes(fragments, (id, foundAs) => {
                const trigger = this.root.activeElement;
                openIdentifierDialog(id, foundAs, trigger instanceof HTMLElement ? trigger : this, this.currentPerspective);
            }));
        } catch (error) {
            if (element.isConnected && lifecycle === this.lifecycle) console.warn('Unable to parse character position', error);
        }
    }

    /** @param {SurroundingsDisplayData} data @param {number} lifecycle */
    async reconcile(data, lifecycle) {
        const container = this.root.querySelector('.groups');
        if (!container) return;
        container.setAttribute('data-blindness', data.blindness);
        /** @type {Map<string, {character: SurroundingCharacter, group: SurroundingGroup, placement: string}>} */
        const desired = new Map();
        // Keep at most one portrait per character while groups change.
        const groups = data.groups;
        for (const group of groups) for (const character of group.characters) {
            if (!desired.has(character.id)) desired.set(character.id, {
                character, group, placement: JSON.stringify([data.location, group.id, character.locationSlot]),
            });
        }
        const oldRects = new Map([...this.cards].map(([id, card]) => [id, card.element.getBoundingClientRect()]));
        // Complete every exit before mounting any incoming or relocated card.
        await Promise.all([...this.cards].map(async ([id, card]) => {
            if (desired.get(id)?.placement === card.placement) return;
            this.notifyTransition('exit', id, card.primary);
            await this.animateCard(card.element, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'translateY(-1vh) scale(.94)' }]);
            if (lifecycle !== this.lifecycle) return;
            card.element.remove();
            this.cards.delete(id);
        }));
        if (!this.isConnected || lifecycle !== this.lifecycle || this.pending) return;

        const notice = this.root.querySelector('.blindness-notice');
        if (notice instanceof HTMLElement) {
            notice.hidden = !data.notice;
            notice.textContent = data.notice;
        }

        /** @type {Map<string, HTMLElement>} */
        const existingGroups = new Map();
        for (const element of container.children) {
            if (element instanceof HTMLElement && element.dataset.groupId) {
                existingGroups.set(element.dataset.groupId, element);
            }
        }
        /** @type {Set<string>} */
        const activeGroups = new Set();
        /** @type {Set<string>} */
        const entering = new Set();
        const hasCurrentGroup = groups.some(group => group.primary);
        let separator = container.querySelector('.surroundings-heading');
        if (groups.some(group => !group.primary)) {
            if (!separator) {
                separator = document.createElement('h2');
                separator.className = 'surroundings-heading';
            }
            separator.textContent = hasCurrentGroup ? 'Other surrounding characters' : 'Surrounding Characters';
        } else {
            separator?.remove();
            separator = null;
        }
        let groupIndex = 0;
        let separatorPlaced = false;
        for (const group of groups) {
            const members = group.characters.filter(c => desired.get(c.id)?.group === group);
            if (!members.length) continue;
            activeGroups.add(group.id);
            let groupElement = existingGroups.get(group.id);
            if (!groupElement) {
                groupElement = document.createElement('div');
                groupElement.className = 'group';
                groupElement.setAttribute('role', 'group');
                groupElement.dataset.groupId = group.id;
            }
            groupElement.classList.toggle('primary', group.primary);
            groupElement.classList.toggle('solo', members.length === 1);
            groupElement.setAttribute('aria-label', group.primary ? 'Current group' : members.length === 1 ? 'Individual character' : 'Conversation group');
            let title = groupElement.querySelector('.group-title');
            if (group.primary) {
                if (!title) {
                    title = document.createElement('h2');
                    title.className = 'group-title';
                    title.textContent = 'Current group';
                    groupElement.prepend(title);
                }
            } else title?.remove();
            if (!group.primary && separator && !separatorPlaced) {
                if (container.children[groupIndex] !== separator) container.insertBefore(separator, container.children[groupIndex] || null);
                groupIndex++;
                separatorPlaced = true;
            }
            // Move existing nodes only when necessary, preserving image state.
            if (container.children[groupIndex] !== groupElement) container.insertBefore(groupElement, container.children[groupIndex] || null);
            groupIndex++;
            for (const [index, character] of members.entries()) {
                const target = desired.get(character.id);
                if (!target) continue;
                let card = this.cards.get(character.id);
                if (!card) {
                    const element = document.createElement('figure');
                    element.className = 'character';
                    element.dataset.characterId = character.id;
                    element.innerHTML = '<app-game-tooltip class="portrait-tooltip" align-with="bottom" tabindex="0"><app-world-image no-transition="true" default-image="./images/default-profile.png" aria-hidden="true"></app-world-image></app-game-tooltip><figcaption><span class="name"></span><span class="position"></span><div class="character-tags"></div></figcaption>';
                    card = { element, placement: target.placement, primary: group.primary };
                    this.cards.set(character.id, card);
                    entering.add(character.id);
                }
                card.primary = group.primary;
                const name = card.element.querySelector('.name');
                const position = card.element.querySelector('.position');
                if (name) name.textContent = character.name;
                if (position instanceof HTMLElement) {
                    if (position.dataset.narration !== character.positionDescription) {
                        position.dataset.narration = character.positionDescription;
                        position.textContent = character.positionDescription;
                        void this.renderPosition(position, character.positionDescription, lifecycle);
                    }
                }
                const tags = card.element.querySelector('.character-tags');
                if (tags instanceof HTMLElement) {
                    // Internal traits stay private to the detailed views; the scene shows outward states only.
                    const visibleStates = character.states.filter(state => state.type !== 'INTERNAL');
                    const key = JSON.stringify(visibleStates);
                    if (tags.dataset.states !== key) {
                        tags.replaceChildren(...createCharacterTags(visibleStates));
                        tags.dataset.states = key;
                    }
                }
                const tooltip = card.element.querySelector('.portrait-tooltip');
                if (tooltip) {
                    tooltip.setAttribute('text', character.externalDescription);
                    tooltip.setAttribute('aria-label', character.name || 'Character description');
                    tooltip.setAttribute('identifier-id', character.id);
                    tooltip.setAttribute('found-as', 'single-character');
                    tooltip.setAttribute('role', 'button');
                    tooltip.setAttribute('aria-haspopup', 'dialog');
                }
                const image = card.element.querySelector('app-world-image');
                if (image && image.getAttribute('image-url') !== character.image) image.setAttribute('image-url', character.image);
                const cardIndex = index + (group.primary ? 1 : 0);
                if (groupElement.children[cardIndex] !== card.element) groupElement.insertBefore(card.element, groupElement.children[cardIndex] || null);
            }
        }
        for (const [id, element] of existingGroups) if (!activeGroups.has(id)) element.remove();
        await Promise.all([...this.cards].map(([id, card]) => {
            if (entering.has(id)) {
                this.notifyTransition('enter', id, card.primary);
                return this.animateCard(card.element, [{ opacity: 0, transform: 'translateY(1vh) scale(.94)' }, { opacity: 1, transform: 'none' }]);
            }
            const before = oldRects.get(id);
            const after = card.element.getBoundingClientRect();
            if (before && (before.left !== after.left || before.top !== after.top)) {
                return this.animateCard(card.element, [{ transform: `translate(${before.left - after.left}px, ${before.top - after.top}px)` }, { transform: 'none' }]);
            }
        }));
    }
}
customElements.define('app-game-character-surrounding-view', CharacterSurroundingView);
