import { DEngine } from '../engine/index.js';
import { emotions } from '../engine/util/emotions.js';
import { createGrammarListFromList } from '../engine/util/grammar.js';
import { createCardStructureFrom, getJsCard } from './base.js';

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
 * @param {string} source
 * @param {import('./base.js').CardTypeGuider | null} guider
 * @return {Promise<string>}
 */
export async function generateBase(engine, source, guider) {
    const card = createCardStructureFrom('');
    card.card = source;

    card.imports.push(`const fss = await importScript("bond-systems", "full-standard-bond-system");`);
    card.imports.push(`await importScript("bond-systems", "deteriorating-bonds");`);

    card.head.push(`engine.exports = {`);
    card.head.push(`type: "characters",`);
    card.head.push(`initialize(DE) {`);

    card.foot.push(`},`);
    card.foot.push(`};`);

    const inferenceAdapter = engine.inferenceAdapter;
    if (!inferenceAdapter) {
        throw new Error("No inference adapter found on engine");
    }

    const systemPrompt = inferenceAdapter.buildSystemPromptForQuestioningAgent(
        `You are a helpful assistant that will answer and assist in defining a character for a game based on their description, you are allowed free rein to interpret the character's description and generate the code that defines them in the game, you will be asked questions about the character and you should answer them as best as you can`,
        [],
        `# Character Card:\n\n${source}`
    );

    const generator = inferenceAdapter.runQuestioningCustomAgentOn("cardtype-gen", {
        contextInfoAfter: null,
        contextInfoBefore: null,
        messages: [],
        system: systemPrompt,
    });

    // prime the generator
    const ready = await generator.next();
    if (ready.done) {
        throw new Error("Generator finished without producing output");
    }

    const answer = await generator.next({
        maxCharacters: 20,
        maxSafetyCharacters: 20,
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

    const name = answer.value.trim();

    card.body.push(`DE.utils.newCharacter(DE, fss.setup(DE, {`);
    card.body.push(`name: ${JSON.stringify(name)},`);

    let specialInstructions = guider ? (await guider.askOpen("Provide any special focus instructions for defining " + name + "'s appearance, personality, or abilities, what to focus on (do not talk about clothing the description is about the character's inherent traits and features)")).value : null;
    if (specialInstructions) {
        specialInstructions = ". " + specialInstructions.trim();
    }

    const answerDescription = await generator.next({
        maxCharacters: 3000,
        maxSafetyCharacters: 0,
        maxParagraphs: 10,
        nextQuestion: "Describe " + name + "'s appearance, personality, and any special traits or abilities they have.",
        stopAfter: [],
        stopAt: [],
        instructions: "Be creative, answer with a detailed description of " + name +
            "'s general appearance, personality, and any special traits or abilities they have. Use multiple paragraphs and sentences. Do not include items of clothing or specific equipment, just the character's inherent traits and features. Make at least 3 paragraphs" + (specialInstructions || ""),
    });

    if (answerDescription.done) {
        throw new Error("Generator finished without producing output");
    }

    const description = replaceAllCharNameWithPlaceholder(answerDescription.value.trim(), name);
    card.body.push(`general: DE.utils.newHandlebarsTemplate(DE, ${JSON.stringify(description)}),`);

    let specialInstructionsForShortDescription = guider ? (await guider.askOpen("Provide any special focus instructions for defining " + name + "'s external and physical description, what to focus on (do not talk about clothing the description is about the character's inherent traits and features)")).value : null;
    if (specialInstructionsForShortDescription) {
        specialInstructionsForShortDescription = ". " + specialInstructionsForShortDescription.trim();
    }

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

    const shortDescription = answerShortDescription.value.trim();
    card.body.push(`shortDescription: ${JSON.stringify(shortDescription)},`);

    let specialInstructionsForShortDescriptionAdd = guider ? (await guider.askOpen("Provide any special focus instructions for defining the additions to " + name + "'s short description when they are not wearing any upper body clothing, what to focus on (how to describe their upper body's most distinctive features)")).value : null;
    if (specialInstructionsForShortDescriptionAdd) {
        specialInstructionsForShortDescriptionAdd = ". " + specialInstructionsForShortDescriptionAdd.trim();
    }

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

    const shortDescriptionTopNakedAdd = answerShortDescriptionTopNakedAdd.value.trim();
    card.body.push(`shortDescriptionTopNakedAdd: ${JSON.stringify(shortDescriptionTopNakedAdd)},`);

    let specialInstructionsForShortDescriptionBottomAdd = guider ? (await guider.askOpen("Provide any special focus instructions for defining the additions to " + name + "'s short description when they are not wearing any lower body clothing, what to focus on (how to describe their lower body's most distinctive features)")).value : null;
    if (specialInstructionsForShortDescriptionBottomAdd) {
        specialInstructionsForShortDescriptionBottomAdd = ". " + specialInstructionsForShortDescriptionBottomAdd.trim();
    }

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

    const shortDescriptionBottomNakedAdd = answerShortDescriptionBottomNakedAdd.value.trim();
    card.body.push(`shortDescriptionBottomNakedAdd: ${JSON.stringify(shortDescriptionBottomNakedAdd)},`);

    card.body.push(`generalCharacterDescriptionInjection: {},`);
    card.body.push(`actionPromptInjection: [],`);
    card.body.push(`bonds: null,`);
    card.body.push(`characterRules: {},`);

    card.body.push(`states: {},`);
    card.body.push(`emotions: {`);

    const emotionsGrammar = createGrammarListFromList(engine, emotions, 7);

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

    const commonEmotionsList = commonEmotions.value.trim().split(",").map(e => e.trim().toLowerCase()).filter(e =>
        // @ts-ignore
        emotions.includes(e)
    ).filter((e, i, arr) => arr.indexOf(e) === i); // remove duplicates

    for (const emotion of commonEmotionsList) {
        card.body.push(`${emotion}: {`);
        card.body.push(`common: true,`);
        card.body.push(`},`);
    }

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

    const uncommonEmotionsList = uncommonEmotions.value.trim().split(",").map(e => e.trim().toLowerCase()).filter(e =>
        // @ts-ignore
        emotions.includes(e)
    ).filter((e, i, arr) => arr.indexOf(e) === i); // remove duplicates

    for (const emotion of uncommonEmotionsList) {
        if (commonEmotionsList.includes(emotion)) continue;
        card.body.push(`${emotion}: {`);
        card.body.push(`uncommon: true,`);
        card.body.push(`},`);
    }

    card.body.push(`},`);

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

    let schizophrenia = hasSchizophrenia.value.trim().toLowerCase() === "yes" ? 1 : 0;

    if (guider) {
        const isActuallySchizophrenic = await guider.askBoolean(name + " seems to have schizophrenia, is that correct?", schizophrenia === 1);
        if (!isActuallySchizophrenic) {
            schizophrenia = 0;
        } else {
            schizophrenia = 1;
        }
    }

    if (schizophrenia) {
        let severityStr = "";
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
        severityStr = schizophreniaSeverity.value.trim().toLowerCase();

        const howSevere = guider ? await guider.askOption("How severe is the schizophrenia?", ["mild", "moderate", "severe", "guess"]) : null;

        severityStr = howSevere ? howSevere.value.trim().toLowerCase() : severityStr;

        let severity = 0;
        if (severityStr === "mild") severity = 0.33;
        else if (severityStr === "moderate") severity = 0.66;
        else if (severityStr === "severe") severity = 1;

        card.body.push(`schizophrenia: ${severity},`);

        let specialInstructionsForVoiceDescription = guider ? (await guider.askOpen("Provide any special focus instructions for defining the description of the voice that " + name + " hears as part of their schizophrenia, what to focus on (how to describe the voice and its interactions with " + name + ")")).value : null;
        if (specialInstructionsForVoiceDescription) {
            specialInstructionsForVoiceDescription = ". " + specialInstructionsForVoiceDescription.trim();
        }

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

        const voiceDescription = replaceAllCharNameWithPlaceholder(schizophrenicVoiceDescription.value.trim(), name);
        card.body.push(`schizophrenicVoiceDescription: DE.utils.newHandlebarTemplate(${JSON.stringify(voiceDescription)}),`);
    } else {
        card.body.push(`schizophrenia: 0,`);
        card.body.push(`schizophrenicVoiceDescription: "",`);
    }

    const hasAutism = await generator.next({
        maxCharacters: 5,
        maxSafetyCharacters: 0,
        maxParagraphs: 1,
        nextQuestion: "Does " + name + " have autism? Answer with yes or no.",
        stopAfter: [],
        stopAt: [],
        grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`
    });

    if (hasAutism.done) {
        throw new Error("Generator finished without producing output");
    }

    let doesHaveAutism = hasAutism.value.trim().toLowerCase() === "yes";

    if (guider) {
        const isActuallyAutistic = await guider.askBoolean("Does " + name + " have autism?", doesHaveAutism);
        if (!isActuallyAutistic.value) {
            doesHaveAutism = false;
        } else {
            doesHaveAutism = true;
        }
    }

    if (doesHaveAutism) {

        let severityStr = "";
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

        severityStr = autismSeverity.value.trim().toLowerCase();

        const howSevere = guider ? await guider.askOption("How severe is " + name + "'s autism?", ["mild", "moderate", "severe"], severityStr) : null;

        severityStr = howSevere ? howSevere.value.trim().toLowerCase() : severityStr;

        let severity = 0;
        if (severityStr === "mild") severity = 0.33;
        else if (severityStr === "moderate") severity = 0.66;
        else if (severityStr === "severe") severity = 1;
        card.body.push(`autism: ${severity},`);
    } else {
        card.body.push(`autism: 0,`);
    }

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

    const carryingCapacityAsked = guider ? await guider.askNumber(
        "How many kilograms of weight could " + name + " lift? answer with an estimate number of kilograms that " + name + " could lift based on their physical description and traits. If you are unsure, provide your best guess.",
        parseInt(carryingCapacityKg.value.trim()),
    ) : null;

    const finalCarryingCapacity = carryingCapacityAsked ? carryingCapacityAsked.value : parseInt(carryingCapacityKg.value.trim());

    card.body.push(`carryingCapacityKg: ${finalCarryingCapacity},`);

    // double the volume of the potential weight lifted
    card.body.push(`carryingCapacityLiters: ${finalCarryingCapacity * 2},`);

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

    const heightCmAsked = guider ? await guider.askNumber(
        "How tall is " + name + "? answer with an estimate number of centimeters that " + name + " is tall based on their physical description and traits. If you are unsure, provide your best guess.",
        parseInt(heightCm.value.trim()),
    ) : null;

    const finalHeightCm = heightCmAsked ? heightCmAsked.value : parseInt(heightCm.value.trim());

    card.body.push(`heightCm: ${finalHeightCm},`);

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

    let isAmbiguousGender = isAmb.value.trim().toLowerCase() === "yes";
    if (guider) {
        const isActuallyAmbiguous = await guider.askBoolean("Does the character identify as agender, genderless or non-binary?", isAmbiguousGender);
        if (!isActuallyAmbiguous.value) {
            isAmbiguousGender = false;
        } else {
            isAmbiguousGender = true;
        }
    }

    if (isAmbiguousGender) {
        card.body.push(`gender: "ambiguous",`);
    } else {
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

        let isMaleValue = isMale.value.trim().toLowerCase() === "yes";

        if (guider) {
            const isActuallyMale = await guider.askBoolean("Does the character identify as male?", isMaleValue);
            if (!isActuallyMale.value) {
                isMaleValue = false;
            } else {
                isMaleValue = true;
            }
        }

        if (isMaleValue) {
            card.body.push(`gender: "male",`);
        } else {
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

            let isFemaleValue = isFemale.value.trim().toLowerCase() === "yes";

            if (guider) {
                const isActuallyFemale = await guider.askBoolean("Does the character identify as female?", isFemaleValue);
                if (!isActuallyFemale.value) {
                    isFemaleValue = false;
                } else {
                    isFemaleValue = true;
                }
            }

            if (isFemaleValue) {
                card.body.push(`gender: "female",`);
            } else {
                card.body.push(`gender: "ambiguous",`);
            }
        }
    }

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

    let hasNoSexValue = hasNoSex.value.trim().toLowerCase() === "yes";

    if (guider) {
        const isActuallySexless = await guider.askBoolean("Is " + name + " sexless as in they do not have a physical sex?", hasNoSexValue);
        if (!isActuallySexless.value) {
            hasNoSexValue = false;
        } else {
            hasNoSexValue = true;
        }
    }

    if (hasNoSexValue) {
        card.body.push(`sex: "none",`);
    } else {
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

        let isIntersexValue = isIntersex.value.trim().toLowerCase() === "yes";

        if (guider) {
            const isActuallyIntersex = await guider.askBoolean("Is " + name + " intersex?", isIntersexValue);
            if (!isActuallyIntersex.value) {
                isIntersexValue = false;
            } else {
                isIntersexValue = true;
            }
        }

        if (isIntersexValue) {
            card.body.push(`sex: "intersex",`);
        } else {
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

            const isMaleValue = isMale.value.trim().toLowerCase() === "yes";
            if (isMaleValue) {
                card.body.push(`sex: "male",`);
            } else {
                card.body.push(`sex: "female",`);
            }
        }
    }

    const sortedTiers = ["insect", "critter", "human", "apex", "street_level", "block_level", "city_level", "country_level", "continental", "planetary", "stellar", "galactic", "universal", "multiversal", "limitless"];

    const tierQuestions = {
        "insect": "Is " + name + " an insect or bug or as weak as one?",
        "critter": "Is " + name + " a small or weak creature?",
        "human": "Is " + name + " a human, humanoid or as strong as one?",
        "apex": "Is " + name + " an apex predator?",
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

    /**
     * @type {{[tier: string]: boolean}}
     */
    let tierAnswers = {};

    for (const [tier, question] of Object.entries(tierQuestions)) {
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

    let highestTier = sortedTiers.find(tier => tierAnswers[tier]);
    if (!highestTier) {
        highestTier = "human";
    }

    if (guider) {
        const guidedTier = await guider.askOption("What is " + name + "'s tier?", sortedTiers, highestTier);
        if (guidedTier) {
            highestTier = guidedTier.value;
        }
    }

    card.body.push(`tier: ${JSON.stringify(highestTier)},`);

    let tierValue = 50;
    /**
     * @type {number}
     */
    let range =
        // @ts-ignore
        tierToBaseRange[highestTier];

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

    let isBabyOrWeakened = answerIsBabyOrWeakened.value.trim().toLowerCase() === "yes";

    if (guider) {
        const isActuallyBabyOrWeakened = await guider.askBoolean(name + " seems to be a baby/cub or in a weakened state that makes them as weak as a baby in their power, is that correct?", isBabyOrWeakened);
        if (!isActuallyBabyOrWeakened.value) {
            isBabyOrWeakened = false;
        } else {
            isBabyOrWeakened = true;
        }
    }

    if (isBabyOrWeakened) {
        tierValue = 5;
        range = range / 10;
    } else {
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

        let isYoungOrWeakened = answerIsYoungOrWeakened.value.trim().toLowerCase() === "yes";
        if (guider) {
            const isActuallyYoungOrWeakened = await guider.askBoolean(name + " seems to be a child or in a weakened state (old, sick) that makes them as weak as a child in their power, is that correct?", isYoungOrWeakened);
            if (!isActuallyYoungOrWeakened.value) {
                isYoungOrWeakened = false;
            } else {
                isYoungOrWeakened = true;
            }
        }

        if (isYoungOrWeakened) {
            tierValue = 20;
            range = range / 2;
        } else {
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

            let isInPrime = answerIsInPrime.value.trim().toLowerCase() === "yes";
            if (guider) {
                const isActuallyInPrime = await guider.askBoolean(name + " seems to be in their prime state posessing incredible athletic features, is that correct?", isInPrime);
                if (!isActuallyInPrime.value) {
                    isInPrime = false;
                } else {
                    isInPrime = true;
                }
            }

            if (isInPrime) {
                tierValue = 90;
                range = range * 2;
            }
        }
    }

    card.body.push(`tierValue: ${tierValue},`);
    card.body.push(`powerGrowthRate: 0.25,`);

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

    let howOldYears = parseInt(answerHowOld.value.trim());

    if (guider) {
        const howOldAsked = await guider.askNumber(
            "How old is " + name + "?",
            howOldYears,
        );
        howOldYears = howOldAsked ? howOldAsked.value : howOldYears;
    }

    card.body.push(`ageYears: ${howOldYears},`);

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

    let weightKgValue = parseInt(weightKg.value.trim());

    if (guider) {
        const weightKgAsked = await guider.askNumber(
            "How much does " + name + " weight? answer with an estimate number of kilograms that " + name + " weights based on their physical description and traits.",
            weightKgValue,
        );
        weightKgValue = weightKgAsked ? weightKgAsked.value : weightKgValue;
    }

    card.body.push(`weightKg: ${weightKgValue},`);

    let initiative = 0.25;
    let strangerInitiative = 0.05;
    let strangerRejection = 0;

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

    let highInitiativeValue = hightInitiative.value.trim().toLowerCase() === "yes";
    
    if (guider) {
        const isActuallyHighInitiative = await guider.askBoolean("Does " + name + " have high initiative to take action in any situation? especially social scenarios?", highInitiativeValue);
        if (!isActuallyHighInitiative.value) {
            highInitiativeValue = false;
        } else {
            highInitiativeValue = true;
        }
    }

    if (highInitiativeValue) {
        initiative = 0.5;
        strangerInitiative = 0.1;
        strangerRejection = 0;
    } else {
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

        let annoyinglySocialValue = annoyinglySocial.value.trim().toLowerCase() === "yes";

        if (guider) {
            const isActuallyAnnoyinglySocial = await guider.askBoolean("Is " + name + " annoyingly social, always trying to interact with others and be the center of attention?", annoyinglySocialValue);
            if (!isActuallyAnnoyinglySocial.value) {
                annoyinglySocialValue = false;
            } else {
                annoyinglySocialValue = true;
            }
        }

        if (annoyinglySocialValue) {
            initiative = 0.75;
            strangerInitiative = 0.3;
            strangerRejection = 0;
        } else {
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

            let shyValue = shy.value.trim().toLowerCase() === "yes";

            if (guider) {
                const isActuallyShy = await guider.askBoolean("Is " + name + " shy and reserved, preferring to stay in the background and avoid social interactions?", shyValue);
                if (!isActuallyShy.value) {
                    shyValue = false;
                } else {
                    shyValue = true;
                }
            }

            if (shyValue) {
                initiative = 0.1;
                strangerInitiative = 0;
                strangerRejection = 0.2;
            } else {
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

                let completelyAsocialValue = completelyAsocial.value.trim().toLowerCase() === "yes";

                if (guider) {
                    const isActuallyCompletelyAsocial = await guider.askBoolean("Is " + name + " completely asocial, having no interest in interacting with others at all and preferring complete isolation?", completelyAsocialValue);
                    if (!isActuallyCompletelyAsocial.value) {
                        completelyAsocialValue = false;
                    } else {
                        completelyAsocialValue = true;
                    }
                }

                if (completelyAsocialValue) {
                    initiative = 0;
                    strangerInitiative = 0;
                    strangerRejection = 0.5;
                }
            }
        }
    }

    card.body.push(`initiative: ${initiative},`);
    card.body.push(`strangerInitiative: ${strangerInitiative},`);
    card.body.push(`strangerRejection: ${strangerRejection},`);
    card.body.push(`maintenanceCaloriesPerDay: 2000,`);
    card.body.push(`maintenanceHydrationLitersPerDay: 2,`);
    card.body.push(`rangeMeters: ${range},`);
    card.body.push(`locomotionSpeedMetersPerSecond: ${range * 0.0015},`);

    const stealthValue = await generator.next({
        maxCharacters: 5,
        maxSafetyCharacters: 0,
        maxParagraphs: 1,
        nextQuestion: "From 1 to 10 how stealthy is " + name + "? with 10 being extremely stealthy and 1 being not stealthy at all",
        stopAfter: [],
        stopAt: [],
        grammar: "root ::= [1-9] | \"10\"",
    });

    if (stealthValue.done) {
        throw new Error("Generator finished without producing output");
    }

    if (guider) {
        const stealthValueAsked = await guider.askNumber(
            "From 1 to 10 how stealthy is " + name + "? with 10 being extremely stealthy and 1 being not stealthy at all",
            parseInt(stealthValue.value.trim()),
        );
        if (stealthValueAsked) {
            stealthValue.value = stealthValueAsked.value.toString();
        }
    }

    card.body.push(`stealth: ${parseInt(stealthValue.value.trim()) / 10},`);

    const perceptionValue = await generator.next({
        maxCharacters: 5,
        maxSafetyCharacters: 0,
        maxParagraphs: 1,
        nextQuestion: "From 1 to 10 how perceptive is " + name + "? with 10 being extremely perceptive and 1 being lost and clueless all the time",
        stopAfter: [],
        stopAt: [],
        grammar: "root ::= [1-9] | \"10\"",
    });

    if (perceptionValue.done) {
        throw new Error("Generator finished without producing output");
    }

    if (guider) {
        const perceptionValueAsked = await guider.askNumber(
            "From 1 to 10 how perceptive is " + name + "? with 10 being extremely perceptive and 1 being lost and clueless all the time",
            parseInt(perceptionValue.value.trim()),
        );
        if (perceptionValueAsked) {
            perceptionValue.value = perceptionValueAsked.value.toString();
        }
    }

    card.body.push(`perception: ${parseInt(perceptionValue.value.trim()) / 10},`);

    const heroismValue = await generator.next({
        maxCharacters: 5,
        maxSafetyCharacters: 0,
        maxParagraphs: 1,
        nextQuestion: "From 1 to 10 how heroic is " + name + "? with 10 being extremely heroic and always taking on threats and challenges, and 1 being more passive and avoiding trouble",
        stopAfter: [],
        stopAt: [],
        grammar: "root ::= [1-9] | \"10\"",
    });

    if (heroismValue.done) {
        throw new Error("Generator finished without producing output");
    }

    if (guider) {
        const heroismValueAsked = await guider.askNumber(
            "From 1 to 10 how heroic is " + name + "? with 10 being extremely heroic and always taking on threats and challenges, and 1 being more passive and avoiding trouble",
            parseInt(heroismValue.value.trim()),
        );
        if (heroismValueAsked) {
            heroismValue.value = heroismValueAsked.value.toString();
        }
    }

    card.body.push(`heroism: ${parseInt(heroismValue.value.trim()) / 10},`);

    card.body.push(`state: {`);

    card.body.push(`BOND_SYSTEM_FORGIVENESS_RATE_PER_DAY: 0.5,`),

    card.body.push(`},`)
    card.body.push("triggers: [],");
    card.body.push("temp: {},"); // Temporary properties to use during inference cycles, they do not persist

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

    let isMuteValue = isMute.value.trim().toLowerCase() === "yes";

    if (guider) {
        const isActuallyMute = await guider.askBoolean("Is " + name + " mute, unable to speak or communicate verbally?", isMuteValue);
        if (!isActuallyMute.value) {
            isMuteValue = false;
        } else {
            isMuteValue = true;
        }
    }

    if (isMuteValue) {
        card.body.push(`vocabularyLimit: {mute: true},`);
    }

    card.body.push(`socialSimulation: {`);

    const attractivenessValue = await generator.next({
        maxCharacters: 5,
        maxSafetyCharacters: 0,
        maxParagraphs: 1,
        nextQuestion: "From 1 to 10 how attractive is " + name + "? with 10 being extremely attractive and 1 being very unattractive",
        stopAfter: [],
        stopAt: [],
        grammar: "root ::= [1-9] | \"10\"",
    });

    if (attractivenessValue.done) {
        throw new Error("Generator finished without producing output");
    }

    let attractivenessValueNum = parseInt(attractivenessValue.value.trim());

    if (guider) {
        const attractivenessValueAsked = await guider.askNumber(
            "From 1 to 10 how attractive is " + name + "? with 10 being extremely attractive and 1 being very unattractive",
            attractivenessValueNum,
        );
        if (attractivenessValueAsked) {
            attractivenessValueNum = attractivenessValueAsked.value;
        }
    }

    card.body.push(`attractiveness: ${attractivenessValueNum / 10},`);

    const charismaValue = await generator.next({
        maxCharacters: 5,
        maxSafetyCharacters: 0,
        maxParagraphs: 1,
        nextQuestion: "From 1 to 10 how charismatic is " + name + "? with 10 being extremely charismatic and able to easily charm and influence others, and 1 being very uncharismatic and awkward in social situations",
        stopAfter: [],
        stopAt: [],
        grammar: "root ::= [1-9] | \"10\"",
    });

    if (charismaValue.done) {
        throw new Error("Generator finished without producing output");
    }

    let charismaValueNum = parseInt(charismaValue.value.trim());

    if (guider) {
        const charismaValueAsked = await guider.askNumber(
            "From 1 to 10 how charismatic is " + name + "? with 10 being extremely charismatic and able to easily charm and influence others, and 1 being very uncharismatic and awkward in social situations",
            charismaValueNum,
        );
        if (charismaValueAsked) {
            charismaValueNum = charismaValueAsked.value;
        }
    }

    card.body.push(`charisma: ${charismaValueNum / 10},`);

    const gossipValue = await generator.next({
        maxCharacters: 5,
        maxSafetyCharacters: 0,
        maxParagraphs: 1,
        nextQuestion: "From 1 to 10 how much does " + name + " like gossip and talking about others? with 10 being loving gossip and always talking about others, and 1 being hating gossip and never talking about others",
        stopAfter: [],
        stopAt: [],
        grammar: "root ::= [1-9] | \"10\"",
    });

    if (gossipValue.done) {
        throw new Error("Generator finished without producing output");
    }

    let gossipValueNum = parseInt(gossipValue.value.trim());

    if (guider) {
        const gossipValueAsked = await guider.askNumber(
            "From 1 to 10 how much does " + name + " like gossip and talking about others? with 10 being loving gossip and always talking about others, and 1 being hating gossip and never talking about others",
            gossipValueNum,
        );
        if (gossipValueAsked) {
            gossipValueNum = gossipValueAsked.value;
        }
    }

    card.body.push(`gossipTendency: ${gossipValueNum / 10},`);

    if (guider) {
        let nextFamilyMemberToAdd = "";
        /**
         * @type {{[familyMemberName: string]: DEFamilyTie}}
         */
        const collectedTies = {}
        do {
            nextFamilyMemberToAdd = (await guider.askOption("Would you like to add a family member?", ["no", "parent", "sibling", "child", "spouse", "cousin", "uncle", "aunt", "grandparent", "grandchild", "niece", "nephew", "other"], "no")).value;
            if (nextFamilyMemberToAdd && nextFamilyMemberToAdd !== "no") {
                const familyMemberName = (await guider.askOpen("What is the name of the " + nextFamilyMemberToAdd + "?")).value;
                const familyMemberRelation = nextFamilyMemberToAdd;
                collectedTies[familyMemberName] = {
                    relation: /** @type {DEFamilyRelation} */ (familyMemberRelation),
                };

                // TODO ask to this family bonds
            }
        } while (nextFamilyMemberToAdd !== "no");
        card.body.push(`familyTies: ${JSON.stringify(collectedTies)},`);

        // TODO ask to pre-create bond towards other characters
    } else {
        card.body.push(`familyTies: {}, // Not covered in cardtype`);
    }

    const likesList = await generator.next({
        maxCharacters: 1000,
        maxSafetyCharacters: 0,
        maxParagraphs: 10,
        nextQuestion: "List some hobbies, activities, interests, or conversation topics that " + name + " enjoys, at most 10 things. Examples: swimming, cooking, cats, astronomy, music, gardening, chess",
        stopAfter: [],
        stopAt: [],
        instructions: "Answer with a comma-separated list of single lowercase words representing concrete hobbies, activities, subjects, or things that " + name + " likes. Each entry must be a noun or activity like: swimming, reading, cats, magic, cooking, astronomy, horses, painting, archery. Do NOT include emotional states, interpersonal situations, or multi-word phrases. Just single-word nouns or activities separated by commas.",
        grammar: "root ::= item moreItems\nmoreItems ::= \", \" item moreItems | \"\"\nitem ::= [a-z]+"
    });

    if (likesList.done) {
        throw new Error("Generator finished without producing output");
    }

    let likesListParsedAndDeduped = likesList.value.trim().split(",").filter(item => item.trim() !== "").map(item => item.trim()).filter((item, index, self) => self.indexOf(item) === index); // trim items, filter out empty items and dedupe

    if (guider) {
        const likesListAsked = await guider.askList("List some hobbies, activities, interests, or conversation topics that " + name + " enjoys. Examples: swimming, cooking, cats, astronomy, music, gardening, chess", likesListParsedAndDeduped);
        if (likesListAsked) {
            likesListParsedAndDeduped = likesListAsked.value.map(item => item.trim().toLowerCase()).filter(item => item !== "").filter((item, index, self) => self.indexOf(item) === index);
        }
    }

    card.body.push(`likes: ${JSON.stringify(likesListParsedAndDeduped)}, // These are ids that need to be specified for the social simulation`);

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

    let dislikesListParsedAndDeduped = dislikesList.value.trim().split(",").filter(item => item.trim() !== "").map(item => item.trim())
        .filter((item, index, self) => self.indexOf(item) === index) // trim items, filter out empty items and dedupe
        .filter(item => !likesListParsedAndDeduped.includes(item)); // ensure there is no overlap with likes

    if (guider) {
        const dislikesListAsked = await guider.askList("List some hobbies, activities, interests, or conversation topics that " + name + " dislikes. Examples: swimming, cooking, cats, politics, math, spiders, crowds", dislikesListParsedAndDeduped);
        if (dislikesListAsked) {
            dislikesListParsedAndDeduped = dislikesListAsked.value.map(item => item.trim().toLowerCase()).filter(item => item !== "").filter((item, index, self) => self.indexOf(item) === index).filter(item => !likesListParsedAndDeduped.includes(item));
        }
    }

    card.body.push(`dislikes: ${JSON.stringify(dislikesListParsedAndDeduped)}, // These are ids that need to be specified for the social simulation`);

    card.config.globalInterests = [...likesListParsedAndDeduped, ...dislikesListParsedAndDeduped];

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
    let speciesType = "humanoid";

    if (actualSpecies !== "human") {
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
        } else {
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

            speciesType = isFeral.value.trim().toLowerCase() === "yes" ? "feral" : "animal";
        }
    }

    if (guider) {
        const guidedSpecies = await guider.askOpen("What species is " + name + "?", actualSpecies);
        if (guidedSpecies) {
            actualSpecies = guidedSpecies.value.trim().toLowerCase();
        }

        const guidedSpeciesType = await guider.askOption("What species type is " + name + "?", ["humanoid", "feral", "animal"], speciesType);
        if (guidedSpeciesType) {
            speciesType = guidedSpeciesType.value;
        }
    }

    card.body.push(`species: ${JSON.stringify(actualSpecies)},`);
    card.body.push(`speciesType: "${speciesType}",`);

    const race = await generator.next({
        maxCharacters: 50,
        maxSafetyCharacters: 0,
        maxParagraphs: 1,
        nextQuestion: "What race is " + name + "? answer in lowercase",
        stopAfter: [],
        stopAt: [],
        grammar: "root ::= [a-z ]+",
        instructions: "If the character has no racial identity answer with none",
    });

    if (race.done) {
        throw new Error("Generator finished without producing output");
    }

    /**
     * @type {string | null}
     */
    let raceValue = race.value.trim().toLowerCase();

    if (guider) {
        const guidedRace = await guider.askOpen("What race is " + name + "?", raceValue);
        if (guidedRace) {
            raceValue = guidedRace.value.trim().toLowerCase();
        }
    }

    if (!raceValue || raceValue === "" || raceValue === "none" || raceValue === "n/a") {
        raceValue = null;
    }
    card.body.push(`race: ${JSON.stringify(raceValue)},`);

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

    let finalGroupBelongingValue = [groupBelonging.value.trim().toLowerCase()].filter(item => item !== "" && item !== "none" && item !== "n/a");

    if (guider) {
        const guidedGroupBelonging = await guider.askList("Does " + name + " belong to any specific group, organization, team, family, etc? if so which ones?", finalGroupBelongingValue);
        if (guidedGroupBelonging) {
            finalGroupBelongingValue = guidedGroupBelonging.value.map(item => item.trim().toLowerCase()).filter(item => item !== "" && item !== "none" && item !== "n/a");
        }
    }

    if (finalGroupBelongingValue.length > 0) {
        card.body.push(`groupBelonging: null,`);
    } else {
        card.body.push(`groupBelonging: ${JSON.stringify(finalGroupBelongingValue)},`);
    }

    if (guider) {
        const dislikeSpeciesPrejudice = await guider.askList("Is " + name + " prejudiced against any species? if so which ones? answer with the name of the species, if there is no prejudice answer with none", []);
        if (dislikeSpeciesPrejudice) {
            const dislikeSpeciesPrejudiceValue = dislikeSpeciesPrejudice.value.map(item => item.trim().toLowerCase()).filter(item => item !== "" && item !== "none" && item !== "n/a");
            card.body.push(`dislikesSpecies: ${JSON.stringify(dislikeSpeciesPrejudiceValue)}, // Up to you to make the character prejudiced against certain species`);
        } else {
            card.body.push(`dislikesSpecies: [], // Up to you to make the character prejudiced against certain species`);
        }
    } else {
        card.body.push(`dislikesSpecies: [], // Up to you to make the character prejudiced against certain species`);
    }

    if (guider) {
        const dislikeRacesPrejudice = await guider.askList("Is " + name + " prejudiced against any races? if so which ones? answer with the name of the races, if there is no prejudice answer with none", []);
        if (dislikeRacesPrejudice) {
            const dislikeRacesPrejudiceValue = dislikeRacesPrejudice.value.map(item => item.trim().toLowerCase()).filter(item => item !== "" && item !== "none" && item !== "n/a");
            card.body.push(`dislikesRaces: ${JSON.stringify(dislikeRacesPrejudiceValue)}, // Up to you to make the character racist`);
        } else {
            card.body.push(`dislikesRaces: [], // Up to you to make the character racist`);
        }
    } else {
        card.body.push(`dislikesRaces: [], // Up to you to make the character racist`);
    }

    if (guider) {
        const dislikeGroupsPrejudice = await guider.askList("Is " + name + " prejudiced against any groups, organizations, teams, families, etc? if so which ones? answer with the name of the groups, if there is no prejudice answer with none", []);
        if (dislikeGroupsPrejudice) {
            const dislikeGroupsPrejudiceValue = dislikeGroupsPrejudice.value.map(item => item.trim().toLowerCase()).filter(item => item !== "" && item !== "none" && item !== "n/a");
            card.body.push(`dislikesGroups: ${JSON.stringify(dislikeGroupsPrejudiceValue)}, // Up to you to make the character prejudiced against certain groups`);
        } else {
            card.body.push(`dislikesGroups: [], // Up to you to make the character prejudiced against certain groups`);
        }
    } else {
        card.body.push(`dislikesGroups: [], // Up to you to make the character prejudiced against certain groups`);
    }

    card.body.push(`attractions: [`);

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

    let isAsexualValue = isAsexual.value.trim().toLowerCase() === "yes";

    if (guider) {
        const isActuallyAsexual = await guider.askBoolean("Is " + name + " asexual, not sexually attracted to anyone?", isAsexualValue);
        if (!isActuallyAsexual.value) {
            isAsexualValue = false;
        } else {
            isAsexualValue = true;
        }
    }

    let minAgeAttractionPotential = (howOldYears / 2) + 7; // the half your age plus seven rule is a common rule of thumb for the minimum age of attraction

    if (guider && !isAsexualValue) {
        const guidedMinAgeAttractionPotential = await guider.askNumber("What is the minimum age of attraction for " + name + "?", minAgeAttractionPotential);
        if (guidedMinAgeAttractionPotential) {
            minAgeAttractionPotential = guidedMinAgeAttractionPotential.value;
        } else {
            minAgeAttractionPotential = minAgeAttractionPotential;
        }
    }

    let maxAgeAttractionPotential = howOldYears + 10;

    if (guider && !isAsexualValue) {
        const guidedMaxAgeAttractionPotential = await guider.askNumber("What is the maximum age of attraction for " + name + "?", maxAgeAttractionPotential);
        if (guidedMaxAgeAttractionPotential) {
            maxAgeAttractionPotential = guidedMaxAgeAttractionPotential.value;
        } else {
            maxAgeAttractionPotential = maxAgeAttractionPotential;
        }
    }

    /**
     * @type {Array<string>}
     */
    let attractions = [];
    const attractionAgeRange = [minAgeAttractionPotential, maxAgeAttractionPotential];

    if (isAsexualValue) {
        // no attractions
    } else {
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

        let findsAmbiguousGendersSexuallyAttractiveValue = findsAmbiguousGendersSexuallyAttractive.value.trim().toLowerCase() === "yes";

        if (guider) {
            const isActuallyFindsAmbiguousGendersSexuallyAttractive = await guider.askBoolean("Is " + name + " pansexual, bisexual or generally attracted to people regardless of their gender?", findsAmbiguousGendersSexuallyAttractiveValue);
            if (!isActuallyFindsAmbiguousGendersSexuallyAttractive.value) {
                findsAmbiguousGendersSexuallyAttractiveValue = false;
            } else {
                findsAmbiguousGendersSexuallyAttractiveValue = true;
            }
        }

        card.body.push(`// You can make these far more specific if needed, but these are for the social simulation and wander heuristics`);

        if (findsAmbiguousGendersSexuallyAttractiveValue) {
            if (speciesType === "humanoid") {
                card.body.push(`{towards: "ambiguous", "ageRange": [${minAgeAttractionPotential}, ${maxAgeAttractionPotential}], "speciesType": "${speciesType}"},`);
                card.body.push(`{towards: "male", "ageRange": [${minAgeAttractionPotential}, ${maxAgeAttractionPotential}], "speciesType": "${speciesType}"},`);
                card.body.push(`{towards: "female", "ageRange": [${minAgeAttractionPotential}, ${maxAgeAttractionPotential}], "speciesType": "${speciesType}"},`);
            } else {
                card.body.push(`{towards: "ambiguous", "ageRange": [${minAgeAttractionPotential}, ${maxAgeAttractionPotential}], "species": "${actualSpecies}"},`);
                card.body.push(`{towards: "male", "ageRange": [${minAgeAttractionPotential}, ${maxAgeAttractionPotential}], "species": "${actualSpecies}"},`);
                card.body.push(`{towards: "female", "ageRange": [${minAgeAttractionPotential}, ${maxAgeAttractionPotential}], "species": "${actualSpecies}"},`);
            }
            attractions.push("ambiguous");
            attractions.push("male");
            attractions.push("female");
        } else {
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

            let findsMalesSexuallyAttractiveValue = findsMalesSexuallyAttractive.value.trim().toLowerCase() === "yes";
            if (guider) {
                const isActuallyFindsMalesSexuallyAttractive = await guider.askBoolean("Does " + name + " find males sexually attractive?", findsMalesSexuallyAttractiveValue);
                if (!isActuallyFindsMalesSexuallyAttractive.value) {
                    findsMalesSexuallyAttractiveValue = false;
                } else {
                    findsMalesSexuallyAttractiveValue = true;
                }
            }

            if (findsMalesSexuallyAttractiveValue) {
                if (speciesType === "humanoid") {
                    card.body.push(`{towards: "male", "ageRange": [${minAgeAttractionPotential}, ${maxAgeAttractionPotential}], "speciesType": "${speciesType}"},`);
                } else {
                    card.body.push(`{towards: "male", "ageRange": [${minAgeAttractionPotential}, ${maxAgeAttractionPotential}], "species": "${actualSpecies}"},`);
                }
                attractions.push("male");
            }

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

            let findsFemalesSexuallyAttractiveValue = findsFemalesSexuallyAttractive.value.trim().toLowerCase() === "yes";

            if (guider) {
                const isActuallyFindsFemalesSexuallyAttractive = await guider.askBoolean("Does " + name + " find females sexually attractive?", findsFemalesSexuallyAttractiveValue);
                if (!isActuallyFindsFemalesSexuallyAttractive.value) {
                    findsFemalesSexuallyAttractiveValue = false;
                } else {
                    findsFemalesSexuallyAttractiveValue = true;
                }
            }

            if (findsFemalesSexuallyAttractiveValue) {
                if (speciesType === "humanoid") {
                    card.body.push(`{towards: "female", "ageRange": [${minAgeAttractionPotential}, ${maxAgeAttractionPotential}], "speciesType": "${speciesType}"},`);
                } else {
                    card.body.push(`{towards: "female", "ageRange": [${minAgeAttractionPotential}, ${maxAgeAttractionPotential}], "species": "${actualSpecies}"},`);
                }
                attractions.push("female");
            }
        }
    }

    card.body.push(`],`);
    card.body.push(`},`);
    card.body.push(`}, {`);

    card.config.isAsexual = isAsexualValue;
    card.config.name = name;
    card.config.attractions = attractions;
    card.config.attractionAgeRange = attractionAgeRange;
    card.config.characterAge = howOldYears;
    card.config.characterSpecies = actualSpecies;
    card.config.characterSpeciesType = speciesType;

    await generator.next(null); // end the generator

    return getJsCard(card);
}