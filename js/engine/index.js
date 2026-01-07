import { ALL_FUNCTIONS_WITH_SPECIALS } from "../schema/functions.js"
import { weightedRandomByLikelyhood } from "../util/random.js"

function setupFunctions() {
    const finalObject = {};
    for (const [signature, details, returnDesc, fn] of ALL_FUNCTIONS_WITH_SPECIALS) {
        const parts = signature.split("->");
        const name = parts[0].trim().split(" ")[0];
        // @ts-ignore
        finalObject[name] = fn;
    }
    return finalObject;
}

/**
 * @param {DEMinimalCharacterReference} user
 * @returns {DECompleteCharacterReference}
 */
function createCharacterFromUser(user) {
    return {
        name: user.name,
        autisticResponse: 0,
        gender: user.gender,
        heightCm: user.heightCm,
        weightKg: user.weightKg,
        carryingCapacityLiters: user.carryingCapacityLiters,
        carryingCapacityKg: user.carryingCapacityKg,
        bonds: [],
        shortDescription: user.shortDescription,
        general: () => "",
        initiative: 1,
        injectableInGeneralText: {},
        injectableInStateTextAfter: {},
        injectableInStateTextBefore: {},
        properties: {},
        schizophrenia: 0,
        scripts: {
            firstInteract: [],
            postAnyInference: [],
            postInference: [],
            preInference: [],
            preStateCheck: [],
            spawn: [],
        },
        states: {},
        sex: user.sex,
        strangerInitiative: 1,
        strangerRejection: 0,
        emotions: {},
    }
}

class DEngine {
    constructor() {
        // constructor code
        this.allInternalFunctions = setupFunctions();
        /**
         * @type {DEObject | null}
         */
        this.deObject = null;
        this.initialized = false;
        /**
         * @type {DEMinimalCharacterReference | null}
         */
        this.user = null;
        /**
         * @type {DECompleteCharacterReference | null}
         */
        this.userCharacter = null;

        this.invalidCharacterStates = false;
    }
    /**
     * 
     * @param {*} deObjectJSON 
     */
    initializeFromJSONState(deObjectJSON) {
        if (this.initialized) {
            throw new Error("DEngine already initialized");
        }
        // TODO
    }
    saveStateAsJSON() {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }else if (this.invalidCharacterStates) {
            throw new Error("DEngine has invalid character states, cannot save state as JSON");
        }
        // TODO
    }
    /**
     * @param {DEMinimalCharacterReference} user
     * @param {string} startingLocation
     * @param {string} startingLocationSlot
     * @param {"standing" | "sitting" | "laying_down"} startingPosture
     * @param {DETimeDescription} startingTime
     */
    initialize(user, startingLocation, startingLocationSlot, startingPosture, startingTime) {
        this.deObject = {
            user: user,
            world: {
                currentLocation: startingLocation,
                currentLocationSlot: startingLocationSlot,
                locations: [],
            },
            characters: {},
            allNames: {
                mal: [],
                fem: [],
                amb: [],
            },
            worldNames: {
                mal: [],
                fem: [],
                amb: [],
            },
            conversations: {},
            stateFor: {},
            initialTime: startingTime,
            // @ts-ignore
            functions: this.allInternalFunctions,
            social: {
                bonds: {},
            },
        }
        
        this.user = user;
        this.userCharacter = createCharacterFromUser(user);

        this.addCharacter(this.userCharacter, startingLocation, startingLocationSlot, startingPosture);

        this.initialized = true;
    }
    /**
     * 
     * @param {DENamePool} pool 
     */
    setNamePool(pool) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        this.deObject.allNames = pool;
    }
    getCurrentDEObject() {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        return this.deObject;
    }

    /**
     * @param {DECompleteCharacterReference} character
     * @param {string} location
     * @param {string} locationSlot
     * @param {"standing" | "sitting" | "laying_down"} posture
     */
    addCharacter(character, location, locationSlot, posture) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }
        if (this.deObject.characters[character.name]) {
            throw new Error(`Character with name ${character.name} already exists.`);
        }

        this.deObject.characters[character.name] = character;
        this.deObject.social.bonds[character.name] = {
            active: [],
            ex: [],
        };

        this.deObject.stateFor[character.name] = {
            history: [],
            dead: false,
            deadEnded: false,
            deadEndReason: null,
            id: crypto.randomUUID(),
            location: location,
            locationSlot: locationSlot,
            states: [],
            type: "BACKGROUND",
            time: this.deObject.initialTime,
            conversationId: null,
            messageId: null,
            surroundingNonStrangers: [],
            surroundingStrangers: [],
            partiallyExposedToWeather: null,
            fullyExposedToWeather: null,
            posture: posture,

            // chars start out empty handed
            carrying: [],

            // chars start up naked
            // hopefully they give them some clothes soon :)
            wearing: [],
        };

        // we need to set up surroundingNonStrangers and surroundingStrangers properly later
        this.invalidCharacterStates = true;
    }

    refreshCharacterStates() {
        // TODO
    }

    /**
     * @param {DEStatefulLocationDefinition} location 
     * @param {DEStatefulLocationDefinition | null} parentLocation
     * @param {boolean} cascade
     */
    rerollLocationWeather(location, parentLocation, cascade = true) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }

        if (!location.ownWeatherSystem) {
            if (parentLocation) {
                location.currentWeather = parentLocation.currentWeather;
                location.currentWeatherHasBeenOngoingFor = parentLocation.currentWeatherHasBeenOngoingFor;
                location.currentWeatherNoEffectDescription = parentLocation.currentWeatherNoEffectDescription;
                location.currentWeatherPartialEffectDescription = parentLocation.currentWeatherPartialEffectDescription;
                location.currentWeatherFullEffectDescription = parentLocation.currentWeatherFullEffectDescription;
            } else {
                throw new Error("Location has no own weather system and no parent location to inherit weather from.");
            }
        } else {
            let shouldHaveNewWeather = false;
            const currentWeather = location.currentWeather;
            if (!currentWeather) {
                shouldHaveNewWeather = true;
            } else {
                const weatherDuration = location.currentWeatherHasBeenOngoingFor.inHours;
                const weatherSystemInfo = location.ownWeatherSystem.find(ws => ws.name === currentWeather);
                if (!weatherSystemInfo) {
                    throw new Error(`Weather system info for current weather ${currentWeather} not found.`);
                }
                if (weatherDuration >= weatherSystemInfo.maxDurationInHours) {
                    shouldHaveNewWeather = true;
                } else if (weatherDuration >= weatherSystemInfo.minDurationInHours) {
                    const chanceToChange = (weatherDuration - weatherSystemInfo.minDurationInHours) / (weatherSystemInfo.maxDurationInHours - weatherSystemInfo.minDurationInHours);
                    if (Math.random() < chanceToChange) {
                        shouldHaveNewWeather = true;
                    }
                }
            }

            if (shouldHaveNewWeather) {
                // pick new weather
                const newWeatherSystem = weightedRandomByLikelyhood(location.ownWeatherSystem);
                if (!newWeatherSystem) {
                    throw new Error("Failed to pick new weather system. Are there any weather systems defined?");
                }
                location.currentWeather = newWeatherSystem.name;
                location.currentWeatherHasBeenOngoingFor = {
                    inMinutes: 0,
                    inHours: 0,
                    inDays: 0,
                };
                location.currentWeatherNoEffectDescription = newWeatherSystem.noEffectDescription;
                location.currentWeatherPartialEffectDescription = newWeatherSystem.partialEffectDescription;
                location.currentWeatherFullEffectDescription = newWeatherSystem.fullEffectDescription;

                // find every children locations and reroll their weather
                if (cascade) {
                    for (const potentialChildLocation of this.deObject.world.locations) {
                        if (potentialChildLocation.parentConnection === location.id) {
                            this.rerollLocationWeather(potentialChildLocation, location, true);
                        }
                    }
                }
            }
        }
    }
    
    rerollWorldWeather() {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }

        // find every top level location and reroll their weather
        for (const location of this.deObject.world.locations) {
            if (!location.parentConnection) {
                this.rerollLocationWeather(location, null, true);
            }
        }
    }

    /**
     * @param {DELocationDefinition} location 
     */
    addLocation(location) {
        if (!this.deObject) {
            throw new Error("DEngine not initialized");
        }

        const parentConnection = location.parentConnection;
        /**
         * @type {DEStatefulLocationDefinition | null}
         */
        let parentLocation = null;
        if (parentConnection) {
            parentLocation = this.deObject.world.locations.find(loc => loc.id === parentConnection) || null;
            if (!parentLocation) {
                throw new Error(`Parent location with id ${parentConnection} not found.`);
            }
        }
        /**
         * @type {DEStatefulLocationDefinition}
         */
        const statefulLocation = {
            ...location,

            // @ts-ignore
            currentWeather: null,
            // @ts-ignore
            currentWeatherFullEffectDescription: null,
            // @ts-ignore
            currentWeatherHasBeenOngoingFor: {
                inMinutes: 0,
                inHours: 0,
                inDays: 0,
            },
            // @ts-ignore
            currentWeatherNoEffectDescription: null,
            // @ts-ignore
            currentWeatherPartialEffectDescription: null,
        };
        this.deObject.world.locations.push(statefulLocation);
        this.rerollLocationWeather(statefulLocation, parentLocation);
    }
}