import worldSchema from "../schema/world.js"
import { importScriptFromJSON } from "./scripts.js"

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

    const [worldScript, worldScriptsSource] = importScriptFromJSON("?DEFAULT_WORLD_SCRIPT", json, "advanced_world_script");
    const [worldScriptsAllCharacter, worldScriptsSourcesAllCharacter] = importScriptFromJSON("?DEFAULT_WORLD_ALL_CHARACTERS_SCRIPT", json, "advanced_all_characters_script");

    world.worldScripts[worldScript.id] = worldScript;
    world.worldAllCharacterSpawnScripts[worldScriptsAllCharacter.id] = worldScriptsAllCharacter;

    return {world, scriptSources: [worldScriptsSource, worldScriptsSourcesAllCharacter]};
}