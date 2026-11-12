import { sharedStyles, characterTagStyles } from './shared-styles.js';
import '../../world-image.js';
import './tooltip.js';
import { createCharacterTags } from './character-tags.js';
import '../../dialog.js';
import { playHoverSound, playConfirmSound } from '../../../sound.js';

/** @typedef {{ userId: string, userName: string, externalDescription: string, profileImage: string, location: string, locationSlot: string, dateTime: string, weather: string, states: DECharacterStateInPerspective[] }} StatsDisplayData */

export class Stats extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        /** @type {DECharacterPerspective | null} */
        this.currentPerspective = null;
        /** @type {StatsDisplayData | null} */
        this.displayData = null;
        /** @type {DEMinimalCharacterReference[]} */
        this.partyCharacters = [];
        this.previewId = '';
        this.activeUserId = '';
        this.partyVersion = 0;
        this.committing = false;
        /** @type {HTMLElement | null} */
        this.identityDialog = null;
        /** @type {(() => void) | null} */
        this.unsubscribe = null;
    }

    connectedCallback() {
        this.root.innerHTML = `<style>
${sharedStyles}
${characterTagStyles}
:host { display: block; }
section.glass { display: flex; flex-direction: column; align-items: stretch; padding: 2vh; }
header { display: flex; flex-direction: column; align-items: flex-start; gap: .55vh; width: 100%; margin-bottom: 1.3vh; }
.portrait { --asset-image-border-width: .2vh; width: 15vh; height: 15vh; flex: 0 0 auto; }
.portrait-tooltip { width: 15vh; height: 15vh; }
h1 { width: 100%; margin: 0; color: var(--ink); font-size: 3vh; line-height: 1.1; text-align: left; padding-bottom: 1vh; font-weight: 400; }
.name-row { display: flex; align-items: center; gap: .6vh; width: 100%; }
.name-row h1 { width: auto; padding: 0; overflow-wrap: anywhere; }
.identity-controls { display: flex; flex: 0 0 auto; align-items: center; gap: .6vh; }
.identity-controls button { --control-tint: 175, 211, 245; display: grid; place-items: center; width: 3.8vh; height: 3.8vh; min-width: 28px; min-height: 28px; padding: 0; border: 1px solid rgba(var(--control-tint), .35); border-radius: 50%; background: rgba(15, 30, 55, .5); color: rgb(var(--control-tint)); font: inherit; font-size: 2.6vh; line-height: 1; cursor: pointer; box-shadow: inset 0 1px 0 #ffffff18; transition: background .16s ease, border-color .16s ease, box-shadow .16s ease, transform .16s ease; }
.identity-controls .identity-icon { display: block; transform: translateY(-0.1vh); }
.identity-controls .swap[aria-pressed="true"] { --control-tint: 255, 211, 107; background: rgba(var(--control-tint), .16); }
.identity-controls .confirm-identity { --control-tint: 126, 228, 154; }
.identity-controls .cancel-identity { --control-tint: 240, 174, 174; }
.identity-controls button:hover:not(:disabled) { background: rgba(var(--control-tint), .23); border-color: rgba(var(--control-tint), .8); box-shadow: 0 0 1.2vh rgba(var(--control-tint), .2); transform: translateY(-1px); }
.identity-controls button:active:not(:disabled) { transform: scale(.92); background: rgba(var(--control-tint), .35); box-shadow: inset 0 2px 5px #0004; }
.identity-controls button:focus-visible { outline: 2px solid rgb(var(--control-tint)); outline-offset: 3px; }
.identity-controls button:disabled { opacity: .45; cursor: wait; }
@media (prefers-reduced-motion: reduce) { .identity-controls button { transition: none; } .identity-controls button:hover:not(:disabled), .identity-controls button:active:not(:disabled) { transform: none; } }
.identity-error { color: #ffb4b4; }
[hidden] { display: none !important; }
.world-details { display: grid; grid-template-columns: minmax(0, 1fr); gap: .8vh; width: 100%; margin: 0; padding-top: 1vh; }
.weather-row { grid-column: auto; }
dt { color: var(--muted); font-size: 2vh; margin-bottom: .28vh; }
dd { margin: 0; color: var(--accent); font-size: 2vh; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.states { width: 100%; border-top: 1px solid var(--border); margin-top: 1vh; padding-top: .9vh; }
.state-list { display: flex; flex-wrap: wrap; gap: .6vh; width: 100%; }


section[hidden] { display: none; }
            </style>
            <section class="glass" aria-label="Character status"><header><div class="name-row"><h1 class="user-name" aria-live="polite"></h1><div class="identity-controls"><button class="swap" type="button" aria-label="Preview next party character" title="Preview next party character" aria-pressed="false" hidden><span class="identity-icon" aria-hidden="true">⇄</span></button><button class="cancel-identity" type="button" aria-label="Cancel character preview" title="Cancel character preview" hidden><span class="identity-icon" aria-hidden="true">×</span></button><button class="confirm-identity" type="button" aria-label="Assume character identity" title="Assume character identity" hidden><span class="identity-icon" aria-hidden="true">✓</span></button></div></div><app-game-tooltip class="portrait-tooltip" align-with="bottom" tabindex="0" role="button" aria-haspopup="dialog"><app-world-image class="portrait" image-url="" default-image="./images/default-profile.png" aria-hidden="true"></app-world-image></app-game-tooltip></header>
            <p class="identity-error" role="alert" hidden></p>
            <dl class="world-details"><div><dd class="location"></dd></div><div><dd class="date-time"></dd></div><div class="weather-row"><dd class="weather"></dd></div></dl>
            <section class="states" aria-label="Character information and current states"><div class="state-list"></div></section></section>`;
        this.updatePerspective(this.currentPerspective);
        this.root.querySelector('.swap')?.addEventListener('click', () => {
            if (this.committing || !this.partyCharacters.length) return;
            playConfirmSound();
            const index = this.partyCharacters.findIndex(character => character.id === this.previewId);
            this.previewId = this.partyCharacters[(index + 1) % this.partyCharacters.length].id;
            this.renderIdentity();
        });
        this.root.querySelector('.cancel-identity')?.addEventListener('click', () => {
            playConfirmSound();
            this.previewId = '';
            this.renderIdentity();
        });
        this.root.querySelector('.confirm-identity')?.addEventListener('click', () => this.confirmIdentity());
        for (const button of this.root.querySelectorAll('.identity-controls button')) {
            button.addEventListener('mouseenter', () => {
                if (!button.hasAttribute('disabled')) playHoverSound();
            });
        }
        this.unsubscribe = window.ENGINE_WORKER_CLIENT.addDEObjectUpdatedListener(() => void this.refreshParty());
        void this.refreshParty();
    }

    disconnectedCallback() {
        this.unsubscribe?.();
        this.unsubscribe = null;
        this.partyVersion++;
        this.identityDialog?.remove();
        this.identityDialog = null;
    }

    async refreshParty() {
        const version = ++this.partyVersion;
        try {
            const client = window.ENGINE_WORKER_CLIENT;
            const [mode, userId, party] = await Promise.all([
                client.queryDEObject({ path: ['userMode'] }),
                client.queryDEObject({ path: ['user'] }),
                client.queryDEObject({ path: ['party'] }),
            ]);
            const ids = mode === 'debug' || mode === 'disembodied'
                ? [...new Set(/** @type {string[]} */ (party || []))].filter(id => id !== userId) : [];
            const characters = await Promise.all(ids.map(id => client.queryDEObject({ path: ['characters', id] })));
            if (!this.isConnected || version !== this.partyVersion) return;
            this.partyCharacters = characters.filter(Boolean);
            if (userId !== this.activeUserId || !this.partyCharacters.some(character => character.id === this.previewId)) {
                this.previewId = '';
                this.identityDialog?.remove();
                this.identityDialog = null;
            }
            this.activeUserId = userId;
            this.renderIdentity();
        } catch (error) {
            if (version !== this.partyVersion) return;
            console.error('Failed to load party characters:', error);
            this.partyCharacters = [];
            this.previewId = '';
            this.renderIdentity();
        }
    }

    renderIdentity() {
        if (this.displayData) this.render(this.displayData);
    }

    confirmIdentity() {
        const character = this.partyCharacters.find(entry => entry.id === this.previewId);
        if (!character || this.committing || document.querySelector('app-dialog')) return;
        const userId = this.activeUserId;
        const dialog = document.createElement('app-dialog');
        this.identityDialog = dialog;
        dialog.setAttribute('dialog-title', 'Assume character identity?');
        dialog.setAttribute('confirmation', 'true');
        dialog.setAttribute('confirm-text', 'Proceed');
        dialog.textContent = `Warning, you will now take over the mind and body of character ${character.name}, this might leave the character ${this.displayData?.userName || ''} in a vulnerable/confused state if it didn't have its memories, beliefs or bonds properly managed, do you wish to proceed?`;
        const close = () => {
            dialog.remove();
            this.identityDialog = null;
            const confirm = /** @type {HTMLButtonElement | null} */ (this.root.querySelector('.confirm-identity'));
            confirm?.focus();
        };
        dialog.addEventListener('cancel', close);
        dialog.addEventListener('confirm', async () => {
            if (this.committing) return;
            close();
            this.committing = true;
            this.renderIdentity();
            try {
                await this.refreshParty();
                if (!this.isConnected || userId !== this.activeUserId || !this.partyCharacters.some(entry => entry.id === character.id)) return;
                await window.ENGINE_WORKER_CLIENT.assumeCharacterIdentity({ charId: character.id });
                this.previewId = '';
            } catch (error) {
                const message = this.root.querySelector('.identity-error');
                if (message) {
                    message.textContent = `Could not assume character identity: ${error instanceof Error ? error.message : String(error)}`;
                    message.removeAttribute('hidden');
                }
            } finally {
                this.committing = false;
                this.renderIdentity();
            }
        });
        document.body.append(dialog);
    }

    /** @param {DECharacterPerspective | null} perspective */
    updatePerspective(perspective) {
        this.currentPerspective = perspective;
        const section = this.root.querySelector('section');
        if (!section) return;
        section.hidden = !perspective;
        if (!perspective) { this.displayData = null; return; }
        const self = perspective.self;
        const time = perspective.timeOfPerspective.time;
        this.setDisplayData({
            userId: perspective.ownId,
            userName: perspective.ownName,
            externalDescription: self.characterExternalDescriptionForUser,
            profileImage: self.characterMetadata.assets?.neutral || '',
            location: perspective.ownLocationName,
            locationSlot: perspective.ownLocationSlotName,
            dateTime: Number.isFinite(time) ? new Date(time).toLocaleString('en-US', {
                hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
            }) : '',
            weather: perspective.ownLocation.weatherName,
            states: self.states,
        });
    }

    /** @param {StatsDisplayData} data */
    setDisplayData(data) { this.displayData = data; if (this.isConnected) this.render(data); }

    /** @param {StatsDisplayData} data */
    render(data) {
        const preview = this.partyCharacters.find(character => character.id === this.previewId);
        const swap = /** @type {HTMLButtonElement | null} */ (this.root.querySelector('.swap'));
        if (swap) {
            swap.hidden = !this.partyCharacters.length || (!!preview && this.partyCharacters.length === 1);
            swap.setAttribute('aria-pressed', String(!!preview));
        }
        for (const button of this.root.querySelectorAll('.identity-controls button')) {
            const control = /** @type {HTMLButtonElement} */ (button);
            control.disabled = this.committing;
            if (control !== swap) control.hidden = !preview;
        }
        this.root.querySelector('.world-details')?.toggleAttribute('hidden', !!preview);
        if (preview) data = { ...data, userId: preview.id, userName: preview.name,
            profileImage: preview.metadata.assets?.neutral || '', externalDescription: '', states: [] };
        /**
         * @param {string} selector
         * @param {string} value
         */
        const text = (selector, value) => { const el = this.root.querySelector(selector); if (el) el.textContent = value || '—'; };
        text('.user-name', data.userName); text('.location', [data.location, data.locationSlot].filter(Boolean).join(' · ')); text('.date-time', data.dateTime); text('.weather', data.weather);
        const portrait = this.root.querySelector('app-world-image');
        if (portrait) portrait.setAttribute('image-url', data.profileImage || '');
        const portraitTooltip = this.root.querySelector('.portrait-tooltip');
        if (portraitTooltip) {
            portraitTooltip.toggleAttribute('inert', !!preview);
            portraitTooltip.setAttribute('text', data.externalDescription || '');
            portraitTooltip.setAttribute('identifier-id', data.userId);
            portraitTooltip.setAttribute('found-as', 'single-character');
            portraitTooltip.setAttribute('aria-label', data.userName || 'Character details');
        }
        const list = this.root.querySelector('.state-list');
        if (!list) return;
        list.replaceChildren(...createCharacterTags(data.states));
        /**
         * @type {HTMLDivElement | null}
         */
        const states = this.root.querySelector('.states');
        if (states) states.hidden = !data.states.length;
    }
}
customElements.define('app-game-stats', Stats);
