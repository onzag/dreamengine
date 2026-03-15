import { DEngine } from "../index.js";
import { getSurroundingCharacters } from "../util/character-info.js";

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
 * @param {string} answer
 * @return {boolean}
 */
function isYes(answer) {
    return answer.toLowerCase().includes("yes");
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
    const characterSurroundInfo = getSurroundingCharacters(engine, character.name);
    for (const characterName of characterSurroundInfo.totalStrangers) {
        if (characterName === character.name) {
            continue;
        }
        const characterInfo = engine.deObject.characters[characterName];
        if (characterInfo) {
            characters.push({ name: characterName, description: engine.getExternalDescriptionOfCharacter(characterName, true) });
        }
    }
    for (const characterName of characterSurroundInfo.nonStrangers) {
        if (characterName === character.name) {
            continue;
        }
        const characterInfo = engine.deObject.characters[characterName];
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

    // RULE #1 SPAWNING NEW CHARACTERS THAT DONT EXIST
    // Character interaction checks
    const systemMessageCharacterInteractions = `You are a assistant and story analyst that checks for interactions among characters between ${character.name} and other characters, ` +
        `you will be questioned on each interaction separately, and you will answer with Yes or No`;

    const systemPromptCharacterInteractionsIntroduction = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(systemMessageCharacterInteractions, [
        "If a character is described as entering, arriving, or being greeted in person, that counts as introducing them as physically present, even if they are not at " + contextInfoSurroundingCharacters.availableCharactersAt + " list",
        "If a character is described as being present in the location through other means (such as via magical projection, hologram, etc.), that counts as being physically present",
        "Make sure to resolve ambiguous mentions of characters by descriptions to determine if they correspond to known characters",
        "You must answer with Yes or No",
        "If answering Yes, you must provide a brief explanation",
        "Answer no for any characters that are already present at " + contextInfoSurroundingCharacters.availableCharactersAt + " list",
        "Answer no for any of " + [...characterSurroundInfo.totalStrangers, ...characterSurroundInfo.nonStrangers, character.name].map(name => `"${name}"`).join(", "),
    ], null);

    const characterInteractionGenerator = engine.inferenceAdapter.runQuestioningCustomAgentOn(
        character,
        systemPromptCharacterInteractionsIntroduction, contextInfoSurroundingCharacters.value, engine.getHistoryForCharacter(character, {}), "LAST_CYCLE_EXPANDED", null, true);

    const readyCharInt = await characterInteractionGenerator.next(); // start the generator
    if (readyCharInt.done) {
        throw new Error("Inference adapter questioning generator for character interactions ended unexpectedly.");
    }

    const nextQuestion = `Considering the list of present characters ${contextInfoSurroundingCharacters.availableCharactersAt}, has the last message specified new characters as being physically present?`;
    console.log("Asking question, " + nextQuestion);

    const spawnedMissingCharacters = await characterInteractionGenerator.next({
        maxSafetyCharacters: 500,
        maxCharacters: 0,
        maxParagraphs: 1,
        nextQuestion: nextQuestion,
        stopAfter: [],
        stopAt: ["\n", "."],
        grammar: `root ::= ("no." | "NO." | "No." | "yes," | "YES," | "Yes,") " " .*`,
        instructions: "Answer with a simple \"No\" if no new characters are introduced, otherwise answer with \"Yes\" and specify the name or names of the character in the same sentence and a brief explanation in one sentence only",
    });

    if (spawnedMissingCharacters.done) {
        throw new Error("Inference adapter questioning generator for character interactions ended unexpectedly during spawned missing characters check.");
    }

    await characterInteractionGenerator.next(null); // finish the generator

    console.log("Received answer, " + spawnedMissingCharacters.value.trim());

    if (isYes(spawnedMissingCharacters.value)) {
        return { passed: false, reason: spawnedMissingCharacters.value.trim().replace("yes, ", "").replace("Yes, ", "").replace("YES, ", "").trim() };
    }

    // After this rule passed we can be sure that any character mentioned, must be physically present in the location
    const systeMessageSpecial = `You are an assistant and story analyst that checks for actions and reactions of characters in an interactive story`;
    const systemPromptSpecial = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(
        systeMessageSpecial,
        [
            "An action is defined as something a character does",
            "A reaction is defined as how a character responds to an action or event",
            "A reaction includes emotional response, physical response, or verbal response to an action or event",
            "The action must be clearly described in the messages and stated, do not assume anything that is not explicitly described",
            "Only analyze the described text content of the last message, regardless of which character's player wrote it. The authorship of the message does not matter, only the actions described in the text matter"
        ],
        null,
    );

    const generatorSpecial = engine.inferenceAdapter.runQuestioningCustomAgentOn(character, systemPromptSpecial, null, engine.getHistoryForCharacter(character, {}), "LAST_CYCLE_EXPANDED", contextInfoSurroundingCharacters.value, true);
    const readySpecial = await generatorSpecial.next(); // start the generator
    if (readySpecial.done) {
        throw new Error("Inference adapter questioning generator ended unexpectedly.");
    }

    for (const characterName of [...characterSurroundInfo.totalStrangers, ...characterSurroundInfo.nonStrangers]) {
        const nextQuestion = `Has the last message described any actions or reactions performed by ${characterName}?`;
        console.log("Asking question, " + nextQuestion);
        let specialResult1 = await generatorSpecial.next({
            maxCharacters: 0,
            maxSafetyCharacters: 500,
            maxParagraphs: 5,
            nextQuestion: nextQuestion,
            contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                `Example: If the last message says "${characterName} does [something]" or "${characterName} acts" or "${characterName} goes [somewhere]" or "${characterName} kisses [someone]", regardless of who wrote the message, answer Yes`,
            ) + engine.inferenceAdapter.buildContextInfoExample(
                `Example: If the last message describes ${characterName} being physically forced, coerced against their will, or kidnapped (e.g. "${character.name} forces ${characterName} to do [something]" or "${characterName} does [action] against their will" or "${character.name} kidnaps ${characterName}"), since ${characterName} is being forced, answer No.`,
            ),
            stopAfter: [],
            stopAt: ["\n", "."],
            grammar: `root::= yesanswer | noanswer\nnoanswer ::= ("no" | "NO" | "No") (${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()})\nyesanswer ::= ("yes" | "YES" | "Yes") ", the specific " ("action" | "reaction") " is about " .*`,
        });

        if (specialResult1.done) {
            throw new Error("Inference adapter questioning generator ended unexpectedly during special action/reaction check.");
        }

        console.log("Received answer, " + specialResult1.value.trim());

        const specialRuleSplitted = specialResult1.value.trim().toLowerCase().split(" ")[0];
        let brokenSpecialRule = specialRuleSplitted === "yes," || specialRuleSplitted === "Yes," || specialRuleSplitted === "YES,";

        if (!brokenSpecialRule) {
            const nextQuestion = `Has the last message described an emotional response or thought process by ${characterName}? do not make assumptions, only consider what is explicitly described.`;
            console.log("Asking question, " + nextQuestion);
            specialResult1 = await generatorSpecial.next({
                maxCharacters: 0,
                maxSafetyCharacters: 500,
                maxParagraphs: 5,
                nextQuestion: nextQuestion,
                contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message describes "${characterName} feels [something]" or "${characterName} expresses [something]" or "${characterName} showcases [emotion]" or "${characterName} thinks [something]" or "${characterName} believes [something]", answer Yes.`,
                ),
                stopAfter: [],
                stopAt: ["\n", "."],
                grammar: `root::= yesanswer | noanswer\nnoanswer ::= ("no" | "NO" | "No") (${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()})\nyesanswer ::= ("yes" | "YES" | "Yes") ", the specific " ("emotional response" | "thought process") " is about " .*`,
            });

            if (specialResult1.done) {
                throw new Error("Inference adapter questioning generator ended unexpectedly during special action/reaction emotional check.");
            }

            console.log("Received answer, " + specialResult1.value.trim());

            const specialRuleSplitted = specialResult1.value.trim().toLowerCase().split(" ")[0];
            brokenSpecialRule = specialRuleSplitted === "yes," || specialRuleSplitted === "Yes," || specialRuleSplitted === "YES,";
        }

        if (!brokenSpecialRule) {
            const nextQuestion = `Has the last message described any verbal response from ${characterName}? do not make assumptions, only consider what is explicitly described.`;
            console.log("Asking question, " + nextQuestion);
            specialResult1 = await generatorSpecial.next({
                maxCharacters: 0,
                maxSafetyCharacters: 500,
                maxParagraphs: 5,
                nextQuestion: nextQuestion,
                contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message says "${characterName} speaks up" or "${characterName} says [something]" or "${characterName} expresses [something]" or "${characterName} greets [someone]", answer Yes.`,
                ),
                stopAfter: [],
                stopAt: ["\n", "."],
                grammar: `root::= yesanswer | noanswer\nnoanswer ::= ("no" | "NO" | "No") (${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()})\nyesanswer ::= ("yes" | "YES" | "Yes") ", the specific verbal response is about " .*`,
            });

            if (specialResult1.done) {
                throw new Error("Inference adapter questioning generator ended unexpectedly during special action/reaction verbal check.");
            }

            console.log("Received answer, " + specialResult1.value.trim());

            const specialRuleSplitted = specialResult1.value.trim().toLowerCase().split(" ")[0];
            brokenSpecialRule = specialRuleSplitted === "yes," || specialRuleSplitted === "Yes," || specialRuleSplitted === "YES,";
        }

        if (brokenSpecialRule) {
            // finish the generator
            await generatorSpecial.next(null);
            return { passed: false, reason: specialResult1.value.trim().replace("Yes, ", "").replace("YES, ", "").replace("yes, ", "").trim() };
        }
    }

    await generatorSpecial.next(null); // finish the generator

    // DONE CHECKING SPECIAL ACTION/REACTION RULES, those would be the most broken ones so special care was taken
    // now we can continue with more basic world rules

    // Now we will go through the other world rules
    const systemMessage = `You are a assistant that validates if the last message is currently breaking any world rules or general rules in an interactive story, ` +
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
        return typeof rule.rule === "string" ? rule.rule : await rule.rule(engine.deObject, {
            char: character,
        });
    }))).filter((v) => v !== null && v !== undefined && v !== "");

    const generator = engine.inferenceAdapter.runQuestioningCustomAgentOn(character, systemPrompt, null, engine.getHistoryForCharacter(character, {}), "LAST_STORY_FRAGMENT_FROM_CHARACTER", null, true);
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
        {
            rule: `The Story Master cannot be mentioned or interacted with`,
            question: `has the last message interacted or mentioned the Story Master in any way?`,
        },
        {
            rule: `Time travel to the past is not allowed`,
            question: `has the last message specified going back in time? answer no if unsure or unclear`,
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
        // @ts-ignore
        console.log("Asking question, " + (rule.question || ruleBreakMessage));
        const yesNoResult = await generator.next({
            maxCharacters: 0,
            maxSafetyCharacters: 250,
            maxParagraphs: 1,
            // @ts-ignore
            nextQuestion: rule.question || ruleBreakMessage,
            stopAfter: [],
            stopAt: ["\n", "."],
            // @ts-ignore
            contextInfo: (rule.moreContext ? rule.moreContext + "\n" : "") + engine.inferenceAdapter.buildContextInfoRule(rule.rule),
            // turns out the LLM is dumber if I limit the grammar too much
            // so we will just let it be freeform yes/no with the opportunity to explain
            grammar: `root::= yesanswer | noanswer\nnoanswer ::= ("NO" | "No" | "no") (${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()})\nyesanswer ::= ("YES" | "Yes" | "yes") "," " " "because" .*`
        });

        if (yesNoResult.done) {
            throw new Error("Inference adapter questioning generator ended unexpectedly during basic yes/no rules.");
        }

        const yesNoResultSplitted = yesNoResult.value.trim().toLowerCase().split(" ")[0];
        const brokenRule = yesNoResultSplitted === "yes," || yesNoResultSplitted === "Yes," || yesNoResultSplitted === "YES,";

        console.log("Received answer, " + yesNoResult.value.trim());

        if (brokenRule) {
            // finish the generator
            await generator.next(null);

            return { passed: false, reason: yesNoResult.value.trim().replace("yes, because ", "").replace("Yes, because ", "").replace("YES, because ", "").trim() };
        }
    }

    await generator.next(null); // finish the generator

    /**
         * @type {string[]}
         */
    const otherCharacterNames = [];

    for (const charName of characterSurroundInfo.totalStrangers) {
        if (charName !== character.name) {
            otherCharacterNames.push(charName);
        }
    }
    for (const charName of characterSurroundInfo.nonStrangers) {
        if (charName !== character.name && !otherCharacterNames.includes(charName)) {
            otherCharacterNames.push(charName);
        }
    }

    const itemsAtLocation = engine.getFullItemListAtLocation(charState.location);
    const itemsDescribedAtLocation = engine.describeItemsAvailableToCharacterForInference(character.name);
    const availableItemsContextInfo = engine.inferenceAdapter.buildContextInfoForAvailableItems(itemsDescribedAtLocation.cheapList);
    const systemPromptSpawnItems = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(
        `You are an asistant and story analyst that checks for interactions with items in an story\n` +
        "You will be questioned on whether " + character.name + ` has interacted with items in the story that are not available to them at their current location`,
        [
            `An interaction with an item is defined as lifting, carrying, moving, using, stealing, or manipulating the item in any way`,
            "If an item is only mentioned or described but not interacted with, answer No, since no interaction happened",
            `If the interacted item is not in the list at ${availableItemsContextInfo.availableItemsAt}, answer No and explain why`,
            "People and other characters are not items, do not consider them for this question",
            "Only consider items explictly manipulated by " + character.name + " in the messages",
            "Answer no for any of the following items: " + itemsAtLocation.join(", "),
        ].filter((v) => v !== null), null);

    const itemsInteractionGenerator = engine.inferenceAdapter.runQuestioningCustomAgentOn(
        character,
        systemPromptSpawnItems,
        availableItemsContextInfo.value,
        engine.getHistoryForCharacter(character, {}), "LAST_STORY_FRAGMENT_FROM_CHARACTER",
        null,
    );
    const readyItemsInteraction = await itemsInteractionGenerator.next(); // start the generator
    if (readyItemsInteraction.done) {
        throw new Error("Inference adapter questioning generator for item interactions ended unexpectedly.");
    }

    const nextQuestion2 = `Considering the list at ${availableItemsContextInfo.availableItemsAt}. Has ${character.name} interacted with an item that is not in the list?`;
    console.log("Asking question, " + nextQuestion2);

    const spawnedMissingItems = await itemsInteractionGenerator.next({
        maxCharacters: 0,
        maxSafetyCharacters: 250,
        maxParagraphs: 1,
        nextQuestion: nextQuestion2,
        stopAfter: [],
        stopAt: ["\n", "."],
        grammar: `root::= yesanswer | noanswer\nnoanswer ::= ("NO" | "No" | "no") (${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()})\nyesanswer ::= ("YES" | "yes" | "Yes") "," " " ${JSON.stringify(character.name)} " " "has" " " "interacted" " " "with" " " "an" " " "item" " " "named" " " "\\"" .* "\\"" " " "not" " " "available" " " "at" " " "their" " " "current" " " "location" " " .*`
    });

    if (spawnedMissingItems.done) {
        throw new Error("Inference adapter questioning generator for item interactions ended unexpectedly during spawned missing items check.");
    }

    console.log("Received answer, " + spawnedMissingItems.value.trim());

    await itemsInteractionGenerator.next(null); // finish the generator

    const spawnedMissingItemsSplitted = spawnedMissingItems.value.trim().toLowerCase().split(" ")[0];
    if (spawnedMissingItemsSplitted === "yes," || spawnedMissingItemsSplitted === "Yes," || spawnedMissingItemsSplitted === "YES,") {
        const itemNameMentioned = extractNamedEntitiesFromText(spawnedMissingItems.value);
        let itemExists = false;
        for (const itemsDescribedAtLocationEntry of itemsDescribedAtLocation.cheapList) {
            if (itemsDescribedAtLocationEntry.toLowerCase().includes(itemNameMentioned.toLowerCase())) {
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
                if (otherCharName.toLowerCase().includes(itemNameMentioned.toLowerCase())) {
                    isCharacter = true;
                    break;
                }
            }

            if (isCharacter) {
                console.warn("The name " + itemNameMentioned + " mentioned by " + character.name + " as being an item interacted with is actually an existing character; allowing the rule to pass.");
            } else {
                return { passed: false, reason: spawnedMissingItems.value.trim().replace("yes, ", "").replace("Yes, ", "").replace("YES, ", "").trim() };
            }
        }
    }

    return { passed: true, reason: null };
}