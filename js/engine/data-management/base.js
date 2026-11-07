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
     * Append a new message with isProcessingSideEffects set to true.
     * @param {string} conversationId
     * @param {Omit<DEConversationMessage, "id" | "isProcessingSideEffects">} message
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
     * Completed messages cannot be modified; return null if an update is refused.
     * @param {string} messageId
     * @param {Partial<Omit<DEConversationMessage, "id">>} message
     * @returns {Promise<DEConversationMessage|null>}
     */
    async updateConversationMessage(messageId, message) {
        return null;
    }

    /**
     * Begin a new transaction. Only one transaction may be active at a time.
     * Throws if a transaction is already active.
     * @returns {Promise<void>}
     */
    async newTransaction() {

    }

    /**
     * Commit the active transaction. Throws if no transaction is active.
     * @returns {Promise<void>}
     */
    async commitTransaction() {

    }

    /**
     * Roll back the active transaction. Throws if no transaction is active.
     * @returns {Promise<void>}
     */
    async rollbackTransaction() {

    }

    /**
     * @returns {boolean}
     */
    hasActiveTransaction() {
        return false;
    }

    /**
     * Serialize a character perspective snapshot and return its new storage ID.
     * @param {DECharacterPerspective} perspective
     * @returns {Promise<string>}
     */
    async storePerspective(perspective) {
        // Placeholder: Implement logic to store a character perspective snapshot.
        // @ts-ignore
        return null;
    }

    /**
     * Retrieve a stored character perspective snapshot by its ID.
     * @param {string} perspectiveId
     * @returns {Promise<DECharacterPerspective | null>}
     */
    async getPerspectiveById(perspectiveId) {
        return null; // Placeholder: Implement logic to retrieve a character perspective snapshot.
    }

    /**
     * Return this observer's most recently stored snapshot, or null if absent.
     * @param {string} charId
     * @returns {Promise<DECharacterPerspective | null>}
     */
    async getLastPerspectiveOfCharacter(charId) {
        return null;
    }

    /**
     * @param {string} charId
     * @param {string} otherCharId
     * @param {number} useMemoryFromTime Story Unix milliseconds.
     * @returns {Promise<DECharacterPerspective | null>}
     */
    async getLatestPerspectiveWithCharacter(charId, otherCharId, useMemoryFromTime) {
        return null;
    }

    /**
     * @param {string} charId
     * @param {string} itemId
     * @param {number} useMemoryFromTime Story Unix milliseconds.
     * @param {boolean} [openContainerOnly=false]
     * @returns {Promise<DECharacterPerspective | null>}
     */
    async getLatestPerspectiveWithItem(charId, itemId, useMemoryFromTime, openContainerOnly = false) {
        return null;
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
            storePerspective: this.storePerspective.bind(this),
            getPerspectiveById: this.getPerspectiveById.bind(this),
            getLastPerspectiveOfCharacter: this.getLastPerspectiveOfCharacter.bind(this),
            getLatestPerspectiveWithCharacter: this.getLatestPerspectiveWithCharacter.bind(this),
            getLatestPerspectiveWithItem: this.getLatestPerspectiveWithItem.bind(this),
            newTransaction: this.newTransaction.bind(this),
            commitTransaction: this.commitTransaction.bind(this),
            rollbackTransaction: this.rollbackTransaction.bind(this),
            hasActiveTransaction: this.hasActiveTransaction.bind(this),
        }
    }
}
