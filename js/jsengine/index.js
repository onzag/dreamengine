import { DEngine } from "../engine/index.js";

const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

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
     * @param {(namespace: string, id: string) => Promise<{src: string, srcUrl: string}>} resolver
     */
    constructor(engine, resolver) {
        this.engine = engine;
        this.resolver = resolver;

        this.importScript = this.importScript.bind(this);

        engine.setJSEngine(this);
    }

    /**
     * 
     * @param {string} namespace 
     * @param {string} id
     * @returns {Promise<any>}
     */
    async importScript(namespace, id) {
        const key = `${namespace}/${id}`;
        if (this.scriptCache[key]) {
            return this.scriptCache[key];
        }

        const file = await this.resolver(namespace, id);

        const insecureFn = loadFunctionInsecure("importScript, engine", file.src, file.srcUrl);
        const engine = { exports: {} };
        await insecureFn(this.importScript, engine);

        // @ts-ignore
        this.scriptCache[key] = engine.exports;
        this.scriptOrder.push(key);

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

    /**
     * @param {string} characterName 
     */
    async postAnyInference(characterName) {
        for (const scriptKey of this.scriptOrder) {
            const script = this.scriptCache[scriptKey];
            if (script.postAnyInference) {
                console.log(`Running postAnyInference for script ${scriptKey}...`);
                // @ts-ignore
                await script.postAnyInference(this.engine.deObject, characterName);
            }
        }
    }

    /**
     * @param {Array<{namespace: string, id: string}>} scripts 
     */
    async addScripts(scripts) {
        for (const { namespace, id } of scripts) {
            await this.importScript(namespace, id);
        }
    }
}