import { debug } from "../debug.js";
import { DEngine } from "../index.js";
import { getCharacterSurroundingInformation, getExternalDescriptionOfCharacter, getInternalDescriptionOfCharacter } from "../util/character-info.js";
import { emotions } from "../util/emotions.js";
import { createGrammarFromList, generateGrammarForVoice, parseListFromGrammarResponse } from "../util/grammar.js";
import { convertMessagesToSimpleList, getHistoryFragment, getNameIdentificationForOneCharacterTowardsAnother } from "../util/messages.js";
import { getPerspective } from "../util/perspective.js";
import { minimizeSoundDescription, minimizeModeDescription } from "../util/voice.js";
import { mergeVoicesFrom, reweightVoiceForEmotion, selectForcedVoiceEffects } from "../util/voice.js";
import { markCharacterAsDeadEnded } from "../utils.js";

/**
 * @param {DEngine} engine 
 * @param {DECompleteCharacterReference} character
 * @param {{
 *   injectedActions: Array<DEActionPromptInjection<DEStringTemplateCharOnly>>,
 *   microInjections: string[], // these are messages that are injected into the context of the inference adapter for this talk, but are not shown to the story master, they are meant to be used for micro-injections of information that the character would know but the story master doesn't need to know, such as "I see a monster in the bushes" or "I have a knife in my pocket", which can then be used by the inference adapter to generate more accurate dialogue and narration, but doesn't need to be shown to the story master
 *   microVoices: DEVoiceDescription[] // limits for the micro-injections voice
 * }} options
 */
export async function talk(engine, character, options) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    } else if (!engine.inferenceAdapter) {
        throw new Error("Inference adapter not initialized");
    } else if (!engine.deObject.characters[character.id]) {
        throw new Error(`Character ${character.id} not found in the engine`);
    } else if (!engine.dataManager) {
        throw new Error("Data manager not initialized");
    }

    if (!debug.ENABLED_TALK) {
        return {
            hasDeadEnded: false,
            hasDied: false,
            /** @type {DEEmotionNames} */
            // @ts-ignore
            primaryEmotion: null,
            /** @type {DEEmotionNames[]} */
            // @ts-ignore
            emotionalRange: [],
            message: "",
        };
    }

    const charState = engine.deObject.stateFor[character.id];

    if (charState.dead) {
        throw new Error(`Character ${character.id} is dead and cannot talk.`);
    } else if (charState.deadEnded) {
        throw new Error(`Character ${character.id} is in a dead end scenario and cannot talk.`);
    } else if (!charState.conversationId) {
        throw new Error(`Character ${character.id} is not currently in a conversation and cannot talk.`);
    }

    const ourCharacterName = getNameIdentificationForOneCharacterTowardsAnother(engine.deObject, character, character);
    const internalDescription = await getInternalDescriptionOfCharacter(engine.deObject, character.id);
    const externalDescription = await getExternalDescriptionOfCharacter(engine.deObject, character.id, character.id, false, false);

    /**
     * @type {string[]}
     */
    const effects = [];
    let actions = (await Promise.all([...internalDescription.actions, ...options.injectedActions].map(async (action) => {
        if (typeof action.probability === "number" && Math.random() > action.probability) {
            return null;
        }
        const text = action.action ? (typeof action.action === "string" ? action.action : await action.action(
            {
                char: character,
            }
        )) : "";
        const narrativeAction = typeof action.narrativeAction === "string" ? action.narrativeAction : (action.narrativeAction ? await action.narrativeAction(
            {
                char: character,
            },
        ) : "");
        const narrativeEffect = typeof action.narrativeEffect === "string" ? action.narrativeEffect : (action.narrativeEffect ? await action.narrativeEffect(
            {
                char: character,
            }
        ) : "");
        const narrativeActionTrimmed = narrativeAction.trim();
        const trimmed = text.trim();

        if (narrativeEffect) {
            // narrative effects are separate
            effects.push(narrativeEffect);
        }

        if (!trimmed && !narrativeActionTrimmed) {
            return null;
        }

        return {
            actionObject: action,
            action: trimmed || null,
            narrativeAction: narrativeActionTrimmed || null,
        }
    }))).filter((action) => !!action);

    const deadEndAction = actions.find((action) => action.actionObject.isDeadEndScenario);

    let characterHasDied = false;
    if (deadEndAction) {
        console.log(`Dead end scenario detected for character ${ourCharacterName} with action: ${deadEndAction.action}`);
        if (deadEndAction.actionObject.deadEndIsDeath) {
            characterHasDied = true;
        }
        // limiting to that one only
        actions = [deadEndAction];
    }

    let microInjectionsAsText = "";
    if (!deadEndAction && options.microInjections && options.microInjections.length > 0) {
        microInjectionsAsText = "# Additionally:\n\n - " + options.microInjections.join("\n - ");
    }

    /**
     * @type {DEEmotionNames | null}
     */
    let primaryEmotion = null;
    let primaryEmotionDominance = -1;
    /**
     * @type {DEEmotionNames[]}
     */
    let emotionalRange = [];

    let baseVoice = engine.deObject.characters[character.id].voice;
    for (const microVoice of options.microVoices || []) {
        baseVoice = baseVoice ? mergeVoicesFrom(baseVoice, microVoice) : microVoice;
    }
    let voiceDominance = 0;

    /**
     * @type {string[]}
     */
    const narrativeEffects = [];
    let narrativeEffectsDominance = 0;

    /**
     * @type {Array<{state: string, dominance: number}>}
     */
    const activeStates = [];

    for (const action of actions) {
        if (action.actionObject.primaryEmotion) {
            if ((action.actionObject.dominance || 0) > primaryEmotionDominance) {
                primaryEmotion = action.actionObject.primaryEmotion;
                primaryEmotionDominance = action.actionObject.dominance || 0;
                emotionalRange = [];
            } else if (action.actionObject.dominance === primaryEmotionDominance) {
                emotionalRange.push(action.actionObject.primaryEmotion);
            }
        }

        if (action.actionObject.emotionalRange) {
            if ((action.actionObject.dominance || 0) > primaryEmotionDominance) {
                emotionalRange = [...action.actionObject.emotionalRange];
            } else if ((action.actionObject.dominance || 0) === primaryEmotionDominance) {
                emotionalRange = emotionalRange.concat(action.actionObject.emotionalRange.filter((emotion) => !emotionalRange.includes(emotion)));
            }
        }

        if (action.actionObject.voice && (voiceDominance < (action.actionObject.dominance || 0) || !baseVoice)) {
            baseVoice = action.actionObject.voice;
            voiceDominance = action.actionObject.dominance || 0;
        } else if (action.actionObject.voice && voiceDominance === (action.actionObject.dominance || 0) && baseVoice) {
            mergeVoicesFrom(baseVoice, action.actionObject.voice);
        }

        if (action.actionObject.narrativeEffect && narrativeEffectsDominance < (action.actionObject.dominance || 0)) {
            narrativeEffects.push(typeof action.actionObject.narrativeEffect === "string" ? action.actionObject.narrativeEffect : await action.actionObject.narrativeEffect({
                char: character,
            }));
            narrativeEffectsDominance = action.actionObject.dominance || 0;
        } else if (action.actionObject.narrativeEffect && narrativeEffectsDominance === (action.actionObject.dominance || 0)) {
            narrativeEffects.push(typeof action.actionObject.narrativeEffect === "string" ? action.actionObject.narrativeEffect : await action.actionObject.narrativeEffect({
                char: character,
            }));
        }
    }

    for (const state of internalDescription.activeStates) {
        activeStates.push({
            state: state.applyingState.state,
            dominance: state.stateInfo.dominance,
        });

        let stateDominance = state.stateInfo.dominance;
        if (state.stateInfo.relieving && typeof state.stateInfo.dominanceAfterRelief === "number") {
            stateDominance = state.stateInfo.dominanceAfterRelief;
        }

        if (state.stateInfo.voice && (stateDominance > voiceDominance || !baseVoice)) {
            baseVoice = state.stateInfo.voice;
            voiceDominance = stateDominance;
        } else if (state.stateInfo.voice && stateDominance == voiceDominance && baseVoice) {
            mergeVoicesFrom(baseVoice, state.stateInfo.voice);
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

    if (!primaryEmotion && emotionalRange.length > 0) {
        // pick one emotion at random
        primaryEmotion = emotionalRange[Math.floor(Math.random() * emotionalRange.length)];
    }

    const allMessagesForStory = await getHistoryFragment(engine, character, {
        includeDebugMessages: false,
        includeRejectedMessages: false,
        msgLimit: "ALL",
        useExponentialShrinkingSelectiveContextWindowStrategy: true,
        perspective: "character",
    });

    if (!primaryEmotion) {
        const systemPromptForEmotion = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(
            `You are an assistant that analyzes the emotional state of a character ${ourCharacterName} based on their current situation, active states, and the actions they are about to take.\n` +
            "You must decide which emotions from the list of potential emotions is the character about to primarily feel",
            [
                "You must answer with a list of emotions that is comma separated, and the first emotion in the list will be the primary emotion that the character is feeling. The rest of the emotions in the list are also part of the emotional range of the character, but are not as strongly felt as the primary emotion.",
            ],
            ([
                "## " + ourCharacterName + "'s Description:" +
                externalDescription.descriptionForUser,
                internalDescription.general,
            ]).join("\n\n"),
        );

        const emotionsCharacterCantFeel = Object.keys(character.emotions).filter((emotion) =>
            // @ts-ignore
            character.emotions[emotion].unable
        );

        const availableEmotions = emotions.filter((emotion) => !emotionsCharacterCantFeel.includes(emotion));

        const emotionsList = "## Possible emotions:\n\n" + availableEmotions.map((emotion) => `- ${emotion}`).join("\n") + "\n\n";

        const expressiveStatesAsTextList = internalDescription.activeStates.filter((state) => state.expressive).map((state) => `- ${ourCharacterName} is ${state.expressive}`).join("\n");
        const actionsAsTextList = actions.filter((action) => action.action || action.narrativeAction).map((action) => `- The following action is to be performed "${action.action || action.narrativeAction}"`).join("\n");
        const keepInMindText = expressiveStatesAsTextList || actionsAsTextList ? "## Keep in mind:\n\n" + (expressiveStatesAsTextList + "\n" + actionsAsTextList).trim() : "";

        const generator = engine.inferenceAdapter.runQuestioningCustomAgentOn("talk", {
            system: systemPromptForEmotion,
            contextInfoBefore: null,
            messages: convertMessagesToSimpleList(allMessagesForStory.messages),
            contextInfoAfter: ([
                emotionsList,
                keepInMindText,
                microInjectionsAsText,
            ]).filter((section) => !!section).join("\n\n"),
        });

        const ready = await generator.next();
        if (ready.done) {
            throw new Error("Inference adapter questioning generator ended unexpectedly while trying to determine primary emotion.");
        }

        const nextQuestion = `Based on the character's situation, active states, and upcoming actions, which emotions from the list of possible emotions is ${ourCharacterName} primarily feeling? Please provide a comma separated list with the primary emotion first.`;

        const emotionResponse = await generator.next({
            maxCharacters: 100,
            maxParagraphs: 1,
            maxSafetyCharacters: 100,
            maxCharactersCutOnDot: true,
            nextQuestion: nextQuestion,
            stopAt: ["\n"],
            stopAfter: [],
            grammar: createGrammarFromList(availableEmotions).grammar,
        });

        if (emotionResponse.done || !emotionResponse.value) {
            throw new Error("Inference adapter questioning generator ended unexpectedly while trying to determine primary emotion.");
        }

        const emotionResponseText = emotionResponse.value.text.trim();

        console.log("Received emotion response: " + emotionResponseText);

        await generator.next(null); // close the generator

        const resultEmotions = parseListFromGrammarResponse(emotionResponseText);
        if (resultEmotions.length > 0) {
            // @ts-ignore
            primaryEmotion = resultEmotions[0].toLowerCase();
        } else {
            console.warn("No valid emotions were parsed from the response, defaulting to no emotions.");
            primaryEmotion = "neutral";
        }
    }

    console.log("Determined primary emotion for " + ourCharacterName + ": " + primaryEmotion);
    console.log("Determined emotional range for " + ourCharacterName + ": " + emotionalRange.join(", "));

    engine.deObject.stateFor[character.id].primaryEmotion = primaryEmotion || "neutral";
    engine.deObject.stateFor[character.id].emotionalRange = emotionalRange;

    let considerMute = false;
    if ((baseVoice?.mute || baseVoice?.dialogueLikelihood === 0) && !baseVoice?.description) {
        considerMute = true;
    } else {
        if (baseVoice?.description) {
            const description = typeof baseVoice.description === "string" ? baseVoice.description : await baseVoice.description({
                char: character,
                // @ts-ignore
                emotion: primaryEmotion,
            });
            if (description) {
                narrativeEffects.push(`'${character}' voice description: ${description}`);
            }
        }
    }

    /**
     * @type {typeof actions}
     * 
     * I couldn't figure how to omit action from the array
     */
    const actionsLeftToConsume = actions;

    // Pre narration and post narration injections
    for (const state of internalDescription.activeStates) {
        if (state.stateInfo.preNarration) {
            const probability = state.stateInfo.preNarration.likelihood || 1;
            if (Math.random() < probability) {
                const isRelieving = state.applyingState.relieving;
                const preNarrationOrigin = isRelieving ? state.stateInfo.preNarration.afterRelief : state.stateInfo.preNarration.narration;
                if (preNarrationOrigin) {
                    const preNarrationText = typeof preNarrationOrigin === "string" ? preNarrationOrigin : await preNarrationOrigin({
                        char: character,
                        causes: state.applyingState.causes || null,
                    });
                    const trimmed = preNarrationText.trim();
                    if (trimmed) {
                        actionsLeftToConsume.unshift({
                            actionObject: {
                                deadEndIsDeath: false,
                                emotionalRange: [],
                                isDeadEndScenario: false,
                                primaryEmotion: "neutral",
                                action: "",
                            },
                            narrativeAction: trimmed,
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
                    const postNarrationText = typeof postNarrationOrigin === "string" ? postNarrationOrigin : await postNarrationOrigin({
                        char: character,
                        causes: state.applyingState.causes || null,
                    });
                    const trimmed = postNarrationText.trim();
                    if (trimmed) {
                        actionsLeftToConsume.push({
                            actionObject: {
                                deadEndIsDeath: false,
                                emotionalRange: [],
                                isDeadEndScenario: false,
                                primaryEmotion: "neutral",
                                action: "",
                            },
                            narrativeAction: trimmed,
                            action: null,
                        })
                    }
                }
            }
        }
    }

    let narrationStyle = engine.deObject.narrationStyle;
    if (baseVoice?.narrationStyle) {
        narrationStyle = baseVoice.narrationStyle;
    }

    let totalToGenerate = narrationStyle.minParagraphs + Math.floor(Math.random() * (narrationStyle.maxParagraphs - narrationStyle.minParagraphs + 1));

    /**
     * @type {Array<"narration" | "dialogue">}
     */
    const generated = [];

    /**
     * @type {{value: {
     * actionObject: DEActionPromptInjection<DEStringTemplateCharOnly>;
     * action: string | null;
     * narrativeAction: string | null;
     * } | null} | null}
     */
    let lastActionThatReceivedAThought = null;

    /**
     * @type {{
     * actionObject: DEActionPromptInjection<DEStringTemplateCharOnly>;
     * action: string | null;
     * narrativeAction: string | null;
     * } | null}
     */
    let lastActionConsumed = null;

    /**
     * @type {() => ({
     *    type: "narration" | "dialogue",
     *    action: string | null,
     *    narrativeAction: string | null,
     *    think: boolean,
     * } | null)}
     */
    const getNextToGenerate = () => {
        let toConsume = actionsLeftToConsume.shift() || null;
        if (!toConsume && lastActionConsumed) {
            toConsume = lastActionConsumed;
        }
        lastActionConsumed = toConsume;

        const narrativeAction = toConsume && toConsume.narrativeAction ? toConsume.narrativeAction : null;
        const action = toConsume ? toConsume.action : null;

        let canDeliverThroughDialogue = considerMute ?
            (toConsume ? (toConsume.actionObject.actionMustBe === "dialogue" || toConsume.actionObject.actionMustBe === "any" || !toConsume.actionObject.actionMustBe) : true) : false;

        if (canDeliverThroughDialogue && baseVoice) {
            if (typeof baseVoice.dialogueLikelihood === "number") {
                canDeliverThroughDialogue = Math.random() <= baseVoice.dialogueLikelihood;
            }
        }

        // only think again if it not the same action as before, including the "non-action"
        let willThink = lastActionThatReceivedAThought ? lastActionThatReceivedAThought.value !== toConsume : true;
        if (willThink) {
            // subject it to probability now
            willThink = Math.random() <= character.thinkBeforeAct;
        }
        if (willThink) {
            lastActionThatReceivedAThought = {
                value: toConsume || null,
            };
        }

        if (generated.length >= totalToGenerate) {
            if (!generated.includes("dialogue") && canDeliverThroughDialogue) {
                // force dialogue if we haven't generated any yet
                generated.push("dialogue");
                if (narrativeAction) {
                    generated.push("narration");
                }

                return {
                    type: "dialogue",
                    action,
                    narrativeAction,
                    think: willThink,
                }
            } else if (actionsLeftToConsume.length > 0) {
                generated.push("narration");
                if (narrativeAction) {
                    generated.push("narration");
                }
                return {
                    type: "narration",
                    action,
                    narrativeAction,
                    think: willThink,
                }
            }
            return null;
        }

        const lastGenerated = generated.length > 0 ? generated[generated.length - 1] : null;

        // always switch from dialogue to narration, and always start in narration
        if ((lastGenerated && lastGenerated === "dialogue") || generated.length === 0) {
            generated.push("narration");
            if (narrativeAction) {
                generated.push("narration");
            }
            return {
                type: "narration",
                action,
                narrativeAction,
                think: willThink,
            }
        }

        const areLastTwoElementsNarration = generated.length >= 2 && generated[generated.length - 1] === "narration" && generated[generated.length - 2] === "narration";
        const nextType = considerMute ? "narration" : (areLastTwoElementsNarration ? "dialogue" : (Math.random() < narrationStyle.narrativeBias ? "narration" : "dialogue"));
        generated.push(nextType);
        if (narrativeAction) {
            generated.push("narration");
        }
        return {
            type: nextType,
            action,
            narrativeAction,
            think: willThink,
        };
    }

    const conversationObject = await engine.dataManager.getConversation(charState.conversationId);

    const participantsThatJustStartedTalkingTo = [];
    if (conversationObject) {
        for (const participantName of conversationObject.participants) {
            if (participantName === character.id) {
                continue;
            }
            if (await engine.getDEObject().utils.bonds.justStartedTalkingToEachOther(character.id, participantName)) {
                participantsThatJustStartedTalkingTo.push(participantName);
            }
        }

        for (const participantId of conversationObject.participants) {
            const participantCharacterObject = engine.deObject.characters[participantId];

            const theyJustStartedTalkingToCharacter = participantsThatJustStartedTalkingTo.includes(participantId);

            const isHumanoid = participantCharacterObject.speciesType === "humanoid";

            const isBottomNaked = engine.deObject.utils.characterInfo.isBottomNaked(participantId);
            const isTopNaked = engine.deObject.utils.characterInfo.isTopNaked(participantId);
            const isFullyNaked = isBottomNaked && isTopNaked;

            const andIsAStranger = engine.deObject.utils.bonds.isStrangerTowards(character.id, participantId);

            const participantName = getNameIdentificationForOneCharacterTowardsAnother(engine.deObject, character, participantCharacterObject);

            const isAStrangerMessage = andIsAStranger ? `, and ${participantName} is a stranger to ${ourCharacterName}` : "";

            if (theyJustStartedTalkingToCharacter) {
                if (isHumanoid && isFullyNaked) {
                    narrativeEffects.push(`Keep in mind that ${participantName} is currently fully naked${isAStrangerMessage}, and ${ourCharacterName} MUST react and point that fact.`);
                } else if (isHumanoid && isBottomNaked) {
                    narrativeEffects.push(`Keep in mind ${participantName} is currently not wearing any pants or underwear${isAStrangerMessage}, and ${ourCharacterName} MUST react and point that fact.`);
                }
            }
        }
    }

    let nextToGenerate = getNextToGenerate();
    /**
     * @type {"think" | "generate-type" | "narrate" | "done"}
     */
    let phase = "think";

    const reweightedVoice = reweightVoiceForEmotion(baseVoice, primaryEmotion, emotionalRange, activeStates);
    const characterPerspective = await engine.deObject.database.getLastPerspectiveOfCharacter(character.id) || await getPerspective(engine.deObject, character.id, []);

    let fragmentCount = -1;
    while (nextToGenerate) {
        if (phase === "done") {
            nextToGenerate = getNextToGenerate();
            phase = "think";
            continue;
        }

        if (phase === "think" && !nextToGenerate.think) {
            phase = "generate-type";
            continue;
        }

        if (phase === "narrate" && !nextToGenerate.narrativeAction) {
            phase = "done";
            continue;
        }

        fragmentCount++;

        /**
         * @type {string|null}
         */
        let followingAction = null;
        if (phase === "narrate") {
            followingAction = (`${nextToGenerate.narrativeAction}`);
            console.log("Generating next narrative action: " + nextToGenerate.narrativeAction);
        } else if (phase === "generate-type" && nextToGenerate.action) {
            followingAction = (`${ourCharacterName} must take the following action next: ${nextToGenerate.action}`);
            console.log("Generating next " + nextToGenerate.type + (nextToGenerate.action ? ` with action: ${nextToGenerate.action}` : ""));
        } else if (phase === "think") {
            if (nextToGenerate.action) {
                followingAction = (`${ourCharacterName} must think about the following action they will take next: ${nextToGenerate.action}`);
            } else {
                followingAction = (`${ourCharacterName} must think about what action they will take next`);
            }
        }

        const nextIsNarrationOrThought = phase === "think" || phase === "narrate" ? true : nextToGenerate.type === "narration";
        const forcedVoiceEffects = nextIsNarrationOrThought ? {
            forcedMode: null,
            forcedSounds: [],
        } : selectForcedVoiceEffects(reweightedVoice);

        // We fetch again, the reason is that we are updating all this as we go
        const allMessagesForStoryDuringTalkProcess = await getHistoryFragment(engine, character, {
            includeDebugMessages: false,
            includeRejectedMessages: false,
            msgLimit: "ALL",
            useExponentialShrinkingSelectiveContextWindowStrategy: true,
            perspective: "character",
        });

        const generator = engine.inferenceAdapter.inferNextStoryFragmentFor(
            engine.deObject,
            character,
            {
                messages: convertMessagesToSimpleList(allMessagesForStoryDuringTalkProcess.messages),
                perspective: characterPerspective,
                narrativeEffects,
                externalDescription: externalDescription.description,
                internalDescription: internalDescription,
                availableModes: baseVoice?.modes.map((mode) => mode.label) || [],
                availableSounds: baseVoice?.sounds.map((sound) => sound.label) || [],
                forcedMode: forcedVoiceEffects.forcedMode,
                forcedSounds: forcedVoiceEffects.forcedSounds,
                emotionalRange: emotionalRange,
                followingAction,
                primaryEmotion: primaryEmotion || "neutral",
                type: phase === "think" ? "thought" : (phase === "narrate" ? "narration" : nextToGenerate.type),
                additionalInjections: options.microInjections,
            },
        );

        // TODO add the actual message to the conversation thingy

        if (phase === "think") {
            phase = "generate-type";
        } else if (phase === "generate-type") {
            phase = "narrate";
        } else if (phase === "narrate") {
            phase = "done";
        }
    }

    if (deadEndAction) {
        console.log(`Finalizing dead end action for character ${character.id}`);
        markCharacterAsDeadEnded(engine.deObject, character, deadEndAction.action ? "Executing action: " + deadEndAction.action : "Unknown reason", deadEndAction.actionObject.deadEndIsDeath || false);
    }

    await engine.informDEObjectUpdated();
}
