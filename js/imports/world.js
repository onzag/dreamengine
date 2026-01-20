import worldSchema from "../schema/world.js"
import { importScriptsWithImportsFromJSON } from "./characters.js"

/**
 * Imports a world from a JSON object.
 * @param {*} json
 * @return {{world: DEWorld, scriptSources: DEScriptSource[]}}
 */
export function importWorldFromJSON(json) {
    /**
     * @type {DEWorld}
     */
    const world = {
        // @ts-ignore
        currentLocation: null,
        // @ts-ignore
        currentLocationSlot: null,

        locations: {},
        connections: {},
        hasInitializedWorld: false,
        hasStartedScene: false,
        initialScenes: {},
        lore: null,
        selectedScene: null,
        worldAllCharacterSpawnScripts: {},
        worldScripts: {},
    }

    const [worldScripts, worldScriptsSources] = importScriptsWithImportsFromJSON("?WORLD", json, "advanced_world_script");
    const [worldScriptsAllCharacters, worldScriptsSourcesAllCharacters] = importScriptsWithImportsFromJSON("?WORLD", json, "advanced_all_characters_script");

    for (const script of worldScripts) {
        world.worldScripts[script.id] = script;
    }

    for (const script of worldScriptsAllCharacters) {
        world.worldAllCharacterSpawnScripts[script.id] = script;
    }

    return {world, scriptSources: [...worldScriptsSources, ...worldScriptsSourcesAllCharacters]};
}