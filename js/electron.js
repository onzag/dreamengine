import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
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
    // Allow self-signed certificates for wss:// connections (including from Workers)
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

    // Also handle at session level for WebSocket connections from Workers
    win.webContents.session.setCertificateVerifyProc((request, callback) => {
        if (config.allowSelfSigned) {
            const inferenceHost = config.host || '';
            try {
                const hostUrl = new URL(inferenceHost);
                if (request.hostname === hostUrl.hostname) {
                    callback(0); // trust self-signed cert for inference server
                    return;
                }
            } catch {
                // invalid or empty host config, fall through to default
            }
        }
        callback(-3); // -3 = use default Chromium verification
    });

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

/**
 * Simple JS syntax highlighter that returns HTML with span classes.
 * @param {string} code
 * @returns {string}
 */
function highlightJS(code) {
    const esc = (/** @type {string} */ s) => s
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const tokens = [];
    const re = /(\/\/.*$|\/\*[\s\S]*?\*\/)|(`(?:[^`\\]|\\[\s\S])*`)|('(?:[^'\\]|\\[\s\S])*'|"(?:[^"\\]|\\[\s\S])*")|(\/(?![*\/])(?:[^\[\/\\]|\\.|\[(?:[^\]\\]|\\.)*\])+\/[gimsuy]*)|(\b(?:async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|from|function|if|import|in|instanceof|let|new|of|return|static|super|switch|this|throw|try|typeof|var|void|while|with|yield)\b)|(\b(?:true|false|null|undefined|NaN|Infinity)\b)|(\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\b[a-zA-Z_$][\w$]*(?=\s*\())|([\n])/gm;

    let lastIndex = 0;
    let match;
    while ((match = re.exec(code)) !== null) {
        if (match.index > lastIndex) {
            tokens.push(esc(code.slice(lastIndex, match.index)));
        }
        const [full, comment, template, str, regex, kw, cnst, num, fn, nl] = match;
        if (nl) {
            tokens.push(nl);
        } else if (comment) {
            tokens.push(`<span class="cmt">${esc(comment)}</span>`);
        } else if (template) {
            tokens.push(`<span class="tpl">${esc(template)}</span>`);
        } else if (str) {
            tokens.push(`<span class="str">${esc(str)}</span>`);
        } else if (regex) {
            tokens.push(`<span class="reg">${esc(regex)}</span>`);
        } else if (kw) {
            tokens.push(`<span class="kw">${esc(kw)}</span>`);
        } else if (cnst) {
            tokens.push(`<span class="cnst">${esc(cnst)}</span>`);
        } else if (num) {
            tokens.push(`<span class="num">${esc(num)}</span>`);
        } else if (fn) {
            tokens.push(`<span class="fn">${esc(fn)}</span>`);
        }
        lastIndex = re.lastIndex;
    }
    if (lastIndex < code.length) {
        tokens.push(esc(code.slice(lastIndex)));
    }

    // Add line numbers
    const highlighted = tokens.join('');
    const lines = highlighted.split('\n');
    return lines.map((line, i) => `<span class="ln">${i + 1}</span>${line}`).join('\n');
}

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

ipcMain.handle('viewSource', async (event, fileUrl) => {
    if (typeof fileUrl !== 'string' || !fileUrl.startsWith('file:///')) {
        throw new Error('Invalid URL');
    }
    const isAllowed = ALLOWED_BASE_PATHS.some(base => fileUrl.startsWith(base));
    if (!isAllowed) {
        throw new Error('URL not allowed');
    }

    // Convert file:// URL back to OS path
    const { fileURLToPath: toPath } = await import('url');
    const filePath = toPath(fileUrl);
    if (filePath.includes('..')) {
        throw new Error('Invalid path');
    }
    const source = await fs.promises.readFile(filePath, 'utf-8');
    const fileName = path.basename(filePath);

    const esc = (/** @type {string} */ s) => s
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(fileName)}</title>
<style>
body { margin:0; background:#1e1e1e; color:#d4d4d4; font-family:Consolas,'Courier New',monospace; font-size:14px; }
pre { margin:0; padding:16px; line-height:1.5; white-space:pre-wrap; word-wrap:break-word; tab-size:4; }
.ln { color:#858585; user-select:none; display:inline-block; min-width:3em; text-align:right; padding-right:1.5em; }
.kw { color:#569cd6; } .str { color:#ce9178; } .num { color:#b5cea8; }
.cmt { color:#6a9955; } .fn { color:#dcdcaa; } .reg { color:#d16969; }
.cnst { color:#4fc1ff; } .op { color:#d4d4d4; } .tpl { color:#ce9178; }
</style></head><body><pre>${highlightJS(source)}</pre></body></html>`;

    const sourceWin = new BrowserWindow({
        width: 900,
        height: 700,
        title: fileName + ' — View Source',
        autoHideMenuBar: true,
        webPreferences: {
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            javascript: false,
        },
    });
    sourceWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
});

ipcMain.on('closeApp', () => {
    app.quit();
});

const SCRIPT_FOLDER = path.join(DREAMENGINE_HOME, 'scripts');
if (!fs.existsSync(SCRIPT_FOLDER)) {
    fs.mkdirSync(SCRIPT_FOLDER, { recursive: true });
}

// Watch the scripts folder for changes and notify the renderer
/**
 * @type {NodeJS.Timeout|null}
 */
let scriptChangeTimeout = null;
fs.watch(SCRIPT_FOLDER, { recursive: true }, (eventType, filename) => {
    if (!filename || !filename.endsWith('.js')) return;
    // Debounce to avoid rapid-fire events
    if (scriptChangeTimeout) clearTimeout(scriptChangeTimeout);
    scriptChangeTimeout = setTimeout(() => {
        scriptChangeTimeout = null;
        const wins = BrowserWindow.getAllWindows();
        for (const win of wins) {
            win.webContents.send('scripts-changed');
        }
    }, 500);
});

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

ipcMain.handle('newScriptFile', async (event, namespace, id, header) => {
    if (!namespace || !id) {
        throw new Error("Namespace and ID are required");
    }

    if (namespace.startsWith('@')) {
        throw new Error("Namespace cannot start with '@'");
    }

    const scriptPath = path.join(SCRIPT_FOLDER, namespace, `${id}.js`);
    if (fs.existsSync(scriptPath)) {
        throw new Error("Script file already exists");
    }

    fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
    fs.writeFileSync(scriptPath, header || ""); // create script with header or empty
});

ipcMain.handle('moveScriptFile', async (event, oldNamespace, oldId, newNamespace, newId) => {
    if (!oldNamespace || !oldId || !newNamespace || !newId) {
        throw new Error("Old namespace, old ID, new namespace, and new ID are required");
    }

    if (oldNamespace.startsWith('@') || newNamespace.startsWith('@')) {
        throw new Error("Namespace cannot start with '@'");
    }

    const oldPath = path.join(SCRIPT_FOLDER, oldNamespace, `${oldId}.js`);
    const newPath = path.join(SCRIPT_FOLDER, newNamespace, `${newId}.js`);
    if (!fs.existsSync(oldPath)) {
        throw new Error("Original script file does not exist");
    }
    if (fs.existsSync(newPath)) {
        throw new Error("New script file already exists");
    }
    fs.renameSync(oldPath, newPath);
});

ipcMain.handle('deleteScriptFile', async (event, namespace, id) => {
    if (!namespace || !id) {
        throw new Error("Namespace and ID are required");
    }

    if (namespace.startsWith('@')) {
        throw new Error("Namespace cannot start with '@'");
    }

    const scriptPath = path.join(SCRIPT_FOLDER, namespace, `${id}.js`);
    if (!fs.existsSync(scriptPath)) {
        throw new Error("Script file does not exist");
    }

    fs.unlinkSync(scriptPath);
});

ipcMain.handle('updateScriptFile', async (event, namespace, id, content) => {
    if (!namespace || !id) {
        throw new Error("Namespace and ID are required");
    }

    if (namespace.startsWith('@')) {
        throw new Error("Namespace cannot start with '@'");
    }

    const scriptPath = path.join(SCRIPT_FOLDER, namespace, `${id}.js`);
    if (!fs.existsSync(scriptPath)) {
        throw new Error("Script file does not exist");
    }
    fs.writeFileSync(scriptPath, content, 'utf-8');
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

ipcMain.handle('detectEditors', async () => {
    const { shell } = await import('electron');
    const isWin = process.platform === 'win32';
    const isMac = process.platform === 'darwin';

    const editors = [
        { id: 'code', name: 'Visual Studio Code', cmd: 'code' },
        { id: 'codium', name: 'VSCodium', cmd: 'codium' },
        { id: 'cursor', name: 'Cursor', cmd: 'cursor' },
        { id: 'subl', name: 'Sublime Text', cmd: 'subl' },
        { id: 'atom', name: 'Atom', cmd: 'atom' },
        { id: 'notepad++', name: 'Notepad++', cmd: isWin ? 'notepad++' : null },
        { id: 'nano', name: 'Nano', cmd: !isWin ? 'nano' : null },
        { id: 'vim', name: 'Vim', cmd: !isWin ? 'vim' : null },
    ];

    const available = [];
    for (const editor of editors) {
        if (!editor.cmd) continue;
        try {
            const which = isWin ? 'where' : 'which';
            await new Promise((resolve, reject) => {
                // @ts-ignore
                execFile(which, [editor.cmd], (err) => err ? reject(err) : resolve(true));
            });
            available.push({ id: editor.id, name: editor.name, cmd: editor.cmd });
        } catch {
            // not found
        }
    }

    // Always add system default as last option
    available.push({ id: 'system', name: 'System Default', cmd: '__system__' });

    return available;
});

ipcMain.handle('openInEditor', async (event, filePath, editorCmd) => {
    if (typeof filePath !== 'string' || filePath.includes('..')) {
        throw new Error('Invalid file path');
    }
    if (!fs.existsSync(filePath)) {
        throw new Error('File does not exist');
    }

    // Validate the file is within allowed directories
    const normalizedPath = path.resolve(filePath);
    const inScripts = normalizedPath.startsWith(path.resolve(SCRIPT_FOLDER));
    const inDefaults = normalizedPath.startsWith(path.resolve(path.join(__dirname, 'default-scripts')));
    if (!inScripts && !inDefaults) {
        throw new Error('File is outside allowed directories');
    }

    if (!editorCmd || editorCmd === '__system__') {
        const { shell } = await import('electron');
        await shell.openPath(normalizedPath);
    } else {
        execFile(editorCmd, [normalizedPath], (err) => {
            if (err) console.error('Failed to open editor:', err);
        });
    }
});