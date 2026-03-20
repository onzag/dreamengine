import { DEngine } from "../index.js";
import { getCharacterCanSee, getSysPromptForCharacter } from "../util/character-info.js";
import { applyStateChange, checkAllActiveStatesConsistency } from "./state-change.js";

/**
 * @param {DEngine} engine 
 * @param {DECompleteCharacterReference} character
 * @param {{
 *   doNotMove: boolean, // if true, the character will not be allowed to change location
 * }} options
 */
export async function talk(engine, character, options) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    } else if (!engine.inferenceAdapter) {
        throw new Error("Inference adapter not initialized");
    } else if (!engine.deObject.characters[character.name]) {
        throw new Error(`Character ${character.name} not found in the engine`);
    }

    const charState = engine.deObject.stateFor[character.name];

    if (charState.dead) {
        throw new Error(`Character ${character.name} is dead and cannot talk.`);
    } else if (charState.deadEnded) {
        throw new Error(`Character ${character.name} is in a dead end scenario and cannot talk.`);
    }

    const addedMessagesForStoryMaster = [];
    let hasDeadEnded = false;

    const characterSystemPrompt = await getSysPromptForCharacter(engine, character.name);
    const characterCanSee = await getCharacterCanSee(engine, character.name);

    let actions = (await Promise.all(characterSystemPrompt.internalDescription.actions.map(async (action) => {
        if (action.action.action) {
            if (typeof action.action.probability === "number" && Math.random() > action.action.probability) {
                return null;
            }
            const text = typeof action.action.action === "string" ? action.action.action : await action.action.action(
                // @ts-ignore
                engine.deObject,
                {
                    char: character,
                    causants: action.applyingState?.causants || undefined,
                }
            );
            const trimmed = text.trim();
            if (!trimmed) {
                return null;
            }
            return {
                text: trimmed,
                action,
            }
        }
        return null;
    }))).filter((action) => !!action);

    let deadEndAction = actions.find((action) => action.action.action.isDeadEndScenario && action.action.action.deadEndIsDeath);
    if (!deadEndAction) {
        deadEndAction = actions.find((action) => action.action.action.isDeadEndScenario);
    }

    if (deadEndAction) {
        console.log(`Dead end scenario detected for character ${character.name} with action: ${deadEndAction.text}`);
        // limiting to that one only
        actions = [deadEndAction];
    }

    let actionsAsText = actions.map((action) => action.text).join("\n - ");
    if (actionsAsText) {
        if (deadEndAction && deadEndAction.action.action.deadEndIsDeath) {
            actionsAsText = "# IMPORTANT: The following action will be executed by " + character.name + " and will result in death:\n\n - " + actionsAsText;
        } else {
            actionsAsText = "# IMPORTANT: The following actions must be executed by " + character.name + ":\n\n - " + actionsAsText;
        }
    }

    /**
     * @type {DEEmotionNames | null}
     */
    let primaryEmotion = null;
    let primaryEmotionDominance = 0;
    /**
     * @type {DEEmotionNames[]}
     */
    let emotionalRange = [];

    for (const action of actions) {
        if (action.action.action.primaryEmotion) {
            let stateDominance = 0;
            if (action.action.stateInfo) {
                stateDominance = action.action.stateInfo.dominance;
                if (action.action.stateInfo.relieving && typeof action.action.stateInfo.dominanceAfterRelief === "number") {
                    stateDominance = action.action.stateInfo.dominanceAfterRelief;
                }
            } else {
                // a very high dominance for actions that don't have state info, so they can easily override emotions from states, but not from other actions with state info
                stateDominance = 50;
            }

            if (primaryEmotionDominance <= stateDominance) {
                primaryEmotion = action.action.action.primaryEmotion;
                if (!emotionalRange.includes(action.action.action.primaryEmotion)) {
                    emotionalRange.push(action.action.action.primaryEmotion);
                }
                primaryEmotionDominance = stateDominance;
            }
        }

        if (action.action.action.emotionalRange) {
            emotionalRange = emotionalRange.concat(action.action.action.emotionalRange.filter((emotion) => !emotionalRange.includes(emotion)));
        }
    }

    if (!primaryEmotion) {
        // TODO come up with one ask agent?
    }

    console.log(characterSystemPrompt.sysprompt);
    console.log("##############");
    console.log(characterSystemPrompt.internalDescription.stateInjections);
    console.log("##############");
    console.log(characterCanSee.everything);
    console.log("##############");

    if (deadEndAction) {
        console.log(`Finalizing dead end action for character ${character.name}: ${deadEndAction.text}`);
        if (deadEndAction.action.action.deadEndIsDeath) {
            console.log(`Character ${character.name} has died.`);
            addedMessagesForStoryMaster.push(`Character ${character.name} has died.`);
            charState.dead = true;
        }
        charState.deadEnded = true;
        charState.deadEndReason = deadEndAction.text;

        if (charState.dead) {
            // TODO change the description of the character to reflect they are dead
        }

        if (!charState.dead) {
            // normal deadEnd, we need to remove the character from the story

            /**
             * Removes the character from any item list.
             * @param {DEItem[]} items 
             */
            const removeCharFromAnyItemList = (items) => {
                for (const item of items) {
                    if (item.containingCharacters.includes(character.name)) {
                        item.containingCharacters = item.containingCharacters.filter((char) => char !== character.name);
                    }
                    if (item.ontopCharacters.includes(character.name)) {
                        item.ontopCharacters = item.ontopCharacters.filter((char) => char !== character.name);
                    }
                    removeCharFromAnyItemList(item.containing);
                    removeCharFromAnyItemList(item.ontop);
                }
            };

            removeCharFromAnyItemList(engine.deObject.world.locations[charState.location].slots[charState.locationSlot].items);

            // @ts-ignore
            charState.location = null;
            // @ts-ignore
            charState.locationSlot = null;
        }

        const socialBonds = engine.deObject.social.bonds;
        for (const charName in socialBonds) {
            const charBonds = socialBonds[charName];
            const existingBond = charBonds.active.find((bond) => bond.towards === character.name);
            if (existingBond) {
                charBonds.active = charBonds.active.filter((bond) => bond.towards !== character.name);
                charBonds.ex.push(existingBond);
            }
        }

        hasDeadEnded = true;
    } else {
        for (const action of actions) {
            const actionAsWithIntensity = /** @type {DEActionPromptInjectionWithIntensity} */ (action.action.action);
            if (actionAsWithIntensity.intensityModification && action.action.applyingState) {
                console.log(`Action: ${action.text} (applies intensity modification: ${actionAsWithIntensity.intensityModification})`);
                await applyStateChange(engine, character, action.action.applyingState.state, actionAsWithIntensity.intensityModification);
            }
        }

        await checkAllActiveStatesConsistency(engine, character);
    }

    return {
        addedMessagesForStoryMaster,
        hasDeadEnded,
        primaryEmotion,
        emotionalRange,
    }
}