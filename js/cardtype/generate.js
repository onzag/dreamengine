import { DEngine } from '../engine/index.js';

if (typeof process !== "undefined" && process.versions && process.versions.node) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

/**
 * @param {DEngine} engine
 * @param {string} source
 * @return {Promise<string>}
 */
export async function generate(engine, source) {
    let code = "";
    let headerCode = "";

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

    code += `\tDE.utils.newCharacter(DE, fss.setup(DE, {\n`;
    code += `\t\tname: ${JSON.stringify(name)},\n`;

    const answerDescription = await generator.next({
        maxCharacters: 3000,
        maxSafetyCharacters: 0,
        maxParagraphs: 10,
        nextQuestion: "Describe " + name + "'s appearance, personality, and any special traits or abilities they have.",
        stopAfter: [],
        stopAt: [],
        instructions: "Be creative, answer with a detailed description of " + name + "'s general appearance, personality, and any special traits or abilities they have. Use multiple paragraphs and sentences. Do not include items of clothing or specific equipment, just the character's inherent traits and features. Make at least 3 paragraphs",
    });

    if (answerDescription.done) {
        throw new Error("Generator finished without producing output");
    }

    const description = answerDescription.value.trim().split(name).join('{{char}}');
    code += `\t\tgeneral: DE.utils.newHandlebarsTemplate(DE, ${JSON.stringify(description)}),\n`;

    const answerShortDescription = await generator.next({
        maxCharacters: 100,
        maxSafetyCharacters: 0,
        maxParagraphs: 1,
        nextQuestion: "Provide a short one sentence description of " + name + " as they are perceived visually by others in the world, focusing on their most distinctive features",
        stopAfter: [],
        stopAt: [],
        instructions: "Answer with a single sentence that provides a brief description of " + name + "'s appearance and personality. Use no more than 20 words. Do not include items of clothing or specific equipment, just the character's inherent traits and features. Do not include the character name in the description, just describe as an external observer would perceive them, focusing on their most distinctive features.",
    });

    if (answerShortDescription.done) {
        throw new Error("Generator finished without producing output");
    }

    const shortDescription = answerShortDescription.value.trim();
    code += `\t\tshortDescription: ${JSON.stringify(shortDescription)},\n`;

    const answerShortDescriptionTopNakedAdd = await generator.next({
        maxCharacters: 100,
        maxSafetyCharacters: 0,
        maxParagraphs: 1,
        nextQuestion: "Create a sentence that can be added at the end of the short description to describe " + name + " without any upper body clothing, focusing on their upper body's most distinctive features",
        stopAfter: [],
        stopAt: [],
        contextInfo: "The short description is: " + JSON.stringify(shortDescription),
        instructions: "Answer with a single sentence that can be appended to the short description to describe " + name + " without any upper body clothing, focusing on their upper body's most distinctive features. Do not include the character name in the description, just describe as an external observer would perceive them, focusing on their most distinctive features. Do not add details already mentioned in the short description, only add new details that would be visible when the character is not wearing any upper body clothing.",
    });

    if (answerShortDescriptionTopNakedAdd.done) {
        throw new Error("Generator finished without producing output");
    }

    const shortDescriptionTopNakedAdd = answerShortDescriptionTopNakedAdd.value.trim();
    code += `\t\tshortDescriptionTopNakedAdd: ${JSON.stringify(shortDescriptionTopNakedAdd)},\n`;

    const answerShortDescriptionBottomNakedAdd = await generator.next({
        maxCharacters: 100,
        maxSafetyCharacters: 0,
        maxParagraphs: 1,
        nextQuestion: "Create a sentence that can be added at the end of the short description to describe " + name + " without any lower body clothing, focusing on their lower body's most distinctive features",
        stopAfter: [],
        stopAt: [],
        contextInfo: "The short description is: " + JSON.stringify(shortDescription),
        instructions: "Answer with a single sentence that can be appended to the short description to describe " + name + " without any lower body clothing, focusing on their lower body's most distinctive features. Do not include the character name in the description, just describe as an external observer would perceive them, focusing on their most distinctive features. Do not add details already mentioned in the short description, only add new details that would be visible when the character is not wearing any lower body clothing.",
    });

    if (answerShortDescriptionBottomNakedAdd.done) {
        throw new Error("Generator finished without producing output");
    }

    const shortDescriptionBottomNakedAdd = answerShortDescriptionBottomNakedAdd.value.trim();
    code += `\t\tshortDescriptionBottomNakedAdd: ${JSON.stringify(shortDescriptionBottomNakedAdd)},\n`;

    code += `\t\tgeneralCharacterDescriptionInjection: {},\n`;
    code += `\t\tactionPromptInjection: {},\n`;
    code += `\t\tbonds: null,\n`;
    code += `\t\tcharacterRules: {},\n`;
    code += `\t\temotions: {},\n`;
    code += `\t\tstates: {},\n`;

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

    const schizophrenia = hasSchizophrenia.value.trim().toLowerCase() === "yes" ? 1 : 0;

    if (schizophrenia) {
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

        const severityStr = schizophreniaSeverity.value.trim().toLowerCase();
        let severity = 0;
        if (severityStr === "mild") severity = 0.33;
        else if (severityStr === "moderate") severity = 0.66;
        else if (severityStr === "severe") severity = 1;
        code += `\t\tschizophrenia: ${severity},\n`;

        const schizophrenicVoiceDescription = await generator.next({
            maxCharacters: 200,
            maxSafetyCharacters: 0,
            maxParagraphs: 3,
            nextQuestion: "Describe the voice that " + name + " hears as part of their schizophrenia, and how they act and interact with " + name + ", always describe it or invent one, do not give it a name or refer to it as an entity, just describe the voice and how it interacts with " + name + " in a way that can be injected into the character's description. If there are multiple voices, combine them into a single description.",
            stopAfter: [],
            stopAt: [],
            instructions: "Answer with a voice or invent one",
        });

        if (schizophrenicVoiceDescription.done) {
            throw new Error("Generator finished without producing output");
        }

        const voiceDescription = schizophrenicVoiceDescription.value.trim().split(name).join('{{char}}');
        code += `\t\tschizophrenicVoiceDescription: DE.utils.newHandlebarTemplate(${JSON.stringify(voiceDescription)}),\n`;
    } else {
        code += `\t\tschizophrenia: 0,\n`;
        code += `\t\tschizophrenicVoiceDescription: "",\n`;
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

    if (hasAutism.value.trim().toLowerCase() === "yes") {
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

        const severityStr = autismSeverity.value.trim().toLowerCase();
        let severity = 0;
        if (severityStr === "mild") severity = 0.33;
        else if (severityStr === "moderate") severity = 0.66;
        else if (severityStr === "severe") severity = 1;
        code += `\t\tautism: ${severity},\n`;
    } else {
        code += `\t\tautism: 0,\n`;
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

    code += `\t\tcarryingCapacityKg: ${carryingCapacityKg.value.trim()},\n`;

    // double the volume of the potential weight lifted
    code += `\t\tcarryingCapacityLiters: ${parseInt(carryingCapacityKg.value.trim()) * 2},\n`;

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

    code += `\t\theightCm: ${heightCm.value.trim()},\n`;

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

    if (isAmb.value.trim().toLowerCase() === "yes") {
        code += `\t\tgender: "ambiguous",\n`;
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

        const isMaleValue = isMale.value.trim().toLowerCase() === "yes";
        if (isMaleValue) {
            code += `\t\tgender: "male",\n`;
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

            const isFemaleValue = isFemale.value.trim().toLowerCase() === "yes";
            if (isFemaleValue) {
                code += `\t\tgender: "female",\n`;
            } else {
                code += `\t\tgender: "ambiguous",\n`;
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

    if (hasNoSex.value.trim().toLowerCase() === "yes") {
        code += `\t\tsex: "none",\n`;
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

        if (isIntersex.value.trim().toLowerCase() === "yes") {
            code += `\t\tsex: "intersex",\n`;
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
                code += `\t\tsex: "male",\n`;
            } else {
                code += `\t\tsex: "female",\n`;
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

    const highestTier = sortedTiers.find(tier => tierAnswers[tier]);

    if (!highestTier) {
        code += `\t\ttier: "human",\n`;
    } else {
        code += `\t\ttier: ${JSON.stringify(highestTier)},\n`;
    }

    let tierValue = 50;
    /**
     * @type {number}
     */
    let range =
        // @ts-ignore
        tierToBaseRange[highestTier || "human"];

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

    if (answerIsBabyOrWeakened.value.trim().toLowerCase() === "yes") {
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

        if (answerIsYoungOrWeakened.value.trim().toLowerCase() === "yes") {
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

            if (answerIsInPrime.value.trim().toLowerCase() === "yes") {
                tierValue = 90;
                range = range * 2;
            }
        }
    }

    code += `\t\ttierValue: ${tierValue},\n`;
    code += `\t\tpowerGrowthRate: 0.25,\n`;

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

    const howOldYears = parseInt(answerHowOld.value.trim());
    code += `\t\tageYears: ${howOldYears},\n`;

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

    code += `\t\tweightKg: ${weightKg.value.trim()},\n`;

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

    if (hightInitiative.value.trim().toLowerCase() === "yes") {
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

        if (annoyinglySocial.value.trim().toLowerCase() === "yes") {
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

            if (shy.value.trim().toLowerCase() === "yes") {
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

                if (completelyAsocial.value.trim().toLowerCase() === "yes") {
                    initiative = 0;
                    strangerInitiative = 0;
                    strangerRejection = 0.5;
                }
            }
        }
    }

    code += `\t\tinitiative: ${initiative},\n`;
    code += `\t\tstrangerInitiative: ${strangerInitiative},\n`;
    code += `\t\tstrangerRejection: ${strangerRejection},\n`;
    code += `\t\tmaintenanceCaloriesPerDay: 2000,\n`;
    code += `\t\tmaintenanceHydrationLitersPerDay: 2,\n`;
    code += `\t\trangeMeters: ${range},\n`;
    code += `\t\tlocomotionSpeedMetersPerSecond: ${range * 0.0015},\n`;

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

    code += `\t\tstealth: ${parseInt(stealthValue.value.trim()) / 10},\n`;

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

    code += `\t\tperception: ${parseInt(perceptionValue.value.trim()) / 10},\n`;

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

    code += `\t\theroism: ${parseInt(heroismValue.value.trim()) / 10},\n`;

    code += `\t\tproperties: {},\n`;

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

    if (isMute.value.trim().toLowerCase() === "yes") {
        code += `\t\tvocabularyLimit: {mute: true},\n`;
    }

    code += `\t\tsocialSimulation: {\n`;

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

    code += `\t\t\tattractiveness: ${parseInt(attractivenessValue.value.trim()) / 10},\n`;

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

    code += `\t\t\tcharisma: ${parseInt(charismaValue.value.trim()) / 10},\n`;

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

    code += `\t\t\tgossipTendency: ${parseInt(gossipValue.value.trim()) / 10},\n`;
    code += `\t\t\tfamilyTies: {}, // Not covered in cardtype\n`;

    const likesList = await generator.next({
        maxCharacters: 1000,
        maxSafetyCharacters: 0,
        maxParagraphs: 10,
        nextQuestion: "List some activities or topics of conversation that " + name + " likes",
        stopAfter: [],
        stopAt: [],
        instructions: "Answer with a list of things that " + name + " likes, these should be single words and in lowercase only, separate them with commas, do not use conjunctions like and, or, etc. just a simple list of things that " + name + " likes separated by commas. these can be activities or topics of conversation.",
        grammar: "root ::= item moreItems\nmoreItems ::= \",\" item moreItems | \"\"\nitem ::= [a-z]+"
    });

    if (likesList.done) {
        throw new Error("Generator finished without producing output");
    }

    code += `\t\t\tlikes: [${likesList.value.trim().split(",").filter(item => item.trim() !== "").map(item => `"${item.trim()}"`).join(", ")}], // These are ids that need to be specified for the social simulation\n`;

    const dislikesList = await generator.next({
        maxCharacters: 1000,
        maxSafetyCharacters: 0,
        maxParagraphs: 10,
        nextQuestion: "List some activities or topics of conversation that " + name + " dislikes",
        stopAfter: [],
        stopAt: [],
        instructions: "Answer with a list of things that " + name + " dislikes, these should be single words and in lowercase only, separate them with commas, do not use conjunctions like and, or, etc. just a simple list of things that " + name + " dislikes separated by commas. these can be activities or topics of conversation.",
        grammar: "root ::= item moreItems\nmoreItems ::= \",\" item moreItems | \"\"\nitem ::= [a-z]+"
    });

    if (dislikesList.done) {
        throw new Error("Generator finished without producing output");
    }

    code += `\t\t\tdislikes: [${dislikesList.value.trim().split(",").filter(item => item.trim() !== "").map(item => `"${item.trim()}"`).join(", ")}], // These are ids that need to be specified for the social simulation\n`;

    const species = await generator.next({
        maxCharacters: 50,
        maxSafetyCharacters: 0,
        maxParagraphs: 1,
        nextQuestion: "What species is " + name + "? answer in lowercase",
        stopAfter: [],
        stopAt: [],
        grammar: "root ::= [a-z ]+",
    });

    if (species.done) {
        throw new Error("Generator finished without producing output");
    }

    code += `\t\t\tspecies: ${JSON.stringify(species.value.trim())},\n`;

    const race = await generator.next({
        maxCharacters: 50,
        maxSafetyCharacters: 0,
        maxParagraphs: 1,
        nextQuestion: "What race is " + name + "? answer in lowercase",
        stopAfter: [],
        stopAt: [],
        grammar: "root ::= [a-z ]+",
    });

    if (race.done) {
        throw new Error("Generator finished without producing output");
    }

    code += `\t\t\trace: ${JSON.stringify(race.value.trim())},\n`;

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

    if (groupBelonging.value.trim().toLowerCase() === "none") {
        code += `\t\t\tgroupBelonging: null,\n`;
    } else {
        code += `\t\t\tgroupBelonging: [${JSON.stringify(groupBelonging.value.trim())}],\n`;
    }

    code += `\t\t\tdislikesSpecies: [], // Up to you to make the character prejudiced against certain species\n`;
    code += `\t\t\tdislikesRaces: [], // Up to you to make the character racist\n`;
    code += `\t\t\tdislikesGroups: [], // Up to you to make the character prejudiced against certain groups\n`;

    code += `\t\t\tattractions: [\n`;

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

    const isAsexualValue = isAsexual.value.trim().toLowerCase() === "yes";

    const minAgeAttractionPotential = (howOldYears / 2) + 7; // the half your age plus seven rule is a common rule of thumb for the minimum age of attraction
    const maxAgeAttractionPotential = howOldYears + 10;

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

        const findsAmbiguousGendersSexuallyAttractiveValue = findsAmbiguousGendersSexuallyAttractive.value.trim().toLowerCase() === "yes";

        code += `\t\t\t\t// You can make these far more specific if needed, but these are for the social simulation and wander heuristics\n`;

        if (findsAmbiguousGendersSexuallyAttractiveValue) {
            code += `\t\t\t\t{towards: "ambiguous", "ageRange": [${minAgeAttractionPotential}, ${maxAgeAttractionPotential}]},\n`;
            code += `\t\t\t\t{towards: "male", "ageRange": [${minAgeAttractionPotential}, ${maxAgeAttractionPotential}]},\n`;
            code += `\t\t\t\t{towards: "female", "ageRange": [${minAgeAttractionPotential}, ${maxAgeAttractionPotential}]},\n`;
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

            const findsMalesSexuallyAttractiveValue = findsMalesSexuallyAttractive.value.trim().toLowerCase() === "yes";

            if (findsMalesSexuallyAttractiveValue) {
                code += `\t\t\t\t{towards: "male", "ageRange": [${minAgeAttractionPotential}, ${maxAgeAttractionPotential}]},\n`;
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

            const findsFemalesSexuallyAttractiveValue = findsFemalesSexuallyAttractive.value.trim().toLowerCase() === "yes";

            if (findsFemalesSexuallyAttractiveValue) {
                code += `\t\t\t\t{towards: "female", "ageRange": [${minAgeAttractionPotential}, ${maxAgeAttractionPotential}]},\n`;
            }
        }
    }

    code += `\t\t\t],\n`;
    code += `\t\t},\n`;
    code += `\t}, {\n`;
    code += `\t\ttype: "4d_standard",\n`;

    let isIncestuousValue = false;
    if (!isAsexualValue) {
        const isIncestuous = await generator.next({
            maxCharacters: 5,
            maxSafetyCharacters: 0,
            maxParagraphs: 1,
            nextQuestion: "Does " + name + " have an incestuous attraction towards family members? Answer with yes or no.",
            stopAfter: [],
            stopAt: [],
            grammar: `root ::= "yes" | "no" | "Yes" | "No" | "YES" | "NO"`,
        });

        if (isIncestuous.done) {
            throw new Error("Generator finished without producing output");
        }

        isIncestuousValue = isIncestuous.value.trim().toLowerCase() === "yes";
    }

    const SETTINGS = {
        "foe_n100_n50": {
            "noRomanticInterest_0_10": {
                nonFamily: "another character that " + name + " has an extremely bad and extremely hostile relationship with",
                family: "a family member that " + name + " has an extremely bad and extremely hostile relationship with",
            },
            "slightRomanticInterest_10_20": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has an extremely bad and extremely hostile relationship with but also such character has shown slight romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " despises and has an extremely hostile relationship with, yet is unsettlingly drawn to with a slight, deeply unwanted romantic and sexual attraction that " + name + " cannot fully explain or accept",
                family: isIncestuousValue ?
                    "a family member that " + name + " has an extremely bad and extremely hostile relationship with but also " + name + " has a slight romantic and sexual interest in" :
                    "a family member that " + name + " has an extremely bad and extremely hostile relationship with and such family member has shown slight romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "romanticInterest_20_35": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has an extremely bad and extremely hostile relationship with but also such character has shown romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " despises and has an extremely hostile relationship with, yet cannot help but feel a real and disturbing romantic and sexual attraction toward — a contradiction " + name + " resents deeply",
                family: isIncestuousValue ?
                    "a family member that " + name + " has an extremely bad and extremely hostile relationship with but also " + name + " has a romantic and sexual interest in" :
                    "a family member that " + name + " has an extremely bad and extremely hostile relationship with and such family member has shown romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "strongRomanticInterest_35_50": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has an extremely bad and extremely hostile relationship with but also such character has shown strong romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " despises and has an extremely hostile relationship with, yet is strongly and almost obsessively attracted to, both romantically and sexually, in a way that fills " + name + " with self-loathing — the hate and the desire feeding each other in a destructive loop",
                family: isIncestuousValue ?
                    "a family member that " + name + " has an extremely bad and extremely hostile relationship with but also " + name + " has a strong romantic and sexual interest in" :
                    "a family member that " + name + " has an extremely bad and extremely hostile relationship with and such family member has shown strong romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "deepInLove_50_100": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has an extremely bad and extremely hostile relationship with but also such character has shown deep love and sexual desire for " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " despises and has an extremely hostile relationship with, yet is consumed by a deep and agonizing love and sexual desire for — feelings " + name + " finds monstrous and cannot reconcile with the hatred, leaving them in a state of constant inner turmoil",
                family: isIncestuousValue ?
                    "a family member that " + name + " has an extremely bad and extremely hostile relationship with but also " + name + " is deeply in love with and sexually attracted to" :
                    "a family member that " + name + " has an extremely bad and extremely hostile relationship with and such family member is deeply in love with and sexually attracted to " + name + " but " + name + " does not reciprocate that love",
            },
        },
        "hostile_n50_n35": {
            "noRomanticInterest_0_10": {
                nonFamily: "another character that " + name + " has a hostile relationship with",
                family: "a family member that " + name + " has a hostile relationship with",
            },
            "slightRomanticInterest_10_20": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has a hostile relationship with but also such character has shown slight romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " has a hostile relationship with, yet feels a slight and uncomfortable romantic and sexual attraction toward that " + name + " tries to suppress and deny",
                family: isIncestuousValue ?
                    "a family member that " + name + " has a hostile relationship with but also " + name + " has a slight romantic and sexual interest in" :
                    "a family member that " + name + " has a hostile relationship with and such family member has shown slight romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "romanticInterest_20_35": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has a hostile relationship with but also such character has shown romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " has a hostile relationship with, yet feels a genuine and troubling romantic and sexual attraction toward — a pull " + name + " resents and struggles to make sense of",
                family: isIncestuousValue ?
                    "a family member that " + name + " has a hostile relationship with but also " + name + " has a romantic and sexual interest in" :
                    "a family member that " + name + " has a hostile relationship with and such family member has shown romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "strongRomanticInterest_35_50": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has a hostile relationship with but also such character has shown strong romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " has a hostile relationship with, yet is strongly drawn to with a romantic and sexual intensity that wars with their hostility — the antagonism and the desire intertwined in a push and pull " + name + " cannot easily escape",
                family: isIncestuousValue ?
                    "a family member that " + name + " has a hostile relationship with but also " + name + " has a strong romantic and sexual interest in" :
                    "a family member that " + name + " has a hostile relationship with and such family member has shown strong romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "deepInLove_50_100": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has a hostile relationship with but also such character has shown deep love and sexual desire for " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " has a hostile relationship with, yet is deeply in love with and sexually attracted to in a way that " + name + " finds agonizing — the love and desire sharpening the hostility and the hostility curdling them into something painful and consuming",
                family: isIncestuousValue ?
                    "a family member that " + name + " has a hostile relationship with but also " + name + " is deeply in love with and sexually attracted to" :
                    "a family member that " + name + " has a hostile relationship with and such family member is deeply in love with and sexually attracted to " + name + " but " + name + " does not reciprocate that love",
            },
        },
        "antagonistic_n35_n20": {
            "noRomanticInterest_0_10": {
                nonFamily: "another character that " + name + " has an antagonistic relationship with",
                family: "a family member that " + name + " has an antagonistic relationship with",
            },
            "slightRomanticInterest_10_20": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has an antagonistic relationship with but also such character has shown slight romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " has an antagonistic relationship with, yet finds slightly but undeniably attractive, both romantically and sexually, in a way that irritates " + name + " — a small, inconvenient pull they would rather not acknowledge",
                family: isIncestuousValue ?
                    "a family member that " + name + " has an antagonistic relationship with but also " + name + " has a slight romantic and sexual interest in" :
                    "a family member that " + name + " has an antagonistic relationship with and such family member has shown slight romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "romanticInterest_20_35": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has an antagonistic relationship with but also such character has shown romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " has an antagonistic relationship with, yet is genuinely attracted to, both romantically and sexually, in a way that complicates everything — the friction between them charged with something more than just dislike",
                family: isIncestuousValue ?
                    "a family member that " + name + " has an antagonistic relationship with but also " + name + " has a romantic and sexual interest in" :
                    "a family member that " + name + " has an antagonistic relationship with and such family member has shown romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "strongRomanticInterest_35_50": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has an antagonistic relationship with but also such character has shown strong romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " has an antagonistic relationship with, yet is strongly attracted to, both romantically and sexually — the clashing between them electric and loaded, the rivalry masking a tension that neither fully admits",
                family: isIncestuousValue ?
                    "a family member that " + name + " has an antagonistic relationship with but also " + name + " has a strong romantic and sexual interest in" :
                    "a family member that " + name + " has an antagonistic relationship with and such family member has shown strong romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "deepInLove_50_100": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has an antagonistic relationship with but also such character has shown deep love and sexual desire for " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " has an antagonistic relationship with, yet has fallen deeply in love with and is sexually drawn to — the rivalry and the desire tangled together into something " + name + " cannot easily walk away from, no matter how much they clash",
                family: isIncestuousValue ?
                    "a family member that " + name + " has an antagonistic relationship with but also " + name + " is deeply in love with and sexually attracted to" :
                    "a family member that " + name + " has an antagonistic relationship with and such family member is deeply in love with and sexually attracted to " + name + " but " + name + " does not reciprocate that love",
            },
        },
        "unfriendly_n20_n10": {
            "noRomanticInterest_0_10": {
                nonFamily: "another character that " + name + " has an unfriendly relationship with",
                family: "a family member that " + name + " has an unfriendly relationship with",
            },
            "slightRomanticInterest_10_20": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has an unfriendly relationship with but also such character has shown slight romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " has an unfriendly relationship with, though despite their mutual dislike there is a slight and complicated romantic and sexual attraction between them",
                family: isIncestuousValue ?
                    "a family member that " + name + " has an unfriendly relationship with but also " + name + " has a slight romantic and sexual interest in" :
                    "a family member that " + name + " has an unfriendly relationship with and such family member has shown slight romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "romanticInterest_20_35": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has an unfriendly relationship with but also such character has shown romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " has an unfriendly relationship with, though despite their mutual dislike there is a conflicted romantic and sexual tension between them that neither fully understands",
                family: isIncestuousValue ?
                    "a family member that " + name + " has an unfriendly relationship with but also " + name + " has a romantic and sexual interest in" :
                    "a family member that " + name + " has an unfriendly relationship with and such family member has shown romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "strongRomanticInterest_35_50": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has an unfriendly relationship with but also such character has shown strong romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " has an unfriendly relationship with, though despite their mutual dislike there is a strong and undeniable romantic and sexual tension between them that pulls them together even as they push each other away",
                family: isIncestuousValue ?
                    "a family member that " + name + " has an unfriendly relationship with but also " + name + " has a strong romantic and sexual interest in" :
                    "a family member that " + name + " has an unfriendly relationship with and such family member has shown strong romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "deepInLove_50_100": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has an unfriendly relationship with but also such character has shown deep love and sexual desire for " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " has an unfriendly relationship with, though despite their mutual dislike " + name + " has fallen deeply in love with and become sexually drawn to them in a complicated and conflicted way",
                family: isIncestuousValue ?
                    "a family member that " + name + " has an unfriendly relationship with but also " + name + " is deeply in love with and sexually attracted to" :
                    "a family member that " + name + " has an unfriendly relationship with and such family member is deeply in love with and sexually attracted to " + name + " but " + name + " does not reciprocate that love",
            },
        },
        "unpleasant_n10_0": {
            "noRomanticInterest_0_10": {
                nonFamily: "another character that " + name + " has an unpleasant but not unfriendly relationship with",
                family: "a family member that " + name + " has an unpleasant but not unfriendly relationship with",
            },
            "slightRomanticInterest_10_20": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has an unpleasant but not unfriendly relationship with but also such character has shown slight romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " has an unpleasant but not unfriendly relationship with, though they find each other oddly and slightly attractive, both romantically and sexually, despite rubbing each other the wrong way",
                family: isIncestuousValue ?
                    "a family member that " + name + " has an unpleasant but not unfriendly relationship with but also " + name + " has a slight romantic and sexual interest in" :
                    "a family member that " + name + " has an unpleasant but not unfriendly relationship with and such family member has shown slight romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "romanticInterest_20_35": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has an unpleasant but not unfriendly relationship with but also such character has shown romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " has an unpleasant but not unfriendly relationship with, though there is a genuine romantic and sexual tension between them even as they irritate each other",
                family: isIncestuousValue ?
                    "a family member that " + name + " has an unpleasant but not unfriendly relationship with but also " + name + " has a romantic and sexual interest in" :
                    "a family member that " + name + " has an unpleasant but not unfriendly relationship with and such family member has shown romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "strongRomanticInterest_35_50": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has an unpleasant but not unfriendly relationship with but also such character has shown strong romantic and sexual interest in " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " has an unpleasant but not unfriendly relationship with, though there is a strong romantic and sexual tension between them and they are drawn to each other despite the friction in their relationship",
                family: isIncestuousValue ?
                    "a family member that " + name + " has an unpleasant but not unfriendly relationship with but also " + name + " has a strong romantic and sexual interest in" :
                    "a family member that " + name + " has an unpleasant but not unfriendly relationship with and such family member has shown strong romantic and sexual interest in " + name + " but " + name + " does not reciprocate that interest",
            },
            "deepInLove_50_100": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has an unpleasant but not unfriendly relationship with but also such character has shown deep love and sexual desire for " + name + " but " + name + " does not reciprocate because they are asexual" :
                    "another character that " + name + " has an unpleasant but not unfriendly relationship with, though despite the friction between them " + name + " has deeply fallen in love with and become sexually drawn to them in a way that confuses and surprises even " + name + " themselves",
                family: isIncestuousValue ?
                    "a family member that " + name + " has an unpleasant but not unfriendly relationship with but also " + name + " is deeply in love with and sexually attracted to" :
                    "a family member that " + name + " has an unpleasant but not unfriendly relationship with and such family member is deeply in love with and sexually attracted to " + name + " but " + name + " does not reciprocate that love",
            },
        },
        "acquaintance_0_10": {
            "noRomanticInterest_0_10": {
                nonFamily: "another character that " + name + " is acquainted with",
                family: "a family member that " + name + " knows and has a normal relationship with",
            },
            "slightRomanticInterest_10_20": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " is acquainted with and who has shown a slight romantic and sexual interest in " + name + ", leaving " + name + " in the uncomfortable position of valuing the connection but being unable to return those feelings as an asexual person" :
                    "another character that " + name + " is acquainted with and has developed a slight romantic and sexual interest in",
                family: isIncestuousValue ?
                    "a family member that " + name + " has a normal relationship with and " + name + " has developed a slight but forbidden romantic and sexual interest in" :
                    "a family member that " + name + " has a normal relationship with, though such family member has developed an inappropriate slight romantic and sexual interest in " + name + " that strains what was otherwise a perfectly ordinary family dynamic",
            },
            "romanticInterest_20_35": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " is acquainted with and who has developed a genuine romantic and sexual interest in " + name + ", leaving " + name + " in the uncomfortable position of valuing the connection but being unable to return those feelings as an asexual person" :
                    "another character that " + name + " is acquainted with and has a real romantic and sexual interest in",
                family: isIncestuousValue ?
                    "a family member that " + name + " has a normal relationship with and " + name + " has developed a real romantic and sexual interest in" :
                    "a family member that " + name + " has a normal relationship with, though such family member harbors a genuine romantic and sexual interest in " + name + " that undermines what was an otherwise healthy family relationship",
            },
            "strongRomanticInterest_35_50": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " is acquainted with and who has developed strong romantic and sexual feelings for " + name + ", leaving " + name + " in the uncomfortable position of valuing the connection but being unable to return those feelings as an asexual person" :
                    "another character that " + name + " is acquainted with and has strong romantic and sexual feelings for",
                family: isIncestuousValue ?
                    "a family member that " + name + " has a normal relationship with and " + name + " has developed strong romantic and sexual feelings for" :
                    "a family member that " + name + " has a normal relationship with, though such family member has developed strong romantic and sexual feelings for " + name + " that are unwanted and deeply complicate what should be a straightforward family connection",
            },
            "deepInLove_50_100": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " is acquainted with and who has fallen deeply in love with and become sexually attracted to " + name + ", leaving " + name + " in the uncomfortable position of valuing the connection but being unable to return those feelings as an asexual person" :
                    "another character that " + name + " is acquainted with and has fallen deeply in love with and is sexually attracted to",
                family: isIncestuousValue ?
                    "a family member that " + name + " has a normal relationship with and " + name + " has fallen deeply in love with and is sexually attracted to" :
                    "a family member that " + name + " has a normal relationship with, though such family member is deeply in love with and sexually attracted to " + name + " in a way that " + name + " does not reciprocate and that fundamentally complicates their family relationship",
            },
        },
        "friendly_10_20": {
            "noRomanticInterest_0_10": {
                nonFamily: "another character that " + name + " has a friendly relationship with",
                family: "a family member that " + name + " has a warm and friendly relationship with",
            },
            "slightRomanticInterest_10_20": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has a friendly relationship with and who has developed a slight romantic and sexual interest in " + name + " — a situation " + name + " handles with care, not wanting to hurt a friend while being unable to return those feelings as an asexual person" :
                    "another character that " + name + " has a friendly relationship with and has also developed a slight romantic and sexual interest in",
                family: isIncestuousValue ?
                    "a family member that " + name + " has a warm relationship with and has also developed a slight romantic and sexual interest in" :
                    "a family member that " + name + " has a warm relationship with, though such family member has developed a slight romantic and sexual interest in " + name + " that introduces an unwanted and awkward undercurrent into an otherwise good family bond",
            },
            "romanticInterest_20_35": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has a friendly relationship with and who has developed a genuine romantic and sexual interest in " + name + " — " + name + " values the friendship deeply but cannot offer what the other person feels, which puts the friendship itself at risk" :
                    "another character that " + name + " has a friendly relationship with and has also developed a real romantic and sexual interest in",
                family: isIncestuousValue ?
                    "a family member that " + name + " has a warm relationship with and has developed a real romantic and sexual interest in" :
                    "a family member that " + name + " has a warm relationship with, though such family member has developed a genuine romantic and sexual interest in " + name + " that strains and complicates what is otherwise a loving and healthy family bond",
            },
            "strongRomanticInterest_35_50": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has a friendly relationship with and who has developed strong romantic and sexual feelings for " + name + " — the friendship is real and valued by " + name + ", but being asexual means they cannot reciprocate, and the weight of those unmatched feelings hangs over the bond" :
                    "another character that " + name + " has a friendly relationship with and has also developed strong romantic and sexual feelings for",
                family: isIncestuousValue ?
                    "a family member that " + name + " has a warm relationship with and has developed strong romantic and sexual feelings for" :
                    "a family member that " + name + " has a warm relationship with, though such family member has developed strong romantic and sexual feelings for " + name + " that are difficult to ignore and that cast a complicated shadow over an otherwise affectionate family relationship",
            },
            "deepInLove_50_100": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has a friendly relationship with and who has fallen deeply in love with and become sexually attracted to " + name + " — " + name + " genuinely cares for them as a friend, but being asexual means that love cannot be returned in kind, and the unreciprocated depth of feeling risks changing the friendship forever" :
                    "another character that " + name + " has a friendly relationship with and has fallen deeply in love and lust with",
                family: isIncestuousValue ?
                    "a family member that " + name + " has a warm relationship with and has fallen deeply in love with and become sexually attracted to" :
                    "a family member that " + name + " has a warm relationship with, though such family member has fallen deeply in love with and become sexually attracted to " + name + " in a way that " + name + " does not reciprocate — a love that threatens to fracture what was an otherwise warm and genuine family connection",
            },
        },
        "goodFriend_20_35": {
            "noRomanticInterest_0_10": {
                nonFamily: "another character that " + name + " has a good friendship with",
                family: "a family member that " + name + " has a good and caring relationship with",
            },
            "slightRomanticInterest_10_20": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has a good friendship with and who has developed a slight romantic and sexual interest in " + name + " — " + name + " cares about them and does not want to hurt a good friend, but being asexual means those feelings cannot be matched" :
                    "another character that " + name + " has a good friendship with and has also developed a slight romantic and sexual interest in",
                family: isIncestuousValue ?
                    "a family member that " + name + " has a good relationship with and has developed a slight romantic and sexual interest in" :
                    "a family member that " + name + " has a good relationship with, though such family member has developed a slight romantic and sexual interest in " + name + " that creates an unwelcome tension in an otherwise warm and caring family bond",
            },
            "romanticInterest_20_35": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has a good friendship with and who has developed a real romantic and sexual interest in " + name + " — " + name + " values this friendship greatly and feels the weight of not being able to return those feelings as an asexual person" :
                    "another character that " + name + " has a good friendship with and has also developed a real romantic and sexual interest in",
                family: isIncestuousValue ?
                    "a family member that " + name + " has a good relationship with and has developed a real romantic and sexual interest in" :
                    "a family member that " + name + " has a good relationship with, though such family member has developed a real romantic and sexual interest in " + name + " that puts a strain on what is otherwise a genuinely close and caring family bond",
            },
            "strongRomanticInterest_35_50": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has a good friendship with and who has developed strong romantic and sexual feelings for " + name + " — " + name + " holds them in high regard as a friend but cannot give those feelings back, which is a source of genuine sadness for " + name + "" :
                    "another character that " + name + " has a good friendship with and has also developed strong romantic and sexual feelings for",
                family: isIncestuousValue ?
                    "a family member that " + name + " has a good relationship with and has developed strong romantic and sexual feelings for" :
                    "a family member that " + name + " has a good relationship with, though such family member has developed strong romantic and sexual feelings for " + name + " that are unwanted and that weigh heavily on what is otherwise a meaningful and caring family relationship",
            },
            "deepInLove_50_100": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has a good friendship with and who has fallen deeply in love with and become sexually attracted to " + name + " — " + name + " genuinely cares for them, but being asexual means that love cannot be answered, and the depth of those unreciprocated feelings risks breaking a friendship that truly mattered" :
                    "another character that " + name + " has a good friendship with and has fallen deeply in love and lust with",
                family: isIncestuousValue ?
                    "a family member that " + name + " has a good relationship with and has fallen deeply in love with and become sexually attracted to" :
                    "a family member that " + name + " has a good relationship with, though such family member is deeply in love with and sexually attracted to " + name + " in a way that " + name + " does not reciprocate — a love that threatens to permanently alter and damage what was a genuinely good family relationship",
            },
        },
        "closeFriend_35_50": {
            "noRomanticInterest_0_10": {
                nonFamily: "another character that " + name + " has a close friendship with",
                family: "a family member that " + name + " has a close and deeply caring relationship with",
            },
            "slightRomanticInterest_10_20": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has a close friendship with and who has developed a slight romantic and sexual interest in " + name + " — " + name + " values this person deeply and does not want to lose them, but being asexual means those feelings will go unanswered, which is painful for both" :
                    "another character that " + name + " has a close friendship with and has also developed a slight romantic and sexual interest in",
                family: isIncestuousValue ?
                    "a family member that " + name + " is close to and has developed a slight romantic and sexual interest in — feelings that sit in uneasy contrast with the deep family trust between them" :
                    "a family member that " + name + " is close to, though such family member has developed a slight romantic and sexual interest in " + name + " that introduces a troubling undercurrent into a bond that was built on deep mutual trust and care",
            },
            "romanticInterest_20_35": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has a close friendship with and who has developed a genuine romantic and sexual interest in " + name + " — one of " + name + "'s closest connections, yet being asexual means they cannot return what the other person feels, turning a cherished bond into something complicated and fragile" :
                    "another character that " + name + " has a close friendship with and has also developed a real romantic and sexual interest in",
                family: isIncestuousValue ?
                    "a family member that " + name + " is close to and has developed a real romantic and sexual interest in — feelings that are difficult to reconcile with the deep family trust they share" :
                    "a family member that " + name + " is close to, though such family member has developed a genuine romantic and sexual interest in " + name + " that strains and threatens the deep trust at the core of their family bond",
            },
            "strongRomanticInterest_35_50": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has a close friendship with and who has fallen for " + name + " with strong romantic and sexual feelings — " + name + " holds this person among their closest, yet as an asexual person cannot answer those feelings, and the gap between what they can offer and what the other needs is a source of real pain" :
                    "another character that " + name + " has a close friendship with and has also developed strong romantic and sexual feelings for",
                family: isIncestuousValue ?
                    "a family member that " + name + " is close to and has developed strong romantic and sexual feelings for — feelings that run deep enough to fundamentally complicate the close family bond they have always shared" :
                    "a family member that " + name + " is close to, though such family member has developed strong romantic and sexual feelings for " + name + " that put serious strain on a bond built over years of genuine closeness and mutual care",
            },
            "deepInLove_50_100": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " has a close friendship with and who is deeply in love with and sexually attracted to " + name + " — this is one of " + name + "'s most important relationships, yet being asexual means that love cannot be returned as it is given, and the unreciprocated depth of feeling hangs over the friendship like a grief neither can fully name" :
                    "another character that " + name + " has a close friendship with and is deeply in love and in lust with",
                family: isIncestuousValue ?
                    "a family member that " + name + " is close to and has fallen deeply in love with and become sexually attracted to — a consuming love that lives alongside the deep family bond, impossible to set aside and impossible to act on without fracturing everything they have built together" :
                    "a family member that " + name + " is close to, though such family member is deeply in love with and sexually attracted to " + name + " — a love that " + name + " does not and cannot return, which casts a long and painful shadow over what is one of the most important bonds in " + name + "'s family life",
            },
        },
        "bestFriend_50_100": {
            "noRomanticInterest_0_10": {
                nonFamily: "another character that " + name + " considers a best friend",
                family: "a family member that " + name + " is extremely close to and deeply bonded with",
            },
            "slightRomanticInterest_10_20": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " considers a best friend and who has developed a slight romantic and sexual interest in " + name + " — " + name + " would do almost anything for this person, but being asexual means those feelings cannot be matched, and managing it without losing the most important friendship in " + name + "'s life is deeply difficult" :
                    "another character that " + name + " considers a best friend and has also developed a slight romantic and sexual interest in",
                family: isIncestuousValue ?
                    "a family member that " + name + " is closer to than anyone else and has developed a slight romantic and sexual interest in — a feeling that exists in painful tension with the profound bond they share as family" :
                    "a family member that " + name + " is closer to than anyone else, though such family member has developed a slight romantic and sexual interest in " + name + " that introduces a quiet but significant discomfort into what is the deepest bond in " + name + "'s family life",
            },
            "romanticInterest_20_35": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " considers a best friend and who has developed a real romantic and sexual interest in " + name + " — the most important person in " + name + "'s life outside of family, and yet being asexual means " + name + " cannot return what is being offered, which risks the very friendship they most value" :
                    "another character that " + name + " considers a best friend and has also developed a real romantic and sexual interest in",
                family: isIncestuousValue ?
                    "a family member that " + name + " is closer to than anyone else and has developed a real romantic and sexual interest in — feelings that are profound and that exist in deep conflict with the family bond that has always been at the center of their relationship" :
                    "a family member that " + name + " is closer to than anyone else, though such family member has developed a genuine romantic and sexual interest in " + name + " that is unwanted and that puts the single most important family bond in " + name + "'s life under serious strain",
            },
            "strongRomanticInterest_35_50": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " considers a best friend and who has developed strong romantic and sexual feelings for " + name + " — this person means more to " + name + " than almost anyone, yet being asexual, " + name + " cannot give back what they feel, and the weight of that unreciprocated love puts something irreplaceable at risk" :
                    "another character that " + name + " considers a best friend and has also developed strong romantic and sexual feelings for",
                family: isIncestuousValue ?
                    "a family member that " + name + " is closer to than anyone else and has developed strong romantic and sexual feelings for — feelings that are profound and that exist in deep conflict with the family bond that has always been at the center of their relationship" :
                    "a family member that " + name + " is closer to than anyone else, though such family member has developed strong romantic and sexual feelings for " + name + " that are unwanted and that place the foundation of " + name + "'s most important family relationship under enormous strain",
            },
            "deepInLove_50_100": {
                nonFamily: isAsexualValue ?
                    "another character that " + name + " considers a best friend and who is deeply in love with and sexually attracted to " + name + " — there is no one " + name + " is closer to, and yet being asexual means that love cannot be answered in kind; the depth of unreciprocated feeling is a wound that neither can easily heal, and it puts the most important connection in " + name + "'s life in jeopardy" :
                    "another character that " + name + " considers a best friend and is deeply in love with and sexually attracted to",
                family: isIncestuousValue ?
                    "a family member that " + name + " is closer to than anyone else and has fallen completely and deeply in love with and become sexually attracted to — a love as profound as the family bond itself, and one that is impossible to contain or ignore without it consuming everything between them" :
                    "a family member that " + name + " is closer to than anyone else, though such family member is completely and deeply in love with and sexually attracted to " + name + " — a love " + name + " does not return and that, given the depth of the bond between them, represents perhaps the most painful and complicated situation in " + name + "'s entire family life",
            },
        },
    };

    const STRANGERS = {
        "strangerNeutral_n5_5": "a stranger that " + name + " just met and has no feelings towards them either positive or negative",
        "strangerGood_5_100": "a stranger that " + name + " just met but has already formed a good impression of and has positive feelings towards them",
        "strangerBad_n100_n5": "a stranger that " + name + " just met but has already formed a bad impression of and has negative feelings towards them",
    };

    const needsReversed = !isIncestuousValue || isAsexualValue;

    const QUESTIONS = {
        "bondIncreaseQuestionsSlight": "would improve the relationship between " + name + " and OTHER_CHARACTER slightly, something that " + name + " would appreciate but not feel strongly about",
        "bondDecreaseQuestionsSlight": "would worsen the relationship between " + name + " and OTHER_CHARACTER slightly, something that " + name + " would dislike but not feel strongly about",
        "bondIncreaseQuestionsStrong": "would improve the relationship between " + name + " and OTHER_CHARACTER significantly, something that " + name + " would really appreciate and feel strongly about",
        "bondDecreaseQuestionsStrong": "would worsen the relationship between " + name + " and OTHER_CHARACTER significantly, something that " + name + " would really dislike and feel strongly about",

        "bondIncreaseQuestionsWhenStrangerSlight": "would improve the relationship between " + name + " and OTHER_CHARACTER if OTHER_CHARACTER considering that OTHER_CHARACTER is a stranger that they have just met, something that " + name + " would appreciate but not feel strongly about",
        "bondDecreaseQuestionsWhenStrangerSlight": "would worsen the relationship between " + name + " and OTHER_CHARACTER if OTHER_CHARACTER considering that OTHER_CHARACTER is a stranger that they have just met, something that " + name + " would dislike but not feel strongly about",
        "bondIncreaseQuestionsWhenStrangerStrong": "would improve the relationship between " + name + " and OTHER_CHARACTER if OTHER_CHARACTER considering that OTHER_CHARACTER is a stranger that they have just met, something that " + name + " would really appreciate and feel strongly about",
        "bondDecreaseQuestionsWhenStrangerStrong": "would worsen the relationship between " + name + " and OTHER_CHARACTER if OTHER_CHARACTER considering that OTHER_CHARACTER is a stranger that they have just met, something that " + name + " would really dislike and feel strongly about",

        "secondBondIncreaseQuestions_noRomanticInterest_0_10_reversed": "would mean that OTHER_CHARACTER has shown a romantic and sexual interest in " + name,
        "secondBondIncreaseQuestions_noRomanticInterest_0_10": "would make " + name + " start liking OTHER_CHARACTER whom they previously had no romantic feelings towards",
        "secondBondDecreaseQuestions_noRomanticInterest_0_10_reversed": "would mean that OTHER_CHARACTER has shown a lack of romantic and sexual interest in " + name,
        "secondBondDecreaseQuestions_noRomanticInterest_0_10": "would make " + name + " feel less sexually and romantically attracted towards OTHER_CHARACTER, despite only having a minor romantic interest. The questions should be specific to attraction",
        "secondBondIncreaseQuestions_slightRomanticInterest_10_20_reversed": "would mean that OTHER_CHARACTER has shown even more romantic and sexual interest in " + name + " (it's already established that OTHER_CHARACTER has shown a slight romantic and sexual interest in " + name + " before)",
        "secondBondIncreaseQuestions_slightRomanticInterest_10_20": "would make " + name + " start liking OTHER_CHARACTER even more romantically and sexually whom they have a slight romantic interest in",
        "secondBondDecreaseQuestions_slightRomanticInterest_10_20_reversed": "would mean that OTHER_CHARACTER has shown a less of romantic and sexual interest in " + name + " (it's established that OTHER_CHARACTER has shown a slight romantic and sexual interest in " + name + " before)",
        "secondBondDecreaseQuestions_slightRomanticInterest_10_20": "would make " + name + " feel less attracted romantically and sexually towards OTHER_CHARACTER (who they had already shown a slight romantic interest in). The questions should be specific to attraction",
        "secondBondIncreaseQuestions_romanticInterest_20_35_reversed": "would mean that OTHER_CHARACTER has shown even more romantic and sexual interest in " + name + " (it's already established that OTHER_CHARACTER has shown a romantic and sexual interest in " + name + " before)",
        "secondBondIncreaseQuestions_romanticInterest_20_35": "would make " + name + " start liking OTHER_CHARACTER even more sexually and romantically whom they have a romantic interest in",
        "secondBondDecreaseQuestions_romanticInterest_20_35_reversed": "would mean that OTHER_CHARACTER has shown a less of romantic and sexual interest in " + name + " (it's established that OTHER_CHARACTER has shown a romantic and sexual interest in " + name + " before)",
        "secondBondDecreaseQuestions_romanticInterest_20_35": "would make " + name + " feel less sexually and romantically attracted towards OTHER_CHARACTER (who they had already shown a romantic interest in). The questions should be specific to attraction",
        "secondBondIncreaseQuestions_strongRomanticInterest_35_50_reversed": "would mean that OTHER_CHARACTER has shown even more romantic and sexual interest in " + name + " (it's already established that OTHER_CHARACTER has shown a strong romantic and sexual interest in " + name + " before)",
        "secondBondIncreaseQuestions_strongRomanticInterest_35_50": "would make " + name + " start liking OTHER_CHARACTER even more sexually and romantically whom they have a strong romantic interest in",
        "secondBondDecreaseQuestions_strongRomanticInterest_35_50_reversed": "would mean that OTHER_CHARACTER has shown a less of romantic and sexual interest in " + name + " (it's established that OTHER_CHARACTER has shown a strong romantic and sexual interest in " + name + " before)",
        "secondBondDecreaseQuestions_strongRomanticInterest_35_50": "would make " + name + " feel less sexual and romantically attracted towards OTHER_CHARACTER (who they had already shown a strong romantic interest in). The questions should be specific to attraction",
        "secondBondIncreaseQuestions_deepInLove_50_100_reversed": "would mean that OTHER_CHARACTER has shown even more romantic and sexual interest in " + name + " (it's already established that OTHER_CHARACTER has shown a deep love and sexual interest in " + name + " before)",
        "secondBondIncreaseQuestions_deepInLove_50_100": "would make " + name + " start liking OTHER_CHARACTER even more sexually and romantically whom they have a deep romantic interest in",
        "secondBondDecreaseQuestions_deepInLove_50_100_reversed": "would mean that OTHER_CHARACTER has shown a less of romantic and sexual interest in " + name + " (it's established that OTHER_CHARACTER has shown a deep love and sexual interest in " + name + " before)",
        "secondBondDecreaseQuestions_deepInLove_50_100": "would make " + name + " feel less sexual and romantically attracted towards OTHER_CHARACTER (who they had already shown a deep romantic interest in). The questions should be specific to attraction",
    }

    /**
     * @type {{[key in keyof typeof QUESTIONS]: string[]}}
     */
    const result = /** @type {{[key in keyof typeof QUESTIONS]: string[]}} */ ({});
    for (const [questionKey, questionValue] of Object.entries(QUESTIONS)) {
        const isReversed = questionKey.endsWith("_reversed");
        if (isReversed && !needsReversed) {
            continue;
        }

        const questionsAnswer = await generator.next({
            maxCharacters: 200,
            maxSafetyCharacters: 0,
            maxParagraphs: 5,
            nextQuestion: "Provide a concise list of paragraph separated yes/no 3rd person questions (one question per paragraph) that provided a positive or yes answer " + questionValue,
            stopAfter: [],
            stopAt: [],
            instructions: "The questions should be answerable with a simple yes/no and end in question mark. Provide as many questions as possible, keep them short and simple.",
        });

        if (questionsAnswer.done) {
            throw new Error("Generator ended unexpectedly while generating questions for " + questionKey);
        }

        const questionsValue = questionsAnswer.value.trim().split("OTHER_CHARACTER").join("{{other}}").split(name).join("{{char}}")
            .split("\n").map(q => q.trim()).filter(q => q && q.endsWith("?") && (q.toLowerCase().startsWith("is") || q.toLowerCase().startsWith("does") || q.toLowerCase().startsWith("would") || q.toLowerCase().startsWith("has") || q.toLowerCase().startsWith("have") || q.toLowerCase().startsWith("can") || q.toLowerCase().startsWith("could") || q.toLowerCase().startsWith("should") || q.toLowerCase().startsWith("will") || q.toLowerCase().startsWith("did")));
        // @ts-ignore
        result[questionKey] = questionsValue
    }

    headerCode += `\t/** @type {DEBondIncreaseDecreaseQuestion[]} */\n`;
    headerCode += `\tconst bondIncreaseDecreaseWhenStranger = [\n`;

    for (const slightQuestionValue of result["bondIncreaseQuestionsWhenStrangerSlight"]) {
        headerCode += `\t\t{\n`;
        headerCode += `\t\t\ttemplate: DE.utils.newHandlebarsTemplate(DE, ${JSON.stringify(slightQuestionValue)}),\n`;
        headerCode += `\t\t\tweight: 0.5,\n`;
        headerCode += `\t\t\taffectsBonds: "primary",\n`;
        headerCode += `\t\t},\n`;
    }

    for (const slightQuestionValue of result["bondDecreaseQuestionsSlight"]) {
        headerCode += `\t\t{\n`;
        headerCode += `\t\t\ttemplate: DE.utils.newHandlebarsTemplate(DE, ${JSON.stringify(slightQuestionValue)}),\n`;
        headerCode += `\t\t\tweight: -0.5,\n`;
        headerCode += `\t\t\taffectsBonds: "both",\n`;
        headerCode += `\t\t},\n`;
    }

    for (const strongQuestionValue of result["bondIncreaseQuestionsWhenStrangerStrong"]) {
        headerCode += `\t\t{\n`;
        headerCode += `\t\t\ttemplate: DE.utils.newHandlebarsTemplate(DE, ${JSON.stringify(strongQuestionValue)}),\n`;
        headerCode += `\t\t\tweight: 1,\n`;
        headerCode += `\t\t\taffectsBonds: "primary",\n`;
        headerCode += `\t\t},\n`;
    }

    for (const strongQuestionValue of result["bondDecreaseQuestionsWhenStrangerStrong"]) {
        headerCode += `\t\t{\n`;
        headerCode += `\t\t\ttemplate: DE.utils.newHandlebarsTemplate(DE, ${JSON.stringify(strongQuestionValue)}),\n`;
        headerCode += `\t\t\tweight: -1,\n`;
        headerCode += `\t\t\taffectsBonds: "both",\n`;
        headerCode += `\t\t},\n`;
    }

    headerCode += `\t];\n\n`;
    headerCode += `\t/** @type {DEBondIncreaseDecreaseQuestion[]} */\n`;
    headerCode += `\tconst bondIncreaseDecreaseBase = [\n`;

    for (const slightQuestionValue of result["bondIncreaseQuestionsSlight"]) {
        headerCode += `\t\t{\n`;
        headerCode += `\t\t\ttemplate: DE.utils.newHandlebarsTemplate(DE, ${JSON.stringify(slightQuestionValue)}),\n`;
        headerCode += `\t\t\tweight: 0.5,\n`;
        headerCode += `\t\t\taffectsBonds: "primary",\n`;
        headerCode += `\t\t},\n`;
    }

    for (const slightQuestionValue of result["bondDecreaseQuestionsSlight"]) {
        headerCode += `\t\t{\n`;
        headerCode += `\t\t\ttemplate: DE.utils.newHandlebarsTemplate(DE, ${JSON.stringify(slightQuestionValue)}),\n`;
        headerCode += `\t\t\tweight: -0.5,\n`;
        headerCode += `\t\t\taffectsBonds: "both",\n`;
        headerCode += `\t\t},\n`;
    }

    for (const strongQuestionValue of result["bondIncreaseQuestionsStrong"]) {
        headerCode += `\t\t{\n`;
        headerCode += `\t\t\ttemplate: DE.utils.newHandlebarsTemplate(DE, ${JSON.stringify(strongQuestionValue)}),\n`;
        headerCode += `\t\t\tweight: 1,\n`;
        headerCode += `\t\t\taffectsBonds: "primary",\n`;
        headerCode += `\t\t},\n`;
    }

    for (const strongQuestionValue of result["bondDecreaseQuestionsStrong"]) {
        headerCode += `\t\t{\n`;
        headerCode += `\t\t\ttemplate: DE.utils.newHandlebarsTemplate(DE, ${JSON.stringify(strongQuestionValue)}),\n`;
        headerCode += `\t\t\tweight: -1,\n`;
        headerCode += `\t\t\taffectsBonds: "both",\n`;
        headerCode += `\t\t},\n`;
    }

    headerCode += `\t];\n\n`;

    const loopables = [
        "noRomanticInterest_0_10",
        "slightRomanticInterest_10_20",
        "romanticInterest_20_35",
        "strongRomanticInterest_35_50",
        "deepInLove_50_100",
    ]

    if (needsReversed) {
        for (const loopable of loopables) {
            /**
             * @type {string[]}
             */
            // @ts-ignore
            const reversedQuestionsIncrease = result["secondBondIncreaseQuestions_" + loopable + "_reversed"] || [];
            /**
             * @type {string[]}
             */
            // @ts-ignore
            const reversedQuestionsDecrease = result["secondBondDecreaseQuestions_" + loopable + "_reversed"] || [];

            headerCode += `\t/** @type {DEBondIncreaseDecreaseQuestion[]} */\n`;
            headerCode += `\tconst secondBondIncreaseDecreaseQuestions_${loopable}_reversed = [\n`;
            for (const question of reversedQuestionsIncrease) {
                headerCode += `\t\t{\n`;
                headerCode += `\t\t\ttemplate: DE.utils.newHandlebarsTemplate(DE, ${JSON.stringify(question)}),\n`;
                headerCode += `\t\t\tweight: 1,\n`;
                headerCode += `\t\t\taffectsBonds: "secondary",\n`;
                headerCode += `\t\t},\n`;
            }
            for (const question of reversedQuestionsDecrease) {
                headerCode += `\t\t{\n`;
                headerCode += `\t\t\ttemplate: DE.utils.newHandlebarsTemplate(DE, ${JSON.stringify(question)}),\n`;
                headerCode += `\t\t\tweight: -1,\n`;
                headerCode += `\t\t\taffectsBonds: "secondary",\n`;
                headerCode += `\t\t},\n`;
            }
            headerCode += `\t];\n\n`;
        }
    }

    for (const loopable of loopables) {
        /**
         * @type {string[]}
         */
        // @ts-ignore
        const questionsIncrease = result["secondBondIncreaseQuestions_" + loopable] || [];
        /**
         * @type {string[]}
         */
        // @ts-ignore
        const questionsDecrease = result["secondBondDecreaseQuestions_" + loopable] || [];

        headerCode += `\t/** @type {DEBondIncreaseDecreaseQuestion[]} */\n`;
        headerCode += `\tconst secondBondIncreaseDecreaseQuestions_${loopable} = [\n`;
        for (const question of questionsIncrease) {
            headerCode += `\t\t{\n`;
            headerCode += `\t\t\ttemplate: DE.utils.newHandlebarsTemplate(DE, ${JSON.stringify(question)}),\n`;
            headerCode += `\t\t\tweight: 1,\n`;
            headerCode += `\t\t\taffectsBonds: "secondary",\n`;
            headerCode += `\t\t},\n`;
        }
        for (const question of questionsDecrease) {
            headerCode += `\t\t{\n`;
            headerCode += `\t\t\ttemplate: DE.utils.newHandlebarsTemplate(DE, ${JSON.stringify(question)}),\n`;
            headerCode += `\t\t\tweight: -1,\n`;
            headerCode += `\t\t\taffectsBonds: "secondary",\n`;
            headerCode += `\t\t},\n`;
        }
        headerCode += `\t];\n\n`;
    }

    for (const [strangerKey, strangerValue] of Object.entries(STRANGERS)) {
        code += `\t\t${strangerKey}: {\n`;

        const descriptionQuestion = await generator.next({
            maxCharacters: 200,
            maxSafetyCharacters: 0,
            maxParagraphs: 1,
            nextQuestion: "Provide a concise one paragraph description of how " + name + " perceives and feels about " + strangerValue + ". Focus on the emotional and psychological aspects of their perception, rather than physical details. This should capture the essence of their feelings and attitudes towards this person in a way that informs their interactions and relationship dynamics.",
            stopAfter: [],
            stopAt: [],
            instructions: "The response should use the word 'OTHER_CHARACTER' to refer to the other character name, ensure to specify whether " + name + " has any romantic feelings towards OTHER_CHARACTER or not, and how they would feel or react regarding sexual interactions, intimacy and other interactions, include friendship, emotional, romantic and sexual aspects",
        });

        if (descriptionQuestion.done) {
            throw new Error("Generator ended unexpectedly while generating description for " + strangerKey);
        }

        const descriptionValue = descriptionQuestion.value.trim().split(name).join("{{char}}").split("OTHER_CHARACTER").join("{{other}}");

        code += `\t\t\tdescription: \`${descriptionValue}\`,\n`;
        code += `\t\t\tbondConditions: bondIncreaseDecreaseWhenStranger,\n`;
        code += `\t\t},\n`;
    }

    for (const [relationshipKey, relationshipValue] of Object.entries(SETTINGS)) {
        code += `\t\t${relationshipKey}: {\n`;

        for (const [romanticInterestKey, romanticInterestValue] of Object.entries(relationshipValue)) {
            code += `\t\t\t${romanticInterestKey}: {\n`;

            for (const [familyKey, familyValue] of Object.entries(romanticInterestValue)) {
                code += `\t\t\t\t${familyKey}: {\n`;

                const descriptionQuestion = await generator.next({
                    maxCharacters: 200,
                    maxSafetyCharacters: 0,
                    maxParagraphs: 1,
                    nextQuestion: "Provide a concise one paragraph description of how " + name + " perceives and feels about " + familyValue + ". Focus on the emotional and psychological aspects of their perception, rather than physical details. This should capture the essence of their feelings and attitudes towards this person in a way that informs their interactions and relationship dynamics.",
                    stopAfter: [],
                    stopAt: [],
                    instructions: "The response should use the word 'OTHER_CHARACTER' to refer to the other character name, ensure to specify whether " + name + " has any romantic feelings towards OTHER_CHARACTER or not, and how they would feel or react regarding sexual interactions, intimacy and other interactions, include friendship, emotional, romantic and sexual aspects",
                });

                if (descriptionQuestion.done) {
                    throw new Error("Generator ended unexpectedly while generating description for " + relationshipKey + " > " + romanticInterestKey + " > " + familyKey);
                }

                const descriptionValue = descriptionQuestion.value.trim().split(name).join("{{char}}").split("OTHER_CHARACTER").join("{{other}}");

                const secondBondIncreaseVariableLocation = "secondBondIncreaseDecreaseQuestions_" + romanticInterestKey;

                code += `\t\t\t\t\tdescription: \`${descriptionValue}\`,\n`;
                if (isAsexualValue || (familyValue === "family" && !isIncestuousValue)) {
                    code += `\t\t\t\t\tbondConditions: [...bondIncreaseDecreaseBase, ...${secondBondIncreaseVariableLocation}_reversed],\n`;
                } else {
                    code += `\t\t\t\t\tbondConditions: [...bondIncreaseDecreaseBase, ...${secondBondIncreaseVariableLocation}],\n`;
                }
                code += `\t\t\t\t},\n`;
            }

            code += `\t\t\t},\n`;
        }

        code += `\t\t},\n`;
    }

    code += `\t}));\n}`;

    await generator.next(null); // end the generator

    const newScript = `const fss = await importScript("bond-systems", "full-standard-bond-system");

engine.exports = {
type: "characters",
initialize(DE) {
${headerCode}

${code}
}
`;

    return newScript;
}