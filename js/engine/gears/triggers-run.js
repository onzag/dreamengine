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
        if (question.askPer === "present_character") {
            const surroundingCharacters = getSurroundingCharacters(engine, character.name);
            const allCharacters = [...surroundingCharacters.nonStrangers, ...surroundingCharacters.totalStrangers];
            if (allCharacters.length === 0) {
                return; // skip this question if there are no surrounding characters
            }
            others = allCharacters;
        } else if (question.askPer === "present_family_members") {
            const surroundingCharacters = getSurroundingCharacters(engine, character.name);
            const familyMembers = surroundingCharacters.nonStrangers.filter(c => {
                const relation = getFamilyBondRelation(character, engine.getDEObject().characters[c]);
                return relation !== null;
            });
            if (familyMembers.length === 0) {
                return; // skip this question if there are no family members
            }
            others = familyMembers;
        } else if (question.askPer === "potential_character_causants_of_state") {
            const stateInQuestion = question.askPerState;
            if (!stateInQuestion) {
                console.warn(`Question has askPer set to potential_character_causants_of_state but no askPerState specified, skipping`);
                return;
            }

            const stateDef = engine.deObject.characters[character.name].states[stateInQuestion];
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
        } else if (question.askPer === "character_causants_of_state" || question.askPer === "object_causants_of_state" || question.askPer === "any_causants_of_state") {
            const stateForCharacter = engine.deObject.stateFor[character.name];

            const appliedState = stateForCharacter.states.find(s => s.state === question.askPerState);

            if (!appliedState) {
                console.warn(`Question has askPer set to ${question.askPer} and askPerState set to ${question.askPerState} but character has no such state applied, skipping`);
                return;
            }

            if (!appliedState.causants || appliedState.causants.length === 0) {
                console.warn(`Question has askPer set to ${question.askPer} and askPerState set to ${question.askPerState} but the state has no causants, skipping`);
                return;
            }

            if (question.askPer === "character_causants_of_state") {
                others = appliedState.causants.filter(c => c.type === "character").map(c => c.name);
            } else if (question.askPer === "object_causants_of_state") {
                others = appliedState.causants.filter(c => c.type === "object").map(c => c.name);
            } else {
                others = appliedState.causants.map(c => c.name);
            }
        } else {
            console.warn(`Unknown askPer value ${question.askPer} for question, skipping`);
            return;
        }
    }

    for (const other of others) {
        const otherFamilyRelationship = other ? getFamilyBondRelation(character, engine.deObject.characters[other]) : null;
        const relationship = other ? await getRelationship(engine, character, engine.deObject.characters[other]) : null;

        if (question.runIf) {
            const shouldRun = await question.runIf(character, other ? engine.deObject.characters[other] : null, otherFamilyRelationship);
            if (!shouldRun) {
                console.warn(`Question has runIf condition that returned false for character ${character.name} and other ${other}, skipping`);
                continue;
            }
        }

        await options.initializeAgent();

        const questionText = typeof question.question === "function" ? await question.question(engine.deObject, {
            char: character,
            other: other ? engine.deObject.characters[other] : undefined,
            otherFamilyRelation: otherFamilyRelationship || undefined,
            otherRelationship: relationship || undefined,
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

    if (initialized) {
        await questioningAgent.next(null);
        await questioningAgent.return();
    }

    return;
}