import { DEngine } from "./index.js";
import { getCharacterCanSee, getExternalDescriptionOfCharacter, getFamilyBondRelation, getInternalDescriptionOfCharacter, getSysPromptForCharacter, isCharacterShelteredFromWeather, whatIsWeatherLikeForCharacter } from "./util/character-info.js";
import { makeTimestamp } from "./util/messages.js";
import { getWeatherSystemForLocationAndWeather } from "./util/world.js";

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
            return `Current world time is: ${makeTimestamp(engine.deObject, time, false)}`;
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
            if (!engine.deObject.user) {
                throw new Error("DEngine has no user character defined");
            }
            const currentLocation = engine.deObject.world.locations[engine.deObject.world.currentLocation];
            const currentWeather = currentLocation.internalState.currentWeather;
            const isSheltered = await isCharacterShelteredFromWeather(engine.deObject, engine.deObject.user, currentWeather, engine.deObject.world.currentLocation, engine.deObject.world.currentLocationSlot);
            const weatherSystem = getWeatherSystemForLocationAndWeather(engine.deObject, engine.deObject.world.currentLocation, currentWeather);
            if (isSheltered.fullySheltered) {
                const noEffectDescription = typeof weatherSystem.noEffectDescription === "string" ? weatherSystem.noEffectDescription : await weatherSystem.noEffectDescription({
                    char: engine.deObject.characters[engine.deObject.user],
                });
                return `The current weather in your location is "${currentWeather}". However, you are fully sheltered from its effects. ${isSheltered.reason || ""}, therefore ${noEffectDescription || "no weather effects apply to you."}`;
            } else if (isSheltered.partiallySheltered) {
                const partialEffectDescription = typeof weatherSystem.partialEffectDescription === "string" ? weatherSystem.partialEffectDescription : await weatherSystem.partialEffectDescription({
                    char: engine.deObject.characters[engine.deObject.user],
                });
                return `The current weather in your location is "${currentWeather}". You are partially sheltered from its effects. ${isSheltered.reason || ""}, therefore ${partialEffectDescription || "some weather effects may apply to you."}`;
            } else if (isSheltered.negativelyExposed) {
                const negativeEffectsDescription = typeof weatherSystem.negativelyExposedDescription === "string" ? weatherSystem.negativelyExposedDescription : await weatherSystem.negativelyExposedDescription({
                    char: engine.deObject.characters[engine.deObject.user],
                });
                return `The current weather in your location is "${currentWeather}". You are negatively exposed to its effects. ${isSheltered.reason || ""}, therefore ${negativeEffectsDescription || "strongly negative weather effects apply to you."}`;
            } else {
                const effectDescription = typeof weatherSystem.fullEffectDescription === "string" ? weatherSystem.fullEffectDescription : await weatherSystem.fullEffectDescription({
                    char: engine.deObject.characters[engine.deObject.user],
                });
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
                return "Usage: /whatistheweatherlikefor <character id>";
            }
            const characterId = args.join(" ");
            const character = engine.deObject.characters[characterId];
            if (!character) {
                return `Character "${characterId}" not found. Use /id <name> to look up a character's id.`;
            }
            const characterState = engine.deObject.stateFor[characterId];
            if (!characterState) {
                return `No state found for character "${characterId}".`;
            }
            return await whatIsWeatherLikeForCharacter(engine.deObject, characterId);
        },
        help: "Displays the current weather for a given character (by id) and its effects and whether they are sheltered from it or not.",
        cheat: true,
        args: ["<character id>"],
    },
    "whatwouldtheweatherbelikefor": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (args.length < 2) {
                return "Usage: /whatwouldtheweatherbelikefor <character id>, <location id>, <location slot id>\nOptions for location are: " + Object.keys(engine.deObject.world.locations).join(", ");
            }
            const characterId = args[0];
            const locationId = args[1];

            if (args.length < 3) {
                return `Usage: /whatwouldtheweatherbelikefor <character id>, <location id>, <location slot id>\nOptions for location slots in location "${locationId}" are: ` + Object.keys(engine.deObject.world.locations[locationId]?.slots || {}).join(", ");
            }

            const locationSlotId = args[2];

            const character = engine.deObject.characters[characterId];
            if (!character) {
                return `Character "${characterId}" not found. Use /id <name> to look up a character's id.`;
            }
            const location = engine.deObject.world.locations[locationId];
            if (!location) {
                return `Location "${locationId}" not found in the world, options are: ${Object.keys(engine.deObject.world.locations).join(", ")}`;
            }
            const slot = location.slots[locationSlotId];
            if (!slot) {
                return `Location slot "${locationSlotId}" not found in location "${locationId}", options are: ${Object.keys(location.slots).join(", ")}`;
            }
            const weatherThere = location.internalState.currentWeather;
            const isSheltered = await isCharacterShelteredFromWeather(engine.deObject, characterId, weatherThere, locationId, locationSlotId);
            const weatherSystem = getWeatherSystemForLocationAndWeather(engine.deObject, locationId, weatherThere);
            if (isSheltered.fullySheltered) {
                const noEffectDescription = typeof weatherSystem.noEffectDescription === "string" ? weatherSystem.noEffectDescription : await weatherSystem.noEffectDescription({
                    char: character,
                });
                return `Hypothetical - The current weather at (${locationId}, ${locationSlotId}) is "${weatherThere}". However, "${characterId}" would be fully sheltered from its effects. ${isSheltered.reason || ""}, therefore ${noEffectDescription || "no weather effects would apply to them."}`;
            } else if (isSheltered.partiallySheltered) {
                const partialEffectDescription = typeof weatherSystem.partialEffectDescription === "string" ? weatherSystem.partialEffectDescription : await weatherSystem.partialEffectDescription({
                    char: character,
                });
                return `Hypothetical - The current weather at (${locationId}, ${locationSlotId}) is "${weatherThere}". "${characterId}" would be partially sheltered from its effects. ${isSheltered.reason || ""}, therefore ${partialEffectDescription || "some weather effects might apply to them."}`;
            } else if (isSheltered.negativelyExposed) {
                const negativeEffectsDescription = typeof weatherSystem.negativelyExposedDescription === "string" ? weatherSystem.negativelyExposedDescription : await weatherSystem.negativelyExposedDescription({
                    char: character,
                });
                return `Hypothetical - The current weather at (${locationId}, ${locationSlotId}) is "${weatherThere}". "${characterId}" would be negatively exposed to its effects. ${isSheltered.reason || ""}, therefore ${negativeEffectsDescription || "strongly negative weather effects would apply to them."}`;
            } else {
                const effectDescription = typeof weatherSystem.fullEffectDescription === "string" ? weatherSystem.fullEffectDescription : await weatherSystem.fullEffectDescription({
                    char: character,
                });
                return `Hypothetical - The current weather at (${locationId}, ${locationSlotId}) is "${weatherThere}". ${isSheltered.reason || ""}, therefore ${effectDescription || "all weather effects would apply to them."}`;
            }
        },
        cheat: true,
        help: "Displays what the weather would be like for a given character (by id) if they were in a specified location and slot. Arguments are comma-separated.",
        args: ["<character id>", "<location id>", "<location slot id>"],
    },
    "whereis": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (args.length === 0) {
                return "Usage: /whereis <character id>";
            }
            const characterId = args.join(" ");
            const character = engine.deObject.characters[characterId];
            if (!character) {
                return `Character "${characterId}" not found. Use /id <name> to look up a character's id.`;
            }
            const stateOfCharacter = engine.deObject.stateFor[characterId];
            if (!stateOfCharacter) {
                return `No state found for character "${characterId}".`;
            }
            return `"${character.name}" (${characterId}) is currently at: ${stateOfCharacter.location}, at the slot: ${stateOfCharacter.locationSlot}.`;
        },
        help: "Displays the current location of a character in the world by their character id.",
        cheat: true,
        args: ["<character id>"],
    },
    "whatcanisee": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (!engine.deObject.user) {
                throw new Error("DEngine has no user character defined");
            }
            const info = await getCharacterCanSee(engine.deObject, engine.deObject.user);
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
            if (!engine.deObject.user) {
                throw new Error("DEngine has no user character defined");
            }

            const userState = engine.deObject.stateFor[engine.deObject.user];
            if (!userState) {
                throw new Error(`No state found for character "${engine.deObject.user}".`);
            }

            let answer = `The following characters are interacting with you in your current location:\n\n`;

            if (!userState.conversationId) {
                return answer + "No one is currently interacting with you.";
            }

            const conversationId = engine.deObject.conversations[userState.conversationId];
            for (const participantName of conversationId.participants) {
                if (participantName === engine.deObject.user) {
                    continue;
                }
                const characterInfo = engine.deObject.characters[participantName];
                const characterState = engine.deObject.stateFor[participantName];
                if (characterInfo) {
                    answer += `- ${participantName}: ${await getExternalDescriptionOfCharacter(engine.deObject, participantName, true)}\n`;
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
            if (!engine.deObject.user) {
                throw new Error("DEngine has no user character defined");
            }
            return "TODO"
        },
        help: "Lists the locations you can go to from your current location",
        cheat: false,
        args: [],
    },
    "syspromptfor": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (args.length === 0) {
                return "Usage: /syspromptfor <character id>";
            }
            const characterId = args.join(" ");

            return (await getSysPromptForCharacter(engine, characterId)).sysprompt;
        },
        help: "Displays the current system prompt for a given character (by id), for general inference purposes.",
        cheat: true,
        args: ["<character id>"],
    },
    "externaldescriptionfor": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (args.length === 0) {
                return "Usage: /externaldescriptionfor <character id>";
            }
            const characterId = args.join(" ");

            return await getExternalDescriptionOfCharacter(engine.deObject, characterId, true);
        },
        help: "Displays the current external description for a given character (by id), which is the description that other characters would see of them.",
        cheat: true,
        args: ["<character id>"],
    },
    "internaldescriptionfor": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (args.length === 0) {
                return "Usage: /internaldescriptionfor <character id>";
            }
            const characterId = args.join(" ");

            return (await getInternalDescriptionOfCharacter(engine.deObject, characterId)).general;
        },
        help: "Displays the current internal description for a given character (by id), which is the description that they themselves would have of themself.",
        cheat: true,
        args: ["<character id>"],
    },
    "expressivestatesfor": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (args.length === 0) {
                return "Usage: /expressivestatesfor <character id>";
            }
            const characterId = args.join(" ");
            const result = (await getInternalDescriptionOfCharacter(engine.deObject, characterId)).expressiveStates.join("\n\n");
            return result || `No expressive states found for character "${characterId}".`;
        },
        help: "Displays the current expressive states for a given character (by id), which are the states that they themselves would have of themself that are relevant to how they express themselves to others.",
        cheat: true,
        args: ["<character id>"],
    },
    "relationshipsfor": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (args.length === 0) {
                return "Usage: /relationshipsfor <character id>";
            }
            const characterId = args.join(" ");
            const result = (await getInternalDescriptionOfCharacter(engine.deObject, characterId)).relationships.join("\n\n");
            return result || `No relationships found for character "${characterId}".`;
        },
        help: "Displays the current relationships for a given character (by id), which are the relationships that they themselves would have of themself that are relevant to how they interact with others.",
        cheat: true,
        args: ["<character id>"],
    },
    "rawstatefor": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (args.length === 0) {
                return "Usage: /rawstatefor <character id>";
            }
            const characterId = args.join(" ");
            const character = engine.deObject.characters[characterId];
            if (!character) {
                return `Character "${characterId}" not found. Use /id <name> to look up a character's id.`;
            }
            const characterState = engine.deObject.stateFor[characterId];
            if (!characterState) {
                return `No state found for character "${characterId}".`;
            }
            const charStateShallowCopy = { ...characterState };
            // @ts-ignore
            delete charStateShallowCopy.history;
            return JSON.stringify(charStateShallowCopy, null, 2);
        },
        help: "Displays the raw JSON state for a given character (by id).",
        cheat: true,
        args: ["<character id>"],
    },

    // hard cheats
    "getbondvaluesfor": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (args.length < 2) {
                return "Usage: /getbondvaluesfor <character id>, <towards character id>";
            }
            const characterId = args[0];
            const otherCharacterId = args[1];
            const character = engine.deObject.characters[characterId];
            const otherCharacter = engine.deObject.characters[otherCharacterId];
            if (!character) {
                return `Character "${characterId}" not found. Use /id <name> to look up a character's id.`;
            }
            if (!otherCharacter) {
                return `Character "${otherCharacterId}" not found. Use /id <name> to look up a character's id.`;
            }
            const foundBond = engine.getDEObject().bonds[characterId].active.find(bond => bond.towards === otherCharacterId);
            if (!foundBond) {
                return `No active bond found from "${characterId}" towards "${otherCharacterId}".`;
            }

            const isFamilyOfType = getFamilyBondRelation(character, otherCharacter);

            return `Friendship/Foe Axis value [-100,100]: ${foundBond.bond}\n` +
            `Bond2/Romance value [0,100]: ${foundBond.bond2}\n` +
            `Stranger Axis [false, true]: ${foundBond.stranger}\n` +
            `Family relationship (if any): ${isFamilyOfType || "None"}`;
        },
        help: "Displays the first bond value between two characters (by id). Arguments are comma-separated.",
        cheat: true,
        args: ["<character id>", "<towards character id>"],
    },
    "setfirstbondvaluefor": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (args.length < 3) {
                return "Usage: /setfirstbondvaluefor <character id>, <towards character id>, <bond value [-100,100]>";
            }
            const characterId = args[0];
            const otherCharacterId = args[1];
            const bondValue = parseInt(args[2]);
            if (isNaN(bondValue) || bondValue < -100 || bondValue > 100) {
                return `Invalid bond value "${args[2]}". Bond value must be an integer between -100 and 100.`;
            }
            const character = engine.deObject.characters[characterId];
            const otherCharacter = engine.deObject.characters[otherCharacterId];
            if (!character) {
                return `Character "${characterId}" not found.`;
            }
            if (!otherCharacter) {
                return `Character "${otherCharacterId}" not found.`;
            }
            const foundBond = engine.getDEObject().bonds[characterId].active.find(bond => bond.towards === otherCharacterId);
            if (!foundBond) {
                engine.deObject.bonds[characterId].active.push({
                    towards: otherCharacterId,
                    bond: bondValue,
                    bond2: 0,
                    stranger: true,
                    createdAt: engine.deObject.currentTime,
                    knowsAs: [],
                    undoableShifts: {},
                });
                return `No active bond found from "${characterId}" towards "${otherCharacterId}". A new bond has been created with the specified bond value.`;
            }

            foundBond.bond = bondValue;
            return `The bond value from "${characterId}" towards "${otherCharacterId}" has been updated to ${bondValue}.`;
        },
        help: "Sets the first bond value between two characters (by id). This is the value on the axis of friendship vs enmity, where -100 is an extreme enemy, 0 is neutral, and 100 is an extreme friend. Arguments are comma-separated.",
        cheat: true,
        args: ["<character id>", "<towards character id>", "<bond value [-100,100]>"],
    },
    "setsecondbondvaluefor": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (args.length < 3) {
                return "Usage: /setsecondbondvaluefor <character id>, <towards character id>, <bond2 value [0,100]>";
            }
            const characterId = args[0];
            const otherCharacterId = args[1];
            const bondValue = parseInt(args[2]);
            if (isNaN(bondValue) || bondValue < 0 || bondValue > 100) {
                return `Invalid bond2 value "${args[2]}". Bond2 value must be an integer between 0 and 100.`;
            }
            const character = engine.deObject.characters[characterId];
            const otherCharacter = engine.deObject.characters[otherCharacterId];
            if (!character) {
                return `Character "${characterId}" not found.`;
            }
            if (!otherCharacter) {
                return `Character "${otherCharacterId}" not found.`;
            }
            const foundBond = engine.getDEObject().bonds[characterId].active.find(bond => bond.towards === otherCharacterId);
            if (!foundBond) {
                engine.deObject.bonds[characterId].active.push({
                    towards: otherCharacterId,
                    bond: 0,
                    bond2: bondValue,
                    stranger: true,
                    createdAt: engine.deObject.currentTime,
                    knowsAs: [],
                    undoableShifts: {},
                });
                return `No active bond found from "${characterId}" towards "${otherCharacterId}". A new bond has been created with the specified bond2 value.`;
            }
            foundBond.bond2 = bondValue;
            return `The bond2 value from "${characterId}" towards "${otherCharacterId}" has been updated to ${bondValue}.`;
        },
        help: "Sets the second bond value between two characters (by id). This is the romance/intimacy axis, where 0 is none and 100 is maximum. Arguments are comma-separated.",
        cheat: true,
        args: ["<character id>", "<towards character id>", "<bond2 value [0,100]>"],
    },
    "setstrangervaluefor": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (args.length < 3) {
                return "Usage: /setstrangervaluefor <character id>, <towards character id>, <true|false>";
            }
            const characterId = args[0];
            const otherCharacterId = args[1];
            const strangerRaw = args[2].toLowerCase();
            if (strangerRaw !== "true" && strangerRaw !== "false") {
                return `Invalid stranger value "${args[2]}". Must be "true" or "false".`;
            }
            const strangerValue = strangerRaw === "true";
            const character = engine.deObject.characters[characterId];
            const otherCharacter = engine.deObject.characters[otherCharacterId];
            if (!character) {
                return `Character "${characterId}" not found.`;
            }
            if (!otherCharacter) {
                return `Character "${otherCharacterId}" not found.`;
            }
            const foundBond = engine.getDEObject().bonds[characterId].active.find(bond => bond.towards === otherCharacterId);
            if (!foundBond) {
                engine.deObject.bonds[characterId].active.push({
                    towards: otherCharacterId,
                    bond: 0,
                    bond2: 0,
                    stranger: strangerValue,
                    createdAt: engine.deObject.currentTime,
                    knowsAs: [],
                    undoableShifts: {},
                });
                return `No active bond found from "${characterId}" towards "${otherCharacterId}". A new bond has been created with the specified stranger value.`;
            }
            foundBond.stranger = strangerValue;
            return `The stranger value from "${characterId}" towards "${otherCharacterId}" has been updated to ${strangerValue}.`;
        },
        help: "Sets the stranger flag on a bond between two characters (by id). When true, the character treats the other as a stranger; when false, they are considered known. Arguments are comma-separated.",
        cheat: true,
        args: ["<character id>", "<towards character id>", "<true|false>"],
    },
    "addknownnamefor": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (args.length < 3) {
                return "Usage: /addknownnamefor <character id>, <towards character id>, <name>, <is nickname>, <is primary name>";
            }
            const characterId = args[0];
            const otherCharacterId = args[1];
            const name = args[2];
            const isNicknameRaw = args[3].toLowerCase();
            if (isNicknameRaw !== "true" && isNicknameRaw !== "false") {
                return `Invalid isNickname value "${args[3]}". Must be "true" or "false".`;
            }
            const isNicknameValue = isNicknameRaw === "true";
            const isPrimaryNameRaw = args[4].toLowerCase();
            if (isPrimaryNameRaw !== "true" && isPrimaryNameRaw !== "false") {
                return `Invalid isPrimaryName value "${args[4]}". Must be "true" or "false".`;
            }
            const isPrimaryNameValue = isPrimaryNameRaw === "true";
            const character = engine.deObject.characters[characterId];
            const otherCharacter = engine.deObject.characters[otherCharacterId];
            if (!character) {
                return `Character "${characterId}" not found.`;
            }
            if (!otherCharacter) {
                return `Character "${otherCharacterId}" not found.`;
            }
            const foundBond = engine.getDEObject().bonds[characterId].active.find(bond => bond.towards === otherCharacterId);
            if (!foundBond) {
                engine.deObject.bonds[characterId].active.push({
                    towards: otherCharacterId,
                    bond: 0,
                    bond2: 0,
                    stranger: true,
                    createdAt: engine.deObject.currentTime,
                    knowsAs: [{
                        name: name,
                        nickname: isNicknameValue,
                        primary: isPrimaryNameValue,
                    }],
                    undoableShifts: {},
                });
                return `No active bond found from "${characterId}" towards "${otherCharacterId}". A new bond has been created with the specified knowsName value.`;
            }
            foundBond.knowsAs.push({
                name: name,
                nickname: isNicknameValue,
                primary: isPrimaryNameValue,
            });
            if (isPrimaryNameValue) {
                // If this is the primary name, we should unset any other primary names
                for (const knownName of foundBond.knowsAs) {
                    if (knownName.name !== name) {
                        knownName.primary = false;
                    }
                }
            }
            return `The known name from "${characterId}" towards "${otherCharacterId}" has been updated with the name "${name}".`;
        },
        help: "Sets whether a character knows the name of another character in their bond (by id). Arguments are comma-separated.",
        cheat: true,
        args: ["<character id>", "<towards character id>", "<true|false>"],
    },
    "setfamilyrelationshipfor": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            const validRelations = [
                "parent",
                "sibling",
                "child",
                "spouse",
                "cousin",
                "uncle",
                "aunt",
                "grandparent",
                "grandchild",
                "niece", 
                "nephew",
                "other",
                "step parent",
                "step child",
                "step sibling",
                "half sibling",
                "step grandparent",
                "step grandchild"
            ];
            if (args.length < 3) {
                return `Usage: /setfamilyrelationshipfor <character id>, <towards character id>, <relation|none>\nValid relations: ${validRelations.join(", ")}, or "none" to remove the tie.`;
            }
            const characterId = args[0];
            const otherCharacterId = args[1];
            const relation = args[2].toLowerCase();
            if (relation !== "none" && !validRelations.includes(relation)) {
                return `Invalid relation "${args[2]}". Valid relations are: ${validRelations.join(", ")}, or "none" to remove the tie.`;
            }
            const character = engine.deObject.characters[characterId];
            const otherCharacter = engine.deObject.characters[otherCharacterId];
            if (!character) {
                return `Character "${characterId}" not found.`;
            }
            if (!otherCharacter) {
                return `Character "${otherCharacterId}" not found.`;
            }
            const familyTies = character.familyTies;
            const existingTie = familyTies[otherCharacterId]
            if (relation === "none") {
                if (!existingTie) {
                    return `No family tie found from "${characterId}" towards "${otherCharacterId}".`;
                }
                delete familyTies[otherCharacterId];
                return `The family tie from "${characterId}" towards "${otherCharacterId}" has been removed.`;
            }
            if (existingTie) {
                existingTie.relation = /** @type {any} */ (relation);
                return `The family relationship from "${characterId}" towards "${otherCharacterId}" has been updated to "${relation}".`;
            }
            familyTies[otherCharacterId] = { relation: /** @type {any} */ (relation) };
            return `A new family tie from "${characterId}" towards "${otherCharacterId}" has been created with relation "${relation}".`;
        },
        help: "Sets the family relationship from one character towards another (by id). Use \"none\" to remove it. Valid relations: parent, sibling, child, spouse, cousin, uncle, aunt, grandparent, grandchild, niece, nephew, other. Arguments are comma-separated.",
        cheat: true,
        args: ["<character id>", "<towards character id>", "<relation|none>"],
    },
    "id": {
        run: async (engine, args) => {
            if (!engine.deObject) {
                throw new Error("DEngine not initialized");
            }
            if (args.length === 0) {
                return "Usage: /id <character name>";
            }
            const searchName = args.join(" ").trim();
            const results = [];
            for (const charId in engine.deObject.characters) {
                const character = engine.deObject.characters[charId];
                if (character.name.toLowerCase() === searchName.toLowerCase()) {
                    const state = engine.deObject.stateFor[charId];
                    const location = state ? `${state.location} (slot: ${state.locationSlot})` : "unknown location";
                    const status = state?.deadEnded ? " [DEAD ENDED]" : state?.dead ? " [DEAD]" : "";
                    results.push(`ID: ${charId}\n  Name: ${character.name}\n  Location: ${location}${status}`);
                }
            }
            if (results.length === 0) {
                return `No characters found with name "${searchName}".`;
            }
            return `Characters matching "${searchName}":\n\n` + results.join("\n\n");
        },
        help: "Looks up all character IDs associated with a given character name, along with their current location in the world. Use this to find the id needed for other commands.",
        cheat: true,
        args: ["<character name>"],
    },
}