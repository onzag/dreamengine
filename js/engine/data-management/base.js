
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
    }

    async initializeDatabaseFor() {
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
     * @return {Promise<DEObject>}
     */
    async getDEObject() {
        // @ts-ignore
        return null; // Placeholder: Implement logic to retrieve the DEObject from the database.
    }
}
