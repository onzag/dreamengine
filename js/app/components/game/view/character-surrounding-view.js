import '../../world-image.js';
import { buildSurroundingGroups, getVisibleSurroundingGroups } from './surrounding-groups.js';
import { createSurroundingsTestStates } from './surroundings-test-data.js';
export { createSurroundingsTestStates } from './surroundings-test-data.js';

/** @typedef {import('./surrounding-groups.js').SurroundingCharacter} SurroundingCharacter */
/** @typedef {import('./surrounding-groups.js').SurroundingGroup} SurroundingGroup */
/** @typedef {{location: string, userId: string, groups: SurroundingGroup[]}} SurroundingsDisplayData */
/** @typedef {import('./surroundings-test-data.js').SurroundingsSceneState} SurroundingsSceneState */

/** Live scene groups, with serialized exits/entries and independently scrolling content. */
export class CharacterSurroundingView extends HTMLElement {
    static get observedAttributes() { return ['demo']; }

    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        this.queryVersion = 0;
        this.lifecycle = 0;
        /** @type {null | (() => void)} */
        this.unsubscribe = null;
        /** @type {Map<string, {element: HTMLElement, placement: string, primary: boolean}>} */
        this.cards = new Map();
        /** @type {Set<Animation>} */
        this.animations = new Set();
        /** @type {SurroundingsDisplayData|null} */
        this.pending = null;
        this.rendering = false;
        /** @type {SurroundingsSceneState|null} */
        this.testState = null;
        this.demoSteps = createSurroundingsTestStates();
        this.demoStep = -1;
        /** @type {number|undefined} */
        this.demoTimer = undefined;
    }

    connectedCallback() {
        this.lifecycle++;
        this.root.innerHTML = `<link rel="stylesheet" href="${new URL('./character-surrounding-view.css', import.meta.url).href}">
            <section class="scene" aria-label="Characters in the scene"><div class="groups"></div></section>`;
        this.cards.clear();
        this.rendering = false;
        this.subscribeToLiveUpdates();
        void this.refresh();
        this.scheduleDemoStep();
    }

    /**
     * @param {string} name
     * @param {string|null} oldValue
     * @param {string|null} newValue
     */
    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return;
        if (newValue !== null) this.startDemo();
        else this.stopDemo();
    }

    subscribeToLiveUpdates() {
        this.unsubscribe?.();
        this.unsubscribe = null;
        if (this.isConnected && !this.testState) {
            this.unsubscribe = window.ENGINE_WORKER_CLIENT?.addDEObjectUpdatedListener(() => { void this.refresh(); }) || null;
        }
    }

    /** Opt in with `<app-game-character-surrounding-view demo>` or `view.startDemo()`.
     * The `demo` attribute advances every five seconds while connected.
     * Without the attribute, call `view.nextDemoStep()` to advance manually.
     * @returns {string} Description of the active demo step.
     */
    startDemo() {
        this.demoSteps = createSurroundingsTestStates();
        this.demoStep = -1;
        return this.nextDemoStep();
    }

    /** @returns {string} Description of the active demo step. */
    nextDemoStep() {
        this.demoStep = (this.demoStep + 1) % this.demoSteps.length;
        const step = this.demoSteps[this.demoStep];
        this.setTestState(step.state);
        this.scheduleDemoStep();
        return step.label;
    }

    /** Reset the automatic advance timer; never run it on a detached element. */
    scheduleDemoStep() {
        window.clearTimeout(this.demoTimer);
        this.demoTimer = undefined;
        if (this.isConnected && this.hasAttribute('demo')) {
            this.demoTimer = window.setTimeout(() => this.nextDemoStep(), 5000);
        }
    }

    /** Inject a full snapshot or edit a copy of the current test snapshot.
     * Both paths run refresh -> buildSurroundingGroups -> setDisplayData -> reconcile,
     * exactly as live updates do; no DE state or worker methods are modified.
     * @param {SurroundingsSceneState | ((state: SurroundingsSceneState) => SurroundingsSceneState|void)} update
     */
    setTestState(update) {
        if (typeof update === 'function') {
            if (!this.testState) throw new Error('Call startDemo() or setTestState(snapshot) first.');
            const draft = structuredClone(this.testState);
            this.testState = structuredClone(update(draft) || draft);
        } else {
            this.testState = structuredClone(update);
        }
        this.queryVersion++; // Invalidate any live query already in flight.
        this.pending = null;
        this.subscribeToLiveUpdates();
        if (this.isConnected) void this.refresh();
    }

    /** Resume the real engine feed; departures/arrivals use the same animations. */
    stopDemo() {
        window.clearTimeout(this.demoTimer);
        this.demoTimer = undefined;
        if (this.hasAttribute('demo')) { this.removeAttribute('demo'); return; }
        this.testState = null;
        this.demoStep = -1;
        this.queryVersion++;
        this.pending = null;
        this.subscribeToLiveUpdates();
        if (this.isConnected) void this.refresh();
    }

    disconnectedCallback() {
        window.clearTimeout(this.demoTimer);
        this.demoTimer = undefined;
        this.unsubscribe?.();
        this.unsubscribe = null;
        this.queryVersion++;
        this.lifecycle++;
        this.pending = null;
        for (const animation of this.animations) animation.cancel();
        this.animations.clear();
    }

    async refresh() {
        const version = ++this.queryVersion;
        try {
            const data = await this.getDisplayData();
            if (!this.isConnected || version !== this.queryVersion) return;
            this.setDisplayData(data);
        } catch (error) {
            if (this.isConnected && version === this.queryVersion) console.warn('Unable to update scene characters', error);
        }
    }

    /** @returns {Promise<SurroundingsDisplayData>} */
    async getDisplayData() {
        const { location, userId, scene, characters } = this.testState || await this.getLiveSceneState();
        return { location, userId, groups: buildSurroundingGroups(scene, userId, characters) };
    }

    /** @returns {Promise<SurroundingsSceneState>} */
    async getLiveSceneState() {
        const client = window.ENGINE_WORKER_CLIENT;
        /** @type {string} */
        const userId = await client.queryDEObject({ path: ['user'] });
        /** @type {{location: string}|null} */
        const userState = await client.queryDEObject({ path: ['stateFor', userId], pick: ['location'] });
        const location = userState?.location || '';
        if (!location) return { location, userId, characters: [], scene: { conversations: [], foundCharacters: [], leftoverCharacters: [] } };
        /** @type {SurroundingsSceneState['scene']} */
        const scene = await client.queryDEObject({
            path: ['utils', 'conversations', 'getAllConversationsAtLocation'],
            call: [location], pick: ['conversations', 'foundCharacters', 'leftoverCharacters'],
        });
        const characters = await Promise.all([...new Set(scene.foundCharacters)].map(async id => {
            const [name, metadata, state] = await Promise.all([
                client.queryDEObject({ path: ['utils', 'templates', 'formatCharacterName'], call: [
                    { __type: 'char', value: id }, { __type: 'char', value: userId },
                    { __type: 'object', value: { justName: true, type: 'indefinite', capitalize: true } },
                ] }),
                client.queryDEObject({ path: ['characters', id, 'metadata'], pick: ['assets'] }),
                client.queryDEObject({ path: ['stateFor', id], pick: ['conversationId', 'locationSlot'] }),
            ]);
            return { id, name: name || 'Unknown character', image: metadata?.assets?.neutral || '',
                locationSlot: state?.locationSlot || '', conversationId: state?.conversationId || null };
        }));
        return { location, userId, scene, characters };
    }

    /** Supply fixture data through the same animation pipeline as engine updates.
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

    /** @param {SurroundingsDisplayData} data @param {number} lifecycle */
    async reconcile(data, lifecycle) {
        const container = this.root.querySelector('.groups');
        if (!container) return;
        /** @type {Map<string, {character: SurroundingCharacter, group: SurroundingGroup, placement: string}>} */
        const desired = new Map();
        // Also enforce uniqueness for externally supplied fixture data.
        const groups = getVisibleSurroundingGroups(data.groups, data.userId);
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
                    element.innerHTML = '<app-world-image no-transition="true" default-image="./images/default-profile.png" aria-hidden="true"></app-world-image><figcaption><span class="name"></span><span class="slot"></span></figcaption>';
                    card = { element, placement: target.placement, primary: group.primary };
                    this.cards.set(character.id, card);
                    entering.add(character.id);
                }
                card.primary = group.primary;
                const name = card.element.querySelector('.name');
                const slot = card.element.querySelector('.slot');
                if (name) name.textContent = character.name;
                if (slot) slot.textContent = character.locationSlot;
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
