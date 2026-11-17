import { DEngine } from "../index.js";
import { getBeingCarriedByCharacter, getCharacterExactLocation, getExternalDescriptionOfCharacter } from "../util/character-info.js";
import { convertMessagesToSimpleList, getHistoryFragment } from "../util/messages.js";
import { getCharacterCarryingCapacity, getCharacterVolume, getCharacterWeight, getItemExcessElements, getItemVolume, getItemWeight, getWearableFitment, locationPathToMessage, locationPathToMessageWithoutItemName, resolvePath } from "../util/weight-and-volume.js";
import { yesNoGrammar, isYes } from "../util/grammar.js";
import { debug } from "../debug.js";

/**
 * 
 * @param {string} string 
 * @returns {string}
 */
function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

const nameOptionsBase = [
    "Bob",
    "Emma",
    "Joe",
]

const nameOptionsExtras = [
    "Charlie",
    "David",
    "Fiona",
    "George",
    "Hannah",
    "Ian",
    "Jane",
    "Kevin",
    "Laura",
    "Mike",
    "Nina",
    "Oscar",
    "Paula",
    "Quinn",
    "Rachel",
    "Sam",
    "Tina",
]

/**
 * @param {string[]} involvedNames 
 * @param {number} index 
 */
function getCharacterNameForExample(involvedNames, index) {
    if (!involvedNames.includes(nameOptionsBase[index])) {
        return nameOptionsBase[index];
    } else {
        let matchCount = 0;
        for (const name of nameOptionsExtras) {
            if (!involvedNames.includes(name)) {
                matchCount++;
            }

            if (matchCount === (index + 1)) {
                return name;
            }
        }

        throw new Error("Not enough name options to assign character names for item changes feasibility check examples. Please add more names to the nameOptionsExtras array.");
    }
}

/**
 * @param {DEngine} engine
 * @returns {Promise<{destroyedItemIds: string[]}>} destroyedItems
 */
export default async function calculatePhysicalChanges(engine) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    } else if (!engine.inferenceAdapter) {
        throw new Error("Inference adapter not set, cannot perform inference");
    } else if (!engine.deObject.user) {
        throw new Error("User character not set, cannot perform feasibility check for user");
    }

    if (!debug.ENABLED_PHYSICAL_CHANGE) {
        return { destroyedItemIds: [] };
    }

    const userCharacter = engine.deObject.characters[engine.deObject.user];

    // Step by step first we grab the character state that sent that story to analyze
    const charState = engine.deObject.stateFor[engine.deObject.user];
    if (!charState) {
        throw new Error(`Character state for ${engine.deObject.user} not found.`);
    }

    /**
     * @type {string[]}
     */
    const destroyedItems = [];

    // we also get the location name for the character state location, since we will need it for the questioning agent context
    const location = engine.deObject.world.locations[charState.location];
    const yesNoGrammarObject = yesNoGrammar(engine);

    const lastCycleMessagesInfo = await getHistoryFragment(engine, userCharacter, {
        msgLimit: "ALL_UNPROCESSED_MESSAGES_UNTIL_FIRST_PROCESSED_MESSAGE",
        includeDebugMessages: false,
        includeRejectedMessages: false,
        perspective: "story-master",
    });

    const messages = convertMessagesToSimpleList(lastCycleMessagesInfo.messages);

    // 1. CATACLYSM: ask if there has been a cataclysm, explosion, or any other event that could have destroyed all the items in the story fragment.
    //    1.1. Ask if the items were merely broken/damaged or deleted from existence.
    //       1.1.1 If they were damaged, ask for "slightly damaged", "moderately damaged", or "heavily damaged" for all the items as a whole.
    //    1.1. Follow up and ask if some of the items have been realistically spared (been the exception) and if so, which ones, as a list of ids.
    //    1.2. If in 1.1 they were deleted from existence, ask if the items that were spared remain pristine or if they have been damaged too.
    //       1.2.1. If they were damaged, ask for "slightly damaged", "moderately damaged", or "heavily damaged" for each item that was spared one by one, as a list of ids and their damage level.
    //    1.3. If in 1.1 they were not deleted from existence, ask if there was an explosion/implosion that would have moved and scattered everything around.

    // 2. If NO CATACLYSM.
    //    2.1. ask what items have been realistically destroyed and deleted from existence, explain that means the item must have been desintegrated or magically erased
    //    2.2. ask what items have been realistically damaged, explain that means the item must have been physically damaged but not destroyed or changed, and ask for "slightly damaged", "moderately damaged", or "heavily damaged" for each item that was damaged one by one, as a list of ids and their damage level.
    //         2.2.1. Ask if they broke into pieces, and if so ask for the number of pieces they broke into.
    //         2.2.2. Request new description of the item.
    //    2.3. ask what items have been transformed into other items, explain that this means taking one or more items and combining or changing them into one or more items; therefore.
    //         2.3.1. ask for the original items that were transformed, as a list of ids.
    //         2.3.2. ask for created items that were transformed into, as a list of ids.
    //                2.3.2.1. ask for the name of the created item, description, weight, volume, and any other relevant properties; we need to fill DEItem.
    //    2.4. ask what items have been moved, explain that means the item must have been physically moved to another location, handed to another character, dropped or thrown somewhere.
    //         2.4.1. ask for thrown item at at whom they were directed at (item or object), if it hit or fell or the ground/hit a wall.
    //         2.4.2. ask for where each item was moved top, as the character id, carrying, wearing, atop of another item, inside, etc...

    // 3. Ask if a character approached another character by their id
    // 4. Ask if a character left the location to another location (which one maybe?)
    // 5. Ask if a character has contacted another using a communicator device, which communicator item id.
    //    5.1. This will need a feasibility check in here to figure the outcome, will be implemented, eventually.
    // 6. ask about harmed characters, if they were harmed and how much.
    //    6.1. Type of harm or injury sustained.

    return { destroyedItemIds: destroyedItems };
}