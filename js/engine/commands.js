import { DEngine } from "./index.js";
import { getCharacterCanSee, getExternalDescriptionOfCharacter, getSurroundingCharacters, getSysPromptForCharacter, isCharacterShelteredFromWeather, whatIsWeatherLikeForCharacter } from "./util/character-info.js";
import { makeTimestamp } from "./util/messages.js";

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
            return `Current world time is: ${makeTimestamp(engine, time, false)}`;
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
            const isSheltered = await isCharacterShelteredFromWeather(engine, engine.userCharacter.name, currentWeather, engine.deObject.world.currentLocation, engine.deObject.world.currentLocationSlot);
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
            const isSheltered = await isCharacterShelteredFromWeather(engine, characterName, weatherThere, locationId, locationSlotId);
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
            const info = await getCharacterCanSee(engine, engine.userCharacter.name);
            return info.everything;
        },
        help: "Lists the objects you can see in your current location.",
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
                    answer += `- ${participantName}: ${await getExternalDescriptionOfCharacter(engine, participantName, true)}\n`;
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
            const characterName = args.join(" ");
            
            return (await getSysPromptForCharacter(engine, characterName)).sysprompt;
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