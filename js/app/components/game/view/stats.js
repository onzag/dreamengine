import '../../world-image.js';
import './tooltip.js';

/** @typedef {'somewhat'|'standard'|'very'|'overwhelming'} StatsChipColorScheme */
/** @typedef {{ id: string, label: string, description: string, dominance: number, relieving: boolean, colorScheme: StatsChipColorScheme, causes: string[] }} StatsDisplayState */
/** @typedef {{ id: string, label: string, description: string }} StatsInformationTag */
/** @typedef {{ userName: string, externalDescription: string, profileImage: string, location: string, locationSlot: string, dateTime: string, weather: string, states: StatsDisplayState[], informationTags: StatsInformationTag[] }} StatsDisplayData */

/** Character traits are separate from intensity/dominance-based states.
 * @param {(Pick<DECompleteCharacterReference, 'blindness'|'autism'> & {voice?: Pick<DEVoiceDescription, 'mute'>|null})|null} character
 * @returns {StatsInformationTag[]}
 */
export function getCharacterInformationTags(character) {
    /** @type {StatsInformationTag[]} */
    const tags = [];
    if (character?.blindness === 'full') {
        tags.push({ id: 'blindness', label: 'Totally blind', description: 'Has no vision.' });
    } else if (character?.blindness === 'partial-good' || character?.blindness === 'partial-bad') {
        tags.push({ id: 'blindness', label: 'Partially blind', description: 'Has partially impaired vision.' });
    }
    if (character?.voice?.mute === true) {
        tags.push({ id: 'mute', label: 'Mute', description: 'Cannot speak.' });
    }
    if (character && character.autism >= .25) {
        const label = character.autism >= .75 ? 'Highly autistic' : character.autism >= .5 ? 'Autistic' : 'Slightly autistic';
        tags.push({ id: 'autism', label, description: `This character is ${label.toLowerCase()}.` });
    }
    return tags;
}

/** A ready-to-use fixture: `stats.setDisplayData(STATS_DISPLAY_DATA_EXAMPLE)`. */
// export const STATS_DISPLAY_DATA_EXAMPLE = {
//     userName: 'Dema',
//     profileImage: '@assets/characters/dema-basic/profile',
//     location: 'Lunar Station', locationSlot: 'Common Area', dateTime: 'Jan 1, 2030, 09:42 AM', weather: 'Clear',
//     states: [
//         { id: 'ANXIOUS', label: 'Very Anxious', description: 'Dema is uneasy about what comes next.', dominance: 4, relieving: false, colorScheme: 'very', causes: ['an unknown signal'] },
//         { id: 'TIRED', label: 'Somewhat Tired', description: 'Dema is gradually recovering from fatigue.', dominance: 2, relieving: true, colorScheme: 'somewhat', causes: [] },
//     ],
// };

/**
 * @param {string} id
 * @returns {string}
 */
const stateLabel = id => id.split('_').filter(Boolean).map(word => word.charAt(0) + word.slice(1).toLowerCase()).join(' ');
/**
 * @param {number} intensity
 * @returns {string}
 */
const intensityPrefix = intensity => intensity < 1 ? 'Somewhat ' : intensity < 2 ? '' : intensity < 3 ? 'Very ' : 'Overwhelmingly ';
/** @param {number} intensity @returns {StatsChipColorScheme} */
const intensityColorScheme = intensity => intensity < 1 ? 'somewhat' : intensity < 2 ? 'standard' : intensity < 3 ? 'very' : 'overwhelming';

/**
 * Adds the appropriate indefinite article without duplicating one supplied by
 * a script. This is used for object causants, which cannot use the character
 * name formatter.
 * @param {string} value
 * @returns {string}
 */
export const formatIndefinite = value => {
    const name = String(value || '').trim();
    if (!name || /^(?:a|an)\s+/i.test(name)) return name;
    const word = name.split(/\s+/, 1)[0].toLowerCase();
    const usesAn = /^[aeiou]/.test(word) || /^(honest|honou?r|hour|heir)/.test(word);
    return `${usesAn ? 'an' : 'a'} ${name}`;
};

export class Stats extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        this.updateVersion = 0;
        /** @type {(() => void) | null} */ this.unsubscribe = null;
        /** @type {StatsDisplayData | null} */ this.displayData = null;
    }

    connectedCallback() {
        this.root.innerHTML = `<link rel="stylesheet" href="${new URL('./stats.css', import.meta.url).href}">
            <section class="glass" aria-label="Character status"><header><h1 class="user-name"></h1><app-game-tooltip class="portrait-tooltip" align-with="bottom"><app-world-image class="portrait" image-url="" default-image="./images/default-profile.png" aria-hidden="true"></app-world-image></app-game-tooltip></header>
            <dl class="world-details"><div><dd class="location"></dd></div><div><dd class="date-time"></dd></div><div class="weather-row"><dd class="weather"></dd></div></dl>
            <section class="states" aria-label="Character information and current states"><div class="state-list"></div></section></section>`;
        this.unsubscribe = window.ENGINE_WORKER_CLIENT?.addDEObjectUpdatedListener(() => { void this.updateStats(); }) || null;
        void this.updateStats();
    }

    disconnectedCallback() { this.unsubscribe?.(); this.unsubscribe = null; this.updateVersion++; }

    /** @param {StatsDisplayData} data */
    setDisplayData(data) { this.displayData = data; if (this.isConnected) this.render(data); }

    async updateStats() {
        const version = ++this.updateVersion;
        try {
            const data = await this.getDisplayData();
            if (!this.isConnected || version !== this.updateVersion) return;
            this.displayData = data;
            this.render(data);
        } catch (error) {
            if (this.isConnected && version === this.updateVersion) console.warn('Unable to update character stats', error);
        }
    }

    /** @returns {Promise<StatsDisplayData>} */
    async getDisplayData() {
        const userId = await window.ENGINE_WORKER_CLIENT.queryDEObject({ path: ['user'] });
        const [character, characterState, currentTime, voice] = await Promise.all([
            window.ENGINE_WORKER_CLIENT.queryDEObject({ path: ['characters', userId], pick: ['name', 'blindness', 'autism'] }),
            window.ENGINE_WORKER_CLIENT.queryDEObject({ path: ['stateFor', userId], pick: ['location', 'locationSlot', 'states'] }),
            window.ENGINE_WORKER_CLIENT.queryDEObject({ path: ['currentTime', 'time'] }),
            window.ENGINE_WORKER_CLIENT.queryDEObject({ path: ['characters', userId, 'voice'], pick: ['mute'] }),
        ]);
        const locationId = characterState?.location || await window.ENGINE_WORKER_CLIENT.queryDEObject({ path: ['world', 'currentLocation'] }) || '';
        const [weather, profileImage, externalDescription, states] = await Promise.all([
            locationId ? window.ENGINE_WORKER_CLIENT.queryDEObject({ path: ['world', 'locations', locationId, 'internalState', 'currentWeather'] }) : '',
            window.ENGINE_WORKER_CLIENT.queryDEObject({ path: ['characters', userId, 'metadata', 'assets', 'neutral'] }),
            window.ENGINE_WORKER_CLIENT.queryDEObject({
                path: ['utils', 'characterInfo', 'getExternalDescriptionOfCharacter'],
                call: [{ __type: 'char', value: userId }, { __type: 'char', value: userId }, true, false],
            }),
            this.getStatesForDisplay(userId, characterState),
        ]);
        const location = locationId ? await window.ENGINE_WORKER_CLIENT.queryDEObject({ path: ['utils', 'templates', 'formatLocationName'], call: [locationId, userId, { __type: "object", value: {type: 'default', justName: true} }] }) : '';
        const dateTime = Number.isFinite(currentTime) ? new Date(currentTime).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '';
        console.log(profileImage, location, characterState?.locationSlot, dateTime, weather, states);
        return {
            userName: character?.name || String(userId || ''),
            externalDescription: externalDescription || '',
            profileImage: profileImage || '',
            location,
            locationSlot: characterState?.locationSlot || '',
            dateTime,
            weather: weather || '',
            states,
            informationTags: getCharacterInformationTags(character ? { ...character, voice } : null),
        };
    }

    /**
     * @param {string} userId
     * @param {DEStateForCharacter | null} characterState
     * @returns {Promise<StatsDisplayState[]>}
     */
    async getStatesForDisplay(userId, characterState) {
        const definitions = await Promise.all((characterState?.states || []).map(state => window.ENGINE_WORKER_CLIENT.queryDEObject({
            path: ['characters', userId, 'stateDefinitions', state.state],
            pick: ['dominance', 'dominanceAfterRelief', 'behaviourType', 'general', 'generalAfterRelief'],
            returnExistingFunctionsAsBoolean: true,
        })));
        const candidates = (characterState?.states || []).map((state, index) => {
            const definition = definitions[index];
            if (!definition || definition.behaviourType === 'HIDDEN') return null;
            const dominance = state.relieving && typeof definition.dominanceAfterRelief === 'number' ? definition.dominanceAfterRelief : definition.dominance;
            const intensityExpressive = definition.behaviourType === 'INTENSITY_EXPRESSIVE';
            return {
                state,
                definition,
                dominance: Number(dominance) || 0,
                label: intensityExpressive ? `${intensityPrefix(state.intensity)}${stateLabel(state.state)}` : stateLabel(state.state),
                colorScheme: intensityExpressive ? intensityColorScheme(state.intensity) : 'standard',
            };
        }).filter((v) => v !== null);
        candidates.sort((a, b) => b.dominance - a.dominance || a.state.state.localeCompare(b.state.state));
        return Promise.all(candidates.map(async ({ state, definition, dominance, label, colorScheme }) => ({
            id: state.state,
            label, dominance, relieving: !!state.relieving, colorScheme,
            description: await this.getStateDescription(userId, state, definition),
            causes: await this.formatCauses(userId, state.causes || []),
        })));
    }

    /**
     * Evaluates a relief description when it exists, but deliberately falls
     * back to `general` when the relief template is absent or returns blank.
     * @param {string} userId
     * @param {DEApplyingState} state
     * @param {{ general?: string|boolean, generalAfterRelief?: string|boolean }} definition
     */
    async getStateDescription(userId, state, definition) {
        const basePath = ['characters', userId, 'stateDefinitions', state.state];
        /**
         * @param {"generalAfterRelief" | "general"} property
         * @returns {Promise<string>}
         */
        const call = async property => {
            if (!definition[property]) return '';
            const result = await window.ENGINE_WORKER_CLIENT.callCharAndCausesTemplate({ path: [...basePath, property], characterId: userId, causes: state.causes || [] });
            return typeof result === 'string' ? result.trim() : '';
        };
        return state.relieving ? await call('generalAfterRelief') || await call('general') : await call('general');
    }

    /**
     * @param {string} userId
     * @param {DEStateCause[]} causes
     * @returns {Promise<string[]>}
     */
    async formatCauses(userId, causes) {
        const client = window.ENGINE_WORKER_CLIENT;
        /**
         * @type {string[]}
         */
        const names = await Promise.all(causes.map(async cause => {
            if (!cause.causant) return cause.description;
            const causant = cause.causant.type !== 'character'
                ? formatIndefinite(cause.causant.name)
                : await client.queryDEObject({
                    path: ['utils', 'templates', 'formatCharacterName'],
                    call: [
                        { __type: "char", value: cause.causant.id },
                        { __type: "char", value: userId },
                        { __type: "object", value: {type: 'indefinite', justName: true } }
                    ]
                });
            return cause.description ? `${causant}: ${cause.description}` : causant;
        }));
        return names.length ? [await client.queryDEObject({ path: ['utils', 'templates', 'formatAnd'], call: [{__type: "object", value: names}] })] : [];
    }

    /** @param {StatsDisplayData} data */
    render(data) {
        // const data = STATS_DISPLAY_DATA_EXAMPLE;
        /**
         * @param {string} selector
         * @param {string} value
         */
        const text = (selector, value) => { const el = this.root.querySelector(selector); if (el) el.textContent = value || '—'; };
        text('.user-name', data.userName); text('.location', [data.location, data.locationSlot].filter(Boolean).join(' · ')); text('.date-time', data.dateTime); text('.weather', data.weather);
        const portrait = this.root.querySelector('app-world-image');
        if (portrait) portrait.setAttribute('image-url', data.profileImage || '');
        const portraitTooltip = this.root.querySelector('.portrait-tooltip');
        if (portraitTooltip) portraitTooltip.setAttribute('text', data.externalDescription || '');
        const list = this.root.querySelector('.state-list');
        if (!list) return;
        const informationTags = data.informationTags || [];
        const informationChips = informationTags.map(tag => {
            const tooltip = document.createElement('app-game-tooltip');
            tooltip.setAttribute('align-with', 'bottom');
            tooltip.setAttribute('text', tag.description);
            const chip = document.createElement('span');
            chip.className = 'information-chip';
            chip.dataset.traitId = tag.id;
            chip.tabIndex = 0;
            chip.textContent = tag.label;
            tooltip.append(chip);
            return tooltip;
        });
        list.replaceChildren(...informationChips, ...data.states.map(state => {
            const tooltip = document.createElement('app-game-tooltip');
            tooltip.setAttribute('align-with', 'bottom');
            tooltip.setAttribute('text', [state.description, state.causes.length ? `Caused by ${state.causes.join(', ')}` : ''].filter(Boolean).join('\n\n'));
            const chip = document.createElement('span');
            chip.className = `state-chip${state.relieving ? ' relieving' : ''}`;
            chip.dataset.stateId = state.id;
            chip.dataset.colorScheme = state.colorScheme;
            chip.tabIndex = 0;
            const label = document.createElement('span'); label.textContent = state.label; chip.append(label); tooltip.append(chip); return tooltip;
        }));
        /**
         * @type {HTMLDivElement | null}
         */
        const states = this.root.querySelector('.states');
        if (states) states.hidden = !data.states.length && !informationTags.length;
    }
}
customElements.define('app-game-stats', Stats);
