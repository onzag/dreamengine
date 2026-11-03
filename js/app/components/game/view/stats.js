import '../../world-image.js';
import './tooltip.js';
import { createCharacterTags } from './character-tags.js';

/** @typedef {{ userId: string, userName: string, externalDescription: string, profileImage: string, location: string, locationSlot: string, dateTime: string, weather: string, states: DECharacterStateInPerspective[] }} StatsDisplayData */

export class Stats extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        /** @type {DECharacterPerspective | null} */
        this.currentPerspective = null;
        /** @type {StatsDisplayData | null} */
        this.displayData = null;
    }

    connectedCallback() {
        this.root.innerHTML = `<link rel="stylesheet" href="${new URL('./stats.css', import.meta.url).href}">
            <section class="glass" aria-label="Character status"><header><h1 class="user-name"></h1><app-game-tooltip class="portrait-tooltip" align-with="bottom" tabindex="0" role="button" aria-haspopup="dialog"><app-world-image class="portrait" image-url="" default-image="./images/default-profile.png" aria-hidden="true"></app-world-image></app-game-tooltip></header>
            <dl class="world-details"><div><dd class="location"></dd></div><div><dd class="date-time"></dd></div><div class="weather-row"><dd class="weather"></dd></div></dl>
            <section class="states" aria-label="Character information and current states"><div class="state-list"></div></section></section>`;
        this.updatePerspective(this.currentPerspective);
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
            externalDescription: self.characterExternalDescription,
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
            portraitTooltip.setAttribute('text', data.externalDescription || '');
            portraitTooltip.setAttribute('identifier-id', data.userId);
            portraitTooltip.setAttribute('found-as', 'character');
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
