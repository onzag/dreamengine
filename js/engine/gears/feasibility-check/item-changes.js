import { deepCopy, DEngine } from "../../index.js";

// TODO repair locations not here, but somewhere during creating the world
// because the placement of an item does not fall in line with how they are
// meant by the engine

/**
 * 
 * @param {string} word 
 * @returns {string}
 */
function caseInsensitiveGrammar(word) {
    return "(" + word.split('').map(c => {
        if (c.match(/[a-zA-Z]/)) {
            return `[${c.toUpperCase()}${c.toLowerCase()}]`;
        }
        return JSON.stringify(c);
    }).join(' ') + ")";
}

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
 * @param {string} answer
 * @return {boolean}
 */
function isYes(answer) {
    return answer.toLowerCase().includes("yes");
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

    // Step by step first we grab the character state that sent that last message
    const charState = engine.deObject.stateFor[character.name];
    if (!charState) {
        throw new Error(`Character state for ${character.name} not found.`);
    }

    // get the item list at the location, if there are no items, skip the check since there can't be any item changes
    const itemsAtLocation = engine.getFullItemListAtLocation(charState.location);

    // we also get the location name for the character state location, since we will need it for the questioning agent context
    const location = engine.deObject.world.locations[charState.location];

    const yesNoGrammar = `root ::= ("yes" | "no" | "Yes" | "No" | "YES" | "NO") ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\n`;

    /**
     * @type {string[]}
     */
    let itemsInteractedWith = [];

    const lastMessageManual = engine.getHistoryForCharacter(character, { includeDebugMessages: false, includeRejectedMessages: false });
    const lastMessage = (await lastMessageManual.next(true)).value;
    let lastMessageLowerCase = "";
    if (lastMessage && lastMessage.message) {
        lastMessageLowerCase = lastMessage.message.toLowerCase();
    }

    // return the generator
    lastMessageManual.return();

    // collect matched items with their first occurrence index so we can sort by mention order
    const matchedItems = [];
    for (const item of itemsAtLocation) {
        const itemLowerCase = item.toLowerCase();
        const idx = lastMessageLowerCase.indexOf(itemLowerCase);
        if (idx !== -1) {
            matchedItems.push({ name: itemLowerCase, index: idx });
        }
    }
    matchedItems.sort((a, b) => a.index - b.index);
    itemsInteractedWith = matchedItems.map((m) => m.name);

    console.log("Pre check for item interactions based on keyword matching, items potentially interacted with: ", itemsInteractedWith);

    if (itemsAtLocation.length) {
        // now we want to know which items were interacted with in the last 
        // message, so we will ask the questioning agent to analyze the last message and answer which items were interacted with, if any, based on the definition of interaction we give them, and only considering items that are at the location of the character state that sent the last message
        // hopefully we will get a small list of items

        const systemPromptItemsInteracted = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(
            `You are an asistant and story analyst that checks for interactions with items in an story\n` +
            "You will be questioned to mention any of the items that were mentioned as being interacted in the last message of a interactive story, and the interaction type (lifting, carrying, moving, using, manipulating, grabbing, etc.)\n",
            [
                `An interaction with an item is defined as lifting, carrying, moving, using, or manipulating the item in any way, giving, carrying, dropping, stealing, wearing, taking off, putting on, or any other form of direct physical interaction with the item. Just mentioning or describing the item without any of these interactions does not count as an interaction.`,
                "If an item is only mentioned or described but not interacted with, answer No, since no interaction happened",
                "People and other characters are not items, do not consider them for this question"
            ].filter((v) => v !== null), null);

        const itemsInteractionGenerator = engine.inferenceAdapter.runQuestioningCustomAgentOn(
            character,
            systemPromptItemsInteracted,
            null,
            engine.getHistoryForCharacter(character, {}), "LAST_CYCLE_EXPANDED",
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

            const nextQuestion = `In the last message, was the item "${item}" interacted with? Remember that interaction means lifting, carrying, moving, using, or manipulating the item in any way, giving, carrying, dropping, stealing, wearing, taking off, putting on, or any other form of direct physical interaction with the item. Just mentioning or describing the item without any of these interactions does not count as an interaction. Answer yes if "${item}" was interacted with, or no if it was not interacted with.`;
            console.log("Asking question, " + nextQuestion)
            const answer = await itemsInteractionGenerator.next({
                maxCharacters: 0,
                maxSafetyCharacters: 100,
                maxParagraphs: 1,
                nextQuestion: nextQuestion,
                contextInfo: engine.inferenceAdapter.buildContextInfoItemDescription(item, item + " is described as following", foundDescriptions).value,
                stopAfter: ["yes", "no", "Yes", "No", "YES", "NO"],
                stopAt: [],
                grammar: yesNoGrammar,
                answerTrail: `Regarding specifically the item ${item} being interacted with in the last message, the answer is:\n\n`,
            });
            if (answer.done) {
                throw new Error("Questioning agent finished without providing an answer for item interaction check for item " + item);
            }
            console.log("Received answer, " + answer.value);
            if (isYes(answer.value)) {
                itemsInteractedWith.push(itemLowerCase);
                console.log(`The item "${item}" was identified as interacted with in the last message, according to the questioning agent.`);
            } else {
                console.log(`The item "${item}" was not identified as interacted with in the last message, according to the questioning agent.`);
            }
        }

        // const nextQuestion = "Which items, if any, were directly physically interacted with (grabbed, picked up, moved, worn, dropped, used, etc.) in the last message? Do not list items that are only mentioned, seen, or described without physical interaction.";
        // console.log("Asking question, " + nextQuestion)
        // const answer = await itemsInteractionGenerator.next({
        //     maxCharacters: 0,
        //     maxSafetyCharacters: 250,
        //     maxParagraphs: 10,
        //     nextQuestion: nextQuestion,
        //     stopAfter: [],
        //     stopAt: [],
        //     answerTrail: "Only the items physically interacted with:\n\n",
        //     grammar: `root ::= ("none" | itemList) ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\n` +
        //         `itemList ::= itemName (", " itemName)*\n` +
        //         `itemName ::= ${itemsAtLocationLower.map((item) => caseInsensitiveGrammar(item)).join(" | ")}`,
        //     instructions: `Answer ONLY with items that a character physically touched, grabbed, picked up, moved, wore, dropped, placed, or directly used in the last message. Items that are merely present in the scene, mentioned, looked at, or described do not count. Most messages interact with very few items or none at all. If no items were physically interacted with, answer none. Do not repeat item names.`,
        // });

        // if (answer.done) {
        //     throw new Error("Questioning agent finished without providing an answer for item changes check.");
        // }

        // console.log("Received answer, " + answer.value);

        await itemsInteractionGenerator.next(null); // end the generator

        // const extraAdded = answer.value.trim() === "none" ? [] : answer.value.split(",").map((v) => v.trim()).filter((v) => !!v);
        // // we append extraAdded first to prefer the order given by the LLM over ours, since
        // // ordering may have a subtle effect
        // itemsInteractedWith = removeRepeatsInArray(extraAdded.concat(itemsInteractedWith).map((v) => v.toLowerCase()));
    }

    const charactersAtLocation = [...charState.surroundingNonStrangers, ...charState.surroundingTotalStrangers, character.name];

    // /**
    //  * @type {Array<{groupDescription: string, characters: Array<{name: string, description: string}>}>}
    //  */
    // const charactersAtLocationInfoObject = [
    //     {
    //         groupDescription: "Character " + character.name + ", who wrote the last message",
    //         characters: [
    //             {
    //                 name: character.name,
    //                 description: engine.getExternalDescriptionOfCharacter(character.name),
    //             }
    //         ]
    //     }
    // ];

    // if (charState.surroundingNonStrangers.length) {
    //     charactersAtLocationInfoObject.push({
    //         groupDescription: "Non-stranger characters at the location for " + character.name,
    //         characters: charState.surroundingNonStrangers.map((charName) => {
    //             const charInfo = engine.getExternalDescriptionOfCharacter(charName);
    //             return {
    //                 name: charName,
    //                 description: charInfo,
    //             }
    //         })
    //     })
    // }
    // if (charState.surroundingTotalStrangers.length) {
    //     charactersAtLocationInfoObject.push({
    //         groupDescription: "Stranger characters at the location for " + character.name,
    //         characters: charState.surroundingTotalStrangers.map((charName) => {
    //             const charInfo = engine.getExternalDescriptionOfCharacter(charName);
    //             return {
    //                 name: charName,
    //                 description: charInfo,
    //             }
    //         })
    //     })
    // }

    // const charactersDesriptionsAtLocation = engine.inferenceAdapter.buildContextInfoForAvailableCharacters(charactersAtLocationInfoObject);

    const systemPromptCharactersInteracted = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(
        `You are an asistant and story analyst that checks for interactions among characters in a story\n` +
        "You will be questioned regarding the interaction of characters in a story",
        [
            `Keep in mind any mention of any character, direct or indirect, it counts as an interaction, including talking, looking at, thinking about, mentioning, etc.`,
            "Keep in mind descriptions of characters also count as mentions, for example if the message says 'Bob gave the book to the woman', figure out who the woman is based on the description and the context, and if it's a character, it counts as an interaction",
            //"Only consider characters from this list: " + charactersAtLocation.join(", ") + ".",
            //"Answer in the format: Character Name, Character Name, Character Name, ...",
            //"If no characters were mentioned or interacted with, answer none",
            //"Keep in mind the description of the characters at " + charactersDesriptionsAtLocation.availableCharactersAt + " to analyze the last message and figure out indirect mentions and interactions with characters based on their descriptions.",
            //"Do not repeat character names, if a character was mentioned many times, just mention them once in the answer",
        ].filter((v) => v !== null), null);

    /**
     * @type {string[]}
     */
    let charactersToQuestion = [character.name];//charState.conversationId ? engine.deObject.conversations[charState.conversationId].participants : [];

    const charactersInteractionGenerator = engine.inferenceAdapter.runQuestioningCustomAgentOn(
        character,
        systemPromptCharactersInteracted,
        //charactersDesriptionsAtLocation.value,
        null,
        engine.getHistoryForCharacter(character, {}), "LAST_CYCLE_EXPANDED",
        null,
        true, // remark last message for analysis, so the agent can analyze it to figure out indirect mentions and descriptions
    );

    const readyCharacters = await charactersInteractionGenerator.next();
    if (readyCharacters.done) {
        throw new Error("Questioning agent could not be started properly for character interactions check.");
    }

    for (const charName of charactersAtLocation) {
        if (charactersToQuestion.includes(charName)) {
            continue;
        }

        const nextQuestion = `In the last message, was the character "${charName}" mentioned or interacted with in any way (talked to, looked at, thought about, mentioned, described, etc.)? Answer yes if "${charName}" was mentioned or interacted with, or no if they were not.`;
        console.log("Asking question, " + nextQuestion);

        const charDescription = engine.getExternalDescriptionOfCharacter(charName);
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
            stopAfter: ["yes", "no", "Yes", "No", "YES", "NO"],
            stopAt: [],
            answerTrail: `Regarding specifically the character ${charName} being mentioned or interacted with in the last message, the answer is:\n\n`,
            grammar: yesNoGrammar,
            instructions: "Use the character description at: " + charDescriptionContextInfo.characterDescriptionAt + " to figure out if the character was indirectly interacted with by a description",
        });
        console.log("Received answer, " + answer.value);

        if (answer.done) {
            throw new Error("Questioning agent finished without providing an answer for character interaction check for character " + charName);
        }

        if (isYes(answer.value)) {
            charactersToQuestion.push(charName);
            console.log(`The character "${charName}" was identified as mentioned or interacted with in the last message, according to the questioning agent.`);
        } else {
            console.log(`The character "${charName}" was not identified as mentioned or interacted with in the last message, according to the questioning agent.`);
        }
    }

    await charactersInteractionGenerator.next(null);

    // const nextQuestionCharacters = "What characters were mentioned or interacted with by any character in the last message?";
    // console.log("Asking question, " + nextQuestionCharacters)
    // const answerCharacters = await charactersInteractionGenerator.next({
    //     maxCharacters: 0,
    //     maxSafetyCharacters: 250,
    //     maxParagraphs: 1,
    //     nextQuestion: nextQuestionCharacters,
    //     stopAfter: [],
    //     stopAt: [],
    //     answerTrail: "The list of the characters mentioned or interacted with is:\n\n",
    //     grammar: `root ::= ("none" | characterList) ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\n` +
    //         `characterList ::= characterName (", " characterName)*\n` +
    //         `characterName ::= ${charactersAtLocation.map((char) => JSON.stringify(char)).join(" | ")}`,
    //     useAggressiveListRepetitionBuster: true,
    // });

    // if (answerCharacters.done) {
    //     throw new Error("Questioning agent finished without providing an answer for character interactions check.");
    // }

    // console.log("Received answer, " + answerCharacters.value);

    // await charactersInteractionGenerator.next(null); // end the generator

    // const charactersInteractedWith = answerCharacters.value.trim() === "none" ? [] : answerCharacters.value.split(",").map((v) => v.trim()).filter((v) => !!v);
    // charactersToQuestion = charactersToQuestion.concat(charactersInteractedWith);
    // charactersToQuestion = removeRepeatsInArray(charactersToQuestion);

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

    const allCharactersAtLocation = [...charState.surroundingNonStrangers, ...charState.surroundingTotalStrangers, character.name];

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
                console.log(`Too many loops trying to confirm the moving state of item "${item}", breaking the loop to avoid infinite questioning. This may indicate that the questioning agent is having trouble determining the moving state of the item with certainty, possibly due to ambiguous or insufficient information in the last message.`);
                // assume it was moved
                wasMoved = true;
                break;
            }

            const wasItMovedNextQuestion = `In the last message, did any character move, picked up, wear, carry, or change the location of the item "${item}" itself? IMPORTANT: The item "${item}" must be the DIRECT OBJECT being physically relocated. If "${item}" is only a DESTINATION or LOCATION where something else was placed, the answer is NO.`;

            console.log("Asking question, " + wasItMovedNextQuestion);

            const wasItMovedQuestion = await interactionGenerator.next({
                maxCharacters: 0, maxSafetyCharacters: 100,
                maxParagraphs: 1,
                nextQuestion: wasItMovedNextQuestion,
                stopAfter: ["yes", "no", "Yes", "No", "YES", "NO"],
                stopAt: [],
                answerTrail: `regarding specifically the item ${item} being moved, picked up, carried, or relocated; the answer is:\n\n`,
                grammar: yesNoGrammar,
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
                const wasItMovedConfirmationQuestion = `Is the following statement correct? In the last message, the item "${item}" was moved, worn, picked up, carried, or had its location changed. Answer "yes" if this statement is correct, or "no" if this statement is incorrect.`;
                console.log("Asking question, " + wasItMovedConfirmationQuestion);
                const wasItMovedConfirmation = await interactionGenerator.next({
                    maxCharacters: 0, maxSafetyCharacters: 100,
                    maxParagraphs: 1,
                    nextQuestion: wasItMovedConfirmationQuestion,
                    stopAfter: ["yes", "no", "Yes", "No", "YES", "NO"],
                    stopAt: [],
                    grammar: yesNoGrammar,
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
                    stopAfter: ["yes", "no", "Yes", "No", "YES", "NO"],
                    stopAt: [],
                    answerTrail: `regarding specifically the item ${item} being moved, picked up, carried, or relocated; the answer is:\n\n`,
                    grammar: yesNoGrammar,
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
                        const nextQuestion = `For the item "${item}", according to the last message to analyze, before it was interacted with, was it originally ${allPotentialLocationsForItem[i]}?`;
                        console.log("Asking question, " + nextQuestion);
                        const whereWasItQuestion = await interactionGenerator.next({
                            maxCharacters: 0, maxSafetyCharacters: 100,
                            maxParagraphs: 1,
                            nextQuestion: nextQuestion,
                            stopAfter: ["yes", "no", "Yes", "No", "YES", "NO"],
                            stopAt: [],
                            grammar: yesNoGrammar,
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
            const baseAmountMovedQuestion = `By the end of the last message, how many of "${item}" were moved or had their location changed? Answer with a number, or if the amount is not clear, answer with one of the following: "a few", "several", "many", "a lot", "some", "half", "most", or "all".`;
            const amountGrammar = `root ::= ([0-9]+ | "a few" | "several" | "many" | "a lot" | "some" | "half" | "most" | "all" | "none") ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}`;
            console.log("Asking question, " + baseAmountMovedQuestion);
            const baseAmountMovedAnswer = await interactionGenerator.next({
                maxCharacters: 0, maxSafetyCharacters: 100,
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
                    const canContain = otherItemPotentialLocations.allPotentialItemsForItem.some((itemList) => itemList.some((itemInstance) => itemInstance.capacityKg && itemInstance.capacityKg > 0));

                    // so our default is no, that our original item was not contained inside the other item
                    let ambiguousPlacementContainedValue = "no";

                    // now if our heuristics say that there is an item that can contain
                    if (canContain) {
                        // we will ask the LLM if that happened
                        const nextQuestion = `By the end of the last message, was the item "${item}" placed inside ${isAnother ? "another " : "the item "}"${otherItem}"? As a container, ${item} must have been placed inside the item "${otherItem}", not the opposite. Answer "yes" ONLY if ${item} was PUT INTO or PLACED INSIDE ${otherItem}.`;
                        console.log("Asking question, " + nextQuestion);
                        const ambiguousPlacement = await interactionGenerator.next({
                            maxCharacters: 0, maxSafetyCharacters: 100,
                            maxParagraphs: 1,
                            nextQuestion: nextQuestion,
                            useQuestionCache: true,
                            stopAfter: ["yes", "no", "Yes", "No", "YES", "NO"],
                            stopAt: [],
                            grammar: yesNoGrammar,
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

                    // Now we are going to ask for atop, atop is always possible, since we can always have something on top of something else
                    // even if it is ridiculous, like a cabinet on top of a plastic cup, it can happen, it will merely destroy the plastic cup
                    const nextQuestion2 = `By the end of the last message, was the item "${item}" placed on top of ${isAnother ? "another " : "the item "}"${otherItem}"? In other words, "${otherItem}" is the surface and "${item}" is what was placed on it. Answer "yes" ONLY if ${item} ended up on top of ${otherItem}, not the other way around.`;
                    console.log("Asking question, " + nextQuestion2);
                    const ambiguousPlacement2 = await interactionGenerator.next({
                        maxCharacters: 0, maxSafetyCharacters: 100,
                        maxParagraphs: 1,
                        nextQuestion: nextQuestion2,
                        stopAfter: ["yes", "no", "Yes", "No", "YES", "NO"],
                        stopAt: [],
                        grammar: yesNoGrammar,
                        contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                            `Example: If the last message said that "${item} was placed on top of ${otherItem}", the answer would be "yes", since by the end of the message, ${item} is now on top of ${otherItem}.`,
                        ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                            `Example: If the last message said that "Alice picks two ${item} and puts one on the table and another on top of ${otherItem}", the answer would be "yes", since "another" refers to a ${item}, and it was placed on top of ${otherItem}.`,
                        ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                            `Example: If the last message said that "${item} was placed next to ${otherItem}", the answer would be "no", since by the end of the message, ${item} is next to ${otherItem}, not on top of it.`,
                        ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                            `Example: If the last message said that "${otherItem} was placed on top of ${item}", the answer would be "no", since ${otherItem} is the one that was placed on top of ${item}, not the other way around.`,
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
                            const confirmQuestionAtop = `Is the following statement correct? By the end of the last message, the item "${item}" was placed on top of ${isAnother ? "another " : "the item "}"${otherItem}". Answer "yes" if this statement is correct, or "no" if this statement is incorrect.`;

                            console.log("Asking question, " + confirmQuestionAtop);

                            const ambiguousPlacement2 = await interactionGenerator.next({
                                maxCharacters: 0, maxSafetyCharacters: 100,
                                maxParagraphs: 1,
                                nextQuestion: confirmQuestionAtop,
                                stopAfter: ["yes", "no", "Yes", "No", "YES", "NO"],
                                stopAt: [],
                                grammar: yesNoGrammar,
                            });

                            if (ambiguousPlacement2.done) {
                                throw new Error("Questioning agent finished without providing an answer for item placement confirmation check.");
                            }
                            console.log("Received answer, " + ambiguousPlacement2.value);
                            isAmbiguouslyAtop = isYes(ambiguousPlacement2.value);
                        }

                        if (isAmbiguouslyContained) {
                            const confirmQuestionContained = `Is the following statement correct? By the end of the last message, the item "${item}" was placed inside ${isAnother ? "another " : "the item "}"${otherItem}". Answer "yes" if this statement is correct, or "no" if this statement is incorrect.`;

                            console.log("Asking question, " + confirmQuestionContained);

                            const ambiguousPlacementContained = await interactionGenerator.next({
                                maxCharacters: 0, maxSafetyCharacters: 100,
                                maxParagraphs: 1,
                                nextQuestion: confirmQuestionContained,
                                stopAfter: ["yes", "no", "Yes", "No", "YES", "NO"],
                                stopAt: [],
                                grammar: yesNoGrammar,
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
                        const nextQuestion = `By the end of the last message, how many of "${item}" are ${canContain ? "inside or on top" : "on top"} of ${otherItem}? Answer with a number, or if the amount is not clear, answer with one of the following: "a few", "several", "many", "a lot", "some", "half", "most", "all", or "none".`;
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
                            const nextQuestion = `By the end of the last message, how many of "${item}" are inside of ${otherItem}? Answer with a number, or if the amount is not clear, answer with one of the following: "a few", "several", "many", "a lot", "some", "half", "most", or "all"; note that the ${item} must be INSIDE ${otherItem} to be counted for this question.`;

                            console.log("Asking question, " + nextQuestion);

                            const possessionQuestion = await interactionGenerator.next({
                                maxCharacters: 0, maxSafetyCharacters: 100,
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
                            const hasContainer = itemsInQuestion.some((it) => it.capacityKg && it.capacityKg > 0);

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
                                        `Example: If the last message said that "2 ${item} were placed inside ${otherItem} at ${potentialLocation}", the answer would be "2"`,
                                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                        `Example: If the last message said that "2 ${item} were placed inside ${otherItem}, but the location was not specified, the answer would be "0" or "none" since it was not explicitly stated to be at the location ${potentialLocation}.`,
                                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                        `Example: If the last message said that "many of ${item} were placed on top of ${otherItem} at ${potentialLocation}, the answer would be "0" or "none" since it was explicitly stated to be on top of ${otherItem}, not inside it, even if the location was specified as ${potentialLocation}.`,
                                    ),
                                    grammar: amountGrammar,
                                    instructions: `The location "${potentialLocation}" must be EXPLICITLY WRITTEN in the last message text as the location of ${otherItem}. Do NOT infer or guess the location, all available locations where ${otherItem} might be are:\n\n` + allPotentialLocationsList,
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
                                        `Example: If the last message said that "2 ${item} were placed on top of ${otherItem} at ${potentialLocation}", the answer would be "2"`,
                                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                        `Example: If the last message said that "2 ${item} were placed on top of ${otherItem}, but the location was not specified, the answer would be "0" or "none" since it was not explicitly stated to be at the location ${potentialLocation}.`,
                                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                        `Example: If the last message said that "many of ${item} were placed inside of ${otherItem} at ${potentialLocation}, the answer would be "0" or "none" since it was explicitly stated to be inside of ${otherItem}, not on top of it, even if the location was specified as ${potentialLocation}.`,
                                    ),
                                    instructions: `The location "${potentialLocation}" must be EXPLICITLY WRITTEN in the last message text as the location of ${otherItem}. Do NOT infer or guess the location, all available locations where ${otherItem} might be are:\n\n` + allPotentialLocationsList,
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

                        const nextQuestion = `By the end of the last message, is the item "${item}" in direct possession of ${charName}? they are carrying it or wearing it`;
                        console.log("Asking question, " + nextQuestion);
                        const anotherChar = `${getCharacterNameForExample([charName], 0)}`;
                        const possessionQuestion = await interactionGenerator.next({
                            maxCharacters: 0, maxSafetyCharacters: 100,
                            maxParagraphs: 1,
                            nextQuestion: nextQuestion,
                            stopAfter: ["yes", "no", "Yes", "No", "YES", "NO"],
                            stopAt: [],
                            grammar: yesNoGrammar,
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
                            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                `Example: If the last message said that "${charName} wears ${item}", the answer would be "yes", since by the end of the message, ${charName} has the item in their possession and is wearing it`,
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
                            const nextQuestion = `By the end of the last message, was the item "${item}" thrown/launched towards ${charName} or in their general direction?`;
                            console.log("Asking question, " + nextQuestion);
                            const thrownQuestion = await interactionGenerator.next({
                                maxCharacters: 0, maxSafetyCharacters: 100,
                                maxParagraphs: 1,
                                nextQuestion: nextQuestion,
                                stopAfter: ["yes", "no", "Yes", "No", "YES", "NO"],
                                stopAt: [],
                                grammar: yesNoGrammar,
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
                            const nextQuestion = `By the end of the last message, how many of "${item}" ${questionPiece} ${charName}${questionPiece2}? Answer with a number, or if the amount is not clear, answer with one of the following: "a few", "several", "many", "a lot", "some", "half", "most", or "all".`;
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
                                const nextQuestion = `By the end of the last message, is the item "${item}" being worn by ${charName}? Answer "yes" ONLY if ${item} was PUT ON or WORN by ${charName}. If ${item} was taken off, removed, or not put on, answer "no".`;
                                console.log("Asking question, " + nextQuestion);
                                const wornQuestion = await interactionGenerator.next({
                                    maxCharacters: 0, maxSafetyCharacters: 100,
                                    maxParagraphs: 1,
                                    nextQuestion: nextQuestion,
                                    stopAfter: ["yes", "no", "Yes", "No", "YES", "NO"],
                                    stopAt: [],
                                    grammar: yesNoGrammar,
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
                        const nextQuestion = `By the end of the last message, was the item "${item}" dropped on the ground? Answer "yes" ONLY if the item is on the ground and not inside or atop another item. If the item is inside or atop another item, answer "no".`;
                        console.log("Asking question, " + nextQuestion);
                        const charName = character.name;
                        const droppedQuestion = await interactionGenerator.next({
                            maxCharacters: 0, maxSafetyCharacters: 100,
                            maxParagraphs: 1,
                            nextQuestion: nextQuestion,
                            stopAfter: ["yes", "no", "Yes", "No", "YES", "NO"],
                            stopAt: [],
                            grammar: yesNoGrammar,
                            contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                                `Example: If the last message said that "${charName} drops ${item} on the ground", the answer would be "yes", since by the end of the message, the item is on the ground and not inside or atop another item.`,
                            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                `Example: If the last message said that "${charName} places ${item} on top of a table", the answer would be "no", since by the end of the message, the item is atop another item (the table) and not on the ground.`,
                            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                `Example: If the last message said that "${charName} launches/throws ${item}" the answer should be "yes"`,
                            ),
                            instructions: `Actions that should answer YES for include: throwing, dropping, or placing ${item} on the ground or floor`
                        });
                        if (droppedQuestion.done) {
                            throw new Error("Questioning agent finished without providing an answer for item dropped on the ground check.");
                        }
                        console.log("Received answer, " + droppedQuestion.value);

                        if (isYes(droppedQuestion.value)) {
                            const howManyDroppedQuestion = `By the end of the last message, how many of "${item}" were dropped on the ground? Answer with a number, or if the amount is not clear, answer with one of the following: "a few", "several", "many", "a lot", "some", "half", "most", or "all".`;
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
                                    stopAfter: ["yes", "no", "Yes", "No", "YES", "NO"],
                                    stopAt: [],
                                    grammar: yesNoGrammar,
                                    nextQuestion: `By the end of the last message, was the item "${item}" thrown/launched? Answer "yes" ONLY if the item was thrown or launched. If the item was dropped without being thrown or launched, answer "no".`,
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
                                    const nextQuestion = thrown ? `By the end of the last message, did "${item}" land in "${slot}"? Answer "yes" ONLY if it is explicitly stated or very strongly implied that the item landed in "${slot}". If it is not clear that the item landed in "${slot}", answer "no".` : `By the end of the last message, did "${item}" get dropped at the location of "${slot}"? Answer "yes" ONLY if it is explicitly stated or very strongly implied that the item was dropped at the location of "${slot}". If it is not clear that the item was dropped at the location of "${slot}", answer "no".`;
                                    console.log("Asking question, " + nextQuestion);
                                    const slotQuestion = await interactionGenerator.next({
                                        maxCharacters: 0, maxSafetyCharacters: 100,
                                        maxParagraphs: 1,
                                        nextQuestion: nextQuestion,
                                        stopAfter: ["yes", "no", "Yes", "No", "YES", "NO"],
                                        stopAt: [],
                                        grammar: yesNoGrammar,
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

                    const nextQuestionSteal = `By the last message, was the item "${item}" stolen? Answer "yes" ONLY if a character took the item without permission from its previous possessor. If the item was obtained through other means (like finding it, being given it, or moving it from one place to another without taking it from someone else), answer "no".`;
                    console.log("Asking question, " + nextQuestionSteal);
                    const stealQuestion = await interactionGenerator.next({
                        maxCharacters: 0, maxSafetyCharacters: 100,
                        maxParagraphs: 1,
                        nextQuestion: nextQuestionSteal,
                        stopAfter: ["yes", "no", "Yes", "No", "YES", "NO"],
                        stopAt: [],
                        grammar: yesNoGrammar,
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

                    if (isYes(stealQuestion.value)) {
                        wasStolen = true;
                    }

                    if (wasStolen) {
                        const nextQuestion = `By the last message, who stole the item "${item}"? Answer with the name of the character who stole it. If it's not clear who stole it, answer with "none".`;

                        console.log("Asking question, " + nextQuestion);
                        const stealByQuestion = await interactionGenerator.next({
                            maxCharacters: 0, maxSafetyCharacters: 100,
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
                            answerTrail: "The character who stole " + JSON.stringify(item) + " is:\n\n",
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
                                maxCharacters: 0, maxSafetyCharacters: 100,
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
                        const nextQuestion = `According to the last message to analyze, did ${charName} get ${interactionType} the ${item} that was originally ${allPotentialLocationsForItem[i]}?`;
                        console.log("Asking question, " + nextQuestion);
                        const whereWasItQuestion = await interactionGenerator.next({
                            maxCharacters: 0, maxSafetyCharacters: 100,
                            maxParagraphs: 1,
                            nextQuestion: nextQuestion,
                            stopAfter: ["yes", "no", "Yes", "No", "YES", "NO"],
                            stopAt: [],
                            grammar: yesNoGrammar,
                            contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                                `Example: If the last message said that "${charName} got ${interactionType} ${item} from ${answerAlt}", the answer would be "no", since it was originally ${answerAlt}, not ${allPotentialLocationsForItem[i]}.`,
                            ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                                `Example: If the last message said that "${charName} got ${interactionType} ${item} ${allPotentialLocationsForItem[i]}", the answer would be "yes", since it was originally ${allPotentialLocationsForItem[i]}.`,
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

            const canBeInside = allPotentialItemsForItem.some((itemOptions) => itemOptions.some((it) => it.capacityKg && it.capacityKg > 0));
            const alreadyInside = engine.deObject.stateFor[charName].insideItemNameOnly === item;
            if (canBeInside && !alreadyInside) {
                const nextQuestion = `By the end of the last message, is ${charName} inside ${item}? Answer "yes" ONLY if ${charName} got inside ${item} by entering it, climbing into it, or being put into it. If ${charName} is near ${item} but not inside it, or if it's not clear if they are inside it, answer "no".`;
                console.log("Asking question, " + nextQuestion);
                const insideQuestion = await interactionGenerator.next({
                    maxCharacters: 0, maxSafetyCharacters: 100,
                    maxParagraphs: 1,
                    nextQuestion: nextQuestion,
                    stopAfter: ["yes", "no", "Yes", "No", "YES", "NO"],
                    stopAt: [],
                    grammar: yesNoGrammar,
                    contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                        `Example: If the last message said that "${charName} climbed into ${item}", the answer would be "yes", since by the end of the message, ${charName} is inside ${item}.`,
                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                        `Example: If the last message said that "${charName} is near ${item}", the answer would be "no", since by the end of the message, ${charName} is not inside ${item}.`,
                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                        `Example: If the last message said that "${charName} was put inside ${item} by ${getCharacterNameForExample([charName], 0)}", the answer would be "yes", since by the end of the message, ${charName} is inside ${item}.`,
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
                if (isYes(insideQuestion.value)) {
                    isInsideItem = true;
                }
            }

            const alreadyAtop = engine.deObject.stateFor[charName].atopItemNameOnly === item;
            if (!isInsideItem && !alreadyAtop) {
                const nextQuestion = `By the end of the last message, is ${charName} on top of ${item} (sitting, standing, or laying on it, or any other position atop)? Answer "yes" ONLY if ${charName} got on top of ${item} by sitting, standing, laying on it, or being placed on top of it. If ${charName} is near ${item} but not on top of it, or if it's not clear if they are on top of it, answer "no".`;
                console.log("Asking question, " + nextQuestion);
                const atopQuestion = await interactionGenerator.next({
                    maxCharacters: 0, maxSafetyCharacters: 100,
                    maxParagraphs: 1,
                    nextQuestion: nextQuestion,
                    stopAfter: ["yes", "no", "Yes", "No", "YES", "NO"],
                    stopAt: [],
                    grammar: yesNoGrammar,
                    contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                        `Example: If the last message said that "${charName} is sitting on top of ${item}", the answer would be "yes", since by the end of the message, ${charName} is on top of ${item}.`,
                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                        `Example: If the last message said that "${charName} is near ${item}", the answer would be "no", since by the end of the message, ${charName} is not on top of ${item}.`,
                    ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                        `Example: If the last message said that "${charName} was placed on top of ${item} by ${getCharacterNameForExample([charName], 0)}", the answer would be "yes", since by the end of the message, ${charName} is on top of ${item}.`,
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

            const alreadyBeingCarriedBy = engine.deObject.stateFor[charName].beingCarriedByCharacter === otherCharName;

            if (alreadyBeingCarriedBy) {
                // do not ask again, maybe they are inside an item now, eg. in their backpack
                // so we dont want to move it to a general grab
                continue;
            }

            const carryingThatCharacterInsteadAndItIsEstablished = engine.deObject.stateFor[otherCharName].beingCarriedByCharacter === charName && charactersWithAEstablishedPositionSoFar.includes(otherCharName);

            if (carryingThatCharacterInsteadAndItIsEstablished) {
                // this means that the other character we will check if our character got on top is actually carrying them, so it is pointless to ask
                // because we already established that, eg. Say the message is *Onza carries Dema*, first we check if
                // Dema is on top of Onza, and we establish that it is true.
                // then once the algorithm thinks about checking if Onza is on top of Dema, it will see that Dema is being carried by Onza, so Onza cannot be on top of Dema
                // hence asking doesn't make sense
                continue;
            }

            const nextQuestion = `By the end of the last message, did ${charName} get on top of ${otherCharName}? Answer "yes" ONLY if ${charName} themselves physically ended up on top of ${otherCharName} (for example, ${charName} is sitting, standing, laying, or riding on ${otherCharName}, or was placed on ${otherCharName}'s back, shoulders, head, etc...). Be careful about directionality: if ${otherCharName} picked up or carried ${charName}, then ${charName} is on top — but if ${charName} picked up or carried ${otherCharName}, then ${charName} is NOT on top. If ${charName} is near ${otherCharName} but not physically on top of them, or if it's not clear, answer "NO".`;
            console.log("Asking question, " + nextQuestion);
            const atopQuestion = await interactionGenerator.next({
                maxCharacters: 0, maxSafetyCharacters: 100,
                maxParagraphs: 1,
                nextQuestion: nextQuestion,
                stopAfter: ["yes", "no", "Yes", "No", "YES", "NO"],
                stopAt: [],
                grammar: yesNoGrammar,
                contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "${charName} is sitting on top of ${otherCharName}", the answer would be "yes", since by the end of the message, ${charName} is on top of ${otherCharName}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "${charName} is near ${otherCharName}", the answer would be "no", since by the end of the message, ${charName} is not on top of ${otherCharName}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "${charName} was placed on top of ${otherCharName} by ${getCharacterNameForExample([charName, otherCharName], 0)}", the answer would be "yes", since by the end of the message, ${charName} is on top of ${otherCharName}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "${charName} jumped and began riding ${otherCharName}", the answer would be "yes", since by the end of the message, ${charName} is on top of ${otherCharName}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "${charName} picked up ${otherCharName} and carried them", the answer would be "no", since ${charName} is the one carrying — it is ${otherCharName} who is on top of ${charName}, not the other way around.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "${charName} is hugging ${otherCharName}", the answer would be "no", since by the end of the message, ${charName} is not on top of ${otherCharName}.`,
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
                    "ontopCharacters",
                    addedMessagesForStoryMaster,
                );
                charactersWithAEstablishedPositionSoFar.push(charName);
                break;
            }

            const nextQuestionGrabbedOrPickedUp = `By the end of the last message, did ${otherCharName} pick up or start carrying ${charName}? Answer "yes" ONLY if ${otherCharName} is now carrying ${charName} in any way — such as lifting them onto a shoulder, placing them on their head, lifting them, letting them ride on their back, holding them in their arms, carrying them by hand, or any other form of carrying (characters can vary greatly in size). If ${otherCharName} is merely near ${charName} but is not carrying them, or if it's not clear, answer "no".`;
            console.log("Asking question, " + nextQuestionGrabbedOrPickedUp);
            const grabbedOrPickedUpQuestion = await interactionGenerator.next({
                maxCharacters: 0, maxSafetyCharacters: 100,
                maxParagraphs: 1,
                nextQuestion: nextQuestionGrabbedOrPickedUp,
                stopAfter: ["yes", "no", "Yes", "No", "YES", "NO"],
                stopAt: [],
                grammar: yesNoGrammar,
                contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "${otherCharName} picked up ${charName} and is now carrying them", the answer would be "yes", since by the end of the message, ${otherCharName} is carrying ${charName}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "${otherCharName} is near ${charName} but is not carrying them", the answer would be "no", since by the end of the message, ${otherCharName} is not carrying ${charName}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "${otherCharName} lifted ${charName} onto their shoulder", the answer would be "yes", since by the end of the message, ${otherCharName} is carrying ${charName}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "${otherCharName} is hugging ${charName}", the answer would be "no", since by the end of the message, ${otherCharName} is not carrying ${charName}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "${charName} picked up ${otherCharName} and carried them", the answer would be "no", since ${charName} is the one carrying — it is ${otherCharName} who is on top of ${charName}, not the other way around.`,
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
                charactersWithAEstablishedPositionSoFar.push(charName);
                break;
            }
        }

        if (charactersWithAEstablishedPositionSoFar.includes(charName)) {
            continue;
        }

        const charState = engine.deObject.stateFor[charName];
        if (charState.insideItem) {
            const nextQuestion = `By the end of the last message, did ${charName} get out of ${charState.insideItemNameOnly} (the item they were inside)? Answer "yes" ONLY if ${charName} got out of ${charState.insideItemNameOnly} by exiting it, climbing out of it, or being taken out of it. If ${charName} is still inside ${charState.insideItemNameOnly}, or if it's not clear if they got out of it, answer "no".`;
            console.log("Asking question, " + nextQuestion);
            const outsideQuestion = await interactionGenerator.next({
                maxCharacters: 0, maxSafetyCharacters: 100,
                maxParagraphs: 1,
                nextQuestion: nextQuestion,
                stopAfter: ["yes", "no", "Yes", "No", "YES", "NO"],
                stopAt: [],
                grammar: yesNoGrammar,
                contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "${charName} climbed out of ${charState.insideItemNameOnly}", the answer would be "yes", since by the end of the message, ${charName} is no longer inside ${charState.insideItemNameOnly}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "${charName} is still inside ${charState.insideItemNameOnly}", the answer would be "no", since by the end of the message, ${charName} is still inside ${charState.insideItemNameOnly}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "${charName} was taken out of ${charState.insideItemNameOnly} by ${getCharacterNameForExample([charName], 0)}", the answer would be "yes", since by the end of the message, ${charName} is no longer inside ${charState.insideItemNameOnly}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "${charName} exited ${charState.insideItemNameOnly}", the answer would be "yes", since by the end of the message, ${charName} is no longer inside ${charState.insideItemNameOnly}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "${charName} is on top of ${charState.insideItemNameOnly}", the answer would be "no", since by the end of the message, ${charName} is not inside ${charState.insideItemNameOnly}.`,
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
            }
        } else if (charState.atopItem) {
            const nextQuestion = `By the end of the last message, did ${charName} get out from being on top of ${charState.atopItemNameOnly} (the item they were laying/sitting/standing on)? Answer "yes" ONLY if ${charName} got out from ${charState.atopItemNameOnly} by exiting it, climbing out of it, or being taken out of it. If ${charName} is still on top of ${charState.atopItemNameOnly}, or if it's not clear if they got out of it, answer "no".`;
            console.log("Asking question, " + nextQuestion);
            const outsideQuestion = await interactionGenerator.next({
                maxCharacters: 0, maxSafetyCharacters: 100,
                maxParagraphs: 1,
                nextQuestion: nextQuestion,
                stopAfter: ["yes", "no", "Yes", "No", "YES", "NO"],
                stopAt: [],
                grammar: yesNoGrammar,
                contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "${charName} climbed out of ${charState.atopItemNameOnly}", the answer would be "yes", since by the end of the message, ${charName} is no longer on top of ${charState.atopItemNameOnly}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "${charName} is still on top of ${charState.atopItemNameOnly}", the answer would be "no", since by the end of the message, ${charName} is still on top of ${charState.atopItemNameOnly}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "${charName} was taken out of ${charState.atopItemNameOnly} by ${getCharacterNameForExample([charName], 0)}", the answer would be "yes", since by the end of the message, ${charName} is no longer on top of ${charState.atopItemNameOnly}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "${charName} exited ${charState.atopItemNameOnly}", the answer would be "yes", since by the end of the message, ${charName} is no longer on top of ${charState.atopItemNameOnly}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "${charName} is on top of ${charState.atopItemNameOnly}", the answer would be "no", since by the end of the message, ${charName} is still on top of ${charState.atopItemNameOnly}.`,
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
            }
        } else if (charState.beingCarriedByCharacter) {
            const nextQuestion = `By the end of the last message, did ${charName} is no longer being carried by ${charState.beingCarriedByCharacter}? Answer "yes" ONLY if ${charName} got put down from being carried by ${charState.beingCarriedByCharacter} by being set down on the ground or on a surface, or being given to someone else. If ${charName} is still being carried by ${charState.beingCarriedByCharacter}, or if it's not clear if they got put down, answer "no".`;
            console.log("Asking question, " + nextQuestion);
            const outsideQuestion = await interactionGenerator.next({
                maxCharacters: 0, maxSafetyCharacters: 100,
                maxParagraphs: 1,
                nextQuestion: nextQuestion,
                stopAfter: ["yes", "no", "Yes", "No", "YES", "NO"],
                stopAt: [],
                grammar: yesNoGrammar,
                contextInfo: engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "${charName} was put down by ${charState.beingCarriedByCharacter} on the ground", the answer would be "yes", since by the end of the message, ${charName} is no longer being carried by ${charState.beingCarriedByCharacter}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "${charName} is still being carried by ${charState.beingCarriedByCharacter}", the answer would be "no", since by the end of the message, ${charName} is still being carried by ${charState.beingCarriedByCharacter}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "${charName} was given to ${getCharacterNameForExample([charName], 0)} by ${charState.beingCarriedByCharacter}", the answer would be "yes", since by the end of the message, ${charName} is no longer being carried by ${charState.beingCarriedByCharacter}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "${charName} was got down from ${charState.beingCarriedByCharacter} shoulder by themselves", the answer would be "yes", since by the end of the message, ${charName} is no longer being carried by ${charState.beingCarriedByCharacter}.`,
                ) + "\n\n" + engine.inferenceAdapter.buildContextInfoExample(
                    `Example: If the last message said that "${charName} completed riding ${charState.beingCarriedByCharacter} and got down", the answer would be "yes", since by the end of the message, ${charName} is no longer being carried by ${charState.beingCarriedByCharacter}.`,
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
            }
        }

        // we consider now the position of the character to be established
        charactersWithAEstablishedPositionSoFar.push(charName);
    }

    console.log(addedMessagesForStoryMaster);
    process.exit(0);
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
 * @param {string} currentLocation
 * @param {Array<string | number>} locationPath
 * @param {boolean} [ignoreCarrierWearer] whether to ignore the carrier/wearer in the message, this is used for example when we are trying to figure out if an item is being worn by a character, as the LLM may refer to the item in a different way than how it is named in the world state, for example it may say "hat" instead of "red hat", so we want to ignore case and also check if the item name includes the name we are looking for instead of checking for an exact match, this is just to increase the chances of finding the item and thus accepting feasible changes even if they are not perfectly formatted
 */
function locationPathToMessage(engine, characterName, currentLocation, locationPath, ignoreCarrierWearer = false) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    let base = "";
    /**
     * @type {*}
     */
    let elementToFollow = null;
    if (locationPath[0] === "characters") {
        base = ignoreCarrierWearer ? "" : `${locationPath[2] === "carrying" ? "carried" : "worn"} by ${locationPath[1]}`;
        // @ts-ignore
        elementToFollow = engine.deObject.stateFor[locationPath[1]][locationPath[2]];
    } else if (locationPath[0] === "slots") {
        let locationSlotNameToUse = /** @type {string} */ (locationPath[1]);
        if (!locationSlotNameToUse.toLowerCase().startsWith("a ") && !locationSlotNameToUse.toLowerCase().startsWith("an ") && !locationSlotNameToUse.toLowerCase().startsWith("the ")) {
            locationSlotNameToUse = "the " + locationSlotNameToUse;
        }
        base = `in ${locationSlotNameToUse}`;
        elementToFollow = engine.deObject.world.locations[currentLocation].slots[locationPath[1]].items;
    }

    for (let i = 3; i < locationPath.length; i += 2) {
        const itemId = locationPath[i];
        const relation = locationPath[i + 1];

        let itemNameToUse = elementToFollow[itemId].name;
        if (!itemNameToUse.toLowerCase().startsWith("a ") && !itemNameToUse.toLowerCase().startsWith("an ") && !itemNameToUse.toLowerCase().startsWith("the ")) {
            if (checkItemIsOneOfAKindAtLocation(engine, characterName, engine.deObject.stateFor[characterName], elementToFollow[itemId].name)) {
                itemNameToUse = "the " + itemNameToUse;
            } else if (itemNameToUse.toLowerCase().startsWith("a")) {
                itemNameToUse = "an " + itemNameToUse;
            } else {
                itemNameToUse = "a " + itemNameToUse;
            }
        }
        if (relation === "containing") {
            base = `inside ${itemNameToUse}, ${base}`;
        } else if (relation === "ontop") {
            base = `on top of ${itemNameToUse}, ${base}`;
        }
        elementToFollow = elementToFollow[itemId][relation];
    }

    return base;
}

/**
 * @param {DEngine} engine
 * @param {string} currentLocation
 * @param {Array<string | number>} path
 * @return {{
 *   resolved: *,
 *   pathToResolved: Array<string | number>
 * }}
 */
function resolvePath(engine, currentLocation, path) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    /**
     * @type {*}
     */
    let current = path[0] === "slots" ? engine.deObject.world.locations[currentLocation].slots[path[1]] : engine.deObject.stateFor[path[1]];
    const startIndex = 2;
    for (let i = startIndex; i < path.length; i++) {
        // console.log(current)
        const part = path[i];
        // @ts-ignore
        current = current[part];
    }
    if (current._moved_to) {
        return resolvePath(engine, currentLocation, current._moved_to);
    }
    return {
        resolved: current,
        pathToResolved: path,
    };
}


/**
 * @param {DEngine} engine
 * @param {string} characterName
 * @param {DEStateForDescriptionWithHistory} charState
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
    // TODO remove
    console.log("FROM", fromPotentialLocationPaths);
    console.log("TO", toPotentialLocationPaths);

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

            let thrownAddition = thrown ? "After being thrown, " : "";
            if (typeof thrown === "string") {
                thrownAddition = `After being thrown towards ${thrown}, `;
            }

            // some nicer messages potentials
            if (actualEndingPath[0] === "characters" && actualEndingPath[2] === "carrying") {
                // A character picked up or received an item
                const messageSoFar = `${thrownAddition}${actualEndingPath[1]}${thrown ? " caught and is" : " is"} now carrying ${utilItemCount(engine, characterName, charState, amountToTransfer, item)} which previously ${amountToTransfer === 1 ? "was" : "were"} ${locationPathToMessage(engine, characterName, charState.location, componentFromPath.path)}`;
                if (actualEndingPath.length > 4) {
                    // eg. ["characters", "Alice", "carrying", 0, "containing", 1] we check above 4 to avoid the index of where the item is located in the carrying list
                    addedMessagesForStoryMaster.push(messageSoFar + `, and is now specifically ${locationPathToMessage(engine, characterName, charState.location, actualEndingPath, true)}`);
                } else {
                    addedMessagesForStoryMaster.push(messageSoFar);
                }
            } else if (actualEndingPath[0] === "slots" && actualEndingPath[2] === "items" && actualEndingPath.length <= 4) {
                // an item was dropped on the ground
                const messageSoFar = `${thrownAddition}${utilItemCount(engine, characterName, charState, amountToTransfer, item, true)}${thrown ? "" : amountToTransfer === 1 ? " was" : " were"} dropped on the ground at ${actualEndingPath[1]}, which previously was ${locationPathToMessage(engine, characterName, charState.location, componentFromPath.path)}`;
                addedMessagesForStoryMaster.push(messageSoFar);
            } else {
                if (thrown) {
                    const messageSoFar = `${thrownAddition}${utilItemCount(engine, characterName, charState, amountToTransfer, item, true)} dropped ${locationPathToMessage(engine, characterName, charState.location, actualEndingPath)}, which previously was ${locationPathToMessage(engine, characterName, charState.location, componentFromPath.path)}.`;
                    addedMessagesForStoryMaster.push(messageSoFar);
                } else {
                    const messageSoFar = `${utilItemCount(engine, characterName, charState, amountToTransfer, item, true)}${amountToTransfer === 1 ? " was moved" : " were moved"} from ${locationPathToMessage(engine, characterName, charState.location, componentFromPath.path)} to be ${locationPathToMessage(engine, characterName, charState.location, actualEndingPath)}.`;
                    addedMessagesForStoryMaster.push(messageSoFar);
                }
            }
        }
    }
}

/**
 * @param {DEngine} engine
 * @param {string} characterName
 * @param {DEStateForDescriptionWithHistory} charState
 * @param {Array<Array<string | number>>} toPotentialLocationPaths 
 * @param {"containingCharacters" | "ontopCharacters"} finalPath
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
    // TODO remove
    console.log("CHARTO", toPotentialLocationPaths);

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

    // loop through all the items and remove any item that has the character on top of it or inside
    const allOtherCharacters = [...charState.surroundingNonStrangers, ...charState.surroundingTotalStrangers, characterName];
    for (const charNameInQuestion of allOtherCharacters) {
        const otherCharState = engine.deObject.stateFor[charNameInQuestion];
        if (otherCharState.carryingCharacters.includes(characterName)) {
            const index = otherCharState.carryingCharacters.indexOf(characterName);
            otherCharState.carryingCharacters.splice(index, 1);
        }
        clearList(otherCharState.wearing);
        clearList(otherCharState.carrying);
    }
    for (const slot of Object.values(engine.deObject.world.locations[charState.location].slots)) {
        clearList(slot.items);
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
        // @ts-ignore
        charState.beingCarriedByCharacter = resolveInfo.pathToResolved[1];
        const carryingCharactersArr = engine.deObject.stateFor[resolveInfo.pathToResolved[1]].carryingCharacters;
        if (!carryingCharactersArr.includes(characterName)) {
            carryingCharactersArr.push(characterName);
        }
        addedMessagesForStoryMaster.push(`${characterName} is now being carried by ${resolveInfo.pathToResolved[1]}.`);
    } else {
        // @ts-ignore
        charState.locationSlot = resolveInfo.pathToResolved[1];
        if (isPureSlot) {
            addedMessagesForStoryMaster.push(`${characterName} is now on the ground at ${locationPathToMessage(engine, characterName, charState.location, resolveInfo.pathToResolved)}.`);
        }
    }

    if (finalPath === "containingCharacters" && !isPureCharacter && !isPureSlot) {
        charState.insideItem = locationPathToMessage(engine, characterName, charState.location, resolveInfo.pathToResolved);
        charState.insideItemNameOnly = resolveInfo.resolved.name;
        addedMessagesForStoryMaster.push(`${characterName} is now ${locationPathToMessage(engine, characterName, charState.location, [...resolveInfo.pathToResolved, "containing"])}.`);
    } else if (finalPath === "ontopCharacters" && !isPureCharacter && !isPureSlot) {
        charState.atopItem = locationPathToMessage(engine, characterName, charState.location, resolveInfo.pathToResolved);
        charState.atopItemNameOnly = resolveInfo.resolved.name;
        addedMessagesForStoryMaster.push(`${characterName} is now ${locationPathToMessage(engine, characterName, charState.location, [...resolveInfo.pathToResolved, "ontop"])}.`);
    }
}

/**
 * @param {DEngine} engine
 * @param {string} characterName
 * @param {DEStateForDescriptionWithHistory} charState
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
 * @param {DEStateForDescriptionWithHistory} charState 
 * @param {Array<Array<Array<string | number>>>} toPotentialLocationPaths 
 * @param {"containingCharacters" | "ontopCharacters"} finalPath
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
    let message = `${totalMoved} of ${item} ${totalMoved === 1 ? "was" : "were"} stolen by ${wasStolenBy}`;
    if (witnesses.length <= 0) {
        message += " with no witnesses, so none noticed the theft.";
    } else {
        message += ` and this was witnessed by ${engine.deObject?.functions.format_and(engine.deObject, null, witnesses)}`;
        if (ignorers.length > 0) {
            message += `, while ${engine.deObject?.functions.format_and(engine.deObject, null, ignorers)} were nearby but did not notice the theft`;
        }
        if (witnessesThatIgnoredTheft.length > 0) {
            message += `. Out of the witnesses, ${engine.deObject?.functions.format_and(engine.deObject, null, witnessesThatIgnoredTheft)} decided to ignore the theft and not intervene`;
        }
        if (witnessesThatTurnHeroes.length > 0) {
            message += `. Out of the witnesses, ${engine.deObject?.functions.format_and(engine.deObject, null, witnessesThatTurnHeroes)} have decided to call out the thief and intervene`;
        }
    }

    addedMessagesForStoryMaster.push(message);
}

function cleanDirtyItemTree(

) {
    // TODO Remove _moved_to
    // TODO Remove _just_placed
    // remove any items with amount 0
    // merge items that are equal
    // determine overflowing containers
    // crushed items
    // characters dropping items because they are too heavy
}

const irregularPlurals = {
    // Inanimate objects/items only
    "axis": "axes",
    "basis": "bases",
    "cactus": "cacti",
    "focus": "foci",
    "fungus": "fungi",
    "nucleus": "nuclei",
    "syllabus": "syllabi",
    "analysis": "analyses",
    "diagnosis": "diagnoses",
    "oasis": "oases",
    "thesis": "theses",
    "crisis": "crises",
    "phenomenon": "phenomena",
    "criterion": "criteria",
    "datum": "data",
    "index": "indices",
    "appendix": "appendices",
    "bacterium": "bacteria",
    "medium": "media",
    "radius": "radii",
    "formula": "formulae",
    "vertebra": "vertebrae",
    "curriculum": "curricula",
    "aircraft": "aircraft",
    "species": "species",
    "fish": "fish",
    "sheep": "sheep",
    "deer": "deer",
    "dice": "dice",
    "die": "dice",
    "leaf": "leaves",
    "loaf": "loaves",
    "knife": "knives",
    "life": "lives",
    "wife": "wives",
    "self": "selves",
    "wolf": "wolves",
    "calf": "calves",
    "elf": "elves",
    "scarf": "scarves",
    "hoof": "hooves",
    "tomato": "tomatoes",
    "potato": "potatoes",
    "torpedo": "torpedoes",
    "veto": "vetoes",
    "echo": "echoes",
    "hero": "heroes",
    "zero": "zeroes"
};

/**
 * @param {DEngine} engine
 * @param {string} characterName
 * @param {DEStateForDescriptionWithHistory} charState
 * @param {number} amount 
 * @param {string} item
 * @param {boolean} [capitalize] whether to capitalize the first letter of the item, this is used for example when the item is at the beginning of a sentence, so we want to make sure the message looks good
 */
function utilItemCount(engine, characterName, charState, amount, item, capitalize = false) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }

    const itemTrimmedLower = item.trim().toLowerCase();
    // List of common irregular plurals

    let toReturn = "";
    if (amount === 1 && itemTrimmedLower.startsWith("the ")) {
        toReturn = item;
    } else if (amount === 1) {
        const isOneOfAKind = checkItemIsOneOfAKindAtLocation(engine, characterName, charState, item);
        if (isOneOfAKind) {
            toReturn = `the ${item}`;
        } else if (itemTrimmedLower.startsWith("a")) {
            toReturn = `an ${item}`;
        } else {
            toReturn = `a ${item}`;
        }
    } else {
        // Try to pluralize using irregulars first
        const lastWord = itemTrimmedLower.split(" ").slice(-1)[0];
        // @ts-ignore
        if (irregularPlurals[lastWord]) {
            // Replace only the last word with its irregular plural
            const words = item.split(" ");
            // @ts-ignore
            words[words.length - 1] = irregularPlurals[lastWord];
            toReturn = `${amount} ${words.join(" ")}`;
        } else if (lastWord.endsWith("s") || lastWord.endsWith("x") || lastWord.endsWith("z") || lastWord.endsWith("ch") || lastWord.endsWith("sh")) {
            toReturn = `${amount} ${item}es`;
        } else if (lastWord.endsWith("y") && !["a", "e", "i", "o", "u"].includes(lastWord.slice(-2, -1))) {
            toReturn = `${amount} ${item.slice(0, -1)}ies`;
        } else {
            toReturn = `${amount} ${item}s`;
        }
    }
    if (capitalize) {
        toReturn = toReturn.charAt(0).toUpperCase() + toReturn.slice(1);
    }
    return toReturn;
}

/**
 * 
 * @param {DEngine} engine
 * @param {string} characterName
 * @param {DEStateForDescriptionWithHistory} charState 
 * @param {string} item
 */
function checkItemIsOneOfAKindAtLocation(engine, characterName, charState, item) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    let totalCount = 0;
    const itemTrimmedLower = item.trim().toLowerCase();

    /**
     * @param {DEItem[]} itemList 
     */
    const countInList = (itemList) => {
        for (const itemInList of itemList) {
            // @ts-ignore
            if (itemInList._moved_to) {
                continue; // skip items that have been moved, as they are not really present in the location anymore
            }
            if (itemInList.name.trim().toLowerCase() === itemTrimmedLower) {
                totalCount += itemInList.amount || 1;
            } else if (itemInList.name.trim().toLowerCase().includes(itemTrimmedLower)) {
                // we also check if the item name includes the item we are looking for, this is just to increase the chances of finding
                totalCount += itemInList.amount || 1;
            }
            if (totalCount > 1) {
                return;
            }
            countInList(itemInList.containing);
            if (totalCount > 1) {
                return;
            }
            countInList(itemInList.ontop);
            if (totalCount > 1) {
                return;
            }
        }
    }

    const itemLower = item.trim().toLowerCase();
    const allCharactersToCheck = [...charState.surroundingNonStrangers, ...charState.surroundingTotalStrangers, characterName];
    for (const charName of allCharactersToCheck) {
        const characterState = engine.deObject.stateFor[charName];
        countInList(characterState.carrying);
        if (totalCount > 1) {
            return;
        }
        countInList(characterState.wearing);
        if (totalCount > 1) {
            return;
        }
    }
    for (const [slotName, slot] of Object.entries(engine.deObject.world.locations[charState.location].slots)) {
        countInList(slot.items);
        if (totalCount > 1) {
            return;
        }
    }

    return totalCount <= 1;
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
            // TODO remove this log
            console.log("SPLIT: Splitting item stack because we are placing on top / inside of it and it has amount", next.amount, "item:", next.name);
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