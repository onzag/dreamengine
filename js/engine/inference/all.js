
import { DEngine } from "../index.js";
import { InferenceAdapterLlamaUncensored } from "./adapter-de-server-uncensored.js";
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
    "DreamServer": {
        settings: async () => ({
            // ALWAYS USE HOST when adding more adapters, this is used accross the app to determine the host regardless of the adapter
            host: {
                label: "DreamServer Host",
                description: "This is the host address for the DreamServer, you can define all parameters here for the remote server, for example wss://myserver.com:1234?model=custom&param=value, the protocol must be ws:// or wss://",
                default: "wss://localhost:8765",
                type: "string",
                placeholder: "Enter DreamServer host",
            },
            apiKey: {
                label: "DreamServer API Key",
                description: "This is the API key for the DreamServer, used for authentication.",
                default: "",
                type: "string",
                placeholder: "Enter DreamServer API key",
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
        build: async (engine, getConfigValue) => new InferenceAdapterLlamaUncensored(engine, {
            apiKey: await getConfigValue("apiKey"),
            host: await getConfigValue("host") || "wss://localhost:8765",
            useExperimentalTestMode: await getConfigValue("useExperimentalTestMode") || false,
        }),
        buildConfig: async (getConfigValue) => {
            const rs = {
                apiKey: await getConfigValue("apiKey"),
                host: await getConfigValue("host") || "wss://localhost:8765",
                useExperimentalTestMode: await getConfigValue("useExperimentalTestMode") || false,
            };
            if (!rs.host) {
                return null;
            }
            return rs;
        },
        checkConfig: async (getConfigValue) => {
            const apiKey = await getConfigValue("apiKey");
            if (!apiKey) {
                return {
                    title: "No API Key Configured",
                    message: "You have not configured an API key on your DreamServer. You can enter your API key in the settings. Please note that you will need an API key to use the application even using local self-hosted mode.",
                }
            }
            const host = await getConfigValue("host");
            if (!host.startsWith("ws://") && !host.startsWith("wss://")) {
                return {
                    title: "Invalid Host",
                    message: "The DreamServer host must start with ws:// or wss://. Please check your settings.",
                }
            }
            return null;
        },
    },
}