export class BaseDiffusionAdapter {
    constructor() {
        /**
         * @type {Array<(status: {connected: boolean, reason?: string}) => void>}
         */
        this.onConnectionStatusChangeFns = [];
        /**
         * @type {Array<[() => void, (err: string) => void]>}
         */
        this.onConnectionStatusChangePromises = [];
    }

    async initialize() {
        throw new Error("Method 'initialize()' must be implemented.");
    }

    async ensureInitialized() {
        throw new Error("Method 'ensureInitialized()' must be implemented.");
    }

    async getAllWorkflows() {
        throw new Error("Method 'getAllWorkflows()' must be implemented.");
    }

    async runWorkflow(workflowId, inputData) {
        throw new Error("Method 'runWorkflow()' must be implemented.");
    }

    /**
     * Triggers the on connection status change event
     * @param {boolean} connected 
     * @param {string} [reason] 
     */
    triggerOnConnectionStatusChange(connected, reason) {
        const status = { connected, reason };
        this.onConnectionStatusChangeFns.forEach(fn => fn(status));
        this.onConnectionStatusChangePromises.forEach(([resolve, reject]) => {
            if (connected) {
                resolve();
            } else {
                reject(reason || "Unknown reason");
            }
        });
        this.onConnectionStatusChangePromises = [];
    }

    /**
     * @param {(status: {connected: boolean, reason?: string}) => any} callback
     */
    addEventListenerOnConnectStatusChange(callback) {
        this.onConnectionStatusChangeFns.push(callback);
    }

    /**
     * @param {(status: {connected: boolean, reason?: string}) => any} callback
     */
    removeEventListenerOnConnectStatusChange(callback) {
        this.onConnectionStatusChangeFns = this.onConnectionStatusChangeFns.filter(fn => fn !== callback);
    }
}