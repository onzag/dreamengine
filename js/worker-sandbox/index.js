/**
 * Worker bootstrap – uses dynamic import() so that ANY error in the module
 * graph (syntax errors, missing files, bad exports, etc.) is caught here
 * and forwarded to the main thread with full detail instead of the browser's
 * useless opaque "ErrorEvent".
 */

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
        ] = await Promise.all([
            import("../engine/index.js"),
            import("../jsengine/index.js"),
            import("../engine/inference/adapter-de-server-uncensored.js"),
            import("../cardtype/generate-base.js"),
            import("../cardtype/generate-bonds.js"),
            import("../cardtype/generate-activities.js"),
            import("../cardtype/generate-bond-triggers.js"),
            import("../cardtype/generate-basic-states.js"),
        ]);

        workerMain({ DEngine, DEJSEngine, InferenceAdapterLlamaUncensored, generateBase, generateBonds, generateActivities, generateBondTriggers, generateBasicStates });
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
function workerMain({ DEngine, DEJSEngine, InferenceAdapterLlamaUncensored, generateBase, generateBonds, generateActivities, generateBondTriggers, generateBasicStates }) {

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
        const defaultUrl = `${defaultScriptsBase}/${namespace}/${id}.js`;
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
        const defaultUrl = `${defaultScriptsBase}/${namespace}/${id}.js`;
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
engine.addInferringOverConversationMessageListener((deObject, data) => {
    self.postMessage({ type: "event", event: "inferringOverConversationMessage", data: { deObject, data } });
});

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
            return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`;
        };
        userScriptsBase = toFileUrl(userScriptsPath);
        defaultScriptsBase = toFileUrl(defaultScriptsPath);
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
    async getStateAsJSON() {
        return engine.getStateAsJSON();
    },

    async setWorldRulesDisabled({ disabled }) {
        engine.setWorldRulesDisabled(disabled);
        return { ok: true };
    },

    async enableSchizophreniaModeForUser() {
        engine.enableSchizophreniaModeForUser();
        return { ok: true };
    },

    async setupInferenceAdapter({ host, secret, allowSelfSigned }) {
        engine.setInferenceAdapter(new InferenceAdapterLlamaUncensored(engine, { host, secret }));
        return { ok: true };
    },

    async initializeInferenceAdapter() {
        const adapter = engine.inferenceAdapter;
        if (!adapter) {
            throw new Error("No inference adapter found on engine");
        }
        await adapter.ensureInitialized();
        return { ok: true };
    },

    async initialize({ user }) {
        await engine.initialize(user);
        return { ok: true };
    },

    async initializeFromJSONState({ json }) {
        await engine.initializeFromJSONState(json);
        return { ok: true };
    },

    async executeCommand({ commandText }) {
        await engine.executeCommand(commandText);
        return { ok: true };
    },

    async requestTalkingTurnFromUser() {
        await engine.requestTalkingTurnFromUser();
        return { ok: true };
    },

    // ─── DEJSEngine methods ─────────────────────────────────────────
    async jsEngineImportScript({ namespace, id, options }) {
        return await jsEngine.importScript(namespace, id, options);
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

    // ─── deObject partial query ─────────────────────────────────
    /**
     * Walk into engine.deObject along `path` (dot-separated or array),
     * then return a filtered copy of whatever sits there.
     *
     * @param {object} args
     * @param {string | string[]} [args.path]  - e.g. "characters.Alice" or ["world","locations"]
     * @param {string[]}          [args.pick]  - if set, only these keys are kept
     * @param {string[]}          [args.skip]  - if set, these keys are excluded (ignored when pick is provided)
     * @param {number}            [args.depth] - max depth to recurse (0 = shallow / keys only). undefined = full depth
     * @return {Promise<any>} The filtered sub-object at the target path
     */
    async queryDEObject({ path, pick, skip, depth }) {
        const de = engine.getDEObject();

        // ── navigate to the requested sub-object ────────────────
        const segments = !path ? [] : Array.isArray(path) ? path : path.split(".");
        /**
         * @type {any}
         */
        let target = de;
        for (const seg of segments) {
            if (target == null || typeof target !== "object") {
                throw new Error(`Path segment "${seg}" is not reachable – parent is ${typeof target}`);
            }
            target = target[seg];
        }

        if (target == null || typeof target !== "object") {
            // primitive – return as-is, no filtering applicable
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
     * @param {import('../cardtype/base.js').CardTypeCard} args.currentCard
     * @param {boolean} args.guided - whether to run the guider questions or skip straight to generation 
     */
    async continueCardTypeWizard({ currentCard, guided }) {
        // Cancel any previous wizard run
        cancelCurrentWizard();

        const { promise: cancelPromise, cancel } = createCancelToken();
        currentWizardCancel = cancel;

        /** @type {import('../cardtype/base.js').CardTypeGuider | null} */
        const guider = guided ? createWorkerGuider(cancelPromise) : null;

        const autosave = createWorkerAutosave(currentCard, cancelPromise);

        try {
            await generateBase(engine, currentCard, guider, autosave);
            await generateBonds(engine, currentCard, guider, autosave);
            await generateActivities(engine, currentCard, guider, autosave);
            await generateBondTriggers(engine, currentCard, guider, autosave);
            await generateBasicStates(engine, currentCard, guider, autosave);

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
        }
    },

    /**
     * Cancel any in-progress cardtype wizard generation.
     */
    async cancelCardTypeGeneration() {
        cancelCurrentWizard();
        return { ok: true };
    }
};

// ── CardType Wizard infrastructure ──────────────────────────────────

class WizardCancelledError extends Error {
    constructor() { super("Wizard cancelled"); }
}

/** @type {(() => void) | null} */
let currentWizardCancel = null;

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
 * @param {Promise<never>} cancelPromise
 * @returns {import('../cardtype/base.js').CardTypeGuider}
 */
function createWorkerGuider(cancelPromise) {
    /**
     * @param {string} questionType
     * @param {string} question
     * @param {any} extra
     * @returns {Promise<{value: any}>}
     */
    function ask(questionType, question, extra) {
        const qid = ++guiderQuestionId;

        self.postMessage({
            type: "event",
            event: "cardTypeGuiderQuestion",
            data: { qid, questionType, question, ...extra }
        });

        const answerPromise = new Promise((resolve) => {
            pendingGuiderAnswers.set(qid, resolve);
        });

        return /** @type {Promise<{value: any}>} */ (Promise.race([
            answerPromise,
            cancelPromise
        ]));
    }

    return {
        async askOption(question, options, defaultValue) {
            return ask("askOption", question, { options, defaultValue });
        },
        async askOpen(question, defaultValue) {
            return ask("askOpen", question, { defaultValue });
        },
        async askNumber(question, defaultValue) {
            return ask("askNumber", question, { defaultValue });
        },
        async askBoolean(question, defaultValue) {
            return ask("askBoolean", question, { defaultValue });
        },
        async askList(question, defaultValue) {
            return ask("askList", question, { defaultValue });
        }
    };
}

/** @type {Map<number, (ack: any) => void>} */
const pendingAutosaveAcks = new Map();
let autosaveId = 0;

/**
 * Creates an autosave object that sends the currentCard to the main thread
 * and waits for acknowledgement (or cancellation).
 * @param {import('../cardtype/base.js').CardTypeCard} currentCard
 * @param {Promise<never>} cancelPromise
 * @returns {import('../cardtype/base.js').CardTypeAutoSave}
 */
function createWorkerAutosave(currentCard, cancelPromise) {
    return {
        async save() {
            const sid = ++autosaveId;

            self.postMessage({
                type: "event",
                event: "cardTypeAutosave",
                data: { sid, currentCard }
            });

            const ackPromise = new Promise((resolve) => {
                pendingAutosaveAcks.set(sid, resolve);
            });

            await Promise.race([ackPromise, cancelPromise]);
        }
    };
}

// ── Message listener ────────────────────────────────────────────────
self.onmessage = async (e) => {
    const msg = e.data;

    // Handle guider answer from main thread
    if (msg.type === "cardTypeGuiderAnswer") {
        const { qid, value } = msg;
        const resolve = pendingGuiderAnswers.get(qid);
        if (resolve) {
            pendingGuiderAnswers.delete(qid);
            resolve({ value });
        }
        return;
    }

    // Handle autosave acknowledgement from main thread
    if (msg.type === "cardTypeAutosaveAck") {
        const { sid } = msg;
        const resolve = pendingAutosaveAcks.get(sid);
        if (resolve) {
            pendingAutosaveAcks.delete(sid);
            resolve({ ok: true });
        }
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
            self.postMessage({ type: "rpcResponse", id, error: err instanceof Error ? err.message : String(err) });
        }
    }
};

console.log("Secure Worker initialized...");
self.postMessage({ type: "event", event: "workerReady" });

} // end workerMain