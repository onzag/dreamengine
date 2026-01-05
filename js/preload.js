const { contextBridge, ipcRenderer } = require('electron');

// create methods to communicate with the renderer process
// using ipcMain and ipcRenderer if needed
contextBridge.exposeInMainWorld('electronAPI', {
    toggleFullScreen: () => {
        console.log("Toggling full screen");
        ipcRenderer.invoke('toggleFullScreen');
    },
    openDevTools: () => {
        ipcRenderer.send('openDevTools');
    },
    closeApp: () => {
        ipcRenderer.send('closeApp');
    },
    /**
     * 
     * @param {string} key 
     * @param {string} cacheFile 
     * @returns 
     */
    loadValueFromUserData: async (key, cacheFile) => {
        const result = await ipcRenderer.invoke('loadValueFromUserData', key, cacheFile);
        return result;
    },
    /**
     * 
     * @param {string} key 
     * @param {string} cacheFile 
     * @param {*} value 
     */
    setValueIntoUserData: async (key, cacheFile, value) => {
        await ipcRenderer.invoke('setValueIntoUserData', key, cacheFile, value);
    },
    saveSettingsToDisk: () => {
        ipcRenderer.send('saveSettingsToDisk');
    },

    createEmptyCharacterFile: async () => {
        const result = await ipcRenderer.invoke('createEmptyCharacterFile');
        return result;
    },
    createEmptyScriptFile: async () => {
        const result = await ipcRenderer.invoke('createEmptyScriptFile');
        return result;
    },
    createEmptyWorldFile: async () => {
        const result = await ipcRenderer.invoke('createEmptyWorldFile');
        return result;
    },
    /**
     * 
     * @param {string} characterFile 
     * @returns 
     */
    checkCharacterFileExists: async (characterFile) => {
        const result = await ipcRenderer.invoke('checkCharacterFileExists', characterFile);
        return result;
    },
    /**
     * 
     * @param {string} characterFile 
     * @returns 
     */
    listStatesForCharacterFile: async (characterFile) => {
        const result = await ipcRenderer.invoke('listStatesForCharacterFile', characterFile);
        return result;
    },
    /**
     * 
     * @param {string} characterFile 
     * @returns 
     */
    listScriptStatesForCharacterFile: async (characterFile) => {
        const result = await ipcRenderer.invoke('listScriptStatesForCharacterFile', characterFile);
        return result;
    },
    /**
     * @param {string} scriptFile 
     * @returns 
     */
    checkScriptFileExists: async (scriptFile) => {
        const result = await ipcRenderer.invoke('checkScriptFileExists', scriptFile);
        return result;
    },
    /**
     * 
     * @param {string} worldFile 
     * @returns 
     */
    checkWorldFileExists: async (worldFile) => {
        const result = await ipcRenderer.invoke('checkWorldFileExists', worldFile);
        return result;
    },
    /**
     * 
     * @param {string} characterFile 
     * @returns 
     */
    updateCharacterFileFromCache: async (characterFile) => {
        const result = await ipcRenderer.invoke('updateCharacterFileFromCache', characterFile);
        return result;
    },
    /**
     * 
     * @param {string} scriptFile 
     * @returns 
     */
    updateScriptFileFromCache: async (scriptFile) => {
        const result = await ipcRenderer.invoke('updateScriptFileFromCache', scriptFile);
        return result;
    },
    /**
     * 
     * @param {string} worldFile 
     * @returns 
     */
    updateWorldFileFromCache: async (worldFile) => {
        const result = await ipcRenderer.invoke('updateWorldFileFromCache', worldFile);
        return result;
    },
    /**
     * 
     * @param {string} characterFile 
     * @returns 
     */
    deleteCharacterFile: async (characterFile) => {
        const result = await ipcRenderer.invoke('deleteCharacterFile', characterFile);
        return result;
    },
    /**
     * 
     * @param {string} scriptFile 
     * @returns 
     */
    deleteScriptFile: async (scriptFile) => {
        const result = await ipcRenderer.invoke('deleteScriptFile', scriptFile);
        return result;
    },
    /**
     * 
     * @param {string} worldFile 
     * @returns 
     */
    deleteWorldFile: async (worldFile) => {
        const result = await ipcRenderer.invoke('deleteWorldFile', worldFile);
        return result;
    },
    /**
     * 
     * @param {string} group 
     * @returns 
     */
    listCharacterFiles: async (group) => {
        const result = await ipcRenderer.invoke('listCharacterFiles', group);
        return result;
    },
    /**
     * 
     * @param {string} context 
     * @returns 
     */
    listScriptFiles: async (context) => {
        const result = await ipcRenderer.invoke('listScriptFiles', context);
        return result;
    },
    listScriptContexts: async () => {
        const result = await ipcRenderer.invoke('listScriptContexts');
        return result;
    },
    listWorldFiles: async () => {
        const result = await ipcRenderer.invoke('listWorldFiles');
        return result;
    },
    listCharacterGroups: async () => {
        const result = await ipcRenderer.invoke('listCharacterGroups');
        return result;
    },
    getDreamEnginePath: () => {
        return ipcRenderer.invoke('getDreamEnginePath');
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
});