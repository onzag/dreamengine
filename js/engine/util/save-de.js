// TODO implement this

import { DEngine } from "../index.js";
import { deEngineUtils } from "../utils.js";

/**
 * @param {DEObject} object 
 */
export function removeUnnecessaryPropertiesFromDE(object) {
    return object;
}

/**
 * @param {DEngine} engine
 * @param {*} savedDE 
 * @returns {DEObject}
 */
export function regenerateDEFromSavedDE(engine, savedDE) {
    savedDE.functions = engine.allInternalFunctions;
    savedDE.utils = deEngineUtils;
    return savedDE;
}