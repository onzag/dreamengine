import { escapeHTML, formatName, renderCharacterDetails } from './character-details.js';

/** @typedef {{namespace: string, id: string, type: string, language?: string, metadata?: Record<string, any>, exposeCharacters?: DEScriptExposeCharacters}} CharacterScript */
/** @typedef {import('./party.js').PartyMember & {exposedCount: number, disabledReason: string}} CharacterOption */

/** @param {CharacterScript[]} scripts @returns {CharacterOption[]} */
export function collectExposedCharacters(scripts) {
    /** @type {CharacterOption[]} */
    const characters = [];
    const seen = new Set();
    for (const script of scripts) {
        const exposed = Object.entries(script.exposeCharacters || {});
        const system = script.namespace.startsWith('@');
        const fallback = `${system ? '@' : ''}assets/${system ? script.namespace.slice(1) : script.namespace}/${script.id}/profile`;
        const language = script.language || 'en';
        const engineLanguage = window.DREAMENGINE_LANGUAGE || 'en';
        const disabledReason = script.metadata?.__placeholder ? 'Not ready — no content in the file.'
            : script.metadata?.__in_progress ? 'Not ready — still in progress.'
            : language !== '*' && language.split('-')[0] !== engineLanguage.split('-')[0]
                ? `Not compatible — script is in ${language}, engine is in ${engineLanguage}.` : '';
        for (const [name, definition] of exposed) {
            const scriptGivenId = definition?.scriptGivenId;
            if (typeof scriptGivenId !== 'string' || !scriptGivenId.trim() || seen.has(scriptGivenId)) continue;
            seen.add(scriptGivenId);
            characters.push({
                namespace: script.namespace, id: script.id, scriptGivenId, name,
                asset: definition.asset || fallback, description: definition.description || '',
                details: definition.details || {}, exposedCount: exposed.length, disabledReason,
            });
        }
    }
    return characters.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * @param {import('./party.js').PartyMember & {disabledReason?: string}} character
 * @param {{party?: boolean, self?: boolean}} [options]
 */
export function renderCharacterCard(character, { party = false, self = false } = {}) {
    const reason = character.disabledReason || '';
    return `
        <button type="button" class="character-card${party ? ' party-card' : ''}${self ? ' self-insert' : ''}${reason ? ' disabled' : ''}"
            data-script-given-id="${escapeHTML(character.scriptGivenId)}" ${self ? 'data-self="true"' : ''}
            aria-pressed="false" ${reason ? 'disabled' : ''}>
            <span class="character-card-image"><app-asset-image image-url="${escapeHTML(character.asset)}" default-image="./images/default-profile.png"></app-asset-image></span>
            <span class="character-card-name">${formatName(escapeHTML(character.name))}</span>
            ${(character.exposedCount || 0) > 1 ? '<span class="character-card-mcs">Multiple-character script</span>' : ''}
            ${character.description ? `<span class="character-card-desc">${escapeHTML(character.description)}</span>` : ''}
            ${renderCharacterDetails(character.details)}
            ${reason || self ? `<span class="character-card-disabled-note" ${reason ? '' : 'hidden'}>${escapeHTML(reason)}</span>` : ''}
            ${party ? '<span class="party-selected-badge">✓ In party</span>' : ''}
        </button>`;
}
