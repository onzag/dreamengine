import { DEngine } from "../index.js";
import { getFamilyBondRelation, getRelationship, getSurroundingCharacters } from "../util/character-info.js";
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
 * @param {{
 *    lastCycleMessagesInfo?: Awaited<ReturnType<typeof getHistoryFragmentForCharacter>>,
 *    interactedCharactersAccordingToItemChange: string[],
 *    questioningAgent: ReturnType<NonNullable<DEngine["inferenceAdapter"]>["runQuestioningCustomAgentOn"]>,
 *    initializeAgent: () => Promise<void>,
 * }} options
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


    if (initialized) {
        await questioningAgent.next(null);
        await questioningAgent.return();
    }

    await deleteTemp(engine);

    return microInjections;
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

