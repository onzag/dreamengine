import Handlebars from "handlebars";

/**
 * @type {DEUtils}
 */
export const deEngineUtils = {
    newHandlebarsTemplate(DE, source) {
        const compiled = Handlebars.compile(source);
        return (DE, info) => {
            const obj = {
                user: DE.user.name,
                char: info.char?.name || "",
                other: info.other?.name || "",
                other_family_relation: info.otherFamilyRelation || "unknown",
                chars: info.chars?.map(c => c.name) || [],
                causants: info.causants?.map(c => c.name) || [],
                potential_causant: info.potentialCausant || "",
                potential_causants: info.potentialCausants?.map(c => c.name) || [],
            };
            Object.keys(DE.functions).forEach((key) => {
                // @ts-ignore
                if (!obj[key]) {
                    // @ts-ignore
                    obj[key] = (...args) => {
                        // @ts-ignore
                        return DE.functions[key](DE, info.char, ...args);
                    };
                }
            });
            return compiled(obj);
        }
    },
    newLocation(DE, name, locationDef) {
        /**
         * @type {DEStatefulLocationDefinition}
         */
        const statefulLocation = {
            ...locationDef,

            // @ts-ignore
            currentWeather: null,
            // @ts-ignore
            currentWeatherFullEffectDescription: null,
            // @ts-ignore
            currentWeatherHasBeenOngoingFor: null,
            // @ts-ignore
            currentWeatherNoEffectDescription: null,
            // @ts-ignore
            currentWeatherPartialEffectDescription: null,
        };

        const alreadyExistingLocation = DE.world.locations[name];
        if (alreadyExistingLocation) {
            statefulLocation.currentWeather = alreadyExistingLocation.currentWeather;
            statefulLocation.currentWeatherFullEffectDescription = alreadyExistingLocation.currentWeatherFullEffectDescription;
            statefulLocation.currentWeatherHasBeenOngoingFor = alreadyExistingLocation.currentWeatherHasBeenOngoingFor;
            statefulLocation.currentWeatherNoEffectDescription = alreadyExistingLocation.currentWeatherNoEffectDescription;
            statefulLocation.currentWeatherPartialEffectDescription = alreadyExistingLocation.currentWeatherPartialEffectDescription;
            statefulLocation.properties = alreadyExistingLocation.properties;

            for (const slot in alreadyExistingLocation.slots) {
                if (!statefulLocation.slots[slot]) {
                    statefulLocation.slots[slot] = alreadyExistingLocation.slots[slot];
                } else {
                    statefulLocation.slots[slot].items = alreadyExistingLocation.slots[slot].items;
                    statefulLocation.slots[slot].properties = alreadyExistingLocation.slots[slot].properties;
                }
            }
        }

        if (locationDef.parent) {
            const parentLocation = DE.world.locations[locationDef.parent];
            if (!parentLocation) {
                console.warn(`Parent location ${locationDef.parent} not found for location ${name}`);
                DE.world.locations[name] = statefulLocation;
                return;
            }

            // copy weather from parent
            if (!locationDef.ownWeatherSystem) {
                statefulLocation.currentWeather = parentLocation.currentWeather;
                statefulLocation.currentWeatherFullEffectDescription = parentLocation.currentWeatherFullEffectDescription;
                statefulLocation.currentWeatherHasBeenOngoingFor = parentLocation.currentWeatherHasBeenOngoingFor;
                statefulLocation.currentWeatherNoEffectDescription = parentLocation.currentWeatherNoEffectDescription;
                statefulLocation.currentWeatherPartialEffectDescription = parentLocation.currentWeatherPartialEffectDescription;
            }
        }

        DE.world.locations[name] = statefulLocation;
    },
    newConnection(DE, connectionDef) {
        const id = connectionDef.from + " to " + connectionDef.to;
        const existingConnection = DE.world.connections[id];
        DE.world.connections[id] = connectionDef;
        if (existingConnection.properties) {
            DE.world.connections[id].properties = existingConnection.properties;
        }
    },
    newCharacter(DE, characterDef) {
        const currentCharacter = DE.characters[characterDef.name];
        if (!currentCharacter) {
            return characterDef;
        }
        DE.characters[characterDef.name] = {
            ...characterDef,
            properties: currentCharacter.properties,
        }
    },
    createStateInAllCharacters(DE, stateName, stateDefinition) {
        Object.values(DE.characters).forEach((character) => {
            createStateInCharacter(DE, character, stateName, stateDefinition);
        });
    },
    createStateInCharacter(DE, characterName, stateName, stateDefinition) {
        const character = DE.characters[characterName];
        if (!character) {
            console.warn(`Character with name ${characterName} not found`);
            return;
        }
        createStateInCharacter(DE, character, stateName, stateDefinition);
    },
};

/**
 * 
 * @param {DEObject} DE 
 * @param {DECompleteCharacterReference} character 
 * @param {string} stateName 
 * @param {DECharacterStateDefinition} stateDefinition 
 */
function createStateInCharacter(DE, character, stateName, stateDefinition) {
    if (character.states[stateName]) {
        console.warn(`Character ${character.name} already has a state named ${stateName}`);
    }
    character.states[stateName] = stateDefinition;
}