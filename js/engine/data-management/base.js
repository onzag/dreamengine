/**
 * @typedef {Object} BaseDatabaseController
 * @property {() => Promise<string>} newDatabase
 * @property {(loadId: string) => Promise<string>} loadDatabase
 * @property {(id: string, saveName: string, metadata?: any) => Promise<void>} saveDatabase
 * @property {(id: string) => Promise<void>} closeDatabase
 * @property {(id: string, query: string, params?: any[]) => Promise<any[]>} runQuery
 */

export class BaseDataManager {
    /**
     * @param {BaseDatabaseController} databaseController 
     */
    constructor(databaseController) {
        /** @type {BaseDatabaseController} */
        this.databaseController = databaseController;
        /** @type {string | null} */
        this.currentDatabaseId = null;
    }

    async newDatabase() {
        if (this.currentDatabaseId) {
            throw new Error("A database is already loaded. Close it before creating a new one.");
        }
        this.currentDatabaseId = await this.databaseController.newDatabase();
    }

    /**
     * @param {string} loadName 
     */
    async loadDatabase(loadName) {
        if (this.currentDatabaseId) {
            throw new Error("A database is already loaded. Close it before loading a new one.");
        }
        this.currentDatabaseId = await this.databaseController.loadDatabase(loadName);
    }

    async closeCurrentDatabase() {
        if (this.currentDatabaseId) {
            await this.databaseController.closeDatabase(this.currentDatabaseId);
            this.currentDatabaseId = null;
        }
    }

    /**
     * 
     * @param {string} saveName
     * @param {any} [metadata] Arbitrary JSON metadata to store with the save.
     */
    async saveCurrentDatabase(saveName, metadata) {
        if (!this.currentDatabaseId) {
            throw new Error("No database is currently loaded. Cannot save.");
        }
        await this.databaseController.saveDatabase(this.currentDatabaseId, saveName, metadata);
    }

    /**
     * @param {DEObject} deObject
     * @returns {Promise<void>}
     */
    async setDEObject(deObject) {

    }

    /**
     * @param {string[]} scriptOrder 
     * @returns {Promise<void>}
     */
    async setScriptOrder(scriptOrder) {

    }

    /**
     * @return {Promise<DEObject | null>}
     */
    async getDEObject() {
        return null; // Placeholder: Implement logic to retrieve the DEObject from the database.
    }

    /**
     * 
     * @returns {Promise<string[] | null>}
     */
    async getScriptOrder() {
        return null; // Placeholder: Implement logic to retrieve the script order from the database.
    }

    /**
     * 
     * @param {string} conversationId 
     * @returns {Promise<DEConversation|null>}
     */
    async getConversation(conversationId) {
        return null; // Placeholder: Implement logic to retrieve a conversation from the database.
    }

    /**
     * Return matching location snapshots from conversations charId participated in,
     * including the locations of other participants. Match the recorded location or slot
     * name, ignoring case, accents, punctuation and spacing. Empty normalized searches
     * return no matches. Results are newest first, one row per conversation and participant;
     * repeated locations are retained with their source conversation and participant IDs.
     * @param {string} charId
     * @param {string} locationOrSlotName
     * @returns {Promise<DEConversationLocationMatch[]>}
     */
    async getPossibleLocationsCharKnowsAlikeTo(charId, locationOrSlotName) {
        return [];
    }

    /**
     * @param {string} messageId 
     * @returns {Promise<DEConversationMessage|null>}
     */
    async getConversationMessage(messageId) {
        return null; // Placeholder: Implement logic to retrieve a conversation message from the database.
    }

    /**
     * @param {Omit<DEConversation, "id">} conversation 
     * @returns {Promise<DEConversation>}
     */
    async newConversation(conversation) {
        // Placeholder: Implement logic to create a new conversation in the database.
        // @ts-ignore
        return null;
    }

    /**
     * @param {string} conversationId
     * @param {Omit<DEConversationMessage, "id">} message 
     * @returns {Promise<DEConversationMessage|null>}
     */
    async newConversationMessage(conversationId, message) {
        // Placeholder: Implement logic to create a new conversation message in the database.
        // @ts-ignore
        return null;
    }

    /**
     * Update supplied conversation fields while preserving its ID and messages.
     * @param {string} conversationId
     * @param {Partial<Omit<DEConversation, "id" | "messages">>} conversation
     * @returns {Promise<DEConversation|null>}
     */
    async updateConversation(conversationId, conversation) {
        return null;
    }

    /**
     * Update supplied fields while preserving the message's ID and insertion order.
     * @param {string} messageId
     * @param {Partial<Omit<DEConversationMessage, "id">>} message
     * @returns {Promise<DEConversationMessage|null>}
     */
    async updateConversationMessage(messageId, message) {
        return null;
    }

    /**
     * Stores a historic state information for a character
     * @param {string} charId
     * @param {DEStateForCharacter} state 
     * @returns {Promise<void>}
     */
    async storeHistoricState(charId, state) {

    }

    /**
     * Stored activation age plus the number of this character's snapshots from
     * the matching state onward, including the matching snapshot. Returns -1 if absent.
     * @param {string} charId
     * @param {string} state
     * @returns {Promise<number>}
     */
    async getHistoricStateActivationCyclesAgo(charId, state) {
        return -1;
    }

    /**
     * Returns the first historic state (aka going backwards in time) for a character that matches the other character's ID.
     * which means that the character was in a scene with the other character, at least to that character memory.
     * 
     * This match is precise as it is based on the character's ID, not the name.
     * 
     * @param {string} charId 
     * @param {string} otherCharId 
     * @return {Promise<DEStateForCharacter|null>}
     */
    async getFirstHistoricStateWithCharacter(charId, otherCharId) {
        return null;
    }

    /**
     * Returns the first N historic states (aka going backwards in time) for a character that matches the other character's name.
     * This match is based on the name, so it may not be precise if multiple characters share the same name. Or if the character
     * doesn't know the other character's name properly at that time
     * Partial name matching ignores case, accents, punctuation and spacing.
     * 
     * @param {string} charId 
     * @param {number} matches 
     * @param {string} otherCharacterName
     * @return {Promise<DEStateForCharacter[]>}
     */
    async getFirstNHistoricStatesWithCharacterName(charId, matches, otherCharacterName) {
        return [];
    }

    /**
     * Returns the first historic state (aka going backwards in time) for a character that matches the given mental/physical state.
     * 
     * @param {string} charId 
     * @param {string} state 
     * @returns {Promise<DEStateForCharacter|null>}
     */
    async getFirstHistoricStateWithState(charId, state) {
        return null;
    }

    /**
     * Returns the first historic state (aka going backwards in time) for a character that matches the given item ID.
     * 
     * @param {string} charId
     * @param {string} itemId
     * @returns {Promise<DEStateForCharacter|null>}
     */
    async getFirstHistoricStateWithItem(charId, itemId) {
        return null;
    }

    /**
     * Returns the first N historic states (aka going backwards in time) for a character that matches the given item name.
     * since this is based on the name, it may not be precise if multiple items share the same name. Or if the character
     * doesn't know the item's name properly at that time.
     * Partial name matching ignores case, accents, punctuation and spacing.
     * 
     * @param {string} charId 
     * @param {number} matches 
     * @param {string} itemName 
     * @returns {Promise<DEStateForCharacter[]>}
     */
    async getFirstNHistoricStatesWithItemName(charId, matches, itemName) {
        return [];
    }

    /**
     * @returns {DEDatabase}
     */
    getDatabaseForDEObject() {
        return {
            getConversation: this.getConversation.bind(this),
            getPossibleLocationsCharKnowsAlikeTo: this.getPossibleLocationsCharKnowsAlikeTo.bind(this),
            getConversationMessage: this.getConversationMessage.bind(this),
            newConversation: this.newConversation.bind(this),
            newConversationMessage: this.newConversationMessage.bind(this),
            updateConversation: this.updateConversation.bind(this),
            updateConversationMessage: this.updateConversationMessage.bind(this),
            storeHistoricState: this.storeHistoricState.bind(this),
            getHistoricStateActivationCyclesAgo: this.getHistoricStateActivationCyclesAgo.bind(this),
            getFirstHistoricStateWithCharacter: this.getFirstHistoricStateWithCharacter.bind(this),
            getFirstNHistoricStatesWithCharacterName: this.getFirstNHistoricStatesWithCharacterName.bind(this),
            getFirstHistoricStateWithState: this.getFirstHistoricStateWithState.bind(this),
            getFirstHistoricStateWithItem: this.getFirstHistoricStateWithItem.bind(this),
            getFirstNHistoricStatesWithItemName: this.getFirstNHistoricStatesWithItemName.bind(this),
        }
    }
}
