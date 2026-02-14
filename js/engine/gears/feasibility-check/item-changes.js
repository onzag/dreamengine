import { deepCopy, DEngine } from "../../index.js";

const nameOptionsBase = [
    "Bob",
    "Emma",
    "Joe",
    "Alice",
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
    const answer = await itemsInteractionGenerator.next({
        maxCharacters: 200,
        maxParagraphs: 1,
        nextQuestion: nextQuestion,
        stopAfter: [],
        stopAt: [],
        answerTrail: "The list of the items interacted with, including grabbing, taking, stealing, placing, is: ",
        grammar: `root ::= ("none" | itemList) ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\n` +
            `itemList ::= itemName (", " itemName)*\n` +
            `itemName ::= ${itemsAtLocationLower.map((item) => JSON.stringify(item)).join(" | ")}`,
    });

    if (answer.done) {
        throw new Error("Questioning agent finished without providing an answer for item changes check.");
    }

    console.log("Received answer, " + answer.value);

    await itemsInteractionGenerator.next(null); // end the generator

    const itemsInteractedWith = removeRepeatsInArray(answer.value.trim() === "none" ? [] : answer.value.split(",").map((v) => v.trim()));

    if (itemsInteractedWith.length === 0) {
        console.log("No items were interacted with, skipping item changes check.");
        // TODO reenable
        // return;
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

    for (const item of itemsInteractedWith) {
        const wasItMovedNextQuestion = `In the last message, did any character move, picked up, wear, carry, put on, or change the location of the item "${item}" itself? The item "${item}" must be the object being moved, not a container or surface that something else was taken from or placed on.`;

        console.log("Asking question, " + wasItMovedNextQuestion);

        const wasItMovedQuestion = await interactionGenerator.next({
            maxCharacters: 100,
            maxParagraphs: 1,
            nextQuestion: wasItMovedNextQuestion,
            stopAfter: ["yes", "no"],
            stopAt: [],
            grammar: `root ::= ("yes" | "no") ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\n`,
            contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                `Example: If the last message said that "Alice picked up ${item} and put it in her backpack", the answer would be "yes", since ${item} itself was picked up and moved.`,
            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                `Example: If the last message said that "Bob looked at ${item} on the table", the answer would be "no", since no movement or location change happened to the item.`,
            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                `Example: If the last message said that "Emma gave ${item} to Bob", the answer would be "yes", since the item was moved from Emma to Bob.`,
            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                `Example: If the last message said that "Joe kicked ${item} on an angry rampage", the answer would be "no", since no movement or location change happened to the item.`,
            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                `Example: If the last message said that "Alice grabbed a fork from the ${item}", the answer would be "no", since ${item} is the SOURCE the fork was taken from, but ${item} itself did not move or change location.`,
            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                `Example: If the last message said that "Bob placed the book on top of the ${item}", the answer would be "no", since ${item} is where the book was placed, but ${item} itself did not move.`,
            ),
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

        const allCharactersAtLocation = [...charState.surroundingNonStrangers, ...charState.surroundingTotalStrangers, character.name];
        let { allPotentialLocationsForItem, allPotentialLocationTraversePath, allPotentialItemsForItem } = calculateAllPotentialLocationsForItem(engine, charState, allCharactersAtLocation, charactersToQuestion, location, item);

        if (allPotentialLocationsForItem.length === 0) {
            console.log(`Error: Could not find any potential location for item "${item}", skipping further checks for this item.`);
            continue;
        }

        /**
         * @type {number[]}
         */
        let answerForLocationIndexes = [];
        const calculatePotentialLocationOfItem = async () => {
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
                    const nextQuestion = `For the item "${item}", according to the last message to analyze, before it was interacted with, was it originally located ${allPotentialLocationsForItem[i]}?`;
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
                            `Example: If the last message said that "Bob saw the item ${item} located ${allPotentialLocationsForItem[i]} and moved it to be ${answerAlt}", the answer would be "yes", since it was originally ${allPotentialLocationsForItem[i]}.`,
                        ),
                    });

                    if (whereWasItQuestion.done) {
                        throw new Error("Questioning agent finished without providing an answer for item original location check.");
                    }

                    console.log("Received answer, " + whereWasItQuestion.value);

                    if (whereWasItQuestion.value.trim().toLowerCase() === "yes") {
                        console.log(`Item "${item}" was partially or completely originally located ${allPotentialLocationsForItem[i]} according to the last message.`);
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
         * @type {string|null}
         */
        let endsInPosessionOf = null;
        let endsWornOfPosession = false;

        /**
         * @type {Array<Array<string | number>>|null}
         */
        let endsInsideOrAtopOfItemsPath = null;

        /**
         * @type {number | string}
         */
        let amountTransferred = 1;

        if (wasMoved) {
            console.log(`Item "${item}" was moved or had its location changed`);

            for (const otherItem of itemsInteractedWith) {
                if (otherItem === item) {
                    continue;
                }

                const otherItemPotentialLocations = calculateAllPotentialLocationsForItem(engine, charState, allCharactersAtLocation, charactersToQuestion, location, otherItem);

                for (let i = 0; i < otherItemPotentialLocations.allPotentialLocationsForItem.length; i++) {
                    const potentialLocation = otherItemPotentialLocations.allPotentialLocationsForItem[i];
                    const nextQuestion = `At the END of the last message, is "${item}" physically located INSIDE or ON TOP of "${otherItem}" (${potentialLocation})? Answer "yes" ONLY if ${item} was PUT INTO or PLACED ONTO ${otherItem}. Answer "no" if ${item} was TAKEN FROM, PICKED FROM, GRABBED FROM, or REMOVED FROM ${otherItem}.`;
                    console.log("Asking question, " + nextQuestion);
                    const placementQuestion = await interactionGenerator.next({
                        maxCharacters: 100,
                        maxParagraphs: 1,
                        nextQuestion: nextQuestion,
                        stopAfter: ["yes", "no"],
                        stopAt: [],
                        grammar: `root ::= ("yes" | "no") ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\n`,
                        contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                            `CRITICAL: "picks X from Y" means X is REMOVED from Y, so X is NOT inside Y at the end. "puts X in Y" means X is ADDED to Y, so X IS inside Y at the end.`,
                        ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                            `Example: "Alice picks ${item} from the ${otherItem}" -> Answer: NO. The ${item} was TAKEN OUT of ${otherItem}. At the end, ${item} is in Alice's hands, NOT in ${otherItem}.`,
                        ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                            `Example: "Bob grabs ${item} from ${otherItem}" -> Answer: NO. The ${item} was REMOVED from ${otherItem}. At the end, Bob has ${item}, NOT ${otherItem}.`,
                        ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                            `Example: "Charlie puts ${item} inside ${otherItem}" -> Answer: YES. The ${item} was PUT INTO ${otherItem}. At the end, ${item} is inside ${otherItem}.`,
                        ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                            `Example: "Diana places ${item} on top of ${otherItem}" -> Answer: YES. The ${item} was PLACED ON ${otherItem}. At the end, ${item} is on ${otherItem}.`,
                        ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                            `Example: "${item} was near ${otherItem}" -> Answer: NO. Being near is not the same as being inside or on top.`,
                        ),
                    });

                    if (placementQuestion.done) {
                        throw new Error("Questioning agent finished without providing an answer for item placement check.");
                    }

                    console.log("Received answer, " + placementQuestion.value);

                    if (placementQuestion.value.trim().toLowerCase() === "yes") {
                        let itemsInQuestion = otherItemPotentialLocations.allPotentialItemsForItem[i];
                        let finalPath = "atop";
                        const hasContainer = itemsInQuestion.some((it) => it.capacityKg && it.capacityKg > 0);
                        if (hasContainer) {
                            const nextQuestion = `By the end of the last message, was the item "${item}" placed inside the item "${otherItem}"? As a container, it must have been placed inside the item "${otherItem}"`;
                            console.log("Asking question, " + nextQuestion);
                            const placementQuestion2 = await interactionGenerator.next({
                                maxCharacters: 100,
                                maxParagraphs: 1,
                                nextQuestion: nextQuestion,
                                stopAfter: ["yes", "no"],
                                stopAt: [],
                                grammar: `root ::= ("yes" | "no") ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\n`,
                                contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                                    `Example: If the last message said that "${item} was placed inside ${otherItem}", the answer would be "yes", since by the end of the message, ${item} is now inside ${otherItem}.`,
                                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                    `Example: If the last message said that "${item} was left on top of ${otherItem}", the answer would be "no", since by the end of the message, ${item} is on top of ${otherItem}, not inside it.`,
                                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                    `Example: If the last message said that "${item} was taken out from the inside of ${otherItem} and put on top of ${otherItem}", the answer would be "no", since by the end of the message, ${item} is on top of ${otherItem}.`,
                                ),
                            });

                            if (placementQuestion2.done) {
                                throw new Error("Questioning agent finished without providing an answer for item placement check.");
                            }

                            console.log("Received answer, " + placementQuestion2.value);
                            if (placementQuestion2.value.trim().toLowerCase() === "yes") {
                                itemsInQuestion = itemsInQuestion.filter((it) => it.capacityKg && it.capacityKg > 0);
                                finalPath = "containing";
                            }
                        }

                        endsInsideOrAtopOfItemsPath = allPotentialLocationTraversePath[i].map((path) => [...path, finalPath]);

                        const nextQuestion = `By the end of the last message, how many of "${item}" are ${finalPath === "containing" ? "inside" : "atop of"} ${otherItem}? Answer with a number, or if the amount is not clear, answer with one of the following: "a few", "several", "many", "a lot", "some", "half", "most", or "all".`;
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

                        amountTransferred = possessionQuestion.value.trim().toLowerCase();

                        console.log("Received answer, " + possessionQuestion.value);

                        break;
                    }
                }
            }

            if (!endsInsideOrAtopOfItemsPath) {
                for (const charName of charactersToQuestion) {
                    const nextQuestion = `By the end of the last message, is the item "${item}" in the possession of ${charName}?`;
                    console.log("Asking question, " + nextQuestion);
                    const anotherChar = charName === "Alice" ? "Fiona" : "Alice";
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
                        endsInPosessionOf = charName;

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

                        amountTransferred = possessionQuestion.value.trim().toLowerCase();

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
                                endsWornOfPosession = true;
                                const rewrite = calculateAllPotentialLocationsForItem(engine, charState, allCharactersAtLocation, charactersToQuestion, location, item, true);
                                allPotentialLocationsForItem = rewrite.allPotentialLocationsForItem;
                                allPotentialLocationTraversePath = rewrite.allPotentialLocationTraversePath;
                                allPotentialItemsForItem = rewrite.allPotentialItemsForItem;
                            }
                        }

                        // TODO ask about stolen

                        break;
                    }
                }
            }

            // by the end of the message is x in possesion of Y (cannot be placed somewhere else) [YESNO]
            // did Y wear the item? [YESNO]
            // did Y steal the item? [YESNO]
            // figure out witnesses [LIST, cannot use charactersToQuestion for this, need to ask for witnesses among all characters at location, since the witness could be a character that was not mentioned in the message]
            // what amount of x? [NUMBER | a few | many | some | a lot | none]
            // No, by the end of the message has x been placed somewhere else by Y? [YESNO]
            // where exactly? atop or inside (ask per each) [YESNO]
            // what amount of x? [NUMBER | a few | many | some | a lot | none]

            // by the end of the message has Y gotten inside x? [YESNO]
            // by the end of the message has Y sat, stood, or laid on x? [YESNO]
        }

        for (const charName of charactersToQuestion) {
            // by the end of the message has char1 ended up carried by char2? [YESNO]
            // No, by the end of the message has char1 stopped being carried by char2? [YESNO]
        }


    }

    await interactionGenerator.next(null); // end the generator

    process.exit(1);
}

/**
 * 
 * @param {DEItem[] | null} itemList 
 * @param {string} itemName 
 * @param {boolean} [ignoreCase] whether to ignore case when comparing item names, this is used for example when we are trying to find the item in the location slots, as the LLM may refer to the item in a different way than how it is named in the world state, for example it may say "sword" instead of "rusty sword", so we want to ignore case and also check if the item name includes the name we are looking for instead of checking for an exact match, this is just to increase the chances of finding the item and thus accepting feasible changes even if they are not perfectly formatted
 * @returns {{sourceList: DEItem[], item: DEItem} | null}
 */
function itemListHasItem(itemList, itemName, ignoreCase = true) {
    if (!itemList || itemList.length === 0) {
        return null;
    }
    const lowerName = itemName.toLowerCase();
    const listHasIt = itemList.find(item => ignoreCase ? item.name.toLowerCase() === lowerName : item.name === itemName);
    if (listHasIt) {
        return { sourceList: itemList, item: listHasIt };
    }

    for (const item of itemList) {
        if (item.containing && item.containing.length > 0) {
            const result = itemListHasItem(item.containing, itemName, ignoreCase);
            if (result) {
                return result;
            }
            const result2 = itemListHasItem(item.ontop, itemName, ignoreCase);
            if (result2) {
                return result2;
            }
        }
    }

    return null;
}

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