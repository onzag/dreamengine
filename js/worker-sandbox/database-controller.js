/**
 * App-specific adapter between SQLiteBridge and the main thread's database API.
 * Keep save-path conventions and custom database behavior outside the engine.
 *
 * @param {(method: string, args: any[]) => Promise<any>} call
 * @returns {import('../engine/data-management/base.js').BaseDatabaseController}
 */
export function createDatabaseController(call) {
    return {
        newDatabase() {
            return call("newDatabase", []);
        },
        async loadDatabase(saveName) {
            const { namespace, scriptId, fileName } = parseSavePath(saveName);
            return call("loadDatabaseFromStore", [namespace, scriptId, fileName]);
        },
        async saveDatabase(id, saveName, metadata) {
            const { namespace, scriptId, fileName } = parseSavePath(saveName);
            // The controller receives a path only, so use the filename as the display name.
            await call("saveDatabase", [id, namespace, scriptId, fileName, fileName, metadata]);
        },
        closeDatabase(id) {
            return call("closeDatabase", [id]);
        },
        runQuery(id, query, params) {
            return call("runQuery", [id, query, params ?? []]);
        },
    };
}

/**
 * Paths are relative to the saves folder, as returned by the API's saveDatabase.
 * Accept both OS path separators and the optional stored .gz suffix.
 * @param {string} savePath
 */
function parseSavePath(savePath) {
    const parts = savePath.replace(/\\/g, "/").split("/");
    if (parts.length < 3 || parts.some(part => !part || part === "." || part === "..")) {
        throw new Error("Expected a save path: namespace/scriptId/fileName[.gz]");
    }
    // Only scriptId and fileName are single components; namespaces can nest.
    const namespace = parts.slice(0, -2).join("/");
    const scriptId = parts[parts.length - 2];
    const storedName = parts[parts.length - 1];
    const fileName = storedName.endsWith(".gz") ? storedName.slice(0, -3) : storedName;
    if (!fileName || fileName === "." || fileName === "..") {
        throw new Error("Save path must include a file name");
    }
    return { namespace, scriptId, fileName };
}
