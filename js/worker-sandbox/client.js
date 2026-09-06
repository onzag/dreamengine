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
    /** @type {((level: "info" | "warning" | "error", message: string) => void) | null} */
    onCycleInform = null;
    /** @type {((thinking: boolean, characterName: string | null, noMoreCharactersToTalk: boolean) => void) | null} */
    onThinkingInform = null;
    /** @type {((data: import('../engine/index.js').EngineConversationEvent) => void) | null} */
    onInferringOverConversationMessage = null;
    /** @type {((data: {qid: number, questionType: string, question: string, options?: string[], defaultValue?: any}) => void) | null} */
    onScriptTypeGuiderQuestion = null;
    /** @type {((data: {currentCard: any}) => void) | null} */
    onCardTypeWizardComplete = null;

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
            e.preventDefault();
            const msg = e.message
                || (e.error && (e.error.message || String(e.error)))
                || `Unidentified worker error (type=${e.type}, event keys: ${Object.keys(e).join(", ") || "none"})`;
            const info = e.filename ? ` (${e.filename}:${e.lineno}:${e.colno})` : "";
            console.error(`[EngineWorker] Worker error: ${msg}${info}`, e);
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
                        console.error(`[EngineWorker] RPC #${msg.id} rejected:`, msg.error);
                        // Reconstruct an Error that preserves the worker-side
                        // name, message, and stack trace so callers (and the
                        // UI) see where the error actually originated rather
                        // than just the onmessage line in this file.
                        const info = msg.error;
                        let rejectionError;
                        if (info && typeof info === "object") {
                            rejectionError = new Error(info.message || "Worker RPC error");
                            if (info.name) rejectionError.name = info.name;
                            if (info.stack) rejectionError.stack = info.stack;
                        } else {
                            rejectionError = new Error(String(info));
                        }
                        p.reject(rejectionError);
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
                    case "workerLoadError":
                        console.error("[EngineWorker] Worker failed to load modules:\n" + msg.data.error);
                        readyReject(new Error(`Worker module load failed: ${msg.data.error}`));
                        break;
                    case "deObjectUpdated":
                        this.onDEObjectUpdated?.();
                        break;
                    case "cycleInform":
                        this.onCycleInform?.(msg.data.level, msg.data.message);
                        break;
                    case "thinkingInform":
                        this.onThinkingInform?.(msg.data.thinking, msg.data.characterName, msg.data.noMoreCharactersToTalk);
                        break;
                    case "inferringOverConversationMessage":
                        this.onInferringOverConversationMessage?.(msg.data);
                        break;
                    case "ScriptTypeGuiderQuestion":
                        this.onScriptTypeGuiderQuestion?.(msg.data);
                        break;
                    case "cardTypeWizardComplete":
                        this.onCardTypeWizardComplete?.(msg.data);
                        break;
                    case "stopDiffusionRequest": {
                        const { callId } = msg.data;
                        window.API.stopDiffusionProcess().then(() => {
                            this.#worker.postMessage({ type: "mainThreadCallResponse", callId });
                        }).catch((/** @type {any} */ err) => {
                            this.#worker.postMessage({ type: "mainThreadCallResponse", callId, error: err?.message ?? String(err) });
                        });
                        break;
                    }
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

    pauseInference() { return this.#call("pauseInference"); }
    resumeInference() { return this.#call("resumeInference");}

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

    getLastSafeState() { return this.#call("getLastSafeState"); }
    /** @param {{ disabled: boolean }} args */
    setWorldRulesDisabled(args) { return this.#call("setWorldRulesDisabled", args); }
    enableSchizophreniaModeForUser() { return this.#call("enableSchizophreniaModeForUser"); }

    /** @param {{ user: DEMinimalCharacterReference | null, playMode: "player" | "narrator" | "voice-in-the-head" }} args */
    initialize(args) { return this.#call("initialize", args); }
    /** @param {{ newName: string | null }} args */
    completeDisruptedInitializationDueToNameConflict(args) { return this.#call("completeDisruptedInitializationDueToNameConflict", args); }
    endSimulation() { return this.#call("endSimulation"); }
    /**
     * @returns {Promise<import('../engine/index.js').EngineInitializationInfo>}
     */
    getEngineScriptInfo() { return this.#call("getEngineScriptInfo"); }
    /** @param {{ characterName: string }} args */
    assumeCharacterIdentity(args) { return this.#call("assumeCharacterIdentity", args); }
    /** @param {{ characterName: string }} args */
    addCharacterToParty(args) { return this.#call("addCharacterToParty", args); }
    /** @param {{ json: * }} args */
    initializeFromJSONState(args) { return this.#call("initializeFromJSONState", args); }
    /** @param {{ commandText: string }} args */
    executeCommand(args) { return this.#call("executeCommand", args); }
    requestTurn() { return this.#call("requestTurn"); }

    // ── DEJSEngine methods ──────────────────────────────────────────

    /** @param {{ namespace: string, id: string, options?: any }} args */
    jsEngineImportScript(args) { return this.#call("jsEngineImportScript", args); }
    /** @param {{ scripts: Array<{namespace: string, id: string}> }} args */
    jsEngineImportScripts(args) { return this.#call("jsEngineImportScripts", args); }
    jsEnginePreloadAllScripts() { return this.#call("jsEnginePreloadAllScripts"); }
    jsEngineRecreate() { return this.#call("jsEngineRecreate"); }
    /**
     * @param {string} namespace 
     * @param {string} id 
     * @param {{ deleted?: boolean, moved?: { newNamespace: string, newId: string } }} options 
     * @returns {Promise<void>}
     */
    jsEngineUpdate(namespace, id, options) { return this.#call("jsEngineUpdate", { namespace, id, options }); }
    jsEngineClearExecutionOrder() { return this.#call("jsEngineClearExecutionOrder"); }
    jsEngineInitialize() { return this.#call("jsEngineInitialize"); }
    jsEngineUnload() { return this.#call("jsEngineUnload"); }
    /** @param {{ characterName: string }} args */
    jsEngineOnInferenceExecuted(args) { return this.#call("jsEngineOnInferenceExecuted", args); }
    /**
     * @param {{ namespace: string, id: string }} args
     * @returns {Promise<{ srcUrl: string }>} The script source URL
     */
    getScriptSourceURL(args) { return this.#call("getScriptSourceURL", args); }
    /**
     * @param {{ namespace: string, id: string }} args
     * @returns {Promise<{ src: string }>} The raw script source
     */
    getRawScriptSource(args) { return this.#call("getRawScriptSource", args); }
    /**
     * @returns {Promise<Record<string, {
     *   id: string,
     *   namespace: string,
     *   description: string,
     *   type: string,
     *   exposeProperties: DEScriptExposeProperties,
     *   exposeCharacters: DEScriptExposeCharacters,
     *   metadata?: Record<string, boolean | string | number | null>
     * }>>} An object mapping script keys to their description, type, and exposeProperties/Characters, used for UI display and other purposes
     */
    jsEngineGetInfoMap() {
        return this.#call("jsEngineGetInfoMap");
    }
    /**
     * @param {{ scripts: Array<{namespace: string, id: string}> }} args
     * @returns {Promise<Record<string, { id: string, namespace: string, description: string, type: string, exposeProperties: DEScriptExposeProperties, exposeCharacters: DEScriptExposeCharacters, metadata?: Record<string, any> }>>} An object mapping script keys to their description, type, and exposeProperties/Characters, used for UI display and other purposes
     */
    jsEngineGetInfoMapForScripts(args) {
        return this.#call("jsEngineGetInfoMapForScripts", args);
    }
    /**
     * @param {{
     *    host: string,
     *    secret: string,
     *    allowSelfSigned: boolean,
     *    useExperimentalTestMode: boolean,
     * }} args
     */
    setupInferenceAdapter(args) { return this.#call("setupInferenceAdapter", args); }

    /**
     * @param {string} lang 
     * @returns {Promise<{ warning?: string, ok: boolean }>} Resolves when the inference adapter is initialized, or rejects if it fails. If the inference adapter is not available, resolves with a warning message.
     */
    initializeInferenceAdapter(lang) { return this.#call("initializeInferenceAdapter", { lang }); }

    // ── deObject partial query ──────────────────────────────────

    /**
     * Query a portion of the deObject without transferring the whole thing.
     *
     * @param {object}            args
     * @param {string | string[]} [args.path]  - dot path or array of segments into deObject
     * @param {string[]}          [args.pick]  - only return these keys at the target
     * @param {string[]}          [args.skip]  - exclude these keys at the target (ignored when pick is set)
     * @param {number}            [args.depth] - max depth to recurse (0 = keys only)
     * @param {boolean|Array<string|number|boolean|{char: string}>} [args.call] - whether to call functions at the target, either a blanket boolean or an array of arguments (default: false)
     * @returns {Promise<any>}
     */
    queryDEObject(args) { return this.#call("queryDEObject", args); }

    /**
     * 
     * @param {object} args
     * @param {string|string[]} args.path - path of template to call on the worker
     * @param {string} args.characterName - name of character to call template on 
     * @returns {Promise<string>} The resulting string from the template
     */
    callCharOnlyTemplate(args) { return this.#call("callCharOnlyTemplate", args); }

    /**
     * 
     * @param {object} args
     * @param {string|string[]} args.path - path of template to call on the worker
     * @param {string} args.characterName - name of character to call template on
     * @param {string} args.otherName - name of other character to call template on
     * @returns {Promise<string>} The resulting string from the template
     */
    callCharAndOtherTemplate(args) { return this.#call("callCharAndOtherTemplate", args); }

    /**
     * 
     * @param {object} args
     * @param {string} args.sceneName scene name to start
     * @returns {Promise<void>}
     */
    startScene(args) { return this.#call("startScene", args); }

    /**
     * 
     * @param {{stability: number}} args 
     * @returns {Promise<void>}
     */
    setDreamStability(args) { return this.#call("setDreamStability", args); }

    // ── CardType Wizard ─────────────────────────────────────────────

    /**
     * Start or continue cardtype generation on the worker.
     * @param {{ currentCard: import('../script-generation/base.js').ScriptTypeGenerator, guided: boolean, language: string }} args
     */
    continueCardTypeWizard(args) { return this.#call("continueCardTypeWizard", args); }

    /**
     * Cancel any in-progress cardtype wizard generation.
     */
    cancelCardTypeGeneration() { return this.#call("cancelCardTypeGeneration"); }

    /**
     * Provides the current state of the cardtype wizard on the worker.
     * @returns {Promise<{state: any}>} The current state of the cardtype wizard
     */
    getCardTypeWizardState() { return this.#call("getCardTypeWizardState"); }

    /**
     * 
     * @param {{ namespace: string, id: string }} args
     * @returns {Promise<* | null>}
     */
    getWizardStateFromScript(args) { return this.#call("getWizardStateFromScript", args); }

    /**
     * Send an answer to a guider question on the worker.
     * @param {{ qid: number, value: any }} args
     */
    sendGuiderAnswer({ qid, value }) {
        this.#worker.postMessage({ type: "ScriptTypeGuiderAnswer", qid, value });
    }

    goBackInCardTypeWizard() {
        this.#worker.postMessage({ type: "ScriptTypeGuiderGoBack" });
    }

    /**
     * @param {{ characterName: string, lastMessageGid: string | null }} args
     * @returns {Promise<import("../engine/util/messages.js").DEObjectMessageGeneratorResult[]>}
     */
    getHistoryForCharacter(args) { return this.#call("getHistoryForCharacter", args); }

    /**
     * @param {{ characterName: string }} args 
     * @returns {Promise<{info: string}>} The debug info for the character
     */
    getDebugInfoForCharacter(args) { return this.#call("getDebugInfoForCharacter", args); }

    /**
     * 
     * @param {{ message__debug_id: string }} args 
     * @returns {Promise<{info: string}>} The debug info for the message
     */
    getDebugInfoForMessage(args) { return this.#call("getDebugInfoForMessage", args); }

    // ── Lifecycle ───────────────────────────────────────────────────

    terminate() {
        this.#worker.terminate();
    }
}
