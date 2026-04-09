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

        if (this.scriptCache[key]) {
            if (!this.__panthomImports && !this.scriptOrder.includes(key)) {
                console.log("Adding cached script to execution order:", key);
                this.scriptOrder.push(key);
            }
            return this.scriptCache[key];
        }

        console.log(`Importing script ${key}...`);

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
            const result = await this.importScript(ns, scriptId, opts);
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

        // @ts-ignore
        this.scriptCache[key] = engine.exports;
        if (!this.__panthomImports) {
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

    async recreate() {
        console.log("Recreating JS engine...");
        const newCache = {};
        const newOrder = [];
        const newDependencyTree = {};
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
     * @returns {Record<string, { id: string, namespace: string, description: string, type: string, exposeProperties: DEScriptExposeProperties }>} An object mapping script keys to their description, type, and exposeProperties, used for UI display and other purposes
     */
    getInfoMap() {
        /**
         * @type {Record<string, { id: string, namespace: string, description: string, type: string, exposeProperties: DEScriptExposeProperties }>}
         */
        const infoMap = {};
        for (const key in this.scriptCache) {
            const script = this.scriptCache[key];
            infoMap[key] = {
                id: key.split('/')[1],
                namespace: key.split('/')[0],
                description: script.description || "No description available.",
                type: script.type || "No type specified.",
                exposeProperties: script.exposeProperties || {},
            };
        }
        return infoMap;
    }

    /**
     * @param {Array<{namespace: string, id: string}>} scripts 
     * @returns {Record<string, { id: string, namespace: string, description: string, type: string, exposeProperties: DEScriptExposeProperties }>}
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

        /** @type {Record<string, { id: string, namespace: string, description: string, type: string, exposeProperties: DEScriptExposeProperties }>} */
        const infoMap = {};
        for (const key of keys) {
            const script = this.scriptCache[key];
            if (!script) continue;
            infoMap[key] = {
                id: key.split('/')[1],
                namespace: key.split('/')[0],
                description: script.description || "No description available.",
                type: script.type || "No type specified.",
                exposeProperties: script.exposeProperties || {},
            };
        }
        return infoMap;
    }
}