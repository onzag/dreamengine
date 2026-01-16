/**
 * Imports a world from a JSON object.
 * @param {*} json
 * @return {[DEWorld, DEScript[], DEScriptSource[]]}
 */
function importWorldFromJSON(json) {
    /**
     * @type {DEWorld}
     */
    const world = {
        currentLocation: null,
        currentLocationSlot: null,
        locations: [],
        connections: [],
    }
}