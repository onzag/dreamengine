import { DEngine } from '../engine/index.js';
import { InferenceAdapterLlamaUncensored } from "../engine/inference/adapter-de-server-uncensored.js";
import { DEJSEngine } from '../jsengine/index.js';
import { localResolver } from '../jsengine/local-resolver.js';
import { generateBase } from '../cardtype/generate-base.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { basename, dirname, join, extname } from 'path';

if (typeof process !== "undefined" && process.versions && process.versions.node) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const localDEPathAtHomeDir = join(process.env.HOME || process.env.USERPROFILE || '.', '.dreamengine');
const defaultConfigPath = join(localDEPathAtHomeDir, 'de-server-config.json');

const args = process.argv.slice(2);

let configPath = null;
let inputPath = null;

let action = 'generate';
let secondFile = null;
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && i + 1 < args.length) {
        configPath = args[++i];
    } else if (args[i] === '--infer-bonds') {
        action = 'infer-bonds';
    } else if (args[i] === '--infer-states' && i + 1 < args.length) {
        action = 'infer-states';
        secondFile = args[++i];
    } else if (!inputPath) {
        inputPath = args[i];
    }
}

if (!configPath && existsSync(defaultConfigPath)) {
    configPath = defaultConfigPath;
}

if (!inputPath) {
    console.error('Usage: node cardtype-generator-llama-adapter.js [--config <config.json>] [--infer-bonds] [--infer-states <statefile.md>] <inputfile.md | inputfile.js>');
    process.exit(1);
}

const config = configPath ? JSON.parse(readFileSync(configPath, 'utf-8')) : {};
const sourceContent = readFileSync(inputPath, 'utf-8');

const engine = new DEngine();
new DEJSEngine(engine, localResolver);
new InferenceAdapterLlamaUncensored(engine, {
    host: config.host || "wss://localhost:8765",
    secret: config.secret || "dev-secret-12345678900abcdef",
});

const result = await generateBase(engine, sourceContent);

const dir = dirname(inputPath);
const base = basename(inputPath, extname(inputPath));

/**
 * 
 * @param {string} dir 
 * @param {string} base 
 * @returns {string}
 */
function findAvailablePath(dir, base) {
    const candidate = join(dir, base + '.js');
    if (!existsSync(candidate)) return candidate;
    let n = 2;
    while (existsSync(join(dir, base + '_' + n + '.js'))) {
        n++;
    }
    return join(dir, base + '_' + n + '.js');
}

const outputPath = findAvailablePath(dir, base);
writeFileSync(outputPath, result, 'utf-8');
console.log('Written to ' + outputPath);