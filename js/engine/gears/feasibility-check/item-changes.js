import { deepCopy, DEngine } from "../../index.js";

const nameOptionsBase = [
    "Bob",
    "Emma",
    "Joe",
    "${getCharacterNameForExample([charName], 0)}",
]

const nameOptionsExtras = [
    "Charlie",
    "David",
    "Fiona",
    "George",
    "Hannah",
    "Ian",
    "Jane",
    "Kevin",
    "Laura",
    "Mike",
    "Nina",
    "Oscar",
    "Paula",
    "Quinn",
    "Rachel",
    "Sam",
    "Tina",
]

/**
 * @param {string[]} involvedNames 
 * @param {number} index 
 */
function getCharacterNameForExample(involvedNames, index) {
    if (!involvedNames.includes(nameOptionsBase[index])) {
        return nameOptionsBase[index];
    } else {
        let matchCount = 0;
        for (const name of nameOptionsExtras) {
            if (!involvedNames.includes(name)) {
                matchCount++;
            }

            if (matchCount === (index + 1)) {
                return name;
            }
        }

        throw new Error("Not enough name options to assign character names for item changes feasibility check examples. Please add more names to the nameOptionsExtras array.");
    }
}

/**
 * 
 * @param {Array<any>} array 
 * @returns 
 */
function removeRepeatsInArray(array) {
    return [...new Set(array)];
}

/**
 * @param {DEngine} engine 
 * @param {DECompleteCharacterReference} character 
 */
export default async function testMessageFeasibilityItemChanges(engine, character) {
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

    const itemsAtLocation = engine.getFullItemListAtLocation(charState.location);

    if (itemsAtLocation.length === 0) {
        console.log("No items at location, skipping item changes check.");
        return;
    }

    const location = engine.deObject.world.locations[charState.location];

    /**
     * @type {string[]}
     */
    const storyMasterMessages = [];

    const itemsAtLocationLower = itemsAtLocation.map((v) => v.toLowerCase());
    const itemsDescribedAtLocation = engine.describeItemsAvailableToCharacterForInference(character.name);
    const availableItemsContextInfo = engine.inferenceAdapter.buildContextInfoForAvailableItems(itemsDescribedAtLocation.cheapList);
    const systemPromptItemsInteracted = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(
        `You are an asistant and story analyst that checks for interactions with items in an story\n` +
        "You will be questioned to mention any of the items that were mentioned as being interacted in the last message of a interactive story, and the interaction type (lifting, carrying, moving, using, manipulating, grabbing, etc.)\n",
        [
            `An interaction with an item is defined as lifting, carrying, moving, using, or manipulating the item in any way, giving, carrying, dropping, stealing, wearing, taking off, putting on, or any other form of direct physical interaction with the item. Just mentioning or describing the item without any of these interactions does not count as an interaction.`,
            "If an item is only mentioned or described but not interacted with, answer No, since no interaction happened",
            "People and other characters are not items, do not consider them for this question",
            "Only consider items from this list: " + itemsAtLocationLower.join(", ") + ". Ignore any items not in this list.",
            "Answer in the format: Item Name, Item Name, Item Name, ...",
            "Answer none if no items were interacted with",
        ].filter((v) => v !== null), null);

    const itemsInteractionGenerator = engine.inferenceAdapter.runQuestioningCustomAgentOn(
        character,
        systemPromptItemsInteracted,
        availableItemsContextInfo.value,
        engine.getHistoryForCharacter(character, {}), "LAST_MESSAGE",
        null,
    );

    const ready = await itemsInteractionGenerator.next();
    if (ready.done) {
        throw new Error("Questioning agent could not be started properly for item changes check.");
    }

    const nextQuestion = "What items were interacted with by any character in the last message?";
    console.log("Asking question, " + nextQuestion)
    // TODO uncomment
    // const answer = await itemsInteractionGenerator.next({
    //     maxCharacters: 200,
    //     maxParagraphs: 1,
    //     nextQuestion: nextQuestion,
    //     stopAfter: [],
    //     stopAt: [],
    //     answerTrail: "The list of the items interacted with, including grabbing, taking, stealing, placing, is: ",
    //     grammar: `root ::= ("none" | itemList) ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\n` +
    //         `itemList ::= itemName (", " itemName)*\n` +
    //         `itemName ::= ${itemsAtLocationLower.map((item) => JSON.stringify(item)).join(" | ")}`,
    // });

    const answer = {
        done: false,
        value: "chair, bowl, stove",
    };

    if (answer.done) {
        throw new Error("Questioning agent finished without providing an answer for item changes check.");
    }

    console.log("Received answer, " + answer.value);

    await itemsInteractionGenerator.next(null); // end the generator

    const itemsInteractedWith = removeRepeatsInArray(answer.value.trim() === "none" ? [] : answer.value.split(",").map((v) => v.trim()));

    if (itemsInteractedWith.length === 0) {
        console.log("No items were interacted with, skipping item changes check.");
        return;
    }

    const charactersAtLocation = [...charState.surroundingNonStrangers, ...charState.surroundingTotalStrangers, character.name];

    const systemPromptCharactersInteracted = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(
        `You are an asistant and story analyst that checks for interactions among characters in a story\n` +
        "You will be questioned to mention any characters that were mentioned in the last message of a interactive story",
        [
            `Keep in mind any mention of any character, direct or indirect, it counts as an interaction, including talking, looking at, thinking about, mentioning, etc.`,
            "Keep in mind descriptions of characters also count as mentions, for example if the message says 'Bob gave the book to the woman', figure out who the woman is based on the description and the context, and if it's a character, it counts as an interaction",
            "Only consider characters from this list: " + charactersAtLocation.join(", ") + ". Ignore any characters not in this list.",
            "Answer in the format: Character Name, Character Name, Character Name, ...",
            "If no characters were mentioned or interacted with, answer none",
        ].filter((v) => v !== null), null);

    /**
     * @type {string[]}
     * TODO fix ask for each character in order to figure out
     */
    let charactersToQuestion = charState.conversationId ? engine.deObject.conversations[charState.conversationId].participants : [];

    const charactersInteractionGenerator = engine.inferenceAdapter.runQuestioningCustomAgentOn(
        character,
        systemPromptCharactersInteracted,
        null,
        engine.getHistoryForCharacter(character, {}), "LAST_CYCLE_EXPANDED",
        null,
        true, // remark last message for analysis, so the agent can analyze it to figure out indirect mentions and descriptions
    );

    const readyCharacters = await charactersInteractionGenerator.next();
    if (readyCharacters.done) {
        throw new Error("Questioning agent could not be started properly for character interactions check.");
    }

    const nextQuestionCharacters = "What characters were mentioned or interacted with by any character in the last message?";
    console.log("Asking question, " + nextQuestionCharacters)
    const answerCharacters = await charactersInteractionGenerator.next({
        maxCharacters: 200,
        maxParagraphs: 1,
        nextQuestion: nextQuestionCharacters,
        stopAfter: [],
        stopAt: [],
        answerTrail: "The list of the characters mentioned or interacted with is: ",
        grammar: `root ::= ("none" | characterList) ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\n` +
            `characterList ::= characterName (", " characterName)*\n` +
            `characterName ::= ${charactersAtLocation.map((char) => JSON.stringify(char)).join(" | ")}`,
    });

    if (answerCharacters.done) {
        throw new Error("Questioning agent finished without providing an answer for character interactions check.");
    }

    console.log("Received answer, " + answerCharacters.value);

    await charactersInteractionGenerator.next(null); // end the generator

    const charactersInteractedWith = answerCharacters.value.trim() === "none" ? [] : answerCharacters.value.split(",").map((v) => v.trim());
    charactersToQuestion = charactersToQuestion.concat(charactersInteractedWith);
    charactersToQuestion = removeRepeatsInArray(charactersToQuestion);
    charactersToQuestion = []; // TODO remove

    console.log("Items interacted with: ", itemsInteractedWith);
    console.log("Characters to question: ", charactersToQuestion);

    const systemPrompt = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(
        `You are an asistant and story analyst that checks for interactions among characters and items in a story\n` +
        "You will be questioned about interactions among items and characters in the last message of a interactive story",
        [
            "The responses should refer to the last message only.",
        ],
        null,
    );

    const interactionGenerator = engine.inferenceAdapter.runQuestioningCustomAgentOn(
        character,
        systemPrompt,
        null,
        engine.getHistoryForCharacter(character, {}),
        "LAST_CYCLE_EXPANDED",
        null,
        true, // remark last message for analysis, so the agent can analyze it to figure out indirect mentions and descriptions
    );

    const result = await interactionGenerator.next(); // start the generator for each item

    if (result.done) {
        throw new Error("Questioning agent could not be started properly for item-character interactions check.");
    }

    let charactersWithAnEstablishedLocation = [];
    for (const item of itemsInteractedWith) {
        const allCharactersAtLocation = [...charState.surroundingNonStrangers, ...charState.surroundingTotalStrangers, character.name];
        let { allPotentialLocationsForItem, allPotentialLocationTraversePath, allPotentialItemsForItem } = calculateAllPotentialLocationsForItem(engine, charState, allCharactersAtLocation, charactersToQuestion, location, item);

        if (allPotentialLocationsForItem.length === 0) {
            console.log(`No potential locations found for item "${item}", skipping further checks for this item.`);
            continue;
        }

        const wasItMovedNextQuestion = `In the last message, did any character move, picked up, wear, carry, put on, or change the location of the item "${item}" itself? IMPORTANT: The item "${item}" must be the DIRECT OBJECT being physically relocated. If "${item}" is only a DESTINATION or LOCATION where something else was placed, the answer is NO.`;

        console.log("Asking question, " + wasItMovedNextQuestion);

        const wasItMovedQuestion = await interactionGenerator.next({
            maxCharacters: 100,
            maxParagraphs: 1,
            nextQuestion: wasItMovedNextQuestion,
            stopAfter: ["yes", "no"],
            stopAt: [],
            answerTrail: `regarding specifically the item ${item} being moved, picked up, carried, put on, or relocated; the answer is: `,
            grammar: `root ::= ("yes" | "no") ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\n`,
            // contextInfo: engine.inferenceAdapter.buildContextInfoExample(
            //     `Example: "Alice picked up ${item} and put it in her backpack" -> Answer: YES, because ${item} itself was picked up and moved.`,
            // ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
            //     `Example: "Bob looked at ${item} on the table" -> Answer: NO, because ${item} was not moved.`,
            // ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
            //     `Example: "Emma gave ${item} to Bob" -> Answer: YES, because ${item} was handed over (moved from Emma to Bob).`,
            // ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
            //     `Example: "Joe kicked ${item} on an angry rampage" -> Answer: NO, because kicking does not relocate the item.`,
            // ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
            //     `Example: "Alice grabbed a fork from the ${item}" -> Answer: NO, because ${item} is the SOURCE. A fork was taken FROM ${item}, but ${item} stayed in place.`,
            // ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
            //     `Example: "Bob placed the book on top of the ${item}" -> Answer: NO, because ${item} is the DESTINATION. The book was placed ON ${item}, but ${item} itself was not moved.`,
            // ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
            //     `Example: "Carol puts a bowl on top of a ${item}" -> Answer: NO, because ${item} is the DESTINATION. The bowl was placed ON ${item}, but ${item} itself stayed where it was.`,
            // ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
            //     `KEY RULE: If something is placed ON, INTO, ONTO, or INSIDE "${item}", then "${item}" is a destination, NOT the object being moved. Answer NO in such cases.`,
            // ),
        });
        if (wasItMovedQuestion.done) {
            throw new Error("Questioning agent finished without providing an answer for item movement check.");
        }
        console.log("Received answer, " + wasItMovedQuestion.value);

        let wasMoved = true;
        if (wasItMovedQuestion.value.trim().toLowerCase() !== "yes") {
            console.log(`Item "${item}" was not moved or had its location changed, skipping further checks for this item.`);
            wasMoved = false;
        }

        if (allPotentialLocationsForItem.length === 0) {
            console.log(`Error: Could not find any potential location for item "${item}", skipping further checks for this item.`);
            continue;
        }

        /**
         * @type {number[]}
         */
        let answerForLocationIndexes = [];
        const calculatePotentialOriginalLocationOfItem = async () => {
            if (!engine.inferenceAdapter) {
                // typescript being dumb
                throw new Error("No inference adapter set.");
            }

            if (answerForLocationIndexes.length) {
                return;
            }

            if (allPotentialLocationsForItem.length > 1) {
                for (let i = 0; i < allPotentialLocationsForItem.length; i++) {
                    const answerAlt = allPotentialLocationsForItem[i].includes("table") ? "on the table" : "on the ground";
                    const nextQuestion = `For the item "${item}", according to the last message to analyze, before it was interacted with, was it originally ${allPotentialLocationsForItem[i]}?`;
                    console.log("Asking question, " + nextQuestion);
                    const whereWasItQuestion = await interactionGenerator.next({
                        maxCharacters: 100,
                        maxParagraphs: 1,
                        nextQuestion: nextQuestion,
                        stopAfter: ["yes", "no"],
                        stopAt: [],
                        grammar: `root ::= ("yes" | "no") ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\n`,
                        contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                            `Example: If the last message said that "Alice picked up ${item} from ${answerAlt}", the answer would be "no", since it was originally ${answerAlt}, not ${allPotentialLocationsForItem[i]}.`,
                        ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                            `Example: If the last message said that "Bob saw the item ${item} ${allPotentialLocationsForItem[i]} and moved it to be ${answerAlt}", the answer would be "yes", since it was originally ${allPotentialLocationsForItem[i]}.`,
                        ),
                    });

                    if (whereWasItQuestion.done) {
                        throw new Error("Questioning agent finished without providing an answer for item original location check.");
                    }

                    console.log("Received answer, " + whereWasItQuestion.value);

                    if (whereWasItQuestion.value.trim().toLowerCase() === "yes") {
                        answerForLocationIndexes.push(i);
                    }
                }
            } else {
                // it must be only one location
                console.log(`Only one potential original location for item "${item}", assuming it is correct without asking.`);
                answerForLocationIndexes.push(0);
            }

            if (answerForLocationIndexes.length === 0) {
                console.log(`Could not determine original location for item "${item}", forcing them to be all the potential locations. This may cause some inconsistencies, but we have no other choice.`);
                answerForLocationIndexes = allPotentialLocationsForItem.map((_, index) => index);
            }
        }


        /**
         * @type {Array<Array<Array<string | number>>>}
         */
        let endsAtPath = [];
        /**
         * @type {number[]}
         */
        let endsAtAmount = [];

        let wasStolen = false;
        /**
         * @type {string|null}
         */
        let wasStolenBy = null;

        /**
         * @type {string[]}
         */
        let witnesses = [];
        /**
         * @type {string[]}
         */
        let ignorers = [];
        /**
         * @type {string[]}
         */
        let witnessesThatIgnoredTheft = [];
        /**
         * @type {string[]}
         */
        let witnessesThatTurnHeroes = [];

        /**
         * @type {string[]}
         */
        let charactersThatHoppedInsideTheItem = [];
        /**
         * @type {string[]}
         */
        let charactersThatClimbedAtopTheItem = [];
        /**
         * @type {string[]}
         */
        let charactersThatClimbetAtopTheItemPostures = [];

        if (wasMoved) {
            console.log(`Item "${item}" was moved or had its location changed`);

            const baseAmountMovedQuestion = `By the end of the last message, how many of "${item}" were moved or had their location changed? Answer with a number, or if the amount is not clear, answer with one of the following: "a few", "several", "many", "a lot", "some", "half", "most", or "all".`;
            const amountGrammar = `root ::= ([0-9]+ | "a few" | "several" | "many" | "a lot" | "some" | "half" | "most" | "all" | "none") ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}`;
            console.log("Asking question, " + baseAmountMovedQuestion);
            const baseAmountMovedAnswer = await interactionGenerator.next({
                maxCharacters: 100,
                maxParagraphs: 1,
                nextQuestion: baseAmountMovedQuestion,
                contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "Alice picked up ${item} and put it in her backpack", the answer would be "1", since only one of the item was moved.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "Bob moved a couple of ${item} on the table to the box", the answer would be "some" or "several", since only some of the item was moved.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "Emma took a few of the ${item} and gave them to Alice", the answer would be "a few", since only a few of the item were moved.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "Joe moved most of the ${item} from the table to the box, but left some on the table", the answer would be "most", since most of the item was moved.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "Alice moved 10 of ${item} from the box to the shelf", the answer would be "10", since only 10 of the item were moved.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "Bob moved two of ${item} from the ground to the table and two of ${item} from the table to the box", the answer would be "4", since a total of 4 of the item were moved.`,
                ),
                stopAfter: [],
                stopAt: [],
                grammar: amountGrammar,
            });

            if (baseAmountMovedAnswer.done) {
                throw new Error("Questioning agent finished without providing an answer for base amount of item moved check.");
            }

            console.log("Received answer, " + baseAmountMovedAnswer.value);
            const baseAmountMovedStr = baseAmountMovedAnswer.value.trim().toLowerCase();
            if (baseAmountMovedStr === "none" || baseAmountMovedStr === "0") {
                console.log(`The answer for the amount of "${item}" that was moved or had its location changed is none or 0, which seems to be a contradiction with the previous answer that indicated that the item was moved. This may indicate a false positive in the initial movement question, or it may indicate that the item was moved but then moved back to its original location by the end of the message. Skipping further checks for this item due to this inconsistency.`);
                continue;
            }

            await calculatePotentialOriginalLocationOfItem();

            const baseAmountMoved = convertItemAmountToNumericValue(baseAmountMovedStr, allPotentialItemsForItem.filter((v, index) => answerForLocationIndexes.includes(index)).flat());
            console.log("###Total amount of item moved or had its location changed: ", baseAmountMoved);

            let totalMovedSoFar = 0;

            for (const otherItem of itemsInteractedWith) {
                let isAnother = otherItem === item;

                const otherItemPotentialLocations = calculateAllPotentialLocationsForItem(engine, charState, allCharactersAtLocation, charactersToQuestion, location, otherItem);

                if (otherItem === item) {
                    const thereIsOnlyOne = otherItemPotentialLocations.allPotentialItemsForItem.length === 1 &&
                        otherItemPotentialLocations.allPotentialItemsForItem[0].length === 1 &&
                        otherItemPotentialLocations.allPotentialItemsForItem[0][0].amount === 1;
                    if (thereIsOnlyOne) {
                        continue;
                    }
                }

                let isAmbiguouslyContained = false;
                let isAmbiguouslyAtop = false;

                let ambiguousAmountAtop = 0;
                let ambiguousAmountContained = 0;

                let ambiguousAmountTotal = 0;

                const canContain = otherItemPotentialLocations.allPotentialItemsForItem.some((itemList) => itemList.some((itemInstance) => itemInstance.capacityKg && itemInstance.capacityKg > 0));

                let ambiguousPlacementContainedValue = "no";
                if (canContain) {
                    const nextQuestion = `By the end of the last message, was the item "${item}" placed inside ${isAnother ? "another " : "the item "}"${otherItem}"? As a container, ${item} must have been placed inside the item "${otherItem}", not the opposite. Answer "yes" ONLY if ${item} was PUT INTO or PLACED INSIDE ${otherItem}.`;
                    console.log("Asking question, " + nextQuestion);
                    const ambiguousPlacement = await interactionGenerator.next({
                        maxCharacters: 100,
                        maxParagraphs: 1,
                        nextQuestion: nextQuestion,
                        useQuestionCache: true,
                        stopAfter: ["yes", "no"],
                        stopAt: [],
                        grammar: `root ::= ("yes" | "no") ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\n`,
                        contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                            `Example: If the last message said that "${item} was placed inside ${otherItem}", the answer would be "yes", since by the end of the message, ${item} is now inside ${otherItem}.`,
                        ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                            `Example: If the last message said that "${item} was left on top of ${otherItem}", the answer would be "no", since by the end of the message, ${item} is on top of ${otherItem}, not inside it.`,
                        ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                            `Example: If the last message said that "${item} was taken out from the inside of ${otherItem} and put on top of ${otherItem}", the answer would be "no", since by the end of the message, ${item} is on top of ${otherItem}.`,
                        ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                            `Example: If the last message said that "${otherItem} was placed inside ${item}", the answer would be "no", since ${otherItem} is the one that was placed inside ${item}.`,
                        ),
                    });

                    if (ambiguousPlacement.done) {
                        throw new Error("Questioning agent finished without providing an answer for item placement check.");
                    }

                    console.log("Received answer, " + ambiguousPlacement.value);
                    ambiguousPlacementContainedValue = ambiguousPlacement.value.trim().toLowerCase();
                }

                const nextQuestion2 = `By the end of the last message, was the item "${item}" on top of ${isAnother ? "another " : "the item "}"${otherItem}"? As a surface, ${item} must have been placed on top of ${isAnother ? "another " : "the item "}"${otherItem}", not the opposite. Answer "yes" ONLY if ${item} was PLACED ON TOP of ${otherItem}.`;
                console.log("Asking question, " + nextQuestion2);
                const ambiguousPlacement2 = await interactionGenerator.next({
                    maxCharacters: 100,
                    maxParagraphs: 1,
                    nextQuestion: nextQuestion2,
                    useQuestionCache: true,
                    stopAfter: ["yes", "no"],
                    stopAt: [],
                    grammar: `root ::= ("yes" | "no") ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\n`,
                    contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                        `Example: If the last message said that "${item} was placed on top of ${otherItem}", the answer would be "yes", since by the end of the message, ${item} is now on top of ${otherItem}.`,
                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                        `Example: If the last message said that "${item} was placed next to ${otherItem}", the answer would be "no", since by the end of the message, ${item} is next to ${otherItem}, not on top of it.`,
                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                        `Example: If the last message said that "${otherItem} was placed on top of ${item}", the answer would be "no", since ${otherItem} is the one that was placed on top of ${item}.`,
                    ),
                });

                if (ambiguousPlacement2.done) {
                    throw new Error("Questioning agent finished without providing an answer for item placement check.");
                }

                console.log("Received answer, " + ambiguousPlacement2.value);

                isAmbiguouslyAtop = ambiguousPlacement2.value.trim().toLowerCase() === "yes";
                isAmbiguouslyContained = ambiguousPlacementContainedValue === "yes";

                if (isAmbiguouslyAtop || isAmbiguouslyContained) {
                    const nextQuestion = `By the end of the last message, how many of "${item}" are inside or atop of ${otherItem}? Answer with a number, or if the amount is not clear, answer with one of the following: "a few", "several", "many", "a lot", "some", "half", "most", "all", or "none".`;
                    const amountGrammar = `root ::= ([0-9]+ | "a few" | "several" | "many" | "a lot" | "some" | "half" | "most" | "all" | "none") ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}`;

                    console.log("Asking question, " + nextQuestion);

                    const possessionQuestion = await interactionGenerator.next({
                        maxCharacters: 100,
                        maxParagraphs: 1,
                        nextQuestion: nextQuestion,
                        stopAfter: [],
                        stopAt: [],
                        grammar: amountGrammar,
                    });

                    if (possessionQuestion.done) {
                        throw new Error("Questioning agent finished without providing an answer for item amount in possession check.");
                    }

                    console.log("Received answer, " + possessionQuestion.value);

                    const amountTransferred = possessionQuestion.value.trim().toLowerCase();
                    if (amountTransferred === "0" || amountTransferred === "none") {
                        console.log(`The answer for the amount of "${item}" that is inside or atop ${otherItem} is 0 or none, which seems to be a contradiction with the previous answer that indicated there is at least some amount of "${item}" inside or atop ${otherItem}. This may indicate a false positive in the initial placement question, or it may indicate that the item was moved but then removed from its new location by the end of the message. Skipping this relationship due to this inconsistency.`);
                        continue;
                    } else {
                        ambiguousAmountTotal = convertItemAmountToNumericValue(amountTransferred, allPotentialItemsForItem.filter((v, index) => answerForLocationIndexes.includes(index)).flat());
                    }

                    ambiguousAmountTotal = Math.min(ambiguousAmountTotal, baseAmountMoved - totalMovedSoFar);

                    let hasContainerAnywhere = false;
                    for (const otherItemList of otherItemPotentialLocations.allPotentialItemsForItem) {
                        for (const otherItemInstance of otherItemList) {
                            if (otherItemInstance.capacityKg && otherItemInstance.capacityKg > 0) {
                                hasContainerAnywhere = true;
                                break;
                            }
                            if (hasContainerAnywhere) break;
                        }
                        if (hasContainerAnywhere) break;
                    }
                    if (hasContainerAnywhere) {
                        const nextQuestion = `By the end of the last message, how many of "${item}" are inside of ${otherItem}? Answer with a number, or if the amount is not clear, answer with one of the following: "a few", "several", "many", "a lot", "some", "half", "most", or "all"; note that the ${item} must be INSIDE ${otherItem} to be counted for this question.`;

                        console.log("Asking question, " + nextQuestion);

                        const possessionQuestion = await interactionGenerator.next({
                            maxCharacters: 100,
                            maxParagraphs: 1,
                            nextQuestion: nextQuestion,
                            stopAfter: [],
                            stopAt: [],
                            contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                                `Example: If the last message said that "${item} was placed inside ${otherItem}", the answer would be "1"`,
                            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                `Example: If the last message said that "${item} was placed on top of ${otherItem}", the answer would be "0" or "none"`,
                            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                `Example: If the last message said that "${item} was placed on top of ${otherItem}, but some of the ${item} were also placed inside ${otherItem}", the answer would be "some"`,
                            ),
                            grammar: amountGrammar,
                        });

                        if (possessionQuestion.done) {
                            throw new Error("Questioning agent finished without providing an answer for item amount in possession check.");
                        }

                        console.log("Received answer, " + possessionQuestion.value);

                        const amountTransferred = possessionQuestion.value.trim().toLowerCase();
                        ambiguousAmountContained = convertItemAmountToNumericValue(amountTransferred, allPotentialItemsForItem.filter((v, index) => answerForLocationIndexes.includes(index)).flat());
                    }

                    ambiguousAmountAtop = ambiguousAmountTotal - ambiguousAmountContained;
                }

                console.log("### Concluded that at least " + ambiguousAmountAtop + " of item " + item + " is atop " + otherItem + " and at least " + ambiguousAmountContained + " of item " + item + " is inside " + otherItem + ", for a total of at least " + ambiguousAmountTotal + " of item " + item + " that is atop or inside " + otherItem);

                let totalMovedAmountForThisOtherItemAtop = 0;
                let totalMovedAmountForThisOtherItemContained = 0;

                if ((isAmbiguouslyAtop || isAmbiguouslyContained) && otherItemPotentialLocations.allPotentialLocationsForItem.length >= 2) {
                    for (let i = 0; i < otherItemPotentialLocations.allPotentialLocationsForItem.length; i++) {
                        const potentialLocation = otherItemPotentialLocations.allPotentialLocationsForItem[i];
                        let itemsInQuestion = otherItemPotentialLocations.allPotentialItemsForItem[i];
                        const hasContainer = itemsInQuestion.some((it) => it.capacityKg && it.capacityKg > 0);

                        if (hasContainer && totalMovedAmountForThisOtherItemContained < ambiguousAmountContained) {
                            const nextQuestion = `By the end of the last message, how many of "${item}" were placed inside ${isAnother ? "another " : "the item "}"${otherItem}" at the location ${potentialLocation}? As a container, ${item} must have been placed inside the item "${otherItem}", not the opposite.`;
                            console.log("Asking question, " + nextQuestion);
                            const placementQuestion2 = await interactionGenerator.next({
                                maxCharacters: 100,
                                maxParagraphs: 1,
                                nextQuestion: nextQuestion,
                                useQuestionCache: true,
                                stopAfter: [],
                                stopAt: [],
                                grammar: amountGrammar,
                                instructions: `The last message must specify that the ${item} was ${potentialLocation}, answer "none" or "0", if the location of ${item} is not clearly stated as ${potentialLocation}, otherwise answer with a number or "a few", "several", "many", "a lot", "some", "half", "most", or "all" if the location is clearly stated and there is a clear indication that at least some of the item was ${potentialLocation}.`,
                            });

                            if (placementQuestion2.done) {
                                throw new Error("Questioning agent finished without providing an answer for item placement check.");
                            }

                            console.log("Received answer, " + placementQuestion2.value);
                            const amountAtThisLocationStr = placementQuestion2.value.trim().toLowerCase();
                            if (amountAtThisLocationStr !== "0" && amountAtThisLocationStr !== "none") {
                                const amountAtThisLocation = convertItemAmountToNumericValue(amountAtThisLocationStr, allPotentialItemsForItem.filter((v, index) => answerForLocationIndexes.includes(index)).flat());
                                totalMovedAmountForThisOtherItemContained += amountAtThisLocation;
                                totalMovedAmountForThisOtherItemContained = Math.min(totalMovedAmountForThisOtherItemContained, ambiguousAmountContained);
                            }
                        }

                        if (totalMovedAmountForThisOtherItemAtop < ambiguousAmountAtop) {
                            const nextQuestion = `By the end of the last message, was the item "${item}" on top of ${isAnother ? "another " : "the item "}"${otherItem}" at the location ${potentialLocation}? As a surface, ${item} must have been placed on top of ${isAnother ? "another " : "the item "}"${otherItem}", not the opposite. Answer "yes" ONLY if ${item} was PLACED ON TOP of ${otherItem} and not inside it.`;
                            console.log("Asking question, " + nextQuestion);
                            const placementQuestion2 = await interactionGenerator.next({
                                maxCharacters: 100,
                                maxParagraphs: 1,
                                nextQuestion: nextQuestion,
                                stopAfter: ["yes", "no"],
                                stopAt: [],
                                grammar: `root ::= ("yes" | "no") ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\n`,
                                instructions: `The last message must specify that the ${item} was ${potentialLocation}, answer "none" or "0", if the location of ${item} is not clearly stated as ${potentialLocation}, otherwise answer with a number or "a few", "several", "many", "a lot", "some", "half", "most", or "all" if the location is clearly stated and there is a clear indication that at least some of the item was ${potentialLocation}.`,
                            });

                            if (placementQuestion2.done) {
                                throw new Error("Questioning agent finished without providing an answer for item placement check.");
                            }

                            console.log("Received answer, " + placementQuestion2.value);
                            const amountAtThisLocationStr = placementQuestion2.value.trim().toLowerCase();
                            if (amountAtThisLocationStr !== "0" && amountAtThisLocationStr !== "none") {
                                const amountAtThisLocation = convertItemAmountToNumericValue(amountAtThisLocationStr, allPotentialItemsForItem.filter((v, index) => answerForLocationIndexes.includes(index)).flat());
                                totalMovedAmountForThisOtherItemAtop += amountAtThisLocation;
                                totalMovedAmountForThisOtherItemAtop = Math.min(totalMovedAmountForThisOtherItemAtop, ambiguousAmountAtop);

                                // TODO move these spec
                            }
                        }
                    }
                }

                if (totalMovedAmountForThisOtherItemAtop < ambiguousAmountAtop) {
                    // TODO move the remaining ambiguous amount of items atop to any of the other
                }
                if (totalMovedAmountForThisOtherItemContained < ambiguousAmountContained) {
                    // TODO move the remaining ambiguous amount of items contained to any of the other
                }
            }
        }

        continue; // TODO remove

        for (const charName of charactersToQuestion) {
            const nextQuestion = `By the end of the last message, is the item "${item}" in the possession of ${charName}?`;
            console.log("Asking question, " + nextQuestion);
            const anotherChar = charName === "${getCharacterNameForExample([charName], 0)}" ? "Fiona" : "${getCharacterNameForExample([charName], 0)}";
            const possessionQuestion = await interactionGenerator.next({
                maxCharacters: 100,
                maxParagraphs: 1,
                nextQuestion: nextQuestion,
                stopAfter: ["yes", "no"],
                stopAt: [],
                grammar: `root ::= ("yes" | "no") ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\n`,
                contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "${anotherChar} gave ${item} to ${charName}", the answer would be "yes", since by the end of the message, ${charName} has the item in their possession.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "${anotherChar} took ${item}", the answer would be "no", since by the end of the message, ${charName} does not have the item in their possession.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "${charName} carefully drops ${item} on the ground", the answer would be "no", since by the end of the message, ${charName} dropped the item and does not have it in their possession.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "${charName} picks up ${item} from ${anotherChar} and then throws it down the window", the answer would be "no", since by the end of the message, ${charName} threw the item away`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "${anotherChar} picks up ${item} and then gives it to ${charName}", the answer would be "yes", since by the end of the message, ${charName} has the item in their possession`,
                ),
            });
            if (possessionQuestion.done) {
                throw new Error("Questioning agent finished without providing an answer for item possession check.");
            }
            console.log("Received answer, " + possessionQuestion.value);

            // if yes, ask further questions
            if (possessionQuestion.value.trim().toLowerCase() === "yes") {
                const expectedPath = ["characters", charName, "carrying"];

                const nextQuestion = `By the end of the last message, how many of "${item}" are in possession by ${charName}? Answer with a number, or if the amount is not clear, answer with one of the following: "a few", "several", "many", "a lot", "some", "half", "most", or "all".`;
                const amountGrammar = `root ::= ([0-9]+ | "a few" | "several" | "many" | "a lot" | "some" | "half" | "most" | "all") ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}`;

                console.log("Asking question, " + nextQuestion);

                const possessionQuestion = await interactionGenerator.next({
                    maxCharacters: 100,
                    maxParagraphs: 1,
                    nextQuestion: nextQuestion,
                    stopAfter: [],
                    stopAt: [],
                    grammar: amountGrammar,
                });

                if (possessionQuestion.done) {
                    throw new Error("Questioning agent finished without providing an answer for item amount in possession check.");
                }

                const expectedAmount = possessionQuestion.value.trim().toLowerCase();

                console.log("Received answer, " + possessionQuestion.value);

                const hasAWornPotential = allPotentialItemsForItem.some((itemOptions) => itemOptions.some((it) => it.wearableProperties));
                if (hasAWornPotential) {
                    const nextQuestion = `By the end of the last message, is the item "${item}" being worn by ${charName}? Answer "yes" ONLY if ${item} was PUT ON or WORN by ${charName}. If ${item} was taken off, removed, or not put on, answer "no".`;
                    console.log("Asking question, " + nextQuestion);
                    const wornQuestion = await interactionGenerator.next({
                        maxCharacters: 100,
                        maxParagraphs: 1,
                        nextQuestion: nextQuestion,
                        stopAfter: ["yes", "no"],
                        stopAt: [],
                        grammar: `root ::= ("yes" | "no") ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\n`,
                        contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                            `Example: If the last message said that "${charName} put on ${item}", the answer would be "yes", since by the end of the message, ${charName} is wearing the item.`,
                        ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                            `Example: If the last message said that "${charName} took off ${item}", the answer would be "no", since by the end of the message, ${charName} is not wearing the item.`,
                        ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                            `Example: If the last message said that "${charName} is wearing ${item}", the answer would be "yes", since by the end of the message, ${charName} is wearing the item.`,
                        ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                            `Example: If the last message said that "${charName} has ${item} in their inventory but is not wearing it", the answer would be "no", since by the end of the message, ${charName} is not wearing the item.`,
                        ),
                    });

                    if (wornQuestion.done) {
                        throw new Error("Questioning agent finished without providing an answer for item worn check.");
                    }

                    console.log("Received answer, " + wornQuestion.value);

                    if (wornQuestion.value.trim().toLowerCase() === "yes") {
                        expectedPath[2] = "wearing";
                        const rewrite = calculateAllPotentialLocationsForItem(engine, charState, allCharactersAtLocation, charactersToQuestion, location, item, true);
                        allPotentialLocationsForItem = rewrite.allPotentialLocationsForItem;
                        allPotentialLocationTraversePath = rewrite.allPotentialLocationTraversePath;
                        allPotentialItemsForItem = rewrite.allPotentialItemsForItem;
                    }
                }

                endsAtPath.push([expectedPath]);
                endsAtAmount.push(expectedAmount);
            }
        }

        if (endsAtPath.length > 0) {
            const nextQuestionSteal = `By the last message, was the item "${item}" stolen? Answer "yes" ONLY if a character took the item without permission from its previous possessor. If the item was obtained through other means (like finding it, being given it, or moving it from one place to another without taking it from someone else), answer "no".`;
            console.log("Asking question, " + nextQuestionSteal);
            const stealQuestion = await interactionGenerator.next({
                maxCharacters: 100,
                maxParagraphs: 1,
                nextQuestion: nextQuestionSteal,
                stopAfter: ["yes", "no"],
                stopAt: [],
                grammar: `root ::= ("yes" | "no") ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\n`,
                contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "Alice took ${item} from Bob without asking", the answer would be "yes", since by the end of the message, Alice has stolen the item from Bob.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "Bob found ${item} on the ground and picked it up", the answer would be "no", since by the end of the message, Bob obtained the item by finding it, not stealing it from someone else.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "Charlie was given ${item} by Alice", the answer would be "no", since by the end of the message, Charlie obtained the item through being given it, not stealing it from someone else.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "Dave moved ${item} from the table to their backpack", the answer would be "no", since by the end of the message, Dave obtained the item by moving it, not stealing it from someone else.`,
                ),
            });

            if (stealQuestion.done) {
                throw new Error("Questioning agent finished without providing an answer for item steal check.");
            }

            console.log("Received answer, " + stealQuestion.value);

            if (stealQuestion.value.trim().toLowerCase() === "yes") {
                wasStolen = true;
            }

            if (wasStolen) {
                const nextQuestion = `By the last message, who stole the item "${item}"? Answer with the name of the character who stole it. If it's not clear who stole it, answer with "none".`;

                console.log("Asking question, " + nextQuestion);
                const stealByQuestion = await interactionGenerator.next({
                    maxCharacters: 100,
                    maxParagraphs: 1,
                    nextQuestion: nextQuestion,
                    stopAfter: charactersToQuestion.concat(["none"]),
                    stopAt: [],
                    grammar: `root ::= (${charactersToQuestion.map((char) => JSON.stringify(char)).join(" | ")} | "none") ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\n`,
                    contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                        `Example: If the last message said that "Alice took ${item} from Bob without asking", the answer would be "Alice", since Alice is the character who stole the item.`,
                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                        `Example: If the last message said that "Bob found ${item} on the ground and picked it up", the answer would be "none", since no character stole the item from someone else.`,
                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                        `Example: If the last message said that "Charlie stole ${item} from Bob and gave it to Alice", the answer would be "Charlie", since Charlie is the character who stole the item.`,
                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                        `Example: If the last message said that "Dave picked up ${item} without permission and placed it in his backpack", the answer would be "Dave", since Dave is the character who stole the item from its previous possessor.`,
                    ),
                    answerTrail: "The character who stole " + JSON.stringify(item) + " is: ",
                });

                if (stealByQuestion.done) {
                    throw new Error("Questioning agent finished without providing an answer for item steal by check.");
                }

                console.log("Received answer, " + stealByQuestion.value);
                if (stealByQuestion.value.trim().toLowerCase() !== "none") {
                    wasStolenBy = stealByQuestion.value.trim();

                    const nextQuestion = `By the last message, which characters could have witnessed the theft of "${item}"? Answer with the names of the characters who witnessed it, separated by commas. If it's not clear who witnessed it, answer with "none".`;
                    console.log("Asking question, " + nextQuestion);
                    const witnessesQuestion = await interactionGenerator.next({
                        maxCharacters: 100,
                        maxParagraphs: 1,
                        nextQuestion: nextQuestion,
                        stopAfter: [],
                        stopAt: [],
                        grammar: `root ::= ((charactername (", " charactername)*) | "none") ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\n`,
                        contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                            `Example: If the last message said that "Alice took ${item} from Bob without asking, and Charlie saw it happen", the answer would be "Charlie", since Charlie is the character who witnessed the theft.`,
                        ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                            `Example: If the last message said that "Bob found ${item} on the ground and picked it up, and no one else was around", the answer would be "none", since no character witnessed the theft (since there was no theft).`,
                        ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                            `Example: If the last message said that "Charlie stole ${item} from Bob, and Alice and Dave saw it happen", the answer would be "Alice, Dave", since Alice and Dave are the characters who witnessed the theft.`,
                        ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                            `Example: If the last message said that "Dave picked up ${item} without permission and placed it in his backpack, and Charlie was nearby but it's not clear if he saw it", the answer would be "none", since it's not clear if Charlie witnessed the theft.`,
                        ),
                        answerTrail: "The characters who witnessed the theft of " + JSON.stringify(item) + ": ",
                        instructions: "Use the previous messages to help you determine who witnessed the theft, making necessary assumptions with a bias towards assuming that if a character was nearby, they likely witnessed the theft, unless there is information suggesting otherwise. Remember that witnesses are characters who SAW the theft happen, so if it's not clear if they saw it, it's safer to assume they did not witness it to avoid false positives.",
                    });

                    if (witnessesQuestion.done) {
                        throw new Error("Questioning agent finished without providing an answer for item theft witnesses check.");
                    }

                    console.log("Received answer, " + witnessesQuestion.value);

                    if (witnessesQuestion.value.trim().toLowerCase() !== "none") {
                        witnesses = witnessesQuestion.value.split(",").map((w) => w.trim()).filter((w) => w != wasStolenBy);
                    }

                    const robberStealth = engine.deObject.characters[wasStolenBy].stealth || 0;

                    for (const charName of allCharactersAtLocation) {
                        // use heuristics
                        if (charName === wasStolenBy || witnesses.includes(charName)) {
                            continue;
                        }

                        const character = engine.deObject.characters[charName];
                        const perception = character.perception || 0;

                        const characterNoticed = Math.min((Math.random() * perception), perception / 2) > Math.min((Math.random() * robberStealth), robberStealth / 2);
                        if (characterNoticed) {
                            witnesses.push(charName);

                            const heroism = character.heroism || 0;
                            const characterDecidedToIgnore = Math.random() < heroism;
                            if (characterDecidedToIgnore) {
                                witnessesThatIgnoredTheft.push(charName);
                            } else {
                                witnessesThatTurnHeroes.push(charName);
                            }
                        } else {
                            ignorers.push(charName);
                        }
                    }
                }
            }
        }
    }

    process.exit(1); // TODO remove

    const hasContainer = allPotentialItemsForItem.some((itemOptions) => itemOptions.some((it) => it.capacityKg && it.capacityKg > 0));

    // by the end of the message has Y gotten inside x? [YESNO]
    for (const charName of charactersToQuestion) {
        if (!hasContainer) {
            continue;
        }
        const nextQuestion = `By the end of the last message, is ${charName} inside ${item}? Answer "yes" ONLY if ${charName} got inside ${item} by entering it, climbing into it, or being put into it. If ${charName} is near ${item} but not inside it, or if it's not clear if they are inside it, answer "no".`;
        console.log("Asking question, " + nextQuestion);
        const insideQuestion = await interactionGenerator.next({
            maxCharacters: 100,
            maxParagraphs: 1,
            nextQuestion: nextQuestion,
            stopAfter: ["yes", "no"],
            stopAt: [],
            grammar: `root ::= ("yes" | "no") ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\n`,
            contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                `Example: If the last message said that "${charName} climbed into ${item}", the answer would be "yes", since by the end of the message, ${charName} is inside ${item}.`,
            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                `Example: If the last message said that "${charName} is near ${item}", the answer would be "no", since by the end of the message, ${charName} is not inside ${item}.`,
            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                `Example: If the last message said that "${charName} was put inside ${item} by Alice", the answer would be "yes", since by the end of the message, ${charName} is inside ${item}.`,
            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                `Example: If the last message said that "${charName} is on top of ${item}", the answer would be "no", since by the end of the message, ${charName} is not inside ${item}.`,
            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                `Example: If the last message said that "${charName} entered ${item}", the answer would be "yes", since by the end of the message, ${charName} is inside ${item}.`,
            ),
        });
        if (insideQuestion.done) {
            throw new Error("Questioning agent finished without providing an answer for character inside item check.");
        }
        console.log("Received answer, " + insideQuestion.value);

        if (insideQuestion.value.trim().toLowerCase() === "yes") {
            charactersThatHoppedInsideTheItem.push(charName);
        }
    }

    // by the end of the message has Y sat, stood, or laid on x? [YESNO]
    for (const charName of charactersToQuestion) {
        if (charactersThatHoppedInsideTheItem.includes(charName)) {
            continue;
        }

        const nextQuestion = `By the end of the last message, is ${charName} on top of ${item} (sitting, standing, or laying on it, or any other position atop)? Answer "yes" ONLY if ${charName} got on top of ${item} by sitting, standing, laying on it, or being placed on top of it. If ${charName} is near ${item} but not on top of it, or if it's not clear if they are on top of it, answer "no".`;
        console.log("Asking question, " + nextQuestion);
        const atopQuestion = await interactionGenerator.next({
            maxCharacters: 100,
            maxParagraphs: 1,
            nextQuestion: nextQuestion,
            stopAfter: ["yes", "no"],
            stopAt: [],
            grammar: `root ::= ("yes" | "no") ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\n`,
            contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                `Example: If the last message said that "${charName} is sitting on top of ${item}", the answer would be "yes", since by the end of the message, ${charName} is on top of ${item}.`,
            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                `Example: If the last message said that "${charName} is near ${item}", the answer would be "no", since by the end of the message, ${charName} is not on top of ${item}.`,
            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                `Example: If the last message said that "${charName} was placed on top of ${item} by Alice", the answer would be "yes", since by the end of the message, ${charName} is on top of ${item}.`,
            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                `Example: If the last message said that "${charName} is inside ${item}", the answer would be "no", since by the end of the message, ${charName} is not on top of ${item}.`,
            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                `Example: If the last message said that "${charName} stood on top of ${item}", the answer would be "yes", since by the end of the message, ${charName} is on top of ${item}.`,
            ),
        });

        if (atopQuestion.done) {
            throw new Error("Questioning agent finished without providing an answer for character atop item check.");
        }

        console.log("Received answer, " + atopQuestion.value);
        if (atopQuestion.value.trim().toLowerCase() === "yes") {
            charactersThatClimbedAtopTheItem.push(charName);
        }
    }

    if (charactersThatHoppedInsideTheItem.length > 0 || charactersThatClimbedAtopTheItem.length > 0) {
        charactersWithAnEstablishedLocation.push(...charactersThatHoppedInsideTheItem);
        charactersWithAnEstablishedLocation.push(...charactersThatClimbedAtopTheItem);
    }

    if (
        endsAtPath.length > 0 ||
        charactersThatHoppedInsideTheItem.length > 0 ||
        charactersThatClimbedAtopTheItem.length > 0
    ) {
        await calculatePotentialOriginalLocationOfItem();

        console.log(endsAtPath);

        if (endsAtPath.length > 0) {
            let locationsToTransferFromIndexesLeft = answerForLocationIndexes;

            for (let i = 0; i < endsAtPath.length; i++) {
                const path = endsAtPath[i];
                const amountTransferred = endsAtAmount[i];

                let transferredAmount = 0;

                // this is just to figure out how much we actually transfer numerically speaking
                const allItemsThatCouldBeTransferred = answerForLocationIndexes.map((index) => allPotentialItemsForItem[index] || []).flat();
                if (allItemsThatCouldBeTransferred.length === 0) {
                    console.log("No items that could be transferred for item ", item, " at path ", path, " because the potential source locations did not have any items that could be transferred. Skipping transfer for this path.");
                    continue;
                }
                let actualAmountToTransfer = convertItemAmountToNumericValue(amountTransferred, allItemsThatCouldBeTransferred);

                if (locationsToTransferFromIndexesLeft.length === 0) {
                    console.log("No more locations left to transfer from for item ", item, " at path ", path, " even though there is still an amount left to transfer, attempting now to use any location left");
                    locationsToTransferFromIndexesLeft = allPotentialItemsForItem.map((v, index) => v.length > 0 ? index : null).filter((index) => index !== null);
                }

                let storyMasterMessageForThisTransfer = "";
                while (transferredAmount < actualAmountToTransfer && locationsToTransferFromIndexesLeft.length > 0) {
                    // pick one of the potential locations at random

                    // note that there are multiple paths for even for this, the first layer are basically items that have the same
                    // description, for example, if a character has two bags, each bag has two balls, and there is a bag on the table with two bags too; and the character says
                    // "Alice took two balls", then we know that the two balls came from the bags they have on themselves or the bag on the table, but we don't know which bag they came from
                    // the first layer would be "on the table, inside the bag", and "carried by Alice, inside the bag"
                    // and then the second layer would be the balls and their respective location paths

                    // so first we pick one of the potential locations at random, for example "carried by Alice, inside the bag"
                    const randomIndex = Math.floor(Math.random() * locationsToTransferFromIndexesLeft.length);
                    const randomLocationIndex = locationsToTransferFromIndexesLeft[randomIndex];

                    // now we do a second loop again
                    while (transferredAmount < actualAmountToTransfer && allPotentialItemsForItem[randomLocationIndex].length > 0) {
                        // we pick one of the items at that location at random, for example "ball"
                        const randomItemIndex = Math.floor(Math.random() * allPotentialItemsForItem[randomLocationIndex].length);
                        const itemToTransfer = allPotentialItemsForItem[randomLocationIndex][randomItemIndex];

                        const amountToTransferForThisItemSpecifically = Math.min(itemToTransfer.amount, actualAmountToTransfer - transferredAmount);

                        // now we pick the make the story master message so far
                        if (storyMasterMessageForThisTransfer) {
                            storyMasterMessageForThisTransfer += "\n\n";
                        }

                        // storyMasterMessageForThisTransfer += `${endsInPosessionOf} obtained ${amountToTransferForThisItemSpecifically} of ${itemToTransfer.name} originally ${locationPathToMessage(locationPathsLeft[randomItemIndex])}.`;

                        storyMasterMessageForThisTransfer += transferItems(
                            engine,
                            charState.location,
                            itemToTransfer,
                            allPotentialLocationTraversePath[randomLocationIndex][randomItemIndex],
                            path,
                            amountToTransferForThisItemSpecifically,
                        );

                        transferredAmount += amountToTransferForThisItemSpecifically;

                        if (itemToTransfer.amount === 0) {
                            // if we transferred all of that item, we remove it from the itemsAtLocationLeft, so we don't pick it again
                            allPotentialItemsForItem[randomLocationIndex].splice(randomItemIndex, 1);
                            allPotentialLocationTraversePath[randomLocationIndex].splice(randomItemIndex, 1);
                            if (allPotentialItemsForItem[randomLocationIndex].length === 0) {
                                // cannot just remove it because that just causes the indexes to shift and messes up the indexing, so we just set it to an empty array and then filter it out when we pick random locations
                                // allPotentialItemsForItem.splice(randomLocationIndex, 1);
                                // allPotentialLocationTraversePath.splice(randomLocationIndex, 1);

                                // now we remove that index from locationsToTransferFromIndexesLeft, so we don't pick the same location again
                                locationsToTransferFromIndexesLeft = locationsToTransferFromIndexesLeft.filter((index) => index !== randomLocationIndex);
                            }
                        }
                    }

                    if (wasStolen) {
                        storyMasterMessageForThisTransfer += `These items were stolen by ${wasStolenBy}`;
                        if (witnesses.length <= 0) {
                            storyMasterMessageForThisTransfer += " with no witnesses, so none noticed the theft.";
                        } else {
                            storyMasterMessageForThisTransfer += ` and this was witnessed by ${witnesses.join(", ")}`;
                            if (ignorers.length > 0) {
                                storyMasterMessageForThisTransfer += `, while ${ignorers.join(", ")} were nearby but did not notice the theft`;
                            }
                            if (witnessesThatIgnoredTheft.length > 0) {
                                storyMasterMessageForThisTransfer += `. Out of the witnesses, ${witnessesThatIgnoredTheft.join(", ")} decided to ignore the theft and not intervene`;
                            }
                            if (witnessesThatTurnHeroes.length > 0) {
                                storyMasterMessageForThisTransfer += `. Out of the witnesses, ${witnessesThatTurnHeroes.join(", ")} have decided to call out the thief and intervene`;
                            }
                        }
                    }
                }

                if (charactersThatHoppedInsideTheItem.length > 0) {
                    if (storyMasterMessageForThisTransfer) {
                        storyMasterMessageForThisTransfer += "\n\n";
                    }
                    storyMasterMessageForThisTransfer += `${charactersThatHoppedInsideTheItem.join(", ")} ${charactersThatHoppedInsideTheItem.length > 1 ? "are" : "is"} now inside of ${item}.`;
                }

                if (charactersThatClimbedAtopTheItem.length > 0) {
                    if (storyMasterMessageForThisTransfer) {
                        storyMasterMessageForThisTransfer += "\n\n";
                    }
                    for (let i = 0; i < charactersThatClimbedAtopTheItem.length; i++) {
                        const posture = charactersThatClimbetAtopTheItemPostures[i];
                        storyMasterMessageForThisTransfer += `${charactersThatClimbedAtopTheItem[i]} is now ${posture} on top of ${item}.`;
                    }
                }

                storyMasterMessages.push(storyMasterMessageForThisTransfer);
            }
        }
    }
}

// for (const charName of charactersToQuestion) {
//     for (const charName of charactersToQuestion) {
//         if (charactersWithAnEstablishedLocation.includes(charName)) {
//             continue;
//         }

//         const charState = engine.deObject.stateFor[charName];
//         if (charState.insideItem) {
//             const nextQuestion = `By the end of the last message, did ${charName} get out of ${charState.insideItem} (the item they were inside)? Answer "yes" ONLY if ${charName} got out of ${charState.insideItem} by exiting it, climbing out of it, or being taken out of it. If ${charName} is still inside ${charState.insideItem}, or if it's not clear if they got out of it, answer "no".`;
//             console.log("Asking question, " + nextQuestion);
//             const outsideQuestion = await interactionGenerator.next({
//                 maxCharacters: 100,
//                 maxParagraphs: 1,
//                 nextQuestion: nextQuestion,
//                 stopAfter: ["yes", "no"],
//                 stopAt: [],
//                 grammar: `root ::= ("yes" | "no") ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\n`,
//                 contextInfo: engine.inferenceAdapter.buildContextInfoExample(
//                     `Example: If the last message said that "${charName} climbed out of ${charState.insideItem}", the answer would be "yes", since by the end of the message, ${charName} is no longer inside ${charState.insideItem}.`,
//                 ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
//                     `Example: If the last message said that "${charName} is still inside ${charState.insideItem}", the answer would be "no", since by the end of the message, ${charName} is still inside ${charState.insideItem}.`,
//                 ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
//                     `Example: If the last message said that "${charName} was taken out of ${charState.insideItem} by Alice", the answer would be "yes", since by the end of the message, ${charName} is no longer inside ${charState.insideItem}.`,
//                 ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
//                     `Example: If the last message said that "${charName} exited ${charState.insideItem}", the answer would be "yes", since by the end of the message, ${charName} is no longer inside ${charState.insideItem}.`,
//                 ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
//                     `Example: If the last message said that "${charName} is on top of ${charState.insideItem}", the answer would be "no", since by the end of the message, ${charName} is not inside ${charState.insideItem}.`,
//                 ),
//             });

//             if (outsideQuestion.done) {
//                 throw new Error("Questioning agent finished without providing an answer for character outside item check.");
//             }
//             console.log("Received answer, " + outsideQuestion.value);
//             if (outsideQuestion.value.trim().toLowerCase() === "yes") {
//                 // find the actual item they are inside of
//                 // TODO up
//             }
//         } else if (charState.atopItem) {
//             const nextQuestion = `By the end of the last message, did ${charName} get off of ${charState.atopItem} (the item they were ${charState.posture} on)? Answer "yes" ONLY if ${charName} got off of ${charState.atopItem} by standing up from it, getting down from it to the ground, or being taken off of it. If ${charName} is still on top of ${charState.atopItem}, or if it's not clear if they got off of it, answer "no".`;
//             console.log("Asking question, " + nextQuestion);
//             const offQuestion = await interactionGenerator.next({
//                 maxCharacters: 100,
//                 maxParagraphs: 1,
//                 nextQuestion: nextQuestion,
//                 stopAfter: ["yes", "no"],
//                 stopAt: [],
//                 grammar: `root ::= ("yes" | "no") ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\n`,
//                 contextInfo: engine.inferenceAdapter.buildContextInfoExample(
//                     `Example: If the last message said that "${charName} stood up from ${charState.atopItem}", the answer would be "yes", since by the end of the message, ${charName} is no longer on top of ${charState.atopItem}.`,
//                 ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
//                     `Example: If the last message said that "${charName} is still ${charState.posture} on ${charState.atopItem}", the answer would be "no", since by the end of the message, ${charName} is still on top of ${charState.atopItem}.`,
//                 ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
//                     `Example: If the last message said that "${charName} was taken off of ${charState.atopItem} by Alice", the answer would be "yes", since by the end of the message, ${charName} is no longer on top of ${charState.atopItem}.`,
//                 ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
//                     `Example: If the last message said that "${charName} got down from ${charState.atopItem} to the ground", the answer would be "yes", since by the end of the message, ${charName} is no longer on top of ${charState.atopItem}.`,
//                 ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
//                     `Example: If the last message said that "${charName} changes positions slightly", the answer would be "no", since by the end of the message, ${charName} is still on ${charState.atopItem}.`,
//                 ),
//             });

//             if (offQuestion.done) {
//                 throw new Error("Questioning agent finished without providing an answer for character off item check.");
//             }
//             console.log("Received answer, " + offQuestion.value);
//             if (offQuestion.value.trim().toLowerCase() === "yes") {
//                 // find the actual item they are atop of
//                 // TODO update state to reflect that charName is no longer atop the item
//             }
//         }
//     }

//     for (const otherCharName of charactersToQuestion) {
//         if (charName === otherCharName) {
//             continue;
//         }

//         if (charactersWithAnEstablishedLocation.includes(otherCharName)) {
//             continue;
//         }

//         const characterState = engine.deObject.stateFor[charName];
//         if (characterState.carryingCharacters.includes(otherCharName)) {
//             // already known to be carrying no need to ask, since no update can be made
//             continue;
//         }

//         const nextQuestion = `By the end of the last message, is ${charName} carrying ${otherCharName}? By carrying, we mean that ${charName} is holding, lifting, or supporting ${otherCharName} in a way that they are moving together. Answer "yes" ONLY if ${charName} is carrying ${otherCharName}. If ${charName} is near ${otherCharName} but not carrying them, or if it's not clear if they are carrying them, answer "no".`;
//         console.log("Asking question, " + nextQuestion);

//         const carryingQuestion = await interactionGenerator.next({
//             maxCharacters: 100,
//             maxParagraphs: 1,
//             nextQuestion: nextQuestion,
//             stopAfter: ["yes", "no"],
//             stopAt: [],
//             grammar: `root ::= ("yes" | "no") ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\n`,
//             contextInfo: engine.inferenceAdapter.buildContextInfoExample(
//                 `Example: If the last message said that "${charName} is carrying ${otherCharName}", the answer would be "yes", since by the end of the message, ${charName} is carrying ${otherCharName}.`,
//             ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
//                 `Example: If the last message said that "${charName} is near ${otherCharName}", the answer would be "no", since by the end of the message, ${charName} is not carrying ${otherCharName}.`,
//             ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
//                 `Example: If the last message said that "${charName} picked up ${otherCharName}", the answer would be "yes", since by the end of the message, ${charName} is carrying ${otherCharName}.`,
//             ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
//                 `Example: If the last message said that "${charName} is holds and lifts ${otherCharName} and puts them on the ground", the answer would be "no", since by the end of the message, ${charName} is not carrying ${otherCharName}.`,
//             ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
//                 `Example: If the last message said that "${otherCharName} gets on top of ${charName} and walking", the answer would be "yes", since by the end of the message, ${charName} is carrying ${otherCharName}.`,
//             ),
//         });

//         if (carryingQuestion.done) {
//             throw new Error("Questioning agent finished without providing an answer for character carrying character check.");
//         }

//         console.log("Received answer, " + carryingQuestion.value);
//         if (carryingQuestion.value.trim().toLowerCase() === "yes") {
//             charactersWithAnEstablishedLocation.push(otherCharName);
//             // TODO update the state to reflect that charName is now carrying otherCharName, and also update the location of otherCharName to be the same as charName, since if charName is carrying otherCharName, they must be in the same location
//         }
//     }
// }


/**
 * 
 * @param {DEngine} engine
 * @param {DEStateForDescriptionWithHistory} charState
 * @param {string[]} allCharactersAtLocation
 * @param {string[]} charactersToQuestion 
 * @param {DELocationDefinition} location 
 * @param {string} item
 * @param {boolean} [wearableOnly] whether to only consider wearable items, this is used for example when we are trying to figure out if an item is being worn by a character, as the LLM may refer to the item in a different way than how it is named in the world state, for example it may say "hat" instead of "red hat", so we want to ignore case and also check if the item name includes the name we are looking for instead of checking for an exact match, this is just to increase the chances of finding the item and thus accepting feasible changes even if they are not perfectly formatted
 * @returns 
 */
function calculateAllPotentialLocationsForItem(engine, charState, allCharactersAtLocation, charactersToQuestion, location, item, wearableOnly = false) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    /**
         * @type {string[]}
         */
    const allPotentialLocationsForItem = [];
    /**
     * @type {Array<Array<Array<string|number>>>}
     */
    const allPotentialLocationTraversePath = [];
    /**
     * @type {DEItem[][]}
     */
    const allItems = [];

    /**
             * @param {DEItem[]} itemList 
             * @param {string} locationDesc
             * @param {Array<string|number>} travpath
             */
    const processItemInList = (itemList, locationDesc, travpath) => {
        const listHasIt = itemList.findIndex(itemInList => {
            if (wearableOnly) {
                return itemInList.name.toLowerCase().includes(item.toLowerCase()) && itemInList.wearableProperties;
            } else {
                return itemInList.name.toLowerCase() === item.toLowerCase();
            }
        });

        if (listHasIt !== -1) {
            const descriptionToAdd = locationDesc;
            const foundIndex = allPotentialLocationsForItem.findIndex(loc => loc === descriptionToAdd);
            if (foundIndex === -1) {
                allPotentialLocationsForItem.push(descriptionToAdd);
                allPotentialLocationTraversePath.push([[...travpath, listHasIt]]);
                allItems.push([itemList[listHasIt]]);
            } else {
                allPotentialLocationTraversePath[foundIndex].push([...travpath, listHasIt]);
                allItems[foundIndex].push(itemList[listHasIt]);
            }
        } else {
            for (let i = 0; i < itemList.length; i++) {
                const itemInList = itemList[i];
                if (itemInList.containing && itemInList.containing.length > 0) {
                    processItemInList(itemInList.containing, `inside ${itemInList.name}, ${locationDesc}`, [...travpath, i, "containing"]);
                } else if (itemInList.ontop && itemInList.ontop.length > 0) {
                    processItemInList(itemInList.ontop, `on top of ${itemInList.name}, ${locationDesc}`, [...travpath, i, "ontop"]);
                }
            }
        }
    }

    for (const charName of charactersToQuestion) {
        const characterState = engine.deObject.stateFor[charName];
        processItemInList(characterState.carrying, "carried by " + charName, ["characters", charName, "carrying"]);
        processItemInList(characterState.wearing, "worn by " + charName, ["characters", charName, "wearing"]);
    }

    // cheap way to have the local slot before the other slots
    for (const [slotName, slot] of Object.entries(location.slots)) {
        if (slotName === charState.locationSlot) {
            processItemInList(slot.items, `in ${slotName}`, ["slots", slotName, "items"]);
        }
    }

    for (const [slotName, slot] of Object.entries(location.slots)) {
        if (slotName !== charState.locationSlot) {
            processItemInList(slot.items, `in ${slotName}`, ["slots", slotName, "items"]);
        }
    }

    if (allPotentialLocationsForItem.length === 0) {
        for (const charName of allCharactersAtLocation) {
            const characterState = engine.deObject.stateFor[charName];
            processItemInList(characterState.carrying, "carried by " + charName, ["characters", charName, "carrying"]);
            processItemInList(characterState.wearing, "worn by " + charName, ["characters", charName, "wearing"]);
        }
    }

    return { allPotentialLocationsForItem, allPotentialLocationTraversePath, allPotentialItemsForItem: allItems };
}

/**
 * @param {string} text 
 * @param {DEItem[]} allPotentialItems
 */
function convertItemAmountToNumericValue(text, allPotentialItems) {
    let amount = 1;

    let maxOnOneItem = 0;
    let sum = 0;
    for (const itemOption of allPotentialItems) {
        const itemAmount = itemOption.amount || 1;
        maxOnOneItem = Math.max(maxOnOneItem, itemAmount);
        sum += itemAmount;
    }

    if (text === "none") {
        amount = 0;
    } else if (text.startsWith("a few ")) {
        amount = Math.max(3, sum / 3);
    } else if (text === "several") {
        amount = Math.max(3, sum / 2);
    } else if (text === "many") {
        amount = Math.max(3, sum / 2);
    } else if (text === "a lot") {
        amount = Math.floor(Math.max(5, sum / 1.5));
    } else if (text.startsWith("some")) {
        amount = Math.floor(Math.max(5, sum / 1.5));
    } else if (text.startsWith("half")) {
        amount = Math.ceil(sum / 2);
    } else if (text.startsWith("most")) {
        amount = Math.ceil(Math.max(5, sum * 0.75));
    } else if (text.startsWith("all of ")) {
        amount = sum;
    } else if (text.match(/^[0-9]+/)) {
        const numberMatch = text.match(/^([0-9]+)/);
        if (numberMatch) {
            amount = Math.min(parseInt(numberMatch[1]), sum);
        }
    }

    return amount;
}

/**
 * @param {DEngine} engine
 * @param {string} currentLocation
 * @param {Array<string | number>} locationPath 
 */
function locationPathToMessage(engine, currentLocation, locationPath) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    let base = "";
    /**
     * @type {*}
     */
    let elementToFollow = null;
    if (locationPath[0] === "characters") {
        base = `${locationPath[2] === "carrying" ? "carried" : "worn"} by ${locationPath[1]}`;
        // @ts-ignore
        elementToFollow = engine.deObject.stateFor[locationPath[1]][locationPath[2]];
    } else if (locationPath[0] === "slots") {
        base = `in ${locationPath[1]}`;
        elementToFollow = engine.deObject.world.locations[currentLocation].slots[locationPath[1]].items;
    }

    for (let i = 3; i < locationPath.length; i += 2) {
        const itemId = locationPath[i];
        const relation = locationPath[i + 1];
        if (relation === "containing") {
            base = `inside ${elementToFollow[itemId].name}, ${base}`;
        } else if (relation === "atop") {
            base = `on top of ${elementToFollow[itemId].name}, ${base}`;
        }
        elementToFollow = elementToFollow[itemId][relation];
    }

    return base;
}

/**
 * @param {DEngine} engine
 * @param {string} currentLocation
 * @param {DEItem} item 
 * @param {Array<string | number>} fromLocationPath 
 * @param {Array<Array<string | number>>} toPotentialLocationPaths 
 * @param {number} amount 
 */
function transferItems(engine, currentLocation, item, fromLocationPath, toPotentialLocationPaths, amount) {
    console.log(fromLocationPath, toPotentialLocationPaths);
    console.log(`>>>>>>>> Transferring ${amount} of ${item.name} obtained ${locationPathToMessage(engine, currentLocation, fromLocationPath)} to be ${toPotentialLocationPaths.map(path => locationPathToMessage(engine, currentLocation, path)).join(" OR ")}`);
    // TODO handle everything including if it overflows, falls down, etc...
    return "";
}