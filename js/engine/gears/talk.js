import { debug } from "../debug.js";
import { DEngine } from "../index.js";
import { getCharacterCanSee, getSysPromptForCharacter } from "../util/character-info.js";
import { emotions } from "../util/emotions.js";
import { createGrammarFromList, generateGrammarForVoice, parseListFromGrammarResponse } from "../util/grammar.js";
import { convertContentToSimpleList, convertMessagesToSimpleList, getHistoryFragmentForCharacter, getNameIdentificationForOneCharacterTowardsAnother } from "../util/messages.js";
import { minimizeSoundDescription, minimizeModeDescription } from "../util/voice.js";
import { mergeVoicesFrom, reweightVoiceForEmotion, selectForcedVoiceEffects } from "../util/voice.js";

/**
 * @param {DEngine} engine 
 * @param {DECompleteCharacterReference} character
 * @param {{
 *   doNotMove: boolean, // if true, the character will not be allowed to change location
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
            addedMessagesForStoryMaster: [],
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

    const conversationId = charState.conversationId;

    const ourCharacterName = getNameIdentificationForOneCharacterTowardsAnother(engine.deObject, character, character);

    const addedMessagesForStoryMaster = [];
    let hasDeadEnded = false;
    let hasDied = false;

    const characterSystemPrompt = await getSysPromptForCharacter(engine, character.id);
    const characterCanSee = await getCharacterCanSee(engine.deObject, character.id);

    let actions = (await Promise.all(characterSystemPrompt.internalDescription.actions.map(async (action) => {
        if (action.action.action) {
            if (typeof action.action.probability === "number" && Math.random() > action.action.probability) {
                return null;
            }
            const text = typeof action.action.action === "string" ? action.action.action : await action.action.action(
                {
                    char: character,
                    causes: action.applyingState?.causes || null,
                }
            );
            const narrativeAction = typeof action.action.narrativeAction === "string" ? action.action.narrativeAction : (action.action.narrativeAction ? await action.action.narrativeAction(
                {
                    char: character,
                    causes: action.applyingState?.causes || null,
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
            text: typeof a.action === "string" ? a.action : a.action ? await a.action({
                char: character,
            }) : null,
            narrativeAction: typeof a.narrativeAction === "string" ? a.narrativeAction : a.narrativeAction ? await a.narrativeAction({
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
        console.log(`Dead end scenario detected for character ${ourCharacterName} with action: ${deadEndAction.text}`);
        if (deadEndAction.action.action.deadEndIsDeath) {
            hasDied = true;
        }
        // limiting to that one only
        actions = [deadEndAction];
    }

    let actionsAsText = actions.map((action) => action.text).filter((a) => !!a).join("\n - ");
    if (actionsAsText) {
        if (deadEndAction && deadEndAction.action.action.deadEndIsDeath) {
            actionsAsText = "# IMPORTANT: The following action will be executed by " + ourCharacterName + " and will result in death:\n\n - " + actionsAsText;
        } else {
            actionsAsText = "# IMPORTANT: The following actions must be executed by " + ourCharacterName + ":\n\n - " + actionsAsText;
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

    for (const state of characterSystemPrompt.internalDescription.activeStates) {

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

            if (action.action.action.voice && (voiceDominance < stateDominance || !baseVoice)) {
                baseVoice = action.action.action.voice;
                voiceDominance = stateDominance;
            } else if (action.action.action.voice && voiceDominance === stateDominance && baseVoice) {
                mergeVoicesFrom(baseVoice, action.action.action.voice);
            }

            if (action.action.action.narrativeEffect && narrativeEffectsDominance < stateDominance) {
                narrativeEffects.push(typeof action.action.action.narrativeEffect === "string" ? action.action.action.narrativeEffect : await action.action.action.narrativeEffect({
                    char: character,
                    causes: action.action.applyingState?.causes || null,
                }));
                narrativeEffectsDominance = stateDominance;
            } else if (action.action.action.narrativeEffect && narrativeEffectsDominance === stateDominance) {
                narrativeEffects.push(typeof action.action.action.narrativeEffect === "string" ? action.action.action.narrativeEffect : await action.action.action.narrativeEffect({
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
            `You are an assistant that analyzes the emotional state of a character ${ourCharacterName} based on their current situation, active states, and the actions they are about to take.\n` +
            "You must decide which emotions from the list of potential emotions is the character about to primarily feel",
            [
                "You must answer with a list of emotions that is comma separated, and the first emotion in the list will be the primary emotion that the character is feeling. The rest of the emotions in the list are also part of the emotional range of the character, but are not as strongly felt as the primary emotion.",
            ],
            ([
                "## " + ourCharacterName + "'s Description:\n\n" +
                characterSystemPrompt.externalDescription,
                characterSystemPrompt.internalDescription.general,
            ]).join("\n\n"),
        );

        const lastCycleExtended = await getHistoryFragmentForCharacter(engine, character, {
            includeDebugMessages: false,
            includeRejectedMessages: false,
            msgLimit: "ALL_MESSAGES_SINCE_CHAR_2ND_LAST_MESSAGE_INCLUDING_CHAR_2ND_LAST_MESSAGE",
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
            messages: convertMessagesToSimpleList(lastCycleExtended.messages),
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

        const nextQuestion = `Based on the character's situation, active states, and upcoming actions, which emotions from the list of possible emotions is ${ourCharacterName} primarily feeling? Please provide a comma separated list with the primary emotion first.`;

        const emotionResponse = await generator.next({
            maxCharacters: 100,
            maxParagraphs: 1,
            maxSafetyCharacters: 100,
            maxCharactersCutOnDot: true,
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
        narrativeEffects.push(`'${character}' is primarily feeling ${primaryEmotion}`);
    }

    if (emotionalRange.length > 0) {
        narrativeEffects.push(`'${character}' response emotions should also include ${emotionalRange.join(", ")}`);
    }

    if (options.doNotMove) {
        narrativeEffects.push(`${character} must not walk away or go to another location`);
    }

    if (baseVoice?.mute && !baseVoice?.description) {
        narrativeEffects.push(`'${character}' is currently mute`);
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

    let narrationStyle = engine.deObject.narrationStyle;
    if (baseVoice?.narrationStyle) {
        narrationStyle = baseVoice.narrationStyle;
    }

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
                    const preNarrationText = typeof preNarrationOrigin === "string" ? preNarrationOrigin : await preNarrationOrigin({
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
                    const postNarrationText = typeof postNarrationOrigin === "string" ? postNarrationOrigin : await postNarrationOrigin({
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
            if (!generatedElements.includes("dialogue") && !baseVoice?.mute) {
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
        // always switch from dialogue to narration, and always start in narration
        if ((lastGenerated && lastGenerated === "dialogue") || generatedElements.length === 0) {
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

        const isMute = baseVoice?.mute || false;
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
        content: [],
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
        perspectiveSummaryIds: {},
        characterId: character.id,
        metadata: {},
        untimed: true,
        rumors: [],

        // TODO
        singleSummary: null,
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

        await engine.dataManager.newConversationMessage(charState.conversationId, nextMessage);

        engine.triggerConversationMessageUpdate(engine.deObject, {
            conversationId: charState.conversationId,
            messageId: nextMessage.id,
            event: "new-message",
            obj: nextMessage,
        });

        
        await engine.informDEObjectUpdated();
    }

    let nextToGenerate = getNextToGenerate();
    let nextToGenerateIsSameAsPreviousButNarrativeAction = false;

    const reweightedVoice = reweightVoiceForEmotion(baseVoice, primaryEmotion, emotionalRange, activeStates);

    let fragmentCount = -1;
    while (nextToGenerate) {
        fragmentCount++;

        /**
         * @type {string|null}
         */
        let followingAction = null;
        if (nextToGenerateIsSameAsPreviousButNarrativeAction) {
            followingAction = (`${nextToGenerate.narrativeAction}`);
            console.log("Generating next narrative action: " + nextToGenerate.narrativeAction);
        } else if (nextToGenerate.action) {
            followingAction = (`${ourCharacterName} must take the following action next: ${nextToGenerate.action}`);
            console.log("Generating next " + nextToGenerate.type + (nextToGenerate.action ? ` with action: ${nextToGenerate.action}` : ""));
        }

        const nextIsNarration = nextToGenerateIsSameAsPreviousButNarrativeAction ? true : nextToGenerate.type === "narration"
        const forcedVoiceEffects = nextIsNarration ? {
            forcedMode: null,
            forcedSounds: [],
        } : selectForcedVoiceEffects(reweightedVoice);

        /**
         * @type {DEConversationMessageDialogue | DEConversationMessageNarration}
         */
        const currentBlock = nextIsNarration ? {
            type: "narration",
            fragments: [],
            __debug_id: nextMessage.id + "__" + fragmentCount,
        } : {
            type: "dialogue",
            fragments: [],
            __debug_id: nextMessage.id + "__" + fragmentCount,
        };
        nextMessage.content.push(currentBlock);

        engine.triggerConversationMessageUpdate(engine.deObject, {
            conversationId: charState.conversationId,
            messageId: nextMessage.id,
            event: nextIsNarration ? "add-narration-block" : "add-dialogue-block",
            contentIndex: nextMessage.content.length - 1,
            __debug_id: nextMessage.id + "__" + fragmentCount,
        });

        const grammar = generateGrammarForVoice(engine, baseVoice, ourCharacterName, forcedVoiceEffects.forcedMode);

        const generator = engine.inferenceAdapter.inferNextStoryFragmentFor(
            character,
            {
                messages: convertMessagesToSimpleList(messages),
                messagesTrail: finalMessages,
                system: characterSystemPrompt.sysprompt,
                stateInjections: characterSystemPrompt.internalDescription.stateInjections,
                visibleEnviroment: characterCanSee.everything,
                narrativeEffects,
                grammar: nextIsNarration ? grammar.narrative : grammar.dialogue,
                activeStates,
                narration: nextIsNarration,
                modes: baseVoice?.modes.map((mode) => mode.label) || [],
                sounds: baseVoice?.sounds.map((sound) => sound.label) || [],
                forcedMode: forcedVoiceEffects.forcedMode,
                forcedSounds: forcedVoiceEffects.forcedSounds,
                emotionalRange: emotionalRange,
                followingAction,

                __debug_id: nextMessage.id + "__" + fragmentCount,

                // @ts-ignore primary emotion is guaranteed to be set at this point, because if it wasn't, we would have set it to "neutral"
                primaryEmotion,
            },
        );

        // dialogue specific
        // A dialogue line is spoken words by default; an asterisk toggles into a
        // third-person narration/action beat (and the next asterisk toggles back out), and
        // [..] are voice/sound tags. Asterisks are reserved exclusively for narration
        // transitions, so they are treated as structural delimiters here, not decoration.
        let insideNarration = false;
        let insideSound = false;
        let ignoreFirstNCharactersDialogueOnly = (character + ": ").length;

        const currentBlockAsDialogue = /** @type {DEConversationMessageDialogue} */ (currentBlock);

        /**
         * The dialogue fragment currently being streamed into, or null when none is open.
         * This persists across streamed chunks so that markers ("*", "[", "]") split across
         * chunk boundaries are handled consistently for both the message data and the UI events.
         * @type {DEConversationMessageDialogueFragment | null}
         */
        let openDialogueFragment = null;

        /**
         * @returns {"narration" | "dialogue" | "sound"}
         */
        const currentDialogueType = () => insideSound ? "sound" : (insideNarration ? "narration" : "dialogue");

        /**
         * Closes the currently open fragment (if any), computing sound info for sound fragments
         * and emitting the appropriate end event exactly once.
         */
        const finalizeOpenDialogueFragment = () => {
            if (!openDialogueFragment) {
                return;
            }
            const fragment = openDialogueFragment;
            openDialogueFragment = null;
            const trimmed = fragment.text.trim().toLowerCase();
            const soundInfo = fragment.type === "sound" ? {
                sound: minimizeSoundDescription(baseVoice?.sounds.find((sound) => sound.label.toLowerCase() === trimmed)),
                mode: minimizeModeDescription(baseVoice?.modes.find((mode) => mode.label.toLowerCase() === trimmed)),
            } : undefined;
            if (fragment.type === "sound" && soundInfo) {
                fragment.soundInfo = soundInfo;
            }
            engine.triggerConversationMessageUpdate(engine.getDEObject(), {
                conversationId: conversationId,
                messageId: nextMessage.id,
                text: fragment.text,
                event: fragment.type === "narration" ? "end-add-narration" : (fragment.type === "sound" ? "end-add-sound" : "end-add-dialogue"),
                contentIndex: nextMessage.content.length - 1,
                soundInfo: soundInfo,
            });
        };

        /**
         * Ensures there is an open fragment of the given type, finalizing any previously open
         * fragment of a different type first.
         * @param {"narration" | "dialogue" | "sound"} type
         * @returns {DEConversationMessageDialogueFragment}
         */
        const ensureOpenDialogueFragment = (type) => {
            if (openDialogueFragment && openDialogueFragment.type === type) {
                return openDialogueFragment;
            }
            finalizeOpenDialogueFragment();
            /** @type {DEConversationMessageDialogueFragment} */
            const fragment = type === "sound"
                ? { type: "sound", text: "", soundInfo: {} }
                : { type: type, text: "" };
            currentBlockAsDialogue.fragments.push(fragment);
            openDialogueFragment = fragment;
            return fragment;
        };

        /**
         * Streams a run of text into the fragment of the given type, creating it if needed.
         * @param {"narration" | "dialogue" | "sound"} type
         * @param {string} text
         */
        const appendDialogueRun = (type, text) => {
            if (!text) {
                return;
            }
            // Pure-whitespace narration runs are just empty beats (e.g. a stray `* *` or
            // `**`); dropping them avoids spurious empty narration fragments. Whitespace in
            // spoken or sound runs is always preserved.
            if (type === "narration" && !text.trim()) {
                return;
            }
            const fragment = ensureOpenDialogueFragment(type);
            fragment.text += text;
            engine.triggerConversationMessageUpdate(engine.getDEObject(), {
                conversationId: conversationId,
                messageId: nextMessage.id,
                text: text,
                event: type === "narration" ? "add-narration" : (type === "sound" ? "add-sound" : "add-dialogue"),
                contentIndex: nextMessage.content.length - 1,
            });
        };

        let next = await generator.next(true);
        while (!next.done || next.value) {
            const info = next.value;
            if (info) {
                if (info.type === "warning") {
                    engine.informCycleState("warning", info.content);
                } else if (info.type === "hidden") {

                } else if (info.type === "text" && nextIsNarration) {
                    // replace all asterisks with nothing
                    let textToStream = info.content.replace(/\*/g, "");

                    if (textToStream) {
                        engine.triggerConversationMessageUpdate(engine.deObject, {
                            conversationId: charState.conversationId,
                            messageId: nextMessage.id,
                            text: textToStream,
                            event: "add-narration",
                            contentIndex: nextMessage.content.length - 1,
                        });
                    }

                    const currentBlockAsNarration = /** @type {DEConversationMessageNarration} */ (currentBlock);
                    currentBlockAsNarration.text += textToStream;
                } else if (info.type === "text" && !nextIsNarration) {
                    let actualInfoContent = info.content;

                    if (ignoreFirstNCharactersDialogueOnly) {
                        actualInfoContent = actualInfoContent.substring(ignoreFirstNCharactersDialogueOnly);
                        ignoreFirstNCharactersDialogueOnly -= info.content.length;
                        if (ignoreFirstNCharactersDialogueOnly < 0) {
                            ignoreFirstNCharactersDialogueOnly = 0;
                        }
                    }

                    // Asterisks are the narration delimiter, so they are kept for parsing
                    // (not stripped); [..] delimit voice/sound tags. Both are consumed as
                    // markers and never emitted as fragment text.
                    const textToStream = actualInfoContent;

                    // Persistent character-by-character state machine. An asterisk toggles
                    // between spoken dialogue (default) and third-person narration beats;
                    // "[" opens a sound/voice tag and "]" closes it (only while speaking).
                    let run = "";
                    for (let i = 0; i < textToStream.length; i++) {
                        const char = textToStream[i];
                        if (insideSound) {
                            if (char === "]") {
                                appendDialogueRun("sound", run);
                                run = "";
                                insideSound = false;
                                finalizeOpenDialogueFragment();
                            } else {
                                run += char;
                            }
                        } else if (char === "*") {
                            appendDialogueRun(currentDialogueType(), run);
                            run = "";
                            finalizeOpenDialogueFragment();
                            insideNarration = !insideNarration;
                        } else if (char === "[" && !insideNarration) {
                            appendDialogueRun(currentDialogueType(), run);
                            run = "";
                            insideSound = true;
                            // open the sound fragment eagerly so an empty sound still renders
                            ensureOpenDialogueFragment("sound");
                        } else {
                            run += char;
                        }
                    }
                    appendDialogueRun(currentDialogueType(), run);
                }
            }

            if (!next.done) {
                next = await generator.next(true);
            }
        }

        console.log("\nFinished receiving text chunk from inference adapter.");

        if (nextIsNarration) {
            const currentBlockAsNarration = /** @type {DEConversationMessageNarration} */ (currentBlock);
            engine.triggerConversationMessageUpdate(engine.deObject, {
                conversationId: charState.conversationId,
                messageId: nextMessage.id,
                text: currentBlockAsNarration.text,
                event: "end-add-narration",
                contentIndex: nextMessage.content.length - 1,
            });
            engine.triggerConversationMessageUpdate(engine.deObject, {
                conversationId: charState.conversationId,
                messageId: nextMessage.id,
                obj: currentBlockAsNarration,
                event: "end-narration-block",
                contentIndex: nextMessage.content.length - 1,
            });
        } else {
            const currentBlockAsDialoge = /** @type {DEConversationMessageDialogue} */ (currentBlock);
            finalizeOpenDialogueFragment();
            engine.triggerConversationMessageUpdate(engine.deObject, {
                conversationId: charState.conversationId,
                messageId: nextMessage.id,
                obj: currentBlockAsDialoge,
                event: "end-dialogue-block",
                contentIndex: nextMessage.content.length - 1,
            });
        }

        const converted = convertContentToSimpleList(engine, [currentBlock], nextMessage.characterId, false);
        converted.forEach((ele) => {
            finalMessages.push(ele.message);
        });

        if (nextToGenerate.narrativeAction) {
            nextToGenerateIsSameAsPreviousButNarrativeAction = true;
        } else {
            nextToGenerate = getNextToGenerate();
            nextToGenerateIsSameAsPreviousButNarrativeAction = false;
        }
    }

    engine.triggerConversationMessageUpdate(engine.deObject, {
        conversationId: charState.conversationId,
        messageId: nextMessage.id,
        event: "done",
    });

    const totalGeneratedThusFar = finalMessages.join("\n\n");
    console.log("Final generated narration/dialogue: " + totalGeneratedThusFar);

    if (deadEndAction) {
        console.log(`Finalizing dead end action for character ${character}: ${deadEndAction.text}`);
        if (deadEndAction.action.action.deadEndIsDeath) {
            console.log(`Character ${character} has died.`);
            addedMessagesForStoryMaster.push(`${character} has died.`);
            charState.dead = true;
        }
        charState.deadEnded = true;
        charState.deadEndReason = deadEndAction.text;

        if (charState.dead) {
            // TODO change the description of the character to reflect they are dead
            // await updateCharacterDescription(engine, character, "dead", "The lifeless body of " + character);
            // keep in mind "CHARACTER_OVERRIDES_" + characterDef
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
                    if (item.containingCharacters.includes(character)) {
                        item.containingCharacters = item.containingCharacters.filter((char) => char !== character);
                    }
                    if (item.ontopCharacters.includes(character)) {
                        item.ontopCharacters = item.ontopCharacters.filter((char) => char !== character);
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
            const existingBond = charBonds.active.find((bond) => bond.towards === character.id);
            if (existingBond) {
                charBonds.active = charBonds.active.filter((bond) => bond.towards !== character.id);
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
