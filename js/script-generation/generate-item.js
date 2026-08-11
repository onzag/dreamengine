import { DEngine } from '../engine/index.js';

/**
 * @param {DEngine} engine
 * @param {import('./base.js').ScriptTypeGenerator} scriptgenerator
 * @param {import('./base.js').ScriptTypeGuider} guider
 * @param {{forceClothing: boolean}} options
 * @return {Promise<DEItem>}
 */
export async function generateItem(engine, scriptgenerator, guider, options) {
    const inferenceAdapter = engine.inferenceAdapter;
    if (!inferenceAdapter) {
        throw new Error("No inference adapter found on engine");
    }

    const systemPrompt = inferenceAdapter.buildSystemPromptForQuestioningAgent(
        `You are a helpful assistant that will answer and assist in defining items for a game based on their description, you are allowed free rein to interpret the item's description and generate the code that defines them in the game, you will be asked questions about the item and you should answer them as best as you can`,
        [],
        `# Character Card:\n\n${scriptgenerator.state.card}`
    );

    const generator = inferenceAdapter.runQuestioningCustomAgentOn("cardtype-gen-bonds", {
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

    /**
     * @type {DEItem}
     */
    const baseItem = {
        owner: null,
        state: {},
        volumeLiters: 0,
        weightKg: 0,
        name: "Unnamed Item",
        amount: 1,
        description: "No description",
        containing: [],
        ontop: [],
        containingCharacters: [],
        maxVolumeOnTopLiters: 0,
        maxWeightOnTopKg: 0,
        ontopCharacters: [],
    };

    const firstQuestion = options.forceClothing ? "What is the name of the clothing item?" : "What is the name of the item?";
    const itemName = await guider.askOpen("item-name", firstQuestion, async () => {
        const randomItems = options.forceClothing ? [
            "Fancy dress",
            "Leather jacket",
            "Space suit",
            "Wizard robe",
            "Casual t-shirt",
            "Jeans",
        ] : [
            "Mysterious artifact",
            "Ancient book",
            "Enchanted sword",
            "Potion of healing",
            "Bag of gold coins",
            "Crystal orb",
        ];
        const randomItem = randomItems[Math.floor(Math.random() * randomItems.length)];
        return randomItem;
    });

    baseItem.name = itemName.value;

    const itemDescription = await guider.askOpen("item-description", "What is the description of the item?", async () => {
        await prime();
        const answer = await generator.next({
            maxCharacters: 200,
            maxSafetyCharacters: 200,
            maxParagraphs: 1,
            nextQuestion: `What is the description of the item named: '${itemName.value}'?`,
            stopAfter: [],
            stopAt: ["\n"],
            instructions: `Provide a suitable short description for the item named: '${itemName.value}' that captures its essence and purpose in the game. The description should be concise, engaging, and informative, highlighting any unique features or characteristics of the item. Avoid using generic phrases and focus on what makes this item special or interesting to players.`,
        });

        if (answer.done) {
            throw new Error("Generator finished without producing output");
        }

        return answer.value.trim();
    });

    baseItem.description = itemDescription.value;

    const itemVolume = await guider.askNumber("item-volume", "What is the volume of the item in liters?", async () => {
        await prime();
        const answer = await generator.next({
            maxCharacters: 50,
            maxSafetyCharacters: 50,
            maxParagraphs: 1,
            nextQuestion: `What is the volume of the item named: '${itemName.value}' in liters?`,
            stopAfter: [],
            stopAt: [],
            instructions: `Provide the volume of the item named: '${itemName.value}' in liters. The volume should be a positive number.`,
            grammar: "root ::= [0-9]+",
            answerTrail: `The volume of a single '${itemName.value}' in liters is:\n\n`,
        });

        if (answer.done) {
            throw new Error("Generator finished without producing output");
        }

        return parseFloat(answer.value.trim());
    });

    baseItem.volumeLiters = itemVolume.value;

    const itemWeight = await guider.askNumber("item-weight", "What is the weight of the item in kilograms?", async () => {
        await prime();
        const answer = await generator.next({
            maxCharacters: 50,
            maxSafetyCharacters: 50,
            maxParagraphs: 1,
            nextQuestion: `What is the weight of the item named: '${itemName.value}' in kilograms?`,
            stopAfter: [],
            stopAt: [],
            instructions: `Provide the weight of the item named: '${itemName.value}' in kilograms. The weight should be a positive number.`,
            grammar: "root ::= [0-9]+(\\.[0-9]+)?",
            answerTrail: `The weight of a single '${itemName.value}' in kilograms is:\n\n`,
        });

        if (answer.done) {
            throw new Error("Generator finished without producing output");
        }
        return parseFloat(answer.value.trim());
    });

    baseItem.weightKg = itemWeight.value;

    const isClothing = options.forceClothing ? true : await guider.askBoolean("item-is-clothing", "Is this item a piece of clothing?", async () => {
        await prime();
        const answer = await generator.next({
            maxCharacters: 5,
            maxSafetyCharacters: 5,
            maxParagraphs: 1,
            nextQuestion: `Is the item named: '${itemName.value}' a piece of clothing?`,
            stopAfter: [],
            stopAt: [],
            instructions: `Answer with 'yes' or 'no'.`,
            grammar: "root ::= 'yes' | 'no' | 'Yes' | 'No' | 'YES' | 'NO'",
            answerTrail: `The item named '${itemName.value}' is clothing:\n\n`,
        });

        if (answer.done) {
            throw new Error("Generator finished without producing output");
        }

        return answer.value.trim().toLowerCase() === "yes";
    });

    const isFood = isClothing ? false : await guider.askBoolean("item-is-food", "Is this item a consumable food or drink?", async () => {
        await prime();
        const answer = await generator.next({
            maxCharacters: 5,
            maxSafetyCharacters: 5,
            maxParagraphs: 1,
            nextQuestion: `Is the item named: '${itemName.value}' a consumable food or drink?`,
            stopAfter: [],
            stopAt: [],
            instructions: `Answer with 'yes' or 'no'.`,
            grammar: "root ::= 'yes' | 'no' | 'Yes' | 'No' | 'YES' | 'NO'",
            answerTrail: `The item named '${itemName.value}' is consumable:\n\n`,
        });

        if (answer.done) {
            throw new Error("Generator finished without producing output");
        }

        return answer.value.trim().toLowerCase() === "yes";
    });

    

    return baseItem;
}