import { playSound, stopAllAmbiences } from '../../../sound.js';

export class GameOver extends HTMLElement {
    constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `<style>
:host { display: grid; place-items: safe center; overflow: auto; padding: 2vh; text-align: center;
    background: radial-gradient(ellipse at center, #282235e8, #090a11f5 72%); color: #eee8e4; }
:host([hidden]) { display: none; }
section { width: min(100%, 62vh); padding: 3vh 0; animation: appear .45s ease-out; }
.eclipse { width: 6vh; height: 6vh; margin: 0 auto 2vh; border-radius: 50%; background: #16131d;
    box-shadow: .45vh -.2vh .1vh #e3c6ad, .6vh -.2vh 2.4vh #c4928055; }
p { display: flex; align-items: center; justify-content: center; gap: 1.4vh; margin: 0;
    color: #d2b8a7; font: 600 1.6vh/1.5 system-ui, sans-serif; letter-spacing: .42vh; text-transform: uppercase; }
p::before, p::after { content: ''; width: 6vh; height: .12vh; background: #927565; }
h2 { margin: 1vh 0 3vh; font: normal 5.8vh/1.12 Georgia, serif; text-wrap: balance; }
.actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 1.4vh; }
button { min-width: 13vh; padding: 1vh 2vh; font: inherit; font-size: 2vh; cursor: pointer;
    color: #e8dfdd; background: #211d29; border: .12vh solid #756875; border-radius: .5vh; }
.wake { color: #201a20; background: #dfc9b8; border-color: #dfc9b8; }
button:hover { filter: brightness(1.2); }
button:focus-visible { outline: .25vh solid white; outline-offset: .4vh; }
@keyframes appear { from { opacity: 0; transform: translateY(.8vh); } }
@media (prefers-reduced-motion: reduce) { section { animation: none; } }
</style><section aria-labelledby="collapse">
<div class="eclipse" aria-hidden="true"></div>
<div role="status"><p>Game over</p><h2 id="collapse">Dream has collapsed</h2></div>
<div class="actions"><button class="close" type="button">Close</button><button class="wake" type="button">Wake up</button></div>
</section>`;
        this.perspectiveId = '';
        /** @type {HTMLAudioElement | undefined} */
        this.sound = undefined;
        root.querySelector('.close')?.addEventListener('click', () => this.setOpen(false));
        root.querySelector('.wake')?.addEventListener('click', () => {
            this.dispatchEvent(new CustomEvent('wake-up', { bubbles: true, composed: true }));
        });
    }

    /** @param {boolean} open */
    setOpen(open) {
        this.hidden = !open;
        this.dispatchEvent(new Event('visibility-change'));
    }

    /** An empty ID ends the visit. Dismissal lasts until the selected snapshot changes.
     * @param {string} id */
    updatePerspective(id) {
        if (this.perspectiveId === id) return;
        this.perspectiveId = id;
        this.sound?.pause();
        this.sound = undefined;
        this.setOpen(!!id);
        if (id) {
            stopAllAmbiences();
            this.sound = playSound(new URL('../../../sounds/gameover.mp3', import.meta.url).href);
        }
    }

    disconnectedCallback() { this.updatePerspective(''); }
}

customElements.define('app-game-over', GameOver);
