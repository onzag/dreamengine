import { VoiceAdapterWebsocketVocalizer } from "./adapter-websocket-vocalizer.js";
import { BaseVoiceAdapter } from "./base.js";

/**
 * @type {Object<string, {build: (getConfigValue: (str: string) => Promise<any>) => Promise<BaseVoiceAdapter>, hasSelfSignedOption?: boolean, hasLowVramOption?: boolean, settings: import("../setting").SettingsFunction}>}
 */
export const VOICE_ADAPTERS = {
    "Vocalizer": {
        settings: () => ({
            // ALWAYS USE vocalizerHost when adding more adapters, this is used accross the app to determine the host regardless of the adapter
            vocalizerHost: {
                label: "Vocalizer Host",
                placeholder: "Enter Vocalizer host",
                description: "This is the host address for the Vocalizer server, you can define all parameters here for the remote server, for example wss://myserver.com:1234?model=custom&param=value, the protocol must be ws:// or wss://",
                default: "wss://localhost:8222",
                type: "string",
            },
            vocalizerApiKey: {
                label: "Vocalizer API Key",
                placeholder: "Enter Vocalizer API key",
                description: "This is the API key for the Vocalizer server, used for authentication.",
                default: "dev-secret-12345678900abcdef",
                type: "string",
            },
        }),
        hasSelfSignedOption: true,
        hasLowVramOption: true,
        build: async (getConfigValue) => new VoiceAdapterWebsocketVocalizer({
            host: await getConfigValue("vocalizerHost") || "wss://localhost:8222",
            secret: await getConfigValue("vocalizerApiKey") || "dev-secret-12345678900abcdef",
        }),
    },
}