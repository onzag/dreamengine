import { startAmbienceWithFade, stopAmbienceWithFade } from '../sound.js';

/**
 * The main in-dream game UI. Renders a transition ("falling asleep" white
 * tunnel) then settles into the main play screen with a hideable sidebar
 * and a multiline text input.
 *
 * Attributes (set by caller before append):
 *  - character-name           Display name of the chosen character
 *  - character-script-key     The script key for the chosen character ("__self__" for self insert)
 *  - is-self-insert           "true" if the player chose self-insert
 *  - special-mode             "" | "narrator" | "schizophrenia"
 *  - world-namespace          Namespace of the chosen world script
 *  - world-id                 Id of the chosen world script
 *  - mode                     "new" | "load"
 *  - save-id                  Save id when loading, otherwise empty
 *
 * Audio:
 *  - The transition sound is played from <audio id="dreamFallSound"> if it
 *    exists in the document. The element is preserved unchanged so a real
 *    file can be wired in later by simply adding/updating that <audio> tag.
 */
class GameOverlay extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });

        this.onToggleSidebar = this.onToggleSidebar.bind(this);
        this.onSubmit = this.onSubmit.bind(this);
        this.onInputKeydown = this.onInputKeydown.bind(this);

        /** @type {boolean} */
        this.sidebarOpen = true;
    }

    async connectedCallback() {
        this.render();

        const lightFade = this.root.querySelector('.light-fade');
        if (lightFade) {
            setTimeout(async () => {
                lightFade.classList.add('fade-out');
                await new Promise(resolve => setTimeout(resolve, 1100));
                lightFade.remove();
            }, 1000); // slight delay to ensure the element is visible before starting the fade
        }

        // Wire up controls.
        const toggleBtn = this.root.getElementById('sidebar-toggle');
        if (toggleBtn) toggleBtn.addEventListener('click', this.onToggleSidebar);

        const submitBtn = this.root.getElementById('submit-btn');
        if (submitBtn) submitBtn.addEventListener('click', this.onSubmit);

        const input = /** @type {HTMLTextAreaElement | null} */ (this.root.getElementById('game-input'));
        if (input) {
            input.addEventListener('input', () => {
                input.style.height = 'auto';
                input.style.height = Math.min(input.scrollHeight, window.innerHeight * 0.4) + 'px';
            });
            input.addEventListener('keydown', this.onInputKeydown);
        }
    }

    async disconnectedCallback() {
        await stopAmbienceWithFade(1000, 3);
        await startAmbienceWithFade(['./sounds/awakening-ambience.mp3'], 1000, 1);
        // @ts-expect-error
        document.querySelector('.sky').style.display = 'block';
    }

    onToggleSidebar() {
        this.sidebarOpen = !this.sidebarOpen;
        const stage = this.root.querySelector('.game-stage');
        const toggle = this.root.getElementById('sidebar-toggle');
        if (stage) stage.classList.toggle('sidebar-open', this.sidebarOpen);
        if (toggle) toggle.setAttribute('aria-expanded', String(this.sidebarOpen));
    }

    /**
     * @param {KeyboardEvent} e
     */
    onInputKeydown(e) {
        // Submit on Ctrl/Cmd+Enter (placeholder; submit is a no-op for now).
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            this.onSubmit();
        }
    }

    onSubmit() {
        // Intentional no-op for now.
    }

    render() {
        const characterName = this.getAttribute('character-name') || 'Unnamed Dreamer';
        const isSelfInsert = this.getAttribute('is-self-insert') === 'true';
        const specialMode = this.getAttribute('special-mode') || '';
        const worldNamespace = this.getAttribute('world-namespace') || '';
        const worldId = this.getAttribute('world-id') || '';

        const subtitleParts = [];
        if (specialMode === 'narrator') subtitleParts.push('Narrator');
        else if (specialMode === 'schizophrenia') subtitleParts.push('Voice in the head');
        else if (isSelfInsert) subtitleParts.push('Self-insert');
        if (worldNamespace && worldId) {
            const ns = worldNamespace.startsWith('@') ? worldNamespace.slice(1) : worldNamespace;
            subtitleParts.push(`${ns} / ${worldId}`);
        }

        this.root.innerHTML = `
        <link rel="stylesheet" href="components/game.css">
        <div class="game-root">
            <div class="game-stage sidebar-open">
                <!-- Sidebar (starts open; serves as a toolbox) -->
                <aside class="game-sidebar" aria-label="Game sidebar">
                    <div class="game-sidebar-inner">
                        <div class="game-sidebar-header">
                            <div class="game-sidebar-title">${escapeHtml(characterName)}</div>
                            ${subtitleParts.length ? `<div class="game-sidebar-subtitle">${escapeHtml(subtitleParts.join(' · '))}</div>` : ''}
                        </div>
                        <div class="game-sidebar-content">
                            <!-- intentionally empty for now -->
                        </div>
                    </div>
                </aside>

                <!-- Toggle arrow (sits between sidebar and main) -->
                <button id="sidebar-toggle" class="sidebar-toggle" aria-expanded="true" aria-label="Toggle sidebar">
                    <svg class="toggle-arrow" viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="15 6 9 12 15 18"></polyline>
                    </svg>
                </button>

                <!-- Main playfield (shrinks to fit alongside the sidebar) -->
                <main class="game-main">
                    <div class="game-background">
                        <div class="game-background-message">Starting world…</div>
                    </div>

                    <div class="game-input-bar">
                        <textarea
                            id="game-input"
                            class="game-input"
                            rows="1"
                            placeholder="What do you do…"></textarea>
                        <button id="submit-btn" class="game-submit" aria-label="Submit">
                            <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="22" y1="2" x2="11" y2="13"></line>
                                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                            </svg>
                        </button>
                    </div>
                </main>
            </div>
        </div>
        <div class="light-fade"></div>`;
    }
}

/**
 * @param {string} str
 */
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

customElements.define('app-game', GameOverlay);
