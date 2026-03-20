import { DEngine } from "../index.js";
import { getBeingCarriedByCharacter, getCharacterExactLocation, getExternalDescriptionOfCharacter } from "../util/character-info.js";
import { getHistoryFragmentForCharacter } from "../util/messages.js";
import { getCharacterCarryingCapacity, getCharacterVolume, getCharacterWeight, getItemExcessElements, getItemVolume, getItemWeight, getWearableFitment, isAlreadyPlural, isSingularOfPlural, locationPathToMessage, locationPathToMessageWithoutItemName, resolvePath, utilItemCount } from "../util/weight-and-volume.js";
import { yesNoGrammar, isYes } from "../util/grammar.js";
import { getFullItemListAtLocation } from "../util/items.js";

/**
 * 
 * @param {string} string 
 * @returns {string}
 */
function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

const nameOptionsBase = [
    "Bob",
    "Emma",
    "Joe",
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
 * @param {DEngine} engine 
 * @param {DECompleteCharacterReference} character
 * @return {Promise<{
 *    storyMasterMessages: string[];
 *    charactersThatMoved: { [charName: string]: { reason: string; }}
 * }>}
 */
export default async function calculateItemChanges(engine, character) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    } else if (!engine.inferenceAdapter) {
        throw new Error("Inference adapter not set, cannot perform inference");
    } else if (!engine.userCharacter) {
        throw new Error("User character not set, cannot perform feasibility check for user");
    }

    // Step by step first we grab the character state that sent that last story fragment
    const charState = engine.deObject.stateFor[character.name];
    if (!charState) {
        throw new Error(`Character state for ${character.name} not found.`);
    }

    // get the item list at the location, if there are no items, skip the check since there can't be any item changes
    const itemsAtLocation = getFullItemListAtLocation(engine, charState.location);

    // we also get the location name for the character state location, since we will need it for the questioning agent context
    const location = engine.deObject.world.locations[charState.location];

    /**
     * @type {{ [charName: string]: { reason: string; } }}
     */
    const charactersThatMoved = {};

    const yesNoGrammarObject = yesNoGrammar(engine);

    /**
     * @type {string[]}
     */
    let itemsInteractedWith = [];

    const lastCycleExpanded = (await getHistoryFragmentForCharacter(engine, character, {
        includeDebugMessages: false,
        includeRejectedMessages: false,
        msgLimit: "LAST_CYCLE_EXPANDED",
    })).messages;

    const lastCycleMessages = (await getHistoryFragmentForCharacter(engine, character, {
        includeDebugMessages: false,
        includeRejectedMessages: false,
        msgLimit: "LAST_CYCLE",
    })).messages;

    // collect matched items with their first occurrence index so we can sort by mention order
    const lastCycleMessagesCombinedLowerCase = lastCycleMessages.map(m => m.message).join("\n\n").toLowerCase();
    const matchedItems = [];
    for (const item of itemsAtLocation) {
        const itemLowerCase = item.toLowerCase();
        const idx = lastCycleMessagesCombinedLowerCase.indexOf(itemLowerCase);
        if (idx !== -1) {
            matchedItems.push({ name: itemLowerCase, index: idx });
        }
    }
    matchedItems.sort((a, b) => a.index - b.index);
    itemsInteractedWith = matchedItems.map((m) => m.name);

    console.log("Pre check for item interactions based on keyword matching, items potentially interacted with: ", itemsInteractedWith);

    if (itemsAtLocation.length) {
        // now we want to know which items were interacted with in the last 
        // message, so we will ask the questioning agent to analyze the last story fragment and answer which items were interacted with, if any, based on the definition of interaction we give them, and only considering items that are at the location of the character state that sent the last story fragment
        // hopefully we will get a small list of items

        const systemPromptItemsInteracted = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(
            `You are an asistant and story analyst that checks for interactions with items in an story\n` +
            "You will be questioned to mention any of the items that were mentioned as being interacted in the last story fragment of a interactive story, and the interaction type (lifting, carrying, moving, using, manipulating, grabbing, etc.)\n",
            [
                `An interaction with an item is defined as lifting, carrying, moving, using, or manipulating the item in any way, giving, carrying, dropping, stealing, wearing, taking off, putting on, or any other form of direct physical interaction with the item. Just mentioning or describing the item without any of these interactions does not count as an interaction.`,
                "If an item is only mentioned or described but not interacted with, answer No, since no interaction happened",
                "People and other characters are not items, do not consider them for this question"
            ].filter((v) => v !== null), null);

        const itemsInteractionGenerator = engine.inferenceAdapter.runQuestioningCustomAgentOn(
            systemPromptItemsInteracted,
            null,
            lastCycleExpanded,
            null,
            true,
        );

        const ready = await itemsInteractionGenerator.next();
        if (ready.done) {
            throw new Error("Questioning agent could not be started properly for item changes check.");
        }

        for (const item of itemsAtLocation) {
            const itemLowerCase = item.toLowerCase();
            if (itemsInteractedWith.includes(itemLowerCase)) {
                continue;
            }

            /**
             * @type {string[]}
             */
            const foundDescriptions = []
            /**
             * 
             * @param {DEItem[]} itemList 
             */
            const processItemList = (itemList) => {
                for (const itemOfList of itemList) {
                    if (itemOfList.name === item) {
                        if (!foundDescriptions.includes(itemOfList.description)) {
                            foundDescriptions.push(itemOfList.description);
                        }
                    }
                    processItemList(itemOfList.containing);
                    processItemList(itemOfList.ontop);
                }
            }
            for (const locationSlotName in location.slots) {
                const locationSlot = location.slots[locationSlotName];
                processItemList(locationSlot.items);
            }
            // @ts-ignore
            const charactersAtLocation = Object.keys(engine.deObject.stateFor).filter(charName => engine.deObject.stateFor[charName].location === charState.location);
            for (const charName of charactersAtLocation) {
                const charState = engine.deObject.stateFor[charName];
                processItemList(charState.wearing);
                processItemList(charState.carrying);
            }

            const nextQuestion = `In the last story fragment, was the item "${item}" interacted with? Remember that interaction means lifting, carrying, moving, using, or manipulating the item in any way, giving, carrying, dropping, stealing, wearing, taking off, putting on, or any other form of direct physical interaction with the item. Just mentioning or describing the item without any of these interactions does not count as an interaction. Answer yes if "${item}" was interacted with, or no if it was not interacted with.`;
            console.log("Asking question, " + nextQuestion)
            const answer = await itemsInteractionGenerator.next({
                maxCharacters: 0,
                maxSafetyCharacters: 100,
                maxParagraphs: 1,
                nextQuestion: nextQuestion,
                contextInfo: engine.inferenceAdapter.buildContextInfoItemDescription(item, item + " is described as following", foundDescriptions).value,
                stopAfter: yesNoGrammarObject.stopAfter,
                stopAt: [],
                grammar: yesNoGrammarObject.grammar,
                answerTrail: `Regarding specifically the item ${item} being interacted with in the last story fragment, the answer is:\n\n`,
            });
            if (answer.done) {
                throw new Error("Questioning agent finished without providing an answer for item interaction check for item " + item);
            }
            console.log("Received answer, " + answer.value);
            if (isYes(answer.value)) {
                itemsInteractedWith.push(itemLowerCase);
                console.log(`The item "${item}" was identified as interacted with in the last story fragment, according to the questioning agent.`);
            } else {
                console.log(`The item "${item}" was not identified as interacted with in the last story fragment, according to the questioning agent.`);
            }
        }

        await itemsInteractionGenerator.next(null); // end the generator
    }

    /**
     * @type {string[]}
     */
    const charactersAtLocation = [];
    for (const charName in engine.deObject.stateFor) {
        const charState = engine.deObject.stateFor[charName];
        if (charState.location === charState.location) {
            charactersAtLocation.push(charName);
        }
    }

    const systemPromptCharactersInteracted = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(
        `You are an asistant and story analyst that checks for interactions among characters in a story\n` +
        "You will be questioned regarding the interaction of characters in a story",
        [
            `Keep in mind any mention of any character, direct or indirect, it counts as an interaction, including talking, looking at, thinking about, mentioning, etc.`,
            "Keep in mind descriptions of characters also count as mentions, for example if the message says 'Bob gave the book to the woman', figure out who the woman is based on the description and the context, and if it's a character, it counts as an interaction",
        ].filter((v) => v !== null), null);

    /**
     * @type {string[]}
     */
    let charactersToQuestion = [character.name];//charState.conversationId ? engine.deObject.conversations[charState.conversationId].participants : [];

    const charactersInteractionGenerator = engine.inferenceAdapter.runQuestioningCustomAgentOn(
        systemPromptCharactersInteracted,
        null,
        lastCycleExpanded,
        null,
        true, // remark last story fragment for analysis, so the agent can analyze it to figure out indirect mentions and descriptions
    );

    const readyCharacters = await charactersInteractionGenerator.next();
    if (readyCharacters.done) {
        throw new Error("Questioning agent could not be started properly for character interactions check.");
    }

    for (const charName of charactersAtLocation) {
        if (charactersToQuestion.includes(charName)) {
            continue;
        }

        const nextQuestion = `In the last story fragment, was the character "${charName}" mentioned or interacted with in any way (talked to, looked at, thought about, mentioned, described, etc.)? Answer yes if "${charName}" was mentioned or interacted with, or no if they were not.`;
        console.log("Asking question, " + nextQuestion);

        const charDescription = await getExternalDescriptionOfCharacter(engine, charName);
        const charDescriptionContextInfo = engine.inferenceAdapter.buildContextInfoCharacterDescription(
            engine.deObject.characters[charName],
            charDescription,
        );

        const answer = await charactersInteractionGenerator.next({
            maxCharacters: 0,
            maxSafetyCharacters: 100,
            maxParagraphs: 1,
            nextQuestion: nextQuestion,
            contextInfo: charDescriptionContextInfo.value,
            stopAfter: yesNoGrammarObject.stopAfter,
            stopAt: [],
            answerTrail: `Regarding specifically the character ${charName} being mentioned or interacted with in the last story fragment, the answer is:\n\n`,
            grammar: yesNoGrammarObject.grammar,
            instructions: "Use the character description at: " + charDescriptionContextInfo.characterDescriptionAt + " to figure out if the character was indirectly interacted with by a description",
        });
        console.log("Received answer, " + answer.value);

        if (answer.done) {
            throw new Error("Questioning agent finished without providing an answer for character interaction check for character " + charName);
        }

        if (isYes(answer.value)) {
            charactersToQuestion.push(charName);
            console.log(`The character "${charName}" was identified as mentioned or interacted with in the last story fragment, according to the questioning agent.`);
        } else {
            console.log(`The character "${charName}" was not identified as mentioned or interacted with in the last story fragment, according to the questioning agent.`);
        }
    }

    await charactersInteractionGenerator.next(null);

    console.log("Items interacted with: ", itemsInteractedWith);
    console.log("Characters to question: ", charactersToQuestion);

    const systemPrompt = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(
        `You are an asistant and story analyst that checks for interactions among characters and items in a story\n` +
        "You will be questioned about interactions among items and characters in the last story fragment of a interactive story",
        [
            "The responses should refer to the last story fragment only.",
        ],
        null,
    );

    const interactionGenerator = engine.inferenceAdapter.runQuestioningCustomAgentOn(
        systemPrompt,
        null,
        lastCycleExpanded,
        null,
        true, // remark last story fragment for analysis, so the agent can analyze it to figure out indirect mentions and descriptions
    );

    const result = await interactionGenerator.next(); // start the generator for each item

    if (result.done) {
        throw new Error("Questioning agent could not be started properly for item-character interactions check.");
    }

    /**
     * @type {string[]}
     */
    const allCharactersAtLocation = [];
    for (const charName in engine.deObject.stateFor) {
        const charState = engine.deObject.stateFor[charName];
        if (charState.location === charState.location) {
            allCharactersAtLocation.push(charName);
        }
    }

    /**
     * @type {string[]}
     */
    const addedMessagesForStoryMaster = [];
    /**
     * @type {string[]}
     */
    const forcedInteractionCharacters = [];
    /**
     * @type {string[]}
     */
    const charactersWithAEstablishedPositionSoFar = [];

    // we will start looping through the item interacted with
    // to figure out if they were moved, and where they ended
    for (const item of itemsInteractedWith) {
        // we will get all the potential locations for the item, based on
        // the current state of the engine, in practice this is a list, because each
        // location represents an unique point of origin, for example let's say the message is about
        // picking a book, and there are books all around the location
        // allPotentialLocationsForItem could be, in the bookshelf and on the table
        // but let's say there are two bookshelves....
        // we don't know which bookshelf the book was picked from, so all potential items for item may be
        // [[book from bookshelf 1, book from bookshelf 2], [book from table]]
        // and the traverse path will refer to that specific locations
        let { allPotentialLocationsForItem, allPotentialLocationTraversePath, allPotentialItemsForItem } = calculateAllPotentialLocationsForItem(engine, charState, allCharactersAtLocation, charactersToQuestion, location, item);

        // so in case the item is not found in the scene, we will skip the item changes check, since if the item is not in the scene, it can't be moved or changed
        if (allPotentialLocationsForItem.length === 0) {
            console.log(`No potential locations found for item "${item}", skipping further checks for this item.`);
            continue;
        }

        let isTotallyCertainAndConfirmedOfTheMovingState = false;
        let wasMoved = false;

        let loops = 0;

        while (!isTotallyCertainAndConfirmedOfTheMovingState) {
            loops++;

            if (loops > 3) {
                console.log(`Too many loops trying to confirm the moving state of item "${item}", breaking the loop to avoid infinite questioning. This may indicate that the questioning agent is having trouble determining the moving state of the item with certainty, possibly due to ambiguous or insufficient information in the last story fragment.`);
                // assume it was moved
                wasMoved = true;
                break;
            }

            const wasItMovedNextQuestion = `In the last story fragment, did any character move, picked up, wear, carry, or change the location of the item "${item}" itself? IMPORTANT: The item "${item}" must be the DIRECT OBJECT being physically relocated. If "${item}" is only a DESTINATION or LOCATION where something else was placed, the answer is NO.`;

            console.log("Asking question, " + wasItMovedNextQuestion);

            const wasItMovedQuestion = await interactionGenerator.next({
                maxCharacters: 0, maxSafetyCharacters: 100,
                maxParagraphs: 1,
                nextQuestion: wasItMovedNextQuestion,
                stopAfter: yesNoGrammarObject.stopAfter,
                stopAt: [],
                answerTrail: `regarding specifically the item ${item} being moved, picked up, carried, or relocated; the answer is:\n\n`,
                grammar: yesNoGrammarObject.grammar,
                contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                    `Example: "Alice picked up ${item} and put it in her backpack" -> Answer: YES, because ${item} itself was picked up and moved.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: "Bob looked at ${item} on the table" -> Answer: NO, because ${item} was not moved.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: "Emma gave ${item} to Bob" -> Answer: YES, because ${item} was handed over (moved from Emma to Bob).`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: "Joe kicked ${item} on an angry rampage" -> Answer: NO, because kicking does not relocate the item.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: "Alice grabbed a fork from the ${item}" -> Answer: NO, because ${item} is the SOURCE. A fork was taken FROM ${item}, but ${item} stayed in place.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: "Bob placed the book on top of the ${item}" -> Answer: NO, because ${item} is the DESTINATION. The book was placed ON ${item}, but ${item} itself was not moved.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: "Carol puts a bowl on top of a ${item}" -> Answer: NO, because ${item} is the DESTINATION. The bowl was placed ON ${item}, but ${item} itself stayed where it was.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `KEY RULE: If something is placed ON, INTO, ONTO, or INSIDE "${item}", then "${item}" is a destination, NOT the object being moved. Answer NO in such cases.`,
                ),
            });
            if (wasItMovedQuestion.done) {
                throw new Error("Questioning agent finished without providing an answer for item movement check.");
            }
            console.log("Received answer, " + wasItMovedQuestion.value);

            wasMoved = true;
            if (wasItMovedQuestion.value.trim().toLowerCase() !== "yes") {
                wasMoved = false;
            }

            // if it was moved, we will ask a confirmation question to make sure the agent is consistent in its answers, since this is a crucial point for the rest of the checks for this item, if the item was not moved, we will skip the rest of the checks for this item, since if it was not moved, it can't have its location changed or be stolen
            if (wasMoved) {
                const wasItMovedConfirmationQuestion = `Is the following statement correct? In the last story fragment, the item "${item}" was moved, worn, picked up, carried, or had its location changed. Answer "yes" if this statement is correct, or "no" if this statement is incorrect.`;
                console.log("Asking question, " + wasItMovedConfirmationQuestion);
                const wasItMovedConfirmation = await interactionGenerator.next({
                    maxCharacters: 0, maxSafetyCharacters: 100,
                    maxParagraphs: 1,
                    nextQuestion: wasItMovedConfirmationQuestion,
                    stopAfter: yesNoGrammarObject.stopAfter,
                    stopAt: [],
                    grammar: yesNoGrammarObject.grammar,
                });
                if (wasItMovedConfirmation.done) {
                    throw new Error("Questioning agent finished without providing an answer for item movement confirmation check.");
                }
                console.log("Received answer, " + wasItMovedConfirmation.value);

                if (wasItMovedConfirmation.value.trim().toLowerCase() !== "yes") {
                    console.log(`The confirmation question for item movement check received a "no" answer, which contradicts the initial answer that indicated the item "${item}" was moved. This may indicate a false positive in the initial movement question, or it may indicate that the item was moved but then moved back to its original location by the end of the message.`);
                } else {
                    isTotallyCertainAndConfirmedOfTheMovingState = true;
                }
            } else {
                console.log("Asking question again, " + wasItMovedNextQuestion);
                const wasItMovedQuestionAgain = await interactionGenerator.next({
                    maxCharacters: 0, maxSafetyCharacters: 100,
                    maxParagraphs: 1,
                    nextQuestion: wasItMovedNextQuestion,
                    stopAfter: yesNoGrammarObject.stopAfter,
                    stopAt: [],
                    answerTrail: `regarding specifically the item ${item} being moved, picked up, carried, or relocated; the answer is:\n\n`,
                    grammar: yesNoGrammarObject.grammar,
                    contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                        `Example: "Alice picked up ${item} and put it in her backpack" -> Answer: YES, because ${item} itself was picked up and moved.`,
                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                        `Example: "Bob looked at ${item} on the table" -> Answer: NO, because ${item} was not moved.`,
                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                        `Example: "Emma gave ${item} to Bob" -> Answer: YES, because ${item} was handed over (moved from Emma to Bob).`,
                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                        `Example: "Joe kicked ${item} on an angry rampage" -> Answer: NO, because kicking does not relocate the item.`,
                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                        `Example: "Alice grabbed a fork from the ${item}" -> Answer: NO, because ${item} is the SOURCE. A fork was taken FROM ${item}, but ${item} stayed in place.`,
                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                        `Example: "Bob placed the book on top of the ${item}" -> Answer: NO, because ${item} is the DESTINATION. The book was placed ON ${item}, but ${item} itself was not moved.`,
                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                        `Example: "Carol puts a bowl on top of a ${item}" -> Answer: NO, because ${item} is the DESTINATION. The bowl was placed ON ${item}, but ${item} itself stayed where it was.`,
                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                        `KEY RULE: If something is placed ON, INTO, ONTO, or INSIDE "${item}", then "${item}" is a destination, NOT the object being moved. Answer NO in such cases.`,
                    ),
                });
                if (wasItMovedQuestionAgain.done) {
                    throw new Error("Questioning agent finished without providing an answer for item movement check.");
                }
                console.log("Received answer, " + wasItMovedQuestionAgain.value);

                if (isYes(wasItMovedQuestionAgain.value)) {
                    console.log(`The confirmation question for item movement check received a "yes" answer, which contradicts the initial answer that indicated the item "${item}" was not moved. This may indicate a false positive in the initial movement question, or it may indicate that the item was moved but then moved back to its original location by the end of the message.`);
                } else {
                    isTotallyCertainAndConfirmedOfTheMovingState = true;
                }
            }
        }

        // not moved, we skip the rest of the checks for this item, since if it was not moved, it can't have its location changed or be stolen
        if (!wasMoved) {
            console.log(`Item "${item}" was not moved or had its location changed, skipping further moving checks for this item.`);
        } else {
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
                        const nextQuestion = `For the item "${item}", according to the last story fragment to analyze, before it was interacted with, was it originally ${allPotentialLocationsForItem[i]}?`;
                        console.log("Asking question, " + nextQuestion);
                        const whereWasItQuestion = await interactionGenerator.next({
                            maxCharacters: 0, maxSafetyCharacters: 100,
                            maxParagraphs: 1,
                            nextQuestion: nextQuestion,
                            stopAfter: yesNoGrammarObject.stopAfter,
                            stopAt: [],
                            grammar: yesNoGrammarObject.grammar,
                            contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                                `Example: If the last story fragment reads that "Alice picked up ${item} from ${answerAlt}", the answer would be "no", since it was originally ${answerAlt}, not ${allPotentialLocationsForItem[i]}.`,
                            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                `Example: If the last story fragment reads that "Bob saw the item ${item} ${allPotentialLocationsForItem[i]} and moved it to be ${answerAlt}", the answer would be "yes", since it was originally ${allPotentialLocationsForItem[i]}.`,
                            ),
                        });

                        if (whereWasItQuestion.done) {
                            throw new Error("Questioning agent finished without providing an answer for item original location check.");
                        }

                        console.log("Received answer, " + whereWasItQuestion.value);

                        if (isYes(whereWasItQuestion.value)) {
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

            console.log(`Item "${item}" was moved or had its location changed`);

            // Now we want to know how many of the item were moved
            const baseAmountMovedQuestion = `By the end of the last story fragment, how many of "${item}" were moved or had their location changed? Answer with a number, or if the amount is not clear, answer with one of the following: "a few", "several", "many", "a lot", "some", "half", "most", or "all".`;
            const amountGrammar = `root ::= ([0-9]+ | "a few" | "several" | "many" | "a lot" | "some" | "half" | "most" | "all" | "none") ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}`;
            console.log("Asking question, " + baseAmountMovedQuestion);
            const baseAmountMovedAnswer = await interactionGenerator.next({
                maxCharacters: 0, maxSafetyCharacters: 100,
                maxParagraphs: 1,
                nextQuestion: baseAmountMovedQuestion,
                contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last story fragment reads that "Alice picked up ${item} and put it in her backpack", the answer would be "1", since only one of the item was moved.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last story fragment reads that "Bob moved a couple of ${item} on the table to the box", the answer would be "some" or "several", since only some of the item was moved.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last story fragment reads that "Emma took a few of the ${item} and gave them to Alice", the answer would be "a few", since only a few of the item were moved.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last story fragment reads that "Joe moved most of the ${item} from the table to the box, but left some on the table", the answer would be "most", since most of the item was moved.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last story fragment reads that "Alice moved 10 of ${item} from the box to the shelf", the answer would be "10", since only 10 of the item were moved.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last story fragment reads that "Bob moved two of ${item} from the ground to the table and two of ${item} from the table to the box", the answer would be "4", since a total of 4 of the item were moved.`,
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
                wasMoved = false;
            }

            if (wasMoved) {
                await calculatePotentialOriginalLocationOfItem();

                // so now we know the total amount of items that were moved
                // this is basically what we want to aim for
                const expectedAmountToMove = convertItemAmountToNumericValue(baseAmountMovedStr, allPotentialItemsForItem.filter((v, index) => answerForLocationIndexes.includes(index)).flat());

                console.log("### Total expected amount of item moved or had its location changed (not final): ", expectedAmountToMove);

                // we have currently moving nothing, we will start moving these items
                let totalMovedSoFar = 0;

                // so the first thing is that we want to figure out where they were moved to, so we will
                // start asking questions about where it may have ended, first we start by pondering
                // if they ended atop or inside other items
                for (const otherItem of itemsInteractedWith) {
                    let isAnother = otherItem === item;

                    // we want now to get the potential locations for the other item, this will help figure things out
                    const otherItemPotentialLocations = calculateAllPotentialLocationsForItem(engine, charState, allCharactersAtLocation, charactersToQuestion, location, otherItem);

                    // if the other item is the same as our current item
                    if (otherItem === item) {
                        // the we are going to check if there is only one, after all we cannot have a thing be inside or atop itself
                        // so it is useless to ask those questions
                        const thereIsOnlyOne = otherItemPotentialLocations.allPotentialItemsForItem.length === 1 &&
                            otherItemPotentialLocations.allPotentialItemsForItem[0].length === 1 &&
                            otherItemPotentialLocations.allPotentialItemsForItem[0][0].amount === 1;
                        if (thereIsOnlyOne) {
                            continue;
                        }
                    }

                    // now we can check for this, by ambiguous it means
                    // we don't know the target specifically, we only know
                    // that it is atop or contained by another item of that type
                    // but we don't know which one specifically, for example if the message is "Alice put the book on top of the box",
                    // and there are two boxes, we don't know on which box the book was placed, so it is ambiguous if the book is on top of box 1 or box 2,
                    // but we do know that it is on top of a box, so it is ambiguous but we do have some information about the location of the item

                    // having ambiguous is useful because most of the time language is vague, and users will not specify
                    // exactly which item they are interacting with
                    let isAmbiguouslyContained = false;
                    let isAmbiguouslyAtop = false;

                    let ambiguousAmountMovedFromOneItemToAnotherAtop = 0;
                    let ambiguousAmountMovedFromOneItemToAnotherContained = 0;

                    let ambiguousAmountTotalMovedFromOneItemToAnother = 0;

                    // we are going to check if any of the other items we are checking, could contain something
                    // it would be very weird that not all of them do, like having a box that can contain other items, and others that do not
                    // but we will check anyway to see if any of them can do it
                    const canContain = otherItemPotentialLocations.allPotentialItemsForItem.some((itemList) => itemList.some((itemInstance) => itemInstance.containerProperties && itemInstance.containerProperties.capacityKg && itemInstance.containerProperties.capacityKg > 0));

                    // so our default is no, that our original item was not contained inside the other item
                    let ambiguousPlacementContainedValue = "no";

                    // now if our heuristics say that there is an item that can contain
                    if (canContain) {
                        // we will ask the LLM if that happened
                        const nextQuestion = `By the end of the last story fragment, was the item "${item}" placed inside ${isAnother ? "another " : "the item "}"${otherItem}"? As a container, ${item} must have been placed inside the item "${otherItem}", not the opposite. Answer "yes" ONLY if ${item} was PUT INTO or PLACED INSIDE ${otherItem}.`;
                        console.log("Asking question, " + nextQuestion);
                        const ambiguousPlacement = await interactionGenerator.next({
                            maxCharacters: 0, maxSafetyCharacters: 100,
                            maxParagraphs: 1,
                            nextQuestion: nextQuestion,
                            useQuestionCache: true,
                            stopAfter: yesNoGrammarObject.stopAfter,
                            stopAt: [],
                            grammar: yesNoGrammarObject.grammar,
                            contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                                `Example: If the last story fragment reads that "${item} was placed inside ${otherItem}", the answer would be "yes", since by the end of the message, ${item} is now inside ${otherItem}.`,
                            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                `Example: If the last story fragment reads that "${item} was left on top of ${otherItem}", the answer would be "no", since by the end of the message, ${item} is on top of ${otherItem}, not inside it.`,
                            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                `Example: If the last story fragment reads that "${item} was taken out from the inside of ${otherItem} and put on top of ${otherItem}", the answer would be "no", since by the end of the message, ${item} is on top of ${otherItem}.`,
                            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                `Example: If the last story fragment reads that "${otherItem} was placed inside ${item}", the answer would be "no", since ${otherItem} is the one that was placed inside ${item}.`,
                            ),
                        });

                        if (ambiguousPlacement.done) {
                            throw new Error("Questioning agent finished without providing an answer for item placement check.");
                        }

                        console.log("Received answer, " + ambiguousPlacement.value);
                        ambiguousPlacementContainedValue = ambiguousPlacement.value.trim().toLowerCase();
                    }

                    // Now we are going to ask for atop, atop is always possible, since we can always have something on top of something else
                    // even if it is ridiculous, like a cabinet on top of a plastic cup, it can happen, it will merely destroy the plastic cup
                    const nextQuestion2 = `By the end of the last story fragment, was the item "${item}" placed on top of ${isAnother ? "another " : "the item "}"${otherItem}"? In other words, "${otherItem}" is the surface and "${item}" is what was placed on it. Answer "yes" ONLY if ${item} ended up on top of ${otherItem}, not the other way around.`;
                    console.log("Asking question, " + nextQuestion2);
                    const ambiguousPlacement2 = await interactionGenerator.next({
                        maxCharacters: 0, maxSafetyCharacters: 100,
                        maxParagraphs: 1,
                        nextQuestion: nextQuestion2,
                        stopAfter: yesNoGrammarObject.stopAfter,
                        stopAt: [],
                        grammar: yesNoGrammarObject.grammar,
                        contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                            `Example: If the last story fragment reads that "${item} was placed on top of ${otherItem}", the answer would be "yes", since by the end of the message, ${item} is now on top of ${otherItem}.`,
                        ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                            `Example: If the last story fragment reads that "Alice picks two ${item} and puts one on the table and another on top of ${otherItem}", the answer would be "yes", since "another" refers to a ${item}, and it was placed on top of ${otherItem}.`,
                        ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                            `Example: If the last story fragment reads that "${item} was placed next to ${otherItem}", the answer would be "no", since by the end of the message, ${item} is next to ${otherItem}, not on top of it.`,
                        ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                            `Example: If the last story fragment reads that "${otherItem} was placed on top of ${item}", the answer would be "no", since ${otherItem} is the one that was placed on top of ${item}, not the other way around.`,
                        ),
                    });

                    if (ambiguousPlacement2.done) {
                        throw new Error("Questioning agent finished without providing an answer for item placement check.");
                    }

                    console.log("Received answer, " + ambiguousPlacement2.value);

                    // now we know if it is ambiguously atop or contained
                    isAmbiguouslyAtop = isYes(ambiguousPlacement2.value);
                    isAmbiguouslyContained = isYes(ambiguousPlacementContainedValue);

                    // we will check
                    if (isAmbiguouslyAtop || isAmbiguouslyContained) {
                        // comfirm because the AI keeps answering yes when the answer is NO
                        if (isAmbiguouslyAtop) {
                            const confirmQuestionAtop = `Is the following statement correct? By the end of the last story fragment, the item "${item}" was placed on top of ${isAnother ? "another " : "the item "}"${otherItem}". Answer "yes" if this statement is correct, or "no" if this statement is incorrect.`;

                            console.log("Asking question, " + confirmQuestionAtop);

                            const ambiguousPlacement2 = await interactionGenerator.next({
                                maxCharacters: 0, maxSafetyCharacters: 100,
                                maxParagraphs: 1,
                                nextQuestion: confirmQuestionAtop,
                                stopAfter: yesNoGrammarObject.stopAfter,
                                stopAt: [],
                                grammar: yesNoGrammarObject.grammar,
                            });

                            if (ambiguousPlacement2.done) {
                                throw new Error("Questioning agent finished without providing an answer for item placement confirmation check.");
                            }
                            console.log("Received answer, " + ambiguousPlacement2.value);
                            isAmbiguouslyAtop = isYes(ambiguousPlacement2.value);
                        }

                        if (isAmbiguouslyContained) {
                            const confirmQuestionContained = `Is the following statement correct? By the end of the last story fragment, the item "${item}" was placed inside ${isAnother ? "another " : "the item "}"${otherItem}". Answer "yes" if this statement is correct, or "no" if this statement is incorrect.`;

                            console.log("Asking question, " + confirmQuestionContained);

                            const ambiguousPlacementContained = await interactionGenerator.next({
                                maxCharacters: 0, maxSafetyCharacters: 100,
                                maxParagraphs: 1,
                                nextQuestion: confirmQuestionContained,
                                stopAfter: yesNoGrammarObject.stopAfter,
                                stopAt: [],
                                grammar: yesNoGrammarObject.grammar,
                            });

                            if (ambiguousPlacementContained.done) {
                                throw new Error("Questioning agent finished without providing an answer for item placement confirmation check.");
                            }
                            console.log("Received answer, " + ambiguousPlacementContained.value);
                            isAmbiguouslyContained = isYes(ambiguousPlacementContained.value);
                        }
                    }

                    // now if we are here, certainly one of these must hold true
                    if (isAmbiguouslyAtop || isAmbiguouslyContained) {
                        // now we will ask for a general amount question, to figure out how many of the item are either atop or inside the other item, we will ask a general question first, and then we will ask a specific question for inside, and by difference we can get the atop amount
                        const nextQuestion = `By the end of the last story fragment, how many of "${item}" are ${canContain ? "inside or on top" : "on top"} of ${otherItem}? Answer with a number, or if the amount is not clear, answer with one of the following: "a few", "several", "many", "a lot", "some", "half", "most", "all", or "none".`;
                        const amountGrammar = `root ::= ([0-9]+ | "a few" | "several" | "many" | "a lot" | "some" | "half" | "most" | "all" | "none") ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}`;

                        console.log("Asking question, " + nextQuestion);

                        const possessionQuestion = await interactionGenerator.next({
                            maxCharacters: 0, maxSafetyCharacters: 100,
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
                            ambiguousAmountTotalMovedFromOneItemToAnother = convertItemAmountToNumericValue(amountTransferred, allPotentialItemsForItem.filter((v, index) => answerForLocationIndexes.includes(index)).flat());
                        }

                        // now we check how many we moved inside or atop that other item
                        // we need to take the minimum of the total of that item we have moved
                        ambiguousAmountTotalMovedFromOneItemToAnother = Math.min(ambiguousAmountTotalMovedFromOneItemToAnother, expectedAmountToMove - totalMovedSoFar);

                        // if we can contain, let's see how many of those are inside
                        if (canContain) {
                            // We ask
                            const nextQuestion = `By the end of the last story fragment, how many of "${item}" are inside of ${otherItem}? Answer with a number, or if the amount is not clear, answer with one of the following: "a few", "several", "many", "a lot", "some", "half", "most", or "all"; note that the ${item} must be INSIDE ${otherItem} to be counted for this question.`;

                            console.log("Asking question, " + nextQuestion);

                            const possessionQuestion = await interactionGenerator.next({
                                maxCharacters: 0, maxSafetyCharacters: 100,
                                maxParagraphs: 1,
                                nextQuestion: nextQuestion,
                                stopAfter: [],
                                stopAt: [],
                                contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                                    `Example: If the last story fragment reads that "${item} was placed inside ${otherItem}", the answer would be "1"`,
                                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                    `Example: If the last story fragment reads that "${item} was placed on top of ${otherItem}", the answer would be "0" or "none"`,
                                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                    `Example: If the last story fragment reads that "${item} was placed on top of ${otherItem}, but some of the ${item} were also placed inside ${otherItem}", the answer would be "some"`,
                                ),
                                grammar: amountGrammar,
                            });

                            if (possessionQuestion.done) {
                                throw new Error("Questioning agent finished without providing an answer for item amount in possession check.");
                            }

                            console.log("Received answer, " + possessionQuestion.value);

                            const amountTransferred = possessionQuestion.value.trim().toLowerCase();
                            ambiguousAmountMovedFromOneItemToAnotherContained = convertItemAmountToNumericValue(amountTransferred, allPotentialItemsForItem.filter((v, index) => answerForLocationIndexes.includes(index)).flat());
                        }

                        // and the difference would be the atop value
                        ambiguousAmountMovedFromOneItemToAnotherAtop = ambiguousAmountTotalMovedFromOneItemToAnother - ambiguousAmountMovedFromOneItemToAnotherContained;
                    }

                    console.log("### Concluded that at least " + ambiguousAmountMovedFromOneItemToAnotherAtop + " of item " + item + " is atop " + otherItem + " and at least " + ambiguousAmountMovedFromOneItemToAnotherContained + " of item " + item + " is inside " + otherItem + ", for a total of at least " + ambiguousAmountTotalMovedFromOneItemToAnother + " of item " + item + " that is atop or inside " + otherItem);

                    // now we need to start moving it
                    let currentAmountOfItemsMovedToAnotherAtop = 0;
                    let currentAmountOfItemsMovedToAnotherContained = 0;

                    // now this is a bit more tricky, so at this point we know that the character has moved the item on top or inside another
                    // and we know how many of those have been placed there, but we don't know which ones specifically
                    // now note how we check in this condition if there are 2 or more potential locations for the other item, because if there is only one potential location for the other item,
                    // then it doesn't matter if it is ambiguous or not, since it can only be that one location
                    if ((isAmbiguouslyAtop || isAmbiguouslyContained) && otherItemPotentialLocations.allPotentialLocationsForItem.length >= 2) {
                        // so now we are in the case where there are more, and we are now looking for explicit mentions, because if there are explicit mentions, then we can be sure that at least some of the item were placed at a specific location4
                        const allPotentialLocationsList = otherItemPotentialLocations.allPotentialLocationsForItem.join("\n - ");
                        for (let i = 0; i < otherItemPotentialLocations.allPotentialLocationsForItem.length; i++) {
                            // this is the potential location for the other item
                            const potentialLocation = otherItemPotentialLocations.allPotentialLocationsForItem[i];
                            let itemsInQuestion = otherItemPotentialLocations.allPotentialItemsForItem[i];
                            const hasContainer = itemsInQuestion.some((it) => it.containerProperties && it.containerProperties.capacityKg && it.containerProperties.capacityKg > 0);

                            if (hasContainer && currentAmountOfItemsMovedToAnotherContained < ambiguousAmountMovedFromOneItemToAnotherContained) {
                                const nextQuestion = `How many of "${item}" were placed inside ${isAnother ? "another " : ""}"${otherItem}" where the target location of ${otherItem} is EXPLICITLY stated to be ${JSON.stringify(potentialLocation)}? ${item} must have been explcitly specified to be placed inside ${otherItem} at the explicit location ${potentialLocation}. Answer with the amount of ONLY the ${item} that were explicitly stated to be placed INSIDE ${otherItem} at the location ${potentialLocation}.`;
                                console.log("Asking question, " + nextQuestion);
                                const placementQuestion2 = await interactionGenerator.next({
                                    maxCharacters: 0, maxSafetyCharacters: 100,
                                    maxParagraphs: 1,
                                    nextQuestion: nextQuestion,
                                    useQuestionCache: true,
                                    stopAfter: [],
                                    stopAt: [],
                                    contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                                        `Example: If the last story fragment reads that "2 ${item} were placed inside ${otherItem} at ${potentialLocation}", the answer would be "2"`,
                                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                        `Example: If the last story fragment reads that "2 ${item} were placed inside ${otherItem}, but the location was not specified, the answer would be "0" or "none" since it was not explicitly stated to be at the location ${potentialLocation}.`,
                                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                        `Example: If the last story fragment reads that "many of ${item} were placed on top of ${otherItem} at ${potentialLocation}, the answer would be "0" or "none" since it was explicitly stated to be on top of ${otherItem}, not inside it, even if the location was specified as ${potentialLocation}.`,
                                    ),
                                    grammar: amountGrammar,
                                    instructions: `The location "${potentialLocation}" must be EXPLICITLY WRITTEN in the last story fragment text as the location of ${otherItem}. Do NOT infer or guess the location, all available locations where ${otherItem} might be are:\n\n` + allPotentialLocationsList,
                                });

                                if (placementQuestion2.done) {
                                    throw new Error("Questioning agent finished without providing an answer for item placement check.");
                                }

                                console.log("Received answer, " + placementQuestion2.value);
                                const amountAtThisLocationStr = placementQuestion2.value.trim().toLowerCase();
                                if (amountAtThisLocationStr !== "0" && amountAtThisLocationStr !== "none") {
                                    const amountAtThisLocation = convertItemAmountToNumericValue(amountAtThisLocationStr, allPotentialItemsForItem.filter((v, index) => answerForLocationIndexes.includes(index)).flat());
                                    const amountToMove = Math.min(amountAtThisLocation, ambiguousAmountMovedFromOneItemToAnotherContained - currentAmountOfItemsMovedToAnotherContained);
                                    currentAmountOfItemsMovedToAnotherContained += amountToMove;

                                    moveItems(
                                        engine,
                                        character.name,
                                        charState,
                                        item,
                                        allPotentialLocationTraversePath.filter((p, index) => answerForLocationIndexes.includes(index)),
                                        otherItemPotentialLocations.allPotentialLocationTraversePath[i],
                                        "containing",
                                        amountToMove,
                                        addedMessagesForStoryMaster,
                                    );
                                }
                            }

                            if (currentAmountOfItemsMovedToAnotherAtop < ambiguousAmountMovedFromOneItemToAnotherAtop) {
                                const nextQuestion = `How many of "${item}" were placed on top of ${isAnother ? "another " : ""}"${otherItem}" where the target location of ${otherItem} is EXPLICITLY stated to be ${JSON.stringify(potentialLocation)}? ${item} must have been explcitly specified to be placed on top of ${otherItem} at the explicit location ${potentialLocation}. Answer with the amount of ONLY the ${item} that were explicitly stated to be placed ON TOP OF ${otherItem} at the location ${potentialLocation}.`;
                                console.log("Asking question, " + nextQuestion);
                                const placementQuestion2 = await interactionGenerator.next({
                                    maxCharacters: 0, maxSafetyCharacters: 100,
                                    maxParagraphs: 1,
                                    nextQuestion: nextQuestion,
                                    stopAfter: [],
                                    stopAt: [],
                                    grammar: amountGrammar,
                                    contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                                        `Example: If the last story fragment reads that "2 ${item} were placed on top of ${otherItem} at ${potentialLocation}", the answer would be "2"`,
                                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                        `Example: If the last story fragment reads that "2 ${item} were placed on top of ${otherItem}, but the location was not specified, the answer would be "0" or "none" since it was not explicitly stated to be at the location ${potentialLocation}.`,
                                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                        `Example: If the last story fragment reads that "many of ${item} were placed inside of ${otherItem} at ${potentialLocation}, the answer would be "0" or "none" since it was explicitly stated to be inside of ${otherItem}, not on top of it, even if the location was specified as ${potentialLocation}.`,
                                    ),
                                    instructions: `The location "${potentialLocation}" must be EXPLICITLY WRITTEN in the last story fragment text as the location of ${otherItem}. Do NOT infer or guess the location, all available locations where ${otherItem} might be are:\n\n` + allPotentialLocationsList,
                                });

                                if (placementQuestion2.done) {
                                    throw new Error("Questioning agent finished without providing an answer for item placement check.");
                                }

                                console.log("Received answer, " + placementQuestion2.value);
                                const amountAtThisLocationStr = placementQuestion2.value.trim().toLowerCase();
                                if (amountAtThisLocationStr !== "0" && amountAtThisLocationStr !== "none") {
                                    const amountAtThisLocation = convertItemAmountToNumericValue(amountAtThisLocationStr, allPotentialItemsForItem.filter((v, index) => answerForLocationIndexes.includes(index)).flat());
                                    const amountToMove = Math.min(amountAtThisLocation, ambiguousAmountMovedFromOneItemToAnotherAtop - currentAmountOfItemsMovedToAnotherAtop);
                                    currentAmountOfItemsMovedToAnotherAtop += amountToMove;

                                    moveItems(
                                        engine,
                                        character.name,
                                        charState,
                                        item,
                                        allPotentialLocationTraversePath.filter((p, index) => answerForLocationIndexes.includes(index)),
                                        otherItemPotentialLocations.allPotentialLocationTraversePath[i],
                                        "ontop",
                                        amountToMove,
                                        addedMessagesForStoryMaster,
                                    );
                                }
                            }
                        }
                    }

                    if (currentAmountOfItemsMovedToAnotherAtop < ambiguousAmountMovedFromOneItemToAnotherAtop) {
                        const amountToMove = ambiguousAmountMovedFromOneItemToAnotherAtop - currentAmountOfItemsMovedToAnotherAtop;
                        currentAmountOfItemsMovedToAnotherAtop += amountToMove;
                        moveItemsPickClosestToCharacter(
                            engine,
                            character.name,
                            charState,
                            item,
                            allPotentialLocationTraversePath.filter((p, index) => answerForLocationIndexes.includes(index)),
                            otherItemPotentialLocations.allPotentialLocationTraversePath,
                            "ontop",
                            amountToMove,
                            addedMessagesForStoryMaster,
                        );
                    }
                    if (currentAmountOfItemsMovedToAnotherContained < ambiguousAmountMovedFromOneItemToAnotherContained) {
                        const amountToMove = ambiguousAmountMovedFromOneItemToAnotherContained - currentAmountOfItemsMovedToAnotherContained;
                        currentAmountOfItemsMovedToAnotherContained += amountToMove;
                        moveItemsPickClosestToCharacter(
                            engine,
                            character.name,
                            charState,
                            item,
                            allPotentialLocationTraversePath.filter((p, index) => answerForLocationIndexes.includes(index)),
                            otherItemPotentialLocations.allPotentialLocationTraversePath,
                            "containing",
                            amountToMove,
                            addedMessagesForStoryMaster,
                        );
                    }

                    totalMovedSoFar += currentAmountOfItemsMovedToAnotherAtop + currentAmountOfItemsMovedToAnotherContained;
                }

                // we still have some amount left to move, so now
                // we will ponder on whether they end in the hands of characters
                // instead of inside or atop other items
                if (totalMovedSoFar < expectedAmountToMove) {
                    const hasAWornPotential = allPotentialItemsForItem.filter((p, index) => answerForLocationIndexes.includes(index)).some((itemOptions) => itemOptions.some((it) => it.wearableProperties));

                    for (const charName of charactersToQuestion) {

                        if (totalMovedSoFar >= expectedAmountToMove) {
                            break;
                        }

                        const nextQuestion = `By the end of the last story fragment, is the item "${item}" in direct possession of ${charName}? they are carrying it or wearing it`;
                        console.log("Asking question, " + nextQuestion);
                        const anotherChar = `${getCharacterNameForExample([charName], 0)}`;
                        const possessionQuestion = await interactionGenerator.next({
                            maxCharacters: 0, maxSafetyCharacters: 100,
                            maxParagraphs: 1,
                            nextQuestion: nextQuestion,
                            stopAfter: yesNoGrammarObject.stopAfter,
                            stopAt: [],
                            grammar: yesNoGrammarObject.grammar,
                            contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                                `Example: If the last story fragment reads that "${anotherChar} gave ${item} to ${charName}", the answer would be "yes", since by the end of the message, ${charName} has the item in their possession.`,
                            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                `Example: If the last story fragment reads that "${anotherChar} took ${item}", the answer would be "no", since by the end of the message, ${charName} does not have the item in their possession.`,
                            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                `Example: If the last story fragment reads that "${charName} carefully drops ${item} on the ground", the answer would be "no", since by the end of the message, ${charName} dropped the item and does not have it in their possession.`,
                            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                `Example: If the last story fragment reads that "${charName} picks up ${item} from ${anotherChar} and then throws it down the window", the answer would be "no", since by the end of the message, ${charName} threw the item away`,
                            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                `Example: If the last story fragment reads that "${anotherChar} picks up ${item} and then gives it to ${charName}", the answer would be "yes", since by the end of the message, ${charName} has the item in their possession`,
                            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                `Example: If the last story fragment reads that "${charName} wears ${item}", the answer would be "yes", since by the end of the message, ${charName} has the item in their possession and is wearing it`,
                            ),
                        });
                        if (possessionQuestion.done) {
                            throw new Error("Questioning agent finished without providing an answer for item possession check.");
                        }
                        console.log("Received answer, " + possessionQuestion.value);

                        const isPossessed = isYes(possessionQuestion.value);
                        let wasThrownTowards = false;
                        let questionPiece = "are in possession by";
                        let questionPiece2 = "";

                        if (!isPossessed) {
                            const nextQuestion = `By the end of the last story fragment, was the item "${item}" thrown/launched towards ${charName} or in their general direction?`;
                            console.log("Asking question, " + nextQuestion);
                            const thrownQuestion = await interactionGenerator.next({
                                maxCharacters: 0, maxSafetyCharacters: 100,
                                maxParagraphs: 1,
                                nextQuestion: nextQuestion,
                                stopAfter: yesNoGrammarObject.stopAfter,
                                stopAt: [],
                                grammar: yesNoGrammarObject.grammar,
                            });
                            if (thrownQuestion.done) {
                                throw new Error("Questioning agent finished without providing an answer for item thrown towards character check.");
                            }
                            console.log("Received answer, " + thrownQuestion.value);

                            wasThrownTowards = isYes(thrownQuestion.value);
                            if (wasThrownTowards) {
                                questionPiece = "were thrown at";
                                questionPiece2 = " or in their general direction";
                            }
                        }

                        // if yes, ask further questions
                        if (isPossessed || wasThrownTowards) {
                            let expectedLocLast = "carrying";
                            const nextQuestion = `By the end of the last story fragment, how many of "${item}" ${questionPiece} ${charName}${questionPiece2}? Answer with a number, or if the amount is not clear, answer with one of the following: "a few", "several", "many", "a lot", "some", "half", "most", or "all".`;
                            const amountGrammar = `root ::= ([0-9]+ | "a few" | "several" | "many" | "a lot" | "some" | "half" | "most" | "all") ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}`;

                            console.log("Asking question, " + nextQuestion);

                            const possessionQuestion = await interactionGenerator.next({
                                maxCharacters: 0, maxSafetyCharacters: 100,
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
                            const actualAmount = convertItemAmountToNumericValue(expectedAmount, allPotentialItemsForItem.filter((v, index) => answerForLocationIndexes.includes(index)).flat());

                            console.log("Received answer, " + possessionQuestion.value);

                            if (actualAmount === 0) {
                                console.log(`The answer for the amount of "${item}" that is in possession of ${charName} is 0 or none, which seems to be a contradiction with the previous answer that indicated that ${charName} has the item in their possession. This may indicate a false positive in the initial possession question, or it may indicate that the item was in their possession at some point during the message but then was removed from their possession by the end of the message. Skipping this relationship due to this inconsistency.`);
                                continue;
                            }

                            if (hasAWornPotential && isPossessed) {
                                const nextQuestion = `By the end of the last story fragment, is the item "${item}" being worn by ${charName}? Answer "yes" ONLY if ${item} was PUT ON or WORN by ${charName}. If ${item} was taken off, removed, or not put on, answer "no".`;
                                console.log("Asking question, " + nextQuestion);
                                const wornQuestion = await interactionGenerator.next({
                                    maxCharacters: 0, maxSafetyCharacters: 100,
                                    maxParagraphs: 1,
                                    nextQuestion: nextQuestion,
                                    stopAfter: yesNoGrammarObject.stopAfter,
                                    stopAt: [],
                                    grammar: yesNoGrammarObject.grammar,
                                    contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                                        `Example: If the last story fragment reads that "${charName} put on ${item}", the answer would be "yes", since by the end of the message, ${charName} is wearing the item.`,
                                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                        `Example: If the last story fragment reads that "${charName} took off ${item}", the answer would be "no", since by the end of the message, ${charName} is not wearing the item.`,
                                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                        `Example: If the last story fragment reads that "${charName} is wearing ${item}", the answer would be "yes", since by the end of the message, ${charName} is wearing the item.`,
                                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                        `Example: If the last story fragment reads that "${charName} has ${item} in their inventory but is not wearing it", the answer would be "no", since by the end of the message, ${charName} is not wearing the item.`,
                                    ),
                                });

                                if (wornQuestion.done) {
                                    throw new Error("Questioning agent finished without providing an answer for item worn check.");
                                }

                                console.log("Received answer, " + wornQuestion.value);

                                if (isYes(wornQuestion.value)) {
                                    expectedLocLast = "wearing";
                                }
                            }

                            const actualAmountToMove = Math.min(actualAmount, expectedAmountToMove - totalMovedSoFar);

                            if (isPossessed) {
                                moveItems(
                                    engine,
                                    character.name,
                                    charState,
                                    item,
                                    allPotentialLocationTraversePath.filter((p, index) => answerForLocationIndexes.includes(index)),
                                    [["characters", charName]],
                                    expectedLocLast,
                                    actualAmountToMove,
                                    addedMessagesForStoryMaster,
                                );
                            } else if (wasThrownTowards) {
                                moveItems(
                                    engine,
                                    character.name,
                                    charState,
                                    item,
                                    allPotentialLocationTraversePath.filter((p, index) => answerForLocationIndexes.includes(index)),
                                    [["slots", engine.deObject.stateFor[charName].locationSlot]],
                                    "items",
                                    actualAmountToMove,
                                    addedMessagesForStoryMaster,
                                    charName,
                                );
                            }

                            totalMovedSoFar += actualAmountToMove;
                        }
                    }

                    if (totalMovedSoFar < expectedAmountToMove) {
                        // ask whether it was dropped on the ground
                        const nextQuestion = `By the end of the last story fragment, was the item "${item}" dropped on the ground? Answer "yes" ONLY if the item is on the ground and not inside or atop another item. If the item is inside or atop another item, answer "no".`;
                        console.log("Asking question, " + nextQuestion);
                        const charName = character.name;
                        const droppedQuestion = await interactionGenerator.next({
                            maxCharacters: 0, maxSafetyCharacters: 100,
                            maxParagraphs: 1,
                            nextQuestion: nextQuestion,
                            stopAfter: yesNoGrammarObject.stopAfter,
                            stopAt: [],
                            grammar: yesNoGrammarObject.grammar,
                            contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                                `Example: If the last story fragment reads that "${charName} drops ${item} on the ground", the answer would be "yes", since by the end of the message, the item is on the ground and not inside or atop another item.`,
                            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                `Example: If the last story fragment reads that "${charName} places ${item} on top of a table", the answer would be "no", since by the end of the message, the item is atop another item (the table) and not on the ground.`,
                            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                `Example: If the last story fragment reads that "${charName} launches/throws ${item}" the answer should be "yes"`,
                            ),
                            instructions: `Actions that should answer YES for include: throwing, dropping, or placing ${item} on the ground or floor`
                        });
                        if (droppedQuestion.done) {
                            throw new Error("Questioning agent finished without providing an answer for item dropped on the ground check.");
                        }
                        console.log("Received answer, " + droppedQuestion.value);

                        if (isYes(droppedQuestion.value)) {
                            const howManyDroppedQuestion = `By the end of the last story fragment, how many of "${item}" were dropped on the ground? Answer with a number, or if the amount is not clear, answer with one of the following: "a few", "several", "many", "a lot", "some", "half", "most", or "all".`;
                            console.log("Asking question, " + howManyDroppedQuestion);
                            const amountGrammar = `root ::= ([0-9]+ | "a few" | "several" | "many" | "a lot" | "some" | "half" | "most" | "all") ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}`;
                            const droppedAmountQuestion = await interactionGenerator.next({
                                maxCharacters: 0, maxSafetyCharacters: 100,
                                maxParagraphs: 1,
                                nextQuestion: howManyDroppedQuestion,
                                stopAfter: [],
                                stopAt: [],
                                grammar: amountGrammar,
                                instructions: `Throwing ${item} also counts as dropping it on the ground`,
                            });
                            if (droppedAmountQuestion.done) {
                                throw new Error("Questioning agent finished without providing an answer for item amount dropped on the ground check.");
                            }
                            console.log("Received answer, " + droppedAmountQuestion.value);

                            const expectedAmount = droppedAmountQuestion.value.trim().toLowerCase();
                            const actualAmountDropped = convertItemAmountToNumericValue(expectedAmount, allPotentialItemsForItem.filter((v, index) => answerForLocationIndexes.includes(index)).flat());

                            if (actualAmountDropped === 0) {
                                console.log(`The answer for the amount of "${item}" that was dropped on the ground is 0 or none, which seems to be a contradiction with the previous answer that indicated that the item was dropped on the ground. This may indicate a false positive in the initial dropped on the ground question, or it may indicate that the item was dropped on the ground at some point during the message but then picked up again by the end of the message. Skipping this relationship due to this inconsistency.`);
                            } else {
                                const wasThrown = await interactionGenerator.next({
                                    maxCharacters: 0, maxSafetyCharacters: 100,
                                    maxParagraphs: 1,
                                    stopAfter: yesNoGrammarObject.stopAfter,
                                    stopAt: [],
                                    grammar: yesNoGrammarObject.grammar,
                                    nextQuestion: `By the end of the last story fragment, was the item "${item}" thrown/launched? Answer "yes" ONLY if the item was thrown or launched. If the item was dropped without being thrown or launched, answer "no".`,
                                });

                                if (wasThrown.done) {
                                    throw new Error("Questioning agent finished without providing an answer for item thrown check.");
                                }
                                console.log("Received answer, " + wasThrown.value);

                                const thrown = isYes(wasThrown.value);

                                const potentialSlotsDroppedAt = Object.keys(location.slots);
                                let expectedSlot = potentialSlotsDroppedAt[Math.floor(Math.random() * potentialSlotsDroppedAt.length)];
                                // now let's pick a slot asking the LLM

                                for (const slot of potentialSlotsDroppedAt) {
                                    const nextQuestion = thrown ? `By the end of the last story fragment, did "${item}" land in "${slot}"? Answer "yes" ONLY if it is explicitly stated or very strongly implied that the item landed in "${slot}". If it is not clear that the item landed in "${slot}", answer "no".` : `By the end of the last story fragment, did "${item}" get dropped at the location of "${slot}"? Answer "yes" ONLY if it is explicitly stated or very strongly implied that the item was dropped at the location of "${slot}". If it is not clear that the item was dropped at the location of "${slot}", answer "no".`;
                                    console.log("Asking question, " + nextQuestion);
                                    const slotQuestion = await interactionGenerator.next({
                                        maxCharacters: 0, maxSafetyCharacters: 100,
                                        maxParagraphs: 1,
                                        nextQuestion: nextQuestion,
                                        stopAfter: yesNoGrammarObject.stopAfter,
                                        stopAt: [],
                                        grammar: yesNoGrammarObject.grammar,
                                    });

                                    if (slotQuestion.done) {
                                        throw new Error("Questioning agent finished without providing an answer for item dropped slot check.");
                                    }
                                    console.log("Received answer, " + slotQuestion.value);

                                    if (isYes(slotQuestion.value)) {
                                        expectedSlot = slot;
                                        break;
                                    }
                                }

                                console.log("Moving " + actualAmountDropped + " of " + item + " to " + expectedSlot + " with relation " + (thrown ? "thrown" : "dropped") + " and with expected location last as ground");

                                moveItems(
                                    engine,
                                    character.name,
                                    charState,
                                    item,
                                    allPotentialLocationTraversePath.filter((p, index) => answerForLocationIndexes.includes(index)),
                                    [["slots", expectedSlot]],
                                    "items",
                                    actualAmountDropped,
                                    addedMessagesForStoryMaster,
                                    thrown,
                                );
                            }
                        }
                    }
                }

                if (totalMovedSoFar > 0) {
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

                    const nextQuestionSteal = `By the last story fragment, was the item "${item}" stolen? Answer "yes" ONLY if a character took the item without permission from its previous possessor. If the item was obtained through other means (like finding it, being given it, or moving it from one place to another without taking it from someone else), answer "no".`;
                    console.log("Asking question, " + nextQuestionSteal);
                    const stealQuestion = await interactionGenerator.next({
                        maxCharacters: 0, maxSafetyCharacters: 100,
                        maxParagraphs: 1,
                        nextQuestion: nextQuestionSteal,
                        stopAfter: yesNoGrammarObject.stopAfter,
                        stopAt: [],
                        grammar: yesNoGrammarObject.grammar,
                        contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                            `Example: If the last story fragment reads that "Alice took ${item} from Bob without asking", the answer would be "yes", since by the end of the message, Alice has stolen the item from Bob.`,
                        ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                            `Example: If the last story fragment reads that "Bob found ${item} on the ground and picked it up", the answer would be "no", since by the end of the message, Bob obtained the item by finding it, not stealing it from someone else.`,
                        ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                            `Example: If the last story fragment reads that "Charlie was given ${item} by Alice", the answer would be "no", since by the end of the message, Charlie obtained the item through being given it, not stealing it from someone else.`,
                        ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                            `Example: If the last story fragment reads that "Dave moved ${item} from the table to their backpack", the answer would be "no", since by the end of the message, Dave obtained the item by moving it, not stealing it from someone else.`,
                        ),
                    });

                    if (stealQuestion.done) {
                        throw new Error("Questioning agent finished without providing an answer for item steal check.");
                    }

                    console.log("Received answer, " + stealQuestion.value);

                    if (isYes(stealQuestion.value)) {
                        wasStolen = true;
                    }

                    if (wasStolen) {
                        const nextQuestion = `By the last story fragment, who stole the item "${item}"? Answer with the name of the character who stole it. If it's not clear who stole it, answer with "none".`;

                        console.log("Asking question, " + nextQuestion);
                        const stealByQuestion = await interactionGenerator.next({
                            maxCharacters: 0, maxSafetyCharacters: 100,
                            maxParagraphs: 1,
                            nextQuestion: nextQuestion,
                            stopAfter: charactersToQuestion.concat(["none"]),
                            stopAt: [],
                            grammar: `root ::= (${charactersToQuestion.map((char) => JSON.stringify(char)).join(" | ")} | "none") ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\n`,
                            contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                                `Example: If the last story fragment reads that "Alice took ${item} from Bob without asking", the answer would be "Alice", since Alice is the character who stole the item.`,
                            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                `Example: If the last story fragment reads that "Bob found ${item} on the ground and picked it up", the answer would be "none", since no character stole the item from someone else.`,
                            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                `Example: If the last story fragment reads that "Charlie stole ${item} from Bob and gave it to Alice", the answer would be "Charlie", since Charlie is the character who stole the item.`,
                            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                `Example: If the last story fragment reads that "Dave picked up ${item} without permission and placed it in his backpack", the answer would be "Dave", since Dave is the character who stole the item from its previous possessor.`,
                            ),
                            answerTrail: "The character who stole " + JSON.stringify(item) + " is:\n\n",
                        });

                        if (stealByQuestion.done) {
                            throw new Error("Questioning agent finished without providing an answer for item steal by check.");
                        }

                        console.log("Received answer, " + stealByQuestion.value);
                        if (stealByQuestion.value.trim().toLowerCase() !== "none") {
                            wasStolenBy = stealByQuestion.value.trim();

                            const nextQuestion = `By the last story fragment, which characters could have witnessed the theft of "${item}"? Answer with the names of the characters who witnessed it, separated by commas. If it's not clear who witnessed it, answer with "none".`;
                            console.log("Asking question, " + nextQuestion);
                            const witnessesQuestion = await interactionGenerator.next({
                                maxCharacters: 0, maxSafetyCharacters: 100,
                                maxParagraphs: 1,
                                nextQuestion: nextQuestion,
                                stopAfter: [],
                                stopAt: [],
                                grammar: `root ::= ((charactername (", " charactername)*) | "none") ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\n`,
                                contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                                    `Example: If the last story fragment reads that "Alice took ${item} from Bob without asking, and Charlie saw it happen", the answer would be "Charlie", since Charlie is the character who witnessed the theft.`,
                                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                    `Example: If the last story fragment reads that "Bob found ${item} on the ground and picked it up, and no one else was around", the answer would be "none", since no character witnessed the theft (since there was no theft).`,
                                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                    `Example: If the last story fragment reads that "Charlie stole ${item} from Bob, and Alice and Dave saw it happen", the answer would be "Alice, Dave", since Alice and Dave are the characters who witnessed the theft.`,
                                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                    `Example: If the last story fragment reads that "Dave picked up ${item} without permission and placed it in his backpack, and Charlie was nearby but it's not clear if he saw it", the answer would be "none", since it's not clear if Charlie witnessed the theft.`,
                                ),
                                answerTrail: "The characters who witnessed the theft of " + JSON.stringify(item) + ":\n\n",
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

                    if (wasStolen) {
                        informStolen(
                            engine,
                            totalMovedSoFar,
                            item,
                            // @ts-ignore
                            wasStolenBy,
                            witnesses,
                            ignorers,
                            witnessesThatIgnoredTheft,
                            witnessesThatTurnHeroes,
                            addedMessagesForStoryMaster,
                        );

                        // add the witnesses that turn heroes and will call out the thief
                        forcedInteractionCharacters.push(...witnessesThatTurnHeroes);
                    }
                }
            }
        }

        // by the end of the message has Y gotten inside x? [YESNO]
        for (const charName of charactersToQuestion) {
            /**
             * @type {number[]}
             */
            let answerForLocationInsideOrAtopIndexes = [];
            /**
             * 
             * @param {string} interactionType 
             * @returns 
             */
            const calculatePotentialLocationOfItemInsideOrAtop = async (interactionType) => {
                if (!engine.inferenceAdapter) {
                    // typescript being dumb
                    throw new Error("No inference adapter set.");
                }

                if (answerForLocationInsideOrAtopIndexes.length) {
                    return;
                }

                if (allPotentialLocationsForItem.length > 1) {
                    for (let i = 0; i < allPotentialLocationsForItem.length; i++) {
                        const answerAlt = allPotentialLocationsForItem[i].includes("table") ? "on the table" : "on the ground";
                        const nextQuestion = `According to the last story fragment to analyze, did ${charName} get ${interactionType} the ${item} that was originally ${allPotentialLocationsForItem[i]}?`;
                        console.log("Asking question, " + nextQuestion);
                        const whereWasItQuestion = await interactionGenerator.next({
                            maxCharacters: 0, maxSafetyCharacters: 100,
                            maxParagraphs: 1,
                            nextQuestion: nextQuestion,
                            stopAfter: yesNoGrammarObject.stopAfter,
                            stopAt: [],
                            grammar: yesNoGrammarObject.grammar,
                            contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                                `Example: If the last story fragment reads that "${charName} got ${interactionType} ${item} from ${answerAlt}", the answer would be "no", since it was originally ${answerAlt}, not ${allPotentialLocationsForItem[i]}.`,
                            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                `Example: If the last story fragment reads that "${charName} got ${interactionType} ${item} ${allPotentialLocationsForItem[i]}", the answer would be "yes", since it was originally ${allPotentialLocationsForItem[i]}.`,
                            ),
                        });

                        if (whereWasItQuestion.done) {
                            throw new Error("Questioning agent finished without providing an answer for item original location check.");
                        }

                        console.log("Received answer, " + whereWasItQuestion.value);

                        if (isYes(whereWasItQuestion.value)) {
                            answerForLocationInsideOrAtopIndexes.push(i);
                        }
                    }
                } else {
                    // it must be only one location
                    console.log(`Only one potential original location for item "${item}", assuming it is correct without asking.`);
                    answerForLocationInsideOrAtopIndexes.push(0);
                }

                if (answerForLocationInsideOrAtopIndexes.length === 0) {
                    console.log(`Could not determine original location for item "${item}", forcing them to be all the potential locations. This may cause some inconsistencies, but we have no other choice.`);
                    answerForLocationInsideOrAtopIndexes = allPotentialLocationsForItem.map((_, index) => index);
                }
            }

            let isInsideItem = false;
            let isAtopItem = false;

            const canBeInside = allPotentialItemsForItem.some((itemOptions) => itemOptions.some((it) => it.containerProperties && it.containerProperties.capacityKg && it.containerProperties.capacityKg > 0));
            const charExactLocation = getCharacterExactLocation(engine, charName);
            const alreadyInside = charExactLocation.item && charExactLocation.item.name === item && charExactLocation.itemPathEnd === "containingCharacters";
            if (canBeInside && !alreadyInside) {
                const nextQuestion = `By the end of the last story fragment, is ${charName} inside ${item}? Answer "yes" ONLY if ${charName} got inside ${item} by entering it, climbing into it, or being put into it. If ${charName} is near ${item} but not inside it, or if it's not clear if they are inside it, answer "no".`;
                console.log("Asking question, " + nextQuestion);
                const insideQuestion = await interactionGenerator.next({
                    maxCharacters: 0, maxSafetyCharacters: 100,
                    maxParagraphs: 1,
                    nextQuestion: nextQuestion,
                    stopAfter: yesNoGrammarObject.stopAfter,
                    stopAt: [],
                    grammar: yesNoGrammarObject.grammar,
                    contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                        `Example: If the last story fragment reads that "${charName} climbed into ${item}", the answer would be "yes", since by the end of the message, ${charName} is inside ${item}.`,
                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                        `Example: If the last story fragment reads that "${charName} is near ${item}", the answer would be "no", since by the end of the message, ${charName} is not inside ${item}.`,
                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                        `Example: If the last story fragment reads that "${charName} was put inside ${item} by ${getCharacterNameForExample([charName], 0)}", the answer would be "yes", since by the end of the message, ${charName} is inside ${item}.`,
                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                        `Example: If the last story fragment reads that "${charName} is on top of ${item}", the answer would be "no", since by the end of the message, ${charName} is not inside ${item}.`,
                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                        `Example: If the last story fragment reads that "${charName} entered ${item}", the answer would be "yes", since by the end of the message, ${charName} is inside ${item}.`,
                    ),
                });
                if (insideQuestion.done) {
                    throw new Error("Questioning agent finished without providing an answer for character inside item check.");
                }
                console.log("Received answer, " + insideQuestion.value);
                if (isYes(insideQuestion.value)) {
                    isInsideItem = true;
                }
            }

            const alreadyAtop = charExactLocation.item && charExactLocation.item.name === item && charExactLocation.itemPathEnd === "ontopCharacters";
            if (!isInsideItem && !alreadyAtop) {
                const nextQuestion = `By the end of the last story fragment, is ${charName} on top of ${item} (sitting, standing, or laying on it, or any other position atop)? Answer "yes" ONLY if ${charName} got on top of ${item} by sitting, standing, laying on it, or being placed on top of it. If ${charName} is near ${item} but not on top of it, or if it's not clear if they are on top of it, answer "no".`;
                console.log("Asking question, " + nextQuestion);
                const atopQuestion = await interactionGenerator.next({
                    maxCharacters: 0, maxSafetyCharacters: 100,
                    maxParagraphs: 1,
                    nextQuestion: nextQuestion,
                    stopAfter: yesNoGrammarObject.stopAfter,
                    stopAt: [],
                    grammar: yesNoGrammarObject.grammar,
                    contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                        `Example: If the last story fragment reads that "${charName} is sitting on top of ${item}", the answer would be "yes", since by the end of the message, ${charName} is on top of ${item}.`,
                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                        `Example: If the last story fragment reads that "${charName} is near ${item}", the answer would be "no", since by the end of the message, ${charName} is not on top of ${item}.`,
                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                        `Example: If the last story fragment reads that "${charName} was placed on top of ${item} by ${getCharacterNameForExample([charName], 0)}", the answer would be "yes", since by the end of the message, ${charName} is on top of ${item}.`,
                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                        `Example: If the last story fragment reads that "${charName} is inside ${item}", the answer would be "no", since by the end of the message, ${charName} is not on top of ${item}.`,
                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                        `Example: If the last story fragment reads that "${charName} stood on top of ${item}", the answer would be "yes", since by the end of the message, ${charName} is on top of ${item}.`,
                    ),
                });

                if (atopQuestion.done) {
                    throw new Error("Questioning agent finished without providing an answer for character atop item check.");
                }
                console.log("Received answer, " + atopQuestion.value);
                if (isYes(atopQuestion.value)) {
                    isAtopItem = true;
                }
            }

            if (isInsideItem || isAtopItem) {
                await calculatePotentialLocationOfItemInsideOrAtop(isInsideItem ? "inside of" : "on top of");

                moveCharactersPickClosestToCharacter(
                    engine,
                    charName,
                    engine.deObject.stateFor[charName],
                    allPotentialLocationTraversePath.filter((p, index) => answerForLocationInsideOrAtopIndexes.includes(index)),
                    isInsideItem ? "containingCharacters" : "ontopCharacters",
                    addedMessagesForStoryMaster,
                );

                charactersThatMoved[charName] = { reason: isInsideItem ? `got inside ${item}` : `got on top of ${item}` };

                // we don't wanna ask questions about where this character may be anymore later
                charactersWithAEstablishedPositionSoFar.push(charName);
            }
        }
    }

    // by the end of the message has Y sat, stood, or laid on x? [YESNO]
    for (const charName of charactersToQuestion) {
        if (charactersWithAEstablishedPositionSoFar.includes(charName)) {
            continue;
        }

        for (const otherCharName of charactersToQuestion) {
            if (charName === otherCharName) {
                continue;
            }

            const beingCarriedInfo = getBeingCarriedByCharacter(engine, charName);
            const alreadyBeingCarriedBy = beingCarriedInfo && beingCarriedInfo.carrierName === otherCharName;

            if (alreadyBeingCarriedBy) {
                // do not ask again, maybe they are inside an item now, eg. in their backpack
                // so we dont want to move it to a general grab
                console.log(`Not asking if ${charName} is on top of ${otherCharName} since we already know that ${charName} is being carried by ${otherCharName}.`);
                continue;
            }

            const otherCharCarriedInfo = getBeingCarriedByCharacter(engine, otherCharName);
            const carryingThatCharacterInsteadAndItIsEstablished = otherCharCarriedInfo && otherCharCarriedInfo.carrierName === charName && charactersWithAEstablishedPositionSoFar.includes(otherCharName);

            if (carryingThatCharacterInsteadAndItIsEstablished) {
                // this means that the other character we will check if our character got on top is actually carrying them, so it is pointless to ask
                // because we already established that, eg. Say the message is *Onza carries Dema*, first we check if
                // Dema is on top of Onza, and we establish that it is true.
                // then once the algorithm thinks about checking if Onza is on top of Dema, it will see that Dema is being carried by Onza, so Onza cannot be on top of Dema
                // hence asking doesn't make sense
                console.log(`Not asking if ${charName} is on top of ${otherCharName} since we already know that ${otherCharName} is being carried by ${charName} in an established manner.`);
                continue;
            }

            const nextQuestion = `By the end of the last story fragment, did ${charName} get on top of ${otherCharName}? Answer "yes" ONLY if ${charName} themselves physically ended up on top of ${otherCharName} (for example, ${charName} is sitting, standing, laying, or riding on ${otherCharName}, or was placed on ${otherCharName}'s back, shoulders, head, etc...). Be careful about directionality: if ${otherCharName} picked up or carried ${charName}, then ${charName} is on top — but if ${charName} picked up or carried ${otherCharName}, then ${charName} is NOT on top. If ${charName} is near ${otherCharName} but not physically on top of them, or if it's not clear, answer "NO".`;
            console.log("Asking question, " + nextQuestion);
            const atopQuestion = await interactionGenerator.next({
                maxCharacters: 0, maxSafetyCharacters: 100,
                maxParagraphs: 1,
                nextQuestion: nextQuestion,
                stopAfter: yesNoGrammarObject.stopAfter,
                stopAt: [],
                grammar: yesNoGrammarObject.grammar,
                contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last story fragment reads that "${charName} is sitting on top of ${otherCharName}", the answer would be "yes", since by the end of the message, ${charName} is on top of ${otherCharName}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last story fragment reads that "${charName} is near ${otherCharName}", the answer would be "no", since by the end of the message, ${charName} is not on top of ${otherCharName}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last story fragment reads that "${charName} was placed on top of ${otherCharName} by ${getCharacterNameForExample([charName, otherCharName], 0)}", the answer would be "yes", since by the end of the message, ${charName} is on top of ${otherCharName}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last story fragment reads that "${charName} jumped and began riding ${otherCharName}", the answer would be "yes", since by the end of the message, ${charName} is on top of ${otherCharName}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last story fragment reads that "${charName} picked up ${otherCharName} and carried them", the answer would be "no", since ${charName} is the one carrying — it is ${otherCharName} who is on top of ${charName}, not the other way around.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last story fragment reads that "${charName} is hugging ${otherCharName}", the answer would be "no", since by the end of the message, ${charName} is not on top of ${otherCharName}.`,
                ),
            });

            if (atopQuestion.done) {
                throw new Error("Questioning agent finished without providing an answer for character atop other character check.");
            }

            console.log("Received answer, " + atopQuestion.value);

            if (isYes(atopQuestion.value)) {
                moveCharacters(
                    engine,
                    charName,
                    engine.deObject.stateFor[charName],
                    [["characters", otherCharName]],
                    "carryingCharactersDirectly",
                    addedMessagesForStoryMaster,
                );
                charactersThatMoved[charName] = { reason: `got on top of ${otherCharName}` };
                charactersWithAEstablishedPositionSoFar.push(charName);
                break;
            }

            const nextQuestionGrabbedOrPickedUp = `By the end of the last story fragment, did ${otherCharName} pick up or start carrying ${charName}? Answer "yes" ONLY if ${otherCharName} is now carrying ${charName} in any way — such as lifting them onto a shoulder, placing them on their head, lifting them, letting them ride on their back, holding them in their arms, carrying them by hand, or any other form of carrying (characters can vary greatly in size). If ${otherCharName} is merely near ${charName} but is not carrying them, or if it's not clear, answer "no".`;
            console.log("Asking question, " + nextQuestionGrabbedOrPickedUp);
            const grabbedOrPickedUpQuestion = await interactionGenerator.next({
                maxCharacters: 0, maxSafetyCharacters: 100,
                maxParagraphs: 1,
                nextQuestion: nextQuestionGrabbedOrPickedUp,
                stopAfter: yesNoGrammarObject.stopAfter,
                stopAt: [],
                grammar: yesNoGrammarObject.grammar,
                contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last story fragment reads that "${otherCharName} picked up ${charName} and is now carrying them", the answer would be "yes", since by the end of the message, ${otherCharName} is carrying ${charName}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last story fragment reads that "${otherCharName} is near ${charName} but is not carrying them", the answer would be "no", since by the end of the message, ${otherCharName} is not carrying ${charName}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last story fragment reads that "${otherCharName} lifted ${charName} onto their shoulder", the answer would be "yes", since by the end of the message, ${otherCharName} is carrying ${charName}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last story fragment reads that "${otherCharName} is hugging ${charName}", the answer would be "no", since by the end of the message, ${otherCharName} is not carrying ${charName}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last story fragment reads that "${charName} picked up ${otherCharName} and carried them", the answer would be "no", since ${charName} is the one carrying — it is ${otherCharName} who is on top of ${charName}, not the other way around.`,
                )
            });

            if (grabbedOrPickedUpQuestion.done) {
                throw new Error("Questioning agent finished without providing an answer for character grabbed or picked up other character check.");
            }

            console.log("Received answer, " + grabbedOrPickedUpQuestion.value);

            if (isYes(grabbedOrPickedUpQuestion.value)) {
                moveCharacters(
                    engine,
                    charName,
                    engine.deObject.stateFor[charName],
                    [["characters", otherCharName]],
                    "ontopCharacters",
                    addedMessagesForStoryMaster,
                );
                charactersThatMoved[charName] = { reason: `picked up by ${otherCharName}` };
                charactersWithAEstablishedPositionSoFar.push(charName);
                break;
            }
        }

        if (charactersWithAEstablishedPositionSoFar.includes(charName)) {
            continue;
        }

        const charState = engine.deObject.stateFor[charName];
        const charExactLocation = getCharacterExactLocation(engine, charName);
        if (charExactLocation.itemPathEnd === "containingCharacters") {
            const nextQuestion = `By the end of the last story fragment, did ${charName} get out of ${charExactLocation.item?.name} (the item they were inside)? Answer "yes" ONLY if ${charName} got out of ${charExactLocation.item?.name} by exiting it, climbing out of it, or being taken out of it. If ${charName} is still inside ${charExactLocation.item?.name}, or if it's not clear if they got out of it, answer "no".`;
            console.log("Asking question, " + nextQuestion);
            const outsideQuestion = await interactionGenerator.next({
                maxCharacters: 0, maxSafetyCharacters: 100,
                maxParagraphs: 1,
                nextQuestion: nextQuestion,
                stopAfter: yesNoGrammarObject.stopAfter,
                stopAt: [],
                grammar: yesNoGrammarObject.grammar,
                contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last story fragment reads that "${charName} climbed out of ${charExactLocation.item?.name}", the answer would be "yes", since by the end of the message, ${charName} is no longer inside ${charExactLocation.item?.name}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last story fragment reads that "${charName} is still inside ${charExactLocation.item?.name}", the answer would be "no", since by the end of the message, ${charName} is still inside ${charExactLocation.item?.name}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last story fragment reads that "${charName} was taken out of ${charExactLocation.item?.name} by ${getCharacterNameForExample([charName], 0)}", the answer would be "yes", since by the end of the message, ${charName} is no longer inside ${charExactLocation.item?.name}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last story fragment reads that "${charName} exited ${charExactLocation.item?.name}", the answer would be "yes", since by the end of the message, ${charName} is no longer inside ${charExactLocation.item?.name}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last story fragment reads that "${charName} is on top of ${charExactLocation.item?.name}", the answer would be "no", since by the end of the message, ${charName} is not inside ${charExactLocation.item?.name}.`,
                ),
            });

            if (outsideQuestion.done) {
                throw new Error("Questioning agent finished without providing an answer for character outside item check.");
            }
            console.log("Received answer, " + outsideQuestion.value);
            if (isYes(outsideQuestion.value)) {
                // move them outside of the item on top of ground
                moveCharacters(
                    engine,
                    charName,
                    charState,
                    [["slots", charState.locationSlot]],
                    "ontopCharacters",
                    addedMessagesForStoryMaster,
                )
                charactersThatMoved[charName] = { reason: `got out of ${charExactLocation.item?.name}` };
            }
        } else if (charExactLocation.itemPathEnd === "ontopCharacters") {
            const nextQuestion = `By the end of the last story fragment, did ${charName} get out from being on top of ${charExactLocation.item?.name} (the item they were laying/sitting/standing on)? Answer "yes" ONLY if ${charName} got out from ${charExactLocation.item?.name} by exiting it, climbing out of it, or being taken out of it. If ${charName} is still on top of ${charExactLocation.item?.name}, or if it's not clear if they got out of it, answer "no".`;
            console.log("Asking question, " + nextQuestion);
            const outsideQuestion = await interactionGenerator.next({
                maxCharacters: 0, maxSafetyCharacters: 100,
                maxParagraphs: 1,
                nextQuestion: nextQuestion,
                stopAfter: yesNoGrammarObject.stopAfter,
                stopAt: [],
                grammar: yesNoGrammarObject.grammar,
                contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last story fragment reads that "${charName} climbed out of ${charExactLocation.item?.name}", the answer would be "yes", since by the end of the message, ${charName} is no longer on top of ${charExactLocation.item?.name}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last story fragment reads that "${charName} is still on top of ${charExactLocation.item?.name}", the answer would be "no", since by the end of the message, ${charName} is still on top of ${charExactLocation.item?.name}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last story fragment reads that "${charName} was taken out of ${charExactLocation.item?.name} by ${getCharacterNameForExample([charName], 0)}", the answer would be "yes", since by the end of the message, ${charName} is no longer on top of ${charExactLocation.item?.name}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last story fragment reads that "${charName} exited ${charExactLocation.item?.name}", the answer would be "yes", since by the end of the message, ${charName} is no longer on top of ${charExactLocation.item?.name}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last story fragment reads that "${charName} is on top of ${charExactLocation.item?.name}", the answer would be "no", since by the end of the message, ${charName} is still on top of ${charExactLocation.item?.name}.`,
                ),
            });

            if (outsideQuestion.done) {
                throw new Error("Questioning agent finished without providing an answer for character outside item check.");
            }
            console.log("Received answer, " + outsideQuestion.value);
            if (isYes(outsideQuestion.value)) {
                // move them outside of the item on top of ground
                moveCharacters(
                    engine,
                    charName,
                    charState,
                    [["slots", charState.locationSlot]],
                    "ontopCharacters",
                    addedMessagesForStoryMaster,
                )
                charactersThatMoved[charName] = { reason: `got off ${charExactLocation.item?.name}` };
            }
        } else if (charExactLocation.beingCarriedBy) {
            const nextQuestion = `By the end of the last story fragment, did ${charName} is no longer being carried by ${charExactLocation.beingCarriedBy}? Answer "yes" ONLY if ${charName} got put down from being carried by ${charExactLocation.beingCarriedBy} by being set down on the ground or on a surface, or being given to someone else. If ${charName} is still being carried by ${charExactLocation.beingCarriedBy}, or if it's not clear if they got put down, answer "no".`;
            console.log("Asking question, " + nextQuestion);
            const outsideQuestion = await interactionGenerator.next({
                maxCharacters: 0, maxSafetyCharacters: 100,
                maxParagraphs: 1,
                nextQuestion: nextQuestion,
                stopAfter: yesNoGrammarObject.stopAfter,
                stopAt: [],
                grammar: yesNoGrammarObject.grammar,
                contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last story fragment reads that "${charName} was put down by ${charExactLocation.beingCarriedBy} on the ground", the answer would be "yes", since by the end of the message, ${charName} is no longer being carried by ${charExactLocation.beingCarriedBy}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last story fragment reads that "${charName} is still being carried by ${charExactLocation.beingCarriedBy}", the answer would be "no", since by the end of the message, ${charName} is still being carried by ${charExactLocation.beingCarriedBy}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last story fragment reads that "${charName} was given to ${getCharacterNameForExample([charName], 0)} by ${charExactLocation.beingCarriedBy}", the answer would be "yes", since by the end of the message, ${charName} is no longer being carried by ${charExactLocation.beingCarriedBy}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last story fragment reads that "${charName} was got down from ${charExactLocation.beingCarriedBy} shoulder by themselves", the answer would be "yes", since by the end of the message, ${charName} is no longer being carried by ${charExactLocation.beingCarriedBy}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last story fragment reads that "${charName} completed riding ${charExactLocation.beingCarriedBy} and got down", the answer would be "yes", since by the end of the message, ${charName} is no longer being carried by ${charExactLocation.beingCarriedBy}.`,
                ),
            });

            if (outsideQuestion.done) {
                throw new Error("Questioning agent finished without providing an answer for character outside item check.");
            }
            console.log("Received answer, " + outsideQuestion.value);
            if (isYes(outsideQuestion.value)) {
                // move them outside of the item on top of ground
                moveCharacters(
                    engine,
                    charName,
                    charState,
                    [["slots", charState.locationSlot]],
                    "ontopCharacters",
                    addedMessagesForStoryMaster,
                )
                charactersThatMoved[charName] = { reason: `put down by ${charExactLocation.beingCarriedBy} on the ground` };
            }
        }

        // we consider now the position of the character to be established
        charactersWithAEstablishedPositionSoFar.push(charName);
    }

    // TODO determine items broken or transformed
    // TODO determine items consumed

    await interactionGenerator.next(null); // finish the generator

    await cleanAll(engine, charState.location, lastCycleMessages, addedMessagesForStoryMaster, charactersThatMoved);

    return {
        storyMasterMessages: addedMessagesForStoryMaster,
        charactersThatMoved: charactersThatMoved,
    };
}

/**
 * 
 * @param {DEngine} engine
 * @param {DEStateForCharacterWithHistory} charState
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
 * @param {string} characterName
 * @param {DEStateForCharacterWithHistory} charState
 * @param {string} item 
 * @param {Array<Array<Array<string | number>>>} fromPotentialLocationPaths 
 * @param {Array<Array<string | number>>} toPotentialLocationPaths 
 * @param {string} finalPath
 * @param {number} amountToMove
 * @param {string[]} addedMessagesForStoryMaster
 * @param {boolean | string} [thrown] whether the item was thrown there
 */
function moveItems(
    engine,
    characterName,
    charState,
    item,
    fromPotentialLocationPaths,
    toPotentialLocationPaths,
    finalPath,
    amountToMove,
    addedMessagesForStoryMaster,
    thrown = false,
) {
    if (amountToMove <= 0) {
        return;
    }

    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    const slotReference = charState.locationSlot;

    /**
     * @type {Array<Array<Array<string | number>>>}
     */
    const fromPathsAtTheSameSlot = [];
    /**
     * @type {Array<Array<Array<string | number>>>}
     */
    const fromPathsNotAtTheSameSlot = [];
    for (const potentialFromPath of fromPotentialLocationPaths) {
        // all others are guaranteed to be in the same slot, what changes is the number
        if (potentialFromPath[0][0] === "slots") {
            if (potentialFromPath[0][1] === slotReference) {
                fromPathsAtTheSameSlot.push(potentialFromPath);
            } else {
                fromPathsNotAtTheSameSlot.push(potentialFromPath);
            }
        } else if (potentialFromPath[0][0] === "characters") {
            const charName = potentialFromPath[0][1];
            const charState = engine.deObject.stateFor[charName];
            if (charState.locationSlot === slotReference) {
                fromPathsAtTheSameSlot.push(potentialFromPath);
            } else {
                fromPathsNotAtTheSameSlot.push(potentialFromPath);
            }
        } else {
            throw new Error("Unexpected from path that is not from a slot or character, got " + potentialFromPath[0][0]);
        }
    }

    const toPathsAtTheSameSlot = [];
    const toPathsNotAtTheSameSlot = [];
    for (const potentialToPath of toPotentialLocationPaths) {
        if (potentialToPath[0] === "slots") {
            if (potentialToPath[1] === slotReference) {
                toPathsAtTheSameSlot.push(potentialToPath);
            } else {
                toPathsNotAtTheSameSlot.push(potentialToPath);
            }
        } else if (potentialToPath[0] === "characters") {
            const charName = potentialToPath[1];
            const charState = engine.deObject.stateFor[charName];
            if (charState.locationSlot === slotReference) {
                toPathsAtTheSameSlot.push(potentialToPath);
            } else {
                toPathsNotAtTheSameSlot.push(potentialToPath);
            }
        } else {
            throw new Error("Unexpected to path that is not from a slot or character, got " + potentialToPath[0]);
        }
    }

    /**
     * @type {Array<string|number> | null}
     */
    let toPath = null;

    if (toPathsAtTheSameSlot.length > 0) {
        // pick one at random
        toPath = toPathsAtTheSameSlot[Math.floor(Math.random() * toPathsAtTheSameSlot.length)];
    } else {
        // first we will see if the item was used before to place new things and prefer one of those paths if they exist
        const preferrablePaths = [];
        for (const potentialToPath of toPathsNotAtTheSameSlot) {
            const resolveInfo = resolvePath(engine, charState.location, potentialToPath);
            if (resolveInfo.resolved._just_placed) {
                preferrablePaths.push(potentialToPath);
            }
        }
        if (preferrablePaths.length > 0) {
            toPath = preferrablePaths[Math.floor(Math.random() * preferrablePaths.length)];
        } else {
            // pick one at random from all potential paths
            toPath = toPotentialLocationPaths[Math.floor(Math.random() * toPotentialLocationPaths.length)];
        }
    }

    /**
     * Counts the total amount of items in the given paths.
     * @param {Array<Array<string | number>>} paths 
     */
    const countAmount = (paths) => {
        let total = 0;
        for (const path of paths) {
            const resolveInfo = resolvePath(engine, charState.location, path);
            total += resolveInfo.resolved.amount || 1;
        }
        return total;
    }

    // let's sort fromPathsAtTheSameSlot by amount, the ones with largest amount first
    const newFromPaths = fromPathsAtTheSameSlot.map((v) => {
        return { paths: v, amount: countAmount(v) };
    }).sort((a, b) => {
        return b.amount - a.amount;
    });

    // now let's do the same for fromPathsNotAtTheSameSlot
    const newFromPathNotSameSlot = fromPathsNotAtTheSameSlot.map((v) => {
        return { paths: v, amount: countAmount(v) };
    }).sort((a, b) => {
        return b.amount - a.amount;
    });

    /**
     * @type {Array<Array<Array<string | number>>>}
     */
    const fromPathsConsumable = [];

    const newFromPathsThatCanTakeTheWholeAmount = newFromPaths.filter((v) => v.amount >= amountToMove);
    const newFromPathsThatCanTakeTheWholeAmountNotSameSlot = newFromPathNotSameSlot.filter((v) => v.amount >= amountToMove);

    console.log("newFromPaths", newFromPaths);
    console.log("newFromPathNotSameSlot", newFromPathNotSameSlot);

    console.log("newFromPathsThatCanTakeTheWholeAmount", newFromPathsThatCanTakeTheWholeAmount);
    console.log("newFromPathsThatCanTakeTheWholeAmountNotSameSlot", newFromPathsThatCanTakeTheWholeAmountNotSameSlot);

    if (newFromPathsThatCanTakeTheWholeAmount.length > 0) {
        // all the items are available at this path that is close so we assume the transfer happens from here, we can pick one at random if there are multiple
        fromPathsConsumable.push(newFromPathsThatCanTakeTheWholeAmount[Math.floor(Math.random() * newFromPathsThatCanTakeTheWholeAmount.length)].paths);
    } else if (newFromPathsThatCanTakeTheWholeAmountNotSameSlot.length > 0) {
        fromPathsConsumable.push(newFromPathsThatCanTakeTheWholeAmountNotSameSlot[Math.floor(Math.random() * newFromPathsThatCanTakeTheWholeAmountNotSameSlot.length)].paths);
    } else {
        fromPathsConsumable.push(...newFromPaths.map((v) => v.paths));
        fromPathsConsumable.push(...newFromPathNotSameSlot.map((v) => v.paths));
    }

    // this is guaranteed to be either a character, a slot, or another item
    const resolveInfo = resolvePath(
        engine,
        charState.location,
        toPath
    );
    const toElement = resolveInfo.resolved;

    // ensure that the path we are moving is a path of one item only
    ensurePathOfOne(engine, charState.location, resolveInfo.pathToResolved);

    console.log("Determined transfer paths for", amountToMove, "of item", item, ", from paths: ", fromPathsConsumable, "to path:", resolveInfo.pathToResolved);

    // now we will start moving the items
    let amountMoved = 0;
    for (const fromPath of fromPathsConsumable) {
        if (amountMoved >= amountToMove) {
            break;
        }
        const componentFromPathsSorted = fromPath.map((path) => {
            const resolveInfo = resolvePath(engine, charState.location, path);
            return { path, item: resolveInfo.resolved, amount: resolveInfo.resolved.amount || 1 };
        }).sort((a, b) => {
            return b.amount - a.amount;
        });
        for (const componentFromPath of componentFromPathsSorted) {
            if (amountMoved >= amountToMove) {
                break;
            }
            const amountAvailable = componentFromPath.amount;
            const amountToTransfer = Math.min(amountAvailable, amountToMove - amountMoved);
            if (amountToTransfer <= 0) {
                continue;
            }
            componentFromPath.item.amount = (componentFromPath.item.amount || 1) - amountToTransfer;
            amountMoved += amountToTransfer;

            const clonedItem = { ...componentFromPath.item, amount: amountToTransfer, _just_placed: true };

            toElement[finalPath].push(clonedItem);

            const lastIndex = toElement[finalPath].length - 1;
            const actualEndingPath = [...toPath, finalPath, lastIndex];

            if (componentFromPath.item.amount === 0) {
                // @ts-ignore
                componentFromPath.item._moved_to = actualEndingPath;
            }

            let thrownAddition = "";
            if (thrown) {
                if (typeof thrown === "string") {
                    const variations = [
                        `After being thrown towards ${thrown}, `,
                        `Having been tossed towards ${thrown}, `,
                        `Flung in the direction of ${thrown}, `,
                        `Hurled towards ${thrown}, `,
                    ];
                    thrownAddition = variations[Math.floor(Math.random() * variations.length)];
                } else {
                    const variations = [
                        "After being thrown, ",
                        "Having been tossed, ",
                        "After being flung, ",
                        "Hurled through the air, ",
                    ];
                    thrownAddition = variations[Math.floor(Math.random() * variations.length)];
                }
            }

            const _caughtAndIs = [" caught and is", " snatched and is", " grabbed and is", " caught hold of and is"];
            const caughtAndIs = _caughtAndIs[Math.floor(Math.random() * _caughtAndIs.length)]; // followed by now carrying or now wearing, preceeded by the character that caught it, this is a thrown item
            const _nowCarrying = [" now carrying", " now holding", " now in possession of", " carrying"];
            const nowCarrying = _nowCarrying[Math.floor(Math.random() * _nowCarrying.length)]; // followed by the item is carrying
            const _nowWearing = [" now wearing", " now sporting", " now fitted with", " now dressed in"];
            const nowWearing = _nowWearing[Math.floor(Math.random() * _nowWearing.length)]; // followed by the item is wearing
            const _whichPreviously = [" which previously", " which before this", " having previously", " which until now"];
            const whichPreviously = _whichPreviously[Math.floor(Math.random() * _whichPreviously.length)]; // followed by was/were at location, preceeded by "some item" or "the item" or similar
            const _droppedOnTheGround = [" dropped on the ground", " left on the ground", " set down on the ground", " placed on the ground"];
            const droppedOnTheGround = _droppedOnTheGround[Math.floor(Math.random() * _droppedOnTheGround.length)]; // followed by at location, preceeded by "some item" or "the item" or similar
            const _isMoved = [" is moved", " has been moved", " is relocated", " is transferred"];
            const isMoved = _isMoved[Math.floor(Math.random() * _isMoved.length)]; // followed by from, preceeded by "some item" or "the item" or similar
            const _areMoved = [" are moved", " have been moved", " are relocated", " are transferred"];
            const areMoved = _areMoved[Math.floor(Math.random() * _areMoved.length)]; // followed by from, preceeded by "some items" or "the items" or similar
            // some nicer messages potentials
            // given to a character directly or indirectly (eg. put in a bag that they are carrying or wearing)
            if (actualEndingPath[0] === "characters" && (actualEndingPath[2] === "carrying" || (actualEndingPath[2] === "wearing" && actualEndingPath.length > 4))) {
                // A character picked up or received an item
                const messageSoFar = `${thrownAddition}${actualEndingPath[1]}${thrown ? caughtAndIs : ""}${nowCarrying} ${utilItemCount(engine, charState.location, null, amountToTransfer, item)}${whichPreviously} ${amountToTransfer === 1 ? "was" : "were"} ${locationPathToMessageWithoutItemName(engine, characterName, charState.location, componentFromPath.path)}`;
                if (actualEndingPath.length > 4) {
                    // eg. ["characters", "Alice", "carrying", 0, "containing", 1] we check above 4 to avoid the index of where the item is located in the carrying list
                    addedMessagesForStoryMaster.push(messageSoFar + `, and is now specifically ${locationPathToMessageWithoutItemName(engine, characterName, charState.location, actualEndingPath, true)}`);
                } else {
                    addedMessagesForStoryMaster.push(messageSoFar);
                }

                // wearing directly on the body
            } else if (actualEndingPath[0] === "characters" && actualEndingPath[2] === "wearing" && actualEndingPath.length <= 4) {
                // A character picked up or received an item
                const messageSoFar = `${thrownAddition}${actualEndingPath[1]}${thrown ? caughtAndIs : ""}${nowWearing} ${utilItemCount(engine, charState.location, null, amountToTransfer, item)}${whichPreviously} ${amountToTransfer === 1 ? "was" : "were"} ${locationPathToMessageWithoutItemName(engine, characterName, charState.location, componentFromPath.path)}`;
                addedMessagesForStoryMaster.push(messageSoFar);
            } else if (actualEndingPath[0] === "slots" && actualEndingPath[2] === "items" && actualEndingPath.length <= 4) {
                // an item was dropped on the ground
                const messageSoFar = `${thrownAddition}${utilItemCount(engine, charState.location, null, amountToTransfer, item, true)}${thrown ? "" : amountToTransfer === 1 ? " is" : " are"}${droppedOnTheGround} at ${actualEndingPath[1]},${whichPreviously} ${amountToTransfer === 1 ? "was" : "were"} ${locationPathToMessageWithoutItemName(engine, characterName, charState.location, componentFromPath.path)}`;
                addedMessagesForStoryMaster.push(messageSoFar);
            } else {
                if (thrown) {
                    const messageSoFar = `${thrownAddition}${utilItemCount(engine, charState.location, null, amountToTransfer, item, true)} drops ${locationPathToMessageWithoutItemName(engine, characterName, charState.location, actualEndingPath)},${whichPreviously} ${amountToTransfer === 1 ? "was" : "were"} ${locationPathToMessageWithoutItemName(engine, characterName, charState.location, componentFromPath.path)}.`;
                    addedMessagesForStoryMaster.push(messageSoFar);
                } else {
                    const messageSoFar = `${utilItemCount(engine, charState.location, null, amountToTransfer, item, true)}${amountToTransfer === 1 ? isMoved : areMoved} from ${locationPathToMessageWithoutItemName(engine, characterName, charState.location, componentFromPath.path)} to be ${locationPathToMessageWithoutItemName(engine, characterName, charState.location, actualEndingPath)}.`;
                    addedMessagesForStoryMaster.push(messageSoFar);
                }
            }
        }
    }
}

/**
 * @param {DEngine} engine
 * @param {string} characterName
 * @param {DEStateForCharacterWithHistory} charState
 * @param {Array<Array<string | number>>} toPotentialLocationPaths 
 * @param {"containingCharacters" | "ontopCharacters" | "carryingCharactersDirectly"} finalPath
 * @param {string[]} addedMessagesForStoryMaster
 */
function moveCharacters(
    engine,
    characterName,
    charState,
    toPotentialLocationPaths,
    finalPath,
    addedMessagesForStoryMaster,
) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    const slotReference = charState.locationSlot;

    /**
     * 
     * @param {DEItem[]} list 
     */
    const clearList = (list) => {
        for (const item of list) {
            if (item.containingCharacters && item.containingCharacters.includes(characterName)) {
                const index = item.containingCharacters.indexOf(characterName);
                item.containingCharacters.splice(index, 1);
            }
            if (item.ontopCharacters && item.ontopCharacters.includes(characterName)) {
                const index = item.ontopCharacters.indexOf(characterName);
                item.ontopCharacters.splice(index, 1);
            }
            clearList(item.containing);
            clearList(item.ontop);
        }
    }

    const toPathsAtTheSameSlot = [];
    const toPathsNotAtTheSameSlot = [];
    for (const potentialToPath of toPotentialLocationPaths) {
        if (potentialToPath[0] === "slots") {
            if (potentialToPath[1] === slotReference) {
                toPathsAtTheSameSlot.push(potentialToPath);
            } else {
                toPathsNotAtTheSameSlot.push(potentialToPath);
            }
        } else if (potentialToPath[0] === "characters") {
            const charName = potentialToPath[1];
            const charState = engine.deObject.stateFor[charName];
            if (charState.locationSlot === slotReference) {
                toPathsAtTheSameSlot.push(potentialToPath);
            } else {
                toPathsNotAtTheSameSlot.push(potentialToPath);
            }
        } else {
            throw new Error("Unexpected to path that is not from a slot or character, got " + potentialToPath[0]);
        }
    }

    /**
     * @type {Array<string|number> | null}
     */
    let toPath = null;

    if (toPathsAtTheSameSlot.length > 0) {
        // pick one at random
        toPath = toPathsAtTheSameSlot[Math.floor(Math.random() * toPathsAtTheSameSlot.length)];
    } else {
        // first we will see if the item was used before to place new things and prefer one of those paths if they exist
        const preferrablePaths = [];
        for (const potentialToPath of toPathsNotAtTheSameSlot) {
            const resolveInfo = resolvePath(engine, charState.location, potentialToPath);
            if (resolveInfo.resolved._just_placed) {
                preferrablePaths.push(potentialToPath);
            }
        }
        if (preferrablePaths.length > 0) {
            toPath = preferrablePaths[Math.floor(Math.random() * preferrablePaths.length)];
        } else {
            // pick one at random from all potential paths
            toPath = toPotentialLocationPaths[Math.floor(Math.random() * toPotentialLocationPaths.length)];
        }
    }

    // this is guaranteed to be either a character, a slot, or another item
    const resolveInfo = resolvePath(
        engine,
        charState.location,
        toPath
    );

    // ensure that the path we are moving is a path of one item only
    ensurePathOfOne(engine, charState.location, resolveInfo.pathToResolved);

    console.log("Determined placing character", characterName, "at path", resolveInfo.pathToResolved);

    // now we will start moving the character
    if (resolveInfo.pathToResolved.length > 2) {
        // I mean we can only add on such final path if it's an item, not the raw element
        // like straight up carried by a character or straight up on a slot
        resolveInfo.resolved[finalPath].push(characterName);
    }
    const isPureSlot = resolveInfo.pathToResolved.length === 2 && resolveInfo.pathToResolved[0] === "slots";
    const isPureCharacter = resolveInfo.pathToResolved.length === 2 && resolveInfo.pathToResolved[0] === "characters";

    if (resolveInfo.pathToResolved[0] === "characters") {
        addedMessagesForStoryMaster.push(`${characterName} is now being carried by ${resolveInfo.pathToResolved[1]}.`);
    } else {
        // @ts-ignore
        charState.locationSlot = resolveInfo.pathToResolved[1];
        if (isPureSlot) {
            addedMessagesForStoryMaster.push(`${characterName} is now on the ground at ${locationPathToMessage(engine, characterName, charState.location, resolveInfo.pathToResolved)}.`);
        }
    }

    if (finalPath === "containingCharacters" && !isPureCharacter && !isPureSlot) {
        addedMessagesForStoryMaster.push(`${characterName} is now ${locationPathToMessage(engine, characterName, charState.location, [...resolveInfo.pathToResolved, "containing"])}.`);
    } else if (finalPath === "ontopCharacters" && !isPureCharacter && !isPureSlot) {
        addedMessagesForStoryMaster.push(`${characterName} is now ${locationPathToMessage(engine, characterName, charState.location, [...resolveInfo.pathToResolved, "ontop"])}.`);
    }
}

/**
 * @param {DEngine} engine
 * @param {string} characterName
 * @param {DEStateForCharacterWithHistory} charState
 * @param {string} item 
 * @param {Array<Array<Array<string | number>>>} fromPotentialLocationPaths 
 * @param {Array<Array<Array<string | number>>>} toPotentialLocationPaths 
 * @param {string} finalPath
 * @param {number} amountToMove
 * @param {string[]} addedMessagesForStoryMaster
 */
function moveItemsPickClosestToCharacter(
    engine,
    characterName,
    charState,
    item,
    fromPotentialLocationPaths,
    toPotentialLocationPaths,
    finalPath,
    amountToMove,
    addedMessagesForStoryMaster,
) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    const slotReference = charState.locationSlot;

    const toPathsAtTheSameSlot = [];
    for (const toPath of toPotentialLocationPaths) {
        if (toPath[0][0] === "slots" && toPath[0][1] === slotReference) {
            toPathsAtTheSameSlot.push(toPath);
        }
        if (toPath[0][0] === "characters") {
            const charName = toPath[0][1];
            const charState = engine.deObject.stateFor[charName];
            if (charState.locationSlot === slotReference) {
                toPathsAtTheSameSlot.push(toPath);
            }
        }
    }

    if (toPathsAtTheSameSlot.length > 0) {
        return moveItems(engine, characterName, charState, item, fromPotentialLocationPaths, toPathsAtTheSameSlot[Math.floor(Math.random() * toPathsAtTheSameSlot.length)], finalPath, amountToMove, addedMessagesForStoryMaster);
    } else {
        return moveItems(engine, characterName, charState, item, fromPotentialLocationPaths, toPotentialLocationPaths[Math.floor(Math.random() * toPotentialLocationPaths.length)], finalPath, amountToMove, addedMessagesForStoryMaster);
    }
}

/**
 * 
 * @param {DEngine} engine 
 * @param {string} characterName 
 * @param {DEStateForCharacterWithHistory} charState 
 * @param {Array<Array<Array<string | number>>>} toPotentialLocationPaths 
 * @param {"containingCharacters" | "ontopCharacters" | "carryingCharactersDirectly"} finalPath
 * @param {Array<string>} addedMessagesForStoryMaster 
 * @returns 
 */
function moveCharactersPickClosestToCharacter(
    engine,
    characterName,
    charState,
    toPotentialLocationPaths,
    finalPath,
    addedMessagesForStoryMaster,
) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    const slotReference = charState.locationSlot;
    const toPathsAtTheSameSlot = [];
    for (const toPath of toPotentialLocationPaths) {
        if (toPath[0][0] === "slots" && toPath[0][1] === slotReference) {
            toPathsAtTheSameSlot.push(toPath);
        }
        if (toPath[0][0] === "characters") {
            const charName = toPath[0][1];
            const charState = engine.deObject.stateFor[charName];
            if (charState.locationSlot === slotReference) {
                toPathsAtTheSameSlot.push(toPath);
            }
        }
    }

    if (toPathsAtTheSameSlot.length > 0) {
        return moveCharacters(engine, characterName, charState, toPathsAtTheSameSlot[Math.floor(Math.random() * toPathsAtTheSameSlot.length)], finalPath, addedMessagesForStoryMaster);
    } else {
        return moveCharacters(engine, characterName, charState, toPotentialLocationPaths[Math.floor(Math.random() * toPotentialLocationPaths.length)], finalPath, addedMessagesForStoryMaster);
    }
}

/**
 * 
 * @param {DEngine} engine
 * @param {number} totalMoved
 * @param {string} item
 * @param {string} wasStolenBy 
 * @param {Array<string>} witnesses 
 * @param {Array<string>} ignorers 
 * @param {Array<string>} witnessesThatIgnoredTheft 
 * @param {Array<string>} witnessesThatTurnHeroes 
 * @param {Array<string>} addedMessagesForStoryMaster 
 */
function informStolen(
    engine,
    totalMoved,
    item,
    wasStolenBy,
    witnesses,
    ignorers,
    witnessesThatIgnoredTheft,
    witnessesThatTurnHeroes,
    addedMessagesForStoryMaster,
) {
    let message = `${totalMoved} of ${item} ${totalMoved === 1 ? "is" : "are"} stolen by ${wasStolenBy}`;
    if (witnesses.length <= 0) {
        message += " with no witnesses, so none notice the theft.";
    } else {
        message += ` and this is witnessed by ${engine.deObject?.functions.format_and(engine.deObject, null, witnesses)}`;
        if (ignorers.length > 0) {
            message += `, while ${engine.deObject?.functions.format_and(engine.deObject, null, ignorers)} are nearby but do not notice the theft`;
        }
        if (witnessesThatIgnoredTheft.length > 0) {
            message += `. Out of the witnesses, ${engine.deObject?.functions.format_and(engine.deObject, null, witnessesThatIgnoredTheft)} decide to ignore the theft and not intervene`;
        }
        if (witnessesThatTurnHeroes.length > 0) {
            message += `. Out of the witnesses, ${engine.deObject?.functions.format_and(engine.deObject, null, witnessesThatTurnHeroes)} decide to call out the thief and intervene`;
        }
    }

    addedMessagesForStoryMaster.push(message);
}

/**
 * 
 * @param {*} a 
 * @param {*} b
 * @param {boolean} [firstLayer]
 * @returns 
 */
function deepEqualItem(a, b, firstLayer = true) {
    if (a === b) {
        return true;
    }
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
        return false;
    }
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) {
        return false;
    }
    for (const key of keysA) {
        // do not compare amount
        if (firstLayer && (key === "amount" || key === "_just_placed" || key === "_moved_to")) {
            continue;
        }
        if (!keysB.includes(key) || !deepEqualItem(a[key], b[key], false)) {
            return false;
        }
    }
    return true;
}

/**
 * @param {DEngine} engine
 * @param {string} location
 * @param {string} locationSlot
 * @param {DEItem[]} list
 * @param {Array<string | number>} path
 * @param {Array<string>} addedMessagesForStoryMaster
 * @param {"first" | "mid" | "last"} cycle
 * @param {Array<{message: string; author: string; storyMaster: boolean}>} lastCycleMessages
 * @param {{ [charName: string]: { reason: string; }}} charactersThatMoved
 * @returns {Promise<void>}
 */
async function cleanDirtyItemTree(
    engine,
    location,
    locationSlot,
    list,
    path,
    addedMessagesForStoryMaster,
    cycle,
    lastCycleMessages,
    charactersThatMoved,
) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }

    const deletedIndices = [];
    for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const currentPath = [...path, i];

        // delete helper property
        // @ts-ignore
        if (item._moved_to) {
            // @ts-ignore
            delete item._moved_to;
        }

        // delete items if amount is zero
        if (item.amount === 0) {
            deletedIndices.push(i);
            continue;
        }

        // clean the children recursively
        for (const relation of ["containing", "ontop"]) {
            // @ts-ignore
            if (item[relation] && item[relation].length > 0) {
                // @ts-ignore
                await cleanDirtyItemTree(engine, location, locationSlot, item[relation], [...currentPath, relation], addedMessagesForStoryMaster, relation, item, charactersThatMoved);
            }
        }
    }

    // change the list in reverse order to avoid messing up the indices
    for (let i = deletedIndices.length - 1; i >= 0; i--) {
        list.splice(deletedIndices[i], 1);
    }

    /**
     * @type {Array<number>}
     */
    const deletedIndicesDueToMerging = [];

    // Merge items that have the same properties (except amount).
    for (let i = 0; i < list.length; i++) {
        if (deletedIndicesDueToMerging.includes(i)) {
            continue;
        }
        for (let j = i + 1; j < list.length; j++) {
            if (deletedIndicesDueToMerging.includes(j)) {
                continue;
            }
            if (deepEqualItem(list[i], list[j])) {
                deletedIndicesDueToMerging.push(j);
                list[i].amount = (list[i].amount || 1) + (list[j].amount || 1);

                // just placed gets readded in case
                // to keep the item marked for importance
                // @ts-ignore
                if (list[j]._just_placed) {
                    // @ts-ignore
                    list[i]._just_placed = true;
                }
            }
        }
    }

    // delete again the merged items in reverse order to avoid messing up the indices
    for (let i = deletedIndicesDueToMerging.length - 1; i >= 0; i--) {
        list.splice(deletedIndicesDueToMerging[i], 1);
    }

    // this is where items would fall down if they are expelled from containers or fall from on top of other items, we will add them to the slot as if they fell on the ground, we will also add a message for the story master about what fell down and why
    const expectedPathForFallenItems = path[0] === "slots" ? ["slots", path[1]] : ["slots", locationSlot];
    const resolvedFallenItems = resolvePath(engine, location, expectedPathForFallenItems);

    /**
     * We use this helper function to expell items to the fallen list
     * 
     * @param {DEItem} item 
     * @param {number} amount
     */
    const expellItemToFallen = (item, amount) => {
        // @ts-ignore
        const alreadyFound = resolvedFallenItems.resolved.items.find((fallenItem) => deepEqualItem(fallenItem, item));
        if (alreadyFound) {
            alreadyFound.amount = (alreadyFound.amount || 1) + amount;
        } else {
            const copied = deepCopyItem(item);
            copied.amount = amount;
            resolvedFallenItems.resolved.items.push(copied);
        }
    }

    // this is specific to items on items only, I know it is going to be verbose but more readable this way, we can optimize later if needed
    // the path length being greater than 3 means we are on an item that is inside or on top another item
    if (path.length > 3) {
        for (const item of list) {
            const excess = getItemExcessElements(engine, item);
            if (excess.breaks) {
                const fallsDownList = [];
                for (const expelledFromOnTopItem of excess.expelledOntopItems) {
                    const amountExpelled = (expelledFromOnTopItem.amount || 1) * (item.amount || 1);
                    expelledFromOnTopItem.amount = 0;

                    expellItemToFallen(expelledFromOnTopItem.item, amountExpelled);

                    fallsDownList.push(utilItemCount(engine, location, expelledFromOnTopItem.item.owner, amountExpelled, expelledFromOnTopItem.item.name));
                }
                for (const expelledFromInsideItem of excess.expelledContainedItems) {
                    const amountExpelled = (expelledFromInsideItem.amount || 1) * (item.amount || 1);
                    expelledFromInsideItem.amount = 0;

                    expellItemToFallen(expelledFromInsideItem.item, amountExpelled);

                    fallsDownList.push(utilItemCount(engine, location, expelledFromInsideItem.item.owner, amountExpelled, expelledFromInsideItem.item.name));
                }
                for (const expelledOnTopCharacter of excess.expelledOntopCharacters) {
                    item.ontopCharacters = item.ontopCharacters.filter((v) => v !== expelledOnTopCharacter);
                    fallsDownList.push(expelledOnTopCharacter);
                }
                for (const expelledInsideCharacter of excess.expelledContainedCharacters) {
                    item.containingCharacters = item.containingCharacters.filter((v) => v !== expelledInsideCharacter);
                    fallsDownList.push(expelledInsideCharacter);
                }

                if (fallsDownList.length <= 0) {
                    // @ts-ignore
                    addedMessagesForStoryMaster.push(excess.breakReason);
                } else {
                    const listOfItemsFallingDown = engine.deObject?.functions.format_and(engine.deObject, null, fallsDownList);
                    const fallVariations = [
                        `${excess.breakReason}, this causes ${listOfItemsFallingDown} to fall down onto the ground at the ${expectedPathForFallenItems[1]}.`,
                        `${excess.breakReason}, sending ${listOfItemsFallingDown} tumbling to the ground at the ${expectedPathForFallenItems[1]}.`,
                        `${excess.breakReason}, ${listOfItemsFallingDown} spills out onto the ground at the ${expectedPathForFallenItems[1]}.`,
                        `${excess.breakReason}, ${listOfItemsFallingDown} crashes down onto the ground at the ${expectedPathForFallenItems[1]}.`,
                        `${excess.breakReason}, scattering ${listOfItemsFallingDown} onto the ground at the ${expectedPathForFallenItems[1]}.`,
                    ];
                    const totalBrokenReason = fallVariations[Math.floor(Math.random() * fallVariations.length)];
                    addedMessagesForStoryMaster.push(totalBrokenReason);
                }

                await updateItemAfterHappenance(
                    engine,
                    item,
                    excess.breakStyle === "overweight" ? "got loaded with a lot of heavy stuff which caused it to break from the inside" : "got a massive weight on top which caused it to be crushed",
                    lastCycleMessages,
                    {
                        breakerCharName: null,
                        breaks: "DESTROYED_ITEM",
                        // @ts-ignore
                        reason: excess.breakReason,
                        location: location,
                        // @ts-ignore
                        locationSlotFalls: expectedPathForFallenItems[expectedPathForFallenItems.length - 1],
                    },
                    false,
                    addedMessagesForStoryMaster,
                );
            } else {
                for (const expelledFromOnTopItem of excess.expelledOntopItems) {
                    // the amount expelled multiplies by the amount of the item
                    const amountExpelled = (expelledFromOnTopItem.amount || 1) * (item.amount || 1);
                    expelledFromOnTopItem.amount -= expelledFromOnTopItem.amount;

                    const expelledItemVolume = getItemVolume(engine, expelledFromOnTopItem.item);

                    expellItemToFallen(expelledFromOnTopItem.item, amountExpelled);

                    const elementsExpelled = utilItemCount(engine, location, expelledFromOnTopItem.item.owner, amountExpelled, expelledFromOnTopItem.item.name, false);
                    if (item.maxVolumeOnTopLiters !== null && expelledItemVolume.singularVolume > item.maxVolumeOnTopLiters) {
                        const tooLargeOnTopVariations = [
                            `${elementsExpelled} ${amountExpelled === 1 ? "is" : "are"} far too large to be on top of ${item.name} and ${amountExpelled === 1 ? "falls" : "fall"} off onto the ground in the ${expectedPathForFallenItems[1]}`,
                            `${elementsExpelled} ${amountExpelled === 1 ? "is" : "are"} way too big for the top of ${item.name} and ${amountExpelled === 1 ? "slides" : "slide"} right off onto the ground in the ${expectedPathForFallenItems[1]}`,
                            `${item.name} can't support ${elementsExpelled} on top — far too large — and ${amountExpelled === 1 ? "it topples" : "they topple"} off onto the ground in the ${expectedPathForFallenItems[1]}`,
                            `${elementsExpelled} ${amountExpelled === 1 ? "is" : "are"} much too bulky to stay on top of ${item.name} and ${amountExpelled === 1 ? "tumbles" : "tumble"} to the ground in the ${expectedPathForFallenItems[1]}`,
                            `${elementsExpelled} won't fit on top of ${item.name} due to ${amountExpelled === 1 ? "its" : "their"} sheer size and ${amountExpelled === 1 ? "crashes" : "crash"} down onto the ground in the ${expectedPathForFallenItems[1]}`,
                        ];
                        const msg = tooLargeOnTopVariations[Math.floor(Math.random() * tooLargeOnTopVariations.length)];
                        addedMessagesForStoryMaster.push(msg.charAt(0).toUpperCase() + msg.slice(1));
                    } else {
                        const noFitOnTopVariations = [
                            `${elementsExpelled} ${amountExpelled === 1 ? "does" : "do"} not fit on top of ${item.name} and ${amountExpelled === 1 ? "falls" : "fall"} off onto the ground in the ${expectedPathForFallenItems[1]}`,
                            `there's no room for ${elementsExpelled} on top of ${item.name}, so ${amountExpelled === 1 ? "it falls" : "they fall"} off onto the ground in the ${expectedPathForFallenItems[1]}`,
                            `${item.name} has no space left on top for ${elementsExpelled}, which ${amountExpelled === 1 ? "slides" : "slide"} off onto the ground in the ${expectedPathForFallenItems[1]}`,
                            `${elementsExpelled} can't stay balanced on top of ${item.name} and ${amountExpelled === 1 ? "drops" : "drop"} to the ground in the ${expectedPathForFallenItems[1]}`,
                            `${elementsExpelled} ${amountExpelled === 1 ? "tips" : "tip"} off the top of ${item.name} and ${amountExpelled === 1 ? "lands" : "land"} on the ground in the ${expectedPathForFallenItems[1]}`,
                        ];
                        const msg = noFitOnTopVariations[Math.floor(Math.random() * noFitOnTopVariations.length)];
                        addedMessagesForStoryMaster.push(msg.charAt(0).toUpperCase() + msg.slice(1));
                    }
                }
                for (const expelledFromInsideItem of excess.expelledContainedItems) {
                    // the amount expelled multiplies by the amount of the item
                    const amountExpelled = (expelledFromInsideItem.amount || 1) * (item.amount || 1);
                    expelledFromInsideItem.amount -= expelledFromInsideItem.amount;

                    const expelledItemVolume = getItemVolume(engine, expelledFromInsideItem.item);

                    expellItemToFallen(expelledFromInsideItem.item, amountExpelled);

                    const elementsExpelled = utilItemCount(engine, location, expelledFromInsideItem.item.owner, amountExpelled, expelledFromInsideItem.item.name, false);
                    if (item.containerProperties && expelledItemVolume.singularVolume > item.containerProperties.capacityLiters) {
                        const tooLargeInsideVariations = [
                            `${elementsExpelled} ${amountExpelled === 1 ? "is" : "are"} far too large to fit inside ${item.name} and ${amountExpelled === 1 ? "falls" : "fall"} out onto the ground in the ${expectedPathForFallenItems[1]}`,
                            `${elementsExpelled} ${amountExpelled === 1 ? "is" : "are"} way too big to be crammed inside ${item.name} and ${amountExpelled === 1 ? "tumbles" : "tumble"} out onto the ground in the ${expectedPathForFallenItems[1]}`,
                            `there's no way ${elementsExpelled} can fit inside ${item.name} — far too large — and ${amountExpelled === 1 ? "it ends" : "they end"} up on the ground in the ${expectedPathForFallenItems[1]}`,
                            `${elementsExpelled} ${amountExpelled === 1 ? "is" : "are"} much too bulky for the inside of ${item.name} and ${amountExpelled === 1 ? "spills" : "spill"} out onto the ground in the ${expectedPathForFallenItems[1]}`,
                            `${item.name} can't contain ${elementsExpelled} — far too large — so ${amountExpelled === 1 ? "it drops" : "they drop"} out onto the ground in the ${expectedPathForFallenItems[1]}`,
                        ];
                        const msg = tooLargeInsideVariations[Math.floor(Math.random() * tooLargeInsideVariations.length)];
                        addedMessagesForStoryMaster.push(msg.charAt(0).toUpperCase() + msg.slice(1));
                    } else {
                        const noFitInsideVariations = [
                            `${elementsExpelled} ${amountExpelled === 1 ? "does" : "do"} not fit inside ${item.name} and ${amountExpelled === 1 ? "falls" : "fall"} out onto the ground in the ${expectedPathForFallenItems[1]}`,
                            `${item.name} is too full for ${elementsExpelled}, which ${amountExpelled === 1 ? "falls" : "fall"} out onto the ground in the ${expectedPathForFallenItems[1]}`,
                            `there's no room inside ${item.name} for ${elementsExpelled}, so ${amountExpelled === 1 ? "it spills" : "they spill"} out onto the ground in the ${expectedPathForFallenItems[1]}`,
                            `${elementsExpelled} can't squeeze inside ${item.name} and ${amountExpelled === 1 ? "drops" : "drop"} out onto the ground in the ${expectedPathForFallenItems[1]}`,
                            `${elementsExpelled} ${amountExpelled === 1 ? "gets" : "get"} pushed out of ${item.name} — no space left — and ${amountExpelled === 1 ? "lands" : "land"} on the ground in the ${expectedPathForFallenItems[1]}`,
                        ];
                        const msg = noFitInsideVariations[Math.floor(Math.random() * noFitInsideVariations.length)];
                        addedMessagesForStoryMaster.push(msg.charAt(0).toUpperCase() + msg.slice(1));
                    }
                }
                for (const expelledOnTopCharacter of excess.expelledOntopCharacters) {
                    // a character is only one so that is easier to handle
                    item.ontopCharacters = item.ontopCharacters.filter((v) => v !== expelledOnTopCharacter);

                    const charVolume = getCharacterVolume(engine, expelledOnTopCharacter);

                    if (path[0] === "characters") {
                        const characterCarryingOrWearingTheItem = path[1];

                        if (item.maxVolumeOnTopLiters !== null && charVolume.volume > item.maxVolumeOnTopLiters) {
                            const tooLargeCarriedVariations = [
                                `${expelledOnTopCharacter} is too large to fit on top of the ${item.name} and falls down from it, the ${item.name} is being carried by ${characterCarryingOrWearingTheItem}, and ${expelledOnTopCharacter} is now on the ground at the ${expectedPathForFallenItems[1]}.`,
                                `${expelledOnTopCharacter} can't stay on top of the ${item.name} — far too large — and tumbles off while ${characterCarryingOrWearingTheItem} is carrying it, ending up on the ground at the ${expectedPathForFallenItems[1]}.`,
                                `Being too large to balance on top of the ${item.name}, ${expelledOnTopCharacter} slides off and drops to the ground at the ${expectedPathForFallenItems[1]}, as ${characterCarryingOrWearingTheItem} carries the item.`,
                                `The ${item.name}, being carried by ${characterCarryingOrWearingTheItem}, can't support ${expelledOnTopCharacter} on top who is simply too large, and ${expelledOnTopCharacter} falls off onto the ground at the ${expectedPathForFallenItems[1]}.`,
                            ];
                            addedMessagesForStoryMaster.push(tooLargeCarriedVariations[Math.floor(Math.random() * tooLargeCarriedVariations.length)]);
                        } else {
                            const doesntFitCarriedVariations = [
                                `${expelledOnTopCharacter} does not fit on top of the ${item.name} and falls down from it, the ${item.name} is being carried by ${characterCarryingOrWearingTheItem}, and ${expelledOnTopCharacter} is now on the ground at the ${expectedPathForFallenItems[1]}.`,
                                `${expelledOnTopCharacter} can't fit on top of the ${item.name} anymore and slips off while ${characterCarryingOrWearingTheItem} is carrying it, landing on the ground at the ${expectedPathForFallenItems[1]}.`,
                                `There's no room for ${expelledOnTopCharacter} on top of the ${item.name}, and they fall off as ${characterCarryingOrWearingTheItem} carries it, ending up on the ground at the ${expectedPathForFallenItems[1]}.`,
                                `The ${item.name}, carried by ${characterCarryingOrWearingTheItem}, can no longer hold ${expelledOnTopCharacter} on top, who tumbles off onto the ground at the ${expectedPathForFallenItems[1]}.`,
                            ];
                            addedMessagesForStoryMaster.push(doesntFitCarriedVariations[Math.floor(Math.random() * doesntFitCarriedVariations.length)]);
                        }
                    } else {
                        if (item.maxVolumeOnTopLiters !== null && charVolume.volume > item.maxVolumeOnTopLiters) {
                            const tooLargeVariations = [
                                `${expelledOnTopCharacter} is too large to fit on top of the ${item.name} and falls down from it, and is now on the ground at the ${expectedPathForFallenItems[1]}.`,
                                `${expelledOnTopCharacter} can't stay on top of the ${item.name} — far too large — and tumbles off, ending up on the ground at the ${expectedPathForFallenItems[1]}.`,
                                `Being too large to balance on top of the ${item.name}, ${expelledOnTopCharacter} slides off and drops to the ground at the ${expectedPathForFallenItems[1]}.`,
                                `The ${item.name} can't support ${expelledOnTopCharacter} on top who is simply too large, and ${expelledOnTopCharacter} falls off onto the ground at the ${expectedPathForFallenItems[1]}.`,
                            ];
                            addedMessagesForStoryMaster.push(tooLargeVariations[Math.floor(Math.random() * tooLargeVariations.length)]);
                        } else {
                            const doesntFitVariations = [
                                `${expelledOnTopCharacter} does not fit on top of the ${item.name} and falls down from it, and is now on the ground at the ${expectedPathForFallenItems[1]}.`,
                                `${expelledOnTopCharacter} can't fit on top of the ${item.name} anymore and slips off, landing on the ground at the ${expectedPathForFallenItems[1]}.`,
                                `There's no room for ${expelledOnTopCharacter} on top of the ${item.name}, and they fall off, ending up on the ground at the ${expectedPathForFallenItems[1]}.`,
                                `The ${item.name} can no longer hold ${expelledOnTopCharacter} on top, who tumbles off onto the ground at the ${expectedPathForFallenItems[1]}.`,
                            ];
                            addedMessagesForStoryMaster.push(doesntFitVariations[Math.floor(Math.random() * doesntFitVariations.length)]);
                        }
                    }
                }
                for (const expelledInsideCharacter of excess.expelledContainedCharacters) {
                    // a character is only one so that is easier to handle
                    item.containingCharacters = item.containingCharacters.filter((v) => v !== expelledInsideCharacter);
                    const charState = engine.deObject.stateFor[expelledInsideCharacter];

                    const charVolume = getCharacterVolume(engine, expelledInsideCharacter);

                    if (path[0] === "characters") {
                        const characterCarryingOrWearingTheItem = path[1];
                        if (item.containerProperties && charVolume.volume > item.containerProperties.capacityLiters) {
                            const tooLargeCarriedVariations = [
                                `${expelledInsideCharacter} is too large to fit inside the ${item.name} and falls out from it, the ${item.name} is being carried by ${characterCarryingOrWearingTheItem}, and ${expelledInsideCharacter} is now on the ground at the ${expectedPathForFallenItems[1]}.`,
                                `${expelledInsideCharacter} can't squeeze inside the ${item.name} — far too large — and tumbles out while ${characterCarryingOrWearingTheItem} is carrying it, ending up on the ground at the ${expectedPathForFallenItems[1]}.`,
                                `Being too large for the ${item.name}, ${expelledInsideCharacter} is forced out and drops to the ground at the ${expectedPathForFallenItems[1]}, as ${characterCarryingOrWearingTheItem} carries the item.`,
                                `The ${item.name}, being carried by ${characterCarryingOrWearingTheItem}, can't contain ${expelledInsideCharacter} who is simply too large, and ${expelledInsideCharacter} spills out onto the ground at the ${expectedPathForFallenItems[1]}.`,
                            ];
                            addedMessagesForStoryMaster.push(tooLargeCarriedVariations[Math.floor(Math.random() * tooLargeCarriedVariations.length)]);
                        } else {
                            const doesntFitCarriedVariations = [
                                `${expelledInsideCharacter} does not fit inside the ${item.name} and falls out from it, the ${item.name} is being carried by ${characterCarryingOrWearingTheItem}, and ${expelledInsideCharacter} is now on the ground at the ${expectedPathForFallenItems[1]}.`,
                                `${expelledInsideCharacter} can't fit inside the ${item.name} anymore and slips out while ${characterCarryingOrWearingTheItem} is carrying it, landing on the ground at the ${expectedPathForFallenItems[1]}.`,
                                `There's no room for ${expelledInsideCharacter} inside the ${item.name}, and they fall out of it as ${characterCarryingOrWearingTheItem} carries it, ending up on the ground at the ${expectedPathForFallenItems[1]}.`,
                                `The ${item.name}, carried by ${characterCarryingOrWearingTheItem}, can no longer hold ${expelledInsideCharacter} inside, who tumbles out onto the ground at the ${expectedPathForFallenItems[1]}.`,
                            ];
                            addedMessagesForStoryMaster.push(doesntFitCarriedVariations[Math.floor(Math.random() * doesntFitCarriedVariations.length)]);
                        }
                    } else {
                        if (item.containerProperties && charVolume.volume > item.containerProperties.capacityLiters) {
                            const tooLargeVariations = [
                                `${expelledInsideCharacter} is too large to fit inside the ${item.name} and falls out from it, and is now on the ground at the ${expectedPathForFallenItems[1]}.`,
                                `${expelledInsideCharacter} can't fit inside the ${item.name} — far too large — and tumbles out, ending up on the ground at the ${expectedPathForFallenItems[1]}.`,
                                `Being too large for the ${item.name}, ${expelledInsideCharacter} is forced out and drops to the ground at the ${expectedPathForFallenItems[1]}.`,
                                `The ${item.name} can't contain ${expelledInsideCharacter} who is simply too large, and ${expelledInsideCharacter} spills out onto the ground at the ${expectedPathForFallenItems[1]}.`,
                            ];
                            addedMessagesForStoryMaster.push(tooLargeVariations[Math.floor(Math.random() * tooLargeVariations.length)]);
                        } else {
                            const doesntFitVariations = [
                                `${expelledInsideCharacter} does not fit inside the ${item.name} and falls out from it, and is now on the ground at the ${expectedPathForFallenItems[1]}.`,
                                `${expelledInsideCharacter} can't fit inside the ${item.name} anymore and slips out, landing on the ground at the ${expectedPathForFallenItems[1]}.`,
                                `There's no room for ${expelledInsideCharacter} inside the ${item.name}, and they fall out of it, ending up on the ground at the ${expectedPathForFallenItems[1]}.`,
                                `The ${item.name} can no longer hold ${expelledInsideCharacter} inside, who tumbles out onto the ground at the ${expectedPathForFallenItems[1]}.`,
                            ];
                            addedMessagesForStoryMaster.push(doesntFitVariations[Math.floor(Math.random() * doesntFitVariations.length)]);
                        }
                    }
                }
            }
        }
    } else if (path.length === 3 && path[0] === "slots") {
        // now for items that are directly on the ground, we are going to check if the slot is overfilled and has
        // zero capacity, so the items will begin to pile up in other slots instead
        // Actually this is not necessary, they were already there, so, no mass or volume was added to the slot
        // it's just changing location, it must fit
    } else if (path.length === 3 && path[0] === "characters") {
        // now for items on characters
        const carryingCapacity = getCharacterCarryingCapacity(
            engine,
            // @ts-ignore
            path[1],
        );

        if (path[2] === "carrying") {
            let userHasFallen = false;
            let totalCarriedWeight = 0;
            let totalCarriedVolume = 0;
            const charState = engine.deObject.stateFor[path[1]];
            for (const wornItem of charState.wearing) {
                const wornItemWeight = getItemWeight(engine, wornItem);
                totalCarriedWeight += wornItemWeight.completeWeight;
            }
            for (const carriedCharacter of charState.carryingCharactersDirectly) {
                const carriedCharacterVolume = getCharacterVolume(engine, carriedCharacter);
                totalCarriedVolume += carriedCharacterVolume.volume;
                const carriedCharacterWeight = getCharacterWeight(engine, carriedCharacter);
                totalCarriedWeight += carriedCharacterWeight.weight;
            }
            const listResortedByJustPlaced = [...list].sort((a, b) => {
                // @ts-ignore
                const aJustPlaced = a._just_placed ? 0 : 1;
                // @ts-ignore
                const bJustPlaced = b._just_placed ? 0 : 1;
                return bJustPlaced - aJustPlaced;
            });
            for (const carriedItem of listResortedByJustPlaced) {
                const carriedItemWeight = getItemWeight(engine, carriedItem);
                if (carriedItemWeight.completeWeight + totalCarriedWeight > carryingCapacity.carryingCapacityKg) {
                    // the item is too heavy to be carried, so it will fall on the ground
                    const amountThatCanBeCarried = Math.floor((carryingCapacity.carryingCapacityKg - totalCarriedWeight) / carriedItemWeight.singularWeight);
                    const amountThatWillFall = (carriedItem.amount || 1) - amountThatCanBeCarried;

                    carriedItem.amount = amountThatCanBeCarried;

                    let expellInsideLikelihood = 0.25;
                    let expellOnTopLikelihood = 0.5;

                    if (userHasFallen) {
                        expellInsideLikelihood = 0.5;
                        expellOnTopLikelihood = 0.75;
                    }

                    if (amountThatWillFall > 0) {
                        expellItemToFallen(carriedItem, amountThatWillFall);

                        const couldCarryEvenOneInOptimalConditions = carriedItemWeight.singularWeight <= carryingCapacity.carryingCapacityKg;
                        let storyMasterMessageSoFar = `${utilItemCount(engine, charState.location, carriedItem.owner, amountThatWillFall, carriedItem.name, true)} ${amountThatWillFall === 1 ? "is" : "are"} too heavy to be carried by ${path[1]}${!couldCarryEvenOneInOptimalConditions ? "" : " who is already carrying too much weight,"} and ${amountThatWillFall === 1 ? "it falls" : "they fall"} on the ground at the ${expectedPathForFallenItems[1]}.`;
                        if (!couldCarryEvenOneInOptimalConditions) {
                            let exceedCapacityBy = carriedItemWeight.singularWeight / carryingCapacity.carryingCapacityKg;
                            if (exceedCapacityBy > 5) {
                                exceedCapacityBy = 5;
                            }
                            const chanceOfFalling = exceedCapacityBy / 5;
                            const hasFallen = Math.random() < chanceOfFalling;
                            if (hasFallen) {
                                userHasFallen = true;
                                const itemIsPotentiallyBiggerThanCharacter = getItemVolume(engine, carriedItem).singularVolume > engine.deObject.characters[path[1]].weightKg; // rough check
                                const fallingVariations = itemIsPotentiallyBiggerThanCharacter ? [
                                    ` Since the item is so heavy, ${path[1]} also falls down while trying to carry it, crumbling under its weight and hitting the ground next to it.`,
                                    ` The sheer weight of the item drags ${path[1]} down, and they collapse to the ground beside it, unable to bear the load.`,
                                    ` ${path[1]} buckles under the crushing weight of the item, their legs giving way as they topple to the ground next to it.`,
                                    ` Overwhelmed by how heavy the item is, ${path[1]} loses their footing and crashes to the ground alongside it.`,
                                ] : [
                                    ` Since the item is so heavy, ${path[1]} also falls down while trying to carry it, slamming with the item on the ground.`,
                                    ` The weight of the item catches ${path[1]} off guard, pulling them off balance and sending them to the ground with it.`,
                                    ` ${path[1]} staggers under the unexpected weight and crumples to the ground, the heavy item landing beside them.`,
                                    ` Unable to support the item's weight any longer, ${path[1]} stumbles and drops to the ground along with it.`,
                                ];
                                storyMasterMessageSoFar += fallingVariations[Math.floor(Math.random() * fallingVariations.length)];

                                expellInsideLikelihood = 0.5;
                                expellOnTopLikelihood = 1;
                            }
                        }

                        if (carriedItemWeight.allCharactersInvolved.length > 0) {
                            const willExpellOnTop = Math.random() < expellOnTopLikelihood;
                            const willExpellInside = Math.random() < expellInsideLikelihood;
                            const willExpellAnyRemainingCharacters = willExpellOnTop || willExpellInside;

                            const expelledCharacters = [];

                            if (carriedItemWeight.charactersOnlyDirectlyInside.length > 0) {
                                if (willExpellInside) {
                                    expelledCharacters.push(...carriedItemWeight.charactersOnlyDirectlyInside);
                                }
                                const insideNames = engine.deObject.functions.format_and(engine.deObject, null, carriedItemWeight.charactersOnlyDirectlyInside);
                                const insideItemName = utilItemCount(engine, charState.location, carriedItem.owner, 1, carriedItem.name, false, true);
                                const insidePlural = carriedItemWeight.charactersOnlyDirectlyInside.length === 1;
                                const insideVariations = willExpellInside ? (
                                    userHasFallen ? [
                                        ` ${capitalizeFirstLetter(insideNames)}, who ${insidePlural ? "was" : "were"} inside ${insideItemName}, ${insidePlural ? "is" : "are"} violently thrown out as the heavy item crashes to the ground under its own weight.`,
                                        ` The crushing weight brings ${insideItemName} down hard, and the impact sends ${insideNames} tumbling out from inside.`,
                                        ` ${capitalizeFirstLetter(insideNames)} ${insidePlural ? "is" : "are"} flung out of ${insideItemName} as its weight drags it to the ground with brutal force.`,
                                        ` As the weight of ${insideItemName} slams it into the ground, ${insideNames} ${insidePlural ? "is" : "are"} ejected from inside by the heavy impact.`,
                                    ] : [
                                        ` ${capitalizeFirstLetter(insideNames)}, who ${insidePlural ? "was" : "were"} inside ${insideItemName}, ${insidePlural ? "slides" : "slide"} out as the heavy item tips over from its weight.`,
                                        ` ${capitalizeFirstLetter(insideNames)} ${insidePlural ? "tumbles" : "tumble"} out of ${insideItemName} as it drops under its own weight, ending up on the ground.`,
                                        ` The weight of ${insideItemName} causes it to fall, and ${insideNames} ${insidePlural ? "spills" : "spill"} out from inside.`,
                                        ` As ${insideItemName} sinks to the ground from sheer weight, ${insideNames} ${insidePlural ? "is" : "are"} expelled from inside.`,
                                    ]
                                ) : (
                                    userHasFallen ? [
                                        ` ${capitalizeFirstLetter(insideNames)}, still inside ${insideItemName}, ${insidePlural ? "is" : "are"} rattled around violently as the heavy item crashes down under its weight.`,
                                        ` The brutal weight-driven impact shakes ${insideNames} inside ${insideItemName}, though ${insidePlural ? "they remain" : "they remain"} trapped within.`,
                                        ` ${capitalizeFirstLetter(insideNames)} ${insidePlural ? "is" : "are"} jolted hard inside ${insideItemName} as its weight slams it into the ground, but ${insidePlural ? "stays" : "stay"} within.`,
                                        ` Still inside ${insideItemName}, ${insideNames} ${insidePlural ? "feels" : "feel"} the full force as the item's weight brings it crashing down, though ${insidePlural ? "they don't" : "they don't"} come out.`,
                                    ] : [
                                        ` Since ${insideNames} ${insidePlural ? "is" : "are"} inside of ${insideItemName}, ${engine.getDEObject().functions.format_pronoun(engine.getDEObject(), null, carriedItemWeight.charactersOnlyDirectlyInside)} also fall${insidePlural ? "s" : ""} down while remaining inside the object as it drops from the weight.`,
                                        ` ${capitalizeFirstLetter(insideNames)}, tucked inside ${insideItemName}, ${insidePlural ? "goes" : "go"} down with it as the weight pulls it to the ground, staying inside.`,
                                        ` ${capitalizeFirstLetter(insideNames)} ${insidePlural ? "remains" : "remain"} inside ${insideItemName} as the heavy item falls to the ground.`,
                                        ` Still inside ${insideItemName}, ${insideNames} go${insidePlural ? "es" : ""} down with it.`,
                                    ]
                                );
                                storyMasterMessageSoFar += insideVariations[Math.floor(Math.random() * insideVariations.length)];
                            }
                            if (carriedItemWeight.charactersOnlyDirectlyOnTop.length > 0) {
                                if (willExpellOnTop) {
                                    expelledCharacters.push(...carriedItemWeight.charactersOnlyDirectlyOnTop);
                                }
                                const onTopNames = engine.deObject.functions.format_and(engine.deObject, null, carriedItemWeight.charactersOnlyDirectlyOnTop);
                                const onTopItemName = utilItemCount(engine, charState.location, carriedItem.owner, 1, carriedItem.name, false, true);
                                const onTopPlural = carriedItemWeight.charactersOnlyDirectlyOnTop.length === 1;
                                const onTopVariations = willExpellOnTop ? (
                                    userHasFallen ? [
                                        ` ${capitalizeFirstLetter(onTopNames)}, who ${onTopPlural ? "was" : "were"} on top of ${onTopItemName}, ${onTopPlural ? "is" : "are"} launched off as the heavy item crashes to the ground under its weight.`,
                                        ` The weight of ${onTopItemName} pulls it down hard, hurling ${onTopNames} off the top and onto the ground.`,
                                        ` ${capitalizeFirstLetter(onTopNames)} ${onTopPlural ? "is" : "are"} thrown clear off ${onTopItemName} as its weight smashes it into the ground, landing roughly nearby.`,
                                        ` As the weight of ${onTopItemName} slams it down, ${onTopNames} ${onTopPlural ? "is" : "are"} catapulted off the top and sent sprawling across the ground.`,
                                    ] : [
                                        ` ${capitalizeFirstLetter(onTopNames)}, who ${onTopPlural ? "was" : "were"} perched on top of ${onTopItemName}, ${onTopPlural ? "slides" : "slide"} off as the heavy item drops from its weight.`,
                                        ` ${capitalizeFirstLetter(onTopNames)} ${onTopPlural ? "topples" : "topple"} off ${onTopItemName} as the weight pulls it down, ending up on the ground.`,
                                        ` The weight of ${onTopItemName} tips it over, sending ${onTopNames} sliding off the top to the ground.`,
                                        ` As ${onTopItemName} sinks under its own weight, ${onTopNames} ${onTopPlural ? "loses" : "lose"} ${onTopPlural ? "their" : "their"} balance on top and ${onTopPlural ? "falls" : "fall"} to the ground.`,
                                    ]
                                ) : (
                                    userHasFallen ? [
                                        ` ${capitalizeFirstLetter(onTopNames)}, still on top of ${onTopItemName}, ${onTopPlural ? "is" : "are"} shaken hard as the heavy item crashes down under its weight, but ${onTopPlural ? "manages" : "manage"} to hold on.`,
                                        ` The violent weight-driven impact rattles ${onTopNames} atop ${onTopItemName}, though ${onTopPlural ? "they cling" : "they cling"} on for dear life.`,
                                        ` ${capitalizeFirstLetter(onTopNames)} ${onTopPlural ? "is" : "are"} jarred atop ${onTopItemName} as its weight slams it down, barely staying on.`,
                                        ` Despite the heavy crash, ${onTopNames} ${onTopPlural ? "remains" : "remain"} clinging to the top of ${onTopItemName} as its weight brings it down.`,
                                    ] : [
                                        ` Since ${onTopNames} ${onTopPlural ? "is" : "are"} on top of ${onTopItemName}, they also fall down while remaining on top as the heavy item drops.`,
                                        ` ${capitalizeFirstLetter(onTopNames)}, riding on top of ${onTopItemName}, ${onTopPlural ? "goes" : "go"} down with it as the weight pulls it to the ground, staying put on top.`,
                                        ` ${capitalizeFirstLetter(onTopNames)} ${onTopPlural ? "remains" : "remain"} on top of ${onTopItemName} as the heavy item falls to the ground.`,
                                        ` Still perched on ${onTopItemName}, ${onTopNames} ${onTopPlural ? "is" : "are"} brought down along with it as the weight becomes too much.`,
                                    ]
                                );
                                storyMasterMessageSoFar += onTopVariations[Math.floor(Math.random() * onTopVariations.length)];
                            }
                            const remainingCharacters = carriedItemWeight.allCharactersInvolved.filter((char) => !carriedItemWeight.charactersOnlyDirectlyInside.includes(char) && !carriedItemWeight.charactersOnlyDirectlyOnTop.includes(char));
                            if (remainingCharacters.length > 0) {
                                if (willExpellAnyRemainingCharacters) {
                                    expelledCharacters.push(...remainingCharacters);
                                }
                                const remainNames = engine.deObject.functions.format_and(engine.deObject, null, remainingCharacters);
                                const remainItemName = utilItemCount(engine, charState.location, carriedItem.owner, 1, carriedItem.name, false, true);
                                const remainPlural = remainingCharacters.length === 1;
                                const remainVariations = willExpellAnyRemainingCharacters ? (
                                    userHasFallen ? [
                                        ` ${capitalizeFirstLetter(remainNames)}, also caught up with ${remainItemName}, ${remainPlural ? "is" : "are"} thrown free as the heavy item's weight brings it crashing down.`,
                                        ` The weight-driven impact dislodges ${remainNames} from ${remainItemName}, sending them tumbling across the ground.`,
                                        ` ${capitalizeFirstLetter(remainNames)} ${remainPlural ? "is" : "are"} ripped away from ${remainItemName} as its weight slams it down, ending up scattered on the ground.`,
                                        ` As the weight of ${remainItemName} crashes it to the ground, ${remainNames} ${remainPlural ? "is" : "are"} shaken loose and tossed onto the ground.`,
                                    ] : [
                                        ` ${capitalizeFirstLetter(remainNames)}, also involved with ${remainItemName}, ${remainPlural ? "is" : "are"} dislodged as the heavy item drops under its weight.`,
                                        ` ${capitalizeFirstLetter(remainNames)} ${remainPlural ? "comes" : "come"} loose from ${remainItemName} as the weight pulls it down, landing on the ground.`,
                                        ` The weight of ${remainItemName} drags it down, separating ${remainNames} from it in the process.`,
                                        ` As ${remainItemName} gives way under its own weight, ${remainNames} ${remainPlural ? "is" : "are"} shaken free and left on the ground.`,
                                    ]
                                ) : (
                                    userHasFallen ? [
                                        ` ${capitalizeFirstLetter(remainNames)}, also involved with ${remainItemName}, ${remainPlural ? "is" : "are"} rattled by the violent weight-driven crash but ${remainPlural ? "stays" : "stay"} in place.`,
                                        ` The heavy impact shakes ${remainNames}, still associated with ${remainItemName}, but ${remainPlural ? "they hold" : "they hold"} their position.`,
                                        ` ${capitalizeFirstLetter(remainNames)} ${remainPlural ? "is" : "are"} jolted as the weight of ${remainItemName} crashes it down, but ${remainPlural ? "manages" : "manage"} to stay where ${remainPlural ? "they are" : "they are"}.`,
                                        ` Despite the heavy item's violent fall, ${remainNames} ${remainPlural ? "remains" : "remain"} where ${remainPlural ? "they were" : "they were"} on ${remainItemName}, shaken but in place.`,
                                    ] : [
                                        ` Since ${remainNames} ${remainPlural ? "is" : "are"} also involved with ${remainItemName}, they also fall down while remaining where they are as the heavy item drops.`,
                                        ` ${capitalizeFirstLetter(remainNames)}, also associated with ${remainItemName}, ${remainPlural ? "goes" : "go"} down with it as the weight takes it to the ground, staying in place.`,
                                        ` ${capitalizeFirstLetter(remainNames)} ${remainPlural ? "remains" : "remain"} in position as the weight of ${remainItemName} brings it to the ground.`,
                                        ` Still attached to ${remainItemName}, ${remainNames} ${remainPlural ? "is" : "are"} carried down as the heavy item gives way, but ${remainPlural ? "stays" : "stay"} where ${remainPlural ? "they were" : "they were"}.`,
                                    ]
                                );
                                storyMasterMessageSoFar += remainVariations[Math.floor(Math.random() * remainVariations.length)];
                            }
                        }
                        addedMessagesForStoryMaster.push(storyMasterMessageSoFar);
                    }

                    totalCarriedWeight += carriedItemWeight.singularWeight * amountThatCanBeCarried;
                } else {
                    totalCarriedWeight += carriedItemWeight.completeWeight;
                }
            }
            for (const carriedItem of listResortedByJustPlaced) {
                const carriedItemVolume = getItemVolume(engine, carriedItem);
                if (carriedItemVolume.completeVolume + totalCarriedVolume > carryingCapacity.carryingCapacityLiters) {
                    // the item is too large to be carried, so it will fall on the ground
                    const amountThatCanBeCarried = Math.floor((carryingCapacity.carryingCapacityLiters - totalCarriedVolume) / carriedItemVolume.singularVolume);
                    const amountThatWillFall = (carriedItem.amount || 1) - amountThatCanBeCarried;

                    carriedItem.amount = amountThatCanBeCarried;

                    if (amountThatWillFall > 0) {
                        expellItemToFallen(carriedItem, amountThatWillFall);

                        const couldCarryEvenOneInOptimalConditions = carriedItemVolume.singularVolume <= carryingCapacity.carryingCapacityLiters;
                        let storyMasterMessageSoFar = `${utilItemCount(engine, charState.location, carriedItem.owner, amountThatWillFall, carriedItem.name, true)} ${amountThatWillFall === 1 ? "is" : "are"} too large to be carried by ${path[1]}${!couldCarryEvenOneInOptimalConditions ? "" : " who is already carrying too many items,"} and ${amountThatWillFall === 1 ? "it falls" : "they fall"} on the ground at the ${expectedPathForFallenItems[1]}.`;

                        let expellInsideLikelihood = 0.25;
                        let expellOnTopLikelihood = 0.5;

                        if (userHasFallen) {
                            expellInsideLikelihood = 0.5;
                            expellOnTopLikelihood = 0.75;
                        }

                        // no point in saying they fell down twice
                        if (!couldCarryEvenOneInOptimalConditions && !userHasFallen) {
                            let exceedCapacityBy = carriedItemVolume.singularVolume / carryingCapacity.carryingCapacityLiters;
                            if (exceedCapacityBy > 5) {
                                exceedCapacityBy = 5;
                            }
                            const chanceOfFalling = exceedCapacityBy / 5;
                            const hasFallen = Math.random() < chanceOfFalling;
                            if (hasFallen) {
                                userHasFallen = true;
                                const itemIsPotentiallyBiggerThanCharacter = carriedItemVolume.singularVolume > engine.deObject.characters[path[1]].weightKg; // rough check
                                const fallingVariations = itemIsPotentiallyBiggerThanCharacter ? [
                                    ` Since the item is so large, ${path[1]} also falls down while trying to carry it, tumbling to the ground alongside the oversized item.`,
                                    ` The item dwarfs ${path[1]} entirely, and they buckle under its sheer size, collapsing to the ground next to it.`,
                                    ` ${path[1]} staggers under the enormous item before losing their footing and crumpling to the ground beside it.`,
                                    ` Overwhelmed by the massive item, ${path[1]} loses their grip and topples over, landing on the ground next to it.`,
                                ] : [
                                    ` Since the item is so large, ${path[1]} also falls down while trying to carry it, slamming with the item on the ground.`,
                                    ` The unwieldy item throws ${path[1]} off balance, sending them sprawling to the ground with it.`,
                                    ` ${path[1]} stumbles under the item's bulk and crashes to the ground, the item landing beside them.`,
                                    ` Unable to keep a steady hold, ${path[1]} trips and goes down hard, dropping to the ground along with the item.`,
                                ];
                                storyMasterMessageSoFar += fallingVariations[Math.floor(Math.random() * fallingVariations.length)];
                                expellInsideLikelihood = 0.5;
                                expellOnTopLikelihood = 1;
                            }
                        }

                        if (carriedItemVolume.allCharactersInvolved.length > 0) {
                            const willExpellOnTop = Math.random() < expellOnTopLikelihood;
                            const willExpellInside = Math.random() < expellInsideLikelihood;
                            const willExpellAnyRemainingCharacters = willExpellOnTop || willExpellInside;

                            const expelledCharacters = [];
                            if (carriedItemVolume.charactersOnlyDirectlyInside.length > 0) {
                                if (willExpellInside) {
                                    expelledCharacters.push(...carriedItemVolume.charactersOnlyDirectlyInside);
                                }
                                const insideNames = engine.deObject.functions.format_and(engine.deObject, null, carriedItemVolume.charactersOnlyDirectlyInside);
                                const insideItemName = utilItemCount(engine, charState.location, carriedItem.owner, 1, carriedItem.name, false, true);
                                const insidePlural = carriedItemVolume.charactersOnlyDirectlyInside.length === 1;
                                const insideVariations = willExpellInside ? (
                                    userHasFallen ? [
                                        ` ${capitalizeFirstLetter(insideNames)}, who ${insidePlural ? "was" : "were"} inside ${insideItemName}, ${insidePlural ? "is" : "are"} violently thrown out as the item crashes to the ground.`,
                                        ` The hard impact sends ${insideNames} tumbling out of ${insideItemName}, ejected from the inside as it slams down.`,
                                        ` ${capitalizeFirstLetter(insideNames)} ${insidePlural ? "is" : "are"} flung out of ${insideItemName} from the force of the crash, rolling onto the ground.`,
                                        ` As ${insideItemName} hits the ground hard, ${insideNames} ${insidePlural ? "is" : "are"} catapulted out of it by the violent impact.`,
                                    ] : [
                                        ` ${capitalizeFirstLetter(insideNames)}, who ${insidePlural ? "was" : "were"} inside ${insideItemName}, ${insidePlural ? "slides" : "slide"} out as the item tips over.`,
                                        ` ${capitalizeFirstLetter(insideNames)} ${insidePlural ? "tumbles" : "tumble"} out of ${insideItemName} as it falls, ending up on the ground.`,
                                        ` The fall causes ${insideNames} to spill out of ${insideItemName}, landing on the ground nearby.`,
                                        ` As ${insideItemName} drops, ${insideNames} ${insidePlural ? "is" : "are"} expelled from inside, ending up on the ground.`,
                                    ]
                                ) : (
                                    userHasFallen ? [
                                        ` ${capitalizeFirstLetter(insideNames)}, still inside ${insideItemName}, ${insidePlural ? "is" : "are"} rattled around violently as the item crashes to the ground.`,
                                        ` The brutal impact shakes ${insideNames} inside ${insideItemName}, though ${insidePlural ? "they remain" : "they remain"} trapped within.`,
                                        ` ${capitalizeFirstLetter(insideNames)} ${insidePlural ? "is" : "are"} jolted hard inside ${insideItemName} as it slams into the ground, but ${insidePlural ? "stays" : "stay"} within.`,
                                        ` Still inside ${insideItemName}, ${insideNames} ${insidePlural ? "feels" : "feel"} the full force of the crash, though ${insidePlural ? "they don't" : "they don't"} come out.`,
                                    ] : [
                                        ` Since ${insideNames} ${insidePlural ? "is" : "are"} inside of ${insideItemName}, they also fall down while remaining inside the object.`,
                                        ` ${capitalizeFirstLetter(insideNames)}, tucked inside ${insideItemName}, ${insidePlural ? "goes" : "go"} down with it, staying inside as it hits the ground.`,
                                        ` ${capitalizeFirstLetter(insideNames)} ${insidePlural ? "remains" : "remain"} inside ${insideItemName} as it falls to the ground.`,
                                        ` Still inside ${insideItemName}, ${insideNames} ${insidePlural ? "is" : "are"} carried down with it as it drops.`,
                                    ]
                                );
                                storyMasterMessageSoFar += insideVariations[Math.floor(Math.random() * insideVariations.length)];
                            }
                            if (carriedItemVolume.charactersOnlyDirectlyOnTop.length > 0) {
                                if (willExpellOnTop) {
                                    expelledCharacters.push(...carriedItemVolume.charactersOnlyDirectlyOnTop);
                                }
                                const onTopNames = engine.deObject.functions.format_and(engine.deObject, null, carriedItemVolume.charactersOnlyDirectlyOnTop);
                                const onTopItemName = utilItemCount(engine, charState.location, carriedItem.owner, 1, carriedItem.name, false, true);
                                const onTopPlural = carriedItemVolume.charactersOnlyDirectlyOnTop.length === 1;
                                const onTopVariations = willExpellOnTop ? (
                                    userHasFallen ? [
                                        ` ${capitalizeFirstLetter(onTopNames)}, who ${onTopPlural ? "was" : "were"} on top of ${onTopItemName}, ${onTopPlural ? "is" : "are"} launched off by the violent crash, hitting the ground hard.`,
                                        ` The force of the impact hurls ${onTopNames} off ${onTopItemName}, sending them crashing to the ground.`,
                                        ` ${capitalizeFirstLetter(onTopNames)} ${onTopPlural ? "is" : "are"} thrown clear off ${onTopItemName} as it smashes into the ground, landing roughly nearby.`,
                                        ` As ${onTopItemName} slams down, ${onTopNames} ${onTopPlural ? "is" : "are"} catapulted off the top and sent sprawling across the ground.`,
                                    ] : [
                                        ` ${capitalizeFirstLetter(onTopNames)}, who ${onTopPlural ? "was" : "were"} perched on top of ${onTopItemName}, ${onTopPlural ? "slides" : "slide"} off as it falls, landing on the ground.`,
                                        ` ${capitalizeFirstLetter(onTopNames)} ${onTopPlural ? "topples" : "topple"} off ${onTopItemName} as it goes down, ending up on the ground.`,
                                        ` The fall tips ${onTopNames} off the top of ${onTopItemName}, depositing them on the ground.`,
                                        ` As ${onTopItemName} drops, ${onTopNames} ${onTopPlural ? "loses" : "lose"} ${onTopPlural ? "their" : "their"} balance on top and ${onTopPlural ? "falls" : "fall"} to the ground.`,
                                    ]
                                ) : (
                                    userHasFallen ? [
                                        ` ${capitalizeFirstLetter(onTopNames)}, still on top of ${onTopItemName}, ${onTopPlural ? "is" : "are"} shaken hard as the item crashes to the ground, but ${onTopPlural ? "manages" : "manage"} to hold on.`,
                                        ` The violent impact rattles ${onTopNames} atop ${onTopItemName}, though ${onTopPlural ? "they cling" : "they cling"} on for dear life.`,
                                        ` ${capitalizeFirstLetter(onTopNames)} ${onTopPlural ? "is" : "are"} jarred atop ${onTopItemName} as it slams down, barely staying on.`,
                                        ` Despite the brutal crash, ${onTopNames} ${onTopPlural ? "remains" : "remain"} clinging to the top of ${onTopItemName} as it hits the ground.`,
                                    ] : [
                                        ` Since ${onTopNames} ${onTopPlural ? "is" : "are"} on top of ${onTopItemName}, they also fall down while remaining on top of the object.`,
                                        ` ${capitalizeFirstLetter(onTopNames)}, riding on top of ${onTopItemName}, ${onTopPlural ? "goes" : "go"} down with it, staying put on top.`,
                                        ` ${capitalizeFirstLetter(onTopNames)} ${onTopPlural ? "remains" : "remain"} on top of ${onTopItemName} as it falls to the ground.`,
                                        ` Still perched on ${onTopItemName}, ${onTopNames} ${onTopPlural ? "is" : "are"} brought down along with it.`,
                                    ]
                                );
                                storyMasterMessageSoFar += onTopVariations[Math.floor(Math.random() * onTopVariations.length)];
                            }
                            const remainingCharacters = carriedItemVolume.allCharactersInvolved.filter((char) => !carriedItemVolume.charactersOnlyDirectlyInside.includes(char) && !carriedItemVolume.charactersOnlyDirectlyOnTop.includes(char));
                            if (remainingCharacters.length > 0) {
                                if (willExpellAnyRemainingCharacters) {
                                    expelledCharacters.push(...remainingCharacters);
                                }
                                const remainNames = engine.deObject.functions.format_and(engine.deObject, null, remainingCharacters);
                                const remainItemName = utilItemCount(engine, charState.location, carriedItem.owner, 1, carriedItem.name, false, true);
                                const remainPlural = remainingCharacters.length === 1;
                                const remainVariations = willExpellAnyRemainingCharacters ? (
                                    userHasFallen ? [
                                        ` ${capitalizeFirstLetter(remainNames)}, also caught up with ${remainItemName}, ${remainPlural ? "is" : "are"} thrown free by the force of the crash, landing hard on the ground.`,
                                        ` The violent impact dislodges ${remainNames} from ${remainItemName}, sending them tumbling across the ground.`,
                                        ` ${capitalizeFirstLetter(remainNames)} ${remainPlural ? "is" : "are"} ripped away from ${remainItemName} as it crashes down, ending up scattered on the ground.`,
                                        ` As ${remainItemName} hits the ground with force, ${remainNames} ${remainPlural ? "is" : "are"} shaken loose and tossed onto the ground.`,
                                    ] : [
                                        ` ${capitalizeFirstLetter(remainNames)}, also involved with ${remainItemName}, ${remainPlural ? "is" : "are"} dislodged as it falls, ending up on the ground.`,
                                        ` ${capitalizeFirstLetter(remainNames)} ${remainPlural ? "comes" : "come"} loose from ${remainItemName} during the fall, landing on the ground.`,
                                        ` The drop separates ${remainNames} from ${remainItemName}, leaving them on the ground.`,
                                        ` As ${remainItemName} goes down, ${remainNames} ${remainPlural ? "is" : "are"} shaken free and left on the ground.`,
                                    ]
                                ) : (
                                    userHasFallen ? [
                                        ` ${capitalizeFirstLetter(remainNames)}, also involved with ${remainItemName}, ${remainPlural ? "is" : "are"} rattled by the violent crash but ${remainPlural ? "stays" : "stay"} in place.`,
                                        ` The hard impact shakes ${remainNames}, still associated with ${remainItemName}, but ${remainPlural ? "they hold" : "they hold"} their position.`,
                                        ` ${capitalizeFirstLetter(remainNames)} ${remainPlural ? "is" : "are"} jolted as ${remainItemName} crashes down, but ${remainPlural ? "manages" : "manage"} to stay where ${remainPlural ? "they are" : "they are"}.`,
                                        ` Despite the violent fall, ${remainNames} ${remainPlural ? "remains" : "remain"} where ${remainPlural ? "they were" : "they were"} on ${remainItemName}, shaken but in place.`,
                                    ] : [
                                        ` Since ${remainNames} ${remainPlural ? "is" : "are"} also involved with ${remainItemName}, they also fall down while remaining where they are.`,
                                        ` ${capitalizeFirstLetter(remainNames)}, also associated with ${remainItemName}, ${remainPlural ? "goes" : "go"} down with it, staying in place.`,
                                        ` ${capitalizeFirstLetter(remainNames)} ${remainPlural ? "remains" : "remain"} in position as ${remainItemName} falls, going down along with it.`,
                                        ` Still attached to ${remainItemName}, ${remainNames} ${remainPlural ? "is" : "are"} carried down but ${remainPlural ? "stays" : "stay"} where ${remainPlural ? "they were" : "they were"}.`,
                                    ]
                                );
                                storyMasterMessageSoFar += remainVariations[Math.floor(Math.random() * remainVariations.length)];
                            }
                        }

                        addedMessagesForStoryMaster.push(storyMasterMessageSoFar);
                    }

                    totalCarriedVolume += carriedItemVolume.singularVolume * amountThatCanBeCarried;
                } else {
                    totalCarriedVolume += carriedItemVolume.completeVolume;
                }
            }
        }

        if (path[2] === "wearing") {
            let totalCarriedWeight = 0;
            const charState = engine.deObject.stateFor[path[1]];
            for (const carriedItem of charState.carrying) {
                const carriedItemWeight = getItemWeight(engine, carriedItem);
                totalCarriedWeight += carriedItemWeight.completeWeight;
            }
            for (const carriedCharacter of charState.carryingCharactersDirectly) {
                const carriedCharacterWeight = getCharacterWeight(engine, carriedCharacter);
                totalCarriedWeight += carriedCharacterWeight.weight;
            }

            const listResortedByJustPlaced = [...list].sort((a, b) => {
                // @ts-ignore
                const aJustPlaced = a._just_placed ? 0 : 1;
                // @ts-ignore
                const bJustPlaced = b._just_placed ? 0 : 1;
                return bJustPlaced - aJustPlaced;
            });
            let totalWornWeight = 0;
            for (const wornItem of listResortedByJustPlaced) {
                const wornItemWeight = getItemWeight(engine, wornItem);

                const wearableFitment = getWearableFitment(
                    engine,
                    wornItem,
                    // @ts-ignore
                    path[1],
                );

                if (wearableFitment.shouldBreak) {
                    const copy = deepCopyItem(wornItem);
                    copy.ontopCharacters = [];
                    copy.containingCharacters = [];

                    await updateItemAfterHappenance(
                        engine,
                        copy,
                        "got worn by a large character and that caused it to expand and break",
                        lastCycleMessages,
                        {
                            breaks: "EXPLODED_CLOTHING",
                            location: charState.location,
                            // @ts-ignore
                            locationSlotFalls: expectedPathForFallenItems[1],
                            // @ts-ignore
                            breakerCharName: path[1],
                            // @ts-ignore
                            reason: wearableFitment.breakReason,
                        },
                        true,
                        addedMessagesForStoryMaster,
                    );

                    // Expelling contained and ontop items
                    for (const itemContained of copy.containing) {
                        expellItemToFallen(itemContained, itemContained.amount || 1);
                        itemContained.amount = 0;
                    }
                    for (const ontopItem of copy.ontop) {
                        expellItemToFallen(ontopItem, ontopItem.amount || 1);
                        ontopItem.amount = 0;
                    }

                    // Extremely unlikely
                    let foundAlready = false;
                    for (const item of resolvedFallenItems.resolved.items) {
                        if (deepEqualItem(item, copy)) {
                            item.amount += copy.amount || 1;
                            foundAlready = true;
                            break;
                        }
                    }
                    if (!foundAlready) {
                        resolvedFallenItems.resolved.items.push(copy);
                    }

                    wornItem.amount = 0;
                } else if (wearableFitment.shouldFallDown) {
                    expellItemToFallen(wornItem, wornItem.amount || 1);
                    wornItem.amount = 0;
                    if (wornItem.wearableProperties) {
                        const wearItemDesc = utilItemCount(engine, charState.location, wornItem.owner, wornItem.amount || 1, wornItem.name, true, true);
                        const wearSingular = wornItem.amount === 1;
                        const tooLargeWearVariations = [
                            `${wearItemDesc} ${wearSingular ? "is" : "are"} too large to fit on ${path[1]} and ${wearSingular ? "falls" : "fall"} down from it onto the ground at the ${expectedPathForFallenItems[1]}.`,
                            `${wearItemDesc} ${wearSingular ? "is" : "are"} far too loose on ${path[1]} and ${wearSingular ? "slides" : "slide"} right off, dropping to the ground at the ${expectedPathForFallenItems[1]}.`,
                            `${path[1]} can't keep ${wearItemDesc} on — ${wearSingular ? "it's" : "they're"} too large and ${wearSingular ? "slips" : "slip"} off onto the ground at the ${expectedPathForFallenItems[1]}.`,
                            `Too large to stay on ${path[1]}, ${wearItemDesc} ${wearSingular ? "falls" : "fall"} off and ${wearSingular ? "lands" : "land"} on the ground at the ${expectedPathForFallenItems[1]}.`,
                        ];
                        addedMessagesForStoryMaster.push(tooLargeWearVariations[Math.floor(Math.random() * tooLargeWearVariations.length)]);
                    } else {
                        const wearItemDesc = utilItemCount(engine, charState.location, wornItem.owner, wornItem.amount || 1, wornItem.name, true, true);
                        const wearSingular = wornItem.amount === 1;
                        const notWearableVariations = [
                            `${wearItemDesc} ${wearSingular ? "is" : "are"} not possible to wear by ${path[1]} and ${wearSingular ? "falls" : "fall"} down from it onto the ground at the ${expectedPathForFallenItems[1]}.`,
                            `${path[1]} can't wear ${wearItemDesc} — ${wearSingular ? "it" : "they"} simply ${wearSingular ? "won't" : "won't"} stay on, and ${wearSingular ? "drops" : "drop"} to the ground at the ${expectedPathForFallenItems[1]}.`,
                            `${wearItemDesc} ${wearSingular ? "isn't" : "aren't"} something ${path[1]} can wear, and ${wearSingular ? "it slides" : "they slide"} off onto the ground at the ${expectedPathForFallenItems[1]}.`,
                            `Unable to wear ${wearItemDesc}, ${path[1]} loses hold of ${wearSingular ? "it" : "them"} and ${wearSingular ? "it falls" : "they fall"} to the ground at the ${expectedPathForFallenItems[1]}.`,
                        ];
                        addedMessagesForStoryMaster.push(notWearableVariations[Math.floor(Math.random() * notWearableVariations.length)]);
                    }
                } else {
                    totalWornWeight += wornItemWeight.completeWeight;
                    // @ts-ignore
                    if (wornItem._just_placed && cycle === "first") {
                        // only on the first cycle because this will keep appearing over and over otherwise
                        const fitmentInfo = `${wornItem.amount === 1 ? "it" : "they"} ${wearableFitment.fitment}`;
                        const wornDesc = utilItemCount(engine, charState.location, wornItem.owner, wornItem.amount || 1, wornItem.name, true, true);
                        const wornVariations = [
                            `${wornDesc} is now worn by ${path[1]}, ${fitmentInfo}.`,
                            `${path[1]} is now wearing ${wornDesc}, ${fitmentInfo}.`,
                            `${path[1]} puts on ${wornDesc} — ${fitmentInfo}.`
                        ];
                        addedMessagesForStoryMaster.push(wornVariations[Math.floor(Math.random() * wornVariations.length)]);
                    }
                }

                if (wearableFitment.shouldFallDown && !wearableFitment.shouldBreak) {
                    if (wornItemWeight.allCharactersInvolved.length > 0) {
                        const charState = engine.deObject.stateFor[path[1]];
                        const expelledLikelyHoodInside = 0.5;
                        const expelledLikelyHoodOnTop = 0.5;
                        const expelledCharacters = [];

                        const willExpellInside = Math.random() < expelledLikelyHoodInside;
                        const willExpellOnTop = Math.random() < expelledLikelyHoodOnTop;
                        const willExpellAnyRemainingCharacters = willExpellInside || willExpellOnTop;

                        if (wornItemWeight.charactersOnlyDirectlyInside.length > 0) {
                            if (willExpellInside) {
                                expelledCharacters.push(...wornItemWeight.charactersOnlyDirectlyInside);
                            }
                            const insideNames = engine.deObject.functions.format_and(engine.deObject, null, wornItemWeight.charactersOnlyDirectlyInside);
                            const insideItemName = utilItemCount(engine, charState.location, wornItem.owner, 1, wornItem.name, false, true);
                            const insidePlural = wornItemWeight.charactersOnlyDirectlyInside.length === 1;
                            const insideVariations = willExpellInside ? [
                                `${insideNames}, who ${insidePlural ? "was" : "were"} inside ${insideItemName}, ${insidePlural ? "tumbles" : "tumble"} out as the oversized garment slides off and hits the ground at ${expectedPathForFallenItems[1]}.`,
                                `As ${insideItemName} slips off, ${insideNames} ${insidePlural ? "is" : "are"} shaken loose from inside and ${insidePlural ? "rolls" : "roll"} out onto the ground at ${expectedPathForFallenItems[1]}.`,
                                `The loose clothing falls away and ${insideNames} ${insidePlural ? "spills" : "spill"} out from inside ${insideItemName}, ending up on the ground at ${expectedPathForFallenItems[1]}.`,
                                `${insideNames} ${insidePlural ? "is" : "are"} tossed out of ${insideItemName} as the garment drops off, landing on the ground at ${expectedPathForFallenItems[1]}.`,
                            ] : [
                                `${insideNames}, who ${insidePlural ? "was" : "were"} inside ${insideItemName}, ${insidePlural ? "falls" : "fall"} down with it, still tucked inside the clothing as it hits the ground.`,
                                `${insideNames}, nestled inside ${insideItemName}, ${insidePlural ? "tumbles" : "tumble"} to the ground along with the garment, rolling to a stop while still inside it.`,
                                `As ${insideItemName} slips off, ${insideNames} ${insidePlural ? "goes" : "go"} down with it, landing safely on the ground while remaining inside the clothing.`,
                                `${insideNames} ${insidePlural ? "is" : "are"} carried to the ground inside ${insideItemName} as it slides off, ending up bundled within the fallen garment.`,
                            ];
                            addedMessagesForStoryMaster.push(insideVariations[Math.floor(Math.random() * insideVariations.length)]);
                        }

                        if (wornItemWeight.charactersOnlyDirectlyOnTop.length > 0) {
                            if (willExpellOnTop) {
                                expelledCharacters.push(...wornItemWeight.charactersOnlyDirectlyOnTop);
                            }
                            const onTopNames = engine.deObject.functions.format_and(engine.deObject, null, wornItemWeight.charactersOnlyDirectlyOnTop);
                            const onTopItemName = utilItemCount(engine, charState.location, wornItem.owner, 1, wornItem.name, false, true);
                            const onTopPlural = wornItemWeight.charactersOnlyDirectlyOnTop.length === 1;
                            const onTopVariations = willExpellOnTop ? [
                                `${onTopNames}, who ${onTopPlural ? "was" : "were"} on top of ${onTopItemName}, ${onTopPlural ? "slides" : "slide"} off as the loose garment falls away, ending up on the ground at ${expectedPathForFallenItems[1]}.`,
                                `As ${onTopItemName} drops off, ${onTopNames} ${onTopPlural ? "is" : "are"} thrown from the top and ${onTopPlural ? "lands" : "land"} on the ground at ${expectedPathForFallenItems[1]}.`,
                                `The clothing slips off and ${onTopNames} ${onTopPlural ? "tumbles" : "tumble"} off the top of ${onTopItemName}, rolling onto the ground at ${expectedPathForFallenItems[1]}.`,
                                `${onTopNames} ${onTopPlural ? "loses" : "lose"} ${onTopPlural ? "their" : "their"} perch on ${onTopItemName} as the garment falls, ending up on the ground at ${expectedPathForFallenItems[1]}.`,
                            ] : [
                                `${onTopNames}, who ${onTopPlural ? "was" : "were"} on top of ${onTopItemName}, ${onTopPlural ? "rides" : "ride"} the garment down to the ground, staying on top of it.`,
                                `${onTopNames}, perched on ${onTopItemName}, ${onTopPlural ? "goes" : "go"} along for the ride as the clothing slips off, landing on top of the crumpled garment on the ground.`,
                                `As ${onTopItemName} slides off and falls, ${onTopNames} ${onTopPlural ? "clings" : "cling"} to the top, ending up still on top of the garment on the ground.`,
                                `${onTopNames} ${onTopPlural ? "tumbles" : "tumble"} down with ${onTopItemName} as it falls off, remaining on top of the clothing on the ground.`,
                            ];
                            addedMessagesForStoryMaster.push(onTopVariations[Math.floor(Math.random() * onTopVariations.length)]);
                        }

                        if (wornItemWeight.allCharactersInvolved.length > 0) {
                            const remainingCharacters = wornItemWeight.allCharactersInvolved.filter((char) => !wornItemWeight.charactersOnlyDirectlyInside.includes(char) && !wornItemWeight.charactersOnlyDirectlyOnTop.includes(char));
                            if (remainingCharacters.length > 0) {
                                if (willExpellAnyRemainingCharacters) {
                                    expelledCharacters.push(...remainingCharacters);
                                }
                                const remainNames = engine.deObject.functions.format_and(engine.deObject, null, remainingCharacters);
                                const remainItemName = utilItemCount(engine, charState.location, wornItem.owner, 1, wornItem.name, false, true);
                                const remainPlural = remainingCharacters.length === 1;
                                const remainVariations = willExpellAnyRemainingCharacters ? [
                                    `${remainNames}, also involved with ${remainItemName}, ${remainPlural ? "is" : "are"} shaken loose as the oversized garment falls off and ${remainPlural ? "ends" : "end"} up on the ground at ${expectedPathForFallenItems[1]}.`,
                                    `As ${remainItemName} slips off, ${remainNames} ${remainPlural ? "is" : "are"} separated from it, tumbling onto the ground at ${expectedPathForFallenItems[1]}.`,
                                    `The loose clothing drops away and ${remainNames} ${remainPlural ? "comes" : "come"} free from ${remainItemName}, landing on the ground at ${expectedPathForFallenItems[1]}.`,
                                    `${remainNames} ${remainPlural ? "is" : "are"} dislodged from ${remainItemName} as the garment falls off, ending up on the ground at ${expectedPathForFallenItems[1]}.`,
                                ] : [
                                    `${remainNames}, also involved with ${remainItemName}, ${remainPlural ? "falls" : "fall"} down with the garment, staying where ${remainPlural ? "they are" : "they are"} on the fallen clothing.`,
                                    `${remainNames}, caught up with ${remainItemName}, ${remainPlural ? "tumbles" : "tumble"} to the ground along with the clothing, remaining in place.`,
                                    `As ${remainItemName} slips off, ${remainNames} ${remainPlural ? "goes" : "go"} down with it, landing on the ground while staying put on the garment.`,
                                    `${remainNames} ${remainPlural ? "is" : "are"} taken along for the fall as ${remainItemName} slides off, ending up on the ground but still where ${remainPlural ? "they were" : "they were"}.`,
                                ];
                                addedMessagesForStoryMaster.push(remainVariations[Math.floor(Math.random() * remainVariations.length)]);
                            }
                        }
                    }
                }

                if (wearableFitment.shouldBreak) {
                    if (wornItemWeight.allCharactersInvolved.length > 0) {
                        if (wornItemWeight.charactersOnlyDirectlyInside.length > 0) {
                            const insideNames = engine.deObject.functions.format_and(engine.deObject, null, wornItemWeight.charactersOnlyDirectlyInside);
                            const insidePlural = wornItemWeight.charactersOnlyDirectlyInside.length === 1;
                            const insideVariations = [
                                `Since ${insideNames} ${insidePlural ? "was" : "were"} inside the item that just broke, ${insidePlural ? engine.deObject.functions.format_pronoun(engine.deObject, null, wornItemWeight.charactersOnlyDirectlyInside[0]) : "they"} fall${insidePlural ? "s" : ""} out from it onto the ground at the ${expectedPathForFallenItems[1]}.`,
                                `${insideNames}, who ${insidePlural ? "was" : "were"} squeezed inside the tight garment, ${insidePlural ? "is" : "are"} finally freed as it tears apart, tumbling onto the ground at ${expectedPathForFallenItems[1]}.`,
                                `The garment rips open and ${insideNames}, compressed inside it, ${insidePlural ? "spills" : "spill"} out onto the ground at ${expectedPathForFallenItems[1]}, no longer squeezed.`,
                                `As the overly tight clothing snaps apart, ${insideNames} ${insidePlural ? "is" : "are"} expelled from inside, having been squished within it, and ${insidePlural ? "lands" : "land"} on the ground at ${expectedPathForFallenItems[1]}.`,
                            ];
                            addedMessagesForStoryMaster.push(insideVariations[Math.floor(Math.random() * insideVariations.length)]);
                        }
                        if (wornItemWeight.charactersOnlyDirectlyOnTop.length > 0) {
                            const onTopNames = engine.deObject.functions.format_and(engine.deObject, null, wornItemWeight.charactersOnlyDirectlyOnTop);
                            const onTopPlural = wornItemWeight.charactersOnlyDirectlyOnTop.length === 1;
                            const onTopVariations = [
                                `Since ${onTopNames} ${onTopPlural ? "was" : "were"} on top of the item that just broke, ${onTopPlural ? engine.deObject.functions.format_pronoun(engine.deObject, null, wornItemWeight.charactersOnlyDirectlyOnTop[0]) : "they"} fall${onTopPlural ? "s" : ""} down from it onto the ground at the ${expectedPathForFallenItems[1]}.`,
                                `${onTopNames}, who ${onTopPlural ? "was" : "were"} perched on top of the garment, ${onTopPlural ? "tumbles" : "tumble"} off as it tears apart and ${onTopPlural ? "lands" : "land"} on the ground at ${expectedPathForFallenItems[1]}.`,
                                `As the clothing rips open, ${onTopNames} ${onTopPlural ? "loses" : "lose"} ${onTopPlural ? "their" : "their"} footing on top of it and ${onTopPlural ? "drops" : "drop"} to the ground at ${expectedPathForFallenItems[1]}.`,
                                `The garment breaks apart beneath ${onTopNames}, and ${onTopPlural ? "they slide" : "they slide"} off the top, ending up on the ground at ${expectedPathForFallenItems[1]}.`,
                            ];
                            addedMessagesForStoryMaster.push(onTopVariations[Math.floor(Math.random() * onTopVariations.length)]);
                        }
                        if (wornItemWeight.allCharactersInvolved.length > 0) {
                            const remainingCharacters = wornItemWeight.allCharactersInvolved.filter((char) => !wornItemWeight.charactersOnlyDirectlyInside.includes(char) && !wornItemWeight.charactersOnlyDirectlyOnTop.includes(char));
                            if (remainingCharacters.length > 0) {
                                const remainNames = engine.deObject.functions.format_and(engine.deObject, null, remainingCharacters);
                                const remainPlural = remainingCharacters.length === 1;
                                const remainVariations = [
                                    `Since ${remainNames} ${remainPlural ? "was" : "were"} also involved with the item that just broke, ${remainPlural ? engine.deObject.functions.format_pronoun(engine.deObject, null, remainingCharacters[0]) : "they"} fall${remainPlural ? "s" : ""} down with it onto the ground at the ${expectedPathForFallenItems[1]}.`,
                                    `${remainNames}, also associated with the garment that just tore apart, ${remainPlural ? "ends" : "end"} up on the ground at ${expectedPathForFallenItems[1]}.`,
                                    `As the clothing breaks, ${remainNames} ${remainPlural ? "is" : "are"} brought down with it, landing on the ground at ${expectedPathForFallenItems[1]}.`,
                                    `The garment's destruction takes ${remainNames} down as well, and ${remainPlural ? "they end" : "they end"} up on the ground at ${expectedPathForFallenItems[1]}.`,
                                ];
                                addedMessagesForStoryMaster.push(remainVariations[Math.floor(Math.random() * remainVariations.length)]);
                            }
                        }
                    }
                }
            }

            // only in the last cycle because this will keep appearing over and over otherwise
            if (totalWornWeight + totalCarriedWeight > carryingCapacity.carryingCapacityKg && cycle === "last") {
                // the character is carrying too much weight, but they are wearing it, so it cannot get rid of
                // the wearing check is the last one done after everything else falls down, so now, we know that it is
                // just the weight of the worn items that is causing the problem, so we can be sure that if we are over capacity here, it is because of the worn items only
                addedMessagesForStoryMaster.push(`${path[1]} combined weight of worn items exceeds their carrying capacity. They are struggling to move and cannot stand up.`);
            }
        }
    }
}

/**
 * @param {DEngine} engine 
 * @param {DEItem[]} list 
 */
function cleanTemporaryProperties(engine, list) {
    for (let i = list.length - 1; i >= 0; i--) {
        const item = list[i];
        // @ts-ignore
        if (item._just_placed) {
            // @ts-ignore
            delete item._just_placed;
        }
        if (item.amount === 0) {
            list.splice(i, 1);
        }

        cleanTemporaryProperties(engine, item.containing);
        cleanTemporaryProperties(engine, item.ontop);
    }
}

/**
 * When placing items on another, these items may be grouped when many are of the same type, and contain the same things, but now
 * we are adding another item on top of one of them, so we need to make sure that the path we are placing on top of only has one item all the way down
 * @param {DEngine} engine
 * @param {string} currentLocation
 * @param {Array<string | number>} pathResolved 
 */
function ensurePathOfOne(engine, currentLocation, pathResolved) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    /**
     * @type {*}
     */
    let current = pathResolved[0] === "slots" ? engine.deObject.world.locations[currentLocation].slots[pathResolved[1]] : engine.deObject.stateFor[pathResolved[1]];

    const startIndex = 2;
    for (let i = startIndex; i < pathResolved.length; i++) {
        // console.log(current)
        const part = pathResolved[i];
        // @ts-ignore
        const next = current[part];
        if (
            typeof next.amount === "number" &&
            next.amount > 1 &&
            Array.isArray(current)
        ) {
            // make a deep copy of the item
            const nextDeepCopy = deepCopyItem(next);
            // that copy will contain the remaining items, while the original will be left with one item, and we will place the copy next to it
            nextDeepCopy.amount -= 1;
            // the original now only has one item
            next.amount = 1;
            // we place the remaining items next to the original
            current.push(nextDeepCopy);
        }
        current = next;
    }
}

/**
 * Deep copies an item
 * @param {DEItem} item 
 */
function deepCopyItem(item) {
    const newItem = { ...item };
    if (item.containing) {
        newItem.containing = item.containing.map(deepCopyItem);
    }
    if (item.ontop) {
        newItem.ontop = item.ontop.map(deepCopyItem);
    }
    if (item.wearableProperties) {
        newItem.wearableProperties = { ...item.wearableProperties };
    }
    if (item.carriableProperties) {
        newItem.carriableProperties = { ...item.carriableProperties };
    }
    if (item.consumableProperties) {
        newItem.consumableProperties = { ...item.consumableProperties };
    }
    if (item.communicator) {
        newItem.communicator = { ...item.communicator };
    }

    return newItem;
}

/**
 * Updates the title and description of an item based on a given reason.
 * @param {DEngine} engine 
 * @param {DEItem} item 
 * @param {string} reason
 * @param {Array<{message: string; author: string; storyMaster: boolean}>} lastCycleMessages
 * @param {{
 *  breaks: "EXPLODED_CLOTHING" | "DESTROYED_ITEM",
 *  reason: string,
 *  location: string,
 *  locationSlotFalls: string | null,
 *  breakerCharName: string | null,
 * }|null} destroyedInfo
 * @param {boolean} includeFallenItemsInStoryMasterMessage
 * @param {string[]} addedMessagesForStoryMaster
 */
async function updateItemAfterHappenance(
    engine,
    item,
    reason,
    lastCycleMessages,
    destroyedInfo,
    includeFallenItemsInStoryMasterMessage,
    addedMessagesForStoryMaster,
) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    } else if (!engine.inferenceAdapter) {
        throw new Error("Inference adapter not initialized");
    }

    const systemPromptItemsInteracted = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(
        `You are an assistant and story analyst that helps update the item named ${item.name} in an interactive story`,
        ([
            `When generating a description for ${item.name}, you should take into account the reason provided for the update, and reflect it in the description. For example, if the reason is that the item got wet, you can add some details about how it got wet, how it looks now that it's wet, how it smells, etc.`,
            `The new description should be a one line description that is short and concise`,
            "An item name should not start with `a` or `an`, it should be more like a title or a label for the item, and the description is where you can describe it in more detail",
            destroyedInfo ? `The destruction of ${item.name} should make it so that the new name implies it cannot be destroyed any further, the parts should be able to withstand any damage` : null,
        ]).filter(v => v !== null), null);

    const itemsInteractionGenerator = engine.inferenceAdapter.runQuestioningCustomAgentOn(
        systemPromptItemsInteracted,
        null,
        lastCycleMessages,
        engine.inferenceAdapter.buildContextInfoInstructions(
            "It was determined that during the story provided, the item named " + item.name + " " + reason + ".\n\nThe item is currently described as: " + item.description,
        ),
        true,
    );

    if (destroyedInfo?.breaks === "EXPLODED_CLOTHING") {
        delete item.wearableProperties;
        delete item.communicator;
        delete item.consumableProperties;
        item.owner = null;
        item.maxWeightOnTopKg = null;
        item.maxVolumeOnTopLiters = null;
    } else if (destroyedInfo?.breaks === "DESTROYED_ITEM") {
        delete item.containerProperties;
        delete item.wearableProperties;
        delete item.communicator;
        item.maxWeightOnTopKg = null;
        item.owner = null;
        item.maxVolumeOnTopLiters = null;
    }

    const ready = await itemsInteractionGenerator.next();
    if (ready.done) {
        throw new Error("Questioning agent could not be started properly for item changes check.");
    }

    const yesNoGrammarObject = yesNoGrammar(engine);

    let brokeInPieces = false;
    let brokeInPiecesCount = 0;
    if (destroyedInfo) {
        const questionBrokenMultipleName = "Given the damage received, did the item named " + item.name + " broke in multiple pieces that are now separate items?";
        console.log("Asking question: " + questionBrokenMultipleName);

        const answerBrokenMultiple = await itemsInteractionGenerator.next({
            maxCharacters: 5,
            maxParagraphs: 1,
            maxSafetyCharacters: 10,
            nextQuestion: questionBrokenMultipleName,
            stopAfter: yesNoGrammarObject.stopAfter,
            stopAt: ["\n"],
            grammar: yesNoGrammarObject.grammar,
            answerTrail: "Answer:\n\n",
            contextInfo: engine.inferenceAdapter.buildContextInfoInstructions(
                "Answer 'Yes' if the item is now in multiple pieces, Answer 'No' if the item is sturdy or flexible enough that it would just rip or crumble but still be one item",
            ),
        });

        if (answerBrokenMultiple.done) {
            throw new Error("Questioning agent finished before providing an answer for the item broken in multiple pieces question.");
        }

        const answerBrokenMultipleText = answerBrokenMultiple.value.trim().toLowerCase();
        const isBrokenInMultiplePieces = answerBrokenMultipleText === "yes";
        brokeInPieces = isBrokenInMultiplePieces;

        if (isBrokenInMultiplePieces) {
            const questionPiecesCount = "How many pieces is the item named " + item.name + " now broken into?";
            console.log("Asking question: " + questionPiecesCount);
            const answerPiecesCount = await itemsInteractionGenerator.next({
                maxCharacters: 5,
                maxParagraphs: 1,
                maxSafetyCharacters: 10,
                nextQuestion: questionPiecesCount,
                stopAfter: [],
                stopAt: ["\n"],
                grammar: `root ::= [0-9]+ ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\n`,
                answerTrail: "Answer:\n\n",
                contextInfo: engine.inferenceAdapter.buildContextInfoInstructions(
                    "It was determined that the item named " + item.name + " is now broken in multiple pieces after the damage it received\n\n" +
                    "Provide only a number for how many pieces the item is now broken into, if the story doesn't hint a number or is ambiguous, provide your best guess based on the type of item and the damage it received",
                ),
            });

            if (answerPiecesCount.done) {
                throw new Error("Questioning agent finished before providing an answer for the item pieces count question.");
            }

            const answerPiecesCountText = answerPiecesCount.value.trim();
            const piecesCount = parseInt(answerPiecesCountText);
            if (isNaN(piecesCount) || piecesCount < 1) {
                throw new Error("Invalid answer for the item pieces count question: " + answerPiecesCountText);
            }

            brokeInPiecesCount = piecesCount;
            if (brokeInPiecesCount === 1) {
                brokeInPieces = false;
                console.warn("The questioning agent determined that the item broke in multiple pieces, but then said it is only 1 piece, so we will consider that it didn't broke in multiple pieces.");
            }
        }
    }

    const questionName = "What is the new name for the item named " + item.name + "?";

    const pureTextGrammar = `root ::= [a-zA-Z0-9 _/-]+ ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\n`;

    console.log("Asking question: " + questionName);

    const answerName = await itemsInteractionGenerator.next({
        maxCharacters: 100,
        maxParagraphs: 1,
        maxSafetyCharacters: 200,
        nextQuestion: questionName,
        stopAfter: [],
        stopAt: ["\n", "."],
        grammar: pureTextGrammar,
        answerTrail: "The new name for the item is:\n\n",
        contextInfo: engine.inferenceAdapter.buildContextInfoInstructions(
            "Provide a new name for " + item.name + " consider that it " + reason + ".\n\nThe new name should reflect what happened to the item." + (brokeInPieces ? " Since the item broke in " + brokeInPiecesCount + " pieces, the new name should be that for a single piece ONLY." : " Since the item is still one piece, the new name should be SINGULAR."),
        ),
    });

    if (answerName.done) {
        throw new Error("Questioning agent finished before providing an answer for the item name change.");
    }

    const answerText = answerName.value;
    console.log("Received answer: " + answerText);

    const originalName = item.name;

    item.name = answerText.trim();

    const questionDescription = "What is the new description for the item named " + originalName + "?";

    console.log("Asking question: " + questionDescription);

    const answerDescription = await itemsInteractionGenerator.next({
        maxCharacters: 200,
        maxParagraphs: 1,
        maxSafetyCharacters: 400,
        nextQuestion: questionDescription,
        stopAfter: [],
        stopAt: ["\n"],
        grammar: pureTextGrammar,
        answerTrail: "The new description for the item is:\n\n",
        contextInfo: engine.inferenceAdapter.buildContextInfoInstructions(
            "The new name for \"" + originalName + "\" was established to be \"" + item.name + "\" after the following change happened to it: " + reason + ".\n\n" +
            "Provide a new short one line description for \"" + item.name + "\"." + (brokeInPieces ? " Since the item broke in " + brokeInPiecesCount + " pieces, the description should describe a single piece ONLY" : ""),
        ),
    });

    if (answerDescription.done) {
        throw new Error("Questioning agent finished before providing an answer for the item description change.");
    }

    const answerDescriptionText = answerDescription.value;
    console.log("Received answer: " + answerDescriptionText);

    item.description = answerDescriptionText.trim();

    const originalAmount = item.amount || 1;
    item.amount *= brokeInPieces ? brokeInPiecesCount : 1;

    const originalThing = utilItemCount(engine, null, item.owner, originalAmount, originalName, false, true);
    // no owner to say more clearly eg. it is now a broken phone
    const newThing = utilItemCount(engine, null, null, item.amount || 1, item.name, true, false);

    const droppedContentInside = engine.deObject.functions.format_and(engine.deObject, null, item.containing.map((containedItem) => {
        const containedItemName = utilItemCount(engine, null, containedItem.owner, containedItem.amount || 1, containedItem.name, true, true);
        return containedItemName;
    }));
    const droppedContentOnTop = engine.deObject.functions.format_and(engine.deObject, null, item.ontop.map((onTopItem) => {
        const containedItemName = utilItemCount(engine, null, onTopItem.owner, onTopItem.amount || 1, onTopItem.name, true, true);
        return containedItemName;
    }));

    const hasContentInside = item.containing.length > 0;
    const hasContentOnTop = item.ontop.length > 0;

    let messageForStoryMaster = "";
    // Special case for exploded clothing
    if (destroyedInfo?.reason) {
        const reasonReplaced = destroyedInfo.reason.replace("{{char}}", destroyedInfo?.breakerCharName || "someone");
        // capitalize the first letter of the reason
        const reasonReplacedCapitalized = reasonReplaced.charAt(0).toUpperCase() + reasonReplaced.slice(1);
        const destroyedVariations = [
            `${reasonReplacedCapitalized}, therefore now it is ${newThing}`,
            `${reasonReplacedCapitalized}, and what remains is ${newThing}`,
            `${reasonReplacedCapitalized}, leaving behind ${newThing}`,
        ];
        messageForStoryMaster = destroyedVariations[Math.floor(Math.random() * destroyedVariations.length)];
    } else {
        const hasOrHave = originalAmount === 1 ? (
            isAlreadyPlural(originalName.toLowerCase()) && !isSingularOfPlural(originalName.toLowerCase()) ? "have" : "has"
        ) : "have";
        const transformedVariations = [
            `${originalThing} ${hasOrHave} been turned into ${newThing} after ${reason}`,
            `After ${reason}, ${originalThing} ${hasOrHave} now ${newThing}`,
            `${originalThing} ${hasOrHave} become ${newThing} as a result of ${reason}`,
        ];
        messageForStoryMaster = capitalizeFirstLetter(transformedVariations[Math.floor(Math.random() * transformedVariations.length)]);
    }

    if (destroyedInfo?.locationSlotFalls) {
        const subject = item.amount === 1 ? "it" : "they";
        const verb = item.amount === 1 ? "falls" : "fall";
        const lands = item.amount === 1 ? "lands" : "land";
        const settles = item.amount === 1 ? "settles" : "settle";
        const crashes = item.amount === 1 ? "crashes" : "crash";
        const tumbles = item.amount === 1 ? "tumbles" : "tumble";
        const fallingLocation = "the " + destroyedInfo.locationSlotFalls;
        const fallingVariations = [
            `, and ${subject} ${verb} down to the ground at ${fallingLocation}.`,
            `, and ${subject} ${lands} on the ground at ${fallingLocation}.`,
            `. And ${subject} ${settles} onto the ground at ${fallingLocation}.`,
            `, and ${subject} ${crashes} down onto the ground at ${fallingLocation}.`,
            `, and ${subject} ${tumbles} to the ground at ${fallingLocation}.`,
            `, with what's left falling onto the ground at ${fallingLocation}.`,
        ];
        messageForStoryMaster += fallingVariations[Math.floor(Math.random() * fallingVariations.length)];
    } else {
        messageForStoryMaster += ".";
    }

    if (includeFallenItemsInStoryMasterMessage) {
        if (hasContentInside && hasContentOnTop) {
            const bothVariations = [
                ` With ${originalThing} ruined, ${droppedContentInside} that had been stored inside tumbles out and scatters, while ${droppedContentOnTop} that had been resting on top slides off and clatters to the ground.`,
                ` As ${originalThing} gives way, ${droppedContentInside} from within spills out across the ground, and ${droppedContentOnTop} that sat on top topples over beside it.`,
                ` The remains of ${originalThing} can no longer hold anything — ${droppedContentInside} pours out from inside, and ${droppedContentOnTop} that was perched on top crashes down alongside.`,
            ];
            messageForStoryMaster += bothVariations[Math.floor(Math.random() * bothVariations.length)];
        } else if (hasContentInside) {
            const insideVariations = [
                ` With ${originalThing} no longer intact, ${droppedContentInside} that had been stored inside tumbles out and scatters across the ground.`,
                ` As ${originalThing} gives way, ${droppedContentInside} from within spills out onto the ground.`,
                ` The contents of ${originalThing} are released — ${droppedContentInside} pours out from inside and lands on the ground.`,
            ];
            messageForStoryMaster += insideVariations[Math.floor(Math.random() * insideVariations.length)];
        } else if (hasContentOnTop) {
            const onTopVariations = [
                ` ${capitalizeFirstLetter(`${droppedContentOnTop} that had been resting on top of ${originalThing} slides off and clatters to the ground.`)}`,
                ` As ${originalThing} gives way, ${droppedContentOnTop} that sat on top topples over and hits the ground.`,
                ` With nothing left to support it, ${droppedContentOnTop} that was perched on top of ${originalThing} tumbles down to the ground.`,
            ];
            messageForStoryMaster += onTopVariations[Math.floor(Math.random() * onTopVariations.length)];
        }
    }

    addedMessagesForStoryMaster.push(messageForStoryMaster);
}

/**
 * 
 * @param {DEngine} engine 
 * @param {string} characterName 
 * @param {DEStateForCharacterWithHistory} charState 
 * @param {string[]} addedMessagesForStoryMaster 
 */
function checkDirectlyCarriedCharacters(engine, characterName, charState, addedMessagesForStoryMaster) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }

    if (charState.carryingCharactersDirectly.length === 0) {
        return;
    }

    const carryingCapacity = getCharacterCarryingCapacity(engine, characterName);
    const currentCarriedItemsWeight = charState.carrying.reduce((total, item) => {
        const itemWeight = getItemWeight(engine, item);
        return total + itemWeight.completeWeight;
    }, 0);
    const currentWornItemsWeight = charState.wearing.reduce((total, item) => {
        const itemWeight = getItemWeight(engine, item);
        return total + itemWeight.completeWeight;
    }, 0);
    const currentCarriedItemsVolume = charState.carrying.reduce((total, item) => {
        const itemVolume = getItemVolume(engine, item);
        return total + itemVolume.completeVolume;
    }, 0);
    const currentWornItemsVolume = charState.wearing.reduce((total, item) => {
        const itemVolume = getItemVolume(engine, item);
        return total + itemVolume.completeVolume;
    }, 0);

    let totalCarriedWeight = currentCarriedItemsWeight + currentWornItemsWeight;
    let totalCarriedVolume = currentCarriedItemsVolume + currentWornItemsVolume;
    let carrierHasFallenDown = false;
    for (const carriedCharName of charState.carryingCharactersDirectly) {
        const carriedCharWeight = getCharacterWeight(engine, carriedCharName);
        const carriedCharVolume = getCharacterVolume(engine, carriedCharName);

        if (totalCarriedWeight + carriedCharWeight.weight > carryingCapacity.carryingCapacityKg) {
            // the character is too heavy to be carried, so it will fall on the ground
            const carriedCharState = engine.deObject.stateFor[carriedCharName];

            charState.carryingCharactersDirectly = charState.carryingCharactersDirectly.filter((v) => v !== carriedCharName);

            const couldHaveCarriedOneInOptimalConditions = carriedCharWeight.weight <= carryingCapacity.carryingCapacityKg;
            const hardLanding = Math.random() < 0.33;
            if (!carrierHasFallenDown) {
                if (!couldHaveCarriedOneInOptimalConditions) {
                    const carrierFallsDown = Math.random() < (hardLanding ? 0.75 : 0.5);
                    if (carrierFallsDown) {
                        const carrierHardLanding = Math.random() < 0.33;
                        if (carrierHardLanding) {
                            carrierHasFallenDown = true;
                        }
                        if (hardLanding && carrierHardLanding) {
                            const variations = [
                                `${carriedCharName} is far too heavy for ${characterName} — they both crash to the ground at the ${carriedCharState.locationSlot}.`,
                                `The weight of ${carriedCharName} overwhelms ${characterName}, and they both tumble hard onto the ground at the ${carriedCharState.locationSlot}.`,
                                `${characterName} buckles under ${carriedCharName}'s weight and they both hit the ground hard at the ${carriedCharState.locationSlot}.`,
                            ];
                            addedMessagesForStoryMaster.push(variations[Math.floor(Math.random() * variations.length)]);
                        } else if (hardLanding) {
                            const variations = [
                                `${carriedCharName} is too heavy and drops hard onto the ground at the ${carriedCharState.locationSlot}, pulling ${characterName} down too, though ${characterName} manages a softer landing.`,
                                `${characterName} loses their grip and ${carriedCharName} crashes to the ground at the ${carriedCharState.locationSlot}, dragging ${characterName} down alongside — but ${characterName} catches themselves.`,
                                `${carriedCharName} slips from ${characterName}'s grasp and hits the ground hard at the ${carriedCharState.locationSlot}, while ${characterName} stumbles down more gently beside them.`,
                            ];
                            addedMessagesForStoryMaster.push(variations[Math.floor(Math.random() * variations.length)]);
                        } else if (carrierHardLanding) {
                            const variations = [
                                `${characterName} buckles under ${carriedCharName}'s weight and falls hard at the ${carriedCharState.locationSlot}, but ${carriedCharName} slides off and lands gently.`,
                                `${carriedCharName} is too heavy for ${characterName}, who crashes to the ground at the ${carriedCharState.locationSlot}, while ${carriedCharName} eases down softly.`,
                                `${characterName} collapses under the weight and hits the ground hard at the ${carriedCharState.locationSlot}, though ${carriedCharName} lands without much trouble.`,
                            ];
                            addedMessagesForStoryMaster.push(variations[Math.floor(Math.random() * variations.length)]);
                        } else {
                            const variations = [
                                `${carriedCharName} is too heavy to be carried by ${characterName}, who stumbles as ${carriedCharName} slides to the ground at the ${carriedCharState.locationSlot}.`,
                                `${characterName} can no longer support ${carriedCharName}'s weight and loses their balance, setting ${carriedCharName} down on the ground at the ${carriedCharState.locationSlot}.`,
                                `${carriedCharName} is too heavy for ${characterName}, who staggers but stays upright as ${carriedCharName} eases onto the ground at the ${carriedCharState.locationSlot}.`,
                            ];
                            addedMessagesForStoryMaster.push(variations[Math.floor(Math.random() * variations.length)]);
                        }
                    } else {
                        const variations = hardLanding ? [
                            `${carriedCharName} is too heavy to be carried by ${characterName}, and crashes to the ground at the ${carriedCharState.locationSlot}.`,
                            `${characterName} can't hold ${carriedCharName} — far too heavy — and ${carriedCharName} drops hard onto the ground at the ${carriedCharState.locationSlot}.`,
                            `The weight of ${carriedCharName} is simply too much for ${characterName}, and ${carriedCharName} slips from their grasp and hits the ground at the ${carriedCharState.locationSlot}.`,
                        ] : [
                            `${carriedCharName} is too heavy to be carried by ${characterName}, and falls on the ground at the ${carriedCharState.locationSlot}.`,
                            `${characterName} can't support ${carriedCharName}'s weight and gently sets them down at the ${carriedCharState.locationSlot}.`,
                            `${carriedCharName} is too heavy for ${characterName} to carry, and slides down to the ground at the ${carriedCharState.locationSlot}.`,
                        ];
                        addedMessagesForStoryMaster.push(variations[Math.floor(Math.random() * variations.length)]);
                    }
                } else {
                    const variations = hardLanding ? [
                        `${carriedCharName} is too heavy to be carried by ${characterName} who is already carrying too much weight, and tumbles to the ground at the ${carriedCharState.locationSlot}.`,
                        `Already overburdened, ${characterName} loses their grip on ${carriedCharName}, who drops hard onto the ground at the ${carriedCharState.locationSlot}.`,
                        `${characterName} is carrying too much as it is and ${carriedCharName} slips from their hold, hitting the ground at the ${carriedCharState.locationSlot}.`,
                    ] : [
                        `${carriedCharName} is too heavy to be carried by ${characterName} who is already carrying too much weight, and falls on the ground at the ${carriedCharState.locationSlot}.`,
                        `${characterName}, already weighed down with too much, can no longer hold ${carriedCharName}, who slides gently to the ground at the ${carriedCharState.locationSlot}.`,
                        `With too much weight already, ${characterName} lets ${carriedCharName} down onto the ground at the ${carriedCharState.locationSlot}.`,
                    ];
                    addedMessagesForStoryMaster.push(variations[Math.floor(Math.random() * variations.length)]);
                }
            } else {
                const variations = hardLanding ? [
                    `${carriedCharName} tumbles off ${characterName} and hits the ground hard at the ${carriedCharState.locationSlot}.`,
                    `As ${characterName} goes down, ${carriedCharName} is thrown off and crashes onto the ground at the ${carriedCharState.locationSlot}.`,
                    `${carriedCharName} drops hard off ${characterName} onto the ground at the ${carriedCharState.locationSlot}.`,
                ] : [
                    `${carriedCharName} slides off ${characterName} onto the ground at the ${carriedCharState.locationSlot}.`,
                    `As ${characterName} goes down, ${carriedCharName} rolls gently off onto the ground at the ${carriedCharState.locationSlot}.`,
                    `${carriedCharName} eases off ${characterName} and settles on the ground at the ${carriedCharState.locationSlot}.`,
                ];
                addedMessagesForStoryMaster.push(variations[Math.floor(Math.random() * variations.length)]);
            }
        } else if (totalCarriedVolume + carriedCharVolume.volume > carryingCapacity.carryingCapacityLiters) {
            // the character is too large to be carried, so it will fall on the ground
            const carriedCharState = engine.deObject.stateFor[carriedCharName];

            charState.carryingCharactersDirectly = charState.carryingCharactersDirectly.filter((v) => v !== carriedCharName);

            const couldHaveCarriedOneInOptimalConditions = carriedCharVolume.volume <= carryingCapacity.carryingCapacityLiters;
            const hardLanding = Math.random() < 0.33;
            if (!carrierHasFallenDown) {
                if (!couldHaveCarriedOneInOptimalConditions) {
                    const carrierFallsDown = Math.random() < (hardLanding ? 0.75 : 0.5);
                    if (carrierFallsDown) {
                        const carrierHardLanding = Math.random() < 0.33;
                        if (carrierHardLanding) {
                            carrierHasFallenDown = true;
                        }
                        if (hardLanding && carrierHardLanding) {
                            const variations = [
                                `${carriedCharName} is far too large for ${characterName} to grip — they both crash to the ground at the ${carriedCharState.locationSlot}.`,
                                `${characterName} can't get a hold on ${carriedCharName}, who is simply too big, and they both tumble hard onto the ground at the ${carriedCharState.locationSlot}.`,
                                `${carriedCharName}'s size is too much for ${characterName} to manage, and they both hit the ground hard at the ${carriedCharState.locationSlot}.`,
                            ];
                            addedMessagesForStoryMaster.push(variations[Math.floor(Math.random() * variations.length)]);
                        } else if (hardLanding) {
                            const variations = [
                                `${carriedCharName} is too big to hold onto and drops hard onto the ground at the ${carriedCharState.locationSlot}, pulling ${characterName} down too, though ${characterName} manages a softer landing.`,
                                `${characterName} loses their grip on ${carriedCharName}'s unwieldy frame and ${carriedCharName} crashes to the ground at the ${carriedCharState.locationSlot}, while ${characterName} stumbles down more gently beside them.`,
                                `${carriedCharName} slips from ${characterName}'s arms and hits the ground hard at the ${carriedCharState.locationSlot}, dragging ${characterName} down alongside — but ${characterName} catches themselves.`,
                            ];
                            addedMessagesForStoryMaster.push(variations[Math.floor(Math.random() * variations.length)]);
                        } else if (carrierHardLanding) {
                            const variations = [
                                `${characterName} struggles with ${carriedCharName}'s size and falls hard at the ${carriedCharState.locationSlot}, but ${carriedCharName} slides off and lands gently.`,
                                `${carriedCharName} is too big for ${characterName} to get a proper grip on, and ${characterName} crashes to the ground at the ${carriedCharState.locationSlot}, while ${carriedCharName} eases down softly.`,
                                `${characterName} can't manage ${carriedCharName}'s bulk and hits the ground hard at the ${carriedCharState.locationSlot}, though ${carriedCharName} lands without much trouble.`,
                            ];
                            addedMessagesForStoryMaster.push(variations[Math.floor(Math.random() * variations.length)]);
                        } else {
                            const variations = [
                                `${carriedCharName} is too large to be carried by ${characterName}, who stumbles as ${carriedCharName} slides to the ground at the ${carriedCharState.locationSlot}.`,
                                `${characterName} can't keep a proper grip on ${carriedCharName} due to their size and loses their balance, setting ${carriedCharName} down on the ground at the ${carriedCharState.locationSlot}.`,
                                `${carriedCharName} is too big for ${characterName} to hold, who staggers but stays upright as ${carriedCharName} eases onto the ground at the ${carriedCharState.locationSlot}.`,
                            ];
                            addedMessagesForStoryMaster.push(variations[Math.floor(Math.random() * variations.length)]);
                        }
                    } else {
                        const variations = hardLanding ? [
                            `${carriedCharName} is too large to be carried by ${characterName}, who can't get a proper grip, and ${carriedCharName} crashes to the ground at the ${carriedCharState.locationSlot}.`,
                            `${characterName} can't get a hold on ${carriedCharName} — far too big to grip properly — and ${carriedCharName} drops hard onto the ground at the ${carriedCharState.locationSlot}.`,
                            `${carriedCharName} is simply too large for ${characterName} to get a grip on, and ${carriedCharName} slips from their arms and hits the ground at the ${carriedCharState.locationSlot}.`,
                        ] : [
                            `${carriedCharName} is too large to be carried by ${characterName}, and falls on the ground at the ${carriedCharState.locationSlot}.`,
                            `${characterName} can't get a proper grip on ${carriedCharName} due to their size and gently lets them slide to the ground at the ${carriedCharState.locationSlot}.`,
                            `${carriedCharName} is too big for ${characterName} to hold onto, and eases down to the ground at the ${carriedCharState.locationSlot}.`,
                        ];
                        addedMessagesForStoryMaster.push(variations[Math.floor(Math.random() * variations.length)]);
                    }
                } else {
                    const variations = hardLanding ? [
                        `${carriedCharName} is too large to be carried by ${characterName} who is already carrying too many items, and tumbles to the ground at the ${carriedCharState.locationSlot}.`,
                        `Already juggling too much, ${characterName} loses their grip on ${carriedCharName}, who is too big to hold alongside everything else, and ${carriedCharName} drops hard onto the ground at the ${carriedCharState.locationSlot}.`,
                        `${characterName} is carrying too much as it is and can't keep a grip on ${carriedCharName}, who slips and hits the ground at the ${carriedCharState.locationSlot}.`,
                    ] : [
                        `${carriedCharName} is too large to be carried by ${characterName} who is already carrying too many items, and falls on the ground at the ${carriedCharState.locationSlot}.`,
                        `${characterName}, already carrying too much, can no longer get a proper grip on ${carriedCharName}, who slides gently to the ground at the ${carriedCharState.locationSlot}.`,
                        `With too much already in hand, ${characterName} can't hold onto ${carriedCharName} and lets them down onto the ground at the ${carriedCharState.locationSlot}.`,
                    ];
                    addedMessagesForStoryMaster.push(variations[Math.floor(Math.random() * variations.length)]);
                }
            } else {
                const variations = hardLanding ? [
                    `${carriedCharName} tumbles off ${characterName} and hits the ground hard at the ${carriedCharState.locationSlot}.`,
                    `As ${characterName} goes down, ${carriedCharName} is thrown off and crashes onto the ground at the ${carriedCharState.locationSlot}.`,
                    `${carriedCharName} drops hard off ${characterName} onto the ground at the ${carriedCharState.locationSlot}.`,
                ] : [
                    `${carriedCharName} slides off ${characterName} onto the ground at the ${carriedCharState.locationSlot}.`,
                    `As ${characterName} goes down, ${carriedCharName} rolls gently off onto the ground at the ${carriedCharState.locationSlot}.`,
                    `${carriedCharName} eases off ${characterName} and settles on the ground at the ${carriedCharState.locationSlot}.`,
                ];
                addedMessagesForStoryMaster.push(variations[Math.floor(Math.random() * variations.length)]);
            }
        } else {
            totalCarriedWeight += carriedCharWeight.weight;
            totalCarriedVolume += carriedCharVolume.volume;
        }
    }
}

/**
 * Cleans an item tree by checking that everything is consistent with the rules of the game
 * 1. None is carrying more than they can carry, either in weight or volume
 * 2. Overfilled containers have items falling out of them until they are no longer overfilled
 * etc...
 * 
 * @param {DEngine} engine
 * @param {string} location
 * @param {Array<{message: string; author: string; storyMaster: boolean}>} lastCycleMessages
 * @param {string[]} addedMessagesForStoryMaster
 * @param {{ [charName: string]: { reason: string; }}} charactersThatMoved
 */
async function cleanAll(engine, location, lastCycleMessages, addedMessagesForStoryMaster, charactersThatMoved) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    const locationObj = engine.deObject.world.locations[location];
    for (const [slotName, slot] of Object.entries(locationObj.slots)) {
        // first clean at each location, it should work with one single pass because items fall on the ground
        await cleanDirtyItemTree(engine, location, slotName, slot.items, ["slots", slotName, "items"], addedMessagesForStoryMaster, "first", lastCycleMessages, charactersThatMoved);
    }

    const allCharactersAtLocation = [];
    for (const charName in engine.deObject.stateFor) {
        const charState = engine.deObject.stateFor[charName];
        if (charState.location === location) {
            allCharactersAtLocation.push(charName);
        }
    }
    for (const charName of allCharactersAtLocation) {
        const characterState = engine.deObject.stateFor[charName];

        // cheap and cheat way to check if we took items off
        let cycleN = 0;
        while (true) {
            // inefficient as hell, but no big deal
            // just keep dropping items until we are satisfied
            // that we are not dropping more
            // all because some items give us extra strength and we may have dropped
            // one of those while checking
            const currStoryMasterMessages = addedMessagesForStoryMaster.length;
            checkDirectlyCarriedCharacters(engine, charName, characterState, addedMessagesForStoryMaster);
            await cleanDirtyItemTree(engine, characterState.location, characterState.locationSlot, characterState.carrying, ["characters", charName, "carrying"], addedMessagesForStoryMaster, cycleN === 0 ? "first" : "mid", lastCycleMessages, charactersThatMoved);
            await cleanDirtyItemTree(engine, characterState.location, characterState.locationSlot, characterState.wearing, ["characters", charName, "wearing"], addedMessagesForStoryMaster, cycleN === 0 ? "first" : "mid", lastCycleMessages, charactersThatMoved);

            // congrats no more dropped items, you can move on to the next character
            if (currStoryMasterMessages === addedMessagesForStoryMaster.length) {
                break;
            }
            cycleN++;
        }

        // one last time, inefficient yes I know
        await cleanDirtyItemTree(engine, characterState.location, characterState.locationSlot, characterState.carrying, ["characters", charName, "carrying"], addedMessagesForStoryMaster, "last", lastCycleMessages, charactersThatMoved);
        await cleanDirtyItemTree(engine, characterState.location, characterState.locationSlot, characterState.wearing, ["characters", charName, "wearing"], addedMessagesForStoryMaster, "last", lastCycleMessages, charactersThatMoved);

        // cleans up the temporary properties we added for the checks, and also removes items with amount 0
        cleanTemporaryProperties(engine, characterState.carrying);
        cleanTemporaryProperties(engine, characterState.wearing);
    }

    for (const [slotName, slot] of Object.entries(locationObj.slots)) {
        cleanTemporaryProperties(engine, slot.items);
    }
}