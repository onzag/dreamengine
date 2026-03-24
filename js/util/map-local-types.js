import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import ts from 'typescript';

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
 * Collects all .d.ts files from a directory (non-recursive).
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function collectTypeFiles(dir) {
    /**
     * @type {string[]}
     */
    const files = [];
    if (!fs.existsSync(dir)) return files;
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.d.ts')) {
            files.push(path.join(dir, entry.name));
        }
    }
    return files;
}

const TYPE_FORMAT = ts.TypeFormatFlags.NoTruncation;
const TYPE_FORMAT_IN_ALIAS = TYPE_FORMAT | ts.TypeFormatFlags.InTypeAlias;

/**
 * Walks the AST looking for typedef and callback JSDoc tags,
 * extracts their types via the checker, and returns type alias declarations.
 * @param {ts.SourceFile} sourceFile
 * @param {ts.TypeChecker} checker
 * @returns {string[]}
 */
function extractTypedefs(sourceFile, checker) {
    /** @type {string[]} */
    const typedefs = [];
    /** @type {Set<string>} */
    const seen = new Set();

    /** @param {ts.Node} node */
    function visit(node) {
        // @ts-ignore — jsDoc property exists on statement nodes in JS files
        const jsDocs = node.jsDoc;
        if (jsDocs) {
            for (const doc of jsDocs) {
                if (!doc.tags) continue;
                for (const tag of doc.tags) {
                    if (!ts.isJSDocTypedefTag(tag) && !ts.isJSDocCallbackTag(tag)) continue;
                    const nameNode = tag.name;
                    if (!nameNode) continue;
                    // @ts-ignore
                    const name = nameNode.escapedText ?? nameNode.text;
                    if (!name || seen.has(name)) continue;
                    seen.add(name);

                    const symbol = checker.getSymbolAtLocation(nameNode);
                    if (!symbol) continue;

                    const type = checker.getDeclaredTypeOfSymbol(symbol);
                    const typeStr = checker.typeToString(type, sourceFile, TYPE_FORMAT_IN_ALIAS);
                    typedefs.push(`type ${name} = ${typeStr};`);
                }
            }
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return typedefs;
}

/**
 * Finds `engine.exports = { ... }` in the AST and extracts the extra
 * (non-DEScript-base) members using the type checker.
 * @param {ts.SourceFile} sourceFile
 * @param {ts.TypeChecker} checker
 * @returns {{ members: string[], hasExports: boolean }}
 */
function extractExportsMembers(sourceFile, checker) {
    /** @type {string[]} */
    const members = [];
    let hasExports = false;

    /** @param {ts.Node} node */
    function visit(node) {
        if (ts.isExpressionStatement(node) &&
            ts.isBinaryExpression(node.expression) &&
            node.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) {

            const left = node.expression.left;
            if (ts.isPropertyAccessExpression(left) &&
                ts.isIdentifier(left.expression) && left.expression.text === 'engine' &&
                ts.isIdentifier(left.name) && left.name.text === 'exports') {

                hasExports = true;
                const rhs = node.expression.right;
                const type = checker.getTypeAtLocation(rhs);

                for (const prop of type.getProperties()) {
                    if (BASE_DESCRIPT_MEMBERS.has(prop.name)) continue;

                    const propType = checker.getTypeOfSymbolAtLocation(prop, rhs);
                    const callSigs = propType.getCallSignatures();

                    if (callSigs.length > 0) {
                        for (const sig of callSigs) {
                            const sigStr = checker.signatureToString(sig, sourceFile, TYPE_FORMAT);
                            members.push(`${prop.name}${sigStr}`);
                        }
                    } else {
                        const typeStr = checker.typeToString(propType, sourceFile, TYPE_FORMAT);
                        members.push(`${prop.name}: ${typeStr}`);
                    }
                }
            }
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return { members, hasExports };
}

/**
 * Creates a TypeScript Program for the given script + type files and
 * extracts typedef declarations and engine.exports member types.
 * @param {Array<{namespace: string, id: string, filePath: string}>} scripts
 * @param {string[]} typeFiles
 * @returns {Map<string, {typedefs: string[], members: string[], hasExports: boolean}>}
 */
function analyzeScripts(scripts, typeFiles) {
    const program = ts.createProgram(
        [...scripts.map(s => s.filePath), ...typeFiles],
        {
            allowJs: true,
            checkJs: true,
            noEmit: true,
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Node10,
            strict: true,
        }
    );
    const checker = program.getTypeChecker();

    /** @type {Map<string, {typedefs: string[], members: string[], hasExports: boolean}>} */
    const results = new Map();

    for (const { namespace, id, filePath } of scripts) {
        const key = `${namespace}/${id}`;
        const sourceFile = program.getSourceFile(filePath);
        if (!sourceFile) continue;

        const typedefs = extractTypedefs(sourceFile, checker);
        const { members, hasExports } = extractExportsMembers(sourceFile, checker);
        results.set(key, { typedefs, members, hasExports });
    }

    return results;
}

/**
 * Generates the content for a `script-registry.d.ts` file that declares
 * `DEScriptRegistry` entries for all discovered scripts.
 *
 * @param {{ localOnly?: boolean }} [options]
 *   - `localOnly` (default `true`): only scan `js/default-scripts` in this repo.
 *   - `localOnly: false`: also scan `~/.dreamengine/scripts`
 *
 * @returns {Promise<string>} The generated `.d.ts` file content
 */
export async function generateScriptRegistryContent(options) {
    const localOnly = options?.localOnly ?? true;

    /** @type {Map<string, {namespace: string, id: string, filePath: string}>} */
    const scriptMap = new Map();

    const defaultScripts = await discoverScripts(defaultScriptsDir);
    for (const s of defaultScripts) scriptMap.set(`${s.namespace}/${s.id}`, s);

    if (!localOnly) {
        const localDEScriptsDir = path.join(localDEPathAtHomeDir, 'scripts');
        const localDEScripts = await discoverScripts(localDEScriptsDir);
        for (const s of localDEScripts) scriptMap.set(`${s.namespace}/${s.id}`, s);
    }

    const scripts = [...scriptMap.values()];
    const typeFiles = await collectTypeFiles(typesDir);

    const analysisResults = analyzeScripts(scripts, typeFiles);

    // Deduplicate typedefs by name across all scripts
    /** @type {Map<string, string>} name → declaration */
    const typedefMap = new Map();
    /** @type {string[]} */
    const entries = [];

    for (const [key] of scriptMap) {
        const result = analysisResults.get(key);
        if (!result || !result.hasExports) continue;

        for (const td of result.typedefs) {
            const match = td.match(/^type (\w+)/);
            if (match) typedefMap.set(match[1], td);
        }

        if (result.members.length === 0) {
            entries.push(`    "${key}": DEScript;`);
        } else {
            const memberLines = result.members.map(m => `        ${m};`).join('\n');
            entries.push(`    "${key}": DEScript & {\n${memberLines}\n    };`);
        }
    }

    const typedefBlock = typedefMap.size > 0
        ? [...typedefMap.values()].join('\n') + '\n'
        : '';

    const content = [
        '// Auto-generated by map-local-types.js — do not edit manually.',
        '// Regenerate with: node js/util/map-local-types.js',
        '//',
        '// This file extends DEScriptRegistry (declared in DE.d.ts) via declaration merging',
        '// so that importScript() calls return the correct types for known scripts.',
        '',
        typedefBlock,
        'declare interface DEScriptRegistry {',
        entries.join('\n'),
        '}',
        '',
    ].join('\n');

    return content;
}

/**
 * Generates and writes the script registry `.d.ts` file to `js/types/script-registry.d.ts`.
 * @param {{ localOnly?: boolean }} [options] Same as {@link generateScriptRegistryContent}
 * @returns {Promise<string>} The path to the written file
 */
export async function saveScriptRegistry(options) {
    const content = await generateScriptRegistryContent(options);
    const outPath = path.join(typesDir, 'script-registry.d.ts');
    await fsPromises.writeFile(outPath, content, 'utf-8');
    return outPath;
}

// Allow running directly:
//   node js/util/map-local-types.js          (default-scripts only)
//   node js/util/map-local-types.js --all    (all search paths)
const isMain = process.argv[1] &&
    path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
    const localOnly = !process.argv.includes('--all');
    saveScriptRegistry({ localOnly }).then(outPath => {
        console.log(`Script registry written to ${outPath}${localOnly ? ' (local only)' : ' (all paths)'}`);
    }).catch(err => {
        console.error('Failed to generate script registry:', err);
        process.exit(1);
    });
}
