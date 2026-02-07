import { deepCopy, DEngine } from "../../index.js";

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

    // if we reached here, the message is feasible
    // 2. we will calculate items changing hands (being dropped, picked up, given, stolen, etc.)
    const systemMessage = `You are an assistant and story analyst that determines if the last message from ${character.name} contains any items or other characters that have moved, changed hands, been dropped by any other character, in an interactive story. Changing hands means any item that has been picked up, dropped, given to another character, stolen, or otherwise transferred from one character to another.\n\n` +
        "This includes clothing and worn items that have been removed or put on, also characters that may have been picked up and carried by other characters";
    const systemPrompt = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(systemMessage, [
        "Consider only the last message from " + character.name + ".",
        "Identify any items that have been dropped by any chararacter, picked up, given to another character, stolen, or otherwise transferred from one character to another.",
        "Identify any characters that have been picked up and carried by other characters, or dropped by characters.",
        "Also identify any items dropped or left behind by any character.",
        "Identify any clothing or worn items that have been removed or put on by any character.",
        "If unable to specify where the item is placed next, assume it is placed on the ground at the current location of the character dropping or removing the item.",
        "Always place the name of the item in quotation marks",
        "Always place the name of the character in quotation marks",
        "Do not use steal lightly, only specify an item as stolen if it is explicitly stated that it was stolen or taken without permission. If it is not clear if the item was stolen or given, assume it was given.",
        "When specifying an item if a character has it, is wearing it or is otherwise in their posession specify it as \"[character name]'s [item name]\" to make it clear whose item it is, for example \"Alice's sword\". If the item is not in possession of any character, just specify the item name with quotation marks, for example \"a sword\".",
        "Always specify the actions in order as they happen in the message, for example if a character drops an item and then picks up another item, specify the dropped item first and then the picked up item.",
    ], null);

    const allContainersInLocation = [];
    const allCarriableItemsInLocation = [];
    const allWearableItemsInLocation = [];
    const allItemsInLocation = [];

    const allCharactersInLocation = [...charState.surroundingNonStrangers, ...charState.surroundingTotalStrangers, character.name];

    const location = engine.deObject.world.locations[charState.location];
    for (const slot of Object.values(location.slots)) {
        for (const item of slot.items) {
            if (item.wearableProperties) {
                allWearableItemsInLocation.push(item.name);
            }
            if (item.capacityKg) {
                allContainersInLocation.push(item.name);
            }
            allCarriableItemsInLocation.push(item.name);
            allItemsInLocation.push(item.name);
        }
    }

    for (const otherCharacterName of [...charState.surroundingNonStrangers, ...charState.surroundingTotalStrangers]) {
        const otherCharacterState = engine.deObject.stateFor[otherCharacterName];
        if (otherCharacterState.carrying) {
            for (const item of otherCharacterState.carrying) {
                if (item.wearableProperties) {
                    allWearableItemsInLocation.push(item.name);
                }
                if (item.capacityKg) {
                    allContainersInLocation.push(item.name);
                }
                allCarriableItemsInLocation.push(item.name);
                allItemsInLocation.push(item.name);
            }
        }
        if (otherCharacterState.wearing) {
            for (const item of otherCharacterState.wearing) {
                if (item.wearableProperties) {
                    allWearableItemsInLocation.push(item.name);
                }
                if (item.capacityKg) {
                    allContainersInLocation.push(item.name);
                }
                allCarriableItemsInLocation.push(item.name);
                allItemsInLocation.push(item.name);
            }
        }
    }

    const anyCharacterGrammarSimple = "characternamesimple ::= " + allCharactersInLocation.map(name => JSON.stringify(name)).join(" | ");
    const anyCharacterGrammarQuoted = `characternamequoted ::= \"\\\"\" characternamesimple \"\\\"\"`
    const commaSeparatorOrAnd = `commaseparatororand ::= (\",\" \" \") | \" and \"`;
    const amountNumber = `amountnumber ::= ([0-9]+ " " "of") | "a few" | "several" | "many" | "a lot of" | "some" | "half of" | "most of" | "all of"`;

    const containeroptionGrammar = "containeroption ::= \"\\\"\" (characternamesimple \"'s\")? (" + allContainersInLocation.map(name => JSON.stringify(name)).join(" | ") + ") \"\\\"\"";
    const anyItemOptionGrammar = "anyitemoption ::= " + allItemsInLocation.map(name => JSON.stringify(name)).join(" | ");
    const anyItemGrammar = "anyitem ::= \"\\\"\" (amountnumber \" \")? (characternamesimple \"'s\" \" \")? anyitemoption \"\\\"\"";
    const anyItemNoCountGrammar = "anyitemnocount ::= \"\\\"\" (characternamesimple \"'s\" \" \")? anyitemoption \"\\\"\"";
    const anyItemListGrammar = "anyitemlist ::= anyitem (commaseparatororand anyitem)*";

    const placementGrammar = `placement ::= ("on" " " anyitemnocount) | ("in" " " containeroption) | ("on" " " "\\"" "the" " " ("ground" | "floor") "\\"")`;
    const placementWithAndGrammar = `placementwithand ::= "and" " " "placed" " " ("them" | "it") " " placement`;
    const placementWithAndGiveGrammar = `placementwithgive ::= placementwithand | ("and" " " "gave" " " ("them" | "it") " " "to" " " characternamequoted)`;
    const placementWithAndOrWearOrGiveGrammar = `placementwithandorwearorgive ::= placementwithgive | ("and" " " "wore" " " ("them" | "it")) | ("and" " " "put" " " ("them" | "it") " " "on" " " ("\\""themselves"\\"" | "\\""himself"\\"" | "\\""herself"\\"" | characternamequoted | ("\\"" "the" " " ("ground" | "floor") "\\""))?)`;

    const simpleGiveGrammar = `simplegive ::= characternamequoted " " "gave" " " anyitemlist " " "to" " " characternamequoted`;
    const simplePutOnOtherGrammar = `simpleputonother ::= characternamequoted " " "made" " " characternamequoted " " (("put" " " "on") | "wear") " " anyitemlist`;
    const droppedGrammar = `characterdropped ::= characternamequoted " " "dropped" " " (anyitemlist | "\\"everything\\"" | "\\"all\\"" | "\\"all their items\\"" | "\\"all of their items\\"" | "\\"all of their belongings\\"")`;
    const droppedAndPlacedSomewhereElseGrammar = `characterdroppedandplacedsomewhereelse ::= characterdropped " " placementwithandorwearorgive`;
    const droppedClothesGrammar = `characterdroppedclothes ::= characternamequoted " " "removed" " " (anyitemlist | "\\"all their clothes\\"" | "\\"all their garments\\"" | "\\"all their wearables\\"")`;
    const droppedClothesAndPlacedSomewhereElseGrammar = `characterdroppedclothesandplacedsomewhereelse ::= characterdroppedclothes " " placementwithandorwearorgive`;
    const pickedUpGrammar = `characterpickedup ::= characternamequoted " " ("took" | ("picked" " " ("up" " ")?) | "stole" | ("put" " " "on") | "wore" | ("now" " " "wears")) anyitemlist`;
    const pickedUpAndPlacedSomewhereElseGrammar = `characterpickedupandplacedsomewhereelse ::= characterpickedup " " placementwithandorwearorgive`;
    const pickedUpOtherCharacter = `characterpickedupother ::= characternamequoted " " ("picked" " " ("up" " ")?) " " "another" " " "character" " " "named" " " characternamequoted`;
    const droppedOtherCharacter = `characterdroppedother ::= characternamequoted " " "dropped" " " "another" " " "character" " " "named" " " characternamequoted`;

    const statementGrammar = `statement ::= characterpickedupother | characterdroppedother | simplegive | simpleputonother | characterdropped | characterdroppedandplacedsomewhereelse | characterdroppedclothes | characterdroppedclothesandplacedsomewhereelse | characterpickedup | characterpickedupandplacedsomewhereelse`;
    const listOfStatementsGrammar = `root ::= (statement ("." "\\n" statement)*) | nothinghappened`;
    const nothingHappenedGrammar = `nothinghappened ::= "nothing happened" | "no item changes"`;

    const finalGrammar = [
        listOfStatementsGrammar,
        commaSeparatorOrAnd,
        amountNumber,

        anyCharacterGrammarSimple,
        anyCharacterGrammarQuoted,

        simpleGiveGrammar,
        simplePutOnOtherGrammar,
        containeroptionGrammar,
        anyItemOptionGrammar,
        anyItemNoCountGrammar,
        anyItemGrammar,
        anyItemListGrammar,
        placementGrammar,
        placementWithAndGrammar,
        placementWithAndGiveGrammar,
        placementWithAndOrWearOrGiveGrammar,
        droppedGrammar,
        droppedAndPlacedSomewhereElseGrammar,
        droppedClothesGrammar,
        droppedClothesAndPlacedSomewhereElseGrammar,
        pickedUpGrammar,
        pickedUpAndPlacedSomewhereElseGrammar,
        statementGrammar,
        nothingHappenedGrammar,
        pickedUpOtherCharacter,
        droppedOtherCharacter,
    ].join(";\n") + ";";

    const examples = engine.inferenceAdapter.buildContextInfoExample(
        `Example: if the last message from ${character.name} is "Alice gives Bob the sword and shield, then takes off her cloak and leaves it on the ground, while Charlie steals a potion from Alice", the output should be:`
        + "\n\n" +
        `"Alice" gave "Alice's sword" and "Alice's shield" to "Bob"\n"Alice" removed "Alice's cloak" and placed it on the ground\n"Charlie" stole "Alice's potion"`
    ) + "\n" + engine.inferenceAdapter.buildContextInfoExample(
        `Example: if the last message from ${character.name} is "${character.name} removes their shirt and puts it on Bob after removing his pants":`
        + "\n\n" +
        `"${character.name}" removed "${character.name}'s shirt" and put it on "Bob"\n"${character.name}" removed "${character.name}'s pants"`
    );

    const generator = engine.inferenceAdapter.runQuestioningCustomAgentOn(character, systemPrompt, examples, engine.getHistoryForCharacter(character, {}), "LAST_CYCLE_EXPANDED", null);

    const ready = await generator.next();
    if (ready.done) {
        throw new Error("Questioning agent could not be started properly for item changes check.");
    }

    const answer = await generator.next({
        maxParagraphs: 100,
        maxCharacters: 1000,
        nextQuestion: "Considering the last message from " + character.name + ", identify any items that have been dropped by any chararacter, picked up, given to another character, stolen, or otherwise transferred from one character to another. Also identify any clothing or worn items that have been removed or put on by any character. For each item, specify the character involved and the new placement of the item if applicable. If unable to specify where the item is placed next, assume it is placed on the ground at the current location of the character dropping or removing the item. Provide your answer as a list of statements in the format: '[Character] dropped [item(s)]', '[Character] dropped [item(s)] and placed them in [placement]', '[Character] removed [item(s)]', '[Character] removed [item(s)] and placed them in [placement]', '[Character] picked up [item(s)]', '[Character] picked up [item(s)] and placed them in [placement]', or similar formats indicating item changes. Separate multiple statements with a period and a new line.",
        stopAfter: [],
        stopAt: [],
        answerTrail: "In the last message from " + character.name + ", the following item changes occurred:\n",
        grammar: finalGrammar,
    });

    if (answer.done) {
        throw new Error("Questioning agent ended unexpectedly when asking about item changes.");
    }

    await generator.next(null); // finish the generator

    const answerValue = answer.value.trim().split("\n").map(line => line.trim()).filter(line => line);

    let nextToProcess = answerValue;

    /**
     * @type {string[]}
     */
    let storyMasterMessagesToAdd = [];

    let currentCycleIsProcessingAmount = 0;
    let previousCycleProcessedAmount = 0;
    let nextCycleIsForce = false;
    while (nextToProcess.length > 0) {
        console.log("Staring LOOP to process item changes, current cycle processing amount:", currentCycleIsProcessingAmount, "previous cycle processed amount:", previousCycleProcessedAmount, "next cycle is force:", nextCycleIsForce);

        const actualNextToProcess = nextToProcess;
        currentCycleIsProcessingAmount = actualNextToProcess.length;
        nextToProcess = [];
        for (const line of actualNextToProcess) {
            // parse the first character name in quotes first to determine the character involved
            if (!line.startsWith("\"")) {
                console.log("Feasibility check item changes: line does not start with a character name in quotes, skipping line:", line);
                continue;
            }
            if (line.startsWith("nothing happened") || line.startsWith("no item changes")) {
                console.log("Feasibility check item changes: line indicates no item changes, skipping line:", line);
                continue;
            }
            const firstQuoteEndIndex = line.indexOf("\"", 1);
            if (firstQuoteEndIndex === -1) {
                console.log("Feasibility check item changes: line does not contain a closing quote for character name, skipping line:", line);
                continue;
            }
            const { quoted: characterName, rest } = getNextQuotedAndSplit(line);
            if (!characterName) {
                console.log("Feasibility check item changes: could not parse character name from line, skipping line:", line);
                continue;
            } else if (!engine.deObject.characters[characterName]) {
                console.log("Feasibility check item changes: parsed character name not found in character list, skipping line:", line);
                continue;
            }

            const isPickedUpOtherCharacter = rest.indexOf("picked up another character named") === 0 || rest.indexOf("picked another character named") === 0;
            const isDroppedOtherCharacter = rest.indexOf("dropped another character named") === 0;
            const isSimpleGive = rest.indexOf("gave") === 0;
            const isMadeSomeoneElseWear = rest.indexOf("made") === 0;
            const isDropped = rest.indexOf("dropped") === 0 || rest.indexOf("removed") === 0;
            const isPickedUp = rest.indexOf("took") === 0 || rest.indexOf("picked") === 0 || rest.indexOf("stole") === 0 || rest.indexOf("put on") === 0 || rest.indexOf("wore") === 0 || rest.indexOf("now wears") === 0;
            if (isPickedUpOtherCharacter) {
                const { quoted: characterPickedUp } = getNextQuotedAndSplit(rest);
                if (characterPickedUp) {
                    attemptToPickUpCharacter(
                        engine,
                        characterPickedUp,
                        characterName,
                        nextCycleIsForce,
                        storyMasterMessagesToAdd,
                        line,
                    );
                }
            } else if (isDroppedOtherCharacter) {
                const { quoted: characterDropped } = getNextQuotedAndSplit(rest);
                if (characterDropped) {
                    attemptToDropCharacter(
                        engine,
                        characterDropped,
                        characterName,
                        nextCycleIsForce,
                        storyMasterMessagesToAdd,
                        line,
                    );
                }
            } else if (isSimpleGive) {
                // let's see who the recipient is, we will parse the last quoted name in the line for that
                // eg. "Alice" gave "Emma's sword" and "Emma's shield" to "Bob"

                // the list should be ["Emma's sword", "Emma's shield"] and the recipient should be "Bob"
                const { quotedList: itemList, rest: recipientInfoAfter } = getNextQuotedListAndSplit(rest);
                const { quoted: recepientCharacterName } = getNextQuotedAndSplit(recipientInfoAfter);

                let willRetry = false;
                let willSkip = false;
                for (const item of itemList) {
                    const rs = attemptToMoveItemToRecepient(
                        engine,
                        // the item contains the holder or owner in its name, for example "Emma's sword", so we can parse that
                        // so in total we have 3 people, the holder, the giver and the recepient, for example in "Alice gave Emma's sword to Bob", the holder is Emma, the giver is Alice and the recepient is Bob
                        item,
                        // in this case the character is giving the item, they are the giver, even if they are giving
                        // someone else item that other person is carrying
                        characterName,
                        // and the recepeint is the target
                        recepientCharacterName,
                        "carrying",
                        nextCycleIsForce,
                        storyMasterMessagesToAdd,
                        line,
                        false,
                    );
                    if (rs.retry) {
                        willRetry = true;
                    }
                    if (rs.skip) {
                        willSkip = true;
                    }
                }
                if (willSkip) {
                    console.log("Feasibility check item changes: skipping line due to unfeasible item change:", line);
                }
                if (willRetry) {
                    console.log("Feasibility check item changes: will retry line in the next loop due to missing information for item change:", line);
                    nextToProcess.push(line);
                }
            } else if (isMadeSomeoneElseWear) {
                // eg. "Alice" made "Bob" put on "Emma's cloak"
                const { quoted: targetCharacterName, rest: restAfterTarget } = getNextQuotedAndSplit(rest);
                const { quotedList: itemList } = getNextQuotedListAndSplit(restAfterTarget);

                let willRetry = false;
                let willSkip = false;
                for (const item of itemList) {
                    const rs = attemptToMoveItemToRecepient(
                        engine,
                        item,
                        characterName,
                        targetCharacterName,
                        "wearing",
                        nextCycleIsForce,
                        storyMasterMessagesToAdd,
                        line,
                        false,
                    );
                    if (rs.retry) {
                        willRetry = true;
                    }
                    if (rs.skip) {
                        willSkip = true;
                    }
                }
                if (willSkip) {
                    console.log("Feasibility check item changes: skipping line due to unfeasible item change:", line);
                }
                if (willRetry) {
                    console.log("Feasibility check item changes: will retry line in the next loop due to missing information for item change:", line);
                    nextToProcess.push(line);
                }
            } else if (isDropped) {
                // eg. "Alice" dropped "Emma's cloak" and placed it on the ground
                const { quotedList: droppedItemList, rest: restAfterDropped } = getNextQuotedListAndSplit(rest);

                const placedItSomewhereElse = restAfterDropped.indexOf("and placed") === 0 ||
                    restAfterDropped.indexOf("and put it on \"the ground\"") === 0 ||
                    restAfterDropped.indexOf("and put it on \"the floor\"") === 0 ||
                    restAfterDropped.indexOf("and put them on \"the ground\"") === 0 ||
                    restAfterDropped.indexOf("and put them on \"the floor\"") === 0;
                const giveToSomeoneElse = restAfterDropped.indexOf("and gave") === 0;
                const woreOrPutOn = restAfterDropped.indexOf("and wore") === 0 || restAfterDropped.indexOf("and put") === 0;

                let willRetry = false;
                let willSkip = false;
                if (placedItSomewhereElse || (!giveToSomeoneElse && !woreOrPutOn)) {
                    // the item was placed somewhere else, if not specified we assume it was placed on the ground at the current location of the character dropping or removing the item
                    let { quoted: placementLocation } = getNextQuotedAndSplit(restAfterDropped);
                    if (!placementLocation) {
                        placementLocation = "the ground";
                    }

                    const isPlacedOnTheItem = restAfterDropped.indexOf("on \"") !== -1;

                    if (placementLocation === "the ground" || placementLocation === "the floor") {
                        // the ground is just the current location slot
                        for (const item of droppedItemList) {
                            const rs = attemptToMoveItemToLocationItem(
                                engine,
                                item,
                                characterName,
                                charState.location,
                                charState.locationSlot,
                                null,
                                null,
                                nextCycleIsForce,
                                storyMasterMessagesToAdd,
                                line,
                            );
                            if (rs.retry) {
                                willRetry = true;
                            }
                            if (rs.skip) {
                                willSkip = true;
                            }
                        }
                    } else {
                        for (const item of droppedItemList) {
                            const rs = attemptToMoveItemToLocationItem(
                                engine,
                                item,
                                characterName,
                                charState.location,
                                charState.locationSlot,
                                isPlacedOnTheItem ? "on" : "in",
                                placementLocation,
                                nextCycleIsForce,
                                storyMasterMessagesToAdd,
                                line,
                            );
                            if (rs.retry) {
                                willRetry = true;
                            }
                            if (rs.skip) {
                                willSkip = true;
                            }
                        }
                    }
                } else if (giveToSomeoneElse) {
                    // the item was given to someone else, we will parse the last quoted name in the line for the recipient
                    const { quoted: recepientCharacterName } = getNextQuotedAndSplit(restAfterDropped);
                    for (const item of droppedItemList) {
                        const rs = attemptToMoveItemToRecepient(
                            engine,
                            item,
                            characterName,
                            recepientCharacterName,
                            "carrying",
                            nextCycleIsForce,
                            storyMasterMessagesToAdd,
                            line,
                            false,
                        );
                        if (rs.retry) {
                            willRetry = true;
                        }
                        if (rs.skip) {
                            willSkip = true;
                        }
                    }
                } else if (woreOrPutOn) {
                    // the item was put on or worn by the character, so we will move it to their wearing list
                    let { quoted: targetCharacterName } = getNextQuotedAndSplit(restAfterDropped);
                    if (targetCharacterName === "themselves" || targetCharacterName === "themself" || targetCharacterName === "himself" || targetCharacterName === "herself") {
                        targetCharacterName = characterName;
                    }

                    for (const item of droppedItemList) {
                        const rs = attemptToMoveItemToRecepient(
                            engine,
                            item,
                            characterName,
                            targetCharacterName,
                            "wearing",
                            nextCycleIsForce,
                            storyMasterMessagesToAdd,
                            line,
                            false,
                        );
                        if (rs.retry) {
                            willRetry = true;
                        }
                        if (rs.skip) {
                            willSkip = true;
                        }
                    }
                }
                if (willSkip) {
                    console.log("Feasibility check item changes: skipping line due to unfeasible item change:", line);
                }
                if (willRetry) {
                    console.log("Feasibility check item changes: will retry line in the next loop due to missing information for item change:", line);
                    nextToProcess.push(line);
                }
            } else if (isPickedUp) {
                // eg. "Alice" dropped "Emma's cloak" and placed it on the ground
                const { quotedList: pickedUpItemList, rest: restAfterDropped } = getNextQuotedListAndSplit(rest);

                const placedItSomewhereElse = restAfterDropped.indexOf("and placed") === 0 ||
                    restAfterDropped.indexOf("and put it on \"the ground\"") === 0 ||
                    restAfterDropped.indexOf("and put it on \"the floor\"") === 0 ||
                    restAfterDropped.indexOf("and put them on \"the ground\"") === 0 ||
                    restAfterDropped.indexOf("and put them on \"the floor\"") === 0;
                const giveToSomeoneElse = restAfterDropped.indexOf("and gave") === 0;
                const woreOrPutOn = restAfterDropped.indexOf("and wore") === 0 || restAfterDropped.indexOf("and put") === 0;
                const isStolenStuff = rest.indexOf("stole") === 0;

                let willRetry = false;
                let willSkip = false;
                if (!placedItSomewhereElse) {
                    // the item was just picked up, we will move it to the character's carrying or wearing list, depends
                    const isPutOn = rest.indexOf("put on") === 0 || rest.indexOf("wore") === 0 || rest.indexOf("now wears") === 0;

                    if (isPutOn) {
                        for (const item of pickedUpItemList) {
                            const rs = attemptToMoveItemToRecepient(
                                engine,
                                item,
                                characterName,
                                characterName,
                                "wearing",
                                nextCycleIsForce,
                                storyMasterMessagesToAdd,
                                line,
                                isStolenStuff,
                            );
                            if (rs.retry) {
                                willRetry = true;
                            }
                            if (rs.skip) {
                                willSkip = true;
                            }
                        }
                    } else {
                        for (const item of pickedUpItemList) {
                            const rs = attemptToMoveItemToRecepient(
                                engine,
                                item,
                                characterName,
                                characterName,
                                "carrying",
                                nextCycleIsForce,
                                storyMasterMessagesToAdd,
                                line,
                                isStolenStuff,
                            );
                            if (rs.retry) {
                                willRetry = true;
                            }
                            if (rs.skip) {
                                willSkip = true;
                            }
                        }
                    }
                } else if (placedItSomewhereElse) {
                    // the item was placed somewhere else, if not specified we assume it was placed on the ground at the current location of the character dropping or removing the item
                    let { quoted: placementLocation } = getNextQuotedAndSplit(restAfterDropped);
                    if (!placementLocation) {
                        placementLocation = "the ground";
                    }

                    const isPlacedOnTheItem = restAfterDropped.indexOf("on \"") !== -1;

                    if (placementLocation === "the ground" || placementLocation === "the floor") {
                        // the ground is just the current location slot
                        for (const item of pickedUpItemList) {
                            const rs = attemptToMoveItemToLocationItem(
                                engine,
                                item,
                                characterName,
                                charState.location,
                                charState.locationSlot,
                                null,
                                null,
                                nextCycleIsForce,
                                storyMasterMessagesToAdd,
                                line,
                            );
                            if (rs.retry) {
                                willRetry = true;
                            }
                            if (rs.skip) {
                                willSkip = true;
                            }
                        }
                    } else {
                        for (const item of pickedUpItemList) {
                            const rs = attemptToMoveItemToLocationItem(
                                engine,
                                item,
                                characterName,
                                charState.location,
                                charState.locationSlot,
                                isPlacedOnTheItem ? "on" : "in",
                                placementLocation,
                                nextCycleIsForce,
                                storyMasterMessagesToAdd,
                                line,
                            );
                            if (rs.retry) {
                                willRetry = true;
                            }
                            if (rs.skip) {
                                willSkip = true;
                            }
                        }
                    }
                } else if (giveToSomeoneElse) {
                    // the item was given to someone else, we will parse the last quoted name in the line for the recipient
                    const { quoted: recepientCharacterName } = getNextQuotedAndSplit(restAfterDropped);
                    for (const item of pickedUpItemList) {
                        const rs = attemptToMoveItemToRecepient(
                            engine,
                            item,
                            characterName,
                            recepientCharacterName,
                            "carrying",
                            nextCycleIsForce,
                            storyMasterMessagesToAdd,
                            line,
                            isStolenStuff,
                        );
                        if (rs.retry) {
                            willRetry = true;
                        }
                        if (rs.skip) {
                            willSkip = true;
                        }
                    }
                } else if (woreOrPutOn) {
                    // the item was put on or worn by the character, so we will move it to their wearing list
                    let { quoted: targetCharacterName } = getNextQuotedAndSplit(restAfterDropped);
                    if (targetCharacterName === "themselves" || targetCharacterName === "themself" || targetCharacterName === "himself" || targetCharacterName === "herself") {
                        targetCharacterName = characterName;
                    }

                    for (const item of pickedUpItemList) {
                        const rs = attemptToMoveItemToRecepient(
                            engine,
                            item,
                            characterName,
                            targetCharacterName,
                            "wearing",
                            nextCycleIsForce,
                            storyMasterMessagesToAdd,
                            line,
                            isStolenStuff,
                        );
                        if (rs.retry) {
                            willRetry = true;
                        }
                        if (rs.skip) {
                            willSkip = true;
                        }
                    }
                }
                if (willSkip) {
                    console.log("Feasibility check item changes: skipping line due to unfeasible item change:", line);
                }
                if (willRetry) {
                    console.log("Feasibility check item changes: will retry line in the next loop due to missing information for item change:", line);
                    nextToProcess.push(line);
                }
            }
        }

        if (currentCycleIsProcessingAmount === previousCycleProcessedAmount) {
            console.log("Feasibility check item changes: no progress made in processing item changes, stopping to prevent infinite loop. Remaining lines that were not processed:", nextToProcess);
            if (nextCycleIsForce) {
                console.log("Feasibility check item changes: we already attempted to force changes based on heuristics in a previous cycle, but there are still lines that we could not process, thus we will stop here to prevent infinite loop. Remaining lines that were not processed:", nextToProcess);
                break;
            } else {
                nextCycleIsForce = true;
                console.log("Attempting to force changes based on heuristics for remaining lines...");
            }
        }

        previousCycleProcessedAmount = currentCycleIsProcessingAmount;
    }

    // Force things to make sense, if they don't 
    const characterState = engine.deObject.stateFor[character.name];
    const allCharactersToCheck = [character.name, ...characterState.surroundingNonStrangers, ...characterState.surroundingTotalStrangers];
    for (const characterNameToCheck of allCharactersToCheck) {
        dropAnyOverflowingItemsFromOverfilledContainersAt(engine, characterNameToCheck, storyMasterMessagesToAdd);
        while (true) {
            const overfillInfo = isCharacterOverweightOrOverVolume(engine, characterNameToCheck);
            if (!overfillInfo.overWeight && !overfillInfo.overVolume) {
                break;
            }
            dropHeaviestCarriedItemOrCharacter(engine, characterNameToCheck, overfillInfo.overWeight, overfillInfo.overVolume, storyMasterMessagesToAdd);
        }
    }

    return storyMasterMessagesToAdd;
}

/**
 * OPTIMIZE some memoize may be good here
 * @param {string} text 
 * @returns {{
 *   quoted: string | null,
 *   rest: string,
 * }} 
 */
function getNextQuotedAndSplit(text) {
    const firstQuoteStartIndex = text.indexOf("\"", 0);
    if (firstQuoteStartIndex === -1) {
        return {
            quoted: null,
            rest: text,
        }
    }
    const secondQuoteEndIndex = text.indexOf("\"", firstQuoteStartIndex + 1);
    if (secondQuoteEndIndex === -1) {
        return {
            quoted: text.substring(firstQuoteStartIndex + 1).trim(),
            rest: "",
        };
    }
    const quoted = text.substring(firstQuoteStartIndex + 1, secondQuoteEndIndex);
    const rest = text.substring(secondQuoteEndIndex + 1).trim();
    return { quoted, rest };
}

/**
 * OPTIMIZE some memoize may be good here
 * Gets the next quoted item in the text and splits the text accordingly, it also checks if there is a comma or "and" after the quoted item, if so it continues to get the next quoted item and adds it to the list, it stops when there are no more quoted items or when there is no comma or "and" after the quoted item
 * For example, if the text is '"Alice's sword", "Bob's shield" and "Charlie's potion" are on the ground', it will return the list ["Alice's sword", "Bob's shield", "Charlie's potion"] and the rest 'are on the ground'
 * @param {string} text 
 * @returns 
 */
function getNextQuotedListAndSplit(text) {
    const firstResult = getNextQuotedAndSplit(text);
    if (!firstResult.quoted) {
        return {
            quotedList: [],
            rest: firstResult.rest,
        }
    }
    const quotedList = [
        firstResult.quoted,
    ];

    let rest = firstResult.rest;
    while (rest.length > 0 && rest.indexOf(",") === 0 || rest.indexOf("and ") === 0) {
        const nextResult = getNextQuotedAndSplit(rest);
        if (!nextResult.quoted) {
            break;
        }
        quotedList.push(nextResult.quoted);
        rest = nextResult.rest;
    }

    return {
        quotedList,
        rest,
    };
}

/**
 * @param {DEngine} engine 
 * @param {string} textOriginal
 */
function getItemNameAmountAndItemHolderFromText(engine, textOriginal) {
    let text = textOriginal;
    /**
     * @type {number | "a few" | "several" | "many" | "a lot of" | "some" | "half of" | "most of" | "all of"}
     */
    let amount = 1;

    if (text.startsWith("a few ")) {
        amount = "a few";
        text = text.substring("a few ".length);
    } else if (text.startsWith("several ")) {
        amount = "several";
        text = text.substring("several ".length);
    } else if (text.startsWith("many ")) {
        amount = "many";
        text = text.substring("many ".length);
    } else if (text.startsWith("a lot of ")) {
        amount = "a lot of";
        text = text.substring("a lot of ".length);
    } else if (text.startsWith("some ")) {
        amount = "some";
        text = text.substring("some ".length);
    } else if (text.startsWith("half of ")) {
        amount = "half of";
        text = text.substring("half of ".length);
    } else if (text.startsWith("most of ")) {
        amount = "most of";
        text = text.substring("most of ".length);
    } else if (text.startsWith("all of ")) {
        amount = "all of";
        text = text.substring("all of ".length);

        // lastly check if it is a number
    } else if (text.match(/^[0-9]+ of /)) {
        const numberMatch = text.match(/^([0-9]+) of /);
        if (numberMatch) {
            amount = parseInt(numberMatch[1]);
            text = text.substring(numberMatch[0].length);
        }
    }

    if (amount === 0) {
        console.log("Feasibility check item changes: parsed amount is 0, from text:", textOriginal, "this may be due to the item name starting with a number or a word that we parse as an amount, in this case we will assume the amount is 1 and that the parsed amount is actually part of the item name, item name:", text);
        return {
            amount: 0,
            itemHolder: null,
            itemNameWithoutHolder: text,
        }
    }

    // now let's try to determine if the item has a character name in it, for example "Alice's sword", if so we will check if the character that is said to own the item actually owns it, if not we will check if the item is in the location
    let itemHolder = text.includes("'s ") ? text.split("'s ")[0] : null;
    // @ts-expect-error
    if (itemHolder && !engine.deObject.characters[itemHolder]) {
        console.log("Feasibility check item changes: parsed item holder character name not found in character list, assuming this is part of the item name for this item:", text);
        itemHolder = null;
    }
    let itemNameWithoutHolder = text;
    if (itemHolder) {
        itemNameWithoutHolder = text.substring(text.indexOf("'s ") + 3).trim();
    }

    return {
        amount,
        itemHolder,
        itemNameWithoutHolder,
    }
}

/**
 * 
 * @param {DEngine} engine 
 * @param {string} itemName 
 * @param {string} dropper 
 * @param {string} locationId 
 * @param {string} locationSlot
 * @param {"on" | "in" | null} placementType if the item is being placed on or in another item, this is the type of placement, if null it means the item is being placed on the ground at the location
 * @param {string|null} placementTarget the target item that the item is being placed on or in, if placementType is not null, this is the name of the item that the item is being placed on or in, if placementType is null, this should be null as well
 * @param {boolean} useForce 
 * @param {string[]} storyMasterMessagesToAdd 
 * @param {string} line 
 */
function attemptToMoveItemToLocationItem(engine, itemName, dropper, locationId, locationSlot, placementType, placementTarget, useForce, storyMasterMessagesToAdd, line) {
    if (!engine.deObject) {
        throw new Error("DEngine object not found in attemptToMoveItemToLocationItem");
    }

    let { amount, itemHolder, itemNameWithoutHolder } = getItemNameAmountAndItemHolderFromText(engine, itemName);

    const dropperState = engine.deObject.stateFor[dropper];
    if (!dropperState) {
        console.log("Feasibility check item changes: dropper character state not found, skipping feasibility check for this line:", line);
        return {
            retry: false,
            skip: true,
        }
    }

    if (!itemHolder && dropper) {
        itemHolder = dropper;
    }

    let itemHolderState = itemHolder ? engine.deObject.stateFor[itemHolder] : null;
    if (!itemHolderState) {
        console.log("Feasibility check item changes: item holder character state not found, skipping feasibility check for this line:", line);
        return {
            retry: false,
            skip: true,
        }
    }

    const location = engine.deObject.world.locations[locationId];
    const locationSlotObj = location.slots[locationSlot];
    if (!locationSlotObj) {
        console.log("Feasibility check item changes: location slot not found, skipping feasibility check for this line:", line);
        return {
            retry: false,
            skip: true,
        }
    }
    const isPlacedOnTheItem = placementType === "on";

    if (useForce) {
        if (!itemHolder) {
            throw new Error("This does not really happen because a null check has already been done, it's just typescript requiring me to always make dumb checks");
        }
        // let's find an item holder that has the item in question
        for (const characterName of [itemHolder, dropper, ...dropperState.surroundingNonStrangers, ...dropperState.surroundingTotalStrangers]) {
            const characterState = engine.deObject.stateFor[characterName];
            if (characterState) {
                const carryingItem = itemListHasItem(characterState.carrying, itemNameWithoutHolder);
                const wearingItem = itemListHasItem(characterState.wearing, itemNameWithoutHolder);
                if (carryingItem || wearingItem) {
                    itemHolder = characterName;
                    itemHolderState = characterState;
                    console.log("Feasibility check item changes: using heuristics to determine that the item holder is actually", itemHolder, "for item change line:", line);
                    break;
                }
            }
        }
    }

    // check if the item is indeed in the dropper's carrying or wearing state, if not we may be in an out of order inference situation where we are processing the dropped item before processing the picked up item in the same message, so we will skip this line for now and process it again in the next loop after processing other lines that may give us more information about the state of the world, for example if the item is being picked up by another character in the same message before being dropped by the current character, we will process the picked up line first and then when we process the dropped line we will see that the item is indeed in the dropper's state, thus we can be reasonably sure that the dropped action is feasible
    const carryingSourceItem = itemListHasItem(itemHolderState.carrying, itemNameWithoutHolder);
    const wearingSourceItem = itemListHasItem(itemHolderState.wearing, itemNameWithoutHolder);
    if (!carryingSourceItem && !wearingSourceItem && useForce) {
        console.log("Feasibility check item changes: item does not seem to be in dropper's carrying or wearing state even after attempting to force change based on heuristics, this may be due to unfeasible item change or incorrect parsing of the line, skipping line:", line);
        return {
            retry: false,
            skip: true,
        }
    }
    if (!carryingSourceItem && !wearingSourceItem) {
        console.log("Feasibility check item changes: item does not seem to be in dropper's carrying or wearing state, this may be due to out of order inference, adding line back to processing list to check again in the next cycle after other lines have been processed, line:", line);
        return {
            retry: true,
            skip: false,
        }
    }

    // placing in the ground at the location
    if (!placementTarget) {
        if (carryingSourceItem) {
            // we will move the item from the dropper's carrying state to the location slot
            const actualAmountDropped = recalculateDEItemListMovement(
                carryingSourceItem.item,
                carryingSourceItem.sourceList,
                locationSlotObj.items,
                amount,
                "on the ground",
            );
            if (dropper === itemHolder) {
                storyMasterMessagesToAdd.push(`${dropper} dropped${actualAmountDropped === 1 ? "" : " " + actualAmountDropped} ${displayItemNameForStoryMessage(carryingSourceItem.item)} on the ground at ${locationSlot}`);
            } else {
                storyMasterMessagesToAdd.push(`${dropper} dropped${actualAmountDropped === 1 ? "" : " " + actualAmountDropped} ${displayItemNameForStoryMessage(carryingSourceItem.item)} from ${itemHolder} on the ground at ${locationSlot}`);
            }
        } else if (wearingSourceItem) {
            // we will move the item from the dropper's wearing state to the location slot
            const actualAmountDropped = recalculateDEItemListMovement(
                wearingSourceItem.item,
                wearingSourceItem.sourceList,
                locationSlotObj.items,
                amount,
                "on the ground",
            );
            if (dropper === itemHolder) {
                storyMasterMessagesToAdd.push(`${dropper} removed${actualAmountDropped === 1 ? "" : " " + actualAmountDropped} ${displayItemNameForStoryMessage(wearingSourceItem.item)} and placed it on the ground at ${locationSlot}`);
            } else {
                storyMasterMessagesToAdd.push(`${dropper} removed${actualAmountDropped === 1 ? "" : " " + actualAmountDropped} ${displayItemNameForStoryMessage(wearingSourceItem.item)} from ${itemHolder} and placed it on the ground at ${locationSlot}`);
            }
        }
        return {
            retry: false,
            skip: false,
        }
    } else {
        // now we have a placement target we should seek to find
        let { amount: _, itemHolder: placementTargetHolder, itemNameWithoutHolder: placementTargetItemName } = getItemNameAmountAndItemHolderFromText(engine, placementTarget);

        if (useForce) {
            // let's find the actual placementTargetHolder, provided one exists
            for (const characterName of [placementTargetHolder, dropper, ...dropperState.surroundingNonStrangers, ...dropperState.surroundingTotalStrangers].filter(name => name !== null)) {
                const characterState = engine.deObject.stateFor[characterName];
                if (characterState) {
                    const carryingItem = itemListHasItem(characterState.carrying, placementTargetItemName);
                    const wearingItem = itemListHasItem(characterState.wearing, placementTargetItemName);
                    if (carryingItem || wearingItem) {
                        placementTargetHolder = characterName;
                        console.log("Feasibility check item changes: using heuristics to determine that the placement target holder is actually", placementTargetHolder, "for item change line:", line);
                        break;
                    }
                }
            }
        }

        /**
         * @type {DEItem}
         */
        let targetItem;
        /**
         * @type {DEItem[]} the list in which the target item is located, either a character's carrying or wearing list, or a location slot's items list
         */
        let targetItemSourceList;
        let newPlacementMessage = "";
        if (placementTargetHolder) {
            const placementTargetHolderState = engine.deObject.stateFor[placementTargetHolder];
            if (!placementTargetHolderState) {
                console.log("Feasibility check item changes: placement target holder character state not found, skipping feasibility check for this line:", line);
                return {
                    retry: false,
                    skip: true,
                }
            }
            const carryingTargetItem = itemListHasItem(placementTargetHolderState.carrying, placementTargetItemName);
            const wearingTargetItem = itemListHasItem(placementTargetHolderState.wearing, placementTargetItemName);
            if (carryingTargetItem) {
                targetItem = carryingTargetItem.item;
                targetItemSourceList = carryingTargetItem.sourceList;
            } else if (wearingTargetItem) {
                targetItem = wearingTargetItem.item;
                targetItemSourceList = wearingTargetItem.sourceList;
            } else {
                console.log("Feasibility check item changes: placement target item not found in placement target holder's carrying or wearing state, this may be due to out of order inference, adding line back to processing list to check again in the next cycle after other lines have been processed, line:", line);
                if (useForce) {
                    // try to find in any location slot as well
                    placementTargetHolder = null;
                    const dropperLocationObject = engine.deObject.world.locations[dropperState.location];
                    let foundItInLocation = false;
                    for (const [slotName, slot] of Object.entries(dropperLocationObject.slots)) {
                        const slotItem = itemListHasItem(slot.items, placementTargetItemName);
                        if (slotItem) {
                            targetItem = slotItem.item;
                            targetItemSourceList = slot.items;
                            foundItInLocation = true;
                            console.log("Feasibility check item changes: using heuristics to determine that the placement target item is actually in location slot", slotName, "for item change line:", line);
                            break;
                        }
                    }

                    if (!foundItInLocation) {
                        console.log("Feasibility check item changes: could not find placement target item in any location slot after attempting to force change based on heuristics, this may be due to unfeasible item change or incorrect parsing of the line, skipping line:", line);
                        return {
                            retry: false,
                            skip: true,
                        }
                    }
                } else {
                    console.log("Feasibility check item changes: placement target item not found in placement target holder's carrying or wearing state, this may be due to out of order inference, adding line back to processing list to check again in the next cycle after other lines have been processed, line:", line);
                    return {
                        retry: true,
                        skip: false,
                    }
                }
            }
        } else {
            let foundItInLocation = false;
            const dropperLocationObject = engine.deObject.world.locations[dropperState.location];
            for (const [slotName, slot] of Object.entries(dropperLocationObject.slots)) {
                const slotItem = itemListHasItem(slot.items, placementTargetItemName);
                if (slotItem) {
                    targetItem = slotItem.item;
                    targetItemSourceList = slot.items;
                    foundItInLocation = true;
                    console.log("Feasibility check item changes: found the placement target item in location slot", slotName, "for item change line:", line);
                    break;
                }
            }

            if (!foundItInLocation) {
                console.log("Feasibility check item changes: placement target item not found in any location slot, this may be due to out of order inference, adding line back to processing list to check again in the next cycle after other lines have been processed, line:", line);
                if (useForce) {
                    console.log("Feasibility check item changes: could not find placement target item in any location slot after attempting to force change based on heuristics, this may be due to unfeasible item change or incorrect parsing of the line, skipping line:", line);
                    return {
                        retry: false,
                        skip: true,
                    }
                }
                return {
                    retry: true,
                    skip: false,
                }
            }
        }


        if (carryingSourceItem) {
            // now here we have found the item
            const amountMoved = recalculateDEItemListMovement(
                carryingSourceItem.item,
                carryingSourceItem.sourceList,
                // @ts-ignore typescript is wrong
                isPlacedOnTheItem ? targetItemSourceList : targetItem.containing,
                amount,
                // @ts-ignore typescript is wrong
                isPlacedOnTheItem ? `on ${displayItemNameForStoryMessage(targetItem)}` : `in ${displayItemNameForStoryMessage(targetItem)}`,
            );
            if (dropper === itemHolder) {
                // @ts-ignore typescript is wrong
                newPlacementMessage = `${dropper} dropped${amountMoved === 1 ? "" : " " + amountMoved} ${displayItemNameForStoryMessage(carryingSourceItem.item)} and placed it ${isPlacedOnTheItem ? "on" : "in"} ${displayItemNameForStoryMessage(targetItem)}`;
            } else {
                // @ts-ignore typescript is wrong
                newPlacementMessage = `${dropper} dropped${amountMoved === 1 ? "" : " " + amountMoved} ${displayItemNameForStoryMessage(carryingSourceItem.item)} from ${itemHolder} and placed it ${isPlacedOnTheItem ? "on" : "in"} ${displayItemNameForStoryMessage(targetItem)}`;
            }
        } else if (wearingSourceItem) {
            // now here we have found the item
            const amountMoved = recalculateDEItemListMovement(
                wearingSourceItem.item,
                wearingSourceItem.sourceList,
                // @ts-ignore typescript is wrong
                isPlacedOnTheItem ? targetItemSourceList : targetItem.containing,
                amount,
                // @ts-ignore typescript is wrong
                isPlacedOnTheItem ? `on ${displayItemNameForStoryMessage(targetItem)}` : `in ${displayItemNameForStoryMessage(targetItem)}`,
            );
            if (dropper === itemHolder) {
                // @ts-ignore typescript is wrong
                newPlacementMessage = `${dropper} removed${amountMoved === 1 ? "" : " " + amountMoved} ${displayItemNameForStoryMessage(wearingSourceItem.item)} and placed it ${isPlacedOnTheItem ? "on" : "in"} ${displayItemNameForStoryMessage(targetItem)}`;
            } else {
                // @ts-ignore typescript is wrong
                newPlacementMessage = `${dropper} removed${amountMoved === 1 ? "" : " " + amountMoved} ${displayItemNameForStoryMessage(wearingSourceItem.item)} from ${itemHolder} and placed it ${isPlacedOnTheItem ? "on" : "in"} ${displayItemNameForStoryMessage(targetItem)}`;
            }
        }

        return {
            retry: false,
            skip: false,
        }
    }
}

/**
 * 
 * @param {DEngine} engine 
 * @param {string} itemName
 * @param {string|null} giver
 * @param {string|null} itemReceipient
 * @param {"carrying" | "wearing"} itemRecepientAction
 * @param {boolean} useForce whether to attempt to force the change based on heuristics if we cannot parse it properly, this is to prevent the LLM from giving us changes in a format that we cannot parse but that are still feasible and should be accepted, without allowing it to give us completely unfeasible changes that we would have accepted because we could not parse them
 * @param {string[]} storyMasterMessagesToAdd 
 * @param {string} line the original line that we are trying to process, this is used for logging purposes to give more context in the logs when we cannot parse the line properly
 * @param {boolean} isStolenStuff whether the item being given is stolen stuff, this is used to determine the message to add to the story master messages, if the item is stolen stuff we will say "gave back" instead of "gave" for example, this is just for better storytelling and does not affect the feasibility check itself
 * @returns {{retry: boolean, skip: boolean}}
 */
function attemptToMoveItemToRecepient(engine, itemName, giver, itemReceipient, itemRecepientAction, useForce, storyMasterMessagesToAdd, line, isStolenStuff) {
    if (!engine.deObject) {
        throw new Error("DEngine object not found in attemptToMoveItemToRecepient");
    }
    if (!itemReceipient) {
        console.log("Feasibility check item changes: could not parse recipient character name from simple give line, skipping feasibility check for this line:", line);
        return {
            retry: false,
            skip: true,
        }
    } else if (!engine.deObject.characters[itemReceipient]) {
        console.log("Feasibility check item changes: parsed recipient character name not found in character list, skipping feasibility check for this line:", line);
        return {
            retry: false,
            skip: true,
        }
    } else if (!itemName) {
        console.log("Feasibility check item changes: could not parse item name from simple give line, skipping feasibility check for this line:", line);
        return {
            retry: false,
            skip: true,
        }
    }

    const recepientState = engine.deObject.stateFor[itemReceipient];
    if (!recepientState) {
        console.log("Feasibility check item changes: recipient character state not found, skipping feasibility check for this line:", line);
        return {
            retry: false,
            skip: true,
        }
    }

    let { amount, itemHolder, itemNameWithoutHolder } = getItemNameAmountAndItemHolderFromText(engine, itemName);

    if (amount === 0) {
        console.log("Feasibility check item changes: parsed amount is explicitly stated as 0");

        // we won't retry but won't skip either, as there may be other item changes in the same message that we can process and that are still feasible, we will just ignore this specific item change as it is explicitly stated as 0 amount, which means no items are actually being given, thus it is not unfeasible but there is also no change to be made
        return {
            retry: false,
            skip: false,
        }
    }

    // assume the giver is the item holder if we could not parse an item holder from the item name, this is because in a simple give format like "Alice gave Bob the sword", it is likely that the sword is being given by Alice, even if we could not parse it properly from the item name, this is to prevent the LLM from giving us changes in a format that we cannot parse but that are still feasible and should be accepted, without allowing it to give us completely unfeasible changes that we would have accepted because we could not parse them
    // if the giver doesn't have the item, (maybe they picked it from the ground in the same message) 
    if (!itemHolder && giver) {
        itemHolder = giver;
        console.log("Feasibility check item changes: could not parse item holder from item name, assuming giver is the item holder for this item, item name:", itemName, "giver:", giver);
    }
    if (itemHolder) {
        const stateForItemHolder = engine.deObject.stateFor[itemHolder];
        if (!stateForItemHolder) {
            console.log("Feasibility check item changes: item holder parsed from item name does not have a character state, skipping feasibility check for this line:", line);
            return {
                retry: false,
                skip: true,
            }
        }
        const carryingItem = itemListHasItem(stateForItemHolder.carrying, itemNameWithoutHolder);
        const wearingItem = itemListHasItem(stateForItemHolder.wearing, itemNameWithoutHolder);

        if (!carryingItem && !wearingItem && !useForce) {
            console.log("Feasibility check item changes: item holder parsed from item name does not seem to have the item in their carrying or wearing state, this may be due to out of order inference, adding line back to processing list to check again in the next cycle after other lines have been processed, line:", line);
            return {
                retry: true,
                skip: false,
            }
        }

        const takenText = isStolenStuff ? "stolen" : "taken";
        const stolenGoodsOf = isStolenStuff ? "stolen goods of " : "";
        const stolenGoodsBy = isStolenStuff ? "stolen goods by " : "";

        // if we are here, it means the item is indeed held by the character that we parsed from the item name, so we can be reasonably sure that the give action is feasible, we will still check if the recipient character can receive the item, for example if they are not too weak to carry it or if they have a free hand to receive it, but we can be pretty sure that the item is indeed being given by the character that we parsed from the item name
        if (carryingItem || wearingItem) {
            const itemToUse = /**@type {{sourceList: DEItem[], item: DEItem}}*/ (carryingItem || wearingItem);
            const canWear = canCharacterWearItem(engine, itemReceipient, itemToUse.item);
            console.log("Feasibility check item changes: item is being carried by the character parsed from the item name, thus it is feasible for them to give it, checking if recipient can receive it, line:", line);
            if (itemRecepientAction === "wearing") {
                if (canWear.canWear) {
                    const exactAmountPassed = recalculateDEItemListMovement(itemToUse.item, itemToUse.sourceList, recepientState.wearing, amount, "worn by " + itemReceipient);
                    if (giver && giver !== itemHolder) {
                        storyMasterMessagesToAdd.push(`${giver} has ${takenText}${exactAmountPassed === 1 ? "" : " " + exactAmountPassed} ${displayItemNameForStoryMessage(itemToUse.item)} from ${itemHolder} and given it to ${itemReceipient}, now ${itemReceipient} is wearing:${exactAmountPassed === 1 ? "" : " " + exactAmountPassed} ${displayItemNameForStoryMessage(itemToUse.item)}`);
                    } else if (giver) {
                        storyMasterMessagesToAdd.push(`${itemReceipient} has received and is now wearing:${exactAmountPassed === 1 ? "" : " " + exactAmountPassed} ${displayItemNameForStoryMessage(itemToUse.item)} from ${stolenGoodsBy}${giver}`);
                    } else {
                        storyMasterMessagesToAdd.push(`${itemReceipient} is now wearing:${exactAmountPassed === 1 ? "" : " " + exactAmountPassed} ${displayItemNameForStoryMessage(itemToUse.item)} from ${stolenGoodsOf}${itemHolder}`);
                    }
                } else {
                    const exactAmountPassed = recalculateDEItemListMovement(itemToUse.item, itemToUse.sourceList, recepientState.carrying, amount, "carried by " + itemReceipient);
                    if (giver && giver !== itemHolder) {
                        storyMasterMessagesToAdd.push(`${giver} has ${takenText}${exactAmountPassed === 1 ? "" : " " + exactAmountPassed} ${displayItemNameForStoryMessage(itemToUse.item)} from ${itemHolder} and given it to ${itemReceipient}, ${itemReceipient} tried to wear it but didn't succeed because ${canWear.reason} so ${itemReceipient} is now carrying:${exactAmountPassed === 1 ? "" : " " + exactAmountPassed} ${displayItemNameForStoryMessage(itemToUse.item)}`);
                    } else if (giver) {
                        storyMasterMessagesToAdd.push(`${itemReceipient} attempted to wear${exactAmountPassed === 1 ? "" : " " + exactAmountPassed} ${displayItemNameForStoryMessage(itemToUse.item)} from ${stolenGoodsBy}${giver}, the wearing didn't succeed because ${canWear.reason} so ${itemReceipient} is now carrying:${exactAmountPassed === 1 ? "" : " " + exactAmountPassed} ${displayItemNameForStoryMessage(itemToUse.item)} from ${stolenGoodsBy}${giver}`);
                    } else {
                        storyMasterMessagesToAdd.push(`${itemReceipient} attempted to wear${exactAmountPassed === 1 ? "" : " " + exactAmountPassed} ${displayItemNameForStoryMessage(itemToUse.item)} from ${stolenGoodsOf}${itemHolder}, the wearing didn't succeed because ${canWear.reason} so ${itemReceipient} is now carrying:${exactAmountPassed === 1 ? "" : " " + exactAmountPassed} ${displayItemNameForStoryMessage(itemToUse.item)} from ${stolenGoodsOf}${itemHolder}`);
                    }
                }
            } else {
                const exactAmountPassed = recalculateDEItemListMovement(itemToUse.item, itemToUse.sourceList, recepientState.carrying, amount, "carried by " + itemReceipient);
                if (giver && giver !== itemHolder) {
                    storyMasterMessagesToAdd.push(`${giver} has ${takenText}${exactAmountPassed === 1 ? "" : " " + exactAmountPassed} ${displayItemNameForStoryMessage(itemToUse.item)} from ${itemHolder} and given it to ${itemReceipient}, now ${itemReceipient} is carrying:${exactAmountPassed === 1 ? "" : " " + exactAmountPassed} ${displayItemNameForStoryMessage(itemToUse.item)}`);
                } else if (giver) {
                    storyMasterMessagesToAdd.push(`${itemReceipient} has received and is now carrying:${exactAmountPassed === 1 ? "" : " " + exactAmountPassed} ${displayItemNameForStoryMessage(itemToUse.item)} from ${stolenGoodsBy}${giver}`);
                } else {
                    storyMasterMessagesToAdd.push(`${itemReceipient} is now carrying:${exactAmountPassed === 1 ? "" : " " + exactAmountPassed} ${displayItemNameForStoryMessage(itemToUse.item)} from ${stolenGoodsOf}${itemHolder}`);
                }
            }
        } else if (useForce) {
            console.log("Feasibility check item changes: we attempted to force changes based on heuristics in a previous cycle, thus we will assume the give action is feasible even if we could not find the item in the holder's state, line:", line);

            useForceToPassItem(
                engine,
                giver || itemReceipient,
                stateForItemHolder,
                recepientState,
                itemNameWithoutHolder,
                itemHolder,
                itemReceipient,
                itemRecepientAction,
                amount,
                storyMasterMessagesToAdd,
                line,
                isStolenStuff,
            );

            return {
                retry: false,
                skip: true,
            }
        }

        return {
            retry: false,
            skip: false,
        }
    } else {
        // pick it from the world
        /**
         * @type {DELocationSlot | null}
         */
        let finalSlot = null;
        const receiverSlot = engine.deObject.world.locations[recepientState.location].slots[recepientState.locationSlot];
        if (itemListHasItem(receiverSlot.items, itemNameWithoutHolder)) {
            finalSlot = receiverSlot;
        } else {
            // find the item somewhere in the location
            const location = engine.deObject.world.locations[recepientState.location];
            finalSlot = Object.values(location.slots).find(slot => !!itemListHasItem(slot.items, itemNameWithoutHolder)) || null;
        }
        if (!finalSlot) {
            if (!useForce) {
                console.log("Feasibility check item changes: could not find the item in the location, retrying later to see if a character drops such item later");
                return {
                    retry: true,
                    skip: false,
                };
            } else {
                console.log("Feasibility check item changes: could not find the item in the location when attempting to force changes based on heuristics");
                useForceToPassItem(
                    engine,
                    giver || itemReceipient,
                    null,
                    recepientState,
                    itemNameWithoutHolder,
                    null,
                    itemReceipient,
                    itemRecepientAction,
                    amount,
                    storyMasterMessagesToAdd,
                    line,
                    isStolenStuff,
                );

                return {
                    retry: false,
                    skip: true,
                }
            }
        }

        const itemInQuestion = itemListHasItem(finalSlot.items, itemNameWithoutHolder);

        if (!itemInQuestion) {
            // what?...
            throw new Error("Feasibility check item changes: could not find the item in the final slot after we just found that the slot contains such item, this should not happen, there may be a bug in the itemListHasItem function or in the way we are handling references to items in the world, line:" + line);
        }

        const stole = isStolenStuff ? "stolen and " : "";

        const amountPicked = recalculateDEItemListMovement(itemInQuestion.item, itemInQuestion.sourceList, itemRecepientAction === "wearing" ? recepientState.wearing : recepientState.carrying, amount, (itemRecepientAction === "wearing" ? "worn by " : "carried by ") + itemReceipient);
        if (giver && giver !== itemReceipient) {
            storyMasterMessagesToAdd.push(`${giver} has ${stole}given ${displayItemNameForStoryMessage(itemInQuestion.item)} to ${itemReceipient}, now ${itemReceipient} is ${itemRecepientAction === "wearing" ? "wearing" : "carrying"}:${amountPicked === 1 ? "" : " " + amountPicked} ${displayItemNameForStoryMessage(itemInQuestion.item)}`);
        } else {
            storyMasterMessagesToAdd.push(`${itemReceipient} has ${isStolenStuff ? "stolen" : "picked up"} ${displayItemNameForStoryMessage(itemInQuestion.item)}, now ${itemReceipient} is ${itemRecepientAction === "wearing" ? "wearing" : "carrying"}:${amountPicked === 1 ? "" : " " + amountPicked} ${displayItemNameForStoryMessage(itemInQuestion.item)}`);
        }
    }

    return {
        retry: false,
        skip: false,
    }
}

/**
 * 
 * @param {DEngine} engine
 * @param {string|null} giver
 * @param {DEStateForDescriptionWithHistory | null} potentialItemHolderState
 * @param {DEStateForDescriptionWithHistory} itemRecepientState
 * @param {string} itemNameWithoutHolder
 * @param {string|null} potentialItemHolder
 * @param {string} itemRecepient
 * @param {"carrying" | "wearing"} itemRecepientAction
 * @param {number | "a few" | "several" | "many" | "a lot of" | "some" | "half of" | "most of" | "all of"} amount
 * @param {string[]} storyMasterMessagesToAdd
 * @param {string} line the original line that we are trying to process, this is used for logging purposes to give more context in the logs when we cannot parse the line properly
 * @param {boolean} isStolenStuff whether the item being given is stolen stuff, this is used to determine the message to add to the story master messages, if the item is stolen stuff we will say "gave back" instead of "gave" for example, this is just for better storytelling and does not affect the feasibility check itself
 * @returns 
 */
function useForceToPassItem(engine, giver, potentialItemHolderState, itemRecepientState, itemNameWithoutHolder, potentialItemHolder, itemRecepient, itemRecepientAction, amount, storyMasterMessagesToAdd, line, isStolenStuff) {
    if (!engine.deObject) {
        throw new Error("DEngine object not found in useForceToPassItem");
    }
    /**
     * @type {DELocationSlot | null}
     */
    let finalSlot = null;
    const holderSlot = potentialItemHolderState ? engine.deObject.world.locations[potentialItemHolderState.location].slots[potentialItemHolderState.locationSlot] : null;
    const receiverSlot = engine.deObject.world.locations[itemRecepientState.location].slots[itemRecepientState.locationSlot];
    if (holderSlot && itemListHasItem(holderSlot.items, itemNameWithoutHolder)) {
        finalSlot = holderSlot;
    } else if (itemListHasItem(receiverSlot.items, itemNameWithoutHolder)) {
        finalSlot = receiverSlot;
        potentialItemHolder = null;
    } else {
        // find the item somewhere in the location and move it to the recipient character
        const location = engine.deObject.world.locations[potentialItemHolderState?.location || itemRecepientState.location];
        finalSlot = Object.values(location.slots).find(slot => !!itemListHasItem(slot.items, itemNameWithoutHolder)) || null;
        potentialItemHolder = null;
    }

    let itemInQuestion = itemListHasItem(finalSlot?.items || null, itemNameWithoutHolder);

    if (!itemInQuestion) {
        // find in other characters in the location
        for (const characterName of [potentialItemHolder, itemRecepient, ...itemRecepientState.surroundingNonStrangers, ...itemRecepientState.surroundingTotalStrangers].filter(name => name !== null)) {
            const characterState = engine.deObject.stateFor[characterName];
            if (characterState) {
                const carryingItem = itemListHasItem(characterState.carrying, itemNameWithoutHolder);
                const wearingItem = itemListHasItem(characterState.wearing, itemNameWithoutHolder);
                if (carryingItem || wearingItem) {
                    itemInQuestion = carryingItem || wearingItem;
                    potentialItemHolder = characterName;
                    console.log("Feasibility check item changes: using heuristics to determine that the item is actually being held by character", characterName, "for item change line:", line);
                    break;
                }
            }
        }
    }

    if (!itemInQuestion) {
        console.log("Feasibility check item changes: could not find the item in the location when attempting to force changes based on heuristics, skipping this item change, line:", line);
        return;
    }

    const hasStolenMessage = isStolenStuff ? "has stolen and " : "";
    const stolenGoodsOfAddition = isStolenStuff ? "stolen goods " : "";

    if (itemInQuestion) {
        // there is no item holder here because the item was picked from the location
        if (itemRecepientAction === "wearing") {
            const canWear = canCharacterWearItem(engine, itemRecepient, itemInQuestion.item);
            if (canWear.canWear) {
                const exactAmountMoved = recalculateDEItemListMovement(itemInQuestion.item, itemInQuestion.sourceList, itemRecepientState.wearing, amount, "worn by " + itemRecepient);
                if (!giver || giver === itemRecepient) {
                    storyMasterMessagesToAdd.push(`${itemRecepient} ${hasStolenMessage}is now wearing:${exactAmountMoved === 1 ? "" : " " + exactAmountMoved} ${displayItemNameForStoryMessage(itemInQuestion.item)}`);
                } else if (potentialItemHolder === giver || !potentialItemHolder) {
                    storyMasterMessagesToAdd.push(`${itemRecepient} has received ${stolenGoodsOfAddition}and is now wearing:${exactAmountMoved === 1 ? "" : " " + exactAmountMoved} ${displayItemNameForStoryMessage(itemInQuestion.item)} from ${giver}`);
                } else if (potentialItemHolder && giver) {
                    storyMasterMessagesToAdd.push(`${itemRecepient} has received ${stolenGoodsOfAddition}from ${giver} and is now wearing:${exactAmountMoved === 1 ? "" : " " + exactAmountMoved} ${displayItemNameForStoryMessage(itemInQuestion.item)} from ${potentialItemHolder}`);
                } else {
                    storyMasterMessagesToAdd.push(`${itemRecepient} has taken ${stolenGoodsOfAddition}and is now wearing:${exactAmountMoved === 1 ? "" : " " + exactAmountMoved} ${displayItemNameForStoryMessage(itemInQuestion.item)}`);
                }
            } else {
                const exactAmountMoved = recalculateDEItemListMovement(itemInQuestion.item, itemInQuestion.sourceList, itemRecepientState.wearing, amount, "carried by " + itemRecepient);
                if (!giver || giver === itemRecepient) {
                    storyMasterMessagesToAdd.push(`${itemRecepient} ${hasStolenMessage} has attempted to wear${exactAmountMoved === 1 ? "" : " " + exactAmountMoved} ${displayItemNameForStoryMessage(itemInQuestion.item)}, but didn't succeed because ${canWear.reason}, so ${itemRecepient} is now carrying:${exactAmountMoved === 1 ? "" : " " + exactAmountMoved} ${displayItemNameForStoryMessage(itemInQuestion.item)}`);
                } else if (potentialItemHolder === giver || !potentialItemHolder) {
                    storyMasterMessagesToAdd.push(`${itemRecepient} has received ${stolenGoodsOfAddition}and has attempted to wear${exactAmountMoved === 1 ? "" : " " + exactAmountMoved} ${displayItemNameForStoryMessage(itemInQuestion.item)}, but didn't succeed because ${canWear.reason}, so ${itemRecepient} is now carrying:${exactAmountMoved === 1 ? "" : " " + exactAmountMoved} ${displayItemNameForStoryMessage(itemInQuestion.item)} from ${giver}`);
                } else if (potentialItemHolder && giver) {
                    storyMasterMessagesToAdd.push(`${itemRecepient} has received ${stolenGoodsOfAddition}from ${giver} and has attempted to wear${exactAmountMoved === 1 ? "" : " " + exactAmountMoved} ${displayItemNameForStoryMessage(itemInQuestion.item)}, but didn't succeed because ${canWear.reason}, so ${itemRecepient} is now carrying:${exactAmountMoved === 1 ? "" : " " + exactAmountMoved} ${displayItemNameForStoryMessage(itemInQuestion.item)} from ${potentialItemHolder}`);
                } else {
                    storyMasterMessagesToAdd.push(`${itemRecepient} has taken ${stolenGoodsOfAddition}and has attempted to wear${exactAmountMoved === 1 ? "" : " " + exactAmountMoved} ${displayItemNameForStoryMessage(itemInQuestion.item)}, but didn't succeed because ${canWear.reason}, so ${itemRecepient} is now carrying:${exactAmountMoved === 1 ? "" : " " + exactAmountMoved} ${displayItemNameForStoryMessage(itemInQuestion.item)}`);
                }
            }
        } else {
            const exactAmountMoved = recalculateDEItemListMovement(itemInQuestion.item, itemInQuestion.sourceList, itemRecepientState.carrying, amount, "carried by " + itemRecepient);
            if (!giver || giver === itemRecepient) {
                storyMasterMessagesToAdd.push(`${itemRecepient} ${hasStolenMessage}is now carrying:${exactAmountMoved === 1 ? "" : " " + exactAmountMoved} ${displayItemNameForStoryMessage(itemInQuestion.item)}`);
            } else if (potentialItemHolder === giver || !potentialItemHolder) {
                storyMasterMessagesToAdd.push(`${itemRecepient} has received ${stolenGoodsOfAddition}and is now carrying:${exactAmountMoved === 1 ? "" : " " + exactAmountMoved} ${displayItemNameForStoryMessage(itemInQuestion.item)} from ${giver}`);
            } else if (potentialItemHolder && giver) {
                storyMasterMessagesToAdd.push(`${itemRecepient} has received ${stolenGoodsOfAddition}from ${giver} and is now carrying:${exactAmountMoved === 1 ? "" : " " + exactAmountMoved} ${displayItemNameForStoryMessage(itemInQuestion.item)} from ${potentialItemHolder}`);
            } else {
                storyMasterMessagesToAdd.push(`${itemRecepient} has taken ${stolenGoodsOfAddition}and is now carrying:${exactAmountMoved === 1 ? "" : " " + exactAmountMoved} ${displayItemNameForStoryMessage(itemInQuestion.item)}`);
            }
        }
    }

    console.log("Feasibility check item changes: could not find the item in the final slot when attempting to force changes based on heuristics, skipping this item change, line:", line);

    return;
}

/**
 * 
 * @param {DEItem} item 
 */
function displayItemNameForStoryMessage(item) {
    if (item.owner) {
        return `${item.owner}'s ${item.name}`;
    }

    return item.name;
}

/**
 * 
 * @param {DEItem[] | null} itemList 
 * @param {string} itemName 
 * @returns {{sourceList: DEItem[], item: DEItem} | null}
 */
function itemListHasItem(itemList, itemName) {
    if (!itemList || itemList.length === 0) {
        return null;
    }
    const listHasIt = itemList.find(item => item.name === itemName);
    if (listHasIt) {
        return { sourceList: itemList, item: listHasIt };
    }

    for (const item of itemList) {
        if (item.containing && item.containing.length > 0) {
            const result = itemListHasItem(item.containing, itemName);
            if (result) {
                return result;
            }
        }
    }

    return null;
}

/**
 * 
 * @param {DEItem} itemInQuestion 
 * @param {DEItem[]} sourceList 
 * @param {DEItem[]} targetList 
 * @param {number | "a few" | "several" | "many" | "a lot of" | "some" | "half of" | "most of" | "all of"} amount 
 * @param {string} newPlacement 
 * @return {number} the exact amount that was moved, this may be different from the amount parameter if the amount parameter is not a number or if the item quantity is less than the amount parameter, for example if the item quantity is 2 and the amount parameter is "a lot of", we will move both items and return 2 as the exact amount moved, or if the item quantity is 5 and the amount parameter is "half of", we will move 2 items and return 2 as the exact amount moved
 */
function recalculateDEItemListMovement(itemInQuestion, sourceList, targetList, amount, newPlacement) {
    let exactAmountToMove = 0;
    if (typeof amount === "number") {
        exactAmountToMove = Math.min(amount, itemInQuestion.amount);
    } else if (amount === "a few") {
        exactAmountToMove = Math.min(3, itemInQuestion.amount - 1) || 1;
    } else if (amount === "several") {
        exactAmountToMove = Math.min(5, itemInQuestion.amount - 1) || 1;
    } else if (amount === "many" || amount === "a lot of") {
        exactAmountToMove = Math.min(10, itemInQuestion.amount - 1) || 1;
    } else if (amount === "some") {
        exactAmountToMove = Math.min(4, itemInQuestion.amount - 1) || 1;
    } else if (amount === "half of") {
        exactAmountToMove = Math.floor(itemInQuestion.amount / 2) || 1;
    } else if (amount === "most of") {
        exactAmountToMove = Math.floor((itemInQuestion.amount * 3) / 4) || 1;
    } else if (amount === "all of") {
        exactAmountToMove = itemInQuestion.amount;
    }

    itemInQuestion.amount -= exactAmountToMove;

    let foundInTarget = false;
    for (const existingTargetItem of targetList) {
        if (existingTargetItem.name === itemInQuestion.name) {
            existingTargetItem.amount += exactAmountToMove;
            foundInTarget = true;
            break;
        }
    }
    if (!foundInTarget) {
        const itemInQuestionCopy = deepCopy(itemInQuestion);
        itemInQuestionCopy.amount = exactAmountToMove;
        itemInQuestionCopy.placement = newPlacement;
        targetList.push(itemInQuestionCopy);
    }

    if (itemInQuestion.amount <= 0) {
        const itemIndex = sourceList.indexOf(itemInQuestion);
        if (itemIndex !== -1) {
            sourceList.splice(itemIndex, 1);
        }
    }

    return exactAmountToMove;
}

/**
 * 
 * @param {DEngine} engine 
 * @param {string} characterDropped 
 * @param {string} characterName 
 * @param {boolean} nextCycleIsForce 
 * @param {string[]} storyMasterMessagesToAdd 
 * @param {string} line 
 */
function attemptToDropCharacter(engine, characterDropped, characterName, nextCycleIsForce, storyMasterMessagesToAdd, line) {
    if (!engine.deObject) {
        throw new Error("DEngine object not found in attemptToDropCharacter");
    }

    const characterState = engine.deObject.stateFor[characterName];
    const characterDroppedState = engine.deObject.stateFor[characterDropped];

    if (!characterState) {
        console.log("Feasibility check item changes: character state not found for character dropped, skipping feasibility check for this line:", line);
        return;
    }

    if (!characterDroppedState) {
        console.log("Feasibility check item changes: character state not found for character dropped, skipping feasibility check for this line:", line);
        return;
    }

    // just to be sure and because looping is cheap we will remove anyone who has this character as they are carrying it
    for (const characterName in engine.deObject.stateFor) {
        const state = engine.deObject.stateFor[characterName];
        if (state.carryingCharacters.some(c => c === characterDropped)) {
            state.carryingCharacters = state.carryingCharacters.filter(c => c !== characterDropped);
        }
    }

    characterDroppedState.beingCarriedByCharacter = null;

    storyMasterMessagesToAdd.push(`${characterName} has dropped ${characterDropped}`);
}

/**
 * 
 * @param {DEngine} engine 
 * @param {string} characterPickedUp 
 * @param {string} characterName 
 * @param {boolean} nextCycleIsForce 
 * @param {string[]} storyMasterMessagesToAdd 
 * @param {string} line 
 */
function attemptToPickUpCharacter(engine, characterPickedUp, characterName, nextCycleIsForce, storyMasterMessagesToAdd, line) {
    if (!engine.deObject) {
        throw new Error("DEngine object not found in attemptToPickUpCharacter");
    }

    const characterState = engine.deObject.stateFor[characterName];
    const characterPickedUpState = engine.deObject.stateFor[characterPickedUp];

    if (!characterState) {
        console.log("Feasibility check item changes: character state not found for character picked up, skipping feasibility check for this line:", line);
        return;
    }

    if (!characterPickedUpState) {
        console.log("Feasibility check item changes: character state not found for character picked up, skipping feasibility check for this line:", line);
        return;
    }

    characterPickedUpState.beingCarriedByCharacter = null;

    // just to be sure and because looping is cheap we will remove anyone who has this character as they are carrying it
    for (const characterName in engine.deObject.stateFor) {
        const state = engine.deObject.stateFor[characterName];
        if (state.carryingCharacters.some(c => c === characterPickedUp)) {
            state.carryingCharacters = state.carryingCharacters.filter(c => c !== characterPickedUp);
        }
    }

    // this will be a check that checks whether they can carry the other character potentially 
    const canCarryAnotherCharacter = canCharacterCarryAnotherCharacterPotentially(engine, characterName, characterPickedUp);

    if (!canCarryAnotherCharacter.canCarry) {
        storyMasterMessagesToAdd.push(`${characterName} has attempted to pick up and carry ${characterPickedUp} but couldn't because ${canCarryAnotherCharacter.reason}`);
    } else {
        // because we removed from everyone who had this character as carrying it, we can be sure that only the current character is now carrying it, so we can just add it to the current character's carrying characters without worrying about duplicates
        characterPickedUpState.beingCarriedByCharacter = characterName;
        characterState.carryingCharacters.push(characterPickedUp);

        storyMasterMessagesToAdd.push(`${characterName} has picked up ${characterPickedUp}`);
    }
}

/**
 * 
 * @param {DEngine} engine 
 * @param {string} characterName 
 * @param {string[]} storyMasterMessagesToAdd 
 */
function dropAnyOverflowingItemsFromOverfilledContainersAt(engine, characterName, storyMasterMessagesToAdd) {
    if (!engine.deObject) {
        throw new Error("DEngine object not found in dropAnyOverflowingItemsFromOverfilledContainersAt");
    }

    const characterState = engine.deObject.stateFor[characterName];

    if (!characterState) {
        console.log("Feasibility check item changes: character state not found for character", characterName);
        return;
    }

    const allContainers = [...characterState.carrying, ...characterState.wearing];

    /**
     * @param {DEItem} container 
     */
    const getContainerItemsWeight = (container) => {
        let weight = 0;
        for (const item of container.containing || []) {
            weight += item.weightKg * item.amount;
        }
        return weight;
    }

    /**
     * @param {DEItem} container 
     */
    const getContainerItemsVolume = (container) => {
        let volume = 0;
        for (const item of container.containing || []) {
            volume += item.volumeLiters * item.amount;
        }
        return volume;
    }

    /**
     * @param {DEItem[]} containerList 
     */
    const dropFromList = (containerList) => {
        for (const container of containerList) {
            while (true) {
                const containerContainingKg = getContainerItemsWeight(container)
                const isOverCapacity = containerContainingKg > container.capacityKg;
                const containerContainingVolume = getContainerItemsVolume(container);
                const isOverVolume = containerContainingVolume > container.capacityLiters;

                if (!isOverCapacity && !isOverVolume) {
                    break;
                }

                const lastItemPutInContainer = container.containing[container.containing.length - 1];
                const itemWeightWithoutAmount = lastItemPutInContainer.weightKg;
                const itemVolumeWithoutAmount = lastItemPutInContainer.volumeLiters;

                let amountThatNeedsToBeRemovedToKeepItOnCapacity = 1;

                while (
                    (
                        containerContainingKg - (itemWeightWithoutAmount * amountThatNeedsToBeRemovedToKeepItOnCapacity) > container.capacityKg ||
                        containerContainingVolume - (itemVolumeWithoutAmount * amountThatNeedsToBeRemovedToKeepItOnCapacity) > container.capacityLiters
                    ) && amountThatNeedsToBeRemovedToKeepItOnCapacity < lastItemPutInContainer.amount
                ) {
                    amountThatNeedsToBeRemovedToKeepItOnCapacity++;
                }

                if (amountThatNeedsToBeRemovedToKeepItOnCapacity !== lastItemPutInContainer.amount) {
                    // need to split the item in the container because only part of it is causing the overflow, so we will remove the part that causes the overflow and drop it to the ground in the character's location
                    const itemToDrop = deepCopy(lastItemPutInContainer);
                    itemToDrop.amount = amountThatNeedsToBeRemovedToKeepItOnCapacity;
                    itemToDrop.placement = "on the ground";
                    lastItemPutInContainer.amount -= amountThatNeedsToBeRemovedToKeepItOnCapacity;
                    // @ts-expect-error
                    const location = engine.deObject.world.locations[characterState.location];
                    const slot = location.slots[characterState.locationSlot];
                    slot.items.push(itemToDrop);
                    storyMasterMessagesToAdd.push(`${characterName} has dropped ${displayItemNameForStoryMessage(itemToDrop)} from an overfilled container ${displayItemNameForStoryMessage(container)} due to it being over capacity`);
                } else {
                    // remove the last item put in the container and drop it to the ground in the character's location
                    const itemIndex = container.containing.findIndex(i => i === lastItemPutInContainer);
                    if (itemIndex !== -1) {
                        container.containing.splice(itemIndex, 1);
                        // @ts-expect-error
                        const location = engine.deObject.world.locations[characterState.location];
                        const slot = location.slots[characterState.locationSlot];
                        lastItemPutInContainer.placement = "on the ground";
                        slot.items.push(lastItemPutInContainer);
                        storyMasterMessagesToAdd.push(`${characterName} has dropped ${displayItemNameForStoryMessage(lastItemPutInContainer)} from an overfilled container ${displayItemNameForStoryMessage(container)} due to it being over capacity`);
                    }
                }
            }
        }
    }

    dropFromList(characterState.carrying);
    dropFromList(characterState.wearing);
}

/**
 * @param {DEngine} engine 
 * @param {string} characterName 
 */
function isCharacterOverweightOrOverVolume(engine, characterName) {
    if (!engine.deObject) {
        throw new Error("DEngine object not found in isCharacterOverweightOrOverVolume");
    }

    const characterState = engine.deObject.stateFor[characterName];

    if (!characterState) {
        console.log("Feasibility check item changes: character state not found for character", characterName);
        return { overWeight: false, overVolume: false };
    }

    const character = engine.deObject.characters[characterName];

    let remainingCarryingCapacity = character.carryingCapacityKg;
    let remainingCarryingVolume = character.carryingCapacityLiters;

    /**
         * @param {DEItem[]} itemList 
         * @param {boolean} isOurOwnCharacterWearing
         * @param {boolean} isOtherCharacterWearing
         */
    const processItemList = (itemList, isOurOwnCharacterWearing = false, isOtherCharacterWearing = false) => {
        let takenVolume = 0;
        let addedVolume = 0;
        for (const carriedItem of itemList) {
            remainingCarryingCapacity -= carriedItem.weightKg * carriedItem.amount;
            if (carriedItem.capacityLiters) {
                addedVolume += carriedItem.capacityLiters * carriedItem.amount;
            }
            takenVolume += carriedItem.volumeLiters * carriedItem.amount;

            if (isOurOwnCharacterWearing && carriedItem.wearableProperties) {
                // wearing an item does not take volume, but it can add volume capacity
                if (carriedItem.wearableProperties.addedCarryingCapacityLiters) {
                    addedVolume += carriedItem.wearableProperties.addedCarryingCapacityLiters * carriedItem.amount;
                }
                if (carriedItem.wearableProperties.addedCarryingCapacityKg) {
                    remainingCarryingCapacity += carriedItem.wearableProperties.addedCarryingCapacityKg * carriedItem.amount;
                }
            }
            if (isOtherCharacterWearing && carriedItem.wearableProperties) {
                // wearing an item does not take volume, but it can add volume capacity
                if (carriedItem.wearableProperties.extraBodyVolumeWhenWornLiters) {
                    takenVolume += carriedItem.wearableProperties.extraBodyVolumeWhenWornLiters * carriedItem.amount;
                }
            }

            // the added and taken volume are irrelevant because
            // these are already inside another container
            processItemList(carriedItem.containing);
        }

        return { takenVolume, addedVolume }
    }
    /**
     * @param {string[]} characterList
     */
    const processCharacterList = (characterList) => {
        let takenVolume = 0;
        let addedVolume = 0;
        for (const carriedCharacterName of characterList) {
            const carriedCharacterState = engine.deObject?.stateFor[carriedCharacterName];
            if (carriedCharacterState === undefined) {
                continue;
            }
            const characterWeight = engine.deObject?.characters[carriedCharacterName]?.weightKg || 0;
            remainingCarryingCapacity -= characterWeight;
            // assume a character is mostly water, so the volume is weight
            // in liters is weight in kg divided by 1 (density of water)
            // so just use the weight as volume for simplicity
            takenVolume += characterWeight;
            // carrying a character does not add volume capacity but it takes volume
            const characterVolumes = processItemList(carriedCharacterState.carrying);
            takenVolume += characterVolumes.takenVolume;
            // now consider the clothes they are wearing
            const characterVolumesWearing = processItemList(carriedCharacterState.wearing, false, true);
            takenVolume += characterVolumesWearing.takenVolume;
            // the same is true for the characters they are carrying
            const characterCharactersVolumes = processCharacterList(carriedCharacterState.carryingCharacters);
            takenVolume += characterCharactersVolumes.takenVolume;
        }

        return { takenVolume, addedVolume }
    }
    const characterCharactersVolumes = processCharacterList(characterState.carryingCharacters);
    const carryingVolumes = processItemList(characterState.carrying);
    remainingCarryingVolume -= (carryingVolumes.takenVolume - carryingVolumes.addedVolume);
    remainingCarryingVolume -= characterCharactersVolumes.takenVolume;
    const volumeClothes = processItemList(characterState.wearing, true);
    remainingCarryingVolume += volumeClothes.addedVolume;

    return {
        overWeight: remainingCarryingCapacity < 0,
        overVolume: remainingCarryingVolume < 0,
    }
}

/**
 * @param {DEngine} engine 
 * @param {string} characterName 
 */
function getCharacterTotalWeightAndVolumeTaken(engine, characterName) {
    if (!engine.deObject) {
        throw new Error("DEngine object not found in getCharacterTotalWeightAndVolumeTaken");
    }
    if (!engine.deObject.stateFor[characterName]) {
        console.log("Feasibility check item changes: character state not found for character", characterName);
        return { totalWeight: 0, totalVolume: 0 };
    }
    const characterState = engine.deObject.stateFor[characterName];
    const character = engine.deObject.characters[characterName];
    let weight = character.weightKg;
    let volume = character.weightKg; // assume a character is mostly water, so the volume and weight are the same

    /**
     * @param {DEItem[]} itemList 
     */
    const processItemList = (itemList) => {
        for (const carriedItem of itemList) {
            weight += carriedItem.weightKg * carriedItem.amount;
            volume += carriedItem.volumeLiters * carriedItem.amount;
            processItemList(carriedItem.containing);
        }
    }
    /**
     * @param {string[]} characterList
     */
    const processCharacterList = (characterList) => {
        for (const carriedCharacterName of characterList) {
            const weightAndVolume = getCharacterTotalWeightAndVolumeTaken(engine, carriedCharacterName);
            weight += weightAndVolume.totalWeight;
            volume += weightAndVolume.totalVolume;
        }
    }

    processItemList(characterState.carrying);
    processItemList(characterState.wearing);
    processCharacterList(characterState.carryingCharacters);
    return { totalWeight: weight, totalVolume: volume };
}

/**
 * @param {DEItem} item 
 * @returns 
 */
function getItemTotalWeightAndVolume(item) {
    let weight = item.weightKg * item.amount;
    let volume = item.volumeLiters * item.amount;
    if (item.containing) {
        for (const containedItem of item.containing) {
            const containedWeightAndVolume = getItemTotalWeightAndVolume(containedItem);
            weight += containedWeightAndVolume.totalWeight;
            volume += containedWeightAndVolume.totalVolume;
        }
    }
    return { totalWeight: weight, totalVolume: volume };
}

/**
 * 
 * @param {DEngine} engine 
 * @param {string} characterName
 * @param {boolean} isOverweight
 * @param {boolean} isOverVolume
 * @param {string[]} storyMasterMessagesToAdd
 * @returns 
 */
function dropHeaviestCarriedItemOrCharacter(engine, characterName, isOverweight, isOverVolume, storyMasterMessagesToAdd) {
    if (!engine.deObject) {
        throw new Error("DEngine object not found in dropHeaviestCarriedItemOrCharacter");
    }
    const characterState = engine.deObject.stateFor[characterName];

    if (!characterState) {
        console.log("Feasibility check item changes: character state not found for character", characterName);
        return;
    }

    /**
     * @type {DEItem | string |null}
     */
    let heaviestItemOrCharacter = null;
    /**
     * @type {DEItem | null}
     */
    let heaviestCarriedItem = null;
    let heaviestCarriedItemWeight = 0;
    let heaviestWeight = 0;
    let heaviestWeightIsWorn = false;
    let mostVolume = 0;
    /**
     * @type {DEItem | string  | null}
     */
    let mostVolumeItemOrCharacter = null;

    characterState.carrying.forEach(item => {
        const itemTotalWeightAndVolume = getItemTotalWeightAndVolume(item);
        if (itemTotalWeightAndVolume.totalWeight > heaviestWeight) {
            heaviestWeight = itemTotalWeightAndVolume.totalWeight;
            heaviestItemOrCharacter = item;
            heaviestCarriedItem = item;
            heaviestCarriedItemWeight = itemTotalWeightAndVolume.totalWeight;
        }
        if (itemTotalWeightAndVolume.totalVolume > mostVolume) {
            mostVolume = itemTotalWeightAndVolume.totalVolume;
            mostVolumeItemOrCharacter = item;
        }
    });

    characterState.carryingCharacters.forEach(carriedCharacterName => {
        const characterTotalWeightAndVolume = getCharacterTotalWeightAndVolumeTaken(engine, carriedCharacterName);
        if (characterTotalWeightAndVolume.totalWeight > heaviestWeight) {
            heaviestWeight = characterTotalWeightAndVolume.totalWeight;
            heaviestItemOrCharacter = carriedCharacterName;
        }
        if (characterTotalWeightAndVolume.totalVolume > mostVolume) {
            mostVolume = characterTotalWeightAndVolume.totalVolume;
            mostVolumeItemOrCharacter = carriedCharacterName;
        }
    });

    characterState.wearing.forEach(item => {
        const itemTotalWeightAndVolume = getItemTotalWeightAndVolume(item);
        if (itemTotalWeightAndVolume.totalWeight > heaviestWeight) {
            heaviestWeight = itemTotalWeightAndVolume.totalWeight;
            heaviestWeightIsWorn = true;
            heaviestItemOrCharacter = item;
        }
        // worn items do not take up volume so we don't consider them for most volume
    });

    if (isOverweight) {
        if (heaviestItemOrCharacter) {
            if (typeof heaviestItemOrCharacter === "string") {
                characterState.carryingCharacters = characterState.carryingCharacters.filter(c => c !== heaviestItemOrCharacter);
                const carriedCharacterState = engine.deObject.stateFor[heaviestItemOrCharacter];
                if (carriedCharacterState) {
                    carriedCharacterState.beingCarriedByCharacter = null;
                }
                storyMasterMessagesToAdd.push(`${characterName} has dropped ${heaviestItemOrCharacter} from being carried due to being too heavy for their own current carrying capacity`);
            } else if (heaviestWeightIsWorn && !heaviestCarriedItem) {
                // we want to prevent from dropping clothes before dropping carried items, because dropping clothes can result them getting naked
                characterState.wearing = characterState.wearing.filter(i => i !== heaviestItemOrCharacter);
                // if we are dropping a worn item, we will drop it to the ground in the character's location
                const location = engine.deObject.world.locations[characterState.location];
                const slot = location.slots[characterState.locationSlot];
                // @ts-ignore typescript is wrong once again, it is DEItem for sure
                heaviestItemOrCharacter.placement = "on the ground";
                slot.items.push(heaviestItemOrCharacter);
                storyMasterMessagesToAdd.push(`${characterName} has dropped ${displayItemNameForStoryMessage(heaviestItemOrCharacter)} from being worn due to being too heavy for their own current carrying capacity`);
            } else {
                // drop heaviest carried item
                /**
                 * @type {DEItem}
                 */
                const toDropItem = heaviestCarriedItem || heaviestItemOrCharacter;
                characterState.carrying = characterState.carrying.filter(i => i !== toDropItem);
                // if we are dropping a carried item, we will drop it to the ground in the character's location
                const location = engine.deObject.world.locations[characterState.location];
                const slot = location.slots[characterState.locationSlot];
                toDropItem.placement = "on the ground";
                slot.items.push(toDropItem);
                storyMasterMessagesToAdd.push(`${characterName} has dropped ${displayItemNameForStoryMessage(toDropItem)} from being carried due to being too heavy for their own current carrying capacity`);
            }
        } else {
            console.log("Feasibility check item changes: character " + characterName + " is overweight but could not find the item or character that is causing them to be overweight");
        }
    } else if (isOverVolume) {
        if (mostVolumeItemOrCharacter) {
            if (typeof mostVolumeItemOrCharacter === "string") {
                characterState.carryingCharacters = characterState.carryingCharacters.filter(c => c !== mostVolumeItemOrCharacter);
                const carriedCharacterState = engine.deObject.stateFor[mostVolumeItemOrCharacter];
                if (carriedCharacterState) {
                    carriedCharacterState.beingCarriedByCharacter = null;
                }
                storyMasterMessagesToAdd.push(`${characterName} has dropped ${mostVolumeItemOrCharacter} from being carried due to being too much for their own current carrying volume`);
            } else {
                // drop most volume carried item
                characterState.carrying = characterState.carrying.filter(i => i !== mostVolumeItemOrCharacter);
                // if we are dropping a carried item, we will drop it to the ground in the character's location
                const location = engine.deObject.world.locations[characterState.location];
                const slot = location.slots[characterState.locationSlot];
                // @ts-ignore typescript is wrong once again, it is DEItem for sure
                mostVolumeItemOrCharacter.placement = "on the ground";
                slot.items.push(mostVolumeItemOrCharacter);
                storyMasterMessagesToAdd.push(`${characterName} has dropped ${displayItemNameForStoryMessage(mostVolumeItemOrCharacter)} from being carried due to being too much for their own current carrying volume`);
            }
        }
    }
}

/**
 * 
 * @param {DEngine} engine 
 * @param {string} characterName 
 * @param {DEItem} item 
 * @returns 
 */
function canCharacterWearItem(engine, characterName, item) {
    if (!engine.deObject) {
        throw new Error("DEngine object not found in canCharacterWearItem");
    }
    const character = engine.deObject.characters[characterName];
    if (!character) {
        console.log("Feasibility check item changes: character not found for character", characterName);
        return { canWear: false, reason: "character not found" };
    }
    if (!item.wearableProperties) {
        return { canWear: false, reason: `${item.name} is not wearable` };
    }

    const characterVolume = character.weightKg; // assume a character is mostly water, so the volume is weight in liters

    if (characterVolume > item.wearableProperties.volumeRangeMaxLiters) {
        return { canWear: false, reason: `${item.name} is too small for ${characterName} to fit` };
    } else if (characterVolume < item.wearableProperties.volumeRangeMinLiters) {
        return { canWear: false, reason: `${item.name} is too big for ${characterName} to fit` };
    }
    return { canWear: true, reason: "item fits" };
}

/**
 * Provides an optimistic check for whether a character can carry another character, this is used to determine whether we can allow a character to pick up another character without needing to drop items first, if this returns false, we will attempt to drop the heaviest item or character they are carrying and then check again, if it returns true, we will allow them to pick up the other character without dropping anything first, but if it returns false, we will attempt to drop the heaviest item or character they are carrying and then check again, if it returns true after dropping the heaviest item or character, we will allow them to pick up the other character, if it still returns false after dropping the heaviest item or character, we will not allow them to pick up the other character and we will add a message to the story master messages to add explaining that they couldn't pick up the other character because they are carrying too much weight or volume even after dropping their heaviest item or character
 * @param {DEngine} engine 
 * @param {string} characterName 
 * @param {string} characterToCarryName
 * @returns {{canCarry: boolean, reason: string}}
 */
function canCharacterCarryAnotherCharacterPotentially(engine, characterName, characterToCarryName) {
    if (!engine.deObject) {
        throw new Error("DEngine object not found in canCharacterWearItem");
    }
    const character = engine.deObject.characters[characterName];
    if (!character) {
        console.log("Feasibility check item changes: character not found for character", characterName);
        return { canCarry: false, reason: "character not found" };
    }
    const characterToCarry = engine.deObject.characters[characterToCarryName];
    if (!characterToCarry) {
        console.log("Feasibility check item changes: character not found for character to carry", characterToCarryName);
        return { canCarry: false, reason: "character to carry not found" };
    }

    const maxCarryingCapacityKg = character.carryingCapacityKg;
    const maxCarryingCapacityLiters = character.carryingCapacityLiters;

    const characterToCarryWeightAndVolume = getCharacterTotalWeightAndVolumeTaken(engine, characterToCarryName);

    // IDK a rat trying to carry a human
    if (characterToCarryWeightAndVolume.totalWeight / 4 > maxCarryingCapacityKg) {
        return { canCarry: false, reason: `${characterToCarryName} is absurdly heavy for ${characterName} to carry` };
    } else if (characterToCarryWeightAndVolume.totalVolume / 4 > maxCarryingCapacityLiters) {
        return { canCarry: false, reason: `${characterToCarryName} is absurdly large for ${characterName} to carry` };

    // a toddler trying to carry an adult
    } else if (characterToCarryWeightAndVolume.totalWeight / 2 > maxCarryingCapacityKg) {
        return { canCarry: false, reason: `${characterToCarryName} is overwhelmingly heavy for ${characterName} to carry` };
    } else if (characterToCarryWeightAndVolume.totalVolume / 2 > maxCarryingCapacityLiters) {
        return { canCarry: false, reason: `${characterToCarryName} is overwhelmingly large for ${characterName} to carry` };

    // a person trying to carry another of similar size, likely they can't, but this message will be more likely
    } else if (characterToCarryWeightAndVolume.totalWeight > maxCarryingCapacityKg) {
        return { canCarry: false, reason: `${characterToCarryName} is too heavy for ${characterName} to carry` };
    } else if (characterToCarryWeightAndVolume.totalVolume > maxCarryingCapacityLiters) {
        return { canCarry: false, reason: `${characterToCarryName} is too large for ${characterName} to carry` };
    }

    // they can likely carry it, but if they have something they may drop the character later again immediately after items rearrange
    return { canCarry: true, reason: "character can carry" };
}