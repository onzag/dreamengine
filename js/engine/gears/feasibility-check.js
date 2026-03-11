/**
 * Moves the time forwards by using the last message from a given character as a reference.
 */

import { DEngine } from "../index.js";
import testMessageFeasibilityItemChanges from "./feasibility-check/item-changes.js";
import timeForwardsUsingLastMessage from "./feasibility-check/time-forwards.js";
import testMessageFeasibilityForce from "./feasibility-check/force.js";

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

    // this message is only relevant if we stay at the same location and don't happen to move while that is the case
    const storyMasterMessagesToAddFromTimeForwards = await timeForwardsUsingLastMessage(engine, character);

    // THIRD ITEM CHANGES
    const storyMasterMessagesToAddFromItemChanges = await testMessageFeasibilityItemChanges(engine, character);

    return {
        feasible: true,
        reason: "It is feasible for the character to send the message.",
    }
}
