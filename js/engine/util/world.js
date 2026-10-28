/**
     * Returns the weather system for a given location and weather name,
     * taking into account location hierarchy (parent locations).
     * @param {DEObject} deObject
     * @param {string} locationId
     * @param {string} weatherName 
     * @returns {DEWeatherSystem}
     */
export function getWeatherSystemForLocationAndWeather(deObject, locationId, weatherName) {
    const locationInfo = deObject.world.locations[locationId];
    if (!locationInfo) {
        throw new Error(`Location ${locationId} not found in world.`);
    }
    const weatherSystem = locationInfo.ownWeatherSystem?.find(ws => ws.name === weatherName);
    if (!weatherSystem && locationInfo.parent) {
        return getWeatherSystemForLocationAndWeather(deObject, locationInfo.parent, weatherName);
    } else if (!weatherSystem) {
        throw new Error(`Weather system ${weatherName} not found in location ${locationId} or its parents.`);
    }
    return weatherSystem;
}