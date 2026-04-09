const { contextBridge, ipcRenderer } = require('electron');

// create methods to communicate with the renderer process
// using ipcMain and ipcRenderer if needed
contextBridge.exposeInMainWorld('API', {
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
     * @returns {Promise<Array<{id: string, namespace: string}>>}
     */
    listScriptFiles: async () => {
        const result = await ipcRenderer.invoke('listScriptFiles');
        return result;
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
});