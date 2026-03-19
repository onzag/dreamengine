import { DEngine } from "../index.js";

/**
     * Retruns the weather system for a given location and weather name,
     * taking into account location hierarchy (parent locations).
     * @param {DEngine} engine
     * @param {string} locationName 
     * @param {string} weatherName 
     * @returns {DEWeatherSystem}
     */
export function getWeatherSystemForLocationAndWeather(engine, locationName, weatherName) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    const locationInfo = engine.deObject.world.locations[locationName];
    if (!locationInfo) {
        throw new Error(`Location ${locationName} not found in world.`);
    }
    const weatherSystem = locationInfo.ownWeatherSystem?.find(ws => ws.name === weatherName);
    if (!weatherSystem && locationInfo.parent) {
        return getWeatherSystemForLocationAndWeather(engine, locationInfo.parent, weatherName);
    } else if (!weatherSystem) {
        throw new Error(`Weather system ${weatherName} not found in location ${locationName} or its parents.`);
    }
    return weatherSystem;
}