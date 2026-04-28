/**
 * Web version of the app, runs locally in the browser with all the same features as the electron version
 * This is a node.js app that is ran with npm run web
 * it generates a self-signed certificate for the server and serves the app on https://localhost:3000
 * it will ask for username and password too on the first run that will be used when connecting to the server
 * locally
 */

import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import readline from 'readline';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import https from 'https';
import { buildDreamEngineHome } from './util/build-dreamengine-home.js';
import express from 'express';

const execFileAsync = promisify(execFile);

// @ts-ignore
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Serve the entire js/ tree so app modules can import siblings
// (e.g. /engine/..., /cardtype/..., /util/...). The browser entry point lives
// at /app/index.html.
const SERVE_ROOT = __dirname;
const APP_INDEX_PATH = '/app/';

const WEB_PORT = Number(process.env.DREAMENGINE_WEB_PORT) || 8000;

const DREAMENGINE_HOME = path.join(
    process.env.HOME || process.env.USERPROFILE || '.',
    '.dreamengine',
);
const CERT_PATH = path.join(DREAMENGINE_HOME, 'web-cert.pem');
const KEY_PATH = path.join(DREAMENGINE_HOME, 'web-key.pem');
const CONFIG_PATH = path.join(DREAMENGINE_HOME, 'config.json');

/**
 * Check whether `openssl` is available on PATH.
 * @returns {Promise<boolean>}
 */
async function hasOpenSSL() {
    try {
        await execFileAsync('openssl', ['version']);
        return true;
    } catch {
        return false;
    }
}

/**
 * Generate a self-signed certificate using the `selfsigned` npm package and
 * write the PEM files to the .dreamengine home directory.
 * @returns {Promise<void>}
 */
async function generateCertWithSelfsigned() {
    // Dynamic import so the rest of the file works even if the package is absent.
    const { generate } = await import('selfsigned');
    const attrs = [{ name: 'commonName', value: '*' }];
    const tenYears = new Date();
    tenYears.setFullYear(tenYears.getFullYear() + 10);
    const pems = await generate(attrs, {
        keySize: 2048,
        notAfterDate: tenYears,
        algorithm: 'sha256',
        extensions: [
            {
                name: /** @type {'subjectAltName'} */ ('subjectAltName'),
                altNames: [
                    { type: 2, value: 'localhost' },    // DNS: localhost
                    { type: 2, value: '*.localhost' },  // DNS: *.localhost
                    { type: 2, value: '*' },            // DNS: any hostname
                    { type: 7, ip: '127.0.0.1' },       // IP: loopback v4
                    { type: 7, ip: '::1' },             // IP: loopback v6
                ],
            },
        ],
    });
    fs.writeFileSync(CERT_PATH, pems.cert, 'utf-8');
    fs.writeFileSync(KEY_PATH, pems.private, 'utf-8');
}

/**
 * Generate a self-signed certificate + private key written to
 * `web-cert.pem` and `web-key.pem` inside the .dreamengine home directory.
 * Tries openssl first; falls back to the `selfsigned` npm package if installed;
 * throws if neither is available.
 * Skips generation if both files already exist.
 * @returns {Promise<void>}
 */
async function ensureSelfSignedCert() {
    if (fs.existsSync(CERT_PATH) && fs.existsSync(KEY_PATH)) {
        console.log(`Using existing certificate at ${CERT_PATH}`);
        return;
    }

    if (await hasOpenSSL()) {
        console.log('Generating self-signed certificate via openssl...');
        await execFileAsync('openssl', [
            'req',
            '-x509',
            '-newkey', 'rsa:2048',
            '-sha256',
            '-days', '3650',
            '-nodes',
            '-keyout', KEY_PATH,
            '-out', CERT_PATH,
            '-subj', '/CN=*',
            '-addext', 'subjectAltName=DNS:localhost,DNS:*.localhost,DNS:*,IP:127.0.0.1,IP:::1',
        ]);
        console.log('Generated certificate via openssl.');
    } else {
        // Try the optional selfsigned npm package as a fallback.
        try {
            console.log('openssl not found, attempting to use the `selfsigned` npm package...');
            await generateCertWithSelfsigned();
            console.log('Generated certificate via selfsigned.');
        } catch (err) {
            // @ts-ignore
            if (err?.code === 'ERR_MODULE_NOT_FOUND' || err?.code === 'MODULE_NOT_FOUND') {
                throw new Error(
                    'Could not generate a TLS certificate: openssl was not found on PATH ' +
                    'and the `selfsigned` npm package is not installed.\n' +
                    'Fix either issue:\n' +
                    '  • Install OpenSSL and make `openssl` available on your PATH, or\n' +
                    '  • Run `npm install selfsigned` in the project directory.',
                );
            }
            throw err;
        }
    }

    // Lock down the private key permissions where supported (no-op on Windows).
    try {
        fs.chmodSync(KEY_PATH, 0o600);
    } catch {
        /* ignore on platforms that don't support it */
    }

    console.log(`Wrote certificate to ${CERT_PATH}`);
    console.log(`Wrote private key to ${KEY_PATH}`);
}

/**
 * Prompt the user for a line of input. If `silent` is true, characters are not
 * echoed (used for password entry).
 * @param {string} prompt
 * @param {{ silent?: boolean }} [opts]
 * @returns {Promise<string>}
 */
function ask(prompt, opts = {}) {
    const { silent = false } = opts;
    return new Promise((resolve) => {
        const output = process.stdout;
        const rl = readline.createInterface({
            input: process.stdin,
            output,
            terminal: true,
        });

        if (silent && process.stdin.isTTY) {
            // Mute echoed characters by overriding the output writer.
            // @ts-ignore - _writeToOutput is internal but stable enough for this use.
            rl._writeToOutput = (str) => {
                if (str.includes(prompt)) {
                    output.write(str);
                }
            };
        }

        rl.question(prompt, (answer) => {
            if (silent) {
                output.write('\n');
            }
            rl.close();
            resolve(answer);
        });
    });
}

/**
 * Hash a password with scrypt and return a self-contained string of the form
 * `scrypt$<saltHex>$<hashHex>` suitable for storage in config.json.
 * @param {string} password
 * @returns {string}
 */
function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(password, salt, 64);
    return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/**
 * Ensure the .dreamengine config has `webAuth` credentials. Prompts the user
 * if missing and persists the result.
 * @returns {Promise<void>}
 */
async function ensureWebCredentials() {
    /** @type {Record<string, any>} */
    let config = {};
    try {
        config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    } catch {
        config = {};
    }

    if (
        config.webAuth &&
        typeof config.webAuth.username === 'string' &&
        typeof config.webAuth.passwordHash === 'string'
    ) {
        console.log(`Using existing web credentials for user "${config.webAuth.username}"`);
        return;
    }

    console.log('No web credentials found. Please create a username and password.');
    console.log('These will be required to access the local web app.');

    let username = '';
    while (!username) {
        username = (await ask('Username: ')).trim();
        if (!username) console.log('Username cannot be empty.');
    }

    let password = '';
    while (!password) {
        const pw1 = await ask('Password: ', { silent: true });
        if (!pw1) {
            console.log('Password cannot be empty.');
            continue;
        }
        const pw2 = await ask('Confirm password: ', { silent: true });
        if (pw1 !== pw2) {
            console.log('Passwords do not match. Try again.');
            continue;
        }
        password = pw1;
    }

    config.webAuth = {
        username,
        passwordHash: hashPassword(password),
    };

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`Saved web credentials to ${CONFIG_PATH}`);
}

/**
 * Verify a plaintext password against a stored `scrypt$<salt>$<hash>` string
 * using a constant-time comparison.
 * @param {string} password
 * @param {string} stored
 * @returns {boolean}
 */
function verifyPassword(password, stored) {
    const parts = stored.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    try {
        const salt = Buffer.from(parts[1], 'hex');
        const expected = Buffer.from(parts[2], 'hex');
        const actual = crypto.scryptSync(password, salt, expected.length);
        return actual.length === expected.length &&
            crypto.timingSafeEqual(actual, expected);
    } catch {
        return false;
    }
}

/**
 * Start an HTTPS server that serves the app from `js/app/` and protects every
 * request with HTTP Basic Auth (the browser shows a native username/password
 * prompt). Uses express if installed; otherwise falls back to a tiny built-in
 * static server using node's `https` module.
 * @param {{ username: string, passwordHash: string }} creds
 * @returns {Promise<void>}
 */
async function startWebServer(creds) {
    const tlsOptions = {
        cert: fs.readFileSync(CERT_PATH),
        key: fs.readFileSync(KEY_PATH),
    };

    /**
     * Check the Authorization header. Returns true if the request is allowed.
     * @param {string | undefined} authHeader
     */
    const checkAuth = (authHeader) => {
        if (!authHeader || !authHeader.startsWith('Basic ')) return false;
        let decoded = '';
        try {
            decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
        } catch {
            return false;
        }
        const idx = decoded.indexOf(':');
        if (idx < 0) return false;
        const user = decoded.slice(0, idx);
        const pass = decoded.slice(idx + 1);
        if (user !== creds.username) return false;
        return verifyPassword(pass, creds.passwordHash);
    };

    /** @type {any} */
    const app = express();

    // Load the on-disk config once into memory; mutations go through the API
    // and are persisted explicitly via /api/config/save (matches electron
    // behavior in js/electron.js).
    /** @type {Record<string, any>} */
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

    // --- Script storage ------------------------------------------------------
    // Mirrors js/electron.js: user scripts live in <DREAMENGINE_HOME>/scripts/
    // and default (built-in) scripts live in <__dirname>/default-scripts/.
    // Default namespaces must start with '@', user namespaces must not.
    const SCRIPT_FOLDER = path.join(DREAMENGINE_HOME, 'scripts');
    const DEFAULT_SCRIPTS_DIR = path.join(__dirname, 'default-scripts');
    if (!fs.existsSync(SCRIPT_FOLDER)) {
        fs.mkdirSync(SCRIPT_FOLDER, { recursive: true });
    }

    /**
     * Validate a namespace/id pair for user scripts. Throws on bad input.
     * @param {string} namespace
     * @param {string} id
     */
    const requireUserScriptIds = (namespace, id) => {
        if (!namespace || !id) {
            throw new Error('Namespace and ID are required');
        }
        if (namespace.startsWith('@')) {
            throw new Error("Namespace cannot start with '@'");
        }
        // Defense-in-depth: no path traversal in either segment.
        if (
            namespace.includes('..') || namespace.includes('/') || namespace.includes('\\') ||
            id.includes('..') || id.includes('/') || id.includes('\\')
        ) {
            throw new Error('Invalid namespace or id');
        }
    };

    // Basic Auth middleware — browser will show a native login dialog.
    app.use((/** @type {any} */ req, /** @type {any} */ res, /** @type {any} */ next) => {
        if (checkAuth(req.headers.authorization)) {
            next();
            return;
        }
        res.set('WWW-Authenticate', 'Basic realm="Dream Engine", charset="UTF-8"');
        res.status(401).send('Authentication required');
    });

    app.use(express.json({ limit: '10mb' }));

    // --- Config API ----------------------------------------------------------
    // Mirrors the ipcMain handlers in js/electron.js for getConfigValue,
    // setConfigValue and saveConfig. Keys use dot-notation (e.g. "webAuth.username").

    app.get('/api/config/get', (/** @type {any} */ req, /** @type {any} */ res) => {
        const key = String(req.query.key || '');
        if (!key) {
            res.status(400).json({ error: 'missing key' });
            return;
        }
        const keys = key.split('.');
        /** @type {any} */
        let current = config;
        for (const k of keys) {
            if (current == null || typeof current !== 'object') {
                res.json({ value: null });
                return;
            }
            current = current[k];
        }
        res.json({ value: current ?? null });
    });

    app.post('/api/config/set', (/** @type {any} */ req, /** @type {any} */ res) => {
        const key = req.body && typeof req.body.key === 'string' ? req.body.key : '';
        if (!key) {
            res.status(400).json({ error: 'missing key' });
            return;
        }
        const value = req.body.value;
        const keys = key.split('.');
        /** @type {any} */
        let current = config;
        for (let i = 0; i < keys.length - 1; i++) {
            if (current[keys[i]] == null || typeof current[keys[i]] !== 'object') {
                current[keys[i]] = {};
            }
            current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;
        res.json({ ok: true });
    });

    app.post('/api/config/save', async (/** @type {any} */ _req, /** @type {any} */ res) => {
        try {
            console.log('Saving config at', CONFIG_PATH);
            await fs.promises.writeFile(CONFIG_PATH, JSON.stringify(config));
            res.json({ ok: true });
        } catch (err) {
            console.error('Failed to save config:', err);
            res.status(500).json({ error: String(err) });
        }
    });

    // --- File upload ---------------------------------------------------------
    // Mirrors the ipcMain `uploadBytesToDEPath` handler in js/electron.js: the
    // destination must be either "profile" or live under "assets/", must not
    // contain "..", and must not be a .json or .js file. The raw request body
    // is written as-is to <DREAMENGINE_HOME>/<dePath>.

    app.post(
        '/api/upload',
        express.raw({ type: 'application/octet-stream', limit: '100mb' }),
        async (/** @type {any} */ req, /** @type {any} */ res) => {
            try {
                const dePath = String(req.query.path || '');
                if (!dePath) {
                    res.status(400).json({ error: 'Invalid destination path' });
                    return;
                }
                if (dePath.includes('..')) {
                    res.status(400).json({ error: 'Invalid path' });
                    return;
                }
                if (dePath !== 'profile' && !dePath.startsWith('assets/')) {
                    res.status(403).json({ error: 'Unauthorized path for upload' });
                    return;
                }
                if (dePath.endsWith('.json') || dePath.endsWith('.js')) {
                    res.status(403).json({ error: 'Uploading JSON or JS files is not allowed' });
                    return;
                }
                if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
                    res.status(400).json({ error: 'No byte data provided for upload' });
                    return;
                }

                const destPath = path.join(DREAMENGINE_HOME, dePath);
                // Defense-in-depth: ensure the resolved path stays inside the home dir.
                if (!path.resolve(destPath).startsWith(path.resolve(DREAMENGINE_HOME))) {
                    res.status(400).json({ error: 'Invalid path' });
                    return;
                }
                await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
                await fs.promises.writeFile(destPath, req.body);
                res.json({ ok: true });
            } catch (err) {
                console.error('Upload failed:', err);
                res.status(500).json({ error: String(err) });
            }
        },
    );

    // --- Script files API ----------------------------------------------------
    // Mirrors ipcMain handlers listScriptFiles/newScriptFile/moveScriptFile/
    // deleteScriptFile/updateScriptFile in js/electron.js.

    app.get('/api/scripts/list', (/** @type {any} */ _req, /** @type {any} */ res) => {
        try {
            /** @type {Array<{namespace: string, id: string}>} */
            const results = [];

            // User scripts: namespaces must NOT start with '@'.
            if (fs.existsSync(SCRIPT_FOLDER)) {
                for (const entry of fs.readdirSync(SCRIPT_FOLDER, { withFileTypes: true })) {
                    if (!entry.isDirectory()) continue;
                    const namespace = entry.name;
                    if (namespace.startsWith('@')) {
                        console.warn(`Warning: local script namespace '${namespace}' starts with '@', skipping`);
                        continue;
                    }
                    const nsPath = path.join(SCRIPT_FOLDER, namespace);
                    for (const file of fs.readdirSync(nsPath)) {
                        if (file.endsWith('.js')) {
                            results.push({ id: file.replace(/\.js$/, ''), namespace });
                        }
                    }
                }
            }

            // Default scripts: namespaces must start with '@'.
            if (fs.existsSync(DEFAULT_SCRIPTS_DIR)) {
                for (const entry of fs.readdirSync(DEFAULT_SCRIPTS_DIR, { withFileTypes: true })) {
                    if (!entry.isDirectory()) continue;
                    const namespace = entry.name;
                    if (!namespace.startsWith('@')) {
                        console.warn(`Warning: default script namespace '${namespace}' does not start with '@', skipping`);
                        continue;
                    }
                    const nsPath = path.join(DEFAULT_SCRIPTS_DIR, namespace);
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

            res.json(results);
        } catch (err) {
            console.error('listScriptFiles failed:', err);
            res.status(500).json({ error: String(err) });
        }
    });

    app.post('/api/scripts/new', (/** @type {any} */ req, /** @type {any} */ res) => {
        try {
            const { namespace, id, header } = req.body || {};
            requireUserScriptIds(namespace, id);
            const scriptPath = path.join(SCRIPT_FOLDER, namespace, `${id}.js`);
            if (fs.existsSync(scriptPath)) {
                throw new Error('Script file already exists');
            }
            fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
            fs.writeFileSync(scriptPath, header || '');
            res.json({ ok: true });
        } catch (err) {
            // @ts-ignore
            res.status(400).json({ error: err?.message || String(err) });
        }
    });

    app.post('/api/scripts/move', (/** @type {any} */ req, /** @type {any} */ res) => {
        try {
            const { oldNamespace, oldId, newNamespace, newId } = req.body || {};
            if (!oldNamespace || !oldId || !newNamespace || !newId) {
                throw new Error('Old namespace, old ID, new namespace, and new ID are required');
            }
            requireUserScriptIds(oldNamespace, oldId);
            requireUserScriptIds(newNamespace, newId);
            const oldPath = path.join(SCRIPT_FOLDER, oldNamespace, `${oldId}.js`);
            const newPath = path.join(SCRIPT_FOLDER, newNamespace, `${newId}.js`);
            if (!fs.existsSync(oldPath)) {
                throw new Error('Original script file does not exist');
            }
            if (fs.existsSync(newPath)) {
                throw new Error('New script file already exists');
            }
            fs.mkdirSync(path.dirname(newPath), { recursive: true });
            fs.renameSync(oldPath, newPath);
            res.json({ ok: true });
        } catch (err) {
            // @ts-ignore
            res.status(400).json({ error: err?.message || String(err) });
        }
    });

    app.post('/api/scripts/delete', (/** @type {any} */ req, /** @type {any} */ res) => {
        try {
            const { namespace, id } = req.body || {};
            requireUserScriptIds(namespace, id);
            const scriptPath = path.join(SCRIPT_FOLDER, namespace, `${id}.js`);
            if (!fs.existsSync(scriptPath)) {
                throw new Error('Script file does not exist');
            }
            fs.unlinkSync(scriptPath);
            res.json({ ok: true });
        } catch (err) {
            // @ts-ignore
            res.status(400).json({ error: err?.message || String(err) });
        }
    });

    app.post('/api/scripts/update', (/** @type {any} */ req, /** @type {any} */ res) => {
        try {
            const { namespace, id, content } = req.body || {};
            requireUserScriptIds(namespace, id);
            if (typeof content !== 'string') {
                throw new Error('Content must be a string');
            }
            const scriptPath = path.join(SCRIPT_FOLDER, namespace, `${id}.js`);
            if (!fs.existsSync(scriptPath)) {
                throw new Error('Script file does not exist');
            }
            fs.writeFileSync(scriptPath, content, 'utf-8');
            res.json({ ok: true });
        } catch (err) {
            // @ts-ignore
            res.status(400).json({ error: err?.message || String(err) });
        }
    });

    // --- Script change notifications via Server-Sent Events ------------------
    // The electron version uses win.webContents.send('scripts-changed').
    // For the web client we stream a `scripts-changed` event over SSE; the
    // EventSource in api.js auto-reconnects if the connection drops.
    /** @type {Set<any>} */
    const scriptChangeClients = new Set();

    app.get('/api/scripts/events', (/** @type {any} */ req, /** @type {any} */ res) => {
        res.set({
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        });
        res.flushHeaders?.();
        res.write(': connected\n\n');
        scriptChangeClients.add(res);
        req.on('close', () => {
            scriptChangeClients.delete(res);
        });
    });

    /** @type {NodeJS.Timeout|null} */
    let scriptChangeTimeout = null;
    fs.watch(SCRIPT_FOLDER, { recursive: true }, (_eventType, filename) => {
        if (!filename || !String(filename).endsWith('.js')) return;
        if (scriptChangeTimeout) clearTimeout(scriptChangeTimeout);
        scriptChangeTimeout = setTimeout(() => {
            scriptChangeTimeout = null;
            for (const client of scriptChangeClients) {
                try {
                    client.write('event: scripts-changed\ndata: {}\n\n');
                } catch {
                    scriptChangeClients.delete(client);
                }
            }
        }, 500);
    });

    // Redirect the root to the app's index so relative paths in index.html
    // (e.g. images/, index.css, index.js) keep resolving correctly.
    app.get('/', (/** @type {any} */ _req, /** @type {any} */ res) => {
        res.redirect(APP_INDEX_PATH);
    });

    // Expose the user's .dreamengine home directory so the web client can
    // reach scripts, assets and config the same way the electron version does
    // via file:// URLs. The mount path matches the value returned from
    // window.API.getDreamEnginePaths() in js/api.js.
    app.use(
        '/.dreamengine',
        express.static(DREAMENGINE_HOME, { index: false, fallthrough: false }),
    );

    // Expose the entire js/ folder. Each subdirectory's index.html (if any)
    // will be served as the directory default.
    app.use(express.static(SERVE_ROOT, { index: 'index.html' }));

    const server = https.createServer(tlsOptions, app);
    await new Promise((resolve) => server.listen(WEB_PORT, () => resolve(undefined)));
    console.log(`Dream Engine web app running at https://localhost:${WEB_PORT}/`);
}

/**
 * Entry point: ensure the .dreamengine home is built, generate the self-signed
 * certificate if needed, and prompt for web credentials on first run.
 */
async function main() {
    await buildDreamEngineHome();
    await ensureSelfSignedCert();
    await ensureWebCredentials();

    /** @type {Record<string, any>} */
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    await startWebServer(config.webAuth);
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});