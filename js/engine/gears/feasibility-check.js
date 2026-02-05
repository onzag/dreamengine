/**
 * Moves the time forwards by using the last message from a given character as a reference.
 */

import { deepCopyNoHistory, DEngine } from "..";

/**
 * @typedef {Object} DEngineInteraction
 * @property {string} name name of the character that is about to interact
 * @property {string | null} invoker who invoked this interaction, null if none and it was their own initiative
 */

/**
 * 
 * @param {DEngine} engine 
 * @param {DECompleteCharacterReference} character
 */
async function timeForwardsUsingLastMessage(engine, character) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    if (!engine.inferenceAdapter) {
        throw new Error("Inference adapter not initialized");
    }

    const messageHistoryGenerator = engine.getHistoryForCharacter(character, { includeDebugMessages: false, includeRejectedMessages: false });
    /**
     * @type {string|null}
     */
    let message = null;
    let generator = await messageHistoryGenerator.next(true);
    while (!generator.done) {
        if (!generator.value.debug && !generator.value.rejected) {
            const shouldStopAddingMessages = generator.value.name === character.name;

            message = generator.value.message;

            if (shouldStopAddingMessages) {
                await messageHistoryGenerator.return();
                break;
            }
        }
        generator = await messageHistoryGenerator.next(true);
    }

    if (!message) {
        throw new Error(`No message found for character ${character.name}, yet time-forwards was requested.`);
    }

    const systemMessage = `You are an assistant and story analyst that helps determine how much time has passed in a story based on a single message from ${character.name}:\n\n"${message}"\n\nBased on the content, context, and any time-related references in the message, estimate how much time has passed within the boundaries of that message.`;
    const systemPrompt = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(systemMessage, [
        "You must respond in the format, 'Time Passed: X', where X is the amount of time that has passed (e.g., '8 seconds', '1 minute', '2 hours', '3 days', '1 week').",
        "Keep the amounts whole and simple. Do not use fractions or complex time units.",
        "If the message does not provide enough information to determine the time passed, give a rough estimate regardless.",
    ], null);
    const timePassedGenerator = engine.inferenceAdapter.runQuestioningCustomAgentOn(character, systemPrompt, null, [{ name: character.name, message: message }], "ALL", null);

    const timePassedResponse = await timePassedGenerator.next();
    if (timePassedResponse.done) {
        throw new Error("Failed to prime time-forwards agent.");
    }

    const answer = await timePassedGenerator.next({
        maxCharacters: 100,
        maxParagraphs: 1,
        nextQuestion: `According to the message provided from ${character.name}, how much time has passed?`,
        stopAt: ["\n", "."],
        stopAfter: [],
        answerTrail: "Time Passed: ",
        grammar: `root ::= NUMBER " " ("seconds" | "second" | "minutes" | "minute" | "hours" | "hour" | "days" | "day" | "weeks" | "week" | "month" | "months" | "year" | "years" ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\nNUMBER ::= [0-9]+`,
    });

    // Ensure the generator is properly closed.
    await timePassedGenerator.next(null);
    if (answer.done || !answer.value) {
        throw new Error("Failed to get a valid response from time-forwards agent.");
    }

    // now we have to parse this time passed value, into milliseconds
    const timePassedText = answer.value.trim();
    const numberSide = parseInt(timePassedText.split(" ")[0], 10);

    let unitSide = timePassedText.split(" ")[1].toLowerCase();
    if (unitSide.endsWith("s")) {
        unitSide = unitSide.slice(0, -1);
    }

    const multMap = {
        second: 1000,
        minute: 60 * 1000,
        hour: 60 * 60 * 1000,
        day: 24 * 60 * 60 * 1000,
        week: 7 * 24 * 60 * 60 * 1000,
        month: 30 * 24 * 60 * 60 * 1000,
        year: 365 * 24 * 60 * 60 * 1000,
    };
    // @ts-ignore
    const multiplier = multMap[unitSide];
    if (!multiplier) {
        throw new Error(`Invalid time unit received from time-forwards agent: ${unitSide}`);
    }

    const totalMilliseconds = numberSide * multiplier;

    console.log(`Time-Forwards: Moving time forward by ${totalMilliseconds} milliseconds based on message from ${character.name}.`);

    const currentTime = engine.deObject.currentTime;

    // now let's advance the time
    currentTime.time += totalMilliseconds;

    const newCurrentTimeDate = new Date(currentTime.time);
    currentTime.dayOfMonth = newCurrentTimeDate.getUTCDate();
    currentTime.monthOfYear = newCurrentTimeDate.getUTCMonth() + 1;
    currentTime.year = newCurrentTimeDate.getUTCFullYear();
    currentTime.hourOfDay = newCurrentTimeDate.getUTCHours();
    currentTime.minuteOfHour = newCurrentTimeDate.getUTCMinutes();
    currentTime.dayOfWeek = newCurrentTimeDate.getUTCDay();

    // loop over the stateFor object, character key is the record key and value is the state
    for (const [charKey, charState] of Object.entries(engine.deObject.stateFor)) {
        const currentState = deepCopyNoHistory(charState);
        charState.time = { ...currentTime };
        charState.history.push(currentState);
    }

    for (const location of Object.values(engine.deObject.world.locations)) {
        location.currentWeatherHasBeenOngoingFor.inDays += totalMilliseconds / (24 * 60 * 60 * 1000);
        location.currentWeatherHasBeenOngoingFor.inHours += totalMilliseconds / (60 * 60 * 1000);
        location.currentWeatherHasBeenOngoingFor.inMinutes += totalMilliseconds / (60 * 1000);
    }

    // reroll world weather
    engine.rerollWorldWeather();
    // refresh character states, so that any effect of weather is updated
    engine.refreshCharacterStates();

    // TODO here is where actually characters should have stuff updated based on time passing, wander potential heuristics etc...

}

// /**
//      * 
//      * @param {DECompleteCharacterReference} character 
//      * @param {DEngineInteraction[]} previouslyLeftOrderOfInteraction
//      */
//     async getExpectedInteractionsForLastMessageOf(character, previouslyLeftOrderOfInteraction) {
//         if (!this.deObject) {
//             throw new Error("DEngine not initialized");
//         }
//         const characterState = this.deObject.stateFor[character.name];
//         if (!characterState) {
//             throw new Error(`Character state for ${character.name} not found.`);
//         }
//         if (!characterState.conversationId) {
//             throw new Error(`Character ${character.name} is not in a conversation, cannot get expected interactions for last message.`);
//         }

//         const alreadyInteractingCharacters = this.deObject.conversations[characterState.conversationId].participants.filter(participant => participant !== character.name);

//         const interactedCharacters = await this.determineInteractedCharactersForMessage(character);

//         /**
//          * @type {DEngineInteraction[]}
//          */
//         let nextOrderOfInteraction = /** @type {DEngineInteraction[]} */ (interactedCharacters.ordering.map(name => {
//             if (name === character.name) {
//                 // kinda weird is character talking to themselves?
//                 return null;
//             }
//             /**
//              * @type {DEngineInteraction}
//              */
//             const value = ({
//                 name: name,
//                 invoker: character.name,
//                 messageWillBeAbout: "NORMAL_INTERACTION",
//                 toLocation: null,
//                 toLocationSlot: null,
//             });

//             return value;

//             // we don't add the ones that already left the order of interaction
//             // they come first in the next order of interaction
//         }).filter(item => item !== null && !previouslyLeftOrderOfInteraction.find(prev => prev.name === item.name)));

//         // we take the old values provided that they are still interacting characters
//         // otherwise we must have left them behind without giving them time to answer
//         // in their turn in the conversation
//         // well the character did so, just the user is also a character after all
//         const nextOrderOfInteractionPrevValues = previouslyLeftOrderOfInteraction.filter((c) => alreadyInteractingCharacters.includes(c.name)).map(prevInteraction => ({
//             name: prevInteraction.name,
//             invoker: prevInteraction.invoker,
//             messageWillBeAboutAgreeFollow: false,
//             messageWillBeAboutResistFollow: false,
//             messageWillBeAboutAgreeGroupMemberTaken: false,
//             messageWillBeAboutResistGroupMemberTaken: false,
//             expectedReasoning: null,
//         }));

//         nextOrderOfInteraction = [
//             ...nextOrderOfInteractionPrevValues,
//             ...nextOrderOfInteraction,
//         ];

//         // we will add characters that are already interacting based on their initiative
//         for (const alreadyInteractingCharacterName of alreadyInteractingCharacters) {
//             const characterReference = this.deObject.characters[alreadyInteractingCharacterName];
//             if (!nextOrderOfInteraction.find(interaction => interaction.name === alreadyInteractingCharacterName)) {
//                 if (Math.random() < characterReference.initiative) {
//                     console.log(`Adding already interacting character ${alreadyInteractingCharacterName} to next order of interaction based on initiative ${characterReference.initiative}`);
//                     nextOrderOfInteraction.push({
//                         name: alreadyInteractingCharacterName,
//                         invoker: null,
//                         messageWillBeAboutAgreeFollow: false,
//                         messageWillBeAboutResistFollow: false,
//                         messageWillBeAboutAgreeGroupMemberTaken: false,
//                         messageWillBeAboutResistGroupMemberTaken: false,
//                         expectedReasoning: null,
//                     });
//                 }
//             }
//         }

//         // forcefully add the character with the highest initiative if no one is left
//         if (nextOrderOfInteraction.length === 0) {
//             let highestInitiativeCharacter = null;
//             let highestInitiativeValue = -1;
//             for (const alreadyInteractingCharacterName of alreadyInteractingCharacters) {
//                 const characterReference = this.deObject.characters[alreadyInteractingCharacterName];
//                 if (characterReference.initiative > highestInitiativeValue) {
//                     highestInitiativeValue = characterReference.initiative;
//                     highestInitiativeCharacter = alreadyInteractingCharacterName;
//                 }
//             }
//             if (highestInitiativeCharacter) {
//                 console.log(`Forcefully adding already interacting character ${highestInitiativeCharacter} to next order of interaction as highest initiative ${highestInitiativeValue}`);
//                 nextOrderOfInteraction.push({
//                     name: highestInitiativeCharacter,
//                     invoker: null,
//                     messageWillBeAboutAgreeFollow: false,
//                     messageWillBeAboutResistFollow: false,
//                     messageWillBeAboutAgreeGroupMemberTaken: false,
//                     messageWillBeAboutResistGroupMemberTaken: false,
//                     expectedReasoning: null,
//                 });
//             }
//         }
//     }

// /**
//      * @param {DECompleteCharacterReference} character
//      * @param {string[]} currentlyInteractingCharacters
//      * @param {Array<{
//          * name: string,
//          * lastInvoker: string | null,
//          * messageWillBeAboutAgreeFollow: boolean,
//          * messageWillBeAboutFightFollow: boolean,
//          * messageWillBeAboutAgreeGroupMemberTaken: boolean,
//          * messageWillBeAboutFightGroupMemberTaken: boolean,
//          * expectedReasoning: string | null,
//          * }>} interactionExpectations
//      */
//     async determineGroupDynamics(character, currentlyInteractingCharacters, interactionExpectations) {
//         const allCharacterNamesNotChar = [...currentlyInteractingCharacters];

//         // character is solo wont be really used here because we will use merged into another conversation group
//         // to figure that out

//         if (!this.deObject) {
//             throw new Error("DEngine not initialized");
//         } else if (this.invalidCharacterStates) {
//             throw new Error("DEngine has invalid character states, cannot determine if character has left conversation group to join another");
//         }

//         if (currentlyInteractingCharacters.length === 0 && interactionExpectations.length === 0) {
//             throw new Error("No currently interacting characters or interaction expectations provided, cannot determine group dynamics");
//         }

//         if (currentlyInteractingCharacters.length === 0) {
//             // in this case we will just use the interaction expectations to build the list, since they must be joining
//             // whomever they are interacting with
//             // TODO
//         }

//         if (this.inferenceAdapter === null) {
//             throw new Error("Inference adapter not set, cannot perform inference");
//         }

//         const characterState = this.deObject.stateFor[character.name];
//         if (!characterState) {
//             throw new Error(`Character state for ${character.name} not found.`);
//         }

//         const currentConversation = characterState.conversationId ? this.deObject.conversations[characterState.conversationId] : null;
//         if (!currentConversation) {
//             throw new Error(`Character ${character.name} is not in a conversation, cannot determine if they have left the conversation group.`);
//         }

//         /**
//          * @type Array<{groupDescription: string, characters: Array<{name: string, description: string}>}>
//          */
//         const groups = [
//             {
//                 groupDescription: `${character.name}'s own group`,
//                 characters: currentlyInteractingCharacters.map((charName) => {
//                     return {
//                         name: charName,
//                         description: this.getExternalDescriptionOfCharacter(charName),
//                     };
//                 })
//             }];

//         const allCharactersAround = characterState.surroundingNonStrangers.concat(characterState.surroundingTotalStrangers);
//         /**
//          * @type {{groupDescription: string, characters: Array<{name: string, description: string}>}}
//          */
//         const solos = {
//             groupDescription: "Solo characters around",
//             characters: [],
//         };
//         for (const surrondingCharacterName of allCharactersAround) {
//             if (surrondingCharacterName !== character.name && !allCharacterNamesNotChar.includes(surrondingCharacterName)) {
//                 allCharacterNamesNotChar.push(surrondingCharacterName);
//             }
//             if (currentlyInteractingCharacters.includes(surrondingCharacterName)) continue;

//             // check if already in one of the groups
//             let foundInGroup = false;
//             for (const group of groups) {
//                 if (group.characters.some(char => char.name === surrondingCharacterName)) {
//                     foundInGroup = true;
//                     break;
//                 }
//             }
//             if (foundInGroup) continue;

//             const surrondingCharacterState = this.deObject.stateFor[surrondingCharacterName];
//             if (surrondingCharacterState.conversationId) {
//                 const conv = this.deObject.conversations[surrondingCharacterState.conversationId];
//                 const participants = conv.participants;
//                 if (participants.length === 1) {
//                     solos.characters.push({
//                         name: surrondingCharacterName,
//                         description: this.getExternalDescriptionOfCharacter(surrondingCharacterName),
//                     });
//                 } else {
//                     const existingGroup = groups.find(group => {
//                         // small hack, we will change these group descriptions later
//                         return group.groupDescription === "?" + surrondingCharacterState.conversationId;
//                     });
//                     if (existingGroup) {
//                         // add to existing group
//                         existingGroup.characters.push({
//                             name: surrondingCharacterName,
//                             description: this.getExternalDescriptionOfCharacter(surrondingCharacterName),
//                         });
//                     } else {
//                         groups.push({
//                             // small hack, we will change these group descriptions later
//                             groupDescription: "?" + surrondingCharacterState.conversationId,
//                             characters: participants.map((charName) => {
//                                 return {
//                                     name: charName,
//                                     description: this.getExternalDescriptionOfCharacter(charName),
//                                 };
//                             }),
//                         });
//                     }
//                 }
//             } else {
//                 solos.characters.push({
//                     name: surrondingCharacterName,
//                     description: this.getExternalDescriptionOfCharacter(surrondingCharacterName),
//                 });
//             }
//         };

//         groups.forEach((group, index) => {
//             // we have the hacky description renamed
//             if (group.groupDescription.startsWith("?")) {
//                 const strongestCharacterBond = this.getCharacterWithClosestBondToCharacter(character, group.characters.map(c => c.name));
//                 group.groupDescription = `${strongestCharacterBond}'s group`;
//             }
//         });

//         const availableSocialGroupsContextInfo = this.inferenceAdapter.buildContextInfoForAvailableCharacters(groups, true);

//         const systemMessage = `You are an assistant and story analyst that determines group dynamics between ${character.name} and ${this.deObject.functions.format_and(this.deObject, null, currentlyInteractingCharacters)}`;
//         const systemPrompt = this.inferenceAdapter.buildSystemPromptForQuestioningAgent(systemMessage, [
//             "You must make the conclusion based on the last message from " + character.name,
//             "You must resolve ambiguous mentions of characters to proper names based on the available character descriptions at " + availableSocialGroupsContextInfo.characterInfoAt,
//         ], null);
//         const systemAgent = this.inferenceAdapter.runQuestioningCustomAgentOn(
//             character,
//             systemPrompt,
//             availableSocialGroupsContextInfo.value,
//             this.getHistoryForCharacter(character, {}),
//             "LAST_CYCLE_EXPANDED",
//             null,
//         );
//         const ready = await systemAgent.next();
//         if (ready.done) {
//             throw new Error("Questioning agent could not be started properly.");
//         }

//         // huge grammar should answer all the possible outcomes, we need examples
//         const result = await systemAgent.next({
//             nextQuestion: `considering the list at ${availableSocialGroupsContextInfo.availableCharactersAt}. How have the conversational dynamics changed?`,
//             maxCharacters: 250,
//             maxParagraphs: 1,
//             stopAt: [],
//             stopAfter: [".", "\n"],
//             contextInfo: this.inferenceAdapter.buildContextInfoExample(
//                 `Example: If the story says '${character.name} left alone to go [somewhere]', answer: '${character.name} has left their current conversation group on their own to go somewhere else'.`
//             ) + "\n" + this.inferenceAdapter.buildContextInfoExample(
//                 `Example: If the story says '${character.name} left their current conversation group and joined Bob', answer: '${character.name} has left their current conversation group on their own and joined another group, the new group is formed by "Alice", "Bob" and "Charlie"'.`
//             ) + "\n" + this.inferenceAdapter.buildContextInfoExample(
//                 `Example: If the story says '${character.name} joined the group where the cat is', answer: '${character.name} has joined another group on their own; the new group is formed by "Alice", "Bob", and "Charlie"'. Assuming Charlie is the cat's name, use proper names.`
//             ) + "\n" + this.inferenceAdapter.buildContextInfoExample(
//                 `Example: If the story says '${character.name} joined another group together with Dave and Eve', answer: '${character.name} has joined another group with "Dave" and "Eve"; the new group is formed by "Alice", "Bob" and "Charlie"'.`
//             ) + "\n" + this.inferenceAdapter.buildContextInfoExample(
//                 `Example: If the story says '${character.name} kidnapped Joe away from their friends', answer: '${character.name} has kidnapped "Joe" away from their current conversation'.`
//             ) + "\n" + this.inferenceAdapter.buildContextInfoExample(
//                 `Example: If the story says '${character.name} joined Dale while forcing Peter with him', answer: '${character.name} has joined another group forcing "Peter" with them; the new group is formed by "Dale"'.`
//             ) + "\n" + this.inferenceAdapter.buildContextInfoExample(
//                 `Example: If the story does not indicate any change in group dynamics, answer: '${character.name} has stayed with their current group'.`
//             )
//             ,
//             answerTrail: `${character.name} has `,
//             grammar: `root::= (leftalone | leftalonejoined | joinedgroupalone | joinedgroupwith | stayedwithcurrentgroup | takenfromgroup) .*\n` +

//                 `leftalone ::= "left" " " "their" " " "current" " " "conversation" " " "group" " " "on" " " "their" " " "own" " " "to" (gosomewhereelse | dosomethingelse)\n` +
//                 `gosomewhereelse ::= "go" " " "somewhere" " " "else"\n` +
//                 `dosomethingelse ::= "do" " " "something" " " "else"\n` +

//                 `leftalonejoined ::= "left" " " "their" " " "current" " " "conversation" " " "group" " " "on" " " "their" " " "own" " " "and" " " "joined" " " "another" " " "group" ";" "the" " " "new" " " "group" " " "is" " " "formed" " " "by" " " characteractuallist\n` +

//                 `joinedgroupalone ::= "joined" " " "another" " " "group" " " "on" " " "their" " " "own" ";" " " "the" " " "new" " " "group" " " "is" " " "formed" " " "by" " " characteractuallist\n` +

//                 `joinedgroupwith ::= "joined" " " "another" " " "group" " " ("accompanied" | "together" | "taking" | "forcing" | "kidnapping") characteractuallist (" " "with" " " "them")? ";" "the" " " "new" " " "group" " " "is" " " "formed" " " "by" " " characteractuallist\n` +
//                 `stayedwithcurrentgroup ::= "stayed" " " "with" " " "their" " " "current" " " "group" .*\n` +

//                 `takenfromgroup ::= ("taken" | ("forced" " " "out") | "kidnapped" | "removed") " " characteractuallist " " "away" " " "from" " " "their" " " "current" " " "conversation" " " "group" andjoined?\n` +
//                 `andjoined ::= "and" " " "joined" " " characteractuallist\n` +

//                 `characteractuallist ::= ((" "? "," " "? | " " "and" " ")? "\\"" characterlist "\\"")+\n` +
//                 "characterlist ::= " + allCharacterNamesNotChar.map(name => JSON.stringify(name)).join(" | ") + "\n",
//         });

//         if (result.done) {
//             throw new Error("Questioning agent finished unexpectedly.");
//         }

//         await systemAgent.next(null); // finish the generator

//         // now we are up to some serious parsing
//         const message = result.value.trim();

//         // leftalone check
//         if (message.toLowerCase().startsWith("left their current conversation group on their own to")) {
//             originalGroupMembersLeftBehind = [...currentlyInteractingCharacters];
//             newGroupMembers = [character.name];
//         } else if (message.toLowerCase().startsWith("left their current conversation group on their own and joined another group")) {
//             const formedByPart = message.split("formed by")[1];
//         }
//     }

//     /**
//      * @param {DECompleteCharacterReference} character
//      */
//     async determineInteractedCharactersForMessage(character) {
//         if (!this.deObject) {
//             throw new Error("DEngine not initialized");
//         } else if (this.invalidCharacterStates) {
//             throw new Error("DEngine has invalid character states, cannot determine interacted characters");
//         } else if (!this.inferenceAdapter) {
//             throw new Error("Inference adapter not set, cannot perform inference");
//         }
//         const systemMessage = `You are an assistant and story analyst that determines which characters are being interacted within a message by ${character.name} in an interactive story. ` +
//             `By interaction we mean any mention of the character by name, description, actions directed towards them, where it warrants a response from the character`;

//         const systemPrompt = this.inferenceAdapter.buildSystemPromptForQuestioningAgent(systemMessage, [], null);

//         const characterState = this.deObject.stateFor[character.name];
//         if (!characterState) {
//             throw new Error(`Character state for ${character.name} not found.`);
//         }
//         if (!characterState.conversationId) {
//             throw new Error(`Character ${character.name} is not in a conversation, cannot determine interacted characters.`);
//         }

//         const surroundingNonStrangers = characterState.surroundingNonStrangers;

//         // these characters nearby but they are strangers likely not even looking at the direction
//         // of the character so they likely don't notice them
//         const surroundingTotalStrangers = characterState.surroundingTotalStrangers;

//         // these characters are already in the conversation and likely will hear everything
//         const conversationParticipants = this.deObject.conversations[characterState.conversationId].participants.filter(charName => charName !== character.name);
//         const surroundingNonStrangersNotInConversation = surroundingNonStrangers.filter(charName => !conversationParticipants.includes(charName));

//         /**
//          * @type {string[]}
//          */
//         const strangersLikelyToNotice = [];
//         /**
//          * @type {string[]}
//          */
//         const strangersNotLikelyToNotice = [];
//         /**
//          * @type {string[]}
//          */
//         const nonStrangerLikelyToNotice = [];
//         /**
//          * @type {string[]}
//          */
//         const nonStrangerNotLikelyToNotice = [];

//         for (const stranger of surroundingTotalStrangers) {
//             const sameSlot = this.deObject.stateFor[stranger]?.locationSlot === characterState.locationSlot;
//             if (sameSlot) {
//                 strangersLikelyToNotice.push(stranger);
//             } else {
//                 strangersNotLikelyToNotice.push(stranger);
//             }
//         }
//         for (const nonStranger of surroundingNonStrangersNotInConversation) {
//             const sameSlot = this.deObject.stateFor[nonStranger]?.locationSlot === characterState.locationSlot;
//             if (sameSlot) {
//                 nonStrangerLikelyToNotice.push(nonStranger);
//             } else {
//                 nonStrangerNotLikelyToNotice.push(nonStranger);
//             }
//         }

//         /**
//          * @type Array<{groupDescription: string, characters: Array<{name: string, description: string}>}>
//          */
//         const groups = [];
//         const allValidNamesForGrammar = new Set();

//         if (strangersNotLikelyToNotice.length > 0) {
//             groups.push({
//                 groupDescription: "strangers likely not looking at " + character.name + "'s direction",
//                 characters: strangersNotLikelyToNotice.map(name => ({
//                     name,
//                     description: this.getExternalDescriptionOfCharacter(name),
//                 })),
//             });
//             for (const name of strangersNotLikelyToNotice) {
//                 allValidNamesForGrammar.add(name);
//             }
//         }
//         if (nonStrangerNotLikelyToNotice.length > 0) {
//             groups.push({
//                 groupDescription: "characters who know " + character.name + " but are likely not looking at " + character.name + "'s direction",
//                 characters: nonStrangerNotLikelyToNotice.map(name => ({
//                     name,
//                     description: this.getExternalDescriptionOfCharacter(name),
//                 })),
//             });
//             for (const name of nonStrangerNotLikelyToNotice) {
//                 allValidNamesForGrammar.add(name);
//             }
//         }
//         if (strangersLikelyToNotice.length > 0) {
//             groups.push({
//                 groupDescription: "strangers likely looking at " + character.name + "'s direction",
//                 characters: strangersLikelyToNotice.map(name => ({
//                     name,
//                     description: this.getExternalDescriptionOfCharacter(name),
//                 })),
//             });
//             for (const name of strangersLikelyToNotice) {
//                 allValidNamesForGrammar.add(name);
//             }
//         }
//         if (nonStrangerLikelyToNotice.length > 0) {
//             groups.push({
//                 groupDescription: "characters who know " + character.name + " and are likely looking at " + character.name + "'s direction",
//                 characters: nonStrangerLikelyToNotice.map(name => ({
//                     name,
//                     description: this.getExternalDescriptionOfCharacter(name),
//                 })),
//             });
//             for (const name of nonStrangerLikelyToNotice) {
//                 allValidNamesForGrammar.add(name);
//             }
//         }
//         if (conversationParticipants.length > 0) {
//             groups.push({
//                 groupDescription: "characters already in conversation with " + character.name + " and likely hear everything",
//                 characters: conversationParticipants.map(name => ({
//                     name,
//                     description: this.getExternalDescriptionOfCharacter(name),
//                 })),
//             });
//             for (const name of conversationParticipants) {
//                 allValidNamesForGrammar.add(name);
//             }
//         }

//         const allPotentials = ([
//             ...strangersLikelyToNotice,
//             ...nonStrangerLikelyToNotice,
//             ...strangersNotLikelyToNotice,
//             ...nonStrangerNotLikelyToNotice,
//             ...conversationParticipants,
//         ])
//         const allPotentialsLowered = allPotentials.map(name => name.toLowerCase());

//         const generator = this.inferenceAdapter.runQuestioningCustomAgentOn(character, systemPrompt, null, this.getHistoryForCharacter(character, {}), "LAST_CYCLE_EXPANDED", null);
//         const ready = await generator.next();
//         if (ready.value !== "ready") {
//             throw new Error("Questioning agent could not be started properly.");
//         }

//         const answerAboutLone = await generator.next({
//             maxParagraphs: 1,
//             maxCharacters: 500,
//             stopAt: [],
//             stopAfter: ["yes", "no"],
//             nextQuestion: "In the last message from " + character.name + ", did they interact with any characters or try to get anyone's attention? answer yes if they did, no if they ignored everyone, left or did not interact with anyone.",
//             grammar: `root ::= yesno .*\nyesno ::= "yes" | "no"`,
//         });

//         if (answerAboutLone.done) {
//             throw new Error("Questioning agent ended unexpectedly when asking about interaction alone.");
//         }

//         console.log("Answer about tried to get someone attention interaction:", answerAboutLone.value);

//         const interactingWithSomeone = answerAboutLone.value.trim().toLowerCase().indexOf("yes") !== -1;
//         let interactingWithEveryone = false;
//         /**
//          * @type string[]
//          */
//         let interactingSpecifically = [];

//         if (interactingWithSomeone) {
//             const answerAboutEveryone = await generator.next({
//                 maxParagraphs: 1,
//                 maxCharacters: 500,
//                 stopAt: [],
//                 stopAfter: ["yes", "no"],
//                 nextQuestion: "In the last message from " + character.name + ", did they attempt to get everyone's attention or interact with everyone around them? such as trying to do a speech or announcement, or otherwise did they do something loud that would get everyone's attention? answer yes if they did, no if they didn't.",
//                 grammar: `root ::= yesno .*\nyesno ::= "yes" | "no"`,
//             });

//             if (answerAboutEveryone.done) {
//                 throw new Error("Questioning agent ended unexpectedly when asking about interaction with everyone.");
//             }
//             interactingWithEveryone = answerAboutEveryone.value.trim().toLowerCase().indexOf("yes") !== -1;

//             console.log("Answer about everyone interaction:", answerAboutEveryone.value);

//             if (!interactingWithEveryone) {
//                 // now let's ask who, the LLM is not good at saying nobody or none when there are many options
//                 // so we first ask if they interacted with anyone at all
//                 // if yes, we then ask who specifically
//                 const contextInfoGroups = this.inferenceAdapter.buildContextInfoForAvailableCharacters(groups);

//                 const customGrammar = `root ::= nameList (${this.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()})\nnameList ::= name (\",\" name)*\nname ::= ${Array.from(allValidNamesForGrammar).map(name => JSON.stringify(name)).join(" | ")}`;

//                 const answerToQuestion = await generator.next({
//                     contextInfo: contextInfoGroups.value,
//                     maxParagraphs: 1,
//                     maxCharacters: 500,
//                     stopAt: [],
//                     stopAfter: [],
//                     nextQuestion: "In the last message from " + character.name + ", which characters specifically are being interacted with?",
//                     grammar: customGrammar,
//                     answerTrail: "The characters " + character.name + " has interacted with in the order they are likely to respond/react are: ",
//                 });

//                 if (answerToQuestion.done) {
//                     throw new Error("Questioning agent ended unexpectedly when asking about who was interacted with.");
//                 }

//                 console.log("Answer to who was interacted with:", answerToQuestion.value);

//                 answerToQuestion.value.split(",").map(name => name.trim()).forEach(name => {
//                     const loweredName = name.toLowerCase();
//                     if (loweredName === "none" || loweredName === "noone" || loweredName === "nobody" || !loweredName) {
//                         return;
//                     }

//                     if (allPotentialsLowered.includes(loweredName)) {
//                         const actualName = allPotentials[allPotentialsLowered.indexOf(loweredName)];
//                         if (!interactingSpecifically.includes(actualName)) {
//                             interactingSpecifically.push(actualName);
//                         }
//                     }
//                 });
//             } else {
//                 interactingSpecifically = allPotentials;
//             }
//         }

//         await generator.next(null); // finish the generator

//         const result = {
//             strangersAtDistanceInteracted: strangersNotLikelyToNotice.filter(name => interactingSpecifically.includes(name)),
//             nonStrangersAtDistanceInteracted: nonStrangerNotLikelyToNotice.filter(name => interactingSpecifically.includes(name)),
//             strangersUpCloseInteracted: strangersLikelyToNotice.filter(name => interactingSpecifically.includes(name)),
//             nonStrangersUpCloseInteracted: nonStrangerLikelyToNotice.filter(name => interactingSpecifically.includes(name)),
//             ordering: interactingSpecifically,
//             loudAnnouncementToEveryone: interactingWithEveryone,
//         };

//         return result;
//     }

/**
 * @param {DEngine} engine 
 * @param {DECompleteCharacterReference} character 
 * @param {DEngineInteraction[]} previouslyLeftOrderOfInteraction
 */
export default async function testMessageFeasibilityForCharacter(engine, character, previouslyLeftOrderOfInteraction) {
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

    // FIRST, was a character forced towards an action
    // this is for users only as a check, because we will deny the message if
    // it was not feasible, eg. they forced a giant dragon to a mountain (which may be impossible if they are weak)
    // we will try to detect such situations and reject the message as infeasible
    if (character.name === engine.userCharacter.name) {
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
        const answerToQuestion = await generator.next({
            maxParagraphs: 1,
            maxCharacters: 500,
            nextQuestion: "Considering the list at " + contextInfoSurroundingCharacters.availableCharactersAt + ". Which characters, if any, have been successfully forced to do something by " + character.name + " in the last message by such character? Provide a comma separated list of names only, or say 'none' if no characters were successfully forced.",
            stopAt: ["\n", "."],
            stopAfter: [],
            grammar: `root ::= nameList (${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()})\nnameList ::= name (\",\" name)*\nname ::= ${characters.map(c => JSON.stringify(c.name)).join(" | ")} | "none"`,
            answerTrail: "The characters that have been successfully forced to do something by " + character.name + " are: ",
        });

        if (answerToQuestion.done) {
            throw new Error("Questioning agent ended unexpectedly when asking about who was forced.");
        }

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

                const answerAboutWhat = await generator.next({
                    maxParagraphs: 1,
                    maxCharacters: 500,
                    nextQuestion: "In the last message from " + character.name + ", what specific action or actions has " + forcedCharacterName + " been successfully forced to do by " + character.name + "? Provide a brief description of the action or actions.",
                    stopAt: ["\n", "."],
                    stopAfter: [],
                    answerTrail: forcedCharacterName + " has been forced to ",
                });

                if (answerAboutWhat.done) {
                    throw new Error("Questioning agent ended unexpectedly when asking about what was forced.");
                }
                forcedToDoWhat[forcedCharacterName] = answerAboutWhat.value.trim();
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

                console.log(`Feasibility check: checking if it is feasible for ${forcedCharacterName} to be forced to do the action: ${forcedAction}`);

                const [, , , relationshipOfOwnCharacterTowardsForcedCharacter] = await engine.getRelationshipBetweenCharacters(character.name, forcedCharacterName);
                const ownCharacterDescription = engine.inferenceAdapter.buildSystemCharacterDescription(
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

                const [, , , relationshipOfForcedCharacterTowardsOwnCharacter] = await engine.getRelationshipBetweenCharacters(forcedCharacterName, character.name);
                const [internalDescriptionForcedCharacter, stateInfoForcedCharacter,] = await engine.getInternalDescriptionOfCharacter(forcedCharacterName);
                const forcedCharacterDescription = engine.inferenceAdapter.buildSystemCharacterDescription(
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
                const feasibilityAnswer = await feasibilityGenerator.next({
                    maxParagraphs: 1,
                    maxCharacters: 250,
                    nextQuestion: "Considering the character descriptions and current states of both characters, is it feasible for " + forcedCharacterName + " to be successfully been forced to " + forcedAction + " by " + character.name + " in the last message from such character? Answer 'yes' if it is feasible, 'no' and elaborate if it is not feasible.",
                    stopAt: ["\n", "."],
                    stopAfter: [],
                    grammar: `root ::= (yesanswer | noanswer)\nyesanswer ::= "yes" ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\nnoanswer ::= "no" "," " " "because" .* ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}`,
                });

                if (feasibilityAnswer.done) {
                    throw new Error("Questioning agent ended unexpectedly when asking about feasibility.");
                }

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

    // SECOND ITEM CHANGES

    // if we reached here, the message is feasible
    // 2. we will calculate items changing hands (being dropped, picked up, given, stolen, etc.)
    const systemMessage = `You are an assistant and story analyst that determines if the last message from ${character.name} contains any items that have moved, changed hands, been dropped by any other character, in an interactive story. Changing hands means any item that has been picked up, dropped, given to another character, stolen, or otherwise transferred from one character to another.\n\n` +
        "This includes clothing and worn items that have been removed or put on";
    const systemPrompt = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(systemMessage, [
        "Consider only the last message from " + character.name + ".",
        "Identify any items that have been dropped by any chararacter, picked up, given to another character, stolen, or otherwise transferred from one character to another.",
        "Also identify any items dropped or left behind by any character.",
        "Identify any clothing or worn items that have been removed or put on by any character.",
        "If unable to specify where the item is placed next, assume it is placed on the ground at the current location of the character dropping or removing the item.",
        "Always place the name of the item in quotation marks",
        "Always place the name of the character in quotation marks",
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
            if (item.wearableProperties && !item.nonPickable) {
                allWearableItemsInLocation.push(item.name);
            }
            if (item.capacityKg) {
                allContainersInLocation.push(item.name);
            }
            if (!item.nonPickable) {
                allCarriableItemsInLocation.push(item.name);
            }
            allItemsInLocation.push(item.name);
        }
    }

    for (const otherCharacterName of [...charState.surroundingNonStrangers, ...charState.surroundingTotalStrangers]) {
        const otherCharacterState = engine.deObject.stateFor[otherCharacterName];
        if (otherCharacterState.carrying) {
            for (const item of otherCharacterState.carrying) {
                if (item.wearableProperties && !item.nonPickable) {
                    allWearableItemsInLocation.push(item.name);
                }
                if (item.capacityKg) {
                    allContainersInLocation.push(item.name);
                }
                if (!item.nonPickable) {
                    allCarriableItemsInLocation.push(item.name);
                }
                allItemsInLocation.push(item.name);
            }
        }
        if (otherCharacterState.wearing) {
            for (const item of otherCharacterState.wearing) {
                if (item.wearableProperties && !item.nonPickable) {
                    allWearableItemsInLocation.push(item.name);
                }
                if (item.capacityKg) {
                    allContainersInLocation.push(item.name);
                }
                if (!item.nonPickable) {
                    allCarriableItemsInLocation.push(item.name);
                }
                allItemsInLocation.push(item.name);
            }
        }
    }

    const anyCharacterGrammarSimple = "characternamesimple ::= " + allCharactersInLocation.map(name => JSON.stringify(name)).join(" | ");
    const anyCharacterGrammarQuoted = `characternamequoted ::= \"\\\"\" characternamesimple \"\\\"\"`
    const commaSeparatorOrAnd = `commaseparatororand ::= (\",\" \" \") | \" and \"`;
    const amountNumber = `amountnumber ::= ([0-9]+ " " "of") | "a few" | "several" | "many" | "a lot of" | "some" | "half of" | "most of" | "all of"`;

    const containeroptionGrammar = "containeroption ::= \"\\\"\" (amountnumber \" \")? (characternamesimple \"'s\")? (" + allContainersInLocation.map(name => JSON.stringify(name)).join(" | ") + ") \"\\\"\"";
    const carriableItemGrammar = "carriableitem ::= \"\\\"\" (amountnumber \" \")? (characternamesimple \"'s\" \" \")? (" + allCarriableItemsInLocation.map(name => JSON.stringify(name)).join(" | ") + ") \"\\\"\"";
    const carriableItemListGrammar = "carriableitemlist ::= carriableitem (commaseparatororand carriableitem)*";
    const wearableItemGrammar = "wearableitem ::= \"\\\"\" (amountnumber \" \")? (characternamesimple \"'s\" \" \")? (" + allWearableItemsInLocation.map(name => JSON.stringify(name)).join(" | ") + ") \"\\\"\"";
    const wearableItemListGrammar = "wearableitemlist ::= wearableitem (commaseparatororand wearableitem)*";
    const anyItemGrammar = "anyitem ::= \"\\\"\" (amountnumber \" \")? (characternamesimple \"'s\" \" \")? (" + allItemsInLocation.map(name => JSON.stringify(name)).join(" | ") + ") \"\\\"\"";
    const anyItemListGrammar = "anyitemlist ::= anyitem (commaseparatororand anyitem)*";

    const placementGrammar = `placement ::= ("on" " " anyitem) | ("in" " " containeroption) | ("on" " " "the" " " ("ground" | "floor"))`;
    const placementWithAndGrammar = `placementwithand ::= "and" " " "placed" " " ("them" | "it") " " placement`;
    const placementWithAndGiveGrammar = `placementwithgive ::= placementwithand | ("and" " " "gave" " " ("them" | "it") " " "to" " " characternamequoted)`;
    const placementWithAndOrWearOrGiveGrammar = `placementwithandorwearorgive ::= placementwithgive | ("and" " " "wore" " " ("them" | "it")) | ("and" " " "put" " " ("them" | "it") " " "on" " " ("\\""themselves"\\"" | characternamequoted | ("\\"" "the" " " "ground" "\\""))?)`;

    const simpleGiveGrammar = `simplegive ::= characternamequoted " " "gave" " " (carriableitemlist | wearableitemlist) " " "to" " " characternamequoted`;
    const simplePutOnOtherGrammar = `simpleputonother ::= characternamequoted " " "made" " " characternamequoted " " (("put" " " "on") | "wear") " " (wearableitemlist)`;
    const droppedGrammar = `characterdropped ::= characternamequoted " " "dropped" " " (carriableitemlist | "\\"everything\\"" | "\\"all\\"" | "\\"all their items\\"" | "\\"all of their items\\"" | "\\"all of their belongings\\"")`;
    const droppedAndPlacedSomewhereElseGrammar = `characterdroppedandplacedsomewhereelse ::= characterdropped " " placementwithgive`;
    const droppedClothesGrammar = `characterdroppedclothes ::= characternamequoted " " "removed" " " (wearableitemlist | "\\"all their clothes\\"" | "\\"all their garments\\"" | "\\"all their wearables\\"")`;
    const droppedClothesAndPlacedSomewhereElseGrammar = `characterdroppedclothesandplacedsomewhereelse ::= characterdroppedclothes " " placementwithandorwearorgive`;
    const pickedUpGrammar = `characterpickedup ::= characternamequoted " " (("picked" " " ("up" " ")?) | "stole" | ("put" " " "on") | "wore" | ("now" " " "wears")) (carriableitemlist | wearableitemlist)`;
    const pickedUpAndPlacedSomewhereElseGrammar = `characterpickedupandplacedsomewhereelse ::= characterpickedup " " placementwithandorwearorgive`;

    const statementGrammar = `statement ::= simplegive | simpleputonother | characterdropped | characterdroppedandplacedsomewhereelse | characterdroppedclothes | characterdroppedclothesandplacedsomewhereelse | characterpickedup | characterpickedupandplacedsomewhereelse`;
    const listOfStatementsGrammar = `root ::= statement ("." "\\n" statement)*`;

    const finalGrammar = [
        listOfStatementsGrammar,
        commaSeparatorOrAnd,
        amountNumber,

        anyCharacterGrammarSimple,
        anyCharacterGrammarQuoted,

        simpleGiveGrammar,
        simplePutOnOtherGrammar,
        containeroptionGrammar,
        carriableItemGrammar,
        carriableItemListGrammar,
        wearableItemGrammar,
        wearableItemListGrammar,
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

            const isSimpleGive = rest.indexOf("gave") === 0;
            const isMadeSomeoneElseWear = rest.indexOf("made") === 0;
            if (isSimpleGive) {
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
            }
            if (isMadeSomeoneElseWear) {
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

    // ONLY FOR USER CHARACTER, since we assume that the LLM respects the world rules
    // TODO check if a worn item is unfeasible to be put on (only for user character)
    // TODO check if some invalid states are created, eg. a container in the location gets overfilled out of capacity, or a character gets more items than they can carry, or a character wears more items than they can wear, etc. For this we will need to gather the necessary information about the characters and items involved and then ask the LLM if the new state is feasible or not, if not we will reject the message as infeasible
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
 * @param {string|null} giver
 * @param {string|null} itemReceipient
 * @param {"carrying" | "wearing"} itemRecepientAction
 * @param {boolean} useForce whether to attempt to force the change based on heuristics if we cannot parse it properly, this is to prevent the LLM from giving us changes in a format that we cannot parse but that are still feasible and should be accepted, without allowing it to give us completely unfeasible changes that we would have accepted because we could not parse them
 * @param {string[]} storyMasterMessagesToAdd 
 * @param {string} line the original line that we are trying to process, this is used for logging purposes to give more context in the logs when we cannot parse the line properly
 * @returns {{retry: boolean, skip: boolean}}
 */
function attemptToMoveItemToRecepient(engine, itemName, giver, itemReceipient, itemRecepientAction, useForce, storyMasterMessagesToAdd, line) {
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
        const carryingItem = stateForItemHolder.carrying.find(item => item.name === itemNameWithoutHolder);
        const wearingItem = stateForItemHolder.wearing.find(item => item.name === itemNameWithoutHolder);

        if (!carryingItem && !wearingItem && !useForce) {
            console.log("Feasibility check item changes: item holder parsed from item name does not seem to have the item in their carrying or wearing state, this may be due to out of order inference, adding line back to processing list to check again in the next cycle after other lines have been processed, line:", line);
            return {
                retry: true,
                skip: false,
            }
        }

        // if we are here, it means the item is indeed held by the character that we parsed from the item name, so we can be reasonably sure that the give action is feasible, we will still check if the recipient character can receive the item, for example if they are not too weak to carry it or if they have a free hand to receive it, but we can be pretty sure that the item is indeed being given by the character that we parsed from the item name
        if (carryingItem) {
            console.log("Feasibility check item changes: item is being carried by the character parsed from the item name, thus it is feasible for them to give it, checking if recipient can receive it, line:", line);
            if (itemRecepientAction === "wearing") {
                const exactAmountPassed = recalculateDEItemListMovement(carryingItem, stateForItemHolder.carrying, recepientState.wearing, amount, "worn by " + itemReceipient);
                if (giver && giver !== itemHolder) {
                    storyMasterMessagesToAdd.push(`${giver} has taken ${displayItemNameForStoryMessage(carryingItem)} from ${itemHolder} and given it to ${itemReceipient}, now ${itemReceipient} is wearing:${exactAmountPassed === 1 ? "" : " " + exactAmountPassed} ${displayItemNameForStoryMessage(carryingItem)}`);
                } else if (giver) {
                    storyMasterMessagesToAdd.push(`${itemReceipient} has received and is now wearing:${exactAmountPassed === 1 ? "" : " " + exactAmountPassed} ${displayItemNameForStoryMessage(carryingItem)} from ${giver}`);
                } else {
                    storyMasterMessagesToAdd.push(`${itemReceipient} is now wearing:${exactAmountPassed === 1 ? "" : " " + exactAmountPassed} ${displayItemNameForStoryMessage(carryingItem)} from ${itemHolder}`);
                }
            } else {
                const exactAmountPassed = recalculateDEItemListMovement(carryingItem, stateForItemHolder.carrying, recepientState.carrying, amount, "carried by " + itemReceipient);
                if (giver && giver !== itemHolder) {
                    storyMasterMessagesToAdd.push(`${giver} has taken ${displayItemNameForStoryMessage(carryingItem)} from ${itemHolder} and given it to ${itemReceipient}, now ${itemReceipient} is carrying:${exactAmountPassed === 1 ? "" : " " + exactAmountPassed} ${displayItemNameForStoryMessage(carryingItem)}`);
                } else if (giver) {
                    storyMasterMessagesToAdd.push(`${itemReceipient} has received and is now carrying:${exactAmountPassed === 1 ? "" : " " + exactAmountPassed} ${displayItemNameForStoryMessage(carryingItem)} from ${giver}`);
                } else {
                    storyMasterMessagesToAdd.push(`${itemReceipient} is now carrying:${exactAmountPassed === 1 ? "" : " " + exactAmountPassed} ${displayItemNameForStoryMessage(carryingItem)} from ${itemHolder}`);
                }
            }
        } else if (wearingItem) {
            console.log("Feasibility check item changes: item is being worn by the character parsed from the item name, thus it is feasible for them to give it, checking if recipient can receive it, line:", line);
            if (itemRecepientAction === "wearing") {
                const exactAmountPassed = recalculateDEItemListMovement(wearingItem, stateForItemHolder.wearing, recepientState.wearing, amount, "worn by " + itemReceipient);
                if (giver && giver !== itemHolder) {
                    storyMasterMessagesToAdd.push(`${giver} has taken ${displayItemNameForStoryMessage(wearingItem)} from ${itemHolder} and given it to ${itemReceipient}, now ${itemReceipient} is wearing:${exactAmountPassed === 1 ? "" : " " + exactAmountPassed} ${displayItemNameForStoryMessage(wearingItem)}`);
                } else if (giver) {
                    storyMasterMessagesToAdd.push(`${itemReceipient} has received and is now wearing:${exactAmountPassed === 1 ? "" : " " + exactAmountPassed} ${displayItemNameForStoryMessage(wearingItem)} from ${giver}`);
                } else {
                    storyMasterMessagesToAdd.push(`${itemReceipient} is now wearing:${exactAmountPassed === 1 ? "" : " " + exactAmountPassed} ${displayItemNameForStoryMessage(wearingItem)} from ${itemHolder}`);
                }
            } else {
                const exactAmountPassed = recalculateDEItemListMovement(wearingItem, stateForItemHolder.wearing, recepientState.carrying, amount, "carried by " + itemReceipient);
                if (giver && giver !== itemHolder) {
                    storyMasterMessagesToAdd.push(`${giver} has taken ${displayItemNameForStoryMessage(wearingItem)} from ${itemHolder} and given it to ${itemReceipient}, now ${itemReceipient} is carrying:${exactAmountPassed === 1 ? "" : " " + exactAmountPassed} ${displayItemNameForStoryMessage(wearingItem)}`);
                } else if (giver) {
                    storyMasterMessagesToAdd.push(`${itemReceipient} has received and is now carrying:${exactAmountPassed === 1 ? "" : " " + exactAmountPassed} ${displayItemNameForStoryMessage(wearingItem)} from ${giver}`);
                } else {
                    storyMasterMessagesToAdd.push(`${itemReceipient} is now carrying:${exactAmountPassed === 1 ? "" : " " + exactAmountPassed} ${displayItemNameForStoryMessage(wearingItem)} from ${itemHolder}`);
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
        if (!finalSlot && !useForce) {
            console.log("Feasibility check item changes: could not find the item in the location, retrying later to see if a character drops such item later");
            return {
                retry: true,
                skip: false,
            };
        }
        if (!finalSlot && useForce) {
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
            );

            return {
                retry: false,
                skip: true,
            }
        }

        // TODO pick the item or something
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
 * @returns 
 */
function useForceToPassItem(engine, giver, potentialItemHolderState, itemRecepientState, itemNameWithoutHolder, potentialItemHolder, itemRecepient, itemRecepientAction, amount, storyMasterMessagesToAdd, line) {
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
    } else {
        // find the item somewhere in the location and move it to the recipient character
        const location = engine.deObject.world.locations[potentialItemHolderState?.location || itemRecepientState.location];
        finalSlot = Object.values(location.slots).find(slot => !!itemListHasItem(slot.items, itemNameWithoutHolder)) || null;
    }

    if (!finalSlot) {
        console.log("Feasibility check item changes: could not find the item in the location when attempting to force changes based on heuristics, skipping this item change, line:", line);
        return;
    }

    const itemInQuestion = itemListHasItem(finalSlot.items, itemNameWithoutHolder);

    if (itemInQuestion) {
        // there is no item holder here because the item was picked from the location
        if (itemRecepientAction === "wearing") {
            const exactAmountMoved = recalculateDEItemListMovement(itemInQuestion.item, itemInQuestion.sourceList, itemRecepientState.wearing, amount, "worn by " + itemRecepient);
            if (!giver) {
                storyMasterMessagesToAdd.push(`${itemRecepient} is now wearing:${exactAmountMoved === 1 ? "" : " " + exactAmountMoved} ${displayItemNameForStoryMessage(itemInQuestion.item)}`);
            } else {
                storyMasterMessagesToAdd.push(`${itemRecepient} has received and is now wearing:${exactAmountMoved === 1 ? "" : " " + exactAmountMoved} ${displayItemNameForStoryMessage(itemInQuestion.item)} from ${giver}`);
            }
        } else {
            const exactAmountMoved = recalculateDEItemListMovement(itemInQuestion.item, itemInQuestion.sourceList, itemRecepientState.carrying, amount, "carried by " + itemRecepient);
            if (!giver) {
                storyMasterMessagesToAdd.push(`${itemRecepient} is now carrying:${exactAmountMoved === 1 ? "" : " " + exactAmountMoved} ${displayItemNameForStoryMessage(itemInQuestion.item)}`);
            } else {
                storyMasterMessagesToAdd.push(`${itemRecepient} has received and is now carrying:${exactAmountMoved === 1 ? "" : " " + exactAmountMoved} ${displayItemNameForStoryMessage(itemInQuestion.item)} from ${giver}`);
            }
        }
    }

    console.log("Feasibility check item changes: could not find the item in the final slot when attempting to force changes based on heuristics, skipping this item change, line:", line);

    // TODO get it from other characters to see if they have it, in that case they are the real holders

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
 * @param {DEItem[]} itemList 
 * @param {string} itemName 
 * @returns {{sourceList: DEItem[], item: DEItem} | null}
 */
function itemListHasItem(itemList, itemName) {
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

}