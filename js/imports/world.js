import worldSchema from "../schema/world.js"
import { importScriptAsPropertyValueInCharacterSpace, importScriptFromJSON } from "./scripts.js"

/**
 * Imports a world from a JSON object.
 * @param {*} json
 * @return {{world: DEWorld, scriptSources: DEScriptSource[], characters: Array<{name: string; import: string; properties: Record<string, DEPropertyValueInCharSpace>; spawnLocations: string[]; spawnLocationSlots: string[]; spawnSpreadToChildrenLocations: boolean; instances: number}>}}
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
        worldSceneInitializationScripts: {},
    }

    const [worldScript, worldScriptsSource] = importScriptFromJSON("?WORLD_" + json.name + "_SCRIPT", json, "advanced_world_script");
    const [worldScriptsAllCharacter, worldScriptsSourcesAllCharacter] = importScriptFromJSON("?WORLD_" + json.name + "_ALL_CHARACTERS_SCRIPT", json, "advanced_all_characters_script");

    world.worldScripts[worldScript.id] = worldScript;
    world.worldAllCharacterSpawnScripts[worldScriptsAllCharacter.id] = worldScriptsAllCharacter;

    const scriptSources = [worldScriptsSource, worldScriptsSourcesAllCharacter];

    /**
     * @type {Array<{name: string; import: string; properties: Record<string, DEPropertyValueInCharSpace>; spawnLocations: string[]; spawnLocationSlots: string[]; spawnSpreadToChildrenLocations: boolean; instances: number}>}
     */
    const characters = [];
    for (const [characterName, characterData] of Object.entries(json.characters || {})) {
        const characterNameOverride = characterName;
        characters.push({
            name: characterNameOverride,
            import: characterData.import,
            properties: characterData.properties || {},
            spawnLocations: characterData.spawn_location.trim().split(","),
            spawnLocationSlots: characterData.spawn_location_slot.trim().split(","),
            spawnSpreadToChildrenLocations: characterData.spawn_spread_to_children_locations || false,
            instances: characterData.instances || 1,
        });

        // parse properties
        for (const [propertyName, propertyValue] of Object.entries(characterData.properties || {})) {
            const idAndName = "?WORLD_" + json.name + "_INSTANTIABLE_CHARACTER_" + characterNameOverride + "_PROPERTY_" + propertyName;
            const source = propertyValue.script;
            const sourceType = propertyValue.ts ? "javascript" : "handlebars";
            const newPropertyValue = importScriptAsPropertyValueInCharacterSpace(
                idAndName,
                idAndName,
                source,
                sourceType,
            );
            characterData.properties[propertyName] = newPropertyValue;
            scriptSources.push({
                id: idAndName,
                imports: [],
                run: newPropertyValue.value,
                source: source,
                sourceType: sourceType,
                type: "value_getter_char_space",
            });
        }
    }
    
    return {world, scriptSources, characters};
}