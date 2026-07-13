import { playCancelSound, playConfirmSound, playHoverSound, playSound, stopAllAmbiencesAndStartNewOne } from '../sound.js';
import './world-image.js';

/**
 * @param {string} str
 */
function escapeHTML(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * @param {string} namespace
 */
function namespaceLabel(namespace) {
    if (!namespace) return '';
    return namespace.startsWith('@') ? namespace.slice(1) : namespace;
}

/**
 * @param {string} name
 */
function formatName(name) {
    return name.replace(/[-_]/g, match => `<span class="separator">${match}</span>`);
}

/**
 * Format an arbitrary character detail key/value pair into a chip.
 * Special-cases `sex` and `gender` to use emojis, `years` to suffix " years",
 * and booleans to "Yes" / "No".
 *
 * @param {string} key
 * @param {string | number | boolean} rawValue
 * @returns {{ icon?: string, label: string, value: string } | null}
 */
function formatCharacterDetail(key, rawValue) {
    if (rawValue === undefined || rawValue === null || rawValue === '') return null;

    const normKey = String(key).toLowerCase();

    // Sex — biological symbols.
    if (normKey === 'sex') {
        const v = String(rawValue).toLowerCase();
        let icon = '❓';
        if (v === 'male') icon = '♂️';
        else if (v === 'female') icon = '♀️';
        else if (v === 'intersex') icon = '⚥';
        else if (v === 'none') icon = '🚫';
        return { icon, label: `Sex: ${capitalize(String(rawValue))}`, value: capitalize(String(rawValue)) };
    }

    // Gender — person glyphs to differentiate from sex.
    if (normKey === 'gender') {
        const v = String(rawValue).toLowerCase();
        let icon = '❓';
        if (v === 'male') icon = '👨';
        else if (v === 'female') icon = '👩';
        else if (v === 'ambiguous') icon = '🧑';
        else if (v === 'none') icon = '🚫';
        return { icon, label: `Gender: ${capitalize(String(rawValue))}`, value: capitalize(String(rawValue)) };
    }

    // Booleans — Yes / No.
    if (typeof rawValue === 'boolean') {
        return {
            icon: rawValue ? '✅' : '❌',
            label: capitalize(normKey),
            value: rawValue ? 'Yes' : 'No',
        };
    }

    // Years — append unit.
    if (normKey === 'years' || normKey === 'age') {
        return {
            icon: '🎂',
            label: capitalize(normKey),
            value: `${rawValue} years`,
        };
    }

    // Height.
    if (normKey === 'height') {
        return { icon: '📏', label: `Height: ${rawValue} cm`, value: `${rawValue}cm` };
    }

    // Weight.
    if (normKey === 'weight') {
        return { icon: '⚖️', label: `Weight: ${rawValue} kg`, value: `${rawValue}kg` };
    }

    // Species.
    if (normKey === 'species') {
        const cap = capitalize(String(rawValue));
        return { icon: '🧬', label: `Species: ${cap}`, value: cap };
    }

    // Species type — humanoid / feral / animal.
    if (normKey === 'speciestype') {
        const v = String(rawValue).toLowerCase();
        const icon = v === 'humanoid' ? '🧍'
            : v === 'feral' ? '🐉'
            : v === 'animal' ? '🐾'
            : '❓';
        const labelMap = /** @type {Record<string, string>} */ ({ humanoid: 'Humanoid', feral: 'Feral', animal: 'Animal' });
        const display = labelMap[v] || capitalize(String(rawValue));
        return { icon, label: `Species type: ${display}`, value: display };
    }

    // Generic fallback — no emoji, just "Key: value" text.
    return { label: capitalize(normKey), value: `${capitalize(normKey)}: ${rawValue}` };
}

/**
 * @param {string} s
 */
function capitalize(s) {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Inspect a script's metadata for the standard placeholder / in-progress
 * markers. Both indicate the script isn't ready and should be shown but
 * disabled in selection UIs.
 *
 * @param {Record<string, any> | null | undefined} metadata
 * @param {string} language
 * @returns {{ disabled: boolean, reason: string }}
 */
function getScriptDisabledState(metadata, language) {
    if (!metadata || typeof metadata !== 'object') return { disabled: false, reason: '' };
    if (metadata.__placeholder) return { disabled: true, reason: 'Not ready — no content in the file.' };
    if (metadata.__in_progress) return { disabled: true, reason: 'Not ready — still in progress.' };
    if (language !== "*" && language.split("-")[0] !== window.DREAMENGINE_LANGUAGE.split("-")[0]) return { disabled: true, reason: `Not compatible — script is in language ${JSON.stringify(language) || 'unknown'} but engine is in ${JSON.stringify(window.DREAMENGINE_LANGUAGE)}.` };
    return { disabled: false, reason: '' };
}

/**
 * @param {Record<string, string | number | boolean> | null | undefined} details
 * @returns {string}
 */
function renderCharacterDetails(details) {
    if (!details || typeof details !== 'object') return '';
    const chips = [];
    for (const [key, value] of Object.entries(details)) {
        if (key.startsWith('__')) continue;
        const formatted = formatCharacterDetail(key, value);
        if (!formatted) continue;
        const iconHTML = formatted.icon
            ? `<span class="character-detail-icon">${formatted.icon}</span>`
            : '';
        chips.push(`
            <span class="character-detail-chip" title="${escapeHTML(formatted.label)}">
                ${iconHTML}
                <span class="character-detail-value">${escapeHTML(formatted.value)}</span>
            </span>
        `);
    }
    if (chips.length === 0) return '';
    return `<div class="character-card-details">${chips.join('')}</div>`;
}

const STEPS = [
    { id: 'world', label: 'World' },
    { id: 'mode', label: 'Mode' },
    { id: 'party', label: 'Party' },
    { id: 'character', label: 'Character' },
];

// Placeholder list — real save loading is not yet implemented.
const EXAMPLE_SAVES = [
    { id: 'save-1', name: 'A Quiet Morning in Eldhaven', timestamp: '2026-04-21 09:14' },
    { id: 'save-2', name: 'The Storm at the Crossroads', timestamp: '2026-04-18 22:03' },
    { id: 'save-3', name: 'Whispers Beneath the Hollow', timestamp: '2026-04-12 17:48' },
];

const DREAM_STABILITY_OPTIONS = [
    {
        id: 'stable',
        label: 'Normal',
        description: 'Normal dreams are consistent and coherent, with a clear narrative and logical progression, making them easier to navigate and interact with.',
    },
    {
        id: 'unstable',
        label: 'Vivid Dream',
        description: 'Vivid dreams may have sudden changes in setting, characters, or narrative, creating a more surreal and challenging experience. A vivid dream might turn into a lucid dream or nightmare.',
    },
    {
        id: 'very unstable',
        label: 'Astral Dream',
        description: 'Astral dreams can suddenly become chaotic and fragmented, with nightmarish and lucid elements, characters may become self aware, making them difficult to navigate and interact with, and may lead to a dream collapse.',
    },
];
const DEFAULT_DREAM_STABILITY = 'stable';

class PlayOverlay extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        this.onDocumentKeydown = this.onDocumentKeydown.bind(this);

        /** @type {number} */
        this.currentStepIndex = 0;
        /** @type {{ namespace: string, id: string } | null} */
        this.selectedWorld = null;
        /** @type {'new' | 'load' | null} */
        this.selectedMode = null;
        /** @type {string | null} */
        this.selectedSaveId = null;
        /** @type {string} */
        this.selectedDreamStability = DEFAULT_DREAM_STABILITY;
        /** @type {{ name: string, scriptKey: string, asset: string | null } | null} */
        this.selectedCharacter = null;
        /** @type {'narrator' | 'schizophrenia' | null} */
        this.selectedSpecialMode = null;
        /** @type {Array<{ namespace: string, id: string }>} */
        this.selectedPartyCharacters = [];
        /** @type {Record<string, Array<{ namespace: string, id: string }>> | null} */
        this.partyCharacterRefs = null;
        /** @type {Record<string, Array<{ namespace: string, id: string, description: string, metadata: Record<string, any>, language: string }>>} */
        this.partyNamespaceCache = {};
        /** @type {Set<string>} */
        this.expandedPartyNamespaces = new Set();
        /** @type {Array<{ name: string, scriptKey: string, namespace: string, description: string, asset: string | null, language: string }> | null} */
        this.characterCache = null;
    }

    async connectedCallback() {
        this.render();

        setTimeout(() => {
            // @ts-expect-error
            document.querySelector('.sky').style.display = 'none';
        }, 200);

        document.addEventListener('keydown', this.onDocumentKeydown);

        const closeBtn = this.root.getElementById('close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('mouseenter', playHoverSound);
            closeBtn.addEventListener('click', () => {
                playCancelSound();
                this.close();
            });
        }

        const backBtn = this.root.getElementById('back-btn');
        if (backBtn) {
            backBtn.addEventListener('mouseenter', playHoverSound);
            backBtn.addEventListener('click', () => this.onBack());
        }

        const continueBtn = this.root.getElementById('continue-btn');
        if (continueBtn) {
            continueBtn.addEventListener('mouseenter', playHoverSound);
            continueBtn.addEventListener('click', () => this.onContinue());
        }

        this.renderStep();
    }

    /**
     * @param {KeyboardEvent} e
     */
    onDocumentKeydown(e) {
        if (e.key === 'Escape') {
            if (document.querySelector('app-dialog')) return;
            let host = /** @type {HTMLElement} */ (/** @type {unknown} */ (this));
            while (host.getRootNode() !== document) {
                // @ts-ignore
                host = host.getRootNode().host;
            }
            const bodyChildren = Array.from(document.body.children);
            if (bodyChildren[bodyChildren.length - 1] !== host) return;
            this.close();
        }
    }

    close() {
        this.dispatchEvent(new CustomEvent('cancel'));
    }

    async disconnectedCallback() {
        document.removeEventListener('keydown', this.onDocumentKeydown);
        if (!this.startedGame) {
            // @ts-expect-error
            document.querySelector('.sky').style.display = 'block';
            await stopAllAmbiencesAndStartNewOne([{ src: './sounds/dream-ambience.mp3', volume: 3 }], 1000, 1000);
        }
    }

    // ── Step navigation ──────────────────────────────────────────────

    canContinue() {
        if (this.currentStepIndex === 0) return !!this.selectedWorld;
        if (this.currentStepIndex === 1) {
            if (this.selectedMode === 'new') return !!this.selectedDreamStability;
            if (this.selectedMode === 'load') return !!this.selectedSaveId;
            return false;
        }
        if (this.currentStepIndex === 2) return true; // empty party = solo is allowed
        if (this.currentStepIndex === 3) return !!this.selectedCharacter;
        return false;
    }

    updateFooter() {
        const backBtn = this.root.getElementById('back-btn');
        const continueBtn = this.root.getElementById('continue-btn');
        if (backBtn) {
            backBtn.classList.toggle('hidden', this.currentStepIndex === 0);
        }
        if (continueBtn) {
            continueBtn.classList.toggle('disabled', !this.canContinue());
            const isLast = this.currentStepIndex === STEPS.length - 1;
            continueBtn.textContent = isLast ? 'Start' : 'Continue';
        }
        this.updateStepIndicator();
    }

    updateStepIndicator() {
        const items = this.root.querySelectorAll('.step-indicator .step');
        items.forEach((el, i) => {
            el.classList.toggle('active', i === this.currentStepIndex);
            el.classList.toggle('done', i < this.currentStepIndex);
        });
    }

    onBack() {
        if (this.currentStepIndex === 0) return;
        playCancelSound();
        this.currentStepIndex -= 1;
        this.renderStep();
    }

    async onContinue() {
        if (!this.canContinue()) return;
        playConfirmSound();
        // When loading a save, skip party/character steps and start immediately.
        const isLoadingFromSave = this.currentStepIndex === 1 && this.selectedMode === 'load';
        if (!isLoadingFromSave && this.currentStepIndex < STEPS.length - 1) {
            this.currentStepIndex += 1;
            this.renderStep();
        } else {
            this.dispatchEvent(new CustomEvent('start', {
                detail: {
                    world: this.selectedWorld,
                    mode: this.selectedMode,
                    saveId: this.selectedSaveId,
                    character: this.selectedCharacter,
                    specialMode: this.selectedSpecialMode,
                    partyCharacters: this.selectedPartyCharacters,
                    dreamStability: this.selectedDreamStability,
                    voiceName: this.userSelfName || '',
                },
            }));
            this.startedGame = true;

            const lightFade = document.createElement('div');
            lightFade.style.position = 'fixed';
            lightFade.style.inset = '0';
            lightFade.style.background = 'white';
            lightFade.style.zIndex = '50';
            lightFade.style.pointerEvents = 'auto';
            lightFade.style.opacity = '0';
            lightFade.style.transition = 'opacity 1.5s ease';
            lightFade.style.top = '0';
            lightFade.style.left = '0';
            lightFade.style.width = '100%';
            lightFade.style.height = '100%';
            this.shadowRoot?.appendChild(lightFade);
            requestAnimationFrame(() => {
                lightFade.style.opacity = '1';
            });

            setTimeout(() => {
                playSound("./sounds/transition.mp3", 0.8);
            }, 300);
            await stopAllAmbiencesAndStartNewOne([], 1000, 1000);
        }
    }

    async renderStep() {
        const body = this.root.querySelector('.play-body');
        if (!body) return;

        if (this.currentStepIndex === 0) {
            await this.renderWorldStep(body);
        } else if (this.currentStepIndex === 1) {
            this.renderModeStep(body);
        } else if (this.currentStepIndex === 2) {
            await this.renderPartyStep(body);
        } else if (this.currentStepIndex === 3) {
            await this.renderCharacterStep(body);
        }

        this.applyStabilityTheme();
        this.updateFooter();
    }

    // ── Step 4: Party ────────────────────────────────────────────────

    /**
     * Lightweight first pass: collect just `namespace`/`id` of every character
     * script, grouped by namespace. No per-character metadata is loaded — that
     * happens lazily when a namespace is expanded.
     *
     * @returns {Promise<Record<string, Array<{ namespace: string, id: string }>>>}
     */
    async loadPartyCharacterRefs() {
        if (this.partyCharacterRefs) return this.partyCharacterRefs;

        let infoMap = {};
        try {
            infoMap = await window.ENGINE_WORKER_CLIENT.jsEngineGetInfoMap();
        } catch (err) {
            console.error('Failed to load info map for party characters:', err);
            return {};
        }

        /** @type {Record<string, Array<{ namespace: string, id: string }>>} */
        const grouped = {};
        for (const info of Object.values(infoMap)) {
            // @ts-ignore
            if (info.type !== 'characters') continue;
            // @ts-ignore
            const ns = info.namespace;
            // @ts-ignore
            const id = info.id;
            if (!grouped[ns]) grouped[ns] = [];
            grouped[ns].push({ namespace: ns, id });
        }
        for (const ns of Object.keys(grouped)) {
            grouped[ns].sort((a, b) => a.id.localeCompare(b.id));
        }

        this.partyCharacterRefs = grouped;
        return grouped;
    }

    /**
     * Lazily load full metadata (description + metadata fields) for every
     * character in a single namespace. Cached per namespace.
     *
     * @param {string} namespace
     * @returns {Promise<Array<{ namespace: string, id: string, description: string, metadata: Record<string, any>, language: string }>>}
     */
    async loadPartyNamespaceCharacters(namespace) {
        if (this.partyNamespaceCache[namespace]) return this.partyNamespaceCache[namespace];

        const refs = (this.partyCharacterRefs && this.partyCharacterRefs[namespace]) || [];
        if (refs.length === 0) {
            this.partyNamespaceCache[namespace] = [];
            return [];
        }

        /** @type {Record<string, any>} */
        let detailedMap = {};
        try {
            detailedMap = await window.ENGINE_WORKER_CLIENT.jsEngineGetInfoMapForScripts({
                scripts: refs,
            });
        } catch (err) {
            console.error(`Failed to load detailed info for namespace ${namespace}:`, err);
        }

        /** @type {Array<{ namespace: string, id: string, description: string, metadata: Record<string, any>, language: string }>} */
        const result = [];
        for (const info of Object.values(detailedMap)) {
            // @ts-ignore
            if (info.type !== 'characters') continue;
            // @ts-ignore
            if (info.namespace !== namespace) continue;
            result.push({
                // @ts-ignore
                namespace: info.namespace,
                // @ts-ignore
                id: info.id,
                // @ts-ignore
                description: info.description || '',
                // @ts-ignore
                metadata: info.metadata || {},
                // @ts-ignore
                language: info.language || 'en',
            });
        }

        result.sort((a, b) => {
            const nameA = (a.metadata && a.metadata.__name) ? String(a.metadata.__name) : a.id;
            const nameB = (b.metadata && b.metadata.__name) ? String(b.metadata.__name) : b.id;
            return nameA.localeCompare(nameB);
        });
        this.partyNamespaceCache[namespace] = result;
        return result;
    }

    /**
     * @param {Element} body
     */
    async renderPartyStep(body) {
        body.innerHTML = `
            <div class="step-pane">
                <div class="step-heading">
                    <h2>Choose your party</h2>
                    <p class="step-sub">Select the characters that will start the story alongside you. Leave empty to spawn solo.</p>
                </div>
                <div class="world-loading">Loading namespaces…</div>
            </div>
        `;

        const refsByNamespace = await this.loadPartyCharacterRefs();

        const pane = body.querySelector('.step-pane');
        if (!pane) return;

        const namespaces = Object.keys(refsByNamespace).sort((a, b) => {
            const aSys = a.startsWith('@');
            const bSys = b.startsWith('@');
            if (aSys !== bSys) return aSys ? 1 : -1;
            return a.localeCompare(b);
        });

        if (namespaces.length === 0) {
            pane.innerHTML = `
                <div class="step-heading">
                    <h2>Choose your party</h2>
                    <p class="step-sub">No additional characters are available. You will spawn solo.</p>
                </div>
                <div class="placeholder-pane">No characters available to add to your party.</div>
            `;
            return;
        }

        const groupsHTML = namespaces.map(ns => {
            const isSystem = ns.startsWith('@');
            const isExpanded = this.expandedPartyNamespaces.has(ns);
            const count = refsByNamespace[ns].length;
            const selectedInGroup = this.selectedPartyCharacters.filter(
                c => c.namespace === ns
            ).length;
            return `
                <div class="party-namespace${isExpanded ? ' expanded' : ''}" data-namespace="${escapeHTML(ns)}">
                    <div class="party-namespace-header" data-namespace="${escapeHTML(ns)}">
                        <span class="party-namespace-arrow">▶</span>
                        <span class="world-group-name">${escapeHTML(namespaceLabel(ns))}</span>
                        ${isSystem ? '<span class="world-group-tag">System</span>' : ''}
                        <span class="party-namespace-count">${count} character${count === 1 ? '' : 's'}${selectedInGroup > 0 ? ` · ${selectedInGroup} selected` : ''}</span>
                    </div>
                    <div class="party-namespace-body"></div>
                </div>
            `;
        }).join('');

        const summary = this.selectedPartyCharacters.length === 0
            ? 'No party members selected — you will spawn solo.'
            : `${this.selectedPartyCharacters.length} party member${this.selectedPartyCharacters.length === 1 ? '' : 's'} selected.`;

        pane.innerHTML = `
            <div class="step-heading">
                <h2>Choose your party</h2>
                <p class="step-sub">Pick any number of characters to start the story alongside you, or none to spawn solo.</p>
            </div>
            <div class="party-summary">${escapeHTML(summary)}</div>
            <div class="world-groups">${groupsHTML}</div>
        `;

        // Wire up namespace headers (collapse/expand with lazy load).
        pane.querySelectorAll('.party-namespace-header').forEach(header => {
            header.addEventListener('mouseenter', playHoverSound);
            header.addEventListener('click', () => {
                const ns = header.getAttribute('data-namespace') || '';
                const group = /** @type {HTMLElement | null} */ (
                    pane.querySelector(`.party-namespace[data-namespace="${CSS.escape(ns)}"]`)
                );
                if (!group) return;
                if (this.expandedPartyNamespaces.has(ns)) {
                    this.expandedPartyNamespaces.delete(ns);
                    group.classList.remove('expanded');
                    const bodyEl = group.querySelector('.party-namespace-body');
                    if (bodyEl) bodyEl.innerHTML = '';
                    playCancelSound();
                } else {
                    this.expandedPartyNamespaces.add(ns);
                    group.classList.add('expanded');
                    playConfirmSound();
                    this.renderPartyNamespaceBody(pane, ns);
                }
            });
        });

        // Restore previously-expanded namespaces (e.g. user comes back to step).
        for (const ns of Array.from(this.expandedPartyNamespaces)) {
            if (refsByNamespace[ns]) this.renderPartyNamespaceBody(pane, ns);
            else this.expandedPartyNamespaces.delete(ns);
        }
    }

    /**
     * Render (lazily loading metadata if needed) the cards inside one
     * namespace's expanded body. Wires up the click handlers for selection.
     *
     * @param {Element} pane
     * @param {string} ns
     */
    async renderPartyNamespaceBody(pane, ns) {
        const group = /** @type {HTMLElement | null} */ (
            pane.querySelector(`.party-namespace[data-namespace="${CSS.escape(ns)}"]`)
        );
        if (!group) return;
        const bodyEl = group.querySelector('.party-namespace-body');
        if (!bodyEl) return;

        if (!this.partyNamespaceCache[ns]) {
            bodyEl.innerHTML = `<div class="world-loading">Loading characters…</div>`;
        }

        const characters = await this.loadPartyNamespaceCharacters(ns);

        // The user may have collapsed this namespace before the load resolved;
        // bail out if so.
        if (!this.expandedPartyNamespaces.has(ns)) return;

        if (characters.length === 0) {
            bodyEl.innerHTML = `<div class="placeholder-pane">No characters in this namespace.</div>`;
            return;
        }

        const items = characters.map(c => {
            const isSelected = this.isPartyCharacterSelected(c);
            const { disabled, reason } = getScriptDisabledState(c.metadata, c.language);
            const detailsHTML = renderCharacterDetails(c.metadata || {});
            return `
                <div class="character-card party-card${isSelected ? ' selected' : ''}${disabled ? ' disabled' : ''}"
                     data-namespace="${escapeHTML(c.namespace)}"
                     data-id="${escapeHTML(c.id)}"
                     ${disabled ? 'data-disabled="true"' : ''}>
                    <div class="character-card-image">
                        <app-asset-image image-url="assets/${escapeHTML(c.namespace)}/${escapeHTML(c.id)}/profile" default-image="./images/default-profile.png"></app-asset-image>
                    </div>
                    <div class="character-card-name">${formatName(escapeHTML((c.metadata && c.metadata.__name) ? String(c.metadata.__name) : c.id))}</div>
                    ${c.description ? `<div class="character-card-desc">${escapeHTML(c.description)}</div>` : ''}
                    ${detailsHTML}
                    ${disabled ? `<div class="character-card-disabled-note">${escapeHTML(reason)}</div>` : ''}
                    <div class="party-selected-badge">✓ In party</div>
                </div>
            `;
        }).join('');

        bodyEl.innerHTML = `<div class="character-grid">${items}</div>`;

        bodyEl.querySelectorAll('.party-card').forEach(card => {
            card.addEventListener('mouseenter', () => {
                if (card.getAttribute('data-disabled') === 'true') return;
                playHoverSound();
            });
            card.addEventListener('click', () => {
                if (card.getAttribute('data-disabled') === 'true') return;
                const cns = card.getAttribute('data-namespace') || '';
                const cid = card.getAttribute('data-id') || '';
                const wasSelected = card.classList.contains('selected');
                if (wasSelected) {
                    this.selectedPartyCharacters = this.selectedPartyCharacters.filter(
                        c => !(c.namespace === cns && c.id === cid)
                    );
                    card.classList.remove('selected');
                    // If the play-as character was this party member, clear it
                    // so the next step doesn't keep a stale selection.
                    const removedKey = `${cns}/${cid}`;
                    if (this.selectedCharacter && this.selectedCharacter.scriptKey === removedKey) {
                        this.selectedCharacter = null;
                    }
                    playCancelSound();
                } else {
                    this.selectedPartyCharacters.push({ namespace: cns, id: cid });
                    card.classList.add('selected');
                    playConfirmSound();
                }
                this.updatePartySummary(pane);
                this.updatePartyNamespaceCount(pane, cns);
                this.updateFooter();
            });
        });
    }

    /**
     * @param {Element} pane
     * @param {string} ns
     */
    updatePartyNamespaceCount(pane, ns) {
        const refs = (this.partyCharacterRefs && this.partyCharacterRefs[ns]) || [];
        const count = refs.length;
        const selectedInGroup = this.selectedPartyCharacters.filter(c => c.namespace === ns).length;
        const header = pane.querySelector(`.party-namespace[data-namespace="${CSS.escape(ns)}"] .party-namespace-count`);
        if (header) {
            header.textContent = `${count} character${count === 1 ? '' : 's'}${selectedInGroup > 0 ? ` · ${selectedInGroup} selected` : ''}`;
        }
    }

    /**
     * @param {{ namespace: string, id: string }} c
     */
    isPartyCharacterSelected(c) {
        return this.selectedPartyCharacters.some(
            sel => sel.namespace === c.namespace && sel.id === c.id
        );
    }

    /**
     * @param {Element} pane
     */
    updatePartySummary(pane) {
        const el = pane.querySelector('.party-summary');
        if (!el) return;
        const n = this.selectedPartyCharacters.length;
        el.textContent = n === 0
            ? 'No party members selected — you will spawn solo.'
            : `${n} party member${n === 1 ? '' : 's'} selected.`;
    }

    // ── Step 1: World selection ──────────────────────────────────────

    /**
     * @param {Element} body
     */
    async renderWorldStep(body) {
        body.innerHTML = `
            <div class="step-pane">
                <div class="step-heading">
                    <h2>Choose a world</h2>
                    <p class="step-sub">Select the world you want to dream in.</p>
                </div>
                <div class="world-loading">Loading worlds…</div>
            </div>
        `;

        let infoMap = {};
        try {
            infoMap = await window.ENGINE_WORKER_CLIENT.jsEngineGetInfoMap();
        } catch (err) {
            console.error('Failed to load worlds:', err);
        }

        const worlds = Object.values(infoMap).filter(
            /** @param {any} info */
            (info) => info.type === 'world'
        );

        // Group by namespace
        /** @type {Record<string, any[]>} */
        const grouped = {};
        for (const w of worlds) {
            // @ts-ignore
            const ns = w.namespace;
            if (!grouped[ns]) grouped[ns] = [];
            // @ts-ignore
            grouped[ns].push(w);
        }

        // Sort: user namespaces first, then system (@-prefixed)
        const namespaces = Object.keys(grouped).sort((a, b) => {
            const aSys = a.startsWith('@');
            const bSys = b.startsWith('@');
            if (aSys !== bSys) return aSys ? 1 : -1;
            return a.localeCompare(b);
        });

        const pane = body.querySelector('.step-pane');
        if (!pane) return;

        if (namespaces.length === 0) {
            pane.innerHTML = `
                <div class="step-heading">
                    <h2>Choose a world</h2>
                    <p class="step-sub">Select the world you want to dream in.</p>
                </div>
                <div class="world-empty">
                    No worlds are available. You can create one from the Manage screen.
                </div>
            `;
            return;
        }

        const groupsHTML = namespaces.map(ns => {
            const isSystem = ns.startsWith('@');
            const items = grouped[ns].map((w) => {
                const { disabled, reason } = getScriptDisabledState(w.metadata, w.language);
                return `
                <div class="world-card${disabled ? ' disabled' : ''}"
                     data-namespace="${escapeHTML(ns)}"
                     data-id="${escapeHTML(w.id)}"
                     ${disabled ? 'data-disabled="true"' : ''}>
                    <div class="world-card-image">
                        <app-world-image image-url="assets/${escapeHTML(ns)}/${escapeHTML(w.id)}/image"></app-world-image>
                    </div>
                    <div class="world-card-name">${formatName(escapeHTML(w.id))}</div>
                    ${disabled ? `<div class="character-card-disabled-note">${escapeHTML(reason)}</div>` : ''}
                </div>
            `;
            }).join('');

            return `
                <div class="world-group">
                    <div class="world-group-header">
                        <span class="world-group-name">${escapeHTML(namespaceLabel(ns))}</span>
                        ${isSystem ? '<span class="world-group-tag">System</span>' : ''}
                    </div>
                    <div class="world-grid">${items}</div>
                </div>
            `;
        }).join('');

        pane.innerHTML = `
            <div class="step-heading">
                <h2>Choose a world</h2>
                <p class="step-sub">Select the world you want to dream in.</p>
            </div>
            <div class="world-groups">${groupsHTML}</div>
        `;

        pane.querySelectorAll('.world-card').forEach(card => {
            card.addEventListener('mouseenter', () => {
                if (card.getAttribute('data-disabled') === 'true') return;
                playHoverSound();
            });
            card.addEventListener('click', () => {
                if (card.getAttribute('data-disabled') === 'true') return;
                const ns = card.getAttribute('data-namespace') || '';
                const id = card.getAttribute('data-id') || '';
                this.selectedWorld = { namespace: ns, id };
                pane.querySelectorAll('.world-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                // a different world invalidates downstream choices
                this.characterCache = null;
                this.selectedCharacter = null;
                playConfirmSound();
                this.updateFooter();
            });

            // restore selection if user comes back
            if (this.selectedWorld &&
                card.getAttribute('data-namespace') === this.selectedWorld.namespace &&
                card.getAttribute('data-id') === this.selectedWorld.id) {
                card.classList.add('selected');
            }
        });
    }

    // ── Step 2: Mode (new game / load) ───────────────────────────────

    /**
     * @param {Element} body
     */
    renderModeStep(body) {
        const w = this.selectedWorld;
        const worldLabel = w ? `${namespaceLabel(w.namespace)} / ${w.id}` : '';

        body.innerHTML = `
            <div class="step-pane">
                <div class="step-heading">
                    <h2>How would you like to begin?</h2>
                    <p class="step-sub">World: <span class="world-pill">${escapeHTML(worldLabel)}</span></p>
                </div>
                <div class="mode-options">
                    <div class="mode-card" data-mode="new">
                        <div class="mode-card-title">New Dream</div>
                        <div class="mode-card-desc">Start a fresh dream in this world.</div>
                    </div>
                    <div class="mode-card" data-mode="load">
                        <div class="mode-card-title">Load Saved Dream</div>
                        <div class="mode-card-desc">Continue from a previous dream.</div>
                    </div>
                </div>
                <div class="saves-panel hidden">
                    <div class="saves-panel-title">Pick a save</div>
                    <div class="saves-list"></div>
                </div>
                <div class="stability-panel hidden">
                    <div class="saves-panel-title">Dream Stability</div>
                    <div class="saves-list">
                        ${DREAM_STABILITY_OPTIONS.map(s => `
                            <div class="save-item stability-item" data-stability-id="${escapeHTML(s.id)}">
                                <div>
                                    <div class="save-item-name">${escapeHTML(s.label)}</div>
                                    <div class="save-item-meta">${escapeHTML(s.description)}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        const pane = body.querySelector('.step-pane');
        if (!pane) return;

        const savesPanel = pane.querySelector('.saves-panel');
        const stabilityPanel = pane.querySelector('.stability-panel');

        pane.querySelectorAll('.mode-card').forEach(card => {
            card.addEventListener('mouseenter', playHoverSound);
            card.addEventListener('click', async () => {
                const mode = /** @type {'new' | 'load'} */ (card.getAttribute('data-mode'));
                this.selectedMode = mode;
                pane.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                if (mode === 'load') {
                    const savesList = savesPanel?.querySelector('.saves-list');
                    if (savesList) savesList.innerHTML = `<div class="world-loading">Loading saves…</div>`;
                    savesPanel?.classList.remove('hidden');
                    stabilityPanel?.classList.add('hidden');

                    try {
                        const savesResp = await fetch(window.DREAMENGINE_HOME + "/saves/" + this.selectedWorld?.namespace + "/" + this.selectedWorld?.id + ".json");
                        const savesData = await savesResp.json();
                        const saves = Array.isArray(savesData?.saves) ? savesData.saves : [];

                        if (savesList) {
                            if (saves.length === 0) {
                                savesList.innerHTML = `<div class="placeholder-pane">No saves found for this world.</div>`;
                            } else {
                                savesList.innerHTML = saves.map(/** @param {any} s */ s => {
                                    const metaChips = s.data && typeof s.data === 'object'
                                        ? Object.entries(s.data).map(([k, v]) =>
                                            `<span class="save-meta-chip"><span class="save-meta-key">${escapeHTML(String(k))}</span><span class="save-meta-value">${escapeHTML(String(v))}</span></span>`
                                          ).join('')
                                        : '';
                                    return `
                                        <div class="save-item" data-save-id="${escapeHTML(s.save)}">
                                            <div class="save-item-name">${escapeHTML(s.save)}</div>
                                            ${metaChips ? `<div class="save-item-chips">${metaChips}</div>` : ''}
                                        </div>
                                    `;
                                }).join('');

                                savesList.querySelectorAll('.save-item').forEach(item => {
                                    item.addEventListener('mouseenter', playHoverSound);
                                    item.addEventListener('click', () => {
                                        this.selectedSaveId = item.getAttribute('data-save-id');
                                        savesList.querySelectorAll('.save-item').forEach(s => s.classList.remove('selected'));
                                        item.classList.add('selected');
                                        playConfirmSound();
                                        this.updateFooter();
                                    });
                                    if (this.selectedSaveId && item.getAttribute('data-save-id') === this.selectedSaveId) {
                                        item.classList.add('selected');
                                    }
                                });
                            }
                        }
                    } catch (err) {
                        console.error('Failed to load saves:', err);
                        if (savesList) savesList.innerHTML = `<div class="placeholder-pane">Failed to load saves.</div>`;
                    }
                } else {
                    savesPanel?.classList.add('hidden');
                    stabilityPanel?.classList.remove('hidden');
                    this.selectedSaveId = null;
                    if (!this.selectedDreamStability) {
                        this.selectedDreamStability = DEFAULT_DREAM_STABILITY;
                    }
                    this.syncStabilitySelection(pane);
                }
                this.applyStabilityTheme();
                playConfirmSound();
                this.updateFooter();
            });

            if (this.selectedMode === card.getAttribute('data-mode')) {
                card.classList.add('selected');
                if (this.selectedMode === 'load') {
                    savesPanel?.classList.remove('hidden');
                } else if (this.selectedMode === 'new') {
                    stabilityPanel?.classList.remove('hidden');
                    this.syncStabilitySelection(pane);
                }
            }
        });

        pane.querySelectorAll('.stability-item').forEach(item => {
            item.addEventListener('mouseenter', playHoverSound);
            item.addEventListener('click', () => {
                const id = item.getAttribute('data-stability-id') || DEFAULT_DREAM_STABILITY;
                this.selectedDreamStability = id;
                pane.querySelectorAll('.stability-item').forEach(s => s.classList.remove('selected'));
                item.classList.add('selected');
                this.applyStabilityTheme();
                playConfirmSound();
                this.updateFooter();
            });
        });
    }

    /**
     * @param {Element} pane
     */
    syncStabilitySelection(pane) {
        pane.querySelectorAll('.stability-item').forEach(item => {
            const id = item.getAttribute('data-stability-id');
            item.classList.toggle('selected', id === this.selectedDreamStability);
        });
        this.applyStabilityTheme();
    }

    /**
     * Tint the overlay background based on the chosen dream stability so the
     * user sees a visual cue that unstable dreams will skew darker. Only
     * applied when the user is on the "new game" path; otherwise revert to the
     * default sunrise palette.
     */
    async applyStabilityTheme() {
        const overlay = this.root.querySelector('.play-overlay');
        if (!overlay) return;
        overlay.classList.remove('stability-unstable', 'stability-very-unstable');
        if (this.selectedMode !== 'new') {
            await stopAllAmbiencesAndStartNewOne([{ src: './sounds/awakening-ambience.mp3', volume: 1.5 }], 1000, 1000);
            return;
        };
        if (this.selectedDreamStability === 'unstable') {
            overlay.classList.add('stability-unstable');

            await stopAllAmbiencesAndStartNewOne([{ src: './sounds/awakening-lucid.mp3', volume: 1.5 }], 1000, 1000);

        } else if (this.selectedDreamStability === 'very unstable') {
            overlay.classList.add('stability-very-unstable');

            await stopAllAmbiencesAndStartNewOne([{ src: './sounds/awakening-astral.mp3', volume: 2 }], 1000, 1000);
        } else {
            await stopAllAmbiencesAndStartNewOne([{ src: './sounds/awakening-ambience.mp3', volume: 1.5 }], 1000, 1000);
        }
    }

    // ── Step 3: Character ────────────────────────────────────────────────────────────────

    /**
     * Collect every `exposeCharacters` entry across the world script and all
     * of its dependencies.
     * @returns {Promise<Array<{ name: string, scriptKey: string, namespace: string, description: string, asset: string | null }>>}
     */
    async loadCharactersForSelectedWorld() {
        if (this.characterCache) return this.characterCache;
        if (!this.selectedWorld) return [];

        let infoMap = {};
        try {
            infoMap = await window.ENGINE_WORKER_CLIENT.jsEngineGetInfoMapForScripts({
                scripts: [{ namespace: this.selectedWorld.namespace, id: this.selectedWorld.id }],
            });
        } catch (err) {
            console.error('Failed to load script dependency map:', err);
            return [];
        }

        /** @type {Array<{ name: string, scriptKey: string, namespace: string, description: string, asset: string | null, language: string }>} */
        const characters = [];
        const seen = new Set();

        for (const [scriptKey, info] of Object.entries(infoMap)) {
            const exposeCharacters = info.exposeCharacters || {};
            for (const [name, def] of Object.entries(exposeCharacters)) {
                const dedupKey = `${scriptKey}::${name}`;
                if (seen.has(dedupKey)) continue;
                seen.add(dedupKey);
                characters.push({
                    name,
                    scriptKey,
                    // @ts-ignore
                    namespace: info.namespace,
                    // @ts-ignore
                    description: def?.description || '',
                    // @ts-ignore
                    asset: def?.asset || null,
                    // @ts-ignore
                    details: def?.details || null,
                    // @ts-ignore
                    language: def?.language || 'en',
                });
            }
        }

        characters.sort((a, b) => a.name.localeCompare(b.name));
        this.characterCache = characters;
        return characters;
    }

    /**
     * @param {Element} body
     */
    async renderCharacterStep(body) {
        body.innerHTML = `
            <div class="step-pane">
                <div class="step-heading">
                    <h2>Choose your character</h2>
                    <p class="step-sub">Pick the character you want to play as.</p>
                </div>
                <div class="world-loading">Loading characters…</div>
            </div>
        `;

        const exposed = await this.loadCharactersForSelectedWorld();

        // Self-insert option, always available and listed first.
        let userName = null;
        try {
            userName = await window.API.getConfigValue('user.name');
        } catch (err) {
            console.error('Failed to read user.name config:', err);
        }
        const selfName = (typeof userName === 'string' && userName.trim()) ? userName : 'Unnamed Dreamer';
        this.userSelfName = selfName;
        const selfCharacter = {
            name: selfName,
            scriptKey: '__self__',
            namespace: '',
            description: 'A self-insert: play as yourself.',
            asset: 'profile',
            isSelf: true,
        };

        // Party-derived options: each character the user picked in the party
        // step is also a valid "play as" choice.
        /** @type {Array<{ name: string, scriptKey: string, namespace: string, description: string, asset: string | null, details: any, isSelf?: boolean, source: 'self' | 'party' | 'world' }>} */
        const partyOptions = [];
        if (this.selectedPartyCharacters.length > 0) {
            // Load metadata for each unique namespace in the selected party.
            const nsSet = new Set(this.selectedPartyCharacters.map(p => p.namespace));
            await Promise.all(
                Array.from(nsSet).map(ns => this.loadPartyNamespaceCharacters(ns))
            );
            for (const ref of this.selectedPartyCharacters) {
                const cached = (this.partyNamespaceCache[ref.namespace] || [])
                    .find(c => c.id === ref.id);
                partyOptions.push({
                    // the name is not really known nor exposed in the ref until the character is loaded
                    name: ref.id,
                    scriptKey: `${ref.namespace}/${ref.id}`,
                    namespace: ref.namespace,
                    description: cached?.description || '',
                    asset: `assets/${ref.namespace}/${ref.id}/profile`,
                    details: cached?.metadata || null,
                    source: 'party',
                });
            }
        }

        /** @type {Array<{ name: string, scriptKey: string, namespace: string, description: string, asset: string | null, details: any, isSelf?: boolean, source: 'self' | 'party' | 'world' }>} */
        const exposedOptions = exposed.map(c => ({
            ...c,
            // @ts-ignore
            details: /** @type {any} */ (c).details,
            source: /** @type {const} */ ('world'),
        }));

        /** @type {Array<{ name: string, scriptKey: string, namespace: string, description: string, asset: string | null, details: any, isSelf?: boolean, source: 'self' | 'party' | 'world' }>} */
        const selfOptions = [{ ...selfCharacter, details: null, source: 'self' }];

        const pane = body.querySelector('.step-pane');
        if (!pane) return;

        const SPECIAL_MODES = [
            {
                id: 'narrator',
                label: 'Use narrator mode',
                description: "As a narrator you become part of the Story Master, you will not play directly as the character but instead narrate their lives, affecting how they behave. Your words cannot affect other characters and you should write in 3rd person. You will know the mental states of your character and how they feel about things, and ultimately you have the final word about how they live.",
            },
            {
                id: 'schizophrenia',
                label: 'Use schizophrenia mode',
                description: `You become a voice in the character's head (named "${selfName}") that they hear directly, and none else but that character can hear you and may reply back.`,
            },
        ];

        const specialHTML = SPECIAL_MODES.map(m => `
            <label class="special-mode-toggle" data-mode="${m.id}">
                <input type="checkbox" data-mode="${m.id}" ${this.selectedSpecialMode === m.id ? 'checked' : ''} />
                <span class="special-mode-label">${escapeHTML(m.label)}</span>
            </label>
        `).join('');

        const activeMode = SPECIAL_MODES.find(m => m.id === this.selectedSpecialMode);
        const messageHTML = activeMode
            ? `<div class="special-mode-message">${escapeHTML(activeMode.description)}</div>`
            : '';

        const renderCard = (/** @type {any} */ c) => {
            const isSelf = !!c.isSelf;
            const disabled = isSelf && this.selectedSpecialMode !== null;
            const imageHTML = c.asset
                ? `<app-asset-image image-url="${escapeHTML(c.asset)}" default-image="./images/default-profile.png"></app-asset-image>`
                : `<img class="character-default" src="./images/default-profile.png" />`;
            const detailsHTML = renderCharacterDetails(c.details);
            const displayName = c.source === 'party'
                ? formatName(escapeHTML(c.name))
                : escapeHTML(c.name);
            const nameToUseInData = c.source === 'party' ? `script://${c.scriptKey}` : c.name;
            return `
                <div class="character-card${isSelf ? ' self-insert' : ''}${disabled ? ' disabled' : ''}"
                     data-name="${escapeHTML(nameToUseInData)}"
                     data-script-key="${escapeHTML(c.scriptKey)}"
                     data-asset="${escapeHTML(c.asset || '')}"
                     ${disabled ? 'data-disabled="true"' : ''}>
                    <div class="character-card-image">${imageHTML}</div>
                    <div class="character-card-name">${displayName}</div>
                    ${c.description ? `<div class="character-card-desc">${escapeHTML(c.description)}</div>` : ''}
                    ${detailsHTML}
                    ${disabled ? '<div class="character-card-disabled-note">Not available with this mode</div>' : ''}
                </div>
            `;
        };

        const sections = [
            { title: 'Play as yourself', items: selfOptions },
            { title: "Play as a party character", items: partyOptions },
            { title: 'Play as a known world character', items: exposedOptions },
        ].filter(s => s.items.length > 0);

        const sectionsHTML = sections.map(s => `
            <div class="character-section">
                <div class="character-section-heading">${escapeHTML(s.title)}</div>
                <div class="character-grid">${s.items.map(renderCard).join('')}</div>
            </div>
        `).join('');

        pane.innerHTML = `
            <div class="step-heading">
                <h2>Choose your character</h2>
                <p class="step-sub">Pick the character you want to play as.</p>
            </div>
            <div class="special-modes">
                ${specialHTML}
                ${messageHTML}
            </div>
            <div class="character-sections">${sectionsHTML}</div>
        `;

        pane.querySelectorAll('.special-mode-toggle input[type="checkbox"]').forEach(input => {
            input.addEventListener('change', () => {
                const cb = /** @type {HTMLInputElement} */ (input);
                const mode = /** @type {'narrator' | 'schizophrenia'} */ (cb.getAttribute('data-mode'));
                if (cb.checked) {
                    this.selectedSpecialMode = mode;
                    // self-insert is incompatible with the special modes
                    if (this.selectedCharacter && this.selectedCharacter.scriptKey === '__self__') {
                        this.selectedCharacter = null;
                    }
                    playConfirmSound();
                } else if (this.selectedSpecialMode === mode) {
                    this.selectedSpecialMode = null;
                    playCancelSound();
                }
                this.applySpecialModeState(pane, SPECIAL_MODES);
            });
        });

        pane.querySelectorAll('.character-card').forEach(card => {
            card.addEventListener('mouseenter', () => {
                if (card.getAttribute('data-disabled') === 'true') return;
                playHoverSound();
            });
            card.addEventListener('click', () => {
                if (card.getAttribute('data-disabled') === 'true') return;
                const name = card.getAttribute('data-name') || '';
                const scriptKey = card.getAttribute('data-script-key') || '';
                const asset = card.getAttribute('data-asset') || '';
                this.selectedCharacter = { name, scriptKey, asset: asset || null };
                pane.querySelectorAll('.character-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                playConfirmSound();
                this.updateFooter();
            });

            if (this.selectedCharacter &&
                card.getAttribute('data-name') === this.selectedCharacter.name &&
                card.getAttribute('data-script-key') === this.selectedCharacter.scriptKey) {
                card.classList.add('selected');
            }
        });
    }

    /**
     * Update the character pane in-place when a special mode toggle changes,
     * without re-rendering the whole step (which causes flicker).
     *
     * @param {Element} pane
     * @param {Array<{ id: string, label: string, description: string }>} specialModes
     */
    applySpecialModeState(pane, specialModes) {
        // 1. Sync each checkbox so only the active mode is checked.
        pane.querySelectorAll('.special-mode-toggle input[type="checkbox"]').forEach(input => {
            const cb = /** @type {HTMLInputElement} */ (input);
            cb.checked = cb.getAttribute('data-mode') === this.selectedSpecialMode;
        });

        // 2. Update the description message in place.
        const modesContainer = pane.querySelector('.special-modes');
        if (modesContainer) {
            let messageEl = modesContainer.querySelector('.special-mode-message');
            const activeMode = specialModes.find(m => m.id === this.selectedSpecialMode);
            if (activeMode) {
                if (!messageEl) {
                    messageEl = document.createElement('div');
                    messageEl.className = 'special-mode-message';
                    modesContainer.appendChild(messageEl);
                }
                messageEl.textContent = activeMode.description;
            } else if (messageEl) {
                messageEl.remove();
            }
        }

        // 3. Disable / re-enable the self-insert card without rebuilding it.
        const selfCard = pane.querySelector('.character-card.self-insert');
        if (selfCard) {
            const shouldDisable = this.selectedSpecialMode !== null;
            selfCard.classList.toggle('disabled', shouldDisable);
            if (shouldDisable) {
                selfCard.setAttribute('data-disabled', 'true');
                if (!selfCard.querySelector('.character-card-disabled-note')) {
                    const note = document.createElement('div');
                    note.className = 'character-card-disabled-note';
                    note.textContent = 'Not available with this mode';
                    selfCard.appendChild(note);
                }
                if (selfCard.classList.contains('selected')) {
                    selfCard.classList.remove('selected');
                }
            } else {
                selfCard.removeAttribute('data-disabled');
                const note = selfCard.querySelector('.character-card-disabled-note');
                if (note) note.remove();
            }
        }

        this.updateFooter();
    }

    render() {
        const stepsHTML = STEPS.map((s, i) => `
            <div class="step" data-step="${s.id}">
                <div class="step-num">${i + 1}</div>
                <div class="step-label">${s.label}</div>
            </div>
        `).join('<div class="step-sep"></div>');

        this.root.innerHTML = `
        <link rel="stylesheet" href="components/play.css">
        <div class="play-overlay">
            <div class="play-header">
                <div class="play-title">Play</div>
                <div class="step-indicator">${stepsHTML}</div>
                <div class="play-close" id="close-btn">&times;</div>
            </div>
            <div class="play-body"></div>
            <div class="play-footer">
                <div class="play-back hidden" id="back-btn">Back</div>
                <div class="play-start disabled" id="continue-btn">Continue</div>
            </div>
        </div>
        `;
    }
}

customElements.define('app-play', PlayOverlay);
