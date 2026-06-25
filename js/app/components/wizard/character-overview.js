import { playCancelSound } from '../../sound.js';
import '../dialog.js';

const SECTIONS = [
    {
        title: 'Character Overview',
        fields: [
            {
                label: 'Name',
                key: 'name',
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
                label: 'Carrying Capacity',
                key: 'carrying-capacity',
                unit: 'kg',
            },
            {
                label: 'Baby Or Weakling',
                key: 'baby-or-weakling',
            },
            {
                label: 'Young Or Weakling',
                key: 'young-or-weakling',
            },
            {
                label: 'Prime Physique',
                key: 'prime-physique',
            }
        ]
    }
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
        dialog.setAttribute('dialog-title', 'Overview');
        dialog.setAttribute('confirmation', 'true');
        dialog.setAttribute('confirm-text', 'Close');
        dialog.setAttribute('cancel-text-disable', 'true');
        dialog.setAttribute('large', 'true');
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
            }
            .overview-fields {
                display: flex;
                flex-direction: column;
                gap: 1vh;
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
                white-space: nowrap;
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

                if (typeof raw === 'boolean') {
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

            if (displayableFieldCount > 0) {
                sectionEl.appendChild(sectionTitleEl);
                sectionEl.appendChild(fieldsEl);
                fragment.appendChild(sectionEl);
            }
        }

        contentArea.appendChild(fragment);
    }
}

customElements.define('app-character-overview', CharacterOverview);