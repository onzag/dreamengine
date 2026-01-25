// change to websockets because streaming over http is a pain
import { WebSocket } from 'ws';
import fs from 'fs';
const { LlamaCompletion, LlamaText, LlamaContextSequence } = await import('node-llama-cpp');

/**
 * @type {import('node-llama-cpp').LlamaModel}
 */
let MODEL = /** @type {any} */ (null);
let MODEL_PATH = ""

/**
 * @type {{
 *    modelPath: string;
 *    standard: {temperature: number; top_p: number; repeat_penalty: number; frequency_penalty: number; presence_penalty: number; maxTokens: number;},
 *    analyze: {temperature: number; top_p: number; repeat_penalty: number; frequency_penalty: number; presence_penalty: number; maxTokens: number;},
 * }}
 */
let CONFIG = /** @type {any} */ (null);
let CONFIG_PATH = "";

/**
 * @type {AbortController | null}
 */
let CONTROLLER = null;

/**
 * @param {string} configPath 
 */
async function loadConfig(configPath) {
    console.log("Loading config:", configPath);

    const configContent = await fs.promises.readFile(configPath, 'utf-8');
    CONFIG = JSON.parse(configContent);
    CONFIG_PATH = configPath;

    // check that everything lines up
    if (!CONFIG.standard || !CONFIG.analyze) {
        throw new Error("Invalid config file, missing standard or analyze sections");
    }
    if (typeof CONFIG.standard.maxTokens !== "number" || typeof CONFIG.analyze.maxTokens !== "number") {
        throw new Error("Invalid config file, maxTokens must be numbers");
    }
    if (typeof CONFIG.standard.temperature !== "number" || typeof CONFIG.analyze.temperature !== "number") {
        throw new Error("Invalid config file, temperature must be numbers");
    }
    if (typeof CONFIG.standard.top_p !== "number" || typeof CONFIG.analyze.top_p !== "number") {
        throw new Error("Invalid config file, top_p must be numbers");
    }
    if (typeof CONFIG.standard.repeat_penalty !== "number" || typeof CONFIG.analyze.repeat_penalty !== "number") {
        throw new Error("Invalid config file, repeat_penalty must be numbers");
    }
    if (typeof CONFIG.standard.frequency_penalty !== "number" || typeof CONFIG.analyze.frequency_penalty !== "number") {
        throw new Error("Invalid config file, frequency_penalty must be numbers");
    }
    if (typeof CONFIG.standard.presence_penalty !== "number" || typeof CONFIG.analyze.presence_penalty !== "number") {
        throw new Error("Invalid config file, presence_penalty must be numbers");
    }
    console.log("Config loaded successfully");

    if (MODEL_PATH !== CONFIG.modelPath) {
        await loadModel(CONFIG.modelPath);
    }
}

/**
 * @param {string} model 
 * @returns 
 */
async function loadModel(model) {
    console.log("Loading model:", model);
    if (MODEL_PATH === model && MODEL !== null) {
        console.log('Model already loaded');
        return;
    }

    if (MODEL !== null) {
        console.log('Unloading previous model');
        await MODEL.dispose();
        MODEL = /** @type {any} */ (null);
        MODEL_PATH = "";
    }

    const { getLlama } = await import('node-llama-cpp');
    const llama = await getLlama();

    console.log('GPU Support:', llama.gpu || 'Unknown');

    const LLAMA_MODEL = await llama.loadModel({
        modelPath: model,
        gpuLayers: "auto",
        defaultContextFlashAttention: true,
    });
    MODEL = LLAMA_MODEL
    MODEL_PATH = model;

    // Create a simple HTTP server that takes a prompt and returns a response
    console.log('Model loaded successfully');
}

const argv = process.argv.slice(2);
if (argv.length < 1) {
    console.error("Please provide a model path as the first argument.");
    process.exit(1);
}

await loadConfig(argv[0]);

const wss = new WebSocket.Server({ port: 8754, host: '0.0.0.0' });

wss.on('connection', (ws) => {
    console.log('Client connected');

    ws.send(JSON.stringify({ type: 'ready', message: 'Model is ready' }));

    ws.on('message', async (message) => {
        try {
            // @ts-ignore
            const data = JSON.parse(message);

            // Handle different actions
            if (data.action === 'infer') {
                if (!data.payload) {
                    throw new Error("Invalid payload for infer");
                }
                await generateCompletion(data.payload, (text) => {
                    ws.send(JSON.stringify({ type: 'token', text }));
                }, () => {
                    ws.send(JSON.stringify({ type: 'done' }));
                }, (error) => {
                    ws.send(JSON.stringify({ type: 'error', message: error.message }));
                });
            } else if (data.action === 'analyze-prepare') {
                if (!data.payload) {
                    throw new Error("Invalid payload for analyze-prepare");
                }
                await prepareAnalysis(data.payload, () => {
                    ws.send(JSON.stringify({ type: 'analyze-ready' }));
                }, (error) => {
                    ws.send(JSON.stringify({ type: 'error', message: error.message }));
                });
            } else if (data.action === 'analyze-question') {
                if (!data.payload) {
                    throw new Error("Invalid payload for analyze-question");
                }
                await runQuestion(data.payload, (text) => {
                    ws.send(JSON.stringify({ type: 'answer', text }));
                }, (error) => {
                    ws.send(JSON.stringify({ type: 'error', message: error.message }));
                });
            } else if (data.action === 'count-tokens') {
                if (!data.payload || typeof data.payload.text !== "string") {
                    throw new Error("Invalid payload for count-tokens");
                }
                const text = data.payload.text;
                const tokens = MODEL.tokenize(text);
                ws.send(JSON.stringify({ type: 'count', n_tokens: tokens.length }));
            }
        } catch (e) {
            // @ts-ignore
            console.log(e.message);
            // @ts-ignore
            ws.send(JSON.stringify({ type: 'error', message: e.message }));
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        if (CONTROLLER) {
            CONTROLLER.abort();
        }
    });
});

/**
 * @type {import('node-llama-cpp').Token[] | null}
 */
//let ANALYSIS_TOKENS = null;
/**
 * @type {string | null}
 */
let ANALYSIS_TEXT = null;

/**
 * 
 * @param {{system: string, userTrail: string}} data 
 * @param {() => void} onDone 
 * @param {(error: Error) => void} onError 
 */
async function prepareAnalysis(data, onDone, onError) {
    if (!MODEL) {
        throw new Error("Model not loaded");
    }
    if (!CONFIG) {
        throw new Error("Config not loaded");
    }
    if (!data.system || typeof data.system !== "string") {
        throw new Error("Invalid system format");
    }
    if (!data.userTrail || typeof data.userTrail !== "string") {
        throw new Error("Invalid userTrail format");
    }
    try {
        //const context = await MODEL.createContext();
        //const contextSequence = context.getSequence();
        //contextSequence.eraseContextTokenRanges

        // TODO optimize this, for now just retokenize every time
        ANALYSIS_TEXT = `<|start_header_id|>system<|end_header_id|>\n\n${data.system}<|eot_id><|start_header_id|>user<|end_header_id|>\n\n${data.userTrail}`;
        onDone();
    } catch (e) {
        // @ts-ignore
        onError(e);
    }
}

/**
 * 
 * @param {{
 * question: string;
 * stopAt: Array<string>;
 * maxParagraphs: number;
 * maxCharacters: number;
 * trail: string | null;
 * }} data
 * @param {(v: string) => void} onAnswer 
 * @param {(err: Error) => void} onError 
 */
async function runQuestion(data, onAnswer, onError) {
    if (CONTROLLER) {
        throw new Error("Another generation is already in progress");
    }
    if (!MODEL) {
        throw new Error("Model not loaded");
    }
    if (!CONFIG) {
        throw new Error("Config not loaded");
    }
    if (!ANALYSIS_TEXT) {
        throw new Error("Analysis not prepared");
    }
    CONTROLLER = new AbortController();

    if (!data.question || typeof data.question !== "string") {
        throw new Error("Invalid question format");
    }

    if (!Array.isArray(data.stopAt)) {
        throw new Error("Invalid stopAt format");
    }

    if (typeof data.maxParagraphs !== "number" || isNaN(data.maxParagraphs) || data.maxParagraphs < 0) {
        throw new Error("Invalid maxParagraphs format");
    }

    if (typeof data.maxCharacters !== "number" || isNaN(data.maxCharacters) || data.maxCharacters < 0) {
        throw new Error("Invalid maxCharacters format");
    }

    if (data.trail !== null && typeof data.trail !== "string") {
        throw new Error("Invalid trail format");
    }

    const prompt = ANALYSIS_TEXT + "\n" + data.question + `\n<|start_header_id|>assistant<|end_header_id|>\n\n` + (data.trail || "");
    let context = null
    let completion = null;
    let answer = "";
    try {
        // Create context and completion for raw text
        context = await MODEL.createContext();
        completion = new LlamaCompletion({
            contextSequence: context.getSequence()
        });

        const basicConfig = {
            temperature: CONFIG.standard.temperature || 0.9,
            topP: CONFIG.standard.top_p || 0.95,
            repeatPenalty: {
                penalty: CONFIG.standard.repeat_penalty || 1.1,
                frequencyPenalty: CONFIG.standard.frequency_penalty || 0,
                presencePenalty: CONFIG.standard.presence_penalty || 0,
            },
            customStopTriggers: ["<|eot_id|>", "<|start_header_id|>"].concat(data.stopAt || []),
            maxTokens: CONFIG.standard.maxTokens || 512,
        }
        if (typeof data.maxParagraphs === "number") {
            console.log("Max paragraphs limit set to:", data.maxParagraphs);
        }
        if (typeof data.maxCharacters === "number") {
            console.log("Max characters limit set to:", data.maxCharacters);
        }

        let accumulatedText = "";

        console.log("Generation config:", basicConfig);
        await completion.generateCompletion(prompt, {
            ...basicConfig,
            signal: CONTROLLER.signal,
            stopOnAbortSignal: true,
            onTextChunk(text) {
                try {
                    accumulatedText += text;

                    if (data.maxParagraphs !== 0) {
                        // For the non prototype this can be optimized better but for now it's fine
                        // count paragraphs
                        let paragraphCount = 0;

                        for (let i = 0; i < accumulatedText.length; i++) {
                            if (accumulatedText[i] === '\n' && accumulatedText[i + 1] === '\n') {
                                paragraphCount += 1;
                            }
                            //console.log("Current paragraph count:", paragraphCount);

                            // this should hit exactly at paragraph end
                            if (paragraphCount >= data.maxParagraphs) {
                                //console.log("Max paragraphs reached:", paragraphCount, "stopping completion early.");
                                // I think newlines are whole tokens, but just in case the text contains some text too
                                const potentialPartBeforeNew = text.split("\n")[0]
                                if (potentialPartBeforeNew.length > 0) {
                                    answer += potentialPartBeforeNew;
                                }
                                console.log("Aborting completion due to max paragraphs limit.");
                                CONTROLLER?.abort();
                                CONTROLLER = null;
                                onAnswer(answer);
                                return;
                            }
                        }
                    }
                    if (typeof data.maxCharacters === "number") {
                        const characterCount = accumulatedText.length;

                        //console.log("Current character count:", characterCount);

                        if (characterCount >= data.maxCharacters) {
                            //console.log("Trying to abort but no paragraph end found yet.");
                            // let's find if our text is finally finishing a paragraph
                            if (text.indexOf('\n') !== -1) {
                                //console.log("Max characters reached:", characterCount, "stopping completion at this paragraph end.");
                                const potentialPartBeforeNew = text.split("\n")[0]
                                if (potentialPartBeforeNew.length > 0) {
                                    answer += potentialPartBeforeNew;
                                }
                                console.log("Aborting completion due to max characters limit.");
                                CONTROLLER?.abort();
                                CONTROLLER = null;
                                onAnswer(answer);
                                return;
                            }
                        }
                    }

                    answer += text;
                } catch (e) {
                    // @ts-ignore
                    console.log("Error in onToken callback:", e.message);
                    throw e;
                }
            }
        });
    } catch (e) {
        // @ts-ignore
        console.log(e.message);
        // @ts-ignore
        onError(e);
    }
    onAnswer(answer);
    CONTROLLER = null;
}


/**
 * 
 * @param {{messages: Array<{role: string, content: string}>, extraStops: Array<string>, maxParagraphs: number, maxCharacters: number, startCountingFromToken: string | null, trail: string | null}} data 
 * @param {(text: string) => void} onToken 
 * @param {() => void} onDone 
 * @param {(error: Error) => void} onError 
 */
async function generateCompletion(data, onToken, onDone, onError) {
    if (CONTROLLER) {
        throw new Error("Another generation is already in progress");
    }
    CONTROLLER = new AbortController();

    if (!MODEL) {
        throw new Error("Model not loaded");
    }

    if (!CONFIG) {
        throw new Error("Config not loaded");
    }

    if (!Array.isArray(data.messages)) {
        throw new Error("Invalid messages format");
    }

    if (!Array.isArray(data.extraStops)) {
        throw new Error("Invalid extraStops format");
    } else if (data.extraStops.some(s => typeof s !== "string")) {
        throw new Error("Invalid extraStops format, all stops must be strings");
    }

    if (typeof data.maxParagraphs !== "number" || isNaN(data.maxParagraphs) || data.maxParagraphs < 0) {
        throw new Error("Invalid maxParagraphs format");
    }

    if (typeof data.maxCharacters !== "number" || isNaN(data.maxCharacters) || data.maxCharacters < 0) {
        throw new Error("Invalid maxCharacters format");
    }

    if (data.startCountingFromToken !== null && typeof data.startCountingFromToken !== "string") {
        throw new Error("Invalid startCountingFromToken format");
    }

    if (data.trail !== null && typeof data.trail !== "string") {
        throw new Error("Invalid trail format");
    }

    let prompt = "";
    for (const msg of data.messages) {
        if (typeof msg.content !== "string") {
            throw new Error("Invalid message content");
        } else if (typeof msg.role !== "string") {
            throw new Error("Invalid message role");
        } else if (!["user", "assistant", "system"].includes(msg.role)) {
            throw new Error("Invalid message role: " + msg.role);
        }
        prompt += `<|start_header_id|>${msg.role}<|end_header_id|>\n\n${msg.content}<|eot_id>`;
    }
    prompt += "\n<|start_header_id|>assistant<|end_header_id|>\n\n";

    if (data.trail) {
        prompt += data.trail;
    }

    let context = null
    let completion = null;
    try {
        // Create context and completion for raw text
        context = await MODEL.createContext();
        completion = new LlamaCompletion({
            contextSequence: context.getSequence()
        });

        const basicConfig = {
            temperature: CONFIG.standard.temperature || 0.9,
            topP: CONFIG.standard.top_p || 0.95,
            repeatPenalty: {
                penalty: CONFIG.standard.repeat_penalty || 1.1,
                frequencyPenalty: CONFIG.standard.frequency_penalty || 0,
                presencePenalty: CONFIG.standard.presence_penalty || 0,
            },
            customStopTriggers: ["<|eot_id|>", "<|start_header_id|>"].concat(data.extraStops || []),
            maxTokens: CONFIG.standard.maxTokens || 512,
        }
        if (typeof data.maxParagraphs === "number") {
            console.log("Max paragraphs limit set to:", data.maxParagraphs);
        }
        if (typeof data.maxCharacters === "number") {
            console.log("Max characters limit set to:", data.maxCharacters);
        }

        let hasBegunCounting = data.startCountingFromToken === null ? true : false;
        let accumulatedText = "";
        let accumulatedTextForCounting = "";

        console.log("Generation config:", basicConfig);
        await completion.generateCompletion(prompt, {
            ...basicConfig,
            signal: CONTROLLER.signal,
            stopOnAbortSignal: true,
            onTextChunk(text) {
                try {
                    accumulatedText += text;
                    if (!hasBegunCounting && data.startCountingFromToken && accumulatedText.includes(data.startCountingFromToken)) {
                        hasBegunCounting = true;
                    }
                    // Always accumulate text if we need to track limits
                    if (hasBegunCounting) {
                        accumulatedTextForCounting += text;
                    }

                    if (data.maxParagraphs !== 0) {
                        // For the non prototype this can be optimized better but for now it's fine
                        // count paragraphs
                        let paragraphCount = 0;

                        for (let i = 0; i < accumulatedTextForCounting.length; i++) {
                            if (accumulatedTextForCounting[i] === '\n' && accumulatedTextForCounting[i + 1] === '\n') {
                                paragraphCount += 1;
                            }
                            //console.log("Current paragraph count:", paragraphCount);

                            // this should hit exactly at paragraph end
                            if (paragraphCount >= data.maxParagraphs) {
                                //console.log("Max paragraphs reached:", paragraphCount, "stopping completion early.");
                                // I think newlines are whole tokens, but just in case the text contains some text too
                                const potentialPartBeforeNew = text.split("\n")[0]
                                if (potentialPartBeforeNew.length > 0) {
                                    onToken(potentialPartBeforeNew);
                                }
                                console.log("Aborting completion due to max paragraphs limit.");
                                CONTROLLER?.abort();
                                CONTROLLER = null;
                                return;
                            }
                        }
                    }
                    if (typeof data.maxCharacters === "number") {
                        const characterCount = accumulatedText.length;

                        //console.log("Current character count:", characterCount);

                        if (characterCount >= data.maxCharacters) {
                            //console.log("Trying to abort but no paragraph end found yet.");
                            // let's find if our text is finally finishing a paragraph
                            if (text.indexOf('\n') !== -1) {
                                //console.log("Max characters reached:", characterCount, "stopping completion at this paragraph end.");
                                const potentialPartBeforeNew = text.split("\n")[0]
                                if (potentialPartBeforeNew.length > 0) {
                                    onToken(potentialPartBeforeNew);
                                }
                                console.log("Aborting completion due to max characters limit.");
                                CONTROLLER?.abort();
                                CONTROLLER = null;
                                return;
                            }
                        }
                    }

                    onToken(text);
                } catch (e) {
                    // @ts-ignore
                    console.log("Error in onToken callback:", e.message);
                    throw e;
                }
            }
        });
    } catch (e) {
        // @ts-ignore
        console.log(e.message);
        // @ts-ignore
        onError(e);
    }
    CONTROLLER = null;
}