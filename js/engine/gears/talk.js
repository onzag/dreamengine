import { DEngine } from "../index.js";
import { getCharacterCanSee, getSysPromptForCharacter } from "../util/character-info.js";
import { emotions } from "../util/emotions.js";
import { createGrammarFromList, generateGrammarForVocabulary, parseListFromGrammarResponse } from "../util/grammar.js";
import { getHistoryFragmentForCharacter } from "../util/messages.js";
import { mergeVocabularyLimits } from "../util/vocabulary.js";

/**
 * @param {DEngine} engine 
 * @param {DECompleteCharacterReference} character
 * @param {{
 *   doNotMove: boolean, // if true, the character will not be allowed to change location
 *   injectedActions: Array<DEActionPromptInjection<DEStringTemplateCharOnly>>,
 *   microInjections: string[], // these are messages that are injected into the context of the inference adapter for this talk, but are not shown to the story master, they are meant to be used for micro-injections of information that the character would know but the story master doesn't need to know, such as "I see a monster in the bushes" or "I have a knife in my pocket", which can then be used by the inference adapter to generate more accurate dialogue and narration, but doesn't need to be shown to the story master
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
    } else if (!charState.conversationId) {
        throw new Error(`Character ${character.name} is not currently in a conversation and cannot talk.`);
    }

    const addedMessagesForStoryMaster = [];
    let hasDeadEnded = false;
    let hasDied = false;

    const characterSystemPrompt = await getSysPromptForCharacter(engine, character.name);
    const characterCanSee = await getCharacterCanSee(engine.deObject, character.name);

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
                    causes: action.applyingState?.causes,
                }
            );
            const narrativeAction = typeof action.action.narrativeAction === "string" ? action.action.narrativeAction : (action.action.narrativeAction ? await action.action.narrativeAction(
                // @ts-ignore
                engine.deObject,
                {
                    char: character,
                    causes: action.applyingState?.causes,
                },
            ) : null);
            const narrativeActionTrimmed = narrativeAction ? narrativeAction.trim() : null;
            const trimmed = text.trim();
            if (!trimmed && !narrativeActionTrimmed) {
                return null;
            }
            return {
                text: trimmed || null,
                narrativeAction: narrativeActionTrimmed,
                action,
            }
        }
        return null;
    }))).filter((action) => !!action);

    if (options.injectedActions) {
        const injectedActionsProcessed = (await Promise.all(options.injectedActions.map(async (a) => ({
            text: typeof a.action === "string" ? a.action : a.action ? await a.action(engine.getDEObject(), {
                char: character,
            }) : null,
            narrativeAction: typeof a.narrativeAction === "string" ? a.narrativeAction : a.narrativeAction ? await a.narrativeAction(engine.getDEObject(), {
                char: character,
            }) : null,
            action: {
                applyingState: null,
                action: a,
                stateInfo: null,
            }
        })))).filter((action) => !!action.text || !!action.narrativeAction);
        // @ts-ignore typescript doesn't know how to merge these two types of actions, but we know they are compatible
        actions = injectedActionsProcessed.concat(actions);
    }

    let deadEndAction = actions.find((action) => action.action.action.isDeadEndScenario && action.action.action.deadEndIsDeath);
    if (!deadEndAction) {
        deadEndAction = actions.find((action) => action.action.action.isDeadEndScenario);
    }

    if (deadEndAction) {
        console.log(`Dead end scenario detected for character ${character.name} with action: ${deadEndAction.text}`);
        if (deadEndAction.action.action.deadEndIsDeath) {
            hasDied = true;
        }
        // limiting to that one only
        actions = [deadEndAction];
    }

    let actionsAsText = actions.map((action) => action.text).filter((a) => !!a).join("\n - ");
    if (actionsAsText) {
        if (deadEndAction && deadEndAction.action.action.deadEndIsDeath) {
            actionsAsText = "# IMPORTANT: The following action will be executed by " + character.name + " and will result in death:\n\n - " + actionsAsText;
        } else {
            actionsAsText = "# IMPORTANT: The following actions must be executed by " + character.name + ":\n\n - " + actionsAsText;
        }
    }

    let microInjectionsAsText = "";
    if (!deadEndAction && options.microInjections && options.microInjections.length > 0) {
        microInjectionsAsText = "# Additionally:\n\n - " + options.microInjections.join("\n - ");
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

    /**
     * @type {Array<{state: string, dominance: number}>}
     */
    const activeStates = [];

    for (const state of characterSystemPrompt.internalDescription.activeStates) {

        activeStates.push({
            state: state.applyingState.state,
            dominance: state.stateInfo.dominance,
        });

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
                    causes: action.action.applyingState?.causes || null,
                }));
                narrativeEffectsDominance = stateDominance;
            } else if (action.action.action.narrativeEffect && narrativeEffectsDominance === stateDominance) {
                narrativeEffects.push(typeof action.action.action.narrativeEffect === "string" ? action.action.action.narrativeEffect : await action.action.action.narrativeEffect(engine.deObject, {
                    char: character,
                    causes: action.action.applyingState?.causes || null,
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

        const emotionsCharacterCantFeel = Object.keys(character.emotions).filter((emotion) =>
            // @ts-ignore
            character.emotions[emotion].unable
        );

        const availableEmotions = emotions.filter((emotion) => !emotionsCharacterCantFeel.includes(emotion));

        const emotionsList = "## Possible emotions:\n\n" + availableEmotions.map((emotion) => `- ${emotion}`).join("\n") + "\n\n";

        const generator = engine.inferenceAdapter.runQuestioningCustomAgentOn("talk", {
            system: systemPromptForEmotion,
            contextInfoBefore: null,
            messages: lastCycleExtended.messages,
            contextInfoAfter: ([
                emotionsList,
                ...characterSystemPrompt.internalDescription.stateInjections,
                actionsAsText,
                microInjectionsAsText,
            ]).join("\n\n"),
            remarkLastStoryFragmentForAnalysis: false,
        });

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
            grammar: createGrammarFromList(engine, availableEmotions).grammar,
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

    if (primaryEmotion) {
        narrativeEffects.push(`'${character.name}' is primarily feeling ${primaryEmotion}`);
    }

    if (emotionalRange.length > 0) {
        narrativeEffects.push(`'${character.name}' response emotions should also include ${emotionalRange.join(", ")}`);
    }

    if (options.doNotMove) {
        narrativeEffects.push(`${character.name} must not walk away or go to another location`);
    }

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

    const grammar = generateGrammarForVocabulary(engine, baseVocabularyLimit, character.name);

    let narrationStyle = engine.deObject.narrationStyle;
    if (baseVocabularyLimit?.narrationStyle) {
        narrationStyle = baseVocabularyLimit.narrationStyle;
    }

    /**
     * @type string[]
     */
    const trailingMessages = [];
    /**
     * @type string[]
     */
    const finalMessages = [];

    const messages = (await getHistoryFragmentForCharacter(engine, character, {
        includeDebugMessages: false,
        includeRejectedMessages: false,
        msgLimit: "ALL",
        useExponentialShrinkingSelectiveContextWindowStrategy: true,
    })).messages;

    let totalToGenerate = narrationStyle.minParagraphs + Math.floor(Math.random() * (narrationStyle.maxParagraphs - narrationStyle.minParagraphs + 1));
    /**
     * @type {typeof actions}
     * 
     * I couldn't figure how to omit action from the array
     */
    const actionsLeftToConsume = actions;

    // Pre narration and post narration injections
    for (const state of characterSystemPrompt.internalDescription.activeStates) {
        if (state.stateInfo.preNarration) {
            const probability = state.stateInfo.preNarration.likelihood || 1;
            if (Math.random() < probability) {
                const isRelieving = state.applyingState.relieving;
                const preNarrationOrigin = isRelieving ? state.stateInfo.preNarration.afterRelief : state.stateInfo.preNarration.narration;
                if (preNarrationOrigin) {
                    const preNarrationText = typeof preNarrationOrigin === "string" ? preNarrationOrigin : await preNarrationOrigin(engine.deObject, {
                        char: character,
                        causes: state.applyingState.causes || null,
                    });
                    const trimmed = preNarrationText.trim();
                    if (trimmed) {
                        actionsLeftToConsume.unshift({
                            text: null,
                            narrativeText: trimmed,

                            // @ts-ignore
                            action: null,
                        })
                    }
                }
            }
        }

        if (state.stateInfo.postNarration) {
            const probability = state.stateInfo.postNarration.likelihood || 1;
            if (Math.random() < probability) {
                const isRelieving = state.applyingState.relieving;
                const postNarrationOrigin = isRelieving ? state.stateInfo.postNarration.afterRelief : state.stateInfo.postNarration.narration;
                if (postNarrationOrigin) {
                    const postNarrationText = typeof postNarrationOrigin === "string" ? postNarrationOrigin : await postNarrationOrigin(engine.deObject, {
                        char: character,
                        causes: state.applyingState.causes || null,
                    });
                    const trimmed = postNarrationText.trim();
                    if (trimmed) {
                        actionsLeftToConsume.push({
                            text: null,
                            narrativeText: trimmed,

                            // @ts-ignore
                            action: null,
                        })
                    }
                }
            }
        }
    }

    /**
     * @type {*}
     */
    let lastActionConsumed = null;

    /**
     * @type {Array<"narration" | "dialogue">}
     */
    const generatedElements = [];

    /**
     * @type {() => ({
     *    type: "narration" | "dialogue",
     *    action: string | null,
     *    narrativeAction: string | null,
     * } | null)}
     */
    const getNextToGenerate = () => {
        let toConsume = actionsLeftToConsume.shift();
        if (!toConsume) {
            toConsume = lastActionConsumed;
        }
        lastActionConsumed = toConsume;

        const narrativeAction = toConsume && toConsume.narrativeAction ? toConsume.narrativeAction : null;
        const action = toConsume ? toConsume.text : null;

        if (generatedElements.length >= totalToGenerate) {
            if (!generatedElements.includes("dialogue") && !baseVocabularyLimit?.mute) {
                // force dialogue if we haven't generated any yet
                generatedElements.push("dialogue");
                if (narrativeAction) {
                    generatedElements.push("narration");
                }
                return {
                    type: "dialogue",
                    action,
                    narrativeAction,
                }
            } else if (actionsLeftToConsume.length > 0) {
                generatedElements.push("narration");
                if (narrativeAction) {
                    generatedElements.push("narration");
                }
                return {
                    type: "narration",
                    action,
                    narrativeAction,
                }
            }
            return null;
        }

        const lastGenerated = generatedElements[generatedElements.length - 1];
        if (lastGenerated && lastGenerated === "dialogue") {
            generatedElements.push("narration");
            if (narrativeAction) {
                generatedElements.push("narration");
            }
            return {
                type: "narration",
                action,
                narrativeAction,
            }
        }

        const isMute = baseVocabularyLimit?.mute || false;
        const areLastTwoElementsNarration = generatedElements.length >= 2 && generatedElements[generatedElements.length - 1] === "narration" && generatedElements[generatedElements.length - 2] === "narration";
        const nextType = isMute ? "narration" : (areLastTwoElementsNarration ? "dialogue" : (Math.random() < narrationStyle.narrativeBias ? "narration" : "dialogue"));
        generatedElements.push(nextType);
        if (narrativeAction) {
            generatedElements.push("narration");
        }
        return {
            type: nextType,
            action,
            narrativeAction,
        };
    }

    /**
     * @type {DEConversationMessage}
     */
    const nextMessage = {
        canOnlyBeSeenByCharacter: null,
        content: "",
        // This gets set later by time-forwards.js
        duration: {
            inDays: 0,
            inHours: 0,
            inMinutes: 0,
            inSeconds: 0,
        },
        endTime: engine.deObject.currentTime,
        startTime: engine.deObject.currentTime,
        // This is set later by item-change.js
        interactingCharacters: [],
        emotion: primaryEmotion,
        emotionalRange: emotionalRange,
        id: "message-" + Math.random().toString(36).substring(2, 15),
        isCharacter: true,
        isDebugMessage: false,
        isHiddenMessage: false,
        isRejectedMessage: false,
        isStoryMasterMessage: false,
        isUser: false,
        perspectiveSummaryIds: {},
        sender: character.name,
        rumors: [],

        // TODO
        singleSummary: null,
    }

    const conversationObject = engine.deObject.conversations[charState.conversationId];
    conversationObject.messages.push(nextMessage);

    await engine.informDEObjectUpdated();

    let nextToGenerate = getNextToGenerate();
    let nextToGenerateIsSameAsPreviousButNarrativeAction = false;

    let hasHiddenContent = false;
    let hasStandardContent = false;
    while (nextToGenerate) {
        let generatedMessage = "";
        let hasYieldDoubleLineHidden = false;
        let hasYieldDoubleLineStandard = false;

        if (nextToGenerateIsSameAsPreviousButNarrativeAction) {
            trailingMessages.push(`OOC, ${nextToGenerate.narrativeAction}`);
            console.log("Generating next narrative action: " + nextToGenerate.narrativeAction);
        } else if (nextToGenerate.action) {
            trailingMessages.push(`OOC, '${character.name} must take the following action next: ${nextToGenerate.action}`);
            console.log("Generating next " + nextToGenerate.type + (nextToGenerate.action ? ` with action: ${nextToGenerate.action}` : ""));
        }

        const generator = engine.inferenceAdapter.inferNextStoryFragmentFor(
            character,
            {
                messages,
                messagesTrail: trailingMessages,
                system: characterSystemPrompt.sysprompt,
                stateInjections: characterSystemPrompt.internalDescription.stateInjections,
                visibleEnviroment: characterCanSee.everything,
                narrativeEffects,
                grammar: nextToGenerateIsSameAsPreviousButNarrativeAction ? grammar.narrative : (nextToGenerate.type === "dialogue" ? grammar.dialogue : grammar.narrative),
                activeStates,

                // @ts-ignore primary emotion is guaranteed to be set at this point, because if it wasn't, we would have set it to "neutral"
                primaryEmotion,
            },
        );

        let next = await generator.next(true);
        while (!next.done || next.value) {
            const info = next.value;
            if (info) {
                if (info.type === "warning") {
                    engine.informCycleState("warning", info.content);
                } else if (info.type === "hidden") {
                    const contentToSend = hasStandardContent && !hasYieldDoubleLineHidden ? "\n\n" + info.content : info.content;
                    engine.triggerInferingOverConversationMessage(engine.deObject, {
                        conversationId: charState.conversationId,
                        messageId: nextMessage.id,
                        text: contentToSend,
                        hidden: true,
                    });
                    if (!nextMessage.hiddenContent) {
                        nextMessage.hiddenContent = contentToSend;
                    } else {
                        nextMessage.hiddenContent += contentToSend;
                    }
                    hasYieldDoubleLineHidden = true;
                    hasHiddenContent = true;
                } else if (info.type === "text") {
                    generatedMessage += info.content;
                    nextMessage.content += info.content;
                    const contentToSend = hasStandardContent && !hasYieldDoubleLineStandard ? "\n\n" + info.content : info.content;
                    engine.triggerInferingOverConversationMessage(engine.deObject, {
                        conversationId: charState.conversationId,
                        messageId: nextMessage.id,
                        text: contentToSend,
                        hidden: false,
                    });
                    nextMessage.content += contentToSend;
                    hasYieldDoubleLineStandard = true;
                    hasStandardContent = true;
                }
            }
            if (!next.done) {
                next = await generator.next(true);
            }
        }

        console.log("\nFinished receiving text chunk from inference adapter.");
        trailingMessages.push(generatedMessage);
        finalMessages.push(generatedMessage);

        if (nextToGenerate.narrativeAction) {
            nextToGenerateIsSameAsPreviousButNarrativeAction = true;
        } else {
            nextToGenerate = getNextToGenerate();
            nextToGenerateIsSameAsPreviousButNarrativeAction = false;
        }
    }

    const totalGeneratedThusFar = finalMessages.join("\n\n");
    console.log("Final generated narration/dialogue: " + totalGeneratedThusFar);


    if (deadEndAction) {
        console.log(`Finalizing dead end action for character ${character.name}: ${deadEndAction.text}`);
        if (deadEndAction.action.action.deadEndIsDeath) {
            console.log(`Character ${character.name} has died.`);
            addedMessagesForStoryMaster.push(`${character.name} has died.`);
            charState.dead = true;
        }
        charState.deadEnded = true;
        charState.deadEndReason = deadEndAction.text;

        if (charState.dead) {
            // TODO change the description of the character to reflect they are dead
            // await updateCharacterDescription(engine, character.name, "dead", "The lifeless body of " + character.name);
            // keep in mind "CHARACTER_OVERRIDES_" + characterDef.name
            // so the state can be recovered
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

        const socialBonds = engine.deObject.bonds;
        for (const charName in socialBonds) {
            const charBonds = socialBonds[charName];
            const existingBond = charBonds.active.find((bond) => bond.towards === character.name);
            if (existingBond) {
                charBonds.active = charBonds.active.filter((bond) => bond.towards !== character.name);
                charBonds.ex.push(existingBond);
            }
        }

        hasDeadEnded = true;
    }

    await engine.informDEObjectUpdated();

    return {
        addedMessagesForStoryMaster,
        hasDeadEnded,
        hasDied,
        /** @type {DEEmotionNames} */
        // @ts-ignore
        primaryEmotion,
        /** @type {DEEmotionNames[]} */
        // @ts-ignore
        emotionalRange,
        message: totalGeneratedThusFar,
    }
}