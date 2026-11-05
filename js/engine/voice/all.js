import { BaseVoiceAdapter } from "./base.js";
import { VoiceAdapterLocalAudioCPP } from "./adapter-local-audiocpp.js";

/**
 * @type {Object<string, {build: (getConfigValue: (str: string) => Promise<any>) => Promise<BaseVoiceAdapter>, hasSelfSignedOption?: boolean, hasLowVramOption?: boolean, settings: import("../setting").SettingsFunction}>}
 */
export const VOICE_ADAPTERS = {
    "Local AudioCPP": {
        settings: () => ({
            // ALWAYS USE voiceHost when adding more adapters, this is used accross the app to determine the host regardless of the adapter
            voiceHost: {
                label: "Voice Host",
                placeholder: "Enter Voice host",
                description: "This is the host address for the Voice server, you can define all parameters here for the remote server, for example https://myserver.com:1234?model=custom&param=value",
                default: "https://localhost:8222",
                type: "string",
            },
            voiceApiKey: {
                label: "Voice API Key",
                placeholder: "Enter Voice API key",
                description: "This is the API key for the Voice server, used for authentication.",
                default: "dev-secret-12345678900abcdef",
                type: "string",
            },
            voiceModel: {
                label: "Model",
                description: "The model to use for voice generation. This should match the model name on the Local AudioCPP server.",
                default: "",
                type: "string",
                placeholder: "Enter model name, or leave blank for default",
            },
        }),
        hasSelfSignedOption: true,
        hasLowVramOption: true,
        build: async (getConfigValue) => new VoiceAdapterLocalAudioCPP({
            host: await getConfigValue("voiceHost") || "https://localhost:8222",
            secret: await getConfigValue("voiceApiKey") || "dev-secret-12345678900abcdef",
            model: await getConfigValue("voiceModel") || "",
        }),
    },
}