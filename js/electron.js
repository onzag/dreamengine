import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { buildDreamEngineHomeSync } from './util/build-dreamengine-home.js';
import buildTypes from './util/build-types.js';

// @ts-ignore
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DREAMENGINE_HOME = buildDreamEngineHomeSync();
(async () => {
    try {
        await buildTypes({
            doNotBuildLocals: true,
            doNotWriteHomeScript: false,
        });
    } catch (err) {
        console.error('Failed to build types:', err);
    }
})();

// @ts-ignore
const config = JSON.parse(fs.readFileSync(path.join(DREAMENGINE_HOME, 'config.json')));

async function saveConfig() {
    console.log("Saving config at", path.join(DREAMENGINE_HOME, 'config.json'));
    await fs.promises.writeFile(path.join(DREAMENGINE_HOME, 'config.json'), JSON.stringify(config));
}

const createWindow = () => {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        fullscreenable: true,
        fullscreen: config.fullscreen || false,
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
    // win.webContents.openDevTools();
}

const ALLOWED_BASE_PATHS = [
    "file://" + DREAMENGINE_HOME.replace(/\\/g, "/"),
    "file://" + __dirname.replace(/\\/g, "/"),
    "file:///" + DREAMENGINE_HOME.replace(/\\/g, "/"),
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
            config.fullscreen = true;
            saveConfig();
        } else if (win) {
            win.setFullScreen(target);
            config.fullscreen = false;
            saveConfig();
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

const SCRIPT_FOLDER = path.join(DREAMENGINE_HOME, 'scripts');
if (!fs.existsSync(SCRIPT_FOLDER)) {
    fs.mkdirSync(SCRIPT_FOLDER, { recursive: true });
}

ipcMain.handle('listScriptFiles', async (event) => {
    // Scripts are organized as scripts/<namespace>/<id>.js
    // Default scripts must have namespaces starting with @, user scripts must not.
    /**
     * @type {Array<{namespace: string, id: string}>}
     */
    const results = [];

    // List user scripts (namespaces must NOT start with @)
    if (fs.existsSync(SCRIPT_FOLDER)) {
        for (const entry of fs.readdirSync(SCRIPT_FOLDER, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                const namespace = entry.name;
                if (namespace.startsWith('@')) {
                    console.warn(`Warning: local script namespace '${namespace}' starts with '@', skipping`);
                    continue;
                }
                const nsPath = path.join(SCRIPT_FOLDER, namespace);
                for (const file of fs.readdirSync(nsPath)) {
                    if (file.endsWith('.js')) {
                        const id = file.replace(/\.js$/, '');
                        results.push({ id, namespace });
                    }
                }
            }
        }
    }

    // List default scripts (namespaces must start with @)
    const defaultScriptsDir = path.join(__dirname, 'default-scripts');
    if (fs.existsSync(defaultScriptsDir)) {
        for (const entry of fs.readdirSync(defaultScriptsDir, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                const namespace = entry.name;
                if (!namespace.startsWith('@')) {
                    console.warn(`Warning: default script namespace '${namespace}' does not start with '@', skipping`);
                    continue;
                }
                const nsPath = path.join(defaultScriptsDir, namespace);
                for (const file of fs.readdirSync(nsPath)) {
                    if (file.endsWith('.js')) {
                        const id = file.replace(/\.js$/, '');
                        if (!results.some(r => r.namespace === namespace && r.id === id)) {
                            results.push({ id, namespace });
                        }
                    }
                }
            }
        }
    }

    return results;
});

ipcMain.handle('getConfigValue', async (event, key) => {
    const keys = key.split('.');
    let current = config;
    for (const k of keys) {
        if (current == null || typeof current !== 'object') return null;
        current = current[k];
    }
    return current ?? null;
});

ipcMain.handle('setConfigValue', async (event, key, value) => {
    const keys = key.split('.');
    let current = config;
    for (let i = 0; i < keys.length - 1; i++) {
        if (current[keys[i]] == null || typeof current[keys[i]] !== 'object') {
            current[keys[i]] = {};
        }
        current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
});

ipcMain.handle('saveConfig', async () => {
    await saveConfig();
});

ipcMain.handle('getDreamEnginePaths', () => {
    return [
        DREAMENGINE_HOME,
        path.join(__dirname, 'default-scripts'),
    ];
});

ipcMain.handle('uploadFileToDEPath', async (event, dePath, file) => {
    if (!file) {
        throw new Error("No file provided for upload");
    }
    // ensure no directory traversal
    if (dePath.includes('..')) {
        throw new Error("Invalid path");
    }
    const destPath = path.join(DREAMENGINE_HOME, dePath);
    const arrayBuffer = await file.arrayBuffer();
    await fs.promises.writeFile(destPath, Buffer.from(arrayBuffer));
    return true;
});

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
    const destPath = path.join(DREAMENGINE_HOME, dePath);
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