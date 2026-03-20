import { DEngine } from "../index.js";
import { getCharacterCanSee, getSysPromptForCharacter } from "../util/character-info.js";
import { emotions } from "../util/emotions.js";
import { createGrammarFromList, generateGrammarForVocabulary, parseListFromGrammarResponse } from "../util/grammar.js";
import { getHistoryFragmentForCharacter } from "../util/messages.js";
import { mergeVocabularyLimits } from "../util/vocabulary.js";
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

    let baseVocabularyLimit = engine.deObject.characters[character.name].vocabularyLimit;
    let vocabularyLimitDominance = 0;

    /**
     * @type {string[]}
     */
    const narrativeEffects = [];
    let narrativeEffectsDominance = 0;

    for (const state of characterSystemPrompt.internalDescription.activeStates) {
        let stateDominance = state.stateInfo.dominance;
        if (state.stateInfo.relieving && typeof state.stateInfo.dominanceAfterRelief === "number") {
            stateDominance = state.stateInfo.dominanceAfterRelief;
        }

        if (state.stateInfo.vocabularyLimit && (stateDominance > vocabularyLimitDominance || !baseVocabularyLimit)) {
            baseVocabularyLimit = state.stateInfo.vocabularyLimit;
            vocabularyLimitDominance = stateDominance;
        } else if (state.stateInfo.vocabularyLimit && stateDominance == vocabularyLimitDominance && baseVocabularyLimit) {
            mergeVocabularyLimits(baseVocabularyLimit, state.stateInfo.vocabularyLimit);
        }

        if (state.stateInfo.primaryEmotion) {
            if (stateDominance > primaryEmotionDominance) {
                primaryEmotion = state.stateInfo.primaryEmotion;
                primaryEmotionDominance = stateDominance;
                emotionalRange = [];
            } else if (stateDominance === primaryEmotionDominance) {
                emotionalRange.push(state.stateInfo.primaryEmotion);
            }
        }

        if (state.stateInfo.emotionalRange) {
            if (stateDominance > primaryEmotionDominance) {
                emotionalRange = [...state.stateInfo.emotionalRange];
            } else if (stateDominance === primaryEmotionDominance) {
                emotionalRange = emotionalRange.concat(state.stateInfo.emotionalRange.filter((emotion) => !emotionalRange.includes(emotion)));
            }
        }
    }

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

            if (action.action.action.primaryEmotion) {
                if (stateDominance > primaryEmotionDominance) {
                    primaryEmotion = action.action.action.primaryEmotion;
                    primaryEmotionDominance = stateDominance;
                    emotionalRange = [];
                } else if (stateDominance === primaryEmotionDominance) {
                    emotionalRange.push(action.action.action.primaryEmotion);
                }
            }

            if (action.action.action.emotionalRange) {
                if (stateDominance > primaryEmotionDominance) {
                    emotionalRange = [...action.action.action.emotionalRange];
                } else if (stateDominance === primaryEmotionDominance) {
                    emotionalRange = emotionalRange.concat(action.action.action.emotionalRange.filter((emotion) => !emotionalRange.includes(emotion)));
                }
            }

            if (action.action.action.vocabularyLimit && (vocabularyLimitDominance < stateDominance || !baseVocabularyLimit)) {
                baseVocabularyLimit = action.action.action.vocabularyLimit;
                vocabularyLimitDominance = stateDominance;
            } else if (action.action.action.vocabularyLimit && vocabularyLimitDominance === stateDominance && baseVocabularyLimit) {
                mergeVocabularyLimits(baseVocabularyLimit, action.action.action.vocabularyLimit);
            }

            if (action.action.action.narrativeEffect && narrativeEffectsDominance < stateDominance) {
                narrativeEffects.push(typeof action.action.action.narrativeEffect === "string" ? action.action.action.narrativeEffect : await action.action.action.narrativeEffect(engine.deObject, {
                    char: character,
                    causants: action.action.applyingState?.causants || undefined,
                }));
                narrativeEffectsDominance = stateDominance;
            } else if (action.action.action.narrativeEffect && narrativeEffectsDominance === stateDominance) {
                narrativeEffects.push(typeof action.action.action.narrativeEffect === "string" ? action.action.action.narrativeEffect : await action.action.action.narrativeEffect(engine.deObject, {
                    char: character,
                    causants: action.action.applyingState?.causants || undefined,
                }));
            }
        }

        if (action.action.action.emotionalRange) {
            emotionalRange = emotionalRange.concat(action.action.action.emotionalRange.filter((emotion) => !emotionalRange.includes(emotion)));
        }
    }

    if (!primaryEmotion && emotionalRange.length > 0) {
        // pick one emotion at random
        primaryEmotion = emotionalRange[Math.floor(Math.random() * emotionalRange.length)];
    }

    if (!primaryEmotion) {
        const systemPromptForEmotion = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(
            `You are an assistant that analyzes the emotional state of a character named ${character.name} based on their current situation, active states, and the actions they are about to take.\n` +
            "You must decide which emotions from the list of potential emotions is the character about to primarily feel",
            [
                "You must answer with a list of emotions that is comma separated, and the first emotion in the list will be the primary emotion that the character is feeling. The rest of the emotions in the list are also part of the emotional range of the character, but are not as strongly felt as the primary emotion.",
            ],
            ([
                "## " + character.name + "'s Description:\n\n" +
                characterSystemPrompt.externalDescription,
                characterSystemPrompt.internalDescription.general,
            ]).join("\n\n"),
        );

        const lastCycleExtended = await getHistoryFragmentForCharacter(engine, character, {
            includeDebugMessages: false,
            includeRejectedMessages: false,
            msgLimit: "LAST_CYCLE_EXPANDED",
        });

        const emotionsList = "## Possible emotions:\n\n" + emotions.map((emotion) => `- ${emotion}`).join("\n") + "\n\n";

        const generator = engine.inferenceAdapter.runQuestioningCustomAgentOn("talk", systemPromptForEmotion, null, lastCycleExtended.messages, ([
            emotionsList,
            ...characterSystemPrompt.internalDescription.stateInjections,
            actionsAsText,
        ]).join("\n\n"), false);

        const ready = await generator.next();
        if (ready.done) {
            throw new Error("Inference adapter questioning generator ended unexpectedly while trying to determine primary emotion.");
        }

        const nextQuestion = `Based on the character's situation, active states, and upcoming actions, which emotions from the list of possible emotions is ${character.name} primarily feeling? Please provide a comma separated list with the primary emotion first.`;

        const emotionResponse = await generator.next({
            maxCharacters: 100,
            maxParagraphs: 1,
            maxSafetyCharacters: 100,
            nextQuestion: nextQuestion,
            stopAt: ["\n"],
            stopAfter: [],
            grammar: createGrammarFromList(engine, emotions).grammar,
            answerTrail: "Emotions:\n\n",
        });

        if (emotionResponse.done || !emotionResponse.value) {
            throw new Error("Inference adapter questioning generator ended unexpectedly while trying to determine primary emotion.");
        }

        const emotionResponseText = emotionResponse.value.trim();
        console.log("Received emotion response: " + emotionResponseText);

        await generator.next(null); // close the generator

        const resultEmotions = parseListFromGrammarResponse(emotionResponseText);
        if (resultEmotions.length > 0) {
            // @ts-ignore
            primaryEmotion = resultEmotions[0].toLowerCase();
            // @ts-ignore
            emotionalRange = resultEmotions.slice(1).map((emotion) => emotion.toLowerCase());
        } else {
            console.warn("No valid emotions were parsed from the response, defaulting to no emotions.");
            primaryEmotion = "neutral";
            emotionalRange = [];
        }
    }

    console.log("Determined primary emotion: " + primaryEmotion);
    console.log("Determined emotional range: " + emotionalRange.join(", "));

    const emotionalProfile = "# Next Story Fragment Rules:\n\n" +
        (primaryEmotion ? `- Have ${character.name} primarily feeling ${primaryEmotion}.\n` : "") +
        (emotionalRange.length > 0 ? `- Include emotions in the range of ${emotionalRange.join(", ")} for ${character.name}.\n` : "") +
        (options.doNotMove ? `- ${character.name} must not move from their location at the ${charState.locationSlot}.\n` : "");

    let narrativeEffectsAsText = "";
    if (baseVocabularyLimit?.mute) {
        narrativeEffects.push(`'${character.name}' is currently mute`);
    } else {
        if (baseVocabularyLimit?.vocabulary) {
            narrativeEffects.push(`'${character.name}' currently has a limited vocabulary`);
        }
        if (baseVocabularyLimit?.elongateWordsEffect) {
            narrativeEffects.push(`'${character.name}' may elongate their words in dialogue`);
        }
        if (baseVocabularyLimit?.stutterEffect) {
            narrativeEffects.push(`'${character.name}' may stutter in dialogue, eg. saying "I... I don't know" instead of "I don't know" or "b-b-but I want to go" instead of "but I want to go"`);
        }
        if (baseVocabularyLimit?.intensityEffect === "CAPITALIZE_SCREAM") {
            narrativeEffects.push(`'${character.name}' is currently screaming and their dialogue should be in all caps to reflect that`);
        }
    }
    if (narrativeEffects.length > 0) {
        narrativeEffectsAsText = "# When narrating ensure that:\n\n" + narrativeEffects.map((effect) => `- ${effect}`).join("\n") + "\n\n";
    }

    const grammar = generateGrammarForVocabulary(engine, baseVocabularyLimit, character.name);

    console.log(characterSystemPrompt.sysprompt);
    console.log("##############");
    console.log(characterSystemPrompt.internalDescription.stateInjections);
    console.log("##############");
    console.log(characterCanSee.everything);
    console.log("##############");
    console.log(actionsAsText);
    console.log("##############");
    console.log(narrativeEffectsAsText);
    console.log("##############");
    console.log(emotionalProfile);
    console.log("##############");
    console.log(grammar);

    // TODO schizophrenia voices and whatnot

    const messages = (await getHistoryFragmentForCharacter(engine, character, {
        includeDebugMessages: false,
        includeRejectedMessages: false,
        msgLimit: "ALL",
        useExponentialShrinkingSelectiveContextWindowStrategy: true,
    })).messages;

    const generator = engine.inferenceAdapter.inferNextStoryFragmentFor(
        character,
        messages,
        characterSystemPrompt.sysprompt,
        characterSystemPrompt.internalDescription.stateInjections,
        characterCanSee.everything,
        actions.map((action) => action.text),
        narrativeEffects,
        primaryEmotion,
        emotionalRange,
        grammar,
    );

    // TODO important instructions about [GENERATION COMPLETED] but on inference engine side, not here

    process.exit(1);

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