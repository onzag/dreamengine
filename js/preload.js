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
    loadValueFromUserData: async (key, characterFile) => {
        const result = await ipcRenderer.invoke('loadValueFromUserData', key, characterFile);
        return result;
    },
    setValueIntoUserData: async (key, characterFile, value) => {
        await ipcRenderer.invoke('setValueIntoUserData', key, characterFile, value);
    },
    saveSettingsToDisk: () => {
        ipcRenderer.send('saveSettingsToDisk');
    },

    createEmptyCharacterFile: async () => {
        const result = await ipcRenderer.invoke('createEmptyCharacterFile');
        return result;
    },
    checkCharacterFileExists: async (characterFile) => {
        const result = await ipcRenderer.invoke('checkCharacterFileExists', characterFile);
        return result;
    },
    updateCharacterFileFromCache: async (characterFile) => {
        const result = await ipcRenderer.invoke('updateCharacterFileFromCache', characterFile);
        return result;
    },
    loadCharacterFile: async (characterFile) => {
        const result = await ipcRenderer.invoke('loadCharacterFile', characterFile);
        return result;
    },
    deleteCharacterFile: async (characterFile) => {
        const result = await ipcRenderer.invoke('deleteCharacterFile', characterFile);
        return result;
    },
    listCharacterFiles: async () => {
        const result = await ipcRenderer.invoke('listCharacterFiles');
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