const { app, BrowserWindow, ipcMain, session } = require('electron')
const path = require('path')
const fs = require('fs');
const os = require('os');

/**
 * @type any
 */
const CHARACTER_CACHE = {};
/**
 * @type any
 */
const SCRIPT_CACHE = {};
/**
 * @type any
 */
const WORLD_CACHE = {};

const DREAMENGINE_INFO_HOME = path.join(app.getPath('home'), '.dreamengine');
if (!fs.existsSync(DREAMENGINE_INFO_HOME)) {
    fs.mkdirSync(DREAMENGINE_INFO_HOME);
}

if (!fs.existsSync(path.join(DREAMENGINE_INFO_HOME, 'init-config.json'))) {
    fs.writeFileSync(path.join(DREAMENGINE_INFO_HOME, 'init-config.json'), JSON.stringify({
        fullscreen: false
    }));
}

// @ts-ignore
const initconfig = JSON.parse(fs.readFileSync(path.join(DREAMENGINE_INFO_HOME, 'init-config.json')));

async function saveInitConfig() {
    await fs.promises.writeFile(path.join(DREAMENGINE_INFO_HOME, 'init-config.json'), JSON.stringify(initconfig));
}

let userData = {};
try {
    userData = JSON.parse(fs.readFileSync(path.join(DREAMENGINE_INFO_HOME, 'settings.json'), 'utf-8'));
} catch (e) { }


const createWindow = () => {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        fullscreenable: true,
        fullscreen: initconfig.fullscreen || false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
        },
    })

    win.setMenuBarVisibility(false)
    win.loadFile('./js/app/index.html')

    // Open dev tools with Ctrl+Shift+I (or Cmd+Option+I on macOS)
    //win.webContents.openDevTools();
}

const ALLOWED_BASE_PATHS = [
    "file://" + DREAMENGINE_INFO_HOME.replace(/\\/g, "/"),
    "file://" + __dirname.replace(/\\/g, "/"),
    "file:///" + DREAMENGINE_INFO_HOME.replace(/\\/g, "/"),
    "file:///" + __dirname.replace(/\\/g, "/"),
    "http://",
    "https://",
    "data:",
    "websocket://",
    "ws://",
    "wss://",
    "devtools://",
];

app.whenReady().then(() => {
    createWindow()
    
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        const url = details.url;
        const isAllowed = ALLOWED_BASE_PATHS.some(basePath => url.startsWith(basePath));
        if (!isAllowed) {
            console.warn("Blocked URL:", url, "not in allowed paths.", ALLOWED_BASE_PATHS);
            return callback({ cancel: true });
        }
        return callback({});
    })

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})

// Very buggy fullscreen toggle workaround due to electron issues
// Handle IPC messages from the renderer process
ipcMain.handle('toggleFullScreen', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
        const target = !win.isFullScreen();
        if (win && target) {
            win.setFullScreen(target);
            initconfig.fullscreen = true;
            saveInitConfig();
        } else if (win) {
            win.setFullScreen(target);
            initconfig.fullscreen = false;
            saveInitConfig();
        }
    }
});

ipcMain.on('openDevTools', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
        win.webContents.openDevTools();
    }
});

ipcMain.on('closeApp', () => {
    app.quit();
});

ipcMain.handle('loadValueFromUserData', async (event, key, cacheFile) => {
    const splitted = key.split(".");
    let current = userData;
    if (cacheFile) {
        /**
         * @type any
         */
        let cacheToUse = null;
        if (cacheFile.fileType === 'character') {
            cacheToUse = CHARACTER_CACHE;
        } else if (cacheFile.fileType === 'script') {
            cacheToUse = SCRIPT_CACHE;
        } else if (cacheFile.fileType === 'world') {
            cacheToUse = WORLD_CACHE;
        }
        let notFoundInCache = false;
        if (!cacheToUse[cacheFile.fileName]) {
            cacheToUse[cacheFile.fileName] = {};
            notFoundInCache = true;
        }
        if (notFoundInCache) {
            const CACHE_FOLDER = path.join(app.getPath('home'), '.dreamengine', cacheToUse === CHARACTER_CACHE ? 'characters' : cacheToUse === SCRIPT_CACHE ? 'scripts' : 'worlds');
            const filePath = path.join(CACHE_FOLDER, cacheFile.fileName);
            if (fs.existsSync(filePath)) {
                const data = await fs.promises.readFile(filePath, 'utf-8');
                cacheToUse[cacheFile.fileName] = JSON.parse(data);
            }
        }
        current = cacheToUse[cacheFile.fileName] || {};
    }
    for (let i = 0; i < splitted.length; i++) {
        // @ts-ignore
        if (current[splitted[i]] === undefined) {
            return null;
        }
        // @ts-ignore
        current = current[splitted[i]];
    }
    return current || null;
});

ipcMain.handle('setValueIntoUserData', (event, key, cacheFile, value) => {
    const splitted = key.split(".");
    let current = userData;
    if (cacheFile) {
        /**
         * @type any
         */
        let cacheToUse = null;
        if (cacheFile.fileType === 'character') {
            cacheToUse = CHARACTER_CACHE;
        } else if (cacheFile.fileType === 'script') {
            cacheToUse = SCRIPT_CACHE;
        } else if (cacheFile.fileType === 'world') {
            cacheToUse = WORLD_CACHE;
        }
        current = cacheToUse[cacheFile.fileName];
    }
    for (let i = 0; i < splitted.length - 1; i++) {
        // @ts-ignore
        if (current[splitted[i]] === undefined) {
            // @ts-ignore
            current[splitted[i]] = {};
        }
        // @ts-ignore
        current = current[splitted[i]];
    }
    // @ts-ignore
    current[splitted[splitted.length - 1]] = value;
});

ipcMain.on('saveSettingsToDisk', () => {
    if (!fs.existsSync(DREAMENGINE_INFO_HOME)) {
        fs.mkdirSync(DREAMENGINE_INFO_HOME, { recursive: true });
    }
    fs.writeFileSync(path.join(DREAMENGINE_INFO_HOME, 'settings.json'), JSON.stringify(userData, null, 2), 'utf-8');
});

const CHARACTER_FOLDER = path.join(DREAMENGINE_INFO_HOME, 'characters');
if (!fs.existsSync(CHARACTER_FOLDER)) {
    fs.mkdirSync(CHARACTER_FOLDER, { recursive: true });
}
const CHARACTER_ASSETS_FOLDER = path.join(DREAMENGINE_INFO_HOME, 'characters-assets');
if (!fs.existsSync(CHARACTER_ASSETS_FOLDER)) {
    fs.mkdirSync(CHARACTER_ASSETS_FOLDER, { recursive: true });
}
const SCRIPT_FOLDER = path.join(DREAMENGINE_INFO_HOME, 'scripts');
if (!fs.existsSync(SCRIPT_FOLDER)) {
    fs.mkdirSync(SCRIPT_FOLDER, { recursive: true });
}
const WORLD_FOLDER = path.join(DREAMENGINE_INFO_HOME, 'worlds');
if (!fs.existsSync(WORLD_FOLDER)) {
    fs.mkdirSync(WORLD_FOLDER, { recursive: true });
}
const WORLD_ASSETS_FOLDER = path.join(DREAMENGINE_INFO_HOME, 'worlds-assets');
if (!fs.existsSync(WORLD_ASSETS_FOLDER)) {
    fs.mkdirSync(WORLD_ASSETS_FOLDER, { recursive: true });
}

// let's load every single chracter file into cache on startup
// they are relatively small so this should be fine
const chars = fs.readdirSync(CHARACTER_FOLDER);
chars.forEach(file => {
    if (file.endsWith('.json')) {
        const filePath = path.join(CHARACTER_FOLDER, file);
        const data = fs.readFileSync(filePath, 'utf-8');
        CHARACTER_CACHE[file] = JSON.parse(data);
    }
});

const scripts = fs.readdirSync(SCRIPT_FOLDER);
scripts.forEach(file => {
    if (file.endsWith('.json')) {
        const filePath = path.join(SCRIPT_FOLDER, file);
        const data = fs.readFileSync(filePath, 'utf-8');
        SCRIPT_CACHE[file] = JSON.parse(data);
    }
});

const worlds = fs.readdirSync(WORLD_FOLDER);
worlds.forEach(file => {
    if (file.endsWith('.json')) {
        const filePath = path.join(WORLD_FOLDER, file);
        const data = fs.readFileSync(filePath, 'utf-8');
        WORLD_CACHE[file] = JSON.parse(data);
    }
});

// Character file management IPC handlers
ipcMain.handle('createEmptyCharacterFile', async () => {
    // find a potentially existing unsaved character file first
    for (const [fileName, data] of Object.entries(CHARACTER_CACHE)) {
        if (data.__unsaved) {
            return { group: data.group || "", characterFile: fileName };
        }
    }
    const filePath = path.join(CHARACTER_FOLDER, `character_${Date.now()}.json`);
    CHARACTER_CACHE[path.basename(filePath)] = {
        __unsaved: true
    };
    return { group: '', characterFile: path.basename(filePath) };
});

ipcMain.handle('createEmptyScriptFile', async () => {
    // find a potentially existing unsaved script file first
    for (const [fileName, data] of Object.entries(SCRIPT_CACHE)) {
        if (data.__unsaved) {
            return { scriptFile: fileName };
        }
    }
    const filePath = path.join(SCRIPT_FOLDER, `script_${Date.now()}.json`);
    SCRIPT_CACHE[path.basename(filePath)] = {
        __unsaved: true
    };
    return { scriptFile: path.basename(filePath) };
});

ipcMain.handle('createEmptyWorldFile', async () => {
    // find a potentially existing unsaved world file first
    for (const [fileName, data] of Object.entries(WORLD_CACHE)) {
        if (data.__unsaved) {
            return { worldFile: fileName };
        }
    }
    const filePath = path.join(WORLD_FOLDER, `world_${Date.now()}.json`);
    WORLD_CACHE[path.basename(filePath)] = {
        __unsaved: true
    };
    return { worldFile: path.basename(filePath) };
});

ipcMain.handle('checkCharacterFileExists', async (event, characterFile) => {
    return !!CHARACTER_CACHE[characterFile];
});

ipcMain.handle('checkScriptFileExists', async (event, scriptFile) => {
    return !!SCRIPT_CACHE[scriptFile];
});

ipcMain.handle('checkWorldFileExists', async (event, worldFile) => {
    return !!WORLD_CACHE[worldFile];
});

ipcMain.handle('updateCharacterFileFromCache', async (event, characterFile) => {
    const currentData = CHARACTER_CACHE[characterFile];
    if (!currentData) {
        return null;
    }
    if (currentData.__unsaved) {
        delete currentData.__unsaved;
    }
    const filePath = path.join(CHARACTER_FOLDER, characterFile);
    await fs.promises.writeFile(filePath, JSON.stringify(currentData, null, 2), 'utf-8');
    return currentData;
});

ipcMain.handle('updateScriptFileFromCache', async (event, scriptFile) => {
    const currentData = SCRIPT_CACHE[scriptFile];
    if (!currentData) {
        return null;
    }
    if (currentData.__unsaved) {
        delete currentData.__unsaved;
    }
    const filePath = path.join(SCRIPT_FOLDER, scriptFile);
    await fs.promises.writeFile(filePath, JSON.stringify(currentData, null, 2), 'utf-8');
    return currentData;
});

ipcMain.handle('updateWorldFileFromCache', async (event, worldFile) => {
    const currentData = WORLD_CACHE[worldFile];
    if (!currentData) {
        return null;
    }
    if (currentData.__unsaved) {
        delete currentData.__unsaved;
    }
    const filePath = path.join(WORLD_FOLDER, worldFile);
    await fs.promises.writeFile(filePath, JSON.stringify(currentData, null, 2), 'utf-8');
    return currentData;
});

ipcMain.handle("deleteCharacterFile", async (event, characterFile) => {
    const filePath = path.join(CHARACTER_FOLDER, characterFile);
    const assetsFolderPath = path.join(CHARACTER_ASSETS_FOLDER, characterFile.replace('.json', ''));
    delete CHARACTER_CACHE[characterFile];
    if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        return true;
    }
    if (fs.existsSync(assetsFolderPath)) {
        fs.rmdirSync(assetsFolderPath, { recursive: true });
    }

    return false;
});

ipcMain.handle("deleteScriptFile", async (event, scriptFile) => {
    const filePath = path.join(SCRIPT_FOLDER, scriptFile);
    delete SCRIPT_CACHE[scriptFile];
    if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        return true;
    }
    return false;
});

ipcMain.handle("deleteWorldFile", async (event, worldFile) => {
    const filePath = path.join(WORLD_FOLDER, worldFile);
    const assetsFolderPath = path.join(WORLD_ASSETS_FOLDER, worldFile.replace('.json', ''));
    delete WORLD_CACHE[worldFile];
    if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        if (fs.existsSync(assetsFolderPath)) {
            fs.rmdirSync(assetsFolderPath, { recursive: true });
        }
        return true;
    }
    return false;
});

ipcMain.handle('listCharacterFiles', async (event, group) => {
    return Object.keys(CHARACTER_CACHE).filter(fileName => {
        const data = CHARACTER_CACHE[fileName];
        if (data.__unsaved) {
            return false;
        }
        return (data.group || "Ungrouped") === group;
    }).map(fileName => {
        const data = CHARACTER_CACHE[fileName];
        return { file: fileName, name: data.name || "Unnamed Character" };
    });
});

ipcMain.handle("listStatesForCharacterFile", async (event, characterFile) => {
    const data = CHARACTER_CACHE[characterFile];
    if (!data) {
        return [];
    }
    const givenStates = new Set(Object.keys(data.states || {}));
    const frozenStates = new Set();
    const includedScripts = data.advanced_spawn_script?.imports || [];
    // @ts-ignore
    includedScripts.forEach(scriptName => {
        const scriptData = SCRIPT_CACHE[scriptName];
        if (scriptData && scriptData.freeze_states) {
            // @ts-ignore
            scriptData.freeze_states.forEach(stateName => {
                frozenStates.add(stateName);
            });
        }
    });
    const combinedStates = new Set([...givenStates, ...frozenStates]);
    /**
     * @type {Array<{name: string, frozen: boolean}>}
     */
    const finalStates = [];
    combinedStates.forEach(stateName => {
        finalStates.push({
            name: stateName,
            frozen: frozenStates.has(stateName),
        });
    });
    return finalStates;
});

ipcMain.handle('listScriptContexts', async (event) => {
    const contexts = new Set();
    Object.values(SCRIPT_CACHE).forEach(scriptData => {
        if (!scriptData['__unsaved']) {
            contexts.add(scriptData.context || "Character Spawn");
        }
    });
    return Array.from(contexts);
});

ipcMain.handle('listScriptFiles', async (event, context) => {
    return Object.keys(SCRIPT_CACHE).filter(fileName => {
        const data = SCRIPT_CACHE[fileName];
        if (data.__unsaved) {
            return false;
        }
        if ((data.context || "Character Spawn") !== context) {
            return false;
        }
        return true;
    }).map(fileName => {
        const data = SCRIPT_CACHE[fileName];
        return { file: fileName, name: data.name || "Unnamed Script" };
    });
});

ipcMain.handle('listWorldFiles', async (event) => {
    return Object.keys(WORLD_CACHE).filter(fileName => {
        const data = WORLD_CACHE[fileName];
        if (data.__unsaved) {
            return false;
        }
        return true;
    }).map(fileName => {
        const data = WORLD_CACHE[fileName];
        return { file: fileName, name: data.name || "Unnamed World" };
    });
});

ipcMain.handle('listCharacterGroups', async (event) => {
    const groups = new Set();
    Object.values(CHARACTER_CACHE).forEach(charData => {
        if (!charData['__unsaved']) {
            groups.add(charData.group || "Ungrouped");
        }
    });
    return Array.from(groups);
});

ipcMain.handle('getDreamEnginePath', () => {
    return DREAMENGINE_INFO_HOME;
});

ipcMain.handle('uploadFileToDEPath', async (event, dePath, file) => {
    if (!file) {
        throw new Error("No file provided for upload");
    }
    // ensure no directory traversal
    if (dePath.includes('..')) {
        throw new Error("Invalid path");
    }
    const destPath = path.join(DREAMENGINE_INFO_HOME, dePath);
    const arrayBuffer = await file.arrayBuffer();
    await fs.promises.writeFile(destPath, Buffer.from(arrayBuffer));
    return true;
});

// Accept raw bytes (ArrayBuffer or Uint8Array) from renderer and persist to DreamEngine path
ipcMain.handle('uploadBytesToDEPath', async (event, dePath, bytes) => {
    if (!bytes) {
        throw new Error('No byte data provided for upload');
    }
    if (typeof dePath !== 'string' || dePath.length === 0) {
        throw new Error('Invalid destination path');
    }
    if (dePath.includes('..')) {
        throw new Error('Invalid path');
    }
    if (dePath !== "profile" && !dePath.startsWith("characters-assets/")) {
        throw new Error('Unauthorized path for upload');
    }
    if (dePath.endsWith(".json") || dePath.endsWith(".js")) {
        throw new Error('Uploading JSON or JS files is not allowed');
    }
    const destPath = path.join(DREAMENGINE_INFO_HOME, dePath);
    let buffer;
    if (bytes instanceof Uint8Array) {
        buffer = Buffer.from(bytes);
    } else if (bytes instanceof ArrayBuffer) {
        buffer = Buffer.from(new Uint8Array(bytes));
    } else {
        throw new Error('Unsupported byte payload type');
    }
    await fs.promises.writeFile(destPath, buffer);
    return true;
});