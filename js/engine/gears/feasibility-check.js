/**
 * Moves the time forwards by using the last message from a given character as a reference.
 */

import { DEngine } from "../index.js";
import { getExternalDescriptionOfCharacter, getInternalDescriptionOfCharacter, getRelationshipBetweenCharacters, getSurroundingCharacters } from "../util/character-info.js";
import { getHistoryFragmentForCharacter } from "../util/messages.js";

/**
 * @typedef {Object} DEngineInteraction
 * @property {string} name name of the character that is about to interact
 * @property {string | null} invoker who invoked this interaction, null if none and it was their own initiative
 */

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

// /**
//      * 
//      * @param {DECompleteCharacterReference} character 
//      * @param {string[]} listOfCharacters
//      */
//     getCharacterWithClosestBondToCharacter(character, listOfCharacters) {
//         if (!this.deObject) {
//             throw new Error("DEngine not initialized");
//         }

//         const bondsInOrder = listOfCharacters.map(otherCharName => {
//             // @ts-expect-error
//             const bondFound = this.deObject.social.bonds[character.name].active.find((b) => b.towards === otherCharName);
//             if (!bondFound) {
//                 return { name: otherCharName, bond: 0 };
//             }
//             return { name: otherCharName, bond: Math.abs(bondFound.bond) };
//         }).sort((a, b) => b.bond - a.bond);

//         return bondsInOrder.length > 0 ? bondsInOrder[0].name : null;
//     }

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

// /**
//      * @param {DECompleteCharacterReference} character 
//      * @param {boolean} characterIsSolo 
//      */
//     async determineCharacterHasMergedIntoAnotherConversationGroup(character, characterIsSolo) {
//         if (!this.deObject) {
//             throw new Error("DEngine not initialized");
//         }

//         const characterState = this.deObject.stateFor[character.name];
//         if (!characterState) {
//             throw new Error(`Character state for ${character.name} not found.`);
//         }

//         const systemMessage = `You are an assistant that determines if ${character.name} approached a conversation group together with all ` +
//             `the members of their current conversation group and has merged into that other conversation group in a friedly manner as they are closeby.\n\n` +
//             `if ${character.name} has gone with their conversation group towards another, say the name of the group, the people in the group, and mention the new people ` +
//             `that will conform this new conversation group.`;
//         const systemMessageSolo = `You are an assistant that determines if ${character.name} has decided to join a new conversation group ` +
//             `if ${character.name} has joined a new conversation group, say the name of the group, and mention the people in the group`;

//         const currentConversation = characterState.conversationId ? this.deObject.conversations[characterState.conversationId] : null;
//         if (!currentConversation) {
//             throw new Error(`Character ${character.name} is not in a conversation, cannot determine if they have left the conversation group.`);
//         }

//         const participantsThatAreNotCharacter = currentConversation.participants.filter(charName => charName !== character.name);
//         if (participantsThatAreNotCharacter.length === 0) {
//             throw new Error(`Character ${character.name} is the only participant in the conversation, cannot determine if they have left the conversation group.`);
//         }

//         let groupsList = `The list of groups is as follows:\n\n${character.name}'s own group:\n - ${character.name}: ${await getExternalDescriptionOfCharacter(this, character.name)}\n`;

//         for (const ownGroupParticipant of currentConversation.participants) {
//             groupsList += ` - ${ownGroupParticipant}: ${await getExternalDescriptionOfCharacter(this, ownGroupParticipant)}\n`;
//         }

//         const allCharactersSurrounding = getSurroundingCharacters(this, character.name)
//         const allCharactersAround = [...allCharactersSurrounding.nonStrangers, ...allCharactersSurrounding.totalStrangers];

//         /**
//          * @type {string[][]}
//          */
//         const groups = [];
//         const solos = [];
//         for (const surrondingCharacterName of allCharactersAround) {
//             if (surrondingCharacterName === character.name) continue;
//             if (participantsThatAreNotCharacter.includes(surrondingCharacterName)) continue;

//             // check if already in one of the groups
//             let foundInGroup = false;
//             for (const group of groups) {
//                 if (group.includes(surrondingCharacterName)) {
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
//                     solos.push(surrondingCharacterName);
//                 } else {
//                     groups.push(participants);
//                 }
//             } else {
//                 solos.push(surrondingCharacterName);
//             }
//         }

//         for (const [index, group] of groups.entries()) {
//             const strongestCharacterBond = this.getCharacterWithClosestBondToCharacter(character, group);
//             groupsList += `\n\n${strongestCharacterBond}'s group:\n`;
//             for (const member of group) {
//                 groupsList += ` - ${member}: ${await getExternalDescriptionOfCharacter(this, member)}\n`;
//             }
//         };

//         groupsList += `\n\nNow take into account the last message from ${character.name} and determine if they have merged into another conversation group together with all the members of their current conversation group. ` +
//             `If they have approach a new group, say the new people that conform the new group that ${character.name} has joined, including any characters from the previous conversation that have joined as well. ` +
//             `DO NOT say everyone in case it is everyone, use the specific names; if they have not merged into another group, say "NO, ${character.name} has not approached another group."`;

//         // TODO inference to determine which group they have joined and with whom
//         // TODO determine no
//         let inferenceText = "";

//         const inferenceTextLowered = inferenceText.toLowerCase();
//         /**
//          * @type {string[]}
//          */
//         const newPeopleOfTheGroup = [];
//         for (const char of allCharactersAround) {
//             if (char === character.name) continue;
//             const lowered = char.toLowerCase();
//             if (inferenceTextLowered.includes(lowered) && !newPeopleOfTheGroup.includes(char)) {
//                 newPeopleOfTheGroup.push(char);

//                 // now let's readd potential people from the groups that are conversing together that the LLM may have missed
//                 for (const group of groups) {
//                     if (group.includes(char)) {
//                         for (const member of group) {
//                             if (!newPeopleOfTheGroup.includes(member)) {
//                                 newPeopleOfTheGroup.push(member);
//                             }
//                         }
//                     }
//                 }
//             }
//         }

//         if (!newPeopleOfTheGroup.includes(character.name)) {
//             // add to the list
//             newPeopleOfTheGroup.push(character.name);
//         }

//         if (newPeopleOfTheGroup.length === 1) {
//             // well, :| this is not good, the LLM must have missed everything
//             // we will be alone I guess
//             return { merged: false, newGroupMembers: currentConversation.participants };
//         }

//         return {
//             merged: true,
//             newGroupMembers: newPeopleOfTheGroup,
//         }
//     }

/**
 * @param {DEngine} engine 
 * @param {DECompleteCharacterReference} character 
 */
async function testMessageFeasibilityForce(engine, character) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
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
    const surroundingCharactersInfo = getSurroundingCharacters(engine, character.name);
    for (const characterName of surroundingCharactersInfo.totalStrangers) {
        const characterInfo = engine.deObject.characters[characterName];
        if (characterInfo) {
            characters.push({ name: characterName, description: await getExternalDescriptionOfCharacter(engine, characterName, true) });
        }
    }
    for (const characterName of surroundingCharactersInfo.nonStrangers) {
        const characterInfo = engine.deObject.characters[characterName];
        if (characterInfo) {
            characters.push({ name: characterName, description: await getExternalDescriptionOfCharacter(engine, characterName, true) });
        }
    }

    const contextInfoSurroundingCharacters = engine.inferenceAdapter.buildContextInfoForAvailableCharacters([
        {
            characters,
            groupDescription: "",
        }
    ]);

    const lastCycleExpanded = (await getHistoryFragmentForCharacter(engine, character, {
        includeDebugMessages: false,
        includeRejectedMessages: false,
        msgLimit: "LAST_CYCLE_EXPANDED",
    })).messages;

    // 1. Gather all the characters that have been succesfully forced by the user in the last story fragment
    const systemMessage = `You are an assistant and story analyst that determines if the last story fragment contains any characters that have been successfully forced to do something by ${character.name}.`
    const systemPrompt = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(systemMessage, [
        "By successfully forced we mean that it is explicitly stated that the character complied with the forceful action or command given by " + character.name + ".",
        "If the character resisted or the outcome is unknown, it does not count as successfully forced.",
        "An attempt to force does not count, only successful compliance.",
        "Consider only the last story fragment",
    ], null);
    const generator = engine.inferenceAdapter.runQuestioningCustomAgentOn("feasibility-check", systemPrompt, contextInfoSurroundingCharacters.value, lastCycleExpanded, null, true);
    const ready = await generator.next();
    if (ready.value !== "ready") {
        throw new Error("Questioning agent could not be started properly.");
    }
    const nextQuestion = "Considering the list at " + contextInfoSurroundingCharacters.availableCharactersAt + ". Which characters, if any, have been successfully forced to do something in the last story fragment? Provide a comma separated list of names only, or say 'none' if no characters were successfully forced.";
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

            const nextQuestion = "In the last story fragment, what specific action or actions has " + forcedCharacterName + " been successfully forced to do? Provide a brief description of the action or actions, if no action was forced, say 'they have not been forced to do anything'.";
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

        const internalDescriptionInfo = await getInternalDescriptionOfCharacter(engine, character.name);

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
                const [, , , relationshipOfOwnCharacterTowardsForcedCharacter] = await getRelationshipBetweenCharacters(engine, character.name, forcedCharacterName);
                ownCharacterDescription = engine.inferenceAdapter.buildSystemCharacterDescription(
                    character,
                    internalDescriptionInfo.general,
                    await getExternalDescriptionOfCharacter(engine, character.name, true),
                    [
                        relationshipOfOwnCharacterTowardsForcedCharacter,
                    ],
                    internalDescriptionInfo.expressiveStates,
                    null,
                    null,
                );
            } catch (e) {
                ownCharacterDescription = engine.inferenceAdapter.buildSystemCharacterDescription(
                    character,
                    internalDescriptionInfo.general,
                    await getExternalDescriptionOfCharacter(engine, character.name, true),
                    [],
                    internalDescriptionInfo.expressiveStates,
                    null,
                    null,
                );
            }

            let forcedCharacterDescription = "";

            try {
                const [, , , relationshipOfForcedCharacterTowardsOwnCharacter] = await getRelationshipBetweenCharacters(engine, forcedCharacterName, character.name);
                const internalDescriptionInfoForcedCharacter = await getInternalDescriptionOfCharacter(engine, forcedCharacterName);
                forcedCharacterDescription = engine.inferenceAdapter.buildSystemCharacterDescription(
                    forcedCharacter,
                    internalDescriptionInfoForcedCharacter.general,
                    await getExternalDescriptionOfCharacter(engine, forcedCharacterName, true),
                    [
                        relationshipOfForcedCharacterTowardsOwnCharacter,
                    ],
                    internalDescriptionInfoForcedCharacter.expressiveStates,
                    null,
                    null,
                );
            } catch (e) {
                const internalDescriptionInfoForcedCharacter = await getInternalDescriptionOfCharacter(engine, forcedCharacterName);
                forcedCharacterDescription = engine.inferenceAdapter.buildSystemCharacterDescription(
                    forcedCharacter,
                    internalDescriptionInfoForcedCharacter.general,
                    await getExternalDescriptionOfCharacter(engine, forcedCharacterName, true),
                    [],
                    internalDescriptionInfoForcedCharacter.expressiveStates,
                    null,
                    null,
                );
            }

            const isolatedCharacterInfo = engine.inferenceAdapter.buildContextInfoCharacterDescription(character, ownCharacterDescription).value + "\n\n" + engine.inferenceAdapter.buildContextInfoCharacterDescription(forcedCharacter, forcedCharacterDescription).value;

            // we will build a custom system prompt for each character because even when we can add things in the user space
            // we really want to make sure the LLM focuses on the forced character's capabilities
            const feasibilitySystemMessage = `You are an assistant and story analyst that determines if it is feasible for ${forcedCharacterName} to be forced to do the action described in the last story fragment from ${character.name} in an interactive story.`;
            const feasibilitySystemPrompt = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(feasibilitySystemMessage, [
                "Consider the physical, mental, and situational capabilities of " + forcedCharacterName + " based on their character description and current state.",
                "Consider the general description of both " + character.name + " and " + forcedCharacterName + " to understand their relationship and typical behaviour.",
                "If it is unreasonable for " + forcedCharacterName + " to comply to the forced action due to their behaviour and it's not aligned with their character, answer 'no'.",
                "If the action described in the last story fragment is beyond the capabilities of " + forcedCharacterName + ", answer 'no'.",
                "If " + forcedCharacterName + " is being physically forced but " + forcedCharacterName + " is much larger/stronger than the force attempting to coerce them, answer 'no'.",
                "Only if the action is within the capabilities of " + forcedCharacterName + " and is reasonable for them to comply, answer 'yes'.",
                "If the answer is no, elaborate briefly on why it is not feasible.",
            ], null);

            const feasibilityGenerator = engine.inferenceAdapter.runQuestioningCustomAgentOn("feasibility-check", feasibilitySystemPrompt, isolatedCharacterInfo, lastCycleExpanded, null, true);
            const feasibilityReady = await feasibilityGenerator.next();
            if (feasibilityReady.value !== "ready") {
                throw new Error("Questioning agent could not be started properly for feasibility check.");
            }
            const nextQuestion = "Considering the character descriptions and current states of both characters, is it feasible for " + forcedCharacterName + " to be successfully been forced to " + forcedAction + " by " + character.name + " in the last story fragment from such character? Answer 'yes' if it is feasible, 'no' and elaborate if it is not feasible.";

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

/**
 * @param {DEngine} engine 
 * @param {DECompleteCharacterReference} character 
 * @param {DEngineInteraction[]} previouslyLeftOrderOfInteraction
 */
export default async function testMessageFeasibilityForCharacter(engine, character, previouslyLeftOrderOfInteraction) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
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
        const returnValue = await testMessageFeasibilityForce(engine, character);
        if (returnValue) {
            return returnValue;
        }
    }

    return {
        feasible: true,
        reason: "It is feasible for the character to send the message.",
    }
}
