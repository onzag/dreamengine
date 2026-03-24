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
                return DE.world.locations[name];
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
        return DE.world.locations[name];
    },
    newConnection(DE, connectionDef) {
        const id = connectionDef.from + " to " + connectionDef.to;
        const existingConnection = DE.world.connections[id];
        DE.world.connections[id] = connectionDef;
        if (existingConnection.properties) {
            DE.world.connections[id].properties = existingConnection.properties;
        }
        return DE.world.connections[id];
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
        if (DE.internal["CHARACTER_OVERRIDES_" + characterDef.name]) {
            Object.assign(DE.characters[characterDef.name], DE.internal["CHARACTER_OVERRIDES_" + characterDef.name]);
        }
        return DE.characters[characterDef.name];
    },
    createStateInAllCharacters(DE, stateName, stateDefinition) {
        Object.values(DE.characters).forEach((character) => {
            createStateInCharacter(DE, character, stateName, stateDefinition);
        });
        return stateDefinition;
    },
    createStateInCharacter(DE, character, stateName, stateDefinition) {
        const characterRef = typeof character === "string" ? DE.characters[character] : character;
        if (!characterRef) {
            if (typeof character === "string") {
                console.warn(`Character with name ${character} not found`);
            } else {
                console.warn(`Received null as character reference when trying to create state ${stateName}`);
            }
            return null;
        }
        return createStateInCharacter(DE, characterRef, stateName, stateDefinition);
    },
    newBond(DE, char1, towards, bondDefinition) {
        const char1Ref = typeof char1 === "string" ? DE.characters[char1] : char1;
        const towardsRef = typeof towards === "string" ? DE.characters[towards] : towards;

        if (!char1Ref) {
            if (typeof char1 === "string") {
                console.warn(`Character with name ${char1} not found when trying to create bond towards ${towards}`);
            } else {
                console.warn(`Received null as char1 reference when trying to create bond towards ${towards}`);
            }

            return null;
        }

        if (!towardsRef) {
            if (typeof towards === "string") {
                console.warn(`Character with name ${towards} not found when trying to create bond from ${char1}`);
            } else {
                console.warn(`Received null as towards reference when trying to create bond from ${char1}`);
            }
            return null;
        }

        const existingBond = DE.social.bonds[char1Ref.name].active.find(b => b.towards === towardsRef.name);
        if (existingBond) {
            return existingBond;
        }
        const newBond = {
            towards: towardsRef.name,
            ...bondDefinition,
        };
        DE.social.bonds[char1Ref.name].active.push(newBond);
        return newBond;
    },
    newMutualBond(DE, char1, char2, bondDefinition) {
        const bond1 = deEngineUtils.newBond(DE, char1, char2, bondDefinition);
        const bond2 = deEngineUtils.newBond(DE, char2, char1, bondDefinition);
        return [bond1, bond2];
    },
    newFamilyRelation(DE, char1, towards, relation) {
        const character1 = typeof char1 === "string" ? DE.characters[char1] : char1;
        const towardsRef = typeof towards === "string" ? DE.characters[towards] : towards;

        /**
         * @type {DEFamilyTie | null}
         */
        let familyTie1 = null;
        if (!character1) {
            console.warn(`Character with name ${char1} not found when trying to create family relation towards ${towards}`);
        } else {
            if (typeof towards === "string") {
                character1.socialSimulation.familyTies[towards] = { relation };
                familyTie1 = character1.socialSimulation.familyTies[towards];
            } else if (towardsRef) {
                character1.socialSimulation.familyTies[towardsRef.name] = { relation };
                familyTie1 = character1.socialSimulation.familyTies[towardsRef.name];
            } else {
                console.warn(`Received null as towards reference when trying to create family relation from ${char1}`);
            }
        }

        /**
         * @type {DEFamilyTie | null}
         */
        let familyTie2 = null;
        if (!towardsRef) {
            console.warn(`Character with name ${towards} not found when trying to create family relation from ${char1}`);
        } else if (character1) {
            /**
             * @type {DEFamilyRelation}
             */
            let inverseRelation;
            switch (relation) {
                case "parent":
                    inverseRelation = "child";
                    break;
                case "child":
                    inverseRelation = "parent";
                    break;
                case "sibling":
                    inverseRelation = "sibling";
                    break;
                case "spouse":
                    inverseRelation = "spouse";
                    break;
                case "cousin":
                    inverseRelation = "cousin";
                    break;
                case "uncle":
                case "aunt":
                    inverseRelation = character1.gender === "male" || character1.gender === "ambiguous" ? "nephew" : "niece";
                    break;
                case "grandparent":
                    inverseRelation = "grandchild";
                    break;
                case "grandchild":
                    inverseRelation = "grandparent";
                    break;
                case "niece":
                case "nephew":
                    inverseRelation = character1.gender === "male" || character1.gender === "ambiguous" ? "uncle" : "aunt";
                    break;
                default:
                    inverseRelation = "other";
            }

            towardsRef.socialSimulation.familyTies[character1.name] = { relation: inverseRelation };
            familyTie2 = towardsRef.socialSimulation.familyTies[character1.name];
        } else {
            console.warn(`Received null as character reference when trying to create family relation towards ${towards}`);
        }

        return [familyTie1, familyTie2];
    },
};

/**
 * 
 * @param {DEObject} DE 
 * @param {DECompleteCharacterReference} character 
 * @param {string} stateName 
 * @param {DECharacterStateDefinition} stateDefinition
 * @return {DECharacterStateDefinition}
 */
function createStateInCharacter(DE, character, stateName, stateDefinition) {
    if (character.states[stateName]) {
        console.warn(`Character ${character.name} already has a state named ${stateName}`);
    }
    character.states[stateName] = stateDefinition;
    return character.states[stateName];
}