/**
 * Client wrapper for the DEngine + DEJSEngine worker.
 * Use from app/index.js (or similar) to communicate with the worker.
 *
 * @example
 * ```js
 * import { EngineWorkerClient } from "../worker-sandbox/client.js";
 *
 * const client = new EngineWorkerClient(
 *   new Worker(new URL("../worker-sandbox/index.js", import.meta.url), { type: "module" })
 * );
 * await client.ready;
 *
 * await client.initialize({ user: myUser });
 * ```
 */

export class EngineWorkerClient {
    /** @type {Worker} */
    #worker;
    /** @type {Map<string, {resolve: Function, reject: Function}>} */
    #pending = new Map();
    /** @type {number} */
    #nextId = 0;

    // ── Event callbacks (set by consumer) ───────────────────────────
    /** @type {(() => void) | null} */
    onDEObjectUpdated = null;
    /** @type {((level: string, message: string) => void) | null} */
    onCycleInform = null;
    /** @type {((deObject: any, data: any) => void) | null} */
    onInferringOverConversationMessage = null;

    /** @type {Promise<void>} resolves when the worker signals ready */
    ready;

    /**
     * @param {Worker} worker
     */
    constructor(worker) {
        this.#worker = worker;

        /** @type {() => void} */
        let readyResolve;
        /** @type {(err: Error) => void} */
        let readyReject;
        this.ready = new Promise((resolve, reject) => {
            readyResolve = resolve;
            readyReject = reject;
        });

        this.#worker.onerror = (e) => {
            const msg = e.message || "Unknown worker error";
            const info = e.filename ? ` (${e.filename}:${e.lineno}:${e.colno})` : "";
            console.error(`[EngineWorker] Worker error: ${msg}${info}`);
            readyReject(new Error(`Worker error: ${msg}${info}`));
        };

        this.#worker.onmessageerror = (e) => {
            console.error("[EngineWorker] Message deserialization error:", e);
        };

        this.#worker.onmessage = (e) => {
            const msg = e.data;

            // RPC response
            if (msg.type === "rpcResponse") {
                const p = this.#pending.get(msg.id);
                if (p) {
                    this.#pending.delete(msg.id);
                    if (msg.error) {
                        p.reject(new Error(msg.error));
                    } else {
                        p.resolve(msg.result);
                    }
                }
                return;
            }

            // Event forwarding
            if (msg.type === "event") {
                switch (msg.event) {
                    case "workerReady":
                        // @ts-ignore
                        readyResolve();
                        break;
                    case "deObjectUpdated":
                        this.onDEObjectUpdated?.();
                        break;
                    case "cycleInform":
                        this.onCycleInform?.(msg.data.level, msg.data.message);
                        break;
                    case "inferringOverConversationMessage":
                        this.onInferringOverConversationMessage?.(msg.data.deObject, msg.data.data);
                        break;
                }
                return;
            }
        };
    }

    // ── Internal helpers ────────────────────────────────────────────

    /**
     * @param {string} method
     * @param {any} [args]
     * @returns {Promise<any>}
     */
    #call(method, args) {
        const id = String(this.#nextId++);
        return new Promise((resolve, reject) => {
            this.#pending.set(id, { resolve, reject });
            this.#worker.postMessage({ type: "rpc", id, method, args });
        });
    }

    // ── DEngine methods ─────────────────────────────────────────────

    /**
     * Tell the worker where scripts live on disk so it can fetch them via file://.
     * @param {{ userScriptsPath: string, defaultScriptsPath: string }} args
     */
    setScriptPaths(args) { return this.#call("setScriptPaths", args); }

    /**
     * Provide the full list of available scripts (file:// can't list directories).
     * @param {{ scripts: Array<{namespace: string, id: string}> }} args
     */
    setScriptList(args) { return this.#call("setScriptList", args); }

    getStateAsJSON() { return this.#call("getStateAsJSON"); }
    /** @param {{ disabled: boolean }} args */
    setWorldRulesDisabled(args) { return this.#call("setWorldRulesDisabled", args); }
    enableSchizophreniaModeForUser() { return this.#call("enableSchizophreniaModeForUser"); }

    /** @param {{ user: any }} args */
    initialize(args) { return this.#call("initialize", args); }
    /** @param {{ json: string }} args */
    initializeFromJSONState(args) { return this.#call("initializeFromJSONState", args); }
    /** @param {{ commandText: string }} args */
    executeCommand(args) { return this.#call("executeCommand", args); }
    requestTalkingTurnFromUser() { return this.#call("requestTalkingTurnFromUser"); }

    // ── DEJSEngine methods ──────────────────────────────────────────

    /** @param {{ namespace: string, id: string, options?: any }} args */
    jsEngineImportScript(args) { return this.#call("jsEngineImportScript", args); }
    /** @param {{ scripts: Array<{namespace: string, id: string}> }} args */
    jsEngineImportScripts(args) { return this.#call("jsEngineImportScripts", args); }
    jsEnginePreloadAllScripts() { return this.#call("jsEnginePreloadAllScripts"); }
    jsEngineInitialize() { return this.#call("jsEngineInitialize"); }
    jsEngineUnload() { return this.#call("jsEngineUnload"); }
    /** @param {{ characterName: string }} args */
    jsEngineOnInferenceExecuted(args) { return this.#call("jsEngineOnInferenceExecuted", args); }
    /**
     * 
     * @returns {Promise<Record<string, { id: string, namespace: string, description: string, type: string, exposeProperties: DEScriptExposeProperties }>>}
     */
    jsEngineGetInfoMap() {
        return this.#call("jsEngineGetInfoMap");
    }
    /**
     * @param {{ scripts: Array<{namespace: string, id: string}> }} args
     * @returns {Promise<Record<string, { id: string, namespace: string, description: string, type: string, exposeProperties: DEScriptExposeProperties }>>}
     */
    jsEngineGetInfoMapForScripts(args) {
        return this.#call("jsEngineGetInfoMapForScripts", args);
    }
    /**
     * @param {{
     *    host: string,
     *    secret: string,
     * }} args
     */
    setupInferenceAdapter(args) { return this.#call("setupInferenceAdapter", args); }

    // ── deObject partial query ──────────────────────────────────

    /**
     * Query a portion of the deObject without transferring the whole thing.
     *
     * @param {object}            args
     * @param {string | string[]} [args.path]  - dot path or array of segments into deObject
     * @param {string[]}          [args.pick]  - only return these keys at the target
     * @param {string[]}          [args.skip]  - exclude these keys at the target (ignored when pick is set)
     * @param {number}            [args.depth] - max depth to recurse (0 = keys only)
     * @returns {Promise<any>}
     */
    queryDEObject(args) { return this.#call("queryDEObject", args); }

    // ── Lifecycle ───────────────────────────────────────────────────

    terminate() {
        this.#worker.terminate();
    }
}
