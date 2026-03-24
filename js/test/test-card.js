import { DEngine } from '../engine/index.js';
import { InferenceAdapterLlamaUncensored } from "../engine/inference/adapter-de-server-uncensored.js";
import { DEJSEngine } from '../jsengine/index.js';
import { localResolver } from '../jsengine/local-resolver.js';
import { generate } from '../cardtype/generate.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { basename, dirname, join, extname } from 'path';

if (typeof process !== "undefined" && process.versions && process.versions.node) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const args = process.argv.slice(2);

const inputPath = args[0];

const sourceContent = readFileSync(inputPath, 'utf-8');

const engine = new DEngine();
new DEJSEngine(engine, localResolver);
new InferenceAdapterLlamaUncensored(engine, {
    host: "wss://localhost:8765",
    secret: "dev-secret-12345678900abcdef",
});

const result = await generate(engine, sourceContent);

const dir = dirname(inputPath);
const base = basename(inputPath, extname(inputPath));

writeFileSync(join(dir, base + ".js"), result, 'utf-8');
console.log('Written to ' + join(dir, base + ".js"));