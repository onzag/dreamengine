import { playCancelSound, playConfirmSound, playHoverSound } from '../../sound.js';
import '../world-image.js';
import { escapeHTML, formatName, namespaceLabel, renderCharacterDetails } from './character-details.js';

/**
 * @typedef {Object} PartyMember
 * @property {string} namespace Script namespace, used for importing the script.
 * @property {string} id Script ID, used for importing the script.
 * @property {string} scriptGivenId Stable identity of the exposed character.
 * @property {string} name Display name only.
 * @property {string} asset
 * @property {string} description
 * @property {Record<string, string | number | boolean>} details
 */
/** @typedef {PartyMember & { exposedCount: number, disabledReason: string }} PartyOption */
/** @typedef {{ namespace: string, id: string, type: string, language?: string, metadata?: Record<string, any>, exposeCharacters?: DEScriptExposeCharacters }} PartyScript */

/** One party selector per exposed character, grouped by its script namespace. */
export class PlayPartyStep extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        /** @type {PartyMember[]} */
        this.selectedPartyCharacters = [];
        /** @type {PartyOption[]} */
        this.characters = [];
        /** @type {Set<string>} */
        this.expandedNamespaces = new Set();
        this.loadVersion = 0;
    }

    connectedCallback() {
        this.root.innerHTML = `
            <style>
                :host { display: block; }
* { box-sizing: border-box; }
button { font: inherit; color: inherit; text-align: inherit; }
button:focus-visible { outline: 2px solid #ffb87a; outline-offset: 4px; }
.party-namespace-header { width: 100%; border: 0; background: transparent; }
.character-card { width: 100%; }
.step-pane {
    max-width: 140vh;
    margin: 0 auto;
    animation: step-fade-in 220ms ease-out;
}

@keyframes step-fade-in {
    from { opacity: 0; transform: translateY(1vh); }
    to { opacity: 1; transform: translateY(0); }
}

.step-heading {
    margin-bottom: 4vh;
}

.step-heading h2 {
    font-size: 3.6vh;
    font-weight: 300;
    margin: 0 0 0.8vh 0;
    letter-spacing: 0.06em;
    color: #fff1de;
}

.step-heading .step-sub {
    margin: 0;
    font-size: 2vh;
    color: rgba(255, 220, 180, 0.7);
    letter-spacing: 0.05em;
}

.world-groups {
    display: flex;
    flex-direction: column;
    gap: 4vh;
}

.world-group-header {
    display: flex;
    align-items: center;
    gap: 1.5vh;
    margin-bottom: 2vh;
    padding-bottom: 1vh;
    border-bottom: 1px solid rgba(255, 200, 150, 0.18);
}

.world-group-name {
    font-size: 2.4vh;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: rgba(255, 220, 180, 0.85);
}

.world-group-tag {
    font-size: 1.5vh;
    padding: 0.2vh 1vh;
    border: 1px solid rgba(255, 200, 150, 0.35);
    border-radius: 1vh;
    color: rgba(255, 220, 180, 0.6);
    letter-spacing: 0.15em;
    text-transform: uppercase;
}

.character-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(24vh, 1fr));
    gap: 3vh;
}

.character-sections {
    display: flex;
    flex-direction: column;
    gap: 3.6vh;
}

.character-section-heading {
    font-size: 1.9vh;
    font-weight: 600;
    color: rgba(255, 220, 180, 0.85);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    margin: 0 0 1.6vh 0;
    padding-bottom: 0.8vh;
    border-bottom: 1px solid rgba(255, 200, 150, 0.2);
}

/* ── Party step ── */
.party-summary {
    margin-bottom: 3vh;
    padding: 1.4vh 2vh;
    border: 1px solid rgba(255, 200, 150, 0.25);
    border-radius: 1vh;
    background: rgba(0, 0, 0, 0.18);
    color: rgba(255, 230, 200, 0.85);
    font-size: 1.9vh;
    letter-spacing: 0.05em;
    text-align: center;
}

.character-card.party-card {
    position: relative;
}

.character-card.party-card .party-selected-badge {
    position: absolute;
    top: 0.8vh;
    right: 0.8vh;
    padding: 0.3vh 1vh;
    border-radius: 1vh;
    font-size: 1.5vh;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    background: rgba(255, 184, 122, 0.85);
    color: #2a1818;
    opacity: 0;
    transform: translateY(-0.4vh);
    transition: opacity 0.2s ease, transform 0.2s ease;
    pointer-events: none;
}

.character-card.party-card.selected .party-selected-badge {
    opacity: 1;
    transform: translateY(0);
}

/* ── Party namespace (collapsible) ── */
.party-namespace {
    border: 1px solid rgba(255, 200, 150, 0.18);
    border-radius: 1vh;
    background: rgba(0, 0, 0, 0.18);
    overflow: hidden;
}

.party-namespace-header {
    display: flex;
    align-items: center;
    gap: 1.5vh;
    padding: 1.6vh 2vh;
    cursor: pointer;
    user-select: none;
    transition: background 0.2s ease, color 0.2s ease;
}

.party-namespace-header:hover {
    background: rgba(255, 184, 122, 0.08);
}

.party-namespace-arrow {
    display: inline-block;
    font-size: 1.8vh;
    color: rgba(255, 200, 150, 0.7);
    transition: transform 0.2s ease;
    width: 2vh;
    text-align: center;
}

.party-namespace.expanded .party-namespace-arrow {
    transform: rotate(90deg);
}

.party-namespace-count {
    margin-left: auto;
    font-size: 1.6vh;
    color: rgba(255, 220, 180, 0.6);
    letter-spacing: 0.05em;
}

.party-namespace-body {
    padding: 0 2vh;
    max-height: 0;
    overflow: hidden;
    transition: max-height 0s;
}

.party-namespace.expanded .party-namespace-body {
    padding: 2vh;
    max-height: none;
    border-top: 1px solid rgba(255, 200, 150, 0.18);
}

.character-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2.4vh 1.8vh;
    border-radius: 1.2vh;
    background: rgba(0, 0, 0, 0.18);
    border: 1px solid rgba(255, 200, 150, 0.18);
    cursor: pointer;
    transition: transform 0.2s ease, border-color 0.2s ease,
                background 0.2s ease, box-shadow 0.2s ease;
}

.character-card:hover {
    transform: translateY(-0.4vh);
    background: rgba(255, 184, 122, 0.08);
    border-color: rgba(255, 184, 122, 0.55);
    box-shadow: 0 0 1.6vh rgba(255, 184, 122, 0.2);
}

.character-card.selected {
    background: rgba(255, 184, 122, 0.15);
    border-color: #ffb87a;
    box-shadow: 0 0 2vh rgba(255, 184, 122, 0.45);
}

.character-card.self-insert {
    border-style: dashed;
}

.character-card.disabled {
    opacity: 0.35;
    cursor: not-allowed;
    filter: grayscale(0.6);
}

.character-card.disabled:hover {
    transform: none;
    background: rgba(0, 0, 0, 0.18);
    border-color: rgba(255, 200, 150, 0.18);
    box-shadow: none;
}

.character-card-disabled-note {
    font-size: 1.4vh;
    color: rgba(255, 200, 150, 0.7);
    margin-top: 0.6vh;
    text-align: center;
    letter-spacing: 0.05em;
    text-transform: uppercase;
}

.character-card-mcs {
    font-size: 2vh;
    color: rgba(255, 255, 255, 0.7);
    margin-bottom: 0.6vh;
    text-align: center;
    letter-spacing: 0.05em;
}

.character-card-image {
    width: 16vh;
    height: 16vh;
    margin-bottom: 1.6vh;
}

.character-card-image .character-default {
    width: 100%;
    height: 100%;
    border-radius: 10%;
    object-fit: cover;
    border: 1vh solid white;
    box-sizing: border-box;
    box-shadow: 0 0 1vh rgba(0, 0, 0, 0.5);
}

.character-card-name {
    font-size: 3vh;
    text-align: center;
    color: #fff1de;
    letter-spacing: 0.04em;
    margin-bottom: 0.6vh;
}

.character-card-desc {
    font-size: 1.6vh;
    text-align: center;
    color: rgba(255, 220, 180, 0.65);
    letter-spacing: 0.02em;
    line-height: 1.4;
    max-width: 24vh;
}

.character-card-details {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.6vh;
    margin-top: 0.4vh;
    max-width: 24vh;
}

.character-detail-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.4vh;
    padding: 0.4vh 0.9vh;
    border-radius: 1vh;
    background: rgba(0, 0, 0, 0.28);
    border: 1px solid rgba(255, 200, 150, 0.25);
    color: rgba(255, 230, 200, 0.85);
    letter-spacing: 0.02em;
    max-width: calc(100% - 5vh);
    height: auto;
    text-align: center;
    font-size: 2vh;
}

.character-detail-icon {
    font-size: 1.5vh;
    line-height: 1;
}

.character-detail-value {
    font-weight: 500;
}

/* ── Placeholder pane (kept for empty states) ── */
.placeholder-pane {
    padding: 8vh 2vh;
    text-align: center;
    font-size: 2.2vh;
    color: rgba(255, 220, 180, 0.55);
    border: 1px dashed rgba(255, 200, 150, 0.25);
    border-radius: 1.2vh;
    background: rgba(0, 0, 0, 0.12);
    letter-spacing: 0.05em;
}
            </style>
            <section class="step-pane" aria-labelledby="party-heading">
                <header class="step-heading">
                    <h2 id="party-heading">Choose your party</h2>
                    <p class="step-sub">Pick any number of characters to start the story alongside you, or none to spawn solo.</p>
                </header>
                <div class="party-summary" aria-live="polite"></div>
                <div class="world-groups"></div>
            </section>`;
        this.updateSelection();
        this.loadCharacters();
    }

    disconnectedCallback() {
        this.loadVersion += 1;
    }

    async loadCharacters() {
        const version = ++this.loadVersion;
        const groups = this.root.querySelector('.world-groups');
        if (!groups) return;
        groups.textContent = 'Loading characters…';
        groups.setAttribute('aria-busy', 'true');
        try {
            const infoMap = await window.ENGINE_WORKER_CLIENT.jsEngineGetInfoMap();
            if (!this.isConnected || version !== this.loadVersion) return;
            this.characters = this.collectCharacters(Object.values(infoMap));
            // Refresh display metadata while retaining only still-exposed, usable IDs.
            this.selectedPartyCharacters = this.characters
                .filter(c => !c.disabledReason && this.isSelected(c.scriptGivenId))
                .map(c => this.memberReference(c));
            this.renderGroups(groups);
            this.updateSelection();
            this.notifyChange();
        } catch (error) {
            if (!this.isConnected || version !== this.loadVersion) return;
            console.error('Failed to load party characters:', error);
            groups.textContent = 'Could not load party characters. ';
            const retry = document.createElement('button');
            retry.type = 'button';
            retry.textContent = 'Try again';
            retry.addEventListener('click', () => this.loadCharacters());
            groups.appendChild(retry);
        } finally {
            if (version === this.loadVersion) groups.removeAttribute('aria-busy');
        }
    }

    /** @param {PartyScript[]} scripts @returns {PartyOption[]} */
    collectCharacters(scripts) {
        /** @type {PartyOption[]} */
        const characters = [];
        const seen = new Set();
        for (const script of scripts) {
            if (script.type !== 'characters') continue;
            const exposed = Object.entries(script.exposeCharacters || {});
            const system = script.namespace.startsWith('@');
            const fallbackAsset = `${system ? '@' : ''}assets/${system ? script.namespace.slice(1) : script.namespace}/${script.id}/profile`;
            for (const [name, definition] of exposed) {
                const scriptGivenId = definition?.scriptGivenId;
                if (typeof scriptGivenId !== 'string' || !scriptGivenId.trim() || seen.has(scriptGivenId)) continue;
                seen.add(scriptGivenId);
                characters.push({
                    namespace: script.namespace,
                    id: script.id,
                    scriptGivenId,
                    name,
                    asset: definition.asset || fallbackAsset,
                    description: definition.description || '',
                    details: definition.details || {},
                    exposedCount: exposed.length,
                    disabledReason: this.disabledReason(script),
                });
            }
        }
        return characters.sort((a, b) => a.name.localeCompare(b.name));
    }

    /** @param {PartyScript} script */
    disabledReason(script) {
        if (script.metadata?.__placeholder) return 'Not ready — no content in the file.';
        if (script.metadata?.__in_progress) return 'Not ready — still in progress.';
        const language = script.language || 'en';
        const engineLanguage = window.DREAMENGINE_LANGUAGE || 'en';
        return language !== '*' && language.split('-')[0] !== engineLanguage.split('-')[0]
            ? `Not compatible — script is in ${language}, engine is in ${engineLanguage}.` : '';
    }

    /** @param {Element} groups */
    renderGroups(groups) {
        const namespaces = [...new Set(this.characters.map(c => c.namespace))].sort((a, b) =>
            Number(a.startsWith('@')) - Number(b.startsWith('@')) || a.localeCompare(b)
        );
        if (namespaces.length === 0) {
            groups.innerHTML = '<div class="placeholder-pane">No characters available to add to your party.</div>';
            return;
        }
        groups.innerHTML = namespaces.map((namespace, index) => {
            const characters = this.characters.filter(c => c.namespace === namespace);
            const expanded = this.expandedNamespaces.has(namespace);
            return `
                <section class="party-namespace${expanded ? ' expanded' : ''}" data-namespace="${escapeHTML(namespace)}">
                    <button type="button" class="party-namespace-header" aria-expanded="${expanded}" aria-controls="party-group-${index}">
                        <span class="party-namespace-arrow">▶</span>
                        <span class="world-group-name">${escapeHTML(namespaceLabel(namespace))}</span>
                        ${namespace.startsWith('@') ? '<span class="world-group-tag">System</span>' : ''}
                        <span class="party-namespace-count"></span>
                    </button>
                    <div class="party-namespace-body" id="party-group-${index}" ${expanded ? '' : 'inert'}>
                        <div class="character-grid">${characters.map(c => this.renderCard(c)).join('')}</div>
                    </div>
                </section>`;
        }).join('');
        groups.querySelectorAll('.party-namespace').forEach(group => {
            const namespace = group.getAttribute('data-namespace') || '';
            const header = group.querySelector('.party-namespace-header');
            header?.addEventListener('mouseenter', playHoverSound);
            header?.addEventListener('click', () => {
                const expanded = !this.expandedNamespaces.has(namespace);
                if (expanded) this.expandedNamespaces.add(namespace);
                else this.expandedNamespaces.delete(namespace);
                group.classList.toggle('expanded', expanded);
                header.setAttribute('aria-expanded', String(expanded));
                group.querySelector('.party-namespace-body')?.toggleAttribute('inert', !expanded);
                if (expanded) playConfirmSound();
                else playCancelSound();
            });
        });
        groups.querySelectorAll('.party-card').forEach(card => {
            card.addEventListener('mouseenter', () => { if (!card.hasAttribute('disabled')) playHoverSound(); });
            card.addEventListener('click', () => this.toggleCharacter(card.getAttribute('data-script-given-id') || ''));
        });
    }

    /** @param {PartyOption} character */
    renderCard(character) {
        return `
            <button type="button" class="character-card party-card${character.disabledReason ? ' disabled' : ''}"
                data-script-given-id="${escapeHTML(character.scriptGivenId)}" aria-pressed="false" ${character.disabledReason ? 'disabled' : ''}>
                <span class="character-card-image"><app-asset-image image-url="${escapeHTML(character.asset)}" default-image="./images/default-profile.png"></app-asset-image></span>
                <span class="character-card-name">${formatName(escapeHTML(character.name))}</span>
                ${character.exposedCount > 1 ? '<span class="character-card-mcs">Multiple-character script</span>' : ''}
                ${character.description ? `<span class="character-card-desc">${escapeHTML(character.description)}</span>` : ''}
                ${renderCharacterDetails(character.details)}
                ${character.disabledReason ? `<span class="character-card-disabled-note">${escapeHTML(character.disabledReason)}</span>` : ''}
                <span class="party-selected-badge">✓ In party</span>
            </button>`;
    }

    /** @param {string} scriptGivenId */
    isSelected(scriptGivenId) {
        return this.selectedPartyCharacters.some(c => c.scriptGivenId === scriptGivenId);
    }

    /** @param {string} scriptGivenId */
    toggleCharacter(scriptGivenId) {
        const character = this.characters.find(c => c.scriptGivenId === scriptGivenId);
        if (!character || character.disabledReason) return;
        if (this.isSelected(scriptGivenId)) {
            this.selectedPartyCharacters = this.selectedPartyCharacters.filter(c => c.scriptGivenId !== scriptGivenId);
            playCancelSound();
        } else {
            this.selectedPartyCharacters = [...this.selectedPartyCharacters, this.memberReference(character)];
            playConfirmSound();
        }
        this.updateSelection();
        this.notifyChange();
    }

    /** @param {PartyOption} character @returns {PartyMember} */
    memberReference(character) {
        const { namespace, id, scriptGivenId, name, asset, description, details } = character;
        return { namespace, id, scriptGivenId, name, asset, description, details: { ...details } };
    }

    updateSelection() {
        const count = this.selectedPartyCharacters.length;
        const summary = this.root.querySelector('.party-summary');
        if (summary) summary.textContent = count === 0 ? 'No party members selected — you will spawn solo.' : `${count} party member${count === 1 ? '' : 's'} selected.`;
        this.root.querySelectorAll('.party-card').forEach(card => {
            const selected = this.isSelected(card.getAttribute('data-script-given-id') || '');
            card.classList.toggle('selected', selected);
            card.setAttribute('aria-pressed', String(selected));
        });
        this.root.querySelectorAll('.party-namespace').forEach(group => {
            const namespace = group.getAttribute('data-namespace');
            const total = this.characters.filter(c => c.namespace === namespace).length;
            const selected = this.selectedPartyCharacters.filter(c => c.namespace === namespace).length;
            const label = group.querySelector('.party-namespace-count');
            if (label) label.textContent = `${total} character${total === 1 ? '' : 's'}${selected ? ` · ${selected} selected` : ''}`;
        });
    }

    notifyChange() {
        this.dispatchEvent(new CustomEvent('party-change', {
            detail: this.selectedPartyCharacters.map(c => ({ ...c, details: { ...c.details } })),
            bubbles: true, composed: true,
        }));
    }
}

customElements.define('app-play-party', PlayPartyStep);
