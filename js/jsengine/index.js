import { DEngine } from "../engine";
import { sanitizeDE } from "./ensure-safe-de";

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
     * A function that takes a script body and returns a function that executes the script in a sandboxed environment
     * @type {(args: string, body: string, sourceURL?: string) => Function}
     */
    sandboxer;

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
     * @param {(args: string, body: string, sourceURL?: string) => Function} sandboxer
     */
    constructor(engine, resolver, sandboxer) {
        this.engine = engine;
        this.resolver = resolver;
        this.sandboxer = sandboxer;

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

        const sandboxed = this.sandboxer("importScript, engine", file.src, file.srcUrl);
        const engine = { exports: {} };
        await sandboxed(this.importScript, engine);

        // @ts-ignore
        this.scriptCache[key] = engine.exports;
        this.scriptOrder.push(key);

        return engine.exports;
    }

    async initialize() {
        sanitizeDE(this.engine.deObject);
        for (const scriptKey of this.scriptOrder) {
            const script = this.scriptCache[scriptKey];
            if (script.initialize) {
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
                // @ts-ignore
                await script.postAnyInference(this.engine.deObject, characterName);
            }
        }
    }

    /**
     * @param {Array<{namespace: string, id: string}>} scripts 
     */
    async addScripts(scripts) {
        if (!this.engine || !this.engine.deObject) {
            throw new Error("Engine not initialized yet, cannot add scripts");
        }
        for (const { namespace, id } of scripts) {
            await this.importScript(namespace, id);
        }
    }
}