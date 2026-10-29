import { DEngine } from "../index.js";
import { makeTimestamp, getNameIdentificationForOneCharacterTowardsAnother, getNameIdentificationForOneCharacterTowardsAnotherOnlyName } from "./messages.js";
import { getItemsContiguousDescription } from "./items.js";
import { getCharacterCarryingCapacity, getCharacterVolume, getCharacterWeight, getItemVolume, getItemWeight, getWearableFitment, locationPathToMessage } from "./weight-and-volume.js";
import { getWeatherSystemForLocationAndWeather } from "./world.js";
import { getSizeVisibility } from "./visibility.js";

/**
 * @param {DEObject} deObject 
 * @param {string} characterId
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
export function getBeingCarriedByCharacter(deObject, characterId) {
    const charState = deObject.stateFor[characterId];
    if (!charState) {
        throw new Error(`Character ${characterId} not found in engine state.`);
    }
    for (const otherCharName in deObject.stateFor) {
        const otherCharState = deObject.stateFor[otherCharName];
        if (otherCharName === characterId || charState.location !== otherCharState.location || otherCharState.deadEnded) {
            continue;
        }

        if (otherCharState.carryingCharactersDirectly && otherCharState.carryingCharactersDirectly.some(c => c.id === characterId)) {
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

        const found = findLocationOfCharInsideOrAtopItemRecursive(characterId, otherCharState.carrying, ["characters", otherCharName, "carrying"]);
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
 * @param {string} otherCharacterId
 * @param {DEItem[]} list
 * @param {Array<string | number>} pathSoFar
 * @returns {{
 *   path: Array<string | number>,
 *   end: "containingCharacters" | "ontopCharacters",
 *   item: DEItem,
 * } | null}
 */
export function findLocationOfCharInsideOrAtopItemRecursive(otherCharacterId, list, pathSoFar) {
    for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (item.containingCharacters && item.containingCharacters.some(c => c.id === otherCharacterId)) {
            return {
                path: [...pathSoFar, i],
                end: "containingCharacters",
                item: item,
            }
        } else if (item.ontopCharacters && item.ontopCharacters.some(c => c.id === otherCharacterId)) {
            return {
                path: [...pathSoFar, i],
                end: "ontopCharacters",
                item: item,
            }
        } else {
            const found = findLocationOfCharInsideOrAtopItemRecursive(otherCharacterId, item.containing, [...pathSoFar, i, "containing"]);
            if (found) {
                return found;
            }
            const foundAtop = findLocationOfCharInsideOrAtopItemRecursive(otherCharacterId, item.ontop, [...pathSoFar, i, "ontop"]);
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
        if (item.containingCharacters) {
            for (const char of item.containingCharacters) {
                resultsSoFar.push({
                    path: [...pathSoFar, i],
                    end: "containingCharacters",
                    item: item,
                    char: char.id,
                });
            }
        }
        if (item.ontopCharacters) {
            for (const char of item.ontopCharacters) {
                resultsSoFar.push({
                    path: [...pathSoFar, i],
                    end: "ontopCharacters",
                    item: item,
                    char: char.id,
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
 * @param {DEObject} deObject 
 * @param {string} characterId 
 * @returns {{
 *   location: string,
 *   beingCarriedBy: string | null,
 *   itemPath: Array<string | number> | null,
 *   item: DEItem | null,
 *   itemPathEnd: "containingCharacters" | "ontopCharacters" | null,
 * }}
 */
export function getCharacterExactLocation(deObject, characterId) {
    const charState = deObject.stateFor[characterId];
    if (!charState) {
        throw new Error(`Character ${characterId} not found in engine state.`);
    }
    const beingCarriedInfo = getBeingCarriedByCharacter(deObject, characterId);
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
    for (const slot in deObject.world.locations[location].slots) {
        const slotInfo = deObject.world.locations[location].slots[slot];
        const foundChar = findLocationOfCharInsideOrAtopItemRecursive(characterId, slotInfo.items, ["slots", slot, "items"]);
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
 * @param {DEObject} deObject 
 * @param {string} characterId 
 */
export function getAllItemsCharacterIsInsideOf(deObject, characterId) {
    const exactLocation = getCharacterExactLocation(deObject, characterId);
    if (!exactLocation.itemPath) {
        return [];
    }

    /**
     * @type {DEItem[]}
     */
    const items = [];

    const characterLocationInfo = deObject.stateFor[characterId].location;
    const locationState = deObject.world.locations[characterLocationInfo];

    const expectedPath = [...exactLocation.itemPath, exactLocation.itemPathEnd]

    /**
     * @type {*}
     */
    let base;
    if (exactLocation.itemPath[0] === "slots") {
        base = locationState.slots[exactLocation.itemPath[1]].items;
    } else if (exactLocation.itemPath[0] === "characters") {
        base = deObject.stateFor[exactLocation.itemPath[1]].carrying;
    } else {
        throw new Error(`Invalid item path for character ${characterId}: ${exactLocation.itemPath}`);
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
 * @param {DEObject} deObject 
 * @param {string} characterId
 * @returns {Array<{
 *   carriedId: string,
 *   itemPath: Array<string | number> | null,
 *   item: DEItem | null,
 *   itemPathEnd: "containingCharacters" | "ontopCharacters" | null,
 * }>}
 */
export function getListOfCarriedCharactersByCharacter(deObject, characterId) {
    const results1 = findLocationOfAnyCharInsideOrAtopItemRecursive(deObject.stateFor[characterId].carrying, ["characters", characterId, "carrying"], []);
    findLocationOfAnyCharInsideOrAtopItemRecursive(deObject.stateFor[characterId].wearing, ["characters", characterId, "wearing"], results1);

    return (deObject.stateFor[characterId].carryingCharactersDirectly).map((carriedCharName) => ({
        carriedId: carriedCharName.id,
        itemPath: null,
        item: null,
        itemPathEnd: null,
        // @ts-ignore typescript bugs
    })).concat(results1.map((result) => ({
        carriedId: result.char,
        itemPath: result.path,
        item: result.item,
        itemPathEnd: result.end,
    })));
}

/**
 * @param {DEObject} deObject
 * @param {string} characterId
 * @returns {boolean}
 */
export function isTopNaked(deObject, characterId) {
    const charState = deObject.stateFor[characterId];
    if (!charState) {
        throw new Error(`Character ${characterId} not found in engine state.`);
    }

    const wearingItems = charState.wearing;
    for (const item of wearingItems) {
        if (item.wearableProperties?.coversTopNakedness) {
            return false;
        }
    }
    return true;
}

/**
 * @param {DEObject} deObject
 * @param {string} characterId
 * @returns {boolean}
 */
export function isBottomNaked(deObject, characterId) {
    const charState = deObject.stateFor[characterId];
    if (!charState) {
        throw new Error(`Character ${characterId} not found in engine state.`);
    }

    const wearingItems = charState.wearing;
    for (const item of wearingItems) {
        if (item.wearableProperties?.coversBottomNakedness) {
            return false;
        }
    }
    return true;
}

/**
 * @param {DEObject} deObject
 * @param {string} characterId
 * @returns {{
 *   location: string,
 *   nonStrangers: string[],
 *   totalStrangers: string[],
 *   deadNonStrangers: string[],
 *   deadTotalStrangers: string[],
 * }}
 */
export function getSurroundingCharacters(deObject, characterId) {
    const charState = deObject.stateFor[characterId];
    if (!charState) {
        throw new Error(`Character ${characterId} not found in engine state.`);
    }

    const location = charState.location;
    const locationState = deObject.world.locations[location];
    const nonStrangers = [];
    const totalStrangers = [];
    const deadNonStrangers = [];
    const deadTotalStrangers = [];
    for (const charToCheck in deObject.stateFor) {
        const charStateToCheck = deObject.stateFor[charToCheck];
        if (charStateToCheck.location !== location || charToCheck === characterId) {
            continue;
        }
        if (deObject.bonds[characterId].active.find(b => b.towards === charToCheck) || deObject.bonds[characterId].ex.find(b => b.towards === charToCheck)) {
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
 * @param {DEObject} deObject 
 * @param {string} characterId 
 */
export function getPowerLevel(deObject, characterId) {
    const character = deObject.characters[characterId];
    if (!character) {
        throw new Error(`Character ${characterId} not found in engine.`);
    }

    return getPowerLevelFromCharacter(character);
}

/**
 * @param {DEObject} deObject 
 * @param {string} characterId 
 */
export function getApparentPowerLevel(deObject, characterId) {
    const character = deObject.characters[characterId];
    if (!character) {
        throw new Error(`Character ${characterId} not found in engine.`);
    }
    return getApparentPowerLevelFromCharacter(character);
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
 * @param {DECompleteCharacterReference} character
 */
export function getApparentPowerLevelFromCharacter(character) {
    const apparentPowerLevel = ((typeof character.apparentTierValue === "number" ? character.apparentTierValue : character.tierValue) || 1) * (10 ** (powerLevelBaseMultipliers[character.apparentTier || character.tier] || 1));
    return apparentPowerLevel;
}

/**
 * @param {DECompleteCharacterReference} character 
 * @param {DECompleteCharacterReference} inPerspectiveCharacter 
 */
export function whatCanTheyMakeOfAnotherCharacter(character, inPerspectiveCharacter) {
    /**
     * number from 0 to 1, regarding how perceptive the character is
     */
    const inPerspectiveCharacterPerception = inPerspectiveCharacter.perception;

    let inPerspectiveCharacterBlindness = inPerspectiveCharacter.blindness || "no";
    if (inPerspectiveCharacter.id === character.id) {
        // force a character to not be blind to themselves, even if they are blind, for the purposes of this function.
        inPerspectiveCharacterBlindness = "no";
    }

    let canTellStates = true;
    let canTellNakedness = true;
    let canTellDetailsOfClothingOrCarriedItems = true;
    let canTellSpecies = true;
    let canTellGender = true;
    let canTellHeight = true;
    let canTellWeight = true;
    
    const hasHighPerception = inPerspectiveCharacterPerception >= 0.75 || character.id === inPerspectiveCharacter.id; // a character can always tell their own details, even if they are blind or have low perception
    const hasLowPerception = inPerspectiveCharacterPerception < 0.5 && !hasHighPerception;
    const hasMediumPerception = inPerspectiveCharacterPerception >= 0.5 && inPerspectiveCharacterPerception < 0.75 && !hasHighPerception;
    if (inPerspectiveCharacterBlindness === "full") {
        canTellStates = false;
        canTellNakedness = false;
        canTellDetailsOfClothingOrCarriedItems = false;
        canTellSpecies = false;
        canTellGender = false;
        canTellHeight = false;
        canTellWeight = false;
    } else if (inPerspectiveCharacterBlindness === "partial-bad") {
        if (hasLowPerception) {
            canTellStates = false;
            canTellNakedness = false;
            canTellDetailsOfClothingOrCarriedItems = false;
            canTellGender = false;
            canTellHeight = false;
            canTellWeight = false;
        } else if (hasMediumPerception) {
            canTellStates = false;
            canTellDetailsOfClothingOrCarriedItems = false;
        } else {
            // their perception is high enough that they can make out the standard short description of the character in all details, even if they are partially blind.
        }

        // partial-good is too good of a vision in this design, so it is treated the same as no blindness.
    } else {
        // just good
    }

    return {
        canTellStates,
        canTellNakedness,
        canTellDetailsOfClothingOrCarriedItems,
        canTellSpecies,
        canTellGender,
        canTellHeight,
        canTellWeight,
        hasLowPerception,
        hasMediumPerception,
        hasHighPerception,
    };
}

/**
 * @param {DELocation | DELocationSlot} location
 * @param {DECompleteCharacterReference} inPerspectiveCharacter
 */
export function whatCanTheyMakeOfALocation(location, inPerspectiveCharacter) {
    const inPerspectiveCharacterPerception = inPerspectiveCharacter.perception;
    const hasLowPerception = inPerspectiveCharacterPerception < 0.5;
    const hasMediumPerception = inPerspectiveCharacterPerception >= 0.5 && inPerspectiveCharacterPerception < 0.75;
    const hasHighPerception = inPerspectiveCharacterPerception >= 0.75;

    let isUnclear = false;
    if (inPerspectiveCharacter.blindness === "full") {
        isUnclear = true;
    } else if (inPerspectiveCharacter.blindness === "partial-bad") {
        if (hasLowPerception) {
            isUnclear = true;
        } else if (hasMediumPerception) {
            isUnclear = false;
        } else {
            // their perception is high enough that they can make out the standard short description of the location in all details, even if they are partially blind.
            isUnclear = false;
        }
    }
    return {
        isUnclear,
        hasLowPerception,
        hasMediumPerception,
        hasHighPerception,
    };
}

/**
 * @param {DEObject} deObject
 * @param {DEItem} item 
 * @param {DECompleteCharacterReference} inPerspectiveCharacter 
 */
export function whatCanTheyMakeOfAnItem(deObject, item, inPerspectiveCharacter) {
    const visibility = getSizeVisibility(item.volumeLiters, inPerspectiveCharacter || null);

    const charState = deObject.stateFor[inPerspectiveCharacter.id];
    if (!charState) {
        throw new Error(`Character ${inPerspectiveCharacter.id} not found in engine state.`);
    }

    /**
     * @param {DEItem[]} items 
     */
    const checkItemList = (items) => {
        for (const carriedObject of items) {
            if (carriedObject.id === item.id) {
                return true;
            }
            if (carriedObject.containing && checkItemList(carriedObject.containing)) {
                return true;
            }
            if (carriedObject.ontop && checkItemList(carriedObject.ontop)) {
                return true;
            }
        }
        return false;
    }

    const isItemCarriedOrWornByCharacter = checkItemList(charState.carrying) || checkItemList(charState.wearing);

    const canTellTheirExactDescription = visibility === "visible" || isItemCarriedOrWornByCharacter;
    const canTellTheirVolume = visibility === "perceived" || visibility === "visible" || isItemCarriedOrWornByCharacter;
    const canTellTheirWeight = visibility === "perceived" || visibility === "visible" || isItemCarriedOrWornByCharacter;

    const inPerspectiveCharacterPerception = inPerspectiveCharacter.perception;
    
    const hasHighPerception = inPerspectiveCharacterPerception >= 0.75 || isItemCarriedOrWornByCharacter;
    const hasLowPerception = inPerspectiveCharacterPerception < 0.5 && !hasHighPerception;
    const hasMediumPerception = inPerspectiveCharacterPerception >= 0.5 && inPerspectiveCharacterPerception < 0.75 && !hasHighPerception;

    /**
     * @type {"YES" | "NO_BECAUSE_CLOSED" | "NO_BECAUSE_BAD_VISION" | "NOT_A_CONTAINER"}
     */
    const canSeeContents = item.containerProperties ? (item.containerProperties?.canSeeContentsFromOutside ? (
        visibility === "perceived" || visibility === "invisible" ? "NO_BECAUSE_BAD_VISION" : "YES"
    ) : (
        item.state.opened || item.state.open ? "YES" : "NO_BECAUSE_CLOSED"
    )) : "NOT_A_CONTAINER";

    const canSeeOntop = visibility === "perceived" || visibility === "invisible" ? "NO_BECAUSE_BAD_VISION" : "YES";

    return {
        canSeeItIsThere: visibility === "visible" || visibility === "perceived",
        canTellTheirExactDescription,
        canTellTheirVolume,
        canTellTheirWeight,
        canSeeContents,
        canSeeOntop,
        hasLowPerception,
        hasMediumPerception,
        hasHighPerception,
    }
}

/**
 * @param {DEObject} deObject 
 * @param {string} characterId
 * @param {string} inPerspectiveOfCharacterId
 * @param {boolean} onlyBasics
 * @param {boolean} hideCurrentPosture
 * @returns {Promise<string>}
 */
export async function getExternalDescriptionOfCharacter(deObject, characterId, inPerspectiveOfCharacterId, onlyBasics = false, hideCurrentPosture = false) {
    const character = deObject.characters[characterId];
    if (!character) {
        throw new Error(`Character ${characterId} not found.`);
    }
    const characterState = deObject.stateFor[characterId];
    if (!characterState) {
        throw new Error(`Character state for ${characterId} not found.`);
    }

    const inPerspectiveCharacter = deObject.characters[inPerspectiveOfCharacterId];

    if (!inPerspectiveCharacter) {
        throw new Error(`Character ${inPerspectiveOfCharacterId} not found.`);
    }

    let inPerspectiveCharacterBlindness = inPerspectiveCharacter.blindness || "no";
    if (inPerspectiveOfCharacterId === characterId) {
        // force a character to not be blind to themselves, even if they are blind, for the purposes of this function.
        inPerspectiveCharacterBlindness = "no";
    }

    const inPerspectiveCharacterName = getNameIdentificationForOneCharacterTowardsAnother(deObject, inPerspectiveCharacter, inPerspectiveCharacter);

    const characterGender = character.gender;
    const characterSpecies = character.species;
    let characterSpeciesType = character.speciesType;

    const sameSpeciesAsPerspective = characterSpecies === inPerspectiveCharacter.species;

    const characterSpeciesFromPerspective = sameSpeciesAsPerspective ?  "fellow " + characterSpecies : characterSpecies;

    const descriptionsOfSpeciesType = {
        "humanoid": "a humanoid creature",
        "feral": "a feral creature or beast",
        "animal": "an animal",
    }

    const whatCanTheyMakeOf = whatCanTheyMakeOfAnotherCharacter(character, inPerspectiveCharacter);

    // we will not use this because we are assuming awareness, canSeeCharacter is used for non-aware
    // surrounding characters
    // const canSeeThem = deObject.utils.characterInfo.canSeeCharacter(inPerspectiveCharacter, character);

    let finalDescription = "";
    if (inPerspectiveCharacterBlindness === "full") {
        if (whatCanTheyMakeOf.hasLowPerception) {
            finalDescription = inPerspectiveCharacterName + " is completely blind and cannot see them.";
        } else if (whatCanTheyMakeOf.hasMediumPerception && !sameSpeciesAsPerspective) {
            // If the character is partially perceptive and the character is not the same species, they can sense the species but not the gender or type.
            if (characterSpecies === "human") {
                finalDescription = inPerspectiveCharacterName + " is completely blind, but senses they are a " + characterSpeciesFromPerspective + ".";
            } else {
                finalDescription = inPerspectiveCharacterName + " is completely blind, but senses they are a " + characterSpeciesFromPerspective + ", " + (descriptionsOfSpeciesType[characterSpeciesType] || "") + ".";
            }
        } else {
            if (characterSpecies === "human") {
                finalDescription = inPerspectiveCharacterName + " is completely blind, but senses they are a " + characterSpeciesFromPerspective + " of " + characterGender + " gender.";
            } else {
                finalDescription = inPerspectiveCharacterName + " is completely blind, but senses they are a " + characterSpeciesFromPerspective + ", " + (descriptionsOfSpeciesType[characterSpeciesType] || "") + " of " + characterGender + " gender.";
            }
        }
    } else if (inPerspectiveCharacterBlindness === "partial-bad") {
        if (whatCanTheyMakeOf.hasLowPerception) {
            finalDescription = inPerspectiveCharacterName + "'s vision is severely impaired and cannot see them clearly only figuring out they are a " + characterSpeciesFromPerspective + ".";
        } else if (whatCanTheyMakeOf.hasMediumPerception) {
            if (characterSpecies === "human") {
                finalDescription = inPerspectiveCharacterName + "'s vision is severely impaired, but they can make out some details, figuring out they are a " + characterSpeciesFromPerspective + " of " + characterGender + " gender.";
            } else {
                finalDescription = inPerspectiveCharacterName + "'s vision is severely impaired, but they can make out some details, figuring out they are a " + characterSpeciesFromPerspective + ", " + (descriptionsOfSpeciesType[characterSpeciesType] || "") + " of " + characterGender + " gender.";
            }
        } else {
            // their perception is high enough that they can make out the standard short description of the character in all details, even if they are partially blind.
            finalDescription = character.shortDescription;
            if (!finalDescription.endsWith(".")) {
                finalDescription += ".";
            }
        }

        // partial-good is too good of a vision in this design, so it is treated the same as no blindness.
    } else {
        finalDescription = character.shortDescription;
        if (!finalDescription.endsWith(".")) {
            finalDescription += ".";
        }
    }

    if (whatCanTheyMakeOf.canTellStates) {
        let maxStateDominance = 0;
        for (const state of characterState.states) {
            const stateInfo = character.stateDefinitions[state.state];
            let dominanceOfThisState = stateInfo.dominance;
            if (state.relieving && typeof stateInfo.dominanceAfterRelief === "number") {
                dominanceOfThisState = stateInfo.dominanceAfterRelief;
            }
            if (dominanceOfThisState > maxStateDominance) {
                maxStateDominance = dominanceOfThisState;
            }
        }

        for (const state of characterState.states) {
            const stateInfo = character.stateDefinitions[state.state];

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
                        toAdd = await stateInfo.relievingGeneralCharacterExternalDescriptionInjection({
                            char: character,
                            causes: state.causes,
                        });
                    }
                }
            } else {
                if (stateInfo.generalCharacterExternalDescriptionInjection) {
                    if (typeof stateInfo.generalCharacterExternalDescriptionInjection === "string") {
                        toAdd = stateInfo.generalCharacterExternalDescriptionInjection;
                    } else {
                        toAdd = await stateInfo.generalCharacterExternalDescriptionInjection({
                            char: character,
                            causes: state.causes,
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
    }

    if (whatCanTheyMakeOf.canTellNakedness) {
        const topNaked = isTopNaked(deObject, characterId);
        const bottomNaked = isBottomNaked(deObject, characterId);

        if (topNaked && character.shortDescriptionTopNakedAdd) {
            const lowercaseFirstLetter = character.shortDescriptionTopNakedAdd.charAt(0).toLowerCase();
            const restOfString = character.shortDescriptionTopNakedAdd.slice(1);
            finalDescription += ` Not wearing any clothes on the upper body, ${lowercaseFirstLetter + restOfString}`;
            if (!finalDescription.endsWith(".")) {
                finalDescription += ".";
            }
        } else if (topNaked) {
            finalDescription += ` Not wearing any clothes on the upper body.`;
        }

        if (bottomNaked && character.shortDescriptionBottomNakedAdd) {
            const lowercaseFirstLetter = character.shortDescriptionBottomNakedAdd.charAt(0).toLowerCase();
            const restOfString = character.shortDescriptionBottomNakedAdd.slice(1);
            finalDescription += ` Not wearing any clothes on the lower body, ${lowercaseFirstLetter + restOfString}`;
            if (!finalDescription.endsWith(".")) {
                finalDescription += ".";
            }
        } else if (bottomNaked) {
            finalDescription += ` Not wearing any clothes on the lower body.`;
        }

        const hasItemsCoveringBottomNakenessThatAreNotUnderwear = characterState.wearing.some(item => item.wearableProperties && item.wearableProperties.coversBottomNakedness && !item.wearableProperties.underwear);
        const hasItemsCoveringTopNakenessThatAreNotUnderwear = characterState.wearing.some(item => item.wearableProperties && item.wearableProperties.coversTopNakedness && !item.wearableProperties.underwear);

        if (characterState.wearing.length > 0) {
                if (whatCanTheyMakeOf.canTellDetailsOfClothingOrCarriedItems) {
                const visibleWornItems = characterState.wearing.filter(item => {
                    if (!item.wearableProperties) {
                        return false;
                    }

                    if (!item.wearableProperties.underwear) {
                        return true;
                    }

                    const isVisibleAtBottom = item.wearableProperties.coversBottomNakedness && !hasItemsCoveringBottomNakenessThatAreNotUnderwear;
                    const isVisibleAtTop = item.wearableProperties.coversTopNakedness && !hasItemsCoveringTopNakenessThatAreNotUnderwear;

                    return isVisibleAtBottom || isVisibleAtTop;
                });
                finalDescription += " Wearing " + deObject.utils.templates.formatAnd(visibleWornItems.map(item => deObject.utils.templates.formatItemName(item) + " - " + item.description + " (" + getWearableFitment(deObject, item, characterId).fitment + ")")) + ".";
            } else {
                finalDescription += " Wearing some clothes and accessories, but cannot make out the details of what they are wearing.";
            }
        } else {
            finalDescription += " Completely naked, without clothes or accessories.";
        }
    }

    const characterExactLocation = getCharacterExactLocation(deObject, characterId);

    if (!onlyBasics) {
        if (characterState.carrying.length > 0) {
            if (whatCanTheyMakeOf.canTellDetailsOfClothingOrCarriedItems) {
                finalDescription += " Carrying " + deObject.utils.templates.formatAnd(characterState.carrying.map(item => deObject.utils.templates.formatItemName(item) + " - " + item.description)) + ".";
            } else {
                if (inPerspectiveCharacterBlindness === "full" || inPerspectiveCharacterBlindness === "partial-bad") {
                    finalDescription += " Appears to be carrying some items, but cannot make out the details of what it is.";
                } else {
                    finalDescription += " Carrying some items, but cannot make out the details of what they are.";
                }
            }
        } else {
            if (whatCanTheyMakeOf.canTellDetailsOfClothingOrCarriedItems) {
                finalDescription += " Not carrying any items.";
            } else {
                // nothing.
            }
        }

        if (characterExactLocation.beingCarriedBy) {
            if (whatCanTheyMakeOf.canTellDetailsOfClothingOrCarriedItems) {
                finalDescription += ` Being carried by ${characterExactLocation.beingCarriedBy}.`;
            } else {
                finalDescription += ` Being carried by someone, but cannot make out the details of who it is.`;
            }
        }

        const carriedCharacters = getListOfCarriedCharactersByCharacter(deObject, characterId);
        if (carriedCharacters.length > 0) {
            finalDescription += ` Carrying characters: ` + deObject.utils.templates.formatAnd(carriedCharacters.map((v) => {
                const carriedChar = deObject.characters[v.carriedId];
                return getNameIdentificationForOneCharacterTowardsAnother(deObject, inPerspectiveCharacter, carriedChar);
            })) + ".";
        }
    }

    finalDescription += " " + getExternalDescriptionOfCharacterPostureOnly(deObject, characterId, inPerspectiveOfCharacterId, hideCurrentPosture);

    return finalDescription;
}

/**
 * @param {DEObject} deObject 
 * @param {string} characterId 
 * @param {string} inPerspectiveOfCharacterId
 * @param {boolean} hideCurrentPosture
 * @returns {string}
 */
export function getExternalDescriptionOfCharacterPostureOnly(deObject, characterId, inPerspectiveOfCharacterId, hideCurrentPosture = false) {
    const character = deObject.characters[characterId];
    if (!character) {
        throw new Error(`Character ${characterId} not found.`);
    }
    const characterState = deObject.stateFor[characterId];
    if (!characterState) {
        throw new Error(`Character state for ${characterId} not found.`);
    }

    const posturesThatDoNotSpecifyGround = [
        "standing",
        "flying",
        "floating",
        "swimming",
    ]

    const characterExactLocation = getCharacterExactLocation(deObject, characterId);

    const slotValue = deObject.world.locations[characterState.location].slots[characterState.locationSlot];
    const formattedSlotName = deObject.utils.templates.formatLocationSlotName(slotValue, inPerspectiveOfCharacterId, {type: "definite"})

    let postureAppliedOnDescription = (posturesThatDoNotSpecifyGround.includes(characterState.posture)) ? "at " + formattedSlotName : "on the ground at " + formattedSlotName;
    if (characterExactLocation.itemPathEnd === "ontopCharacters" && characterExactLocation.itemPath) {
        postureAppliedOnDescription = locationPathToMessage(deObject, characterId, inPerspectiveOfCharacterId, characterState.location, [...characterExactLocation.itemPath, characterExactLocation.itemPathEnd]);
    } else if (characterExactLocation.itemPathEnd === "containingCharacters" && characterExactLocation.itemPath) {
        postureAppliedOnDescription = locationPathToMessage(deObject, characterId, inPerspectiveOfCharacterId, characterState.location, [...characterExactLocation.itemPath, characterExactLocation.itemPathEnd]);
    }
    
    const inPerspectiveOfCharacterName = deObject.utils.templates.formatCharacterName(character, inPerspectiveOfCharacterId, {
        capitalize: true,
        type: "definite",
    });
    if (!hideCurrentPosture) {
        return inPerspectiveOfCharacterName + " is " + postureToText(characterState.posture) + " " + postureAppliedOnDescription + ".";
    } else {
        return inPerspectiveOfCharacterName + " is " + postureAppliedOnDescription + ".";
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
 * @param {DEObject} deObject 
 * @param {string} characterId 
 */
export async function getCharacterCanSee(deObject, characterId) {
    if (!deObject) {
        throw new Error("DEngine not initialized");
    }

    const character = deObject.characters[characterId];
    if (!character) {
        throw new Error(`Character ${characterId} not found.`);
    }

    const characterState = deObject.stateFor[characterId];
    if (!characterState) {
        throw new Error(`Character state for ${characterId} not found.`);
    }

    const location = deObject.world.locations[characterState.location];
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
    let usedRangedMode = false;

    /**
     * Writes a character reference in the standard identification form (<id:name>),
     * where the name is the one the viewing character knows them as.
     * @param {string} targetId
     * @returns {string}
     */
    const charRef = (targetId) => {
        const target = deObject.characters[targetId];
        if (!target) {
            return `<${targetId}:Unknown Entity>`;
        }
        return getNameIdentificationForOneCharacterTowardsAnother(deObject, character, target);
    };
    const selfRef = charRef(characterId);

    // TODO add places where character can go, fit, etc...

    const slotIds = Object.keys(location.slots);
    let noItemsInAnySlot = true;
    for (const slotId of slotIds) {
        const slot = location.slots[slotId];
        if (slot.items.length > 0) {
            noItemsInAnySlot = false;
            break;
        }
    }

    let finalDescription = `# Items at the current location ${deObject.utils.templates.formatLocationName(characterState.location)}:\n\n`;

    const carryingCapacity = getCharacterCarryingCapacity(deObject, characterId);

    /**
     * @param {DEItem} item 
     */
    const getTagsForItem = (item) => {
        if (!deObject) {
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

        const realItemWeight = getItemWeight(deObject, item);
        const realItemVolume = getItemVolume(deObject, item);
        if (character.carryingCapacityKg < item.weightKg) {
            tags.push(`too heavy for ${character.name}`);
        } else if (character.carryingCapacityLiters < item.volumeLiters) {
            tags.push(`too big for ${character.name} to carry`);
        } else if (character.carryingCapacityKg < realItemWeight.singularWeight) {
            if (realItemWeight.allCharactersInvolved.length) {
                tags.push(`too heavy for ${character.name} (contents include ${deObject.utils.templates.formatAnd(realItemWeight.allCharactersInvolved.map(charRef))})`);
            } else {
                tags.push(`too heavy for ${character.name} (due to contents)`);
            }
        } else if (character.carryingCapacityLiters < realItemVolume.singularVolume) {
            if (realItemVolume.allCharactersInvolved.length) {
                tags.push(`too big for ${character.name} to carry (contents include ${deObject.utils.templates.formatAnd(realItemVolume.allCharactersInvolved.map(charRef))})`);
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
            const fitment = getWearableFitment(deObject, item, characterId);
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
        if (item.ontopCharacters && item.ontopCharacters.some(c => c.id === characterId) || item.containingCharacters && item.containingCharacters.some(c => c.id === characterId)) {
            return true;
        }

        return item.containing.some(isCharacterInsideOrOnTopItem) || item.ontop.some(isCharacterInsideOrOnTopItem);
    }

    /**
     * @param {DEItem} item 
     * @returns {boolean}
     */
    const isCharacterInsideItem = (item) => {
        if (item.containingCharacters && item.containingCharacters.some(c => c.id === characterId)) {
            return true;
        }

        return item.containing.some(isCharacterInsideOrOnTopItem);
    }

    /**
     * @param {string} space
     * @param {boolean} charHasLineOfSight
     * @param {DEItem} item representative item of the group
     * @param {number} amount how many identical items this group represents
     * @param {string} range the id or id-range that identifies the grouped items
     * @param {string | null} carriedByChar
     */
    const listItems = (space, charHasLineOfSight, item, amount, range, carriedByChar) => {
        const tags = getTagsForItem(item);
        finalDescription += `${space}- ${item.owner ? charRef(item.owner) + "'s " : ""}${item.name}${amount >= 2 ? " x" + amount : ""} -> ${range}\n`;
        if (item.relativePosition) {
            finalDescription += `${space}  Position: ${item.relativePosition}\n`;
        }
        if (tags.length > 0) {
            finalDescription += `${space}  [${tags.join(", ")}]\n`;
        }
        finalDescription += `${space}  Description: ${item.description}\n`;
        if (item.containing.length) {
            const charIsInside = isCharacterInsideItem(item);
            const haveLineOfSightSoCharKnowsWhatIsInside = (charHasLineOfSight && item.containerProperties?.canSeeContentsFromOutside) || charIsInside;

            const eachPrefix = amount >= 2 ? `each ${item.name}` : item.name;
            if ((charHasLineOfSight && item.containerProperties?.canSeeContentsFromOutside)) {
                finalDescription += `${space}  ${character.name} can see the following contents of ${eachPrefix}:\n`;
            } else if (charIsInside) {
                finalDescription += `${space}  ${character.name} can see the following contents of ${eachPrefix} (from the inside):\n`;
            } else if (item.owner === characterId) {
                finalDescription += `${space}  ${character.name} cannot see but knows ${eachPrefix} contains (as the owner):\n`;
            } else if (carriedByChar === characterId) {
                finalDescription += `${space}  ${character.name} cannot see but can feel more or less what ${eachPrefix} contains (as the carrier):\n`;
            } else {
                finalDescription += `${space}  ${character.name} cannot see what ${eachPrefix} contains:\n`;
            }

            const groupedContainedItems = getItemsContiguousDescription(item.containing);
            for (const containedItem of groupedContainedItems) {
                if (containedItem.usesRangedMode) {
                    usedRangedMode = true;
                }
                listItems(space + "  ", haveLineOfSightSoCharKnowsWhatIsInside, containedItem.representative, containedItem.amount, containedItem.range, carriedByChar);
            }
        }
        if (item.ontop.length) {
            const groupedOntopItems = getItemsContiguousDescription(item.ontop);
            for (const ontopItem of groupedOntopItems) {
                if (ontopItem.usesRangedMode) {
                    usedRangedMode = true;
                }
                listItems(space + "  ", charHasLineOfSight, ontopItem.representative, ontopItem.amount, ontopItem.range, carriedByChar);
            }
        }
        if (item.containingCharacters.length !== 0) {
            finalDescription += `${space}  Characters inside:\n`;
        }
        for (const containedCharacter of item.containingCharacters) {
            finalDescription += `${space}  - ${charRef(containedCharacter.id)}${containedCharacter.relativePosition ? ` (${containedCharacter.relativePosition})` : ""}\n`;
        }
        if (item.ontopCharacters.length !== 0) {
            finalDescription += `${space}  Characters on top:\n`;
        }
        for (const ontopCharacter of item.ontopCharacters) {
            finalDescription += `${space}  - ${charRef(ontopCharacter.id)}${ontopCharacter.relativePosition ? ` (${ontopCharacter.relativePosition})` : ""}\n`;
        }
        cheapList.push(`${item.owner ? charRef(item.owner) + "'s " : ""}${item.name}${amount >= 2 ? " x" + amount : ""}`);
    }

    /**
     * Lists a flat array of items, grouping identical ones into id-ranges.
     * @param {string} space
     * @param {boolean} charHasLineOfSight
     * @param {DEItem[]} items
     * @param {string | null} carriedByChar
     */
    const listItemArray = (space, charHasLineOfSight, items, carriedByChar) => {
        const grouped = getItemsContiguousDescription(items);
        for (const groupedItem of grouped) {
            if (groupedItem.usesRangedMode) {
                usedRangedMode = true;
            }
            listItems(space, charHasLineOfSight, groupedItem.representative, groupedItem.amount, groupedItem.range, carriedByChar);
        }
    }

    if (noItemsInAnySlot) {
        finalDescription += "No items available at the location.\n\n";
    } else {
        for (const slotId of slotIds) {
            const slot = location.slots[slotId];
            finalDescription += `## Items at ${deObject.utils.templates.formatLocationSlotName(slot, null, {type: "definite"})}:\n\n`;
            listItemArray("", true, slot.items, null);
            finalDescription += "\n";
        }
    }

    // now let's check each character excluding our own for now
    for (const otherCharId in deObject.stateFor) {
        if (otherCharId === characterId) continue;
        const otherCharState = deObject.stateFor[otherCharId];
        if (otherCharState.deadEnded) continue;
        if (otherCharState.location === characterState.location) {
            const otherRef = charRef(otherCharId);
            finalDescription += `# Character: ${otherRef}:\n\n`;

            const bondToOtherChar = deObject.bonds[characterId].active.find(b => b.towards === otherCharId) || deObject.bonds[characterId].ex.find(b => b.towards === otherCharId);
            if (!bondToOtherChar) {
                finalDescription += `${otherRef} is a complete stranger to ${selfRef}, ${selfRef} does not know their name or any details about them.\n\n`;
            } else if (!bondToOtherChar.knowsAs.length && bondToOtherChar.stranger) {
                finalDescription += `${otherRef} is a stranger to ${selfRef}, ${selfRef} does not know their name.\n\n`;
            } else if (!bondToOtherChar.knowsAs.length) {
                finalDescription += `${otherRef} is an acquaintance to ${selfRef}, but ${selfRef} does not know their name!\n\n`;
            } else if (bondToOtherChar.stranger) {
                finalDescription += `${otherRef} is a stranger to ${selfRef}, but ${selfRef} knows their name and some details about them.\n\n`;
            } else {
                finalDescription += `${otherRef} is known to ${selfRef}, ${selfRef} knows their name and many details about them.\n\n`;
            }

            // how many times bigger/smaller is the other character compared to the character
            const otherCharacter = deObject.characters[otherCharId];
            const ratioByHeight = character.heightCm / otherCharacter.heightCm;
            const reverseRatioByHeight = otherCharacter.heightCm / character.heightCm;
            if (ratioByHeight >= 100) {
                finalDescription += `${otherRef} is absurdly tiny compared to ${selfRef} who is hundreds of times taller.\n\n`;
            } else if (ratioByHeight >= 10) {
                finalDescription += `${otherRef} is very small compared to ${selfRef} who is at least 10 times taller.\n\n`;
            } else if (ratioByHeight >= 5) {
                finalDescription += `${otherRef} is small compared to ${selfRef} who is at least 5 times taller.\n\n`;
            } else if (ratioByHeight >= 4) {
                finalDescription += `${otherRef} is small compared to ${selfRef} who is at least 4 times taller.\n\n`;
            } else if (ratioByHeight >= 3) {
                finalDescription += `${otherRef} is small compared to ${selfRef} who is at least 3 times taller.\n\n`;
            } else if (ratioByHeight >= 2) {
                finalDescription += `${otherRef} is somewhat small compared to ${selfRef} who is at least double their height.\n\n`;
            } else if (ratioByHeight >= 1.5) {
                finalDescription += `${otherRef} is somewhat shorter compared to ${selfRef} who is at least 1.5 times their height.\n\n`;
            } else if (ratioByHeight >= 1.25) {
                finalDescription += `${otherRef} is slightly shorter compared to ${selfRef} who is at least 1.25 times their height.\n\n`;
            } else if (ratioByHeight >= 1.1) {
                finalDescription += `${otherRef} is a bit shorter compared to ${selfRef} who is slightly taller.\n\n`;
            } else if (ratioByHeight >= 0.95) {
                finalDescription += `${otherRef} is about the same height as ${selfRef}.\n\n`;
            } else if (ratioByHeight >= 0.8) {
                finalDescription += `${otherRef} is a bit taller compared to ${selfRef} who is slightly shorter.\n\n`;
            } else if (reverseRatioByHeight >= 100) {
                finalDescription += `${otherRef} is absurdly tall compared to ${selfRef} who is hundreds of times shorter.\n\n`;
            } else if (reverseRatioByHeight >= 10) {
                finalDescription += `${otherRef} is very tall compared to ${selfRef} who is at least 10 times shorter.\n\n`;
            } else if (reverseRatioByHeight >= 5) {
                finalDescription += `${otherRef} is tall compared to ${selfRef} who is at least 5 times shorter.\n\n`;
            } else if (reverseRatioByHeight >= 4) {
                finalDescription += `${otherRef} is tall compared to ${selfRef} who is at least 4 times shorter.\n\n`;
            } else if (reverseRatioByHeight >= 3) {
                finalDescription += `${otherRef} is tall compared to ${selfRef} who is at least 3 times shorter.\n\n`;
            } else if (reverseRatioByHeight >= 2) {
                finalDescription += `${otherRef} is somewhat tall compared to ${selfRef} who is at least double their height.\n\n`;
            } else if (reverseRatioByHeight >= 1.5) {
                finalDescription += `${otherRef} is somewhat taller compared to ${selfRef} who is at least 1.5 times their height.\n\n`;
            } else if (reverseRatioByHeight >= 1.25) {
                finalDescription += `${otherRef} is slightly taller compared to ${selfRef} who is at least 1.25 times their height.\n\n`;
            } else if (reverseRatioByHeight >= 1.1) {
                finalDescription += `${otherRef} is a bit taller compared to ${selfRef} who is slightly shorter.\n\n`;
            } else if (reverseRatioByHeight >= 0.95) {
                finalDescription += `${otherRef} is about the same height as ${selfRef}.\n\n`;
            } else {
                finalDescription += `${otherRef} is a bit shorter compared to ${selfRef} who is slightly taller.\n\n`;
            }

            const ratioByWeight = character.weightKg / otherCharacter.weightKg;
            const reverseRatioByWeight = otherCharacter.weightKg / character.weightKg;
            if (ratioByWeight >= 100) {
                finalDescription += `${otherRef} is absurdly small compared to ${selfRef} who is hundreds of times larger.\n\n`;
            } else if (ratioByWeight >= 10) {
                finalDescription += `${otherRef} is very small compared to ${selfRef} who is at least 10 times larger.\n\n`;
            } else if (ratioByWeight >= 5) {
                finalDescription += `${otherRef} is small compared to ${selfRef} who is at least 5 times larger.\n\n`;
            } else if (ratioByWeight >= 4) {
                finalDescription += `${otherRef} is small compared to ${selfRef} who is at least 4 times larger.\n\n`;
            } else if (ratioByWeight >= 3) {
                finalDescription += `${otherRef} is somewhat small compared to ${selfRef} who is at least 3 times their size.\n\n`;
            } else if (ratioByWeight >= 2) {
                finalDescription += `${otherRef} is somewhat small compared to ${selfRef} who is at least double their size.\n\n`;
            } else if (ratioByWeight >= 1.5) {
                finalDescription += `${otherRef} is somewhat small compared to ${selfRef} who is at least 1.5 times their size.\n\n`;
            } else if (ratioByWeight >= 1.25) {
                finalDescription += `${otherRef} is slightly small compared to ${selfRef} who is at least 1.25 times their size.\n\n`;
            } else if (ratioByWeight >= 1.1) {
                finalDescription += `${otherRef} is a bit small compared to ${selfRef} who is slightly larger.\n\n`;
            } else if (ratioByWeight >= 0.95) {
                finalDescription += `${otherRef} is about the same size as ${selfRef}.\n\n`;
            } else if (ratioByWeight >= 0.8) {
                finalDescription += `${otherRef} is a bit larger compared to ${selfRef} who is slightly smaller.\n\n`;
            } else if (reverseRatioByWeight >= 100) {
                finalDescription += `${otherRef} is absurdly large compared to ${selfRef} who is hundreds of times smaller.\n\n`;
            } else if (reverseRatioByWeight >= 10) {
                finalDescription += `${otherRef} is very large compared to ${selfRef} who is at least 10 times smaller.\n\n`;
            } else if (reverseRatioByWeight >= 5) {
                finalDescription += `${otherRef} is large compared to ${selfRef} who is at least 5 times smaller.\n\n`;
            } else if (reverseRatioByWeight >= 4) {
                finalDescription += `${otherRef} is large compared to ${selfRef} who is at least 4 times smaller.\n\n`;
            } else if (reverseRatioByWeight >= 3) {
                finalDescription += `${otherRef} is somewhat large compared to ${selfRef} who is at least 3 times smaller.\n\n`;
            } else if (reverseRatioByWeight >= 2) {
                finalDescription += `${otherRef} is somewhat large compared to ${selfRef} who is at least double their size.\n\n`;
            } else if (reverseRatioByWeight >= 1.5) {
                finalDescription += `${otherRef} is somewhat large compared to ${selfRef} who is at least 1.5 times their size.\n\n`;
            } else if (reverseRatioByWeight >= 1.25) {
                finalDescription += `${otherRef} is slightly large compared to ${selfRef} who is at least 1.25 times their size.\n\n`;
            } else if (reverseRatioByWeight >= 1.1) {
                finalDescription += `${otherRef} is a bit large compared to ${selfRef} who is slightly smaller.\n\n`;
            } else if (reverseRatioByWeight >= 0.95) {
                finalDescription += `${otherRef} is about the same size as ${selfRef}.\n\n`;
            } else {
                finalDescription += `${otherRef} is a bit smaller compared to ${selfRef} who is slightly larger.\n\n`;
            }

            const otherCharacterWeight = getCharacterWeight(deObject, otherCharId);
            const otherCharacterVolume = getCharacterVolume(deObject, otherCharId);

            if (character.carryingCapacityKg < otherCharacter.weightKg) {
                finalDescription += `${otherRef} is too heavy for ${selfRef} to carry.\n\n`;
            } else if (character.carryingCapacityLiters < otherCharacter.weightKg) {
                finalDescription += `${otherRef} is too big for ${selfRef} to carry.\n\n`;
            } else if (character.carryingCapacityKg < otherCharacterWeight.weight) {
                finalDescription += `${otherRef} is too heavy for ${selfRef} to carry (considering what ${otherRef} is currently wearing and carrying).\n\n`;
            } else if (character.carryingCapacityLiters < otherCharacterVolume.volume || carryingCapacity.carryingCapacityLiters < otherCharacterWeight.weight) {
                finalDescription += `${otherRef} is too big for ${selfRef} to carry (considering what ${otherRef} is currently wearing and carrying).\n\n`;
            } else if (carryingCapacity.carryingCapacityKg < otherCharacterWeight.weight || carryingCapacity.carryingCapacityKg < otherCharacterWeight.weight) {
                finalDescription += `${otherRef} is too heavy for ${selfRef} to carry (with current load).\n\n`;
            } else {
                if (otherCharacterWeight.weight >= character.carryingCapacityKg * 0.75) {
                    finalDescription += `${otherRef} can be carried by ${selfRef} with some effort.\n\n`;
                } else if (otherCharacterVolume.volume >= character.carryingCapacityLiters * 0.75) {
                    finalDescription += `${otherRef} can be carried by ${selfRef} but is quite bulky.\n\n`;
                } else if (otherCharacterWeight.weight >= character.carryingCapacityKg * 0.5) {
                    finalDescription += `${otherRef} can be carried by ${selfRef} but is somewhat heavy.\n\n`;
                } else if (otherCharacterVolume.volume >= character.carryingCapacityLiters * 0.5) {
                    finalDescription += `${otherRef} can be carried by ${selfRef} but is somewhat bulky.\n\n`;
                } else {
                    finalDescription += `${otherRef} can be carried by ${selfRef}.\n\n`;
                }
            }

            const externalDescription = await getExternalDescriptionOfCharacter(deObject, otherCharId, characterId, true, false);
            if (externalDescription) {
                finalDescription += `## ${otherRef} Appearance:\n\n${externalDescription}\n\n`;
            }

            finalDescription += `## Items worn by ${otherRef}:\n\n`;
            if (otherCharState.wearing.length === 0) {
                finalDescription += `${otherRef} Is currently naked.\n\n`;
            } else {
                listItemArray("", true, otherCharState.wearing, otherCharId);
                finalDescription += `\n`;
            }
            const carriedChars = getListOfCarriedCharactersByCharacter(deObject, otherCharId);
            if (carriedChars.length > 0) {
                finalDescription += `## Characters carried by ${otherRef}:\n\n`;
                for (const carriedChar of carriedChars) {
                    if (carriedChar.itemPathEnd === "containingCharacters" && carriedChar.itemPath) {
                        finalDescription += `${otherRef} is carrying ${charRef(carriedChar.carriedId)} ${locationPathToMessage(deObject, otherCharId, otherCharState.location, [...carriedChar.itemPath, carriedChar.itemPathEnd], true)}.\n\n`;
                    } else if (carriedChar.itemPathEnd === "ontopCharacters" && carriedChar.itemPath) {
                        finalDescription += `${otherRef} is carrying ${charRef(carriedChar.carriedId)} ${locationPathToMessage(deObject, otherCharId, otherCharState.location, [...carriedChar.itemPath, carriedChar.itemPathEnd], true)}.\n\n`;
                    } else {
                        finalDescription += `${otherRef} is carrying ${charRef(carriedChar.carriedId)}.\n\n`;
                    }
                }
            }
            finalDescription += `## Items carried by ${otherRef}:\n\n`;
            if (otherCharState.carrying.length === 0) {
                finalDescription += `No items carried by ${otherRef}.\n\n`;
            } else {
                listItemArray("", true, otherCharState.carrying, otherCharId);
                finalDescription += `\n`;
            }

            const exactLocation = getCharacterExactLocation(deObject, otherCharId);
            if (exactLocation.beingCarriedBy) {
                finalDescription += `## ${otherRef} is being carried by another character:\n\n`;
                finalDescription += `${otherRef} is being carried by character: ${charRef(exactLocation.beingCarriedBy)}.\n\n`;
            }

            if (exactLocation.itemPathEnd === "containingCharacters" && exactLocation.itemPath) {
                finalDescription += `## ${otherRef} is inside an item:\n\n`;
                finalDescription += `${otherRef} is ${locationPathToMessage(deObject, otherCharId, otherCharState.location, [...exactLocation.itemPath, exactLocation.itemPathEnd])}.\n\n`;
            }

            if (exactLocation.itemPathEnd === "ontopCharacters" && exactLocation.itemPath) {
                finalDescription += `## ${otherRef} is on top of an item:\n\n`;
                finalDescription += `${otherRef} is ${locationPathToMessage(deObject, otherCharId, otherCharState.location, [...exactLocation.itemPath, exactLocation.itemPathEnd])}.\n\n`;
            }
        }
    }

    // now let's do our own character
    finalDescription += `# Character ${selfRef} (our character)\n\n## Items worn by ${selfRef}:\n\n`;
    if (characterState.wearing.length === 0) {
        finalDescription += `${selfRef} Is currently naked.\n\n`;
    } else {
        listItemArray("", true, characterState.wearing, characterId);
        finalDescription += `\n`;
    }

    const carriedChars = getListOfCarriedCharactersByCharacter(deObject, characterId);
    if (carriedChars.length > 0) {
        finalDescription += `## Characters carried by ${selfRef}:\n\n`;
        for (const carriedChar of carriedChars) {
            if (carriedChar.itemPathEnd === "containingCharacters" && carriedChar.itemPath) {
                finalDescription += `${selfRef} is carrying ${charRef(carriedChar.carriedId)} ${locationPathToMessage(deObject, characterId, characterState.location, [...carriedChar.itemPath, carriedChar.itemPathEnd], true)}.\n\n`;
            } else if (carriedChar.itemPathEnd === "ontopCharacters" && carriedChar.itemPath) {
                finalDescription += `${selfRef} is carrying ${charRef(carriedChar.carriedId)} ${locationPathToMessage(deObject, characterId, characterState.location, [...carriedChar.itemPath, carriedChar.itemPathEnd], true)}.\n\n`;
            } else {
                finalDescription += `${selfRef} is carrying ${charRef(carriedChar.carriedId)}.\n\n`;
            }
        }
    }

    finalDescription += `## Items carried by ${selfRef}:\n\n`;
    if (characterState.carrying.length === 0) {
        finalDescription += `No items or characters carried by ${selfRef}.\n\n`;
    } else {
        listItemArray("", true, characterState.carrying, characterId);
        finalDescription += `\n`;
    }

    const exactLocation = getCharacterExactLocation(deObject, characterId);
    if (exactLocation.beingCarriedBy) {
        finalDescription += `## ${selfRef} is being carried by another character:\n\n`;
        finalDescription += `${selfRef} is being carried by character: ${charRef(exactLocation.beingCarriedBy)}.\n\n`;
    }

    if (exactLocation.itemPathEnd === "containingCharacters" && exactLocation.itemPath) {
        finalDescription += `## ${selfRef} is inside an item:\n\n`;
        finalDescription += `${selfRef} is ${locationPathToMessage(deObject, characterId, characterState.location, [...exactLocation.itemPath, exactLocation.itemPathEnd])}.\n\n`;
    }

    if (exactLocation.itemPathEnd === "ontopCharacters" && exactLocation.itemPath) {
        finalDescription += `## ${selfRef} is on top of an item:\n\n`;
        finalDescription += `${selfRef} is ${locationPathToMessage(deObject, characterId, characterState.location, [...exactLocation.itemPath, exactLocation.itemPathEnd])}.\n\n`;
    }

    // for our own character we use the real power level, not the apparent one, since we know our own stats
    const characterPowerLevel = getApparentPowerLevel(deObject, characterId);

    finalDescription += `# ${selfRef} Power Level Interactions:\n\n`;

    const characterTier = character.tier.replace("_", " ") + " tier";
    for (const otherCharName in deObject.stateFor) {
        if (otherCharName === characterId) continue;
        const otherCharState = deObject.stateFor[otherCharName];
        if (otherCharState.deadEnded) {
            continue;
        }
        const otherChar = deObject.characters[otherCharName];
        if (otherCharState.location === characterState.location) {
            const otherRef = charRef(otherCharName);
            const otherCharacterPowerLevel = getPowerLevel(deObject, otherCharName);
            const powerLevelRatio = characterPowerLevel / otherCharacterPowerLevel;
            const reversePowerLevelRatio = otherCharacterPowerLevel / characterPowerLevel;
            const otherCharacterTier = deObject.characters[otherCharName].tier.replace("_", " ") + " tier";
            if (powerLevelRatio >= 100) {
                finalDescription += `- ${selfRef} (${characterTier}) appears overwhelmingly more powerful than ${otherRef} (${otherCharacterTier}), who is a complete non-threat.\n`;
            } else if (powerLevelRatio >= 10) {
                finalDescription += `- ${selfRef} (${characterTier}) appears much more powerful than ${otherRef} (${otherCharacterTier}), who is not a threat.\n`;
            } else if (powerLevelRatio >= 5) {
                finalDescription += `- ${selfRef} (${characterTier}) appears more powerful than ${otherRef} (${otherCharacterTier}), who is a minor threat at best.\n`;
            } else if (powerLevelRatio >= 2) {
                finalDescription += `- ${selfRef} (${characterTier}) appears somewhat more powerful than ${otherRef} (${otherCharacterTier}), who could pose a small threat.\n`;
            } else if (powerLevelRatio >= 1.5) {
                finalDescription += `- ${selfRef} (${characterTier}) appears slightly more powerful than ${otherRef} (${otherCharacterTier}), who could pose a minor threat.\n`;
            } else if (powerLevelRatio >= 1.25) {
                finalDescription += `- ${selfRef} (${characterTier}) appears a bit more powerful than ${otherRef} (${otherCharacterTier}), who could pose a minor threat.\n`;
            } else if (powerLevelRatio >= 0.95) {
                finalDescription += `- ${selfRef} (${characterTier}) and ${otherRef} (${otherCharacterTier}) are about equally powerful, and could pose a threat to each other.\n`;
            } else if (reversePowerLevelRatio >= 100) {
                finalDescription += `- ${otherRef} (${otherCharacterTier}) appears overwhelmingly more powerful than ${selfRef} (${characterTier}), who is a complete non-threat.\n`;
            } else if (reversePowerLevelRatio >= 10) {
                finalDescription += `- ${otherRef} (${otherCharacterTier}) appears much more powerful than ${selfRef} (${characterTier}), who is not a threat.\n`;
            } else if (reversePowerLevelRatio >= 5) {
                finalDescription += `- ${otherRef} (${otherCharacterTier}) appears more powerful than ${selfRef} (${characterTier}), who is a minor threat at best.\n`;
            } else if (reversePowerLevelRatio >= 2) {
                finalDescription += `- ${otherRef} (${otherCharacterTier}) appears somewhat more powerful than ${selfRef} (${characterTier}), who could pose a small threat.\n`;
            } else if (reversePowerLevelRatio >= 1.5) {
                finalDescription += `- ${otherRef} (${otherCharacterTier}) appears slightly more powerful than ${selfRef} (${characterTier}), who could pose a minor threat.\n`;
            } else if (reversePowerLevelRatio >= 1.25) {
                finalDescription += `- ${otherRef} (${otherCharacterTier}) appears a bit more powerful than ${selfRef} (${characterTier}), who could pose a minor threat.\n`;
            } else {
                finalDescription += `- ${otherRef} (${otherCharacterTier}) and ${selfRef} (${characterTier}) appear about equally powerful, and could pose a threat to each other.\n`;
            }

            const whatCanTheySolo = getWhatCanSolo(otherChar.tier, otherChar.tierValue);
            if (otherChar.tierValue <= 10) {
                finalDescription += `- ${otherRef} appears to be a very low '${otherCharacterTier}' and has seen better days, ${whatCanTheySolo}\n`;
            } else if (otherChar.tierValue <= 20) {
                finalDescription += `- ${otherRef} appears to be a low '${otherCharacterTier}' and has seen better days, ${whatCanTheySolo}\n`;
            } else if (otherChar.tierValue <= 50) {
                finalDescription += `- ${otherRef} appears to be a mid '${otherCharacterTier}', ${whatCanTheySolo}\n`;
            } else if (otherChar.tierValue <= 70) {
                finalDescription += `- ${otherRef} appears to be a high '${otherCharacterTier}', ${whatCanTheySolo}\n`;
            } else if (otherChar.tierValue <= 90) {
                finalDescription += `- ${otherRef} appears to be a top '${otherCharacterTier}', ${whatCanTheySolo}\n`;
            } else {
                finalDescription += `- ${otherRef} appears to embody the perfection of '${otherCharacterTier}', ${whatCanTheySolo}\n`;
            }
        }
    }

    const whatCanTheySolo = getWhatCanSolo(character.tier, character.tierValue);
    if (character.tierValue <= 10) {
        finalDescription += `- ${selfRef} appears to be a very low '${characterTier}' and has seen better days, ${whatCanTheySolo}`;
    } else if (character.tierValue <= 20) {
        finalDescription += `- ${selfRef} appears to be a low '${characterTier}' and has seen better days, ${whatCanTheySolo}`;
    } else if (character.tierValue <= 50) {
        finalDescription += `- ${selfRef} appears to be a mid '${characterTier}', ${whatCanTheySolo}`;
    } else if (character.tierValue <= 70) {
        finalDescription += `- ${selfRef} appears to be a high '${characterTier}', ${whatCanTheySolo}`;
    } else if (character.tierValue <= 90) {
        finalDescription += `- ${selfRef} appears to be a top '${characterTier}', ${whatCanTheySolo}`;
    } else {
        finalDescription += `- ${selfRef} appears to embody the perfection of '${characterTier}', ${whatCanTheySolo}`;
    }

    const surroundingChars = getSurroundingCharacters(deObject, characterId);
    const deadBodies = [surroundingChars.deadNonStrangers, surroundingChars.deadTotalStrangers].flat();
    if (deadBodies.length > 0) {
        finalDescription += `\n\n# Dead bodies at the location:\n\n`;
        for (const deadBody of deadBodies) {
            const externalDescription = await getExternalDescriptionOfCharacter(deObject, deadBody, characterId, true, false);
            finalDescription += `- ${charRef(deadBody)} (Deceased): ${externalDescription}\n`;
        }
    }

    return {
        everything: finalDescription,
        cheapList,
        usedRangedMode,
    }
}

/**
 * @param {DEObject} deObject 
 * @param {string} characterId 
 */
export async function getInternalDescriptionOfCharacter(deObject, characterId) {
    if (!deObject) {
        throw new Error("DEngine not initialized");
    }

    const character = deObject.characters[characterId];
    if (!character) {
        throw new Error(`Character ${characterId} not found.`);
    }

    const characterState = deObject.stateFor[characterId];
    if (!characterState) {
        throw new Error(`Character state for ${characterId} not found.`);
    }

    let general = typeof character.general === "string" ? character.general : await character.general({
        char: character,
    });

    for (const injectable of Object.values(character.generalCharacterDescriptionInjection)) {
        const injectableV = typeof injectable === "string" ? injectable : await injectable({
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
        const stateInfo = character.stateDefinitions[state.state];
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
     *   applyingState: DEApplyingState,
     *   action: DEActionPromptInjection<DEStringTemplateCharAndCauses>,
     *   stateInfo: DECharacterStateDefinition,
     * } | {
     *   applyingState: null,
     *   action: DEActionPromptInjection<DEStringTemplateCharOnly>,
     *   stateInfo: null,
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
    for (const injectable of character.actionPromptInjection) {
        actions.push({
            applyingState: null,
            action: injectable,
            stateInfo: null,
        });
    }
    for (const state of characterState.states) {
        const stateInfo = character.stateDefinitions[state.state];

        let dominanceOfThisState = stateInfo.dominance;
        if (state.relieving && typeof stateInfo.dominanceAfterRelief === "number") {
            dominanceOfThisState = stateInfo.dominanceAfterRelief;
        }

        if (dominanceOfThisState >= maxStateDominance || stateInfo.ignoreDominanceForActionPromptInjection) {
            const origin = state.relieving ? stateInfo.relievingActionPromptInjection : stateInfo.actionPromptInjection;
            if (origin) {
                for (const actionPromptInjectable of origin) {
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
                const generalDescription = typeof generalDescriptionOrigin === "string" ? generalDescriptionOrigin : await generalDescriptionOrigin({
                    char: character,
                    causes: state.causes,
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
                const relievingInjection = typeof stateInfo.relievingGeneralCharacterDescriptionInjection === "string" ? stateInfo.relievingGeneralCharacterDescriptionInjection : (await stateInfo.relievingGeneralCharacterDescriptionInjection({
                    char: character,
                    causes: state.causes,
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
                const injection = typeof stateInfo.generalCharacterDescriptionInjection === "string" ? stateInfo.generalCharacterDescriptionInjection : (await stateInfo.generalCharacterDescriptionInjection({
                    char: character,
                    causes: state.causes,
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

    const bonds = deObject.bonds[characterId];

    /**
     * @type {Array<{title: string; description: string;}>}
     */
    const relationships = [];

    const selfRef = getNameIdentificationForOneCharacterTowardsAnother(deObject, character, character);

    for (const activeBond of bonds.active) {
        if (!character.bonds) {
            console.error(`Character ${characterId} has no bonds defined.`);
            continue;
        }
        const bondDeclaration = character.bonds.declarations.find(bondDecl => bondDecl.strangerBond === activeBond.stranger && bondDecl.minBondLevel <= activeBond.bond && activeBond.bond < (bondDecl.maxBondLevel === 100 ? 200 : bondDecl.maxBondLevel) && bondDecl.min2BondLevel <= activeBond.bond2 && activeBond.bond2 < (bondDecl.max2BondLevel === 100 ? 200 : bondDecl.max2BondLevel));
        const otherCharacter = deObject.characters[activeBond.towards];
        if (!otherCharacter) {
            console.warn(`Other character ${activeBond.towards} not found for bond with ${characterId}.`);
            continue;
        }
        const familyRelationship = getFamilyBondRelation(character, otherCharacter);
        const generalRelationship = await getRelationship(deObject, character, otherCharacter);
        if (bondDeclaration) {
            let result = typeof bondDeclaration.description === "string" ? bondDeclaration.description : (await bondDeclaration.description({
                char: character,
                other: deObject.characters[activeBond.towards],
                otherFamilyRelation: familyRelationship,
                otherRelationship: generalRelationship,
            })).trim();
            if (bondDeclaration.bondAdditionalDescription) {
                if (!result.endsWith(". ")) {
                    result += ". ";
                } else if (!result.endsWith(" ")) {
                    result += " ";
                }
                result += typeof bondDeclaration.bondAdditionalDescription === "string" ? bondDeclaration.bondAdditionalDescription : (await bondDeclaration.bondAdditionalDescription({
                    char: character,
                    other: deObject.characters[activeBond.towards],
                    otherFamilyRelation: familyRelationship,
                    otherRelationship: generalRelationship,
                })).trim();
            }

            const otherRef = getNameIdentificationForOneCharacterTowardsAnother(deObject, character, otherCharacter);
            if (activeBond.knowsAs.length === 0 && activeBond.stranger) {
                result += `\n\n${otherRef} is a stranger to ${selfRef}, ${selfRef} does not know their name.`;
            } else if (activeBond.knowsAs.length === 0) {
                result += `\n\n${otherRef} is an acquaintance to ${selfRef}, but ${selfRef} does not know their name!`;
            } else if (activeBond.stranger) {
                result += `\n\n${otherRef} is a stranger to ${selfRef}, but ${selfRef} knows their name and some details about them.`;
            } else {
                result += `\n\n${otherRef} is known to ${selfRef}, ${selfRef} knows their name and many details about them.`;
            }

            if (familyRelationship) {
                result += `\n\n${otherRef} is ${selfRef}'s ${familyRelationship}.`;
            }

            const isAttractive = deObject.utils.bonds.isAttractedToWithReasoning(character, activeBond.towards);

            if (isAttractive.reasoning) {
                result += `\n\n${isAttractive.reasoning}.`;
            }

            const openToAffection = await bondDeclaration.intimacy.openToAffection(character, deObject.characters[activeBond.towards]);

            const valueToWord = {
                "not": "not",
                "slight": "slightly",
                "moderate": "moderately",
                "very": "very"
            }

            if (openToAffection.value !== "not") {
                result += `\n\n${selfRef} is ${valueToWord[openToAffection.value]} receptive to affection from ${otherRef}`;
                if (openToAffection.reason) {
                    result += `, reason: ${openToAffection.reason}`;
                }
            } else {
                result += `\n\n${selfRef} is not open to receiving affection from ${otherRef}`;
                if (openToAffection.reason) {
                    result += `, reason: ${openToAffection.reason}`;
                }
            }

            const openToSex = await bondDeclaration.intimacy.openToSex(character, deObject.characters[activeBond.towards]);

            const openToIntimateAffection = await bondDeclaration.intimacy.openToIntimateAffection(character, deObject.characters[activeBond.towards]);

            if (openToIntimateAffection.value !== "not") {
                result += `\n\n${selfRef} is ${valueToWord[openToIntimateAffection.value]} receptive to intimate romantic affection (${openToSex.value !== "not" ? "including sexual acts (" + valueToWord[openToSex.value] + ")" : "excluding sexual acts"}) from ${otherRef}`;
                if (openToIntimateAffection.reason) {
                    result += `, reason: ${openToIntimateAffection.reason}`;
                }
            } else {
                result += `\n\n${selfRef} is not receptive to intimate romantic affection from ${otherRef}`;
                if (openToIntimateAffection.reason) {
                    result += `, reason: ${openToIntimateAffection.reason}`;
                }
            }

            if (openToSex.value !== "not") {
                result += `\n\n${selfRef} is ${valueToWord[openToSex.value]} receptive to sexual acts from ${otherRef}`;
                if (openToSex.reason) {
                    result += `, reason: ${openToSex.reason}`;
                }
            } else {
                result += `\n\n${selfRef} is not receptive to sexual acts from ${otherRef}`;
                if (openToSex.reason) {
                    result += `, reason: ${openToSex.reason}`;
                }
            }

            const titleOfRelationship = `${otherCharacter.name} (${generalRelationship})`;

            relationships.push({
                title: titleOfRelationship,
                description: result,
            });

            if (bondDeclaration.generalCharacterDescriptionInjection) {
                const injection = typeof bondDeclaration.generalCharacterDescriptionInjection === "string" ? bondDeclaration.generalCharacterDescriptionInjection : (await bondDeclaration.generalCharacterDescriptionInjection({
                    char: character,
                    other: deObject.characters[activeBond.towards],
                    otherFamilyRelation: familyRelationship,
                    otherRelationship: generalRelationship,
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
            throw new Error(`Character ${characterId} has no bonds defined.`);
        }
        const bondDeclaration = getBondDeclarationFromBondDescription(deObject, character, exBond);
        const generalRelationship = await getRelationship(deObject, character, deObject.characters[exBond.towards]);
        if (bondDeclaration) {
            if (bondDeclaration.generalCharacterDescriptionInjectionEx) {
                const familyRelationship = getFamilyBondRelation(character, deObject.characters[exBond.towards]);
                const injection = typeof bondDeclaration.generalCharacterDescriptionInjectionEx === "string" ? bondDeclaration.generalCharacterDescriptionInjectionEx : (await bondDeclaration.generalCharacterDescriptionInjectionEx({
                    char: character,
                    other: deObject.characters[exBond.towards],
                    otherFamilyRelation: familyRelationship,
                    otherRelationship: generalRelationship,
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
        throw new Error(`Character ${characterId} has no bonds defined.`);
    }

    const surroundingChars = getSurroundingCharacters(deObject, characterId);


    // these do apply to all the total strangers
    const allSurroundingTotalStrangers = surroundingChars.totalStrangers;
    // TODO optimize this, if there are too many total strangers, we may want to bundle them up into a single description instead of doing them one by one, as it may be too verbose and not useful
    for (const strangerName of allSurroundingTotalStrangers) {
        const strangerCharacter = deObject.characters[strangerName];

        const strangerBondDeclaration = getBondDeclarationFromBondDescription(deObject, character, {
            stranger: true,
            bond: 0,
            bond2: 0,
            knowsName: false,
            towards: strangerName,

            // @ts-ignore
            createdAt: null,
        });

        if (!strangerBondDeclaration) {
            continue;
        }

        if (strangerCharacter) {
            const familyRelationship = getFamilyBondRelation(character, strangerCharacter);
            const generalRelationship = await getRelationship(deObject, character, strangerCharacter);
            let result = typeof strangerBondDeclaration.description === "string" ? strangerBondDeclaration.description : (await strangerBondDeclaration.description({
                char: character,
                other: strangerCharacter,
                otherFamilyRelation: familyRelationship,
                otherRelationship: generalRelationship,
            })).trim();
            if (strangerBondDeclaration.bondAdditionalDescription) {
                if (!result.endsWith(". ")) {
                    result += ". ";
                } else if (!result.endsWith(" ")) {
                    result += " ";
                }
                result += typeof strangerBondDeclaration.bondAdditionalDescription === "string" ? strangerBondDeclaration.bondAdditionalDescription : (await strangerBondDeclaration.bondAdditionalDescription({
                    char: character,
                    other: strangerCharacter,
                    otherFamilyRelation: familyRelationship,
                    otherRelationship: generalRelationship,
                })).trim();
            }
            result += ` ${strangerName} is a total stranger to ${characterId} and ${characterId} does not know their name.`;
            if (familyRelationship) {
                result += ` ${strangerName} is ${characterId}'s ${familyRelationship}.`;
            }

            const titleOfRelationship = `${strangerCharacter.name} (Totally Unknown Stranger)`;

            relationships.push({
                title: titleOfRelationship,
                description: result,
            });
        }

        if (strangerBondDeclaration.generalCharacterDescriptionInjection) {
            const injection = typeof strangerBondDeclaration.generalCharacterDescriptionInjection === "string" ? strangerBondDeclaration.generalCharacterDescriptionInjection : (await strangerBondDeclaration.generalCharacterDescriptionInjection({
                char: character,
                other: strangerCharacter,
                otherFamilyRelation: getFamilyBondRelation(character, strangerCharacter),
                otherRelationship: await getRelationship(deObject, character, strangerCharacter),
            })).trim();
            if (injection) {
                if (!general.endsWith("\n\n")) {
                    general += "\n\n";
                }
                general += injection;
            }
        }
    }

    /**
     * @type {Array<string>}
     */
    const likes = [];
    const dislikes = [];

    for (const like of character.likes) {
        const globalInterest = deObject.interests[like];
        if (globalInterest) {
            likes.push(globalInterest.simple);
        } else {
            likes.push(like);
        }
    }
    for (const dislike of character.dislikes) {
        const globalInterest = deObject.interests[dislike];
        if (globalInterest) {
            dislikes.push(globalInterest.simple);
        } else {
            dislikes.push(dislike);
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
        likes,
        dislikes,
    };
}

/**
 * @param {DEObject} deObject 
 * @param {DECompleteCharacterReference} character 
 * @param {DESingleBondDescription} bond 
 */
export function getBondDeclarationFromBondDescription(deObject, character, bond) {
    if (!character.bonds || !character.bonds.declarations) {
        return null;
    } else if (!deObject) {
        throw new Error("DEngine not initialized");
    }

    const towardsCharacter = deObject.characters[bond.towards];

    const isFamily = getFamilyBondRelation(character, towardsCharacter);

    if (isFamily) {
        const bondDeclarationFamily =
            character.bonds.declarations.find(bondDecl => bondDecl.strangerBond === bond.stranger && bondDecl.minBondLevel <= bond.bond && bond.bond < (bondDecl.maxBondLevel === 100 ? 200 : bondDecl.maxBondLevel) && bondDecl.min2BondLevel <= bond.bond2 && bond.bond2 < (bondDecl.max2BondLevel === 100 ? 200 : bondDecl.max2BondLevel) && bondDecl.familyBond === true);
        if (bondDeclarationFamily) {
            return bondDeclarationFamily;
        }
    }

    const bondDeclaration =
        character.bonds.declarations.find(bondDecl => bondDecl.strangerBond === bond.stranger && bondDecl.minBondLevel <= bond.bond && bond.bond < (bondDecl.maxBondLevel === 100 ? 200 : bondDecl.maxBondLevel) && bondDecl.min2BondLevel <= bond.bond2 && bond.bond2 < (bondDecl.max2BondLevel === 100 ? 200 : bondDecl.max2BondLevel));

    if (!bondDeclaration) {
        return null;
    }
    return bondDeclaration;
}

/**
 * @param {DEObject} deObject 
 * @param {DECompleteCharacterReference} character 
 * @param {string} bondName 
 * @returns {DEBondDeclaration|null}
 */
export function getBondDeclarationFromName(deObject, character, bondName) {
    if (!character.bonds || !character.bonds.declarations) {
        return null;
    } else if (!deObject) {
        throw new Error("DEngine not initialized");
    }

    const bondDeclaration = character.bonds.declarations.find(bondDecl => bondDecl.name === bondName);

    if (!bondDeclaration) {
        return null;
    }
    return bondDeclaration;
}

/**
 * 
 * @param {DEngine} engine 
 * @param {string} characterId 
 */
export async function getSysPromptForCharacter(engine, characterId) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    if (!engine.inferenceAdapter) {
        throw new Error("DEngine has no inference adapter defined");
    }
    const character = engine.deObject.characters[characterId];
    if (!character) {
        throw new Error(`Character ${characterId} not found.`);
    }

    const characterState = engine.deObject.stateFor[characterId];
    if (!characterState) {
        throw new Error(`No state found for character "${characterId}".`);
    }

    const externalDescription = await getExternalDescriptionOfCharacter(engine.deObject, characterId, characterId, true);
    const internalDescription = await getInternalDescriptionOfCharacter(engine.deObject, characterId);

    /**
     * @type {string|null}
     */
    let lore = null;

    if (engine.deObject.world.lore) {
        // @ts-ignore
        lore = typeof engine.deObject.world.lore === "string" ? engine.deObject.world.lore : await engine.deObject.world.lore(engine.deObject, {
            char: character,
        });
        // @ts-ignore
        if (lore.trim().length === 0) {
            lore = null;
        }
    }

    /**
     * @type {Array<string>}
     */
    const interactingCharacters = [];
    const potentialConversationId = engine.deObject.stateFor[characterId].conversationId;
    if (potentialConversationId) {
        const conversation = engine.deObject.conversations[potentialConversationId];
        interactingCharacters.push(...conversation.participants.filter(name => name !== characterId));
    }

    /**
     * @type {Array<string>}
     */
    const worldRules = [];
    if (engine.deObject.worldRules) {
        for (const rule of Object.values(engine.deObject.worldRules)) {
            const ruleText = typeof rule.rule === "string" ? rule.rule : (await rule.rule({
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
            const ruleText = typeof rule.rule === "string" ? rule.rule : (await rule.rule({
                char: character,
            })).trim();
            if (ruleText.length > 0) {
                characterRules.push(ruleText);
            }
        }
    }

    // TODO move to inference adapter describeScenario soemthing
    let scenario = "";
    const currentLocation = engine.deObject.world.locations[engine.deObject.stateFor[characterId].location];
    if (currentLocation) {
        scenario = `## Location:\n\n${engine.deObject.utils.templates.formatLocationName(engine.deObject.stateFor[characterId].location, characterId, {type: "default"})}, ` + (typeof currentLocation.description === "string" ? currentLocation.description : await currentLocation.description({
            char: character,
        }));
    }
    const currentLocationSlot = currentLocation.slots[engine.deObject.stateFor[characterId].locationSlot];
    if (currentLocationSlot) {
        scenario += `\n\nSpecifically at ${engine.deObject.utils.templates.formatLocationSlotName(currentLocationSlot, characterId, {type: "definite"})}, ` + (typeof currentLocationSlot.description === "string" ? currentLocationSlot.description : await currentLocationSlot.description({
            char: character,
        }));
    }

    scenario += `\n\n## Weather:\n\n${await whatIsWeatherLikeForCharacter(engine.deObject, characterId)}`;

    scenario += `\n\n## Current time and date in the world:\n\n${makeTimestamp(engine.deObject, engine.deObject.currentTime, false)}`;

    const sysprompt = engine.inferenceAdapter.buildSystemPromptForCharacter(
        character,
        {
            characterRules: characterRules,
            worldRules: worldRules,
            externalDescription: externalDescription,
            scenario: scenario,
            lore: lore,
            description: internalDescription.general,
            relationships: internalDescription.relationships,
            expressiveStates: internalDescription.expressiveStates,
            likes: internalDescription.likes,
            dislikes: internalDescription.dislikes,
            otherInteractingCharacters: interactingCharacters,
        }
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
 * @param {DEObject} deObject 
 * @param {string} characterId 
 * @returns 
 */
export async function whatIsWeatherLikeForCharacter(deObject, characterId) {
    if (!deObject) {
        throw new Error("DEngine not initialized");
    }
    if (!deObject.stateFor[characterId]) {
        throw new Error(`No state found for character "${characterId}".`);
    }
    const character = deObject.characters[characterId];
    const characterState = deObject.stateFor[characterId];
    const characterLocationId = characterState.location;
    const characterLocationSlotId = characterState.locationSlot;
    const location = deObject.world.locations[characterLocationId];
    const weatherThere = location.internalState.currentWeather;
    const weatherSystem = getWeatherSystemForLocationAndWeather(deObject, characterLocationId, weatherThere);

    if (!weatherSystem) {
        console.error(`Weather system "${weatherThere}" not found in location "${characterLocationId}".`);
        return `The current weather where "${characterId}" is (${characterLocationId}, ${characterLocationSlotId}) is "${weatherThere}".`;
    }

    const isSheltered = await isCharacterShelteredFromWeather(deObject, characterId, weatherThere, characterLocationId, characterLocationSlotId);

    if (isSheltered.fullySheltered) {
        const noEffectDescription = typeof weatherSystem.noEffectDescription === "string" ? weatherSystem.noEffectDescription : await weatherSystem.noEffectDescription({ char: character });
        return `The current weather where "${characterId}" is (${characterLocationId}, ${characterLocationSlotId}) is "${weatherThere}". However, "${characterId}" is fully sheltered from its effects. ${isSheltered.reason || ""}, therefore ${noEffectDescription || "no weather effects apply to them."}`;
    } else if (isSheltered.partiallySheltered) {
        const partialEffectDescription = typeof weatherSystem.partialEffectDescription === "string" ? weatherSystem.partialEffectDescription : await weatherSystem.partialEffectDescription({ char: character });
        return `The current weather where "${characterId}" is (${characterLocationId}, ${characterLocationSlotId}) is "${weatherThere}". "${characterId}" is partially sheltered from its effects. ${isSheltered.reason || ""}, therefore ${partialEffectDescription || "some weather effects may apply to them."}`;
    } else if (isSheltered.negativelyExposed) {
        const negativeEffectsDescription = typeof weatherSystem.negativelyExposedDescription === "string" ? weatherSystem.negativelyExposedDescription : await weatherSystem.negativelyExposedDescription({ char: character });
        return `The current weather where "${characterId}" is (${characterLocationId}, ${characterLocationSlotId}) is "${weatherThere}". "${characterId}" is negatively exposed to its effects. ${isSheltered.reason || ""}, therefore ${negativeEffectsDescription || "strongly negative weather effects apply to them."}`;
    } else {
        const effectDescription = typeof weatherSystem.fullEffectDescription === "string" ? weatherSystem.fullEffectDescription : await weatherSystem.fullEffectDescription({ char: character });
        return `The current weather where "${characterId}" is (${characterLocationId}, ${characterLocationSlotId}) is "${weatherThere}". ${isSheltered.reason || ""}, therefore ${effectDescription || "all weather effects apply to them."}`;
    }
}

/**
 * Determines if a character is fully or partially sheltered from a certain weather condition
 * by their current location or surroundings, or by an item they are carrying or wearing.
 * @param {DEObject} deObject 
 * @param {string} characterId 
 * @param {string} weatherName
 * @param {string} locationId
 * @param {string} slotName
 */
export async function isCharacterShelteredFromWeather(deObject, characterId, weatherName, locationId, slotName) {
    if (!deObject) {
        throw new Error("DEngine not initialized");
    }

    const selfRef = getNameIdentificationForOneCharacterTowardsAnother(deObject, deObject.characters[characterId], deObject.characters[characterId]);
    const locationName = deObject.utils.templates.formatLocationName(locationId, characterId, { type: "default" });

    const returnInformation = {
        fullySheltered: false,
        partiallySheltered: false,
        negativelyExposed: false,
        reason: `${selfRef} is fully exposed to the weather condition "${weatherName}"`,
    }

    const weatherSystem = getWeatherSystemForLocationAndWeather(deObject, locationId, weatherName);

    const character = deObject.characters[characterId];
    if (!character) {
        throw new Error(`Character ${characterId} not found in world.`);
    }

    const locationInfo = deObject.world.locations[locationId];
    if (!locationInfo) {
        throw new Error(`Location ${locationId} not found in world.`);
    }

    const slotInfo = locationInfo.slots[slotName];
    if (!slotInfo) {
        throw new Error(`Slot ${slotName} not found in location ${locationId}.`);
    }

    const characterState = deObject.stateFor[characterId];
    if (!characterState) {
        throw new Error(`Character state for ${characterId} not found.`);
    }

    /**
     * @type {DEItem[]}
     */
    const potentiallyProtectingItemsCharacterIsInsideOf = getAllItemsCharacterIsInsideOf(deObject, characterId);

    // FULLY PROTECTED CHECKS
    // check for location based sheltering
    if ((slotInfo.slotFullyBlocksWeather || locationInfo.locationFullyBlocksWeather).includes(weatherName)) {
        returnInformation.fullySheltered = true;
        returnInformation.reason = `The location "${locationName}" fully blocks the weather condition "${weatherName}" for ${selfRef}`;
        return returnInformation;
    }

    // check if an item the character is carrying or wearing provides full sheltering
    for (const item of characterState.wearing) {
        if (item.wearableProperties?.fullyProtectsFromWeathers?.includes(weatherName)) {
            returnInformation.fullySheltered = true;
            returnInformation.reason = `The item "${item.name}" worn by ${selfRef} fully protects from the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }
    for (const item of characterState.carrying) {
        if (item.carriableProperties?.fullyProtectsFromWeathers?.includes(weatherName)) {
            returnInformation.fullySheltered = true;
            returnInformation.reason = `The item <${item.id}:${item.name}> carried by ${selfRef} fully protects from the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }

    if (weatherSystem.fullyProtectedNaked) {
        returnInformation.fullySheltered = true;
        returnInformation.reason = `Because ${selfRef} is naked ${selfRef} is immune to the weather condition "${weatherName}"`;
        return returnInformation;
    }
    if (weatherSystem.fullyProtectingWornItems.length > 0) {
        for (const item of characterState.wearing) {
            if (weatherSystem.fullyProtectingWornItems.includes(item.name)) {
                returnInformation.fullySheltered = true;
                returnInformation.reason = `The item <${item.id}:${item.name}> worn by ${selfRef} fully protects from the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }
    }
    if (weatherSystem.fullyProtectingCarriedItems.length > 0) {
        for (const item of characterState.carrying) {
            if (weatherSystem.fullyProtectingCarriedItems.includes(item.name)) {
                returnInformation.fullySheltered = true;
                returnInformation.reason = `The item <${item.id}:${item.name}> carried by ${selfRef} fully protects from the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }
    }
    for (const potentialProtectingItem of potentiallyProtectingItemsCharacterIsInsideOf || []) {
        if (potentialProtectingItem.containerProperties?.fullyProtectsFromWeathers?.includes(weatherName)) {
            returnInformation.fullySheltered = true;
            returnInformation.reason = `The item <${potentialProtectingItem.id}:${potentialProtectingItem.name}> that ${selfRef} is inside of fully protects from the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }

    if (weatherSystem.fullyProtectingStates.length > 0) {
        for (const state of characterState.states) {
            if (weatherSystem.fullyProtectingStates.includes(state.state)) {
                returnInformation.fullySheltered = true;
                // TODO improve this description of the state
                returnInformation.reason = `Because "${characterId}" is in a state of "${state.state}", ${characterId} is immune to the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }
    }
    if (weatherSystem.fullyProtectedTemplate) {
        const hasFullProtect = typeof weatherSystem.fullyProtectedTemplate === "string" ? weatherSystem.fullyProtectedTemplate : await weatherSystem.fullyProtectedTemplate({ char: character });
        if (hasFullProtect) {
            returnInformation.fullySheltered = true;
            returnInformation.reason = `Because ${hasFullProtect}, ${characterId} is immune to the weather condition "${weatherName}"`;
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
            returnInformation.reason = `The item <${item.id}:${item.name}> worn by ${selfRef} partially protects from the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }
    for (const item of characterState.carrying) {
        if (item.carriableProperties?.partiallyProtectsFromWeathers?.includes(weatherName)) {
            returnInformation.partiallySheltered = true;
            returnInformation.reason = `The item <${item.id}:${item.name}> carried by ${selfRef} partially protects from the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }
    if (weatherSystem.partiallyProtectedNaked) {
        const isNaked = characterState.wearing.filter(item => item.wearableProperties?.coversTopNakedness || item.wearableProperties?.coversBottomNakedness).length === 0;
        if (isNaked) {
            returnInformation.partiallySheltered = true;
            returnInformation.reason = `Because ${selfRef} is partially/totally naked, ${selfRef} is partially immune to the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }

    if (weatherSystem.partiallyProtectingWornItems.length > 0) {
        for (const item of characterState.wearing) {
            if (weatherSystem.partiallyProtectingWornItems.includes(item.name)) {
                returnInformation.partiallySheltered = true;
                returnInformation.reason = `The item <${item.id}:${item.name}> worn by ${selfRef} partially protects from the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }
    }

    if (weatherSystem.partiallyProtectingCarriedItems.length > 0) {
        for (const item of characterState.carrying) {
            if (weatherSystem.partiallyProtectingCarriedItems.includes(item.name)) {
                returnInformation.partiallySheltered = true;
                returnInformation.reason = `The item <${item.id}:${item.name}> carried by ${selfRef} partially protects from the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }
    }

    for (const potentialProtectingItem of potentiallyProtectingItemsCharacterIsInsideOf || []) {
        if (potentialProtectingItem.containerProperties?.partiallyProtectsFromWeathers?.includes(weatherName)) {
            returnInformation.partiallySheltered = true;
            returnInformation.reason = `The item <${potentialProtectingItem.id}:${potentialProtectingItem.name}> that ${selfRef} is inside of partially protects from the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }

    if (weatherSystem.partiallyProtectingStates.length > 0) {
        for (const state of characterState.states) {
            if (weatherSystem.partiallyProtectingStates.includes(state.state)) {
                returnInformation.partiallySheltered = true;
                // TODO improve this description of the state
                returnInformation.reason = `Because ${selfRef} is in a state of "${state.state}", ${selfRef} is partially protected from the weather condition "${weatherName}".`;
                return returnInformation;
            }
        }
    }

    if (weatherSystem.partiallyProtectedTemplate) {
        const hasPartialEffect = typeof weatherSystem.partiallyProtectedTemplate === "string" ? weatherSystem.partiallyProtectedTemplate : await weatherSystem.partiallyProtectedTemplate(deObject, { char: character });
        if (hasPartialEffect) {
            returnInformation.partiallySheltered = true;
            returnInformation.reason = `Because ${hasPartialEffect}, ${selfRef} is partially protected from the weather condition "${weatherName}".`;
            return returnInformation;
        }
    }

    // NEGATIVELY EXPOSED CHECKS
    // check for location based negative exposure
    if ((slotInfo.slotNegativelyExposesCharactersToWeather || locationInfo.locationNegativelyExposesCharactersToWeather).includes(weatherName)) {
        returnInformation.negativelyExposed = true;
        returnInformation.reason = `The location "${locationName}" negatively exposes ${selfRef} to the weather condition "${weatherName}".`;
        return returnInformation;
    }

    // check if an item the character is carrying or wearing provides negative exposure
    for (const item of characterState.wearing) {
        if (item.wearableProperties?.negativelyExposesToWeathers?.includes(weatherName)) {
            returnInformation.negativelyExposed = true;
            returnInformation.reason = `The item "${item.name}" worn by ${selfRef} negatively exposes to the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }

    for (const item of characterState.carrying) {
        if (item.carriableProperties?.negativelyExposesToWeathers?.includes(weatherName)) {
            returnInformation.negativelyExposed = true;
            returnInformation.reason = `The item "${item.name}" carried by ${selfRef} negatively exposes to the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }

    if (weatherSystem.negativelyAffectedNaked) {
        const isNaked = characterState.wearing.filter(item => item.wearableProperties?.coversTopNakedness || item.wearableProperties?.coversBottomNakedness).length === 0;
        if (isNaked) {
            returnInformation.negativelyExposed = true;
            returnInformation.reason = `Because ${selfRef} is partially/totally naked, ${selfRef} is negatively exposed to the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }

    if (weatherSystem.negativelyAffectingWornItems.length > 0) {
        for (const item of characterState.wearing) {
            if (weatherSystem.negativelyAffectingWornItems.includes(item.name)) {
                returnInformation.negativelyExposed = true;
                returnInformation.reason = `The item "${item.name}" worn by ${selfRef} negatively exposes to the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }
    }

    if (weatherSystem.negativelyAffectingCarriedItems.length > 0) {
        for (const item of characterState.carrying) {
            if (weatherSystem.negativelyAffectingCarriedItems.includes(item.name)) {
                returnInformation.negativelyExposed = true;
                returnInformation.reason = `The item "${item.name}" carried by ${selfRef} negatively exposes to the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }
    }

    for (const potentialProtectingItem of potentiallyProtectingItemsCharacterIsInsideOf || []) {
        if (potentialProtectingItem.containerProperties?.negativelyExposesToWeathers?.includes(weatherName)) {
            returnInformation.negativelyExposed = true;
            returnInformation.reason = `The item "${potentialProtectingItem.name}" that ${selfRef} is inside of negatively exposes ${selfRef} to the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }

    if (weatherSystem.negativelyAffectingStates.length > 0) {
        for (const state of characterState.states) {
            if (weatherSystem.negativelyAffectingStates.includes(state.state)) {
                returnInformation.negativelyExposed = true;
                // TODO improve this description of the state
                returnInformation.reason = `Because ${selfRef} is in a state of "${state.state}", ${selfRef} is negatively exposed to the weather condition "${weatherName}"`;
                return returnInformation;
            }
        }
    }

    if (weatherSystem.negativelyAffectedTemplate) {
        const hasNegativeEffect = typeof weatherSystem.negativelyAffectedTemplate === "string" ? weatherSystem.negativelyAffectedTemplate : await weatherSystem.negativelyAffectedTemplate(deObject, { char: character });
        if (hasNegativeEffect) {
            returnInformation.negativelyExposed = true;
            returnInformation.reason = `Because ${hasNegativeEffect}, ${selfRef} is negatively exposed to the weather condition "${weatherName}"`;
            return returnInformation;
        }
    }

    return returnInformation;
}


/**
 * @param {DEObject} deObject 
 * @param {string} characterId 
 * @param {string} towards
 * @returns {Promise<[boolean, DESingleBondDescription, DEBondDeclaration, string]>} bond description and bond info
 */
export async function getRelationshipBetweenCharacters(deObject, characterId, towards) {
    if (!deObject) {
        throw new Error("DEngine not initialized");
    }
    const character = deObject.characters[characterId];
    if (!character) {
        throw new Error(`Character ${characterId} not found.`);
    }
    const towardsCharacter = deObject.characters[towards];
    if (!towardsCharacter) {
        throw new Error(`Character ${towards} not found.`);
    }
    // @ts-ignore
    let bond = deObject.bonds[characterId].active.find(bond => bond.towards === towards);
    let bondInfo = "";
    let pseudoBond = false;
    if (!bond) {
        // make a pseudo bond for stranger
        bond = {
            bond: 0,
            bond2: 0,
            stranger: true,
            towards: towards,
            createdAt: deObject.currentTime,
            knowsAs: [],
            undoableShifts: {},
        }
        pseudoBond = true;
    }

    if (!character.bonds) {
        throw new Error(`Character ${characterId} has no bonds defined.`);
    }

    const bondDecl = character.bonds.declarations.find((b => b.strangerBond === bond.stranger && b.minBondLevel <= bond.bond && bond.bond < (b.maxBondLevel === 100 ? 200 : b.maxBondLevel) && b.min2BondLevel <= bond.bond2 && bond.bond2 < (b.max2BondLevel === 100 ? 200 : b.max2BondLevel)));
    if (!bondDecl) {
        throw new Error(`No bond description found for bond level ${bond.bond} and secondary bond level ${bond.bond2} from character "${characterId}" towards character "${towards}".`);
    }

    // @ts-ignore
    bondInfo += await bondDecl.description.execute(deObject, character, towardsCharacter);

    if (character.bonds.descriptionGeneralInjection) {
        // @ts-ignore
        const value = await character.bonds.descriptionGeneralInjection.execute(deObject, character, towardsCharacter);
        bondInfo += `\n\n${value}`;
    }

    return [pseudoBond, bond, bondDecl, bondInfo];
}

/**
 * 
 * @param {DECompleteCharacterReference} character 
 * @param {DECompleteCharacterReference} towards
 * @returns {DEFamilyRelation|null} The family relation of the character towards the other character, or null if there is no family relation.
 */
export function getFamilyBondRelation(character, towards) {
    const familyTie = character.familyTies[towards.name];
    return familyTie?.relation || null;
}

/**
 * @param {DEObject} deObject 
 * @param {DECompleteCharacterReference} character 
 * @param {DECompleteCharacterReference} towards
 * @return {Promise<string|null>}
 */
export async function getRelationship(deObject, character, towards) {
    if (!deObject) {
        throw new Error("DEngine not initialized");
    }
    if (!character.bonds || !character.bonds.declarations) {
        return null;
    }
    const activeBond = deObject?.bonds[character.name]?.active.find(bond => bond.towards === towards.name);
    if (!activeBond) {
        return null;
    }
    const bondDecl = character.bonds.declarations.find((b => b.strangerBond === activeBond.stranger && b.minBondLevel <= activeBond.bond && activeBond.bond < (b.maxBondLevel === 100 ? 200 : b.maxBondLevel) && b.min2BondLevel <= activeBond.bond2 && activeBond.bond2 < (b.max2BondLevel === 100 ? 200 : b.max2BondLevel)));
    if (!bondDecl) {
        return null;
    }

    if (!(activeBond.relationshipNameOverride || bondDecl.relationshipName)) {
        return null;
    }

    const familyRelationship = getFamilyBondRelation(character, towards);

    let relationshipNameResult = "";
    if (typeof activeBond.relationshipNameOverride === "string") {
        relationshipNameResult = activeBond.relationshipNameOverride;
    } else if (activeBond.relationshipNameOverride) {
        relationshipNameResult = await activeBond.relationshipNameOverride({ char: character, other: towards, otherFamilyRelation: familyRelationship, otherRelationship: null });
    }

    if (!relationshipNameResult && bondDecl.relationshipName) {
        relationshipNameResult = typeof bondDecl.relationshipName === "string" ? bondDecl.relationshipName : await bondDecl.relationshipName({ char: character, other: towards, otherFamilyRelation: familyRelationship, otherRelationship: null });
    }

    return relationshipNameResult;
}
