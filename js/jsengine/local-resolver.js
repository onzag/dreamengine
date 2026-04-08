import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
const fsPromises = fs.promises;

const localDEPathAtHomeDir = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.dreamengine');

/**
 * @param {string} namespace 
 * @param {string} id
 * @returns {Promise<{src: string, srcUrl: string}>}
 */
export async function localResolver(namespace, id) {
    // make sure that the id does not contain any path traversal characters for security reasons
    if (id.includes('..') || id.includes('/') || id.includes('\\')) {
        throw new Error('Invalid id, path traversal characters are not allowed');
    }
    const thisFileDir = path.dirname(fileURLToPath(import.meta.url));

    // Namespaces starting with "@" are resolved from default-scripts (bundled),
    // all others are resolved from the user's local scripts folder.
    if (namespace.startsWith('@')) {
        const defaultScriptsPath = path.join(thisFileDir, '..', 'default-scripts', namespace, id + '.js');
        if (fs.existsSync(defaultScriptsPath)) {
            return {
                src: await fsPromises.readFile(defaultScriptsPath, 'utf-8'),
                srcUrl: "file://" + defaultScriptsPath,
            };
        }
        throw new Error(`Default script '${namespace}/${id}' not found at ${defaultScriptsPath}`);
    } else {
        const localDEPath = path.join(localDEPathAtHomeDir, 'scripts', namespace, id + '.js');
        if (fs.existsSync(localDEPath)) {
            return {
                src: await fsPromises.readFile(localDEPath, 'utf-8'),
                srcUrl: "file://" + localDEPath,
            };
        }
        throw new Error(`Local script '${namespace}/${id}' not found at ${localDEPath}`);
    }
}

/**
 * @returns {Promise<Array<{namespace: string, id: string}>>}
 */
export async function localListResolver() {
    const thisFileDir = path.dirname(fileURLToPath(import.meta.url));
    const defaultScriptsDir = path.join(thisFileDir, '..', 'default-scripts');
    const localDEScriptsDir = path.join(localDEPathAtHomeDir, 'scripts');
    /**
     * @type {Array<{namespace: string, id: string}>}
     */
    const scripts = [];

    // helper function to recursively list all .js files in a directory and add them to the scripts array
    /**
     * @param {string} dir 
     * @param {string} namespacePrefix
     * @param {(namespace: string) => boolean} validateNamespace
     * @returns {Promise<void>}
     */
    async function listScriptsInDir(dir, namespacePrefix = '', validateNamespace = () => true) {
        if (!fs.existsSync(dir)) {
            return;
        }
        const entries = await fsPromises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                await listScriptsInDir(path.join(dir, entry.name), namespacePrefix + entry.name + '/', validateNamespace);
            } else if (entry.isFile() && entry.name.endsWith('.js')) {
                const namespace = namespacePrefix.slice(0, -1);
                if (!validateNamespace(namespace)) {
                    continue;
                }
                const newEntry = { namespace, id: entry.name.slice(0, -3) };
                if (!scripts.some(s => s.namespace === newEntry.namespace && s.id === newEntry.id)) {
                    scripts.push(newEntry);
                }
            }
        }
    }

    // List default scripts (namespaces must start with @)
    await listScriptsInDir(defaultScriptsDir, '', (namespace) => {
        if (!namespace.startsWith('@')) {
            console.warn(`Warning: default script namespace '${namespace}' does not start with '@', skipping`);
            return false;
        }
        return true;
    });
    // List local user scripts (namespaces must NOT start with @)
    await listScriptsInDir(localDEScriptsDir, '', (namespace) => {
        if (namespace.startsWith('@')) {
            console.warn(`Warning: local script namespace '${namespace}' starts with '@', skipping`);
            return false;
        }
        return true;
    });
    return scripts;
}