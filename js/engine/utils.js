import { getSurroundingCharacters, getPowerLevelFromCharacter, getRelationship } from "./util/character-info.js";
import { generateIntSeedFromString, weightedRandomByLikelihood } from "../util/random.js";
import { getCharacterVolume, getCharacterWeight } from "./util/weight-and-volume.js";

/**
 * @param {string[]} list
 * @returns {string}
 */
function formatAndHelper(list) {
    if (!list || !Array.isArray(list)) return "";
    if (list.length === 0) return "";
    if (list.length === 1) return list[0];
    if (list.length === 2) return `${list[0]} and ${list[1]}`;
    return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
}

/**
 * @param {string[]} list
 * @returns {string}
 */
function formatOrHelper(list) {
    if (!list || !Array.isArray(list)) return "";
    if (list.length === 0) return "";
    if (list.length === 1) return list[0];
    if (list.length === 2) return `${list[0]} or ${list[1]}`;
    return `${list.slice(0, -1).join(', ')}, or ${list[list.length - 1]}`;
}

/**
 * @param {DEObject} DE
 * @param {Array<DECompleteCharacterReference | string>} charsOrig
 * @param {string} they
 * @param {string} he
 * @param {string} she
 * @param {string} theySingular
 * @returns {string}
 */
function getPronounHelperLocal(DE, charsOrig, they, he, she, theySingular) {
    const chars = charsOrig.map(c => typeof c === "string" ? DE.characters[c] : c);

    if (!chars || chars.length === 0) return they;
    if (chars.length > 1) return they;
    const charRef = chars[0];
    if (!charRef) return theySingular;
    const gender = charRef.gender.toLowerCase();
    if (gender === "male") return he;
    if (gender === "female") return she;
    return theySingular;
}

/**
 * 
 * @param {string[]} list 
 * @returns 
 */
function removeDuplicatesHelper(list) {
    if (!list || !Array.isArray(list)) return [];
    const seen = new Set();
    return list.filter(item => {
        if (seen.has(item)) {
            return false;
        }
        seen.add(item);
        return true;
    });
}

/**
 * @param {DEObject} DE
 * @param {DECompleteCharacterReference} character
 * @param {string} stateName
 * @returns {Array<DEStateCauseCausantCharacter | DEStateCauseCausantObject>}
 */
function getCausantsHelperLocal(DE, character, stateName) {
    const actualStateName = stateName.trim().toUpperCase().replace(/\s+/, "_");
    const characterHistoryAndCurrent = [...DE.stateFor[character.name].history, DE.stateFor[character.name]];
    /** @type {DEStateForCharacter | null} */
    let lastEntryWithActivation = null;
    for (let i = characterHistoryAndCurrent.length - 1; i >= 0; i--) {
        const entry = characterHistoryAndCurrent[i];
        if (entry.type === "INTERACTING" && entry.states.find(s => s.state === actualStateName)) {
            lastEntryWithActivation = entry;
            break;
        }
    }
    if (!lastEntryWithActivation) return [];
    const stateEntry = lastEntryWithActivation.states.find(s => s.state === actualStateName);
    if (stateEntry?.causes === null || stateEntry?.causes.length === 0) {
        console.warn(`State ${actualStateName} does not have causants because there are no causes.`);
        return [];
    }
    // @ts-ignore
    return stateEntry?.causes.map(c => c.causant).filter(c => c) || [];
}

/**
 * @param {DEObject} DE
 * @returns {DEUtils}
 */
export const deEngineUtilsFn = (DE) => ({
    newGlobalInterest(interest) {
        if (DE.interests[interest.id]) {
            console.warn(`Interest with id ${interest.id} already exists, mixing it.`);
            if (!Array.isArray(DE.interests[interest.id].template)) {
                DE.interests[interest.id].template = [DE.interests[interest.id].template];
            }
            if (Array.isArray(interest.template)) {
                DE.interests[interest.id].template.push(...interest.template);
            } else {
                DE.interests[interest.id].template.push(interest.template);
            }
        } else {
            DE.interests[interest.id] = interest;
        }
    },
    newLocation(name, locationDef) {
        /**
         * @type {DEStatefulLocationDefinition}
         */
        const statefulLocation = {
            ...locationDef,
            state: {},
            internalState: {
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
            }

        };

        const alreadyExistingLocation = DE.world.locations[name];
        if (alreadyExistingLocation) {
            statefulLocation.internalState.currentWeather = alreadyExistingLocation.internalState.currentWeather;
            statefulLocation.internalState.currentWeatherFullEffectDescription = alreadyExistingLocation.internalState.currentWeatherFullEffectDescription;
            statefulLocation.internalState.currentWeatherHasBeenOngoingFor = alreadyExistingLocation.internalState.currentWeatherHasBeenOngoingFor;
            statefulLocation.internalState.currentWeatherNoEffectDescription = alreadyExistingLocation.internalState.currentWeatherNoEffectDescription;
            statefulLocation.internalState.currentWeatherPartialEffectDescription = alreadyExistingLocation.internalState.currentWeatherPartialEffectDescription;
            statefulLocation.state = alreadyExistingLocation.state;

            for (const slot in alreadyExistingLocation.slots) {
                if (!statefulLocation.slots[slot]) {
                    statefulLocation.slots[slot] = alreadyExistingLocation.slots[slot];
                } else {
                    statefulLocation.slots[slot].items = alreadyExistingLocation.slots[slot].items;
                    statefulLocation.slots[slot].state = alreadyExistingLocation.slots[slot].state;
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
                statefulLocation.internalState.currentWeather = parentLocation.internalState.currentWeather;
                statefulLocation.internalState.currentWeatherFullEffectDescription = parentLocation.internalState.currentWeatherFullEffectDescription;
                statefulLocation.internalState.currentWeatherHasBeenOngoingFor = parentLocation.internalState.currentWeatherHasBeenOngoingFor;
                statefulLocation.internalState.currentWeatherNoEffectDescription = parentLocation.internalState.currentWeatherNoEffectDescription;
                statefulLocation.internalState.currentWeatherPartialEffectDescription = parentLocation.internalState.currentWeatherPartialEffectDescription;
            }
        }

        DE.world.locations[name] = statefulLocation;
        return DE.world.locations[name];
    },
    newConnection(connectionDef) {
        const id = connectionDef.from + " to " + connectionDef.to;
        const existingConnection = DE.world.connections[id];
        DE.world.connections[id] = connectionDef;
        if (existingConnection.state) {
            DE.world.connections[id].state = existingConnection.state;
        }
        return DE.world.connections[id];
    },
    newCharacter(characterDef) {
        const currentCharacter = DE.characters[characterDef.name];
        if (!currentCharacter) {
            return characterDef;
        }
        DE.characters[characterDef.name] = {
            ...characterDef,
            state: currentCharacter.state,
        }
        if (DE.internalState["CHARACTER_OVERRIDES_" + characterDef.name]) {
            Object.assign(DE.characters[characterDef.name], DE.internalState["CHARACTER_OVERRIDES_" + characterDef.name]);
        }
        return DE.characters[characterDef.name];
    },
    createStateInAllCharacters(stateName, stateDefinition) {
        Object.values(DE.characters).forEach((character) => {
            defineStateInCharacter(DE, character, stateName, stateDefinition);
        });
        return stateDefinition;
    },
    defineStateInCharacter(character, stateName, stateDefinition) {
        const characterRef = typeof character === "string" ? DE.characters[character] : character;
        if (!characterRef) {
            if (typeof character === "string") {
                console.warn(`Character with name ${character} not found`);
            } else {
                console.warn(`Received null as character reference when trying to create state ${stateName}`);
            }
            return null;
        }
        return defineStateInCharacter(DE, characterRef, stateName, stateDefinition);
    },
    newBond(char1, towards, bondDefinition, options = { forceOverride: false }) {
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

        if (!options.forceOverride) {
            const existingBond = DE.bonds[char1Ref.name].active.find(b => b.towards === towardsRef.name);
            if (existingBond) {
                return existingBond;
            }
        }
        const newBond = {
            towards: towardsRef.name,
            ...bondDefinition,
        };
        DE.bonds[char1Ref.name].active.push(newBond);
        return newBond;
    },
    newMutualBond(char1, char2, bondDefinition) {
        const bond1 = DE.utils.newBond(char1, char2, bondDefinition, { forceOverride: true });
        const bond2 = DE.utils.newBond(char2, char1, bondDefinition);
        return [bond1, bond2];
    },
    newFamilyRelation(char1, towards, relation) {
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
                character1.familyTies[towards] = { relation };
                familyTie1 = character1.familyTies[towards];
            } else if (towardsRef) {
                character1.familyTies[towardsRef.name] = { relation };
                familyTie1 = character1.familyTies[towardsRef.name];
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
                case "half sibling":
                    inverseRelation = "half sibling";
                    break;
                case "step parent":
                    inverseRelation = "step child";
                    break;
                case "step child":
                    inverseRelation = "step parent";
                    break;
                case "step sibling":
                    inverseRelation = "step sibling";
                    break;
                case "step grandparent":
                    inverseRelation = "step grandchild";
                    break;
                case "step grandchild":
                    inverseRelation = "step grandparent";
                    break;
                default:
                    inverseRelation = "other";
            }

            towardsRef.familyTies[character1.name] = { relation: inverseRelation };
            familyTie2 = towardsRef.familyTies[character1.name];
        } else {
            console.warn(`Received null as character reference when trying to create family relation towards ${towards}`);
        }

        return [familyTie1, familyTie2];
    },
    shiftBond(char1, towards, primaryShift, secondaryShift) {
        const char1Ref = typeof char1 === "string" ? DE.characters[char1] : char1;
        const towardsRef = typeof towards === "string" ? DE.characters[towards] : towards;
        if (!char1Ref || !towardsRef) {
            console.warn(`Cannot shift bond from ${char1} towards ${towards} because one of the characters was not found`);
            return;
        }
        if (!char1Ref.bonds) {
            console.warn(`Character ${char1Ref.name} does not have bonds property, cannot shift bond towards ${towards}`);
            return;
        }
        let bond = DE.bonds[char1Ref.name].active.find(b => b.towards === towardsRef.name);
        if (!bond) {
            bond = {
                towards: towardsRef.name,
                bond: 0,
                bond2: 0,
                createdAt: DE.currentTime,
                knowsName: false,
                stranger: true,
                undoableShifts: {},
            };
            DE.bonds[char1Ref.name].active.push(bond);
            // let's create a new bond
        }

        if (bond) {
            const overallShift = primaryShift + secondaryShift;
            const conditionMultiplier = (bond.stranger ? (overallShift < 0 ? char1Ref.bonds.strangerNegativeMultiplier : char1Ref.bonds.strangerPositiveMultiplier) :
                (overallShift < 0 ? char1Ref.bonds.bondChangeNegativityBias : char1Ref.bonds.bondChangeFineTune));
            let actualPrimaryShift = primaryShift * conditionMultiplier;
            let actualSecondaryShift = secondaryShift * conditionMultiplier;

            const alreadyShiftedPrimary = char1Ref.temp["alreadyShiftedBondPrimary_" + towardsRef.name] || 0;
            if (alreadyShiftedPrimary !== 0) {
                if ((alreadyShiftedPrimary > 0 && actualPrimaryShift > 0 && actualPrimaryShift <= alreadyShiftedPrimary) ||
                    (alreadyShiftedPrimary < 0 && actualPrimaryShift < 0 && actualPrimaryShift >= alreadyShiftedPrimary)) {
                    actualPrimaryShift = alreadyShiftedPrimary;
                }
            }

            const alreadyShiftedSecondary = char1Ref.temp["alreadyShiftedBondSecondary_" + towardsRef.name] || 0;
            if (alreadyShiftedSecondary !== 0) {
                if ((alreadyShiftedSecondary > 0 && actualSecondaryShift > 0 && actualSecondaryShift <= alreadyShiftedSecondary) ||
                    (alreadyShiftedSecondary < 0 && actualSecondaryShift < 0 && actualSecondaryShift >= alreadyShiftedSecondary)) {
                    actualSecondaryShift = alreadyShiftedSecondary;
                }
            }

            const effectivePrimary = actualPrimaryShift - alreadyShiftedPrimary;
            const effectiveSecondary = actualSecondaryShift - alreadyShiftedSecondary;

            if (effectivePrimary === 0 && effectiveSecondary === 0) {
                console.log(`Already shifted bond from ${char1Ref.name} towards ${towardsRef.name} by primary=${alreadyShiftedPrimary}, secondary=${alreadyShiftedSecondary}, skipping because new shifts are smaller or equal.`);
                return;
            }

            bond.bond += effectivePrimary;
            bond.bond2 += effectiveSecondary;

            char1Ref.temp["alreadyShiftedBondPrimary_" + towardsRef.name] = actualPrimaryShift;
            char1Ref.temp["alreadyShiftedBondSecondary_" + towardsRef.name] = actualSecondaryShift;
        }
    },
    rejectIntimacy(char1, towards) {
        const char1Ref = typeof char1 === "string" ? DE.characters[char1] : char1;
        const towardsRef = typeof towards === "string" ? DE.characters[towards] : towards;
        if (!char1Ref || !towardsRef) {
            console.warn(`Cannot reject intimacy from ${char1} towards ${towards} because one of the characters was not found`);
            return;
        }
        char1Ref.temp["rejectIntimacy_" + towardsRef.name] = true;
    },
    hasBondBeenShiftedThisCycle(char1, towards) {
        const char1Ref = typeof char1 === "string" ? DE.characters[char1] : char1;
        const towardsRef = typeof towards === "string" ? DE.characters[towards] : towards;
        if (!char1Ref || !towardsRef) {
            console.warn(`Cannot check if bond has been shifted from ${char1} towards ${towards} because one of the characters was not found`);
            return false;
        }

        const alreadyShiftedPrimary = char1Ref.temp["alreadyShiftedBondPrimary_" + towardsRef.name] || 0;
        const alreadyShiftedSecondary = char1Ref.temp["alreadyShiftedBondSecondary_" + towardsRef.name] || 0;
        return alreadyShiftedPrimary !== 0 || alreadyShiftedSecondary !== 0;
    },
    triggerActionNext(action) {
        DE.internalState.NEXT_ACTIONS = DE.internalState.NEXT_ACTIONS || [];
        DE.internalState.NEXT_ACTIONS.push(action);
    },
    isStrangerTowards(char1, towards) {
        const char1Ref = typeof char1 === "string" ? DE.characters[char1] : char1;
        const towardsRef = typeof towards === "string" ? DE.characters[towards] : towards;
        if (!char1Ref || !towardsRef) {
            console.warn(`Cannot check if ${char1} is stranger towards ${towards} because one of the characters was not found`);
            return true;
        }
        const bond = DE.bonds[char1Ref.name].active.find(b => b.towards === towardsRef.name);
        return !bond || bond.stranger;
    },
    isAttractedTo(char1, potentialAttractiveChar2) {
        return DE.utils.isAttractedToWithReasoning(char1, potentialAttractiveChar2).attracted;
    },
    isAttractedToWithLevel(char1, potentialAttractiveChar2) {
        const attractionResult = DE.utils.isAttractedToWithReasoning(char1, potentialAttractiveChar2);
        return attractionResult.level;
    },
    isAttractedToWithLevelAsNumber(char1, potentialAttractiveChar2) {
        const attractionResult = DE.utils.isAttractedToWithReasoning(char1, potentialAttractiveChar2);
        switch (attractionResult.level) {
            case "slight":
                return 1;
            case "moderate":
                return 2;
            case "strong":
                return 3;
            default:
                return 0;
        }
    },
    //@ts-ignore typescript has no clue
    isAttractedToWithReasoning(char1, potentialAttractiveChar2) {
        const char1Ref = typeof char1 === "string" ? DE.characters[char1] : char1;
        const char2Ref = typeof potentialAttractiveChar2 === "string" ? DE.characters[potentialAttractiveChar2] : potentialAttractiveChar2;
        if (!char1Ref || !char2Ref) {
            return { attracted: false, reasoning: `Cannot check attraction from ${char1} towards ${potentialAttractiveChar2} because one of the characters was not found` };
        }

        if (char1Ref.attractions.length === 0) {
            return { attracted: false, reasoning: `Character ${char1Ref.name} is asexual and therefore not attracted to ${char2Ref.name}` };
        }

        if (!char1Ref.bonds) {
            console.warn(`Character ${char1Ref.name} does not have bonds property, cannot check attraction towards ${char2Ref.name}`);
            return { attracted: false, reasoning: `Character ${char1Ref.name} has no bonds and therefore cannot feel attraction towards ${char2Ref.name}` };
        }

        /**
         * @type {"slight" | "moderate" | "strong" | false}
         */
        let actuallyFeelsAttractionRegardless = false;
        const defaultAttraction = "moderate";

        const isFamilyMember = char1Ref.familyTies[char2Ref.name];

        if ((isFamilyMember && !char1Ref.bonds.bond2DoesNotTrackAttractionForFamily) && !char1Ref.bonds.bond2DoesNotTrackAttraction) {
            const bond2Value = DE.bonds[char1Ref.name].active.find(b => b.towards === char2Ref.name)?.bond2 || 0;
            if (bond2Value >= char1Ref.bonds.bond2Graduation.slight) {
                actuallyFeelsAttractionRegardless = "slight";
            }
            if (bond2Value >= char1Ref.bonds.bond2Graduation.moderate) {
                actuallyFeelsAttractionRegardless = "moderate";
            }
            if (bond2Value >= char1Ref.bonds.bond2Graduation.strong) {
                actuallyFeelsAttractionRegardless = "strong";
            }
        }

        let level = actuallyFeelsAttractionRegardless || defaultAttraction;

        // from here forwards

        let char1Attractions = (char1Ref.attractions || []).slice();

        char1Attractions = char1Attractions.filter(a => !a.speciesType || a.speciesType === char2Ref.speciesType);

        if (char1Attractions.length === 0) {
            const explanation = {
                "humanoid": "humans or humanoid creatures",
                "animal": "animals",
                "feral": "feral animalistic creatures of any kind",
            }
            if (actuallyFeelsAttractionRegardless) {
                return { level, attracted: true, reasoning: `Despite ${char1Ref.name} not being attracted to ${explanation[char2Ref.speciesType] || "unknown reason"}, ${char1Ref.name} still feels ${actuallyFeelsAttractionRegardless} sexual/romantic attraction towards ${char2Ref.name}` };
            }
            return { level: false, attracted: false, reasoning: `${char1Ref.name} is not romantically/sexually attracted to ${char2Ref.name} because  ${char1Ref.name} is not attracted to ${explanation[char2Ref.speciesType] || "unknown reason"}` };
        }

        char1Attractions = char1Attractions.filter(a => !a.species || a.species.includes(char2Ref.species));

        if (char1Attractions.length === 0) {
            if (actuallyFeelsAttractionRegardless) {
                return { level, attracted: true, reasoning: `Despite ${char1Ref.name} not being attracted to ${char2Ref.species} species, ${char1Ref.name} still feels ${actuallyFeelsAttractionRegardless} sexual/romantic attraction towards ${char2Ref.name}` };
            }
            return { level: false, attracted: false, reasoning: `${char1Ref.name} is not romantically/sexually attracted to ${char2Ref.name} because ${char1Ref.name} is not attracted to ${char2Ref.species} species` };
        }

        const oldChar1AttractionsBeforeAgeCheck = char1Attractions;
        char1Attractions = char1Attractions.filter(a => (char2Ref.ageYears >= a.ageRange[0] && char2Ref.ageYears <= a.ageRange[1]));

        if (char1Attractions.length === 0) {
            const isTooOld = char2Ref.ageYears > oldChar1AttractionsBeforeAgeCheck[0].ageRange[1];

            if (actuallyFeelsAttractionRegardless) {
                const ageReason = isTooOld ? `${char2Ref.name} being too old` : `${char2Ref.name} being too young`;
                return { level, attracted: true, reasoning: `Despite ${ageReason}, ${char1Ref.name} still feels ${actuallyFeelsAttractionRegardless} sexual/romantic attraction towards ${char2Ref.name}` };
            }
            if (isTooOld) {
                return { level, attracted: false, reasoning: `${char1Ref.name} is not romantically/sexually attracted to ${char2Ref.name} because ${char2Ref.name} is too old for them` };
            } else {
                return { level: false, attracted: false, reasoning: `${char1Ref.name} is not romantically/sexually attracted to ${char2Ref.name} because ${char2Ref.name} is too young for them` };
            }
        }

        char1Attractions = char1Attractions.filter(a => !a.towards || a.towards.includes(char2Ref.gender));

        if (char1Attractions.length === 0) {
            if (actuallyFeelsAttractionRegardless) {
                return { level, attracted: true, reasoning: `Despite ${char1Ref.name} not being attracted to ${char2Ref.name}'s gender being ${char2Ref.gender}, ${char1Ref.name} still feels ${actuallyFeelsAttractionRegardless} sexual/romantic attraction towards ${char2Ref.name}` };
            }
            return { level: false, attracted: false, reasoning: `${char1Ref.name} is not romantically/sexually attracted to ${char2Ref.name} because ${char1Ref.name} is not attracted to ${char2Ref.name} gender being ${char2Ref.gender}` };
        }

        char1Attractions = char1Attractions.filter(a => !a.sex || a.sex.includes(char2Ref.sex));

        if (char1Attractions.length === 0) {
            if (actuallyFeelsAttractionRegardless) {
                return { level, attracted: true, reasoning: `Despite ${char1Ref.name} not being attracted to ${char2Ref.name}'s biological sex being ${char2Ref.sex}, ${char1Ref.name} still feels ${actuallyFeelsAttractionRegardless} sexual/romantic attraction towards ${char2Ref.name}` };
            }
            return { level: false, attracted: false, reasoning: `${char1Ref.name} is not romantically/sexually attracted to ${char2Ref.name} because ${char1Ref.name} is not attracted to ${char2Ref.name} biological sex being ${char2Ref.sex}` };
        }

        char1Attractions = char1Attractions.filter(a => !a.race || a.race === char2Ref.race);

        if (char1Attractions.length === 0) {
            if (actuallyFeelsAttractionRegardless) {
                const raceReason = char1Ref.race ? `not being attracted to ${char2Ref.name}'s race being ${char2Ref.race}` : `${char2Ref.name} having no racial identity`;
                return { level, attracted: true, reasoning: `Despite ${raceReason}, ${char1Ref.name} still feels ${actuallyFeelsAttractionRegardless} sexual/romantic attraction towards ${char2Ref.name}` };
            }
            if (char1Ref.race) {
                return { level: false, attracted: false, reasoning: `${char1Ref.name} is not romantically/sexually attracted to ${char2Ref.name} because ${char1Ref.name} is not attracted to ${char2Ref.name} race being ${char2Ref.race}` };
            } else {
                return { level: false, attracted: false, reasoning: `${char1Ref.name} is not romantically/sexually attracted to ${char2Ref.name} because ${char2Ref.name} has no racial identity` };
            }
        }

        const beforeGroupBelongingFilterAttractions = char1Attractions;
        char1Attractions = char1Attractions.filter(a => !a.group || char2Ref.groupBelonging.includes(a.group));

        if (char1Attractions.length === 0) {
            const groupsThatMatter = [...new Set(beforeGroupBelongingFilterAttractions.map(a => a.group))].filter(g => g);
            if (actuallyFeelsAttractionRegardless) {
                // @ts-ignore
                const groupReason = groupsThatMatter.length === 1 ? `not belonging to the group of ${groupsThatMatter[0]}` : `not belonging to any of the following required groups: ${formatOrHelper(groupsThatMatter)}`;
                return { level, attracted: true, reasoning: `Despite ${groupReason}, ${char1Ref.name} still feels ${actuallyFeelsAttractionRegardless} sexual/romantic attraction towards ${char2Ref.name}` };
            }
            if (groupsThatMatter.length === 1) {
                return { level: false, attracted: false, reasoning: `${char1Ref.name} is not romantically/sexually attracted to ${char2Ref.name} because ${char2Ref.name} does not belong to the group of ${groupsThatMatter[0]}` };
            }
            // @ts-ignore
            return { level: false, attracted: false, reasoning: `${char1Ref.name} is not romantically/sexually attracted to ${char2Ref.name} because ${char2Ref.name} does not belong to any of the following required groups: ${formatOrHelper(groupsThatMatter)}` };
        }

        const minPickiness = Math.min(...char1Attractions.map(a => a.pickiness || 0));

        const tooUnattractive = char2Ref.attractiveness < minPickiness;

        if (tooUnattractive) {
            if (actuallyFeelsAttractionRegardless) {
                return { level, attracted: true, reasoning: `Despite ${char2Ref.name} not being attractive enough, ${char1Ref.name} still feels ${actuallyFeelsAttractionRegardless} sexual/romantic attraction towards ${char2Ref.name}` };
            }
            return { level: false, attracted: false, reasoning: `${char1Ref.name} is not romantically/sexually attracted to ${char2Ref.name} because they are not attractive enough for them` };
        }

        if (minPickiness > 0.65) {
            const tooUncharismatic = char2Ref.charisma < (minPickiness * 0.75);
            if (tooUncharismatic) {
                if (actuallyFeelsAttractionRegardless) {
                    return { level, attracted: true, reasoning: `Despite ${char2Ref.name} lacking charisma, ${char1Ref.name} still feels ${actuallyFeelsAttractionRegardless} sexual/romantic attraction towards ${char2Ref.name}` };
                }
                return { level: false, attracted: false, reasoning: `${char1Ref.name} is not romantically/sexually attracted to ${char2Ref.name} because ${char1Ref.name} lacks charisma` };
            }
        }

        const specialReason = char1Attractions.find(a => a.specialReason);

        // now we are in territory of attraction, now if they already have attraction but the attraction
        // would also exist even at low bond level, then we upgrade the attraction to strong because it's not based on both the bond
        // and the character's inherent preferences
        if (actuallyFeelsAttractionRegardless) {
            level = "strong";
        }

        const diffBetweenMinPickinessAndAttractiveness = minPickiness - char2Ref.attractiveness;
        // also upgrade to strong if the character is very attractive compared to the pickiness
        if (diffBetweenMinPickinessAndAttractiveness > 0.35) {
            level = "strong";
        }

        if (specialReason) {
            return { level, attracted: true, reasoning: `${char1Ref.name} is romantically/sexually attracted to ${char2Ref.name} because ${specialReason.specialReason}` };
        }

        return { level, attracted: true, reasoning: `${char1Ref.name} is romantically/sexually attracted to ${char2Ref.name}` };
    },
    async shiftState(character, stateName, shiftAmount, cap, causes) {
        if (shiftAmount === 0) {
            console.warn(`Shift amount is 0 when trying to shift state ${stateName} on character ${character}, skipping.`);
            return;
        }

        const characterRef = typeof character === "string" ? DE.characters[character] : character;
        if (!characterRef) {
            if (typeof character === "string") {
                console.warn(`Character with name ${character} not found when trying to shift state ${stateName}`);
            } else {
                console.warn(`Received null as character reference when trying to shift state ${stateName}`);
            }
            return;
        } else if (!characterRef.stateDefinitions[stateName]) {
            console.warn(`Character ${characterRef.name} does not have state ${stateName} when trying to shift it by ${shiftAmount}`);
            return;
        }

        const alreadyShiftedInfo = characterRef.temp["alreadyShifted_" + stateName] || 0;
        if (alreadyShiftedInfo !== 0) {
            // check if they are the same sign
            if ((alreadyShiftedInfo > 0 && shiftAmount > 0)) {
                // check if our new shift amount would be larger
                if (shiftAmount <= alreadyShiftedInfo) {
                    console.log(`Already shifted state ${stateName} on character ${characterRef.name} by ${alreadyShiftedInfo}, skipping shift by ${shiftAmount} because it's smaller or equal.`);
                    return;
                }
            } else if (alreadyShiftedInfo < 0 && shiftAmount < 0) {
                if (shiftAmount >= alreadyShiftedInfo) {
                    console.log(`Already shifted state ${stateName} on character ${characterRef.name} by ${alreadyShiftedInfo}, skipping shift by ${shiftAmount} because it's smaller or equal.`);
                    return;
                }
            }
        }

        const stateRef = characterRef.stateDefinitions[stateName];

        if (!stateRef) {
            console.warn(`Character ${characterRef.name} does not have state ${stateName}`);
            return;
        }

        let activeState = DE.stateFor[characterRef.name].states.find(s => s.state === stateName);

        const conflictingActiveStates = DE.stateFor[characterRef.name].states.filter(s => s.intensity > 0 && DE.characters[characterRef.name].stateDefinitions[s.state].conflictStates.includes(stateName));

        if (conflictingActiveStates.length > 0) {
            const defaultDominance = stateRef.dominance;
            const defaultDominanceAfterRelief = stateRef.dominanceAfterRelief || defaultDominance;

            const currentDominance = activeState ? (activeState.relieving ? defaultDominanceAfterRelief : defaultDominance) : -Infinity;
            const conflictingStateMaxDominance = Math.max(...conflictingActiveStates.map(s => {
                const sRef = DE.characters[characterRef.name].stateDefinitions[s.state];
                const sDominance = sRef.dominance;
                const sDominanceAfterRelief = sRef.dominanceAfterRelief || sDominance;
                return s.relieving ? sDominanceAfterRelief : sDominance;
            }));

            if (currentDominance < conflictingStateMaxDominance) {
                console.warn(`Cannot shift state ${stateName} on character ${characterRef.name} by ${shiftAmount} because of conflicting active states with higher dominance: ${conflictingActiveStates.map(s => s.state).join(", ")}`);
                return;
            }
        }

        let hasTriggeredIt = false;
        if (!activeState) {
            if (shiftAmount <= 0) {
                console.warn(`Character ${characterRef.name} does not have active state ${stateName} to decrease by ${shiftAmount}`);
                return;
            }

            activeState = {
                state: stateName,
                causes: null,
                intensity: 0,
                relieving: false,
                contiguousStartActivationCyclesAgo: 0,
                contiguousStartActivationTime: { ...DE.currentTime },
            };
            DE.stateFor[characterRef.name].states.push(activeState);
            hasTriggeredIt = true;
        }

        let hasRemovedIt = false;

        const newExpectedIntensity = activeState.intensity + shiftAmount - alreadyShiftedInfo;
        if (cap !== undefined && cap !== null) {
            if (newExpectedIntensity > cap) {
                shiftAmount = cap - activeState.intensity + alreadyShiftedInfo;
            }
        }

        activeState.intensity += shiftAmount - alreadyShiftedInfo;
        characterRef.temp["alreadyShifted_" + stateName] = shiftAmount;

        if (shiftAmount > 0) {
            if (activeState.causes && causes) {
                for (const causeToAdd of causes) {
                    const existingSameCause = activeState.causes.find(c => c.causant && c.causant.name === causeToAdd.causant?.name && c.causant?.type === causeToAdd.causant?.type && c.description === causeToAdd.description);
                    if (existingSameCause) {
                        if (existingSameCause.causant && existingSameCause.causant.type === "character") {
                            const apologizableRate = (causeToAdd.causant?.type === "character" && causeToAdd.causant?.apologizable) || 0;
                            if (existingSameCause.causant.apologizable > 0) {
                                existingSameCause.causant.apologizable /= (4 / (apologizableRate + 1));
                            }
                        }
                    } else {
                        activeState.causes.push(causeToAdd);
                    }
                }
            } else if (causes) {
                activeState.causes = causes;
            }
        } else if (causes && activeState.causes) {
            for (const causeToRemove of causes) {
                activeState.causes = activeState.causes.filter(c => !(c.causant && causeToRemove.causant && c.causant.name === causeToRemove.causant.name && c.causant.type === causeToRemove.causant.type && c.description === causeToRemove.description));
            }
        }

        if (activeState.intensity > 4) {
            activeState.intensity = 4;
        } else if (activeState.intensity <= 0) {
            // remove the state
            DE.stateFor[characterRef.name].states = DE.stateFor[characterRef.name].states.filter(s => s.state !== stateName);
            hasRemovedIt = true;
        }

        if (hasTriggeredIt) {
            await onStateTriggeredOnCharacter(DE, characterRef, stateName);
        } else if (hasRemovedIt) {
            await onStateRemovedOnCharacter(DE, characterRef, stateName);
        } else {
            const hasRelievingDynamic = !!stateRef.usesReliefDynamic;
            if (hasRelievingDynamic && shiftAmount < 0 && !activeState.relieving) {
                activeState.relieving = true;
                await onStateRelievedOnCharacter(DE, characterRef, stateName);
            }
        }
    },
    accumulateInCharacter(character, accumulatorName, amount) {
        const characterRef = typeof character === "string" ? DE.characters[character] : character;
        if (!characterRef) {
            if (typeof character === "string") {
                console.warn(`Character with name ${character} not found when trying to accumulate ${accumulatorName}`);
            } else {
                console.warn(`Received null as character reference when trying to accumulate ${accumulatorName}`);
            }
            return 0;
        }
        characterRef.state[accumulatorName] = (characterRef.state[accumulatorName] || 0) + amount;
        return characterRef.state[accumulatorName];
    },
    getAccumulatedValueInCharacter(character, accumulatorName) {
        const characterRef = typeof character === "string" ? DE.characters[character] : character;
        if (!characterRef) {
            if (typeof character === "string") {
                console.warn(`Character with name ${character} not found when trying to get accumulated value of ${accumulatorName}`);
            } else {
                console.warn(`Received null as character reference when trying to get accumulated value of ${accumulatorName}`);
            }
            return 0;
        }
        return characterRef.state[accumulatorName] || 0;
    },
    addCauseToState(character, stateName, cause) {
        const characterRef = typeof character === "string" ? DE.characters[character] : character;
        if (!characterRef) {
            if (typeof character === "string") {
                console.warn(`Character with name ${character} not found when trying to add cause to state ${stateName}`);
            } else {
                console.warn(`Received null as character reference when trying to add cause to state ${stateName}`);
            }
            return;
        }

        const activeState = DE.stateFor[characterRef.name].states.find(s => s.state === stateName);
        if (!activeState) {
            console.warn(`Character ${characterRef.name} does not have active state ${stateName} when trying to add cause`);
            return;
        }

        if (activeState.causes) {
            const existingSameCause = activeState.causes.find(c => c.causant && c.causant.name === cause.causant?.name && c.causant?.type === cause.causant?.type && c.description === cause.description);
            if (existingSameCause) {
                if (existingSameCause.causant && existingSameCause.causant.type === "character") {
                    const apologizableRate = (cause.causant?.type === "character" && cause.causant?.apologizable) || 0;
                    if (existingSameCause.causant.apologizable > 0) {
                        existingSameCause.causant.apologizable /= (4 / (apologizableRate + 1));
                    }
                }
            } else {
                activeState.causes.push(cause);
            }
        } else {
            activeState.causes = [cause];
        }
    },
    removeCauseFromState(character, stateName, cause) {
        const characterRef = typeof character === "string" ? DE.characters[character] : character;
        if (!characterRef) {
            if (typeof character === "string") {
                console.warn(`Character with name ${character} not found when trying to remove cause from state ${stateName}`);
            } else {
                console.warn(`Received null as character reference when trying to remove cause from state ${stateName}`);
            }
            return;
        }
        const activeState = DE.stateFor[characterRef.name].states.find(s => s.state === stateName);
        if (!activeState) {
            console.warn(`Character ${characterRef.name} does not have active state ${stateName} when trying to remove cause`);
            return;
        }
        if (activeState.causes) {
            activeState.causes = activeState.causes.filter(c => !(c.causant && cause && c.causant.name === cause.causant?.name && c.causant.type === cause.causant?.type && c.description === cause.description));
            if (activeState.causes.length === 0) {
                activeState.causes = null;
            }
        }
    },
    removeCausantFromState(character, stateName, causant, causantType) {
        const characterRef = typeof character === "string" ? DE.characters[character] : character;
        if (!characterRef) {
            if (typeof character === "string") {
                console.warn(`Character with name ${character} not found when trying to remove causant from state ${stateName}`);
            } else {
                console.warn(`Received null as character reference when trying to remove causant from state ${stateName}`);
            }
            return;
        }
        const activeState = DE.stateFor[characterRef.name].states.find(s => s.state === stateName);
        if (!activeState) {
            console.warn(`Character ${characterRef.name} does not have active state ${stateName} when trying to remove causant`);
            return;
        }
        if (activeState.causes) {
            activeState.causes = activeState.causes.filter(c => !(c.causant && c.causant.name === causant && c.causant.type === causantType));
        }
    },
    newTrigger(character, trigger) {
        const characterRef = typeof character === "string" ? DE.characters[character] : character;
        if (!characterRef) {
            if (typeof character === "string") {
                console.warn(`Character with name ${character} not found when trying to create trigger`);
            } else {
                console.warn(`Received null as character reference when trying to create trigger`);
            }
            return;
        }
        // Add the trigger to the character's state or handle it as needed

        characterRef.triggers.push(trigger);
    },
    newTriggerInAllCharacters(trigger) {
        Object.values(DE.characters).forEach((character) => {
            DE.utils.newTrigger(character, trigger);
        });
    },
    charHasState(character, stateName) {
        const characterName = typeof character === "string" ? character : character.name;
        const characterState = DE.stateFor[characterName];
        if (!characterState) {
            console.warn(`Character state for ${characterName} not found when checking for state ${stateName}`);
            return false;
        }
        return characterState.states.some(s => s.state === stateName && s.intensity > 0);
    },
    charIsRelievingState(character, stateName) {
        const characterName = typeof character === "string" ? character : character.name;
        const characterState = DE.stateFor[characterName];
        if (!characterState) {
            console.warn(`Character state for ${characterName} not found when checking if relieving state ${stateName}`);
            return false;
        }
        const stateInfo = characterState.states.find(s => s.state === stateName);
        if (!stateInfo) {
            return false;
        }
        return stateInfo.relieving;
    },

    templateUtils: {
        breakDownCharactersAndCausesTemplate(info) {
            return async (info2) => {
                let base = typeof info.base === "string" ? info.base : info.base({
                    char: info2.char,
                });

                if (info2.causes) {
                    /**
                     * @type {string[]}
                     */
                    const causants = [];
                    /**
                     * @type {Record<string, string[]>}
                     */
                    const causesPerCausant = {};
                    info2.causes.forEach(cause => {
                        if (cause.causant) {
                            if (!causesPerCausant[cause.causant.name]) {
                                causesPerCausant[cause.causant.name] = [];
                            }
                            causesPerCausant[cause.causant.name].push(cause.description);
                            if (!causants.includes(cause.causant.name)) {
                                causants.push(cause.causant.name);
                            }
                        }
                    });

                    for (let i = 0; i < causants.length; i++) {
                        const causant = causants[i];
                        const other = DE.characters[causant];
                        const otherFamilyRelationship = DE.characters[info2.char.name].familyTies[causant];
                        const otherRelationship = await getRelationship(DE, info2.char, other);
                        const descriptionForThatCausant = typeof info.perOther === "string" ? info.perOther : await info.perOther({
                            char: info2.char,
                            other: DE.characters[causant],
                            otherFamilyRelation: otherFamilyRelationship.relation,
                            otherRelationship: otherRelationship,
                        });
                        if (base) {
                            base += "\n\n";
                        }
                        base += descriptionForThatCausant;

                        if (causesPerCausant[causant].length > 1) {
                            base += `. Reasons: ${info2.char.name} `;
                            base += DE.utils.templateUtils.formatAnd(causesPerCausant[causant]);
                            base += `, by ${other.name}`;
                        }
                    }
                }

                if (info2.causes) {
                    /**
                     * @type {string[]}
                     */
                    const causants = [];
                    /**
                     * @type {Record<string, string[]>}
                     */
                    const causesPerCausant = {};
                    info2.causes.forEach(cause => {
                        if (cause.causant && cause.causant.type === "object") {
                            if (!causesPerCausant[cause.causant.name]) {
                                causesPerCausant[cause.causant.name] = [];
                            }
                            causesPerCausant[cause.causant.name].push(cause.description);
                            if (!causants.includes(cause.causant.name)) {
                                causants.push(cause.causant.name);
                            }
                        }
                    });

                    for (let i = 0; i < causants.length; i++) {
                        const causant = causants[i];
                        const descriptionForThatCausant = typeof info.perObject === "string" ? info.perObject : await info.perObject({
                            char: info2.char,
                            item: causant,
                        });
                        if (base) {
                            base += "\n\n";
                        }
                        base += descriptionForThatCausant;

                        if (causesPerCausant[causant].length > 1) {
                            base += `. Reasons: ${info2.char.name} `;
                            base += DE.utils.templateUtils.formatAnd(causesPerCausant[causant]);
                            base += `, by/with the object: ${causant}`;
                        }
                    }
                }

                return base;
            }
        },
        allWorldCharacters() {
            return Object.keys(DE.stateFor).filter((charName) => !DE.stateFor[charName].deadEnded).map(name => DE.characters[name]);
        },
        allWorldCharactersButUser() {
            return Object.keys(DE.stateFor).filter(name => name !== DE.user.name && !DE.stateFor[name].deadEnded).map(name => DE.characters[name]);
        },
        currentLocation() {
            return DE.world.currentLocation;
        },
        currentLocationIsInVehicle() {
            return !!DE.world.locations[DE.world.currentLocation]?.vehicleType || false;
        },
        currentLocationIsSafe() {
            return DE.world.locations[DE.world.currentLocation]?.isSafe || false;
        },
        allCharactersAtLocation(locationName) {
            const result = [];
            for (const member of Object.keys(DE.stateFor)) {
                if (DE.stateFor[member].location === locationName) {
                    const charRef = DE.characters[member];
                    if (charRef) result.push(charRef);
                }
            }
            return result;
        },
        locationIsVehicle(locationName) {
            return !!DE.world.locations[locationName]?.vehicleType || false;
        },
        locationIsSafe(locationName) {
            return DE.world.locations[locationName]?.isSafe || false;
        },
        getLastStateCausants(char, stateName) {
            return removeDuplicatesHelper(getCausantsHelperLocal(DE, char, stateName).map(c => c.name));
        },
        getLastStateCharacterCausants(char, stateName) {
            return removeDuplicatesHelper(getCausantsHelperLocal(DE, char, stateName).filter(c => c.type === "character").map(c => c.name));
        },
        getLastStateObjectCausants(char, stateName) {
            return getCausantsHelperLocal(DE, char, stateName).filter(c => c.type === "object").map(c => c.name);
        },
        getStates(char) {
            return DE.stateFor[char.name].states.map(s => s.state);
        },
        getStateIntensity(char, stateName) {
            const stateObject = DE.stateFor[char.name].states.find(s => s.state === stateName);
            return stateObject ? stateObject.intensity : 0;
        },
        hasState(char, stateName) {
            return DE.stateFor[char.name].states.some(s => s.state === stateName);
        },
        stateHasJustActivated(char, stateName) {
            const stateObject = DE.stateFor[char.name].states.find(s => s.state === stateName);
            if (!stateObject) return false;
            return stateObject.contiguousStartActivationCyclesAgo === 0;
        },
        getStateActivationCyclesAgo(char, stateName) {
            const stateObject = DE.stateFor[char.name].states.find(s => s.state === stateName);
            if (!stateObject) {
                const stateHistory = [...DE.stateFor[char.name].history, DE.stateFor[char.name]];
                let cycle = -1;
                for (let i = stateHistory.length - 1; i >= 0; i--) {
                    cycle++;
                    const entry = stateHistory[i];
                    const historicalStateObject = entry.states.find(s => s.state === stateName);
                    if (historicalStateObject) {
                        return cycle + historicalStateObject.contiguousStartActivationCyclesAgo;
                    }
                }
                return -1;
            }
            return stateObject.contiguousStartActivationCyclesAgo;
        },
        getSocialGroup(char, minBondLevel, maxBondLevel, min2BondLevel, max2BondLevel) {
            return DE.bonds[char.name].active.filter(bond => {
                return bond.bond >= minBondLevel && bond.bond <= maxBondLevel && bond.bond2 >= min2BondLevel && bond.bond2 <= max2BondLevel;
            }).map(bond => bond.towards);
        },
        getPresentSocialGroup(char, minBondLevel, maxBondLevel, min2BondLevel, max2BondLevel) {
            const currentLocation = DE.world.currentLocation;
            const socialGroup = DE.bonds[char.name].active.filter(bond => {
                return bond.bond >= minBondLevel && bond.bond <= maxBondLevel && bond.bond2 >= min2BondLevel && bond.bond2 <= max2BondLevel;
            }).map(bond => bond.towards);
            return socialGroup.filter(memberName => DE.stateFor[memberName].location === currentLocation);
        },
        getPresentConversingSocialGroup(char, minBondLevel, maxBondLevel, min2BondLevel, max2BondLevel) {
            if (minBondLevel === -100 && maxBondLevel === 100 && min2BondLevel === 0 && max2BondLevel === 100) {
                const conversationId = DE.stateFor[char.name].conversationId;
                if (!conversationId) return [];
                return DE.conversations[conversationId].participants.filter(memberName => memberName !== char.name);
            }
            const conversationId = DE.stateFor[char.name].conversationId;
            if (!conversationId) return [];
            const socialGroup = DE.bonds[char.name].active.filter(bond => {
                return bond.bond >= minBondLevel && bond.bond <= maxBondLevel && bond.bond2 >= min2BondLevel && bond.bond2 <= max2BondLevel;
            }).map(bond => bond.towards);
            return DE.conversations[conversationId].participants.filter(memberName => socialGroup.includes(memberName));
        },
        getDifferenceOfPresentSocialGroup(char, list) {
            const currentLocation = DE.world.currentLocation;
            const socialGroup = DE.bonds[char.name].active.map(bond => bond.towards);
            const presentSocialGroup = socialGroup.filter(memberName => DE.stateFor[memberName].location === currentLocation);
            return list.filter(name => !presentSocialGroup.includes(name));
        },
        getExSocialGroup(char, minBondLevel, maxBondLevel, min2BondLevel, max2BondLevel) {
            return DE.bonds[char.name].ex.filter(bond => {
                return bond.bond >= minBondLevel && bond.bond <= maxBondLevel && bond.bond2 >= min2BondLevel && bond.bond2 <= max2BondLevel;
            }).map(bond => bond.towards);
        },
        getCarryWeight(char) {
            return getCharacterWeight(DE, char.name).weight;
        },
        getCarryVolume(char) {
            return getCharacterVolume(DE, char.name).volume;
        },
        getPowerLevel(char) {
            return getPowerLevelFromCharacter(char);
        },
        getTier(char) {
            return char.tier;
        },
        getTierValue(char) {
            return char.tierValue;
        },
        isDead(char) {
            return DE.stateFor[char.name].dead;
        },
        getChar(potentialCharacter) {
            return DE.characters[potentialCharacter] || null;
        },
        isUser(char) {
            return DE.user.name === char.name;
        },
        isPresentMember(char) {
            const currentLocation = DE.world.currentLocation;
            return DE.stateFor[char.name].location === currentLocation;
        },
        isNotPresent(char) {
            const currentLocation = DE.world.currentLocation;
            return DE.stateFor[char.name].location !== currentLocation;
        },
        isGone(char) {
            const exbonds = DE.bonds[char.name]?.ex;
            if (!exbonds) return false;
            return exbonds.length > 0;
        },
        isInConversation(char) {
            const conversationId = DE.stateFor[char.name].conversationId;
            return !!conversationId;
        },
        isIndoors(char) {
            const locationOfChar = DE.stateFor[char.name].location;
            const locationInfo = DE.world.locations[locationOfChar];
            return locationInfo ? locationInfo.isIndoors : false;
        },
        isOutdoors(char) {
            const locationOfChar = DE.stateFor[char.name].location;
            const locationInfo = DE.world.locations[locationOfChar];
            return locationInfo ? !locationInfo.isIndoors : false;
        },
        hasItem(char, itemName) {
            return DE.stateFor[char.name].carrying.find(item => item.name === itemName) !== undefined;
        },
        getPosture(char) {
            return DE.stateFor[char.name].posture;
        },
        lastSaw(char) {
            const surroundingCharacters = getSurroundingCharacters(DE, char.name);
            if (surroundingCharacters.nonStrangers.length > 0) {
                return DE.stateFor[char.name].location;
            }
            const charHistory = DE.stateFor[char.name].history;
            for (let i = charHistory.length - 1; i >= 0; i--) {
                const entry = charHistory[i];
                if (entry.surroundingNonStrangers.length > 0) {
                    return entry.location;
                }
            }
            return "";
        },
        hasNoIdeaWhereIs(char) {
            const surroundingCharacters = getSurroundingCharacters(DE, char.name);
            if (surroundingCharacters.nonStrangers.length > 0) {
                return false;
            }
            let shouldBeAt = null;
            const charHistory = DE.stateFor[char.name].history;
            let foundAtIndex = -1;
            for (let i = charHistory.length - 1; i >= 0; i--) {
                const entry = charHistory[i];
                if (entry.surroundingNonStrangers.length > 0) {
                    shouldBeAt = entry.location;
                    foundAtIndex = i;
                    break;
                }
            }
            if (!shouldBeAt) return false;
            if (DE.stateFor[char.name].location === shouldBeAt) return true;
            for (let j = foundAtIndex + 1; j < charHistory.length; j++) {
                if (charHistory[j].location === shouldBeAt) return true;
            }
            return false;
        },
        doesNotKnow(char) {
            const bonds = DE.bonds[char.name].active;
            return bonds.length === 0;
        },
        isStrangersWith(char, towardsChar) {
            const bonds = DE.bonds[char.name].active;
            for (const bond of bonds) {
                if (bond.towards === towardsChar.name && bond.stranger) {
                    return true;
                }
            }
            return false;
        },
        getBondTowards(char, towardsChar) {
            const bonds = DE.bonds[char.name].active;
            for (const bond of bonds) {
                if (bond.towards === towardsChar.name) {
                    return bond.bond;
                }
            }
            return 0;
        },
        getSecondaryBondTowards(char, towardsChar) {
            const bonds = DE.bonds[char.name].active;
            for (const bond of bonds) {
                if (bond.towards === towardsChar.name) {
                    return bond.bond2;
                }
            }
            return 0;
        },
        isAtSameLocation(char, char2) {
            return DE.stateFor[char.name].location === DE.stateFor[char2.name].location;
        },
        isAtSameSlot(char, char2) {
            return DE.stateFor[char.name].location === DE.stateFor[char2.name].location &&
                DE.stateFor[char.name].locationSlot === DE.stateFor[char2.name].locationSlot;
        },
        isHere(char) {
            return DE.stateFor[char.name].location === DE.world.currentLocation;
        },
        formatAnd(list) {
            return formatAndHelper(list);
        },
        formatCommaList(list) {
            if (!list || !Array.isArray(list)) return "";
            return list.join(', ');
        },
        formatOr(list) {
            return formatOrHelper(list);
        },
        formatVerbToBe(chars) {
            return getPronounHelperLocal(DE, chars, "are", "is", "is", "is");
        },
        formatPluralOrSingular(chars, plural, singular) {
            if (chars.length === 1) return singular;
            return plural;
        },
        formatObjectPronoun(chars) {
            return getPronounHelperLocal(DE, chars, "them", "him", "her", "them");
        },
        formatPossessive(chars) {
            return getPronounHelperLocal(DE, chars, "their", "his", "her", "their");
        },
        formatReflexive(chars) {
            return getPronounHelperLocal(DE, chars, "themselves", "himself", "herself", "themself");
        },
        formatPronoun(chars) {
            return getPronounHelperLocal(DE, chars, "they", "he", "she", "they");
        },
        formatOwnershipPronoun(chars) {
            return getPronounHelperLocal(DE, chars, "theirs", "his", "hers", "theirs");
        },
        getRandomSeedFromString(optionsNumber, inputString) {
            return generateIntSeedFromString(optionsNumber, inputString);
        },
        getRandomSeedFromTime(optionsNumber) {
            const currentTimeString = DE.currentTime.time.toString();
            return generateIntSeedFromString(optionsNumber, currentTimeString);
        },
        getRandomOption(options) {
            const result = weightedRandomByLikelihood(options.map(option => ({ item: option, likelihood: 1 })), generateIntSeedFromString(1000000, DE.currentTime.time.toString()));
            return result ? result.item : options[0];
        },
        getRandomOptionFixedCharacter(char, options) {
            const result = weightedRandomByLikelihood(options.map(option => ({ item: option, likelihood: 1 })), generateIntSeedFromString(1000000, char.name));
            return result ? result.item : options[0];
        },
    }
});

/**
 * 
 * @param {DEObject} DE 
 * @param {DECompleteCharacterReference} character 
 * @param {string} stateName 
 * @param {DECharacterStateDefinition} stateDefinition
 * @return {DECharacterStateDefinition}
 */
function defineStateInCharacter(DE, character, stateName, stateDefinition) {
    if (character.stateDefinitions[stateName]) {
        console.warn(`Character ${character.name} already has a state named ${stateName}`);
    }
    character.stateDefinitions[stateName] = stateDefinition;
    return character.stateDefinitions[stateName];
}

/**
 * 
 * @param {DEObject} DE 
 * @param {string} content 
 */
function makeUserStoryMasterMessage(DE, content) {
    DE.internalState.ADD_STORY_MASTER_MESSAGES = DE.internalState.ADD_STORY_MASTER_MESSAGES || [];
    DE.internalState.ADD_STORY_MASTER_MESSAGES.push({ type: "user", content });
}

/**
 * @param {DEObject} DE
 */
function markGameOver(DE) {
    DE.internalState.GAME_OVER = true;
}

/**
 * 
 * @param {DEObject} DE 
 * @param {string} content 
 */
function makeStoryMasterMessage(DE, content) {
    DE.internalState.ADD_STORY_MASTER_MESSAGES = DE.internalState.ADD_STORY_MASTER_MESSAGES || [];
    DE.internalState.ADD_STORY_MASTER_MESSAGES.push({ type: "everyone", content });
}

/**
 * @param {DEObject} deObject
 * @param {DECompleteCharacterReference} character 
 * @param {string} stateName 
 */
async function onStateTriggeredOnCharacter(deObject, character, stateName) {
    const characterState = deObject.stateFor[character.name];
    if (!characterState) {
        throw new Error(`Character state for ${character.name} not found.`);
    }
    const characterStateInfo = characterState.states.find(s => s.state === stateName);
    if (!characterStateInfo) {
        throw new Error(`Character ${character.name} does not have state ${stateName} active.`);
    }

    const characterStateDescription = character.stateDefinitions[stateName];
    if (!characterStateDescription) {
        throw new Error(`Character ${character.name} does not have state description for ${stateName}.`);
    }

    // if the new state triggered is from the user, make a message about it
    if (deObject.user && deObject.user.name === character.name) {
        let stateDescriptionText = typeof characterStateDescription.general === "string" ? characterStateDescription.general : await characterStateDescription.general({
            char: character,
            causes: characterStateInfo.causes,
        });
        if (!stateDescriptionText.endsWith(".")) {
            stateDescriptionText += ".";
        }
        makeUserStoryMasterMessage(deObject, `${deObject.user.name} is now being affected by the state: ${stateName.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ")}.\n${stateDescriptionText}`);
    }

    // now check for states that triggered by this one
    if (characterStateDescription.triggersStates) {
        // start triggering them
        for (const triggeredState of Object.keys(characterStateDescription.triggersStates)) {
            // get the intensity to trigger with
            const withIntensity = characterStateDescription.triggersStates[triggeredState].intensity || 1.0;
            console.log(`State ${stateName} triggered on character ${character.name}, triggering state ${triggeredState} with intensity ${withIntensity}.`);

            // check if it is already active
            const alreadyActivatedInfo = deObject.stateFor[character.name].states.find(s => s.state === triggeredState);
            if (alreadyActivatedInfo) {
                console.log(`State ${triggeredState} already active on character ${character.name}, cannot trigger.`);
            } else {
                // otherwise, activate it

                /**
                 * @type {DEApplyingState}
                 */
                const state = {
                    causes: characterStateInfo.causes,
                    state: triggeredState,
                    intensity: withIntensity,
                    relieving: false,
                    contiguousStartActivationCyclesAgo: 0,
                    contiguousStartActivationTime: { ...deObject.currentTime },
                }
                deObject.stateFor[character.name].states.push(state);

                console.log(`State ${triggeredState} activated on character ${character.name} with intensity ${withIntensity}.`);

                await onStateTriggeredOnCharacter(deObject, character, triggeredState);
            }
        }
    }

    // check for states to modify
    if (characterStateDescription.modifiesStatesIntensitiesOnTrigger) {
        for (const toModifyState of Object.keys(characterStateDescription.modifiesStatesIntensitiesOnTrigger)) {
            const withIntensity = characterStateDescription.modifiesStatesIntensitiesOnTrigger[toModifyState].intensity || -1.0;
            console.log(`State ${stateName} triggered on character ${character.name}, modifying state ${toModifyState} with intensity ${withIntensity}.`);

            const alreadyActivatedInfo = deObject.stateFor[character.name].states.find(s => s.state === toModifyState);
            if (!alreadyActivatedInfo) {
                console.log(`State ${toModifyState} not active on character ${character.name}, cannot modify.`);
            } else {
                const stateDescriptionSpecific = character.stateDefinitions[toModifyState];

                // modify intensity
                alreadyActivatedInfo.intensity += withIntensity;
                if (alreadyActivatedInfo.intensity > 4) {
                    alreadyActivatedInfo.intensity = 4;
                }

                // check for relief dynamics
                if (stateDescriptionSpecific && stateDescriptionSpecific.usesReliefDynamic && withIntensity < 0) {
                    // if the intensity is being reduced, set relieving to true
                    alreadyActivatedInfo.relieving = true;

                    // if the intensity is still above 0, trigger relief event
                    if (alreadyActivatedInfo.intensity > 0) {
                        console.log(`State ${toModifyState} intensity modified on character ${character.name} by ${withIntensity}, now relieving.`);
                        await onStateRelievedOnCharacter(deObject, character, toModifyState);
                    }
                }

                // if the intensity is now 0 or below, remove the state
                if (alreadyActivatedInfo.intensity <= 0) {
                    // remove the state
                    deObject.stateFor[character.name].states = deObject.stateFor[character.name].states.filter(s => s.state !== toModifyState);
                    console.log(`State ${toModifyState} intensity modified on character ${character.name} by ${withIntensity}, now removed.`);
                    await onStateRemovedOnCharacter(deObject, character, toModifyState);
                }
            }
        }
    }

    // DETERMINE if we activated any state with a dead-end trigger
    const deadEndPotential = !characterStateDescription.triggersDeadEnd ? "" : (typeof characterStateDescription.triggersDeadEnd === "string" ? characterStateDescription.triggersDeadEnd :
        (await characterStateDescription.triggersDeadEnd({
            char: character,
            causes: characterStateInfo.causes,
        })).trim());
    if (deadEndPotential) {
        console.log(`State ${stateName} on character ${character.name} triggers dead-end, the character will now be removed from the story.`);
        deObject.stateFor[character.name].deadEnded = true;
        deObject.stateFor[character.name].deadEndReason = deadEndPotential;
        if (characterStateDescription.deadEndIsDeath) {
            console.log(`Character ${character.name} has died due to state ${stateName}.`);
            deObject.stateFor[character.name].dead = true;
        }

        if (character.name === deObject.user.name) {
            console.log(`The user character ${character.name} has reached a dead-end: ${deadEndPotential}, game over.`);

            if (characterStateDescription.deadEndIsDeath) {
                makeUserStoryMasterMessage(deObject, `${character.name} has died: ${deadEndPotential}.`);
            } else {
                makeUserStoryMasterMessage(deObject, `${character.name} has reached a dead-end and is thus removed from the story: ${deadEndPotential}.`);
            }

            markGameOver(deObject);
        }
    }
}

/**
 * @param {DEObject} deObject
 * @param {DECompleteCharacterReference} character 
 * @param {string} stateName 
 */
export async function onStateRemovedOnCharacter(deObject, character, stateName) {
    if (deObject.user && deObject.user.name === character.name) {
        makeUserStoryMasterMessage(deObject, `${deObject.user.name} is no longer affected by the state: ${stateName.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ")}.`);
    }

    const characterState = deObject.stateFor[character.name];
    if (!characterState) {
        throw new Error(`Character state for ${character.name} not found.`);
    }
    const characterStateInfo = characterState.states.find(s => s.state === stateName);
    if (!characterStateInfo) {
        throw new Error(`Character ${character.name} does not have state ${stateName} active.`);
    }
    const characterStateDescription = character.stateDefinitions[stateName];
    if (!characterStateDescription) {
        throw new Error(`Character ${character.name} does not have state description for ${stateName}.`);
    }

    // check if we trigger states on removal
    if (characterStateDescription.triggersStatesOnRemove) {
        // check out the options we are given
        for (const triggeredState of Object.keys(characterStateDescription.triggersStatesOnRemove)) {
            const withIntensity = characterStateDescription.triggersStatesOnRemove[triggeredState].intensity || 1.0;
            console.log(`State ${stateName} removed from character ${character.name}, triggering state ${triggeredState} with intensity ${withIntensity}.`);

            const alreadyActivatedInfo = deObject.stateFor[character.name].states.find(s => s.state === triggeredState);
            if (alreadyActivatedInfo) {
                console.log(`State ${triggeredState} already active on character ${character.name}, cannot trigger.`);
            } else {
                /**
                 * @type {DEApplyingState}
                 */
                const state = {
                    causes: characterStateInfo.causes,
                    state: triggeredState,
                    intensity: withIntensity,
                    relieving: false,
                    contiguousStartActivationCyclesAgo: 0,
                    contiguousStartActivationTime: { ...deObject.currentTime },
                }
                deObject.stateFor[character.name].states.push(state);

                console.log(`State ${triggeredState} activated on character ${character.name} with intensity ${withIntensity}.`);

                await onStateTriggeredOnCharacter(deObject, character, triggeredState);
            }
        }
    }

    // check for states to modify on remove
    if (characterStateDescription.modifiesStatesIntensitiesOnRemove) {
        for (const toModifyState of Object.keys(characterStateDescription.modifiesStatesIntensitiesOnRemove)) {
            const withIntensity = characterStateDescription.modifiesStatesIntensitiesOnRemove[toModifyState].intensity || -1.0;
            console.log(`State ${stateName} removed from character ${character.name}, modifying state ${toModifyState} with intensity ${withIntensity}.`);

            const alreadyActivatedInfo = deObject.stateFor[character.name].states.find(s => s.state === toModifyState);
            if (!alreadyActivatedInfo) {
                console.log(`State ${toModifyState} not active on character ${character.name}, cannot modify.`);
            } else {
                const stateDescriptionSpecific = character.stateDefinitions[toModifyState];

                alreadyActivatedInfo.intensity += withIntensity;
                if (alreadyActivatedInfo.intensity > 4) {
                    alreadyActivatedInfo.intensity = 4;
                }

                if (stateDescriptionSpecific && stateDescriptionSpecific.usesReliefDynamic && withIntensity < 0) {
                    alreadyActivatedInfo.relieving = true;

                    if (alreadyActivatedInfo.intensity > 0) {
                        console.log(`State ${toModifyState} intensity modified on character ${character.name} by ${withIntensity}, now relieving.`);
                        await onStateRelievedOnCharacter(deObject, character, toModifyState);
                    }
                }

                if (alreadyActivatedInfo.intensity <= 0) {
                    // remove the state
                    deObject.stateFor[character.name].states = deObject.stateFor[character.name].states.filter(s => s.state !== toModifyState);
                    console.log(`State ${toModifyState} intensity modified on character ${character.name} by ${withIntensity}, now removed.`);
                    await onStateRemovedOnCharacter(deObject, character, toModifyState);
                }
            }
        }
    }
}

/**
 * @param {DEObject} deObject
 * @param {DECompleteCharacterReference} character 
 * @param {string} stateName 
 */
export async function onStateRelievedOnCharacter(deObject, character, stateName) {
    const characterState = deObject.stateFor[character.name];
    if (!characterState) {
        throw new Error(`Character state for ${character.name} not found.`);
    }
    const characterStateInfo = characterState.states.find(s => s.state === stateName);
    if (!characterStateInfo) {
        throw new Error(`Character ${character.name} does not have state ${stateName} active.`);
    }
    const characterStateDescription = character.stateDefinitions[stateName];
    if (!characterStateDescription) {
        throw new Error(`Character ${character.name} does not have state description for ${stateName}.`);
    }

    // if the new state triggered is from the user, make a message about it
    if (deObject.user && deObject.user.name === character.name) {
        let stateDescriptionText = ".\n";

        if (characterStateDescription.relieving && stateDescriptionText) {
            stateDescriptionText += typeof characterStateDescription.relieving === "string" ? characterStateDescription.relieving : (await characterStateDescription.relieving({
                char: character,
                causes: characterStateInfo.causes,
            })).trim();
            if (!stateDescriptionText.endsWith(".")) {
                stateDescriptionText += ".";
            }
        } else {
            stateDescriptionText = "";
        }

        makeUserStoryMasterMessage(deObject, `${deObject.user.name} is has begun to relieve: ${stateName.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ")}${stateDescriptionText}`);
    }

    // states triggered when relieving starts
    if (characterStateDescription.triggersStatesOnRelieve) {
        for (const triggeredState of Object.keys(characterStateDescription.triggersStatesOnRelieve)) {
            const withIntensity = characterStateDescription.triggersStatesOnRelieve[triggeredState].intensity || 1.0;
            console.log(`State ${stateName} relieved on character ${character.name}, triggering state ${triggeredState} with intensity ${withIntensity}.`);

            const alreadyActivatedInfo = deObject.stateFor[character.name].states.find(s => s.state === triggeredState);
            if (alreadyActivatedInfo) {
                console.log(`State ${triggeredState} already active on character ${character.name}, cannot trigger.`);
            } else {
                /**
                 * @type {DEApplyingState}
                 */
                const state = {
                    causes: characterStateInfo.causes,
                    state: triggeredState,
                    intensity: withIntensity,
                    relieving: false,
                    contiguousStartActivationCyclesAgo: 0,
                    contiguousStartActivationTime: { ...deObject.currentTime },
                }
                deObject.stateFor[character.name].states.push(state);

                console.log(`State ${triggeredState} activated on character ${character.name} with intensity ${withIntensity}.`);

                await onStateTriggeredOnCharacter(deObject, character, triggeredState);
            }
        }
    }
    if (characterStateDescription.modifiesStatesIntensitiesOnRelieve) {
        for (const toModifyState of Object.keys(characterStateDescription.modifiesStatesIntensitiesOnRelieve)) {
            const withIntensity = characterStateDescription.modifiesStatesIntensitiesOnRelieve[toModifyState].intensity || -1.0;
            console.log(`State ${stateName} relieved on character ${character.name}, modifying state ${toModifyState} with intensity ${withIntensity}.`);

            const alreadyActivatedInfo = deObject.stateFor[character.name].states.find(s => s.state === toModifyState);
            if (!alreadyActivatedInfo) {
                console.log(`State ${toModifyState} not active on character ${character.name}, cannot modify.`);
            } else {
                const stateDescriptionSpecific = character.stateDefinitions[toModifyState];

                alreadyActivatedInfo.intensity += withIntensity;
                if (alreadyActivatedInfo.intensity > 4) {
                    alreadyActivatedInfo.intensity = 4;
                }

                if (stateDescriptionSpecific && stateDescriptionSpecific.usesReliefDynamic && withIntensity < 0) {
                    alreadyActivatedInfo.relieving = true;

                    if (alreadyActivatedInfo.intensity > 0) {
                        console.log(`State ${toModifyState} intensity modified on character ${character.name} by ${withIntensity}, now relieving.`);
                        await onStateRelievedOnCharacter(deObject, character, toModifyState);
                    }
                }

                if (alreadyActivatedInfo.intensity <= 0) {
                    // remove the state
                    deObject.stateFor[character.name].states = deObject.stateFor[character.name].states.filter(s => s.state !== toModifyState);
                    console.log(`State ${toModifyState} intensity modified on character ${character.name} by ${withIntensity}, now removed.`);
                    await onStateRemovedOnCharacter(deObject, character, toModifyState);
                }
            }
        }
    }
}