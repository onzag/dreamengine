const { contextBridge, ipcRenderer } = require('electron');

// create methods to communicate with the renderer process
// using ipcMain and ipcRenderer if needed
contextBridge.exposeInMainWorld('API', {
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
     * Register a callback for when script files change on disk.
     * @param {() => void} callback
     */
    onScriptsChanged: (callback) => {
        ipcRenderer.on('scripts-changed', () => callback());
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
    }
});