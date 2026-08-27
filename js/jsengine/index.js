import { DEngine } from "../engine/index.js";

const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;

/**
 * Creates an async function with no sandboxing — runs in the current context.
 * Easy to debug since stack traces and breakpoints work normally.
 * 
 * @param {string} args - Comma-separated list of argument names
 * @param {string} body - The function body source code
 * @param {string} [sourceURL] - Optional sourceURL for DevTools debugging
 * @returns {Function} An async function
 */
function loadFunctionInsecure(args, body, sourceURL) {
    if (sourceURL) body += `\n//# sourceURL=${sourceURL}`;
    return new AsyncFunction(args, body);
}

export class DEJSEngine {
    /**
     * @type {DEngine}
     */
    engine;
    /**
     * A resolver function that resolves a script to its contents
     * the resolver function takes a namespace and an id and returns a promise that resolves to the script contents
     * @type {(namespace: string, id: string) => Promise<{src: string, srcUrl: string}>}
     */
    resolver;
    /**
     * A resolver function that lists all available scripts
     * the listResolver function returns a promise that resolves to an array of objects with namespace and id properties
     * @type {() => Promise<Array<{namespace: string, id: string}>>}
     */
    listResolver;

    /**
     * A cache for resolved scripts to avoid resolving the same script multiple times
     * @type {Record<string, DEScript>}
     */
    scriptCache = {};
    /**
     * @type {string[]} An array of script keys in the order they were added, used to maintain execution order when needed
     */
    scriptOrder = [];

    /**
     * @param {DEngine} engine
     * @param {{ resolver: (namespace: string, id: string) => Promise<{src: string, srcUrl: string}>, listResolver: () => Promise<Array<{namespace: string, id: string}>> }} options
     */
    constructor(engine, { resolver, listResolver } ) {
        this.engine = engine;
        this.resolver = resolver;
        this.listResolver = listResolver;

        this.importScript = this.importScript.bind(this);
        this.__panthomImports = false; // internal flag to prevent adding scripts to order during bulk imports
        this.__forceNextImport = false; // internal flag to force re-importing a script even if it's cached
        /**
         * Tracks recent update() calls to suppress duplicate events within a 1 s window.
         * Key format: `<namespace>/<id>:<type>[:<newNamespace>/<newId>]`
         * @type {Map<string, number>}
         */
        this.__recentUpdates = new Map();

        /**
         * @type {Record<string, Array<string>>} A dependency tree mapping script keys to arrays of script keys they depend on, used for determining execution order and detecting circular dependencies
         */
        this.dependencyTree = {};

        engine.setJSEngine(this);
    }

    /**
     * @overload
     * @param {string} namespace
     * @param {string} id
     * @param {{ optional: true }} options
     * @returns {Promise<DEScript | null>}
     */
    /**
     * @overload
     * @param {string} namespace
     * @param {string} id
     * @param {{ optional?: false }} [options]
     * @returns {Promise<DEScript>}
     */
    /**
     * @param {string} namespace 
     * @param {string} id
     * @param {{ optional?: boolean }} [options]
     * @returns {Promise<DEScript | null>}
     */
    async importScript(namespace, id, options) {
        const key = `${namespace}/${id}`;

        let forcePanthomImport = false;
        if (this.__forceNextImport) {
            console.log(`Force importing script ${key}...`);
            delete this.scriptCache[key];
            delete this.dependencyTree[key];
            const wasPanthomImported = !this.scriptOrder.includes(key);
            forcePanthomImport = wasPanthomImported;
            this.__forceNextImport = false;
        }

        const panthomImport = this.__panthomImports || forcePanthomImport;

        if (this.scriptCache[key]) {
            if (!panthomImport && !this.scriptOrder.includes(key)) {
                console.log("Adding cached script to execution order:", key);
                this.scriptOrder.push(key);

                // find other scripts that this script imports
                const deps = this.dependencyTree[key];
                if (deps) {
                    for (const dep of deps) {
                        if (!this.scriptOrder.includes(dep)) {
                            await this.importScript(dep.split('/')[0], dep.split('/')[1]);
                        }
                    }
                }
            }
            return this.scriptCache[key];
        }

        console.log(`Importing script: ${key}`);

        /**
         * @type {{src: string, srcUrl: string}}
         */
        let file;
        try {
            file = await this.resolver(namespace, id);
        } catch (error) {
            if (options?.optional) {
                console.warn(`Optional script ${namespace}/${id} failed to resolve:`, error);
                return null;
            } else {
                throw error;
            }
        }

        const insecureFn = loadFunctionInsecure("importScript, engine", file.src, file.srcUrl);
        /**
         * @type {{ exports: any }} The module object that the script will populate
         */
        const engine = { exports: undefined };

        /**
         * 
         * @param {*} ns 
         * @param {*} scriptId 
         * @param {*} opts 
         */
        const importScriptOverride = async (ns, scriptId, opts) => {

            // we force panthom imports for scripts that are imported by the other script
            // if this script was imported as a panthom import and then updated, therefore
            // calling the force re-import of the dependency, this also occurs for new files that
            // are added
            let setPanthomImports = false;
            if (forcePanthomImport && !this.__panthomImports) {
                setPanthomImports = true;
                this.__panthomImports = true;
            }
            const result = await this.importScript(ns, scriptId, opts);
            if (setPanthomImports) {
                this.__panthomImports = false;
            }

            if (result) {
                const depKey = `${ns}/${scriptId}`;
                if (!this.dependencyTree[key]) {
                    this.dependencyTree[key] = [];
                }
                if (!this.dependencyTree[key].includes(depKey)) {
                    this.dependencyTree[key].push(depKey);
                }
            }
            return result;
        }

        await insecureFn(importScriptOverride, engine);

        if (typeof engine.exports === "undefined" || engine.exports === null) {
            console.warn(`Script ${key} did not set exports, defaulting to empty object`);
            engine.exports = {};
        }

        engine.exports.__source = file.src;
        engine.exports.__sourceURL = file.srcUrl;

        // @ts-ignore
        this.scriptCache[key] = engine.exports;

        if (!engine.exports.metadata) {
            engine.exports.metadata = {};
        }

        engine.exports.metadata.__placeholder = engine.exports.metadata.__placeholder || file.src.startsWith("//@placeholder");

        if (file.src.startsWith("//@state") && !engine.exports.metadata.__placeholder) {
            engine.exports.metadata.__in_progress = engine.exports.metadata.__in_progress || /"guidedWizardInProgress"\s*:\s*true/.test(file.src)
                || /"automaticWizardInProgress"\s*:\s*true/.test(file.src);
        }

        if (!panthomImport) {
            console.log("Adding script to execution order:", key);
            this.scriptOrder.push(key);
        }

        // @ts-ignore
        return engine.exports;
    }

    async initialize() {
        for (const scriptKey of this.scriptOrder) {
            const script = this.scriptCache[scriptKey];
            if (script.initialize) {
                console.log(`Initializing script ${scriptKey}...`);
                // @ts-ignore
                await script.initialize(this.engine.deObject);
            }
        }
    }

    async unload() {
        this.scriptOrder = [];
        console.log("Unloaded all scripts from the script execution order. Script cache is unchanged.");
    }

    /**
     * @param {string} characterName 
     */
    async onInferenceExecuted(characterName) {
        for (const scriptKey of this.scriptOrder) {
            const script = this.scriptCache[scriptKey];
            if (script.onInferenceExecuted) {
                console.log(`Running onInferenceExecuted for script ${scriptKey}...`);
                // @ts-ignore
                await script.onInferenceExecuted(this.engine.deObject, characterName);
            }
        }
    }

    /**
     * @param {Array<{namespace: string, id: string}>} scripts 
     */
    async importScripts(scripts) {
        for (const { namespace, id } of scripts) {
            await this.importScript(namespace, id);
        }
    }

    /**
     * 
     * @param {string} namespace 
     * @param {string} id 
     * @returns {Promise<string>} The raw source code of the script
     */
    async getRawSource(namespace, id) {
        const key = `${namespace}/${id}`;
        if (this.scriptCache[key]) {
            return this.scriptCache[key].__source;
        }
        const file = await this.resolver(namespace, id);
        return file.src;
    }

    async recreate() {
        console.log("Recreating JS engine...");
        this.scriptCache = {};
        this.scriptOrder = [];
        this.dependencyTree = {};
        this.__recentUpdates.clear();
    }

    /**
     * @param {string} namespace 
     * @param {string} id 
     * @param {{ deleted?: boolean, moved?: { newNamespace: string, newId: string } }} options 
     */
    async update(namespace, id, options) {
        console.log(`Updating script ${namespace}/${id}...`, options);
        const key = `${namespace}/${id}`;

        // Deduplicate: the UI may eagerly trigger the same update before the
        // filesystem watcher fires. Ignore a second identical call within 1 s.
        const updateKey = options?.deleted
            ? `${key}:deleted`
            : options?.moved
                ? `${key}:moved:${options.moved.newNamespace}/${options.moved.newId}`
                : `${key}:changed`;
        const now = Date.now();
        const lastSeen = this.__recentUpdates.get(updateKey);
        if (lastSeen !== undefined && now - lastSeen < 1000) {
            console.log(`Skipping duplicate update for ${updateKey} within 1 s window.`);
            return;
        }
        this.__recentUpdates.set(updateKey, now);

        if (options?.deleted) {
            if (!this.scriptCache[key]) {
                return;
            }
            console.log(`Script ${key} was deleted. Removing from cache and execution order.`);
            delete this.scriptCache[key];
            this.scriptOrder = this.scriptOrder.filter(k => k !== key);
            delete this.dependencyTree[key];
            return;
        } else if (options?.moved) {
            if (!this.scriptCache[key]) {
                return;
            }
            const newKey = `${options.moved.newNamespace}/${options.moved.newId}`;
            console.log(`Script ${key} was moved to ${newKey}. Updating cache and execution order.`);
            if (this.scriptCache[key]) {
                this.scriptCache[newKey] = this.scriptCache[key];
                delete this.scriptCache[key];
            }
            this.scriptOrder = this.scriptOrder.map(k => (k === key ? newKey : k));
            if (this.dependencyTree[key]) {
                this.dependencyTree[newKey] = this.dependencyTree[key];
                delete this.dependencyTree[key];
            }
        } else {
            // new or updated script, it must be re-imported
            this.__forceNextImport = true;
            await this.importScript(namespace, id);
        }

        if (options?.deleted || options?.moved) {
            // Destroy any other scripts that depend on this script, since they must be broken now
            for (const [otherKey, deps] of Object.entries(this.dependencyTree)) {
                if (deps.includes(key)) {
                    console.log(`Script ${otherKey} depends on ${key}. Removing from cache and execution order.`);
                    delete this.scriptCache[otherKey];
                    this.scriptOrder = this.scriptOrder.filter(k => k !== otherKey);
                    delete this.dependencyTree[otherKey];
                }
            }
        } else {
            // Re-import scripts that depend on this script, since they may have changed
            for (const [otherKey, deps] of Object.entries(this.dependencyTree)) {
                if (deps.includes(key)) {
                    console.log(`Script ${otherKey} depends on ${key}. Re-importing...`);
                    const [ns, id] = otherKey.split('/');
                    this.__forceNextImport = true;
                    await this.importScript(ns, id);
                }
            }
        }
    }

    async clearExecutionOrder() {
        console.log("Clearing script execution order...");
        this.scriptOrder = [];
    }

    async preloadAllScripts() {
        const scripts = await this.listResolver();
        this.__panthomImports = true;
        for (const { namespace, id } of scripts) {
            try {
                await this.importScript(namespace, id);
            } catch (error) {
                console.warn(`Failed to preload script ${namespace}/${id}:`, error);
            }
        }
        this.__panthomImports = false;
    }

    /**
     * @returns {Record<string, { id: string, namespace: string, language: string, description: string, type: string, exposeProperties: DEScriptExposeProperties, exposeCharacters: DEScriptExposeCharacters, metadata?: Record<string, any> }>} An object mapping script keys to their description, type, and exposeProperties, used for UI display and other purposes
     */
    getInfoMap() {
        /**
         * @type {Record<string, { id: string, namespace: string, language: string, description: string, type: string, exposeProperties: DEScriptExposeProperties, exposeCharacters: DEScriptExposeCharacters, metadata?: Record<string, any> }>}
         */
        const infoMap = {};
        for (const key in this.scriptCache) {
            const script = this.scriptCache[key];
            infoMap[key] = {
                id: key.split('/')[1],
                namespace: key.split('/')[0],
                language: script.language || "en",
                description: script.description || "No description available.",
                type: script.type || "No type specified.",
                exposeProperties: script.exposeProperties || {},
                exposeCharacters: script.exposeCharacters || {},
                metadata: script.metadata || {},
            };
        }
        return infoMap;
    }

    /**
     * @param {string} namespace 
     * @param {string} id 
     * @returns 
     */
    getScriptSource(namespace, id) {
        const key = `${namespace}/${id}`;
        if (this.scriptCache[key]) {
            return this.scriptCache[key].__source;
        }
        return null;
    }

    /**
     * @param {Array<{namespace: string, id: string}>} scripts 
     * @returns {Record<string, { id: string, namespace: string, language: string, description: string, type: string, exposeProperties: DEScriptExposeProperties, exposeCharacters: DEScriptExposeCharacters, metadata?: Record<string, boolean | string | number> }>}
     */
    getInfoMapForScripts(scripts) {
        /**
         * @type {Set<string>}
         */
        const keys = new Set();

        /**
         * 
         * @param {string} key 
         * @returns 
         */
        const collect = (key) => {
            if (keys.has(key)) return;
            keys.add(key);
            const deps = this.dependencyTree[key];
            if (deps) {
                for (const dep of deps) {
                    collect(dep);
                }
            }
        };

        for (const { namespace, id } of scripts) {
            collect(`${namespace}/${id}`);
        }

        /** @type {Record<string, { id: string, namespace: string, language: string, description: string, type: string, exposeProperties: DEScriptExposeProperties, exposeCharacters: DEScriptExposeCharacters, metadata?: Record<string, any> }>} */
        const infoMap = {};
        for (const key of keys) {
            const script = this.scriptCache[key];
            if (!script) continue;
            infoMap[key] = {
                id: key.split('/')[1],
                namespace: key.split('/')[0],
                language: script.language || "en",
                description: script.description || "No description available.",
                type: script.type || "No type specified.",
                exposeProperties: script.exposeProperties || {},
                exposeCharacters: script.exposeCharacters || {},
                metadata: script.metadata || {},
            };
        }
        return infoMap;
    }
}