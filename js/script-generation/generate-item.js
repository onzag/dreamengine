import { DEngine } from '../engine/index.js';

/**
 * @param {DEngine} engine
 * @param {import('./base.js').ScriptTypeGenerator} scriptgenerator
 * @param {import('./base.js').ScriptTypeGuider} guider
 * @param {{forceClothing: boolean}} options
 * @return {Promise<DEItem>}
 */
export async function generateItem(engine, scriptgenerator, guider, options) {
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
        isConsumable: false,
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

    

    return baseItem;
}