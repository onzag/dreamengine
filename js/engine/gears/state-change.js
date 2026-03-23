/**
 * Gear that calculates state changes for a character based on recent interactions.
 */

import { DEngine, getFrozenBonds } from "../index.js";
import { getFamilyBondRelation } from "../util/character-info.js";
import { getHistoryFragmentForCharacter } from "../util/messages.js";

/**
 * 
 * @param {DEngine} engine 
 * @param {DECompleteCharacterReference} character
 * @param {DEStringTemplateWithIntensityAndCausants} modifier 
 */
async function resetAccumulator(engine, character, modifier) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }

    if (modifier.useActionAccumulator && modifier.useActionAccumulator.name) {
        engine.deObject.actionAccumulators[character.name] = engine.deObject.actionAccumulators[character.name] || {
            accumulators: {}
        };
        delete engine.deObject.actionAccumulators[character.name].accumulators[modifier.useActionAccumulator.name];
    }
}

/**
 * 
 * @param {DEngine} engine 
 * @param {DECompleteCharacterReference} character 
 * @param {DEStringTemplateWithIntensityAndCausants} modifier
 * @param {DEStateCausant[]|null} causants
 * @return {Promise<[boolean, DEStateCausant[]|null]>} whether the accumulator has surpassed the threshold and the causants that caused it
 */
async function accumulate(engine, character, modifier, causants) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    if (modifier.useActionAccumulator && modifier.useActionAccumulator.name) {
        console.log(`Updating action accumulator '${modifier.useActionAccumulator.name}' for character ${character.name}.`);
        engine.deObject.actionAccumulators[character.name] = engine.deObject.actionAccumulators[character.name] || {
            accumulators: {}
        };
        const accumulatorValue = engine.deObject.actionAccumulators[character.name];
        if (!modifier.useActionAccumulator.usePerCausant) {
            console.log(`Not using per-causant accumulation.`);
            accumulatorValue.accumulators.DEFAULT = (accumulatorValue.accumulators.DEFAULT || 0) + (modifier.useActionAccumulator.accumulateAmount || 1);
            if (accumulatorValue.accumulators.DEFAULT >= modifier.useActionAccumulator.triggerThreshold) {
                console.log(`Accumulator '${modifier.useActionAccumulator.name}' for character ${character.name} has surpassed threshold ${modifier.useActionAccumulator.triggerThreshold} with value ${accumulatorValue.accumulators.DEFAULT}.`);
                return [true, causants];
            } else {
                console.log(`Accumulator '${modifier.useActionAccumulator.name}' for character ${character.name} is at value ${accumulatorValue.accumulators.DEFAULT}, below threshold ${modifier.useActionAccumulator.triggerThreshold}.`);
                return [false, null];
            }
        }
        console.log(`Using per-causant accumulation.`);
        if (!causants || causants.length === 0) {
            console.log(`No causants provided for per-causant accumulation, cannot accumulate.`);
            return [false, null];
        }

        /**
         * @type {DEStateCausant[]}
         */
        const surpassingCausants = [];
        for (const causant of causants) {
            accumulatorValue.accumulators[causant.name] = (accumulatorValue.accumulators[causant.name] || 0) + (modifier.useActionAccumulator.accumulateAmount || 1);
            if (accumulatorValue.accumulators[causant.name] >= modifier.useActionAccumulator.triggerThreshold) {
                console.log(`Accumulator '${modifier.useActionAccumulator.name}' for character ${character.name} and causant ${causant.name} has surpassed threshold ${modifier.useActionAccumulator.triggerThreshold} with value ${accumulatorValue.accumulators[causant.name]}.`);
                surpassingCausants.push(causant);
            } else {
                console.log(`Accumulator '${modifier.useActionAccumulator.name}' for character ${character.name} and causant ${causant.name} is at value ${accumulatorValue.accumulators[causant.name]}, below threshold ${modifier.useActionAccumulator.triggerThreshold}.`);
            }
        }

        if (surpassingCausants.length > 0) {
            return [true, surpassingCausants];
        } else {
            return [false, null];
        }
    }
    return [true, causants];
}

/**
 * @param {DEngine} engine 
 * @param {string} message 
 */
async function makeUserStoryMasterMessage(engine, message) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    if (!engine.user) {
        throw new Error("User not defined in engine");
    }
    const userCharacter = engine.deObject.characters[engine.user.name];
    if (!userCharacter) {
        throw new Error(`User character ${engine.user.name} not found in DE object.`);
    }
    const stateForUser = engine.deObject.stateFor[engine.user.name];
    if (!stateForUser) {
        throw new Error(`State for user character ${engine.user.name} not found in DE object.`);
    }

    /**
     * @type {DEConversationMessage}
     */
    const messageToAdd = {
        sender: "Story Master",
        content: message,
        duration: { inMinutes: 0, inHours: 0, inDays: 0, inSeconds: 0 },
        startTime: { ...engine.deObject.currentTime },
        endTime: { ...engine.deObject.currentTime },
        id: crypto.randomUUID(),
        isCharacter: false,
        isDebugMessage: false,
        isHiddenMessage: true,
        isUser: false,
        isStoryMasterMessage: true,
        isRejectedMessage: false,
        canOnlyBeSeenByCharacter: engine.user.name,
        singleSummary: null,
        perspectiveSummaryIds: {},
        emotion: null,
        emotionalRange: null,
        interactingCharacters: [],
        rumors: [],
    }

    if (!stateForUser.conversationId) {
        // make a new conversation id
        // need to make a new conversation
        const newConversationId = crypto.randomUUID();
        stateForUser.conversationId = newConversationId;
        stateForUser.messageId = messageToAdd.id;
        stateForUser.type = "INTERACTING";
        engine.deObject.conversations[newConversationId] = {
            id: newConversationId,
            previousConversationIdsPerParticipant: {
                [engine.user.name]: null,
            },
            startTime: { ...engine.deObject.currentTime },
            messages: [messageToAdd],
            participants: [engine.user.name],
            remoteParticipants: [],
            location: stateForUser.location,
            pseudoConversation: false,
            bondsAtStart: getFrozenBonds(engine, [engine.user.name]),
            bondsAtEnd: null,
        };
    } else {
        const conversation = engine.deObject.conversations[stateForUser.conversationId];
        if (!conversation) {
            throw new Error(`Conversation ${stateForUser.conversationId} not found in DE object.`);
        }
        conversation.messages.push(messageToAdd);
    }

    await engine.informDEObjectUpdated();
}
/**
     * @param {DEngine} engine
     * @param {DECompleteCharacterReference} character 
     * @param {string} stateName 
     */
async function onStateTriggeredOnCharacter(engine, character, stateName) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }

    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }

    const characterState = engine.deObject.stateFor[character.name];
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

    // if we have fallsDown property, set the character posture to laying down
    if (characterStateDescription.fallsDown) {
        console.log(`Character ${character.name} has fallen down due to state ${stateName}.`);
        characterState.posture = "lying_down";
    }

    // if the new state triggered is from the user, make a message about it
    if (engine.user && engine.user.name === character.name) {
        // @ts-ignore
        let stateDescriptionText = typeof characterStateDescription.general === "string" ? characterStateDescription.general : await characterStateDescription.general(engine.deObject, {
            char: character,
            causants: characterStateInfo.causants || undefined,
        });
        if (!stateDescriptionText.endsWith(".")) {
            stateDescriptionText += ".";
        }
        await makeUserStoryMasterMessage(engine, `${engine.user.name} is now being affected by the state: ${stateName.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ")}.\n${stateDescriptionText}`);
    }

    // now check for states that triggered by this one
    if (characterStateDescription.triggersStates) {
        // start triggering them
        for (const triggeredState of Object.keys(characterStateDescription.triggersStates)) {
            // get the intensity to trigger with
            const withIntensity = characterStateDescription.triggersStates[triggeredState].intensity || 1.0;
            console.log(`State ${stateName} triggered on character ${character.name}, triggering state ${triggeredState} with intensity ${withIntensity}.`);

            // check if it is already active
            const alreadyActivatedInfo = engine.deObject.stateFor[character.name].states.find(s => s.state === triggeredState);
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
                    contiguousStartActivationTime: { ...engine.deObject.currentTime },
                }
                engine.deObject.stateFor[character.name].states.push(state);

                console.log(`State ${triggeredState} activated on character ${character.name} with intensity ${withIntensity}.`);

                await onStateTriggeredOnCharacter(engine, character, triggeredState);
            }
        }
    }

    // check for states to modify
    if (characterStateDescription.modifiesStatesIntensitiesOnTrigger) {
        for (const toModifyState of Object.keys(characterStateDescription.modifiesStatesIntensitiesOnTrigger)) {
            const withIntensity = characterStateDescription.modifiesStatesIntensitiesOnTrigger[toModifyState].intensity || -1.0;
            console.log(`State ${stateName} triggered on character ${character.name}, modifying state ${toModifyState} with intensity ${withIntensity}.`);

            const alreadyActivatedInfo = engine.deObject.stateFor[character.name].states.find(s => s.state === toModifyState);
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
                        await onStateRelievedOnCharacter(engine, character, toModifyState);
                    }
                }

                // if the intensity is now 0 or below, remove the state
                if (alreadyActivatedInfo.intensity <= 0) {
                    // remove the state
                    engine.deObject.stateFor[character.name].states = engine.deObject.stateFor[character.name].states.filter(s => s.state !== toModifyState);
                    console.log(`State ${toModifyState} intensity modified on character ${character.name} by ${withIntensity}, now removed.`);
                    await onStateRemovedOnCharacter(engine, character, toModifyState);
                }
            }
        }
    }

    // DETERMINE if we activated any state with a dead-end trigger
    const deadEndPotential = !characterStateDescription.triggersDeadEnd ? "" : (typeof characterStateDescription.triggersDeadEnd === "string" ? characterStateDescription.triggersDeadEnd :
        (await characterStateDescription.triggersDeadEnd(engine.deObject, {
            char: character,
        })).trim());
    if (deadEndPotential) {
        console.log(`State ${stateName} on character ${character.name} triggers dead-end, the character will now be removed from the story.`);
        engine.deObject.stateFor[character.name].deadEnded = true;
        engine.deObject.stateFor[character.name].deadEndReason = deadEndPotential;
        if (characterStateDescription.deadEndIsDeath) {
            console.log(`Character ${character.name} has died due to state ${stateName}.`);
            engine.deObject.stateFor[character.name].dead = true;
        }

        if (character.name === engine.userCharacter?.name) {
            engine.informCycleState("info", `The user character ${character.name} has reached a dead-end: ${deadEndPotential}, game over.`);

            if (characterStateDescription.deadEndIsDeath) {
                await makeUserStoryMasterMessage(engine, `${character.name} has died: ${deadEndPotential}.`);
            } else {
                await makeUserStoryMasterMessage(engine, `${character.name} has reached a dead-end and is thus removed from the story: ${deadEndPotential}.`);
            }

            await engine.gameOver();
        }
    }

    for (const modifier of characterStateDescription.intensityModifiers || []) {
        if (modifier.useActionAccumulator?.reset === "when_state_triggers") {
            await resetAccumulator(engine, character, modifier);
        }
    }
    for (const modifier of characterStateDescription.triggers || []) {
        if (modifier.useActionAccumulator?.reset === "when_state_triggers") {
            await resetAccumulator(engine, character, modifier);
        }
    }
}

/**
     * @param {DEngine} engine
     * @param {DECompleteCharacterReference} character 
     * @param {string} stateName 
     */
async function onStateRemovedOnCharacter(engine, character, stateName) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }

    if (engine.user && engine.user.name === character.name) {
        await makeUserStoryMasterMessage(engine, `${engine.user.name} is no longer affected by the state: ${stateName.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ")}.`);
    }

    const characterState = engine.deObject.stateFor[character.name];
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

            const alreadyActivatedInfo = engine.deObject.stateFor[character.name].states.find(s => s.state === triggeredState);
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
                    contiguousStartActivationTime: { ...engine.deObject.currentTime },
                }
                engine.deObject.stateFor[character.name].states.push(state);

                console.log(`State ${triggeredState} activated on character ${character.name} with intensity ${withIntensity}.`);

                await onStateTriggeredOnCharacter(engine, character, triggeredState);
            }
        }
    }

    // check for states to modify on remove
    if (characterStateDescription.modifiesStatesIntensitiesOnRemove) {
        for (const toModifyState of Object.keys(characterStateDescription.modifiesStatesIntensitiesOnRemove)) {
            const withIntensity = characterStateDescription.modifiesStatesIntensitiesOnRemove[toModifyState].intensity || -1.0;
            console.log(`State ${stateName} removed from character ${character.name}, modifying state ${toModifyState} with intensity ${withIntensity}.`);

            const alreadyActivatedInfo = engine.deObject.stateFor[character.name].states.find(s => s.state === toModifyState);
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
                        await onStateRelievedOnCharacter(engine, character, toModifyState);
                    }
                }

                if (alreadyActivatedInfo.intensity <= 0) {
                    // remove the state
                    engine.deObject.stateFor[character.name].states = engine.deObject.stateFor[character.name].states.filter(s => s.state !== toModifyState);
                    console.log(`State ${toModifyState} intensity modified on character ${character.name} by ${withIntensity}, now removed.`);
                    await onStateRemovedOnCharacter(engine, character, toModifyState);
                }
            }
        }
    }

    for (const modifier of characterStateDescription.intensityModifiers || []) {
        if (modifier.useActionAccumulator?.reset === "when_state_removed") {
            await resetAccumulator(engine, character, modifier);
        }
    }
    for (const modifier of characterStateDescription.triggers || []) {
        if (modifier.useActionAccumulator?.reset === "when_state_removed") {
            await resetAccumulator(engine, character, modifier);
        }
    }
}

/**
     * @param {DEngine} engine
     * @param {DECompleteCharacterReference} character 
     * @param {string} stateName 
     */
async function onStateRelievedOnCharacter(engine, character, stateName) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    const characterState = engine.deObject.stateFor[character.name];
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
    if (engine.user && engine.user.name === character.name) {
        // @ts-ignore
        let stateDescriptionText = ".\n";

        if (characterStateDescription.relieving && stateDescriptionText) {
            // @ts-ignore
            stateDescriptionText += typeof characterStateDescription.relieving === "string" ? characterStateDescription.relieving : (await characterStateDescription.relieving(engine.deObject, {
                char: character,
                causants: characterStateInfo.causants || undefined,
            })).trim();
            if (!stateDescriptionText.endsWith(".")) {
                stateDescriptionText += ".";
            }
        } else {
            stateDescriptionText = "";
        }


        await makeUserStoryMasterMessage(engine, `${engine.user.name} is has begun to relieve: ${stateName.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ")}${stateDescriptionText}`);
    }

    // states triggered when relieving starts
    if (characterStateDescription.triggersStatesOnRelieve) {
        for (const triggeredState of Object.keys(characterStateDescription.triggersStatesOnRelieve)) {
            const withIntensity = characterStateDescription.triggersStatesOnRelieve[triggeredState].intensity || 1.0;
            console.log(`State ${stateName} relieved on character ${character.name}, triggering state ${triggeredState} with intensity ${withIntensity}.`);

            const alreadyActivatedInfo = engine.deObject.stateFor[character.name].states.find(s => s.state === triggeredState);
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
                    contiguousStartActivationTime: { ...engine.deObject.currentTime },
                }
                engine.deObject.stateFor[character.name].states.push(state);

                console.log(`State ${triggeredState} activated on character ${character.name} with intensity ${withIntensity}.`);

                await onStateTriggeredOnCharacter(engine, character, triggeredState);
            }
        }
    }
    if (characterStateDescription.modifiesStatesIntensitiesOnRelieve) {
        for (const toModifyState of Object.keys(characterStateDescription.modifiesStatesIntensitiesOnRelieve)) {
            const withIntensity = characterStateDescription.modifiesStatesIntensitiesOnRelieve[toModifyState].intensity || -1.0;
            console.log(`State ${stateName} relieved on character ${character.name}, modifying state ${toModifyState} with intensity ${withIntensity}.`);

            const alreadyActivatedInfo = engine.deObject.stateFor[character.name].states.find(s => s.state === toModifyState);
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
                        await onStateRelievedOnCharacter(engine, character, toModifyState);
                    }
                }

                if (alreadyActivatedInfo.intensity <= 0) {
                    // remove the state
                    engine.deObject.stateFor[character.name].states = engine.deObject.stateFor[character.name].states.filter(s => s.state !== toModifyState);
                    console.log(`State ${toModifyState} intensity modified on character ${character.name} by ${withIntensity}, now removed.`);
                    await onStateRemovedOnCharacter(engine, character, toModifyState);
                }
            }
        }
    }

    for (const modifier of characterStateDescription.intensityModifiers || []) {
        if (modifier.useActionAccumulator?.reset === "when_state_relieves") {
            await resetAccumulator(engine, character, modifier);
        }
    }
    for (const modifier of characterStateDescription.triggers || []) {
        if (modifier.useActionAccumulator?.reset === "when_state_relieves") {
            await resetAccumulator(engine, character, modifier);
        }
    }
}

/**
 * @param {DEngine} engine 
 * @param {DECompleteCharacterReference} character 
 * @param {DECharacterStateDefinition} stateDefinition
 * @param {DECompleteCharacterReference[]} allCharactersInAnalysis
 */
function determinePotentialCharacterCausants(
    engine,
    character,
    stateDefinition,
    allCharactersInAnalysis,
) {
    // just a quick short circuit in case there are no characters matching that criteria
    let potentialCausants = allCharactersInAnalysis;

    const minBondLevel = typeof stateDefinition.potentialCausantsCriteria?.minBondRequired === "number" ? stateDefinition.potentialCausantsCriteria.minBondRequired : -100;
    const maxBondLevel = typeof stateDefinition.potentialCausantsCriteria?.maxBondAllowed === "number" ? stateDefinition.potentialCausantsCriteria.maxBondAllowed : 100;
    const min2BondLevel = stateDefinition.potentialCausantsCriteria?.min2BondRequired || 0;
    const max2BondLevel = stateDefinition.potentialCausantsCriteria?.max2BondAllowed || 100;
    const allowsStrangers = !!stateDefinition.potentialCausantsCriteria?.noBondAllowed;
    const deniesKnownPeople = !!stateDefinition.potentialCausantsCriteria?.bondDenied;
    const onlyFamily = !!stateDefinition.potentialCausantsCriteria?.onlyFamily;
    const familyExclude = stateDefinition.potentialCausantsCriteria?.familyExclude || [];

    potentialCausants = allCharactersInAnalysis.filter(otherCharacter => {
        const bondTowardsCharacter = engine.deObject?.social.bonds[character.name].active.find(b => b.towards === otherCharacter.name);
        const assumedBond = bondTowardsCharacter ? bondTowardsCharacter.bond : 0;
        const assumedBond2 = bondTowardsCharacter ? bondTowardsCharacter.bond2 : 0;
        const assumedStranger = bondTowardsCharacter ? bondTowardsCharacter.stranger : true;

        const otherCharacterFamilyRelationship = getFamilyBondRelation(character, otherCharacter);
        
        if (onlyFamily && !otherCharacterFamilyRelationship) {
            return false;
        }

        if (otherCharacterFamilyRelationship && familyExclude.length > 0 && familyExclude.includes(otherCharacterFamilyRelationship)) {
            return false;
        }

        if (
            (assumedStranger && deniesKnownPeople) ||
            (!assumedStranger && !allowsStrangers)
        ) {
            return false;
        }
        if (assumedBond < minBondLevel || assumedBond > maxBondLevel) {
            return false;
        }
        if (assumedBond2 < min2BondLevel || assumedBond2 > max2BondLevel) {
            return false;
        }
        return true;
    });

    return potentialCausants;
}

/**
 * 
 * @param {DEngine} engine 
 * @param {DECompleteCharacterReference} character 
 * @param {DECharacterStateDefinition} stateDefinition
 * @param {DEStringTemplateWithIntensityAndCausants} activationCondition
 * @param {DECompleteCharacterReference[]} allCharactersInAnalysis
 * @param {{generator: import('../inference/base.js').QuestionAgentGeneratorResponse, initialized: boolean}} prompter
 * @returns {Promise<DEStateCausant[]|null>}
 */
async function determineCausants(
    engine,
    character,
    stateDefinition,
    activationCondition,
    allCharactersInAnalysis,
    prompter,
) {
    // TODO redo this function asking character one by one about actual causants,
    // we should probably get fed with interacted characters to reduce the amount of questions
    // from the item change which happens first
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    const potentialCharacterCausants = determinePotentialCharacterCausants(
        engine,
        character,
        stateDefinition,
        allCharactersInAnalysis,
    );
    if (!activationCondition.determineCausants) {
        return null;
    }

    const executed = typeof activationCondition.determineCausants === "string" ? activationCondition.determineCausants :
        (await activationCondition.determineCausants(engine.deObject, {
            char: character,
            potentialCausants: potentialCharacterCausants,
        })).trim();
    if (!executed) {
        return null;
    }

    const allCharactersWithLowerCaseNames = Object.keys(engine.deObject.characters).map(name => name.toLowerCase());

    if (!executed.endsWith("?")) {
        console.log(`Causants determination for state on character ${character.name} did not return a question, parsing response directly.`);

        if (executed.includes(" and ")) {
            console.warn(`Causants determination for state on character ${character.name} returned 'and' in the response, which may lead to incorrect parsing. Consider using commas to separate causants and not format_and, use format_comma_list instead`);
        }

        const result = executed.split(",").map(s => s.trim()).filter(s => s.length > 0);
        return result.length ? result.map(causantName => {
            // check if it is a character or object
            if (allCharactersWithLowerCaseNames.includes(causantName.toLowerCase())) {
                return {
                    name: causantName,
                    type: "character",
                };
            } else {
                return {
                    name: causantName,
                    type: "object",
                };
            }
        }) : null;
    }

    const trail = !activationCondition.determineCausantsAnswerTrail ? "" : (typeof activationCondition.determineCausantsAnswerTrail === "string" ? activationCondition.determineCausantsAnswerTrail : (await activationCondition.determineCausantsAnswerTrail(engine.deObject, {
        char: character,
        potentialCausants: potentialCharacterCausants,
    })) || "").trim();
    const grammarLimitation = activationCondition.determineCausantsAnswerForceGrammarTo || "LIST_OF_ANY_CAUSANTS";

    let grammar = "root ::= causant (\",\" causant)* \" \" \".\";\ncausant ::= OBJECT_CAUSANT | CHARACTER_CAUSANT;\nOBJECT_CAUSANT ::= [a-zA-Z0-9 _-]+;\nCHARACTER_CAUSANT ::= [a-zA-Z0-9 _-]+;";
    let instructions = "Provide a comma separated list of causants only, these causants can be objects or characters related to the question, use their exact names as in the story";

    if (grammarLimitation === "LIST_OF_OBJECT_CAUSANTS") {
        grammar = "root ::= causant (\",\" causant)* \" \" \".\"\ncausant ::= OBJECT_CAUSANT;\nOBJECT_CAUSANT ::= [a-zA-Z0-9 _-]+";
        instructions = "Provide a comma separated list of object causants only, these causants must be objects related to the question, use their exact names as in the story";
    } else if (grammarLimitation === "LIST_OF_CHARACTER_CAUSANTS") {
        grammar = "root ::= causant (\",\" causant)* \" \" \".\"\ncausant ::= CHARACTER_CAUSANT;\nCHARACTER_CAUSANT ::= [a-zA-Z0-9 _-]+";
        instructions = "Provide a comma separated list of character causants only, these causants must be characters related to the question, use their exact names as in the story";
    } else if (grammarLimitation === "SINGLE_OBJECT_CAUSANT") {
        grammar = "root ::= OBJECT_CAUSANT \" \" \".\"\nOBJECT_CAUSANT ::= [a-zA-Z0-9 _-]+";
        instructions = "Provide a single object causant only, this causant must be an object related to the question, use its exact name as in the story";
    } else if (grammarLimitation === "SINGLE_CHARACTER_CAUSANT") {
        grammar = "root ::= CHARACTER_CAUSANT \" \" \".\"\nCHARACTER_CAUSANT ::= [a-zA-Z0-9 _-]+";
        instructions = "Provide a single character causant only, this causant must be a character related to the question, use its exact name as in the story";
    } else if (grammarLimitation === "SINGLE_ANY_CAUSANT") {
        grammar = "root ::= causant \" \" \".\"\ncausant ::= OBJECT_CAUSANT | CHARACTER_CAUSANT\nOBJECT_CAUSANT ::= [a-zA-Z0-9 _-]+;\nCHARACTER_CAUSANT ::= [a-zA-Z0-9 _-]+;";
        instructions = "Provide a single causant only, this causant can be an object or character related to the question, use its exact name as in the story";
    } else if (grammarLimitation === "SINGLE_CHARACTER_POTENTIAL_CAUSANT") {
        const potentialCausantsOptions = potentialCharacterCausants.map(c => JSON.stringify(c.name)).join(" | ");
        grammar = `root ::= CHARACTER_CAUSANT \" \" \".\"\nCHARACTER_CAUSANT ::= ${potentialCausantsOptions}`;
        instructions = `Provide a single character causant only, this causant must be one of the following characters: ${potentialCharacterCausants.map(c => c.name).join(", ")}`;
    } else if (grammarLimitation === "LIST_OF_CHARACTER_POTENTIAL_CAUSANTS") {
        const potentialCausantsOptions = potentialCharacterCausants.map(c => JSON.stringify(c.name)).join(" | ");
        grammar = `root ::= CHARACTER_CAUSANT (\",\" CHARACTER_CAUSANT)* \" \" \".\"\nCHARACTER_CAUSANT ::= ${potentialCausantsOptions};`;
        instructions = `Provide a comma separated list of character causants only, these causants must be from the following characters: ${potentialCharacterCausants.map(c => c.name).join(", ")}`;
    }

    if (!prompter.initialized) {
        // prime the generator
        await prompter.generator.next();
        prompter.initialized = true;
    }

    const answer = await prompter.generator.next({
        maxCharacters: 0,
        maxSafetyCharacters: 250,
        maxParagraphs: 1,
        nextQuestion: executed,
        answerTrail: trail,
        stopAt: ["\n", "."],
        stopAfter: [],
        instructions: instructions,
        grammar: grammar,
    });

    if (answer.done) {
        throw new Error("Causants determination prompt generator finished unexpectedly.");
    }

    const parsedCausants = answer.value.trim().split(",").map(s => s.trim()).filter(s => !!s);

    // @ts-ignore even with casting to specifically be type character it remains being string because TS is weird
    const expectedFinalResults = parsedCausants.map(causantName => {
        // check if it is a character or object
        if (allCharactersWithLowerCaseNames.includes(causantName.toLowerCase())) {
            return {
                name: causantName,
                type: /** @type {"character"} */ "character",
            };
        } else {
            return {
                name: causantName,
                type: /** @type {"object"} */ "object",
            };
        }
    }).filter(c => {
        if (grammarLimitation === "LIST_OF_OBJECT_CAUSANTS" || grammarLimitation === "SINGLE_OBJECT_CAUSANT") {
            return c.type === "object";
        } else if (grammarLimitation === "LIST_OF_CHARACTER_CAUSANTS" || grammarLimitation === "SINGLE_CHARACTER_CAUSANT") {
            return c.type === "character";
        }
        return true;
    });
    // @ts-ignore
    return expectedFinalResults.length ? expectedFinalResults : null;
}

/**
 * @param {DEngine} engine
 * @param {DECompleteCharacterReference} character
 * @param {string} stateName
 * @param {DECharacterStateDefinition} stateDescription
 */
async function checkActiveStateConsistency(engine, character, stateName, stateDescription) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }

    const stillActive = engine.deObject.stateFor[character.name].states.find(s => s.state === stateName);
    if (!stillActive) {
        // actually removed
        return true;
    }

    let conflicted = false;
    // check if it is conflicting with other states
    if (stateDescription.conflictStates) {
        // check for conflicts
        for (const conflictState of stateDescription.conflictStates) {
            const conflictStateInfo = engine.deObject.stateFor[character.name].states.find(s => s.state === conflictState);
            if (conflictStateInfo) {
                conflicted = true;
                console.log(`State ${stateName} conflicts with active state ${conflictState} on character ${character.name}, removing state ${stateName}.`);
                engine.deObject.stateFor[character.name].states = engine.deObject.stateFor[character.name].states.filter(s => s.state !== stateName);
                await onStateRemovedOnCharacter(engine, character, stateName);
            }
        }
    }

    let missingRequiredState = false;
    // check required states
    if (stateDescription.requiredStates) {
        // check if one of them is missing
        for (const requiredState of stateDescription.requiredStates) {
            const requiredStateInfo = engine.deObject.stateFor[character.name].states.find(s => s.state === requiredState);
            if (!requiredStateInfo) {
                console.log(`State ${stateName} requires state ${requiredState} to be active on character ${character.name}, which is missing, removing state ${stateName}.`);
                missingRequiredState = true;
                break;
            }
        }
        // if missing, remove the state since its required state is gone
        if (missingRequiredState) {
            engine.deObject.stateFor[character.name].states = engine.deObject.stateFor[character.name].states.filter(s => s.state !== stateName);
            await onStateRemovedOnCharacter(engine, character, stateName);
        }
    }

    let missingPosture = false;
    if (stateDescription.requiresPosture) {
        const characterPosture = engine.deObject.stateFor[character.name].posture;
        if (characterPosture !== stateDescription.requiresPosture) {
            missingPosture = true;
            console.log(`State ${stateName} requires posture ${stateDescription.requiresPosture} on character ${character.name}, current posture is ${characterPosture}, removing state ${stateName}.`);
            engine.deObject.stateFor[character.name].states = engine.deObject.stateFor[character.name].states.filter(s => s.state !== stateName);
            await onStateRemovedOnCharacter(engine, character, stateName);
        }
    }

    return !(conflicted || missingRequiredState || missingPosture);
}

/**
 * @param {DEngine} engine
 * @param {DECompleteCharacterReference} character
 * @param {string} stateName
 * @param {number} intensityChange
 */
export async function applyStateChange(engine, character, stateName, intensityChange) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    const characterState = engine.deObject.stateFor[character.name];
    if (!characterState) {
        throw new Error(`Character state for ${character.name} not found.`);
    }
    const characterStateDescription = character.states[stateName];
    if (!characterStateDescription) {
        throw new Error(`Character ${character.name} does not have state description for ${stateName}.`);
    }
    const alreadyActivatedInfo = engine.deObject.stateFor[character.name].states.find(s => s.state === stateName);
    if (!alreadyActivatedInfo) {
        return;
    }

    alreadyActivatedInfo.intensity += intensityChange;
    if (alreadyActivatedInfo.intensity > 4) {
        alreadyActivatedInfo.intensity = 4;
    }
    if (characterStateDescription.usesReliefDynamic && intensityChange < 0) {
        alreadyActivatedInfo.relieving = true;
    }

    if (alreadyActivatedInfo.intensity <= 0) {
        // remove the state
        engine.deObject.stateFor[character.name].states = engine.deObject.stateFor[character.name].states.filter(s => s.state !== stateName);
        console.log(`State ${stateName} intensity modified on character ${character.name} by external change, now removed.`);
        await onStateRemovedOnCharacter(engine, character, stateName);
    } else {
        console.log(`State ${stateName} intensity modified on character ${character.name} by external change, now ${alreadyActivatedInfo.intensity}.`);
        await checkActiveStateConsistency(engine, character, stateName, characterStateDescription);
    }
}

/**
 * @param {DEngine} engine
 * @param {DECompleteCharacterReference} character
 */
export async function checkAllActiveStatesConsistency(engine, character) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    const characterState = engine.deObject.stateFor[character.name];
    if (!characterState) {
        throw new Error(`Character state for ${character.name} not found.`);
    }
    const activeStates = characterState.states;
    for (const activeStateInfo of activeStates) {
        const stateDescription = character.states[activeStateInfo.state];
        if (!stateDescription) {
            console.warn(`State description for active state ${activeStateInfo.state} on character ${character.name} not found, skipping consistency check for this state.`);
            continue;
        }
        await checkActiveStateConsistency(engine, character, activeStateInfo.state, stateDescription);
    }
}

/**
 * @param {DEngine} engine
 * @param {DECompleteCharacterReference} character
 * @param {string[]} interactedCharactersAccordingToItemChange
 * @returns {Promise<void>}
 */
export default async function calculateStateChange(engine, character, interactedCharactersAccordingToItemChange) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    } else if (!engine.inferenceAdapter) {
        throw new Error("Inference adapter not initialized");
    }

    // first we need to update the bonds towards the character, for that we need to get a whole extended cycle
    // gather all the other characters that talked inbetween, and update bonds for each
    const lastCycleMessagesInfo = await getHistoryFragmentForCharacter(engine, character, {
        msgLimit: "LAST_CYCLE",
        includeDebugMessages: false,
        includeRejectedMessages: false,
    });

    /**
     * @type {DECompleteCharacterReference[]}
     */
    const allCharactersInAnalysis = lastCycleMessagesInfo.mentionedCharacters.map((c) => engine.deObject?.characters[c]).filter(c => !!c);
    // add the ones given by our item change
    for (const otherCharacter of interactedCharactersAccordingToItemChange) {
        if (!allCharactersInAnalysis.find(c => c.name === otherCharacter)) {
            const charRef = engine.deObject?.characters[otherCharacter];
            if (charRef) {
                allCharactersInAnalysis.push(charRef);
            }
        }
    }

    // well that is weird, zero messages?
    if (lastCycleMessagesInfo.messages.length === 0) {
        console.log(`No messages from other characters to set states of ${character.name}`);
        return;
    }

    const systemPrompt = `You are an assistant and social dynamics analyst that helps analyze interactions involving ${character.name}`;
    const questioningAgent = engine.inferenceAdapter.runQuestioningCustomAgentOn(
        "state-change",
        engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(systemPrompt, [], null),
        null,
        lastCycleMessagesInfo.messages,
        null,
    );

    const prompter = {
        generator: questioningAgent,
        initialized: false,
    };

    // All potential states for the character we will start to loop through
    const allPotentialStates = character.states;
    for (const [stateName, stateDescription] of Object.entries(allPotentialStates)) {
        console.log(`Checking state ${stateName} for character ${character.name}.`);
        // check if they already have the state
        const alreadyActivatedInfo = engine.deObject.stateFor[character.name].states.find(s => s.state === stateName);

        // if they do, check if we need to update intensity or remove it
        if (alreadyActivatedInfo) {
            console.log(`Character ${character.name} already has state ${stateName}, checking intensity changes.`);

            // we will check if the state is consistent first and if not we dont activate it
            const isConsistent = await checkActiveStateConsistency(engine, character, stateName, stateDescription);
            if (!isConsistent) {
                continue;
            }

            // check if the state has an intensity change condition
            const intensityModifiers = (alreadyActivatedInfo.relieving ? stateDescription.intensityModifiersDuringRelief || stateDescription.intensityModifiers : stateDescription.intensityModifiers);
            let appliedIntensityChange = false;
            let removedState = false;
            const randomRollForIntensityTrigger = Math.random();
            if (intensityModifiers) {
                for (const intensityModifier of intensityModifiers) {
                    if (typeof intensityModifier.intensity === "number" && intensityModifier.intensity === 0) {
                        console.log(`Skipping state intensity modifier for state ${stateName} on character ${character.name} because intensity change is zero.`);
                        continue;
                    }
                    if (
                        typeof intensityModifier.intensity === "number" &&
                        intensityModifier.intensity > 0 &&
                        alreadyActivatedInfo.intensity >= 4 &&
                        !intensityModifier.useActionAccumulator &&
                        !intensityModifier.determineCausants
                    ) {
                        console.log(`Skipping state intensity modifier for state ${stateName} on character ${character.name} because it would increase intensity above 4 and it does not use action accumulator or determine causants.`);
                        continue;
                    }

                    let willExecute = false;
                    const result = typeof intensityModifier.template === "string" ? intensityModifier.template : (await intensityModifier.template(engine.deObject, {
                        char: character,
                        causants: alreadyActivatedInfo.causants || undefined,
                    })).trim();
                    if (result === "yes" || result === "Yes" || result === "YES") {
                        console.log(`State intensity modifier matched immediately for state ${stateName} on character ${character.name}`);
                        willExecute = true;
                    } else if (result.endsWith("?")) {
                        console.log(`State intensity modifier for state ${stateName} on character ${character.name} returned a question, using inference to determine yes/no.`);
                        console.log(`Asking question: ${result}`);

                        if (!prompter.initialized) {
                            // prime the generator
                            await prompter.generator.next();
                            prompter.initialized = true;
                        }
                        const yesNoGrammar = `root ::= ("yes" | "no" | "Yes" | "No" | "YES" | "NO") ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\n`;
                        const answer = await prompter.generator.next({
                            maxCharacters: 0,
                            maxSafetyCharacters: 250,
                            maxParagraphs: 1,
                            nextQuestion: result,
                            stopAfter: ["yes", "no", "Yes", "No", "YES", "NO"],
                            stopAt: [],
                            grammar: yesNoGrammar,
                            instructions: "Answer with 'yes' or 'no'",
                        });

                        if (answer.done) {
                            throw new Error("State intensity modifier prompt generator finished unexpectedly.");
                        }
                        const trimmedAnswer = answer.value.trim().toLowerCase();
                        console.log("Received answer: " + trimmedAnswer);
                        if (trimmedAnswer === "yes") {
                            console.log(`State intensity modifier matched for state ${stateName} on character ${character.name} via inference`);
                            willExecute = true;
                        } else {
                            console.log(`State intensity modifier for state ${stateName} on character ${character.name} did not match because the template returned no/nothing`);
                        }
                    }

                    if (willExecute) {
                        if (randomRollForIntensityTrigger > (typeof intensityModifier.triggerLikelihood === "number" ? intensityModifier.triggerLikelihood : 1.0)) {
                            if (intensityModifier.useActionAccumulator) {
                                if (intensityModifier.useActionAccumulator.usePerCausant) {
                                    const causants = await determineCausants(
                                        engine,
                                        character,
                                        stateDescription,
                                        intensityModifier,
                                        allCharactersInAnalysis,
                                        prompter,
                                    );
                                    await accumulate(engine, character, intensityModifier, causants);
                                } else {
                                    await accumulate(engine, character, intensityModifier, null);
                                }
                            }
                            console.log(`State intensity modifier for state ${stateName} on character ${character.name} passed template check but failed probability check (${randomRollForIntensityTrigger} > ${intensityModifier.triggerLikelihood}), skipping intensity change.`);
                            continue;
                        }

                        if (!engine.deObject) {
                            // typescript being funny
                            throw new Error("DEngine not initialized");
                        }
                        const newCausants = await determineCausants(engine, character, stateDescription, intensityModifier, allCharactersInAnalysis, prompter);

                        let surpassesThreshold = true;
                        let surpassesThresholdCausants = newCausants;
                        if (intensityModifier.useActionAccumulator) {
                            [surpassesThreshold, surpassesThresholdCausants] = await accumulate(engine, character, intensityModifier, newCausants);
                        }

                        console.log(`The causants determined for intensity modifier of state ${stateName} on character ${character.name} are: ${newCausants ? newCausants.map(c => c.name).join(", ") : "none"}`);

                        // update the causants in the active state info
                        if (surpassesThresholdCausants && surpassesThresholdCausants.length > 0) {
                            // we need to merge them with existing causants
                            if (!alreadyActivatedInfo.causants) {
                                if (typeof intensityModifier.intensity === "number" && intensityModifier.intensity > 0 || intensityModifier.intensity === "DO_NOT_MODIFY_INTENSITY_ADD_CAUSANTS_ONLY") {
                                    console.log(`Setting causants for state ${stateName} on character ${character.name} due to intensity modifier.`);
                                    alreadyActivatedInfo.causants = newCausants;
                                }
                            } else {
                                for (const newCausant of surpassesThresholdCausants) {
                                    const addCausants = typeof intensityModifier.intensity === "number" && intensityModifier.intensity > 0 || intensityModifier.intensity === "DO_NOT_MODIFY_INTENSITY_ADD_CAUSANTS_ONLY";
                                    const removeCausants = typeof intensityModifier.intensity === "number" && intensityModifier.intensity < 0 || intensityModifier.intensity === "DO_NOT_MODIFY_INTENSITY_REMOVE_CAUSANTS_ONLY";

                                    if (removeCausants) {
                                        // @ts-expect-error typescript being funny as usual, I already null checked above
                                        const index = alreadyActivatedInfo.causants.findIndex(c => c.name === newCausant.name);
                                        if (index !== -1) {
                                            console.log(`Removing causant ${newCausant.name} from state ${stateName} on character ${character.name} due to intensity modifier.`);
                                            // @ts-expect-error typescript being funny as usual, I already null checked above
                                            alreadyActivatedInfo.causants.splice(index, 1);
                                        }

                                        // check if our causants is now empty
                                        // @ts-expect-error typescript being funny as usual, I already null checked above
                                        if (alreadyActivatedInfo.causants.length === 0) {
                                            alreadyActivatedInfo.causants = null;
                                        }

                                        // check if we still meet the requirements
                                        if (stateDescription.requiresCharacterCausants) {
                                            const hasCharacterCausant = alreadyActivatedInfo.causants && alreadyActivatedInfo.causants.find(c => c.type === "character");
                                            if (!hasCharacterCausant) {
                                                console.log(`All character causants removed from state ${stateName} on character ${character.name}, which requires character causants, removing state.`);
                                                engine.deObject.stateFor[character.name].states = engine.deObject.stateFor[character.name].states.filter(s => s.state !== stateName);
                                                removedState = true;
                                            }
                                        }
                                        if (stateDescription.requiresObjectCausants) {
                                            const hasObjectCausant = alreadyActivatedInfo.causants && alreadyActivatedInfo.causants.find(c => c.type === "object");
                                            if (!hasObjectCausant) {
                                                console.log(`All object causants removed from state ${stateName} on character ${character.name}, which requires object causants, removing state.`);
                                                engine.deObject.stateFor[character.name].states = engine.deObject.stateFor[character.name].states.filter(s => s.state !== stateName);
                                                removedState = true;
                                            }
                                        }
                                    } else if (addCausants) {
                                        // @ts-expect-error typescript being funny as usual, I already null checked above
                                        const exists = alreadyActivatedInfo.causants.find(c => c.name === newCausant.name);
                                        if (!exists) {
                                            console.log(`Adding causant ${newCausant.name} to state ${stateName} on character ${character.name} due to intensity modifier.`);
                                            // @ts-expect-error typescript being funny as usual, I already null checked above
                                            alreadyActivatedInfo.causants.push(newCausant);
                                        }
                                    }
                                }
                            }
                        }


                        // we did not remove the state and we surpass the threshold of accumulators
                        if (!removedState) {
                            if (surpassesThreshold) {
                                if (typeof intensityModifier.intensity !== "number") {
                                    console.log(`State intensity modifier for state ${stateName} on character ${character.name} is set to not modify intensity, skipping intensity change.`);
                                } else {
                                    console.log(`State intensity modifier matched for state ${stateName} on character ${character.name}, applying intensity change: ${intensityModifier.intensity}`);
                                    alreadyActivatedInfo.intensity += intensityModifier.intensity;
                                    if (alreadyActivatedInfo.intensity > 4) {
                                        alreadyActivatedInfo.intensity = 4;
                                    }
                                    if (stateDescription.usesReliefDynamic && intensityModifier.intensity < 0) {
                                        console.log(`State ${stateName} on character ${character.name} is now relieving due to intensity modifier.`);
                                        alreadyActivatedInfo.relieving = true;
                                        if (alreadyActivatedInfo.intensity > 0) {
                                            await onStateRelievedOnCharacter(engine, character, stateName);
                                        }
                                    }
                                    if (alreadyActivatedInfo.intensity < 0) {
                                        // must be removed
                                        console.log(`State ${stateName} on character ${character.name} intensity dropped below zero, removing state.`);
                                        engine.deObject.stateFor[character.name].states = engine.deObject.stateFor[character.name].states.filter(s => s.state !== stateName);
                                        removedState = true;

                                        await onStateRemovedOnCharacter(engine, character, stateName);
                                    }
                                    appliedIntensityChange = true;
                                }
                            } else {
                                console.log(`State ${stateName} on character ${character.name} did not surpass accumulator threshold, skipping intensity change.`);
                            }
                        }
                    } else {
                        if (intensityModifier.useActionAccumulator && intensityModifier.useActionAccumulator.resetIfNo) {
                            await resetAccumulator(engine, character, intensityModifier);
                        }
                    }
                }
            }

            if (!appliedIntensityChange && !removedState) {
                const intensityChangeRatePerInferenceCycle = (alreadyActivatedInfo.relieving ? stateDescription.intensityChangeRatePerInferenceCycleAfterRelief : stateDescription.intensityChangeRatePerInferenceCycle);
                if (intensityChangeRatePerInferenceCycle && intensityChangeRatePerInferenceCycle > 0) {
                    console.log(`No intensity modifiers matched for state ${stateName} on character ${character.name}, applying decay of ${intensityChangeRatePerInferenceCycle}`);
                    alreadyActivatedInfo.intensity += intensityChangeRatePerInferenceCycle;
                    if (alreadyActivatedInfo.intensity > 4) {
                        alreadyActivatedInfo.intensity = 4;
                    }
                    if (stateDescription.usesReliefDynamic && intensityChangeRatePerInferenceCycle < 0) {
                        console.log(`State ${stateName} on character ${character.name} is now relieving due to decay.`);
                        alreadyActivatedInfo.relieving = true;
                        if (alreadyActivatedInfo.intensity > 0) {
                            await onStateRelievedOnCharacter(engine, character, stateName);
                        }
                    }

                    if (alreadyActivatedInfo.intensity < 0) {
                        // must be removed
                        console.log(`State ${stateName} on character ${character.name} intensity dropped below zero, removing state.`);
                        engine.deObject.stateFor[character.name].states = engine.deObject.stateFor[character.name].states.filter(s => s.state !== stateName);
                        removedState = true;
                        await onStateRemovedOnCharacter(engine, character, stateName);
                    }
                }
            }
        } else {
            if (stateDescription.conflictStates) {
                for (const conflictState of stateDescription.conflictStates) {
                    const conflictStateInfo = engine.deObject.stateFor[character.name].states.find(s => s.state === conflictState);
                    if (conflictStateInfo) {
                        console.log(`State ${stateName} conflicts with already active state ${conflictState} on character ${character.name}, not checking trigger conditions`);
                        continue;
                    }
                }
            }

            if (stateDescription.requiredStates) {
                let missingRequiredState = false;
                for (const requiredState of stateDescription.requiredStates) {
                    const requiredStateInfo = engine.deObject.stateFor[character.name].states.find(s => s.state === requiredState);
                    if (!requiredStateInfo) {
                        console.log(`State ${stateName} requires state ${requiredState} to be active on character ${character.name}, which is missing, not checking trigger conditions`);
                        missingRequiredState = true;
                        break;
                    }
                }
                if (missingRequiredState) {
                    continue;
                }
            }

            if (stateDescription.requiredStatesForTrigger) {
                let missingRequiredState = false;
                for (const requiredState of stateDescription.requiredStatesForTrigger) {
                    const requiredStateInfo = engine.deObject.stateFor[character.name].states.find(s => s.state === requiredState);
                    if (!requiredStateInfo) {
                        console.log(`State ${stateName} requires state ${requiredState} to be active during trigger time on character ${character.name}, which is missing, not checking trigger conditions`);
                        missingRequiredState = true;
                        break;
                    }
                }
                if (missingRequiredState) {
                    continue;
                }
            }

            if (stateDescription.requiresPosture) {
                const characterPosture = engine.deObject.stateFor[character.name].posture;
                if (characterPosture !== stateDescription.requiresPosture) {
                    console.log(`State ${stateName} requires posture ${stateDescription.requiresPosture} on character ${character.name}, current posture is ${characterPosture}, not checking trigger conditions`);
                    continue;
                }
            }

            if (stateDescription.requiresPostureForTrigger) {
                const characterPosture = engine.deObject.stateFor[character.name].posture;
                if (characterPosture !== stateDescription.requiresPostureForTrigger) {
                    console.log(`State ${stateName} requires posture ${stateDescription.requiresPostureForTrigger} on character ${character.name}, current posture is ${characterPosture}, not checking trigger conditions`);
                    continue;
                }
            }

            const potentialCausants = determinePotentialCharacterCausants(
                engine,
                character,
                stateDescription,
                allCharactersInAnalysis,
            );

            if (stateDescription.requiresCharacterCausants) {
                if (potentialCausants.length === 0) {
                    console.log(`State ${stateName} requires character causants on character ${character.name}, but no characters in analysis match the criteria, skipping state activation.`);
                    continue;
                }
            }

            const validActivationTriggers = stateDescription.triggers.filter((t) => {
                const isValid = typeof t.intensity === "number" && t.intensity > 0;
                if (!isValid) {
                    console.warn(`Skipping state activation trigger for state ${stateName} on character ${character.name} because intensity is non-positive or non-numeric.`);
                }
                return isValid;

                // @ts-expect-error
            }).sort((a, b) => b.intensity - a.intensity);

            // check if we can activate the state
            let triggeredState = false;
            const randomRollForStateTrigger = Math.random();
            // sort by highest intensity first
            for (const activationCondition of validActivationTriggers) {
                if (triggeredState) {
                    if (!activationCondition.useActionAccumulator) {
                        continue;
                    }
                    console.log(`State ${stateName} on character ${character.name} already triggered, but next activation condition uses action accumulator ${activationCondition.useActionAccumulator.name}, updating accumulation.`);
                }

                // @ts-ignore
                const result = typeof activationCondition.template === "string" ? activationCondition.template : (await activationCondition.template(engine.deObject, {
                    char: character,
                    potentialCausants: potentialCausants || undefined,
                })).trim();

                let executeTrigger = false;
                if (result === "yes" || result === "Yes" || result === "YES") {
                    console.log(`State activation condition matched immediately for state ${stateName} on character ${character.name}`);
                    executeTrigger = true;
                } else if (result.endsWith("?")) {
                    console.log(`State activation condition for state ${stateName} on character ${character.name} returned a question, using inference to determine yes/no.`);
                    console.log(`Asking question: ${result}`);

                    if (!prompter.initialized) {
                        // prime the generator
                        await prompter.generator.next();
                        prompter.initialized = true;
                    }

                    const yesNoGrammar = `root ::= ("yes" | "no" | "Yes" | "No" | "YES" | "NO") ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\n`;
                    const answer = await prompter.generator.next({
                        maxCharacters: 0,
                        maxSafetyCharacters: 250,
                        maxParagraphs: 1,
                        nextQuestion: result,
                        stopAfter: ["yes", "no", "Yes", "No", "YES", "NO"],
                        stopAt: [],
                        grammar: yesNoGrammar,
                        instructions: "Answer with 'yes' or 'no'",
                    });

                    if (answer.done) {
                        throw new Error("State activation condition prompt generator finished unexpectedly.");
                    }

                    const trimmedAnswer = answer.value.trim().toLowerCase();
                    console.log("Received answer: " + trimmedAnswer);
                    if (trimmedAnswer === "yes") {
                        console.log(`State activation condition matched for state ${stateName} on character ${character.name} via inference`);
                        executeTrigger = true;
                    } else {
                        console.log(`State activation condition for state ${stateName} on character ${character.name} did not match via inference.`);
                    }
                } else {
                    console.log(`State activation condition for state ${stateName} on character ${character.name} did not match.`);
                }

                if (executeTrigger) {
                    if (triggeredState) {
                        if (activationCondition.useActionAccumulator) {
                            console.log(`State ${stateName} on character ${character.name} already triggered, but activation condition matched on the accumulator, updating accumulation only.`);
                            if (activationCondition.useActionAccumulator.usePerCausant) {
                                const causants = await determineCausants(
                                    engine,
                                    character,
                                    stateDescription,
                                    activationCondition,
                                    allCharactersInAnalysis,
                                    prompter,
                                );
                                await accumulate(engine, character, activationCondition, causants);
                            } else {
                                await accumulate(engine, character, activationCondition, null);
                            }
                        }
                    } else {

                        if (randomRollForStateTrigger > (typeof activationCondition.triggerLikelihood === "number" ? activationCondition.triggerLikelihood : 1.0)) {
                            if (activationCondition.useActionAccumulator) {
                                if (activationCondition.useActionAccumulator.usePerCausant) {
                                    const causants = await determineCausants(
                                        engine,
                                        character,
                                        stateDescription,
                                        activationCondition,
                                        allCharactersInAnalysis,
                                        prompter,
                                    );
                                    await accumulate(engine, character, activationCondition, causants);
                                } else {
                                    await accumulate(engine, character, activationCondition, null);
                                }
                            }
                            console.log(`State activation condition matched for state ${stateName} on character ${character.name}, but random roll ${randomRollForStateTrigger} exceeded trigger likelihood ${activationCondition.triggerLikelihood}.`);
                            continue;
                        }

                        const causants = await determineCausants(
                            engine,
                            character,
                            stateDescription,
                            activationCondition,
                            allCharactersInAnalysis,
                            prompter,
                        );

                        let surpassesThreshold = true;
                        let surpassesThresholdCausants = causants;
                        if (activationCondition.useActionAccumulator) {
                            [surpassesThreshold, surpassesThresholdCausants] = await accumulate(engine, character, activationCondition, causants);
                        }

                        if (
                            stateDescription.requiresObjectCausants &&
                            (!causants || causants.filter(c => c.type === "object").length === 0)
                        ) {
                            console.log(`State activation condition matched for state ${stateName} on character ${character.name}, but no object causants found in the response.`);
                            continue;
                        }

                        if (
                            stateDescription.requiresCharacterCausants &&
                            (!causants || causants.filter(c => c.type === "character").length === 0)
                        ) {
                            console.log(`State activation condition matched for state ${stateName} on character ${character.name}, but no character causants found in the response.`);
                            continue;
                        }

                        if (surpassesThreshold) {
                            /**
                             * @type {DEApplyingState}
                             */
                            const state = {
                                state: stateName,
                                intensity: /** @type {number} */ (activationCondition.intensity),
                                causants: surpassesThresholdCausants,
                                contiguousStartActivationCyclesAgo: 0,
                                contiguousStartActivationTime: { ...engine.deObject.currentTime },
                                relieving: false,
                            };

                            engine.deObject.stateFor[character.name].states.push(state);
                            triggeredState = true;

                            await onStateTriggeredOnCharacter(engine, character, stateName);

                            console.log(`State ${stateName} activated on character ${character.name} with intensity ${activationCondition.intensity}.`);
                        } else {
                            console.log(`State activation condition matched for state ${stateName} on character ${character.name}, but did not surpass accumulator threshold.`);
                        }
                    }
                } else {
                    if (activationCondition.useActionAccumulator && activationCondition.useActionAccumulator.resetIfNo) {
                        await resetAccumulator(engine, character, activationCondition);
                    }
                }
            }

            if (!triggeredState) {
                // try by random spawn chance
                if (stateDescription.randomSpawnRate && stateDescription.randomSpawnRate > 0) {
                    const randomRoll = Math.random();
                    if (randomRoll < stateDescription.randomSpawnRate) {
                        console.log(`State ${stateName} randomly spawned on character ${character.name} with spawn rate ${stateDescription.randomSpawnRate} and roll ${randomRoll}.`);

                        if (stateDescription.requiresCharacterCausants || stateDescription.requiresObjectCausants) {
                            console.log(`But state ${stateName} on character ${character.name} requires causants, skipping random spawn.`);
                        } else {
                            /**
                             * @type {DEApplyingState}
                             */
                            const state = {
                                state: stateName,
                                intensity: 1,
                                causants: null,
                                contiguousStartActivationCyclesAgo: 0,
                                contiguousStartActivationTime: { ...engine.deObject.currentTime },
                                relieving: false,
                            };
                            engine.deObject.stateFor[character.name].states.push(state);
                            triggeredState = true;

                            await onStateTriggeredOnCharacter(engine, character, stateName);
                        }
                    }
                }
            }
        }
    }

    if (prompter.initialized) {
        // terminate the generator
        await prompter.generator.next(null);
        prompter.initialized = false;
    }

    await engine.informDEObjectUpdated();
}