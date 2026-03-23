import { DEngine } from "../index.js";
import { makeTimestamp } from "./messages.js";
import { getCharacterCarryingCapacity, getCharacterVolume, getCharacterWeight, getItemVolume, getItemWeight, getWearableFitment, locationPathToMessage } from "./weight-and-volume.js";
import { getWeatherSystemForLocationAndWeather } from "./world.js";

/**
 * @param {DEngine} engine 
 * @param {string} characterName
 * @return {{
 *    carrierName: string,
 *    carrierLocation: string,
 *    carrierLocationSlot: string,
 *    directlyCarried: boolean,
 *    itemPath: Array<string | number> | null,
 *    itemPathEnd: "containingCharacters" | "ontopCharacters" | null,
 *    item: DEItem | null,
 * } | null}
 */
export function getBeingCarriedByCharacter(engine, characterName) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    const charState = engine.deObject.stateFor[characterName];
    if (!charState) {
        throw new Error(`Character ${characterName} not found in engine state.`);
    }
    for (const otherCharName in engine.deObject.stateFor) {
        const otherCharState = engine.deObject.stateFor[otherCharName];
        if (otherCharName === characterName || charState.location !== otherCharState.location || otherCharState.deadEnded) {
            continue;
        }

        if (otherCharState.carryingCharactersDirectly && otherCharState.carryingCharactersDirectly.includes(characterName)) {
            return {
                carrierName: otherCharName,
                carrierLocation: otherCharState.location,
                carrierLocationSlot: otherCharState.locationSlot,
                directlyCarried: true,
                itemPath: null,
                itemPathEnd: null,
                item: null,
            };
        }

        const found = findLocationOfCharInsideOrAtopItemRecursive(characterName, otherCharState.carrying, ["characters", otherCharName, "carrying"]);
        if (found) {
            return {
                carrierName: otherCharName,
                carrierLocation: otherCharState.location,
                carrierLocationSlot: otherCharState.locationSlot,
                directlyCarried: false,
                itemPath: found.path,
                itemPathEnd: found.end,
                item: found.item,
            };
        }
    }

    return null;
}

/**
 * @param {string} otherCharName
 * @param {DEItem[]} list
 * @param {Array<string | number>} pathSoFar
 * @returns {{
 *   path: Array<string | number>,
 *   end: "containingCharacters" | "ontopCharacters",
 *   item: DEItem,
 * } | null}
 */
export function findLocationOfCharInsideOrAtopItemRecursive(otherCharName, list, pathSoFar) {
    for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (item.amount === 0) {
            continue;
        }
        if (item.containingCharacters && item.containingCharacters.includes(otherCharName)) {
            return {
                path: [...pathSoFar, i],
                end: "containingCharacters",
                item: item,
            }
        } else if (item.ontopCharacters && item.ontopCharacters.includes(otherCharName)) {
            return {
                path: [...pathSoFar, i],
                end: "ontopCharacters",
                item: item,
            }
        } else {
            const found = findLocationOfCharInsideOrAtopItemRecursive(otherCharName, item.containing, [...pathSoFar, i, "containing"]);
            if (found) {
                return found;
            }
            const foundAtop = findLocationOfCharInsideOrAtopItemRecursive(otherCharName, item.ontop, [...pathSoFar, i, "ontop"]);
            if (foundAtop) {
                return foundAtop;
            }
        }
    }
    return null;
}

/**
 * @param {DEItem[]} list
 * @param {Array<string | number>} pathSoFar
 * @param  {Array<{
 *   path: Array<string | number>,
 *   end: "containingCharacters" | "ontopCharacters",
 *   item: DEItem,
 *   char: string,
 * }>} resultsSoFar
 * @returns {Array<{
 *   path: Array<string | number>,
 *   end: "containingCharacters" | "ontopCharacters",
 *   item: DEItem,
 *   char: string,
 * }>}
 */
export function findLocationOfAnyCharInsideOrAtopItemRecursive(list, pathSoFar, resultsSoFar) {
    for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (item.amount === 0) {
            continue;
        }
        if (item.containingCharacters) {
            for (const char of item.containingCharacters) {
                resultsSoFar.push({
                    path: [...pathSoFar, i],
                    end: "containingCharacters",
                    item: item,
                    char: char,
                });
            }
        }
        if (item.ontopCharacters) {
            for (const char of item.ontopCharacters) {
                resultsSoFar.push({
                    path: [...pathSoFar, i],
                    end: "ontopCharacters",
                    item: item,
                    char: char,
                });
            }
        }
        findLocationOfAnyCharInsideOrAtopItemRecursive(item.containing, [...pathSoFar, i, "containing"], resultsSoFar);
        findLocationOfAnyCharInsideOrAtopItemRecursive(item.ontop, [...pathSoFar, i, "ontop"], resultsSoFar);
    }
    return resultsSoFar;
}


/**
 * 
 * @param {DEngine} engine 
 * @param {string} characterName 
 * @returns {{
 *   location: string,
 *   beingCarriedBy: string | null,
 *   itemPath: Array<string | number> | null,
 *   item: DEItem | null,
 *   itemPathEnd: "containingCharacters" | "ontopCharacters" | null,
 * }}
 */
export function getCharacterExactLocation(engine, characterName) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    const charState = engine.deObject.stateFor[characterName];
    if (!charState) {
        throw new Error(`Character ${characterName} not found in engine state.`);
    }
    const beingCarriedInfo = getBeingCarriedByCharacter(engine, characterName);
    if (beingCarriedInfo) {
        return {
            location: beingCarriedInfo.carrierLocation,
            beingCarriedBy: beingCarriedInfo.carrierName,
            itemPath: beingCarriedInfo.itemPath,
            item: beingCarriedInfo.item,
            itemPathEnd: beingCarriedInfo.itemPathEnd,
        };
    }
    const location = charState.location;
    for (const slot in engine.deObject.world.locations[location].slots) {
        const slotInfo = engine.deObject.world.locations[location].slots[slot];
        const foundChar = findLocationOfCharInsideOrAtopItemRecursive(characterName, slotInfo.items, ["slots", slot, "items"]);
        if (foundChar) {
            return {
                location: location,
                beingCarriedBy: null,
                itemPath: foundChar.path,
                item: foundChar.item,
                itemPathEnd: foundChar.end,
            };
        }
    }
    return {
        location: location,
        beingCarriedBy: null,
        itemPath: null,
        item: null,
        itemPathEnd: null,
    };
}

/**
 * 
 * @param {DEngine} engine 
 * @param {string} characterName 
 */
export function getAllItemsCharacterIsInsideOf(engine, characterName) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }

    const exactLocation = getCharacterExactLocation(engine, characterName);
    if (!exactLocation.itemPath) {
        return [];
    }

    /**
     * @type {DEItem[]}
     */
    const items = [];

    const characterLocationInfo = engine.deObject.stateFor[characterName].location;
    const locationState = engine.deObject.world.locations[characterLocationInfo];

    const expectedPath = [...exactLocation.itemPath, exactLocation.itemPathEnd]

    /**
     * @type {*}
     */
    let base;
    if (exactLocation.itemPath[0] === "slots") {
        base = locationState.slots[exactLocation.itemPath[1]].items;
    } else if (exactLocation.itemPath[0] === "characters") {
        base = engine.deObject.stateFor[exactLocation.itemPath[1]].carrying;
    } else {
        throw new Error(`Invalid item path for character ${characterName}: ${exactLocation.itemPath}`);
    }

    for (let i = 3; i < expectedPath.length; i++) {
        const pathPart = expectedPath[i];
        const pathPartAhead = expectedPath[i + 1];
        // @ts-ignore
        base = base[pathPart];

        if (pathPartAhead === "containingCharacters") {
            items.push(base);
        }
    }

    return items;
}

/**
 * 
 * @param {DEngine} engine 
 * @param {string} characterName
 * @returns {Array<{
 *   carriedName: string,
 *   itemPath: Array<string | number> | null,
 *   item: DEItem | null,
 *   itemPathEnd: "containingCharacters" | "ontopCharacters" | null,
 * }>}
 */
export function getListOfCarriedCharactersByCharacter(engine, characterName) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }

    const results1 = findLocationOfAnyCharInsideOrAtopItemRecursive(engine.deObject.stateFor[characterName].carrying, ["characters", characterName, "carrying"], []);
    findLocationOfAnyCharInsideOrAtopItemRecursive(engine.deObject.stateFor[characterName].wearing, ["characters", characterName, "wearing"], results1);

    return (engine.deObject.stateFor[characterName].carryingCharactersDirectly).map((carriedCharName) => ({
        carriedName: carriedCharName,
        itemPath: null,
        item: null,
        itemPathEnd: null,
        // @ts-ignore typescript bugs
    })).concat(results1.map((result) => ({
        carriedName: result.char,
        itemPath: result.path,
        item: result.item,
        itemPathEnd: result.end,
    })));
}

/**
 * @param {DEngine} engine
 * @param {string} characterName
 * @returns {boolean}
 */
export function isTopNaked(engine, characterName) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }

    const charState = engine.deObject.stateFor[characterName];
    if (!charState) {
        throw new Error(`Character ${characterName} not found in engine state.`);
    }

    const wearingItems = charState.wearing;
    for (const item of wearingItems) {
        if (item.amount > 0) {
            continue;
        }
        if (item.wearableProperties?.coversTopNakedness) {
            return false;
        }
    }
    return true;
}

/**
 * @param {DEngine} engine
 * @param {string} characterName
 * @returns {boolean}
 */
export function isBottomNaked(engine, characterName) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }

    const charState = engine.deObject.stateFor[characterName];
    if (!charState) {
        throw new Error(`Character ${characterName} not found in engine state.`);
    }

    const wearingItems = charState.wearing;
    for (const item of wearingItems) {
        if (item.amount > 0) {
            continue;
        }
        if (item.wearableProperties?.coversBottomNakedness) {
            return false;
        }
    }
    return true;
}

/**
 * @param {DEngine} engine
 * @param {string} characterName
 * @returns {{
 *   location: string,
 *   nonStrangers: string[],
 *   totalStrangers: string[],
 *   deadNonStrangers: string[],
 *   deadTotalStrangers: string[],
 * }}
 */
export function getSurroundingCharacters(engine, characterName) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }

    const charState = engine.deObject.stateFor[characterName];
    if (!charState) {
        throw new Error(`Character ${characterName} not found in engine state.`);
    }

    const location = charState.location;
    const locationState = engine.deObject.world.locations[location];
    const nonStrangers = [];
    const totalStrangers = [];
    const deadNonStrangers = [];
    const deadTotalStrangers = [];
    for (const charToCheck in engine.deObject.stateFor) {
        const charStateToCheck = engine.deObject.stateFor[charToCheck];
        if (charStateToCheck.location !== location || charToCheck === characterName) {
            continue;
        }
        if (engine.deObject.social.bonds[characterName].active.find(b => b.towards === charToCheck) || engine.deObject.social.bonds[characterName].ex.find(b => b.towards === charToCheck)) {
            if (charStateToCheck.dead) {
                deadNonStrangers.push(charToCheck);
            } else {
                nonStrangers.push(charToCheck);
            }
        } else {
            if (charStateToCheck.dead) {
                deadTotalStrangers.push(charToCheck);
            } else {
                totalStrangers.push(charToCheck);
            }
        }
    }

    return {
        location,
        nonStrangers,
        totalStrangers,
        deadTotalStrangers,
        deadNonStrangers,
    };
}

/**
 * @param {DEngine} engine 
 * @param {string} characterName 
 */
export function getCurrentlyInteractingCharacters(engine, characterName) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    // find the current conversation the character is engaging at
    const charState = engine.deObject.stateFor[characterName];

    if (!charState) {
        throw new Error(`Character ${characterName} not found in engine state.`);
    }

    const convId = charState.conversationId;

    if (!convId) {
        return [];
    }

    const conversation = engine.deObject.conversations[convId];
    if (!conversation) {
        return [];
    }

    return conversation.participants.filter(participant => participant !== characterName);
}

/**
 * @param {DEngine} engine 
 * @param {string} characterName 
 */
export function getPowerLevel(engine, characterName) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    const character = engine.deObject.characters[characterName];
    if (!character) {
        throw new Error(`Character ${characterName} not found in engine.`);
    }

    return getPowerLevelFromCharacter(character);
}

/**
 * @param {string} tier 
 * @param {number} tierValue 
 */
export function getWhatCanSolo(tier, tierValue) {
    switch (tier) {
        case "insect":
            if (tierValue <= 10) return "barely functional, could be crushed by a light breeze";
            if (tierValue <= 20) return "a weak insect, could maybe bite through a thin leaf";
            if (tierValue <= 50) return "an average insect, could sting or bite a small creature";
            if (tierValue <= 70) return "a strong insect, could carry several times its own weight";
            if (tierValue <= 90) return "an exceptional insect, could overpower other insects and small critters";
            return "the apex of insect potential, as dangerous as a small critter";

        case "critter":
            if (tierValue <= 10) return "a sickly critter, barely able to move, could be overpowered by a strong insect";
            if (tierValue <= 20) return "a weak critter, like a frail mouse, could struggle against a house cat";
            if (tierValue <= 50) return "an average critter, like a rat or squirrel, could fend off other small animals";
            if (tierValue <= 70) return "a strong critter, like an aggressive raccoon, could seriously injure a small child";
            if (tierValue <= 90) return "an exceptional critter, like a large aggressive dog, could overpower a weakened human";
            return "the apex of critter potential, as dangerous as a child in a fight";

        case "human":
            if (tierValue <= 10) return "as strong as a house cat at best";
            if (tierValue <= 20) return "severely weakened, like a paraplegic or someone recovering from a coma, could barely defend themselves";
            if (tierValue <= 50) return "an average human, could hold their own in a bar fight";
            if (tierValue <= 70) return "a fit and trained human, could solo most untrained opponents";
            if (tierValue <= 90) return "peak human condition, like an elite athlete or special forces soldier, could solo several average humans";
            return "the absolute pinnacle of human potential, a once-in-a-generation physical specimen, could solo a small group of trained fighters";

        case "apex":
            if (tierValue <= 10) return "a weakened apex predator, roughly equivalent to a peak human";
            if (tierValue <= 20) return "could bend steel bars with effort, solo a small squad of armed soldiers";
            if (tierValue <= 50) return "could flip a car, shrug off small arms fire, solo a platoon of soldiers";
            if (tierValue <= 70) return "could punch through concrete walls, solo an armored vehicle";
            if (tierValue <= 90) return "could tear through reinforced steel, tank explosions, solo a small military unit";
            return "the peak of apex power, could level a small building with raw force";

        case "street_level":
            if (tierValue <= 10) return "could demolish a wall with a punch, dangerous to a small squad";
            if (tierValue <= 20) return "could wreck a building floor, tank heavy weapons fire";
            if (tierValue <= 50) return "could level a building, solo a heavily armed response team";
            if (tierValue <= 70) return "could demolish a city block with sustained effort, shrug off military-grade weapons";
            if (tierValue <= 90) return "could annihilate several city blocks, tank tank shells and missiles";
            return "the peak of street-level power, an unstoppable urban combatant, a one-person army";

        case "block_level":
            if (tierValue <= 10) return "could destroy a city block in one strike";
            if (tierValue <= 20) return "could flatten multiple city blocks, tank artillery barrages";
            if (tierValue <= 50) return "could devastate a small neighborhood, shrug off bunker busters";
            if (tierValue <= 70) return "could obliterate a large neighborhood, solo a battalion";
            if (tierValue <= 90) return "could wipe out a small district, conventional military is pointless";
            return "the peak of block-level power, a walking natural disaster for any urban area";

        case "city_level":
            if (tierValue <= 10) return "could level a small town with sustained effort";
            if (tierValue <= 20) return "could destroy a mid-sized city, tank tactical weapons";
            if (tierValue <= 50) return "could annihilate a large city in a single engagement";
            if (tierValue <= 70) return "could wipe a major metropolitan area off the map";
            if (tierValue <= 90) return "could devastate a mega-city and its surrounding regions";
            return "the peak of city-level power, could reduce an entire urban sprawl to ash in moments";

        case "country_level":
            if (tierValue <= 10) return "could devastate a small country, rendering it uninhabitable";
            if (tierValue <= 20) return "could obliterate a mid-sized nation with sustained effort";
            if (tierValue <= 50) return "could wipe a large country off the map";
            if (tierValue <= 70) return "could annihilate multiple nations in a single campaign";
            if (tierValue <= 90) return "could reshape the geography of an entire subcontinent";
            return "the peak of country-level power, entire nations are nothing, could threaten a continent";

        case "continental":
            if (tierValue <= 10) return "could crack a continent with sustained effort";
            if (tierValue <= 20) return "could split a continent in half, cause extinction-level tectonic events";
            if (tierValue <= 50) return "could shatter a continent and boil the surrounding oceans";
            if (tierValue <= 70) return "could devastate multiple continents, alter the planet's rotation";
            if (tierValue <= 90) return "could render an entire hemisphere uninhabitable";
            return "the peak of continental power, could scour the surface of a planet clean";

        case "planetary":
            if (tierValue <= 10) return "could crack a planet's crust, cause global extinction";
            if (tierValue <= 20) return "could shatter a small planet or moon";
            if (tierValue <= 50) return "could destroy an Earth-sized planet";
            if (tierValue <= 70) return "could obliterate a gas giant";
            if (tierValue <= 90) return "could destroy multiple planets in rapid succession";
            return "the peak of planetary power, planets are toys, approaching stellar threat";

        case "stellar":
            if (tierValue <= 10) return "could destabilize a star, cause a supernova";
            if (tierValue <= 20) return "could destroy a star in a single blast";
            if (tierValue <= 50) return "could obliterate entire solar systems";
            if (tierValue <= 70) return "could wipe out multiple star systems, collapse nebulae";
            if (tierValue <= 90) return "could devastate a significant portion of a galaxy's arm";
            return "the peak of stellar power, star systems blink out of existence at their whim";

        case "galactic":
            if (tierValue <= 10) return "could devastate a dwarf galaxy";
            if (tierValue <= 20) return "could tear apart a mid-sized galaxy";
            if (tierValue <= 50) return "could annihilate a galaxy the size of the Milky Way";
            if (tierValue <= 70) return "could obliterate galaxy clusters";
            if (tierValue <= 90) return "could wipe out galaxy superclusters, reshape cosmic filaments";
            return "the peak of galactic power, galaxies are dust motes, approaching universal threat";

        case "universal":
            if (tierValue <= 10) return "could unravel the fabric of a localized region of spacetime";
            if (tierValue <= 20) return "could collapse a significant portion of a universe";
            if (tierValue <= 50) return "could destroy an entire universe";
            if (tierValue <= 70) return "could annihilate a universe and its underlying dimensional framework";
            if (tierValue <= 90) return "could threaten multiple universes, tear holes between realities";
            return "the peak of universal power, a walking apocalypse for any single reality, approaching multiversal threat";

        case "multiversal":
            if (tierValue <= 10) return "could destroy multiple universes simultaneously";
            if (tierValue <= 20) return "could collapse entire branches of the multiverse";
            if (tierValue <= 50) return "could annihilate vast swathes of the multiverse, rewrite the laws of physics across realities";
            if (tierValue <= 70) return "could obliterate most of the known multiverse";
            if (tierValue <= 90) return "could threaten the entirety of the multiverse, only other multiversal beings pose a challenge";
            return "the peak of multiversal power, the multiverse trembles, approaching true omnipotence";

        case "limitless":
            if (tierValue <= 10) return "transcends the multiverse, could erase all of existence with effort";
            if (tierValue <= 20) return "could rewrite the fundamental constants of all realities simultaneously";
            if (tierValue <= 50) return "omnipotent within any conceivable framework, bound only by self-imposed limitations";
            if (tierValue <= 70) return "beyond any conventional scale, existence and nonexistence bend to their will";
            if (tierValue <= 90) return "functionally omnipotent, omniscient, and omnipresent with near-zero limitations";
            return "true limitless power, absolute perfection, nothing exists that could challenge them in any conceivable way";

        default:
            return "unknown power tier";
    }
}

const powerLevelBaseMultipliers = {
    "insect": 1,
    "critter": 2,
    "human": 3,
    "apex": 4,
    "street_level": 5,
    "block_level": 6,
    "city_level": 7,
    "country_level": 8,
    "continental": 9,
    "planetary": 10,
    "stellar": 11,
    "galactic": 12,
    "universal": 13,
    "multiversal": 14,
    "limitless": 15
};

/**
 * @param {DECompleteCharacterReference} character
 */
export function getPowerLevelFromCharacter(character) {
    const powerLevel = (character.tierValue || 1) * (10 ** (powerLevelBaseMultipliers[character.tier] || 1));
    return powerLevel;
}

/**
 * @param {DEngine} engine
 * @param {string} characterName 
 * @param {boolean} onlyBasics
 * @param {boolean} hideCurrentPosture
 * @returns {Promise<string>}
 */
export async function getExternalDescriptionOfCharacter(engine, characterName, onlyBasics = false, hideCurrentPosture = false) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    const character = engine.deObject.characters[characterName];
    if (!character) {
        throw new Error(`Character ${characterName} not found.`);
    }
    const characterState = engine.deObject.stateFor[characterName];
    if (!characterState) {
        throw new Error(`Character state for ${characterName} not found.`);
    }
    let finalDescription = character.shortDescription;
    if (!finalDescription.endsWith(".")) {
        finalDescription += ".";
    }

    let maxStateDominance = 0;
    for (const state of characterState.states) {
        const stateInfo = character.states[state.state];
        let dominanceOfThisState = stateInfo.dominance;
        if (state.relieving && typeof stateInfo.dominanceAfterRelief === "number") {
            dominanceOfThisState = stateInfo.dominanceAfterRelief;
        }
        if (dominanceOfThisState > maxStateDominance) {
            maxStateDominance = dominanceOfThisState;
        }
    }

    for (const state of characterState.states) {
        const stateInfo = character.states[state.state];

        let dominanceOfThisState = stateInfo.dominance;
        if (state.relieving && typeof stateInfo.dominanceAfterRelief === "number") {
            dominanceOfThisState = stateInfo.dominanceAfterRelief;
        }

        if (dominanceOfThisState < maxStateDominance && stateInfo.doNotIgnoreDominanceWhenInjectingExternalDescription) {
            continue;
        }

        let toAdd = "";
        if (stateInfo.relieving) {
            if (stateInfo.relievingGeneralCharacterExternalDescriptionInjection) {
                if (typeof stateInfo.relievingGeneralCharacterExternalDescriptionInjection === "string") {
                    toAdd = stateInfo.relievingGeneralCharacterExternalDescriptionInjection;
                } else {
                    toAdd = await stateInfo.relievingGeneralCharacterExternalDescriptionInjection(engine.deObject, {
                        char: character,
                        causants: state.causants || undefined,
                    });
                }
            }
        } else {
            if (stateInfo.generalCharacterExternalDescriptionInjection) {
                if (typeof stateInfo.generalCharacterExternalDescriptionInjection === "string") {
                    toAdd = stateInfo.generalCharacterExternalDescriptionInjection;
                } else {
                    toAdd = await stateInfo.generalCharacterExternalDescriptionInjection(engine.deObject, {
                        char: character,
                        causants: state.causants || undefined,
                    });
                }
            }
        }


        toAdd = toAdd.trim();
        if (toAdd) {
            if (!toAdd.endsWith(".")) {
                toAdd += ".";
            }
            finalDescription += " " + toAdd;
        }
    }

    const topNaked = isTopNaked(engine, characterName);
    const bottomNaked = isBottomNaked(engine, characterName);

    const hasItemsCoveringTopNakedness = !topNaked;
    if (!hasItemsCoveringTopNakedness && character.shortDescriptionTopNakedAdd) {
        finalDescription += ` ${character.shortDescriptionTopNakedAdd}`;
        if (!finalDescription.endsWith(".")) {
            finalDescription += ".";
        }
    }
    const hasItemsCoveringBottomNakedness = !bottomNaked;
    if (!hasItemsCoveringBottomNakedness && character.shortDescriptionBottomNakedAdd) {
        finalDescription += ` ${character.shortDescriptionBottomNakedAdd}`;
        if (!finalDescription.endsWith(".")) {
            finalDescription += ".";
        }
    }
    if (characterState.wearing.length > 0) {
        finalDescription += " Wearing " + engine.deObject.functions.format_and(engine.deObject, null, characterState.wearing.map(item => item.amount >= 2 ? item.amount + " of " + item.description + " (" + getWearableFitment(engine, item, characterName).fitment + ")" : item.description + " (" + getWearableFitment(engine, item, characterName).fitment + ")")) + ".";
    } else {
        finalDescription += " Not wearing any clothes or accessories.";
    }

    const characterExactLocation = getCharacterExactLocation(engine, characterName);

    if (!onlyBasics) {
        if (characterState.carrying.length > 0) {
            finalDescription += " Carrying " + engine.deObject.functions.format_and(engine.deObject, null, characterState.carrying.map(item => item.amount >= 2 ? item.amount + " of " + item.description : item.description)) + ".";
        } else {
            finalDescription += " Not carrying any items.";
        }

        if (characterExactLocation.beingCarriedBy) {
            finalDescription += ` Being carried by ${characterExactLocation.beingCarriedBy}.`;
        }

        const carriedCharacters = getListOfCarriedCharactersByCharacter(engine, characterName);
        if (carriedCharacters.length > 0) {
            finalDescription += ` Carrying characters: ` + engine.deObject.functions.format_and(engine.deObject, null, carriedCharacters.map((v) => v.carriedName)) + ".";
        }
    }

    finalDescription += " " + getExternalDescriptionOfCharacterPostureOnly(engine, characterName, hideCurrentPosture);

    return finalDescription;
}

/**
 * @param {DEngine} engine
 * @param {string} characterName 
 * @param {boolean} hideCurrentPosture
 * @returns {string}
 */
export function getExternalDescriptionOfCharacterPostureOnly(engine, characterName, hideCurrentPosture = false) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }

    const character = engine.deObject.characters[characterName];
    if (!character) {
        throw new Error(`Character ${characterName} not found.`);
    }
    const characterState = engine.deObject.stateFor[characterName];
    if (!characterState) {
        throw new Error(`Character state for ${characterName} not found.`);
    }

    const posturesThatDoNotSpecifyGround = [
        "standing",
        "flying",
        "floating",
        "swimming",
    ]

    const characterExactLocation = getCharacterExactLocation(engine, characterName);

    let postureAppliedOnDescription = (posturesThatDoNotSpecifyGround.includes(characterState.posture)) ? "at the " + characterState.locationSlot : "on the ground at the " + characterState.locationSlot;
    if (characterExactLocation.itemPathEnd === "ontopCharacters" && characterExactLocation.itemPath) {
        postureAppliedOnDescription = locationPathToMessage(engine, characterName, characterState.location, [...characterExactLocation.itemPath, characterExactLocation.itemPathEnd]);
    } else if (characterExactLocation.itemPathEnd === "containingCharacters" && characterExactLocation.itemPath) {
        postureAppliedOnDescription = locationPathToMessage(engine, characterName, characterState.location, [...characterExactLocation.itemPath, characterExactLocation.itemPathEnd]);
    }

    if (!hideCurrentPosture) {
        return character.name + " is " + postureToText(characterState.posture) + " " + postureAppliedOnDescription + ".";
    } else {
        return character.name + " is " + postureAppliedOnDescription + ".";
    }
}

/**
 * 
 * @param {DEPosture} posture 
 */
export function postureToText(posture) {
    switch (posture) {
        case "lying_down":
            return "lying down";
        case "lying_down+belly_down":
            return "lying down on the belly";
        case "lying_down+belly_up":
            return "lying down on the back";
        case "on_all_fours":
            return "on all fours";
        default:
            return posture;
    }
}

const allPostures = [
    "standing",
    "crawling",
    "climbing",
    "sitting",
    "lying_down",
    "lying_down+belly_up",
    "lying_down+belly_down",
    "on_all_fours",
    "crouching",
    "kneeling",
    "hanging",
    "floating",
    "flying",
    "swimming",
]

export function getBasicPostures() {
    return allPostures.filter(posture => !posture.includes("+"));
}

/**
 * @param {DEPosture} posture 
 */
export function getExtendedPosturesOf(posture) {
    return allPostures.filter(p => p.startsWith(posture + "+"));
}

/**
 * @type {Record<string, string>}
 */
export const POSTURE_MAP = {};
/**
 * @type {Record<string, string>}
 */
export const REVERSE_POSTURE_MAP = {};
for (const posture of allPostures) {
    // @ts-ignore
    POSTURE_MAP[posture] = postureToText(posture);
    // @ts-ignore
    REVERSE_POSTURE_MAP[postureToText(posture).toLowerCase().replace(/\s+/g, "_")] = posture;
}

/**
 * @param {string} humanReadable 
 */
export function humanReadablePostureToPosture(humanReadable) {
    const normalized = humanReadable.toLowerCase().replace(/\s+/g, "_");
    return REVERSE_POSTURE_MAP[normalized] || null;
}

/**
 * @param {DEngine} engine
 * @param {string} characterName 
 */
export async function getCharacterCanSee(engine, characterName) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }

    const character = engine.deObject.characters[characterName];
    if (!character) {
        throw new Error(`Character ${characterName} not found.`);
    }

    const characterState = engine.deObject.stateFor[characterName];
    if (!characterState) {
        throw new Error(`Character state for ${characterName} not found.`);
    }

    const location = engine.deObject.world.locations[characterState.location];
    if (!location) {
        throw new Error(`Location ${characterState.location} not found.`);
    }

    const locationSlot = location.slots[characterState.locationSlot];
    if (!locationSlot) {
        throw new Error(`Location slot ${characterState.locationSlot} not found in location ${characterState.location}.`);
    }

    /**
     * @type {string[]}
     */
    const cheapList = [];

    // TODO add places where character can go, fit, etc...

    const slotNames = Object.keys(location.slots);
    let noItemsInAnySlot = true;
    for (const slotName of slotNames) {
        const slot = location.slots[slotName];
        if (slot.items.length > 0) {
            noItemsInAnySlot = false;
            break;
        }
    }

    let finalDescription = `# Items at the current location (${characterState.location}):\n\n`;

    const carryingCapacity = getCharacterCarryingCapacity(engine, characterName);

    /**
     * @param {DEItem} item 
     */
    const getTagsForItem = (item) => {
        if (!engine.deObject) {
            throw new Error("DEngine not initialized");
        }
        const tags = [];
        if (item.consumableProperties) {
            tags.push("edible");
        }
        if (item.containerProperties) {
            tags.push("container");
        }
        if (item.carriableProperties?.fullyProtectsFromWeathers?.length) {
            tags.push(`carrying this protects from weather (full): ${item.carriableProperties.fullyProtectsFromWeathers.join(", ")}`);
        }
        if (item.carriableProperties?.partiallyProtectsFromWeathers?.length) {
            tags.push(`carrying this protects from weather (partial): ${item.carriableProperties.partiallyProtectsFromWeathers.join(", ")}`);
        }
        if (item.carriableProperties?.negativelyExposesToWeathers?.length) {
            tags.push(`carrying this exposes to weather: ${item.carriableProperties.negativelyExposesToWeathers.join(", ")}`);
        }
        if (item.wearableProperties?.fullyProtectsFromWeathers?.length) {
            tags.push(`wearing this protects from weather (full): ${item.wearableProperties.fullyProtectsFromWeathers.join(", ")}`);
        }
        if (item.wearableProperties?.partiallyProtectsFromWeathers?.length) {
            tags.push(`wearing this protects from weather (partial): ${item.wearableProperties.partiallyProtectsFromWeathers.join(", ")}`);
        }
        if (item.wearableProperties?.negativelyExposesToWeathers?.length) {
            tags.push(`wearing this exposes to weather: ${item.wearableProperties.negativelyExposesToWeathers.join(", ")}`);
        }

        const realItemWeight = getItemWeight(engine, item);
        const realItemVolume = getItemVolume(engine, item);
        if (character.carryingCapacityKg < item.weightKg) {
            tags.push(`too heavy for ${character.name}`);
        } else if (character.carryingCapacityLiters < item.volumeLiters) {
            tags.push(`too big for ${character.name} to carry`);
        } else if (character.carryingCapacityKg < realItemWeight.singularWeight) {
            if (realItemWeight.allCharactersInvolved.length) {
                tags.push(`too heavy for ${character.name} (contents include ${engine.deObject.functions.format_and(engine.deObject, null, realItemWeight.allCharactersInvolved)})`);
            } else {
                tags.push(`too heavy for ${character.name} (due to contents)`);
            }
        } else if (character.carryingCapacityLiters < realItemVolume.singularVolume) {
            if (realItemVolume.allCharactersInvolved.length) {
                tags.push(`too big for ${character.name} to carry (contents include ${engine.deObject.functions.format_and(engine.deObject, null, realItemVolume.allCharactersInvolved)})`);
            } else {
                tags.push(`too big for ${character.name} to carry (due to contents)`);
            }
        } else if (carryingCapacity.carryingCapacityKg < item.weightKg || carryingCapacity.carryingCapacityKg < realItemWeight.singularWeight) {
            tags.push(`too heavy for ${character.name} (with current load)`);
        } else if (carryingCapacity.carryingCapacityLiters < item.volumeLiters || carryingCapacity.carryingCapacityLiters < realItemVolume.singularVolume) {
            tags.push(`too big for ${character.name} to carry (with current load)`);
        } else {
            if (realItemWeight.singularWeight >= character.carryingCapacityKg * 0.75) {
                tags.push(`heavy for ${character.name} but can still carry`);
            } else if (realItemVolume.singularVolume >= character.carryingCapacityLiters * 0.75) {
                tags.push(`bulky for ${character.name} but can still carry`);
            } else if (realItemWeight.singularWeight >= character.carryingCapacityKg * 0.5) {
                tags.push(`somewhat heavy for ${character.name} but can still carry`);
            } else if (realItemVolume.singularVolume >= character.carryingCapacityLiters * 0.5) {
                tags.push(`somewhat bulky for ${character.name} but can still carry`);
            } else {
                tags.push(`easy for ${character.name} to carry`);
            }
        }

        if (item.wearableProperties) {
            const fitment = getWearableFitment(engine, item, characterName);
            if (fitment.shouldBreak) {
                tags.push(`too tight for ${character.name}, would break`);
            } else if (fitment.shouldFallDown) {
                tags.push(`too loose for ${character.name}`);
            } else {
                tags.push(`would fit ${character.name} ${fitment.fitment.replace("fits ", "").replace(/,\s/g, " ")}`);
            }
        }

        return tags;
    }

    /**
     * @param {DEItem} item 
     * @returns {boolean}
     */
    const isCharacterInsideOrOnTopItem = (item) => {
        if (item.ontopCharacters && item.ontopCharacters.includes(characterName) || item.containingCharacters && item.containingCharacters.includes(characterName)) {
            return true;
        }

        return item.containing.some(isCharacterInsideOrOnTopItem) || item.ontop.some(isCharacterInsideOrOnTopItem);
    }

    /**
     * @param {DEItem} item 
     * @returns {boolean}
     */
    const isCharacterInsideItem = (item) => {
        if (item.containingCharacters && item.containingCharacters.includes(characterName)) {
            return true;
        }

        return item.containing.some(isCharacterInsideOrOnTopItem);
    }

    /**
     * @param {string} space
     * @param {boolean} charHasLineOfSight
     * @param {DEItem} item
     * @param {string | null} carriedByChar
     */
    const listItems = (space, charHasLineOfSight, item, carriedByChar) => {
        const tags = getTagsForItem(item);
        finalDescription += `${space}- ${item.owner ? item.owner + "'s " : ""}${item.name}${item.amount >= 2 || item.amount === 0 ? " x" + item.amount : ""}\n`;
        if (tags.length > 0) {
            finalDescription += `${space}  [${tags.join(", ")}]\n`;
        }
        finalDescription += `${space}  Description: ${item.description}\n`;
        if (item.containing.length) {
            const charIsInside = isCharacterInsideItem(item);
            const haveLineOfSightSoCharKnowsWhatIsInside = (charHasLineOfSight && item.canSeeContentsFromOutside) || charIsInside;

            if ((charHasLineOfSight && item.canSeeContentsFromOutside)) {
                finalDescription += `${space}  ${character.name} can see the following contents:\n`;
            } else if (charIsInside) {
                finalDescription += `${space}  ${character.name} can see the following contents (from the inside):\n`;
            } else if (item.owner === characterName) {
                finalDescription += `${space}  ${character.name} cannot see but knows ${item.name} contains (as the owner):\n`;
            } else if (carriedByChar === characterName) {
                finalDescription += `${space}  ${character.name} cannot see but can feel more or less what ${item.name} contains (as the carrier):\n`;
            } else {
                finalDescription += `${space}  ${character.name} cannot see what ${item.name} contains:\n`;
            }

            for (const containedItem of item.containing) {
                listItems(space + "  ", haveLineOfSightSoCharKnowsWhatIsInside, containedItem, carriedByChar);
            }
        }
        for (const ontopItem of item.ontop) {
            listItems(space + "  ", charHasLineOfSight, ontopItem, carriedByChar);
        }
        if (item.containingCharacters.length !== 0) {
            finalDescription += `${space}  Characters inside:\n`;
        }
        for (const containedCharacters of item.containingCharacters) {
            finalDescription += `${space}  - ${containedCharacters}\n`;
        }
        if (item.ontopCharacters.length !== 0) {
            finalDescription += `${space}  Characters on top:\n`;
        }
        for (const ontopCharacters of item.ontopCharacters) {
            finalDescription += `${space}  - ${ontopCharacters}\n`;
        }
        cheapList.push(`${item.owner ? item.owner + "'s " : ""}${item.name}${item.amount >= 2 || item.amount === 0 ? " x" + item.amount : ""}`);
    }

    if (noItemsInAnySlot) {
        finalDescription += "No items available at the location.\n\n";
    } else {
        for (const slotName of slotNames) {
            const slot = location.slots[slotName];
            finalDescription += `## Items at the ${slotName}:\n\n`;
            for (const item of slot.items) {
                listItems("", true, item, null);
            }
            finalDescription += "\n";
        }
    }

    // now let's check each character excluding our own for now
    for (const otherCharName in engine.deObject.stateFor) {
        if (otherCharName === characterName) continue;
        const otherCharState = engine.deObject.stateFor[otherCharName];
        if (otherCharState.deadEnded) continue;
        if (otherCharState.location === characterState.location) {
            finalDescription += `# Character: ${otherCharName}:\n\n`;

            const bondToOtherChar = engine.deObject.social.bonds[characterName].active.find(b => b.towards === otherCharName) || engine.deObject.social.bonds[characterName].ex.find(b => b.towards === otherCharName);
            if (!bondToOtherChar) {
                finalDescription += `${otherCharName} is a complete stranger to ${characterName}, ${characterName} does not know their name or any details about them.\n\n`;
            } else if (!bondToOtherChar.knowsName && bondToOtherChar.stranger) {
                finalDescription += `${otherCharName} is a stranger to ${characterName}, ${characterName} does not know their name.\n\n`;
            } else if (!bondToOtherChar.knowsName) {
                finalDescription += `${otherCharName} is an acquaintance to ${characterName}, but ${characterName} does not know their name!\n\n`;
            } else if (bondToOtherChar.stranger) {
                finalDescription += `${otherCharName} is a stranger to ${characterName}, but ${characterName} knows their name and some details about them.\n\n`;
            } else {
                finalDescription += `${otherCharName} is known to ${characterName}, ${characterName} knows their name and many details about them.\n\n`;
            }

            // how many times bigger/smaller is the other character compared to the character
            const otherCharacter = engine.deObject.characters[otherCharName];
            const ratioByHeight = character.heightCm / otherCharacter.heightCm;
            const reverseRatioByHeight = otherCharacter.heightCm / character.heightCm;
            if (ratioByHeight >= 100) {
                finalDescription += `${otherCharName} is absurdly tiny compared to ${characterName} who is hundreds of times taller.\n\n`;
            } else if (ratioByHeight >= 10) {
                finalDescription += `${otherCharName} is very small compared to ${characterName} who is at least 10 times taller.\n\n`;
            } else if (ratioByHeight >= 5) {
                finalDescription += `${otherCharName} is small compared to ${characterName} who is at least 5 times taller.\n\n`;
            } else if (ratioByHeight >= 4) {
                finalDescription += `${otherCharName} is small compared to ${characterName} who is at least 4 times taller.\n\n`;
            } else if (ratioByHeight >= 3) {
                finalDescription += `${otherCharName} is small compared to ${characterName} who is at least 3 times taller.\n\n`;
            } else if (ratioByHeight >= 2) {
                finalDescription += `${otherCharName} is somewhat small compared to ${characterName} who is at least double their height.\n\n`;
            } else if (ratioByHeight >= 1.5) {
                finalDescription += `${otherCharName} is somewhat shorter compared to ${characterName} who is at least 1.5 times their height.\n\n`;
            } else if (ratioByHeight >= 1.25) {
                finalDescription += `${otherCharName} is slightly shorter compared to ${characterName} who is at least 1.25 times their height.\n\n`;
            } else if (ratioByHeight >= 1.1) {
                finalDescription += `${otherCharName} is a bit shorter compared to ${characterName} who is slightly taller.\n\n`;
            } else if (ratioByHeight >= 0.95) {
                finalDescription += `${otherCharName} is about the same height as ${characterName}.\n\n`;
            } else if (ratioByHeight >= 0.8) {
                finalDescription += `${otherCharName} is a bit taller compared to ${characterName} who is slightly shorter.\n\n`;
            } else if (reverseRatioByHeight >= 100) {
                finalDescription += `${otherCharName} is absurdly tall compared to ${characterName} who is hundreds of times shorter.\n\n`;
            } else if (reverseRatioByHeight >= 10) {
                finalDescription += `${otherCharName} is very tall compared to ${characterName} who is at least 10 times shorter.\n\n`;
            } else if (reverseRatioByHeight >= 5) {
                finalDescription += `${otherCharName} is tall compared to ${characterName} who is at least 5 times shorter.\n\n`;
            } else if (reverseRatioByHeight >= 4) {
                finalDescription += `${otherCharName} is tall compared to ${characterName} who is at least 4 times shorter.\n\n`;
            } else if (reverseRatioByHeight >= 3) {
                finalDescription += `${otherCharName} is tall compared to ${characterName} who is at least 3 times shorter.\n\n`;
            } else if (reverseRatioByHeight >= 2) {
                finalDescription += `${otherCharName} is somewhat tall compared to ${characterName} who is at least double their height.\n\n`;
            } else if (reverseRatioByHeight >= 1.5) {
                finalDescription += `${otherCharName} is somewhat taller compared to ${characterName} who is at least 1.5 times their height.\n\n`;
            } else if (reverseRatioByHeight >= 1.25) {
                finalDescription += `${otherCharName} is slightly taller compared to ${characterName} who is at least 1.25 times their height.\n\n`;
            } else if (reverseRatioByHeight >= 1.1) {
                finalDescription += `${otherCharName} is a bit taller compared to ${characterName} who is slightly shorter.\n\n`;
            } else if (reverseRatioByHeight >= 0.95) {
                finalDescription += `${otherCharName} is about the same height as ${characterName}.\n\n`;
            } else {
                finalDescription += `${otherCharName} is a bit shorter compared to ${characterName} who is slightly taller.\n\n`;
            }

            const ratioByWeight = character.weightKg / otherCharacter.weightKg;
            const reverseRatioByWeight = otherCharacter.weightKg / character.weightKg;
            if (ratioByWeight >= 100) {
                finalDescription += `${otherCharName} is absurdly small compared to ${characterName} who is hundreds of times larger.\n\n`;
            } else if (ratioByWeight >= 10) {
                finalDescription += `${otherCharName} is very small compared to ${characterName} who is at least 10 times larger.\n\n`;
            } else if (ratioByWeight >= 5) {
                finalDescription += `${otherCharName} is small compared to ${characterName} who is at least 5 times larger.\n\n`;
            } else if (ratioByWeight >= 4) {
                finalDescription += `${otherCharName} is small compared to ${characterName} who is at least 4 times larger.\n\n`;
            } else if (ratioByWeight >= 3) {
                finalDescription += `${otherCharName} is somewhat small compared to ${characterName} who is at least 3 times their size.\n\n`;
            } else if (ratioByWeight >= 2) {
                finalDescription += `${otherCharName} is somewhat small compared to ${characterName} who is at least double their size.\n\n`;
            } else if (ratioByWeight >= 1.5) {
                finalDescription += `${otherCharName} is somewhat small compared to ${characterName} who is at least 1.5 times their size.\n\n`;
            } else if (ratioByWeight >= 1.25) {
                finalDescription += `${otherCharName} is slightly small compared to ${characterName} who is at least 1.25 times their size.\n\n`;
            } else if (ratioByWeight >= 1.1) {
                finalDescription += `${otherCharName} is a bit small compared to ${characterName} who is slightly larger.\n\n`;
            } else if (ratioByWeight >= 0.95) {
                finalDescription += `${otherCharName} is about the same size as ${characterName}.\n\n`;
            } else if (ratioByWeight >= 0.8) {
                finalDescription += `${otherCharName} is a bit larger compared to ${characterName} who is slightly smaller.\n\n`;
            } else if (reverseRatioByWeight >= 100) {
                finalDescription += `${otherCharName} is absurdly large compared to ${characterName} who is hundreds of times smaller.\n\n`;
            } else if (reverseRatioByWeight >= 10) {
                finalDescription += `${otherCharName} is very large compared to ${characterName} who is at least 10 times smaller.\n\n`;
            } else if (reverseRatioByWeight >= 5) {
                finalDescription += `${otherCharName} is large compared to ${characterName} who is at least 5 times smaller.\n\n`;
            } else if (reverseRatioByWeight >= 4) {
                finalDescription += `${otherCharName} is large compared to ${characterName} who is at least 4 times smaller.\n\n`;
            } else if (reverseRatioByWeight >= 3) {
                finalDescription += `${otherCharName} is somewhat large compared to ${characterName} who is at least 3 times smaller.\n\n`;
            } else if (reverseRatioByWeight >= 2) {
                finalDescription += `${otherCharName} is somewhat large compared to ${characterName} who is at least double their size.\n\n`;
            } else if (reverseRatioByWeight >= 1.5) {
                finalDescription += `${otherCharName} is somewhat large compared to ${characterName} who is at least 1.5 times their size.\n\n`;
            } else if (reverseRatioByWeight >= 1.25) {
                finalDescription += `${otherCharName} is slightly large compared to ${characterName} who is at least 1.25 times their size.\n\n`;
            } else if (reverseRatioByWeight >= 1.1) {
                finalDescription += `${otherCharName} is a bit large compared to ${characterName} who is slightly smaller.\n\n`;
            } else if (reverseRatioByWeight >= 0.95) {
                finalDescription += `${otherCharName} is about the same size as ${characterName}.\n\n`;
            } else {
                finalDescription += `${otherCharName} is a bit smaller compared to ${characterName} who is slightly larger.\n\n`;
            }

            const otherCharacterWeight = getCharacterWeight(engine, otherCharName);
            const otherCharacterVolume = getCharacterVolume(engine, otherCharName);

            if (character.carryingCapacityKg < otherCharacter.weightKg) {
                finalDescription += `${otherCharName} is too heavy for ${characterName} to carry.\n\n`;
            } else if (character.carryingCapacityLiters < otherCharacter.weightKg) {
                finalDescription += `${otherCharName} is too big for ${characterName} to carry.\n\n`;
            } else if (character.carryingCapacityKg < otherCharacterWeight.weight) {
                finalDescription += `${otherCharName} is too heavy for ${characterName} to carry (considering what ${otherCharName} is currently wearing and carrying).\n\n`;
            } else if (character.carryingCapacityLiters < otherCharacterVolume.volume || carryingCapacity.carryingCapacityLiters < otherCharacterWeight.weight) {
                finalDescription += `${otherCharName} is too big for ${characterName} to carry (considering what ${otherCharName} is currently wearing and carrying).\n\n`;
            } else if (carryingCapacity.carryingCapacityKg < otherCharacterWeight.weight || carryingCapacity.carryingCapacityKg < otherCharacterWeight.weight) {
                finalDescription += `${otherCharName} is too heavy for ${characterName} to carry (with current load).\n\n`;
            } else {
                if (otherCharacterWeight.weight >= character.carryingCapacityKg * 0.75) {
                    finalDescription += `${otherCharName} can be carried by ${characterName} with some effort.\n\n`;
                } else if (otherCharacterVolume.volume >= character.carryingCapacityLiters * 0.75) {
                    finalDescription += `${otherCharName} can be carried by ${characterName} but is quite bulky.\n\n`;
                } else if (otherCharacterWeight.weight >= character.carryingCapacityKg * 0.5) {
                    finalDescription += `${otherCharName} can be carried by ${characterName} but is somewhat heavy.\n\n`;
                } else if (otherCharacterVolume.volume >= character.carryingCapacityLiters * 0.5) {
                    finalDescription += `${otherCharName} can be carried by ${characterName} but is somewhat bulky.\n\n`;
                } else {
                    finalDescription += `${otherCharName} can be carried by ${characterName}.\n\n`;
                }
            }

            const externalDescription = await getExternalDescriptionOfCharacter(engine, otherCharName, true, false);
            if (externalDescription) {
                finalDescription += `## ${otherCharName} Appearance:\n\n${externalDescription}\n\n`;
            }

            finalDescription += `## Items worn by ${otherCharName}:\n\n`;
            if (otherCharState.wearing.length === 0) {
                finalDescription += `${otherCharName} Is currently naked.\n\n`;
            } else {
                for (const item of otherCharState.wearing) {
                    listItems("", true, item, otherCharName);
                }
                finalDescription += `\n`;
            }
            const carriedChars = getListOfCarriedCharactersByCharacter(engine, otherCharName);
            if (carriedChars.length > 0) {
                finalDescription += `## Characters carried by ${otherCharName}:\n\n`;
                for (const carriedChar of carriedChars) {
                    if (carriedChar.itemPathEnd === "containingCharacters" && carriedChar.itemPath) {
                        finalDescription += `${otherCharName} is carrying ${carriedChar.carriedName} ${locationPathToMessage(engine, otherCharName, otherCharState.location, [...carriedChar.itemPath, carriedChar.itemPathEnd], true)}.\n\n`;
                    } else if (carriedChar.itemPathEnd === "ontopCharacters" && carriedChar.itemPath) {
                        finalDescription += `${otherCharName} is carrying ${carriedChar.carriedName} ${locationPathToMessage(engine, otherCharName, otherCharState.location, [...carriedChar.itemPath, carriedChar.itemPathEnd], true)}.\n\n`;
                    } else {
                        finalDescription += `${otherCharName} is carrying ${carriedChar.carriedName}.\n\n`;
                    }
                }
            }
            finalDescription += `## Items carried by ${otherCharName}:\n\n`;
            if (otherCharState.carrying.length === 0) {
                finalDescription += `No items carried by ${otherCharName}.\n\n`;
            } else {
                for (const item of otherCharState.carrying) {
                    listItems("", true, item, otherCharName);
                }
                finalDescription += `\n`;
            }

            const exactLocation = getCharacterExactLocation(engine, otherCharName);
            if (exactLocation.beingCarriedBy) {
                finalDescription += `## ${otherCharName} is being carried by another character:\n\n`;
                finalDescription += `${otherCharName} is being carried by character: ${exactLocation.beingCarriedBy}.\n\n`;
            }

            if (exactLocation.itemPathEnd === "containingCharacters" && exactLocation.itemPath) {
                finalDescription += `## ${otherCharName} is inside an item:\n\n`;
                finalDescription += `${otherCharName} is ${locationPathToMessage(engine, otherCharName, otherCharState.location, [...exactLocation.itemPath, exactLocation.itemPathEnd])}.\n\n`;
            }

            if (exactLocation.itemPathEnd === "ontopCharacters" && exactLocation.itemPath) {
                finalDescription += `## ${otherCharName} is on top of an item:\n\n`;
                finalDescription += `${otherCharName} is ${locationPathToMessage(engine, otherCharName, otherCharState.location, [...exactLocation.itemPath, exactLocation.itemPathEnd])}.\n\n`;
            }
        }
    }

    // now let's do our own character
    finalDescription += `# Character ${characterName} (our character)\n\n## Items worn by ${characterName}:\n\n`;
    if (characterState.wearing.length === 0) {
        finalDescription += `${characterName} Is currently naked.\n\n`;
    } else {
        for (const item of characterState.wearing) {
            listItems("", true, item, characterName);
        }
        finalDescription += `\n`;
    }

    const carriedChars = getListOfCarriedCharactersByCharacter(engine, characterName);
    if (carriedChars.length > 0) {
        finalDescription += `## Characters carried by ${characterName}:\n\n`;
        for (const carriedChar of carriedChars) {
            if (carriedChar.itemPathEnd === "containingCharacters" && carriedChar.itemPath) {
                finalDescription += `${characterName} is carrying ${carriedChar.carriedName} ${locationPathToMessage(engine, characterName, characterState.location, [...carriedChar.itemPath, carriedChar.itemPathEnd], true)}.\n\n`;
            } else if (carriedChar.itemPathEnd === "ontopCharacters" && carriedChar.itemPath) {
                finalDescription += `${characterName} is carrying ${carriedChar.carriedName} ${locationPathToMessage(engine, characterName, characterState.location, [...carriedChar.itemPath, carriedChar.itemPathEnd], true)}.\n\n`;
            } else {
                finalDescription += `${characterName} is carrying ${carriedChar.carriedName}.\n\n`;
            }
        }
    }

    finalDescription += `## Items carried by ${characterName}:\n\n`;
    if (characterState.carrying.length === 0) {
        finalDescription += `No items or characters carried by ${characterName}.\n\n`;
    } else {
        for (const item of characterState.carrying) {
            listItems("", true, item, characterName);
        }
        finalDescription += `\n`;
    }

    const exactLocation = getCharacterExactLocation(engine, characterName);
    if (exactLocation.beingCarriedBy) {
        finalDescription += `## ${characterName} is being carried by another character:\n\n`;
        finalDescription += `${characterName} is being carried by character: ${exactLocation.beingCarriedBy}.\n\n`;
    }

    if (exactLocation.itemPathEnd === "containingCharacters" && exactLocation.itemPath) {
        finalDescription += `## ${characterName} is inside an item:\n\n`;
        finalDescription += `${characterName} is ${locationPathToMessage(engine, characterName, characterState.location, [...exactLocation.itemPath, exactLocation.itemPathEnd])}.\n\n`;
    }

    if (exactLocation.itemPathEnd === "ontopCharacters" && exactLocation.itemPath) {
        finalDescription += `## ${characterName} is on top of an item:\n\n`;
        finalDescription += `${characterName} is ${locationPathToMessage(engine, characterName, characterState.location, [...exactLocation.itemPath, exactLocation.itemPathEnd])}.\n\n`;
    }

    const characterPowerLevel = getPowerLevel(engine, characterName);

    finalDescription += `# ${characterName} Power Level Interactions:\n\n`;

    const characterTier = character.tier.replace("_", " ") + " tier";
    for (const otherCharName in engine.deObject.stateFor) {
        if (otherCharName === characterName) continue;
        const otherCharState = engine.deObject.stateFor[otherCharName];
        if (otherCharState.deadEnded) {
            continue;
        }
        const otherChar = engine.deObject.characters[otherCharName];
        if (otherCharState.location === characterState.location) {
            const otherCharacterPowerLevel = getPowerLevel(engine, otherCharName);
            const powerLevelRatio = characterPowerLevel / otherCharacterPowerLevel;
            const reversePowerLevelRatio = otherCharacterPowerLevel / characterPowerLevel;
            const otherCharacterTier = engine.deObject.characters[otherCharName].tier.replace("_", " ") + " tier";
            if (powerLevelRatio >= 100) {
                finalDescription += `- ${characterName} (${characterTier}) is overwhelmingly more powerful than ${otherCharName} (${otherCharacterTier}), who is a complete non-threat.\n`;
            } else if (powerLevelRatio >= 10) {
                finalDescription += `- ${characterName} (${characterTier}) is much more powerful than ${otherCharName} (${otherCharacterTier}), who is not a threat.\n`;
            } else if (powerLevelRatio >= 5) {
                finalDescription += `- ${characterName} (${characterTier}) is more powerful than ${otherCharName} (${otherCharacterTier}), who is a minor threat at best.\n`;
            } else if (powerLevelRatio >= 2) {
                finalDescription += `- ${characterName} (${characterTier}) is somewhat more powerful than ${otherCharName} (${otherCharacterTier}), who could pose a small threat.\n`;
            } else if (powerLevelRatio >= 1.5) {
                finalDescription += `- ${characterName} (${characterTier}) is slightly more powerful than ${otherCharName} (${otherCharacterTier}), who could pose a minor threat.\n`;
            } else if (powerLevelRatio >= 1.25) {
                finalDescription += `- ${characterName} (${characterTier}) is a bit more powerful than ${otherCharName} (${otherCharacterTier}), who could pose a minor threat.\n`;
            } else if (powerLevelRatio >= 0.95) {
                finalDescription += `- ${characterName} (${characterTier}) and ${otherCharName} (${otherCharacterTier}) are about equally powerful, and could pose a threat to each other.\n`;
            } else if (reversePowerLevelRatio >= 100) {
                finalDescription += `- ${otherCharName} (${otherCharacterTier}) is overwhelmingly more powerful than ${characterName} (${characterTier}), who is a complete non-threat.\n`;
            } else if (reversePowerLevelRatio >= 10) {
                finalDescription += `- ${otherCharName} (${otherCharacterTier}) is much more powerful than ${characterName} (${characterTier}), who is not a threat.\n`;
            } else if (reversePowerLevelRatio >= 5) {
                finalDescription += `- ${otherCharName} (${otherCharacterTier}) is more powerful than ${characterName} (${characterTier}), who is a minor threat at best.\n`;
            } else if (reversePowerLevelRatio >= 2) {
                finalDescription += `- ${otherCharName} (${otherCharacterTier}) is somewhat more powerful than ${characterName} (${characterTier}), who could pose a small threat.\n`;
            } else if (reversePowerLevelRatio >= 1.5) {
                finalDescription += `- ${otherCharName} (${otherCharacterTier}) is slightly more powerful than ${characterName} (${characterTier}), who could pose a minor threat.\n`;
            } else if (reversePowerLevelRatio >= 1.25) {
                finalDescription += `- ${otherCharName} (${otherCharacterTier}) is a bit more powerful than ${characterName} (${characterTier}), who could pose a minor threat.\n`;
            } else {
                finalDescription += `- ${otherCharName} (${otherCharacterTier}) and ${characterName} (${characterTier}) are about equally powerful, and could pose a threat to each other.\n`;
            }

            const whatCanTheySolo = getWhatCanSolo(otherChar.tier, otherChar.tierValue);
            if (otherChar.tierValue <= 10) {
                finalDescription += `- ${otherCharName} is a very low '${otherCharacterTier}' and has seen better days, ${whatCanTheySolo}\n`;
            } else if (otherChar.tierValue <= 20) {
                finalDescription += `- ${otherCharName} is a low '${otherCharacterTier}' and has seen better days, ${whatCanTheySolo}\n`;
            } else if (otherChar.tierValue <= 50) {
                finalDescription += `- ${otherCharName} is a mid '${otherCharacterTier}', ${whatCanTheySolo}\n`;
            } else if (otherChar.tierValue <= 70) {
                finalDescription += `- ${otherCharName} is a high '${otherCharacterTier}', ${whatCanTheySolo}\n`;
            } else if (otherChar.tierValue <= 90) {
                finalDescription += `- ${otherCharName} is a top '${otherCharacterTier}', ${whatCanTheySolo}\n`;
            } else {
                finalDescription += `- ${otherCharName} embodies the perfection of '${otherCharacterTier}', ${whatCanTheySolo}\n`;
            }
        }
    }

    const whatCanTheySolo = getWhatCanSolo(character.tier, character.tierValue);
    if (character.tierValue <= 10) {
        finalDescription += `- ${characterName} is a very low '${characterTier}' and has seen better days, ${whatCanTheySolo}`;
    } else if (character.tierValue <= 20) {
        finalDescription += `- ${characterName} is a low '${characterTier}' and has seen better days, ${whatCanTheySolo}`;
    } else if (character.tierValue <= 50) {
        finalDescription += `- ${characterName} is a mid '${characterTier}', ${whatCanTheySolo}`;
    } else if (character.tierValue <= 70) {
        finalDescription += `- ${characterName} is a high '${characterTier}', ${whatCanTheySolo}`;
    } else if (character.tierValue <= 90) {
        finalDescription += `- ${characterName} is a top '${characterTier}', ${whatCanTheySolo}`;
    } else {
        finalDescription += `- ${characterName} embodies the perfection of '${characterTier}', ${whatCanTheySolo}`;
    }

    const surroundingChars = getSurroundingCharacters(engine, characterName);
    const deadBodies = [surroundingChars.deadNonStrangers, surroundingChars.deadTotalStrangers].flat();
    if (deadBodies.length > 0) {
        finalDescription += `\n\n# Dead bodies at the location:\n\n`;
        for (const deadBody of deadBodies) {
            const externalDescription = await getExternalDescriptionOfCharacter(engine, deadBody, true, false);
            finalDescription += `- ${deadBody} (Deceased): ${externalDescription}\n`;
        }
    }

    return {
        everything: finalDescription,
        cheapList,
    }
}

/**
 * @param {DEngine} engine
 * @param {string} characterName 
 */
export async function getInternalDescriptionOfCharacter(engine, characterName) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }

    const character = engine.deObject.characters[characterName];
    if (!character) {
        throw new Error(`Character ${characterName} not found.`);
    }

    const characterState = engine.deObject.stateFor[characterName];
    if (!characterState) {
        throw new Error(`Character state for ${characterName} not found.`);
    }

    let general = typeof character.general === "string" ? character.general : await character.general(engine.deObject, {
        char: character,
    });

    for (const injectable of Object.values(character.generalCharacterDescriptionInjection)) {
        const injectableV = typeof injectable === "string" ? injectable : await injectable(engine.deObject, {
            char: character,
        });
        if (injectableV) {
            if (!general.endsWith("\n\n")) {
                general += "\n\n";
            }
            general += injectableV;
        }
    }

    let maxStateDominance = 0;
    for (const state of characterState.states) {
        const stateInfo = character.states[state.state];
        let dominanceOfThisState = stateInfo.dominance;
        if (state.relieving && typeof stateInfo.dominanceAfterRelief === "number") {
            dominanceOfThisState = stateInfo.dominanceAfterRelief;
        }
        if (dominanceOfThisState > maxStateDominance) {
            maxStateDominance = dominanceOfThisState;
        }
    }

    /**
     * @type {string[]}
     */
    const statesDescriptions = [];
    /**
     * @type {string[]}
     */
    const stateInjections = [];
    /**
     * @type {Array<{
     *   applyingState: DEApplyingState | null,
     *   action: DEActionPromptInjectionWithIntensity | DEActionPromptInjection,
     *   stateInfo: DECharacterStateDefinition | null,
     * }>}
     */
    const actions = [];
    /**
    * @type {Array<{
    *   applyingState: DEApplyingState,
    *   stateInfo: DECharacterStateDefinition,
    * }>}
    */
    const activeStates = [];
    for (const injectable of Object.values(character.actionPromptInjection)) {
        actions.push({
            applyingState: null,
            action: injectable,
            stateInfo: null,
        });
    }
    for (const state of characterState.states) {
        const stateInfo = character.states[state.state];

        let dominanceOfThisState = stateInfo.dominance;
        if (state.relieving && typeof stateInfo.dominanceAfterRelief === "number") {
            dominanceOfThisState = stateInfo.dominanceAfterRelief;
        }

        if (dominanceOfThisState >= maxStateDominance || stateInfo.ignoreDominanceForActionPromptInjection) {
            const origin = state.relieving ? stateInfo.relievingActionPromptInjection : stateInfo.actionPromptInjection;
            if (origin) {
                for (const actionPromptInjectableKey in origin) {
                    const actionPromptInjectable = origin[actionPromptInjectableKey];
                    actions.push({
                        applyingState: state,
                        action: actionPromptInjectable,
                        stateInfo,
                    });
                }
            }
        }

        const stateNameForDescriptions = state.state.split("_").map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");

        if (dominanceOfThisState >= maxStateDominance || stateInfo.ignoreDominanceForStateInjection) {
            let stateDescriptionForInjection = "";
            if (!state.relieving) {
                if (stateInfo.behaviourType === "INTENSITY_EXPRESSIVE") {
                    if (state.intensity >= 1.5) {
                        stateDescriptionForInjection = `${character.name} is currently very ${stateNameForDescriptions}\n\n`;
                    } else if (state.intensity >= 2.5) {
                        stateDescriptionForInjection = `${character.name} is currently extremely ${stateNameForDescriptions}\n\n`;
                    } else if (state.intensity >= 3.5) {
                        stateDescriptionForInjection = `${character.name} is currently overwhelmingly ${stateNameForDescriptions}\n\n`;
                    } else {
                        stateDescriptionForInjection = `${character.name} is currently ${stateNameForDescriptions}\n\n`;
                    }
                } else if (stateInfo.behaviourType === "BINARY") {
                    stateDescriptionForInjection = `${character.name} is currently ${stateNameForDescriptions}\n\n`;
                }
            } else {
                if (stateInfo.behaviourType === "INTENSITY_EXPRESSIVE") {
                    if (state.intensity >= 2.5) {
                        stateDescriptionForInjection = `${character.name} is currently relieving from being ${stateNameForDescriptions}, nonetheless still very ${stateNameForDescriptions}\n\n`;
                    } else if (state.intensity >= 3.5) {
                        stateDescriptionForInjection = `${character.name} is currently relieving from being ${stateNameForDescriptions}, nonetheless still extremely ${stateNameForDescriptions}\n\n`;
                    } else {
                        stateDescriptionForInjection = `${character.name} is currently relieving from being ${stateNameForDescriptions}, nonetheless still ${stateNameForDescriptions}\n\n`;
                    }
                } else if (stateInfo.behaviourType === "BINARY") {
                    stateDescriptionForInjection = `${character.name} is currently relieving from being ${stateNameForDescriptions}, nonetheless still ${stateNameForDescriptions}\n\n`;
                }
            }

            const generalDescriptionOrigin = !state.relieving ? stateInfo.general : stateInfo.generalAfterRelief;
            if (generalDescriptionOrigin) {
                const generalDescription = typeof generalDescriptionOrigin === "string" ? generalDescriptionOrigin : await generalDescriptionOrigin(engine.deObject, {
                    char: character,
                    causants: state.causants || undefined,
                });
                const trimmed = generalDescription.trim();
                if (trimmed) {
                    stateDescriptionForInjection += trimmed;
                }
            }

            if (stateDescriptionForInjection) {
                stateInjections.push(stateDescriptionForInjection.trimEnd());
            }

            activeStates.push({
                applyingState: state,
                stateInfo,
            })
        }

        if (dominanceOfThisState < maxStateDominance && !stateInfo.ignoreDominanceWhenInjectedGeneralCharacterDescription) {
            continue;
        }

        let stateDescription = null;
        if (!state.relieving) {
            if (stateInfo.behaviourType === "INTENSITY_EXPRESSIVE") {
                if (state.intensity >= 1.5) {
                    stateDescription = `Very ${stateNameForDescriptions}`;
                } else if (state.intensity >= 2.5) {
                    stateDescription = `Extremely ${stateNameForDescriptions}`;
                } else if (state.intensity >= 3.5) {
                    stateDescription = `Overwhelmingly ${stateNameForDescriptions}`;
                } else {
                    stateDescription = `${stateNameForDescriptions}`;
                }
            } else if (stateInfo.behaviourType === "BINARY") {
                stateDescription = `${stateNameForDescriptions}`;
            }

            if (stateInfo.relievingGeneralCharacterDescriptionInjection) {
                const relievingInjection = typeof stateInfo.relievingGeneralCharacterDescriptionInjection === "string" ? stateInfo.relievingGeneralCharacterDescriptionInjection : (await stateInfo.relievingGeneralCharacterDescriptionInjection(engine.deObject, {
                    char: character,
                })).trim();
                if (relievingInjection) {
                    if (!general.endsWith("\n\n")) {
                        general += "\n\n";
                    }
                    general += relievingInjection;
                }
            }
        } else {
            if (stateInfo.behaviourType === "INTENSITY_EXPRESSIVE") {
                if (state.intensity >= 2.5) {
                    stateDescription = `Relieving from being ${stateNameForDescriptions}, nonetheless still Very ${stateNameForDescriptions}`;
                } else if (state.intensity >= 3.5) {
                    stateDescription = `Relieving from being ${stateNameForDescriptions}, nonetheless still Extremely ${stateNameForDescriptions}`;
                } else {
                    stateDescription = `Relieving from being ${stateNameForDescriptions}, nonetheless still ${stateNameForDescriptions}`;
                }
            } else if (stateInfo.behaviourType === "BINARY") {
                stateDescription = `Relieving from being ${stateNameForDescriptions}, nonetheless still ${stateNameForDescriptions}`;
            }

            if (stateInfo.generalCharacterDescriptionInjection) {
                const injection = typeof stateInfo.generalCharacterDescriptionInjection === "string" ? stateInfo.generalCharacterDescriptionInjection : (await stateInfo.generalCharacterDescriptionInjection(engine.deObject, {
                    char: character,
                })).trim();
                if (injection) {
                    if (!general.endsWith("\n\n")) {
                        general += "\n\n";
                    }
                    general += injection;
                }
            }
        }

        if (stateDescription) {
            statesDescriptions.push(stateDescription);
        }
    }

    const bonds = engine.deObject.social.bonds[characterName];

    /**
     * @type {string[]}
     */
    const relationships = [];

    for (const activeBond of bonds.active) {
        if (!character.bonds) {
            throw new Error(`Character ${characterName} has no bonds defined.`);
        }
        const bondDeclaration = character.bonds.declarations.find(bondDecl => bondDecl.strangerBond === activeBond.stranger && bondDecl.minBondLevel <= activeBond.bond && activeBond.bond < (bondDecl.maxBondLevel === 100 ? 200 : bondDecl.maxBondLevel) && bondDecl.min2BondLevel <= activeBond.bond2 && activeBond.bond2 < (bondDecl.max2BondLevel === 100 ? 200 : bondDecl.max2BondLevel));
        if (bondDeclaration) {
            let result = typeof bondDeclaration.description === "string" ? bondDeclaration.description : (await bondDeclaration.description(engine.deObject, {
                char: character,
                other: engine.deObject.characters[activeBond.towards],
                // TODO bond relationship
            })).trim();
            if (bondDeclaration.bondAdditionalDescription) {
                if (!result.endsWith(". ")) {
                    result += ". ";
                } else if (!result.endsWith(" ")) {
                    result += " ";
                }
                result += typeof bondDeclaration.bondAdditionalDescription === "string" ? bondDeclaration.bondAdditionalDescription : (await bondDeclaration.bondAdditionalDescription(engine.deObject, {
                    char: character,
                    other: engine.deObject.characters[activeBond.towards],
                    // TODO bond relationship
                })).trim();
            }

            if (!activeBond.knowsName && activeBond.stranger) {
                result += ` ${activeBond.towards} is a stranger to ${characterName}, ${characterName} does not know their name.`;
            } else if (!activeBond.knowsName) {
                result += ` ${activeBond.towards} is an acquaintance to ${characterName}, but ${characterName} does not know their name!`;
            } else if (activeBond.stranger) {
                result += ` ${activeBond.towards} is a stranger to ${characterName}, but ${characterName} knows their name and some details about them.`;
            } else {
                result += ` ${activeBond.towards} is known to ${characterName}, ${characterName} knows their name and many details about them.`;
            }

            relationships.push(result);

            if (bondDeclaration.generalCharacterDescriptionInjection) {
                const injection = typeof bondDeclaration.generalCharacterDescriptionInjection === "string" ? bondDeclaration.generalCharacterDescriptionInjection : (await bondDeclaration.generalCharacterDescriptionInjection(engine.deObject, {
                    char: character,
                    other: engine.deObject.characters[activeBond.towards],
                    // TODO bond relationship
                })).trim();
                if (injection) {
                    if (!general.endsWith("\n\n")) {
                        general += "\n\n";
                    }
                    general += injection;
                }
            }
        }
    }

    // ex bonds only inject system prompts, as they are not active relationships but ex-relationships
    // they may be mourning or have other effects on the character's mindset so only relevant to system prompt injections
    for (const exBond of bonds.ex) {
        if (!character.bonds) {
            throw new Error(`Character ${characterName} has no bonds defined.`);
        }
        const bondDeclaration = character.bonds.declarations.find(bondDecl => bondDecl.strangerBond === exBond.stranger && bondDecl.minBondLevel <= exBond.bond && exBond.bond < (bondDecl.maxBondLevel === 100 ? 200 : bondDecl.maxBondLevel) && bondDecl.min2BondLevel <= exBond.bond2 && exBond.bond2 < (bondDecl.max2BondLevel === 100 ? 200 : bondDecl.max2BondLevel));
        if (bondDeclaration) {
            if (bondDeclaration.generalCharacterDescriptionInjectionEx) {
                const injection = typeof bondDeclaration.generalCharacterDescriptionInjectionEx === "string" ? bondDeclaration.generalCharacterDescriptionInjectionEx : (await bondDeclaration.generalCharacterDescriptionInjectionEx(engine.deObject, {
                    char: character,
                    other: engine.deObject.characters[exBond.towards],
                    // TODO bond relationship
                })).trim();
                if (injection) {
                    if (!general.endsWith("\n\n")) {
                        general += "\n\n";
                    }
                    general += injection;
                }
            }
        }
    }

    // make final descriptions for total strangers for the standard stranger bond
    if (!character.bonds) {
        throw new Error(`Character ${characterName} has no bonds defined.`);
    }

    const surroundingChars = getSurroundingCharacters(engine, characterName);
    const strangerBondDeclaration = character.bonds.declarations.find(bondDecl => bondDecl.strangerBond === true && bondDecl.minBondLevel <= 0 && 0 < (bondDecl.maxBondLevel === 100 ? 200 : bondDecl.maxBondLevel) && bondDecl.min2BondLevel <= 0 && 0 < (bondDecl.max2BondLevel === 100 ? 200 : bondDecl.max2BondLevel));
    if (strangerBondDeclaration) {
        // these do apply to all the total strangers
        const allSurroundingTotalStrangers = surroundingChars.totalStrangers;
        for (const strangerName of allSurroundingTotalStrangers) {
            const strangerCharacter = engine.deObject.characters[strangerName];
            if (strangerCharacter) {
                let result = typeof strangerBondDeclaration.description === "string" ? strangerBondDeclaration.description : (await strangerBondDeclaration.description(engine.deObject, {
                    char: character,
                    other: strangerCharacter,
                    // TODO bond relationship
                })).trim();
                if (strangerBondDeclaration.bondAdditionalDescription) {
                    if (!result.endsWith(". ")) {
                        result += ". ";
                    } else if (!result.endsWith(" ")) {
                        result += " ";
                    }
                    result += typeof strangerBondDeclaration.bondAdditionalDescription === "string" ? strangerBondDeclaration.bondAdditionalDescription : (await strangerBondDeclaration.bondAdditionalDescription(engine.deObject, {
                        char: character,
                        other: strangerCharacter,
                        // TODO bond relationship
                    })).trim();
                }
                result += ` ${strangerName} is a total stranger to ${characterName} and ${characterName} does not know their name.`;
                relationships.push(result);
            }

            if (strangerBondDeclaration.generalCharacterDescriptionInjection) {
                const injection = typeof strangerBondDeclaration.generalCharacterDescriptionInjection === "string" ? strangerBondDeclaration.generalCharacterDescriptionInjection : (await strangerBondDeclaration.generalCharacterDescriptionInjection(engine.deObject, {
                    char: character,
                    other: strangerCharacter,
                    // TODO bond relationship
                })).trim();
                if (injection) {
                    if (!general.endsWith("\n\n")) {
                        general += "\n\n";
                    }
                    general += injection;
                }
            }
        }
    }

    return {
        general: general.trim(),
        expressiveStates: statesDescriptions,
        activeStates,
        relationships,
        stateDominance: maxStateDominance,
        actions,
        stateInjections,
    };
}

/**
 * @param {DECompleteCharacterReference} character 
 * @param {DESingleBondDescription} bond 
 */
export function getBondDeclarationFromBondDescription(character, bond) {
    if (!character.bonds || !character.bonds.declarations) {
        return null;
    }
    const bondDeclaration =
        character.bonds.declarations.find(bondDecl => bondDecl.strangerBond === bond.stranger && bondDecl.minBondLevel <= bond.bond && bond.bond < (bondDecl.maxBondLevel === 100 ? 200 : bondDecl.maxBondLevel) && bondDecl.min2BondLevel <= bond.bond2 && bond.bond2 < (bondDecl.max2BondLevel === 100 ? 200 : bondDecl.max2BondLevel));

    if (!bondDeclaration) {
        return null;
    }
    return bondDeclaration;
}

/**
 * 
 * @param {DEngine} engine 
 * @param {string} characterName 
 */
export async function getSysPromptForCharacter(engine, characterName) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    if (!engine.inferenceAdapter) {
        throw new Error("DEngine has no inference adapter defined");
    }
    const character = engine.deObject.characters[characterName];
    if (!character) {
        throw new Error(`Character ${characterName} not found.`);
    }

    const characterState = engine.deObject.stateFor[characterName];
    if (!characterState) {
        throw new Error(`No state found for character "${characterName}".`);
    }

    const externalDescription = await getExternalDescriptionOfCharacter(engine, characterName, true);
    const internalDescription = await getInternalDescriptionOfCharacter(engine, characterName);

    /**
     * @type {string|null}
     */
    let lore = null;

    if (engine.deObject.world.lore) {
        // @ts-ignore
        lore = typeof engine.deObject.world.lore === "string" ? engine.deObject.world.lore : await engine.deObject.world.lore(engine.deObject, {
            char: character,
        });
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
            const ruleText = typeof rule.rule === "string" ? rule.rule : (await rule.rule(engine.deObject, {
                char: character,
            })).trim();
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
            const ruleText = typeof rule.rule === "string" ? rule.rule : (await rule.rule(engine.deObject, {
                char: character,
            })).trim();
            if (ruleText.length > 0) {
                characterRules.push(ruleText);
            }
        }
    }

    // TODO move to inference adapter describeScenario soemthing
    let scenario = "";
    const currentLocation = engine.deObject.world.locations[engine.deObject.stateFor[characterName].location];
    if (currentLocation) {
        scenario = `## Location:\n\n${engine.deObject.stateFor[characterName].location}, ` + (typeof currentLocation.description === "string" ? currentLocation.description : await currentLocation.description(engine.deObject, {
            char: character,
        }));
    }
    const currentLocationSlot = currentLocation.slots[engine.deObject.stateFor[characterName].locationSlot];
    if (currentLocationSlot) {
        scenario += `\n\nSpecifically at the ${engine.deObject.stateFor[characterName].locationSlot} of ${engine.deObject.stateFor[characterName].location}, ` + (typeof currentLocationSlot.description === "string" ? currentLocationSlot.description : await currentLocationSlot.description(engine.deObject, {
            char: character,
        }));
    }

    scenario += `\n\n## Weather:\n\n${await whatIsWeatherLikeForCharacter(engine, characterName)}`;

    scenario += `\n\n## Current time and date in the world:\n\n${makeTimestamp(engine, engine.deObject.currentTime, false)}`;


    const sysprompt = engine.inferenceAdapter.buildSystemPromptForCharacter(
        character,
        internalDescription.general,
        externalDescription,
        internalDescription.relationships,
        internalDescription.expressiveStates,
        scenario,
        lore,
        interactingCharacters,
        characterRules,
        worldRules,
    );

    return {
        sysprompt,
        internalDescription,
        externalDescription,
        scenario,
        lore,
        interactingCharacters,
        characterRules,
        worldRules,
    };
}

/**
 * @param {DEngine} engine 
 * @param {string} characterName 
 * @returns 
 */
export async function whatIsWeatherLikeForCharacter(engine, characterName) {
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
    const isSheltered = await isCharacterShelteredFromWeather(engine, characterName, weatherThere, characterLocation, characterLocationSlot);
    if (isSheltered.fullySheltered) {
        const noEffectDescription = typeof location.currentWeatherNoEffectDescription === "string" ? location.currentWeatherNoEffectDescription : await location.currentWeatherNoEffectDescription(engine.deObject, { char: character });
        return `The current weather where "${characterName}" is (${characterLocation}, ${characterLocationSlot}) is "${weatherThere}". However, "${characterName}" is fully sheltered from its effects. ${isSheltered.reason || ""}, therefore ${noEffectDescription || "no weather effects apply to them."}`;
    } else if (isSheltered.partiallySheltered) {
        const partialEffectDescription = typeof location.currentWeatherPartialEffectDescription === "string" ? location.currentWeatherPartialEffectDescription : await location.currentWeatherPartialEffectDescription(engine.deObject, { char: character });
        return `The current weather where "${characterName}" is (${characterLocation}, ${characterLocationSlot}) is "${weatherThere}". "${characterName}" is partially sheltered from its effects. ${isSheltered.reason || ""}, therefore ${partialEffectDescription || "some weather effects may apply to them."}`;
    } else if (isSheltered.negativelyExposed) {
        const negativeEffectsDescription = typeof location.currentWeatherNegativelyExposedDescription === "string" ? location.currentWeatherNegativelyExposedDescription : await location.currentWeatherNegativelyExposedDescription(engine.deObject, { char: character });
        return `The current weather where "${characterName}" is (${characterLocation}, ${characterLocationSlot}) is "${weatherThere}". "${characterName}" is negatively exposed to its effects. ${isSheltered.reason || ""}, therefore ${negativeEffectsDescription || "strongly negative weather effects apply to them."}`;
    } else {
        const effectDescription = typeof location.currentWeatherFullEffectDescription === "string" ? location.currentWeatherFullEffectDescription : await location.currentWeatherFullEffectDescription(engine.deObject, { char: character });
        return `The current weather where "${characterName}" is (${characterLocation}, ${characterLocationSlot}) is "${weatherThere}". ${isSheltered.reason || ""}, therefore ${effectDescription || "all weather effects apply to them."}`;
    }
}

/**
 * Determines if a character is fully or partially sheltered from a certain weather condition
 * by their current location or surroundings, or by an item they are carrying or wearing.
 * @param {DEngine} engine
 * @param {string} characterName 
 * @param {string} weatherName
 * @param {string} locationName
 * @param {string} slotName
 */
export async function isCharacterShelteredFromWeather(engine, characterName, weatherName, locationName, slotName) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    const returnInformation = {
        fullySheltered: false,
        partiallySheltered: false,
        negativelyExposed: false,
        reason: `${characterName} is fully exposed to the weather condition "${weatherName}"`,
    }

    const weatherSystem = getWeatherSystemForLocationAndWeather(engine, locationName, weatherName);

    const character = engine.deObject.characters[characterName];
    if (!character) {
        throw new Error(`Character ${characterName} not found in world.`);
    }

    const locationInfo = engine.deObject.world.locations[locationName];
    if (!locationInfo) {
        throw new Error(`Location ${locationName} not found in world.`);
    }

    const slotInfo = locationInfo.slots[slotName];
    if (!slotInfo) {
        throw new Error(`Slot ${slotName} not found in location ${locationName}.`);
    }

    const characterState = engine.deObject.stateFor[characterName];
    if (!characterState) {
        throw new Error(`Character state for ${characterName} not found.`);
    }

    /**
     * @type {DEItem[]}
     */
    const potentiallyProtectingItemsCharacterIsInsideOf = getAllItemsCharacterIsInsideOf(engine, characterName);

    // FULLY PROTECTED CHECKS
    // check for location based sheltering
    if ((slotInfo.slotFullyBlocksWeather || locationInfo.locationFullyBlocksWeather).includes(weatherName)) {
        returnInformation.fullySheltered = true;
        returnInformation.reason = `The location "${locationName}" fully blocks the weather condition "${weatherName}"`;
        return returnInformation;
    }

    // check if an item the character is carrying or wearing provides full sheltering
    for (const item of characterState.wearing) {
        if (item.wearableProperties?.fullyProtectsFromWeathers?.includes(weatherName)) {
            returnInformation.fullySheltered = true;
            returnInformation.reason = `The item "${item.name}" worn by "${characterName}" fully protects from the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }
    for (const item of characterState.carrying) {
        if (item.carriableProperties?.fullyProtectsFromWeathers?.includes(weatherName)) {
            returnInformation.fullySheltered = true;
            returnInformation.reason = `The item "${item.name}" carried by "${characterName}" fully protects from the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }

    if (weatherSystem.fullyProtectedNaked) {
        returnInformation.fullySheltered = true;
        returnInformation.reason = `Because ${characterName} is naked ${characterName} is immune to the weather condition "${weatherName}"`;
        return returnInformation;
    }
    if (weatherSystem.fullyProtectingWornItems.length > 0) {
        for (const item of characterState.wearing) {
            if (weatherSystem.fullyProtectingWornItems.includes(item.name)) {
                returnInformation.fullySheltered = true;
                returnInformation.reason = `The item "${item.name}" worn by "${characterName}" fully protects from the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }
    }
    if (weatherSystem.fullyProtectingCarriedItems.length > 0) {
        for (const item of characterState.carrying) {
            if (weatherSystem.fullyProtectingCarriedItems.includes(item.name)) {
                returnInformation.fullySheltered = true;
                returnInformation.reason = `The item "${item.name}" carried by "${characterName}" fully protects from the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }
    }
    for (const potentialProtectingItem of potentiallyProtectingItemsCharacterIsInsideOf || []) {
        if (potentialProtectingItem.containerProperties?.fullyProtectsFromWeathers?.includes(weatherName)) {
            returnInformation.fullySheltered = true;
            returnInformation.reason = `The item "${potentialProtectingItem.name}" that "${characterName}" is inside of fully protects from the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }

    if (weatherSystem.fullyProtectingStates.length > 0) {
        for (const state of characterState.states) {
            if (weatherSystem.fullyProtectingStates.includes(state.state)) {
                returnInformation.fullySheltered = true;
                // TODO improve this description of the state
                returnInformation.reason = `Because "${characterName}" is in a state of "${state.state}", ${characterName} is immune to the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }
    }
    if (weatherSystem.fullyProtectedTemplate) {
        const hasFullProtect = typeof weatherSystem.fullyProtectedTemplate === "string" ? weatherSystem.fullyProtectedTemplate : await weatherSystem.fullyProtectedTemplate(engine.deObject, { char: character });
        if (hasFullProtect) {
            returnInformation.fullySheltered = true;
            returnInformation.reason = `Because ${hasFullProtect}, ${characterName} is immune to the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }

    // PARTIALLY PROTECTED CHECKS
    // check for location based sheltering
    if ((slotInfo.slotPartiallyBlocksWeather || locationInfo.locationPartiallyBlocksWeather).includes(weatherName)) {
        returnInformation.partiallySheltered = true;
        returnInformation.reason = `The location "${locationName}" partially blocks the weather condition "${weatherName}"`;
        return returnInformation;
    }

    //check if an item the character is carrying or wearing provides partial sheltering
    for (const item of characterState.wearing) {
        if (item.wearableProperties?.partiallyProtectsFromWeathers?.includes(weatherName)) {
            returnInformation.partiallySheltered = true;
            returnInformation.reason = `The item "${item.name}" worn by "${characterName}" partially protects from the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }
    for (const item of characterState.carrying) {
        if (item.carriableProperties?.partiallyProtectsFromWeathers?.includes(weatherName)) {
            returnInformation.partiallySheltered = true;
            returnInformation.reason = `The item "${item.name}" carried by "${characterName}" partially protects from the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }
    if (weatherSystem.partiallyProtectedNaked) {
        const isNaked = characterState.wearing.filter(item => item.wearableProperties?.coversTopNakedness || item.wearableProperties?.coversBottomNakedness).length === 0;
        if (isNaked) {
            returnInformation.partiallySheltered = true;
            returnInformation.reason = `Because ${characterName} is partially/totally naked, ${characterName} is partially immune to the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }

    if (weatherSystem.partiallyProtectingWornItems.length > 0) {
        for (const item of characterState.wearing) {
            if (weatherSystem.partiallyProtectingWornItems.includes(item.name)) {
                returnInformation.partiallySheltered = true;
                returnInformation.reason = `The item "${item.name}" worn by "${characterName}" partially protects from the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }
    }

    if (weatherSystem.partiallyProtectingCarriedItems.length > 0) {
        for (const item of characterState.carrying) {
            if (weatherSystem.partiallyProtectingCarriedItems.includes(item.name)) {
                returnInformation.partiallySheltered = true;
                returnInformation.reason = `The item "${item.name}" carried by "${characterName}" partially protects from the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }
    }

    for (const potentialProtectingItem of potentiallyProtectingItemsCharacterIsInsideOf || []) {
        if (potentialProtectingItem.containerProperties?.partiallyProtectsFromWeathers?.includes(weatherName)) {
            returnInformation.partiallySheltered = true;
            returnInformation.reason = `The item "${potentialProtectingItem.name}" that "${characterName}" is inside of partially protects from the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }

    if (weatherSystem.partiallyProtectingStates.length > 0) {
        for (const state of characterState.states) {
            if (weatherSystem.partiallyProtectingStates.includes(state.state)) {
                returnInformation.partiallySheltered = true;
                // TODO improve this description of the state
                returnInformation.reason = `Because "${characterName}" is in a state of "${state.state}", ${characterName} is partially protected from the weather condition "${weatherName}".`;
                return returnInformation;
            }
        }
    }

    if (weatherSystem.partiallyProtectedTemplate) {
        const hasPartialEffect = typeof weatherSystem.partiallyProtectedTemplate === "string" ? weatherSystem.partiallyProtectedTemplate : await weatherSystem.partiallyProtectedTemplate(engine.deObject, { char: character });
        if (hasPartialEffect) {
            returnInformation.partiallySheltered = true;
            returnInformation.reason = `Because ${hasPartialEffect}, ${characterName} is partially protected from the weather condition "${weatherName}".`;
            return returnInformation;
        }
    }

    // NEGATIVELY EXPOSED CHECKS
    // check for location based negative exposure
    if ((slotInfo.slotNegativelyExposesCharactersToWeather || locationInfo.locationNegativelyExposesCharactersToWeather).includes(weatherName)) {
        returnInformation.negativelyExposed = true;
        returnInformation.reason = `The location "${locationName}" negatively exposes to the weather condition "${weatherName}".`;
        return returnInformation;
    }

    // check if an item the character is carrying or wearing provides negative exposure
    for (const item of characterState.wearing) {
        if (item.wearableProperties?.negativelyExposesToWeathers?.includes(weatherName)) {
            returnInformation.negativelyExposed = true;
            returnInformation.reason = `The item "${item.name}" worn by "${characterName}" negatively exposes to the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }

    for (const item of characterState.carrying) {
        if (item.carriableProperties?.negativelyExposesToWeathers?.includes(weatherName)) {
            returnInformation.negativelyExposed = true;
            returnInformation.reason = `The item "${item.name}" carried by "${characterName}" negatively exposes to the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }

    if (weatherSystem.negativelyAffectedNaked) {
        const isNaked = characterState.wearing.filter(item => item.wearableProperties?.coversTopNakedness || item.wearableProperties?.coversBottomNakedness).length === 0;
        if (isNaked) {
            returnInformation.negativelyExposed = true;
            returnInformation.reason = `Because ${characterName} is partially/totally naked, ${characterName} is negatively exposed to the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }

    if (weatherSystem.negativelyAffectingWornItems.length > 0) {
        for (const item of characterState.wearing) {
            if (weatherSystem.negativelyAffectingWornItems.includes(item.name)) {
                returnInformation.negativelyExposed = true;
                returnInformation.reason = `The item "${item.name}" worn by "${characterName}" negatively exposes to the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }
    }

    if (weatherSystem.negativelyAffectingCarriedItems.length > 0) {
        for (const item of characterState.carrying) {
            if (weatherSystem.negativelyAffectingCarriedItems.includes(item.name)) {
                returnInformation.negativelyExposed = true;
                returnInformation.reason = `The item "${item.name}" carried by "${characterName}" negatively exposes to the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }
    }

    for (const potentialProtectingItem of potentiallyProtectingItemsCharacterIsInsideOf || []) {
        if (potentialProtectingItem.containerProperties?.negativelyExposesToWeathers?.includes(weatherName)) {
            returnInformation.negativelyExposed = true;
            returnInformation.reason = `The item "${potentialProtectingItem.name}" that "${characterName}" is inside of negatively exposes ${characterName} to the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }

    if (weatherSystem.negativelyAffectingStates.length > 0) {
        for (const state of characterState.states) {
            if (weatherSystem.negativelyAffectingStates.includes(state.state)) {
                returnInformation.negativelyExposed = true;
                // TODO improve this description of the state
                returnInformation.reason = `Because "${characterName}" is in a state of "${state.state}", ${characterName} is negatively exposed to the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }
    }

    if (weatherSystem.negativelyAffectedTemplate) {
        const hasNegativeEffect = typeof weatherSystem.negativelyAffectedTemplate === "string" ? weatherSystem.negativelyAffectedTemplate : await weatherSystem.negativelyAffectedTemplate(engine.deObject, { char: character });
        if (hasNegativeEffect) {
            returnInformation.negativelyExposed = true;
            returnInformation.reason = `Because ${hasNegativeEffect}, ${characterName} is negatively exposed to the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }

    return returnInformation;
}


/**
 * @param {DEngine} engine
 * @param {string} characterName 
 * @param {string} towards
 * @returns {Promise<[boolean, DESingleBondDescription, DEBondDeclaration, string]>} bond description and bond info
 */
export async function getRelationshipBetweenCharacters(engine, characterName, towards) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    const character = engine.deObject.characters[characterName];
    if (!character) {
        throw new Error(`Character ${characterName} not found.`);
    }
    const towardsCharacter = engine.deObject.characters[towards];
    if (!towardsCharacter) {
        throw new Error(`Character ${towards} not found.`);
    }
    // @ts-ignore
    let bond = engine.deObject.social.bonds[characterName].active.find(bond => bond.towards === towards);
    let bondInfo = "";
    let pseudoBond = false;
    if (!bond) {
        // make a pseudo bond for stranger
        bond = {
            bond: 0,
            bond2: 0,
            stranger: true,
            towards: towards,
            createdAt: engine.deObject.currentTime,
            knowsName: false,
        }
        pseudoBond = true;
    }

    if (!character.bonds) {
        throw new Error(`Character ${characterName} has no bonds defined.`);
    }

    const bondDecl = character.bonds.declarations.find((b => b.strangerBond === bond.stranger && b.minBondLevel <= bond.bond && bond.bond < (b.maxBondLevel === 100 ? 200 : b.maxBondLevel) && b.min2BondLevel <= bond.bond2 && bond.bond2 < (b.max2BondLevel === 100 ? 200 : b.max2BondLevel)));
    if (!bondDecl) {
        throw new Error(`No bond description found for bond level ${bond.bond} and secondary bond level ${bond.bond2} from character "${characterName}" towards character "${towards}".`);
    }

    // @ts-ignore
    bondInfo += await bondDecl.description.execute(engine.deObject, character, towardsCharacter);

    if (character.bonds.descriptionGeneralInjection) {
        // @ts-ignore
        const value = await character.bonds.descriptionGeneralInjection.execute(engine.deObject, character, towardsCharacter);
        bondInfo += `\n\n${value}`;
    }

    return [pseudoBond, bond, bondDecl, bondInfo];
}