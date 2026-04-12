import { DEngine } from '../engine/index.js';
import { InferenceAdapterLlamaUncensored } from "../engine/inference/adapter-de-server-uncensored.js";
import { DEJSEngine } from '../jsengine/index.js';
import { localResolver } from '../jsengine/local-resolver.js';
import { generateBase } from './generate-base.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { basename, dirname, join, extname, resolve } from 'path';
import { createInterface } from 'readline';
import { generateBonds } from './generate-bonds.js';
import { generateActivities } from './generate-activities.js';
import { generateBondTriggers } from './generate-bond-triggers.js';
import { generateBasicStates } from './generate-basic-states.js';
import { createCardStructureFrom, getJsCard } from './base.js';

if (typeof process !== "undefined" && process.versions && process.versions.node) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const initCwd = process.env.INIT_CWD || process.cwd();
const localDEPathAtHomeDir = join(process.env.HOME || process.env.USERPROFILE || '.', '.dreamengine');
const defaultConfigPath = join(localDEPathAtHomeDir, 'config.json');

const args = process.argv.slice(2);

let configPath = null;
let inputPath = null;

const recognizedFlags = ['--config', '--help', '-h', '--guided', '--generate'];
const actionFlags = ['--add-state-from', '--generate'];
const secondFileFlags = ['--add-state-from'];

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
let guided = false;
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

        if (arg === '--guided') {
            guided = true;
        } else if (actionFlags.includes(arg)) {
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
    printUsageAndExit();
    process.exit(1);
}

if (inputPath.endsWith(".js") && action === 'generate') {
    console.error('Input file cannot be a .js file when generating a card, please provide a .md file with the card definition.');
    process.exit(1);
} else if (inputPath.endsWith(".md") && action !== 'generate') {
    console.error('Input file must be a .js file when running other actions, please provide a .js file');
    process.exit(1);
}

inputPath = resolve(initCwd, inputPath);
if (configPath) configPath = resolve(initCwd, configPath);
if (secondFile) secondFile = resolve(initCwd, secondFile);

const config = configPath ? JSON.parse(readFileSync(configPath, 'utf-8')) : {};
const sourceContent = readFileSync(inputPath, 'utf-8');

const engine = new DEngine();
new InferenceAdapterLlamaUncensored(engine, {
    host: config.host || "wss://localhost:8765",
    secret: config.secret || "dev-secret-12345678900abcdef",
});

/**
 * @param {string} question
 * @returns {Promise<string>}
 */
function askLine(question) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(question + ' ', answer => { rl.close(); resolve(answer); }));
}

/** @type {import('./base.js').CardTypeGuider | null} */
const guider = guided ? {
    async askOption(question, options, defaultValue) {
        const optList = options.map((o, i) => `  ${i + 1}) ${o}`).join('\n');
        const def = defaultValue !== undefined ? ` [${defaultValue}]` : '';
        const answer = await askLine(`${question}\n${optList}\nChoose${def}:`);
        if (!answer && defaultValue !== undefined) return { value: defaultValue };
        const idx = parseInt(answer, 10);
        if (idx >= 1 && idx <= options.length) return { value: options[idx - 1] };
        return { value: options.includes(answer) ? answer : (defaultValue ?? options[0]) };
    },
    async askOpen(question, defaultValue) {
        const def = defaultValue !== undefined ? ` [${defaultValue}]` : '';
        const answer = await askLine(`${question}${def}:`);
        return { value: answer || defaultValue || '' };
    },
    async askAccept(question, defaultValue) {
        // TODO no true support here with cmdline
        const def = defaultValue !== undefined ? ` [${defaultValue}]` : '';
        const answer = await askLine(`${question}${def}:`);
        return { value: answer || defaultValue || '' };
    },
    async askNumber(question, defaultValue) {
        const def = defaultValue !== undefined ? ` [${defaultValue}]` : '';
        const answer = await askLine(`${question}${def}:`);
        const num = parseFloat(answer);
        return { value: isNaN(num) ? (defaultValue ?? 0) : num };
    },
    async askBoolean(question, defaultValue) {
        const def = defaultValue !== undefined ? ` [${defaultValue ? 'Y/n' : 'y/N'}]` : ' [y/n]';
        const answer = await askLine(`${question}${def}:`);
        if (!answer && defaultValue !== undefined) return { value: defaultValue };
        return { value: answer.toLowerCase().startsWith('y') };
    },
    async askList(question, defaultValue) {
        const def = defaultValue !== undefined ? ` [${defaultValue.join(', ')}]` : '';
        const answer = await askLine(`${question} (comma-separated)${def}:`);
        if (!answer && defaultValue !== undefined) return { value: defaultValue };
        return { value: answer.split(',').map(s => s.trim()).filter(Boolean) };
    },
} : null;

/**
 * @type {import('./base.js').CardTypeCard}
 */
let currentCard;
let currentCardSourcePath = "";

const autosave = {
    async save() {
        if (!currentCard) return;
        const jsContent = getJsCard(currentCard);
        console.log(`Autosaving card to ${currentCardSourcePath}...`);
        writeFileSync(currentCardSourcePath, jsContent, 'utf-8');
    }
}

if (action === "generate") {
    const mdFileContents = sourceContent;
    const potentialJsFile = inputPath.replace(/\.md$/, '.js');
    currentCardSourcePath = potentialJsFile;

    if (!existsSync(potentialJsFile)) {
        currentCard = {
            card: mdFileContents,
            config: {},
            imports: [],
            head: [],
            body: [],
            foot: [],
        };
        await autosave.save();
    } else {
        const jsContent = readFileSync(potentialJsFile, 'utf-8');
        currentCard = createCardStructureFrom(jsContent);
    }

    await generateBase(engine, currentCard, guider, autosave);
    await generateBonds(engine, currentCard, guider, autosave);
    await generateActivities(engine, currentCard, guider, autosave);
    await generateBondTriggers(engine, currentCard, guider, autosave);
    await generateBasicStates(engine, currentCard, guider, autosave);
} else {
    // TODO: implement other actions like --add-state-from
}