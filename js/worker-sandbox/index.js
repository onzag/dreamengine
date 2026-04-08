/**
 * Worker that houses the full DEngine + DEJSEngine.
 * Loaded via `new Worker(...)` from app/index.js.
 * Communicates through structured postMessage protocol.
 */

import { DEngine } from "../engine/index.js";
import { DEJSEngine } from "../jsengine/index.js";
import { InferenceAdapterLlamaUncensored } from "../engine/inference/adapter-de-server-uncensored.js";

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
    // Try user home first, then bundled default-scripts
    const userUrl = `${userScriptsBase}/${namespace}/${id}.js`;
    const defaultUrl = `${defaultScriptsBase}/${namespace}/${id}.js`;

    let resp = await fetch(userUrl).catch(() => null);
    if (resp && resp.ok) {
        return { src: await resp.text(), srcUrl: userUrl };
    }

    resp = await fetch(defaultUrl).catch(() => null);
    if (resp && resp.ok) {
        return { src: await resp.text(), srcUrl: defaultUrl };
    }

    throw new Error(`Script '${namespace}/${id}' not found at ${userUrl} or ${defaultUrl}`);
};

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
engine.addDEObjectUpdatedListener((deObject) => {
    self.postMessage({ type: "event", event: "deObjectUpdated" });
});

engine.addCycleInformListener((level, message) => {
    self.postMessage({ type: "event", event: "cycleInform", data: { level, message } });
});

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

    async setupInferenceAdapter({ host, secret }) {
        engine.setInferenceAdapter(new InferenceAdapterLlamaUncensored(engine, { host, secret }));
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
};

// ── Message listener ────────────────────────────────────────────────
self.onmessage = async (e) => {
    const msg = e.data;

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