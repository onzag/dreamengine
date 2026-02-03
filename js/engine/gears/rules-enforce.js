import { DEngine } from "..";

/**
 * Removes any punctuation from a string.
 * @param {string} str
 * @returns {string}
 */
function removeAnyPunctuation(str) {
    return str.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").replace(/\s{2,}/g, " ").trim();
}

/**
 * Find a named entity in text.
 * @param {string} text 
 */
function extractNamedEntitiesFromText(text) {
    return removeAnyPunctuation((text.split("named ")[1] || "").split("\"")[1] || "").toLowerCase().trim();
}

/**
 * this one is more finnicky, it extracts multiple named entities from text
 * @param {string} text
 * @param {string} stopAfterFoundText 
 */
function extractManyNamedEntitiesFromText(text, stopAfterFoundText) {
    let accumulated = "";
    let insideQuotes = false;
    const foundEntities = [];
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === "\"") {
            insideQuotes = !insideQuotes;
            if (!insideQuotes) {
                foundEntities.push(accumulated);
            }
            accumulated = "";
        } else {
            accumulated += char;
            if (!insideQuotes && stopAfterFoundText && accumulated.endsWith(stopAfterFoundText)) {
                break;
            }
        }
    }
    return foundEntities;
}

/**
     * Test the world rules on a message, mainly intended for the user character
     * 
     * Massive world rule checking function which is meant to:
     * 1. Enforce general world rules of the world, eg. a world that has no magic the user cannot suddenly cast a spell
     * 2. Enforce character specific world rules, eg. if the user is said they can't fly, they cannot suddenly fly
     * 3. Ensure that the user is not breaking immersion.
     * 4. Keep the consistency of the world intact in order to avoid contradictions and maintain believability.
     * 
     * It is possible to disable testing the world rules but this can have a severe impact on the quality of the story and immersion.
     * This is because it is easy to break the world rules without realizing it, especially when the user is not paying attention to the details of the world.
     * 
     * The world rules also ensure that movement from one location to another is consistent with the world state
     * 
     * @param {DEngine} engine
     * @param {DECompleteCharacterReference} character
     * @return {Promise<{passed: boolean, reason: string | null}>}
     */
export default async function testWorldRulesOn(engine, character) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    if (engine.invalidCharacterStates) {
        throw new Error("DEngine has invalid character states, cannot validate world rules");
    }
    const characterState = engine.deObject.stateFor[character.name];
    if (!characterState) {
        throw new Error(`Character state for ${character.name} not found.`);
    }
    const characterObj = engine.deObject.characters[character.name];
    if (!characterObj) {
        throw new Error(`Character object for ${character.name} not found.`);
    }
    if (!engine.inferenceAdapter) {
        throw new Error("Inference adapter not initialized, cannot validate world rules");
    }
    const charState = engine.deObject.stateFor[character.name];

    if (engine.disabledWorldRules) {
        console.warn(`World rules testing is disabled, skipping world rules test for character ${character.name}.`);
        return { passed: true, reason: null };
    }

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

    // we are going to build an special custom agent just to analyze actions and reactions because
    // the normal question for the world rule was not being handled well by the LLMs
    const systeMessageSpecial = `You are an assistant and story analyst that checks for actions and reactions of characters in an interactive story`;
    const systemPromptSpecial = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(
        systeMessageSpecial,
        [
            "An action is defined as something a character does",
            "A reaction is defined as how a character responds to an action or event",
            "A reaction includes emotional response, physical response, or verbal response to an action or event",
            "The action must be clearly described in the messages and stated, do not assume anything that is not explicitly described",
            "If the character has described actions or reactions of other characters in the messages, answer Yes and elaborate briefly",
            "If the character has not described any actions or reactions of other characters in the messages, answer No",
        ],
        null,
    );

    const generatorSpecial = engine.inferenceAdapter.runQuestioningCustomAgentOn(character, systemPromptSpecial, null, engine.getHistoryForCharacter(character, {}), "LAST_CYCLE_EXPANDED", contextInfoSurroundingCharacters.value);
    const readySpecial = await generatorSpecial.next(); // start the generator
    if (readySpecial.done) {
        throw new Error("Inference adapter questioning generator ended unexpectedly.");
    }

    let lastQuestion = `Has ${character.name} described any actions or reactions of other characters in the messages? do not make assumptions, only consider what is explicitly described.`;
    let specialResult1 = await generatorSpecial.next({
        maxCharacters: 500,
        maxParagraphs: 5,
        nextQuestion: lastQuestion,
        contextInfo: engine.inferenceAdapter.buildContextInfoExample(
            `Example: If ${character.name} says "[Character] does [something]" or "[Character] acts" or "[Character] goes [somewhere]" where the character is not ${character.name}, answer Yes. If the story says "${character.name} does [something]" or "${character.name} acts" or "${character.name} goes [somewhere]", answer No.`,
        ) + engine.inferenceAdapter.buildContextInfoExample(
            `Example: If ${character.name} says "${character.name} forces [Character] to do [something]" or "${character.name} makes [Character] go [somewhere]"  or "[Character] is forced by ${character.name} to do [something]" or "[Character] does [action] against their will" or "${character.name} kidnaps [Character]", since [Character] is being forced, answer No.`,
        ),
        stopAfter: [],
        stopAt: ["\n", "."],
        grammar: `root::= yesanswer | noanswer\nnoanswer ::= "no" (${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()})\nyesanswer ::= "yes" "," " " "the" " " "specific" " " ("action" | "reaction") " " "performed" " " "by" " " "another" " " "character" " " "named" " " "\\"" .* "\\"" " " "is" .*`,
    });
    let doubleCheckLabel = "perform the specific action or reaction?";

    if (specialResult1.done) {
        throw new Error("Inference adapter questioning generator ended unexpectedly during special action/reaction check.");
    }

    let brokenSpecialRule = specialResult1.value.trim().toLowerCase().split(" ")[0] === "yes,";
    if (!brokenSpecialRule) {
        lastQuestion = `Has ${character.name} described an emotional response by other characters in the messages? do not make assumptions, only consider what is explicitly described.`;
        specialResult1 = await generatorSpecial.next({
            maxCharacters: 500,
            maxParagraphs: 5,
            nextQuestion: lastQuestion,
            contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                `Example: If ${character.name} says "[Character] feels [something]" or "[Character] expresses [something]" or "[Character] showcases [emotion]" where the character is not themselves, answer Yes. If the story says "${character.name} expresses [emotion] towards [Character]" or "${character.name} showcases [emotion] towards [Character]", answer No.`,
            ),
            stopAfter: [],
            stopAt: ["\n", "."],
            grammar: `root::= yesanswer | noanswer\nnoanswer ::= "no" (${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()})\nyesanswer ::= "yes" "," " " "the" " " "specific" " " "emotional" " " "response" " " "performed" " " "by" " " "another" " " "character" " " "named" " " "\\"" .* "\\"" " " "is" .*`,
        });

        if (specialResult1.done) {
            throw new Error("Inference adapter questioning generator ended unexpectedly during special action/reaction emotional check.");
        }

        doubleCheckLabel = "showcase that specific emotional state?";

        brokenSpecialRule = specialResult1.value.trim().toLowerCase().split(" ")[0] === "yes,";
    }

    if (!brokenSpecialRule) {
        lastQuestion = `Has ${character.name} described any verbal response of other characters in the messages? do not make assumptions, only consider what is explicitly described.`;
        specialResult1 = await generatorSpecial.next({
            maxCharacters: 500,
            maxParagraphs: 5,
            nextQuestion: lastQuestion,
            contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                `Example: If ${character.name} says "[Character] speaks up" or "[Character] says [something]" or "[Character] expresses [something]" or "[Character] greets [someone]" where the character is not themselves, answer Yes. If the story says "${character.name} greets [Character]" or "${character.name} talks to [Character]", answer No.`,
            ),
            stopAfter: [],
            stopAt: ["\n", "."],
            grammar: `root::= yesanswer | noanswer\nnoanswer ::= "no" (${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()})\nyesanswer ::= "yes" "," " " "the" " " "specific" " " "verbal" " " "response" " " "performed" " " "by" " " "another" " " "character" " " "named" " " "\\"" .* "\\"" " " "is" .*`,
        });

        if (specialResult1.done) {
            throw new Error("Inference adapter questioning generator ended unexpectedly during special action/reaction verbal check.");
        }

        doubleCheckLabel = "perform that specific verbal response?";
        brokenSpecialRule = specialResult1.value.trim().toLowerCase().split(" ")[0] === "yes,";
    }

    if (!brokenSpecialRule) {
        lastQuestion = `Has ${character.name} described any emotional process or thought process of other characters in the messages? do not make assumptions, only consider what is explicitly described.`;
        specialResult1 = await generatorSpecial.next({
            maxCharacters: 500,
            maxParagraphs: 5,
            nextQuestion: lastQuestion,
            stopAfter: [],
            contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                `Example: If ${character.name} says "[Character] thinks [something]" or "[Character] believes [something]" or "[Character] feels [emotion]" where the character is not themselves, answer Yes. If the story says "${character.name} thinks [something]" or "${character.name} believes [something]" or "${character.name} feels [emotion]", answer No.`,
            ),
            stopAt: ["\n", "."],
            grammar: `root::= yesanswer | noanswer\nnoanswer ::= "no" (${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()})\nyesanswer ::= "yes" "," " " "the" " " "specific" " " ("thought" | "emotional") " " "process" " " "performed" " " "by" " " "another" " " "character" " " "named" " " "\\"" .* "\\"" " " "is" .*`,
        });

        if (specialResult1.done) {
            throw new Error("Inference adapter questioning generator ended unexpectedly during special action/reaction emotional or thought process check.");
        }

        doubleCheckLabel = "described that " + (specialResult1.value.includes("emotional") ? "emotional process or one similar?" : "thought process or one similar?");
        brokenSpecialRule = specialResult1.value.trim().toLowerCase().split(" ")[0] === "yes,";
    }

    /**
     * @type {string | null}
     */
    let whoDidThisAction = null;

    if (brokenSpecialRule) {
        // we will see first if the name is mentioned in the result
        for (const otherCharName in engine.deObject.stateFor) {
            const name = extractNamedEntitiesFromText(specialResult1.value);
            if (name.includes(otherCharName.toLowerCase())) {
                whoDidThisAction = otherCharName;
                break;
            }
        }

        if (whoDidThisAction === character.name) {
            // this is us, the character, so it must have been a false positive
            brokenSpecialRule = false;
            console.warn("The action/reaction described by " + character.name + " in world rule checking was actually performed by themselves; allowing the rule to pass.");
        } else {

            // now we need to figure out who did the action/reaction if possible
            // because of bad LLM behaviour sometimes the name doesn't match reality let's double check anyway
            if (!whoDidThisAction) {
                console.warn("Could not determine who performed the action/reaction described by " + character.name + " in world rule checking.");
            } else {
                console.log("Double checking who performed the action/reaction described by " + character.name + " in world rule checking.");
            }

            // ask now for the name
            const specialResult1Whom = await generatorSpecial.next({
                maxCharacters: 500,
                maxParagraphs: 5,
                nextQuestion: lastQuestion,
                stopAfter: [],
                stopAt: ["\n", "."],
                answerTrail: specialResult1.value.trim() + ", the actual action was performed by the character ",
                grammar: `root::= "named" " " "\\"" .* "\\"" " " .*`,
            });

            if (specialResult1Whom.done) {
                throw new Error("Inference adapter questioning generator ended unexpectedly during special action/reaction who check.");
            }

            // now try to find the name again
            /**
             * @type {string | null}
             */
            let whoDidThisAction2 = null;
            const name = extractNamedEntitiesFromText(specialResult1Whom.value);
            const nameLower = name.toLowerCase();
            for (const otherCharName in engine.deObject.stateFor) {
                if (nameLower.includes(otherCharName.toLowerCase())) {
                    whoDidThisAction2 = otherCharName;
                    break;
                }
            }

            if (!whoDidThisAction2) {
                console.warn("Could not determine who performed the action/reaction described by " + character.name + " in world rule checking, even after asking specifically.");
            }
            whoDidThisAction = whoDidThisAction2 || name;
            if (whoDidThisAction === character.name) {
                // this is us, the character, so it must have been a false positive
                brokenSpecialRule = false;
                console.warn("The action/reaction described by " + character.name + " in world rule checking was actually performed by themselves; allowing the rule to pass.");
            }
        }
    }

    await generatorSpecial.next(null); // finish the generator

    // Now we consider the rule broken because our user described actions/reactions of other characters
    // but it may be the case that those characters were performing those actions/reactions themselves
    // and our user character was just narrating them, for that we will ensure that the character did not perform those actions/reactions themselves
    if (brokenSpecialRule && whoDidThisAction) {
        const specificAction = specialResult1.value.trim().replace("yes, ", "").trim();

        // first we are going to check if the character is even real to begin with and not some made up name
        const characterStateForThatCharacter = engine.deObject.stateFor[whoDidThisAction];
        if (!characterStateForThatCharacter) {
            // the character does not exist, so the rule is definitely broken
            return { passed: false, reason: character.name + " described the action/reaction of a non-existent character in the story, " + whoDidThisAction + ", " + specificAction };
        }

        // now we will have to check if the character did not perform that action/reaction themselves
        // sadly we will need a new assistant for this, because the user message cannot be included in the analysis otherwise
        // it will hold true
        const systemPromptSpecial2 = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(
            systeMessageSpecial,
            [
                "An action is defined as something a character does",
                "A reaction is defined as how a character responds to an action or event",
                "If a character has done the specific action or reaction, answer Yes",
                "If a character has not done the specific action or reaction, answer No",
            ],
            null,
        );
        const generatorSpecial = engine.inferenceAdapter.runQuestioningCustomAgentOn(character, systemPromptSpecial2, null, engine.getHistoryForCharacter(character, {}), "LAST_CYCLE_EXPANDED_EXCLUDE_CHAR", contextInfoSurroundingCharacters.value);
        const readySpecial2 = await generatorSpecial.next(); // start the generator
        if (readySpecial2.done) {
            throw new Error("Inference adapter questioning generator ended unexpectedly.");
        }
        const specialResult2 = await generatorSpecial.next({
            maxCharacters: 250,
            maxParagraphs: 1,
            nextQuestion: `${specificAction}. In any of the provided messages, did ${whoDidThisAction} ${doubleCheckLabel}`,
            stopAfter: ["yes", "no"],
            stopAt: ["\n", "."],
            grammar: `root::= ("yes" | "no") .*`,
        });
        if (specialResult2.done) {
            throw new Error("Inference adapter questioning generator ended unexpectedly during special action/reaction self-check.");
        }
        await generatorSpecial.next(null); // finish the generator

        const didPerformSpecialAction = specialResult2.value.trim().toLowerCase().split(" ")[0] === "yes";

        if (!didPerformSpecialAction) {
            // so now this means that the user described an action/reaction of another character
            // that the other character did not perform themselves, so this is a rule break
            return { passed: false, reason: character.name + " described the action/reaction of another character, " + whoDidThisAction + ", " + specificAction };
        }
    }

    // DONE CHECKING SPECIAL ACTION/REACTION RULES, those would be the most broken ones so special care was taken
    // now we can continue with more basic world rules

    // Now we will go through the other world rules
    const systemMessage = `You are a assistant that validates if ${character.name} is currently breaking any world rules or general rules in an interactive story, ` +
        `you will be questioned on each rule separately, and you will answer with Yes or No`;

    const systemPrompt = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(systemMessage, [
        "You must answer with Yes, if the rule was broken",
        "You must answer with No, if the rule was not broken",
        "If answering Yes, you must provide a brief explanation of why the rule was broken",
    ], null);

    const ruleBreakMessage = "\nWas this rule broken by " + character.name + "? Answer with Yes or No";

    const worldScpecificRules = engine.deObject.worldRules || {};
    const characterSpecificRules = character.characterRules || {};

    const mergedRules = { ...worldScpecificRules, ...characterSpecificRules };

    const otherRulesProcessed = (await Promise.all(Object.values(mergedRules).map(async (rule, index) => {
        // @ts-ignore
        return await rule.rule.execute(engine.deObject, characterObj);
    }))).filter((v) => v !== null && v !== undefined && v !== "");

    const generator = engine.inferenceAdapter.runQuestioningCustomAgentOn(character, systemPrompt, null, engine.getHistoryForCharacter(character, {}), "LAST_MESSAGE", null);
    const ready = await generator.next(); // start the generator
    if (ready.done) {
        throw new Error("Inference adapter questioning generator ended unexpectedly.");
    }

    // let currentLocationDescription = `"${character.name}" is currently at: ${charState.location}, at the slot: ${charState.locationSlot}.`;

    // const locationInfo = engine.deObject.world.locations[charState.location];
    // if (locationInfo.entrances && locationInfo.entrances.length > 0) {
    //     currentLocationDescription += `\nAt this location, the following entrances are available: ${locationInfo.entrances.join(", ")}.`;
    // }

    // // @ts-ignore
    // const locationDescription = await locationInfo.description.execute(engine.deObject, character);
    // if (locationDescription && locationDescription.trim() !== "") currentLocationDescription += `\nThe location is described as: ${locationDescription}.`;
    // const locationSlotInfo = locationInfo.slots[charState.locationSlot];
    // // @ts-ignore
    // const locationSlotDescription = await locationSlotInfo.description.execute(engine.deObject, character);
    // if (locationSlotDescription && locationSlotDescription.trim() !== "") currentLocationDescription += `\nThe slot is described as: ${locationSlotDescription}.`;

    // const contextLocationInfo = engine.inferenceAdapter.buildContextInfoCurrentLocationDescription(currentLocationDescription);

    const basicYesNoRules = [
        // {
        //     rule: `${character.name} cannot interact with the Story Master nor mention them in any way`,
        //     question: `has ${character.name} interacted or mentioned the Story Master in any way?`,
        // },
        {
            rule: `${character.name} cannot do time travel to the past`,
            question: `has ${character.name} specified going back in time? answer no if unsure or unclear`,
        },
        // {
        //     rule: `If ${character.name} is trying to go somewhere by themselves, they need to end the message before arriving at destination or describing actions at the new location`,
        //     moreContext: contextLocationInfo.value + "\n" + engine.inferenceAdapter.buildContextInfoInstructions(
        //         "This rule is not broken if " + character.name + " is describing the same location they are currently at, check at " + contextLocationInfo.locationDescriptionAt + " for information on the current location to determine if it is the same one, answer no if unsure/unclear",
        //     ),
        // },
        // {
        //     rule: `If ${character.name} is trying to go somewhere with another character, they need to end the message before arriving at destination or describing actions at the new location`,
        //     moreContext: contextLocationInfo.value + "\n" + engine.inferenceAdapter.buildContextInfoInstructions(
        //         "This rule is not broken if " + character.name + " is describing the same location they are currently at, check at " + contextLocationInfo.locationDescriptionAt + " for information on the current location to determine if it is the same one, answer no if unsure/unclear",
        //     ),
        // },
        ...otherRulesProcessed.map(ruleText => ({ rule: ruleText })),
    ];

    for (const rule of basicYesNoRules) {
        const yesNoResult = await generator.next({
            maxCharacters: 250,
            maxParagraphs: 1,
            // @ts-ignore
            nextQuestion: rule.question || ruleBreakMessage,
            stopAfter: [],
            stopAt: ["\n", "."],
            // @ts-ignore
            contextInfo: (rule.moreContext ? rule.moreContext + "\n" : "") + engine.inferenceAdapter.buildContextInfoRule(rule.rule),
            // turns out the LLM is dumber if I limit the grammar too much
            // so we will just let it be freeform yes/no with the opportunity to explain
            grammar: `root::= yesanswer | noanswer\nnoanswer ::= "no" (${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()})\nyesanswer ::= "yes" "," " " "because" .*`
        });

        if (yesNoResult.done) {
            throw new Error("Inference adapter questioning generator ended unexpectedly during basic yes/no rules.");
        }

        const brokenRule = yesNoResult.value.trim().toLowerCase().split(" ")[0] === "yes,";
        if (brokenRule) {
            // finish the generator
            await generator.next(null);

            return { passed: false, reason: yesNoResult.value.trim().replace("yes, because ", "").trim() };
        }
    }

    await generator.next(null); // finish the generator

    // Character interaction checks
    const systemMessageCharacterInteractions = `You are a assistant and story analyst that checks for interactions among characters between ${character.name} and other characters, ` +
        `you will be questioned on each interaction separately, and you will answer with Yes or No`;

    const systemPromptCharacterInteractionsIntroduction = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(systemMessageCharacterInteractions, [
        "If a character is described as entering, arriving, or being greeted in person, that counts as introducing them as physically present, even if they are not at " + contextInfoSurroundingCharacters.availableCharactersAt + " list",
        "If a character is described as being present in the location through other means (such as via magical projection, hologram, etc.), that counts as being physically present",
        "Make sure to resolve ambiguous mentions of characters by descriptions to determine if they correspond to known characters",
        "You must answer with Yes or No",
        "If answering Yes, you must provide a brief explanation",
    ], null);

    const characterInteractionGenerator = engine.inferenceAdapter.runQuestioningCustomAgentOn(
        character,
        systemPromptCharacterInteractionsIntroduction, contextInfoSurroundingCharacters.value, engine.getHistoryForCharacter(character, {}), "LAST_CYCLE_EXPANDED", null);

    const readyCharInt = await characterInteractionGenerator.next(); // start the generator
    if (readyCharInt.done) {
        throw new Error("Inference adapter questioning generator for character interactions ended unexpectedly.");
    }

    const spawnedMissingCharacters = await characterInteractionGenerator.next({
        maxCharacters: 500,
        maxParagraphs: 1,
        nextQuestion: `Considering the list of present characters ${contextInfoSurroundingCharacters.availableCharactersAt}, has ${character.name} specified new characters as being physically present?`,
        stopAfter: [],
        stopAt: ["\n", "."],
        grammar: `root::= yesanswer | noanswer\nnoanswer ::= "no" (${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()})\nyesanswer ::= "yes" "," " " ${JSON.stringify(character.name)} " " "has" " " "physically" " " "introduced" " " "a" " " "new" " " "character" " " "named" " " "\\"" .* "\\"" " " "not" " " "already" " " "present" " " .*`
    });

    if (spawnedMissingCharacters.done) {
        throw new Error("Inference adapter questioning generator for character interactions ended unexpectedly during spawned missing characters check.");
    }

    await characterInteractionGenerator.next(null); // finish the generator

    if (spawnedMissingCharacters.value.trim().toLowerCase().split(" ")[0] === "yes,") {
        // check the character name mentioned
        const mentionedName = extractNamedEntitiesFromText(spawnedMissingCharacters.value);
        let characterExists = false;
        for (const surroundingCharName of charState.surroundingTotalStrangers) {
            if (surroundingCharName.toLowerCase().includes(mentionedName)) {
                characterExists = true;
                break;
            }
        }
        for (const surroundingCharName of charState.surroundingNonStrangers) {
            if (surroundingCharName.toLowerCase().includes(mentionedName)) {
                characterExists = true;
                break;
            }
        }

        if (characterExists) {
            console.warn("The character " + mentionedName + " mentioned by " + character.name + " as being newly introduced is actually already present; allowing the rule to pass.");
        } else {
            return { passed: false, reason: spawnedMissingCharacters.value.trim().replace("yes, ", "").trim() };
        }
    }

    // Now we need to check for character lifting rules if they are broken
    const charactersCharacterCannotCarryWReasons = engine.getItemsCharacterMayCarryWithReasons("cannot", character.name, charState.location, true, true);
    if (charactersCharacterCannotCarryWReasons.length) {
        const contextInfoCannotCarryCharacters = engine.inferenceAdapter.buildContextInfoItemsCannotCarry(charactersCharacterCannotCarryWReasons, "characters");
        const systemPromptCannotCarryCharacters = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(
            `You are an asistant and story analyst that checks for lifting and carrying rules of characters in an interactive story`,
            [
                `If ${character.name} only tries or attempts to lift or carry a character, but does not actually succeed, answer No.`,
                `If ${character.name} actually lifts or carries a character and that character is listed in ${contextInfoCannotCarryCharacters.cannotCarryDescriptionAt} list, answer Yes and explain why`,
                `If ${character.name} actually lifts or carries a character and that character is not listed in ${contextInfoCannotCarryCharacters.cannotCarryDescriptionAt} list, answer No`,
                `Only answer Yes if the story clearly says ${character.name} has successfully lifted or carried the character. If it is only an attempt, answer No.`,
                "Make sure to resolve ambiguous mentions of characters by descriptions to determine if they correspond to known characters",
                "You must answer with Yes or No",
                "If answering Yes, you must provide a brief explanation",
            ], null);

        const charactersCharacterCannotCarryWReasonsGenerator = engine.inferenceAdapter.runQuestioningCustomAgentOn(
            character,
            systemPromptCannotCarryCharacters, contextInfoCannotCarryCharacters.value + "\n" + (
                engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the story says "${character.name} tries to lift [TargetCharacter]" or "${character.name} attempts to carry [TargetCharacter]", answer No. If the story says "${character.name} lifts [TargetCharacter]" or "${character.name} carries [TargetCharacter]", answer Yes (if [TargetCharacter] is in the list).`
                )
            ), engine.getHistoryForCharacter(character, {}), "LAST_CYCLE_EXPANDED", null);

        const readyForCarryCheck = await charactersCharacterCannotCarryWReasonsGenerator.next(); // start the generator
        if (readyForCarryCheck.done) {
            throw new Error("Inference adapter questioning generator for character interactions ended unexpectedly during carry check.");
        }
        const liftingTooHeavyCharacter = await charactersCharacterCannotCarryWReasonsGenerator.next({
            maxCharacters: 250,
            maxParagraphs: 1,
            nextQuestion: `considering the list at ${contextInfoCannotCarryCharacters.cannotCarryDescriptionAt}. Has ${character.name} described lifting or carrying another character that is too heavy or big for them to carry? The action must not be an attempt but a successful lifting or carrying.`,
            stopAfter: [],
            stopAt: ["\n", "."],
            grammar: `root::= yesanswer | noanswer\nnoanswer ::= "no" (${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()})\nyesanswer ::= "yes" "," " " ${JSON.stringify(character.name)} " " "is" " " ("lifting" | "carrying") " " "a" " " "character" " " "named" " " "\\"" .* "\\"" " " "who" " " "is" " " "too" " " ("big" | "heavy") " " .*`
        });
        if (liftingTooHeavyCharacter.done) {
            throw new Error("Inference adapter questioning generator for character interactions ended unexpectedly during lifting too heavy character check.");
        }
        await charactersCharacterCannotCarryWReasonsGenerator.next(null); // finish the generator

        if (liftingTooHeavyCharacter.value.trim().toLowerCase().split(" ")[0] === "yes,") {
            const characterNameMentioned = extractNamedEntitiesFromText(liftingTooHeavyCharacter.value);
            let characterExists = false;
            for (const charactersCharacterCannotCarryWReasonsEntry of charactersCharacterCannotCarryWReasons) {
                if (charactersCharacterCannotCarryWReasonsEntry.split("-")[0].replace("Name: ", "").trim().toLowerCase().includes(characterNameMentioned)) {
                    characterExists = true;
                    break;
                }
            }
            if (!characterExists) {
                console.warn("The character " + characterNameMentioned + " mentioned by " + character.name + " as being lifted or carried is actually not in the cannot carry list; allowing the rule to pass.");
            } else {
                return { passed: false, reason: liftingTooHeavyCharacter.value.trim().replace("yes, ", "").trim() };
            }
        }
    }

    /**
         * @type {string[]}
         */
    const otherCharacterNames = [];

    for (const charName in charState.surroundingTotalStrangers) {
        if (charName !== character.name) {
            otherCharacterNames.push(charName);
        }
    }
    for (const charName in charState.surroundingNonStrangers) {
        if (charName !== character.name && !otherCharacterNames.includes(charName)) {
            otherCharacterNames.push(charName);
        }
    }

    const itemsCharacterCannotCarryWReasons = engine.getItemsCharacterMayCarryWithReasons("cannot", character.name, charState.location, false, false);
    if (itemsCharacterCannotCarryWReasons.length) {
        const contextInfoCannotCarryItems = engine.inferenceAdapter.buildContextInfoItemsCannotCarry(itemsCharacterCannotCarryWReasons, "items");
        const systemPromptCannotCarryItems = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(
            `You are an asistant and story analyst that checks for lifting and carrying rules of characters in an interactive story`,
            [
                `If ${character.name} only tries or attempts to lift or carry an item, but does not actually succeed, answer No.`,
                `If ${character.name} actually lifts or carries an item and that item is listed in ${contextInfoCannotCarryItems.cannotCarryDescriptionAt} list, answer Yes and explain why`,
                `If ${character.name} actually lifts or carries an item and that item is not listed in ${contextInfoCannotCarryItems.cannotCarryDescriptionAt} list, answer No`,
                `Only answer Yes if the story clearly says ${character.name} has successfully lifted or carried the item. If it is only an attempt, answer No.`,
                "Make sure to resolve ambiguous mentions of items by descriptions to determine if they correspond to known items",
                "You must answer with Yes or No",
                "If answering Yes, you must provide a brief explanation",
                "People and other characters are not items, do not consider them for this question",
                otherCharacterNames.length ? "The list of characters that should not be considered for this question are: " + otherCharacterNames.join(", ") : null,
            ].filter((v) => v !== null), null);

        const itemsCharacterCannotCarryWReasonsGenerator = engine.inferenceAdapter.runQuestioningCustomAgentOn(
            character,
            systemPromptCannotCarryItems, contextInfoCannotCarryItems.value + "\n" + (
                engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the story says "${character.name} tries to lift [TargetItem]" or "${character.name} attempts to carry [TargetItem]", answer No. If the story says "${character.name} lifts [TargetItem]" or "${character.name} carries [TargetItem]", answer Yes (if [TargetItem] is in the list).`
                )
            ), engine.getHistoryForCharacter(character, {}), "LAST_CYCLE_EXPANDED", null);

        const readyForCarryCheckItems = await itemsCharacterCannotCarryWReasonsGenerator.next(); // start the generator
        if (readyForCarryCheckItems.done) {
            throw new Error("Inference adapter questioning generator for character interactions ended unexpectedly during item carry check.");
        }

        const liftingTooHeavyItem = await itemsCharacterCannotCarryWReasonsGenerator.next({
            maxCharacters: 250,
            maxParagraphs: 1,
            nextQuestion: `considering the list at ${contextInfoCannotCarryItems.cannotCarryDescriptionAt}. Has ${character.name} described lifting or carrying an item that is too heavy or big for them to carry? The action must not be an attempt but a successful lifting or carrying.`,
            stopAfter: [],
            stopAt: ["\n", "."],
            grammar: `root::= yesanswer | noanswer\nnoanswer ::= "no" (${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()})\nyesanswer ::= "yes" "," " " ${JSON.stringify(character.name)} " " "is" " " ("lifting" | "carrying") " " "an" " " "item" " " "named" " " "\\"" .* "\\"" " " "that" " " "is" " " "too" " " ("big" | "heavy") " " .*`
        });

        if (liftingTooHeavyItem.done) {
            throw new Error("Inference adapter questioning generator for character interactions ended unexpectedly during lifting too heavy item check.");
        }

        await itemsCharacterCannotCarryWReasonsGenerator.next(null); // finish the generator

        if (liftingTooHeavyItem.value.trim().toLowerCase().split(" ")[0] === "yes,") {
            const itemNameMentioned = extractNamedEntitiesFromText(liftingTooHeavyItem.value);
            let itemExists = false;
            for (const itemsCharacterCannotCarryWReasonsEntry of itemsCharacterCannotCarryWReasons) {
                if (itemsCharacterCannotCarryWReasonsEntry.split("-")[0].replace("Name: ", "").trim().toLowerCase().includes(itemNameMentioned)) {
                    itemExists = true;
                    break;
                }
            }
            if (!itemExists) {
                console.warn("The item " + itemNameMentioned + " mentioned by " + character.name + " as being lifted or carried is actually not in the cannot carry list; allowing the rule to pass.");
            } else {
                return { passed: false, reason: liftingTooHeavyItem.value.trim().replace("yes, ", "").trim() };
            }
        }
    }

    const itemsDescribedAtLocation = engine.describeItemsAvailableToCharacterForInference(character.name);
    const availableItemsContextInfo = engine.inferenceAdapter.buildContextInfoForAvailableItems(itemsDescribedAtLocation.cheapList);
    const systemPromptSpawnItems = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(
        `You are an asistant and story analyst that checks for interactions with items in an story\n` +
        "You will be questioned on whether " + character.name + ` has interacted with items in the story that are not available to them at their current location`,
        [
            `An interaction with an item is defined as lifting, carrying, moving, using, or manipulating the item in any way`,
            "If an item is only mentioned or described but not interacted with, answer Yes, since no interaction happened",
            `If the interacted item is not in the list at ${availableItemsContextInfo.availableItemsAt}, answer No and explain why`,
            "People and other characters are not items, do not consider them for this question",
            otherCharacterNames.length ? "The list of characters that should not be considered for this question are: " + otherCharacterNames.join(", ") : null,
        ].filter((v) => v !== null), null);

    const itemsInteractionGenerator = engine.inferenceAdapter.runQuestioningCustomAgentOn(
        character,
        systemPromptSpawnItems,
        availableItemsContextInfo.value,
        engine.getHistoryForCharacter(character, {}), "LAST_MESSAGE",
        null,
    );
    const readyItemsInteraction = await itemsInteractionGenerator.next(); // start the generator
    if (readyItemsInteraction.done) {
        throw new Error("Inference adapter questioning generator for item interactions ended unexpectedly.");
    }
    const spawnedMissingItems = await itemsInteractionGenerator.next({
        maxCharacters: 500,
        maxParagraphs: 1,
        nextQuestion: `considering the list at ${availableItemsContextInfo.availableItemsAt}. Has ${character.name} interacted with an item that is not in the list?`,
        stopAfter: [],
        stopAt: ["\n", "."],
        grammar: `root::= yesanswer | noanswer\nnoanswer ::= "no" (${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()})\nyesanswer ::= "yes" "," " " ${JSON.stringify(character.name)} " " "has" " " "interacted" " " "with" " " "an" " " "item" " " "named" " " "\\"" .* "\\"" " " "not" " " "available" " " "at" " " "their" " " "current" " " "location" " " .*`
    });

    if (spawnedMissingItems.done) {
        throw new Error("Inference adapter questioning generator for item interactions ended unexpectedly during spawned missing items check.");
    }
    await itemsInteractionGenerator.next(null); // finish the generator

    if (spawnedMissingItems.value.trim().toLowerCase().split(" ")[0] === "yes,") {
        const itemNameMentioned = extractNamedEntitiesFromText(spawnedMissingItems.value);
        let itemExists = false;
        for (const itemsDescribedAtLocationEntry of itemsDescribedAtLocation.cheapList) {
            if (itemsDescribedAtLocationEntry.includes(itemNameMentioned)) {
                itemExists = true;
                break;
            }
        }

        if (itemExists) {
            console.warn("The item " + itemNameMentioned + " mentioned by " + character.name + " as being interacted with is actually available at their location; allowing the rule to pass.");
        } else {
            // Not so fast it might be a character
            let isCharacter = false;
            for (const otherCharName of otherCharacterNames) {
                if (otherCharName.toLowerCase().includes(itemNameMentioned)) {
                    isCharacter = true;
                    break;
                }
            }

            if (isCharacter) {
                console.warn("The name " + itemNameMentioned + " mentioned by " + character.name + " as being an item interacted with is actually an existing character; allowing the rule to pass.");
            } else {
                return { passed: false, reason: spawnedMissingItems.value.trim().replace("yes, ", "").trim() };
            }
        }
    }

    return { passed: true, reason: null };
}