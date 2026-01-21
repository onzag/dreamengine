import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const fsAsync = fs.promises;

import { importScriptAsTemplate, importScriptFromJSON, importScriptFromSplitJSON } from './scripts.js';

/**
 * A default import resolver that works within the file system and is meant to be used in nodejs
 * environments.
 * 
 * It includes default-scripts by default processing them as json types
 * 
 * @param {string} scriptId 
 * @param {"script" | "template" | "value_getter_char_space" | "value_getter_item_space"} scriptType
 * @param {DEScriptSource[]} existingScriptSources
 * @returns {Promise<DEScriptSource>}
 */
export async function nodejsImportResolver(scriptId, scriptType, existingScriptSources) {
    if (scriptType !== "script") {
        throw new Error(`nodejsImportResolver only supports scriptType "script" currently.`);
    } else if (!scriptId.endsWith('.json')) {
        throw new Error(`Script id ${scriptId} must end with .json`);
    }

    const foundScriptSource = existingScriptSources.find(s => s.id === scriptId);
    if (foundScriptSource) {
        return foundScriptSource;
    }

    // find the script as a local json file straight on
    const directPath = path.join('scripts', scriptId);
    /**
     * @type {DEScriptSource | null}
     */
    let json = null;
    /**
     * @type {string | null}
     */
    let separateSource = null;
    if (fs.existsSync(directPath)) {
        const fileContent = await fsAsync.readFile(directPath, 'utf-8');
        json = JSON.parse(fileContent);
    } else {
        // try folder style
        const folderPath = path.join('scripts', scriptId.replace('.json', ''));
        const jsonPath = path.join(folderPath, 'index.json');
        const sourcePath = path.join(folderPath, 'index.js');
        if (fs.existsSync(jsonPath)) {
            const fileContent = await fsAsync.readFile(jsonPath, 'utf-8');
            json = JSON.parse(fileContent);
            if (fs.existsSync(sourcePath)) {
                separateSource = await fsAsync.readFile(sourcePath, 'utf-8');
            } else {
                throw new Error(`Script folder for id ${scriptId} is missing index.js source file at ${sourcePath}`);
            }
        } else {
            // try default-scripts, these are always separate json files
            // we need to get the location of this very own file to find the default-scripts folder
            const thisFileDir = path.dirname(fileURLToPath(import.meta.url));
            const defaultScriptsPath = path.join(thisFileDir, '..', 'default-scripts', scriptId.replace('.json', ''));
            const defaultJsonPath = path.join(defaultScriptsPath, 'index.json');
            const defaultSourcePath = path.join(defaultScriptsPath, 'index.js');
            if (fs.existsSync(defaultJsonPath)) {
                const fileContent = await fsAsync.readFile(defaultJsonPath, 'utf-8');
                json = JSON.parse(fileContent);
                if (fs.existsSync(defaultSourcePath)) {
                    separateSource = await fsAsync.readFile(defaultSourcePath, 'utf-8');
                } else {
                    throw new Error(`Default script folder for id ${scriptId} is missing index.js source file at ${defaultSourcePath}`);
                }
            } else {
                throw new Error(`Script with id ${scriptId} not found as file or folder checked at ${directPath}, ${jsonPath}, and ${defaultJsonPath}`);
            }
        }
    }

    if (!separateSource) {
        const imported = importScriptFromJSON(scriptId, json);
        return imported[1];
    } else {
        const imported = importScriptFromSplitJSON(scriptId, json, separateSource);
        return imported[1];
    }
}
