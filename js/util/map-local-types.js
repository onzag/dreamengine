import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
const fsPromises = fs.promises;

const thisFileDir = path.dirname(fileURLToPath(import.meta.url));
const defaultScriptsDir = path.join(thisFileDir, '..', 'default-scripts');
const typesDir = path.join(thisFileDir, '..', 'types');
const localDEPathAtHomeDir = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.dreamengine');

/**
 * Base DEScript method names — these are already on the DEScript interface
 * and don't need to be re-declared in the registry entry.
 */
const BASE_DESCRIPT_MEMBERS = new Set([
    'type', 'description', 'exposeProperties',
    'initialize', 'onWorldInitialized', 'onInferencePrepareToExecute',
    'onInferenceExecuted', 'onSceneStarted', 'onSceneReady', 'onWander',
]);

/**
 * Scans a directory recursively for `.js` files and returns an array of
 * `{ namespace, id, filePath }` for each script found.
 * @param {string} baseDir
 * @returns {Promise<Array<{namespace: string, id: string, filePath: string}>>}
 */
async function discoverScripts(baseDir) {
    /** @type {Array<{namespace: string, id: string, filePath: string}>} */
    const results = [];
    if (!fs.existsSync(baseDir)) return results;

    const namespaces = await fsPromises.readdir(baseDir, { withFileTypes: true });
    for (const entry of namespaces) {
        if (!entry.isDirectory()) continue;
        const namespace = entry.name;
        const nsDir = path.join(baseDir, namespace);
        const files = await fsPromises.readdir(nsDir, { withFileTypes: true });
        for (const file of files) {
            if (!file.isFile() || !file.name.endsWith('.js')) continue;
            const id = file.name.slice(0, -3);
            results.push({ namespace, id, filePath: path.join(nsDir, file.name) });
        }
    }
    return results;
}

/**
 * Extracts the extra (non-base) method and property signatures from the source
 * of a script that uses `engine.exports = { ... }`.
 *
 * This is a heuristic source-level parser — it looks for top-level method definitions
 * and property assignments inside the `engine.exports = { ... }` block and extracts
 * their JSDoc parameter types when available.
 *
 * @param {string} src  The full source code of the script
 * @returns {{ members: Array<{name: string, signature: string}>, hasExports: boolean }}
 */
function extractExtraMembers(src) {
    // Check that the file actually assigns engine.exports
    if (!src.includes('engine.exports')) {
        return { members: [], hasExports: false };
    }

    // Find the engine.exports = { ... } block start
    const exportsStart = src.indexOf('engine.exports');
    if (exportsStart === -1) return { members: [], hasExports: false };

    // Find the opening brace
    const braceStart = src.indexOf('{', exportsStart);
    if (braceStart === -1) return { members: [], hasExports: false };

    // We'll parse from after the opening brace, tracking brace depth to find
    // top-level members of the exports object
    /** @type {Array<{name: string, signature: string}>} */
    const members = [];

    // Regex to match method definitions at the top level of the object:
    //   methodName(params) {
    //   async methodName(params) {
    //   methodName: function(params) {
    //   methodName: async function(params) {
    // Also property assignments:
    //   propertyName: value,
    //
    // We do a brace-depth scan to only capture top-level members.
    let depth = 1;
    let i = braceStart + 1;
    const len = src.length;

    while (i < len && depth > 0) {
        const ch = src[i];

        // Skip string literals
        if (ch === '"' || ch === '\'' || ch === '`') {
            i = skipString(src, i);
            continue;
        }
        // Skip line comments
        if (ch === '/' && i + 1 < len && src[i + 1] === '/') {
            i = src.indexOf('\n', i);
            if (i === -1) break;
            i++;
            continue;
        }
        // Skip block comments but capture JSDoc
        if (ch === '/' && i + 1 < len && src[i + 1] === '*') {
            const commentEnd = src.indexOf('*/', i + 2);
            if (commentEnd === -1) break;
            i = commentEnd + 2;
            continue;
        }

        if (ch === '{') { depth++; i++; continue; }
        if (ch === '}') { depth--; i++; continue; }

        // Only look for members at depth 1 (top-level of the object literal)
        if (depth === 1) {
            // Try to match a method or property definition starting roughly here
            const remaining = src.slice(i);

            // async method(params) {
            const asyncMethodMatch = remaining.match(/^(async\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(([^)]*)\)\s*\{/);
            if (asyncMethodMatch) {
                const methodName = asyncMethodMatch[2];
                if (!BASE_DESCRIPT_MEMBERS.has(methodName)) {
                    const params = asyncMethodMatch[3].trim();
                    const isAsync = !!asyncMethodMatch[1];
                    const jsdoc = extractPrecedingJSDoc(src, i);
                    const paramTypes = parseJSDocParams(jsdoc);
                    const returnType = parseJSDocReturn(jsdoc);
                    const typedParams = buildTypedParams(params, paramTypes);
                    const retStr = returnType || (isAsync ? 'Promise<void>' : 'void');
                    members.push({
                        name: methodName,
                        signature: `${methodName}(${typedParams}): ${retStr}`,
                    });
                }
                // Skip past the method name to avoid re-matching
                i += asyncMethodMatch[0].length;
                // Now skip the method body
                let bodyDepth = 1;
                while (i < len && bodyDepth > 0) {
                    const bc = src[i];
                    if (bc === '"' || bc === '\'' || bc === '`') { i = skipString(src, i); continue; }
                    if (bc === '{') bodyDepth++;
                    if (bc === '}') bodyDepth--;
                    i++;
                }
                continue;
            }

            // propertyName: function / async function
            const propFnMatch = remaining.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*(async\s+)?function\s*\(([^)]*)\)\s*\{/);
            if (propFnMatch) {
                const propName = propFnMatch[1];
                if (!BASE_DESCRIPT_MEMBERS.has(propName)) {
                    const params = propFnMatch[3].trim();
                    const isAsync = !!propFnMatch[2];
                    const jsdoc = extractPrecedingJSDoc(src, i);
                    const paramTypes = parseJSDocParams(jsdoc);
                    const returnType = parseJSDocReturn(jsdoc);
                    const typedParams = buildTypedParams(params, paramTypes);
                    const retStr = returnType || (isAsync ? 'Promise<void>' : 'void');
                    members.push({
                        name: propName,
                        signature: `${propName}(${typedParams}): ${retStr}`,
                    });
                }
                i += propFnMatch[0].length;
                let bodyDepth = 1;
                while (i < len && bodyDepth > 0) {
                    const bc = src[i];
                    if (bc === '"' || bc === '\'' || bc === '`') { i = skipString(src, i); continue; }
                    if (bc === '{') bodyDepth++;
                    if (bc === '}') bodyDepth--;
                    i++;
                }
                continue;
            }

            // propertyName: <arrow function>
            const arrowMatch = remaining.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*(async\s+)?\(([^)]*)\)\s*=>/);
            if (arrowMatch) {
                const propName = arrowMatch[1];
                if (!BASE_DESCRIPT_MEMBERS.has(propName)) {
                    const params = arrowMatch[3].trim();
                    const isAsync = !!arrowMatch[2];
                    const jsdoc = extractPrecedingJSDoc(src, i);
                    const paramTypes = parseJSDocParams(jsdoc);
                    const returnType = parseJSDocReturn(jsdoc);
                    const typedParams = buildTypedParams(params, paramTypes);
                    const retStr = returnType || (isAsync ? 'Promise<void>' : 'void');
                    members.push({
                        name: propName,
                        signature: `${propName}(${typedParams}): ${retStr}`,
                    });
                }
                // Skip past the arrow; the body may be a block or expression,
                // advance past the match and let normal scanning continue
                i += arrowMatch[0].length;
                continue;
            }
        }

        i++;
    }

    return { members, hasExports: true };
}

/**
 * Skip past a string literal (single, double, or template) starting at position i.
 * @param {string} src
 * @param {number} i Position of the opening quote
 * @returns {number} Position after the closing quote
 */
function skipString(src, i) {
    const quote = src[i];
    i++;
    while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === quote) { i++; break; }
        // Template literal can have ${...} but we just skip naively
        i++;
    }
    return i;
}

/**
 * Extracts the JSDoc comment immediately preceding position `pos` in the source.
 * @param {string} src
 * @param {number} pos
 * @returns {string} The JSDoc text (between the markers), or empty string
 */
function extractPrecedingJSDoc(src, pos) {
    // Walk backwards from pos, skipping whitespace, looking for a */ ending
    let j = pos - 1;
    while (j >= 0 && /\s/.test(src[j])) j--;
    if (j < 1 || src[j] !== '/' || src[j - 1] !== '*') return '';
    // Found */, now find the matching /**
    const closeIdx = j + 1;
    const openIdx = src.lastIndexOf('/**', j);
    if (openIdx === -1) return '';
    return src.slice(openIdx, closeIdx);
}

/**
 * Parses @param tags from a JSDoc comment.
 * @param {string} jsdoc
 * @returns {Record<string, string>} Map from param name → type string
 */
function parseJSDocParams(jsdoc) {
    /** @type {Record<string, string>} */
    const params = {};
    const regex = /@param\s+\{([^}]+)\}\s+(\w+)/g;
    let m;
    while ((m = regex.exec(jsdoc)) !== null) {
        params[m[2]] = m[1].trim();
    }
    return params;
}

/**
 * Parses @returns / @return tag from a JSDoc comment.
 * @param {string} jsdoc
 * @returns {string|null}
 */
function parseJSDocReturn(jsdoc) {
    const m = jsdoc.match(/@returns?\s+\{([^}]+)\}/);
    return m ? m[1].trim() : null;
}

/**
 * Builds a typed parameter list string from the raw param names and a
 * JSDoc-extracted type map. Untyped params default to `any`.
 * @param {string} rawParams  Comma-separated parameter names from the source
 * @param {Record<string, string>} typeMap
 * @returns {string}
 */
function buildTypedParams(rawParams, typeMap) {
    if (!rawParams) return '';
    return rawParams.split(',').map(p => {
        const name = p.trim();
        if (!name) return '';
        const type = typeMap[name] || 'any';
        return `${name}: ${type}`;
    }).filter(Boolean).join(', ');
}

/**
 * Generates the content for a `script-registry.d.ts` file that declares
 * `DEScriptRegistry` entries for all discovered scripts.
 *
 * Searches the same paths as the local resolver:
 * 1. `cwd()/namespace/id.js`
 * 2. `~/.dreamengine/scripts/namespace/id.js`
 * 3. `js/default-scripts/namespace/id.js`
 *
 * @returns {Promise<string>} The generated `.d.ts` file content
 */
export async function generateScriptRegistryContent() {
    // Collect scripts from all search paths (same priority as local-resolver)
    const cwdScriptsDir = process.cwd();
    const localDEScriptsDir = path.join(localDEPathAtHomeDir, 'scripts');

    // Use a Map keyed by "namespace/id" so that higher-priority paths win
    /** @type {Map<string, {namespace: string, id: string, filePath: string}>} */
    const scriptMap = new Map();

    // Lowest priority first — default-scripts
    const defaultScripts = await discoverScripts(defaultScriptsDir);
    for (const s of defaultScripts) scriptMap.set(`${s.namespace}/${s.id}`, s);

    // Then ~/.dreamengine/scripts
    const localDEScripts = await discoverScripts(localDEScriptsDir);
    for (const s of localDEScripts) scriptMap.set(`${s.namespace}/${s.id}`, s);

    // Highest priority — cwd scripts
    const cwdScripts = await discoverScripts(cwdScriptsDir);
    for (const s of cwdScripts) scriptMap.set(`${s.namespace}/${s.id}`, s);

    /** @type {string[]} */
    const entries = [];

    for (const [key, { filePath }] of scriptMap) {
        const src = await fsPromises.readFile(filePath, 'utf-8');
        const { members, hasExports } = extractExtraMembers(src);

        if (!hasExports) continue;

        if (members.length === 0) {
            entries.push(`    "${key}": DEScript;`);
        } else {
            const memberLines = members.map(m => `        ${m.signature};`).join('\n');
            entries.push(`    "${key}": DEScript & {\n${memberLines}\n    };`);
        }
    }

    const content = [
        '// Auto-generated by map-local-types.js — do not edit manually.',
        '// Regenerate with: node js/util/map-local-types.js',
        '//',
        '// This file extends DEScriptRegistry (declared in DE.d.ts) via declaration merging',
        '// so that importScript() calls return the correct types for known scripts.',
        '',
        'declare interface DEScriptRegistry {',
        entries.join('\n'),
        '}',
        '',
    ].join('\n');

    return content;
}

/**
 * Generates and writes the script registry `.d.ts` file to `js/types/script-registry.d.ts`.
 * @returns {Promise<string>} The path to the written file
 */
export async function saveScriptRegistry() {
    const content = await generateScriptRegistryContent();
    const outPath = path.join(typesDir, 'script-registry.d.ts');
    await fsPromises.writeFile(outPath, content, 'utf-8');
    return outPath;
}

// Allow running directly: node js/util/map-local-types.js
const isMain = process.argv[1] &&
    path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
    saveScriptRegistry().then(outPath => {
        console.log(`Script registry written to ${outPath}`);
    }).catch(err => {
        console.error('Failed to generate script registry:', err);
        process.exit(1);
    });
}
