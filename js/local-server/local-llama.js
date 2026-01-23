// change to websockets because streaming over http is a pain
import { WebSocket } from 'ws';
import os from 'os';

/**
 * @type {import('node-llama-cpp').LlamaModel}
 */
let MODEL = /** @type {any} */ (null);
let MODEL_PATH = ""

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

await loadModel(argv[0]);

const wss = new WebSocket.Server({ port: 8754, host: '0.0.0.0'});

wss.on('connection', (ws) => {
    console.log('Client connected');
    
    ws.on('message', async (message) => {
        try {
            // @ts-ignore
            const data = JSON.parse(message);
            
            // Handle different actions
            if (data.action === 'infer') {
                await generateCompletion(data, (text) => {
                    ws.send(JSON.stringify({ type: 'token', text }));
                }, () => {
                    ws.send(JSON.stringify({ type: 'done' }));
                }, (error) => {
                    ws.send(JSON.stringify({ type: 'error', message: error.message }));
                });

            } else if (data.action === 'analyze') {
                await generateCompletion(data, (text) => {
                    ws.send(JSON.stringify({ type: 'token', text }));
                }, () => {
                    ws.send(JSON.stringify({ type: 'done' }));
                }, (error) => {
                    ws.send(JSON.stringify({ type: 'error', message: error.message }));
                });
            } else if (data.action === 'count_tokens') {
                const text = data.text;
                const tokens = MODEL.tokenize(text);
                ws.send(JSON.stringify({ type: 'token_count', n_tokens: tokens.length }));
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
    });
});

/**
 * 
 * @param {{messages: Array<{role: string, content: string}>}} data 
 * @param {(text: string) => void} onToken 
 * @param {() => void} onDone 
 * @param {(error: Error) => void} onError 
 */
async function generateCompletion(data, onToken, onDone, onError) {
    const { LlamaCompletion, LlamaText } = await import('node-llama-cpp');
    const controller = new AbortController();

    let prompt = "";
    for (const msg of data.messages) {
        prompt += `<|start_header_id|>${msg.role}<|end_header_id|>\n\n${msg.content}<|eot_id>`;
    }
    prompt += "\n<|start_header_id|>assistant<|end_header_id|>\n\n";

    let context = null
    let completion = null;
    try {
        // Create context and completion for raw text
        context = await MODEL.createContext();
        completion = new LlamaCompletion({
            contextSequence: context.getSequence()
        });

        const basicConfig = {
            temperature: data.temperature || 0.9,
            topP: data.top_p || 0.95,
            repeatPenalty: {
                penalty: data.repeat_penalty || 1.1,
                frequencyPenalty: data.frequency_penalty || 0,
                presencePenalty: data.presence_penalty || 0,
            },
            customStopTriggers: data.stop || [],
            maxTokens: data.max_tokens || 512,
        }
        if (typeof data.max_paragraphs === "number") {
            console.log("Max paragraphs limit set to:", data.max_paragraphs);
        }
        if (typeof data.max_characters === "number") {
            console.log("Max characters limit set to:", data.max_characters);
        }
        console.log("Generation config:", basicConfig);
        await completion.generateCompletion(prompt, {
            ...basicConfig,
            signal: controller.signal,
            onToken(tokens) {
                if (isDisposed || stopFeedingTokens) return;
                // Stream token-by-token for better responsiveness
                const text = MODEL.detokenize(tokens);
                try {
                    // Always accumulate text if we need to track limits
                    if (typeof data.max_paragraphs === "number" || typeof data.max_characters === "number") {
                        accumulatedText += text;
                    }
                    
                    if (typeof data.max_paragraphs === "number") {
                        // For the non prototype this can be optimized better but for now it's fine
                        // count paragraphs
                        let paragraphCount = 0;
                            
                        for (let i = 0; i < accumulatedText.length; i++) {
                            if (accumulatedText[i] === '\n' && accumulatedText[i+1] === '\n') {
                                paragraphCount += 1;
                            }
                            //console.log("Current paragraph count:", paragraphCount);

                            // this should hit exactly at paragraph end
                            if (paragraphCount >= data.max_paragraphs) {
                                //console.log("Max paragraphs reached:", paragraphCount, "stopping completion early.");
                                // I think newlines are whole tokens, but just in case the text contains some text too
                                const potentialPartBeforeNew = text.split("\n")[0]
                                if (potentialPartBeforeNew.length > 0) {
                                    onToken(potentialPartBeforeNew);
                                }
                                stopFeedingTokens = true;
                                console.log("Aborting completion due to max paragraphs limit.");
                                weAbortedOurselves = true;
                                controller.abort();
                            }
                        }
                    }
                    if (typeof data.max_characters === "number" && !isDisposed && !weAbortedOurselves) {
                        const characterCount = accumulatedText.length;

                        //console.log("Current character count:", characterCount);

                        if (characterCount >= data.max_characters) {
                            //console.log("Trying to abort but no paragraph end found yet.");
                            // let's find if our text is finally finishing a paragraph
                            if (text.indexOf('\n') !== -1) {
                                //console.log("Max characters reached:", characterCount, "stopping completion at this paragraph end.");
                                const potentialPartBeforeNew = text.split("\n")[0]
                                if (potentialPartBeforeNew.length > 0) {
                                    onToken(potentialPartBeforeNew);
                                }
                                stopFeedingTokens = true;
                                console.log("Aborting completion due to max characters limit.");
                                weAbortedOurselves = true;
                                controller.abort();
                            }
                        }
                    }
                    if (!isDisposed && !stopFeedingTokens && !weAbortedOurselves) {
                        onToken(text);
                    }
                } catch (e) {
                    console.log("Error in onToken callback:", e.message);
                    throw e;
                }
            }
        });
        if (!isDisposed) {
            try {
                isDisposed = true;
                await completion.dispose();
            } catch {
            }
        }
        if (!isContextDisposed) {
            try {
                isContextDisposed = true;
                await context.dispose();
            } catch {
            }
        }
        onDone();
    } catch (e) {
        if (!isDisposed) {
            try {
                isDisposed = true;
                await completion.dispose();
            } catch {
            }
        }
        if (!isContextDisposed) {
            try {
                isContextDisposed = true;
                await context.dispose();
            } catch {
            }
        }

        if (weAbortedOurselves) {
           onDone();
        } else {
           console.log(e.message);
           onError(e);
        }
    }
}