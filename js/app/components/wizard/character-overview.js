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
    if (key === 'description') {
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
        header.addEventListener('click', () => {
            groupEl.classList.toggle('expanded');
        });
        groupEl.appendChild(header);

        const body = document.createElement('div');
        body.className = 'relationship-group-body';

        // Context-less fields first, with the description prioritised.
        const groupFieldKeys = [...group.groupFields.keys()].sort((a, b) => {
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
            // TODO family and friends display
            {
                label: "Likes and Interests",
                key: 'likes-list',
            },
            {
                label: "Dislikes",
                key: 'dislikes-list',
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
            // TODO other attractions
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
        ]
    },
    {
        title: "Relationships (Neutral Strangers)",
        /**
         * @param {*} s
         * @return {HTMLElement | null}
         */
        custom: (s) => {
            const stepsInfo = s[".steps"];
            const typeToProcessPrefix = "strangerNeutral_n5_5_";
            return processRelationshipSteps(s, stepsInfo, typeToProcessPrefix);
        }
    },
    {
        title: "Relationships (Good Strangers)",
        /**
         * @param {*} s
         * @return {HTMLElement | null}
         */
        custom: (s) => {
            const stepsInfo = s[".steps"];
            const typeToProcessPrefix = "strangerGood_5_100_";
            return processRelationshipSteps(s, stepsInfo, typeToProcessPrefix);
        }
    },
    {
        title: "Relationships (Bad Strangers)",
        /**
         * @param {*} s
         * @return {HTMLElement | null}
         */
        custom: (s) => {
            const stepsInfo = s[".steps"];
            const typeToProcessPrefix = "strangerBad_n100_n5_";
            return processRelationshipSteps(s, stepsInfo, typeToProcessPrefix);
        }
    },
    {
        title: "Relationships (Acquaintances)",
        fields: [],
    },
    {
        title: "Relationships (Friends)",
        fields: [],
    },
    {
        title: "Relationships (Good Friends)",
        fields: [],
    },
    {
        title: "Relationships (Close Friends)",
        fields: [],
    },
    {
        title: "Relationships (Best Friends)",
        fields: [],
    },
    {
        title: "Relationships (Unpleasant Acquaintances)",
        fields: [],
    },
    {
        title: "Relationships (Unfriendly)",
        fields: [],
    },
    {
        title: "Relationships (Antagonistic)",
        fields: [],
    },
    {
        title: "Relationships (Hostile)",
        fields: [],
    },
    {
        title: "Relationships (Sworn Enemies)",
        fields: [],
    },
    {
        title: "Evolution of Relationships",
        fields: [],
    },
    {
        title: "Base Emotional States",
        fields: [],
    },
    {
        title: "Other States",
        fields: [],
    },
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

        const result = await window.ENGINE_WORKER_CLIENT.getCardTypeWizardState();

        if (!result || !result.state) {
            const empty = document.createElement('p');
            empty.className = 'overview-empty';
            empty.textContent = 'No data available yet.';
            contentArea.appendChild(empty);
            return;
        }

        const cardState = result.state;
        const fragment = document.createDocumentFragment();

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