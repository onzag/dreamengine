import { deepCopy, deepCopyNoHistory, DEngine } from "../../index.js";

/**
 * @param {DEngine} engine 
 * @param {DECompleteCharacterReference} character 
 */
export default async function testMessageFeasibilityForce(engine, character) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    } else if (engine.invalidCharacterStates) {
        throw new Error("DEngine has invalid character states, cannot determine message feasibility");
    } else if (!engine.inferenceAdapter) {
        throw new Error("Inference adapter not set, cannot perform inference");
    } else if (!engine.userCharacter) {
        throw new Error("User character not set, cannot perform feasibility check for user");
    }

    const charState = engine.deObject.stateFor[character.name];
    if (!charState) {
        throw new Error(`Character state for ${character.name} not found.`);
    }

    // note that the world rules should have catch if the character has tried to lift a heavy object or character
    // but that is not about it, this is more reasoning and subtle, therefore we need to use the LLM to figure this out
    // for this we first need to figure out all the characters that have been "succesfully forced" to do something
    // an attempt does not count, only success

    // the world rules must have already check that the user did not think for the other character, so messages like
    // "the dragon accepted to follow char" would already been rejected, so here we are only dealing with
    // "the dragon was forced to follow char" or "char forced the dragon to follow them"

    // the action must be successful, threats or attempts with unknown outcome do not count

    /**
     * @type {Array<{name: string, description: string}>}
     */
    const characters = [];
    for (const characterName of charState.surroundingTotalStrangers) {
        if (characterName === character.name) {
            continue;
        }
        const characterInfo = engine.deObject.characters[characterName];
        const characterState = engine.deObject.stateFor[characterName];
        if (characterInfo) {
            characters.push({ name: characterName, description: engine.getExternalDescriptionOfCharacter(characterName, true) });
        }
    }
    for (const characterName of charState.surroundingNonStrangers) {
        if (characterName === character.name) {
            continue;
        }
        const characterInfo = engine.deObject.characters[characterName];
        const characterState = engine.deObject.stateFor[characterName];
        if (characterInfo) {
            characters.push({ name: characterName, description: engine.getExternalDescriptionOfCharacter(characterName, true) });
        }
    }

    const contextInfoSurroundingCharacters = engine.inferenceAdapter.buildContextInfoForAvailableCharacters([
        {
            characters,
            groupDescription: "",
        }
    ]);

    // 1. Gather all the characters that have been succesfully forced by the user in the last message
    const systemMessage = `You are an assistant and story analyst that determines if the last message from ${character.name} contains any characters that have been successfully forced to do something by ${character.name}.`
    const systemPrompt = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(systemMessage, [
        "By successfully forced we mean that it is explicitly stated that the character complied with the forceful action or command given by " + character.name + ".",
        "If the character resisted or the outcome is unknown, it does not count as successfully forced.",
        "An attempt to force does not count, only successful compliance.",
        "Consider only the last message from " + character.name + ".",
    ], null);
    const generator = engine.inferenceAdapter.runQuestioningCustomAgentOn(character, systemPrompt, contextInfoSurroundingCharacters.value, engine.getHistoryForCharacter(character, {}), "LAST_CYCLE_EXPANDED", null);
    const ready = await generator.next();
    if (ready.value !== "ready") {
        throw new Error("Questioning agent could not be started properly.");
    }
    const nextQuestion = "Considering the list at " + contextInfoSurroundingCharacters.availableCharactersAt + ". Which characters, if any, have been successfully forced to do something by " + character.name + " in the last message by such character? Provide a comma separated list of names only, or say 'none' if no characters were successfully forced.";
    console.log("Asking question, " + nextQuestion);
    const answerToQuestion = await generator.next({
        maxParagraphs: 1,
        maxCharacters: 0,
        maxSafetyCharacters: 250,
        nextQuestion: nextQuestion,
        stopAt: ["\n", "."],
        stopAfter: [],
        grammar: `root ::= nameList (${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()})\nnameList ::= name (\",\" name)*\nname ::= ${characters.map(c => JSON.stringify(c.name)).join(" | ")} | "none"`,
        answerTrail: "The characters that have been successfully forced to do something by " + character.name + " are: ",
    });

    if (answerToQuestion.done) {
        throw new Error("Questioning agent ended unexpectedly when asking about who was forced.");
    }

    console.log("Received answer, ", answerToQuestion.value);

    /**
     * @type {string[]}
     */
    const forcedCharacters = [];
    answerToQuestion.value.split(",").map(name => name.trim()).forEach(name => {
        const loweredName = name.toLowerCase();
        if (loweredName === "none" || loweredName === "noone" || loweredName === "nobody" || !loweredName) {
            return;
        }
        const matchedCharacter = characters.find(c => c.name.toLowerCase() === loweredName);
        if (matchedCharacter) {
            forcedCharacters.push(matchedCharacter.name);
        }
    });

    if (!forcedCharacters.length) {
        console.log("Feasibility check: no characters were forced by user, message is feasible thus far");
        await generator.next(null); // finish the generator
    } else {
        console.log("Feasibility check: characters forced by user:", forcedCharacters);

        /**
         * @type {{[characterName: string]: string}}
         */
        const forcedToDoWhat = {};

        for (const forcedCharacterName of forcedCharacters) {
            const forcedCharacter = engine.deObject.characters[forcedCharacterName];

            if (!forcedCharacter) {
                console.log(`Feasibility check: forced character ${forcedCharacterName} info not found, skipping feasibility check for them`);
                continue;
            }

            const nextQuestion = "In the last message from " + character.name + ", what specific action or actions has " + forcedCharacterName + " been successfully forced to do by " + character.name + "? Provide a brief description of the action or actions, if no action was forced, say 'they have not been forced to do anything'.";
            console.log("Asking question, " + nextQuestion);

            const answerAboutWhat = await generator.next({
                maxParagraphs: 1,
                maxCharacters: 0,
                maxSafetyCharacters: 250,
                nextQuestion: nextQuestion,
                stopAt: ["\n", "."],
                stopAfter: [],
                answerTrail: forcedCharacterName + " ",
                grammar: `root ::= ("has not been forced to do anything" | "has been forced to " .*) ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}`,
            });

            if (answerAboutWhat.done) {
                throw new Error("Questioning agent ended unexpectedly when asking about what was forced.");
            }

            console.log("Received answer, ", answerAboutWhat.value);

            if (answerAboutWhat.value.trim().toLowerCase().startsWith("has been forced to")) {
                forcedToDoWhat[forcedCharacterName] = answerAboutWhat.value.trim();
            }
        }

        await generator.next(null); // finish the generator

        const [internalDescription, stateInfo,] = await engine.getInternalDescriptionOfCharacter(character.name);

        // 2. For each forced character, check if the action is feasible
        for (const forcedCharacterName of forcedCharacters) {
            const forcedCharacter = engine.deObject.characters[forcedCharacterName];

            if (!forcedCharacter) {
                console.log(`Feasibility check: forced character ${forcedCharacterName} info not found, skipping feasibility check for them`);
                continue;
            }

            const forcedAction = forcedToDoWhat[forcedCharacterName];

            if (!forcedAction) {
                console.log(`Feasibility check: after double check no specific forced action found for ${forcedCharacterName}, skipping feasibility check for them`);
                continue;
            }

            console.log(`Feasibility check: checking if it is feasible for ${forcedCharacterName} to be forced to do the action: ${forcedAction}`);

            let ownCharacterDescription = "";
            try {
                const [, , , relationshipOfOwnCharacterTowardsForcedCharacter] = await engine.getRelationshipBetweenCharacters(character.name, forcedCharacterName);
                ownCharacterDescription = engine.inferenceAdapter.buildSystemCharacterDescription(
                    character,
                    internalDescription,
                    engine.getExternalDescriptionOfCharacter(character.name, true),
                    [
                        relationshipOfOwnCharacterTowardsForcedCharacter,
                    ],
                    stateInfo,
                    null,
                    null,
                );
            } catch (e) {
                ownCharacterDescription = engine.inferenceAdapter.buildSystemCharacterDescription(
                    character,
                    internalDescription,
                    engine.getExternalDescriptionOfCharacter(character.name, true),
                    [],
                    stateInfo,
                    null,
                    null,
                );
            }

            let forcedCharacterDescription = "";

            try {
                const [, , , relationshipOfForcedCharacterTowardsOwnCharacter] = await engine.getRelationshipBetweenCharacters(forcedCharacterName, character.name);
                const [internalDescriptionForcedCharacter, stateInfoForcedCharacter,] = await engine.getInternalDescriptionOfCharacter(forcedCharacterName);
                forcedCharacterDescription = engine.inferenceAdapter.buildSystemCharacterDescription(
                    forcedCharacter,
                    internalDescriptionForcedCharacter,
                    engine.getExternalDescriptionOfCharacter(forcedCharacterName, true),
                    [
                        relationshipOfForcedCharacterTowardsOwnCharacter,
                    ],
                    stateInfoForcedCharacter,
                    null,
                    null,
                );
            } catch (e) {
                const [internalDescriptionForcedCharacter, stateInfoForcedCharacter,] = await engine.getInternalDescriptionOfCharacter(forcedCharacterName);
                forcedCharacterDescription = engine.inferenceAdapter.buildSystemCharacterDescription(
                    forcedCharacter,
                    internalDescriptionForcedCharacter,
                    engine.getExternalDescriptionOfCharacter(forcedCharacterName, true),
                    [],
                    stateInfoForcedCharacter,
                    null,
                    null,
                );
            }

            const isolatedCharacterInfo = engine.inferenceAdapter.buildContextInfoIsolatedCharacter(character, ownCharacterDescription) + "\n\n" + engine.inferenceAdapter.buildContextInfoIsolatedCharacter(forcedCharacter, forcedCharacterDescription);

            // we will build a custom system prompt for each character because even when we can add things in the user space
            // we really want to make sure the LLM focuses on the forced character's capabilities
            const feasibilitySystemMessage = `You are an assistant and story analyst that determines if it is feasible for ${forcedCharacterName} to be forced to do the action described in the last message from ${character.name} in an interactive story.`;
            const feasibilitySystemPrompt = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(feasibilitySystemMessage, [
                "Consider the physical, mental, and situational capabilities of " + forcedCharacterName + " based on their character description and current state.",
                "Consider the general description of both " + character.name + " and " + forcedCharacterName + " to understand their relationship and typical behaviour.",
                "If it is unreasonable for " + forcedCharacterName + " to comply to the forced action due to their behaviour and it's not aligned with their character, answer 'no'.",
                "If the action described in the last message from " + character.name + " is beyond the capabilities of " + forcedCharacterName + ", answer 'no'.",
                "If " + forcedCharacterName + " is being physically forced but " + forcedCharacterName + " is much larger/stronger so it cannot be physically coerced, answer 'no'.",
                "Only if the action is within the capabilities of " + forcedCharacterName + " and is reasonable for them to comply, answer 'yes'.",
                "If the answer is no, elaborate briefly on why it is not feasible.",
            ], null);

            const feasibilityGenerator = engine.inferenceAdapter.runQuestioningCustomAgentOn(character, feasibilitySystemPrompt, isolatedCharacterInfo, engine.getHistoryForCharacter(character, {}), "LAST_CYCLE_EXPANDED", null);
            const feasibilityReady = await feasibilityGenerator.next();
            if (feasibilityReady.value !== "ready") {
                throw new Error("Questioning agent could not be started properly for feasibility check.");
            }
            const nextQuestion = "Considering the character descriptions and current states of both characters, is it feasible for " + forcedCharacterName + " to be successfully been forced to " + forcedAction + " by " + character.name + " in the last message from such character? Answer 'yes' if it is feasible, 'no' and elaborate if it is not feasible.";

            console.log("Asking question, " + nextQuestion);

            const feasibilityAnswer = await feasibilityGenerator.next({
                maxParagraphs: 1,
                maxCharacters: 0,
                maxSafetyCharacters: 250,
                nextQuestion: nextQuestion,
                stopAt: ["\n", "."],
                stopAfter: [],
                grammar: `root ::= (yesanswer | noanswer)\nyesanswer ::= "yes" ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\nnoanswer ::= "no" "," " " "because" .* ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}`,
            });

            if (feasibilityAnswer.done) {
                throw new Error("Questioning agent ended unexpectedly when asking about feasibility.");
            }

            console.log("Received answer, ", feasibilityAnswer.value);

            const feasible = feasibilityAnswer.value.trim().toLowerCase().indexOf("yes") === 0;

            if (!feasible) {
                console.log(`Feasibility check: it is NOT feasible for ${forcedCharacterName} to be forced to do the action: ${forcedAction}. Thus the message is deemed INFEASIBLE.`);
                const reason = feasibilityAnswer.value.trim().replace("no,", "").trim();
                return {
                    feasible: false,
                    reason: `It is deemed unfeasible for ${forcedCharacterName} to be forced to do the action: ${forcedAction}. ${reason}`,
                }
            } else {
                console.log(`Feasibility check: it IS feasible for ${forcedCharacterName} to be forced to do the action: ${forcedAction}.`);
            }
        }
    }
}