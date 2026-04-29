import { playCancelSound, playConfirmSound, playHoverSound, playSound, startAmbienceWithFade, stopAmbienceWithFade } from '../sound.js';
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
 * @param {Record<string, string | number | boolean> | null | undefined} details
 * @returns {string}
 */
function renderCharacterDetails(details) {
    if (!details || typeof details !== 'object') return '';
    const chips = [];
    for (const [key, value] of Object.entries(details)) {
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
    { id: 'character', label: 'Character' },
];

// Placeholder list — real save loading is not yet implemented.
const EXAMPLE_SAVES = [
    { id: 'save-1', name: 'A Quiet Morning in Eldhaven', timestamp: '2026-04-21 09:14' },
    { id: 'save-2', name: 'The Storm at the Crossroads', timestamp: '2026-04-18 22:03' },
    { id: 'save-3', name: 'Whispers Beneath the Hollow', timestamp: '2026-04-12 17:48' },
];

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
        /** @type {{ name: string, scriptKey: string, asset: string | null } | null} */
        this.selectedCharacter = null;
        /** @type {'narrator' | 'schizophrenia' | null} */
        this.selectedSpecialMode = null;
        /** @type {Array<{ name: string, scriptKey: string, namespace: string, description: string, asset: string | null }> | null} */
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

        await stopAmbienceWithFade(1000, 3);
        await startAmbienceWithFade(['./sounds/awakening-ambience.mp3'], 1000, 1);
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
            await stopAmbienceWithFade(1000, 1);
            await startAmbienceWithFade(['./sounds/dream-ambience.mp3'], 1000, 3);
        }
    }

    // ── Step navigation ──────────────────────────────────────────────

    canContinue() {
        if (this.currentStepIndex === 0) return !!this.selectedWorld;
        if (this.currentStepIndex === 1) {
            if (this.selectedMode === 'new') return true;
            if (this.selectedMode === 'load') return !!this.selectedSaveId;
            return false;
        }
        if (this.currentStepIndex === 2) return !!this.selectedCharacter;
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
        if (this.currentStepIndex < STEPS.length - 1) {
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
                },
            }));
            this.startedGame = true;

            const lightFade = document.createElement('div');
            lightFade.style.position = 'fixed';
            lightFade.style.inset = '0';
            lightFade.style.background = 'white';
            lightFade.style.zIndex = '50';
            lightFade.style.pointerEvents = 'none';
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
            await stopAmbienceWithFade(1000, 1);
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
            await this.renderCharacterStep(body);
        }

        this.updateFooter();
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
                    <p class="step-sub">Select the world you want to play in.</p>
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
                    <p class="step-sub">Select the world you want to play in.</p>
                </div>
                <div class="world-empty">
                    No worlds are available. You can create one from the Manage screen.
                </div>
            `;
            return;
        }

        const groupsHTML = namespaces.map(ns => {
            const isSystem = ns.startsWith('@');
            const items = grouped[ns].map((w) => `
                <div class="world-card"
                     data-namespace="${escapeHTML(ns)}"
                     data-id="${escapeHTML(w.id)}">
                    <div class="world-card-image">
                        <app-world-image image-url="assets/${escapeHTML(ns)}/${escapeHTML(w.id)}/image"></app-world-image>
                    </div>
                    <div class="world-card-name">${formatName(escapeHTML(w.id))}</div>
                </div>
            `).join('');

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
                <p class="step-sub">Select the world you want to play in.</p>
            </div>
            <div class="world-groups">${groupsHTML}</div>
        `;

        pane.querySelectorAll('.world-card').forEach(card => {
            card.addEventListener('mouseenter', playHoverSound);
            card.addEventListener('click', () => {
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
                        <div class="mode-card-title">New Game</div>
                        <div class="mode-card-desc">Start a fresh story in this world.</div>
                    </div>
                    <div class="mode-card" data-mode="load">
                        <div class="mode-card-title">Load Saved Game</div>
                        <div class="mode-card-desc">Continue from a previous session.</div>
                    </div>
                </div>
                <div class="saves-panel hidden">
                    <div class="saves-panel-title">Pick a save</div>
                    <div class="saves-list">
                        ${EXAMPLE_SAVES.map(s => `
                            <div class="save-item" data-save-id="${escapeHTML(s.id)}">
                                <div class="save-item-name">${escapeHTML(s.name)}</div>
                                <div class="save-item-meta">${escapeHTML(s.timestamp)}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        const pane = body.querySelector('.step-pane');
        if (!pane) return;

        const savesPanel = pane.querySelector('.saves-panel');

        pane.querySelectorAll('.mode-card').forEach(card => {
            card.addEventListener('mouseenter', playHoverSound);
            card.addEventListener('click', () => {
                const mode = /** @type {'new' | 'load'} */ (card.getAttribute('data-mode'));
                this.selectedMode = mode;
                pane.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                if (mode === 'load') {
                    savesPanel?.classList.remove('hidden');
                } else {
                    savesPanel?.classList.add('hidden');
                    this.selectedSaveId = null;
                }
                playConfirmSound();
                this.updateFooter();
            });

            if (this.selectedMode === card.getAttribute('data-mode')) {
                card.classList.add('selected');
                if (this.selectedMode === 'load') {
                    savesPanel?.classList.remove('hidden');
                }
            }
        });

        pane.querySelectorAll('.save-item').forEach(item => {
            item.addEventListener('mouseenter', playHoverSound);
            item.addEventListener('click', () => {
                this.selectedSaveId = item.getAttribute('data-save-id');
                pane.querySelectorAll('.save-item').forEach(s => s.classList.remove('selected'));
                item.classList.add('selected');
                playConfirmSound();
                this.updateFooter();
            });

            if (this.selectedSaveId && item.getAttribute('data-save-id') === this.selectedSaveId) {
                item.classList.add('selected');
            }
        });
    }

    // ── Step 3: Character ────────────────────────────────────────────

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

        /** @type {Array<{ name: string, scriptKey: string, namespace: string, description: string, asset: string | null }>} */
        const characters = [];
        const seen = new Set();

        for (const [scriptKey, info] of Object.entries(infoMap)) {
            // @ts-ignore
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
        const selfCharacter = {
            name: selfName,
            scriptKey: '__self__',
            namespace: '',
            description: 'A self-insert: play as yourself.',
            asset: 'profile',
            isSelf: true,
        };

        const characters = [selfCharacter, ...exposed];

        const pane = body.querySelector('.step-pane');
        if (!pane) return;

        const SPECIAL_MODES = [
            {
                id: 'narrator',
                label: 'Use narrator mode',
                description: "As a narrator you become part of the Story Master, you will not play directly as the character but instead narrate their lives, affecting how they behave. Your words cannot affect other characters and you should write in 3rd person. You will know their mental states and how they feel about things, but ultimately you have the final word about how they live.",
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

        const cardsHTML = characters.map(c => {
            const isSelf = !!(/** @type {any} */ (c).isSelf);
            const disabled = isSelf && this.selectedSpecialMode !== null;
            const imageHTML = c.asset
                ? `<app-asset-image image-url="${escapeHTML(c.asset)}" default-image="./images/default-profile.png"></app-asset-image>`
                : `<img class="character-default" src="./images/default-profile.png" />`;
            const details = /** @type {any} */ (c).details;
            const detailsHTML = renderCharacterDetails(details);
            return `
                <div class="character-card${isSelf ? ' self-insert' : ''}${disabled ? ' disabled' : ''}"
                     data-name="${escapeHTML(c.name)}"
                     data-script-key="${escapeHTML(c.scriptKey)}"
                     data-asset="${escapeHTML(c.asset || '')}"
                     ${disabled ? 'data-disabled="true"' : ''}>
                    <div class="character-card-image">${imageHTML}</div>
                    <div class="character-card-name">${escapeHTML(c.name)}</div>
                    ${c.description ? `<div class="character-card-desc">${escapeHTML(c.description)}</div>` : ''}
                    ${detailsHTML}
                    ${disabled ? '<div class="character-card-disabled-note">Not available with this mode</div>' : ''}
                </div>
            `;
        }).join('');

        pane.innerHTML = `
            <div class="step-heading">
                <h2>Choose your character</h2>
                <p class="step-sub">Pick the character you want to play as.</p>
            </div>
            <div class="special-modes">
                ${specialHTML}
                ${messageHTML}
            </div>
            <div class="character-grid">${cardsHTML}</div>
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
