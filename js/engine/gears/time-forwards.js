/**
 * Moves the time forwards by using the last message from a given character as a reference.
 */

import { DEngine } from "..";

/**
 * 
 * @param {DEngine} engine 
 * @param {DECompleteCharacterReference} character 
 */
export async function timeForwardsUsingLastMessage(engine, character) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
}