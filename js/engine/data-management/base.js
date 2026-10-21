
/**
 * @typedef {Object} BaseDatabaseController
 * @property {() => Promise<string>} newDatabase
 * @property {(loadId: string) => Promise<string>} loadDatabase
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
     * @param {string} loadId 
     */
    async loadDatabase(loadId) {
        if (this.currentDatabaseId) {
            throw new Error("A database is already loaded. Close it before loading a new one.");
        }
        this.currentDatabaseId = await this.databaseController.loadDatabase(loadId);
    }

    async closeCurrentDatabase() {
        if (this.currentDatabaseId) {
            await this.databaseController.closeDatabase(this.currentDatabaseId);
            this.currentDatabaseId = null;
        }
    }
}