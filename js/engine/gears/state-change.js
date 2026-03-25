/**
 * Gear that calculates state changes for a character based on recent interactions.
 */

import { stat } from "original-fs";
import { DEngine, getFrozenBonds } from "../index.js";
import { getFamilyBondRelation } from "../util/character-info.js";
import { onStateRelievedOnCharacter, onStateRemovedOnCharacter } from "../utils.js";

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

    const characterState = engine.deObject.stateFor[character.name];
    const activateStates = characterState.states;

    for (const alreadyActivatedInfo of activateStates) {
        const stateDescription = character.states[alreadyActivatedInfo.state];
        const stateName = alreadyActivatedInfo.state;
        const intensityChangeRatePerInferenceCycle = (alreadyActivatedInfo.relieving ? stateDescription.intensityChangeRatePerInferenceCycleAfterRelief : stateDescription.intensityChangeRatePerInferenceCycle);

        let removedState = false;

        if (intensityChangeRatePerInferenceCycle && intensityChangeRatePerInferenceCycle > 0 && alreadyActivatedInfo.contiguousStartActivationCyclesAgo > 0) {
            console.log(`Applying decay of ${intensityChangeRatePerInferenceCycle} to state ${alreadyActivatedInfo.state} on character ${character.name} with current intensity ${alreadyActivatedInfo.intensity}.`);
            alreadyActivatedInfo.intensity += intensityChangeRatePerInferenceCycle;
            if (alreadyActivatedInfo.intensity > 4) {
                alreadyActivatedInfo.intensity = 4;
            }
            if (stateDescription.usesReliefDynamic && intensityChangeRatePerInferenceCycle < 0) {
                console.log(`State ${stateName} on character ${character.name} is now relieving due to decay.`);
                alreadyActivatedInfo.relieving = true;
                if (alreadyActivatedInfo.intensity > 0) {
                    await onStateRelievedOnCharacter(engine.deObject, character, stateName);
                }
            }

            if (alreadyActivatedInfo.intensity < 0) {
                // must be removed
                console.log(`State ${stateName} on character ${character.name} intensity dropped below zero, removing state.`);
                engine.deObject.stateFor[character.name].states = engine.deObject.stateFor[character.name].states.filter(s => s.state !== stateName);
                removedState = true;
                await onStateRemovedOnCharacter(engine.deObject, character, stateName);
            }
        }

        if (removedState) {
            continue;
        }

        const dominanceOfThisState = stateDescription.usesReliefDynamic ? (alreadyActivatedInfo.relieving ? stateDescription.dominanceAfterRelief || 0 : stateDescription.dominance) : stateDescription.dominance;

        if (stateDescription.conflictStates) {
            for (const conflictState of stateDescription.conflictStates) {
                const conflictStateInfo = engine.deObject.stateFor[character.name].states.find(s => s.state === conflictState);
                if (conflictStateInfo) {
                    const conflictingStateDescription = character.states[conflictStateInfo.state];
                    const dominanceOfConflictingState = conflictingStateDescription.usesReliefDynamic ? (conflictStateInfo.relieving ? conflictingStateDescription.dominanceAfterRelief || 0 : conflictingStateDescription.dominance) : conflictingStateDescription.dominance;
                    const whichStateToRemove = dominanceOfThisState > dominanceOfConflictingState ? conflictState : stateName;
                    console.log(`State ${stateName} on character ${character.name} conflicts with state ${conflictState}. Dominance of this state: ${dominanceOfThisState}, dominance of conflicting state: ${dominanceOfConflictingState}. Removing state ${whichStateToRemove}.`);
                    engine.deObject.stateFor[character.name].states = engine.deObject.stateFor[character.name].states.filter(s => s.state !== whichStateToRemove);
                    if (whichStateToRemove === stateName) {
                        removedState = true;
                        await onStateRemovedOnCharacter(engine.deObject, character, stateName);
                        break;
                    } else {
                        await onStateRemovedOnCharacter(engine.deObject, character, conflictState);
                        break;
                    }
                }
            }
        }

        if (removedState) {
            continue;
        }

        if (stateDescription.requiredStates) {
            for (const requiredState of stateDescription.requiredStates) {
                const requiredStateInfo = engine.deObject.stateFor[character.name].states.find(s => s.state === requiredState);
                if (!requiredStateInfo) {
                    // remove the state since its missing
                    console.log(`State ${stateName} on character ${character.name} requires state ${requiredState} which is not present. Removing state ${stateName}.`);
                    engine.deObject.stateFor[character.name].states = engine.deObject.stateFor[character.name].states.filter(s => s.state !== stateName);
                    removedState = true;
                    await onStateRemovedOnCharacter(engine.deObject, character, stateName);
                    break;
                }
            }
        }

        if (removedState) {
            continue;
        }

        if (stateDescription.requiresPosture) {
            const characterPosture = engine.deObject.stateFor[character.name].posture;
            if (characterPosture !== stateDescription.requiresPosture) {
                console.log(`State ${stateName} on character ${character.name} requires posture ${stateDescription.requiresPosture}, current posture is ${characterPosture}. Removing state ${stateName}.`);
                engine.deObject.stateFor[character.name].states = engine.deObject.stateFor[character.name].states.filter(s => s.state !== stateName);
                removedState = true;
                await onStateRemovedOnCharacter(engine.deObject, character, stateName);
            }
        }

        if (removedState) {
            continue;
        }

        if (stateDescription.requiresCausants) {
            const causants = alreadyActivatedInfo.causants || [];
            if (causants.length === 0) {
                console.log(`State ${stateName} on character ${character.name} requires causants but has none. Removing state ${stateName}.`);
                engine.deObject.stateFor[character.name].states = engine.deObject.stateFor[character.name].states.filter(s => s.state !== stateName);
                removedState = true;
                await onStateRemovedOnCharacter(engine.deObject, character, stateName);
                continue;
            }
        }

        if (removedState) {
            continue;
        }

        if (stateDescription.requiresCharacterCausants) {
            const causants = alreadyActivatedInfo.causants || [];
            const characterCausants = causants.filter(c => c.type === "character");
            if (characterCausants.length === 0) {
                console.log(`State ${stateName} on character ${character.name} requires character causants but has none. Removing state ${stateName}.`);
                engine.deObject.stateFor[character.name].states = engine.deObject.stateFor[character.name].states.filter(s => s.state !== stateName);
                removedState = true;
                await onStateRemovedOnCharacter(engine.deObject, character, stateName);
                continue;
            }
        }

        if (removedState) {
            continue;
        }

        if (stateDescription.requiresObjectCausants) {
            const causants = alreadyActivatedInfo.causants || [];
            const objectCausants = causants.filter(c => c.type === "object");
            if (objectCausants.length === 0) {
                console.log(`State ${stateName} on character ${character.name} requires object causants but has none. Removing state ${stateName}.`);
                engine.deObject.stateFor[character.name].states = engine.deObject.stateFor[character.name].states.filter(s => s.state !== stateName);
                removedState = true;
                await onStateRemovedOnCharacter(engine.deObject, character, stateName);
                continue;
            }
        }
    }
}