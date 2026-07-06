import { DEngine } from '../engine/index.js';
import { emotions, emotionsGrouped } from '../engine/util/emotions.js';
import { createGrammarListFromList } from '../engine/util/grammar.js';
import { insertSection, getSection, insertSpecialComment, hasSpecialComment, toTemplateLiteral, unshiftSpecialComment } from './base.js';
import { replaceOtherCharNameWithPlaceholder } from './generate-bond-triggers.js';

if (typeof process !== "undefined" && process.versions && process.versions.node) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

/**
 * 
 * @param {string} str 
 * @param {string} charName 
 * @returns {string}
 */
export function replaceAllCharNameWithPlaceholder(str, charName) {
    const parts = charName.trim().split(/\s+/);
    // Build all contiguous subsequences of the name parts, longest first
    const variants = [];
    for (let len = parts.length; len >= 1; len--) {
        for (let start = 0; start <= parts.length - len; start++) {
            const variant = parts.slice(start, start + len).join(" ");
            if (variant.length > 3) {
                variants.push(variant);
            }
        }
    }
    // Case-sensitive replacement with word boundaries, longest variants first
    for (const variant of variants) {
        const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp('\\b' + escaped + '\\b', 'g');
        str = str.replace(re, '{{char}}');
    }
    return str;
}

/**
 * @param {DEngine} engine
 * @param {import('./base.js').ScriptTypeGenerator} scriptgenerator
 * @param {import('./base.js').ScriptTypeGuider} guider
 * @param {string} language
 * @return {Promise<void>}
 */
export async function generateBase(engine, scriptgenerator, guider, language) {
    if (!language) {
        throw new Error("No language specified");
    }

    scriptgenerator.state.version = 2;
    scriptgenerator.state.language = language;

    if (!scriptgenerator.state.card) {
        throw new Error("No card found in state");
    }

    insertSpecialComment(scriptgenerator.imports, "base-imports");
    scriptgenerator.imports.push(`const fss = await importScript("@bond-systems", "full-standard-bond-system");`);
    scriptgenerator.imports.push(`await importScript("@bond-systems", "deteriorating-bonds");`);

    const metadataSection = insertSection(scriptgenerator.head, "metadata", (s) => {
        s.head.push(`/** @type {{[key: string]: string | number | boolean}} */`);
        s.head.push(`const metadata = {`);
        s.foot.push(`};`);
    });

    insertSpecialComment(scriptgenerator.head, "base-head");
    scriptgenerator.head.push(`engine.exports = {`);
    scriptgenerator.head.push(`metadata,`);
    scriptgenerator.head.push(`type: "characters",`);
    scriptgenerator.head.push(`language: ${JSON.stringify(language)},`);
    scriptgenerator.foot.push(`};`);

    const inferenceAdapter = engine.inferenceAdapter;
    if (!inferenceAdapter) {
        throw new Error("No inference adapter found on engine");
    }

    const systemPrompt = inferenceAdapter.buildSystemPromptForQuestioningAgent(
        `You are a helpful assistant that will answer and assist in defining a character for a game based on their description, you are allowed free rein to interpret the character's description and generate the code that defines them in the game, you will be asked questions about the character and you should answer them as best as you can`,
        [],
        `# Character Card:\n\n${scriptgenerator.state.card}`
    );

    const generator = inferenceAdapter.runQuestioningCustomAgentOn("cardtype-gen-base", {
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

    const initializeSection = insertSection(scriptgenerator.body, "initialize", (s) => {
        s.head.push(`initialize(DE) {`);
        s.foot.push(`},`);
    });

    const onWorldClockReadySection = insertSection(scriptgenerator.body, "on-world-clock-ready-fss", (s) => {
        s.head.push(`onWorldClockReady(DE) {`);
        s.foot.push(`},`);
    });

    const newCharacterSection = insertSection(initializeSection.body, "new-character");

    const name = (await guider.askOpen(
        "name",
        "What is the character's name?",
        async () => {
            await prime();
            const answer = await generator.next({
                maxCharacters: 50,
                maxSafetyCharacters: 50,
                maxParagraphs: 1,
                nextQuestion: "What is the character's name?",
                stopAfter: [],
                stopAt: [],
                instructions: "Answer with just the character's name, no explanations or extra text",
                grammar: "root ::= [A-Za-z ]+"
            });

            if (answer.done) {
                throw new Error("Generator finished without producing output");
            }

            return answer.value.trim();
        },
    )).value.trim();

    const oneSentenceDescription = (await guider.askOpen(
        "one-sentence-description",
        "Provide a small, concise one sentence description of " + name + " and its most distinctive features and personality traits",
        async () => {
            await prime();

            const answerSmallOneSentenceDescription = await generator.next({
                maxCharacters: 100,
                maxSafetyCharacters: 100,
                maxParagraphs: 1,
                nextQuestion: "Provide a small, concise one sentence description of " + name + " and its most distinctive features and personality traits.",
                stopAfter: [],
                stopAt: [],
                instructions: "Answer with a small, concise one sentence description of the character and its most distinctive features and personality traits, this will be used as a tooltip for the character in the game",
            });

            if (answerSmallOneSentenceDescription.done) {
                throw new Error("Generator finished without producing output");
            }

            return answerSmallOneSentenceDescription.value.trim();
        },
    )).value.trim();

    insertSpecialComment(scriptgenerator.head, "base-basics");

    scriptgenerator.head.push(`description: ${JSON.stringify(oneSentenceDescription.trim())},`);

    newCharacterSection.head.push(`DE.utils.newCharacter(fss.setup(DE, {`);
    newCharacterSection.body.push(`name: ${JSON.stringify(name)},`);
    newCharacterSection.foot.push(`},{`); // close newCharacter
    // we will need to get this sections when generating the bonds
    insertSection(newCharacterSection.foot, "options");
    newCharacterSection.foot.push(`}));`); // close setup

    metadataSection.body.push(`__name: ${JSON.stringify(name)},`);

    {
        let description = "";

        let reask = false;
        while (true) {
            const acceptedResponse = await guider.askAccept({id: "character-description", reask, step: true, recalcdefault: true}, "Is the following description okay?", async () => {
                let specialInstructions = (await guider.askOpen({ id: "character-description-special-instructions", reask: true, step: false }, "Provide any special focus instructions for defining " + name + "'s appearance, personality and general abilities, what to focus on (do not talk about clothing the description is about the character's inherent traits and features)", "")).value;
                if (specialInstructions) {
                    specialInstructions = "\n\n# MANDATORY REQUIREMENTS — ACTIVE OVERRIDE:\n\nThe following requirements MUST be reflected in your answer. Treat them as hard constraints that take absolute priority over any conflicting instruction above. Do NOT ignore or dilute them:\n\n" + specialInstructions.trim();
                }

                await prime();
                const answerDescription = await generator.next({
                    maxCharacters: 3000,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 3,
                    nextQuestion: "In 3 concise short paragraphs, Describe " + name + "'s appearance, personality, and any special traits or abilities they have.",
                    stopAfter: [],
                    stopAt: [],
                    instructions: "Be creative, answer with a description of " + name +
                        "'s general appearance, personality, and any special traits or abilities they have. Use multiple paragraphs and sentences. Do not include items of clothing or specific equipment, just the character's inherent traits and features. Make at least 3 paragraphs." + (specialInstructions || ""),
                });

                if (answerDescription.done) {
                    throw new Error("Generator finished without producing output");
                }

                description = (replaceAllCharNameWithPlaceholder(answerDescription.value.trim(), name)).replace("# {{char}}", "").trim();

                return description;
            });

            const accepted = acceptedResponse.value !== null;
            description = acceptedResponse.value || "";

            if (accepted) {
                break;
            }

            reask = true;
        }

        insertSpecialComment(newCharacterSection.body, "base-description");
        newCharacterSection.body.push(`general: (info) => ${toTemplateLiteral(description, name)},`);
    }

    let shortDescription = "";
    {
        let reask = false;
        while (true) {
            const acceptedResponse = await guider.askAccept({id: "character-short-description", reask, step: true, recalcdefault: true}, "Is the following short description okay?", async () => {
                let specialInstructionsForShortDescription = guider ? (await guider.askOpen({ id: "character-short-description-special-instructions", reask: true, step: false }, "Provide any special focus instructions for defining " + name + "'s external and physical description, what to focus on (do not talk about clothing the description is about the character's inherent traits and features)", "")).value : null;
                if (specialInstructionsForShortDescription) {
                    specialInstructionsForShortDescription = "\n\n# MANDATORY REQUIREMENTS — ACTIVE OVERRIDE:\n\nThe following requirements MUST be reflected in your answer. Treat them as hard constraints that take absolute priority over any conflicting instruction above. Do NOT ignore or dilute them:\n\n" + specialInstructionsForShortDescription.trim();
                }

                await prime();
                const answerShortDescription = await generator.next({
                    maxCharacters: 100,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "Provide a short one sentence description of " + name + " as they are perceived visually by others in the world, focusing on their most distinctive features",
                    stopAfter: [],
                    stopAt: [],
                    instructions: "Answer with a single sentence that provides a brief description of " + name + "'s appearance and personality. Use no more than 20 words. Do not include items of clothing or specific equipment, just the character's inherent traits and features. Do not include the character name in the description, just describe as an external observer would perceive them, focusing on their most distinctive features." + (specialInstructionsForShortDescription || ""),
                });

                if (answerShortDescription.done) {
                    throw new Error("Generator finished without producing output");
                }

                return answerShortDescription.value.trim();
            });

            const accepted = acceptedResponse.value !== null;
            shortDescription = acceptedResponse.value || "";

            if (accepted) {
                break;
            }

            reask = true;
        }
        insertSpecialComment(newCharacterSection.body, "base-short-description");
        newCharacterSection.body.push(`shortDescription: ${JSON.stringify(shortDescription)},`);
    }

    {
        let shortDescriptionTopNakedAdd = "";

        let reask = false;
        while (true) {
            const acceptedResponse = await guider.askAccept({id: "character-short-description-top-naked-add", reask, step: true, recalcdefault: true}, "Is the following addition to the short description okay?", async () => {
                let specialInstructionsForShortDescriptionAdd = (await guider.askOpen({ id: "character-short-description-top-naked-add-special-instructions", reask: true, step: false }, "Provide any special focus instructions for defining the additions to " + name + "'s short description when they are not wearing any upper body clothing, what to focus on (how to describe their upper body's most distinctive features)", "")).value;
                if (specialInstructionsForShortDescriptionAdd) {
                    specialInstructionsForShortDescriptionAdd = "\n\n# MANDATORY REQUIREMENTS — ACTIVE OVERRIDE:\n\nThe following requirements MUST be reflected in your answer. Treat them as hard constraints that take absolute priority over any conflicting instruction above. Do NOT ignore or dilute them:\n\n" + specialInstructionsForShortDescriptionAdd.trim();
                }

                await prime();
                const answerShortDescriptionTopNakedAdd = await generator.next({
                    maxCharacters: 100,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "Create a sentence that can be added at the end of the short description to describe " + name + " without any upper body clothing, focusing on their upper body's most distinctive features",
                    stopAfter: [],
                    stopAt: [],
                    contextInfo: "The short description is: " + JSON.stringify(shortDescription),
                    instructions: "Answer with a single sentence that can be appended to the short description to describe " + name + " without any upper body clothing, focusing on their upper body's most distinctive features. Do not include the character name in the description, just describe as an external observer would perceive them, focusing on their most distinctive features. Do not add details already mentioned in the short description, only add new details that would be visible when the character is not wearing any upper body clothing. If the character has boobs or a flat chest, nipples, etc... describe it" + (specialInstructionsForShortDescriptionAdd || ""),
                });

                if (answerShortDescriptionTopNakedAdd.done) {
                    throw new Error("Generator finished without producing output");
                }

                return answerShortDescriptionTopNakedAdd.value.trim();
            });

            const accepted = acceptedResponse.value !== null;
            shortDescriptionTopNakedAdd = acceptedResponse.value || "";

            if (accepted) {
                break;
            }

            reask = true;
        }

        insertSpecialComment(newCharacterSection.body, "base-short-description-top-naked-add");
        newCharacterSection.body.push(`shortDescriptionTopNakedAdd: ${JSON.stringify(shortDescriptionTopNakedAdd)},`);
    }

    {

        let shortDescriptionBottomNakedAdd = "";

        let reask = false;
        while (true) {
            const acceptedResponse = await guider.askAccept({id: "character-short-description-bottom-naked-add", reask, step: true, recalcdefault: true}, "Is the following addition to the short description okay?", async () => {
                let specialInstructionsForShortDescriptionBottomAdd = (await guider.askOpen({ id: "character-short-description-bottom-naked-add-special-instructions", reask: true, step: false }, "Provide any special focus instructions for defining the additions to " + name + "'s short description when they are not wearing any lower body clothing, what to focus on (how to describe their lower body's most distinctive features)", "")).value;
                if (specialInstructionsForShortDescriptionBottomAdd) {
                    specialInstructionsForShortDescriptionBottomAdd = "\n\n# MANDATORY REQUIREMENTS — ACTIVE OVERRIDE:\n\nThe following requirements MUST be reflected in your answer. Treat them as hard constraints that take absolute priority over any conflicting instruction above. Do NOT ignore or dilute them:\n\n" + specialInstructionsForShortDescriptionBottomAdd.trim();
                }

                await prime();
                const answerShortDescriptionBottomNakedAdd = await generator.next({
                    maxCharacters: 100,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "Create a sentence that can be added at the end of the short description to describe " + name + " without any lower body clothing, focusing on their lower body's most distinctive features",
                    stopAfter: [],
                    stopAt: [],
                    contextInfo: "The short description is: " + JSON.stringify(shortDescription),
                    instructions: "Answer with a single sentence that can be appended to the short description to describe " + name + " without any lower body clothing, focusing on their lower body's most distinctive features. Do not include the character name in the description, just describe as an external observer would perceive them, focusing on their most distinctive features. Do not add details already mentioned in the short description, only add new details that would be visible when the character is not wearing any lower body clothing. If the character has a penis or vagina, describe it" + (specialInstructionsForShortDescriptionBottomAdd || ""),
                });

                if (answerShortDescriptionBottomNakedAdd.done) {
                    throw new Error("Generator finished without producing output");
                }

                return answerShortDescriptionBottomNakedAdd.value.trim();
            });

            const accepted = acceptedResponse.value !== null;
            shortDescriptionBottomNakedAdd = acceptedResponse.value || "";

            if (accepted) {
                break;
            }

            reask = true;
        }
        insertSpecialComment(newCharacterSection.body, "base-short-description-bottom-naked-add");
        newCharacterSection.body.push(`shortDescriptionBottomNakedAdd: ${JSON.stringify(shortDescriptionBottomNakedAdd)},`);
    }

    {
        insertSpecialComment(newCharacterSection.body, "base-empties");
        newCharacterSection.body.push(`generalCharacterDescriptionInjection: {},`);
        newCharacterSection.body.push(`actionPromptInjection: [],`);
        newCharacterSection.body.push(`bonds: null,`);
        newCharacterSection.body.push(`characterRules: {},`);

        newCharacterSection.body.push(`stateDefinitions: {},`);
        newCharacterSection.body.push(`state: {`);
        newCharacterSection.body.push(`BOND_SYSTEM_FORGIVENESS_RATE_PER_DAY: 0.5,`),
            newCharacterSection.body.push(`},`)
        newCharacterSection.body.push("triggers: [],");
        newCharacterSection.body.push("temp: {},"); // Temporary properties to use during inference cycles, they do not persist
    }


    const emotionsGrammar = createGrammarListFromList(engine, emotions, 7);

    const emotionsSection = insertSection(newCharacterSection.body, "emotions", (s) => {
        s.head.push(`emotions: {`);
        s.foot.push(`},`);
    });

    {
        const commonEmotions = await guider.askList(
            "common-emotions",
            "Which emotions are common for " + name + "?",
            emotionsGrouped,
            async () => {
                await prime();
                const commonEmotions = await generator.next({
                    maxCharacters: 200,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "Provide a comma separated list of common emotions for " + name + " provide between 3 to 7 emotions",
                    stopAfter: emotionsGrammar.stopAfter,
                    stopAt: [],
                    grammar: emotionsGrammar.grammar,
                    instructions: "Pick from the list of following emotions: \"" + emotions.join(", ") + "\" and answer with a comma separated list of the emotions that are common for " + name,
                });

                if (commonEmotions.done) {
                    throw new Error("Generator finished without producing output");
                }

                let commonEmotionsList = commonEmotions.value.trim().split(",").map(e => e.trim().toLowerCase()).filter(e =>
                    // @ts-ignore
                    emotions.includes(e)
                ).filter((e, i, arr) => arr.indexOf(e) === i); // remove duplicates,

                return commonEmotionsList;
            }
        );

        insertSpecialComment(emotionsSection.body, "base-emotions");

        for (const emotion of commonEmotions.value) {
            emotionsSection.body.push(`${emotion}: {`);
            emotionsSection.body.push(`common: true,`);
            emotionsSection.body.push(`},`);
        }
    }

    {
        const uncommonEmotions = await guider.askList("uncommon-emotions", "Which emotions are uncommon for " + name + "?", emotionsGrouped, async () => {
            await prime();
            const uncommonEmotions = await generator.next({
                maxCharacters: 200,
                maxSafetyCharacters: 0,
                maxParagraphs: 1,
                nextQuestion: "Provide a comma separated list of uncommon emotions for " + name + " provide between 3 to 7 emotions",
                stopAfter: emotionsGrammar.stopAfter,
                stopAt: [],
                grammar: emotionsGrammar.grammar,
                instructions: "Pick from the list of following emotions: \"" + emotions.join(", ") + "\" and answer with a comma separated list of the emotions that are uncommon for " + name,
            });

            if (uncommonEmotions.done) {
                throw new Error("Generator finished without producing output");
            }

            let uncommonEmotionsList = uncommonEmotions.value.trim().split(",").map(e => e.trim().toLowerCase()).filter(e =>
                // @ts-ignore
                emotions.includes(e)
            ).filter((e, i, arr) => arr.indexOf(e) === i); // remove duplicates
            return uncommonEmotionsList;
        });

        insertSpecialComment(emotionsSection.body, "base-emotions-uncommon");

        const commonEmotionsList = scriptgenerator.state["common-emotions"] || [];

        for (const emotion of uncommonEmotions.value) {
            if (commonEmotionsList.includes(emotion)) continue;
            emotionsSection.body.push(`${emotion}: {`);
            emotionsSection.body.push(`uncommon: true,`);
            emotionsSection.body.push(`},`);
        }
    }

    let schizophrenia = 0;
    {
        const isActuallySchizophrenic = await guider.askBoolean(
            "schizophrenia-question",
            "Does " + name + " have schizophrenia?",
            async () => {
                await prime();
                const hasSchizophrenia = await generator.next({
                    maxCharacters: 5,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "Does " + name + " have schizophrenia? Answer with yes or no.",
                    stopAfter: [],
                    stopAt: [],
                    grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`
                });

                if (hasSchizophrenia.done) {
                    throw new Error("Generator finished without producing output");
                }

                return hasSchizophrenia.value.trim().toLowerCase() === "yes";
            }
        );

        if (!isActuallySchizophrenic.value) {
            schizophrenia = 0;
        } else {
            schizophrenia = 1;
        }

        insertSpecialComment(newCharacterSection.body, "base-schizo");
    }

    if (schizophrenia) {
        const howSevere = await guider.askOption("schizophrenia-severity", "How severe is the schizophrenia?", ["mild", "moderate", "severe"], async () => {
            await prime();
            const schizophreniaSeverity = await generator.next({
                maxCharacters: 5,
                maxSafetyCharacters: 0,
                maxParagraphs: 1,
                nextQuestion: "What is the severity of " + name + "'s schizophrenia? Answer with mild, moderate, or severe.",
                stopAfter: [],
                stopAt: [],
                grammar: `root ::= "mild" | "moderate" | "severe" | "MILD" | "MODERATE" | "SEVERE"`
            });

            if (schizophreniaSeverity.done) {
                throw new Error("Generator finished without producing output");
            }
            return schizophreniaSeverity.value.trim().toLowerCase();
        });

        let severity = 0;
        if (howSevere.value === "mild") severity = 0.33;
        else if (howSevere.value === "moderate") severity = 0.66;
        else if (howSevere.value === "severe") severity = 1;

        const voiceDescription = (await guider.askOpen("schizophrenia-voice-description", "Description of the voice that " + name + " hears as part of their schizophrenia.", async () => {
            let specialInstructionsForVoiceDescription = (await guider.askOpen(null, "Provide any special focus instructions for defining the description of the voice that " + name + " hears as part of their schizophrenia, what to focus on (how to describe the voice and its interactions with " + name + ")", "")).value;
            if (specialInstructionsForVoiceDescription) {
                specialInstructionsForVoiceDescription = "\n\n# MANDATORY REQUIREMENTS — ACTIVE OVERRIDE:\n\nThe following requirements MUST be reflected in your answer. Treat them as hard constraints that take absolute priority over any conflicting instruction above. Do NOT ignore or dilute them:\n\n" + specialInstructionsForVoiceDescription.trim();
            }

            await prime();
            const schizophrenicVoiceDescription = await generator.next({
                maxCharacters: 200,
                maxSafetyCharacters: 0,
                maxParagraphs: 3,
                nextQuestion: "Describe the voice that " + name + " hears as part of their schizophrenia, and how they act and interact with " + name + ", always describe it or invent one, do not give it a name or refer to it as an entity, just describe the voice and how it interacts with " + name + " in a way that can be injected into the character's description. If there are multiple voices, combine them into a single description.",
                stopAfter: [],
                stopAt: [],
                instructions: "Answer with a voice or invent one" + (specialInstructionsForVoiceDescription || ""),
            });

            if (schizophrenicVoiceDescription.done) {
                throw new Error("Generator finished without producing output");
            }

            return replaceAllCharNameWithPlaceholder(schizophrenicVoiceDescription.value.trim(), name);
        })).value.trim();

        insertSpecialComment(newCharacterSection.body, "base-schizo-details");
        newCharacterSection.body.push(`schizophrenia: ${severity},`);
        newCharacterSection.body.push(`schizophrenicVoiceDescription: (info) => ${toTemplateLiteral(voiceDescription, name)},`);
    } else {
        insertSpecialComment(newCharacterSection.body, "base-schizo-details");
        newCharacterSection.body.push(`schizophrenia: 0,`);
        newCharacterSection.body.push(`schizophrenicVoiceDescription: "",`);
    }

    const doesHaveAutism = (await guider.askBoolean("autism", "Is " + name + " autistic?", async () => {
        await prime();
        const hasAutism = await generator.next({
            maxCharacters: 5,
            maxSafetyCharacters: 0,
            maxParagraphs: 1,
            nextQuestion: "Is " + name + " autistic? Answer with yes or no.",
            stopAfter: [],
            stopAt: [],
            grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`
        });

        if (hasAutism.done) {
            throw new Error("Generator finished without producing output");
        }

        return hasAutism.value.trim().toLowerCase() === "yes";
    })).value;

    if (doesHaveAutism) {
        const howSevere = (await guider.askOption(
            "autism-severity",
            "How severe is " + name + "'s autism?",
            ["mild", "moderate", "severe"],
            async () => {
                await prime();
                const autismSeverity = await generator.next({
                    maxCharacters: 5,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "What is the severity of " + name + "'s autism? Answer with mild, moderate, or severe.",
                    stopAfter: [],
                    stopAt: [],
                    grammar: `root ::= "mild" | "moderate" | "severe" | "MILD" | "MODERATE" | "SEVERE"`
                });

                if (autismSeverity.done) {
                    throw new Error("Generator finished without producing output");
                }

                return autismSeverity.value.trim().toLowerCase();
            }
        )).value;

        let severity = 0;
        if (howSevere === "mild") severity = 0.33;
        else if (howSevere === "moderate") severity = 0.66;
        else if (howSevere === "severe") severity = 1;

        insertSpecialComment(newCharacterSection.body, "base-autism");
        newCharacterSection.body.push(`autism: ${severity},`);
    } else {
        insertSpecialComment(newCharacterSection.body, "base-autism");
        newCharacterSection.body.push(`autism: 0,`);
    }

    {
        const carryingCapacity = (await guider.askNumber(
            "carrying-capacity",
            "How many kilograms of weight could " + name + " lift? answer with an estimate number of kilograms that " + name + " could lift based on their physical description and traits. If you are unsure, provide your best guess.",
            async () => {
                await prime();
                const carryingCapacityKg = await generator.next({
                    maxCharacters: 10,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "How many kilograms of weight could " + name + " lift? answer with an estimate number of kilograms that " + name + " could lift based on their physical description and traits.",
                    stopAfter: [],
                    stopAt: [],
                    grammar: `root ::= [0-9]+`
                });

                if (carryingCapacityKg.done) {
                    throw new Error("Generator finished without producing output");
                }

                return parseInt(carryingCapacityKg.value.trim());
            }
        )).value;

        insertSpecialComment(newCharacterSection.body, "base-carrying-capacity");
        newCharacterSection.body.push(`carryingCapacityKg: ${carryingCapacity},`);

        // double the volume of the potential weight lifted
        newCharacterSection.body.push(`carryingCapacityLiters: ${carryingCapacity * 2},`);
    }

    {
        const heightCm = (await guider.askNumber(
            "height-cm",
            "How tall is " + name + "? answer with an estimate number of centimeters that " + name + " is tall based on their physical description and traits. If you are unsure, provide your best guess.",
            async () => {
                await prime();
                const heightCm = await generator.next({
                    maxCharacters: 10,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "How tall is " + name + "? answer with an estimate number of centimeters that " + name + " is tall based on their physical description and traits.",
                    stopAfter: [],
                    stopAt: [],
                    grammar: `root ::= [0-9]+`
                });

                if (heightCm.done) {
                    throw new Error("Generator finished without producing output");
                }

                return parseInt(heightCm.value.trim());
            }
        )).value;

        insertSpecialComment(newCharacterSection.body, "base-height");
        newCharacterSection.body.push(`heightCm: ${heightCm},`);
        metadataSection.body.push(`height: ${heightCm},`);
    }

    {
        const finalGender = (await guider.askOption(
            "gender",
            "What is " + name + "'s gender identity?",
            ["male", "female", "ambiguous"],
            async () => {
                await prime();
                const isAmb = await generator.next({
                    maxCharacters: 5,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "Does " + name + " identifies as agender, genderless or non-binary?",
                    stopAfter: [],
                    stopAt: [],
                    grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`,
                });

                if (isAmb.done) {
                    throw new Error("Generator finished without producing output");
                }

                let genderGuess = "ambiguous";
                if (isAmb.value.trim().toLowerCase() !== "yes") {
                    await prime();
                    const isMale = await generator.next({
                        maxCharacters: 5,
                        maxSafetyCharacters: 0,
                        maxParagraphs: 1,
                        nextQuestion: "Does " + name + " identify as male?",
                        stopAfter: [],
                        stopAt: [],
                        grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`,
                        instructions: "This refers to gender identity, if the character is a transman answer yes, tomboys are not considered transmen so answer no for tomboys, answer yes for traps and femboys; follow the same rules for animals or creatures",
                    });

                    if (isMale.done) {
                        throw new Error("Generator finished without producing output");
                    }

                    if (isMale.value.trim().toLowerCase() === "yes") {
                        genderGuess = "male";
                    } else {
                        await prime();
                        const isFemale = await generator.next({
                            maxCharacters: 5,
                            maxSafetyCharacters: 0,
                            maxParagraphs: 1,
                            nextQuestion: "Does " + name + " identify as female?",
                            stopAfter: [],
                            stopAt: [],
                            grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`,
                            instructions: "This refers to gender identity, if the character is a transwoman answer yes, femboys and traps are not considered transwomen so answer no for femboys and traps, answer no for tomboys; follow the same rules for animals or creatures",
                        });

                        if (isFemale.done) {
                            throw new Error("Generator finished without producing output");
                        }

                        genderGuess = isFemale.value.trim().toLowerCase() === "yes" ? "female" : "ambiguous";
                    }
                }

                return genderGuess;
            },
        )).value;

        insertSpecialComment(newCharacterSection.body, "base-gender");
        newCharacterSection.body.push(`gender: ${JSON.stringify(finalGender)},`);
        metadataSection.body.push(`gender: ${JSON.stringify(finalGender)},`);
    }

    {
        const finalSex = (await guider.askOption(
            "sex",
            "What is " + name + "'s biological sex?",
            ["male", "female", "intersex", "none"],
            async () => {
                await prime();
                const hasNoSex = await generator.next({
                    maxCharacters: 5,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "Is " + name + " sexless as in they do not have a physical sex?",
                    stopAfter: [],
                    stopAt: [],
                    grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`,
                    instructions: "This refers to biological sex not gender identity",
                });

                if (hasNoSex.done) {
                    throw new Error("Generator finished without producing output");
                }

                let sexGuess = "none";
                if (hasNoSex.value.trim().toLowerCase() !== "yes") {
                    await prime();
                    const isIntersex = await generator.next({
                        maxCharacters: 5,
                        maxSafetyCharacters: 0,
                        maxParagraphs: 1,
                        nextQuestion: "Is " + name + " clearly stated as intersex?",
                        stopAfter: [],
                        stopAt: [],
                        grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`,
                        instructions: "Femboys, traps, tomboys and transgender woman/men and similar tropes are not considered intersex, unless it is explicitly stated that the character is intersex",
                    });

                    if (isIntersex.done) {
                        throw new Error("Generator finished without producing output");
                    }

                    if (isIntersex.value.trim().toLowerCase() === "yes") {
                        sexGuess = "intersex";
                    } else {
                        await prime();
                        const isMale = await generator.next({
                            maxCharacters: 5,
                            maxSafetyCharacters: 0,
                            maxParagraphs: 1,
                            nextQuestion: "Is " + name + " male?",
                            stopAfter: [],
                            stopAt: [],
                            grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`,
                            // For a trans character to exist in the game, they need to have opposite gender and sex, it's the way that is handled in the game code
                            // if not the character simply isn't transgender by as seen by the engine
                            // this is so for simulation reasons, the gender/sex makes for 12 expressions of sex and gender identity
                            instructions: "This refers to biological sex, if the character is a male animal or creature answer yes, if the character is a transwoman answer yes, if the character is a transmen answer no, if the character is a femboy or trap answer yes, if the character is a tomboy answer no",
                        });

                        if (isMale.done) {
                            throw new Error("Generator finished without producing output");
                        }

                        sexGuess = isMale.value.trim().toLowerCase() === "yes" ? "male" : "female";
                    }
                }

                return sexGuess;
            },
        )).value;

        insertSpecialComment(newCharacterSection.body, "base-sex");
        newCharacterSection.body.push(`sex: ${JSON.stringify(finalSex)},`);
        metadataSection.body.push(`sex: ${JSON.stringify(finalSex)},`);
    }

    const sortedTiers = ["insect", "critter", "human", "apex", "street_level", "block_level", "city_level", "country_level", "continental", "planetary", "stellar", "galactic", "universal", "multiversal", "limitless"];

    const tierQuestions = {
        "insect": "Is " + name + " as strong an insect?",
        "critter": "Is " + name + " as strong as a critter?",
        "human": "Is " + name + " as strong as a person?",
        "apex": "Is " + name + " far stronger than a person?",
        "street_level": "Is " + name + " at street level threat? (can destroy a whole street singlehandedly)",
        "block_level": "Is " + name + " at block level threat? (can destroy a whole block singlehandedly)",
        "city_level": "Is " + name + " at city level threat? (can destroy a whole city singlehandedly)",
        "country_level": "Is " + name + " at country level threat? (can destroy a whole country singlehandedly)",
        "continental": "Is " + name + " at continental level threat? (can destroy a whole continent singlehandedly)",
        "planetary": "Is " + name + " at planetary level threat? (can destroy a whole planet singlehandedly)",
        "stellar": "Is " + name + " at stellar level threat? (can destroy a whole star system singlehandedly)",
        "galactic": "Is " + name + " at galactic level threat? (can destroy a whole galaxy singlehandedly)",
        "universal": "Is " + name + " at universal level threat? (can destroy a whole universe singlehandedly)",
        "multiversal": "Is " + name + " at multiversal level threat? (can destroy multiple universes singlehandedly)",
        "limitless": "Is " + name + " limitless? (has no limits to their strength or durability and can destroy anything with a single hit)",
    }

    const tierToBaseRange = {
        "insect": 1000,
        "critter": 1000,
        "human": 1000,
        "apex": 1000,
        "street_level": 5000,
        "block_level": 10000,
        "city_level": 50000,
        "country_level": 100000,
        "continental": 500000,
        "planetary": 1000000,
        "stellar": 5000000,
        "galactic": 10000000,
        "universal": 50000000,
        "multiversal": 100000000,
        "limitless": 1000000000,
    }

    const highestTier = (await guider.askOption(
        "tier",
        "What is " + name + "'s tier?",
        sortedTiers,
        async () => {
            /**
             * @type {{[tier: string]: boolean}}
             */
            let tierAnswers = {};

            for (const [tier, question] of Object.entries(tierQuestions)) {
                await prime();
                const answer = await generator.next({
                    maxCharacters: 5,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: question,
                    stopAfter: [],
                    stopAt: [],
                    grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`,
                });

                if (answer.done) {
                    throw new Error("Generator finished without producing output");
                }

                tierAnswers[tier] = answer.value.trim().toLowerCase() === "yes";
            }

            // @ts-ignore
            let highestTier = sortedTiers.find(tier => tierAnswers[tier]);
            if (!highestTier) {
                highestTier = "human";
            }

            return highestTier;
        }
    )).value;

    insertSpecialComment(newCharacterSection.body, "base-tier");
    newCharacterSection.body.push(`tier: ${JSON.stringify(highestTier)},`);

    {
        let tierValue = 50;
        /**
         * @type {number}
         */
        let range =
            // @ts-ignore
            tierToBaseRange[highestTier];

        const isBabyOrWeakened = (await guider.askBoolean(
            "baby-or-weakened",
            "is " + name + " a baby/cub or in a weakened state that makes them as weak as a baby in their power?",
            async () => {
                await prime();
                const answerIsBabyOrWeakened = await generator.next({
                    maxCharacters: 5,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "Is " + name + " a baby/cub or in a weakened state that makes them as weak as a baby in their power?",
                    stopAfter: [],
                    stopAt: [],
                    grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`,
                });

                if (answerIsBabyOrWeakened.done) {
                    throw new Error("Generator finished without producing output");
                }

                return answerIsBabyOrWeakened.value.trim().toLowerCase() === "yes";
            },
        )).value;

        if (isBabyOrWeakened) {
            tierValue = 5;
            range = range / 10;
        } else {
            const isYoungOrWeakened = (await guider.askBoolean(
                "young-or-weakened",
                "is " + name + " a child or in a weakened state (old, sick) that makes them as weak as a child in their power?",
                async () => {
                    await prime();
                    const answerIsYoungOrWeakened = await generator.next({
                        maxCharacters: 5,
                        maxSafetyCharacters: 0,
                        maxParagraphs: 1,
                        nextQuestion: "Is " + name + " a child or in a weakened state (old, sick) that makes them as weak as a child in their power?",
                        stopAfter: [],
                        stopAt: [],
                        grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`,
                    });

                    if (answerIsYoungOrWeakened.done) {
                        throw new Error("Generator finished without producing output");
                    }

                    return answerIsYoungOrWeakened.value.trim().toLowerCase() === "yes";
                },
            )).value;

            if (isYoungOrWeakened) {
                tierValue = 20;
                range = range / 2;
            } else {
                const isInPrime = (await guider.askBoolean("prime", "is " + name + " in their prime state posessing incredible athletic features?", async () => {
                    await prime();
                    const answerIsInPrime = await generator.next({
                        maxCharacters: 5,
                        maxSafetyCharacters: 0,
                        maxParagraphs: 1,
                        nextQuestion: "Is " + name + " in their prime state posessing incredible athletic features?",
                        stopAfter: [],
                        stopAt: [],
                        grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`,
                    });

                    if (answerIsInPrime.done) {
                        throw new Error("Generator finished without producing output");
                    }

                    return answerIsInPrime.value.trim().toLowerCase() === "yes";
                })).value;

                if (isInPrime) {
                    tierValue = 90;
                    range = range * 2;
                }
            }
        }

        insertSpecialComment(newCharacterSection.body, "base-tier-value");
        newCharacterSection.body.push(`tierValue: ${tierValue},`);
        newCharacterSection.body.push(`powerGrowthRate: 0.25,`);
        newCharacterSection.body.push(`rangeMeters: ${range},`);
        newCharacterSection.body.push(`locomotionSpeedMetersPerSecond: ${range * 0.0015},`);
    }

    {
        const howOldYears = (await guider.askNumber(
            "age-years",
            "How old is " + name + "?",
            async () => {
                await prime();
                const answerHowOld = await generator.next({
                    maxCharacters: 10,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "How old is " + name + "? answer with an estimate number of years that " + name + " has lived based on their description and traits.",
                    stopAfter: [],
                    stopAt: [],
                    grammar: `root ::= [0-9]+`
                });

                if (answerHowOld.done) {
                    throw new Error("Generator finished without producing output");
                }

                return parseInt(answerHowOld.value.trim());
            },
        )).value;

        insertSpecialComment(newCharacterSection.body, "base-age");
        newCharacterSection.body.push(`ageYears: ${howOldYears},`);
        metadataSection.body.push(`age: ${howOldYears},`);
    }

    {
        const weightKgValue = (await guider.askNumber(
            "weight-kg",
            "How much does " + name + " weight? answer with an estimate number of kilograms that " + name + " weights based on their physical description and traits.",
            async () => {
                await prime();
                const weightKg = await generator.next({
                    maxCharacters: 10,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "How much does " + name + " weight? answer with an estimate number of kilograms that " + name + " weights based on their physical description and traits.",
                    stopAfter: [],
                    stopAt: [],
                    grammar: `root ::= [0-9]+`
                });

                if (weightKg.done) {
                    throw new Error("Generator finished without producing output");
                }

                return parseInt(weightKg.value.trim());
            },
        )).value;

        insertSpecialComment(newCharacterSection.body, "base-weight");
        newCharacterSection.body.push(`weightKg: ${weightKgValue},`);
        metadataSection.body.push(`weight: ${weightKgValue},`);
    }

    {
        let initiative = 0.25;
        let strangerInitiative = 0.05;
        let strangerRejection = 0;

        const highInitiativeValue = (await guider.askBoolean(
            "high-initiative",
            "Does " + name + " have high initiative to take action in any situation? especially social scenarios?",
            async () => {
                await prime();
                const hightInitiative = await generator.next({
                    maxCharacters: 5,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "Does " + name + " have high initiative to take action in any situation? especially social scenarios?",
                    stopAfter: [],
                    stopAt: [],
                    grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`,
                });

                if (hightInitiative.done) {
                    throw new Error("Generator finished without producing output");
                }

                return hightInitiative.value.trim().toLowerCase() === "yes";
            },
        )).value;

        if (highInitiativeValue) {
            initiative = 0.5;
            strangerInitiative = 0.1;
            strangerRejection = 0;

            const annoyinglySocialValue = (await guider.askBoolean(
                "annoyingly-social",
                "Is " + name + " annoyingly social, always trying to interact with others and be the center of attention?",
                async () => {
                    await prime();
                    const annoyinglySocial = await generator.next({
                        maxCharacters: 5,
                        maxSafetyCharacters: 0,
                        maxParagraphs: 1,
                        nextQuestion: "Is " + name + " annoyingly social, always trying to interact with others and be the center of attention?",
                        stopAfter: [],
                        stopAt: [],
                        grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`,
                    });

                    if (annoyinglySocial.done) {
                        throw new Error("Generator finished without producing output");
                    }

                    return annoyinglySocial.value.trim().toLowerCase() === "yes";
                },
            )).value;

            if (annoyinglySocialValue) {
                initiative = 0.75;
                strangerInitiative = 0.3;
                strangerRejection = 0;
            }
        } else {
            const shyValue = (await guider.askBoolean(
                "shy",
                "Is " + name + " shy and reserved, preferring to stay in the background and avoid social interactions?",
                async () => {
                    await prime();
                    const shy = await generator.next({
                        maxCharacters: 5,
                        maxSafetyCharacters: 0,
                        maxParagraphs: 1,
                        nextQuestion: "Is " + name + " shy and reserved, preferring to stay in the background and avoid social interactions?",
                        stopAfter: [],
                        stopAt: [],
                        grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`,
                    });

                    if (shy.done) {
                        throw new Error("Generator finished without producing output");
                    }

                    return shy.value.trim().toLowerCase() === "yes";
                },
            )).value;

            if (shyValue) {
                initiative = 0.1;
                strangerInitiative = 0;
                strangerRejection = 0.2;
            } else {
                const completelyAsocialValue = (await guider.askBoolean(
                    "completely-asocial",
                    "Is " + name + " completely asocial, having no interest in interacting with others at all and preferring complete isolation?",
                    async () => {
                        await prime();
                        const completelyAsocial = await generator.next({
                            maxCharacters: 5,
                            maxSafetyCharacters: 0,
                            maxParagraphs: 1,
                            nextQuestion: "Is " + name + " completely asocial, having no interest in interacting with others at all and preferring complete isolation?",
                            stopAfter: [],
                            stopAt: [],
                            grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`,
                        });

                        if (completelyAsocial.done) {
                            throw new Error("Generator finished without producing output");
                        }

                        return completelyAsocial.value.trim().toLowerCase() === "yes";
                    },
                )).value;

                if (completelyAsocialValue) {
                    initiative = 0;
                    strangerInitiative = 0;
                    strangerRejection = 0.5;
                }
            }
        }

        insertSpecialComment(newCharacterSection.body, "base-initiative");
        newCharacterSection.body.push(`initiative: ${initiative},`);
        newCharacterSection.body.push(`strangerInitiative: ${strangerInitiative},`);
        newCharacterSection.body.push(`strangerRejection: ${strangerRejection},`);
    }

    insertSpecialComment(newCharacterSection.body, "base-mantenience");
    newCharacterSection.body.push(`maintenanceCaloriesPerDay: 2000,`);
    newCharacterSection.body.push(`maintenanceHydrationLitersPerDay: 2,`);

    {
        const stealthValue = (await guider.askNumber(
            "stealth",
            "From 1 to 10 how stealthy is " + name + "? with 10 being extremely stealthy and 1 being not stealthy at all",
            async () => {
                await prime();
                const stealthValue = await generator.next({
                    maxCharacters: 100,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "How stealthy is " + name + "? answer with \"very stealthy\", \"somewhat stealthy\", \"not very stealthy\" or \"not stealthy at all\"",
                    stopAfter: [],
                    stopAt: [],
                    grammar: `root ::= "very stealthy" | "somewhat stealthy" | "not very stealthy" | "not stealthy at all"`,
                });

                if (stealthValue.done) {
                    throw new Error("Generator finished without producing output");
                }

                const mapping = {
                    "very stealthy": 10,
                    "somewhat stealthy": 7,
                    "not very stealthy": 4,
                    "not stealthy at all": 1,
                };

                // @ts-ignore
                return mapping[stealthValue.value.trim().toLowerCase()];
            },
        )).value;

        insertSpecialComment(newCharacterSection.body, "base-stealth");
        newCharacterSection.body.push(`stealth: ${stealthValue / 10},`);
    }

    {
        const perceptionValue = (await guider.askNumber(
            "perception",
            "From 1 to 10 how perceptive is " + name + "? with 10 being extremely perceptive and 1 being lost and clueless all the time",
            async () => {
                await prime();
                const perceptionValue = await generator.next({
                    maxCharacters: 100,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "How perceptive is " + name + "? answer with \"very perceptive\", \"somewhat perceptive\", \"not very perceptive\" or \"not perceptive at all\"",
                    stopAfter: [],
                    stopAt: [],
                    grammar: `root ::= "very perceptive" | "somewhat perceptive" | "not very perceptive" | "not perceptive at all"`,
                });

                if (perceptionValue.done) {
                    throw new Error("Generator finished without producing output");
                }

                const mapping = {
                    "very perceptive": 10,
                    "somewhat perceptive": 7,
                    "not very perceptive": 4,
                    "not perceptive at all": 1,
                };

                // @ts-ignore
                return mapping[perceptionValue.value.trim().toLowerCase()];
            },
        )).value;

        insertSpecialComment(newCharacterSection.body, "base-perception");
        newCharacterSection.body.push(`perception: ${perceptionValue / 10},`);
    }

    {
        const heroismValue = (await guider.askNumber(
            "heroism",
            "From 1 to 10 how heroic is " + name + "? with 10 being extremely heroic and always taking on threats and challenges, and 1 being more passive and avoiding trouble",
            async () => {
                await prime();
                const heroismValue = await generator.next({
                    maxCharacters: 100,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "How heroic is " + name + "? answer with \"very heroic\", \"somewhat heroic\", \"not very heroic\" or \"not heroic at all\"",
                    stopAfter: [],
                    stopAt: [],
                    grammar: `root ::= "very heroic" | "somewhat heroic" | "not very heroic" | "not heroic at all"`,
                });

                if (heroismValue.done) {
                    throw new Error("Generator finished without producing output");
                }

                const mapping = {
                    "very heroic": 10,
                    "somewhat heroic": 7,
                    "not very heroic": 4,
                    "not heroic at all": 1,
                };

                // @ts-ignore
                return mapping[heroismValue.value.trim().toLowerCase()];
            },
        )).value;

        insertSpecialComment(newCharacterSection.body, "base-heroism");
        newCharacterSection.body.push(`heroism: ${heroismValue / 10},`);
    }

    {
        const violenceValue = (await guider.askNumber(
            "violence",
            "From 1 to 10 how likely is " + name + " to resort to violence when facing conflicts or threats? with 10 being extremely likely and 1 being very unlikely",
            async () => {
                await prime();
                const violenceValue = await generator.next({
                    maxCharacters: 100,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "How likely is " + name + " to resort to violence when facing conflicts or threats? answer with \"very likely\", \"somewhat likely\", \"not very likely\" or \"not likely at all\"",
                    stopAfter: [],
                    stopAt: [],
                    grammar: `root ::= "very likely" | "somewhat likely" | "not very likely" | "not likely at all"`,
                });

                if (violenceValue.done) {
                    throw new Error("Generator finished without producing output");
                }

                const mapping = {
                    "very likely": 10,
                    "somewhat likely": 7,
                    "not very likely": 4,
                    "not likely at all": 1,
                };

                // @ts-ignore
                return mapping[violenceValue.value.trim().toLowerCase()];
            },
        )).value;

        insertSpecialComment(newCharacterSection.body, "base-violence");
        newCharacterSection.body.push(`violence: ${violenceValue / 10},`);
    }

    {
        const speciesType = scriptgenerator.state["species-type"];
        const isMuteValue = speciesType === "animal" ? true : (await guider.askBoolean(
            "mute",
            "Is " + name + " mute, unable to speak or communicate verbally?",
            async () => {
                await prime();
                const isMute = await generator.next({
                    maxCharacters: 5,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "Is " + name + " mute, unable to speak or communicate verbally?",
                    stopAfter: [],
                    stopAt: [],
                    grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`,
                    instructions: "If the character is an animal without speaking capabilities, answer yes, if the character is a human or humanoid that cannot speak for any reason answer yes; for animals, creatures or humanoids that can speak answer no",
                });

                if (isMute.done) {
                    throw new Error("Generator finished without producing output");
                }

                return isMute.value.trim().toLowerCase() === "yes";
            },
        )).value;

        insertSpecialComment(newCharacterSection.body, "base-vocabulary-limit");
        if (isMuteValue) {
            newCharacterSection.body.push(`vocabularyLimit: {mute: true},`);
        }
    }


    {
        const attractivenessValue = (await guider.askNumber(
            "attractiveness",
            "From 1 to 10 how attractive is " + name + "? with 10 being extremely attractive and 1 being very unattractive",
            async () => {
                await prime();
                const attractivenessValue = await generator.next({
                    maxCharacters: 100,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "How attractive is " + name + "? answer with \"very attractive\", \"somewhat attractive\", \"not very attractive\" or \"not attractive at all\"",
                    stopAfter: [],
                    stopAt: [],
                    grammar: `root ::= "very attractive" | "somewhat attractive" | "not very attractive" | "not attractive at all"`,
                });

                if (attractivenessValue.done) {
                    throw new Error("Generator finished without producing output");
                }

                const mapping = {
                    "very attractive": 10,
                    "somewhat attractive": 7,
                    "not very attractive": 4,
                    "not attractive at all": 1,
                };

                // @ts-ignore
                return mapping[attractivenessValue.value.trim().toLowerCase()];
            },
        )).value;

        insertSpecialComment(newCharacterSection.body, "base-attractiveness");
        newCharacterSection.body.push(`attractiveness: ${attractivenessValue / 10},`);
    }

    {
        const charismaValue = (await guider.askNumber(
            "charisma",
            "From 1 to 10 how charismatic is " + name + "? with 10 being extremely charismatic and able to easily charm and influence others, and 1 being very uncharismatic and awkward in social situations",
            async () => {
                await prime();
                const charismaValue = await generator.next({
                    maxCharacters: 100,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "How charismatic is " + name + "? answer with \"very charismatic\", \"somewhat charismatic\", \"not very charismatic\" or \"not charismatic at all\"",
                    stopAfter: [],
                    stopAt: [],
                    grammar: `root ::= "very charismatic" | "somewhat charismatic" | "not very charismatic" | "not charismatic at all"`,
                });

                if (charismaValue.done) {
                    throw new Error("Generator finished without producing output");
                }

                const mapping = {
                    "very charismatic": 10,
                    "somewhat charismatic": 7,
                    "not very charismatic": 4,
                    "not charismatic at all": 1,
                };

                // @ts-ignore
                return mapping[charismaValue.value.trim().toLowerCase()];
            },
        )).value;

        insertSpecialComment(newCharacterSection.body, "base-charisma");
        newCharacterSection.body.push(`charisma: ${charismaValue / 10},`);
    }

    {
        const skepticismValue = (await guider.askNumber(
            "skepticism",
            "From 1 to 10 how skeptical is " + name + " towards new information, ideas, or experiences? with 10 being extremely paranoid and 1 being very trusting and gullible",
            async () => {
                await prime();
                const skepticismValue = await generator.next({
                    maxCharacters: 100,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "How skeptical is " + name + " towards new information, ideas, or experiences? answer with \"very skeptical\", \"somewhat skeptical\", \"not very skeptical\" or \"not skeptical at all\"",
                    stopAfter: [],
                    stopAt: [],
                    grammar: `root ::= "very skeptical" | "somewhat skeptical" | "not very skeptical" | "not skeptical at all"`,
                });

                if (skepticismValue.done) {
                    throw new Error("Generator finished without producing output");
                }

                const mapping = {
                    "very skeptical": 8,
                    "somewhat skeptical": 6,
                    "not very skeptical": 4,
                    "not skeptical at all": 2,
                };

                // @ts-ignore
                return mapping[skepticismValue.value.trim().toLowerCase()];
            },
        )).value;

        insertSpecialComment(newCharacterSection.body, "base-skepticism");
        newCharacterSection.body.push(`skepticism: ${skepticismValue / 10},`);
    }

    {
        const antagonismValue = (await guider.askNumber(
            "antagonism",
            "From 1 to 10 how antagonistic is " + name + " towards others, running contrary to their ideas or experiences? with 10 being extremely antagonistic and contrarian and 1 being very agreeable",
            async () => {
                await prime();
                const antagonismValue = await generator.next({
                    maxCharacters: 100,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "How antagonistic or contrarian is " + name + " towards others? answer with \"very antagonistic\", \"somewhat antagonistic\", \"not very antagonistic\" or \"not antagonistic at all\"",
                    stopAfter: [],
                    stopAt: [],
                    grammar: `root ::= "very antagonistic" | "somewhat antagonistic" | "not very antagonistic" | "not antagonistic at all"`,
                });

                if (antagonismValue.done) {
                    throw new Error("Generator finished without producing output");
                }

                const mapping = {
                    "very antagonistic": 8,
                    "somewhat antagonistic": 5,
                    "not very antagonistic": 3,
                    "not antagonistic at all": 1,
                };

                // @ts-ignore
                return mapping[antagonismValue.value.trim().toLowerCase()];
            },
        )).value;

        insertSpecialComment(newCharacterSection.body, "base-antagonism");
        newCharacterSection.body.push(`antagonism: ${antagonismValue / 10},`);
    }

    {
        const curiosityValue = (await guider.askNumber(
            "curiosity",
            "From 1 to 10 how curious is " + name + " about things, asking questions when presented with new information or experiences? with 10 being extremely curious and 1 being very incurious",
            async () => {
                await prime();
                const curiosityValue = await generator.next({
                    maxCharacters: 100,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "How curious is " + name + " about things and new information or experiences? answer with \"very curious\", \"somewhat curious\", \"not very curious\" or \"not curious at all\"",
                    stopAfter: [],
                    stopAt: [],
                    grammar: `root ::= "very curious" | "somewhat curious" | "not very curious" | "not curious at all"`,
                });

                if (curiosityValue.done) {
                    throw new Error("Generator finished without producing output");
                }

                const mapping = {
                    "very curious": 10,
                    "somewhat curious": 7,
                    "not very curious": 4,
                    "not curious at all": 1,
                };

                // @ts-ignore
                return mapping[curiosityValue.value.trim().toLowerCase()];
            },
        )).value;

        insertSpecialComment(newCharacterSection.body, "base-curiosity");
        newCharacterSection.body.push(`curiosity: ${curiosityValue / 10},`);
    }

    {
        const adventurousnessValue = (await guider.askNumber(
            "adventurousness",
            "From 1 to 10 how adventurous is " + name + ", seeking out new experiences, adventures, and challenges? with 10 being extremely adventurous and risk-taking and 1 being very cautious and risk-averse",
            async () => {
                await prime();
                const adventurousnessValue = await generator.next({
                    maxCharacters: 100,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "How adventurous is " + name + ", seeking new experiences and challenges? answer with \"very adventurous\", \"somewhat adventurous\", \"not very adventurous\" or \"not adventurous at all\"",
                    stopAfter: [],
                    stopAt: [],
                    grammar: `root ::= "very adventurous" | "somewhat adventurous" | "not very adventurous" | "not adventurous at all"`,
                });

                if (adventurousnessValue.done) {
                    throw new Error("Generator finished without producing output");
                }

                const mapping = {
                    "very adventurous": 10,
                    "somewhat adventurous": 7,
                    "not very adventurous": 4,
                    "not adventurous at all": 1,
                };

                // @ts-ignore
                return mapping[adventurousnessValue.value.trim().toLowerCase()];
            },
        )).value;

        insertSpecialComment(newCharacterSection.body, "base-adventurousness");
        newCharacterSection.body.push(`adventurousness: ${adventurousnessValue / 10},`);
    }

    {
        const correctivenessLikelyhoodValue = (await guider.askNumber(
            "correctiveness-likelyhood",
            "From 1 to 10 how likely is " + name + " to correct others when they say something wrong or incorrect? with 10 being extremely likely to always correct others and 1 being very unlikely to ever correct anyone",
            async () => {
                await prime();
                const correctivenessLikelyhoodValue = await generator.next({
                    maxCharacters: 100,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "How likely is " + name + " to correct others when they are wrong? answer with \"very likely\", \"somewhat likely\", \"not very likely\" or \"not likely at all\"",
                    stopAfter: [],
                    stopAt: [],
                    grammar: `root ::= "very likely" | "somewhat likely" | "not very likely" | "not likely at all"`,
                });

                if (correctivenessLikelyhoodValue.done) {
                    throw new Error("Generator finished without producing output");
                }

                const mapping = {
                    "very likely": 10,
                    "somewhat likely": 7,
                    "not very likely": 4,
                    "not likely at all": 1,
                };

                // @ts-ignore
                return mapping[correctivenessLikelyhoodValue.value.trim().toLowerCase()];
            },
        )).value;

        const correctivenessGeneralFacts = correctivenessLikelyhoodValue >= 1 ? (await guider.askArbitraryList(
            "correctiveness-general-facts",
            "Provide a list of general facts and beliefs that " + name + " holds to be true about the world",
            async () => {
                await prime();
                const facts = await generator.next({
                    maxCharacters: 1500,
                    maxSafetyCharacters: 500,
                    maxParagraphs: 1,
                    nextQuestion: `List general facts and beliefs that ${name} firmly holds to be true about the world, as a bullet point list. These should be basic, worldly, general-knowledge facts and convictions that ${name} would confidently believe based on their personality, background, education, culture and life experience. Each item must be a short, self-contained statement of fact. List 10 unique items.`,
                    stopAfter: [],
                    stopAt: [],
                    instructions: `Each item must be a short, self-contained factual statement that ${name} believes to be true, written in plain 3rd person as a statement (not a question). Base them on ${name}'s knowledge, background and worldview. Do NOT reference other characters, do not use you, your, I or we.`,
                    answerTrail: name + "'s general known facts and firmly held beliefs:\n\n",
                    grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(10) + "\nbulletPoint ::= \"- \" [a-zA-Z0-9 ,;.'_-]+ \"\\n\"",
                });

                if (facts.done) {
                    throw new Error("Generator finished without producing output");
                }

                return facts.value.split("\n").map(fact => fact.trim().replace(/^-\s*/, "").trim()).filter(fact => fact);
            },
        )).value : [];

        const correctivenessPersonalQuestions = correctivenessLikelyhoodValue >= 1 ? (await guider.askArbitraryList(
            "correctiveness-personal-questions",
            "Provide a list of personal situations where " + name + " would attempt to correct another character",
            async () => {
                await prime();
                const questions = await generator.next({
                    maxCharacters: 1500,
                    maxSafetyCharacters: 500,
                    maxParagraphs: 1,
                    nextQuestion: `List specific PERSONAL yes/no questions about another character (referred to as OTHER_CHARACTER) that, if answered yes, would make ${name} feel compelled to correct them. These must be PERSONAL matters concerning ${name} directly — such as their name, identity, personal history, relationships, preferences, work, or how they are treated or described — that ${name} would want to set straight. Write each as a past-tense 3rd person yes/no question using OTHER_CHARACTER as a placeholder for the other character's name. List 3 unique questions.`,
                    stopAfter: [],
                    stopAt: [],
                    instructions: `Each item must be a yes/no question in past tense and 3rd person about a PERSONAL matter concerning ${name} directly, using OTHER_CHARACTER as a placeholder for the other character's name; OTHER_CHARACTER must always be included. Focus only on personal things about ${name} themselves that they would want to correct, not general facts of the world. Do not use you, your, I, we or similar first or second person words.`,
                    answerTrail: `# List of personal things about ${name} that they would want to correct OTHER_CHARACTER about:\n\n`,
                    grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(3) + "\nbulletPoint ::= \"- \" (\"Was\" | \"Did\" | \"Has\" | \"Does\" | \"Is\") \" OTHER_CHARACTER \" [a-zA-Z0-9 ,;.'?!_-]+ \"\\n\"",
                });

                if (questions.done) {
                    throw new Error("Generator finished without producing output");
                }

                return questions.value.split("\n").map(question => question.trim().replace(/^-\s*/, "").trim()).filter(question => question).map(question => replaceOtherCharNameWithPlaceholder(question, name));
            },
        )).value : [];

        const correctivenessWorldQuestions = correctivenessLikelyhoodValue >= 1 ? (await guider.askArbitraryList(
            "correctiveness-world-questions",
            "Provide a list of general world facts and beliefs that " + name + " would attempt to correct another character about",
            async () => {
                await prime();
                const questions = await generator.next({
                    maxCharacters: 1500,
                    maxSafetyCharacters: 500,
                    maxParagraphs: 1,
                    nextQuestion: `List yes/no questions about another character (referred to as OTHER_CHARACTER) expressing a BROAD WRONG BELIEF OR STATEMENT that, if answered yes, would make ${name} feel compelled to correct them. Each question must be a broad, categorical expression — asking whether OTHER_CHARACTER expressed something broadly anti-scientific, anti-religious, morally wrong, factually wrong about a topic ${name} cares about, etc. based on ${name}'s worldview, beliefs and values. Do NOT enumerate specific narrow facts. Think of question patterns like: "Did OTHER_CHARACTER say something anti-scientific?", "Did OTHER_CHARACTER say something against God?", "Did OTHER_CHARACTER express a racist belief?", "Did OTHER_CHARACTER say something factually wrong about [a broad topic important to ${name}]?". Write each as a past-tense 3rd person yes/no question using OTHER_CHARACTER as a placeholder. List 6 unique questions.`,
                    stopAfter: [],
                    stopAt: [],
                    instructions: `Each item must be a broad yes/no question in past tense and 3rd person, framed as "Did OTHER_CHARACTER say/express/claim something [broadly wrong in a category]?" — NOT a specific narrow question about one particular fact. The question must be about a CATEGORY of wrongness or a broad statement, not a specific detail. Use OTHER_CHARACTER as a placeholder; it must always be included. Base the categories on ${name}'s personal worldview, values and beliefs (e.g. science, religion, morality, politics, nature, society). Do not use you, your, I, we or similar first or second person words.`,
                    answerTrail: `# List of broad wrong beliefs that ${name} would want to correct OTHER_CHARACTER about:\n\n`,
                    grammar: "root ::= list\nlist ::=" + (" bulletPoint").repeat(6) + "\nbulletPoint ::= \"- Did OTHER_CHARACTER \" [a-zA-Z0-9 ,;.'?!_-]+ \"\\n\"",
                });

                if (questions.done) {
                    throw new Error("Generator finished without producing output");
                }

                return questions.value.split("\n").map(question => question.trim().replace(/^-\s*/, "").trim()).filter(question => question).map(question => replaceOtherCharNameWithPlaceholder(question, name));
            },
        )).value : [];

        const correctivenessQuestions = [...correctivenessPersonalQuestions, ...correctivenessWorldQuestions];

        insertSpecialComment(newCharacterSection.body, "base-correctiveness");
        newCharacterSection.body.push(`correctiveness: {`);
        newCharacterSection.body.push(`likelyhood: ${correctivenessLikelyhoodValue / 10},`);
        newCharacterSection.body.push(`generalFacts: ${JSON.stringify(correctivenessGeneralFacts)},`);
        newCharacterSection.body.push(`questions: [`);

        for (let correctivenessIndex = 0; correctivenessIndex < correctivenessQuestions.length; correctivenessIndex++) {
            const correctivenessQuestion = correctivenessQuestions[correctivenessIndex];
            const correctivenessQuestionForInference = correctivenessQuestion
                .replace(/\{\{other\}\}/g, "OTHER_CHARACTER")
                .replace(/\{\{char\}\}/g, name);

            const correctivenessQuestionLikelyhoodValue = (await guider.askNumber(
                "correctiveness-question-likelyhood-" + correctivenessQuestion,
                "From 1 to 10 how likely is " + name + " to bring up a correction when: \"" + correctivenessQuestion + "\"",
                10,
            )).value;

            const correctivenessCorrectionValue = (await guider.askOpen(
                "correctiveness-question-correction-" + correctivenessQuestion,
                "Describe the emotional stance and broad corrective attitude " + name + " takes when: \"" + correctivenessQuestion + "\" — do not script what they say or do specifically",
                async () => {
                    await prime();
                    const correction = await generator.next({
                        maxCharacters: 150,
                        maxSafetyCharacters: 0,
                        maxParagraphs: 1,
                        nextQuestion: "The situation is: \"" + correctivenessQuestionForInference + "\". In one short sentence, describe the emotional tone and broad corrective action " + name + " takes specifically about THIS situation — the correction must concern the SAME subject as the question above, nothing else.",
                        stopAfter: [],
                        stopAt: ["\n"],
                        instructions: "IMPORTANT: the correction MUST be about the SAME subject as the situation described: \"" + correctivenessQuestionForInference + "\". Do NOT substitute a different topic. Write ONE short sentence with: emotional tone (e.g. indignant, firm, calm, amused) + corrective action (challenge, correct, lecture, dismiss) + the subject from the situation above. Keep the subject label broad — e.g. 'incorrect claim about biology', 'moral stance on the matter', 'factual error on the topic'. Do NOT quote exact words " + name + " says. Use OTHER_CHARACTER as placeholder; must be included. 3rd person only.",
                        grammar: "root ::= " + JSON.stringify(name + " will ") + " [a-zA-Z0-9 ,;.'_\\n]+",
                    });

                    if (correction.done) {
                        throw new Error("Generator finished without producing output");
                    }

                    return replaceOtherCharNameWithPlaceholder(correction.value.trim(), name);
                },
            )).value;

            newCharacterSection.body.push(`{`);
            newCharacterSection.body.push(`askPer: "conversing_character",`);
            newCharacterSection.body.push(`question: (info) => ${toTemplateLiteral(correctivenessQuestion, name)},`);
            newCharacterSection.body.push(`likelyhood: ${correctivenessQuestionLikelyhoodValue / 10},`);
            newCharacterSection.body.push(`correction: (info) => ${toTemplateLiteral(correctivenessCorrectionValue, name)},`);
            newCharacterSection.body.push(`},`);
        }

        newCharacterSection.body.push(`],`);
        newCharacterSection.body.push(`},`);
    }

    insertSpecialComment(newCharacterSection.body, "base-family-ties");
    newCharacterSection.body.push(`familyTies: {},`);

    {
        let nextFamilyMemberToAdd = "";
        let index = 0;
        do {
            nextFamilyMemberToAdd = (await guider.askOption("family-member-to-add-" + index, "Would you like to add a family member?", ["no", "parent", "sibling", "child", "spouse", "cousin", "uncle",
                "aunt", "grandparent", "grandchild", "niece", "nephew", "other", "step parent", "step child", "step sibling", "half sibling", "step grandparent", "step grandchild"], "no")).value;
            if (nextFamilyMemberToAdd && nextFamilyMemberToAdd !== "no") {
                const familyMemberName = (await guider.askOpen("family-member-to-add-" + index + "-name", "What is the name of the " + nextFamilyMemberToAdd + "?", "")).value;
                const familyMemberRelation = nextFamilyMemberToAdd;

                onWorldClockReadySection.body.push(`DE.utils.newFamilyRelation(${JSON.stringify(name)}, ${JSON.stringify(familyMemberName)}, ${JSON.stringify(familyMemberRelation)})`);

                const wouldYouLikeToPreCreateBond = await guider.askBoolean(
                    "family-member-to-add-" + index + "-pre-create-bond",
                    "Would you like to pre-create a mutual bond between " + name + " and " + familyMemberName + "? if you don't they will consider each other as strangers unaware they are family",
                    false,
                );

                if (wouldYouLikeToPreCreateBond.value) {
                    const options = [
                        "sworn enemy",
                        "hostile",
                        "antagonistic",
                        "unfriendly",
                        "unpleasant",
                        "neutral",
                        "friendly",
                        "good relationship",
                        "close",
                        "best family relationship",
                    ];
                    const optionsValues = [
                        -75,
                        -45,
                        -25,
                        -15,
                        -5,
                        5,
                        15,
                        25,
                        45,
                        75,
                    ];
                    const bondType = await guider.askOption("family-member-to-add-" + index + "-bond-type", "What type of bond " + name + " and " + familyMemberName + " share?", options, "good relationship");
                    const bondValue = optionsValues[options.indexOf(bondType.value)];
                    onWorldClockReadySection.body.push(`DE.utils.newMutualBond(${JSON.stringify(name)}, ${JSON.stringify(familyMemberName)}, {stranger: false, bond: ${bondValue}, bond2: 0, knowsName: true, createdAt: DE.utils.timeShifter(DE.currentTime, {years: -DE.characters[${JSON.stringify(name)}].ageYears})})`);
                }
            }

            index++;
        } while (nextFamilyMemberToAdd !== "no");
    }

    {
        let nextRelationshipToAdd = false;
        let nextRelationshipIndex = 0;
        do {
            nextRelationshipToAdd = (await guider.askBoolean("non-family-relationship-" + nextRelationshipIndex, "Would you like to add a non-family relationship?", false)).value;
            if (nextRelationshipToAdd) {
                const relationshipTargetName = (await guider.askOpen("non-family-relationship-" + nextRelationshipIndex + "-name", "What is the name of the person/animal/creature that relationship is shared with?", "")).value;

                const options = [
                    "stranger",

                    "sworn enemy",
                    "hostile",
                    "antagonistic",
                    "unfriendly",
                    "unpleasant",
                    "neutral",
                    "friends",
                    "good friends",
                    "close friends",
                    "best friends",
                ];
                const optionsWithPerCharacter = [
                    ...options,
                    "select per character (each character sees the other differently)",
                ];
                const optionsValues = [
                    null,

                    -75,
                    -45,
                    -25,
                    -15,
                    -5,
                    5,
                    15,
                    25,
                    45,
                    75,
                ];

                const bondType = await guider.askOption("non-family-relationship-" + nextRelationshipIndex + "-bond-type", "What type of bond " + name + " and " + relationshipTargetName + " share?", optionsWithPerCharacter, "friends");

                /**
                 * @type {number | null}
                 */
                let bondValueForCharacter = null;
                /**
                 * @type {number | null}
                 */
                let bondValueForTarget = null;

                if (bondType.value === "select per character (each character sees the other differently)") {
                    const bondTypeForCharacter = await guider.askOption("non-family-relationship-" + nextRelationshipIndex + "-bond-type-for-character", "How does " + name + " see " + relationshipTargetName + "?", options, "friends");
                    const bondTypeForTarget = await guider.askOption("non-family-relationship-" + nextRelationshipIndex + "-bond-type-for-target", "How does " + relationshipTargetName + " see " + name + "?", options, "friends");
                    bondValueForCharacter = optionsValues[options.indexOf(bondTypeForCharacter.value)];
                    bondValueForTarget = optionsValues[options.indexOf(bondTypeForTarget.value)];
                } else {
                    const bondValue = optionsValues[options.indexOf(bondType.value)];
                    bondValueForCharacter = bondValue;
                    bondValueForTarget = bondValue;
                }

                /**
                 * @type {number}
                 */
                let bond2ValueForCharacter = 0;
                /**
                 * @type {number}
                 */
                let bond2ValueForTarget = 0;

                const bond2Options = [
                    "no romantic interest",
                    "mutual slight romantic interest",
                    "mutual romantic interest",
                    "mutual strong romantic interest",
                    "mutually deep in love",
                ];

                const bond2OptionsWithPerCharacter = [
                    ...bond2Options,
                    "select per character (each character sees the other differently)",
                ];

                const bond2Values = [
                    0,
                    15,
                    25,
                    40,
                    75,
                ];

                const bond2Type = await guider.askOption("non-family-relationship-" + nextRelationshipIndex + "-bond2-type", "What type of romantic bond " + name + " and " + relationshipTargetName + " share?", bond2OptionsWithPerCharacter, "no romantic interest");

                if (bond2Type.value === "select per character (each character sees the other differently)") {
                    const bond2TypeForCharacter = await guider.askOption("non-family-relationship-" + nextRelationshipIndex + "-bond2-type-for-character", "How does " + name + " see " + relationshipTargetName + " romantically?", bond2Options, "no romantic interest");
                    const bond2TypeForTarget = await guider.askOption("non-family-relationship-" + nextRelationshipIndex + "-bond2-type-for-target", "How does " + relationshipTargetName + " see " + name + " romantically?", bond2Options, "no romantic interest");
                    bond2ValueForCharacter = bond2Values[bond2Options.indexOf(bond2TypeForCharacter.value)];
                    bond2ValueForTarget = bond2Values[bond2Options.indexOf(bond2TypeForTarget.value)];
                } else {
                    const bond2Value = bond2Values[bond2Options.indexOf(bond2Type.value)];
                    bond2ValueForCharacter = bond2Value;
                    bond2ValueForTarget = bond2Value;
                }

                const bondTimeInYears = await guider.askNumber("non-family-relationship-" + nextRelationshipIndex + "-bond-time", "How many years has " + name + " known " + relationshipTargetName + "?", 1);

                onWorldClockReadySection.body.push(`DE.utils.newBond(${JSON.stringify(name)}, ${JSON.stringify(relationshipTargetName)}, {stranger: ${JSON.stringify(bondValueForCharacter === null)}, bond: ${bondValueForCharacter || 0}, bond2: ${bond2ValueForCharacter}, knowsName: true, createdAt: DE.utils.timeShifter(DE.currentTime, {years: -${bondTimeInYears}})}, {forceOverride: true});`);
                onWorldClockReadySection.body.push(`DE.utils.newBond(${JSON.stringify(relationshipTargetName)}, ${JSON.stringify(name)}, {stranger: ${JSON.stringify(bondValueForTarget === null)}, bond: ${bondValueForTarget || 0}, bond2: ${bond2ValueForTarget}, knowsName: true, createdAt: DE.utils.timeShifter(DE.currentTime, {years: -${bondTimeInYears}})});`);
            }
        } while (nextRelationshipToAdd);

        unshiftSpecialComment(onWorldClockReadySection.body, "base-relationships");
    }

    {
        const guidedSpecies = (await guider.askOpen("species", "What species is " + name + "?", async () => {
            await prime();
            const species = await generator.next({
                maxCharacters: 50,
                maxSafetyCharacters: 0,
                maxParagraphs: 1,
                nextQuestion: "What species is " + name + "? answer in lowercase",
                stopAfter: [],
                stopAt: [],
                grammar: "root ::= [a-z ]+",
                instructions: "If the character is a regular human answer human, if the character is a regular animal answer with the type of animal like dog, cat, horse, etc; if the character is a creature or fantasy being answer with the type of creature like dragon, fairy, alien, etc",
            });

            if (species.done) {
                throw new Error("Generator finished without producing output");
            }

            let actualSpecies = species.value.trim().toLowerCase();

            if (actualSpecies !== "human") {
                await prime();
                const isAnthro = await generator.next({
                    maxCharacters: 5,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "Is " + name + " an anthropomorphic character/animal with human-like traits and characteristics? Answer with yes or no.",
                    stopAfter: [],
                    stopAt: [],
                    grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`,
                    instructions: "Some examples include beastmen, furry characters, and animals with human-like features or abilities. If the character is a regular human answer no, if the character is a regular animal answer no, if the character is an anthropomorphic animal or creature answer yes",
                });

                if (isAnthro.done) {
                    throw new Error("Generator finished without producing output");
                }

                const isAnthroValue = isAnthro.value.trim().toLowerCase() === "yes";

                if (isAnthroValue) {
                    actualSpecies = "anthro " + actualSpecies;
                }
            }

            return actualSpecies;
        })).value.trim().toLowerCase();

        const guidedSpeciesType = (await guider.askOption(
            "species-type",
            "What species type is " + name + "?",
            ["humanoid", "feral", "animal"],
            async () => {
                if (guidedSpecies === "human") {
                    return "humanoid";
                } else if (guidedSpecies.startsWith("anthro ")) {
                    return "humanoid";
                } else {
                    await prime();
                    const isFeral = await generator.next({
                        maxCharacters: 5,
                        maxSafetyCharacters: 0,
                        maxParagraphs: 1,
                        nextQuestion: "Is " + name + " an animal that walks in 4 legs but possesses human level intelligence and is capable of communicating with others through verbal language? Answer with yes or no.",
                        stopAfter: [],
                        stopAt: [],
                        grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`,
                        instructions: "If the character is a regular animal that walks on 4 legs and does not have human level intelligence or the ability to communicate with others through verbal language answer no, if the character is an animal that walks on 4 legs but has human level intelligence and can communicate with others through verbal language answer yes",
                    });

                    if (isFeral.done) {
                        throw new Error("Generator finished without producing output");
                    }

                    return isFeral.value.trim().toLowerCase() === "yes" ? "feral" : "animal";
                }
            },
        )).value;

        insertSpecialComment(newCharacterSection.body, "base-species");
        newCharacterSection.body.push(`species: ${JSON.stringify(guidedSpecies)},`);
        newCharacterSection.body.push(`speciesType: "${guidedSpeciesType}",`);

        metadataSection.body.push(`species: ${JSON.stringify(guidedSpecies)},`);
        metadataSection.body.push(`speciesType: "${guidedSpeciesType}",`);
    }

    {
        let speciesCantBe = scriptgenerator.state["species"] || "none";
        if (speciesCantBe.split(" ").length > 1) {
            const lastWord = speciesCantBe.split(" ").slice(-1)[0];
            speciesCantBe = lastWord;
        }

        /**
         * @type {string | null}
         */
        let raceValue = (await guider.askOpen(
            "race",
            "What race is " + name + "?",
            async () => {
                await prime();
                const race = await generator.next({
                    maxCharacters: 50,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "What race is " + name + "? answer in lowercase",
                    stopAfter: [],
                    stopAt: [],
                    grammar: "root ::= [a-z ]+",
                    instructions: "If the character has no racial identity answer with none, IMPORTANT: the racial identity cannot be " + JSON.stringify(speciesCantBe) + ", answer with none if no further known.",
                });

                if (race.done) {
                    throw new Error("Generator finished without producing output");
                }

                return race.value.trim().toLowerCase();
            },
        )).value.trim().toLowerCase();

        if (!raceValue || raceValue === "" || raceValue === "none" || raceValue === "n/a") {
            raceValue = null;
        }
        insertSpecialComment(newCharacterSection.body, "base-race");
        newCharacterSection.body.push(`race: ${JSON.stringify(raceValue)},`);
    }

    {
        const finalGroupBelongingValue = (await guider.askList(
            "group-belonging",
            "Does " + name + " belong to any specific group, organization, team, family, etc? if so which ones?",
            null,
            async () => {
                await prime();
                const groupBelonging = await generator.next({
                    maxCharacters: 50,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "Does " + name + " belong to any specific group, organization, team, family, etc? if so which one? answer with the name of the group or organization in lowercase, if they don't belong to any group answer with none",
                    stopAfter: [],
                    stopAt: [],
                    grammar: "root ::= [a-z ]+ | \"none\"",
                });

                if (groupBelonging.done) {
                    throw new Error("Generator finished without producing output");
                }

                return [groupBelonging.value.trim().toLowerCase()].filter(item => item !== "" && item !== "none" && item !== "n/a");
            },
        )).value.map(item => item.trim().toLowerCase()).filter(item => item !== "" && item !== "none" && item !== "n/a");

        insertSpecialComment(newCharacterSection.body, "base-group-belonging");
        if (finalGroupBelongingValue.length > 0) {
            newCharacterSection.body.push(`groupBelonging: [],`);
        } else {
            newCharacterSection.body.push(`groupBelonging: ${JSON.stringify(finalGroupBelongingValue)},`);
        }
    }

    {
        const dislikeSpeciesPrejudice = await guider.askList("prejudices-species", "Is " + name + " prejudiced against any species? if so which ones?", null, async () => []);
        const dislikeSpeciesPrejudiceValue = dislikeSpeciesPrejudice.value.map(item => item.trim().toLowerCase()).filter(item => item !== "" && item !== "none" && item !== "n/a");
        insertSpecialComment(newCharacterSection.body, "base-prejudices-species");
        newCharacterSection.body.push(`dislikesSpecies: ${JSON.stringify(dislikeSpeciesPrejudiceValue)}, // Up to you to make the character prejudiced against certain species`);
    }

    {
        const dislikeRacesPrejudice = await guider.askList("prejudices-races", "Is " + name + " prejudiced against any races? if so which ones?", null, async () => []);
        const dislikeRacesPrejudiceValue = dislikeRacesPrejudice.value.map(item => item.trim().toLowerCase()).filter(item => item !== "" && item !== "none" && item !== "n/a");
        insertSpecialComment(newCharacterSection.body, "base-prejudices-races");
        newCharacterSection.body.push(`dislikesRaces: ${JSON.stringify(dislikeRacesPrejudiceValue)}, // Up to you to make the character racist`);
    }

    {
        const dislikeGroupsPrejudice = await guider.askList("prejudices-groups", "Is " + name + " prejudiced against any groups, organizations, teams, families, etc?", null, async () => []);
        const dislikeGroupsPrejudiceValue = dislikeGroupsPrejudice.value.map(item => item.trim().toLowerCase()).filter(item => item !== "" && item !== "none" && item !== "n/a");
        insertSpecialComment(newCharacterSection.body, "base-prejudices-groups");
        newCharacterSection.body.push(`dislikesGroups: ${JSON.stringify(dislikeGroupsPrejudiceValue)}, // Up to you to make the character prejudiced against certain groups`);
    }

    {
        const isAsexualValue = (await guider.askBoolean(
            "asexual",
            "Is " + name + " asexual, not sexually attracted to anyone?",
            async () => {
                await prime();
                const isAsexual = await generator.next({
                    maxCharacters: 5,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "Is " + name + " asexual, not sexually attracted to anyone? Answer with yes or no.",
                    stopAfter: [],
                    stopAt: [],
                    grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`,
                });

                if (isAsexual.done) {
                    throw new Error("Generator finished without producing output");
                }

                return isAsexual.value.trim().toLowerCase() === "yes";
            },
        )).value;

        const age = scriptgenerator.state["age-years"];
        const speciesType = scriptgenerator.state["species-type"] || "none";
        const species = scriptgenerator.state["species"] || "none";

        let minAgeAttractionPotential = (age / 2) + 7; // the half your age plus seven rule is a common rule of thumb for the minimum age of attraction
        if (minAgeAttractionPotential < age) {
            // what is this a kid?... eh I guess it could be a dog or something.
            minAgeAttractionPotential = Math.floor(age) - 1;
        }

        if (!isAsexualValue) {
            minAgeAttractionPotential = (await guider.askNumber(
                "min-age-attraction",
                "What is the minimum age of attraction for " + name + "?",
                async () => minAgeAttractionPotential,
            )).value;
        }

        let maxAgeAttractionPotential = age + 10;
        if (speciesType === "humanoid" && age <= 18) {
            maxAgeAttractionPotential = age + 3; // for very young characters we can make the max age of attraction closer to their age since it's more likely they would be attracted to people closer to their age
        }

        if (!isAsexualValue) {
            maxAgeAttractionPotential = (await guider.askNumber(
                "max-age-attraction",
                "What is the maximum age of attraction for " + name + "?",
                async () => maxAgeAttractionPotential,
            )).value;
        }

        /**
         * @param {string} which
         */
        const determineOnePickiness = async (which) => {
            const options = [
                "Very open",
                "Somewhat open",
                "Neutral",
                "Somewhat picky",
                "Very picky",
            ];

            const optionsExplained = [
                "Very open (very open to being attracted to a wide range of characters)",
                "Somewhat open (somewhat open to being attracted to a wide range of characters)",
                "Neutral (not particularly picky or open, has a moderate range of attraction)",
                "Somewhat picky (only attracted to someone moderately attractive)",
                "Very picky (only attracted to the most handsome and attractive characters)",
            ];

            const pickinessValues = [
                0.1,
                0.3,
                0.5,
                0.7,
                0.9,
            ];

            const pickinessOption = (await guider.askOption(
                "pickiness-" + which.replace(/[^a-z0-9]/gi, "-").toLowerCase(),
                "How picky is " + name + " towards having an attraction towards " + which + "?\n" + optionsExplained.map((option, index) => `\n${index + 1}. ${option}`).join(""),
                options,
                async () => {
                    await prime();
                    const howPickyValue = await generator.next({
                        maxCharacters: 5,
                        maxSafetyCharacters: 0,
                        maxParagraphs: 1,
                        nextQuestion: "How picky is " + name + " towards having an attraction towards " + which + "?",
                        stopAfter: [],
                        stopAt: [],
                        instructions: "Answer with one of the following options: " + optionsExplained.map((option, index) => `\n${index + 1}. ${option}`).join(""),
                        grammar: `root ::= "Very picky" | "Somewhat picky" | "Neutral" | "Somewhat open" | "Very open"`,
                    });

                    if (howPickyValue.done) {
                        throw new Error("Generator finished without producing output");
                    }

                    return howPickyValue.value.trim();
                },
            )).value;

            return pickinessValues[options.indexOf(pickinessOption)];
        };

        const attractionsSection = insertSection(newCharacterSection.body, "base-attractions", (s) => {
            s.head.push(`attractions: [`);
            s.foot.push(`],`);
        });

        if (isAsexualValue) {
            // no attractions
        } else {
            const findsAmbiguousGendersSexuallyAttractiveValue = (await guider.askBoolean(
                "pansexual",
                "Is " + name + " pansexual, bisexual or generally attracted to people regardless of their gender?",
                async () => {
                    await prime();
                    const findsAmbiguousGendersSexuallyAttractive = await generator.next({
                        maxCharacters: 5,
                        maxSafetyCharacters: 0,
                        maxParagraphs: 1,
                        nextQuestion: "Is " + name + " pansexual, bisexual or generally attracted to people regardless of their gender? Answer with yes or no.",
                        stopAfter: [],
                        stopAt: [],
                        grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`,
                    });

                    if (findsAmbiguousGendersSexuallyAttractive.done) {
                        throw new Error("Generator finished without producing output");
                    }

                    return findsAmbiguousGendersSexuallyAttractive.value.trim().toLowerCase() === "yes";
                },
            )).value;

            if (findsAmbiguousGendersSexuallyAttractiveValue) {
                const pickinessMale = await determineOnePickiness("males");
                const pickinessFemale = await determineOnePickiness("females");
                const pickinessAmbiguous = await determineOnePickiness("ambiguous genders");

                if (speciesType === "humanoid") {
                    attractionsSection.body.push(`{towards: "male", ageRange: [${minAgeAttractionPotential}, ${maxAgeAttractionPotential}], speciesType: "${speciesType}", "pickiness": ${pickinessMale}},`);
                    attractionsSection.body.push(`{towards: "female", ageRange: [${minAgeAttractionPotential}, ${maxAgeAttractionPotential}], speciesType: "${speciesType}", "pickiness": ${pickinessFemale}},`);
                    attractionsSection.body.push(`{towards: "ambiguous", ageRange: [${minAgeAttractionPotential}, ${maxAgeAttractionPotential}], speciesType: "${speciesType}", "pickiness": ${pickinessAmbiguous}},`);
                } else {
                    attractionsSection.body.push(`{towards: "male", ageRange: [${minAgeAttractionPotential}, ${maxAgeAttractionPotential}], species: "${species}", "pickiness": ${pickinessMale}},`);
                    attractionsSection.body.push(`{towards: "female", ageRange: [${minAgeAttractionPotential}, ${maxAgeAttractionPotential}], speciesType: "${speciesType}", "pickiness": ${pickinessFemale}},`);
                    attractionsSection.body.push(`{towards: "ambiguous", ageRange: [${minAgeAttractionPotential}, ${maxAgeAttractionPotential}], speciesType: "${speciesType}", "pickiness": ${pickinessAmbiguous}},`);
                }
            } else {
                const findsMalesSexuallyAttractiveValue = (await guider.askBoolean(
                    "finds-males-attractive",
                    "Does " + name + " find males sexually attractive?",
                    async () => {
                        await prime();
                        const findsMalesSexuallyAttractive = await generator.next({
                            maxCharacters: 5,
                            maxSafetyCharacters: 0,
                            maxParagraphs: 1,
                            nextQuestion: "Does " + name + " find males sexually attractive? Answer with yes or no.",
                            stopAfter: [],
                            stopAt: [],
                            grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`,
                        });

                        if (findsMalesSexuallyAttractive.done) {
                            throw new Error("Generator finished without producing output");
                        }

                        return findsMalesSexuallyAttractive.value.trim().toLowerCase() === "yes";
                    },
                )).value;

                let findsMalesSexuallyAttractiveLimitToSex = false;
                if (findsMalesSexuallyAttractiveValue) {
                    findsMalesSexuallyAttractiveLimitToSex = (await guider.askBoolean(
                        "finds-males-attractive-limit-to-sex",
                        "Is " + name + "'s attraction towards males limited to biological sex only?",
                        async () => false,
                    )).value;
                }

                const findsFemalesSexuallyAttractiveValue = (await guider.askBoolean(
                    "finds-females-attractive",
                    "Does " + name + " find females sexually attractive?",
                    async () => {
                        await prime();
                        const findsFemalesSexuallyAttractive = await generator.next({
                            maxCharacters: 5,
                            maxSafetyCharacters: 0,
                            maxParagraphs: 1,
                            nextQuestion: "Does " + name + " find females sexually attractive? Answer with yes or no.",
                            stopAfter: [],
                            stopAt: [],
                            grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`,
                        });

                        if (findsFemalesSexuallyAttractive.done) {
                            throw new Error("Generator finished without producing output");
                        }

                        return findsFemalesSexuallyAttractive.value.trim().toLowerCase() === "yes";
                    },
                )).value;

                let findsFemalesSexuallyAttractiveLimitToSex = false;
                if (findsFemalesSexuallyAttractiveValue) {
                    findsFemalesSexuallyAttractiveLimitToSex = (await guider.askBoolean(
                        "finds-females-attractive-limit-to-sex",
                        "Is " + name + "'s attraction towards females limited to biological sex only?",
                        async () => false,
                    )).value;
                }

                if (findsMalesSexuallyAttractiveValue) {
                    const pickinessMale = await determineOnePickiness("males");

                    if (speciesType === "humanoid") {
                        attractionsSection.body.push(`{towards: "male", pickiness: ${pickinessMale}, ageRange: [${minAgeAttractionPotential}, ${maxAgeAttractionPotential}], speciesType: "${speciesType}"${findsMalesSexuallyAttractiveLimitToSex ? ', sex: "male"' : ''}},`);
                    } else {
                        attractionsSection.body.push(`{towards: "male", pickiness: ${pickinessMale}, ageRange: [${minAgeAttractionPotential}, ${maxAgeAttractionPotential}], species: "${species}"${findsMalesSexuallyAttractiveLimitToSex ? ', sex: "male"' : ''}},`);
                    }
                }

                if (findsFemalesSexuallyAttractiveValue) {
                    const pickinessFemale = await determineOnePickiness("females");
                    if (speciesType === "humanoid") {
                        attractionsSection.body.push(`{towards: "female", pickiness: ${pickinessFemale}, ageRange: [${minAgeAttractionPotential}, ${maxAgeAttractionPotential}], speciesType: "${speciesType}"${findsFemalesSexuallyAttractiveLimitToSex ? ', sex: "female"' : ''}},`);
                    } else {
                        attractionsSection.body.push(`{towards: "female", pickiness: ${pickinessFemale}, ageRange: [${minAgeAttractionPotential}, ${maxAgeAttractionPotential}], species: "${species}"${findsFemalesSexuallyAttractiveLimitToSex ? ', sex: "female"' : ''}},`);
                    }
                }
            }
        }

        if (!isAsexualValue) {
            let indexAddExtraAttraction = 0;
            while (true) {
                const additionalAttractions = await guider.askBoolean("extra-attraction-" + indexAddExtraAttraction, "Would you like to add an attraction towards a specific species that isn't covered?", false);
                if (!additionalAttractions.value) {
                    break;
                } else {
                    const additionalAttractionSpecies = await guider.askOpen("extra-attraction-" + indexAddExtraAttraction + "-species", "What species is " + name + " attracted to?", "");
                    const additionalAttractionAgeRangeMin = await guider.askNumber("extra-attraction-" + indexAddExtraAttraction + "-age-min", "What is the minimum age of attraction for " + name + " towards a " + additionalAttractionSpecies.value + "?", minAgeAttractionPotential);
                    const additionalAttractionAgeRangeMax = await guider.askNumber("extra-attraction-" + indexAddExtraAttraction + "-age-max", "What is the maximum age of attraction for " + name + " towards a " + additionalAttractionSpecies.value + "?", maxAgeAttractionPotential);
                    const additionalAttractionGender = await guider.askOption("extra-attraction-" + indexAddExtraAttraction + "-gender", "What gender is " + name + " attracted to when it comes to a " + additionalAttractionSpecies.value + "?", ["male", "female", "ambiguous", "any"], "any");
                    const additionalAttractionSex = await guider.askOption("extra-attraction-" + indexAddExtraAttraction + "-sex", "Is " + name + "'s attraction towards a " + additionalAttractionSpecies.value + " limited to a specific biological sex?", ["male", "female", "intersex", "any"], "any");
                    const additionalAttractionPickiness = await determineOnePickiness(additionalAttractionGender.value + " belonging to the species " + additionalAttractionSpecies.value);
                    attractionsSection.body.push(`{towards: "${additionalAttractionGender.value}", pickiness: ${additionalAttractionPickiness}, ageRange: [${additionalAttractionAgeRangeMin.value}, ${additionalAttractionAgeRangeMax.value}], species: "${additionalAttractionSpecies.value}", "sex": "${additionalAttractionSex.value}"},`);
                }

                indexAddExtraAttraction++;
            }

            let indexAddExtraAttractionSpeciesGroup = 0;
            while (true) {
                const additionalAttractions = await guider.askBoolean("extra-attraction-species-group-" + indexAddExtraAttractionSpeciesGroup, "Would you like to add an attraction towards a specific species group that isn't covered?", false);
                if (!additionalAttractions.value) {
                    break;
                } else {
                    const additionalAttractionSpeciesGroup = await guider.askOption("extra-attraction-species-group-" + indexAddExtraAttractionSpeciesGroup + "-group", "What species group is " + name + " attracted to?", ["humanoid", "animal", "feral"].filter(v => v !== speciesType), "");
                    const additionalAttractionAgeRangeMin = await guider.askNumber("extra-attraction-species-group-" + indexAddExtraAttractionSpeciesGroup + "-age-min", "What is the minimum age of attraction for " + name + " towards a " + additionalAttractionSpeciesGroup.value + " creature?", minAgeAttractionPotential);
                    const additionalAttractionAgeRangeMax = await guider.askNumber("extra-attraction-species-group-" + indexAddExtraAttractionSpeciesGroup + "-age-max", "What is the maximum age of attraction for " + name + " towards a " + additionalAttractionSpeciesGroup.value + " creature?", maxAgeAttractionPotential);
                    const additionalAttractionGender = await guider.askOption("extra-attraction-species-group-" + indexAddExtraAttractionSpeciesGroup + "-gender", "What gender is " + name + " attracted to when it comes to a " + additionalAttractionSpeciesGroup.value + " creature?", ["male", "female", "ambiguous", "any"], "any");
                    const additionalAttractionSex = await guider.askOption("extra-attraction-species-group-" + indexAddExtraAttractionSpeciesGroup + "-sex", "Is " + name + "'s attraction towards a " + additionalAttractionSpeciesGroup.value + " creature limited to a specific biological sex?", ["male", "female", "intersex", "any"], "any");

                    /**
                     * @type {Record<string, string>}
                     */
                    const speciesGroupDefinedForPickiness = {
                        "humanoid": "a human or humanoid creature",
                        "animal": "a non-humanoid animal",
                        "feral": "a feral creature that walks on 4 legs but has human level intelligence and can communicate with others through verbal language",
                    }

                    const additionalAttractionPickiness = await determineOnePickiness("a " + additionalAttractionGender.value + " belonging to the species group " + speciesGroupDefinedForPickiness[additionalAttractionSpeciesGroup.value]);
                    attractionsSection.body.push(`{towards: "${additionalAttractionGender.value}", pickiness: ${additionalAttractionPickiness}, ageRange: [${additionalAttractionAgeRangeMin.value}, ${additionalAttractionAgeRangeMax.value}], speciesType: "${additionalAttractionSpeciesGroup.value}", "sex": "${additionalAttractionSex.value}"},`);
                }

                indexAddExtraAttractionSpeciesGroup++;
            }
        }
    }

    {
        const isAsexual = scriptgenerator.state["asexual"] || false;

        if (isAsexual) {
            insertSpecialComment(newCharacterSection.body, "base-libido");
            newCharacterSection.body.push(`libido: 0, // Since ${name} is asexual, they have no libido`);
            return;
        }

        const libidoValue = (await guider.askNumber(
            "libido",
            "From 1 to 10 how high is " + name + "'s libido? with 10 being extremely high and 1 being very low",
            async () => {
                await prime();
                const libidoValue = await generator.next({
                    maxCharacters: 100,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "How high is " + name + "'s libido? answer with \"very high\", \"somewhat high\", \"average\", \"somewhat low\" or \"very low\"",
                    stopAfter: [],
                    stopAt: [],
                    grammar: `root ::= "very high" | "somewhat high" | "average" | "somewhat low" | "very low"`,
                });

                if (libidoValue.done) {
                    throw new Error("Generator finished without producing output");
                }

                const mapping = {
                    "very high": 10,
                    "somewhat high": 7,
                    "average": 5,
                    "somewhat low": 3,
                    "very low": 1,
                };

                // @ts-ignore
                return mapping[libidoValue.value.trim().toLowerCase()];
            },
        )).value;

        insertSpecialComment(newCharacterSection.body, "base-libido");
        newCharacterSection.body.push(`libido: ${libidoValue / 10},`);
    }

    const socialSimulationSection = insertSection(newCharacterSection.body, "social-simulation", (s) => {
        s.head.push(`socialSimulation: {`);
        s.foot.push(`},`);
    });

    {
        const gossipValue = (await guider.askNumber(
            "gossip",
            "From 1 to 10 how much does " + name + " like gossip and talking about others? with 10 being loving gossip and always talking about others, and 1 being hating gossip and never talking about others",
            async () => {
                await prime();
                const gossipValue = await generator.next({
                    maxCharacters: 100,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "How much does " + name + " like gossip and talking about others? answer with \"loves gossip\", \"somewhat likes gossip\", \"average\", \"somewhat dislikes gossip\" or \"hates gossip\"",
                    stopAfter: [],
                    stopAt: [],
                    grammar: `root ::= "loves gossip" | "somewhat likes gossip" | "average" | "somewhat dislikes gossip" | "hates gossip"`,
                });

                if (gossipValue.done) {
                    throw new Error("Generator finished without producing output");
                }

                const mapping = {
                    "loves gossip": 10,
                    "somewhat likes gossip": 7,
                    "average": 5,
                    "somewhat dislikes gossip": 3,
                    "hates gossip": 1,
                };

                // @ts-ignore
                return mapping[gossipValue.value.trim().toLowerCase()];
            },
        )).value;

        insertSpecialComment(socialSimulationSection.body, "base-gossip");
        socialSimulationSection.body.push(`gossipTendency: ${gossipValue / 10},`);
    }

    {
        /**
         * @type {string[]}
         */
        let likesListParsedAndDeduped = [];
        const likesListAsked = await guider.askList(
            "likes-list",
            "List some hobbies, activities, interests, or conversation topics that " + name + " enjoys. Examples: swimming, cooking, cats, astronomy, music, gardening, chess",
            null,
            async () => {
                await prime();
                const likesList = await generator.next({
                    maxCharacters: 1000,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 10,
                    nextQuestion: "List some hobbies, activities, interests, or conversation topics that " + name + " enjoys, at most 10 things. Examples: swimming, cooking, cats, astronomy, music, gardening, chess",
                    stopAfter: [],
                    stopAt: [],
                    instructions: "Answer with a comma-separated list of single lowercase words representing concrete hobbies, activities, subjects, or things that " + name + " likes. Each entry must be a noun or activity like: swimming, reading, cats, magic, cooking, astronomy, horses, painting, archery. Do NOT include emotional states, interpersonal situations, or multi-word phrases. Just single-word nouns or activities separated by commas.",
                    grammar: "root ::= item moreItems\nmoreItems ::= \", \" item moreItems | \"\"\nitem ::= [A-Za-z ]+"
                });

                if (likesList.done) {
                    throw new Error("Generator finished without producing output");
                }

                return likesList.value.trim().split(",").filter(item => item.trim() !== "").map(item => item.trim())
                    .filter((item, index, self) => self.indexOf(item) === index); // trim items, filter out empty items and dedupe
            },
        );
        if (likesListAsked) {
            likesListParsedAndDeduped = likesListAsked.value.map(item => item.trim().toLowerCase().split(" ").map(word => word.trim()).filter(word => word !== "").join(" ")).filter(item => item !== "").filter((item, index, self) => self.indexOf(item) === index);
        }

        insertSpecialComment(newCharacterSection.body, "base-likes");
        newCharacterSection.body.push(`likes: ${JSON.stringify(likesListParsedAndDeduped)}, // These are ids that need to be specified for the social simulation`);
    }

    {
        /**
         * @type {string[]}
         */
        let dislikesListParsedAndDeduped = [];

        const likes = scriptgenerator.state["likes-list"];

        const dislikesListAsked = await guider.askList(
            "dislikes-list",
            "List some hobbies, activities, interests, or conversation topics that " + name + " dislikes. Examples: swimming, cooking, cats, politics, math, spiders, crowds",
            null,
            async () => {
                await prime();
                const dislikesList = await generator.next({
                    maxCharacters: 1000,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 10,
                    nextQuestion: "List some hobbies, activities, interests, or conversation topics that " + name + " dislikes, at most 10 things. Examples: swimming, cooking, cats, politics, math, spiders, crowds",
                    stopAfter: [],
                    stopAt: [],
                    instructions: "Answer with a comma-separated list of single lowercase words representing concrete hobbies, activities, subjects, or things that " + name + " dislikes. Each entry must be a noun or activity like: swimming, math, spiders, crowds, politics, mornings, heights, snakes, thunder. Do NOT include emotional states, interpersonal situations, or multi-word phrases. Just single-word nouns or activities separated by commas.",
                    grammar: "root ::= item moreItems\nmoreItems ::= \", \" item moreItems | \"\"\nitem ::= [A-Za-z ]+"
                });

                if (dislikesList.done) {
                    throw new Error("Generator finished without producing output");
                }

                return dislikesList.value.trim().split(",").filter(item => item.trim() !== "").map(item => item.trim())
                    .filter((item, index, self) => self.indexOf(item) === index) // trim items, filter out empty items and dedupe
                    .filter(item => !likes.includes(item)); // ensure there is no overlap with likes
            },
        );
        if (dislikesListAsked) {
            dislikesListParsedAndDeduped = dislikesListAsked.value.map(item => item.trim().toLowerCase().split(" ").map(word => word.trim()).filter(word => word !== "").join(" ")).filter(item => item !== "").filter((item, index, self) => self.indexOf(item) === index).filter(item => !likes.includes(item));
        }

        insertSpecialComment(newCharacterSection.body, "base-dislikes");
        newCharacterSection.body.push(`dislikes: ${JSON.stringify(dislikesListParsedAndDeduped)}, // These are ids that need to be specified for the social simulation`);
    }

    if (primed) {
        await generator.next(null); // end the generator
    }
}