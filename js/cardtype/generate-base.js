import { DEngine } from '../engine/index.js';
import { createCardStructureFrom, getJsCard } from './base.js';

if (typeof process !== "undefined" && process.versions && process.versions.node) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

/**
 * @param {DEngine} engine
 * @param {string} source
 * @return {Promise<string>}
 */
export async function generateBase(engine, source) {
    const card = createCardStructureFrom('');
    card.card = source;
    
    card.imports.push(`const fss = await importScript("bond-systems", "full-standard-bond-system");`);
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
    card.body.push(`general: DE.utils.newHandlebarsTemplate(DE, ${JSON.stringify(description)}),`);

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
    card.body.push(`shortDescription: ${JSON.stringify(shortDescription)},`);

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
    card.body.push(`shortDescriptionTopNakedAdd: ${JSON.stringify(shortDescriptionTopNakedAdd)},`);

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
    card.body.push(`shortDescriptionBottomNakedAdd: ${JSON.stringify(shortDescriptionBottomNakedAdd)},`);

    card.body.push(`generalCharacterDescriptionInjection: {},`);
    card.body.push(`actionPromptInjection: {},`);
    card.body.push(`bonds: null,`);
    card.body.push(`characterRules: {},`);
    card.body.push(`emotions: {},`);
    card.body.push(`states: {},`);

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
        
        card.body.push(`schizophrenia: ${severity},`);

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

    card.body.push(`carryingCapacityKg: ${carryingCapacityKg.value.trim()},`);

    // double the volume of the potential weight lifted
    card.body.push(`carryingCapacityLiters: ${parseInt(carryingCapacityKg.value.trim()) * 2},`);

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

    card.body.push(`heightCm: ${heightCm.value.trim()},`);

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

        const isMaleValue = isMale.value.trim().toLowerCase() === "yes";
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

            const isFemaleValue = isFemale.value.trim().toLowerCase() === "yes";
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

    if (hasNoSex.value.trim().toLowerCase() === "yes") {
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

        if (isIntersex.value.trim().toLowerCase() === "yes") {
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

    const highestTier = sortedTiers.find(tier => tierAnswers[tier]);

    if (!highestTier) {
        card.body.push(`tier: "human",`);
    } else {
        card.body.push(`tier: ${JSON.stringify(highestTier)},`);
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

    const howOldYears = parseInt(answerHowOld.value.trim());
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

    card.body.push(`weightKg: ${weightKg.value.trim()},`);

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

    card.body.push(`heroism: ${parseInt(heroismValue.value.trim()) / 10},`);

    card.body.push(`properties: {},`);

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

    card.body.push(`attractiveness: ${parseInt(attractivenessValue.value.trim()) / 10},`);

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

    card.body.push(`charisma: ${parseInt(charismaValue.value.trim()) / 10},`);

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

    card.body.push(`gossipTendency: ${parseInt(gossipValue.value.trim()) / 10},`);
    card.body.push(`familyTies: {}, // Not covered in cardtype`);

    const likesList = await generator.next({
        maxCharacters: 1000,
        maxSafetyCharacters: 0,
        maxParagraphs: 10,
        nextQuestion: "List some activities or topics of conversation that " + name + " likes, at most 10 things",
        stopAfter: [],
        stopAt: [],
        instructions: "Answer with a list of things that " + name + " likes, these should be single words and in lowercase only, separate them with commas, do not use conjunctions like and, or, etc. just a simple list of things that " + name + " likes separated by commas. these can be activities or topics of conversation.",
        grammar: "root ::= item moreItems\nmoreItems ::= \",\" item moreItems | \"\"\nitem ::= [a-z]+"
    });

    if (likesList.done) {
        throw new Error("Generator finished without producing output");
    }

    card.body.push(`likes: [${likesList.value.trim().split(",").filter(item => item.trim() !== "").map(item => `"${item.trim()}"`).join(", ")}], // These are ids that need to be specified for the social simulation`);

    const dislikesList = await generator.next({
        maxCharacters: 1000,
        maxSafetyCharacters: 0,
        maxParagraphs: 10,
        nextQuestion: "List some activities or topics of conversation that " + name + " dislikes, at most 10 things",
        stopAfter: [],
        stopAt: [],
        instructions: "Answer with a list of things that " + name + " dislikes, these should be single words and in lowercase only, separate them with commas, do not use conjunctions like and, or, etc. just a simple list of things that " + name + " dislikes separated by commas. these can be activities or topics of conversation.",
        grammar: "root ::= item moreItems\nmoreItems ::= \",\" item moreItems | \"\"\nitem ::= [a-z]+"
    });

    if (dislikesList.done) {
        throw new Error("Generator finished without producing output");
    }

    card.body.push(`dislikes: [${dislikesList.value.trim().split(",").filter(item => item.trim() !== "").map(item => `"${item.trim()}"`).join(", ")}], // These are ids that need to be specified for the social simulation`);

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

    card.body.push(`species: ${JSON.stringify(species.value.trim())},`);

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

    card.body.push(`race: ${JSON.stringify(race.value.trim())},`);

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
        card.body.push(`groupBelonging: null,`);
    } else {
        card.body.push(`groupBelonging: [${JSON.stringify(groupBelonging.value.trim())}],`);
    }

    card.body.push(`dislikesSpecies: [], // Up to you to make the character prejudiced against certain species`);
    card.body.push(`dislikesRaces: [], // Up to you to make the character racist`);
    card.body.push(`dislikesGroups: [], // Up to you to make the character prejudiced against certain groups`);

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

    const isAsexualValue = isAsexual.value.trim().toLowerCase() === "yes";

    const minAgeAttractionPotential = (howOldYears / 2) + 7; // the half your age plus seven rule is a common rule of thumb for the minimum age of attraction
    const maxAgeAttractionPotential = howOldYears + 10;

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

        const findsAmbiguousGendersSexuallyAttractiveValue = findsAmbiguousGendersSexuallyAttractive.value.trim().toLowerCase() === "yes";

        card.body.push(`// You can make these far more specific if needed, but these are for the social simulation and wander heuristics`);

        if (findsAmbiguousGendersSexuallyAttractiveValue) {
            card.body.push(`{towards: "ambiguous", "ageRange": [${minAgeAttractionPotential}, ${maxAgeAttractionPotential}]},`);
            card.body.push(`{towards: "male", "ageRange": [${minAgeAttractionPotential}, ${maxAgeAttractionPotential}]},`);
            card.body.push(`{towards: "female", "ageRange": [${minAgeAttractionPotential}, ${maxAgeAttractionPotential}]},`);
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

            const findsMalesSexuallyAttractiveValue = findsMalesSexuallyAttractive.value.trim().toLowerCase() === "yes";

            if (findsMalesSexuallyAttractiveValue) {
                card.body.push(`{towards: "male", "ageRange": [${minAgeAttractionPotential}, ${maxAgeAttractionPotential}]},`);
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

            const findsFemalesSexuallyAttractiveValue = findsFemalesSexuallyAttractive.value.trim().toLowerCase() === "yes";

            if (findsFemalesSexuallyAttractiveValue) {
                card.body.push(`{towards: "female", "ageRange": [${minAgeAttractionPotential}, ${maxAgeAttractionPotential}]},`);
                attractions.push("female");
            }
        }
    }

    card.body.push(`],`);
    card.body.push(`},`);
    card.body.push(`}, {`);
    card.body.push(`type: "4d_standard",`);

    card.config.isAsexual = isAsexualValue;
    card.config.name = name;
    card.config.attractions = attractions;
    card.config.attractionAgeRange = attractionAgeRange;
    card.config.characterAge = howOldYears;
    card.config.characterSpecies = species.value.trim();

    await generator.next(null); // end the generator

    return getJsCard(card);
}