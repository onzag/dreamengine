/**
 * Adapter for vLLM servers exposing an OpenAI-compatible API, configured for
 * uncensored content generation.
 */

import { DEngine } from '../index.js';
import { InferenceServerOpenAICompatible } from './adapter-openai-compatible.js';

export class InferenceAdapterVLLandLlamaMUncensored extends InferenceServerOpenAICompatible {
    /**
     * @param {DEngine} parent
     * @param {{
     *   host?: string;
     *   embeddingHost?: string;
     *   apiKey?: string;
     *   embeddingApiKey?: string;
     *   temperature?: number;
     *   topP?: number;
     *   topK?: number;
     *   repetitionPenalty?: number;
     *   analysisTemperature?: number;
     *   analysisTopP?: number;
     *   analysisTopK?: number;
     *   analysisRepetitionPenalty?: number;
     *   analysisReasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh" | "max";
     *   useExperimentalTestMode?: boolean;
     *   model?: string;
     *   analysisModel?: string;
     *   embeddingModel?: string;
     *   reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh" | "max";
     *   advanced: Record<string, {
     *     thinkingTags?: string[] | null;
     *     reasoningField?: string | null;
     *     nativeReasoning?: boolean | null;
     *   }>;
     * }} options
     */
    constructor(parent, options) {
        super(parent, options);
        /** @type {typeof options} */
        this.options = options;
    }

    /**
     * Counts the number of tokens in the given text using the server's native
     * tokenize endpoint. Falls back to a rough character-based approximation
     * if the server type is unknown.
     *
     * @param {string} text
     * @returns {Promise<number>}
     */
    async countTokens(text) {
        if (this.useExperimentalTestMode) {
            // No server to tokenize against; use the base approximation.
            return super.countTokens(text);
        }

        if (!this.connected || !this.selectedModel) {
            throw new Error("Adapter is not initialized");
        }

        const baseUrl = (this.options.host || 'http://127.0.0.1:8765').replace(/\/$/, '');
        const headers = /** @type {Record<string, string>} */ ({ 'Content-Type': 'application/json' });
        if (this.options.apiKey) {
            headers['Authorization'] = `Bearer ${this.options.apiKey}`;
        }

        // llama.cpp exposes POST /tokenize with body {"content": "text"}
        // and returns {"tokens": [...token_ids]}
        if (this.serverType === 'llama.cpp') {
            const r = await fetch(`${baseUrl}/tokenize`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ content: text }),
            });
            if (!r.ok) {
                throw new Error(`llama.cpp /tokenize returned HTTP ${r.status}`);
            }
            const data = await r.json();
            if (!Array.isArray(data.tokens)) {
                throw new Error('Unexpected response from llama.cpp /tokenize: ' + JSON.stringify(data));
            }
            return data.tokens.length;
        }

        // vLLM exposes POST /tokenize with body {"model": id, "prompt": "text"}
        // and returns {"tokens": [...token_ids], "count": N}
        if (this.serverType === 'vllm') {
            const r = await fetch(`${baseUrl}/tokenize`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ model: this.selectedModel.id, prompt: text }),
            });
            if (!r.ok) {
                throw new Error(`vLLM /tokenize returned HTTP ${r.status}`);
            }
            const data = await r.json();
            if (typeof data.count === 'number') {
                return data.count;
            }
            if (Array.isArray(data.tokens)) {
                return data.tokens.length;
            }
            throw new Error('Unexpected response from vLLM /tokenize: ' + JSON.stringify(data));
        }

        // Fallback: rough approximation (same ratio used in test mode)
        return Math.ceil(text.length / 4);
    }

    /**
     * Attaches server-specific fields to the outgoing chat completion payload.
     * This is where the difference between vLLM and llama.cpp grammar / guided
     * decoding,
     *
     * @param {Record<string, any>} payload the payload about to be sent (mutated in place)
     * @param {{ grammar?: string | null } & Record<string, any>} deServerOptions
     * @returns {void}
     */
    addExtraOptions(payload, deServerOptions) {
        const grammar = deServerOptions.grammar;

        if (this.serverType === 'vllm') {
            // vLLM exposes GBNF guided decoding via `structured_outputs.grammar`. Our grammars
            // are written in GBNF (`::=`), which this field accepts directly.
            if (grammar) {
                payload.structured_outputs = { grammar };
            }
            // if (trail) {
            //     // Continue the final assistant message instead of starting a new turn.
            //     payload.continue_final_message = true;
            //     payload.add_generation_prompt = false;
            // }
        } else if (this.serverType === 'llama.cpp') {
            // llama.cpp accepts a raw GBNF `grammar` field.
            if (grammar) payload.grammar = grammar;
            // if (trail) {
            //     // Suppress the generation prompt so the model continues the final
            //     // assistant message (assistant prefill) rather than opening a new
            //     // turn. llama.cpp also understands `continue_final_message`; both
            //     // are set for robustness across versions and are ignored if unknown.
            //     payload.add_generation_prompt = false;
            //     payload.continue_final_message = true;
            // }

            // Enable llama.cpp's prompt KV-cache. When consecutive requests share
            // the same system prompt + conversation history prefix, llama.cpp
            // reuses the cached KV state and only processes the new tokens — the
            // same performance benefit that the de-server's stateful WebSocket
            // session gave for free. Without this flag every call pays the full
            // prompt-processing cost cold.
            payload.cache_prompt = true;
        }
    }

    /**
     * Resolves the selected model's context window size. For llama.cpp this comes
     * from the /props endpoint (`default_generation_settings.n_ctx`); for vLLM it
     * is the `max_model_len` already parsed from /v1/models by the base class.
     *
     * @param {string} baseUrl
     * @param {Record<string, string>} headers
     * @returns {Promise<void>}
     */
    async _resolveContextWindowSize(baseUrl, headers) {
        if (this.serverType === 'llama.cpp') {
            try {
                const r = await fetch(`${baseUrl}/props`, { headers });
                if (r.ok) {
                    const props = await r.json();
                    const nCtx = props?.default_generation_settings?.n_ctx ?? props?.n_ctx;
                    if (typeof nCtx === 'number' && nCtx > 0) {
                        this.contextWindowSize = nCtx;
                        return;
                    }
                }
            } catch {
                // fall through to the generic resolution below
            }
        }

        // vLLM (max_model_len) and generic fallback.
        await super._resolveContextWindowSize(baseUrl, headers);
    }

    /**
     * Asks the server to unload the model from VRAM so other applications can
     * use the GPU. Non-critical: if the server does not support this, the
     * method resolves silently.
     *
     * - llama.cpp: POST /unload  (frees all weights from VRAM)
     * - vLLM:      POST /sleep?level=1  (suspends the engine, frees VRAM; must be enabled server-side)
     */
    async pause() {
        if (!this.connected || !this.selectedModel) {
            return;
        }

        const baseUrl = (this.options.host || 'http://127.0.0.1:8765').replace(/\/$/, '');
        const headers = /** @type {Record<string, string>} */ ({ 'Content-Type': 'application/json' });
        if (this.options.apiKey) {
            headers['Authorization'] = `Bearer ${this.options.apiKey}`;
        }

        if (this.serverType === 'llama.cpp') {
            try {
                await fetch(`${baseUrl}/unload`, { method: 'POST', headers });
                console.log('InferenceAdapterVLLandLlamaMUncensored: llama.cpp model unloaded from VRAM');
            } catch {
                console.warn('InferenceAdapterVLLandLlamaMUncensored: llama.cpp /unload not supported or failed, VRAM may still be in use');
            }
            return;
        }

        if (this.serverType === 'vllm') {
            try {
                const r = await fetch(`${baseUrl}/sleep?level=1`, { method: 'POST', headers });
                if (r.ok) {
                    console.log('InferenceAdapterVLLandLlamaMUncensored: vLLM engine suspended (level 1), VRAM freed');
                } else {
                    console.warn(`InferenceAdapterVLLandLlamaMUncensored: vLLM /sleep returned HTTP ${r.status}, VRAM may still be in use`);
                }
            } catch {
                console.warn('InferenceAdapterVLLandLlamaMUncensored: vLLM /sleep not supported or not enabled, VRAM may still be in use');
            }
            return;
        }
    }

    /**
     * 
     * @param {Record<string, any>} payload
     * @param {"none" | "low" | "medium" | "high" | "xhigh" | "max"} level
     */
    async setReasoningEffort(payload, level) {
        if (this.serverType === 'vllm') {
            if (level === 'none') {
                payload.reasoning_effort = "none";
                payload.reasoning_budget = 0;
            } else {
                payload.reasoning_effort = level;
            }
        } else if (this.serverType === 'llama.cpp') {
            if (level === 'none') {
                payload.reasoning_effort = "none";
                payload.reasoning_budget = 0;
                payload.chat_template_kwargs = {
                    ...payload.chat_template_kwargs,
                    enable_thinking: false,
                }
            } else {
                payload.reasoning_effort = level;
            }
        }
    }

    /**
     * Verifies grammar enforcement and separately exposed reasoning together,
     * using the same streaming inference path as normal requests. A distinctive
     * forced literal detects ignored grammars; nonempty thoughts confirm that
     * reasoning is available separately from the constrained answer. Checks
     * each distinct main, analysis, and gear override model once.
     *
     * @returns {Promise<void>}
     */
    async _ensureGrammarAndThinking() {
        if (this.serverType !== 'vllm' && this.serverType !== 'llama.cpp') {
            const msg = `Grammar-constrained decoding is not supported by the detected server type: "${this.serverType}". ` +
                `Only "vllm" and "llama.cpp" servers are supported.`;
            this.reason = msg;
            this.triggerOnConnectionStatusChange(false, msg);
            throw new Error(msg);
        }

        if (!this.selectedModel) {
            const msg = 'No model selected; cannot verify grammar-constrained decoding and reasoning.';
            this.reason = msg;
            this.triggerOnConnectionStatusChange(false, msg);
            throw new Error(msg);
        }

        if (!this.analysisModel) {
            const msg = 'No analysis model selected; cannot verify grammar-constrained decoding and reasoning.';
            this.reason = msg;
            this.triggerOnConnectionStatusChange(false, msg);
            throw new Error(msg);
        }

        const modelIds = new Set([this.selectedModel.id]);
        const allModels = Object.values(this.gearModels).concat(Object.values(this.analysisGearModels)).concat([this.analysisModel]).concat([this.selectedModel]);
        if (this.analysisModel) modelIds.add(this.analysisModel.id);
        for (const model of Object.values(this.gearModels)) modelIds.add(model.id);
        for (const model of Object.values(this.analysisGearModels)) modelIds.add(model.id);

        const forcedLiteral = 'GRAMMAR_OK';
        for (const modelId of modelIds) {
            const nativeExample = JSON.stringify({ [modelId]: { nativeReasoning: true, reasoningField: 'reasoning_content' } });
            const taggedExample = JSON.stringify({ [modelId]: { nativeReasoning: false, thinkingTags: ['<think>', '</think>'] } });
            const reasoningConfigHelp = `In "Advanced Model Configuration", merge an entry for this model into the JSON object. ` +
                `If the server returns reasoning in a separate field, use ${nativeExample} and replace "reasoning_content" with the actual response delta field (for example, "reasoning"). ` +
                `If thinking is embedded in content, use ${taggedExample} and replace the tags with the model's actual opening and closing delimiters (for MiniMax-M3, "<mm:think>" and "</mm:think>").`;
            const modelRelevant = allModels.find(m => m.id === modelId);
            if (!modelRelevant) {
                const msg = `Model "${modelId}" not found in gear or analysis models; cannot verify grammar-constrained decoding and reasoning.`;
                this.reason = msg;
                this.triggerOnConnectionStatusChange(false, msg);
                throw new Error(msg);
            }

            if (modelRelevant.nativeReasoning === null) {
                const msg = `Model "${modelId}" has no nativeReasoning tag; cannot verify grammar-constrained decoding and reasoning. ${reasoningConfigHelp}`;
                this.reason = msg;
                this.triggerOnConnectionStatusChange(false, msg);
                throw new Error(msg);
            }

            if (modelRelevant.nativeReasoning && !modelRelevant.reasoningField) {
                const msg = `Model "${modelId}" is marked as native reasoning but has no reasoningField; cannot verify grammar-constrained decoding and reasoning. ${reasoningConfigHelp}`;
                this.reason = msg;
                this.triggerOnConnectionStatusChange(false, msg);
                throw new Error(msg);
            }

            if (!modelRelevant.nativeReasoning && !modelRelevant.thinkingTags) {
                const msg = `Model "${modelId}" is marked as non-native reasoning but has no thinkingTags; cannot verify grammar-constrained decoding and reasoning. ${reasoningConfigHelp}`;
                this.reason = msg;
                this.triggerOnConnectionStatusChange(false, msg);
                throw new Error(msg);
            }

            let reply;
            try {
                reply = await this.runInference(
                    modelId,
                    [{ role: 'user', content: 'Think briefly about cats before answering.', thoughts: [] }],
                    { temperature: 0, maxTokens: 2048, reasoningEffort: 'low' },
                    { grammar: `root ::= "${forcedLiteral}"` },
                );
            } catch (error) {
                const detail = error instanceof Error ? error.message : String(error);
                const msg = `Grammar and thinking verification failed for model "${modelId}": ${detail}`;
                this.reason = msg;
                this.triggerOnConnectionStatusChange(false, msg);
                throw new Error(msg);
            }

            const produced = reply.content.trim();
            if (produced !== forcedLiteral) {
                const hint = this.serverType === 'vllm'
                    ? 'Ensure vLLM honours the `structured_outputs.grammar` field with GBNF grammars and exposes reasoning separately from content.'
                    : 'Ensure llama.cpp is built with grammar support and exposes reasoning separately from content.';
                const msg = `Grammar-constrained decoding verification failed for model "${modelId}": ` +
                    `expected the forced output "${forcedLiteral}" but got "${produced}". ${hint}`;
                this.reason = msg;
                this.triggerOnConnectionStatusChange(false, msg);
                throw new Error(msg);
            }

            if (!reply.thoughts.some(thought => thought.trim().length > 0)) {
                const msg = `Thinking verification failed for model "${modelId}": no thoughts were received with low reasoning effort and grammar enabled. ` +
                    'Ensure the model supports thinking and the server exposes it through reasoning or reasoning_content deltas. Grammar-constrained decoding was nevertheless honored. ' +
                    reasoningConfigHelp;
                this.reason = msg;
                this.triggerOnConnectionStatusChange(false, msg);
                throw new Error(msg);
            }

            console.log(`InferenceAdapterVLLandLlamaMUncensored: Grammar-constrained decoding and thinking verified for model "${modelId}" (${this.serverType}).`);
        }
    }

    /**
     * Asks the server to reload the model into VRAM after a previous pause().
     * Non-critical: if the server does not support this, the method resolves
     * silently. ensureInitialized() is always called before inference so the
     * model will be re-detected if needed.
     *
     * - llama.cpp: POST /load  (reloads the model that was previously unloaded)
     * - vLLM:      POST /wake_up  (resumes the engine after /sleep; must be enabled server-side)
     */
    async resume() {
        if (!this.connected || !this.selectedModel) {
            return;
        }

        const baseUrl = (this.options.host || 'http://127.0.0.1:8765').replace(/\/$/, '');
        const headers = /** @type {Record<string, string>} */ ({ 'Content-Type': 'application/json' });
        if (this.options.apiKey) {
            headers['Authorization'] = `Bearer ${this.options.apiKey}`;
        }

        if (this.serverType === 'llama.cpp') {
            try {
                await fetch(`${baseUrl}/load`, { method: 'POST', headers });
                console.log('InferenceAdapterVLLandLlamaMUncensored: llama.cpp model reloaded into VRAM');
            } catch {
                console.warn('InferenceAdapterVLLandLlamaMUncensored: llama.cpp /load not supported or failed');
            }
            return;
        }

        if (this.serverType === 'vllm') {
            try {
                const r = await fetch(`${baseUrl}/wake_up`, { method: 'POST', headers });
                if (r.ok) {
                    console.log('InferenceAdapterVLLandLlamaMUncensored: vLLM engine resumed, VRAM reloaded');
                } else {
                    console.warn(`InferenceAdapterVLLandLlamaMUncensored: vLLM /wake_up returned HTTP ${r.status}`);
                }
            } catch {
                console.warn('InferenceAdapterVLLandLlamaMUncensored: vLLM /wake_up not supported or not enabled');
            }
            return;
        }
    }
}
