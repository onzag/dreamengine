import { debug } from "../debug.js";
import { DEngine } from "../index.js";
import { getBasicPostures, getExtendedPosturesOf, getExternalDescriptionOfCharacterPostureOnlyChanged, whatCanTheyMakeOfAnotherCharacter } from "../util/character-info.js";
import { createGrammarFromList, yesNoGrammar } from "../util/grammar.js";
import { convertMessagesToSimpleList, getHistoryFragment } from "../util/messages.js";

/**
 * @param {DEngine} engine
 * @param {DECompleteCharacterReference} character
 */
export default async function calculatePostureChange(engine, character) {
    if (!engine.deObject) {
        throw new Error("DEngine object not initialized");
    } else if (!engine.inferenceAdapter) {
        throw new Error("Inference adapter not initialized");
    }

    if (!debug.ENABLED_POSTURE_CHANGE) {
        return [];
    }

    const basicPostures = getBasicPostures();

    const characterState = engine.deObject.stateFor[character.id];
    const currentPosture = characterState.posture;

    const yesNoGrammarObject = yesNoGrammar(engine);

    const systemPrompt = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(
        "You are an assistant that checks for changes in posture of a character named " + character.name + " in a story who is identified with the character id " + JSON.stringify(character.id) + ", you will be asked questions about which basic posture the character has changed to",
        [
            "Answer 'yes' only if the character's posture has been specified to change in the story to analyze, otherwise answer 'no'",
            "The character might have been referred as its id " + JSON.stringify(character.id) + " in the story to analyze, as the id part of an <id:name> identifier, if the id is the same, the character is the same, make sure to check for that as well.",
            "Before the story to analyze the character's posture was " + JSON.stringify(currentPosture),
            "The list of potential postures are " + basicPostures.map(p => JSON.stringify(p)).join(", ") + ".",
        ],
        null,
    );

    const lastCycle = await getHistoryFragment(engine, character, {
        msgLimit: "ALL_UNPROCESSED_MESSAGES_UNTIL_FIRST_PROCESSED_MESSAGE",
        perspective: "character",
    });

    const agent = engine.inferenceAdapter.runQuestioningCustomAgentOn(
        "posture-change",
        {
            system: systemPrompt,
            contextInfoBefore: null,
            messages: convertMessagesToSimpleList(lastCycle.messages),
            contextInfoAfter: null,
        },
    );

    // prime the agent
    const ready = await agent.next();
    if (ready.done) {
        throw new Error("Agent finished unexpectedly while priming");
    }

    let foundAPostureChange = false;

    const answer = await agent.next({
        maxCharacters: 10,
        maxParagraphs: 1,
        maxSafetyCharacters: 10,
        nextQuestion: "Has " + engine.deObject.utils.templates.formatCharacterName(character) + " posture changed from " + JSON.stringify(currentPosture) + " in the story to analyze? Answer 'yes' or 'no'",
        stopAfter: yesNoGrammarObject.stopAfter,
        grammar: yesNoGrammarObject.grammar,
        stopAt: [],
        instructions: "Make sure to answer 'yes' if it is highly likely that the character posture changed even if it is not explicitly stated in the story fragment, otherwise answer 'no'.",
    });

    if (answer.done) {
        throw new Error("Agent finished unexpectedly while asking about posture change");
    }

    if (answer.value.text.trim().toLowerCase() === "yes") {
        foundAPostureChange = true;
    }

    if (foundAPostureChange) {
        const basicPosturesGrammar = createGrammarFromList(basicPostures);
        const answer = await agent.next({
            maxCharacters: 100,
            maxParagraphs: 1,
            maxSafetyCharacters: 100,
            nextQuestion: "What is the new posture of the character? Answer with the most likely posture from the list of potential postures.",
            stopAfter: basicPosturesGrammar.stopAfter,
            grammar: basicPosturesGrammar.grammar,
            stopAt: [],
            instructions: "Make sure to answer with one of the following postures: " + basicPostures.map(p => JSON.stringify(p)).join(", "),
        });

        if (answer.done) {
            throw new Error("Agent finished unexpectedly while asking about new posture");
        }

        /** @type {DEPosture} */
        let newPosture = /** @type {DEPosture} */ (answer.value.text.trim().toLowerCase());
        if (!basicPostures.includes((newPosture))) {
            throw new Error("Agent returned an invalid posture: " + JSON.stringify(newPosture));
        }

        if (newPosture === currentPosture) {
            // If the agent says the posture is the same, we can assume it didn't change
            foundAPostureChange = false;
        }

        if (foundAPostureChange) {
            // let's see if it has a specific
            const extendedPostures = getExtendedPosturesOf(newPosture);
            if (extendedPostures.length > 0) {
                const extendedPosturesGrammar = createGrammarFromList(extendedPostures);
                // @ts-ignore
                extendedPostures.push(newPosture + "+unspecified");
                // @ts-ignore
                extendedPostures.push(newPosture + "+unknown");
                // @ts-ignore
                extendedPostures.push(newPosture + "+unclear");
                // @ts-ignore
                extendedPostures.push(newPosture + "+default");

                const answer = await agent.next({
                    maxCharacters: 100,
                    maxParagraphs: 1,
                    maxSafetyCharacters: 100,
                    nextQuestion: "Choose from a further specification of the posture " + JSON.stringify(newPosture) + " from the list of potential postures. Answer with the most likely posture from the list of potential postures " + extendedPostures.map(p => JSON.stringify(p)).join(", ") + ".",
                    stopAfter: extendedPosturesGrammar.stopAfter,
                    grammar: extendedPosturesGrammar.grammar,
                    stopAt: [],
                    instructions: "Make sure to answer with one of the following postures: " + extendedPostures.map(p => JSON.stringify(p)).join(", "),
                });

                if (answer.done) {
                    throw new Error("Agent finished unexpectedly while asking about specific new posture");
                }

                /** @type {DEPosture} */
                const specificNewPosture = /** @type {DEPosture} */ (answer.value.text.trim().toLowerCase());

                if (!extendedPostures.includes((specificNewPosture))) {
                    throw new Error("Agent returned an invalid specific posture: " + JSON.stringify(specificNewPosture));
                } else {
                    // update the newPosture to the specific one only if non-unspecified
                    if (!specificNewPosture.endsWith("+unspecified") && !specificNewPosture.endsWith("+unknown") && !specificNewPosture.endsWith("+unclear") && !specificNewPosture.endsWith("+default")) {
                        newPosture = specificNewPosture;
                    }

                    if (newPosture === currentPosture) {
                        // If the agent says the posture is the same, we can assume it didn't change
                        foundAPostureChange = false;
                    }
                }
            }
        }
    }

    if (foundAPostureChange) {
        const narration = getExternalDescriptionOfCharacterPostureOnlyChanged(engine.deObject, character.id, character.id);
        const narrationParsed = await engine.deObject.utils.narrationAndDialogue.parseNarration(narration, null);

        const characterState = engine.deObject.stateFor[character.id];
        const characterConversationId = characterState.conversationId;

        let everyoneCanSee = true;
        /**
         * @type {string[]}
         */
        const onlyTheseCharactersCanSee = [];
        if (characterConversationId) {
            const conversation = await engine.deObject.utils.conversations.getConversation(characterConversationId);

            if (conversation) {
                for (const participant of conversation.participants) {
                    const whatCanTheyMakeOfTheOtherCharacter = whatCanTheyMakeOfAnotherCharacter(engine.deObject, character, engine.deObject.characters[participant]);
                    const blindness = engine.deObject.characters[participant].blindness;
                    const canSeePosture = blindness === "partial-good" || blindness === "no" || blindness === "partial-bad" && (whatCanTheyMakeOfTheOtherCharacter.hasHighPerception);
                    if (canSeePosture) {
                        onlyTheseCharactersCanSee.push(participant);
                    } else {
                        everyoneCanSee = false;
                    }
                }

                await engine.deObject.utils.conversations.addMessageIntoCharactersConversation(character, {
                    canOnlyBeSeenByCharacters: everyoneCanSee ? null : onlyTheseCharactersCanSee,
                    content: [
                        {
                            type: "narration",
                            fragments: narrationParsed,
                        },
                    ],
                    characterId: null,
                    isCharacter: false,
                    isDebugMessage: false,
                    isRejectedMessage: false,
                    isStoryMasterMessage: true,
                    singleSummary: null,
                    emotion: null,
                    emotionalRange: null,
                    interactingCharacters: [],
                    rumors: [],
                    metadata: {},
                    summariesByCharacterId: {},
                });
            }
        }
    };
}