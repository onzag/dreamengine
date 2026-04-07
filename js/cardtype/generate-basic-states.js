import { DEngine } from "../engine/index.js";
import { createCardStructureFrom, getJsCard } from "./base.js";
import { replaceAllCharNameWithPlaceholder } from "./generate-base.js";

export const BASIC_EMOTIONAL_STATES = [
    "Angry",
    "Annoyed",
    "Anxious",
    "Ashamed",
    "Aroused",
    "Disgusted",
    "Sad",
    "Scared",
    "Shy",
    "Happy",
    "Affectionate",
    "Grateful",
    "Proud",
    "Amused",
    "Curious",
    "Jealous",
    "Flirty",
    "Loving",
];

/**
 * @type {Record<string, DEEmotionNames>}
 */
const basicEmotionalStateToPrimaryEmotion = {
    "Angry": "angry",
    "Annoyed": "annoyed",
    "Anxious": "anxious",
    "Ashamed": "ashamed",
    "Aroused": "aroused",
    "Disgusted": "disgusted",
    "Sad": "sad",
    "Scared": "fearful",
    "Shy": "shy",
    "Happy": "happy",
    "Affectionate": "affectionate",
    "Grateful": "content",
    "Proud": "proud",
    "Amused": "amused",
    "Curious": "contemplative",
    "Jealous": "annoyed",
    "Flirty": "flirty",
    "Loving": "loving",
};

export const EMOTIONAL_STATES_WITH_EXPLICIT_ACTIONS = [
    "Aroused",
    "Flirty",
];

/**
 * 
 * @param {string} text
 * @param {string} charName
 * @returns 
 */
function replaceOtherCharNameWithPlaceholder(text, charName) {
    return replaceAllCharNameWithPlaceholder(text.replace(/OTHER_CHARACTER|OTHER CHARACTER|[Oo]ther character/g, "{{other}}"), charName);
}

/**
 * @param {DEngine} engine
 * @param {import('./base.js').CardTypeCard} card
 * @param {import('./base.js').CardTypeGuider | null} guider
 * @param {import('./base.js').CardTypeAutoSave | null} autosave
 * @return {Promise<void>}
 */
export async function generateBasicStates(engine, card, guider, autosave) {
    const isAsexualValue = card.config.isAsexual;
    const name = card.config.name;

    let EMOTIONAL_STATES_TO_CHECK_AGAINST = [...BASIC_EMOTIONAL_STATES]
    if (isAsexualValue) {
        EMOTIONAL_STATES_TO_CHECK_AGAINST = EMOTIONAL_STATES_TO_CHECK_AGAINST.filter(state => !["Flirty", "Loving", "Aroused"].includes(state));
    }

    const inferenceAdapter = engine.inferenceAdapter;
    if (!inferenceAdapter) {
        throw new Error("No inference adapter found on engine");
    }

    const systemPrompt = inferenceAdapter.buildSystemPromptForQuestioningAgent(
        `You are a helpful assistant that will answer and assist in defining a character for a game based on their description, you are allowed free rein to interpret the character's description and generate the code that defines them in the game, you will be asked questions about the character and you should answer them as best as you can`,
        [],
        `# Character Card:\n\n${card.card}`
    );

    const generator = inferenceAdapter.runQuestioningCustomAgentOn("cardtype-gen", {
        contextInfoAfter: null,
        contextInfoBefore: null,
        messages: [],
        system: systemPrompt,
    });

    // prime the generator
    let primed = false;
    const prime = async () => {
        if (primed) return;
        primed = true;
        const ready = await generator.next();
        if (ready.done) {
            throw new Error("Generator finished without producing output");
        }
    }

    const modifiers = ["", "Very "];

    for (const emotionalState of EMOTIONAL_STATES_TO_CHECK_AGAINST) {

        const variableNameBase = emotionalState + "Description";

        let extraGuidanceInstructions = "";
        let extraGuidanceInstructionsSource = "";

        let extraGuidanceActionInstructions = "";
        let extraGuidanceActionInstructionsSource = "";

        for (const modifier of modifiers) {
            console.log("Generating emotional state:", emotionalState);
            let extraInstructions = "";
            let extraActionInstructions = "";

            if (modifier === "Very ") {
                extraInstructions = "Be sure to make the intensity of the emotional state very high, more so than a normal " + emotionalState + ". ";
                extraActionInstructions = "The actions should reflect a very high intensity of the emotional state, more so than a normal " + emotionalState + ". ";
            }

            let variableName = variableNameBase;
            if (modifier === "Very ") {
                variableName += "Very";
            }

            let approved = true;
            while (true) {
                if (guider) {
                    const guiderResult = await guider.askOpen("Guidance for generating a description for how " + name + " acts/behaves when they are " + modifier + emotionalState + ". What are some important things to keep in mind when writing about that in the context of " + name + "'s character and personality?", extraGuidanceInstructionsSource);
                    if (guiderResult) {
                        extraGuidanceInstructions = "\n\nIMPORTANT Guidance for constructing the description: " + guiderResult.value.trim() + ".";
                        extraGuidanceInstructionsSource = guiderResult.value.trim();
                    }
                }

                if (EMOTIONAL_STATES_WITH_EXPLICIT_ACTIONS.includes(emotionalState)) {
                    extraActionInstructions += "Because this emotional state is one that can have explicit actions, make sure to ensure that the actions are particularly sexually explicit and romantically explicit, ensuring there is some level of sensual tension. ";
                }

                const question = `Based on the information of the character ${name}, Provide a small description to how they act/behave when they are ${modifier}${emotionalState}? Answer in a single short paragraph, do NOT provide concrete actions they might do, only how they feel and behave.`;
                await prime();
                const response = await generator.next({
                    maxCharacters: 200,
                    maxParagraphs: 1,
                    maxSafetyCharacters: 0,
                    nextQuestion: question,
                    stopAfter: [],
                    stopAt: [],
                    answerTrail: "Here is a small description of how " + name + " acts/feels when they are " + modifier + emotionalState + ":\n\nWhen " + name + " is " + modifier + emotionalState + ", ",
                    instructions: extraInstructions + extraGuidanceInstructions,
                });

                if (response.done) {
                    throw new Error("Generator finished before we could get all emotional states");
                }

                const emotionalStateDescription = replaceOtherCharNameWithPlaceholder(response.value.trim(), name);

                if (guider) {
                    const approvedGuiderValue = await guider.askBoolean("Do you approve of this description for how " + name + " acts/behaves when they are " + modifier + emotionalState + "?\n\n" + emotionalStateDescription, approved);
                    if (approvedGuiderValue.value === false) {
                        approved = false;
                        continue;
                    } else {
                        approved = true;
                    }
                }

                if (approved) {
                    card.body.push("const " + variableName + " = " + JSON.stringify(emotionalStateDescription) + ";");
                    break;
                }
            }

            const BONDS_TO_CHECK_FOR = [
                { "name": "Stranger", "description": "someone they have just met or don't know well", varEnd: "Stranger" },
                { "name": "Acquaintance", "description": "someone they know but are not close to", varEnd: "Acquaintance" },
                { "name": "Friend", "description": "someone they are friends with and have a good relationship with", varEnd: "Friend" },
                { "name": "Close Friend", "description": "someone they are very close to and have a strong bond with", varEnd: "CloseFriend" },
                { "name": "Romantic Interest", "description": "someone they are romantically interested in or attracted to", varEnd: "RomanticInterest" },
                { "name": "Hostile Friendship", "description": "someone they have a hostile relationship with, they might be friends but they also have a lot of animosity and conflict between them", varEnd: "HostileFriendship" },
                { "name": "Sworn Enemy", "description": "someone they consider their enemy and have a very antagonistic relationship with, things may get violent between them", varEnd: "SwornEnemy" },
                { "name": "Sexual Intimate Interest / Partner", "description": "someone they have a sexual and/or intimate relationship with, they are very close and have a strong bond", varEnd: "SexualIntimateInterest" },
            ];

            for (const bond of BONDS_TO_CHECK_FOR) {
                let approvedBondDescription = true;
                let approvedBondActions = true;

                while (true) {
                    if (guider) {
                        const guiderResult = await guider.askOpen("Guidance for generating a description for how " + name + " acts/behaves when they are " + modifier + emotionalState + " towards a " + bond.name + " (" + bond.description + "). What are some important things to keep in mind when writing about that in the context of " + name + "'s character and personality?", extraGuidanceInstructionsSource);
                        if (guiderResult) {
                            extraGuidanceInstructions = "\n\nIMPORTANT Guidance for constructing the description: " + guiderResult.value.trim() + ".";
                            extraGuidanceInstructionsSource = guiderResult.value.trim();
                        }
                    }

                    const question2 = `Based on the information of the character ${name}, Provide a small template description to how they act when they are ${modifier}${emotionalState} towards a ${bond.name} (${bond.description})? Answer in a single short paragraph, do NOT provide concrete actions they might do, only how they feel and behave, do not specify clothing`;
                    const response2 = await generator.next({
                        maxCharacters: 200,
                        maxParagraphs: 1,
                        maxSafetyCharacters: 0,
                        nextQuestion: question2,
                        stopAfter: [],
                        stopAt: [],
                        instructions: extraInstructions + "Because this is a template, use OTHER_CHARACTER to specify the name of who caused the emotional state and you can direct the description at that OTHER_CHARACTER" + extraGuidanceInstructions,
                        answerTrail: "Here is a small description of how " + name + " acts/feels when they are " + modifier + emotionalState + " and how it is directed towards that OTHER_CHARACTER:\n\nWhen " + name + " is " + modifier + emotionalState + ", ",
                    });

                    if (response2.done) {
                        throw new Error("Generator finished before we could get all emotional states");
                    }

                    const variableName2 = variableName + "_" + bond.varEnd;

                    const emotionalStateTemplateDescription = replaceOtherCharNameWithPlaceholder(response2.value.trim(), name);

                    if (guider) {
                        const approvedGuiderValue = await guider.askBoolean("Do you approve of this description for how " + name + " acts/behaves when they are " + modifier + emotionalState + " towards a " + bond.name + " (" + bond.description + ")?\n\n" + emotionalStateTemplateDescription, approvedBondDescription);
                        if (approvedGuiderValue.value === false) {
                            approvedBondDescription = false;
                            continue;
                        } else {
                            approvedBondDescription = true;
                        }
                    }

                    if (approvedBondDescription) {
                        card.body.push("const " + variableName2 + " = " + JSON.stringify(emotionalStateTemplateDescription) + ";");
                        break;
                    }
                }

                while (true) {
                    if (guider) {
                        const guiderResult = await guider.askOpen("Guidance for generating actions for when " + name + " is " + modifier + emotionalState + " towards a " + bond.name + " and they are in a GROUP in PUBLIC (" + bond.description + "). What are some important things to keep in mind when writing about that in the context of " + name + "'s character and personality?", extraGuidanceActionInstructionsSource);
                        if (guiderResult) {
                            extraGuidanceActionInstructions = "\n\nIMPORTANT Guidance for constructing the actions: " + guiderResult.value.trim() + ".";
                            extraGuidanceActionInstructionsSource = guiderResult.value.trim();
                        }
                    }

                    await prime();
                    const listOfPotentialActions = await generator.next({
                        maxCharacters: 10000,
                        maxParagraphs: 10,
                        maxSafetyCharacters: 0,
                        nextQuestion: `Based on the information of the character ${name}, Make a list of 5 potential actions that they might do when they are ${modifier}${emotionalState} towards a ${bond.name} (${bond.description}) when they are in a GROUP in PUBLIC? Answer in a single short paragraph, just make a list of actions without any explanations, each action should be separated by a new line.`,
                        stopAfter: [],
                        stopAt: [],
                        instructions: extraActionInstructions + "Because this is a template, use OTHER_CHARACTER to specify the name of who caused the emotional state and you can direct the description at that OTHER_CHARACTER; use future tense for the actions, the actions must be concrete and specific things they might do, not vague or general actions, they should be things that can be easily translated into game mechanics or code, do not specify clothing" + extraGuidanceActionInstructions,
                        answerTrail: "Here is a list of potential actions that " + name + " might do when they are " + modifier + emotionalState + " and how it is directed towards that OTHER_CHARACTER + :\n\n",
                        grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(5) + "\nbulletPoint ::= \"- \" " + JSON.stringify(name) + " \" will \" [a-zA-Z0-9 ,?'!_]+ \"\\n\"",
                    });

                    if (listOfPotentialActions.done) {
                        throw new Error("Generator finished before we could get all emotional states");
                    }

                    const listSplitted = listOfPotentialActions.value.trim().split("\n").map(line => replaceOtherCharNameWithPlaceholder((line.replace("- ", "").trim()), name)).filter(line => line.length > 0);

                    if (guider) {
                        const approvedGuiderValue = await guider.askBoolean("Do you approve of these actions for how " + name + " acts/behaves when they are " + modifier + emotionalState + " towards a " + bond.name + " (" + bond.description + ") in a GROUP in PUBLIC?\n\n" + listSplitted.map(action => "- " + action).join("\n"), approvedBondActions);
                        if (approvedGuiderValue.value === false) {
                            approvedBondActions = false;
                            continue;
                        } else {
                            approvedBondActions = true;
                        }
                    }

                    if (approvedBondActions) {
                        card.body.push("const " + variableName + "_" + bond.varEnd + "_GroupPublicActions = " + JSON.stringify(listSplitted) + ";");
                        break;
                    }
                }

                approvedBondActions = true;

                while (true) {
                    if (guider) {
                        const guiderResult = await guider.askOpen("Guidance for generating actions for when " + name + " is " + modifier + emotionalState + " towards a " + bond.name + " and they are in PUBLIC but mostly alone together with passersby around (" + bond.description + "). What are some important things to keep in mind when writing about that in the context of " + name + "'s character and personality?", extraGuidanceActionInstructionsSource);
                        if (guiderResult) {
                            extraGuidanceActionInstructions = "\n\nIMPORTANT Guidance for constructing the actions: " + guiderResult.value.trim() + ".";
                            extraGuidanceActionInstructionsSource = guiderResult.value.trim();
                        }
                    }

                    await prime();
                    const listOfPotentialActions = await generator.next({
                        maxCharacters: 10000,
                        maxParagraphs: 10,
                        maxSafetyCharacters: 0,
                        nextQuestion: `Based on the information of the character ${name}, Make a list of 5 potential actions that they might do when they are ${modifier}${emotionalState} towards a ${bond.name} (${bond.description}) when they are in PUBLIC but mostly alone together, with others being passersby not directly involved? Answer in a single short paragraph, just make a list of actions without any explanations, each action should be separated by a new line.`,
                        stopAfter: [],
                        stopAt: [],
                        instructions: extraActionInstructions + "Because this is a template, use OTHER_CHARACTER to specify the name of who caused the emotional state and you can direct the description at that OTHER_CHARACTER; use future tense for the actions, the actions must be concrete and specific things they might do, not vague or general actions, they should be things that can be easily translated into game mechanics or code, do not specify clothing; the setting is public but they are mostly alone together with passersby around, so they have some privacy but are still in a public space" + extraGuidanceActionInstructions,
                        answerTrail: "Here is a list of potential actions that " + name + " might do when they are " + modifier + emotionalState + " and how it is directed towards that OTHER_CHARACTER in a public setting where they are mostly alone together:\n\n",
                        grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(5) + "\nbulletPoint ::= \"- \" " + JSON.stringify(name) + " \" will \" [a-zA-Z0-9 ,?'!_]+ \"\\n\"",
                    });

                    if (listOfPotentialActions.done) {
                        throw new Error("Generator finished before we could get all emotional states");
                    }

                    const listSplitted = listOfPotentialActions.value.trim().split("\n").map(line => replaceOtherCharNameWithPlaceholder((line.replace("- ", "").trim()), name)).filter(line => line.length > 0);

                    if (guider) {
                        const approvedGuiderValue = await guider.askBoolean("Do you approve of these actions for how " + name + " acts/behaves when they are " + modifier + emotionalState + " towards a " + bond.name + " in public but mostly alone together (passersby around)?\n\n" + listSplitted.map(action => "- " + action).join("\n"), approvedBondActions);
                        if (approvedGuiderValue.value === false) {
                            approvedBondActions = false;
                            continue;
                        } else {
                            approvedBondActions = true;
                        }
                    }

                    if (approvedBondActions) {
                        card.body.push("const " + variableName + "_" + bond.varEnd + "_PublicAloneActions = " + JSON.stringify(listSplitted) + ";");
                        break;
                    }
                }

                approvedBondActions = true;

                while (true) {
                    if (guider) {
                        const guiderResult = await guider.askOpen("Guidance for generating actions for when " + name + " is " + modifier + emotionalState + " towards a " + bond.name + " and they are in a totally PRIVATE setting (" + bond.description + "). What are some important things to keep in mind when writing about that in the context of " + name + "'s character and personality?", extraGuidanceActionInstructionsSource);
                        if (guiderResult) {
                            extraGuidanceActionInstructions = "\n\nIMPORTANT Guidance for constructing the actions: " + guiderResult.value.trim() + ".";
                            extraGuidanceActionInstructionsSource = guiderResult.value.trim();
                        }
                    }

                    await prime();
                    const listOfPotentialActions = await generator.next({
                        maxCharacters: 10000,
                        maxParagraphs: 10,
                        maxSafetyCharacters: 0,
                        nextQuestion: `Based on the information of the character ${name}, Make a list of 5 potential actions that they might do when they are ${modifier}${emotionalState} towards a ${bond.name} (${bond.description}) when they are in a totally PRIVATE setting with no one else around? Answer in a single short paragraph, just make a list of actions without any explanations, each action should be separated by a new line.`,
                        stopAfter: [],
                        stopAt: [],
                        instructions: extraActionInstructions + "Because this is a template, use OTHER_CHARACTER to specify the name of who caused the emotional state and you can direct the description at that OTHER_CHARACTER; use future tense for the actions, the actions must be concrete and specific things they might do, not vague or general actions, they should be things that can be easily translated into game mechanics or code, do not specify clothing; the setting is completely private with no one else around, so they can be as uninhibited as their character would allow" + extraGuidanceActionInstructions,
                        answerTrail: "Here is a list of potential actions that " + name + " might do when they are " + modifier + emotionalState + " and how it is directed towards that OTHER_CHARACTER in a totally private setting:\n\n",
                        grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(5) + "\nbulletPoint ::= \"- \" " + JSON.stringify(name) + " \" will \" [a-zA-Z0-9 ,?'!_]+ \"\\n\"",
                    });

                    if (listOfPotentialActions.done) {
                        throw new Error("Generator finished before we could get all emotional states");
                    }

                    const listSplitted = listOfPotentialActions.value.trim().split("\n").map(line => replaceOtherCharNameWithPlaceholder((line.replace("- ", "").trim()), name)).filter(line => line.length > 0);

                    if (guider) {
                        const approvedGuiderValue = await guider.askBoolean("Do you approve of these actions for how " + name + " acts/behaves when they are " + modifier + emotionalState + " towards a " + bond.name + " in a totally private setting?\n\n" + listSplitted.map(action => "- " + action).join("\n"), approvedBondActions);
                        if (approvedGuiderValue.value === false) {
                            approvedBondActions = false;
                            continue;
                        } else {
                            approvedBondActions = true;
                        }
                    }

                    if (approvedBondActions) {
                        card.body.push("const " + variableName + "_" + bond.varEnd + "_PrivateActions = " + JSON.stringify(listSplitted) + ";");
                        break;
                    }
                }
            }
        }

        // card.body.push("DE.utils.defineStateInCharacter(DE, " + JSON.stringify(name) + ", " + JSON.stringify(emotionalState) + ", {");
        // card.body.push("dominance: 0,");
        // card.body.push("behaviourType: " + JSON.stringify("INTENSITY_EXPRESSIVE") + ",");
        // card.body.push("conflictStates: [],");
        // card.body.push("general: (DE, info) => {");
        // card.body.push("const isVery = DE.utils.getStateIntensity(DE, " + JSON.stringify(name) + ", " + JSON.stringify(emotionalState) + ") >= 2;");

        // /**
        //  * @type {DECharacterStateDefinition}
        //  */
        // const stateResult = {
        //     dominance: 0,
        //     behaviourType: "INTENSITY_EXPRESSIVE",
        //     conflictStates: [],
        //     general: (DE, info) => {
        //         const isVery = DE.utils.getStateIntensity(DE, name, "Angry") > 2;
        //         const descriptionToUse = DE.utils.getStateIntensity(DE, name, "Angry") > 2 ? emotionalStateDescriptionVery : emotionalStateDescription;
        //         return DE.utils.runHandlebarsTemplate(DE, descriptionToUse, info);
        //     },
        //     injuryAndDeath: false,
        //     intensityChangeRatePerInferenceCycle: -0.1,
        //     modifiesStatesIntensitiesOnTrigger: {},
        //     permanent: false,
        //     randomSpawnRate: 0,
        //     requiredStates: [],
        //     requiresPosture: null,
        //     triggersStates: {},
        //     primaryEmotion: basicEmotionalStateToPrimaryEmotion[emotionalState],
        //     actionPromptInjection: [],
        // }
    }
}