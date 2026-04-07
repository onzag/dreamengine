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
    // we will use a strategy where we first try to load the file from
    // 1. the local ./namespace/id.js file wherever this script was executed
    // 2. the local ~/.dreamengine/scripts/namespace/id.js file
    // 3. in this same repository under js/default-scripts/namespace/id.js
    const thisFileDir = path.dirname(fileURLToPath(import.meta.url));
    const localDEPath = path.join(localDEPathAtHomeDir, 'scripts', namespace, id + '.js');
    const defaultScriptsPath = path.join(thisFileDir, '..', 'default-scripts', namespace, id + '.js');
    
    if (fs.existsSync(localDEPath)) {
        return {
            src: await fsPromises.readFile(localDEPath, 'utf-8'),
            srcUrl: "file://" + localDEPath,
        };
    } else if (fs.existsSync(defaultScriptsPath)) {
        return {
            src: await fsPromises.readFile(defaultScriptsPath, 'utf-8'),
            srcUrl: "file://" + defaultScriptsPath,
        };
    }

    throw new Error(`Script '${namespace}/${id}' not found in any of the search paths, searched at ${localDEPath} and ${defaultScriptsPath}`);
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
     * @returns {Promise<void>}
     */
    async function listScriptsInDir(dir, namespacePrefix = '') {
        if (!fs.existsSync(dir)) {
            return;
        }
        const entries = await fsPromises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                await listScriptsInDir(path.join(dir, entry.name), namespacePrefix + entry.name + '/');
            } else if (entry.isFile() && entry.name.endsWith('.js')) {
                const newEntry = { namespace: namespacePrefix.slice(0, -1), id: entry.name.slice(0, -3) };
                if (!scripts.some(s => s.namespace === newEntry.namespace && s.id === newEntry.id)) {
                    scripts.push(newEntry);
                }
            }
        }
    }

    await listScriptsInDir(defaultScriptsDir);
    await listScriptsInDir(localDEScriptsDir);
    return scripts;
}