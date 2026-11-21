/**
     * Returns the weather system for a given location and weather name,
     * taking into account location hierarchy (parent locations).
     * @param {DEObject} deObject
     * @param {string} locationId
     * @param {string|null} weatherName 
     * @returns {DEWeatherSystem}
     */
export function getWeatherSystemForLocationAndWeather(deObject, locationId, weatherName) {
    const locationInfo = deObject.world.locations[locationId];
    if (!locationInfo) {
        throw new Error(`Location ${locationId} not found in world.`);
    }
    const actualWeatherName = weatherName || locationInfo.internalState.currentWeather;
    const weatherSystem = locationInfo.ownWeatherSystem?.find(ws => ws.name === actualWeatherName);
    if (!weatherSystem && locationInfo.parent) {
        return getWeatherSystemForLocationAndWeather(deObject, locationInfo.parent, actualWeatherName);
    } else if (!weatherSystem) {
        throw new Error(`Weather system ${actualWeatherName} not found in location ${locationId} or its parents.`);
    }
    return weatherSystem;
}