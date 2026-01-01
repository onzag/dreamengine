const { app, BrowserWindow, ipcMain, session } = require('electron')
const path = require('path')
const fs = require('fs');
const os = require('os');

const CHARACTER_CACHE = {};

const DREAMENGINE_INFO_HOME = path.join(app.getPath('home'), '.dreamengine');
if (!fs.existsSync(DREAMENGINE_INFO_HOME)) {
    fs.mkdirSync(DREAMENGINE_INFO_HOME);
}

if (!fs.existsSync(path.join(DREAMENGINE_INFO_HOME, 'init-config.json'))) {
    fs.writeFileSync(path.join(DREAMENGINE_INFO_HOME, 'init-config.json'), JSON.stringify({
        fullscreen: false
    }));
}

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

app.whenReady().then(() => {
    createWindow()

    const allowedBasePaths = [
        "file://" + DREAMENGINE_INFO_HOME,
        "file://" + __dirname,
        "http://",
        "https://",
        "data:",
        "websocket://",
        "ws://",
        "wss://",
        "devtools://",
    ];
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        const url = details.url;
        const isAllowed = allowedBasePaths.some(basePath => url.startsWith(basePath));
        if (!isAllowed) {
            console.warn("Blocked URL:", url, "not in allowed paths.", allowedBasePaths);
            return callback({ cancel: true });
        }
        return callback({ });
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

ipcMain.handle('loadValueFromUserData', async (event, key, characterFile) => {
    const splitted = key.split(".");
    let current = userData;
    if (characterFile) {
        let notFoundInCache = false;
        if (!CHARACTER_CACHE[characterFile]) {
            CHARACTER_CACHE[characterFile] = {};
            notFoundInCache = true;
        }
        if (notFoundInCache) {
            const CHARACTER_FOLDER = path.join(app.getPath('home'), '.dreamengine', 'characters');
            const filePath = path.join(CHARACTER_FOLDER, characterFile);
            if (fs.existsSync(filePath)) {
                const data = await fs.promises.readFile(filePath, 'utf-8');
                CHARACTER_CACHE[characterFile] = JSON.parse(data);
            }
        }
        current = CHARACTER_CACHE[characterFile] || {};
    }
    for (let i = 0; i < splitted.length; i++) {
        if (current[splitted[i]] === undefined) {
            return null;
        }
        current = current[splitted[i]];
    }
    return current || null;
});

ipcMain.handle('setValueIntoUserData', (event, key, characterFile, value) => {
    const splitted = key.split(".");
    let current = userData;
    if (characterFile) {
        if (!CHARACTER_CACHE[characterFile]) {
            CHARACTER_CACHE[characterFile] = {};
        }
        current = CHARACTER_CACHE[characterFile];
    }
    for (let i = 0; i < splitted.length - 1; i++) {
        if (current[splitted[i]] === undefined) {
            current[splitted[i]] = {};
        }
        current = current[splitted[i]];
    }
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

ipcMain.handle('checkCharacterFileExists', async (event, characterFile) => {
    return !!CHARACTER_CACHE[characterFile];
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

ipcMain.handle('loadCharacterFile', async (event, characterFile) => {
    const filePath = path.join(CHARACTER_FOLDER, characterFile);
    if (CHARACTER_CACHE[characterFile]) {
        return CHARACTER_CACHE[characterFile];
    }
    if (fs.existsSync(filePath)) {
        const data = await fs.promises.readFile(filePath, 'utf-8');
        CHARACTER_CACHE[characterFile] = JSON.parse(data);
        return CHARACTER_CACHE[characterFile];
    }
    return null;
});

ipcMain.handle('listCharacterFiles', async (event) => {
    return Object.keys(CHARACTER_CACHE);
});

ipcMain.handle('listCharacterGroups', async (event) => {
    const groups = new Set();
    Object.values(CHARACTER_CACHE).forEach(charData => {
        if (!charData['__unsaved'] && charData.group) {
            groups.add(charData.group);
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