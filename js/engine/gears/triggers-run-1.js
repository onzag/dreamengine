// Question dispatch and potential state causants.
/** @typedef {import("../index.js").DEngine} DEngine */
/** @typedef {DECharacterYesNoQuestion | DECharacterTextQuestion | DECharacterNumericQuestion} Question */
/**
 * @template {DEAskPerTypeCharacters | "object_causants_of_state" | undefined} TContext
 * @typedef {DEChainedQuestion<Extract<Question, TContext extends undefined ? {askPer?: undefined} : {askPer: TContext}>>} ContextQuestion
 */
/** @typedef {{type: "character", id: string, name: string} | DEStateCauseCausantObject | null} QuestionTarget */
import { getFamilyBondRelation, getRelationship } from "../util/character-info.js";
import { isYes, numberGrammar, yesNoGrammar } from "../util/grammar.js";
import { getHistoryFragment } from "../util/messages.js";

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
 * @param {DECharacterYesNoQuestion | DECharacterTextQuestion | DECharacterNumericQuestion | DEChainedQuestion<DECharacterYesNoQuestion | DECharacterTextQuestion | DECharacterNumericQuestion>} question
 * @param {{
 *    lastCycleMessagesInfo?: Awaited<ReturnType<typeof getHistoryFragment>>,
 *    questioningAgent: ReturnType<NonNullable<DEngine["inferenceAdapter"]>["runQuestioningCustomAgentOn"]>,
 *    initializeAgent: () => Promise<void>,
 *    othersOverride?: [QuestionTarget],
 * }} options
 * @returns {Promise<boolean | number | string | undefined>} The answer for a chain; undefined for top-level or skipped questions.
 */
export async function runQuestion(engine, character, question, options) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    } else if (!engine.inferenceAdapter) {
        throw new Error("Inference adapter not initialized");
    } else if (!character.bonds) {
        throw new Error(`Character ${character.id} has no bonds defined.`);
    }
    const deObject = engine.getDEObject();

    // TODO implement apologizable state with causants, and inject something like, x did not accept the apology or if they did
    // narrative effect or somethin

    // first we need to update the bonds towards the character, for that we need to get a whole extended cycle
    // gather all the other characters that talked inbetween, and update bonds for each
    const lastCycleMessagesInfo = options.lastCycleMessagesInfo || await getHistoryFragment(engine, character, {
        msgLimit: "ALL_UNPROCESSED_MESSAGES_UNTIL_FIRST_PROCESSED_MESSAGE",
        includeDebugMessages: false,
        includeRejectedMessages: false,
        perspective: "character",
    });

    const yesNoGrammarObject = yesNoGrammar(engine);
    const numberGrammarObject = numberGrammar(engine);

    /**
     * @type {QuestionTarget[]}
     */
    let others = [null];
    if (options.othersOverride !== undefined) {
        // A chain keeps exactly the current target, including an explicit null target.
        others = options.othersOverride;
    } else if (question.askPer) {
        if (question.askPer === "conversing_or_mentioned_character") {
            // mentioned characters in last cycle info actually includes mentioned in the narration line
            // so it will include them all
            const conversingCharactersRelevant = lastCycleMessagesInfo.mentionedCharacters.filter(c => c !== character.id);
            if (conversingCharactersRelevant.length === 0) {
                return; // skip this question if there are no conversing characters
            }
            others = conversingCharactersRelevant.map(c => ({ type: "character", id: c, name: deObject.characters[c]?.name || c }));
        } else if (question.askPer === "conversing_character") {
            const conversingCharactersRelevant = lastCycleMessagesInfo.conversingCharacters.filter(c => c !== character.id);
            if (conversingCharactersRelevant.length === 0) {
                return; // skip this question if there are no conversing characters
            }
            others = conversingCharactersRelevant.map(c => ({ type: "character", id: c, name: deObject.characters[c]?.name || c }));
        } else if (question.askPer === "conversing_family_members") {
            const conversingCharactersRelevant = lastCycleMessagesInfo.conversingCharacters.filter(c => c !== character.id);
            if (conversingCharactersRelevant.length === 0) {
                return; // skip this question if there are no conversing characters
            }
            const familyMembers = conversingCharactersRelevant.filter(c => {
                const otherCharacter = deObject.characters[c];
                if (!otherCharacter) return false;
                const relation = getFamilyBondRelation(character, otherCharacter);
                return relation !== null;
            });
            if (familyMembers.length === 0) {
                return; // skip this question if there are no family members
            }
            others = familyMembers.map(c => ({ type: "character", id: c, name: deObject.characters[c]?.name || c }));
        } else if (question.askPer === "potential_character_causants_of_state") {
            const stateInQuestion = question.askPerState;
            if (!stateInQuestion) {
                console.warn(`Question has askPer set to potential_character_causants_of_state but no askPerState specified, skipping`);
                return;
            }

            const stateDef = deObject.characters[character.id].stateDefinitions[stateInQuestion];
            if (!stateDef) {
                console.warn(`Question has askPerState set to ${stateInQuestion} but character has no state with that name, skipping`);
                return;
            }

            /**
             * @type {DECompleteCharacterReference[]}
             */
            const allCharactersInAnalysis = [...new Set(lastCycleMessagesInfo.mentionedCharacters)]
                .map(c => deObject.characters[c]).filter(c => !!c);

            others = determinePotentialCharacterCausants(engine, character, stateDef, allCharactersInAnalysis).map(c => ({ type: "character", id: c.id, name: c.name }));
        } else if (question.askPer === "character_causants_of_state") {
            const stateForCharacter = deObject.stateFor[character.id];

            const appliedState = stateForCharacter.states.find(s => s.state === question.askPerState);

            if (!appliedState) {
                console.warn(`Question has askPer set to ${question.askPer} and askPerState set to ${question.askPerState} but character has no such state applied, skipping`);
                return;
            }

            if (!appliedState.causes || appliedState.causes.length === 0) {
                console.warn(`Question has askPer set to ${question.askPer} and askPerState set to ${question.askPerState} but the state has no causants, skipping`);
                return;
            }

            others = appliedState.causes.flatMap(({ causant }) => causant?.type === "character" ? [{
                type: "character",
                id: causant.id,
                name: deObject.characters[causant.id]?.name || causant.id,
            }] : []);
        } else if (question.askPer === "object_causants_of_state") {
            const stateForCharacter = deObject.stateFor[character.id];

            const appliedState = stateForCharacter.states.find(s => s.state === question.askPerState);
            if (!appliedState) {
                console.warn(`Question has askPer set to ${question.askPer} and askPerState set to ${question.askPerState} but character has no such state applied, skipping`);
                return;
            }
            if (!appliedState.causes || appliedState.causes.length === 0) {
                console.warn(`Question has askPer set to ${question.askPer} and askPerState set to ${question.askPerState} but the state has no causants, skipping`);
                return;
            }

            others = appliedState.causes.flatMap(({ causant }) => causant?.type === "object" ? [{
                type: "object", id: causant.id, name: causant.name,
            }] : []);
        } else {
            console.warn(`Unknown askPer value ${question.askPer} for question, skipping`);
            return;
        }
    }

    const uniqueOthers = [...new Map(others.map(other => [other ? `${other.type}:${other.id}` : null, other])).values()];
    for (const other of uniqueOthers) {
        const otherCharacter = other?.type === "character" ? deObject.characters[other.id] : null;
        const otherObject = other?.type === "object" ? other : null;
        if (other?.type === "character" && !otherCharacter) {
            console.warn(`Question target character ${other.id} not found in DE object, skipping`);
            continue;
        }
        const otherFamilyRelationship = otherCharacter ? getFamilyBondRelation(character, otherCharacter) : null;
        const relationship = otherCharacter ? await getRelationship(deObject, character, otherCharacter) : null;

        /** @param {DEChainedQuestion<DECharacterYesNoQuestion | DECharacterTextQuestion | DECharacterNumericQuestion>} trigger */
        const chain = (trigger) => runQuestion(engine, character, trigger, {
            ...options,
            lastCycleMessagesInfo,
            othersOverride: [other],
        });

        // Target selection supplies the context that chained questions omit from askPer.
        // Narrow at this boundary so templates and callbacks keep their own signatures.
        const objectQuestion = /** @type {ContextQuestion<"object_causants_of_state">} */ (question);
        const characterQuestion = /** @type {ContextQuestion<DEAskPerTypeCharacters>} */ (question);
        const selfQuestion = /** @type {ContextQuestion<undefined>} */ (question);
        const objectChain = /** @type {DEQuestionChain<"object_causants_of_state">} */ (chain);
        const characterChain = /** @type {DEQuestionChain<DEAskPerTypeCharacters>} */ (chain);
        const selfChain = /** @type {DEQuestionChain} */ (chain);

        
        let shouldRun = true;
        if (shouldRun && !question.runAfterDeath && engine.deObject.stateFor[character.id]?.dead) {
            shouldRun = false;
            console.warn(`Question has runAfterDeath set to false and character ${character.name} is dead, skipping`);
        }
        if (question.runIf && shouldRun) {
            shouldRun = false;
            if (otherObject) {
                shouldRun = !!(await objectQuestion.runIf?.(character, otherObject));
            } else if (otherCharacter) {
                shouldRun = !!(await characterQuestion.runIf?.(character, otherCharacter, otherFamilyRelationship));
            } else {
                shouldRun = !!(await selfQuestion.runIf?.(character));
            }
            if (!shouldRun) {
                console.warn(`Question has runIf condition that returned false for character ${character.name} and other ${other?.id ?? null}, skipping`);
            }
        }

        if (!shouldRun) {
            continue;
        }

        await options.initializeAgent();

        let questionText;
        if (typeof question.question === "string") {
            questionText = question.question;
        } else if (otherObject) {
            questionText = await (/** @type {Exclude<DEStringTemplateCharAndItem, string>} */ (objectQuestion.question))({ char: character, item: `<${otherObject.id}:${otherObject.name}>` });
        } else if (otherCharacter) {
            questionText = await (/** @type {Exclude<DEStringTemplateCharAndOther, string>} */ (characterQuestion.question))({
                char: character,
                other: otherCharacter,
                otherFamilyRelation: otherFamilyRelationship,
                otherRelationship: relationship,
            });
        } else {
            questionText = await (/** @type {Exclude<DEStringTemplateCharOnly, string>} */ (selfQuestion.question))({ char: character });
        }

        /** @type {boolean | number | string | undefined} */
        let output;
        if (question.type === "yes_no") {
            const answer = await options.questioningAgent.next({
                maxCharacters: 0,
                maxSafetyCharacters: 10,
                maxParagraphs: 1,
                nextQuestion: questionText,
                stopAfter: yesNoGrammarObject.stopAfter,
                stopAt: [],
                grammar: yesNoGrammarObject.grammar,
                instructions: "Answer with 'yes' or 'no', think shortly and in one sentence only, do not overthink",
                newSession: true,
                thinkingEffort: "low",
            });

            if (answer.done) {
                throw new Error("Questioning agent finished unexpectedly while asking yes/no question");
            }

            const answerText = answer.value.text.trim().toLowerCase();
            const isYesAnswer = isYes(answerText);
            output = isYesAnswer;

            if (otherObject) {
                await (/** @type {Extract<ContextQuestion<"object_causants_of_state">, {type: "yes_no"}>} */ (objectQuestion)).onValue?.(isYesAnswer, character, otherObject.name, objectChain);
            } else if (otherCharacter) {
                await (/** @type {Extract<ContextQuestion<DEAskPerTypeCharacters>, {type: "yes_no"}>} */ (characterQuestion)).onValue?.(isYesAnswer, character, otherCharacter, otherFamilyRelationship, relationship, characterChain);
            } else {
                await (/** @type {Extract<ContextQuestion<undefined>, {type: "yes_no"}>} */ (selfQuestion)).onValue?.(isYesAnswer, character, selfChain);
            }
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

            const answerText = answer.value.text.trim();
            output = answerText;

            if (otherObject) {
                await (/** @type {Extract<ContextQuestion<"object_causants_of_state">, {type: "text"}>} */ (objectQuestion)).onText?.(answerText, character, otherObject.name, objectChain);
            } else if (otherCharacter) {
                await (/** @type {Extract<ContextQuestion<DEAskPerTypeCharacters>, {type: "text"}>} */ (characterQuestion)).onText?.(answerText, character, otherCharacter, otherFamilyRelationship, relationship, characterChain);
            } else {
                await (/** @type {Extract<ContextQuestion<undefined>, {type: "text"}>} */ (selfQuestion)).onText?.(answerText, character, selfChain);
            }
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

            const answerText = answer.value.text.trim();

            const parsedNumber = parseFloat(answerText);

            if (isNaN(parsedNumber)) {
                console.warn(`Received answer that is not a valid number for numeric question: ${answerText}, skipping onValue callback`);
                continue;
            }
            output = parsedNumber;

            if (otherObject) {
                await (/** @type {Extract<ContextQuestion<"object_causants_of_state">, {type: "numeric"}>} */ (objectQuestion)).onNumber?.(parsedNumber, character, otherObject.name, objectChain);
            } else if (otherCharacter) {
                await (/** @type {Extract<ContextQuestion<DEAskPerTypeCharacters>, {type: "numeric"}>} */ (characterQuestion)).onNumber?.(parsedNumber, character, otherCharacter, otherFamilyRelationship, relationship, characterChain);
            } else {
                await (/** @type {Extract<ContextQuestion<undefined>, {type: "numeric"}>} */ (selfQuestion)).onNumber?.(parsedNumber, character, selfChain);
            }
        }
        // Only a chain has one target and an answer to return to its caller.
        if (options.othersOverride !== undefined) {
            return output;
        }
    }
}
