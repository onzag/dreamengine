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
     *   apiKey?: string;
     *   temperature?: number;
     *   topP?: number;
     *   topK?: number;
     *   repetitionPenalty?: number;
     *   useExperimentalTestMode?: boolean;
     *   model?: string;
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
     * decoding, and assistant `trail` continuation, is expressed, keeping
     * deServerStreamEmulator vendor-agnostic.
     *
     * The base emulator always appends the `trail` as a final assistant message;
     * here we add the per-server flags that make the model *continue* that
     * message (assistant prefill) rather than open a brand new assistant turn.
     *
     * @param {Record<string, any>} payload the payload about to be sent (mutated in place)
     * @param {{ grammar?: string | null, trail?: string } & Record<string, any>} deServerOptions
     * @returns {void}
     */
    addExtraOptions(payload, deServerOptions) {
        const grammar = deServerOptions.grammar;
        const trail = deServerOptions.trail;

        if (this.serverType === 'vllm') {
            // vLLM exposes GBNF guided decoding via `guided_grammar`.
            if (grammar) payload.guided_grammar = grammar;
            if (trail) {
                // Continue the final assistant message instead of starting a new turn.
                payload.continue_final_message = true;
                payload.add_generation_prompt = false;
            }
        } else if (this.serverType === 'llama.cpp') {
            // llama.cpp accepts a raw GBNF `grammar` field.
            if (grammar) payload.grammar = grammar;
            if (trail) {
                // Suppress the generation prompt so the model continues the final
                // assistant message (assistant prefill) rather than opening a new
                // turn. llama.cpp also understands `continue_final_message`; both
                // are set for robustness across versions and are ignored if unknown.
                payload.add_generation_prompt = false;
                payload.continue_final_message = true;
            }
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
