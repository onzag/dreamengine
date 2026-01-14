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
        compiled = /*@type any*/ Handlebars.compile(script);
    } else {
        const functionArgs = args.join(", ") + ", window, global, globalThis, self, document";
        const functionBody = script;
        const basic = new Function(functionArgs, functionBody + `\n//# sourceURL=script://imported/${name}`);
        /**
         * @param  {...any} functionArgsValues
         */
        compiled = async (...functionArgsValues) => {
            const returnValue = await basic(...functionArgsValues, undefined, undefined, undefined, undefined, undefined);
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
    const execute = importScript(name, type, ["DE", "character"], script, "string");
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
 * @returns {DEPropertyValueInCharSpace}
 */
export function importScriptAsPropertyValueInCharacterSpace(id, name, script) {
    const execute = importScript(name, "javascript", ["DE", "character"], script, null);
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
 * @returns {DEPropertyValueInItemSpace}
 */
export function importScriptAsPropertyValueInItemSpace(id, name, script) {
    const execute = importScript(name, "javascript", ["DE", "item"], script, null);
    return {
        id,
        value: execute,
        type: "value_getter_item_space",
    };
}