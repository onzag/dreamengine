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
    loadValueFromUserData: async (key, cacheFile) => {
        const result = await ipcRenderer.invoke('loadValueFromUserData', key, cacheFile);
        return result;
    },
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
    checkCharacterFileExists: async (characterFile) => {
        const result = await ipcRenderer.invoke('checkCharacterFileExists', characterFile);
        return result;
    },
    checkScriptFileExists: async (scriptFile) => {
        const result = await ipcRenderer.invoke('checkScriptFileExists', scriptFile);
        return result;
    },
    checkWorldFileExists: async (worldFile) => {
        const result = await ipcRenderer.invoke('checkWorldFileExists', worldFile);
        return result;
    },
    updateCharacterFileFromCache: async (characterFile) => {
        const result = await ipcRenderer.invoke('updateCharacterFileFromCache', characterFile);
        return result;
    },
    updateScriptFileFromCache: async (scriptFile) => {
        const result = await ipcRenderer.invoke('updateScriptFileFromCache', scriptFile);
        return result;
    },
    updateWorldFileFromCache: async (worldFile) => {
        const result = await ipcRenderer.invoke('updateWorldFileFromCache', worldFile);
        return result;
    },
    deleteCharacterFile: async (characterFile) => {
        const result = await ipcRenderer.invoke('deleteCharacterFile', characterFile);
        return result;
    },
    deleteScriptFile: async (scriptFile) => {
        const result = await ipcRenderer.invoke('deleteScriptFile', scriptFile);
        return result;
    },
    deleteWorldFile: async (worldFile) => {
        const result = await ipcRenderer.invoke('deleteWorldFile', worldFile);
        return result;
    },
    listCharacterFiles: async (group) => {
        const result = await ipcRenderer.invoke('listCharacterFiles', group);
        return result;
    },
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
    uploadFileToDEPath: async (dePath, file) => {
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        return ipcRenderer.invoke('uploadBytesToDEPath', dePath, uint8Array);
    },
});