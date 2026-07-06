import { playCancelSound } from '../../sound.js';
import '../dialog.js';

/**
 * Capitalizes the first letter of a string.
 * @param {string} value
 * @returns {string}
 */
function capitalizeFirst(value) {
    if (!value) return value;
    return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Turns a hyphenated key (e.g. "open-to-intimate-affection") into a readable
 * label (e.g. "Open to intimate affection").
 * @param {string} key
 * @returns {string}
 */
function formatRelationshipKeyLabel(key) {
    return capitalizeFirst(key.replace(/-/g, ' '));
}

/**
 * Turns an attraction token into a human readable label.
 * @param {string} attractiveness
 * @returns {string}
 */
function formatAttractiveness(attractiveness) {
    switch (attractiveness) {
        case 'a_slight': return 'Slightly attractive';
        case 'a_moderate': return 'Moderately attractive';
        case 'a_strong': return 'Strongly attractive';
        case 'na': return 'Not attractive';
        default: return attractiveness;
    }
}

/**
 * Parses a merged relationship step key into its component parts.
 *
 * Keys are built like:
 *   {prefix}{species}_character_{sex}_{attraction}_{context}_{key}
 *   {prefix}{species}_character_{sex}_{attraction}_description
 *   {prefix}{species}_character_{context}_{key}             (e.g. any_character)
 *   {prefix}{species}_character_description
 *
 * The context segment is space separated ("In private", "In public around
 * friends"), the trailing key segment is hyphen separated ("open-to-affection"),
 * and every structural boundary is an underscore - which is what makes the
 * pieces separable.
 *
 * @param {string} step
 * @param {string} prefix
 * @returns {{species: string|null, sex: string|null, attractiveness: string|null, context: string|null, key: string}|null}
 */
function parseRelationshipStep(step, prefix) {
    const withoutPrefix = step.slice(prefix.length);

    // Species always ends with "_character"; everything before it is the type.
    const speciesMatch = withoutPrefix.match(/^(.+?)_character(?:_|$)/);
    if (!speciesMatch) return null;

    const species = speciesMatch[1];
    const rest = withoutPrefix.slice(speciesMatch[0].length);
    if (!rest) return null;

    const tokens = rest.split('_');
    const key = tokens[tokens.length - 1];

    /** @type {string|null} */
    let context = null;
    /** @type {string[]} */
    let front;
    if (key === 'description' || key === 'relationship-name') {
        front = tokens.slice(0, -1);
    } else if (tokens.length >= 2) {
        context = tokens[tokens.length - 2];
        front = tokens.slice(0, -2);
    } else {
        front = [];
    }

    /** @type {string|null} */
    let sex = null;
    /** @type {string|null} */
    let attractiveness = null;
    const frontStr = front.join('_');
    if (frontStr) {
        const attractionMatch = frontStr.match(/^(?:(.+?)_)?(a_slight|a_moderate|a_strong|na)$/);
        if (attractionMatch) {
            sex = attractionMatch[1] || null;
            attractiveness = attractionMatch[2];
        } else {
            sex = frontStr;
        }
    }

    return { species, sex, attractiveness, context, key };
}

/**
 * Renders a single relationship value (string / number / boolean / array) into
 * a `.overview-value` element, matching the styling used elsewhere in the overview.
 * @param {*} raw
 * @returns {HTMLElement}
 */
function renderRelationshipValue(raw) {
    const valueEl = document.createElement('div');
    valueEl.className = 'overview-value';

    if (raw === undefined || raw === null || raw === '') {
        valueEl.textContent = '\u2014';
    } else if (typeof raw === 'boolean') {
        const badge = document.createElement('span');
        badge.className = `overview-badge ${raw ? 'overview-badge--yes' : 'overview-badge--no'}`;
        badge.textContent = raw ? 'Yes' : 'No';
        valueEl.appendChild(badge);
    } else if (typeof raw === 'number') {
        valueEl.textContent = String(raw);
    } else if (Array.isArray(raw)) {
        const list = document.createElement('ul');
        list.className = 'overview-list';
        for (const item of raw) {
            const li = document.createElement('li');
            li.textContent = String(item);
            list.appendChild(li);
        }
        valueEl.appendChild(list);
    } else {
        const text = String(raw);
        if (text.includes('\n')) {
            const pre = document.createElement('pre');
            pre.className = 'overview-pre';
            pre.textContent = text;
            valueEl.appendChild(pre);
        } else {
            valueEl.textContent = text;
        }
    }

    return valueEl;
}

/**
 * Builds a labelled chip (category + value) for a relationship group header.
 * @param {string} category
 * @param {string} value
 * @returns {HTMLElement}
 */
function createRelationshipChip(category, value) {
    const chip = document.createElement('span');
    chip.className = 'relationship-chip';

    const categoryEl = document.createElement('span');
    categoryEl.className = 'relationship-chip-key';
    categoryEl.textContent = category;

    const valueEl = document.createElement('span');
    valueEl.className = 'relationship-chip-val';
    valueEl.textContent = value;

    chip.appendChild(categoryEl);
    chip.appendChild(valueEl);
    return chip;
}

/**
 * @typedef {Object} RelationshipGroup
 * @property {string|null} species
 * @property {string|null} sex
 * @property {string|null} attractiveness
 * @property {Map<string, *>} groupFields Context-less fields (e.g. description).
 * @property {Map<string, Map<string, *>>} contexts Context name -> (key -> value).
 */

/**
 * Parses the relationship steps that match `prefix`, groups them by
 * species / sex / attractiveness, and renders the grouped information.
 *
 * @param {*} state
 * @param {string[]} relationshipSteps
 * @param {string} prefix
 * @return {HTMLElement|null}
 */
function processRelationshipSteps(state, relationshipSteps, prefix) {
    const specificSteps = relationshipSteps.filter(step => step.startsWith(prefix));
    if (!specificSteps.length) {
        return null;
    }

    /** @type {Map<string, RelationshipGroup>} */
    const groups = new Map();

    for (const step of specificSteps) {
        const parsed = parseRelationshipStep(step, prefix);
        if (!parsed) continue;

        const { species, sex, attractiveness, context, key } = parsed;
        const groupId = `${species ?? ''}|${sex ?? ''}|${attractiveness ?? ''}`;

        let group = groups.get(groupId);
        if (!group) {
            group = {
                species,
                sex,
                attractiveness,
                groupFields: new Map(),
                contexts: new Map(),
            };
            groups.set(groupId, group);
        }

        const value = state[step];
        if (context === null) {
            group.groupFields.set(key, value);
        } else {
            let contextFields = group.contexts.get(context);
            if (!contextFields) {
                contextFields = new Map();
                group.contexts.set(context, contextFields);
            }
            contextFields.set(key, value);
        }
    }

    if (!groups.size) {
        return null;
    }

    const container = document.createElement('div');
    container.className = 'relationship-groups';

    for (const group of groups.values()) {
        const groupEl = document.createElement('div');
        groupEl.className = 'relationship-group';

        const header = document.createElement('div');
        header.className = 'relationship-group-header';
        if (group.species) {
            header.appendChild(createRelationshipChip('Species', capitalizeFirst(group.species)));
        }
        if (group.sex) {
            header.appendChild(createRelationshipChip('Sex', capitalizeFirst(group.sex)));
        }
        if (group.attractiveness) {
            header.appendChild(createRelationshipChip('Attraction', formatAttractiveness(group.attractiveness)));
        }

        let baseKey = `${prefix}${group.species ?? ''}_character_`;
        if (group.sex) baseKey += `${group.sex}_`;
        if (group.attractiveness) baseKey += `${group.attractiveness}`;

        // const copyKeyBtn = document.createElement('button');
        // copyKeyBtn.className = 'relationship-copy-btn relationship-copy-key-btn';
        // copyKeyBtn.textContent = 'Copy Key';
        // copyKeyBtn.addEventListener('click', (e) => {
        //     e.stopPropagation();
        //     navigator.clipboard.writeText(baseKey);
        //     copyKeyBtn.textContent = 'Copied!';
        //     setTimeout(() => { copyKeyBtn.textContent = 'Copy Key'; }, 1500);
        // });
        // header.appendChild(copyKeyBtn);

        header.addEventListener('click', () => {
            groupEl.classList.toggle('expanded');
        });
        groupEl.appendChild(header);

        const body = document.createElement('div');
        body.className = 'relationship-group-body';

        // Context-less fields first: relationship-name first, description second.
        const relationshipNameValue = group.groupFields.get('relationship-name');
        if (relationshipNameValue !== undefined && relationshipNameValue !== null && relationshipNameValue !== '') {
            const nameTitleEl = document.createElement('div');
            nameTitleEl.className = 'relationship-name-title';
            nameTitleEl.textContent = String(relationshipNameValue).replace("{{other_family_relation}}", "Family Member");
            body.appendChild(nameTitleEl);
        }

        const groupFieldKeys = [...group.groupFields.keys()].filter(k => k !== 'relationship-name').sort((a, b) => {
            if (a === 'description') return -1;
            if (b === 'description') return 1;
            return 0;
        });
        for (const fieldKey of groupFieldKeys) {
            const fieldEl = document.createElement('div');
            fieldEl.className = 'relationship-group-field';

            const labelRowEl = document.createElement('div');
            labelRowEl.className = 'relationship-group-field-label-row';

            const labelEl = document.createElement('div');
            labelEl.className = 'overview-label';
            labelEl.textContent = formatRelationshipKeyLabel(fieldKey);
            labelRowEl.appendChild(labelEl);

            if (fieldKey === 'description') {
                const copyBtn = document.createElement('button');
                copyBtn.className = 'relationship-copy-btn';
                copyBtn.textContent = 'Copy';
                const descValue = group.groupFields.get(fieldKey);
                copyBtn.addEventListener('click', () => {
                    navigator.clipboard.writeText(descValue != null ? String(descValue) : '');
                    copyBtn.textContent = 'Copied!';
                    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
                });
                labelRowEl.appendChild(copyBtn);
            }

            fieldEl.appendChild(labelRowEl);
            fieldEl.appendChild(renderRelationshipValue(group.groupFields.get(fieldKey)));
            body.appendChild(fieldEl);
        }

        // Per-context grouped key/value pairs.
        for (const [contextName, contextFields] of group.contexts) {
            const contextEl = document.createElement('div');
            contextEl.className = 'relationship-context';

            const contextTitle = document.createElement('div');
            contextTitle.className = 'relationship-context-title';
            contextTitle.textContent = contextName;
            contextEl.appendChild(contextTitle);

            const contextFieldsEl = document.createElement('div');
            contextFieldsEl.className = 'relationship-context-fields';

            for (const [fieldKey, value] of contextFields) {
                // "*-reason" fields are folded into the value they explain.
                if (fieldKey.endsWith('-reason') && contextFields.has(fieldKey.slice(0, -'-reason'.length))) {
                    continue;
                }

                const row = document.createElement('div');
                row.className = 'overview-row';

                const labelEl = document.createElement('div');
                labelEl.className = 'overview-label';
                labelEl.textContent = formatRelationshipKeyLabel(fieldKey);
                row.appendChild(labelEl);

                const valueEl = renderRelationshipValue(value);

                const reasonKey = `${fieldKey}-reason`;
                if (contextFields.has(reasonKey)) {
                    const reason = contextFields.get(reasonKey);
                    if (reason !== undefined && reason !== null && reason !== '') {
                        const reasonEl = document.createElement('span');
                        reasonEl.className = 'relationship-reason';
                        reasonEl.textContent = `Reason: ${String(reason)}`;
                        valueEl.appendChild(reasonEl);
                    }
                }

                row.appendChild(valueEl);
                contextFieldsEl.appendChild(row);
            }

            contextEl.appendChild(contextFieldsEl);
            body.appendChild(contextEl);
        }

        groupEl.appendChild(body);
        container.appendChild(groupEl);
    }

    return container;
}

const RELATIONSHIP_FIRST_PREFIXES = [
    [
        "acquaintance_0_10_", "Acquaintances",
    ],
    [
        "friendly_10_20_", "Friends",
    ],
    [
        "goodFriend_20_35_", "Good Friends",
    ],
    [
        "closeFriend_35_50_", "Close Friends",
    ],
    [
        "bestFriend_50_100_", "Best Friends",
    ],
    [
        "unpleasant_n10_0_", "Unpleasant Acquaintances",
    ],
    [
        "unfriendly_n20_n10_", "Unfriendly Relationships",
    ],
    [
        "antagonistic_n35_n20_", "Antagonistic Relationships",
    ],
    [
        "hostile_n50_n35_", "Hostile Relationships",
    ],
    [
        "foe_n100_n50_", "Sworn Enemies",
    ],
];

const RELATIONSHIPS_SECOND_PREFIXES = [
    [
        "noRomanticInterest_0_10_", "No Romantic Interest",
    ],
    [
        "slightRomanticInterest_10_20_", "Slight Romantic Interest",
    ],
    [
        "romanticInterest_20_35_", "Moderate Romantic Interest",
    ],
    [
        "strongRomanticInterest_35_50_", "Strong Romantic Interest",
    ],
    [
        "deepInLove_50_100_", "Deep in Love",
    ],
];

const RELATIONSHIPS_THIRD_PREFIXES = [
    [
        "nonFamily_", "Non-Family",
    ],
    [
        "family_", "Family",
    ],
];

/**
 * Builds a rich HTMLElement for a likes-list or dislikes-list, augmented with
 * the activity data produced by generate-activities.js.
 * For each item the state may contain:
 *   `like-or-dislike-is-activity-{item}`         boolean
 *   `activity-execution-template-for-{item}`     string (template with {{chars}})
 * @param {*} state
 * @param {'likes-list'|'dislikes-list'} listKey
 * @returns {HTMLElement|null}
 */
/**
 * Renders all family members collected during the wizard.
 * State keys per index i (until `family-member-to-add-{i}` is "no" or missing):
 *   `family-member-to-add-{i}`             string – relation type
 *   `family-member-to-add-{i}-name`        string – member's name
 *   `family-member-to-add-{i}-pre-create-bond`  boolean
 *   `family-member-to-add-{i}-bond-type`   string – only if pre-create-bond is true
 * @param {*} state
 * @returns {HTMLElement|null}
 */
function renderFamilyMembers(state) {
    const items = [];
    let i = 0;
    while (true) {
        const relation = state[`family-member-to-add-${i}`];
        if (relation === undefined || relation === null || relation === 'no') break;
        items.push(i);
        i++;
    }
    if (!items.length) return null;

    const container = document.createElement('div');
    container.className = 'activities-list';

    for (const idx of items) {
        const memberName = state[`family-member-to-add-${idx}-name`];
        const relation = state[`family-member-to-add-${idx}`];
        const preCreateBond = state[`family-member-to-add-${idx}-pre-create-bond`];
        const bondType = state[`family-member-to-add-${idx}-bond-type`];

        const itemEl = document.createElement('div');
        itemEl.className = 'activity-item';

        const nameEl = document.createElement('div');
        nameEl.className = 'activity-item-name';
        nameEl.textContent = memberName ? String(memberName) : '(unnamed)';
        itemEl.appendChild(nameEl);

        const relRow = document.createElement('div');
        relRow.className = 'activity-item-meta';
        const relLabel = document.createElement('span');
        relLabel.className = 'activity-meta-label';
        relLabel.textContent = 'Relation:';
        relRow.appendChild(relLabel);
        const relVal = document.createElement('span');
        relVal.className = 'activity-template-val';
        relVal.textContent = capitalizeFirst(String(relation));
        relRow.appendChild(relVal);
        itemEl.appendChild(relRow);

        if (preCreateBond !== undefined) {
            const bondRow = document.createElement('div');
            bondRow.className = 'activity-item-meta';
            const bondLabel = document.createElement('span');
            bondLabel.className = 'activity-meta-label';
            bondLabel.textContent = 'Pre-created bond:';
            bondRow.appendChild(bondLabel);
            const badge = document.createElement('span');
            badge.className = `overview-badge ${preCreateBond ? 'overview-badge--yes' : 'overview-badge--no'}`;
            badge.textContent = preCreateBond ? 'Yes' : 'No';
            bondRow.appendChild(badge);
            itemEl.appendChild(bondRow);
        }

        if (bondType) {
            const bondTypeRow = document.createElement('div');
            bondTypeRow.className = 'activity-item-meta';
            const bondTypeLabel = document.createElement('span');
            bondTypeLabel.className = 'activity-meta-label';
            bondTypeLabel.textContent = 'Bond:';
            bondTypeRow.appendChild(bondTypeLabel);
            const bondTypeVal = document.createElement('span');
            bondTypeVal.className = 'activity-template-val';
            bondTypeVal.textContent = capitalizeFirst(String(bondType));
            bondTypeRow.appendChild(bondTypeVal);
            itemEl.appendChild(bondTypeRow);
        }

        container.appendChild(itemEl);
    }

    return container;
}

/**
 * Renders all non-family relationships collected during the wizard.
 * State keys per index i (until `non-family-relationship-{i}` is false or missing):
 *   `non-family-relationship-{i}`                          boolean
 *   `non-family-relationship-{i}-name`                    string
 *   `non-family-relationship-{i}-bond-type`               string (may be "select per character...")
 *   `non-family-relationship-{i}-bond-type-for-character` string (if per-char)
 *   `non-family-relationship-{i}-bond-type-for-target`    string (if per-char)
 *   `non-family-relationship-{i}-bond2-type`              string (romantic)
 *   `non-family-relationship-{i}-bond2-type-for-character` string (if per-char)
 *   `non-family-relationship-{i}-bond2-type-for-target`   string (if per-char)
 *   `non-family-relationship-{i}-bond-time`               number (years known)
 * @param {*} state
 * @returns {HTMLElement|null}
 */
function renderNonFamilyRelationships(state) {
    const items = [];
    let i = 0;
    while (true) {
        const rel = state[`non-family-relationship-${i}`];
        if (rel === undefined || rel === null || rel === false) break;
        items.push(i);
        i++;
    }
    if (!items.length) return null;

    const charName = state['name'] || 'Character';
    const container = document.createElement('div');
    container.className = 'activities-list';

    for (const idx of items) {
        const targetName = state[`non-family-relationship-${idx}-name`];
        const bondType = state[`non-family-relationship-${idx}-bond-type`];
        const bondTypeForChar = state[`non-family-relationship-${idx}-bond-type-for-character`];
        const bondTypeForTarget = state[`non-family-relationship-${idx}-bond-type-for-target`];
        const bond2Type = state[`non-family-relationship-${idx}-bond2-type`];
        const bond2TypeForChar = state[`non-family-relationship-${idx}-bond2-type-for-character`];
        const bond2TypeForTarget = state[`non-family-relationship-${idx}-bond2-type-for-target`];
        const bondTime = state[`non-family-relationship-${idx}-bond-time`];

        const itemEl = document.createElement('div');
        itemEl.className = 'activity-item';

        const nameEl = document.createElement('div');
        nameEl.className = 'activity-item-name';
        nameEl.textContent = targetName ? String(targetName) : '(unnamed)';
        itemEl.appendChild(nameEl);

        const isPerChar = bondType === 'select per character (each character sees the other differently)';
        if (bondType) {
            if (isPerChar) {
                if (bondTypeForChar) {
                    const row = document.createElement('div');
                    row.className = 'activity-item-meta';
                    const label = document.createElement('span');
                    label.className = 'activity-meta-label';
                    label.textContent = `${charName} sees them as:`;
                    row.appendChild(label);
                    const val = document.createElement('span');
                    val.className = 'activity-template-val';
                    val.textContent = capitalizeFirst(String(bondTypeForChar));
                    row.appendChild(val);
                    itemEl.appendChild(row);
                }
                if (bondTypeForTarget) {
                    const row = document.createElement('div');
                    row.className = 'activity-item-meta';
                    const label = document.createElement('span');
                    label.className = 'activity-meta-label';
                    label.textContent = `${targetName || 'They'} see${targetName ? 's' : ''} ${charName} as:`;
                    row.appendChild(label);
                    const val = document.createElement('span');
                    val.className = 'activity-template-val';
                    val.textContent = capitalizeFirst(String(bondTypeForTarget));
                    row.appendChild(val);
                    itemEl.appendChild(row);
                }
            } else {
                const row = document.createElement('div');
                row.className = 'activity-item-meta';
                const label = document.createElement('span');
                label.className = 'activity-meta-label';
                label.textContent = 'Relationship:';
                row.appendChild(label);
                const val = document.createElement('span');
                val.className = 'activity-template-val';
                val.textContent = capitalizeFirst(String(bondType));
                row.appendChild(val);
                itemEl.appendChild(row);
            }
        }

        const isRomPerChar = bond2Type === 'select per character (each character sees the other differently)';
        if (bond2Type) {
            if (isRomPerChar) {
                if (bond2TypeForChar) {
                    const row = document.createElement('div');
                    row.className = 'activity-item-meta';
                    const label = document.createElement('span');
                    label.className = 'activity-meta-label';
                    label.textContent = `${charName}'s romantic view:`;
                    row.appendChild(label);
                    const val = document.createElement('span');
                    val.className = 'activity-template-val';
                    val.textContent = capitalizeFirst(String(bond2TypeForChar));
                    row.appendChild(val);
                    itemEl.appendChild(row);
                }
                if (bond2TypeForTarget) {
                    const row = document.createElement('div');
                    row.className = 'activity-item-meta';
                    const label = document.createElement('span');
                    label.className = 'activity-meta-label';
                    label.textContent = `${targetName || 'Their'} romantic view:`;
                    row.appendChild(label);
                    const val = document.createElement('span');
                    val.className = 'activity-template-val';
                    val.textContent = capitalizeFirst(String(bond2TypeForTarget));
                    row.appendChild(val);
                    itemEl.appendChild(row);
                }
            } else {
                const row = document.createElement('div');
                row.className = 'activity-item-meta';
                const label = document.createElement('span');
                label.className = 'activity-meta-label';
                label.textContent = 'Romantic bond:';
                row.appendChild(label);
                const val = document.createElement('span');
                val.className = 'activity-template-val';
                val.textContent = capitalizeFirst(String(bond2Type));
                row.appendChild(val);
                itemEl.appendChild(row);
            }
        }

        if (bondTime !== undefined && bondTime !== null) {
            const row = document.createElement('div');
            row.className = 'activity-item-meta';
            const label = document.createElement('span');
            label.className = 'activity-meta-label';
            label.textContent = 'Known for:';
            row.appendChild(label);
            const val = document.createElement('span');
            val.className = 'activity-template-val';
            val.textContent = `${bondTime} year${bondTime === 1 ? '' : 's'}`;
            row.appendChild(val);
            itemEl.appendChild(row);
        }

        container.appendChild(itemEl);
    }

    return container;
}

/**
 * Renders extra attractions towards specific species and species groups.
 * State keys for specific-species loop (prefix "extra-attraction-"):
 *   `extra-attraction-{i}`          boolean
 *   `extra-attraction-{i}-species`  string
 *   `extra-attraction-{i}-age-min`  number
 *   `extra-attraction-{i}-age-max`  number
 *   `extra-attraction-{i}-gender`   string
 *   `extra-attraction-{i}-sex`      string
 * State keys for species-group loop (prefix "extra-attraction-species-group-"):
 *   `extra-attraction-species-group-{i}`          boolean
 *   `extra-attraction-species-group-{i}-group`    string
 *   `extra-attraction-species-group-{i}-age-min`  number
 *   `extra-attraction-species-group-{i}-age-max`  number
 *   `extra-attraction-species-group-{i}-gender`   string
 *   `extra-attraction-species-group-{i}-sex`      string
 * @param {*} state
 * @returns {HTMLElement|null}
 */
function renderExtraAttractions(state) {
    /**
     * @param {string} prefix
     * @param {(idx: number) => {title: string, rows: {label: string, value: string}[]}} buildEntry
     * @returns {{title: string, rows: {label: string, value: string}[]}[]}
     */
    function collectLoop(prefix, buildEntry) {
        const entries = [];
        let i = 0;
        while (true) {
            const v = state[`${prefix}${i}`];
            if (!v) break;
            entries.push(buildEntry(i));
            i++;
        }
        return entries;
    }

    const specificEntries = collectLoop('extra-attraction-', (i) => {
        const species = state[`extra-attraction-${i}-species`];
        const ageMin = state[`extra-attraction-${i}-age-min`];
        const ageMax = state[`extra-attraction-${i}-age-max`];
        const gender = state[`extra-attraction-${i}-gender`];
        const sex = state[`extra-attraction-${i}-sex`];
        const rows = [];
        if (species) rows.push({ label: 'Species', value: capitalizeFirst(String(species)) });
        if (gender) rows.push({ label: 'Gender', value: capitalizeFirst(String(gender)) });
        if (sex && sex !== 'any') rows.push({ label: 'Sex', value: capitalizeFirst(String(sex)) });
        if (ageMin !== undefined && ageMax !== undefined) rows.push({ label: 'Age range', value: `${ageMin} – ${ageMax} years` });
        return { title: species ? capitalizeFirst(String(species)) : `Attraction ${i + 1}`, rows };
    });

    const groupEntries = collectLoop('extra-attraction-species-group-', (i) => {
        const group = state[`extra-attraction-species-group-${i}-group`];
        const ageMin = state[`extra-attraction-species-group-${i}-age-min`];
        const ageMax = state[`extra-attraction-species-group-${i}-age-max`];
        const gender = state[`extra-attraction-species-group-${i}-gender`];
        const sex = state[`extra-attraction-species-group-${i}-sex`];
        const rows = [];
        if (group) rows.push({ label: 'Species group', value: capitalizeFirst(String(group)) });
        if (gender) rows.push({ label: 'Gender', value: capitalizeFirst(String(gender)) });
        if (sex && sex !== 'any') rows.push({ label: 'Sex', value: capitalizeFirst(String(sex)) });
        if (ageMin !== undefined && ageMax !== undefined) rows.push({ label: 'Age range', value: `${ageMin} – ${ageMax} years` });
        return { title: group ? `${capitalizeFirst(String(group))} group` : `Group attraction ${i + 1}`, rows };
    });

    const allEntries = [...specificEntries, ...groupEntries];
    if (!allEntries.length) return null;

    const container = document.createElement('div');
    container.className = 'activities-list';

    for (const entry of allEntries) {
        const itemEl = document.createElement('div');
        itemEl.className = 'activity-item';

        const nameEl = document.createElement('div');
        nameEl.className = 'activity-item-name';
        nameEl.textContent = entry.title;
        itemEl.appendChild(nameEl);

        for (const { label, value } of entry.rows) {
            const row = document.createElement('div');
            row.className = 'activity-item-meta';
            const lbl = document.createElement('span');
            lbl.className = 'activity-meta-label';
            lbl.textContent = `${label}:`;
            row.appendChild(lbl);
            const val = document.createElement('span');
            val.className = 'activity-template-val';
            val.textContent = value;
            row.appendChild(val);
            itemEl.appendChild(row);
        }

        container.appendChild(itemEl);
    }

    return container;
}

/**
 * Renders a single intimate act card with all its consent/vocab/criteria metadata.
 * State keys per act (where {act} is the act string used as the state key id):
 *   `{act}-would-ask-consent`         boolean
 *   `{act}-consent-requesting-actions` string[]
 *   `{act}-insistence`                number (0-10)
 *   `{act}-ignore-consent`            number (0-10)
 *   `{act}-vocab-limit`               string (optional, sex acts only)
 *   `{act}-criteria-questions`        string[] (optional, sex acts only)
 * @param {*} state
 * @param {string} act
 * @returns {HTMLElement}
 */
function renderIntimateActCard(state, act) {
    const itemEl = document.createElement('div');
    itemEl.className = 'activity-item';

    const nameEl = document.createElement('div');
    nameEl.className = 'activity-item-name';
    nameEl.textContent = String(act).replace(/\{\{char\}\}/g, state['name'] || 'Character').replace(/\{\{other\}\}/g, 'Other');
    itemEl.appendChild(nameEl);

    /**
     * @param {string} label
     * @param {string} value
     */
    const addMeta = (label, value) => {
        const row = document.createElement('div');
        row.className = 'activity-item-meta';
        const lbl = document.createElement('span');
        lbl.className = 'activity-meta-label';
        lbl.textContent = `${label}:`;
        row.appendChild(lbl);
        const val = document.createElement('span');
        val.className = 'activity-template-val';
        val.textContent = value;
        row.appendChild(val);
        itemEl.appendChild(row);
    };

    /**
     * @param {string} label
     * @param {boolean} yes
     */
    const addBadge = (label, yes) => {
        const row = document.createElement('div');
        row.className = 'activity-item-meta';
        const lbl = document.createElement('span');
        lbl.className = 'activity-meta-label';
        lbl.textContent = `${label}:`;
        row.appendChild(lbl);
        const badge = document.createElement('span');
        badge.className = `overview-badge ${yes ? 'overview-badge--yes' : 'overview-badge--no'}`;
        badge.textContent = yes ? 'Yes' : 'No';
        row.appendChild(badge);
        itemEl.appendChild(row);
    };

    const vocabLimit = state[`${act}-vocab-limit`];
    if (vocabLimit && vocabLimit !== 'none' && vocabLimit !== 'normal') {
        addMeta('Vocal expression', capitalizeFirst(String(vocabLimit)));
    }

    const criteriaQuestions = state[`${act}-criteria-questions`];
    if (Array.isArray(criteriaQuestions) && criteriaQuestions.length) {
        const row = document.createElement('div');
        row.className = 'activity-item-meta';
        const lbl = document.createElement('span');
        lbl.className = 'activity-meta-label';
        lbl.textContent = 'Ends when:';
        row.appendChild(lbl);
        const ul = document.createElement('ul');
        ul.className = 'overview-list';
        ul.style.margin = '0';
        for (const q of criteriaQuestions) {
            const li = document.createElement('li');
            li.textContent = String(q).replace(/\{\{char\}\}/g, state['name'] || 'Character').replace(/\{\{other\}\}/g, 'Other');
            ul.appendChild(li);
        }
        row.appendChild(ul);
        itemEl.appendChild(row);
    }

    const wouldAskConsent = state[`${act}-would-ask-consent`];
    if (wouldAskConsent !== undefined) {
        addBadge('Asks consent', wouldAskConsent);
    }

    if (wouldAskConsent) {
        const consentActions = state[`${act}-consent-requesting-actions`];
        if (Array.isArray(consentActions) && consentActions.length) {
            const row = document.createElement('div');
            row.className = 'activity-item-meta';
            const lbl = document.createElement('span');
            lbl.className = 'activity-meta-label';
            lbl.textContent = 'Consent actions:';
            row.appendChild(lbl);
            const ul = document.createElement('ul');
            ul.className = 'overview-list';
            ul.style.margin = '0';
            for (const a of consentActions) {
                const li = document.createElement('li');
                li.textContent = String(a).replace(/\{\{char\}\}/g, state['name'] || 'Character').replace(/\{\{other\}\}/g, 'Other');
                ul.appendChild(li);
            }
            row.appendChild(ul);
            itemEl.appendChild(row);
        }

        const insistence = state[`${act}-insistence`];
        if (insistence !== undefined && insistence !== null) {
            addMeta('Insistence after refusal', `${insistence} / 10`);
        }

        const ignoreConsent = state[`${act}-ignore-consent`];
        if (ignoreConsent !== undefined && ignoreConsent !== null) {
            addMeta('Likelihood to ignore refusal', `${ignoreConsent} / 10`);
        }
    }

    return itemEl;
}

/**
 * Renders a list of intimate acts from a state list key.
 * @param {*} state
 * @param {string} listKey
 * @returns {HTMLElement|null}
 */
function renderActList(state, listKey) {
    const acts = state[listKey];
    if (!Array.isArray(acts) || !acts.length) return null;

    const container = document.createElement('div');
    container.className = 'activities-list';

    for (const act of acts) {
        container.appendChild(renderIntimateActCard(state, act));
    }

    return container;
}

/**
 * Renders the "open-to" sex responses section, including reversed-kinks reactions
 * and the vocab/reaction for each sex act question.
 * State keys:
 *   `reversed-kinks-question`            string
 *   `reversed-kinks-reaction-loved`      string
 *   `reversed-kinks-reaction-unloved`    string
 *   `sex-acts-open-to-questions`         string[]
 *   `sex-acts-open-to-vocab-{q}`         string
 *   `sex-acts-open-to-loved-reaction-{q}` string
 * @param {*} state
 * @returns {HTMLElement|null}
 */
function renderOpenToSex(state) {
    const charName = state['name'] || 'Character';

    /**
     * @param {string} text
     * @returns {string}
     */
    const replacePlaceholders = (text) => String(text)
        .replace(/\{\{char\}\}/g, charName)
        .replace(/\{\{other\}\}/g, 'Other');

    /**
     * @param {string} label
     * @param {string} value
     * @param {HTMLElement} parent
     */
    const addMeta = (label, value, parent) => {
        const row = document.createElement('div');
        row.className = 'activity-item-meta';
        const lbl = document.createElement('span');
        lbl.className = 'activity-meta-label';
        lbl.textContent = `${label}:`;
        row.appendChild(lbl);
        const val = document.createElement('span');
        val.className = 'activity-template-val';
        val.textContent = value;
        row.appendChild(val);
        parent.appendChild(row);
    };

    const items = [];

    const reversedKinksQuestion = state['reversed-kinks-question'];
    const reversedKinksReactionLoved = state['reversed-kinks-reaction-loved'];
    const reversedKinksReactionUnloved = state['reversed-kinks-reaction-unloved'];

    if (reversedKinksQuestion || reversedKinksReactionLoved || reversedKinksReactionUnloved) {
        const card = document.createElement('div');
        card.className = 'activity-item';
        const title = document.createElement('div');
        title.className = 'activity-item-name';
        title.textContent = 'Unwanted kink behaviour';
        card.appendChild(title);
        if (reversedKinksQuestion) addMeta('Trigger question', replacePlaceholders(reversedKinksQuestion), card);
        if (reversedKinksReactionLoved) addMeta('Reaction (attracted to them)', replacePlaceholders(reversedKinksReactionLoved), card);
        if (reversedKinksReactionUnloved) addMeta('Reaction (not attracted)', replacePlaceholders(reversedKinksReactionUnloved), card);
        items.push(card);
    }

    const openToQuestions = state['sex-acts-open-to-questions'];
    if (Array.isArray(openToQuestions)) {
        for (const q of openToQuestions) {
            const card = document.createElement('div');
            card.className = 'activity-item';
            const title = document.createElement('div');
            title.className = 'activity-item-name';
            title.textContent = replacePlaceholders(String(q));
            card.appendChild(title);
            const vocab = state[`sex-acts-open-to-vocab-${q}`];
            if (vocab && vocab !== 'none' && vocab !== 'normal') addMeta('Vocal expression', capitalizeFirst(String(vocab)), card);
            const reactionLoved = state[`sex-acts-open-to-loved-reaction-${q}`];
            if (reactionLoved) addMeta('Reaction (attracted to them)', replacePlaceholders(String(reactionLoved)), card);
            items.push(card);
        }
    }

    if (!items.length) return null;

    const container = document.createElement('div');
    container.className = 'activities-list';
    for (const item of items) container.appendChild(item);
    return container;
}

/**
 * Renders a list of activities.
 * @param {*} state 
 * @param {string} listKey 
 * @returns {HTMLElement|null}
 */
/**
 * Renders all yes/no questions for a single bond trigger id produced by askYesNo.
 * State keys:
 *   `{id}-questions`                  string[]
 *   `{id}-description-{question}`     string
 *   `{id}-emotions-{question}`        string[]
 * @param {*} state
 * @param {string} id
 * @returns {HTMLElement|null}
 */
function renderBondTriggers(state, id) {
    const questions = state[`${id}-questions`];
    if (!Array.isArray(questions) || !questions.length) return null;

    const charName = state['name'] || 'Character';
    /**
     * 
     * @param {string} text 
     * @returns 
     */
    const replacePlaceholders = (text) => String(text)
        .replace(/\{\{char\}\}/g, charName)
        .replace(/\{\{other\}\}/g, 'Other');

    const container = document.createElement('div');
    container.className = 'activities-list';

    for (const question of questions) {
        const itemEl = document.createElement('div');
        itemEl.className = 'activity-item';

        const nameEl = document.createElement('div');
        nameEl.className = 'activity-item-name';
        nameEl.textContent = replacePlaceholders(String(question));
        itemEl.appendChild(nameEl);

        const description = state[`${id}-description-${question}`];
        if (description) {
            const row = document.createElement('div');
            row.className = 'activity-item-meta';
            const lbl = document.createElement('span');
            lbl.className = 'activity-meta-label';
            lbl.textContent = 'If yes:';
            row.appendChild(lbl);
            const val = document.createElement('span');
            val.className = 'activity-template-val';
            val.textContent = replacePlaceholders(String(description));
            row.appendChild(val);
            itemEl.appendChild(row);
        }

        const emotions = state[`${id}-emotions-${question}`];
        if (Array.isArray(emotions) && emotions.length) {
            const row = document.createElement('div');
            row.className = 'activity-item-meta';
            const lbl = document.createElement('span');
            lbl.className = 'activity-meta-label';
            lbl.textContent = 'Emotions:';
            row.appendChild(lbl);
            const val = document.createElement('span');
            val.className = 'activity-template-val';
            val.textContent = emotions.join(', ');
            row.appendChild(val);
            itemEl.appendChild(row);
        }

        container.appendChild(itemEl);
    }

    return container;
}

/**
 * 
 * @param {*} state 
 * @param {string} listKey 
 * @returns {HTMLElement|null}
 */
function renderActivitiesList(state, listKey) {
    const items = state[listKey];
    if (!Array.isArray(items) || items.length === 0) return null;

    const container = document.createElement('div');
    container.className = 'activities-list';

    for (const item of items) {
        const itemEl = document.createElement('div');
        itemEl.className = 'activity-item';

        const nameEl = document.createElement('div');
        nameEl.className = 'activity-item-name';
        nameEl.textContent = String(item);
        itemEl.appendChild(nameEl);

        const isActivity = state[`like-or-dislike-is-activity-${item}`];
        const template = state[`activity-execution-template-for-${item}`];

        if (isActivity !== undefined) {
            const typeRow = document.createElement('div');
            typeRow.className = 'activity-item-meta';

            const typeLabel = document.createElement('span');
            typeLabel.className = 'activity-meta-label';
            typeLabel.textContent = 'Type:';
            typeRow.appendChild(typeLabel);

            const badge = document.createElement('span');
            badge.className = `overview-badge ${isActivity ? 'overview-badge--yes' : 'overview-badge--no'}`;
            badge.textContent = isActivity ? 'Activity' : 'Topic of Conversation';
            typeRow.appendChild(badge);

            itemEl.appendChild(typeRow);
        }

        if (template) {
            const templateRow = document.createElement('div');
            templateRow.className = 'activity-item-meta';

            const templateLabel = document.createElement('span');
            templateLabel.className = 'activity-meta-label';
            templateLabel.textContent = 'Template:';
            templateRow.appendChild(templateLabel);

            const templateVal = document.createElement('span');
            templateVal.className = 'activity-template-val';
            templateVal.textContent = String(template);
            templateRow.appendChild(templateVal);

            itemEl.appendChild(templateRow);
        }

        container.appendChild(itemEl);
    }

    return container;
}

const SECTIONS = [
    {
        title: 'Character Overview',
        fields: [
            {
                label: 'Name',
                key: 'name',
            },
            {
                label: 'Species',
                key: 'species',
            },
            {
                label: 'Species Type',
                key: 'species-type',

                /**
                 * @param {*} s 
                 * @returns 
                 */
                custom: (s) => {
                    const type = s['species-type'];
                    if (type === "feral") {
                        return "Feral (a non-human creature, often animalistic, with intelligence and may be capable of speech)";
                    } else if (type === "humanoid") {
                        return "Humanoid (an anthrophomorphic or human character)";
                    } else if (type === "animal") {
                        return "Animal (an animal with limited intelligence and no speech capabilities)";
                    }
                }
            },
            {
                label: 'Race',
                key: 'race',
            },
            {
                label: 'Group Belonging',
                key: 'group-belonging',
            },
            {
                label: 'Age',
                key: 'age-years',
                unit: 'years',
            },
            {
                label: 'Height',
                key: 'height-cm',
                unit: 'cm',
            },
            {
                label: 'Gender',
                key: 'gender',
            },
            {
                label: 'Sex',
                key: 'sex',
            },
            {
                label: 'Tier',
                key: 'tier',
            },
            {
                label: 'One sentence description',
                key: 'one-sentence-description',
            },
            {
                label: 'Description',
                key: 'character-description',
            },
            {
                label: 'Appearance',
                key: 'character-short-description',
            },
            {
                label: 'Added When Top Naked',
                key: 'character-short-description-top-naked-add',
            },
            {
                label: 'Added When Bottom Naked',
                key: 'character-short-description-bottom-naked-add',
            },
            {
                label: 'Is Schizophrenic',
                key: 'schizophrenia-question',
            },
            {
                label: "Schizophrenia Severity",
                key: 'schizophrenia-severity',
            },
            {
                label: 'Schizophrenia Voice Description',
                key: 'schizophrenia-voice-description',
            },
            {
                label: 'Is Autistic',
                key: 'autism',
            },
            {
                label: 'Autism Severity',
                key: 'autism-severity',
            },
            {
                label: 'Common Emotions',
                key: 'common-emotions',
            },
            {
                label: 'Uncommon Emotions',
                key: 'uncommon-emotions',
            },
            {
                label: 'Carrying Capacity',
                key: 'carrying-capacity',
                unit: 'kg',
            },
            {
                label: 'Baby Or Weakling',
                key: 'baby-or-weakened',
            },
            {
                label: 'Young Or Weakling',
                key: 'young-or-weakened',
                /**
                 * @param {*} s 
                 * @returns 
                 */
                custom: (s) => {
                    return s['young-or-weakened'] || false;
                }
            },
            {
                label: 'Prime Physique',
                key: 'prime',
                /**
                 * @param {*} s 
                 * @returns 
                 */
                custom: (s) => {
                    return s['prime'] || false;
                }
            },
            {
                label: 'High Initiative',
                key: 'high-initiative',
            },
            {
                label: 'Annoyingly Social',
                key: 'annoyingly-social',
                /**
                 * @param {*} s 
                 * @returns 
                 */
                custom: (s) => {
                    return s['annoyingly-social'] || false;
                }
            },
            {
                label: 'Shy',
                key: 'shy',
            },
            {
                label: 'Completely Asocial',
                key: 'completely-asocial',
                /**
                 * @param {*} s 
                 * @returns 
                 */
                custom: (s) => {
                    return s['completely-asocial'] || false;
                }
            },
            {
                label: 'Stealth',
                key: 'stealth',
            },
            {
                label: 'Perception',
                key: 'perception',
            },
            {
                label: 'Heroism',
                key: 'heroism',
            },
            {
                label: 'Violence',
                key: 'violence',
            },
            {
                label: 'Attractiveness',
                key: 'attractiveness',
            },
            {
                label: 'Charisma',
                key: 'charisma',
            },
            {
                label: 'Skepticism',
                key: 'skepticism',
            },
            {
                label: 'Character is Mute',
                key: 'mute',
                /**
                 * @param {*} s 
                 * @returns 
                 */
                custom: (s) => {
                    // default to true because mute is only non-available in the state
                    // if the character is an animal, otherwise it might be false or true for humanoids and ferals
                    return typeof s['mute'] === 'boolean' ? s['mute'] : true;
                }
            },
            {
                label: "Family Members",
                key: 'family-member-to-add-0',
                /**
                 * @param {*} s
                 * @returns {HTMLElement|null}
                 */
                custom: (s) => renderFamilyMembers(s),
            },
            {
                label: "Non-Family Relationships",
                key: 'non-family-relationship-0',
                /**
                 * @param {*} s
                 * @returns {HTMLElement|null}
                 */
                custom: (s) => renderNonFamilyRelationships(s),
            },
            {
                label: "Likes and Interests",
                key: 'likes-list',
                /**
                 * @param {*} s
                 * @returns {HTMLElement|null}
                 */
                custom: (s) => renderActivitiesList(s, 'likes-list'),
            },
            {
                label: "Dislikes",
                key: 'dislikes-list',
                /**
                 * @param {*} s
                 * @returns {HTMLElement|null}
                 */
                custom: (s) => renderActivitiesList(s, 'dislikes-list'),
            },
            {
                label: "Prejudiced Against (Species)",
                key: 'prejudices-species',
            },
            {
                label: "Prejudiced Against (Races)",
                key: 'prejudices-races',
            },
            {
                label: "Prejudiced Against (Groups)",
                key: 'prejudices-groups',
            },
            {
                label: "Gossip",
                key: 'gossip',
            },
        ]
    },
    {
        title: "Character Sexuality",
        fields: [
            {
                label: "Asexual (True Asexual)",
                key: 'asexual',
            },
            {
                label: "Libido",
                key: 'libido',
            },
            {
                label: "Min Age (same species group)",
                key: 'min-age-of-attraction',
                unit: 'years',
            },
            {
                label: "Max Age (same species group)",
                key: 'max-age-of-attraction',
                unit: 'years',
            },
            {
                label: "Pansexual",
                key: 'pansexual',
            },
            {
                label: "Attracted to Males",
                key: 'finds-males-attractive',
            },
            {
                label: "Male attraction is sex based",
                key: 'finds-males-attractive-limit-to-sex',
            },
            {
                label: "Pickiness with Males",
                key: 'pickiness-males',
            },
            {
                label: "Attracted to Females",
                key: 'finds-females-attractive',
            },
            {
                label: "Female attraction is sex based",
                key: 'finds-females-attractive-limit-to-sex',
            },
            {
                label: "Pickiness with Females",
                key: 'pickiness-females',
            },
            {
                label: "Attracted to Ambiguous",
                key: 'attracted-to-ambiguous',
            },
            {
                label: "Pickiness with Ambiguous",
                key: 'pickiness-ambiguous-genders',
            },
            {
                label: "Additional Attractions",
                key: 'extra-attraction-0',
                /**
                 * @param {*} s
                 * @returns {HTMLElement|null}
                 */
                custom: (s) => renderExtraAttractions(s),
            },
            {
                label: "Kinks and Fetishes",
                key: 'kinks',
            },
            {
                label: "Kinks (Male Only)",
                key: 'kinks-for-males',
            },
            {
                label: "Kinks (Female Only)",
                key: 'kinks-for-females',
            },
            {
                label: "Dislikes and Turn-offs",
                key: 'reversed-kinks',
            },
            {
                label: "Intimate Verbality",
                key: 'intimate-verbality',
            },
            // TODO affection showcases with requesting actions and all that stuff
            {
                label: "Affection Showcases",
                key: 'affection-showcases',
                /**
                 * @param {*} s
                 * @returns {HTMLElement|null}
                 */
                custom: (s) => renderActList(s, 'affection-showcases'),
            },
            {
                label: "Intimate Affection (Males)",
                key: 'intimate-affection-for-males',
                /**
                 * @param {*} s
                 * @returns {HTMLElement|null}
                 */
                custom: (s) => renderActList(s, 'intimate-affection-for-males'),
            },
            {
                label: "Intimate Affection (Females)",
                key: 'intimate-affection-for-females',
                /**
                 * @param {*} s
                 * @returns {HTMLElement|null}
                 */
                custom: (s) => renderActList(s, 'intimate-affection-for-females'),
            },
            {
                label: "Intimate Affection (Ambiguous)",
                key: 'intimate-affection-for-ambiguous',
                /**
                 * @param {*} s
                 * @returns {HTMLElement|null}
                 */
                custom: (s) => renderActList(s, 'intimate-affection-for-ambiguous'),
            },
            {
                label: "Sex Acts (Males)",
                key: 'sex-acts-for-males',
                /**
                 * @param {*} s
                 * @returns {HTMLElement|null}
                 */
                custom: (s) => renderActList(s, 'sex-acts-for-males'),
            },
            {
                label: "Sex Acts (Females)",
                key: 'sex-acts-for-females',
                /**
                 * @param {*} s
                 * @returns {HTMLElement|null}
                 */
                custom: (s) => renderActList(s, 'sex-acts-for-females'),
            },
            {
                label: "Sex Acts (Ambiguous)",
                key: 'sex-acts-for-ambiguous',
                /**
                 * @param {*} s
                 * @returns {HTMLElement|null}
                 */
                custom: (s) => renderActList(s, 'sex-acts-for-ambiguous'),
            },
            {
                label: "Open-to Sex Responses",
                key: 'sex-acts-open-to-questions',
                /**
                 * @param {*} s
                 * @returns {HTMLElement|null}
                 */
                custom: (s) => renderOpenToSex(s),
            },
        ]
    },
    {
        title: "Character Bond Triggers",
        fields: [
            {
                label: "Likes (Any Level)",
                key: 'like-at-any-level-questions',
                /**
                 * @param {*} s
                 * @returns {HTMLElement|null}
                 */
                custom: (s) => renderBondTriggers(s, 'like-at-any-level'),
            },
            {
                label: "Dislikes (Any Level)",
                key: 'dislike-at-any-level-questions',
                /**
                 * @param {*} s
                 * @returns {HTMLElement|null}
                 */
                custom: (s) => renderBondTriggers(s, 'dislike-at-any-level'),
            },
            {
                label: "Likes (Strangers)",
                key: 'like-strangers-questions',
                /**
                 * @param {*} s
                 * @returns {HTMLElement|null}
                 */
                custom: (s) => renderBondTriggers(s, 'like-strangers'),
            },
            {
                label: "Dislikes (Strangers)",
                key: 'dislike-strangers-questions',
                /**
                 * @param {*} s
                 * @returns {HTMLElement|null}
                 */
                custom: (s) => renderBondTriggers(s, 'dislike-strangers'),
            },
        ]
    },
    ...[
        ["strangerNeutral_n5_5_", "Neutral Strangers"],
        ["strangerGood_5_100_", "Good Strangers"],
        ["strangerBad_n100_n5_", "Bad Strangers"],
    ].flatMap(([strangerPrefix, strangerLabel]) =>
        RELATIONSHIPS_SECOND_PREFIXES.map(([secondPrefix, secondLabel]) => ({
            title: `Relationships (${strangerLabel}, ${secondLabel})`,
            /**
             * @param {*} s
             * @return {HTMLElement | null}
             */
            custom: (s) => {
                const stepsInfo = s[".steps"];
                // Strangers carry a romantic-interest layer (but no family layer),
                // so the prefix combines the stranger key with the romantic interest.
                const typeToProcessPrefix = strangerPrefix + secondPrefix;
                return processRelationshipSteps(s, stepsInfo, typeToProcessPrefix);
            }
        }))
    ),
    ...RELATIONSHIP_FIRST_PREFIXES.flatMap(([firstPrefix, firstLabel]) =>
        RELATIONSHIPS_SECOND_PREFIXES.flatMap(([secondPrefix, secondLabel]) =>
            RELATIONSHIPS_THIRD_PREFIXES.map(([thirdPrefix, thirdLabel]) => ({
                title: `Relationships (${firstLabel}, ${secondLabel}, ${thirdLabel})`,
                /**
                 * @param {*} s
                 * @return {HTMLElement | null}
                 */
                custom: (s) => {
                    const stepsInfo = s[".steps"];
                    const typeToProcessPrefix = firstPrefix + secondPrefix + thirdPrefix;
                    return processRelationshipSteps(s, stepsInfo, typeToProcessPrefix);
                }
            }))
        )
    ),
]

class CharacterOverview extends HTMLElement {
    constructor() {
        super();
        /** @type {HTMLElement | null} */
        this._dialog = null;
        /** @type {HTMLElement | null} */
        this._contentArea = null;
    }

    connectedCallback() {
        const dialog = document.createElement('app-dialog');
        dialog.setAttribute('dialog-title', 'Wizard Overview');
        dialog.setAttribute('confirmation', 'true');
        dialog.setAttribute('confirm-text', 'Close');
        dialog.setAttribute('cancel-text-disable', 'true');
        dialog.setAttribute('large', 'true');
        dialog.setAttribute('pre-expand', 'true');
        this._dialog = dialog;

        const style = document.createElement('style');
        style.textContent = `
            .overview-empty {
                color: rgba(255,255,255,0.4);
                font-style: italic;
                text-align: center;
                margin-top: 2vh;
            }
            .overview-section {
                margin-bottom: 3vh;
            }
            .overview-section-title {
                font-size: 2.2vh;
                font-weight: bold;
                color: rgba(100, 200, 240, 0.9);
                border-bottom: 1px solid rgba(100, 200, 240, 0.25);
                padding-bottom: 0.8vh;
                margin-bottom: 1.6vh;
                letter-spacing: 0.05em;
                text-transform: uppercase;
                cursor: pointer;
                user-select: none;
                display: flex;
                align-items: center;
                gap: 0.8vh;
            }
            .overview-section-title::before {
                content: '▶';
                font-size: 1.4vh;
                transition: transform 0.2s ease;
                display: inline-block;
                flex-shrink: 0;
            }
            .overview-section.expanded .overview-section-title::before {
                transform: rotate(90deg);
            }
            .overview-fields {
                display: none;
                flex-direction: column;
                gap: 1vh;
            }
            .overview-section.expanded .overview-fields {
                display: flex;
            }
            .overview-row {
                display: grid;
                grid-template-columns: 18ch 1fr;
                gap: 1.5vh;
                align-items: baseline;
                padding: 0.5vh 0;
                border-bottom: 1px solid rgba(255,255,255,0.05);
            }
            .overview-label {
                font-size: 1.8vh;
                color: rgba(255,255,255,0.5);
                font-weight: 600;
            }
            .overview-value {
                font-size: 1.9vh;
                color: rgba(255,255,255,0.9);
                word-break: break-word;
            }
            .overview-badge {
                display: inline-block;
                padding: 0.15vh 0.8vh;
                border-radius: 3px;
                font-size: 1.7vh;
                font-weight: bold;
            }
            .overview-badge--yes {
                background: rgba(80, 200, 120, 0.2);
                color: #6ee89a;
                border: 1px solid rgba(80, 200, 120, 0.3);
            }
            .overview-badge--no {
                background: rgba(220, 80, 80, 0.2);
                color: #f08080;
                border: 1px solid rgba(220, 80, 80, 0.3);
            }
            .overview-list {
                margin: 0;
                padding-left: 2ch;
                list-style: disc;
            }
            .overview-list li {
                margin-bottom: 0.3vh;
            }
            .overview-pre {
                margin: 0;
                font-family: inherit;
                white-space: pre-wrap;
                word-break: break-word;
                line-height: 1.6;
                font-size: 1.9vh;
            }
            .relationship-groups {
                display: flex;
                flex-direction: column;
                gap: 1.4vh;
                width: 100%;
            }
            .relationship-group {
                border: 1px solid rgba(100, 200, 240, 0.18);
                border-radius: 6px;
                background: rgba(100, 200, 240, 0.04);
                overflow: hidden;
            }
            .relationship-group-header {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 0.8vh;
                padding: 1vh 1.2vh;
                cursor: pointer;
                user-select: none;
            }
            .relationship-group-header::before {
                content: '▶';
                font-size: 1.2vh;
                color: rgba(100, 200, 240, 0.7);
                transition: transform 0.2s ease;
                display: inline-block;
                flex-shrink: 0;
            }
            .relationship-group.expanded .relationship-group-header::before {
                transform: rotate(90deg);
            }
            .relationship-chip {
                display: inline-flex;
                align-items: baseline;
                gap: 0.6ch;
                padding: 0.25vh 1vh;
                border-radius: 999px;
                background: rgba(100, 200, 240, 0.12);
                border: 1px solid rgba(100, 200, 240, 0.25);
            }
            .relationship-chip-key {
                font-size: 1.35vh;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                color: rgba(255, 255, 255, 0.45);
            }
            .relationship-chip-val {
                font-size: 1.7vh;
                font-weight: 600;
                color: rgba(255, 255, 255, 0.92);
            }
            .relationship-group-body {
                display: none;
                flex-direction: column;
                gap: 1vh;
                padding: 0 1.2vh 1.2vh;
            }
            .relationship-group.expanded .relationship-group-body {
                display: flex;
            }
            .relationship-group-field {
                display: flex;
                flex-direction: column;
                gap: 0.4vh;
                padding-bottom: 0.8vh;
                border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            }
            .relationship-context {
                margin-top: 0.4vh;
            }
            .relationship-context-title {
                font-size: 1.8vh;
                font-weight: 700;
                color: rgba(120, 210, 170, 0.9);
                margin-bottom: 0.6vh;
            }
            .relationship-context-fields {
                display: flex;
                flex-direction: column;
                gap: 0.4vh;
            }
            .relationship-reason {
                display: block;
                margin-top: 0.4vh;
                font-size: 1.6vh;
                font-style: italic;
                color: rgba(255, 255, 255, 0.55);
            }
            .relationship-group-field-label-row {
                display: flex;
                align-items: center;
                gap: 1ch;
            }
            .relationship-copy-btn {
                font-size: 1.4vh;
                padding: 0.2vh 0.8vh;
                border-radius: 3px;
                border: 1px solid rgba(100, 200, 240, 0.4);
                background: rgba(100, 200, 240, 0.1);
                color: rgba(100, 200, 240, 0.9);
                cursor: pointer;
                user-select: none;
                line-height: 1;
            }
            .relationship-copy-btn:hover {
                background: rgba(100, 200, 240, 0.2);
            }
            .relationship-copy-key-btn {
                margin-left: auto;
            }
            .relationship-name-title {
                font-size: 2vh;
                font-weight: 700;
                color: rgba(180, 230, 255, 0.95);
                padding: 0.5vh 0 0.8vh;
                border-bottom: 1px solid rgba(100, 200, 240, 0.25);
                margin-bottom: 0.2vh;
                letter-spacing: 0.03em;
            }
            .activities-list {
                display: flex;
                flex-direction: column;
                gap: 0.8vh;
                width: 100%;
            }
            .activity-item {
                display: flex;
                flex-direction: column;
                gap: 0.4vh;
                padding: 0.7vh 1vh;
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 4px;
                background: rgba(255, 255, 255, 0.03);
            }
            .activity-item-name {
                font-size: 1.9vh;
                font-weight: 700;
                color: rgba(255, 255, 255, 0.92);
            }
            .activity-item-meta {
                display: flex;
                align-items: baseline;
                gap: 0.8ch;
                flex-wrap: wrap;
            }
            .activity-meta-label {
                font-size: 1.5vh;
                color: rgba(255, 255, 255, 0.45);
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                flex-shrink: 0;
            }
            .activity-template-val {
                font-size: 1.8vh;
                color: rgba(255, 255, 255, 0.75);
                font-style: italic;
            }
        `;
        dialog.appendChild(style);

        const contentArea = document.createElement('div');
        this._contentArea = contentArea;
        dialog.appendChild(contentArea);

        document.body.appendChild(dialog);

        dialog.addEventListener('cancel', () => this.remove());
        dialog.addEventListener('confirm', () => {
            playCancelSound();
            this.remove();
        });

        this.renderState();
    }

    disconnectedCallback() {
        this._dialog?.remove();
        this._dialog = null;
        this._contentArea = null;
    }

    async renderState() {
        const contentArea = this._contentArea;
        if (!contentArea) return;

        const id = this.getAttribute('character-id');
        const namespace = this.getAttribute('character-namespace');

        const result = id && namespace ? (
            await window.ENGINE_WORKER_CLIENT.getWizardStateFromScript({ id, namespace })
        ) : await window.ENGINE_WORKER_CLIENT.getCardTypeWizardState();

        if (!result || !result.state) {
            const empty = document.createElement('p');
            empty.className = 'overview-empty';
            empty.textContent = 'No data available yet.';
            contentArea.appendChild(empty);
            return;
        }

        const cardState = result.state;
        const fragment = document.createDocumentFragment();

        // @ts-ignore
        for (const section of SECTIONS) {
            const sectionEl = document.createElement('div');
            sectionEl.className = 'overview-section';

            const sectionTitleEl = document.createElement('div');
            sectionTitleEl.className = 'overview-section-title';
            sectionTitleEl.textContent = section.title;

            const fieldsEl = document.createElement('div');
            fieldsEl.className = 'overview-fields';

            let displayableFieldCount = 0;
            if (section.custom) {
                const customContent = section.custom(cardState);
                if (customContent) {
                    displayableFieldCount++;

                    fieldsEl.appendChild(customContent);
                }
            } else {
                for (const field of section.fields) {
                    const raw = field.custom ? field.custom(cardState) : cardState[field.key];
                    if (raw === undefined || raw === null || raw === '') continue;
                    displayableFieldCount++;

                    const row = document.createElement('div');
                    row.className = 'overview-row';

                    const labelEl = document.createElement('div');
                    labelEl.className = 'overview-label';
                    labelEl.textContent = field.label;
                    row.appendChild(labelEl);

                    const valueEl = document.createElement('div');
                    valueEl.className = 'overview-value';

                    if (raw instanceof HTMLElement) {
                        valueEl.appendChild(raw);
                    } else if (typeof raw === 'boolean') {
                        const badge = document.createElement('span');
                        badge.className = `overview-badge ${raw ? 'overview-badge--yes' : 'overview-badge--no'}`;
                        badge.textContent = raw ? 'Yes' : 'No';
                        valueEl.appendChild(badge);
                    } else if (typeof raw === 'number') {
                        valueEl.textContent = field.unit ? `${raw} ${field.unit}` : String(raw);
                    } else if (Array.isArray(raw)) {
                        const list = document.createElement('ul');
                        list.className = 'overview-list';
                        for (const item of raw) {
                            const li = document.createElement('li');
                            li.textContent = String(item);
                            list.appendChild(li);
                        }
                        valueEl.appendChild(list);
                    } else {
                        const text = String(raw);
                        if (text.includes('\n')) {
                            const pre = document.createElement('pre');
                            pre.className = 'overview-pre';
                            pre.textContent = text;
                            valueEl.appendChild(pre);
                        } else {
                            valueEl.textContent = text;
                        }
                    }

                    row.appendChild(valueEl);
                    fieldsEl.appendChild(row);
                }
            }

            if (displayableFieldCount > 0) {
                sectionEl.appendChild(sectionTitleEl);
                sectionEl.appendChild(fieldsEl);
                sectionTitleEl.addEventListener('click', () => {
                    sectionEl.classList.toggle('expanded');
                });
                fragment.appendChild(sectionEl);
            }
        }

        contentArea.appendChild(fragment);
    }
}

customElements.define('app-character-overview', CharacterOverview);