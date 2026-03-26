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
                other_family_relation: info.otherFamilyRelation || "none",
                other_relationship: info.otherRelationship || "none",
                causants: info.causants || [],
                chars: info.chars?.map(c => c.name) || [],
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

            bond.bond += primaryShift * conditionMultiplier;
            bond.bond2 = (bond.bond2 || 0) + secondaryShift * conditionMultiplier;
        }
    },
    triggerActionNext(DE, action) {
        DE.internalState.NEXT_ACTIONS = DE.internalState.NEXT_ACTIONS || [];
        DE.internalState.NEXT_ACTIONS.push(action);
    },
    async shiftState(DE, character, stateName, shiftAmount, causants) {
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
        } else if (!characterRef.states[stateName]) {
            console.warn(`Character ${characterRef.name} does not have state ${stateName} when trying to shift it by ${shiftAmount}`);
            return;
        }

        const stateRef = characterRef.states[stateName];
        let activeState = DE.stateFor[characterRef.name].states.find(s => s.state === stateName);
        let hasTriggeredIt = false;
        if (!activeState) {
            if (shiftAmount <= 0) {
                console.warn(`Character ${characterRef.name} does not have active state ${stateName} to decrease by ${shiftAmount}`);
                return;
            }

            activeState = {
                state: stateName,
                causants: null,
                intensity: 0,
                relieving: false,
                contiguousStartActivationCyclesAgo: 0,
                contiguousStartActivationTime: { ...DE.currentTime },
            };
            DE.stateFor[characterRef.name].states.push(activeState);
            hasTriggeredIt = true;
        }

        let hasRemovedIt = false;

        activeState.intensity += shiftAmount;
        if (shiftAmount > 0) {
            if (activeState.causants && causants) {
                activeState.causants.push(...causants);
            } else if (causants) {
                activeState.causants = causants;
            }
        } else {
            if (activeState.causants && causants) {
                activeState.causants = activeState.causants.filter(c => !causants.some(c2 => c2.name === c.name && c2.type === c.type));
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

/**
 * 
 * @param {DEObject} DE 
 * @param {string} content 
 */
function makeUserStoryMasterMessage(DE, content) {
    DE.internalState.ADD_STORY_MASTER_MESSAGES = DE.internalState.ADD_STORY_MASTER_MESSAGES || [];
    DE.internalState.ADD_STORY_MASTER_MESSAGES.push({type: "user", content});
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
    DE.internalState.ADD_STORY_MASTER_MESSAGES.push({type: "everyone", content});
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

    const characterStateDescription = character.states[stateName];
    if (!characterStateDescription) {
        throw new Error(`Character ${character.name} does not have state description for ${stateName}.`);
    }

    // if the new state triggered is from the user, make a message about it
    if (deObject.user && deObject.user.name === character.name) {
        // @ts-ignore
        let stateDescriptionText = typeof characterStateDescription.general === "string" ? characterStateDescription.general : await characterStateDescription.general(deObject, {
            char: character,
            causants: characterStateInfo.causants || undefined,
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
                const stateDescriptionSpecific = character.states[toModifyState];

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
    const characterStateDescription = character.states[stateName];
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
                const stateDescriptionSpecific = character.states[toModifyState];

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
    const characterStateDescription = character.states[stateName];
    if (!characterStateDescription) {
        throw new Error(`Character ${character.name} does not have state description for ${stateName}.`);
    }

    // if the new state triggered is from the user, make a message about it
    if (deObject.user && deObject.user.name === character.name) {
        // @ts-ignore
        let stateDescriptionText = ".\n";

        if (characterStateDescription.relieving && stateDescriptionText) {
            // @ts-ignore
            stateDescriptionText += typeof characterStateDescription.relieving === "string" ? characterStateDescription.relieving : (await characterStateDescription.relieving(deObject, {
                char: character,
                causants: characterStateInfo.causants || undefined,
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
                const stateDescriptionSpecific = character.states[toModifyState];

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