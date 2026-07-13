// TODO implement this

import { createCharacterFromUser, DEngine, repairPotentialUserWithDefaults } from "../index.js";
import { deEngineUtilsFn } from "../utils.js";

/**
 * For a given DEObject that represents the state of a playthrough, remove all properties that are not necessary to save the state of the game. This is useful for saving the game state to a file or database, as it reduces the amount of data that needs to be stored.
 * 
 * @param {DEObject} object 
 */
export function removeUnnecessaryPropertiesFromDE(object) {
    /**
     * @type {*}
     */
    const cleanedDE = {
        state: object.state,
        stateFor: object.stateFor,
        internalState: object.internalState,
        conversations: object.conversations,
        bonds: object.bonds,
        gameOver: object.gameOver,
        importantEvents: object.importantEvents,
        currentTime: object.currentTime,
        initialTime: object.initialTime,
        party: object.party,
        playMode: object.playMode,
        user: object.user,
        stability: object.stability,
        characters: {},
        world: {
            currentLocation: object.world.currentLocation,
            currentLocationSlot: object.world.currentLocationSlot,
            state: object.world.state,
            selectedScene: object.world.selectedScene,
            locations: {},
            connections: {},
        },
    };
    for (const [charId, char] of Object.entries(object.characters)) {
        cleanedDE.characters[charId] = {
            state: char.state,
        };
    }
    for (const [locId, loc] of Object.entries(object.world.locations)) {
        cleanedDE.world.locations[locId] = {
            state: loc.state,
            internalState: loc.internalState,
        };
    }
    for (const [connId, conn] of Object.entries(object.world.connections)) {
        cleanedDE.world.connections[connId] = {
            state: conn.state,
        }
    }
    return cleanedDE;
}

/**
 * Restores a DEObject from a saved DEObject that has had unnecessary properties removed. This is useful for loading a saved game state from a file or database, as it allows the game to be restored to its previous state.
 * Notice that this fills all the missing properties with default values, in order for the DE to properly be recreated, the same scripts that were used to create the original DEObject must be
 * used to regenerate the DEObject from the saved DEObject. Otherwise, the regenerated DEObject may not be compatible with the original DEObject, and may cause errors or unexpected behavior.
 * 
 * For that reason a saved DEObject needs to include the engine script info.
 * 
 * By default when the engine is called to save the DE, it will add that property on __scripts
 * 
 * @param {DEngine} engine
 * @param {*} savedDE 
 * @returns {DEObject}
 */
export function regenerateDEFromSavedDE(engine, savedDE) {
    /**
     * @type {DEObject}
     */
    const properDE = {
        bonds: savedDE.bonds,
        conversations: savedDE.conversations,
        currentTime: savedDE.currentTime,
        gameOver: savedDE.gameOver,
        importantEvents: savedDE.importantEvents,
        initialTime: savedDE.initialTime,
        party: savedDE.party,
        playMode: savedDE.playMode,
        state: savedDE.state,
        stateFor: savedDE.stateFor,
        internalState: savedDE.internalState,
        user: savedDE.user,
        stability: savedDE.stability,
        characters: {},
        world: {
            currentLocation: savedDE.world.currentLocation,
            currentLocationSlot: savedDE.world.currentLocationSlot,
            state: savedDE.world.state,
            selectedScene: savedDE.world.selectedScene,
            locations: {},
            connections: {},
            initialScenes: [],
            lore: null,
            name: "",
            scenes: {},
            temp: {},
        },
        interests: {},
        narrationStyle: {
            maxParagraphs: 3,
            minParagraphs: 2,
            narrativeBias: 0.2,
        },
        worldNames: {
            mal: [],
            fem: [],
            amb: [],
        },
        worldRules: {},

        // @ts-ignore
        utils: null,
    };
    properDE.utils = deEngineUtilsFn(properDE);

    for (const [charId, char] of Object.entries(savedDE.characters)) {
        // @ts-ignore
        const cheapUserStyle = repairPotentialUserWithDefaults({name: charId});
        const properChar = createCharacterFromUser(cheapUserStyle);
        properChar.state = char.state;
        properDE.characters[charId] = properChar;
    }

    for (const [locId, loc] of Object.entries(savedDE.world.locations)) {
        properDE.world.locations[locId] = {
            state: loc.state,
            internalState: loc.internalState,
            description: "",
            entrances: [],
            isIndoors: false,
            isPrivate: false,
            isSafe: true,
            locationFullyBlocksWeather: [],
            locationNegativelyExposesCharactersToWeather: [],
            locationPartiallyBlocksWeather: [],
            maxHeightCm: 300,
            maxVolumeLiters: 1000,
            maxWeightKg: 1000,
            ownWeatherSystem: null,
            parent: null,
            slots: {},
            temp: {},
        };
    }

    for (const [connId, conn] of Object.entries(savedDE.world.connections)) {
        properDE.world.connections[connId] = {
            state: conn.state,
            bidirectional: true,
            distanceMeters: 0,
            from: "???",
            to: "???",
            temp: {},
            maxHeightCm: 300,
            maxVolumeLiters: 1000,
            maxWeightKg: 1000,
            onlyVehicles: false,
            otherPassageConditions: {},
            vehicleTypes: [],
        };
    }

    return properDE;
}