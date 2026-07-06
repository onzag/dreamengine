import { DEngine } from '../engine/index.js';
import { getSection, hasSpecialComment, toTemplateLiteral, unshiftSpecialComment } from './base.js';

if (typeof process !== "undefined" && process.versions && process.versions.node) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

/**
 * @param {DEngine} engine
 * @param {import('./base.js').ScriptTypeGenerator} scriptgenerator
 * @param {import('./base.js').ScriptTypeGuider} guider
 * @return {Promise<void>}
 */
export async function generateActivities(engine, scriptgenerator, guider) {
    const inferenceAdapter = engine.inferenceAdapter;
    if (!inferenceAdapter) {
        throw new Error("No inference adapter found on engine");
    }

    const initializeSection = getSection(scriptgenerator.body, "initialize");

    if (initializeSection === null) {
        throw new Error("Initialize section not found");
    }

    const allLikesAndDislikes = [...scriptgenerator.state["likes-list"], ...scriptgenerator.state["dislikes-list"]];

    const systemPrompt2 = inferenceAdapter.buildSystemPromptForQuestioningAgent(
        `You are a helpful assistant for creating and determining activities and topics of conversation for characters in an interactive story`,
        [],
        null,
    );

    const generator2 = inferenceAdapter.runQuestioningCustomAgentOn("cardtype-gen-activities", {
        contextInfoAfter: null,
        contextInfoBefore: null,
        messages: [],
        system: systemPrompt2,
    });


    // prime the generator
    let primed = false;
    const prime = async () => {
        if (primed) return;
        primed = true;
        const ready = await generator2.next();
        if (ready.done) {
            throw new Error("Generator finished without producing output");
        }
    }

    for (const likeOrDislike of allLikesAndDislikes) {
        const isAnActivity = await guider.askBoolean(
            "like-or-dislike-is-activity-" + likeOrDislike,
            "Is " + likeOrDislike + " an activity or hobby that anyone can engage in?",
            async () => {
                await prime();
                const isAnActivity = await generator2.next({
                    maxCharacters: 5,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "Is " + likeOrDislike + " an activity or hobby that anyone can engage in? Answer with yes or no.",
                    stopAfter: [],
                    stopAt: [],
                    grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`,
                    instructions: "This refers to the " + likeOrDislike + " itself, we are trying to determine if it is an activity or a topic of conversation. For example if the like or dislike is swimming, then the answer would be yes because swimming is an activity that anyone can engage in, but if the like or dislike is politics then the answer would be no because politics is a topic of conversation not an activity that you can engage in",
                });

                if (isAnActivity.done) {
                    throw new Error("Generator finished without producing output");
                }

                return isAnActivity.value.trim().toLowerCase() === "yes";
            }
        );

        const guideResult = await guider.askOpen(
            "activity-execution-template-for-" + likeOrDislike,
            "Provide a template for the activity '" + likeOrDislike + "' that will be shown to the player. Use {{chars}} as a placeholder for the characters that are engaging in the activity or talking about the topic of conversation.",
            async () => {
                await prime();
                const activitySimple = isAnActivity ? likeOrDislike : "talk about " + likeOrDislike;

                const activityTemplate = await generator2.next({
                    maxCharacters: 100,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "Provide a simple one sentence template where MANY_CHARACTERS (use MANY_CHARACTERS as placeholder for their names) engage in " + activitySimple,
                    stopAfter: [],
                    stopAt: [],
                    instructions: "The template should be a simple one sentence description of the activity or topic of conversation that the characters can engage in. For example if the like or dislike is swimming then a good template would be `MANY_CHARACTERS go swimming together` but if the like or dislike is politics then a good template would be `MANY_CHARACTERS talk about politics together`. The template should use the placeholder MANY_CHARACTERS to refer to the characters that are engaging in the activity or talking about the topic of conversation.",
                });

                if (activityTemplate.done) {
                    throw new Error("Generator finished without producing output");
                }

                return activityTemplate.value.trim().split("MANY_CHARACTERS").join("{{chars}}");
            },
        );
        
        const templateValue = guideResult.value.trim();

        const activitySimple = isAnActivity ? likeOrDislike : "talk about " + likeOrDislike;

        initializeSection.body.unshift(`DE.utils.newGlobalInterest({ id: ${JSON.stringify(likeOrDislike)}, simple: ${JSON.stringify(activitySimple)}, template: (DE, info) => ${toTemplateLiteral(templateValue, scriptgenerator.state.name)}});`);
    }

    if (primed) {
        await generator2.next(null); // end the generator
    }
}