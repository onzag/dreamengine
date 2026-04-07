import { getSurroundingCharacters, getPowerLevelFromCharacter } from "./util/character-info.js";
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
 * @param {DEObject} DE
 * @param {DECompleteCharacterReference} character
 * @param {string} stateName
 * @returns {DEStateCausant[]}
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
    if (stateEntry?.causants === null) {
        console.warn(`State ${actualStateName} does not track causants for character ${character.name}`);
        return [];
    }
    return stateEntry?.causants || [];
}

/**
 * @type {DEUtils}
 */
export const deEngineUtils = {
    newGlobalInterest(DE, interest) {
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
    newLocation(DE, name, locationDef) {
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
    newConnection(DE, connectionDef) {
        const id = connectionDef.from + " to " + connectionDef.to;
        const existingConnection = DE.world.connections[id];
        DE.world.connections[id] = connectionDef;
        if (existingConnection.state) {
            DE.world.connections[id].state = existingConnection.state;
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
            state: currentCharacter.state,
        }
        if (DE.internalState["CHARACTER_OVERRIDES_" + characterDef.name]) {
            Object.assign(DE.characters[characterDef.name], DE.internalState["CHARACTER_OVERRIDES_" + characterDef.name]);
        }
        return DE.characters[characterDef.name];
    },
    createStateInAllCharacters(DE, stateName, stateDefinition) {
        Object.values(DE.characters).forEach((character) => {
            defineStateInCharacter(DE, character, stateName, stateDefinition);
        });
        return stateDefinition;
    },
    defineStateInCharacter(DE, character, stateName, stateDefinition) {
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

        const existingBond = DE.bonds[char1Ref.name].active.find(b => b.towards === towardsRef.name);
        if (existingBond) {
            return existingBond;
        }
        const newBond = {
            towards: towardsRef.name,
            ...bondDefinition,
        };
        DE.bonds[char1Ref.name].active.push(newBond);
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
    shiftBond(DE, char1, towards, primaryShift, secondaryShift) {
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
    triggerActionNext(DE, action) {
        DE.internalState.NEXT_ACTIONS = DE.internalState.NEXT_ACTIONS || [];
        DE.internalState.NEXT_ACTIONS.push(action);
    },
    isStrangerTowards(DE, char1, towards) {
        const char1Ref = typeof char1 === "string" ? DE.characters[char1] : char1;
        const towardsRef = typeof towards === "string" ? DE.characters[towards] : towards;
        if (!char1Ref || !towardsRef) {
            console.warn(`Cannot check if ${char1} is stranger towards ${towards} because one of the characters was not found`);
            return true;
        }
        const bond = DE.bonds[char1Ref.name].active.find(b => b.towards === towardsRef.name);
        return !bond || bond.stranger;
    },
    async shiftState(DE, character, stateName, shiftAmount, causants, causes) {
        return DE.utils.tickleState(DE, character, stateName, shiftAmount, shiftAmount > 0 ? Infinity : -Infinity, causants, causes);
    },
    async tickleState(DE, character, stateName, shiftAmount, cap, causants, causes) {
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
                causants: null,
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
        if (newExpectedIntensity > cap) {
            shiftAmount = cap - activeState.intensity + alreadyShiftedInfo;
        }

        activeState.intensity += shiftAmount - alreadyShiftedInfo;
        characterRef.temp["alreadyShifted_" + stateName] = shiftAmount;

        if (shiftAmount > 0) {
            if (activeState.causants && causants) {
                activeState.causants.push(...causants);
            } else if (causants) {
                activeState.causants = causants;
            }
            if (activeState.causes && causes) {
                activeState.causes.push(...causes);
            } else if (causes) {
                activeState.causes = causes;
            }
        } else {
            if (activeState.causants && causants) {
                activeState.causants = activeState.causants.filter(c => causants.some(c2 => c2.name === c.name && c2.type === c.type));
            }
            if (activeState.causes && causes) {
                activeState.causes = activeState.causes.filter(c =>
                    !causes.some(c2 => c2.description === c.description && (c2.characterCausant || null) === (c.characterCausant || null)) ||
                    (causants && causants.some(c2 => c2.name === c.characterCausant && c2.type === "character"))
                );
            }
        }

        for (const cause of activeState.causes || []) {
            if (cause.characterCausant && !activeState.causants?.find(c => c.name === cause.characterCausant && c.type === "character")) {
                activeState.causants = activeState.causants || [];
                activeState.causants.push({
                    name: cause.characterCausant,
                    type: "character",
                });
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
    accumulateInCharacter(DE, character, accumulatorName, amount) {
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
    getAccumulatedValueInCharacter(DE, character, accumulatorName) {
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
    addCausantToState(DE, character, stateName, causant) {
        const characterRef = typeof character === "string" ? DE.characters[character] : character;
        if (!characterRef) {
            if (typeof character === "string") {
                console.warn(`Character with name ${character} not found when trying to add causant to state ${stateName}`);
            } else {
                console.warn(`Received null as character reference when trying to add causant to state ${stateName}`);
            }
            return;
        }

        const activeState = DE.stateFor[characterRef.name].states.find(s => s.state === stateName);
        if (!activeState) {
            console.warn(`Character ${characterRef.name} does not have active state ${stateName} when trying to add causant`);
            return;
        }

        if (activeState.causants) {
            activeState.causants.push(causant);
        } else {
            activeState.causants = [causant];
        }
    },
    removeCausantFromState(DE, character, stateName, causant) {
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
        if (activeState.causants) {
            activeState.causants = activeState.causants.filter(c => c.name !== causant.name && c.type !== causant.type);
        }
    },
    newTrigger(DE, character, trigger) {
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
    newTriggerInAllCharacters(DE, trigger) {
        Object.values(DE.characters).forEach((character) => {
            deEngineUtils.newTrigger(DE, character, trigger);
        });
    },
    charHasState(DE, character, stateName) {
        const characterName = typeof character === "string" ? character : character.name;
        const characterState = DE.stateFor[characterName];
        if (!characterState) {
            console.warn(`Character state for ${characterName} not found when checking for state ${stateName}`);
            return false;
        }
        return characterState.states.some(s => s.state === stateName && s.intensity > 0);
    },
    charIsRelievingState(DE, character, stateName) {
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
        allWorldCharacters(DE) {
            return Object.keys(DE.stateFor).filter((charName) => !DE.stateFor[charName].deadEnded).map(name => DE.characters[name]);
        },
        allWorldCharactersButUser(DE) {
            return Object.keys(DE.stateFor).filter(name => name !== DE.user.name && !DE.stateFor[name].deadEnded).map(name => DE.characters[name]);
        },
        currentLocation(DE) {
            return DE.world.currentLocation;
        },
        currentLocationIsInVehicle(DE) {
            return !!DE.world.locations[DE.world.currentLocation]?.vehicleType || false;
        },
        currentLocationIsSafe(DE) {
            return DE.world.locations[DE.world.currentLocation]?.isSafe || false;
        },
        allCharactersAtLocation(DE, locationName) {
            const result = [];
            for (const member of Object.keys(DE.stateFor)) {
                if (DE.stateFor[member].location === locationName) {
                    const charRef = DE.characters[member];
                    if (charRef) result.push(charRef);
                }
            }
            return result;
        },
        locationIsVehicle(DE, locationName) {
            return !!DE.world.locations[locationName]?.vehicleType || false;
        },
        locationIsSafe(DE, locationName) {
            return DE.world.locations[locationName]?.isSafe || false;
        },
        getLastStateCausants(DE, char, stateName) {
            return getCausantsHelperLocal(DE, char, stateName).map(c => c.name);
        },
        getLastStateCharacterCausants(DE, char, stateName) {
            return getCausantsHelperLocal(DE, char, stateName).filter(c => c.type === "character").map(c => c.name);
        },
        getLastStateObjectCausants(DE, char, stateName) {
            return getCausantsHelperLocal(DE, char, stateName).filter(c => c.type === "object").map(c => c.name);
        },
        getStates(DE, char) {
            return DE.stateFor[char.name].states.map(s => s.state);
        },
        getStateIntensity(DE, char, stateName) {
            const stateObject = DE.stateFor[char.name].states.find(s => s.state === stateName);
            return stateObject ? stateObject.intensity : 0;
        },
        hasState(DE, char, stateName) {
            return DE.stateFor[char.name].states.some(s => s.state === stateName);
        },
        stateHasJustActivated(DE, char, stateName) {
            const stateObject = DE.stateFor[char.name].states.find(s => s.state === stateName);
            if (!stateObject) return false;
            return stateObject.contiguousStartActivationCyclesAgo === 0;
        },
        getStateActivationCyclesAgo(DE, char, stateName) {
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
        getSocialGroup(DE, char, minBondLevel, maxBondLevel, min2BondLevel, max2BondLevel) {
            return DE.bonds[char.name].active.filter(bond => {
                return bond.bond >= minBondLevel && bond.bond <= maxBondLevel && bond.bond2 >= min2BondLevel && bond.bond2 <= max2BondLevel;
            }).map(bond => bond.towards);
        },
        getPresentSocialGroup(DE, char, minBondLevel, maxBondLevel, min2BondLevel, max2BondLevel) {
            const currentLocation = DE.world.currentLocation;
            const socialGroup = DE.bonds[char.name].active.filter(bond => {
                return bond.bond >= minBondLevel && bond.bond <= maxBondLevel && bond.bond2 >= min2BondLevel && bond.bond2 <= max2BondLevel;
            }).map(bond => bond.towards);
            return socialGroup.filter(memberName => DE.stateFor[memberName].location === currentLocation);
        },
        getPresentConversingSocialGroup(DE, char, minBondLevel, maxBondLevel, min2BondLevel, max2BondLevel) {
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
        getDifferenceOfPresentSocialGroup(DE, char, list) {
            const currentLocation = DE.world.currentLocation;
            const socialGroup = DE.bonds[char.name].active.map(bond => bond.towards);
            const presentSocialGroup = socialGroup.filter(memberName => DE.stateFor[memberName].location === currentLocation);
            return list.filter(name => !presentSocialGroup.includes(name));
        },
        getExSocialGroup(DE, char, minBondLevel, maxBondLevel, min2BondLevel, max2BondLevel) {
            return DE.bonds[char.name].ex.filter(bond => {
                return bond.bond >= minBondLevel && bond.bond <= maxBondLevel && bond.bond2 >= min2BondLevel && bond.bond2 <= max2BondLevel;
            }).map(bond => bond.towards);
        },
        getCarryWeight(DE, char) {
            return getCharacterWeight(DE, char.name).weight;
        },
        getCarryVolume(DE, char) {
            return getCharacterVolume(DE, char.name).volume;
        },
        getPowerLevel(DE, char) {
            return getPowerLevelFromCharacter(char);
        },
        getTier(DE, char) {
            return char.tier;
        },
        getTierValue(DE, char) {
            return char.tierValue;
        },
        isDead(DE, char) {
            return DE.stateFor[char.name].dead;
        },
        getChar(DE, potentialCharacter) {
            return DE.characters[potentialCharacter] || null;
        },
        isUser(DE, char) {
            return DE.user.name === char.name;
        },
        isPresentMember(DE, char) {
            const currentLocation = DE.world.currentLocation;
            return DE.stateFor[char.name].location === currentLocation;
        },
        isNotPresent(DE, char) {
            const currentLocation = DE.world.currentLocation;
            return DE.stateFor[char.name].location !== currentLocation;
        },
        isGone(DE, char) {
            const exbonds = DE.bonds[char.name]?.ex;
            if (!exbonds) return false;
            return exbonds.length > 0;
        },
        isInConversation(DE, char) {
            const conversationId = DE.stateFor[char.name].conversationId;
            return !!conversationId;
        },
        isIndoors(DE, char) {
            const locationOfChar = DE.stateFor[char.name].location;
            const locationInfo = DE.world.locations[locationOfChar];
            return locationInfo ? locationInfo.isIndoors : false;
        },
        isOutdoors(DE, char) {
            const locationOfChar = DE.stateFor[char.name].location;
            const locationInfo = DE.world.locations[locationOfChar];
            return locationInfo ? !locationInfo.isIndoors : false;
        },
        hasItem(DE, char, itemName) {
            return DE.stateFor[char.name].carrying.find(item => item.name === itemName) !== undefined;
        },
        getPosture(DE, char) {
            return DE.stateFor[char.name].posture;
        },
        lastSaw(DE, char) {
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
        hasNoIdeaWhereIs(DE, char) {
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
        doesNotKnow(DE, char) {
            const bonds = DE.bonds[char.name].active;
            return bonds.length === 0;
        },
        isStrangersWith(DE, char, towardsChar) {
            const bonds = DE.bonds[char.name].active;
            for (const bond of bonds) {
                if (bond.towards === towardsChar.name && bond.stranger) {
                    return true;
                }
            }
            return false;
        },
        getBondTowards(DE, char, towardsChar) {
            const bonds = DE.bonds[char.name].active;
            for (const bond of bonds) {
                if (bond.towards === towardsChar.name) {
                    return bond.bond;
                }
            }
            return 0;
        },
        getSecondaryBondTowards(DE, char, towardsChar) {
            const bonds = DE.bonds[char.name].active;
            for (const bond of bonds) {
                if (bond.towards === towardsChar.name) {
                    return bond.bond2;
                }
            }
            return 0;
        },
        isAtSameLocation(DE, char, char2) {
            return DE.stateFor[char.name].location === DE.stateFor[char2.name].location;
        },
        isAtSameSlot(DE, char, char2) {
            return DE.stateFor[char.name].location === DE.stateFor[char2.name].location &&
                DE.stateFor[char.name].locationSlot === DE.stateFor[char2.name].locationSlot;
        },
        isHere(DE, char) {
            return DE.stateFor[char.name].location === DE.world.currentLocation;
        },
        formatAnd(DE, list) {
            return formatAndHelper(list);
        },
        formatCommaList(DE, list) {
            if (!list || !Array.isArray(list)) return "";
            return list.join(', ');
        },
        formatOr(DE, list) {
            if (!list || !Array.isArray(list)) return "";
            if (list.length === 0) return "";
            if (list.length === 1) return list[0];
            if (list.length === 2) return `${list[0]} or ${list[1]}`;
            return `${list.slice(0, -1).join(', ')}, or ${list[list.length - 1]}`;
        },
        formatVerbToBe(DE, chars) {
            return getPronounHelperLocal(DE, chars, "are", "is", "is", "is");
        },
        formatPluralOrSingular(DE, chars, plural, singular) {
            if (chars.length === 1) return singular;
            return plural;
        },
        formatObjectPronoun(DE, chars) {
            return getPronounHelperLocal(DE, chars, "them", "him", "her", "them");
        },
        formatPossessive(DE, chars) {
            return getPronounHelperLocal(DE, chars, "their", "his", "her", "their");
        },
        formatReflexive(DE, chars) {
            return getPronounHelperLocal(DE, chars, "themselves", "himself", "herself", "themself");
        },
        formatPronoun(DE, chars) {
            return getPronounHelperLocal(DE, chars, "they", "he", "she", "they");
        },
        formatOwnershipPronoun(DE, chars) {
            return getPronounHelperLocal(DE, chars, "theirs", "his", "hers", "theirs");
        },
        getRandomSeedFromString(DE, optionsNumber, inputString) {
            return generateIntSeedFromString(optionsNumber, inputString);
        },
        getRandomSeedFromTime(DE, optionsNumber) {
            const currentTimeString = DE.currentTime.time.toString();
            return generateIntSeedFromString(optionsNumber, currentTimeString);
        },
        getRandomOption(DE, options) {
            const result = weightedRandomByLikelihood(options.map(option => ({ item: option, likelihood: 1 })), generateIntSeedFromString(1000000, DE.currentTime.time.toString()));
            return result ? result.item : options[0];
        },
        getRandomOptionFixedCharacter(DE, char, options) {
            const result = weightedRandomByLikelihood(options.map(option => ({ item: option, likelihood: 1 })), generateIntSeedFromString(1000000, char.name));
            return result ? result.item : options[0];
        },
    }
};

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
        let stateDescriptionText = typeof characterStateDescription.general === "string" ? characterStateDescription.general : await characterStateDescription.general(deObject, {
            char: character,
            causants: characterStateInfo.causants,
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
                    causants: characterStateInfo.causants,
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
        (await characterStateDescription.triggersDeadEnd(deObject, {
            char: character,
            causants: characterStateInfo.causants,
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
                    causants: characterStateInfo.causants,
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
            stateDescriptionText += typeof characterStateDescription.relieving === "string" ? characterStateDescription.relieving : (await characterStateDescription.relieving(deObject, {
                char: character,
                causants: characterStateInfo.causants,
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
                    causants: characterStateInfo.causants,
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