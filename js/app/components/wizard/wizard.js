import { playCancelSound, playConfirmSound, playHoverSound, setTempSoundDisable } from '../../sound.js';
import '../profile-image.js';

/**
 * Generic wizard UI component.
 *
 * This component is intentionally "empty": it knows nothing about characters,
 * cards, the worker, or how answers are persisted. It only provides the shared
 * wizard chrome (overlay, title bar, content area, buttons), the loading
 * overlay helpers, an autosave status indicator, and — most importantly — a
 * fully featured UI guider (via {@link createGuider}) that renders interactive
 * questions and resolves with the user's answer.
 *
 * Subclasses (or standalone users) decide what the guider is wired up to.
 * Override the provided hooks to customise behaviour:
 * - {@link getTitle} — the title shown in the header.
 * - {@link renderHeaderExtras} — extra header buttons (returned as an HTML string).
 * - {@link getHighlightPhrases} — phrases to highlight inside guider questions.
 * - {@link getAssetPath} — resolves a filename to a storage path for asset questions.
 * - {@link getAssetSrc} — resolves a storage path to a playable/displayable URL.
 * - {@link uploadAssetFile} — persists a selected file to a given asset path.
 * - {@link onConnected} / {@link onDisconnected} — lifecycle hooks.
 * - {@link onPrevButtonClick} — the header "prev" button handler.
 */
export class GeneralWizard extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        this.onDocumentKeydown = this.onDocumentKeydown.bind(this);
        /** @type {number | null} */
        this._overlayTimer = null;
        /** @type {number | null} */
        this._autosaveHideTimer = null;
        /** @type {HTMLElement[]} */
        this._madeInert = [];
    }

    async connectedCallback() {
        this.render();

        // Find the direct child of document.body that contains this overlay.
        // It may be this element itself, or an ancestor host if mounted inside a shadow root.
        /** @type {HTMLElement} */
        let bodyLevelChild = /** @type {HTMLElement} */ (this);
        while (true) {
            const p = /** @type {any} */ (bodyLevelChild.parentNode);
            if (!p || p === document.body || p === document) break;
            bodyLevelChild = p.nodeType === 11 /* DOCUMENT_FRAGMENT_NODE */ ? p.host : p;
        }

        this._madeInert = [];
        for (const el of document.body.children) {
            if (el !== bodyLevelChild && !/** @type {HTMLElement} */ (el).inert) {
                /** @type {HTMLElement} */ (el).inert = true;
                this._madeInert.push(/** @type {HTMLElement} */ (el));
            }
        }

        document.addEventListener('keydown', this.onDocumentKeydown);

        this.root.getElementById('cancel-btn')?.addEventListener('click', () => {
            playCancelSound();
            setTempSoundDisable();
            this.remove();
        });

        this.root.querySelectorAll('.wizard-buttons div').forEach(btn => {
            btn.addEventListener('mouseenter', playHoverSound);
        });

        const prevBtn = this.root.querySelector('.wizard-prev-button');
        if (prevBtn) {
            prevBtn.addEventListener('mouseenter', playHoverSound);
            prevBtn.addEventListener('click', () => {
                playConfirmSound();
                this.onPrevButtonClick();
            });
        }

        await this.onConnected();
    }

    async disconnectedCallback() {
        if (this._madeInert) {
            for (const el of this._madeInert) {
                el.inert = false;
            }
            this._madeInert = [];
        }
        this.endOverlay();
        if (this._autosaveHideTimer) {
            clearTimeout(this._autosaveHideTimer);
            this._autosaveHideTimer = null;
        }
        document.removeEventListener('keydown', this.onDocumentKeydown);

        await this.onDisconnected();

        this.dispatchEvent(new CustomEvent('wizard-closed'));
    }

    /* ------------------------------------------------------------------ */
    /* Overridable hooks                                                   */
    /* ------------------------------------------------------------------ */

    /**
     * Called at the end of connectedCallback, after the base chrome is wired up.
     * Override to start the wizard's actual flow.
     * @returns {Promise<void>}
     */
    async onConnected() {}

    /**
     * Called during disconnectedCallback, before the `wizard-closed` event is
     * dispatched. Override to clean up any wizard specific resources.
     * @returns {Promise<void>}
     */
    async onDisconnected() {}

    /**
     * Handler for the header "prev" button. No-op by default.
     */
    onPrevButtonClick() {}

    /**
     * @returns {string} The title shown in the header.
     */
    getTitle() {
        return 'Wizard';
    }

    /**
     * Extra buttons rendered in the header, to the left of the prev button.
     * @returns {string} An HTML string (empty by default).
     */
    renderHeaderExtras() {
        return '';
    }

    /**
     * Phrases to visually highlight inside guider questions. Empty by default.
     * @returns {string[]}
     */
    getHighlightPhrases() {
        return [];
    }

    /**
     * Resolves a raw filename to the storage path used for asset questions
     * (askImageAsset / askAudioAsset). Override to prepend a namespace or
     * directory prefix specific to the wizard's context.
     * @param {string} filename
     * @returns {string}
     */
    getAssetPath(filename) {
        return filename || '';
    }

    /**
     * Resolves a storage asset path to a URL suitable for display/playback.
     * Override when the path needs to be prefixed with a home directory.
     * @param {string} assetPath
     * @returns {string}
     */
    getAssetSrc(assetPath) {
        return assetPath;
    }

    /**
     * Persists a file selected by the user to the given asset path.
     * No-op by default; override to implement actual file upload logic.
     * @param {string} assetPath
     * @param {File} file
     * @returns {Promise<void>}
     */
    async uploadAssetFile(assetPath, file) {}

    /* ------------------------------------------------------------------ */
    /* Loading overlay                                                     */
    /* ------------------------------------------------------------------ */

    /**
     * Starts a loading overlay. After 300ms the overlay becomes visible with blur and a spinner.
     * Call endOverlay() to remove it.
     */
    initOverlay() {
        this.endOverlay();

        const overlay = document.createElement('div');
        overlay.className = 'wizard-loading-overlay';
        overlay.innerHTML = '<div class="wizard-spinner"></div><div class="wizard-loading-text">Running inference...</div>';
        this.root.querySelector('.wizard-content')?.appendChild(overlay);

        this._overlayTimer = window.setTimeout(() => {
            overlay.classList.add('visible');
            this._overlayTimer = null;
        }, 300);
    }

    /**
     * Removes the loading overlay immediately, cancelling the 300ms timer if still pending.
     */
    endOverlay() {
        if (this._overlayTimer !== null) {
            clearTimeout(this._overlayTimer);
            this._overlayTimer = null;
        }
        this.root.querySelector('.wizard-loading-overlay')?.remove();
    }

    /* ------------------------------------------------------------------ */
    /* Content helpers                                                     */
    /* ------------------------------------------------------------------ */

    showDone() {
        this.endOverlay();
        const contentArea = this.root.querySelector('.wizard-content');
        if (contentArea) {
            contentArea.innerHTML = '<div class="guider-label" style="text-align:center;margin-top:6vh;">Done!</div>';
        }
    }

    /**
     * Shows an error message in the wizard content area and stops the spinner.
     * @param {string} message
     */
    showError(message) {
        this.endOverlay();
        const contentArea = this.root.querySelector('.wizard-content');
        if (contentArea) {
            contentArea.innerHTML = `<div class="guider-label" style="text-align:center;margin-top:6vh;color:#ff6b6b;font-size:6vh">Error</div>
                <div class="guider-label" style="text-align:center;margin-top:1vh;font-size:3vh;white-space:pre-wrap;word-break:break-word;">${this.escapeHtml(message)}</div>`;
        }
    }

    /**
     * @param {string} str
     * @returns {string}
     */
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /* ------------------------------------------------------------------ */
    /* Autosave indicator                                                  */
    /* ------------------------------------------------------------------ */

    showAutosaveStatus() {
        if (this._autosaveHideTimer) {
            clearTimeout(this._autosaveHideTimer);
            this._autosaveHideTimer = null;
        }
        const el = this.root.querySelector('.wizard-autosave');
        if (el) {
            el.textContent = 'Saving...';
            el.classList.add('visible');
            el.classList.remove('saved');
        }
    }

    /**
     * Shows "Saved" and fades out the autosave indicator after a short delay.
     */
    hideAutosaveStatus() {
        const el = this.root.querySelector('.wizard-autosave');
        if (el) {
            el.textContent = 'Saved';
            el.classList.add('saved');
        }
        this._autosaveHideTimer = window.setTimeout(() => {
            if (el) {
                el.classList.remove('visible');
                el.classList.remove('saved');
            }
            this._autosaveHideTimer = null;
        }, 2000);
    }

    /* ------------------------------------------------------------------ */
    /* Guider primitives                                                   */
    /* ------------------------------------------------------------------ */

    /**
     * Wraps the given text in a container and highlights any phrases returned by
     * {@link getHighlightPhrases}.
     * @param {string} text
     * @returns {string}
     */
    highlightGuiderKeywords(text) {
        const div = document.createElement('div');
        div.textContent = text;
        const phrases = this.getHighlightPhrases();
        if (!phrases || phrases.length === 0) {
            return div.innerHTML;
        }
        const pattern = new RegExp(
            '(' + phrases.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')',
            'gi'
        );
        return div.innerHTML.replace(pattern, '<strong style="color:#e07070">$1</strong>');
    }

    /**
     * Renders a question into the content area and returns a promise that resolves
     * with the extracted value once the user confirms.
     * @param {string} question
     * @param {() => HTMLElement} buildInputFn - builds the input element(s)
     * @param {(container: HTMLElement) => any} extractValueFn - extracts the value on submit
     * @param {any} defaultValue
     * @param {boolean} [hasTryAgainOption]
     * @param {(() => AsyncGenerator<string, void, unknown>) | null} [prepareUI] - optional async generator; the UI is built first, then this runs and its yielded strings are shown as status messages until exhausted before the UI becomes interactive
     * @returns {Promise<any>}
     */
    async presentGuiderQuestion(question, buildInputFn, extractValueFn, defaultValue, hasTryAgainOption, prepareUI) {
        this.endOverlay();

        const contentArea = this.root.querySelector('.wizard-content');
        if (!contentArea) { return defaultValue; }

        contentArea.innerHTML = '';

        const container = document.createElement('div');
        container.className = 'guider-question';

        const questionLabel = document.createElement('div');
        questionLabel.className = 'guider-label';
        questionLabel.innerHTML = this.highlightGuiderKeywords(question);
        questionLabel.setAttribute("data-de-aria-text", "true");
        questionLabel.setAttribute("tabindex", "0");
        container.appendChild(questionLabel);

        const inputArea = buildInputFn();
        container.appendChild(inputArea);

        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'buttons-container';
        container.appendChild(buttonsContainer);

        contentArea.appendChild(container);

        // If a prepareUI generator is provided, overlay the container while it runs.
        if (prepareUI) {
            const prepOverlay = document.createElement('div');
            prepOverlay.className = 'wizard-loading-overlay visible';

            const spinner = document.createElement('div');
            spinner.className = 'wizard-spinner';

            const statusText = document.createElement('div');
            statusText.className = 'wizard-loading-text';

            prepOverlay.appendChild(spinner);
            prepOverlay.appendChild(statusText);
            container.style.position = 'relative';
            container.appendChild(prepOverlay);

            try {
                for await (const message of prepareUI()) {
                    statusText.textContent = message;
                }
            } catch (err) {
                console.error('prepareUI generator error:', err);
            } finally {
                prepOverlay.remove();
                container.style.position = '';
            }
        }

        return new Promise((resolve) => {
            if (hasTryAgainOption) {
                const tryAgainBtn = document.createElement('div');
                tryAgainBtn.className = 'guider-try-again-btn';
                tryAgainBtn.textContent = 'Regenerate';
                tryAgainBtn.addEventListener('mouseenter', playHoverSound);
                tryAgainBtn.addEventListener('click', () => {
                    playCancelSound();
                    setTempSoundDisable();
                    this.initOverlay();
                    resolve(null);
                });
                buttonsContainer.appendChild(tryAgainBtn);
            }

            let submitted = false;

            const submitBtn = document.createElement('div');
            submitBtn.className = 'guider-submit-btn';
            submitBtn.textContent = 'Confirm';
            submitBtn.setAttribute("data-de-aria-key", "k");
            submitBtn.setAttribute('tabindex', '0');
            submitBtn.setAttribute("role", "button");
            submitBtn.setAttribute("aria-label", "Confirm");
            submitBtn.addEventListener('mouseenter', playHoverSound);
            submitBtn.addEventListener('click', () => {
                if (submitted) return;
                playConfirmSound();
                const value = extractValueFn(inputArea);
                this.initOverlay();
                resolve(value);
                submitted = true;
            });
            buttonsContainer.appendChild(submitBtn);
        });
    }

    /**
     * Presents a freely editable list of arbitrary string items.
     * @param {string} question
     * @param {string[]} [defaultValue]
     * @param {boolean} [hasTryAgainOption]
     * @returns {Promise<string[]>}
     */
    presentGuiderArbitraryList(question, defaultValue, hasTryAgainOption) {
        return this.presentGuiderQuestion(
            question,
            () => {
                const wrapper = document.createElement('div');
                wrapper.className = 'guider-list';

                /** @type {string[]} */
                const items = defaultValue ? [...defaultValue] : [];

                const syncItemsFromDom = () => {
                    const listContainer = wrapper.querySelector('.guider-list-items');
                    if (!listContainer) return;
                    const spans = listContainer.querySelectorAll('.guider-list-item span');
                    spans.forEach((span, idx) => {
                        if (idx < items.length) items[idx] = span.textContent || '';
                    });
                };

                const renderItems = () => {
                    let listContainer = wrapper.querySelector('.guider-list-items');
                    if (!listContainer) {
                        listContainer = document.createElement('div');
                        listContainer.className = 'guider-list-items';
                        wrapper.insertBefore(listContainer, wrapper.querySelector('.guider-list-add-row'));
                    }
                    listContainer.innerHTML = '';
                    items.forEach((item, idx) => {
                        const itemEl = document.createElement('div');
                        itemEl.className = 'guider-list-item';

                        const span = document.createElement('span');
                        span.setAttribute('contenteditable', 'plaintext-only');
                        span.setAttribute('spellcheck', 'true');
                        span.textContent = item;
                        span.setAttribute('tabindex', '0');
                        span.setAttribute('role', 'textbox');
                        span.setAttribute('aria-label', 'List item');
                        span.setAttribute("data-de-aria-key", "p");
                        span.setAttribute("data-de-aria-action", "focus");
                        // Fallback for browsers that don't support plaintext-only:
                        // strip rich content from pasted data and block enter newlines.
                        span.addEventListener('paste', (e) => {
                            e.preventDefault();
                            const text = e.clipboardData?.getData('text/plain') ?? '';
                            const selection = window.getSelection();
                            if (!selection || selection.rangeCount === 0) return;
                            const range = selection.getRangeAt(0);
                            range.deleteContents();
                            range.insertNode(document.createTextNode(text));
                            range.collapse(false);
                        });
                        span.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter') e.preventDefault();
                        });
                        itemEl.appendChild(span);

                        const removeBtn = document.createElement('div');
                        removeBtn.className = 'guider-list-remove';
                        removeBtn.dataset.idx = String(idx);
                        removeBtn.textContent = '✕';
                        removeBtn.addEventListener('mouseenter', playHoverSound);
                        removeBtn.addEventListener('click', () => {
                            syncItemsFromDom();
                            items.splice(idx, 1);
                            renderItems();
                        });

                        removeBtn.setAttribute('tabindex', '0');
                        removeBtn.setAttribute('role', 'button');
                        removeBtn.setAttribute('aria-label', 'Remove item');
                        removeBtn.setAttribute("data-de-aria-key", "r");

                        itemEl.appendChild(removeBtn);

                        listContainer.appendChild(itemEl);
                    });
                };

                const addRow = document.createElement('div');
                addRow.className = 'guider-list-add-row';

                const textarea = document.createElement('textarea');
                textarea.className = 'guider-textarea';
                textarea.placeholder = 'Add item...';
                textarea.addEventListener('input', function () {
                    this.style.height = 'auto';
                    this.style.height = this.scrollHeight + 'px';
                });
                textarea.setAttribute('tabindex', '0');
                textarea.setAttribute('role', 'textbox');
                textarea.setAttribute("data-de-aria-key", "e");

                const addBtn = document.createElement('div');
                addBtn.className = 'guider-list-add-btn';
                addBtn.textContent = '+';
                addBtn.addEventListener('mouseenter', playHoverSound);
                addBtn.addEventListener('click', () => {
                    const val = textarea.value.trim();
                    if (!val) return;
                    syncItemsFromDom();
                    items.push(val);
                    textarea.value = '';
                    textarea.style.height = 'auto';
                    renderItems();
                });

                addBtn.setAttribute('tabindex', '0');
                addBtn.setAttribute('role', 'button');
                addBtn.setAttribute('aria-label', 'Add item');
                addBtn.setAttribute("data-de-aria-key", "a");

                addRow.appendChild(textarea);
                addRow.appendChild(addBtn);
                wrapper.appendChild(addRow);

                renderItems();
                return wrapper;
            },
            (inputArea) => {
                const itemEls = inputArea.querySelectorAll('.guider-list-item span');
                const result = Array.from(itemEls).map(el => el.textContent || '');
                const pending = inputArea.querySelector('.guider-list-add-row .guider-textarea');
                if (pending) {
                    const val = /** @type {HTMLTextAreaElement} */ (pending).value.trim();
                    if (val && !result.includes(val)) result.push(val);
                }
                return result.length > 0 ? result : (defaultValue ?? []);
            },
            defaultValue,
            hasTryAgainOption
        );
    }

    /**
     * Creates a UI-based guider that renders interactive questions into the wizard
     * content area. Each method returns a promise that resolves when the user
     * submits their answer.
     *
     * Subclasses may call `super.createGuider()` and add/override methods (for
     * example, domain-specific asset questions).
     * @returns {import('../../../script-generation/base.js').ScriptTypeGuider}
     */
    createGuider() {
        const self = this;

        return {
            async askOption(id, question, options, defaultValueFnOrValue) {
                const defaultValue = typeof defaultValueFnOrValue === 'function' ? await defaultValueFnOrValue() : defaultValueFnOrValue;

                const finalValue = await self.presentGuiderQuestion(
                    question,
                    () => {
                        const wrapper = document.createElement('div');
                        wrapper.className = 'guider-options';
                        options.forEach((opt, i) => {
                            const optValue = typeof opt === 'string' ? opt : opt.value;
                            const optLabel = typeof opt === 'string' ? opt : opt.label;
                            const optBtn = document.createElement('div');
                            optBtn.className = 'guider-option';
                            if (optValue === defaultValue) {
                                optBtn.classList.add('selected');
                                optBtn.setAttribute('aria-selected', 'true');
                            } else {
                                optBtn.setAttribute('aria-selected', 'false');
                            }
                            optBtn.dataset.value = optValue;
                            optBtn.setAttribute('tabindex', '0');
                            optBtn.setAttribute('role', 'button');
                            optBtn.setAttribute("data-de-aria-key", "p");
                            optBtn.textContent = optLabel;
                            optBtn.addEventListener('mouseenter', playHoverSound);
                            optBtn.addEventListener('click', () => {
                                wrapper.querySelectorAll('.guider-option').forEach(b => {
                                    b.classList.remove('selected');
                                    b.setAttribute('aria-selected', 'false');
                                });
                                optBtn.classList.add('selected');
                                optBtn.setAttribute('aria-selected', 'true');
                            });
                            wrapper.appendChild(optBtn);
                        });
                        return wrapper;
                    },
                    (inputArea) => {
                        const selected = inputArea.querySelector('.guider-option.selected');
                        const firstValue = options[0] !== undefined ? (typeof options[0] === 'string' ? options[0] : options[0].value) : undefined;
                        return selected ? /** @type {HTMLElement} */ (selected).dataset.value : (defaultValue ?? firstValue);
                    },
                    defaultValue
                );

                return { value: finalValue };
            },

            async askOpen(id, question, defaultValueFnOrValue) {
                const defaultValue = typeof defaultValueFnOrValue === 'function' ? await defaultValueFnOrValue() : defaultValueFnOrValue;

                const finalValue = await self.presentGuiderQuestion(
                    question,
                    () => {
                        const textarea = document.createElement('textarea');
                        textarea.className = 'guider-textarea';
                        textarea.placeholder = defaultValue || '';
                        if (defaultValue) textarea.value = defaultValue;
                        textarea.addEventListener('input', function () {
                            this.style.height = 'auto';
                            this.style.height = this.scrollHeight + 'px';
                        });
                        textarea.setAttribute('tabindex', '0');
                        textarea.setAttribute('role', 'textbox');
                        textarea.setAttribute("data-de-aria-key", "p");
                        requestAnimationFrame(() => {
                            textarea.style.height = 'auto';
                            textarea.style.height = textarea.scrollHeight + 'px';
                        });
                        setTimeout(() => {
                            requestAnimationFrame(() => {
                                textarea.style.height = 'auto';
                                textarea.style.height = textarea.scrollHeight + 'px';
                            });
                        }, 100);
                        return textarea;
                    },
                    (inputArea) => {
                        return /** @type {HTMLTextAreaElement} */ (inputArea).value || defaultValue || '';
                    },
                    defaultValue
                );

                return { value: finalValue };
            },

            async askAccept(id, question, defaultValueFnOrValue) {
                const defaultValue = typeof defaultValueFnOrValue === 'function' ? await defaultValueFnOrValue() : defaultValueFnOrValue;

                const finalValue = await self.presentGuiderQuestion(
                    question,
                    () => {
                        const textarea = document.createElement('textarea');
                        textarea.className = 'guider-textarea';
                        textarea.placeholder = defaultValue || '';
                        if (defaultValue) textarea.value = defaultValue;
                        textarea.addEventListener('input', function () {
                            this.style.height = 'auto';
                            this.style.height = this.scrollHeight + 'px';
                        });
                        textarea.setAttribute('tabindex', '0');
                        textarea.setAttribute('role', 'textbox');
                        textarea.setAttribute("data-de-aria-key", "p");
                        requestAnimationFrame(() => {
                            textarea.style.height = 'auto';
                            textarea.style.height = textarea.scrollHeight + 'px';
                        });
                        setTimeout(() => {
                            requestAnimationFrame(() => {
                                textarea.style.height = 'auto';
                                textarea.style.height = textarea.scrollHeight + 'px';
                            });
                        }, 100);
                        return textarea;
                    },
                    (inputArea) => {
                        return /** @type {HTMLTextAreaElement} */ (inputArea).value || defaultValue || '';
                    },
                    defaultValue,
                    true // hasTryAgainOption
                );

                return { value: finalValue };
            },

            async askNumber(id, question, defaultValueFnOrValue) {
                const defaultValue = typeof defaultValueFnOrValue === 'function' ? await defaultValueFnOrValue() : defaultValueFnOrValue;

                const finalValue = await self.presentGuiderQuestion(
                    question,
                    () => {
                        const input = document.createElement('input');
                        input.className = 'guider-input';
                        input.type = 'number';
                        if (defaultValue !== undefined) input.value = String(defaultValue);
                        input.placeholder = defaultValue !== undefined ? String(defaultValue) : '0';
                        input.setAttribute('tabindex', '0');
                        input.setAttribute('role', 'spinbutton');
                        input.setAttribute("data-de-aria-key", "p");
                        return input;
                    },
                    (inputArea) => {
                        const num = parseFloat(/** @type {HTMLInputElement} */(inputArea).value);
                        return isNaN(num) ? (defaultValue ?? 0) : num;
                    },
                    defaultValue
                );

                return { value: finalValue };
            },

            async askBoolean(id, question, defaultValueFnOrValue) {
                const defaultValue = typeof defaultValueFnOrValue === 'function' ? await defaultValueFnOrValue() : defaultValueFnOrValue;

                const finalValue = await self.presentGuiderQuestion(
                    question,
                    () => {
                        const wrapper = document.createElement('div');
                        wrapper.className = 'guider-boolean';

                        const yesBtn = document.createElement('div');
                        yesBtn.className = 'guider-bool-btn';
                        yesBtn.textContent = 'Yes';
                        if (defaultValue === true) {
                            yesBtn.classList.add('selected');
                            yesBtn.setAttribute('aria-selected', 'true');
                        } else {
                            yesBtn.setAttribute('aria-selected', 'false');
                        }
                        yesBtn.setAttribute('tabindex', '0');
                        yesBtn.setAttribute('role', 'button');
                        yesBtn.setAttribute("data-de-aria-key", "y");

                        const noBtn = document.createElement('div');
                        noBtn.className = 'guider-bool-btn';
                        noBtn.textContent = 'No';
                        if (defaultValue === false) {
                            noBtn.classList.add('selected');
                            noBtn.setAttribute('aria-selected', 'true');
                        } else {
                            noBtn.setAttribute('aria-selected', 'false');
                        }
                        noBtn.setAttribute('tabindex', '0');
                        noBtn.setAttribute('role', 'button');
                        noBtn.setAttribute("data-de-aria-key", "n");

                        yesBtn.addEventListener('mouseenter', playHoverSound);
                        noBtn.addEventListener('mouseenter', playHoverSound);

                        yesBtn.addEventListener('click', () => {
                            yesBtn.classList.add('selected');
                            yesBtn.setAttribute('aria-selected', 'true');
                            noBtn.classList.remove('selected');
                            noBtn.setAttribute('aria-selected', 'false');
                        });
                        noBtn.addEventListener('click', () => {
                            noBtn.classList.add('selected');
                            noBtn.setAttribute('aria-selected', 'true');
                            yesBtn.classList.remove('selected');
                            yesBtn.setAttribute('aria-selected', 'false');
                        });

                        wrapper.appendChild(yesBtn);
                        wrapper.appendChild(noBtn);
                        return wrapper;
                    },
                    (inputArea) => {
                        const yesBtn = inputArea.querySelector('.guider-bool-btn:first-child');
                        return yesBtn?.classList.contains('selected') ?? (defaultValue ?? false);
                    },
                    defaultValue
                );

                return { value: finalValue };
            },

            // @ts-ignore
            async askArbitraryList(id, question, defaultValueFnOrValue) {
                const defaultValue = typeof defaultValueFnOrValue === 'function' ? await defaultValueFnOrValue() : defaultValueFnOrValue;

                const finalValue = await self.presentGuiderArbitraryList(question, defaultValue, false);

                return { value: finalValue };
            },

            async askAcceptArbitraryList(id, question, defaultValueFnOrValue) {
                const defaultValue = typeof defaultValueFnOrValue === 'function' ? await defaultValueFnOrValue() : defaultValueFnOrValue;
                const finalValue = await self.presentGuiderArbitraryList(question, defaultValue || undefined, true);

                return { value: finalValue };
            },

            // @ts-ignore
            async askImageAsset(id, question, options, defaultValueFnOrValue) {
                // @ts-ignore
                const defaultValue = typeof defaultValueFnOrValue === 'function' ? await defaultValueFnOrValue() : defaultValueFnOrValue;

                const assetPath = self.getAssetPath(defaultValue);
                const generate = options && options.generate ? options.generate : null;
                const editorWidth = generate && generate.width ? generate.width : 1024;
                const editorHeight = generate && generate.height ? generate.height : 1024;
                const referenceImage = generate && generate.referenceImage ? generate.referenceImage : null;

                /** @type {any} */
                let profileImageEl = null;

                const finalValue = await self.presentGuiderQuestion(
                    question,
                    () => {
                        const wrapper = document.createElement('div');
                        wrapper.className = 'guider-image-asset';

                        /** @type {any} */
                        const img = document.createElement('app-profile-image');
                        img.setAttribute('image-url', assetPath);
                        img.setAttribute('editable', 'true');
                        img.setAttribute('editor-width', String(editorWidth));
                        img.setAttribute('editor-height', String(editorHeight));
                        img.setAttribute('dont-handle-diffusion-executable', 'true');
                        wrapper.appendChild(img);
                        profileImageEl = img;

                        if (referenceImage && !assetPath) {
                            const referenceAssetPath = self.getAssetPath(referenceImage);
                            requestAnimationFrame(() => {
                                if (typeof img.loadReferenceImage === 'function') {
                                    img.loadReferenceImage(referenceAssetPath);
                                }
                            });
                        }

                        return wrapper;
                    },
                    async () => {
                        if (profileImageEl && typeof profileImageEl.saveValueToUserData === 'function') {
                            try {
                                await profileImageEl.saveValueToUserData();
                            } catch (err) {
                                console.error('Failed to save image asset:', err);
                            }
                        }
                        return assetPath;
                    },
                    defaultValue,
                );

                return { value: finalValue };
            },

            // @ts-ignore
            async askAudioAsset(id, question, options, defaultValueFnOrValue) {
                // @ts-ignore
                const defaultValue = typeof defaultValueFnOrValue === 'function' ? await defaultValueFnOrValue() : defaultValueFnOrValue;

                const assetPath = self.getAssetPath(defaultValue);
                const existingSrc = self.getAssetSrc(assetPath);

                /** @type {File | null} */
                let selectedFile = null;
                /** @type {string | null} */
                let objectUrl = null;

                const finalValue = await self.presentGuiderQuestion(
                    question,
                    () => {
                        const wrapper = document.createElement('div');
                        wrapper.className = 'guider-audio-asset';

                        const audio = document.createElement('audio');
                        audio.className = 'guider-audio-preview';
                        audio.setAttribute('controls', 'true');
                        audio.setAttribute('data-de-aria-key', 'p');
                        audio.setAttribute('data-de-aria-action', 'play');
                        audio.setAttribute('tabindex', '0');
                        if (existingSrc) audio.src = existingSrc;

                        const chooseBtn = document.createElement('div');
                        chooseBtn.className = 'guider-audio-choose-btn';
                        chooseBtn.textContent = 'Choose Audio';
                        chooseBtn.setAttribute('tabindex', '0');
                        chooseBtn.setAttribute('role', 'button');
                        chooseBtn.setAttribute('aria-label', 'Choose audio file');
                        chooseBtn.setAttribute('data-de-aria-key', 'c');
                        chooseBtn.addEventListener('mouseenter', playHoverSound);

                        const fileInput = document.createElement('input');
                        fileInput.type = 'file';
                        fileInput.accept = 'audio/mpeg,.mp3,.ogg';
                        fileInput.style.display = 'none';

                        chooseBtn.addEventListener('click', () => {
                            fileInput.click();
                        });

                        fileInput.addEventListener('change', () => {
                            const file = fileInput.files && fileInput.files[0];
                            if (!file) return;
                            // Only accept mp3 or ogg files
                            const isValidFormat = file.type === 'audio/mpeg' || /\.mp3$/i.test(file.name) || file.type === 'audio/ogg' || /\.ogg$/i.test(file.name);
                            if (!isValidFormat) {
                                fileInput.value = '';
                                return;
                            }
                            if (objectUrl) URL.revokeObjectURL(objectUrl);
                            objectUrl = URL.createObjectURL(file);
                            selectedFile = file;
                            audio.src = objectUrl;
                        });

                        wrapper.appendChild(audio);
                        wrapper.appendChild(chooseBtn);
                        wrapper.appendChild(fileInput);

                        return wrapper;
                    },
                    async () => {
                        if (selectedFile && assetPath) {
                            try {
                                await self.uploadAssetFile(assetPath, selectedFile);
                            } catch (err) {
                                console.error('Failed to save audio asset:', err);
                            }
                        }
                        if (objectUrl) URL.revokeObjectURL(objectUrl);
                        return assetPath;
                    },
                    defaultValue,
                );

                return { value: finalValue };
            },

            async askList(id, question, options, defaultValueFnOrValue) {
                const defaultValue = typeof defaultValueFnOrValue === 'function' ? await defaultValueFnOrValue() : defaultValueFnOrValue;

                const finalValue = await self.presentGuiderQuestion(
                    question,
                    () => {
                        const wrapper = document.createElement('div');
                        wrapper.className = 'guider-list';

                        /** @type {string[]} */
                        const items = defaultValue ? [...defaultValue] : [];

                        const valueToLabel = new Map();
                        if (options) {
                            for (const group of Object.values(options)) {
                                for (const o of group) {
                                    if (typeof o === 'string') valueToLabel.set(o, o);
                                    else valueToLabel.set(o.value, o.label);
                                }
                            }
                        }

                        const renderItems = () => {
                            let listContainer = wrapper.querySelector('.guider-list-items');
                            if (!listContainer) {
                                listContainer = document.createElement('div');
                                listContainer.className = 'guider-list-items';
                                wrapper.insertBefore(listContainer, wrapper.querySelector('.guider-list-add-row'));
                            }
                            listContainer.innerHTML = items.map((item, idx) => `
                                <div class="guider-list-item">
                                    <span data-de-aria-text="true" data-value="${item}">${valueToLabel.get(item) ?? item}</span>
                                    <div role="button" tabindex="0" data-de-aria-key="r" class="guider-list-remove" data-idx="${idx}">✕</div>
                                </div>
                            `).join('');
                            listContainer.querySelectorAll('.guider-list-remove').forEach(btn => {
                                btn.addEventListener('mouseenter', playHoverSound);
                                btn.addEventListener('click', () => {
                                    const idx = parseInt(/** @type {HTMLElement} */(btn).dataset.idx || '0');
                                    items.splice(idx, 1);
                                    renderItems();
                                    if (options) rebuildAddInput();
                                });
                            });
                        };

                        const addRow = document.createElement('div');
                        addRow.className = 'guider-list-add-row';

                        /** @type {HTMLInputElement | HTMLSelectElement} */
                        let addInput;

                        const rebuildAddInput = () => {
                            const oldInput = addRow.querySelector('.guider-input');
                            if (oldInput) oldInput.remove();

                            if (options) {
                                const select = document.createElement('select');
                                select.className = 'guider-input';
                                select.setAttribute('data-de-aria-key', 'o');
                                select.setAttribute('tabindex', '0');
                                let hasAny = false;
                                const groups = Object.keys(options);
                                for (const group of groups) {
                                    const remaining = options[group].filter(o => {
                                        const optVal = typeof o === 'string' ? o : o.value;
                                        return !items.includes(optVal);
                                    });
                                    if (remaining.length === 0) continue;
                                    hasAny = true;
                                    const optgroup = document.createElement('optgroup');
                                    optgroup.label = group;
                                    remaining.forEach(opt => {
                                        const o = document.createElement('option');
                                        o.value = typeof opt === 'string' ? opt : opt.value;
                                        o.textContent = typeof opt === 'string' ? opt : opt.label;
                                        optgroup.appendChild(o);
                                    });
                                    select.appendChild(optgroup);
                                }
                                if (!hasAny) {
                                    const placeholder = document.createElement('option');
                                    placeholder.value = '';
                                    placeholder.textContent = 'No more options';
                                    placeholder.disabled = true;
                                    placeholder.selected = true;
                                    select.appendChild(placeholder);
                                    select.disabled = true;
                                } else {
                                    const placeholder = document.createElement('option');
                                    placeholder.value = '';
                                    placeholder.textContent = 'Select an option...';
                                    placeholder.disabled = true;
                                    placeholder.selected = true;
                                    select.insertBefore(placeholder, select.firstChild);
                                }
                                addInput = select;
                            } else {
                                const input = document.createElement('input');
                                input.className = 'guider-input';
                                input.type = 'text';
                                input.placeholder = 'Add item...';
                                input.setAttribute('data-de-aria-key', 'o');
                                input.setAttribute('tabindex', '0');
                                addInput = input;
                            }
                            addRow.insertBefore(addInput, addRow.querySelector('.guider-list-add-btn'));
                        };

                        const addBtn = document.createElement('div');
                        addBtn.className = 'guider-list-add-btn';
                        addBtn.textContent = '+';
                        addBtn.addEventListener('mouseenter', playHoverSound);
                        addBtn.addEventListener('click', () => {
                            const val = addInput.value.trim();
                            if (!val) return;
                            items.push(val);
                            addInput.value = '';
                            renderItems();
                            if (options) rebuildAddInput();
                        });

                        addBtn.setAttribute('tabindex', '0');
                        addBtn.setAttribute('role', 'button');
                        addBtn.setAttribute('aria-label', 'Add item');
                        addBtn.setAttribute("data-de-aria-key", "a");

                        addRow.appendChild(addBtn);
                        wrapper.appendChild(addRow);
                        rebuildAddInput();

                        renderItems();
                        return wrapper;
                    },
                    (inputArea) => {
                        const itemEls = inputArea.querySelectorAll('.guider-list-item span');
                        const result = Array.from(itemEls).map(el => /** @type {HTMLElement} */ (el).dataset.value || el.textContent || '');
                        const pending = inputArea.querySelector('.guider-list-add-row .guider-input');
                        if (pending) {
                            // @ts-ignore
                            const val = pending.value.trim();
                            if (val && !result.includes(val)) result.push(val);
                        }
                        return result.length > 0 ? result : (defaultValue ?? []);
                    },
                    defaultValue
                );

                return { value: finalValue };
            }
        };
    }

    /* ------------------------------------------------------------------ */
    /* Chrome                                                              */
    /* ------------------------------------------------------------------ */

    /** @param {KeyboardEvent} e */
    onDocumentKeydown(e) {
        if (e.key === 'Escape') {
            if (document.querySelector('app-dialog')) return;
            const bodyChildren = Array.from(document.body.children);
            if (bodyChildren[bodyChildren.length - 1] !== this) return;
            playCancelSound();
            setTempSoundDisable();
            this.remove();
        }
    }

    render() {
        this.root.innerHTML = `
      <style>
        @import "./components/wizard/wizard.css";
      </style>
      <div class="wizard-overlay">
        <div class="wizard-title">
            <span>${this.escapeHtml(this.getTitle())}</span>
            <div class="wizard-title-right">
                <span class="wizard-autosave"></span>
                ${this.renderHeaderExtras()}
                <div class="wizard-prev-button">prev</div>
            </div>
        </div>
        <div class="wizard-content" data-de-role="scroller">
            <slot></slot>
        </div>
        <div class="wizard-buttons">
            <div id="cancel-btn">Go Back</div>
        </div>
      </div>
    `;
    }
}

customElements.define('app-wizard', GeneralWizard);
