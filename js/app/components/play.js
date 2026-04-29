import { playCancelSound, playConfirmSound, playHoverSound, startAmbienceWithFade, stopAmbienceWithFade } from '../sound.js';
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

        await stopAmbienceWithFade(1000, 3);
        await startAmbienceWithFade(['./sounds/awakening-ambience.mp3'], 1000, 1);

        await this.renderStep();
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
        // @ts-expect-error
        document.querySelector('.sky').style.display = 'block';

        await stopAmbienceWithFade(1000, 1);
        await startAmbienceWithFade(['./sounds/dream-ambience.mp3'], 1000, 3);
    }

    // ── Step navigation ──────────────────────────────────────────────

    canContinue() {
        if (this.currentStepIndex === 0) return !!this.selectedWorld;
        if (this.currentStepIndex === 1) {
            if (this.selectedMode === 'new') return true;
            if (this.selectedMode === 'load') return !!this.selectedSaveId;
            return false;
        }
        return false; // step 3 placeholder
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

    onContinue() {
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
                },
            }));
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
            this.renderCharacterStep(body);
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

    // ── Step 3: Character (placeholder) ──────────────────────────────

    /**
     * @param {Element} body
     */
    renderCharacterStep(body) {
        body.innerHTML = `
            <div class="step-pane">
                <div class="step-heading">
                    <h2>Choose your character</h2>
                    <p class="step-sub">Character selection is coming soon.</p>
                </div>
                <div class="placeholder-pane">
                    Nothing here yet — this step will let you pick the character you want to play as.
                </div>
            </div>
        `;
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
