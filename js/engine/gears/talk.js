import { DEngine } from "../index.js";
import { getCharacterCanSee, getSysPromptForCharacter } from "../util/character-info.js";

/**
 * @param {DEngine} engine 
 * @param {DECompleteCharacterReference} character
 * @param {{
 *   doNotMove: boolean, // if true, the character will not be allowed to change location
 * }} options
 */
export async function talk(engine, character, options) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    } else if (!engine.inferenceAdapter) {
        throw new Error("Inference adapter not initialized");
    } else if (!engine.deObject.characters[character.name]) {
        throw new Error(`Character ${character.name} not found in the engine`);
    }

    const characterSystemPrompt = await getSysPromptForCharacter(engine, character.name);
    const characterCanSee = await getCharacterCanSee(engine, character.name);

    console.log(characterSystemPrompt.sysprompt);
    console.log("##############");
    console.log(characterSystemPrompt.internalDescription.stateInjections);
    console.log("##############");
    console.log(characterCanSee.everything);

    // TODO
    process.exit(1);
}