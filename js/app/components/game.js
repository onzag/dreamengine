import { playCancelSound, playConfirmSound, playHoverSound, startAmbienceWithFade, stopAmbienceWithFade } from '../sound.js';
import './world-image.js';
import './dialog.js';

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
        this.onExitClick = this.onExitClick.bind(this);

        /** @type {boolean} */
        this.sidebarOpen = false;
    }

    async connectedCallback() {
        this.render();

        // @ts-ignore
        document.querySelector('.fx').style.zIndex = '50'; // ensure fx controls are above the game UI
        // @ts-ignore
        document.querySelector('.ambience').style.zIndex = '50'; // ensure fx controls are above the game UI

        // Probe the world background and fall back to the default image if
        // the world's image asset 404s. Background images set via CSS have no
        // error event, so we check it by loading through a throwaway Image().
        const bg = /** @type {HTMLElement | null} */ (this.root.querySelector('.game-background'));
        const bgRoot = /** @type {HTMLElement | null} */ (this.root.querySelector('.game-root'));
        const probedUrl = bg?.dataset.bgUrl;
        const fallbackUrl = './images/default-world.png';
        if (bg && bgRoot && probedUrl && probedUrl !== fallbackUrl) {
            const probe = new Image();
            probe.onerror = () => {
                bg.style.backgroundImage = `url('${fallbackUrl}')`;
                bgRoot.style.backgroundImage = `url('${fallbackUrl}')`;
            };
            probe.src = probedUrl;
        }

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

        const exitBtn = this.root.getElementById('exit-btn');
        if (exitBtn) {
            exitBtn.addEventListener('mouseenter', () => playHoverSound());
            exitBtn.addEventListener('click', this.onExitClick);
        }

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
        // @ts-expect-error
        document.querySelector('.sky').style.display = 'block';
        // @ts-ignore
        document.querySelector('.fx').style.zIndex = ''; // delete z-index override to restore normal stacking
        // @ts-ignore
        document.querySelector('.ambience').style.zIndex = ''; // delete z-index override to restore normal stacking

        await stopAmbienceWithFade(1000, 3);
        await startAmbienceWithFade(['./sounds/dream-ambience.mp3'], 1000, 3);
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

    onExitClick() {
        // Avoid stacking multiple confirm dialogs.
        if (document.querySelector('app-dialog')) return;

        const dialog = document.createElement('app-dialog');
        dialog.setAttribute('dialog-title', 'Wake up?');
        dialog.setAttribute('confirmation', 'true');
        dialog.setAttribute('confirm-text', 'Wake up');
        dialog.setAttribute('cancel-text', 'Stay');
        dialog.setAttribute('extra-z-index', '100'); // ensure the dialog appears above all other elements
        dialog.textContent = 'Are you sure you want to leave the dream? Any unsaved progress will be lost.';

        dialog.addEventListener('confirm', () => {
            playConfirmSound();
            this.dispatchEvent(new CustomEvent('exit', { bubbles: true, composed: true }));
            document.body.removeChild(dialog);
        });
        dialog.addEventListener('cancel', () => {
            playCancelSound();
            document.body.removeChild(dialog);
        });

        document.body.appendChild(dialog);
    }

    render() {
        const characterName = this.getAttribute('character-name') || 'Unnamed Dreamer';
        const isSelfInsert = this.getAttribute('is-self-insert') === 'true';
        const specialMode = this.getAttribute('special-mode') || '';
        const worldNamespace = this.getAttribute('world-namespace') || '';
        const worldId = this.getAttribute('world-id') || '';
        const characterAsset = this.getAttribute('character-asset') || '';

        // Resolve the world background image. System namespaces (those whose
        // name starts with '@') live under DREAMENGINE_DEFAULT_SCRIPTS_HOME;
        // user namespaces live under DREAMENGINE_HOME. Falls back to the
        // built-in default-world image if no world is set or if the world's
        // image asset 404s (handled in connectedCallback via a probe).
        const fallbackBgUrl = './images/default-world.png';
        let worldBgUrl = fallbackBgUrl;
        if (worldNamespace && worldId) {
            const isSystem = worldNamespace.startsWith('@');
            const base = isSystem
                ? window.DREAMENGINE_DEFAULT_SCRIPTS_HOME
                : window.DREAMENGINE_HOME;
            // Normalize Windows backslashes to forward slashes — CSS url()
            // treats `\` as an escape character (so `\e` becomes U+000E etc.).
            worldBgUrl = `${base}/assets/${worldNamespace}/${worldId}/image`.replace(/\\/g, '/');
        }

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
        <div class="game-root" data-bg-url="${escapeHtml(worldBgUrl)}" style="background-image: url(&quot;${escapeHtml(worldBgUrl)}&quot;);">
            <div class="game-stage">
                <!-- Sidebar (starts open; serves as a toolbox) -->
                <aside class="game-sidebar" aria-label="Game sidebar">
                    <div class="game-sidebar-inner">
                        <div class="game-sidebar-header">
                            ${characterAsset ? `
                                <div class="game-sidebar-portrait">
                                    <app-asset-image image-url="${escapeHtml(characterAsset)}" default-image="./images/default-profile.png"></app-asset-image>
                                </div>
                            ` : ''}
                            <div class="game-sidebar-title">${escapeHtml(characterName)}</div>
                            ${subtitleParts.length ? `<div class="game-sidebar-subtitle">${escapeHtml(subtitleParts.join(' · '))}</div>` : ''}
                        </div>
                        <div class="game-sidebar-content">
                            <!-- intentionally empty for now -->
                        </div>
                        <div class="game-sidebar-footer">
                            <button id="exit-btn" class="game-sidebar-exit" type="button" aria-label="Exit game">
                                <svg viewBox="0 0 24 24" width="2.2vh" height="2.2vh" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                                    <polyline points="16 17 21 12 16 7"></polyline>
                                    <line x1="21" y1="12" x2="9" y2="12"></line>
                                </svg>
                                <span>Wake up</span>
                            </button>
                        </div>
                    </div>
                </aside>

                <!-- Toggle arrow (sits between sidebar and main) -->
                <button id="sidebar-toggle" class="sidebar-toggle" aria-expanded="false" aria-label="Toggle sidebar">
                    <svg class="toggle-arrow" viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="15 6 9 12 15 18"></polyline>
                    </svg>
                </button>

                <!-- Main playfield (shrinks to fit alongside the sidebar) -->
                <main class="game-main">
                    <div class="game-background" data-bg-url="${escapeHtml(worldBgUrl)}" style="background-image: url(&quot;${escapeHtml(worldBgUrl)}&quot;);">
                        <div class="game-background-message">
                            <div class="game-background-message-title">Starting dream...</div>
                            ${worldId ? `<div class="game-background-message-subtitle">${escapeHtml(worldId)}</div>` : ''}
                        </div>
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
