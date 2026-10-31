import { IdentifierDetail } from './identifier-detail.js';
import { getItemTreeContext, loadCharacterItemGroups } from './item-tree-data.js';
import { createItemTree } from './item-node.js';

const icons = {
    gender: 'M16 9a5 5 0 1 1-10 0 5 5 0 0 1 10 0ZM11 14v7m-3-3h6m1-13 5-3m-4 0h4v4',
    species: 'M12 21C5 17 3 10 4 3c7 0 14 4 16 11-1 5-4 7-8 7ZM7 7l9 10m-5-6 1-5m0 7-5 1',
    speciesType: 'M12 3v6M5 15v-3h14v3M3 16h4v5H3Zm7 0h4v5h-4Zm7 0h4v5h-4ZM10 3h4v5h-4Z',
    height: 'M9 3h11v18H9ZM9 7h5m-5 5h7m-7 5h5M4 3v18M2 5l2-2 2 2M2 19l2 2 2-2',
    weight: 'M9 6a3 3 0 1 1 6 0M6 7h12l3 14H3ZM9 13a3 3 0 0 1 6 0m-3 0 1-2',
};

/** @param {number} value @param {'height' | 'weight'} kind @param {boolean} exact */
export function formatMeasurement(value, kind, exact) {
    const useSmallUnit = value < 1;
    const converted = useSmallUnit ? value * (kind === 'weight' ? 1000 : 10) : value;
    const unit = kind === 'weight' ? (useSmallUnit ? 'g' : 'kg') : (useSmallUnit ? 'mm' : 'cm');
    // Significant digits keep even tiny creatures' measurements above zero.
    const display = exact ? converted : Number(converted.toPrecision(2));
    return `${exact ? '' : '≈ '}${display} ${unit}`;
}

/** @param {number} value @param {number} reference @param {string} name */
export function relativeSize(value, reference, name) {
    const ratio = value / reference;
    if (ratio >= 2) return `Much bigger than ${name}`;
    if (ratio > 1.1) return `Bigger than ${name}`;
    if (ratio <= 0.5) return `Much smaller than ${name}`;
    if (ratio < 0.9) return `Smaller than ${name}`;
    return `Same size as ${name}`;
}

export class CharacterDialog extends IdentifierDetail {
    constructor() { super(); this.kind = 'Character'; this.layout = 'character'; }

    /** @param {string} userId */
    async getDisplayData(userId) {
        const client = window.ENGINE_WORKER_CLIENT;
        const id = this.getAttribute('identifier-id') || '';
        const [character, name, description, visibility, user] = await Promise.all([
            client.queryDEObject({ path: ['characters', id], pick: ['metadata', 'gender', 'heightCm', 'weightKg', 'species', 'speciesType'] }),
            client.queryDEObject({ path: ['utils', 'templates', 'formatCharacterName'], call: [id, userId, { __type: 'object', value: { justName: true, capitalize: true } }] }),
            client.queryDEObject({ path: ['utils', 'characterInfo', 'getExternalDescriptionOfCharacter'], call: [id, userId] }),
            client.queryDEObject({ path: ['utils', 'characterInfo', 'whatCanTheyMakeOfAnotherCharacter'], call: [id, userId] }),
            client.queryDEObject({ path: ['characters', userId], pick: ['name', 'heightCm', 'weightKg'] }),
        ]);
        /** @type {Array<{label: string, value: string, icon: string}>} */
        const stats = [];
        /** @param {string} label @param {string} value @param {string} icon */
        const add = (label, value, icon) => {
            if (value) stats.push({ label, value: value.charAt(0).toUpperCase() + value.slice(1), icon });
        };
        const mediumOrHigher = visibility.hasMediumPerception || visibility.hasHighPerception;
        if (visibility.canTellGender) add('Gender', character.gender, icons.gender);
        if (visibility.canTellSpecies) add('Species', character.species, icons.species);
        if (visibility.canTellSpecies || mediumOrHigher) add('Species type', character.speciesType, icons.speciesType);
        for (const kind of /** @type {const} */ (['height', 'weight'])) {
            const field = kind === 'height' ? 'heightCm' : 'weightKg';
            const canTell = kind === 'height' ? visibility.canTellHeight : visibility.canTellWeight;
            const value = character[field];
            if (!Number.isFinite(value) || value <= 0) continue;
            let label = '';
            if (canTell) label = formatMeasurement(value, kind, visibility.hasHighPerception);
            else if (mediumOrHigher && Number.isFinite(user[field]) && user[field] > 0) {
                label = relativeSize(value, user[field], user.name);
            }
            add(kind === 'height' ? 'Height' : 'Weight', label, icons[kind]);
        }
        const context = await getItemTreeContext(userId);
        const content = createItemTree(await loadCharacterItemGroups(id, context), context);
        return { name, description, stats, portrait: character?.metadata?.assets?.neutral || '', banner: character?.metadata?.banner || '', content };
    }
}
customElements.define('app-game-character-dialog', CharacterDialog);
