import Handlebars from "../../node_modules/handlebars/dist/handlebars.js";

/**
 * @param {string} name
 * @param {"javascript" | "handlebars"} type 
 * @param {string[]} args
 * @param {string} script
 * @param {string | null} mustReturn
 * @returns {any}
 */
export function importScript(name, type, args, script, mustReturn) {
    let compiled = null;
    if (type === "handlebars") {
        // @ts-ignore
        const handlebarsCompiled = /*@type any*/ Handlebars.compile(script);
        /**
         * @param {DEObject} DE
         * @param {DECompleteCharacterReference} character
         * @param {DECompleteCharacterReference|null} other
         * @param {DEStateCausant[]} causants
         * @param {string|null} cause
         * @param {DECompleteCharacterReference|null} potentialCausant
         */
        compiled = async (DE, character, other, causants, cause, potentialCausant) => {
            /**
             * @type {any}
             */
            const handlebarObj = {
                char: character.name,
                user: DE.user.name
            }
            if (other) {
                handlebarObj["other"] = other.name;
            }
            if (causants) {
                handlebarObj["causants"] = causants.map(c => c.name );
            }
            if (cause) {
                handlebarObj["cause"] = cause;
            }
            if (potentialCausant) {
                handlebarObj["potential_causant"] = potentialCausant.name;
            }
            Object.keys(DE.functions).forEach((key) => {
                // @ts-ignore
                handlebarObj[key] = DE.functions[key].bind(null, DE, character);
            });
            const returnValue = handlebarsCompiled(handlebarObj);
            return returnValue;
        }
    } else {
        const functionArgs = args.join(", ") + ", window, global, globalThis, self, document, require";
        const functionBody = script;
        const basic = new Function(functionArgs, functionBody + `\n//# sourceURL=script://imported/${name}`);
        /**
         * @param  {...any} functionArgsValues
         */
        compiled = async (...functionArgsValues) => {
            const returnValue = await basic(...functionArgsValues, undefined, undefined, undefined, undefined, undefined, undefined);
            if (mustReturn) {
                if (typeof returnValue !== mustReturn) {
                    throw new Error(`Script ${name} must return a ${mustReturn}, but returned a ${typeof returnValue}`);
                }
            }
            return returnValue;
        }
    }
    return compiled;
}

/**
 * 
 * @param {string} id 
 * @param {string} name 
 * @param {"javascript" | "handlebars"} type 
 * @param {string} script 
 * @returns {DEStringTemplate}
 */
export function importScriptAsTemplate(id, name, type, script) {
    const execute = importScript(name, type, ["DE", "character", "other", "causants", "cause", "potentialCausant"], script, "string");
    return {
        id,
        type: "template",
        execute,
    };
}

/**
 * @param {string} id
 * @param {string} name
 * @param {string} script
 * @returns {DEScript}
 */
export function importScriptAsScript(id, name, script) {
    const execute = importScript(name, "javascript", ["DE", "character"], script, null);
    return {
        id,
        type: "script",
        execute,
    };
}

/**
 * @param {string} id
 * @param {string} name
 * @param {string} script
 * @param {"javascript" | "handlebars"} type
 * @returns {DEPropertyValueInCharSpace}
 */
export function importScriptAsPropertyValueInCharacterSpace(id, name, script, type) {
    const execute = importScript(name, type, ["DE", "character"], script, null);
    return {
        id,
        value: execute,
        type: "value_getter_char_space",
    };
}

/**
 * @param {string} id
 * @param {string} name
 * @param {string} script
 * @param {"javascript" | "handlebars"} type
 * @returns {DEPropertyValueInItemSpace}
 */
export function importScriptAsPropertyValueInItemSpace(id, name, script, type) {
    const execute = importScript(name, type, ["DE", "item"], script, null);
    return {
        id,
        value: execute,
        type: "value_getter_item_space",
    };
}

/**
 * @param {string} id
 * @param {*} json 
 * @returns {[DEScript, DEScriptSource]}
 */
export function importScriptFromJSON(id, json) {
    const scriptValue = json.script.script;
    const deScript = importScriptAsScript(id, id, scriptValue);
    /**
     * @type {DEScriptSource}
     */
    const source = {
        id,
        run: deScript.execute,
        source: scriptValue,
        sourceType: "javascript",
        type: "script",
    };
    return [deScript, source];
}

/**
 * 
 * @param {string} id 
 * @param {*} json 
 * @param {string} src 
 * @returns {[DEScript, DEScriptSource]}
 */
export function importScriptFromSplitJSON(id, json, src) {
    const scriptValue = src;
    const deScript = importScriptAsScript(id, id, scriptValue);
    /**
     * @type {DEScriptSource}
     */
    const source = {
        id,
        run: deScript.execute,
        source: scriptValue,
        sourceType: "javascript",
        type: "script",
    };
    return [deScript, source];
}