import { DEngine } from "./index.js";
import { getSurroundingCharacters } from "./util/character-info.js";

/**
 * 
 * @param {DEngine} engine 
 * @param {string} characterName 
 * @returns 
 */
async function whatIsWeatherLikeForCharacter(engine, characterName) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    if (!engine.deObject.stateFor[characterName]) {
        throw new Error(`No state found for character "${characterName}".`);
    }
    const character = engine.deObject.characters[characterName];
    const characterState = engine.deObject.stateFor[characterName];
    const characterLocation = characterState.location;
    const characterLocationSlot = characterState.locationSlot;
    const location = engine.deObject.world.locations[characterLocation];
    const weatherThere = location.currentWeather;
    const isSheltered = await engine.isCharacterShelteredFromWeather(characterName, weatherThere, characterLocation, characterLocationSlot);
    if (isSheltered.fullySheltered) {
        // @ts-ignore
        const noEffectDescription = await location.currentWeatherNoEffectDescription.execute(engine.deObject, character);
        return `The current weather where "${characterName}" is (${characterLocation}, ${characterLocationSlot}) is "${weatherThere}". However, "${characterName}" is fully sheltered from its effects. ${isSheltered.reason || ""}, therefore ${noEffectDescription || "no weather effects apply to them."}`;
    } else if (isSheltered.partiallySheltered) {
        // @ts-ignore
        const partialEffectDescription = await location.currentWeatherPartialEffectDescription.execute(engine.deObject, character);
        return `The current weather where "${characterName}" is (${characterLocation}, ${characterLocationSlot}) is "${weatherThere}". "${characterName}" is partially sheltered from its effects. ${isSheltered.reason || ""}, therefore ${partialEffectDescription || "some weather effects may apply to them."}`;
    } else if (isSheltered.negativelyExposed) {
        // @ts-ignore
        const negativeEffectsDescription = await location.currentWeatherNegativelyExposedDescription.execute(engine.deObject, character);
        return `The current weather where "${characterName}" is (${characterLocation}, ${characterLocationSlot}) is "${weatherThere}". "${characterName}" is negatively exposed to its effects. ${isSheltered.reason || ""}, therefore ${negativeEffectsDescription || "strongly negative weather effects apply to them."}`;
    } else {
        // @ts-ignore
        const effectDescription = await location.currentWeatherFullEffectDescription.execute(engine.deObject, character);
        return `The current weather where "${characterName}" is (${characterLocation}, ${characterLocationSlot}) is "${weatherThere}". ${isSheltered.reason || ""}, therefore ${effectDescription || "all weather effects apply to them."}`;
    }
}

/**
 * @type {Object.<string, {run: (engine: DEngine, args: string[]) => Promise<string>, help: string, cheat?: boolean, args: string[]}>}
 */
export const commands = {
    "whereami": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }

            return `You are at: ${engine.deObject.world.currentLocation}, at the slot: ${engine.deObject.world.currentLocationSlot}\n\n` +
                // @ts-ignore
                (await engine.deObject.world.locations[engine.deObject.world.currentLocation].description.execute(engine.deObject, engine.userCharacter, undefined, undefined, undefined, undefined) || "No location description available.") + "\n\n" +
                // @ts-ignore
                (await engine.deObject.world.locations[engine.deObject.world.currentLocation].slots[engine.deObject.world.currentLocationSlot].description.execute(engine.deObject, engine.userCharacter, undefined, undefined, undefined, undefined) || "No slot description available.");
        },
        help: "Displays your current location in the world.",
        cheat: false,
        args: [],
    },
    "whatisthetime": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            const time = engine.deObject.currentTime;
            return `Current world time is: ${engine.makeTimestamp(time, false)}`;
        },
        help: "Displays the current world time.",
        cheat: false,
        args: [],
    },
    "whatistheweatherlike": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (!engine.userCharacter) {
                throw new Error("DEngine has no user character defined");
            }
            const currentLocation = engine.deObject.world.locations[engine.deObject.world.currentLocation];
            const currentWeather = currentLocation.currentWeather;
            const isSheltered = await engine.isCharacterShelteredFromWeather(engine.userCharacter.name, currentWeather, engine.deObject.world.currentLocation, engine.deObject.world.currentLocationSlot);
            if (isSheltered.fullySheltered) {
                // @ts-ignore
                const noEffectDescription = await currentLocation.currentWeatherNoEffectDescription.execute(engine.deObject, engine.userCharacter);
                return `The current weather in your location is "${currentWeather}". However, you are fully sheltered from its effects. ${isSheltered.reason || ""}, therefore ${noEffectDescription || "no weather effects apply to you."}`;
            } else if (isSheltered.partiallySheltered) {
                // @ts-ignore
                const partialEffectDescription = await currentLocation.currentWeatherPartialEffectDescription.execute(engine.deObject, engine.userCharacter);
                return `The current weather in your location is "${currentWeather}". You are partially sheltered from its effects. ${isSheltered.reason || ""}, therefore ${partialEffectDescription || "some weather effects may apply to you."}`;
            } else if (isSheltered.negativelyExposed) {
                // @ts-ignore
                const negativeEffectsDescription = await currentLocation.currentWeatherNegativelyExposedDescription.execute(engine.deObject, engine.userCharacter);
                return `The current weather in your location is "${currentWeather}". You are negatively exposed to its effects. ${isSheltered.reason || ""}, therefore ${negativeEffectsDescription || "strongly negative weather effects apply to you."}`;
            } else {
                // @ts-ignore
                const effectDescription = await currentLocation.currentWeatherFullEffectDescription.execute(engine.deObject, engine.userCharacter);
                return `The current weather in your location is "${currentWeather}". ${isSheltered.reason || ""}, therefore ${effectDescription || "all weather effects apply to you."}`;
            }
        },
        help: "Displays the current weather in your location and its effects and whether you are sheltered from it or not.",
        cheat: false,
        args: [],
    },
    "whatistheweatherlikefor": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (args.length === 0) {
                return "Usage: whatistheweatherlikefor <character name>";
            }
            const characterName = args.join(" ");
            const character = engine.deObject.characters[characterName];
            if (!character) {
                return `Character "${characterName}" not found.`;
            }
            const characterState = engine.deObject.stateFor[characterName];
            if (!characterState) {
                return `No state found for character "${characterName}".`;
            }
            return await whatIsWeatherLikeForCharacter(engine, characterName);
        },
        help: "Displays the current weather for a given character and its effects and whether they are sheltered from it or not.",
        cheat: true,
        args: ["<character name>"],
    },
    "whatwouldtheweatherbelikefor": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (args.length < 2) {
                return "Usage: whatwouldtheweatherbelikefor <character name> <location id> <location slot id>, options for location are: " + Object.keys(engine.deObject.world.locations).join(", ");
            }
            const characterName = args[0];
            const locationId = args[1];

            if (args.length < 3) {
                return `Usage: whatwouldtheweatherbelikefor <character name> <location id> <location slot id>, options for location slots in location "${locationId}" are: ` + Object.keys(engine.deObject.world.locations[locationId]?.slots || {}).join(", ");
            }

            const locationSlotId = args[2];

            const character = engine.deObject.characters[characterName];
            if (!character) {
                return `Character "${characterName}" not found.`;
            }
            const location = engine.deObject.world.locations[locationId];
            if (!location) {
                return `Location "${locationId}" not found in the world, options are: ${Object.keys(engine.deObject.world.locations).join(", ")}`;
            }
            const slot = location.slots[locationSlotId];
            if (!slot) {
                return `Location slot "${locationSlotId}" not found in location "${locationId}", options are: ${Object.keys(location.slots).join(", ")}`;
            }
            const weatherThere = location.currentWeather;
            const isSheltered = await engine.isCharacterShelteredFromWeather(characterName, weatherThere, locationId, locationSlotId);
            if (isSheltered.fullySheltered) {
                // @ts-ignore
                const noEffectDescription = await location.currentWeatherNoEffectDescription.execute(engine.deObject, character);
                return `Hypothetical - The current weather at (${locationId}, ${locationSlotId}) is "${weatherThere}". However, "${characterName}" would be fully sheltered from its effects. ${isSheltered.reason || ""}, therefore ${noEffectDescription || "no weather effects would apply to them."}`;
            } else if (isSheltered.partiallySheltered) {
                // @ts-ignore
                const partialEffectDescription = await location.currentWeatherPartialEffectDescription.execute(engine.deObject, character);
                return `Hypothetical - The current weather at (${locationId}, ${locationSlotId}) is "${weatherThere}". "${characterName}" would be partially sheltered from its effects. ${isSheltered.reason || ""}, therefore ${partialEffectDescription || "some weather effects might apply to them."}`;
            } else if (isSheltered.negativelyExposed) {
                // @ts-ignore
                const negativeEffectsDescription = await location.currentWeatherNegativelyExposedDescription.execute(engine.deObject, character);
                return `Hypothetical - The current weather at (${locationId}, ${locationSlotId}) is "${weatherThere}". "${characterName}" would be negatively exposed to its effects. ${isSheltered.reason || ""}, therefore ${negativeEffectsDescription || "strongly negative weather effects would apply to them."}`;
            } else {
                // @ts-ignore
                const effectDescription = await location.currentWeatherFullEffectDescription.execute(engine.deObject, character);
                return `Hypothetical - The current weather at (${locationId}, ${locationSlotId}) is "${weatherThere}". ${isSheltered.reason || ""}, therefore ${effectDescription || "all weather effects would apply to them."}`;
            }
        },
        cheat: true,
        help: "Displays what the weather would be like for a given character if they were in a specified location and slot.",
        args: ["<character name>", "<location id>", "<location slot id>"],
    },
    "whereis": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (args.length === 0) {
                return "Usage: whereis <character name>";
            }
            const characterName = args.join(" ");
            const character = engine.deObject.characters[characterName];
            if (!character) {
                return `Character "${characterName}" not found.`;
            }
            const stateOfCharacter = engine.deObject.stateFor[characterName];
            if (!stateOfCharacter) {
                return `No state found for character "${characterName}".`;
            }
            return `"${characterName}" is currently at: ${stateOfCharacter.location}, at the slot: ${stateOfCharacter.locationSlot}.`;
        },
        help: "Displays the current location of a character in the world.",
        cheat: true,
        args: ["<character name>"],
    },
    "whatcanisee": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (!engine.userCharacter) {
                throw new Error("DEngine has no user character defined");
            }
            const info = engine.describeItemsAvailableToCharacterForInference(engine.userCharacter.name);
            return info.complete;
        },
        help: "Lists the objects you can see in your current location.",
        cheat: false,
        args: [],
    },
    "whatcanticarry": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (!engine.userCharacter) {
                throw new Error("DEngine has no user character defined");
            }
            const info = engine.getItemsCharacterMayCarryWithReasons("cannot", engine.userCharacter.name, engine.deObject.world.currentLocation, false, false);
            return info.join("\n") || "You can carry all items in this location.";
        },
        help: "Lists the objects you cannot carry in your current location, along with reasons.",
        cheat: false,
        args: [],
    },
    "whatcanicarry": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (!engine.userCharacter) {
                throw new Error("DEngine has no user character defined");
            }
            const info = engine.getItemsCharacterMayCarryWithReasons("can", engine.userCharacter.name, engine.deObject.world.currentLocation, false, false);
            return info.join("\n") || "You cannot carry any items in this location.";
        },
        help: "Lists the objects you can carry in your current location, along with reasons.",
        cheat: false,
        args: [],
    },
    "whatcaniwear": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (!engine.userCharacter) {
                throw new Error("DEngine has no user character defined");
            }
            const info = engine.getItemsCharacterMayWearWithReasons("can", engine.userCharacter.name, engine.deObject.world.currentLocation);
            return info.join("\n") || "You cannot wear anything in this location.";
        },
        help: "Lists the wearable items you can wear, along with reasons.",
        cheat: false,
        args: [],
    },
    "whatcantiwear": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (!engine.userCharacter) {
                throw new Error("DEngine has no user character defined");
            }
            const info = engine.getItemsCharacterMayWearWithReasons("cannot", engine.userCharacter.name, engine.deObject.world.currentLocation);
            return info.join("\n") || "You can wear all wearable items you have.";
        },
        help: "Lists the wearable items you cannot wear, along with reasons.",
        cheat: false,
        args: [],
    },
    "whocanticarry": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (!engine.userCharacter) {
                throw new Error("DEngine has no user character defined");
            }
            const info = engine.getItemsCharacterMayCarryWithReasons("cannot", engine.userCharacter.name, engine.deObject.world.currentLocation, true, true);
            return info.join("\n") || "You can carry everyone in this location.";
        },
        help: "Lists the characters that you cannot carry in your current location",
        cheat: false,
        args: [],
    },
    "whocanicarry": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (!engine.userCharacter) {
                throw new Error("DEngine has no user character defined");
            }
            const info = engine.getItemsCharacterMayCarryWithReasons("can", engine.userCharacter.name, engine.deObject.world.currentLocation, true, true);
            return info.join("\n") || "You cannot carry anyone in this location.";
        },
        help: "Lists the characters that you can carry in your current location",
        cheat: false,
        args: [],
    },
    "whocanisee": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (!engine.userCharacter) {
                throw new Error("DEngine has no user character defined");
            }
            const userState = engine.deObject.stateFor[engine.userCharacter.name];
            if (!userState) {
                throw new Error(`No state found for character "${engine.userCharacter.name}".`);
            }

            let answer = `You can see the following characters in your current location:\n\nPeople you know:\n`;
            const surroundingCharacters = getSurroundingCharacters(engine, engine.userCharacter.name);
            for (const characterName of surroundingCharacters.nonStrangers) {
                if (characterName === engine.userCharacter.name) {
                    continue;
                }
                const characterInfo = engine.deObject.characters[characterName];
                if (characterInfo) {
                    answer += `- ${characterName}: ${engine.getExternalDescriptionOfCharacter(characterName, true)}\n`;
                }
            }
            answer += `\nTotal Strangers:\n`;
            for (const characterName of surroundingCharacters.totalStrangers) {
                if (characterName === engine.userCharacter.name) {
                    continue;
                }
                const characterInfo = engine.deObject.characters[characterName];
                if (characterInfo) {
                    answer += `- ${characterName}: ${engine.getExternalDescriptionOfCharacter(characterName, true)}\n`;
                }
            }
            return answer;
        },
        help: "Lists the characters that you can see in your current location",
        cheat: false,
        args: [],
    },
    "whoiswithme": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (!engine.userCharacter) {
                throw new Error("DEngine has no user character defined");
            }

            const userState = engine.deObject.stateFor[engine.userCharacter.name];
            if (!userState) {
                throw new Error(`No state found for character "${engine.userCharacter.name}".`);
            }

            let answer = `The following characters are interacting with you in your current location:\n\n`;

            if (!userState.conversationId) {
                return answer + "No one is currently interacting with you.";
            }

            const conversationId = engine.deObject.conversations[userState.conversationId];
            for (const participantName of conversationId.participants) {
                if (participantName === engine.userCharacter.name) {
                    continue;
                }
                const characterInfo = engine.deObject.characters[participantName];
                const characterState = engine.deObject.stateFor[participantName];
                if (characterInfo) {
                    answer += `- ${participantName}: ${engine.getExternalDescriptionOfCharacter(participantName, true)}\n`;
                }
            }
            return answer;
        },
        help: "Lists the characters that are interacting with you (locally or remotely) in your current location",
        cheat: false,
        args: [],
    },
    "wherecanigo": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (!engine.userCharacter) {
                throw new Error("DEngine has no user character defined");
            }
            return "TODO"
        },
        help: "Lists the locations you can go to from your current location",
        cheat: false,
        args: [],
    },
    "innerstate": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (!engine.userCharacter) {
                throw new Error("DEngine has no user character defined");
            }
            const characterName = args.length > 0 ? args.join(" ") : engine.userCharacter.name;
            const character = engine.deObject.characters[characterName];
            if (!character) {
                return `Character "${characterName}" not found.`;
            }
            const characterState = engine.deObject.stateFor[characterName];
            if (!characterState) {
                return `No state found for character "${characterName}".`;
            }

            let reasoningInstructions = "Character special reasoning criteria:";
            let actionAnalysis = "Character forced action:";

            // @ts-ignore
            let currentSystemInstructions = await character.general.execute(engine.deObject, character);

            currentSystemInstructions = currentSystemInstructions.trim();

            /**
             * @type {Array<{action: string, dominance: number, forceDominant: boolean, deadEnd: boolean, deadEndIsDeath?: boolean, affectsState: string | null, affectsStateIntensity: number | null}>}
             */
            const allActionsProvidedByForce = [];

            for (const injectable of Object.values(character.generalCharacterDescriptionInjection)) {
                // @ts-ignore
                currentSystemInstructions += "\n\n" + (await injectable.execute(engine.deObject, character, undefined, undefined, undefined, undefined)).trim();
            }

            const characterBonds = engine.deObject.social.bonds[characterName];
            if (characterBonds) {
                // sort by bond strength highest absolute value go last
                const sortedActive = characterBonds.active.slice().sort((a, b) => {
                    return Math.abs(a.bond) - Math.abs(b.bond);
                });
                const sortedEx = characterBonds.ex.slice().sort((a, b) => {
                    return Math.abs(a.bond) - Math.abs(b.bond);
                });
                for (const activeBond of sortedActive) {
                    const bondDeclaration = character.bonds.declarations.find(bondDecl => bondDecl.strangerBond === activeBond.stranger && bondDecl.minBondLevel <= activeBond.bond && activeBond.bond < (bondDecl.maxBondLevel === 100 ? 200 : bondDecl.maxBondLevel) && bondDecl.min2BondLevel <= activeBond.bond2 && activeBond.bond2 < (bondDecl.max2BondLevel === 100 ? 200 : bondDecl.max2BondLevel));
                    if (bondDeclaration && bondDeclaration.generalCharacterDescriptionInjection) {
                        // @ts-ignore
                        const injectedValue = (await bondDeclaration.generalCharacterDescriptionInjection.execute(engine.deObject, character, engine.deObject.characters[activeBond.towards], undefined, undefined, undefined)).trim();
                        if (injectedValue) {
                            currentSystemInstructions += `\n\n${injectedValue}`;
                        }
                    }
                }
                for (const exBond of sortedEx) {
                    const bondDeclaration = character.bonds.declarations.find(bondDecl => bondDecl.strangerBond === exBond.stranger && bondDecl.minBondLevel <= exBond.bond && exBond.bond < (bondDecl.maxBondLevel === 100 ? 200 : bondDecl.maxBondLevel) && bondDecl.min2BondLevel <= exBond.bond2 && exBond.bond2 < (bondDecl.max2BondLevel === 100 ? 200 : bondDecl.max2BondLevel));
                    if (bondDeclaration && bondDeclaration.generalCharacterDescriptionInjection) {
                        // @ts-ignore
                        const injectedValue = (await bondDeclaration.generalCharacterDescriptionInjection.execute(engine.deObject, character, engine.deObject.characters[exBond.towards], undefined, undefined, undefined)).trim();
                        if (injectedValue) {
                            currentSystemInstructions += `\n\n${injectedValue}`;
                        }
                    }
                }
            }

            for (const action of Object.values(character.actionPromptInjection)) {
                // @ts-ignore
                const actionValue = (await action.execute(engine.deObject, character, undefined, undefined, undefined, undefined)).trim();
                if (actionValue) {
                    allActionsProvidedByForce.push({
                        action: actionValue,
                        dominance: 0,
                        forceDominant: action.forceDominant || false,
                        deadEnd: action.isDeadEndScenario || false,
                        deadEndIsDeath: action.deadEndIsDeath || false,
                        affectsState: null,
                        affectsStateIntensity: null,
                    });
                }
            }

            let currentMaxDominace = -1;
            let infoAllStates = (await Promise.all(characterState.states.map(async (state) => {
                const stateInfo = character.states[state.state];

                const dominance = state.relieving ? (stateInfo.dominanceAfterRelief || 0) : (stateInfo.dominance || 0);

                if (stateInfo.actionPromptInjection) {
                    for (const action of Object.values(stateInfo.actionPromptInjection)) {
                        // @ts-ignore
                        const actionValue = (await action.template.execute(engine.deObject, character, undefined, undefined, undefined, undefined)).trim();
                        if (actionValue) {
                            allActionsProvidedByForce.push({
                                action: actionValue,
                                dominance,
                                forceDominant: action.forceDominant || false,
                                deadEnd: action.isDeadEndScenario || false,
                                deadEndIsDeath: action.deadEndIsDeath || false,
                                affectsState: state.state,
                                affectsStateIntensity: action.intensityModification,
                            });
                        }
                    }
                }

                if (dominance > currentMaxDominace) {
                    currentMaxDominace = dominance;
                }

                return {
                    name: state.state,
                    intensity: state.intensity,
                    dominance,
                    description: async () => state.relieving ? (
                        // @ts-ignore
                        stateInfo.generalAfterRelief ?
                            // @ts-ignore
                            await stateInfo.generalAfterRelief.execute(engine.deObject, character, undefined, undefined, undefined, undefined) :
                            // @ts-ignore
                            await stateInfo.general.execute(engine.deObject, character, undefined, undefined, undefined, undefined)
                    ) : (
                        // @ts-ignore
                        await stateInfo.general.execute(engine.deObject, character, undefined, undefined, undefined, undefined)
                    ),
                    systemInstructions: async () => (state.relieving ? (
                        // @ts-ignore
                        stateInfo.relievingGeneralCharacterDescriptionInjection ?
                            // @ts-ignore
                            await stateInfo.relievingGeneralCharacterDescriptionInjection.execute(engine.deObject, character, undefined, undefined, undefined, undefined) :
                            // @ts-ignore
                            await stateInfo.generalCharacterDescriptionInjection?.execute(engine.deObject, character, undefined, undefined, undefined, undefined)
                    ) : (
                        // @ts-ignore
                        await stateInfo.generalCharacterDescriptionInjection?.execute(engine.deObject, character, undefined, undefined, undefined, undefined)
                    )) || "",
                }
            })));

            // filter only actions that are of the highest dominance or forced dominant
            let filteredActions;
            const isThereAForcedDominantAction = allActionsProvidedByForce.find(action => action.forceDominant);
            if (isThereAForcedDominantAction) {
                // filter only forced dominant actions
                filteredActions = allActionsProvidedByForce.filter(action => action.forceDominant);
            } else {
                // filter only actions that are of the highest dominance or forced dominant
                filteredActions = allActionsProvidedByForce.filter(action => action.dominance === currentMaxDominace);
            }

            // check if any of these filtered actions has a dead end
            const deadEndAction = filteredActions.find(action => action.deadEnd);
            if (deadEndAction) {
                // filter by only dead end actions
                filteredActions = filteredActions.filter(action => action.deadEnd);
            }

            // now inform the action analysis
            let addedNothing = true;
            for (const action of filteredActions) {
                addedNothing = false;
                actionAnalysis += `\n\nThe character will perform next: ${action.action}\n` +
                    `- Dominance: ${action.dominance}\n` +
                    `- Forced Dominant: ${action.forceDominant}\n` +
                    `- Dead End Scenario: ${action.deadEnd} ${action.deadEndIsDeath ? "(This dead end is death)" : ""}\n` +
                    (action.affectsState ? `- Affects State: ${action.affectsState} (Intensity Modification: ${action.affectsStateIntensity})\n` : "");
            }

            if (addedNothing) {
                actionAnalysis += "\n\nNo forced actions detected.";
            }

            // now filter infoAllStates by max dominance
            infoAllStates = infoAllStates.filter(stateInfo => stateInfo.dominance === currentMaxDominace);

            let addedNothingToStates = true;
            for (const stateInfo of infoAllStates) {
                addedNothingToStates = false;
                const descriptionText = await stateInfo.description();
                reasoningInstructions += `\n\nState ${stateInfo.name} (Dominance: ${stateInfo.dominance}, Intensity: ${stateInfo.intensity}): ${descriptionText}`;
            }

            if (addedNothingToStates) {
                reasoningInstructions += "\n\nNo applicable states detected.";
            }

            return currentSystemInstructions + "\n\n" + reasoningInstructions + "\n\n" + actionAnalysis;
        },
        help: "Displays the inner state of any character, their inner identity, and how they feel and reason at this moment",
        cheat: true,
        args: ["<character name>"],
    },
    "howismyrelationshipwith": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (!engine.userCharacter) {
                throw new Error("DEngine has no user character defined");
            }
            if (args.length === 0) {
                return "Usage: howismyrelationshipwith <character name>";
            }
            const characterName = args.join(" ");
            const character = engine.deObject.characters[characterName];
            if (!character) {
                return `Character "${characterName}" not found`;
            }
            
            let [_, bond, bondDecl, bondInfo] = await engine.getRelationshipBetweenCharacters(engine.userCharacter.name, characterName);

            bondInfo += `\n\nBond Level: ${bond.bond} (${bondDecl.name})\nSecondary Bond Level: ${bond.bond2}\nStranger Bond: ${bond.stranger ? "Yes" : "No"}\n\nBond Conditions:\n`;

            for (const condition of bondDecl.bondConditions) {
                // @ts-ignore
                const question = await condition.template.execute(engine.deObject, character, engine.userCharacter)
                bondInfo += `- ${question}\nAffects ${condition.affectsBonds} bond by ${condition.weight}\n`;
            }

            return bondInfo;
        },
        help: "Displays the nature of your relationship with a specified character",
        cheat: true,
        args: ["<character name>"],
    },
    "syspromptfor": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (args.length === 0) {
                return "Usage: syspromptfor <character name>";
            }
            if (!engine.inferenceAdapter) {
                throw new Error("DEngine has no inference adapter defined");
            }
            const characterName = args.join(" ");
            const character = engine.deObject.characters[characterName];
            if (!character) {
                return `Character "${characterName}" not found.`;
            }

            const characterState = engine.deObject.stateFor[characterName];
            if (!characterState) {
                throw new Error(`No state found for character "${characterName}".`);
            }

            const shortDescription = engine.getExternalDescriptionOfCharacter(characterName, true);

            // @ts-ignore
            const [general, statesDescriptions, relationships] = await engine.getInternalDescriptionOfCharacter(characterName);

            /**
             * @type {string|null}
             */
            let lore = null;

            if (engine.deObject.world.lore) {
                // @ts-ignore
                lore = await engine.deObject.world.lore?.execute(engine.deObject, character);
                if (lore.trim().length === 0) {
                    lore = null;
                }
            }

            /**
             * @type {Array<string>}
             */
            const interactingCharacters = [];
            const potentialConversationId = engine.deObject.stateFor[characterName].conversationId;
            if (potentialConversationId) {
                const conversation = engine.deObject.conversations[potentialConversationId];
                interactingCharacters.push(...conversation.participants.filter(name => name !== characterName));
            }

            /**
             * @type {Array<string>}
             */
            const worldRules = [];
            if (engine.deObject.worldRules) {
                for (const rule of Object.values(engine.deObject.worldRules)) {
                    // @ts-ignore
                    const ruleText = (await rule.rule.execute(engine.deObject, character, undefined, undefined, undefined, undefined)).trim();
                    if (ruleText.length > 0) {
                        worldRules.push(ruleText);
                    }
                }
            }

            /**
             * @type {Array<string>}
             */
            const characterRules = [];
            if (character.characterRules) {
                for (const rule of Object.values(character.characterRules)) {
                    // @ts-ignore
                    const ruleText = (await rule.rule.execute(engine.deObject, character, undefined, undefined, undefined, undefined)).trim();
                    if (ruleText.length > 0) {
                        characterRules.push(ruleText);
                    }
                }
            }

            let scenario = "";
            const currentLocation = engine.deObject.world.locations[engine.deObject.stateFor[characterName].location];
            if (currentLocation && currentLocation.description) {
                // @ts-ignore
                scenario = `Location: ${engine.deObject.stateFor[characterName].location}, ` + await currentLocation.description.execute(engine.deObject, character);
            }
            const currentLocationSlot = currentLocation.slots[engine.deObject.stateFor[characterName].locationSlot];
            if (currentLocationSlot && currentLocationSlot.description) {
                // @ts-ignore
                scenario += `\n\nSpecifically at: ${engine.deObject.stateFor[characterName].locationSlot}, ` + await currentLocationSlot.description.execute(engine.deObject, character);
            }

            scenario += `\n\n${await whatIsWeatherLikeForCharacter(engine, characterName)}`;

            scenario += `\n\nCurrent time and date in the world: ${engine.makeTimestamp(engine.deObject.currentTime, false)}`;

            const sysprompt = engine.inferenceAdapter.buildSystemPromptForCharacter(
                character,
                general,
                shortDescription,
                relationships,
                statesDescriptions,
                scenario,
                lore,
                interactingCharacters,
                characterRules,
                worldRules,
            );

            return sysprompt;
        },
        help: "Displays the current system prompt for a given character, for general inference purposes.",
        cheat: true,
        args: ["<character name>"],
    },
    "rawstatefor":{
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (args.length === 0) {
                return "Usage: /rawstatefor <character name>";
            }
            const characterName = args.join(" ");
            const character = engine.deObject.characters[characterName];
            if (!character) {
                return `Character "${characterName}" not found.`;
            }
            const characterState = engine.deObject.stateFor[characterName];
            if (!characterState) {
                return `No state found for character "${characterName}".`;
            }
            const charStateShallowCopy = {...characterState};
            // @ts-ignore
            delete charStateShallowCopy.history;
            return JSON.stringify(charStateShallowCopy, null, 2);
        },
        help: "Displays the raw JSON state for a given character.",
        cheat: true,
        args: ["<character name>"],
    },
}