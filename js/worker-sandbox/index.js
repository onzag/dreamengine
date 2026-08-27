/**
 * Worker bootstrap – uses dynamic import() so that ANY error in the module
 * graph (syntax errors, missing files, bad exports, etc.) is caught here
 * and forwarded to the main thread with full detail instead of the browser's
 * useless opaque "ErrorEvent".
 */

import { getInternalDescriptionOfCharacter, getRelationship, getSysPromptForCharacter } from "../engine/util/character-info.js";
import { getHistoryForCharacter } from "../engine/util/messages.js";
import { isScriptTypeGeneratorFile, parseScriptGeneratorFrom } from "../script-generation/base.js";

// Catch truly unexpected things (runtime errors after init)
self.onerror = (message, source, lineno, colno, error) => {
    const detail = error
        ? `${error.message}\n${error.stack}`
        : `${message} (${source}:${lineno}:${colno})`;
    self.postMessage({ type: "event", event: "workerLoadError", data: { error: detail } });
};
self.onunhandledrejection = (e) => {
    const err = e.reason;
    const detail = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    self.postMessage({ type: "event", event: "workerLoadError", data: { error: `Unhandled rejection: ${detail}` } });
};

(async () => {
    try {
        const [
            { DEngine },
            { DEJSEngine },
            { InferenceAdapterLlamaUncensored },
            { generateBase },
            { generateBonds },
            { generateActivities },
            { generateBondTriggers },
            { generateBasicStates },
            { generateAffectiveStates },
        ] = await Promise.all([
            import("../engine/index.js"),
            import("../jsengine/index.js"),
            import("../engine/inference/adapter-de-server-uncensored.js"),
            import("../script-generation/generate-base.js"),
            import("../script-generation/generate-bonds.js"),
            import("../script-generation/generate-activities.js"),
            import("../script-generation/generate-bond-triggers.js"),
            import("../script-generation/generate-basic-states.js"),
            import("../script-generation/generate-affective-states.js"),
        ]);

        workerMain({ DEngine, DEJSEngine, InferenceAdapterLlamaUncensored, generateBase, generateBonds, generateAffectiveStates, generateActivities, generateBondTriggers, generateBasicStates });
    } catch (err) {
        const detail = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
        console.error("[Worker] Failed to load modules:", detail);
        self.postMessage({ type: "event", event: "workerLoadError", data: { error: detail } });
    }
})();

/**
 * @param {object} deps
 */
// @ts-ignore
function workerMain({ DEngine, DEJSEngine, InferenceAdapterLlamaUncensored, generateBase, generateBonds, generateAffectiveStates, generateActivities, generateBondTriggers, generateBasicStates }) {

    // ── Script path resolvers (using file:// fetch) ────────────────────
    // The main thread sends the absolute paths via the "setScriptPaths" RPC.
    // Once set, the worker fetches scripts over the already-allowed file:// protocol.

    /** @type {string | null} */
    let userScriptsBase = null;
    /** @type {string | null} */
    let defaultScriptsBase = null;

    /** @type {(namespace: string, id: string) => Promise<{src: string, srcUrl: string}>} */
    const resolver = async (namespace, id) => {
        if (!userScriptsBase || !defaultScriptsBase) {
            throw new Error("Script paths not set. Call setScriptPaths first.");
        }
        // Namespaces starting with "@" load from bundled default-scripts,
        // all others load from the user's local scripts folder.
        if (namespace.startsWith('@')) {
            const defaultUrl = `${defaultScriptsBase}/${namespace.replace("@", "")}/${id}.js`;
            const resp = await fetch(defaultUrl).catch(() => null);
            if (resp && resp.ok) {
                return { src: await resp.text(), srcUrl: defaultUrl };
            }
            throw new Error(`Default script '${namespace}/${id}' not found at ${defaultUrl}`);
        } else {
            const userUrl = `${userScriptsBase}/${namespace}/${id}.js`;
            const resp = await fetch(userUrl).catch(() => null);
            if (resp && resp.ok) {
                return { src: await resp.text(), srcUrl: userUrl };
            }
            throw new Error(`Local script '${namespace}/${id}' not found at ${userUrl}`);
        }
    };

    /** @type {(namespace: string, id: string) => Promise<{srcUrl: string}>} */
    const resolverUrlOnly = async (namespace, id) => {
        if (!userScriptsBase || !defaultScriptsBase) {
            throw new Error("Script paths not set. Call setScriptPaths first.");
        }
        const result = await resolver(namespace, id);
        // Namespaces starting with "@" load from bundled default-scripts,
        // all others load from the user's local scripts folder.
        if (namespace.startsWith('@')) {
            const defaultUrl = `${defaultScriptsBase}/${namespace.replace("@", "")}/${id}.js`;
            return { srcUrl: defaultUrl };
        } else {
            const userUrl = `${userScriptsBase}/${namespace}/${id}.js`;
            return { srcUrl: userUrl };
        }
    }

    /**
     * @type {Array<{namespace: string, id: string}> | null}
     * The full list of available scripts, provided by the main thread since file:// can't list directories. Used for bulk imports and preloading all scripts.
     * Each entry should correspond to an actual .js file in either the userScriptsBase or defaultScriptsBase directories.
     */
    let scriptsList = null;

    /** @type {() => Promise<Array<{namespace: string, id: string}>>} */
    const listResolver = async () => {
        if (!scriptsList) {
            throw new Error("Script list not set. Call setScriptList first.");
        }
        return scriptsList;
    };

    // ── Instances ───────────────────────────────────────────────────────
    const engine = new DEngine();

    /**
     * The resolver/listResolver here delegate to `currentResolver`/`currentListResolver`
     * which are reassigned when the main thread sends script source via messages.
     */
    const jsEngine = new DEJSEngine(engine, {
        resolver,
        listResolver,
    });

    // ── Listener forwarding ─────────────────────────────────────────────
    // @ts-ignore
    engine.addDEObjectUpdatedListener((deObject) => {
        self.postMessage({ type: "event", event: "deObjectUpdated" });
    });

    // @ts-ignore
    engine.addCycleInformListener((level, message) => {
        self.postMessage({ type: "event", event: "cycleInform", data: { level, message } });
    });

    // @ts-ignore
    engine.addThinkingListener((thinking, characterName, noMoreCharactersToTalk) => {
        self.postMessage({ type: "event", event: "thinkingInform", data: { thinking, characterName, noMoreCharactersToTalk } });
    });

    // @ts-ignore
    engine.addInferringOverConversationMessageListener((deObject, data) => {
        self.postMessage({ type: "event", event: "inferringOverConversationMessage", data });
    });

    /**
     * @type {import('../script-generation/base.js').ScriptTypeGenerator | null}
     */
    let currentCardOfWizard = null;

    // ── RPC handler map ─────────────────────────────────────────────────
    /**
     * @type {Record<string, (args: any) => Promise<any>>}
     */
    const handlers = {
        // ─── Script path setup ──────────────────────────────────────────
        /**
         * @param {{ userScriptsPath: string, defaultScriptsPath: string }} args
         * Absolute OS paths, e.g. "C:\\Users\\me\\.dreamengine\\scripts" and "E:\\rstory\\js\\default-scripts"
         */
        async setScriptPaths({ userScriptsPath, defaultScriptsPath }) {
            // Convert OS path → file:// URL
            /**
             * @param {string} p 
             * @returns 
             */
            const toFileUrl = (p) => {
                const normalized = p.replace(/\\/g, '/');
                if (userScriptsPath.startsWith('http://') || userScriptsPath.startsWith('https://')) {
                    return p; // Already a URL, return as-is
                }
                return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`;
            };
            userScriptsBase = toFileUrl(userScriptsPath);
            defaultScriptsBase = toFileUrl(defaultScriptsPath);
            return { ok: true };
        },

        async pauseInference() {
            const adapter = engine.inferenceAdapter;
            await adapter.pause();
            return { ok: true };
        },

        async resumeInference() {
            const adapter = engine.inferenceAdapter;
            await adapter.resume();
            return { ok: true };
        },

        /**
         * Provide the full script list from the main thread (since file:// can't list directories).
         * @param {{ scripts: Array<{namespace: string, id: string}> }} args
         */
        async setScriptList({ scripts }) {
            scriptsList = scripts;
            return { ok: true };
        },

        // ─── DEngine methods ────────────────────────────────────────────
        async getLastSafeState() {
            return engine.getLastSafeState();
        },

        async setWorldRulesDisabled({ disabled }) {
            engine.setWorldRulesDisabled(disabled);
            return { ok: true };
        },

        async enableSchizophreniaModeForUser() {
            engine.enableSchizophreniaModeForUser();
            return { ok: true };
        },

        async setupInferenceAdapter({ host, secret, allowSelfSigned, useExperimentalTestMode }) {
            engine.setInferenceAdapter(new InferenceAdapterLlamaUncensored(engine, { host, secret, useExperimentalTestMode }));
            return { ok: true };
        },

        async initializeInferenceAdapter({ lang }) {
            const adapter = engine.inferenceAdapter;
            if (!adapter) {
                throw new Error("No inference adapter found on engine");
            }
            await adapter.ensureInitialized();
            const supportedLanguages = adapter.getSupportedLanguages();
            let warning = null;
            if (!supportedLanguages.includes(lang)) {
                warning = `Warning: Inference server does not support language '${lang}'. Supported languages: ${supportedLanguages.join(', ')}`;
            }
            return { ok: true, warning };
        },

        async initialize({ user, playMode }) {
            await engine.initialize(user, playMode);
            return { ok: true };
        },

        async endSimulation() {
            await engine.endSimulation();
            return { ok: true };
        },

        async getEngineScriptInfo() {
            return engine.engineScriptInfo;
        },

        async assumeCharacterIdentity({ characterName }) {
            await engine.assumeCharacterIdentity(characterName);
            return { ok: true };
        },

        async addCharacterToParty({ characterName }) {
            await engine.addCharacterToParty(characterName);
            return { ok: true };
        },

        async initializeFromJSONState({ json }) {
            await engine.initializeFromJSONState(json);
            return { ok: true };
        },

        async completeDisruptedInitializationDueToNameConflict({ newName }) {
            await engine.completeDisruptedInitializationDueToNameConflict(newName);
            return { ok: true };
        },

        async executeCommand({ commandText }) {
            await engine.executeCommand(commandText);
            return { ok: true };
        },

        async requestTurn() {
            await engine.requestTurn();
            return { ok: true };
        },

        // ─── DEJSEngine methods ─────────────────────────────────────────
        async jsEngineImportScript({ namespace, id, options }) {
            // The imported script module contains functions (initialize,
            // onInferenceExecuted, etc.) which are not structured-cloneable
            // and therefore cannot cross the worker boundary. Callers on the
            // main thread only need to know whether the import succeeded.
            await jsEngine.importScript(namespace, id, options);
            return { ok: true };
        },

        async jsEngineImportScripts({ scripts }) {
            await jsEngine.importScripts(scripts);
            return { ok: true };
        },

        async jsEnginePreloadAllScripts() {
            await jsEngine.preloadAllScripts();
            return { ok: true };
        },

        async jsEngineInitialize() {
            await jsEngine.initialize();
            return { ok: true };
        },

        async jsEngineUnload() {
            await jsEngine.unload();
            return { ok: true };
        },

        async jsEngineRecreate() {
            await jsEngine.recreate();
            return { ok: true };
        },

        async jsEngineUpdate({ namespace, id, options }) {
            await jsEngine.update(namespace, id, options);
            return { ok: true };
        },

        async jsEngineClearExecutionOrder() {
            await jsEngine.clearExecutionOrder();
            return { ok: true };
        },

        async jsEngineOnInferenceExecuted({ characterName }) {
            await jsEngine.onInferenceExecuted(characterName);
            return { ok: true };
        },

        async jsEngineGetInfoMap() {
            return jsEngine.getInfoMap();
        },

        async jsEngineGetInfoMapForScripts({ scripts }) {
            return jsEngine.getInfoMapForScripts(scripts);
        },

        /**
         * @param {{ namespace: string, id: string }} args
         * @returns {Promise<{ srcUrl: string }>} The script URL (for error reporting)
         */
        async getScriptSourceURL({ namespace, id }) {
            return await resolverUrlOnly(namespace, id);
        },

        async getRawScriptSource({ namespace, id }) {
            const { src } = await resolver(namespace, id);
            return { src };
        },

        async startScene({ sceneName }) {
            await engine.startScene(sceneName);
            return { ok: true };
        },

        async setDreamStability({ stability }) {
            await engine.setStability(stability);
            return { ok: true };
        },

        async callCharOnlyTemplate({ path, characterName }) {
            const template = await handlers.queryDEObject({ path, _returnFunctions: true });

            if (typeof template === "string") {
                return template; // simple string template, return as-is without calling
            }

            const char = engine.getDEObject().characters[characterName];

            if (!char) {
                throw new Error(`Character '${characterName}' not found in DE object`);
            }

            return await template({
                char,
            });
        },

        async callCharAndOtherTemplate({ path, characterName, otherName }) {
            const template = await handlers.queryDEObject({ path, _returnFunctions: true });

            if (typeof template === "string") {
                return template; // simple string template, return as-is without calling
            }

            const char = engine.getDEObject().characters[characterName];
            const other = engine.getDEObject().characters[otherName];
            const otherFamilyRelationship = char.familyTies[otherName];
            const de = engine.getDEObject();
            const otherRelationship = await getRelationship(de, char, other);
            return await template({
                char,
                other,
                otherFamilyRelationship,
                otherRelationship,
            });
        },

        // ─── deObject partial query ─────────────────────────────────
        /**
         * Walk into engine.deObject along `path` (dot-separated or array),
         * then return a filtered copy of whatever sits there.
         *
         * @param {object} args
         * @param {string | string[]} [args.path]  - e.g. "characters.Alice" or ["world","locations"]
         * @param {string[]}          [args.pick]  - if set, only these keys are kept
         * @param {string[]}          [args.skip]  - if set, these keys are excluded (ignored when pick is provided)
         * @param {boolean|Array<string|number|boolean|{char: string}>} [args.call]  - call the function, as a function, if found, usually meant for calling utilities
         * @param {number}            [args.depth] - max depth to recurse (0 = shallow / keys only). undefined = full depth
         * @param {boolean}           [args._returnFunctions] - internal, returns functions without complaining of lack of call
         * @return {Promise<any>} The filtered sub-object at the target path
         */
        async queryDEObject({ path, pick, skip, depth, call, _returnFunctions }) {
            const de = engine.getDEObject();

            // ── navigate to the requested sub-object ────────────────
            const segments = !path ? [] : Array.isArray(path) ? path : path.split(".");
            /**
             * @type {any}
             */
            let target = de;
            for (const seg of segments) {
                if (target == null || typeof target !== "object") {
                    throw new Error(`Path segment "${seg}" is not reachable - parent is ${typeof target}`);
                }
                target = target[seg];
            }

            if (target == null || (typeof target !== "object" && typeof target !== "function")) {
                // primitive – return as-is, no filtering applicable
                return target;
            }

            if (typeof target === "function") {
                if (call) {
                    if (typeof call === "boolean") {
                        target = await target();
                    } else if (Array.isArray(call)) {
                        target = await target(...call.map(arg => {
                            if (typeof arg === "object" && arg !== null && "char" in arg) {
                                return engine.getDEObject().characters[arg.char];
                            }
                            return arg;
                        }));
                    } else {
                        throw new Error("Invalid 'call' parameter: must be boolean or array");
                    }
                } else if (!_returnFunctions) {
                    throw new Error("Path " + JSON.stringify(path) + " is a function. Set call=true to execute it.");
                } else {
                    return target;
                }
            } else if (call) {
                throw new Error("Path " + JSON.stringify(path) + " is not a function. 'call' parameter is invalid here.");
            }

            if (target == null || typeof target !== "object") {
                // after calling, it might have become a primitive – return as-is, no filtering applicable
                return target;
            }

            // ── filtered deep-copy ──────────────────────────────────
            const hasDepth = typeof depth === "number";

            /**
             * 
             * @param {*} obj 
             * @param {*} currentDepth 
             * @returns  {any}
             */
            function cloneFiltered(obj, currentDepth) {
                if (obj === null || typeof obj !== "object") return obj;
                if (typeof obj === "function") return undefined;

                if (Array.isArray(obj)) {
                    if (hasDepth && currentDepth >= depth) return `[Array(${obj.length})]`;
                    return obj.map(item => cloneFiltered(item, currentDepth + 1));
                }

                if (hasDepth && currentDepth >= depth) {
                    // shallow: just return the key list so the caller knows what's available
                    return Object.keys(obj).reduce((acc, k) => {
                        const v = obj[k];
                        if (typeof v === "function") return acc;
                        // @ts-ignore
                        acc[k] = v === null ? null
                            : Array.isArray(v) ? `[Array(${v.length})]`
                                : typeof v === "object" ? `{${Object.keys(v).length} keys}`
                                    : v;
                        return acc;
                    }, {});
                }

                const out = {};
                const keys = Object.keys(obj);
                for (const k of keys) {
                    if (typeof obj[k] === "function") continue;
                    // @ts-ignore
                    out[k] = cloneFiltered(obj[k], currentDepth + 1);
                }
                return out;
            }

            // ── pick / skip at the top level of the target ──────────
            const pickSet = pick ? new Set(pick) : null;
            const skipSet = !pickSet && skip ? new Set(skip) : null;

            if (Array.isArray(target)) {
                return target
                    .filter(item => typeof item !== "function")
                    .map(item => {
                        if (item !== null && typeof item === "object" && !Array.isArray(item)) {
                            /**
                             * @type {*}
                             */
                            const out = {};
                            for (const k of Object.keys(item)) {
                                if (typeof item[k] === "function") continue;
                                if (pickSet && !pickSet.has(k)) continue;
                                if (skipSet && skipSet.has(k)) continue;
                                out[k] = cloneFiltered(item[k], 1);
                            }
                            return out;
                        }
                        return cloneFiltered(item, 1);
                    });
            }

            const result = {};
            for (const k of Object.keys(target)) {
                if (typeof target[k] === "function") continue;
                if (pickSet && !pickSet.has(k)) continue;
                if (skipSet && skipSet.has(k)) continue;
                // @ts-ignore
                result[k] = cloneFiltered(target[k], 1);
            }

            return result;
        },

        // cardtype-wizard RPCs

        /**
         * @param {object} args
         * @param {import('../script-generation/base.js').ScriptTypeGenerator} args.currentCard
         * @param {boolean} args.guided - whether to run the guider questions or skip straight to generation 
         * @param {string} args.language - the language to use for the wizard
         */
        async continueCardTypeWizard({ currentCard, guided, language }) {
            currentCardOfWizard = currentCard;
            // Cancel any previous wizard run
            cancelCurrentWizard();
            const thisRunId = ++wizardRunId;

            const { promise: cancelPromise, cancel } = createCancelToken();
            currentWizardCancel = cancel;

            currentWizardGoBack = () => {
                currentCard.state[".steps"] = currentCard.state[".steps"] || [];
                if (currentCard.state[".steps"].length > 0) {
                    currentCard.state[".steps"].pop();
                }
                currentCard.body = [];
                currentCard.head = [];
                currentCard.foot = [];
                currentCard.imports = [];

                return { currentCard, guided, language };
            }

            /** @type {import('../script-generation/base.js').ScriptTypeGuider} */
            const guider = createWorkerGuider(currentCard, cancelPromise, guided);

            try {
                await generateBase(engine, currentCard, guider, language);
                await generateActivities(engine, currentCard, guider);
                await generateAffectiveStates(engine, currentCard, guider);
                await generateBonds(engine, currentCard, guider);
                await generateBondTriggers(engine, currentCard, guider);
                await generateBasicStates(engine, currentCard, guider);

                self.postMessage({ type: "event", event: "cardTypeWizardComplete", data: { currentCard } });
            } catch (err) {
                if (err instanceof WizardCancelledError) {
                    return;
                }
                throw err;
            } finally {
                if (currentWizardCancel === cancel) {
                    currentWizardCancel = null;
                }
                if (wizardRunId === thisRunId) {
                    currentCardOfWizard = null;
                }
            }
        },

        /**
         * Cancel any in-progress cardtype wizard generation.
         */
        async cancelCardTypeGeneration() {
            cancelCurrentWizard();
            return { ok: true };
        },

        async getCardTypeWizardState() {
            return { state: currentCardOfWizard?.state };
        },

        /**
         * @returns {Promise<* | null>}
         */
        async getWizardStateFromScript({ namespace, id }) {
            const source = jsEngine.getScriptSource(namespace, id);
            if (source && isScriptTypeGeneratorFile(source)) {
                const parsed = parseScriptGeneratorFrom(source);
                return { state: parsed.state };
            }
            return null;
        },

        async getHistoryForCharacter({ characterName, lastMessageGid }) {
            /**
             * @type {Array<import("../engine/util/messages.js").DEObjectMessageGeneratorResult>}
             */
            let accumulatedMessages = [];
            const generator = getHistoryForCharacter(
                engine,
                engine.getDEObject().characters[characterName],
                {
                    // excludeFrom: [this.username],
                    includeDebugMessages: true,
                    includeRejectedMessages: true,
                    includeHiddenMessages: true,
                }
            );
            let next = await generator.next(true);
            while (!next.done) {
                if (next.value.gid === lastMessageGid) {
                    await generator.return();
                    break;
                }
                accumulatedMessages.push(next.value);
                next = await generator.next(true);
            }
            return accumulatedMessages;
        },

        async getDebugInfoForCharacter({ characterName }) {
            const char = engine.getDEObject().characters[characterName];
            if (!char) {
                return {
                    "info": `Character '${characterName}' not found`,
                }
            }

            const internalDescription = await getSysPromptForCharacter(engine, characterName);

            return {
                "info": internalDescription.sysprompt,
            }
        },

        async getDebugInfoForMessage({ message__debug_id }) {
            const inferenceAdapter = engine.inferenceAdapter;
            if (!inferenceAdapter) {
                return {
                    "info": `No inference adapter found on engine`,
                }
            }
            const payload = inferenceAdapter.getDebugPayload(message__debug_id);
            return payload;
        }
    };

    // ── CardType Wizard infrastructure ──────────────────────────────────

    class WizardCancelledError extends Error {
        constructor() { super("Wizard cancelled"); }
    }

    /** @type {number} */
    let wizardRunId = 0;

    /** @type {(() => void) | null} */
    let currentWizardCancel = null;

    /**
     * @type {(() => { currentCard: import('../script-generation/base.js').ScriptTypeGenerator, guided: boolean, language: string }) | null}
     */
    let currentWizardGoBack = null;

    function cancelCurrentWizard() {
        if (currentWizardCancel) {
            currentWizardCancel();
            currentWizardCancel = null;
        }
    }

    /**
     * @returns {{ promise: Promise<never>, cancel: () => void }}
     */
    function createCancelToken() {
        /** @type {() => void} */
        let cancel;
        const promise = new Promise((_, reject) => {
            cancel = () => reject(new WizardCancelledError());
        });
        // @ts-ignore
        return { promise, cancel };
    }

    /** @type {number} */
    let guiderQuestionId = 0;

    /** @type {Map<number, (answer: any) => void>} */
    const pendingGuiderAnswers = new Map();

    /**
     * Creates a guider that sends questions to the main thread via postMessage
     * and waits for answers (or cancellation).
     * @param {import('../script-generation/base.js').ScriptTypeGenerator} currentCard
     * @param {Promise<never>} cancelPromise
     * @param {boolean} isGuided - whether to actually ask the questions or skip them (used when resuming a wizard with already answered questions)
     * @returns {import('../script-generation/base.js').ScriptTypeGuider}
     */
    function createWorkerGuider(currentCard, cancelPromise, isGuided) {
        /**
         * @param {string} questionType
         * @param {string} question
         * @param {any} extra
         * @returns {Promise<{value: any}>}
         */
        async function ask(questionType, question, extra) {
            const qid = ++guiderQuestionId;

            const id = extra.id;
            const defaultValueFnOrValue = extra.defaultValue;

            const actualId = typeof id === "object" && id !== null ? id.id : id;
            const reask = typeof id === "object" && id !== null ? !!id.reask : false;
            const trackStep = typeof id === "object" && id !== null ? (id.step !== undefined ? !!id.step : true) : true;
            const recalcdefault = typeof id === "object" && id !== null ? !!id.recalcdefault : false;

            let stateValue = actualId !== null ? currentCard.state[actualId] : undefined;

            /**
             * @type {string[] | null}
             */
            let availableOptions = null;
            if (extra.options && Array.isArray(extra.options)) {
                availableOptions = extra.options.map(/** @param {*} o */ o => typeof o === 'string' ? o : o.value);
            } else if (typeof extra.options === "object" && extra.options !== null) {
                availableOptions = [];
                for (const key in extra.options) {
                    if (Array.isArray(extra.options[key])) {
                        availableOptions = availableOptions.concat(extra.options[key].map(/** @param {*} o */ o => typeof o === 'string' ? o : o.value));
                        break;
                    }
                }
            }

            if (typeof stateValue === "string" && availableOptions && stateValue !== undefined && !availableOptions.includes(stateValue)) {
                // If the state value is not in the options, treat it as undefined so that the guider will ask again
                stateValue = undefined;
            }

            const stepHasNotRanTechnically = !(currentCard.state[".steps"] || []).includes(actualId);
            const shouldAsk = (reask || stepHasNotRanTechnically || stateValue === undefined) && isGuided;
            let defaultValue = stateValue !== undefined ? stateValue : (typeof defaultValueFnOrValue === 'function' ? await defaultValueFnOrValue() : defaultValueFnOrValue);

            // recalc default only has an effect if reask is true, otherwise it will be ignored
            if (reask && recalcdefault) {
                defaultValue = typeof defaultValueFnOrValue === 'function' ? await defaultValueFnOrValue() : defaultValueFnOrValue;
            }

            extra.defaultValue = defaultValue;

            let finalAnswer;

            if (shouldAsk) {
                self.postMessage({
                    type: "event",
                    event: "ScriptTypeGuiderQuestion",
                    data: { qid, questionType, question, currentCard, ...extra }
                });

                const answerPromise = new Promise((resolve) => {
                    pendingGuiderAnswers.set(qid, resolve);
                });

                const receivedAnswer = await /** @type {Promise<{value: any}>} */ (Promise.race([
                    answerPromise,
                    cancelPromise
                ]));

                finalAnswer = receivedAnswer;
            } else {
                finalAnswer = defaultValue !== undefined ? { value: defaultValue } : { value: null };
            }

            if (finalAnswer) {
                currentCard.state[actualId] = finalAnswer.value;
                if (trackStep) {
                    if (currentCard.state[".steps"] === undefined) {
                        currentCard.state[".steps"] = [];
                    }
                    if (!currentCard.state[".steps"].includes(actualId)) {
                        currentCard.state[".steps"].push(actualId);
                    }
                }
            }

            return finalAnswer;
        }

        return {
            async askOption(id, question, options, defaultValue) {
                return ask("askOption", question, { id, options, defaultValue });
            },
            async askOpen(id, question, defaultValue) {
                return await ask("askOpen", question, { id, defaultValue });
            },
            async askAccept(id, question, defaultValue) {
                return ask("askAccept", question, { id, defaultValue });
            },
            async askNumber(id, question, defaultValue) {
                return ask("askNumber", question, { id, defaultValue });
            },
            async askBoolean(id, question, defaultValue) {
                return ask("askBoolean", question, { id, defaultValue });
            },
            async askList(id, question, options, defaultValue) {
                return ask("askList", question, { id, options, defaultValue });
            },
            async askArbitraryList(id, question, defaultValue) {
                return ask("askArbitraryList", question, { id, defaultValue });
            },
            async askAcceptArbitraryList(id, question, defaultValue) {
                return ask("askAcceptArbitraryList", question, { id, defaultValue });
            },
        };
    }

    let goingBackInWizard = false;

    function goBackInCardTypeWizard() {
        if (goingBackInWizard) return;
        const goBackValues = currentWizardGoBack ? currentWizardGoBack() : null;
        if (goBackValues) {
            goingBackInWizard = true;
            cancelCurrentWizard();
            handlers.continueCardTypeWizard(goBackValues);
            goingBackInWizard = false;
        }
    }

    // ── Message listener ────────────────────────────────────────────────
    self.onmessage = async (e) => {
        const msg = e.data;

        // Handle guider answer from main thread
        if (msg.type === "ScriptTypeGuiderAnswer") {
            const { qid, value } = msg;
            const resolve = pendingGuiderAnswers.get(qid);
            if (resolve) {
                pendingGuiderAnswers.delete(qid);
                resolve({ value });
            }
            return;
        }

        if (msg.type === "ScriptTypeGuiderGoBack") {
            goBackInCardTypeWizard();
            return;
        }

        // Handle RPC calls
        if (msg.type === "rpc") {
            const { id, method, args } = msg;
            const handler = handlers[method];
            if (!handler) {
                self.postMessage({ type: "rpcResponse", id, error: `Unknown method: ${method}` });
                return;
            }
            try {
                const result = await handler(args || {});
                self.postMessage({ type: "rpcResponse", id, result });
            } catch (err) {
                console.error(`[Worker] RPC '${method}' failed:`);
                console.error(err instanceof Error ? err : String(err));
                const error = err instanceof Error
                    ? { name: err.name, message: err.message, stack: err.stack }
                    : { name: "Error", message: String(err), stack: undefined };
                self.postMessage({ type: "rpcResponse", id, error });
            }
        }
    };

    console.log("Secure Worker initialized...");
    self.postMessage({ type: "event", event: "workerReady" });

} // end workerMain