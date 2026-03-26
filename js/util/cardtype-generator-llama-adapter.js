import { DEngine } from '../engine/index.js';
import { InferenceAdapterLlamaUncensored } from "../engine/inference/adapter-de-server-uncensored.js";
import { DEJSEngine } from '../jsengine/index.js';
import { localResolver } from '../jsengine/local-resolver.js';
import { generateBase } from '../cardtype/generate-base.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { basename, dirname, join, extname, resolve } from 'path';
import { generateBonds } from '../cardtype/generate-bonds.js';
import { generateActivities } from '../cardtype/generate-activities.js';
import { generateBondTriggers } from '../cardtype/generate-bond-triggers.js';

if (typeof process !== "undefined" && process.versions && process.versions.node) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const initCwd = process.env.INIT_CWD || process.cwd();
const localDEPathAtHomeDir = join(process.env.HOME || process.env.USERPROFILE || '.', '.dreamengine');
const defaultConfigPath = join(localDEPathAtHomeDir, 'de-server-config.json');

const args = process.argv.slice(2);

let configPath = null;
let inputPath = null;

const recognizedFlags = ['--config', '--infer-bonds', '--infer-bond-triggers', '--infer-state-from', "--add-activities", '--help', '-h'];
const actionFlags = ['--infer-bonds', '--infer-bond-triggers', '--infer-state-from', '--add-activities'];
const secondFileFlags = ['--infer-state-from'];

function printUsageAndExit() {
    console.log('Usage: node cardtype-generator-llama-adapter.js [--config <config.json>] [OPTION] <reference.md> <inputfile.md | inputfile.js>');

    console.log("Available options:");
    for (const flag of actionFlags) {
        console.log(`  ${flag}${secondFileFlags.includes(flag) ? ' <secondfile>' : ''}`);
    }
}

let action = 'generate';
let secondFile = null;
let isNextSecondFile = false;
for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (recognizedFlags.includes(arg)) {

        if (arg === '--help' || arg === '-h') {
            printUsageAndExit();
            process.exit(0);
        } else if (arg === '--config') {
            if (i + 1 >= args.length) {
                console.error('Error: --config flag requires a path argument.');
                printUsageAndExit();
                process.exit(1);
            }
            configPath = args[i + 1];
            i++; // skip next argument since it's the config path
        }

        if (actionFlags.includes(arg)) {
            action = arg.substring(2);
            isNextSecondFile = secondFileFlags.includes(arg);
        } else {
            console.error(`Error: Unrecognized flag ${arg}`);
            printUsageAndExit();
            process.exit(1);
        }
    } else {
        if (isNextSecondFile) {
            secondFile = arg;
            isNextSecondFile = false;
        } else if (!inputPath) {
            inputPath = arg;
        } else {
            console.error(`Error: Multiple input files provided. Only one input file is allowed.`);
            printUsageAndExit();
            process.exit(1);
        }
    }
}

if (!inputPath) {
    console.error('Error: No input file provided.');
    printUsageAndExit();
    process.exit(1);
}

if (!configPath && existsSync(defaultConfigPath)) {
    configPath = defaultConfigPath;
}

if (!inputPath) {
    console.error('Usage: node cardtype-generator-llama-adapter.js [--config <config.json>] [--infer-bonds] [--infer-states <statefile.md>] <inputfile.md | inputfile.js>');
    process.exit(1);
}

if (inputPath.endsWith(".js") && action === 'generate') {
    console.error('Input file cannot be a .js file when generating a card, please provide a .md file with the card definition.');
    process.exit(1);
} else if (inputPath.endsWith(".md") && action !== 'generate') {
    console.error('Input file must be a .js file when inferring bonds or states, please provide a .js file with the character definition.');
    process.exit(1);
}

inputPath = resolve(initCwd, inputPath);
if (configPath) configPath = resolve(initCwd, configPath);
if (secondFile) secondFile = resolve(initCwd, secondFile);

const config = configPath ? JSON.parse(readFileSync(configPath, 'utf-8')) : {};
const sourceContent = readFileSync(inputPath, 'utf-8');

const engine = new DEngine();
new DEJSEngine(engine, localResolver);
new InferenceAdapterLlamaUncensored(engine, {
    host: config.host || "wss://localhost:8765",
    secret: config.secret || "dev-secret-12345678900abcdef",
});

let result = "";
if (action === "generate") {
    result = await generateBase(engine, sourceContent);
} else if (action === "infer-bonds") {
    result = await generateBonds(engine, sourceContent);
} else if (action === "add-activities") {
    result = await generateActivities(engine, sourceContent);
} else if (action === "infer-bond-triggers") {
    result = await generateBondTriggers(engine, sourceContent);
}

const dir = dirname(inputPath);
const base = basename(inputPath, extname(inputPath));

/**
 * 
 * @param {string} dir 
 * @param {string} base 
 * @returns {string}
 */
function findAvailablePath(dir, base) {
    const alreadyEndsInNumber = base.match(/_(\d+)$/);
    let baseWithoutNumber = base;
    /**
     * @type {number | null}
     */
    let baseNumber = null;
    if (alreadyEndsInNumber) {
        baseNumber = parseInt(alreadyEndsInNumber[1], 10);
        baseWithoutNumber = base.substring(0, base.length - alreadyEndsInNumber[0].length);
    }
    const candidate = join(dir, baseWithoutNumber + '.js');
    if (!existsSync(candidate)) return candidate;
    let n = baseNumber !== null ? baseNumber + 1 : 2;
    while (existsSync(join(dir, baseWithoutNumber + '_' + n + '.js'))) {
        n++;
    }
    return join(dir, baseWithoutNumber + '_' + n + '.js');
}

const outputPath = findAvailablePath(dir, base);
writeFileSync(outputPath, result, 'utf-8');
console.log('Written to ' + outputPath);