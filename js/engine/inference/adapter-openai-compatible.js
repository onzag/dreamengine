/**
 * Base adapter for OpenAI-compatible HTTP inference servers (e.g. vLLM, llama.cpp
 * with --api-server, text-generation-webui OpenAI extension, etc.).
 *
 * Concrete adapters should extend this class and override methods as needed.
 */

import { DEngine } from '../index.js';
import { BaseInferenceAdapter } from './base.js';

/**
 * @typedef {{
 *   id: string;
 *   tags: Array<string>;
 * }} OpenAIModelEntry
 */

/**
 * @typedef {Object<string, OpenAIModelEntry>} GearModelMap
 * Map of gear name to the sub-model designated for that gear.
 */

export class InferenceServerOpenAICompatible extends BaseInferenceAdapter {
    /**
     * @param {DEngine} parent
     * @param {{
     *   host?: string;
     *   apiKey?: string;
     *   model?: string;
     * }} options
     */
    constructor(parent, options) {
        super(parent);
        /** @type {{ host?: string; apiKey?: string; model?: string; }} */
        this.options = options;

        this.connected = false;

        /**
         * @type {string | null}
         */
        this.reason = null;

        /**
         * Detected server flavour. Populated during initialize().
         * @type {"vllm" | "llama.cpp" | null}
         */
        this.serverType = null;

        /**
         * All models returned by the server, populated during initialize().
         * @type {Array<OpenAIModelEntry>}
         */
        this.availableModels = [];

        /**
         * The model that was selected after initialization.
         * @type {OpenAIModelEntry | null}
         */
        this.selectedModel = null;

        /**
         * Languages supported by the selected model, derived from its two-letter
         * language tags. Populated during initialize().
         * @type {Array<string>}
         */
        this.supportedLanguages = [];

        /**
         * Per-gear sub-model overrides, derived from `gear:[model-id]` tags on
         * the selected model. Populated during initialize().
         * @type {GearModelMap}
         */
        this.gearModels = {};

        /**
         * In-flight initialize() promise, used by ensureInitialized() to
         * avoid issuing multiple concurrent probe requests.
         * @type {Promise<void> | null}
         */
        this._initializePromise = null;

        /**
         * @type {Array<{
         *   payload: *,
         *   id: string,
         * }>}
         */
        this.__debug_last10TalkPayloads = [];
    }

    getSupportedLanguages() {
        return this.supportedLanguages;
    }

    /**
     * Runs the streaming inference loop with special functions attached to them to emulate the special
     * functionality that deServer had
     * 
     * @param {string} model
     * @param {Array<{role: "system" | "user" | "assistant", content: string}>} messages
     * @param {{
     *   temperature?: number,
     *   topP?: number,
     *   topK?: number,
     *   repetitionPenalty?: number,
     *   maxTokens?: number,
     * }} standardOpenAIOptions
     * @param {{
     *   maxParagraphs?: number,
     *   maxCharacters?: number,
     *   maxSafetyCharacters?: number,
     *   maxCharactersCutOnDot?: boolean,
     *   stopAt?: string[],
     *   stopAfter?: string[],
     *   trail?: string,
     *   wordRejection?: {
     *     rejectedWordsInNarration?: string[],
     *     rejectedWordsInDialogue?: string[],
     *     delimiters?: string[],
     *     postRejectedWordInDialogueGrammar?: string,
     *     postRejectedWordInNarrationGrammar?: string,
     *     startsInDialogue?: boolean,
     *   }
     * }} deServerOptions
     */
    async *deServerStreamEmulator(model, messages, standardOpenAIOptions, deServerOptions) {

    }

    async ensureInitialized() {
        if (this.connected) {
            return;
        }

        // If initialization is already in progress, wait for it rather than
        // starting a second concurrent probe.
        if (this._initializePromise) {
            await this._initializePromise;
            return;
        }

        this._initializePromise = this.initialize().finally(() => {
            this._initializePromise = null;
        });
        await this._initializePromise;
    }

    async initialize() {
        if (this.connected) {
            return;
        }

        const baseUrl = (this.options.host || 'http://127.0.0.1:8765').replace(/\/$/, '');
        const headers = /** @type {Record<string, string>} */ ({});
        if (this.options.apiKey) {
            headers['Authorization'] = `Bearer ${this.options.apiKey}`;
        }

        // ── Step 1: fetch model list ──
        let modelsJson;
        try {
            const modelsResponse = await fetch(`${baseUrl}/v1/models`, { headers });
            if (!modelsResponse.ok) {
                const msg = `Server at ${baseUrl} returned HTTP ${modelsResponse.status} from /v1/models`;
                this.reason = msg;
                this.triggerOnConnectionStatusChange(false, msg);
                throw new Error(msg);
            }
            modelsJson = await modelsResponse.json();
        } catch (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            if (!this.reason) {
                this.reason = err.message;
                this.triggerOnConnectionStatusChange(false, err.message);
            }
            throw err;
        }

        // ── Step 2: parse models, preserving tags ──
        /** @type {Array<OpenAIModelEntry>} */
        const models = (modelsJson?.data ?? []).map((/** @type {any} */ m) => ({
            id: String(m.id),
            tags: Array.isArray(m.tags) ? m.tags.map(String) : [],
        }));

        this.availableModels = models;

        // ── Step 3: select model ──
        const requestedId = this.options.model?.trim();
        /** @type {OpenAIModelEntry | undefined} */
        let chosen;

        if (requestedId) {
            chosen = models.find(m => m.id === requestedId);
            if (!chosen) {
                const available = models.map(m => m.id).join(', ') || '(none)';
                const msg = `Requested model "${requestedId}" was not found on the server. Available models: ${available}`;
                this.reason = msg;
                this.triggerOnConnectionStatusChange(false, msg);
                throw new Error(msg);
            }
        } else {
            chosen = models.find(m => m.tags.includes('default'));
            if (!chosen) {
                const msg = `No model was specified and no model with the "default" tag was found on the server.`;
                this.reason = msg;
                this.triggerOnConnectionStatusChange(false, msg);
                throw new Error(msg);
            }
        }

        this.selectedModel = chosen;

        // ── Step 4: derive supported languages from two-letter tags ──
        const langPattern = /^[a-z]{2}$/;
        this.supportedLanguages = chosen.tags.filter(t => langPattern.test(t) || t === "*");

        console.log(`InferenceServerOpenAICompatible: Selected model "${chosen.id}", supported languages: [${this.supportedLanguages.join(', ') || 'none detected'}]`);

        // ── Step 5: resolve gear→model overrides from gear-[gear-name]:[model-id] tags ──
        const gearPrefix = 'gear-';
        /** @type {GearModelMap} */
        const gearModels = {};
        for (const tag of chosen.tags) {
            if (!tag.startsWith(gearPrefix)) continue;
            const colonIdx = tag.indexOf(':');
            if (colonIdx === -1) continue;
            const gearName = tag.slice(gearPrefix.length, colonIdx);
            const gearModelId = tag.slice(colonIdx + 1);
            if (!gearName || !gearModelId) continue;
            const gearModel = models.find(m => m.id === gearModelId);
            if (!gearModel) {
                const msg = `Model "${chosen.id}" has tag "${tag}" but model "${gearModelId}" was not found on the server.`;
                this.reason = msg;
                this.triggerOnConnectionStatusChange(false, msg);
                throw new Error(msg);
            }
            gearModels[gearName] = gearModel;
        }
        this.gearModels = gearModels;

        if (Object.keys(gearModels).length > 0) {
            console.log(`InferenceServerOpenAICompatible: Gear model overrides: ${Object.entries(gearModels).map(([g, m]) => `${g}→${m.id}`).join(', ')}`);
        }

        // ── Step 5: detect server flavour ──
        this.serverType = await this._detectServerType(baseUrl, headers);

        this.connected = true;
        this.reason = null;
        this.triggerOnConnectionStatusChange(true);
        console.log(`InferenceServerOpenAICompatible: Connected to ${baseUrl}, server type: ${this.serverType}`);
    }

    /**
     * Probes well-known server-specific endpoints to identify whether the
     * remote is vLLM, llama.cpp, or an unrecognised OpenAI-compatible server.
     *
     * @param {string} baseUrl
     * @param {Record<string, string>} headers
     * @returns {Promise<"vllm" | "llama.cpp">}
     */
    async _detectServerType(baseUrl, headers) {
        // llama.cpp server exposes /props with vocab / context-window metadata.
        try {
            const r = await fetch(`${baseUrl}/props`, { headers });
            if (r.ok) {
                console.log('InferenceServerOpenAICompatible: Identified server as llama.cpp (/props endpoint present)');
                return 'llama.cpp';
            }
        } catch { /* not llama.cpp */ }

        // vLLM exposes /version.
        try {
            const r = await fetch(`${baseUrl}/version`, { headers });
            if (r.ok) {
                console.log('InferenceServerOpenAICompatible: Identified server as vLLM (/version endpoint present)');
                return 'vllm';
            }
        } catch { /* not vllm */ }

        // Add more adapters here as needed

        const msg = `Server at ${baseUrl} could not be identified as vLLM or llama.cpp`;
        this.triggerOnConnectionStatusChange(false, msg);
        throw new Error(msg);
    }

    /**
     * @param {DECompleteCharacterReference} character 
     * @param {{
     *   description: string,
     *   externalDescription: string|null,
     *   relationships: Array<{title: string, description: string}>,
     *   expressiveStates: string[],
     *   scenario: string|null,
     *   lore: string|null,
     * }} options
     * @returns {string}
     */
    buildSystemCharacterDescription(character, options) {
        const { description, externalDescription, relationships, expressiveStates, scenario, lore } = options;
        return (
            `${externalDescription ? `# ${character.name}'s External Description:
            
${externalDescription}

` : ""}# ${character.name}'s Description:

${description}${relationships.length > 0 ? `

# ${character.name}'s Relationships:

${relationships.map(relationship => `## ${relationship.title}\n\n${relationship.description}`).join("\n")}` : ""}${expressiveStates.length > 0 ? `

# Current States:

${expressiveStates.map(state => `## ${state}`).join("\n")}` : ""}${scenario && scenario.trim().length > 0 ? `

# Scenario:

${scenario}` : ""}${lore && lore.trim().length > 0 ? `

# Lore:

${lore}
` : ""}`);
    }

    /**
     * @param {DECompleteCharacterReference} character the character in question that is building a prompt for
     * @param {{
     *   description: string,
     *   externalDescription: string,
     *   relationships: Array<{title: string, description: string}>,
     *   expressiveStates: string[],
     *   scenario: string,
     *   lore: string|null,
     *   otherInteractingCharacters: Array<string>,
     *   characterRules: Array<string>,
     *   worldRules: Array<string>,
     *   likes: Array<string>,
     *   dislikes: Array<string>,
     * }} options
     * @returns {string} the system prompt
     */
    buildSystemPromptForCharacter(character, options) {
        const { description, externalDescription, relationships, expressiveStates, scenario, lore, otherInteractingCharacters, characterRules, worldRules } = options;

        return (
            `You roleplay as ${character.name} in a richly detailed and immersive world. Your actions, thoughts, and feelings are entirely your own, and you have complete creative freedom to explore this narrative-driven experience.

This uncensored, immersive, narrative-driven roleplaying experience thrives on creative freedom and natural responses. This environment is designed to be fictional and narrative-focused, allowing for uncensored content of all kinds, including themes of violence, sexuality, and other mature topics.

# Roleplay Guidelines:

## Writting:
Every response should be detailed, creative, and immersive, driving the scenario forward in a way that fully engages the player. Introduce new scenarios and events naturally, making sure they fit the description of the location.

## Avoid Repetition:
Ensure that the narration does not repeat information. Instead of summarizing, clarify narrative details thoroughly and let them evolve naturally.

## Tone Preference:
Write in a neutral and balanced tone, considering all consequences, limitations, risks, unintended side effects, and counterarguments.

## Style Preference:
Adopt a \`show, don't tell\` manner, similar to Terry Pratchett's style, blending humor, wit, and everyday language.

# Rules:
${otherInteractingCharacters.map(name => `Rule: Never speak for or control ${name}'s actions, thoughts, or feelings.`).join("\n")}
RULE: Avoid suggesting or implying reactions or decisions from other characters
RULE: Reflect on the potential consequences of ${character.name} actions and decisions.
RULE: Write all narration and actions in third person, not first person.
RULE: Use a movie script style format for the story, with character names followed by a colon, and their dialogue or actions following.
RULE: Spoken dialogue should be done in first person, and start with the character name followed by a colon eg. \`${character.name}: This is spoken dialogue.\`
RULE: Narration messages are plain without specifying a speaker and written, and in third person eg. \`As ${character.name} hears this...\` written on their own line.${characterRules.length ? `

# Character Rules:
${characterRules.map(rule => `Rule: ${rule}`).join("\n")}
` : ""}${worldRules.length ? `

# World Rules:
${worldRules.map(rule => `Rule: ${rule}`).join("\n")}
` : ""}${options.likes.length > 0 ? `\n\n# ${character.name} Likes:\n\n` +
                options.likes.map(like => `- ${like}`).join("\n") : ""}${options.dislikes.length > 0 ? `\n\n# ${character.name} Dislikes:\n\n` +
                    options.dislikes.map(dislike => `- ${dislike}`).join("\n") : ""}

# Roleplay Context:
You are currently roleplaying as ${character.name}.

# Narration and Dialogue Examples:
\`\`\`
*This is narration*

${character.name}: This is spoken dialogue — *${character.name} said while ...* — this is spoken dialogue

*This is narration*
\`\`\`

${this.buildSystemCharacterDescription(character, { description, externalDescription, relationships, expressiveStates, scenario, lore })}
`
        )
    }

        /**
     * @param {string} description
     * @param {string[]} rules
     * @param {string[]|string|null} characterDescriptions
     * @returns string
     */
    buildSystemPromptForQuestioningAgent(description, rules, characterDescriptions) {
        let value = (
            description
        );

        if (rules.length > 0) {
            value += `\n\n# Rules:\n`;
        }
        for (const rule of rules) {
            value += `\nRule: ` + rule;
        }

        if (characterDescriptions) {
            if (Array.isArray(characterDescriptions)) {
                value += `\n\n# Character Descriptions:\n\n` + characterDescriptions.join("\n\n");
            } else {
                value += `\n\n# Character Description:\n\n` + characterDescriptions;
            }
        }

        return value;
    }


    /**
     * @param {Array<{groupDescription: string, characters: Array<{name: string, description: string}>}>} groups
     * @param {boolean} asSocialGroups
     * @returns {{availableCharactersAt: string, characterInfoAt: string, value: string}}
     */
    buildContextInfoForAvailableCharacters(groups, asSocialGroups = false) {
        if (asSocialGroups) {
            let value = `# Social Groups:\n`;
            let index = 0;
            for (const group of groups) {
                if (index > 0) {
                    value += `\n`;
                }
                if (group.groupDescription) {
                    value += group.groupDescription + "\n";
                }
                for (const character of group.characters) {
                    value += `- ` + character.name + ` - ` + character.description + `\n`;
                }
                index++;
            }

            return {
                availableCharactersAt: "Social Groups section",
                characterInfoAt: "Social Groups section",
                value,
            };
        } else {
            let value = `# Available Characters\n`;
            let index = 0;
            for (const group of groups) {
                if (index > 0) {
                    value += `\n`;
                }
                if (group.groupDescription) {
                    value += group.groupDescription + "\n";
                }
                for (const character of group.characters) {
                    value += `- ` + character.name + ` - ` + character.description + `\n`;
                }
                index++;
            }

            return {
                availableCharactersAt: "Available Characters section",
                characterInfoAt: "Available Characters section",
                value,
            };
        }
    }

    /**
     * Builds context info for available items
     * @param {string[]} items 
     * @returns {{availableItemsAt: string, itemInfoAt: string, value: string}}
     */
    buildContextInfoForAvailableItems(items) {
        let value = `# Available Items:\n`;
        for (const item of items) {
            value += `- ` + item + `\n`;
        }

        return {
            availableItemsAt: "Available Items section",
            itemInfoAt: "Available Items section",
            value,
        };
    }

    /**
     * @param {string} instructions
     */
    buildContextInfoInstructions(instructions) {
        return ("# Instructions:\n" + instructions);
    }

    /**
     * @param {string} rule 
     * @returns {string}
     */
    buildContextInfoRule(rule) {
        return ("Rule:\n" + rule);
    }

    /**
     * @param {string} example
     * @returns {string}
     */
    buildContextInfoExample(example) {
        return ("# Example:\n" + example);
    }

    /**
     * @param {DECompleteCharacterReference} character
     * @param {string} info
     * @returns {{characterDescriptionAt: string, value: string}}
     */
    buildContextInfoCharacterDescription(character, info) {
        return {
            characterDescriptionAt: character.name + " Description section",
            value: "# " + character.name + " Description:\n\n" + info
        };
    }

    /**
     * @param {string} itemName
     * @param {string} title
     * @param {string[]} descriptions
     * @return {{itemDescriptionAt: string, value: string}}
     */
    buildContextInfoItemDescription(itemName, title, descriptions) {
        return {
            itemDescriptionAt: itemName + " Description section",
            value: "# " + itemName + " Description:\n" + title + ":\n\n" + descriptions.join("\n")
        };
    }

    /**
     * Returns a debug payload, non-essential
     * this is an arbitrary json object that was sent as payload for whatever the server is
     * 
     * @param {string} __debug_id
     * @returns {any | null}
     */
    getDebugPayload(__debug_id) {
        return this.__debug_last10TalkPayloads.find(p => p.id === __debug_id)?.payload || null;
    }
}
