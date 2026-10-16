
import { DEngine } from "../index.js";
import { InferenceAdapterVLLandLlamaMUncensored } from "./adapter-vllm-llama-uncensored.js";
import { BaseInferenceAdapter } from "./base.js";

// Optional dependency: `gbnf` is declared as an optionalDependency in
// package.json, so it may or may not be present at runtime. We attempt a
// dynamic ESM import of its bundled `dist/index.js` using a path that
// resolves identically under both electron (file://) and the web server
// (which mounts node_modules/gbnf at /node_modules/gbnf). If the import
// fails (package not installed), the experimental test-mode toggle is
// simply hidden.
let gbnfAvailable = false;
let gbnfDetected = false;
const gbnfDetectionPromise = import('../../../node_modules/gbnf/dist/index.js')
    .then(() => { gbnfAvailable = true; })
    .catch(() => { /* optional dependency not installed */ })
    .finally(() => { gbnfDetected = true; });

/**
 * @type {Object<string, {checkConfig: (getConfigValue: (key: string) => Promise<any>) => Promise<{title: string, message: string} | null>, buildConfig: (getConfigValue: (key: string) => Promise<any>) => Promise<any>, build: (engine: DEngine, getConfigValue: (key: string) => Promise<any>) => Promise<BaseInferenceAdapter>, hasSelfSignedOption?: boolean, hasLowVramOption?: boolean, settings: import("../setting").SettingsFunction}>}>}
 */
export const INFERENCE_ADAPTERS = {
    "vLLM/Llama": {
        settings: async () => ({
            // ALWAYS USE HOST when adding more adapters, this is used across the app to determine the host regardless of the adapter
            host: {
                label: "vLLM/Llama Host",
                description: "The base URL of the vLLM server exposing an OpenAI-compatible API, e.g. https://myserver.com:8765",
                default: "https://localhost:8765",
                type: "string",
                placeholder: "Enter vLLM host",
            },
            apiKey: {
                label: "vLLM/Llama API Key",
                description: "API key for the vLLM server. Leave blank if the server does not require authentication.",
                default: "",
                type: "string",
                placeholder: "Enter vLLM API key",
            },
            model: {
                label: "Model",
                description: "The model to use for inference. This should match the model name on the vLLM server.",
                default: "",
                type: "string",
                placeholder: "Enter model name, or leave blank for default",
            },
            temperature: {
                label: "Temperature",
                description: "Sampling temperature. Higher values produce more varied output.",
                default: 0.8,
                type: "number",
                placeholder: "Enter temperature",
            },
            topP: {
                label: "Top P",
                description: "Nucleus sampling probability mass. 1.0 disables nucleus sampling.",
                default: 0.95,
                type: "number",
                placeholder: "Enter top-p",
            },
            topK: {
                label: "Top K",
                description: "Limits sampling to the top K most likely tokens. -1 disables this.",
                default: -1,
                type: "number",
                integer: true,
                placeholder: "Enter top-k",
            },
            repetitionPenalty: {
                label: "Repetition Penalty",
                description: "Penalises tokens that have already appeared in the output. 1.0 disables the penalty.",
                default: 1.0,
                type: "number",
                placeholder: "Enter repetition penalty",
            },
            useExperimentalTestMode: await gbnfDetectionPromise.then(() => (gbnfAvailable ? {
                label: "Use Experimental Test Mode",
                placeholder: "Enable experimental test mode",
                description: "A developer mode that generates random sentences on inference, meant for expert testing and debugging. This mode is only available if the optional dependency 'gbnf' is installed.",
                default: false,
                type: "boolean",
            } : null)),
        }),
        hasSelfSignedOption: true,
        hasLowVramOption: true,
        build: async (engine, getConfigValue) => new InferenceAdapterVLLandLlamaMUncensored(engine, {
            host: await getConfigValue("host") || "https://localhost:8765",
            apiKey: await getConfigValue("apiKey"),
            temperature: await getConfigValue("temperature"),
            topP: await getConfigValue("topP"),
            topK: await getConfigValue("topK"),
            repetitionPenalty: await getConfigValue("repetitionPenalty"),
            useExperimentalTestMode: await getConfigValue("useExperimentalTestMode") || false,
            model: await getConfigValue("model"),
        }),
        buildConfig: async (getConfigValue) => {
            const host = await getConfigValue("host");
            if (!host) {
                return null;
            }
            return {
                host,
                apiKey: await getConfigValue("apiKey"),
                temperature: await getConfigValue("temperature"),
                topP: await getConfigValue("topP"),
                topK: await getConfigValue("topK"),
                repetitionPenalty: await getConfigValue("repetitionPenalty"),
                useExperimentalTestMode: await getConfigValue("useExperimentalTestMode") || false,
                model: await getConfigValue("model"),
            };
        },
        checkConfig: async (getConfigValue) => {
            const host = await getConfigValue("host");
            if (!host) {
                return {
                    title: "No Host Configured",
                    message: "You have not configured a vLLM host. Please enter the base URL of your vLLM server in the settings.",
                };
            }
            if (!host.startsWith("http://") && !host.startsWith("https://")) {
                return {
                    title: "Invalid Host",
                    message: "The vLLM host must start with http:// or https://. Please check your settings.",
                };
            }
            return null;
        },
    },
}