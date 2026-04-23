// TODO implement this

import { DEngine } from "../index.js";
import { deEngineUtilsFn } from "../utils.js";

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
    savedDE.utils = deEngineUtilsFn(savedDE);
    return savedDE;
}