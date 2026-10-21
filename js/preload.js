const { contextBridge, ipcRenderer } = require('electron');

// create methods to communicate with the renderer process
// using ipcMain and ipcRenderer if needed
contextBridge.exposeInMainWorld('eAPI', {
    mode: 'electron',
    toggleFullScreen: () => {
        console.log("Toggling full screen");
        ipcRenderer.invoke('toggleFullScreen');
    },
    openDevTools: () => {
        ipcRenderer.send('openDevTools');
    },
    /**
     * @param {string} fileUrl - A file:// URL to view source of
     * @returns {Promise<void>}
     */
    viewSource: (fileUrl) => {
        return ipcRenderer.invoke('viewSource', fileUrl);
    },
    /**
     * Detect available code editors on the system.
     * @returns {Promise<Array<{id: string, name: string, cmd: string}>>}
     */
    detectEditors: () => {
        return ipcRenderer.invoke('detectEditors');
    },
    /**
     * Open a file in an external editor.
     * @param {string} filePath - Absolute OS path to the file
     * @param {string} [editorCmd] - Editor command to use, or '__system__' for OS default
     * @returns {Promise<void>}
     */
    openInEditor: (filePath, editorCmd) => {
        return ipcRenderer.invoke('openInEditor', filePath, editorCmd);
    },
    closeApp: () => {
        ipcRenderer.send('closeApp');
    },
    /**
     * @returns {Promise<Array<{id: string, namespace: string}>>}
     */
    listScriptFiles: async () => {
        const result = await ipcRenderer.invoke('listScriptFiles');
        return result;
    },
    /**
     * @param {string} namespace
     * @param {string} id
     * @param {string} [header]
     * @returns {Promise<void>}
     */
    newScriptFile: (namespace, id, header) => {
        return ipcRenderer.invoke('newScriptFile', namespace, id, header);
    },
    /**
     * @param {string} oldNamespace
     * @param {string} oldId
     * @param {string} newNamespace
     * @param {string} newId
     * @returns {Promise<void>}
     */
    moveScriptFile: (oldNamespace, oldId, newNamespace, newId) => {
        return ipcRenderer.invoke('moveScriptFile', oldNamespace, oldId, newNamespace, newId);
    },
    /**
     * @param {string} namespace
     * @param {string} id
     * @returns {Promise<void>}
     */
    deleteScriptFile: (namespace, id) => {
        return ipcRenderer.invoke('deleteScriptFile', namespace, id);
    },
    /**
     * 
     * @param {string} key 
     * @returns {Promise<any>}
     */
    getConfigValue: (key) => {
        return ipcRenderer.invoke('getConfigValue', key);
    },
    /**
     * 
     * @param {string} key 
     * @param {any} value 
     * @returns {Promise<void>}
     */
    setConfigValue: (key, value) => {
        return ipcRenderer.invoke('setConfigValue', key, value);
    },
    getDreamEnginePaths: () => {
        return ipcRenderer.invoke('getDreamEnginePaths');
    },
    saveConfig: () => {
        return ipcRenderer.invoke('saveConfig');
    },
    /**
     * 
     * @param {string} dePath 
     * @param {File} file 
     * @returns 
     */
    uploadFileToDEPath: async (dePath, file) => {
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        return ipcRenderer.invoke('uploadBytesToDEPath', dePath, uint8Array);
    },

    /**
     * @param {string} dePath 
     * @returns 
     */
    deleteFileFromDEPath: (dePath) => {
        return ipcRenderer.invoke('deleteFileFromDEPath', dePath);
    },
    /**
     * Register a callback for when script files change on disk.
     * @param {(namespace: string, id: string, options?: { deleted?: boolean, moved?: { newNamespace: string, newId: string } }) => void} callback
     */
    onScriptsChanged: (callback) => {
        ipcRenderer.on('scripts-changed', (_event, namespace, id, options) => callback(namespace, id, options));
    },

    /**
     * 
     * @param {string} namespace 
     * @param {string} id 
     * @param {string} content 
     * @returns {Promise<void>}
     */
    updateScriptFile: (namespace, id, content) => {
        return ipcRenderer.invoke('updateScriptFile', namespace, id, content);
    },

    /**
     * @returns {Promise<void>}
     */
    startDiffusionProcess: () => {
        return ipcRenderer.invoke('startDiffusionProcess');
    },

    /**
     * @returns {Promise<void>}
     */
    stopDiffusionProcess: () => {
        return ipcRenderer.invoke('stopDiffusionProcess');
    },

    /**
     * @returns {Promise<void>}
     * @param {string} language
     */
    listNarrators: (language) => {
        return ipcRenderer.invoke('listNarrators', language);
    },

    /**
     * Create a brand new, empty SQLite database (with sqlite-vec) in the OS
     * temporary directory. Read/write it via runQuery, then persist it with
     * saveDatabase.
     * @returns {Promise<string>} UUID that identifies this connection.
     */
    newDatabase: () => {
        return ipcRenderer.invoke('db:new');
    },

    /**
     * Close the database connection identified by the given UUID and delete its
     * temporary backing file.
     * @param {string} id - UUID returned by newDatabase/loadDatabaseFromStore.
     * @returns {Promise<void>}
     */
    closeDatabase: (id) => {
        return ipcRenderer.invoke('db:close', id);
    },

    /**
     * Run a SQL statement on the database identified by the given UUID.
     *
     * Binary values (e.g. vector embeddings) should be passed as Uint8Array or
     * Float32Array — they are preserved as BLOBs. BLOB columns in returned rows
     * are delivered as Uint8Array.
     *
     * @param {string} id - UUID returned by newDatabase/loadDatabaseFromStore.
     * @param {string} sql - SQL statement to execute.
     * @param {Array<string | number | bigint | Uint8Array | null>} [params] - Bound parameters.
     * @returns {Promise<any[] | { changes: number, lastInsertRowid: number | bigint }>}
     */
    runQuery: (id, sql, params) => {
        return ipcRenderer.invoke('db:query', id, sql, params ?? []);
    },

    /**
     * Persist a gzip-compressed, pristine copy of an open database into the
     * saves folder and record it in the saves index. Overwrites any existing
     * save at the same location.
     * @param {string} id - UUID of the open connection to snapshot.
     * @param {string} namespace - Script namespace (used as a subdirectory).
     * @param {string} scriptId - Script id (used as a subdirectory).
     * @param {string} saveName - Human-readable name of the save.
     * @param {string} fileName - Base file name supplied by the user (no extension).
     * @param {any} [metadata] - Arbitrary JSON metadata to store with the save.
     * @returns {Promise<string>} Stored path, relative to the saves folder.
     */
    saveDatabase: (id, namespace, scriptId, saveName, fileName, metadata) => {
        return ipcRenderer.invoke('db:save', id, namespace, scriptId, saveName, fileName, metadata);
    },

    /**
     * Decompress a stored save into the temporary directory and open it,
     * returning a connection UUID that can be used with runQuery/saveDatabase.
     * @param {string} namespace - Script namespace the save belongs to.
     * @param {string} scriptId - Script id the save belongs to.
     * @param {string} fileName - Base file name supplied when saving (no extension).
     * @returns {Promise<string>} UUID that identifies the opened connection.
     */
    loadDatabaseFromStore: (namespace, scriptId, fileName) => {
        return ipcRenderer.invoke('db:load', namespace, scriptId, fileName);
    },

    /**
     * List the saves recorded for a given script namespace/id.
     * @param {string} namespace - Script namespace to filter by.
     * @param {string} scriptId - Script id to filter by.
     * @returns {Promise<Array<{ namespace: string, scriptId: string, filePath: string, saveName: string, metadata: any }>>}
     */
    listSaveFiles: (namespace, scriptId) => {
        return ipcRenderer.invoke('db:list', namespace, scriptId);
    },

    /**
     * Delete a stored save from disk and remove its entry from the saves index.
     * @param {string} namespace - Script namespace the save belongs to.
     * @param {string} scriptId - Script id the save belongs to.
     * @param {string} fileName - Base file name supplied when saving (no extension).
     * @returns {Promise<void>}
     */
    deleteDatabaseFromStore: (namespace, scriptId, fileName) => {
        return ipcRenderer.invoke('db:delete', namespace, scriptId, fileName);
    },
});