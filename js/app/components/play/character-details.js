/**
 * @param {string} str
 */
export function escapeHTML(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * @param {string} namespace
 */
export function namespaceLabel(namespace) {
    if (!namespace) return '';
    return namespace.startsWith('@') ? namespace.slice(1) : namespace;
}

/**
 * @param {string} name
 */
export function formatName(name) {
    return name.replace(/[-_]/g, match => `<span class="separator">${match}</span>`);
}

/**
 * Format an arbitrary character detail key/value pair into a chip.
 * Special-cases `sex` and `gender` to use emojis, `years` to suffix " years",
 * and booleans to "Yes" / "No".
 *
 * @param {string} key
 * @param {string | number | boolean} rawValue
 * @returns {{ icon?: string, label: string, value: string } | null}
 */
function formatCharacterDetail(key, rawValue) {
    if (rawValue === undefined || rawValue === null || rawValue === '') return null;

    const normKey = String(key).toLowerCase();

    // Sex — biological symbols.
    if (normKey === 'sex') {
        const v = String(rawValue).toLowerCase();
        let icon = '❓';
        if (v === 'male') icon = '♂️';
        else if (v === 'female') icon = '♀️';
        else if (v === 'intersex') icon = '⚥';
        else if (v === 'none') icon = '🚫';
        return { icon, label: `Sex: ${capitalize(String(rawValue))}`, value: capitalize(String(rawValue)) };
    }

    // Gender — person glyphs to differentiate from sex.
    if (normKey === 'gender') {
        const v = String(rawValue).toLowerCase();
        let icon = '❓';
        if (v === 'male') icon = '👨';
        else if (v === 'female') icon = '👩';
        else if (v === 'ambiguous') icon = '🧑';
        else if (v === 'none') icon = '🚫';
        return { icon, label: `Gender: ${capitalize(String(rawValue))}`, value: capitalize(String(rawValue)) };
    }

    // Booleans — Yes / No.
    if (typeof rawValue === 'boolean') {
        return {
            icon: rawValue ? '✅' : '❌',
            label: capitalize(normKey),
            value: rawValue ? 'Yes' : 'No',
        };
    }

    // Years — append unit.
    if (normKey === 'years' || normKey === 'age') {
        return {
            icon: '🎂',
            label: capitalize(normKey),
            value: `${rawValue} years`,
        };
    }

    // Height.
    if (normKey === 'height') {
        return { icon: '📏', label: `Height: ${rawValue} cm`, value: `${rawValue}cm` };
    }

    // Weight.
    if (normKey === 'weight') {
        return { icon: '⚖️', label: `Weight: ${rawValue} kg`, value: `${rawValue}kg` };
    }

    // Species.
    if (normKey === 'species') {
        const cap = capitalize(String(rawValue));
        return { icon: '🧬', label: `Species: ${cap}`, value: cap };
    }

    // Species type — humanoid / feral / animal.
    if (normKey === 'speciestype') {
        const v = String(rawValue).toLowerCase();
        const icon = v === 'humanoid' ? '🧍'
            : v === 'feral' ? '🐉'
            : v === 'animal' ? '🐾'
            : '❓';
        const labelMap = /** @type {Record<string, string>} */ ({ humanoid: 'Humanoid', feral: 'Feral', animal: 'Animal' });
        const display = labelMap[v] || capitalize(String(rawValue));
        return { icon, label: `Species type: ${display}`, value: display };
    }

    // Generic fallback — no emoji, just "Key: value" text.
    return { label: capitalize(normKey), value: `${capitalize(normKey)}: ${rawValue}` };
}

/**
 * @param {string} s
 */
function capitalize(s) {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * @param {Record<string, string | number | boolean> | null | undefined} details
 * @returns {string}
 */
export function renderCharacterDetails(details) {
    if (!details || typeof details !== 'object') return '';
    const chips = [];
    for (const [key, value] of Object.entries(details)) {
        if (key.startsWith('__')) continue;
        const formatted = formatCharacterDetail(key, value);
        if (!formatted) continue;
        const iconHTML = formatted.icon
            ? `<span class="character-detail-icon">${formatted.icon}</span>`
            : '';
        chips.push(`
            <span class="character-detail-chip" title="${escapeHTML(formatted.label)}">
                ${iconHTML}
                <span class="character-detail-value">${escapeHTML(formatted.value)}</span>
            </span>
        `);
    }
    if (chips.length === 0) return '';
    return `<span class="character-card-details">${chips.join('')}</span>`;
}

