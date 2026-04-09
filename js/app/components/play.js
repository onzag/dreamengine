import { playCancelSound, playConfirmSound, playHoverSound, startAmbienceWithFade, stopAmbienceWithFade } from '../sound.js';

class PlayOverlay extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        this.onDocumentKeydown = this.onDocumentKeydown.bind(this);
    }

    async connectedCallback() {
        this.render();

        // hide stars when overlay is active (delayed to avoid flicker)
        setTimeout(() => {
            // @ts-expect-error
            document.querySelector('.sky').style.display = 'none';
        }, 200);

        document.addEventListener('keydown', this.onDocumentKeydown);

        const startBtn = this.root.getElementById('start-btn');
        if (startBtn) {
            startBtn.addEventListener('mouseenter', playHoverSound);
            startBtn.addEventListener('click', () => {
                if (startBtn.classList.contains('disabled')) return;
                playConfirmSound();
                this.dispatchEvent(new CustomEvent('start'));
            });
        }

        const closeBtn = this.root.getElementById('close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('mouseenter', playHoverSound);
            closeBtn.addEventListener('click', () => {
                playCancelSound();
                this.close();
            });
        }

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
        // @ts-expect-error
        document.querySelector('.sky').style.display = 'block';

        await stopAmbienceWithFade(1000, 1);
        await startAmbienceWithFade(['./sounds/dream-ambience.mp3'], 1000, 3);
    }

    render() {
        this.root.innerHTML = `
        <link rel="stylesheet" href="components/play.css">
        <div class="play-overlay">
            <div class="play-header">
                <div class="play-title">Play</div>
                <div class="play-close" id="close-btn">&times;</div>
            </div>
            <div class="play-body">
                <slot></slot>
            </div>
            <div class="play-footer">
                <div class="play-start disabled" id="start-btn">Start</div>
            </div>
        </div>
        `;
    }
}

customElements.define('app-play', PlayOverlay);