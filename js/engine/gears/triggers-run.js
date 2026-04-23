import { weightedRandom } from "../../util/random.js";
import { DEngine } from "../index.js";
import { getBondDeclarationFromBondDescription, getBondDeclarationFromName, getFamilyBondRelation, getRelationship, getSurroundingCharacters } from "../util/character-info.js";
import { isYes, numberGrammar, yesNoGrammar } from "../util/grammar.js";
import { getHistoryFragmentForCharacter } from "../util/messages.js";

/**
 * @param {DEngine} engine 
 * @param {DECompleteCharacterReference} character 
 * @param {DECharacterStateDefinition} stateDefinition
 * @param {DECompleteCharacterReference[]} allCharactersInAnalysis
 */
function determinePotentialCharacterCausants(
    engine,
    character,
    stateDefinition,
    allCharactersInAnalysis,
) {
    // just a quick short circuit in case there are no characters matching that criteria
    let potentialCausants = allCharactersInAnalysis;

    const minBondLevel = typeof stateDefinition.potentialCausantsCriteria?.minBondRequired === "number" ? stateDefinition.potentialCausantsCriteria.minBondRequired : -100;
    const maxBondLevel = typeof stateDefinition.potentialCausantsCriteria?.maxBondAllowed === "number" ? stateDefinition.potentialCausantsCriteria.maxBondAllowed : 100;
    const min2BondLevel = stateDefinition.potentialCausantsCriteria?.min2BondRequired || 0;
    const max2BondLevel = stateDefinition.potentialCausantsCriteria?.max2BondAllowed || 100;
    const allowsStrangers = !!stateDefinition.potentialCausantsCriteria?.noBondAllowed;
    const deniesKnownPeople = !!stateDefinition.potentialCausantsCriteria?.bondDenied;
    const onlyFamily = !!stateDefinition.potentialCausantsCriteria?.onlyFamily;
    const familyExclude = stateDefinition.potentialCausantsCriteria?.familyExclude || [];

    potentialCausants = allCharactersInAnalysis.filter(otherCharacter => {
        const bondTowardsCharacter = engine.deObject?.bonds[character.name].active.find(b => b.towards === otherCharacter.name);
        const assumedBond = bondTowardsCharacter ? bondTowardsCharacter.bond : 0;
        const assumedBond2 = bondTowardsCharacter ? bondTowardsCharacter.bond2 : 0;
        const assumedStranger = bondTowardsCharacter ? bondTowardsCharacter.stranger : true;

        const otherCharacterFamilyRelationship = getFamilyBondRelation(character, otherCharacter);

        if (onlyFamily && !otherCharacterFamilyRelationship) {
            return false;
        }

        if (otherCharacterFamilyRelationship && familyExclude.length > 0 && familyExclude.includes(otherCharacterFamilyRelationship)) {
            return false;
        }

        if (
            (assumedStranger && deniesKnownPeople) ||
            (!assumedStranger && !allowsStrangers)
        ) {
            return false;
        }
        if (assumedBond < minBondLevel || assumedBond > maxBondLevel) {
            return false;
        }
        if (assumedBond2 < min2BondLevel || assumedBond2 > max2BondLevel) {
            return false;
        }

        if (stateDefinition.potentialCausantsCriteria?.custom) {
            const customResult = stateDefinition.potentialCausantsCriteria.custom(character, otherCharacter);
            return customResult;
        }

        return true;
    });

    return potentialCausants;
}

/**
 * @param {DEngine} engine
 * @param {DECompleteCharacterReference} character
 * @param {DECharacterYesNoQuestion | DECharacterTextQuestion | DECharacterNumericQuestion} question
 * @param {DERunQuestionOptions} options
 */
export async function runQuestion(engine, character, question, options) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    } else if (!engine.inferenceAdapter) {
        throw new Error("Inference adapter not initialized");
    } else if (!character.bonds) {
        throw new Error(`Character ${character.name} has no bonds defined.`);
    }

    // TODO implement apologizable state with causants, and inject something like, x did not accept the apology or if they did
    // narrative effect or somethin

    // first we need to update the bonds towards the character, for that we need to get a whole extended cycle
    // gather all the other characters that talked inbetween, and update bonds for each
    const lastCycleMessagesInfo = options.lastCycleMessagesInfo || await getHistoryFragmentForCharacter(engine, character, {
        msgLimit: "LAST_CYCLE",
        includeDebugMessages: false,
        includeRejectedMessages: false,
    });

    const yesNoGrammarObject = yesNoGrammar(engine);
    const numberGrammarObject = numberGrammar(engine);

    /**
     * @type {Array<string | null>}
     */
    let others = [null];
    if (question.askPer) {
        const deObject = engine.getDEObject();
        if (question.askPer === "present_character") {
            const surroundingCharacters = getSurroundingCharacters(deObject, character.name);
            const allCharacters = [...surroundingCharacters.nonStrangers, ...surroundingCharacters.totalStrangers];
            if (allCharacters.length === 0) {
                return; // skip this question if there are no surrounding characters
            }
            others = allCharacters;
        } else if (question.askPer === "conversing_character") {
            const conversingCharactersRelevant = options.interactedCharactersAccordingToItemChange;
            if (conversingCharactersRelevant.length === 0) {
                return; // skip this question if there are no conversing characters
            }
            others = conversingCharactersRelevant;
        } else if (question.askPer === "present_family_members") {
            const surroundingCharacters = getSurroundingCharacters(deObject, character.name);
            const familyMembers = surroundingCharacters.nonStrangers.filter(c => {
                const relation = getFamilyBondRelation(character, engine.getDEObject().characters[c]);
                return relation !== null;
            });
            if (familyMembers.length === 0) {
                return; // skip this question if there are no family members
            }
            others = familyMembers;
        } else if (question.askPer === "potential_character_causants_of_state") {
            // @ts-ignore it does exist
            const stateInQuestion = question.askPerState;
            if (!stateInQuestion) {
                console.warn(`Question has askPer set to potential_character_causants_of_state but no askPerState specified, skipping`);
                return;
            }

            const stateDef = engine.deObject.characters[character.name].stateDefinitions[stateInQuestion];
            if (!stateDef) {
                console.warn(`Question has askPerState set to ${stateInQuestion} but character has no state with that name, skipping`);
                return;
            }

            /**
             * @type {DECompleteCharacterReference[]}
             */
            const allCharactersInAnalysis = lastCycleMessagesInfo.mentionedCharacters.map((c) => engine.deObject?.characters[c]).filter(c => !!c);
            // add the ones given by our item change
            for (const otherCharacter of options.interactedCharactersAccordingToItemChange) {
                if (!allCharactersInAnalysis.find(c => c.name === otherCharacter)) {
                    const charRef = engine.deObject?.characters[otherCharacter];
                    if (charRef) {
                        allCharactersInAnalysis.push(charRef);
                    }
                }
            }

            others = determinePotentialCharacterCausants(engine, character, stateDef, allCharactersInAnalysis).map(c => c.name);
        } else if (question.askPer === "character_causants_of_state") {
            const stateForCharacter = engine.deObject.stateFor[character.name];

            // @ts-ignore it does exist
            const appliedState = stateForCharacter.states.find(s => s.state === question.askPerState);

            if (!appliedState) {
                // @ts-ignore it does exist
                console.warn(`Question has askPer set to ${question.askPer} and askPerState set to ${question.askPerState} but character has no such state applied, skipping`);
                return;
            }

            if (!appliedState.causes || appliedState.causes.length === 0) {
                // @ts-ignore it does exist
                console.warn(`Question has askPer set to ${question.askPer} and askPerState set to ${question.askPerState} but the state has no causants, skipping`);
                return;
            }

            // @ts-ignore
            others = Array.from(new Set(appliedState.causes.filter(c => c.causant?.type === "character").map(c => c.causant?.name)));
        } else if (question.askPer === "object_causants_of_state") {
            const stateForCharacter = engine.deObject.stateFor[character.name];

            const appliedState = stateForCharacter.states.find(s => s.state === question.askPerState);
            if (!appliedState) {
                console.warn(`Question has askPer set to ${question.askPer} and askPerState set to ${question.askPerState} but character has no such state applied, skipping`);
                return;
            }
            if (!appliedState.causes || appliedState.causes.length === 0) {
                console.warn(`Question has askPer set to ${question.askPer} and askPerState set to ${question.askPerState} but the state has no causants, skipping`);
                return;
            }
            // @ts-ignore
            others = Array.from(new Set(appliedState.causes.filter(c => c.causant?.type === "object").map(c => c.causant?.name)));
        } else {
            console.warn(`Unknown askPer value ${question.askPer} for question, skipping`);
            return;
        }
    }

    const deObject = engine.getDEObject();
    for (const other of others) {
        const otherFamilyRelationship = other && question.askPer !== "object_causants_of_state" ? getFamilyBondRelation(character, engine.deObject.characters[other]) : null;
        const relationship = other && question.askPer !== "object_causants_of_state" ? await getRelationship(deObject, character, engine.deObject.characters[other]) : null;

        if (question.runIf) {
            let shouldRun = false;
            if (question.askPer === "object_causants_of_state") {
                shouldRun = await question.runIf(character, other || "Unknown Item");
            } else if (question.askPer === "character_causants_of_state" || question.askPer === "potential_character_causants_of_state" ||
                question.askPer === "present_character" || question.askPer === "present_family_members" || question.askPer === "conversing_character"
            ) {
                if (!other) {
                    console.warn(`Question has askPer set to ${question.askPer} but other is null, skipping`);
                    shouldRun = false;
                } else {
                    const otherCharacter = engine.deObject.characters[other];
                    if (!otherCharacter) {
                        console.warn(`Question has askPer set to ${question.askPer} but other character ${other} not found in DE object, skipping`);
                        shouldRun = false;
                    } else {
                        shouldRun = await question.runIf(character, otherCharacter, otherFamilyRelationship);
                    }
                }
            } else {
                shouldRun = await question.runIf(character);
            }
            if (!shouldRun) {
                console.warn(`Question has runIf condition that returned false for character ${character.name} and other ${other}, skipping`);
                continue;
            }
        }

        await options.initializeAgent();

        const questionText = typeof question.question === "function" ? await question.question(engine.deObject, {
            char: character,
            // @ts-ignore typescript is wrong, other can be null
            other: other ? engine.deObject.characters[other] : null,
            otherFamilyRelation: otherFamilyRelationship || null,
            otherRelationship: relationship || null,
        }) : question.question;

        console.log(`Asking question: ${questionText}`);

        if (question.type === "yes_no") {
            const answer = await options.questioningAgent.next({
                maxCharacters: 0,
                maxSafetyCharacters: 250,
                maxParagraphs: 1,
                nextQuestion: questionText,
                stopAfter: yesNoGrammarObject.stopAfter,
                stopAt: [],
                grammar: yesNoGrammarObject.grammar,
                instructions: "Answer with 'yes' or 'no'",
            });

            if (answer.done) {
                throw new Error("Questioning agent finished unexpectedly while asking yes/no question");
            }

            const answerText = answer.value.trim().toLowerCase();

            console.log(`Received answer: ${answerText}`);

            const isYesAnswer = isYes(answerText);

            // @ts-ignore tired of fighting typescript
            await question.onValue(isYesAnswer, character, other ? engine.deObject.characters[other] : null, otherFamilyRelationship, relationship);
        } else if (question.type === "text") {
            const answer = await options.questioningAgent.next({
                maxCharacters: 0,
                maxSafetyCharacters: 250,
                maxParagraphs: 1,
                nextQuestion: questionText,
                stopAfter: [],
                stopAt: [],
                grammar: question.grammar || undefined,
            });

            if (answer.done) {
                throw new Error("Questioning agent finished unexpectedly while asking text question");
            }

            const answerText = answer.value.trim();

            console.log(`Received answer: ${answerText}`);

            // @ts-ignore tired of fighting typescript
            await question.onText(answerText, character, other ? engine.deObject.characters[other] : null, otherFamilyRelationship, relationship);
        } else if (question.type === "numeric") {
            const answer = await options.questioningAgent.next({
                maxCharacters: 0,
                maxSafetyCharacters: 250,
                maxParagraphs: 1,
                nextQuestion: questionText,
                stopAfter: numberGrammarObject.stopAfter,
                stopAt: [],
                grammar: numberGrammarObject.grammar,
            });

            if (answer.done) {
                throw new Error("Questioning agent finished unexpectedly while asking numeric question");
            }

            const answerText = answer.value.trim();

            console.log(`Received answer: ${answerText}`);

            const parsedNumber = parseFloat(answerText);

            if (isNaN(parsedNumber)) {
                console.warn(`Received answer that is not a valid number for numeric question: ${answerText}, skipping onValue callback`);
                continue;
            }

            // @ts-ignore tired of fighting typescript
            await question.onNumber(parsedNumber, character, other ? engine.deObject.characters[other] : null, otherFamilyRelationship, relationship);
        }
    }
}

/**
 * @param {DEngine} engine
 * @param {DECompleteCharacterReference} character
 * @param {string[]} interactedCharactersAccordingToItemChange
 * @returns {Promise<{microInjections: string[], microVocabularyLimits: DEVocabularyLimit[]}>}
 */
export default async function runAllTriggersFor(engine, character, interactedCharactersAccordingToItemChange) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    } else if (!engine.inferenceAdapter) {
        throw new Error("Inference adapter not initialized");
    } else if (!character.bonds) {
        throw new Error(`Character ${character.name} has no bonds defined.`);
    }

    const lastCycleMessagesInfo = await getHistoryFragmentForCharacter(engine, character, {
        msgLimit: "LAST_CYCLE",
        includeDebugMessages: false,
        includeRejectedMessages: false,
    });

    const systemPrompt = `You are an assistant and social dynamics analyst that helps analyze interactions involving ${character.name}`;
    const questioningAgent = engine.inferenceAdapter.runQuestioningCustomAgentOn(
        "questions-run",
        {
            system: engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(systemPrompt, [], null),
            contextInfoBefore: null,
            messages: lastCycleMessagesInfo.messages,
            contextInfoAfter: null,
        },
    );

    let initialized = false;

    const initializeAgent = async () => {
        if (initialized) {
            return;
        }
        const ready = await questioningAgent.next();
        if (ready.done) {
            throw new Error("Failed to initialize questioning agent");
        }
        initialized = true;
    }

    for (const trigger of character.triggers) {
        await runQuestion(engine, character, trigger, {
            lastCycleMessagesInfo,
            interactedCharactersAccordingToItemChange,
            questioningAgent,
            initializeAgent,
        });
    }

    let microInjections = [];

    /**
     * @type {DEVocabularyLimit[]}
     */
    let microVocabularyLimits = [];

    /**
     * @type {Record<string, boolean>}
     */
    const smallQuestionsCache = {};
    for (const stateForCharacter of engine.deObject.stateFor[character.name].states) {
        if (stateForCharacter.causes) {
            for (const cause of stateForCharacter.causes) {
                let removed = false;
                if (cause.causant?.type === "character") {
                    if (!interactedCharactersAccordingToItemChange.includes(cause.causant.name)) {
                        continue; // skip causants that are not relevant
                    }
                    if (cause.causant.apologizable) {
                        const question = "Has " + cause.causant.name + " apologized to " + character.name + " for causing them to become " + stateForCharacter.state + ": " + JSON.stringify(character.name + " " + cause.description) + " (done by " + cause.causant.name + ")?";
                        if (!smallQuestionsCache[question]) {
                            await runQuestion(engine, character, {
                                type: "yes_no",
                                question: question,
                                onValue: async (answer) => {
                                    smallQuestionsCache[question] = answer;
                                },
                            }, {
                                lastCycleMessagesInfo,
                                interactedCharactersAccordingToItemChange,
                                questioningAgent,
                                initializeAgent,
                            });
                        }

                        if (smallQuestionsCache[question]) {
                            const apologySuccessful = Math.random() < cause.causant.apologizable;
                            if (apologySuccessful) {
                                microInjections.push(character.name + " accepted the apology from " + cause.causant.name + " for causing them to become " + stateForCharacter.state);
                                stateForCharacter.causes = stateForCharacter.causes.filter(c => c !== cause);
                                removed = true;
                            } else {
                                microInjections.push(character.name + " did not accept the apology from " + cause.causant.name + " for causing them to become " + stateForCharacter.state);
                            }
                        }
                    }
                }

                if (!removed) {
                    // More?
                }
            }
        }
    }

    for (const bond of engine.deObject.bonds[character.name].active) {
        if (bond.towards in interactedCharactersAccordingToItemChange) {
            if (character.temp["rejectIntimacy_" + bond.towards]) {
                console.log("Intimacy towards " + bond.towards + " is currently rejected for " + character.name + ", skipping intimacy triggers for this bond");
                continue; // skip this bond if intimacy is rejected due to recent negative interaction or already shifted bond
            }

            if (character.temp["alreadyShiftedBondPrimary_" + bond.towards] < 0 || character.temp["alreadyShiftedBondSecondary_" + bond.towards] < 0) {
                console.log("Intimacy towards " + bond.towards + " is currently rejected for " + character.name + " because of a negative interaction or already shifted bond, skipping intimacy triggers for this bond");
                continue; // skip this bond if intimacy is rejected due to recent negative interaction or already shifted bond
            }

            let multiplier = 1;

            const allActiveStates = engine.deObject.stateFor[character.name].states;
            for (const activeState of allActiveStates) {
                const stateDef = character.stateDefinitions[activeState.state];
                if (typeof stateDef.intimacyMultiplier === "number" && stateDef.intimacyMultiplier !== 1) {
                    const applies = stateDef.intimacyMultiplierDirectionality === "everyone" ? true : activeState.causes?.some(cause => cause.causant?.type === "character" && cause.causant.name === bond.towards);
                    if (applies) {
                        multiplier *= stateDef.intimacyMultiplier;
                    }
                }
            }

            const bondDeclaration = getBondDeclarationFromBondDescription(engine.deObject, character, bond);
            if (bondDeclaration) {
                let alreadyInIntimateAct = false;
                let alreadyInSex = false;
                let negativeInteraction = false;
                let alreadyInAffectionateAct = false;

                const openToAffection = await bondDeclaration.intimacy.openToAffection(engine.deObject, character, engine.deObject.characters[bond.towards]);
                const openToIntimateAffection = await bondDeclaration.intimacy.openToIntimateAffection(engine.deObject, character, engine.deObject.characters[bond.towards]);
                const openToSex = await bondDeclaration.intimacy.openToSex(engine.deObject, character, engine.deObject.characters[bond.towards]);

                const openToAffectionQuestions = bondDeclaration.intimacy.openAffectionateResponses.filter(r => !r.onlyAtLevel || r.onlyAtLevel === openToAffection.value);
                const openToIntimateAffectionQuestions = bondDeclaration.intimacy.openIntimateAffectionateResponses.filter(r => !r.onlyAtLevel || r.onlyAtLevel === openToIntimateAffection.value);
                const openToSexQuestions = bondDeclaration.intimacy.openSexResponses.filter(r => !r.onlyAtLevel || r.onlyAtLevel === openToSex.value);

                const allQuestionsToAsk = [...openToAffectionQuestions, ...openToIntimateAffectionQuestions, ...openToSexQuestions];


                const otherFamilyRelation = getFamilyBondRelation(character, engine.deObject.characters[bond.towards]);
                const otherRelationship = await getRelationship(engine.deObject, character, engine.deObject.characters[bond.towards]);

                for (const questionToAsk of allQuestionsToAsk) {
                    const questionText = typeof questionToAsk.question === "string" ? questionToAsk.question : await questionToAsk.question(engine.deObject, {
                        char: character,
                        other: engine.deObject.characters[bond.towards],
                        otherFamilyRelation,
                        otherRelationship,
                    });
                    if (!smallQuestionsCache[questionText]) {
                        await runQuestion(engine, character, {
                            type: "yes_no",
                            question: questionText,
                            onValue: async (answer) => {
                                smallQuestionsCache[questionText] = answer;
                            },
                        }, {
                            lastCycleMessagesInfo,
                            interactedCharactersAccordingToItemChange,
                            questioningAgent,
                            initializeAgent,
                        });
                    }

                    if (smallQuestionsCache[questionText]) {
                        const injection = typeof questionToAsk.reaction === "string" ? questionToAsk.reaction : await questionToAsk.reaction(engine.deObject, {
                            char: character,
                            other: engine.deObject.characters[bond.towards],
                            otherFamilyRelation,
                            otherRelationship,
                        });

                        microInjections.push(injection);
                    }
                }

                const questionOfSex = "In the last story fragment, has " + character.name + " engaged in sexual activities or sexual acts with " + bond.towards + "?";

                if (!smallQuestionsCache[questionOfSex]) {
                    await runQuestion(engine, character, {
                        type: "yes_no",
                        question: questionOfSex,
                        onValue: async (answer) => {
                            smallQuestionsCache[questionOfSex] = answer;
                        },
                    }, {
                        lastCycleMessagesInfo,
                        interactedCharactersAccordingToItemChange,
                        questioningAgent,
                        initializeAgent,
                    });
                }

                const engagedInSex = smallQuestionsCache[questionOfSex];

                if (engagedInSex) {
                    alreadyInIntimateAct = true;
                    alreadyInSex = true;
                    if (openToSex.value === "not") {
                        negativeInteraction = true;
                        microInjections.push(character.name + " just engaged in sexual activities with " + bond.towards + " but " + character.name + " is not open to sex with them, this might cause serious tension, trauma, or conflict in their interactions");
                    } else {
                        microInjections.push(character.name + " just engaged in sexual activities with " + bond.towards + " and " + character.name + " is " + openToSex.value + " open to sex with them, this might significantly deepen their bond and intimacy");
                    }
                } else {
                    const questionOfIntimateAffection = "In the last story fragment, has " + character.name + " received intimate affection from " + bond.towards + "? eg. kissing with arousing/sexual intent, making out, intimate actions with romantic/sexual interest, etc.";

                    if (!smallQuestionsCache[questionOfIntimateAffection]) {
                        await runQuestion(engine, character, {
                            type: "yes_no",
                            question: questionOfIntimateAffection,
                            onValue: async (answer) => {
                                smallQuestionsCache[questionOfIntimateAffection] = answer;
                            },
                        }, {
                            lastCycleMessagesInfo,
                            interactedCharactersAccordingToItemChange,
                            questioningAgent,
                            initializeAgent,
                        });
                    }

                    const receivedIntimateAffection = smallQuestionsCache[questionOfIntimateAffection];

                    if (receivedIntimateAffection) {
                        alreadyInIntimateAct = true;
                        if (openToIntimateAffection.value === "not") {
                            negativeInteraction = true;
                            microInjections.push(character.name + " just received intimate affection from " + bond.towards + " but " + character.name + " is not open to intimate affection from them, this might cause significant tension, discomfort, or conflict in their interactions");
                        } else {
                            microInjections.push(character.name + " just received intimate affection from " + bond.towards + " and " + character.name + " is " + openToIntimateAffection.value + " open to intimate affection from them, this might deepen their bond and have a very positive effect on their interactions");
                        }
                    } else {
                        const questionOfAffection = "In the last story fragment, has " + character.name + " received affection from " + bond.towards + "? eg. hugging, caressing, holding hands, affectionate words, etc.";

                        if (!smallQuestionsCache[questionOfAffection]) {
                            await runQuestion(engine, character, {
                                type: "yes_no",
                                question: questionOfAffection,
                                onValue: async (answer) => {
                                    smallQuestionsCache[questionOfAffection] = answer;
                                },
                            }, {
                                lastCycleMessagesInfo,
                                interactedCharactersAccordingToItemChange,
                                questioningAgent,
                                initializeAgent,
                            });
                        }

                        const receivedAffection = smallQuestionsCache[questionOfAffection];

                        if (receivedAffection) {
                            alreadyInAffectionateAct = true;
                            if (openToAffection.value === "not") {
                                negativeInteraction = true;
                                microInjections.push(character.name + " just received affection from " + bond.towards + " but " + character.name + " is not open to affection from them, this might cause some tension or discomfort in their interactions");
                            } else {
                                microInjections.push(character.name + " just received affection from " + bond.towards + " and " + character.name + " is " + openToAffection.value + " open to affection from them, this might have a positive effect on their interactions");
                            }
                        }
                    }
                }

                if (!negativeInteraction) {
                    let proneToInitiateAffectionProbability = await bondDeclaration.intimacy.proneToInitiatingAffection.probability(engine.deObject, character, engine.deObject.characters[bond.towards]);
                    let proneToInitiateIntimateAffectionProbability = await bondDeclaration.intimacy.proneToInitiatingIntimateAffection.probability(engine.deObject, character, engine.deObject.characters[bond.towards]);
                    let proneToInitiateSexProbability = await bondDeclaration.intimacy.proneToInitiatingSex.probability(engine.deObject, character, engine.deObject.characters[bond.towards]);

                    proneToInitiateAffectionProbability *= alreadyInAffectionateAct ? 2 : proneToInitiateAffectionProbability;
                    proneToInitiateAffectionProbability *= multiplier;
                    if (proneToInitiateAffectionProbability > 1) {
                        proneToInitiateAffectionProbability = 1;
                    }
                    proneToInitiateIntimateAffectionProbability *= alreadyInIntimateAct || alreadyInAffectionateAct ? 2 : proneToInitiateIntimateAffectionProbability;
                    proneToInitiateIntimateAffectionProbability *= multiplier;
                    if (proneToInitiateIntimateAffectionProbability > 1) {
                        proneToInitiateIntimateAffectionProbability = 1;
                    }
                    proneToInitiateSexProbability *= alreadyInSex ? 0 : (alreadyInIntimateAct || alreadyInAffectionateAct ? 2 : proneToInitiateSexProbability);
                    proneToInitiateSexProbability *= multiplier;
                    if (proneToInitiateSexProbability > 1) {
                        proneToInitiateSexProbability = 1;
                    }

                    const lastIsWaitingForAffectionConsent = character.state["last_is_waiting_for_affection_consent_from_" + bond.towards];
                    const lastIsExecutingAffectionateAct = character.state["last_continous_affectionate_act_towards_" + bond.towards];
                    const referenceToUse = lastIsExecutingAffectionateAct || lastIsWaitingForAffectionConsent;
                    if (proneToInitiateAffectionProbability > 0 || referenceToUse) {
                        // affection showcase is not subject to libido
                        if (Math.random() < proneToInitiateAffectionProbability || referenceToUse) {
                            const realBondDeclaration = /** @type {DEBondDeclaration} */ (referenceToUse ?
                                getBondDeclarationFromName(engine.deObject, character, referenceToUse.decl) :
                                bondDeclaration);
                            if (!realBondDeclaration) {
                                console.warn("Could not find bond declaration for " + character.name + " towards " + bond.towards + " with name " + referenceToUse.decl + ", skipping affectionate action");
                            } else {
                                const actionToChoose = referenceToUse ? (
                                    realBondDeclaration.intimacy.proneToInitiatingAffection.actions[referenceToUse.actionIndex]
                                ) : weightedRandom(bondDeclaration.intimacy.proneToInitiatingAffection.actions, (i) => i.probability);
                                if (actionToChoose) {
                                    /**
                                     * Proceeded despite the lack of consent
                                     * @param {boolean} proceedAnyway 
                                     */
                                    const injectBehaviour = async (proceedAnyway = false) => {
                                        // @ts-ignore typescript is wrong, it is not null
                                        const behaviour = typeof actionToChoose.action === "string" ? actionToChoose.action : await actionToChoose.action(engine.deObject, {
                                            char: character,
                                            // @ts-ignore typescript is wrong, it is not null
                                            other: engine.deObject.characters[bond.towards],
                                            otherFamilyRelation,
                                            otherRelationship,
                                        });

                                        if (proceedAnyway) {
                                            microInjections.push("Even though " + character.name + " did not receive consent: " + behaviour);
                                        } else {
                                            microInjections.push(behaviour);
                                        }

                                        if (actionToChoose.vocabularyLimit) {
                                            microVocabularyLimits.push(actionToChoose.vocabularyLimit);
                                        }

                                        // @ts-ignore typescript is wrong, it is not null
                                        character.state["last_affectionate_act_towards_" + bond.towards] = engine.deObject.currentTime;

                                        if ((actionToChoose.fullfillCriteriaQuestions || []).length > 0) {
                                            character.state["last_continous_affectionate_act_towards_" + bond.towards] = {
                                                decl: realBondDeclaration.name,
                                                actionIndex: realBondDeclaration.intimacy.proneToInitiatingAffection.actions.indexOf(actionToChoose),
                                            };
                                        } else {
                                            delete character.state["last_continous_affectionate_act_towards_" + bond.towards];
                                        }

                                        delete character.state["last_is_waiting_for_affection_consent_response_from_" + bond.towards];
                                    }

                                    /**
                                     * @param {boolean} retry 
                                     */
                                    const injectConsentQuestion = async (retry) => {
                                        if (actionToChoose.consentMechanism) {
                                            const actionToAskForConsent = typeof actionToChoose.consentMechanism.action === "string" ? actionToChoose.consentMechanism.action : await actionToChoose.consentMechanism.action(engine.getDEObject(), {
                                                char: character,
                                                // @ts-ignore typescript is wrong, it is not null
                                                other: engine.deObject.characters[bond.towards],
                                                otherFamilyRelation,
                                                otherRelationship,
                                            });
                                            if (retry) {
                                                microInjections.push(character.name + " will insist on the behaviour: " + actionToAskForConsent);
                                            } else {
                                                microInjections.push(actionToAskForConsent);
                                            }
                                            if (!lastIsExecutingAffectionateAct) {
                                                if (lastIsWaitingForAffectionConsent) {
                                                    lastIsWaitingForAffectionConsent.tries++;
                                                } else {
                                                    character.state["last_is_waiting_for_affection_consent_response_from_" + bond.towards] = {
                                                        decl: realBondDeclaration.name,
                                                        actionIndex: realBondDeclaration.intimacy.proneToInitiatingAffection.actions.indexOf(actionToChoose),
                                                        tries: 0,
                                                    };
                                                }
                                            }
                                        } else {
                                            await injectBehaviour();
                                        }
                                    }

                                    if (lastIsExecutingAffectionateAct) {
                                        let isFullfilled = false;
                                        for (const question of (actionToChoose.fullfillCriteriaQuestions || [])) {
                                            const questionValue = (typeof question === "string" ? question : await question(engine.deObject, {
                                                char: character,
                                                other: engine.deObject.characters[bond.towards],
                                                otherFamilyRelation,
                                                otherRelationship,
                                            })).trim();
                                            await runQuestion(engine, character, {
                                                type: "yes_no",
                                                question: questionValue,
                                                onValue: async (answer) => {
                                                    smallQuestionsCache[questionValue] = answer;
                                                },
                                            }, {
                                                lastCycleMessagesInfo,
                                                interactedCharactersAccordingToItemChange,
                                                questioningAgent,
                                                initializeAgent,
                                            });

                                            if (smallQuestionsCache[questionValue]) {
                                                isFullfilled = true;
                                                break;
                                            }
                                        }

                                        if (!isFullfilled) {
                                            await injectBehaviour();
                                        } else {
                                            delete character.state["last_continous_affectionate_act_towards_" + bond.towards];
                                            delete character.state["last_is_waiting_for_affection_consent_response_from_" + bond.towards];
                                        }
                                    } else if (actionToChoose.consentMechanism) {
                                        if (lastIsWaitingForAffectionConsent) {
                                            const questionAmbigous = (typeof actionToChoose.consentMechanism.checkAmbiguousResponse === "string" ? actionToChoose.consentMechanism.checkAmbiguousResponse : await actionToChoose.consentMechanism.checkAmbiguousResponse(engine.deObject, {
                                                char: character,
                                                other: engine.deObject.characters[bond.towards],
                                                otherFamilyRelation,
                                                otherRelationship,
                                            })).trim();
                                            let answerAmbigousBool = false;
                                            if (questionAmbigous.toLowerCase() === "yes" || questionAmbigous.toLowerCase() === "no") {
                                                answerAmbigousBool = questionAmbigous.toLowerCase() === "yes";
                                            } else if (!smallQuestionsCache[questionAmbigous]) {
                                                await runQuestion(engine, character, {
                                                    type: "yes_no",
                                                    question: questionAmbigous,
                                                    onValue: async (answer) => {
                                                        smallQuestionsCache[questionAmbigous] = answer;
                                                    },
                                                }, {
                                                    lastCycleMessagesInfo,
                                                    interactedCharactersAccordingToItemChange,
                                                    questioningAgent,
                                                    initializeAgent,
                                                });
                                                answerAmbigousBool = smallQuestionsCache[questionAmbigous];
                                            }

                                            if (answerAmbigousBool) {
                                                // insist for a clear reply on it
                                                // will insist because too ambiguous
                                                await injectConsentQuestion(true);
                                            } else {
                                                const question = (typeof actionToChoose.consentMechanism.check === "string" ? actionToChoose.consentMechanism.check : await actionToChoose.consentMechanism.check(engine.deObject, {
                                                    char: character,
                                                    other: engine.deObject.characters[bond.towards],
                                                    otherFamilyRelation,
                                                    otherRelationship,
                                                })).trim();
                                                let answerBool = false;
                                                if (question.toLowerCase() === "yes" || question.toLowerCase() === "no") {
                                                    answerBool = question.toLowerCase() === "yes";
                                                } else if (!smallQuestionsCache[question]) {
                                                    await runQuestion(engine, character, {
                                                        type: "yes_no",
                                                        question: question,
                                                        onValue: async (answer) => {
                                                            smallQuestionsCache[question] = answer;
                                                        },
                                                    }, {
                                                        lastCycleMessagesInfo,
                                                        interactedCharactersAccordingToItemChange,
                                                        questioningAgent,
                                                        initializeAgent,
                                                    });
                                                    answerBool = smallQuestionsCache[question];
                                                }
                                                if (answerBool) {
                                                    // consent given
                                                    await injectBehaviour();
                                                } else {
                                                    // consent refused, let's see if we insist or not
                                                    if (Math.random() < actionToChoose.consentMechanism.insistance) {
                                                        // try to insist
                                                        await injectConsentQuestion(true);
                                                    } else if (Math.random() < actionToChoose.consentMechanism.rejection) {
                                                        // proceed anyway after receiving a no
                                                        await injectBehaviour(true);
                                                    }
                                                }
                                            }
                                        } else {
                                            await injectConsentQuestion(false);
                                        }
                                    } else {
                                        await injectBehaviour();
                                    }
                                } else {
                                    console.warn("No action to choose for " + character.name + " towards " + bond.towards + " for affection initiation, skipping");
                                }
                            }
                        }
                    }

                    const characterLibido = character.libido;
                    if (!characterLibido) {
                        continue;
                    }

                    const cooldownPeriodHours = (1 - characterLibido) * 48; // from 0 hours at libido 1 to 48 hours at libido 0
                    const cooldownPeriodMilliseconds = cooldownPeriodHours * 60 * 60 * 1000;

                    const intimateCooldownPeriodHours = (1 - characterLibido) * 1;
                    const intimateCooldownPeriodMilliseconds = intimateCooldownPeriodHours * 60 * 60 * 1000;

                    const timeSinceLastSex = engine.deObject.currentTime.time - (character.state["last_sexual_act_towards_" + bond.towards] || 0);
                    const timeSinceLastIntimateAffection = engine.deObject.currentTime.time - (character.state["last_intimate_affectionate_act_towards_" + bond.towards] || 0);

                    const sexCooldownActive = timeSinceLastSex < cooldownPeriodMilliseconds;
                    let sexCooldownRatio = sexCooldownActive && cooldownPeriodMilliseconds > 0 ? (timeSinceLastSex / cooldownPeriodMilliseconds) : 1;
                    if (sexCooldownRatio > 1) {
                        sexCooldownRatio = 1;
                    }

                    const intimateAffectionCooldownActive = timeSinceLastIntimateAffection < intimateCooldownPeriodMilliseconds;
                    let intimateAffectionCooldownRatio = intimateAffectionCooldownActive && intimateCooldownPeriodMilliseconds > 0 ? (timeSinceLastIntimateAffection / intimateCooldownPeriodMilliseconds) : 1;
                    if (intimateAffectionCooldownRatio > 1) {
                        intimateAffectionCooldownRatio = 1;
                    }

                    proneToInitiateSexProbability *= sexCooldownRatio;
                    if (sexCooldownActive && sexCooldownRatio > intimateAffectionCooldownRatio) {
                        proneToInitiateIntimateAffectionProbability *= sexCooldownRatio;
                    } else {
                        proneToInitiateIntimateAffectionProbability *= intimateAffectionCooldownRatio;
                    }

                    const lastIsWaitingForIntimateAffectionConsent = character.state["last_is_waiting_for_intimate_affection_consent_from_" + bond.towards];
                    const lastIsExecutingIntimateAffectionateAct = character.state["last_continous_intimate_affectionate_act_towards_" + bond.towards];
                    const referenceToUseIntimate = lastIsExecutingIntimateAffectionateAct || lastIsWaitingForIntimateAffectionConsent;
                    if (Math.random() < proneToInitiateIntimateAffectionProbability || referenceToUseIntimate) {
                        const realBondDeclaration = /** @type {DEBondDeclaration} */ (referenceToUseIntimate ?
                            getBondDeclarationFromName(engine.deObject, character, referenceToUseIntimate.decl) :
                            bondDeclaration);
                        if (!realBondDeclaration) {
                            console.warn("Could not find bond declaration for " + character.name + " towards " + bond.towards + " with name " + referenceToUseIntimate.decl + ", skipping intimate affectionate action");
                        } else {
                            const actionToChoose = referenceToUseIntimate ? (
                                realBondDeclaration.intimacy.proneToInitiatingIntimateAffection.actions[referenceToUseIntimate.actionIndex]
                            ) : weightedRandom(bondDeclaration.intimacy.proneToInitiatingIntimateAffection.actions, (i) => i.probability);
                            if (actionToChoose) {
                                const otherFamilyRelation = getFamilyBondRelation(character, engine.deObject.characters[bond.towards]);
                                const otherRelationship = await getRelationship(engine.deObject, character, engine.deObject.characters[bond.towards]);

                                /**
                                 * Proceeded despite the lack of consent
                                 * @param {boolean} proceedAnyway 
                                 */
                                const injectBehaviour = async (proceedAnyway = false) => {
                                    // @ts-ignore typescript is wrong, it is not null
                                    const behaviour = typeof actionToChoose.action === "string" ? actionToChoose.action : await actionToChoose.action(engine.deObject, {
                                        char: character,
                                        // @ts-ignore typescript is wrong, it is not null
                                        other: engine.deObject.characters[bond.towards],
                                        otherFamilyRelation,
                                        otherRelationship,
                                    });

                                    if (proceedAnyway) {
                                        microInjections.push("Even though " + character.name + " did not receive consent: " + behaviour);
                                    } else {
                                        microInjections.push(behaviour);
                                    }

                                    if (actionToChoose.vocabularyLimit) {
                                        microVocabularyLimits.push(actionToChoose.vocabularyLimit);
                                    }

                                    // @ts-ignore typescript is wrong, it is not null
                                    character.state["last_intimate_affectionate_act_towards_" + bond.towards] = engine.deObject.currentTime;

                                    if ((actionToChoose.fullfillCriteriaQuestions || []).length > 0) {
                                        character.state["last_continous_intimate_affectionate_act_towards_" + bond.towards] = {
                                            decl: realBondDeclaration.name,
                                            actionIndex: realBondDeclaration.intimacy.proneToInitiatingIntimateAffection.actions.indexOf(actionToChoose),
                                        };
                                    } else {
                                        delete character.state["last_continous_intimate_affectionate_act_towards_" + bond.towards];
                                    }

                                    delete character.state["last_is_waiting_for_intimate_affection_consent_response_from_" + bond.towards];
                                }

                                /**
                                 * @param {boolean} retry 
                                 */
                                const injectConsentQuestion = async (retry) => {
                                    if (actionToChoose.consentMechanism) {
                                        const actionToAskForConsent = typeof actionToChoose.consentMechanism.action === "string" ? actionToChoose.consentMechanism.action : await actionToChoose.consentMechanism.action(engine.getDEObject(), {
                                            char: character,
                                            // @ts-ignore typescript is wrong, it is not null
                                            other: engine.deObject.characters[bond.towards],
                                            otherFamilyRelation,
                                            otherRelationship,
                                        });
                                        if (retry) {
                                            microInjections.push(character.name + " will insist on the behaviour: " + actionToAskForConsent);
                                        } else {
                                            microInjections.push(actionToAskForConsent);
                                        }
                                        if (!lastIsExecutingIntimateAffectionateAct) {
                                            if (lastIsWaitingForIntimateAffectionConsent) {
                                                lastIsWaitingForIntimateAffectionConsent.tries++;
                                            } else {
                                                character.state["last_is_waiting_for_intimate_affection_consent_response_from_" + bond.towards] = {
                                                    decl: realBondDeclaration.name,
                                                    actionIndex: realBondDeclaration.intimacy.proneToInitiatingIntimateAffection.actions.indexOf(actionToChoose),
                                                    tries: 0,
                                                };
                                            }
                                        }
                                    } else {
                                        await injectBehaviour();
                                    }
                                }

                                if (lastIsExecutingIntimateAffectionateAct) {
                                    let isFullfilled = false;
                                    for (const question of (actionToChoose.fullfillCriteriaQuestions || [])) {
                                        const questionValue = (typeof question === "string" ? question : await question(engine.deObject, {
                                            char: character,
                                            other: engine.deObject.characters[bond.towards],
                                            otherFamilyRelation,
                                            otherRelationship,
                                        })).trim();
                                        await runQuestion(engine, character, {
                                            type: "yes_no",
                                            question: questionValue,
                                            onValue: async (answer) => {
                                                smallQuestionsCache[questionValue] = answer;
                                            },
                                        }, {
                                            lastCycleMessagesInfo,
                                            interactedCharactersAccordingToItemChange,
                                            questioningAgent,
                                            initializeAgent,
                                        });

                                        if (smallQuestionsCache[questionValue]) {
                                            isFullfilled = true;
                                            break;
                                        }
                                    }

                                    if (!isFullfilled) {
                                        await injectBehaviour();
                                    } else {
                                        delete character.state["last_continous_intimate_affectionate_act_towards_" + bond.towards];
                                        delete character.state["last_is_waiting_for_intimate_affection_consent_response_from_" + bond.towards];
                                    }
                                } else if (actionToChoose.consentMechanism) {
                                    if (lastIsWaitingForIntimateAffectionConsent) {
                                        const questionAmbigous = (typeof actionToChoose.consentMechanism.checkAmbiguousResponse === "string" ? actionToChoose.consentMechanism.checkAmbiguousResponse : await actionToChoose.consentMechanism.checkAmbiguousResponse(engine.deObject, {
                                            char: character,
                                            other: engine.deObject.characters[bond.towards],
                                            otherFamilyRelation,
                                            otherRelationship,
                                        })).trim();
                                        let answerAmbigousBool = false;
                                        if (questionAmbigous.toLowerCase() === "yes" || questionAmbigous.toLowerCase() === "no") {
                                            answerAmbigousBool = questionAmbigous.toLowerCase() === "yes";
                                        } else if (!smallQuestionsCache[questionAmbigous]) {
                                            await runQuestion(engine, character, {
                                                type: "yes_no",
                                                question: questionAmbigous,
                                                onValue: async (answer) => {
                                                    smallQuestionsCache[questionAmbigous] = answer;
                                                },
                                            }, {
                                                lastCycleMessagesInfo,
                                                interactedCharactersAccordingToItemChange,
                                                questioningAgent,
                                                initializeAgent,
                                            });
                                            answerAmbigousBool = smallQuestionsCache[questionAmbigous];
                                        }

                                        if (answerAmbigousBool) {
                                            // insist for a clear reply on it
                                            // will insist because too ambiguous
                                            await injectConsentQuestion(true);
                                        } else {
                                            const question = (typeof actionToChoose.consentMechanism.check === "string" ? actionToChoose.consentMechanism.check : await actionToChoose.consentMechanism.check(engine.deObject, {
                                                char: character,
                                                other: engine.deObject.characters[bond.towards],
                                                otherFamilyRelation,
                                                otherRelationship,
                                            })).trim();
                                            let answerBool = false;
                                            if (question.toLowerCase() === "yes" || question.toLowerCase() === "no") {
                                                answerBool = question.toLowerCase() === "yes";
                                            } else if (!smallQuestionsCache[question]) {
                                                await runQuestion(engine, character, {
                                                    type: "yes_no",
                                                    question: question,
                                                    onValue: async (answer) => {
                                                        smallQuestionsCache[question] = answer;
                                                    },
                                                }, {
                                                    lastCycleMessagesInfo,
                                                    interactedCharactersAccordingToItemChange,
                                                    questioningAgent,
                                                    initializeAgent,
                                                });
                                                answerBool = smallQuestionsCache[question];
                                            }
                                            if (answerBool) {
                                                // consent given
                                                await injectBehaviour();
                                            } else {
                                                // consent refused, let's see if we insist or not
                                                if (Math.random() < actionToChoose.consentMechanism.insistance) {
                                                    // try to insist
                                                    await injectConsentQuestion(true);
                                                } else if (Math.random() < actionToChoose.consentMechanism.rejection) {
                                                    // proceed anyway after receiving a no
                                                    await injectBehaviour(true);
                                                }
                                            }
                                        }
                                    } else {
                                        await injectConsentQuestion(false);
                                    }
                                } else {
                                    await injectBehaviour();
                                }
                            } else {
                                console.warn("No action to choose for " + character.name + " towards " + bond.towards + " for intimate affection initiation, skipping");
                            }
                        }
                    }

                    const lastIsWaitingForSexConsent = character.state["last_is_waiting_for_sex_consent_from_" + bond.towards];
                    const lastIsExecutingSexualAct = character.state["last_continous_sexual_act_towards_" + bond.towards];
                    const referenceToUseSex = lastIsExecutingSexualAct || lastIsWaitingForSexConsent;
                    if (Math.random() < proneToInitiateSexProbability || referenceToUseSex) {
                        const realBondDeclaration = /** @type {DEBondDeclaration} */ (referenceToUseSex ?
                            getBondDeclarationFromName(engine.deObject, character, referenceToUseSex.decl) :
                            bondDeclaration);
                        if (!realBondDeclaration) {
                            console.warn("Could not find bond declaration for " + character.name + " towards " + bond.towards + " with name " + referenceToUseSex.decl + ", skipping sexual action");
                        } else {
                            const actionToChoose = referenceToUseSex ? (
                                realBondDeclaration.intimacy.proneToInitiatingSex.actions[referenceToUseSex.actionIndex]
                            ) : weightedRandom(bondDeclaration.intimacy.proneToInitiatingSex.actions, (i) => i.probability);
                            if (actionToChoose) {
                                const otherFamilyRelation = getFamilyBondRelation(character, engine.deObject.characters[bond.towards]);
                                const otherRelationship = await getRelationship(engine.deObject, character, engine.deObject.characters[bond.towards]);

                                /**
                                 * Proceeded despite the lack of consent
                                 * @param {boolean} proceedAnyway 
                                 */
                                const injectBehaviour = async (proceedAnyway = false) => {
                                    // @ts-ignore typescript is wrong, it is not null
                                    const behaviour = typeof actionToChoose.action === "string" ? actionToChoose.action : await actionToChoose.action(engine.deObject, {
                                        char: character,
                                        // @ts-ignore typescript is wrong, it is not null
                                        other: engine.deObject.characters[bond.towards],
                                        otherFamilyRelation,
                                        otherRelationship,
                                    });

                                    if (proceedAnyway) {
                                        microInjections.push("Even though " + character.name + " did not receive consent: " + behaviour);
                                    } else {
                                        microInjections.push(behaviour);
                                    }

                                    if (actionToChoose.vocabularyLimit) {
                                        microVocabularyLimits.push(actionToChoose.vocabularyLimit);
                                    }

                                    // @ts-ignore typescript is wrong, it is not null
                                    character.state["last_sexual_act_towards_" + bond.towards] = engine.deObject.currentTime;

                                    if ((actionToChoose.fullfillCriteriaQuestions || []).length > 0) {
                                        character.state["last_continous_sexual_act_towards_" + bond.towards] = {
                                            decl: realBondDeclaration.name,
                                            actionIndex: realBondDeclaration.intimacy.proneToInitiatingSex.actions.indexOf(actionToChoose),
                                        };
                                    } else {
                                        delete character.state["last_continous_sexual_act_towards_" + bond.towards];
                                    }

                                    delete character.state["last_is_waiting_for_sex_consent_response_from_" + bond.towards];
                                }

                                /**
                                 * @param {boolean} retry 
                                 */
                                const injectConsentQuestion = async (retry) => {
                                    if (actionToChoose.consentMechanism) {
                                        const actionToAskForConsent = typeof actionToChoose.consentMechanism.action === "string" ? actionToChoose.consentMechanism.action : await actionToChoose.consentMechanism.action(engine.getDEObject(), {
                                            char: character,
                                            // @ts-ignore typescript is wrong, it is not null
                                            other: engine.deObject.characters[bond.towards],
                                            otherFamilyRelation,
                                            otherRelationship,
                                        });
                                        if (retry) {
                                            microInjections.push(character.name + " will insist on the behaviour: " + actionToAskForConsent);
                                        } else {
                                            microInjections.push(actionToAskForConsent);
                                        }
                                        if (!lastIsExecutingSexualAct) {
                                            if (lastIsWaitingForSexConsent) {
                                                lastIsWaitingForSexConsent.tries++;
                                            } else {
                                                character.state["last_is_waiting_for_sex_consent_response_from_" + bond.towards] = {
                                                    decl: realBondDeclaration.name,
                                                    actionIndex: realBondDeclaration.intimacy.proneToInitiatingSex.actions.indexOf(actionToChoose),
                                                    tries: 0,
                                                };
                                            }
                                        }
                                    } else {
                                        await injectBehaviour();
                                    }
                                }

                                if (lastIsExecutingSexualAct) {
                                    let isFullfilled = false;
                                    for (const question of (actionToChoose.fullfillCriteriaQuestions || [])) {
                                        const questionValue = (typeof question === "string" ? question : await question(engine.deObject, {
                                            char: character,
                                            other: engine.deObject.characters[bond.towards],
                                            otherFamilyRelation,
                                            otherRelationship,
                                        })).trim();
                                        await runQuestion(engine, character, {
                                            type: "yes_no",
                                            question: questionValue,
                                            onValue: async (answer) => {
                                                smallQuestionsCache[questionValue] = answer;
                                            },
                                        }, {
                                            lastCycleMessagesInfo,
                                            interactedCharactersAccordingToItemChange,
                                            questioningAgent,
                                            initializeAgent,
                                        });

                                        if (smallQuestionsCache[questionValue]) {
                                            isFullfilled = true;
                                            break;
                                        }
                                    }

                                    if (!isFullfilled) {
                                        await injectBehaviour();
                                    } else {
                                        delete character.state["last_continous_sexual_act_towards_" + bond.towards];
                                        delete character.state["last_is_waiting_for_sex_consent_response_from_" + bond.towards];
                                    }
                                } else if (actionToChoose.consentMechanism) {
                                    if (lastIsWaitingForSexConsent) {
                                        const questionAmbigous = (typeof actionToChoose.consentMechanism.checkAmbiguousResponse === "string" ? actionToChoose.consentMechanism.checkAmbiguousResponse : await actionToChoose.consentMechanism.checkAmbiguousResponse(engine.deObject, {
                                            char: character,
                                            other: engine.deObject.characters[bond.towards],
                                            otherFamilyRelation,
                                            otherRelationship,
                                        })).trim();
                                        let answerAmbigousBool = false;
                                        if (questionAmbigous.toLowerCase() === "yes" || questionAmbigous.toLowerCase() === "no") {
                                            answerAmbigousBool = questionAmbigous.toLowerCase() === "yes";
                                        } else if (!smallQuestionsCache[questionAmbigous]) {
                                            await runQuestion(engine, character, {
                                                type: "yes_no",
                                                question: questionAmbigous,
                                                onValue: async (answer) => {
                                                    smallQuestionsCache[questionAmbigous] = answer;
                                                },
                                            }, {
                                                lastCycleMessagesInfo,
                                                interactedCharactersAccordingToItemChange,
                                                questioningAgent,
                                                initializeAgent,
                                            });
                                            answerAmbigousBool = smallQuestionsCache[questionAmbigous];
                                        }

                                        if (answerAmbigousBool) {
                                            // insist for a clear reply on it
                                            // will insist because too ambiguous
                                            await injectConsentQuestion(true);
                                        } else {
                                            const question = (typeof actionToChoose.consentMechanism.check === "string" ? actionToChoose.consentMechanism.check : await actionToChoose.consentMechanism.check(engine.deObject, {
                                                char: character,
                                                other: engine.deObject.characters[bond.towards],
                                                otherFamilyRelation,
                                                otherRelationship,
                                            })).trim();
                                            let answerBool = false;
                                            if (question.toLowerCase() === "yes" || question.toLowerCase() === "no") {
                                                answerBool = question.toLowerCase() === "yes";
                                            } else if (!smallQuestionsCache[question]) {
                                                await runQuestion(engine, character, {
                                                    type: "yes_no",
                                                    question: question,
                                                    onValue: async (answer) => {
                                                        smallQuestionsCache[question] = answer;
                                                    },
                                                }, {
                                                    lastCycleMessagesInfo,
                                                    interactedCharactersAccordingToItemChange,
                                                    questioningAgent,
                                                    initializeAgent,
                                                });
                                                answerBool = smallQuestionsCache[question];
                                            }
                                            if (answerBool) {
                                                // consent given
                                                await injectBehaviour();
                                            } else {
                                                // consent refused, let's see if we insist or not
                                                if (Math.random() < actionToChoose.consentMechanism.insistance) {
                                                    // try to insist
                                                    await injectConsentQuestion(true);
                                                } else if (Math.random() < actionToChoose.consentMechanism.rejection) {
                                                    // proceed anyway after receiving a no
                                                    await injectBehaviour(true);
                                                }
                                            }
                                        }
                                    } else {
                                        await injectConsentQuestion(false);
                                    }
                                } else {
                                    await injectBehaviour();
                                }
                            } else {
                                console.warn("No action to choose for " + character.name + " towards " + bond.towards + " for sex initiation, skipping");
                            }
                        }
                    }
                } else {
                    delete character.state["last_is_waiting_for_affection_consent_response_from_" + bond.towards];
                }
            }
        }
    }


    if (initialized) {
        await questioningAgent.next(null);
        await questioningAgent.return();
    }

    await deleteTemp(engine);

    return {
        microInjections,
        microVocabularyLimits,
    };
}

/**
 * 
 * @param {DEngine} engine 
 */
export async function deleteTemp(engine) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }

    engine.deObject.world.temp = {};

    for (const locationName in engine.deObject.world.locations) {
        const location = engine.deObject.world.locations[locationName];
        location.temp = {};

        for (const slotName in location.slots) {
            const slot = location.slots[slotName];
            slot.temp = {};
        }
    }

    for (const connectionName in engine.deObject.world.connections) {
        const connection = engine.deObject.world.connections[connectionName];
        connection.temp = {};
    }

    for (const characterName in engine.deObject.characters) {
        const character = engine.deObject.characters[characterName];
        character.temp = {};
    }
}

