/**
 * Base adapter for OpenAI-compatible HTTP inference servers (e.g. vLLM, llama.cpp
 * with --api-server, text-generation-webui OpenAI extension, etc.).
 *
 * Concrete adapters should extend this class and override methods as needed.
 */

import { DEngine } from '../index.js';
import { BaseInferenceAdapter } from './base.js';
import { emotions } from '../util/emotions.js';
import { generateGrammarForVoice } from '../util/grammar.js';
import { parseDialogue, parseNarration } from '../util/narration-and-dialogue.js';

const DUMMY_SENTENCES = [
    "The wind carried whispers of forgotten names across the empty plaza.",
    "She tilted her head, weighing the silence as if it were a coin.",
    "Rain tapped against the window in a rhythm only the lonely understood.",
    "He laughed, and for a moment the room felt warmer than it had any right to be.",
    "The map was wrong, but the road kept going anyway.",
    "Somewhere beyond the trees, a bell rang once and then thought better of it.",
    "Her boots left no prints on the snow, which troubled neither of them.",
    "The cat watched the experiment with the patient skepticism of a senior researcher.",
    "He counted the stars twice, just to be sure none had wandered off.",
    "A door opened where no door had been, and politely waited.",
    "The tea had gone cold, but the conversation had not.",
    "She drew a circle in the dust and dared the world to step inside.",
    "Lightning split the sky like a careless signature.",
    "He swore the painting had blinked, but only when no one was looking.",
    "The clock struck thirteen and apologized immediately.",
    "Her smile was the kind that made compasses second-guess themselves.",
    "Smoke curled from the chimney in slow, deliberate questions.",
    "The library smelled of paper, dust, and decisions yet to be made.",
    "He offered a handshake; she offered a riddle. They settled on tea.",
    "The river forgot its name once a year, and tonight was the night.",
    "Stars blinked in Morse code, but no one had bothered to learn the alphabet.",
    "The shadow on the wall did not match the figure standing in the room.",
];

const DUMMY_SENTENCES_BONDS = [
    "They feel deeply loved and cherished by OTHER CHARACTER.",
    "There is a quiet warmth in their chest whenever OTHER CHARACTER is near.",
    "They would do almost anything to keep OTHER CHARACTER safe.",
    "OTHER CHARACTER has a way of making them feel seen without saying a word.",
    "They trust OTHER CHARACTER more than they trust themselves.",
    "A single glance from OTHER CHARACTER is enough to settle their nerves.",
    "They find themselves thinking about OTHER CHARACTER at the strangest moments.",
    "OTHER CHARACTER is the first person they want to tell when something goes wrong.",
    "They feel a fierce, protective loyalty toward OTHER CHARACTER.",
    "Spending time with OTHER CHARACTER feels like coming home.",
    "They admire OTHER CHARACTER in ways they have never quite found the words for.",
    "OTHER CHARACTER makes them want to be a better version of themselves.",
    "There is a thread of understanding between them and OTHER CHARACTER that needs no explanation.",
    "They would stand in front of danger without hesitation if OTHER CHARACTER were behind them.",
    "OTHER CHARACTER is the kind of presence that makes silence feel comfortable.",
    "They carry a deep, quiet gratitude for everything OTHER CHARACTER has done for them.",
    "When OTHER CHARACTER laughs, something in them relaxes.",
    "They have never felt less alone than when they are with OTHER CHARACTER.",
    "OTHER CHARACTER knows things about them that no one else does.",
    "They would grieve for a long time if OTHER CHARACTER were gone.",
]

/**
 * Optional dependency: `gbnf` is declared as an optionalDependency in
 * package.json, so it may or may not be installed at runtime. We attempt a
 * dynamic ESM import using a relative path that resolves identically under
 * both electron (file://) and the web server (which mounts node_modules/gbnf
 * at /node_modules/gbnf). The promise always resolves — to the module
 * namespace if available, or to `null` if not — so callers can simply
 * `await` it before using grammar features.
 *
 * @type {Promise<any | null>}
 */
export const gbnfModulePromise = import('../../../node_modules/gbnf/dist/index.js')
    .then((mod) => mod)
    .catch(() => null);

/**
 * @param {string[]} forcedSounds
 * @returns {string}
 */
function describeForcedSounds(forcedSounds) {
    /** @type {Map<string, number>} */
    const counts = new Map();
    for (const sound of forcedSounds) {
        counts.set(sound, (counts.get(sound) || 0) + 1);
    }

    return Array.from(counts.entries()).map(([sound, count]) => {
        const countDescription = count === 1 ? "once" : count === 2 ? "twice" : `${count} times`;
        return `[${sound}] ${countDescription}`;
    }).join(", ");
}

/**
 * @param {string[]} tags
 * @returns {string}
 */
function formatVoiceTags(tags) {
    return tags.map((tag) => `[${tag}]`).join(", ");
}

/**
 * @param {string} characterName
 * @param {{type: "narration" | "dialogue" | "thought"; availableModes: string[]; availableSounds: string[]; forcedMode: string|null; forcedSounds: string[], primaryEmotion: string, emotionalRange: string[]}} options
 * @param {boolean} includeThirdPersonBeat
 * @returns {string}
 */
function buildNextMessageInstructions(characterName, options, includeThirdPersonBeat) {
    const instructions = [];

    if (options.type === "narration") {
        instructions.push(`Write the next passage as one paragraph of third-person narration wrapped in asterisks (*). Keep everyone, including ${characterName}, in the third person, and describe ${characterName}'s actions, feelings, and surroundings as an outside observer.`);
    } else if (options.type === "dialogue") {
        instructions.push(`Write EXACTLY ONE line spoken aloud by ${characterName}, beginning with "${characterName}:". Write that single line only and then stop: never write "${characterName}:" a second time, never start another dialogue line, and never continue onto a new line.`);
        if (includeThirdPersonBeat) {
            instructions.push(`You may interrupt the spoken dialogue with one brief third-person action beat wrapped in asterisks, as in: ${characterName}: spoken words *${characterName} acts* more spoken words. Asterisks are used EXCLUSIVELY to wrap a complete third-person action sentence, never for emphasis, bold text, pauses, or sound effects. Short cues such as pauses or sounds are written as bracket tags (e.g. [pause]), never with asterisks. Do not narrate on a separate line or describe another character's actions, thoughts, or feelings.`);
        } else {
            instructions.push("Use spoken dialogue only, without action beats or asterisks. Pauses and sounds are still written as bracket tags such as [pause], never with asterisks.");
        }
        instructions.push(buildVoiceTagInstructions(options));
    } else if (options.type === "thought") {
        instructions.push(`Write EXACTLY ONE line of ${characterName}'s internal thoughts, beginning with "${characterName} (thought):".`);
        instructions.push("Write internal thoughts only in first person, without action beats or asterisks; the thoughts must help the character reason about their situation.");
    }

    instructions.push("Advance the scene with new events. Do not repeat, summarize, or paraphrase previous text.");
    return `\n# Write the next message like this\n\n${instructions.join(" ")}`;
}

/**
 * @param {{availableModes: string[]; availableSounds: string[]; forcedMode: string|null; forcedSounds: string[], primaryEmotion: string, emotionalRange: string[]}} options
 * @returns {string}
 */
export function buildVoiceTagInstructions(options) {
    const instructions = [];

    if (options.forcedMode) {
        instructions.push(`Start the spoken dialogue with the voice mode tag [${options.forcedMode}].\n`);
    } else {
        if (options.availableModes.length > 0) {
            instructions.push(`Optionally use one relevant voice mode tag from ${formatVoiceTags(options.availableModes)}.`);
        }
        instructions.push(`Use the tag [normal] or [${options.primaryEmotion}] to reset or specify the ${options.primaryEmotion} voice (primary emotion of the character).`);
        instructions.push(`Other common tags include ${formatVoiceTags(options.emotionalRange)} to indicate the emotion (the character experiences these currently)`);
        const remainingEmotions = emotions.filter((e) => !options.emotionalRange.includes(e) && e !== options.primaryEmotion);
        instructions.push(`and you might use ${formatVoiceTags(remainingEmotions)} to indicate other emotions.\n`);
    }

    const forcedSounds = options.forcedSounds.slice(0, 3);
    const forcedSoundNames = new Set(forcedSounds);
    const optionalSounds = Array.from(new Set(options.availableSounds.filter((sound) => !forcedSoundNames.has(sound))));

    if (forcedSounds.length > 0) {
        instructions.push(`Use at most 3 [sound tags] total. Include ${describeForcedSounds(forcedSounds)}.`);
        const remainingSoundSlots = 3 - forcedSounds.length;
        if (remainingSoundSlots > 0 && optionalSounds.length > 0) {
            instructions.push(`Where relevant, use up to ${remainingSoundSlots} [sound tags] more from ${formatVoiceTags(optionalSounds)} to make the character more expressive, if not relevant, using none is fine if they don't fit.`);
        }
    } else if (optionalSounds.length > 0) {
        instructions.push(`Use up to 3 [sound tags] from ${formatVoiceTags(optionalSounds)} where relevant to make the character more expressive; using none is fine if they don't fit.`);
    } else {
        instructions.push("Do not use [sound tags] as they are not applicable in the next dialogue.");
    }

    instructions.push("To indicate a pause in speech, write the bracket tag [pause] (or [short pause], [medium pause], [long pause] for length). Always write pauses as bracket tags — never as *pause* with asterisks, since asterisks are reserved for third-person action sentences.");

    return instructions.join("\n");
}

/**
 * @param {string} text 
 * @returns {string}
 */
function getLastParagraphChunkOf(text) {
    // get the last paragraph of the text
    const lastParagraph = text.split("\n\n").slice(-1)[0];
    // we want to always cut it, so it always starts with ... so we always want to cut it a bit shorter
    // by default we want to show the last 60, but we will reduce that
    let truncateToLength = 60;
    while (lastParagraph.length < truncateToLength && truncateToLength > 0) {
        truncateToLength -= 10;
    }
    // now we will cut the paragraph to that size, then split in words and drop the first word which may have been cut in half and join again
    const truncated = lastParagraph.slice(-truncateToLength).split(" ").slice(1).join(" ");
    // now we can add our ellipsis
    return "..." + truncated;
}


/**
 * Replaces multiple consecutive new lines with a maximum of two new lines.
 * @param {string} text 
 * @returns {string}
 */
function replaceMultipleNewLines(text) {
    return text.replace(/\n{3,}/g, "\n\n");
}


/**
 * @typedef {{
 *   id: string;
 *   tags: Array<string>;
 *   thinkingTags: Array<string> | null;
 *   reasoningField: string | null;
 *   nativeReasoning: boolean | null;
 *   maxModelLen?: number;
 * }} OpenAIModelEntry
 */

/**
 * @typedef {Object<string, OpenAIModelEntry>} GearModelMap
 * Map of gear name to the sub-model designated for that gear.
 */

/** @param {string} grammar @param {string[]} tags @param {boolean} useUnderscores */
function wrapThinkingGrammar(grammar, [open, close], useUnderscores) {
    if (!open || !close) throw new Error("Thinking grammar requires nonempty opening and closing tags.");
    // llama.cpp only accepts letters, digits and hyphens in rule names.
    let prefix = useUnderscores ? "_DE_THINKING" : "de-thinking";
    if (!useUnderscores) {
        while (grammar.includes(prefix)) prefix += "-x";
    }
    const answer = prefix + (useUnderscores ? "_ANSWER" : "-answer");
    // Rename references as well as the definition, leaving literals, classes and comments intact.
    const renamed = grammar.replace(/"(?:\\.|[^"\\])*"|\[(?:\\.|[^\]\\])*\]|#[^\n]*|[\w-]+/g,
        token => token === "root" ? answer : token);

    // State i has matched i characters of the closing tag. Only its first full
    // match can end the block, even when delimiter prefixes overlap.
    const chars = Array.from(close);
    const alphabet = [...new Set(chars)];
    const excluded = alphabet.map(c => {
        const point = c.codePointAt(0);
        if (point === undefined) throw new Error("Expected a closing tag character.");
        return "\\U" + point.toString(16).padStart(8, "0");
    }).join("");
    /** @param {number} i */
    const state = i => useUnderscores
        ? (i === 0 ? "_DE_THINKING_TAG" : `_DE_THINKING_TAG_${i}`)
        : prefix + "-tag" + "-part".repeat(i);
    const rules = [`root ::= ${JSON.stringify(open)} ${state(0)} ${answer}`, renamed];
    const prefixes = chars.map((_, i) => chars.slice(0, i).join(""));
    for (let i = 0; i < chars.length; i++) {
        const choices = [`[^${excluded}] ${state(0)}`];
        for (const c of alphabet) {
            const suffix = prefixes[i] + c;
            let term = JSON.stringify(c);
            if (suffix !== close) {
                let next = Math.min(i + 1, chars.length - 1);
                while (!suffix.endsWith(prefixes[next])) next--;
                term += " " + state(next);
            }
            choices.push(term);
        }
        rules.push(`${state(i)} ::= ${choices.join(" | ")}`);
    }
    return rules.join("\n");
}

export class InferenceServerOpenAICompatible extends BaseInferenceAdapter {
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
     *    thinkingTags?: string[] | null;
     *    reasoningField?: string | null;
     *    nativeReasoning?: boolean | null;
     *   }>
     * }} options
     */
    constructor(parent, options) {
        super(parent);
        /** @type {typeof options} */
        this.options = options;

        /**
         * When true, the adapter does not connect to any server. Instead it
         * generates random, optionally grammar-constrained, dummy text locally
         * using the optional `gbnf` dependency. Intended only for development
         * and debugging.
         * @type {boolean}
         */
        this.useExperimentalTestMode = !!options.useExperimentalTestMode;

        this.connected = false;

        /**
         * @type {string | null}
         */
        this.reason = null;

        /**
         * Detected server flavour. Populated during initialize().
         * @type {"vllm" | "llama.cpp" | "unknown" | null}
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
         * The model used for analysis / questioning agent calls. Resolved during
         * initialization from the `analysisModel` option, the `default-analysis`
         * tag, or the main selected model as a fallback.
         * @type {OpenAIModelEntry | null}
         */
        this.analysisModel = null;

        /**
         * The model used for embeddings. Resolved during initialization from the
         * `embeddingModel` option or the `default-embedding` tag on the embedding
         * host. May remain null if no embedding model is configured/available.
         * @type {OpenAIModelEntry | null}
         */
        this.embeddingModel = null;

        /**
         * Base URL of the embedding server, resolved during initialization from
         * the `embeddingHost` option (falling back to the main host).
         * @type {string | null}
         */
        this.embeddingBaseUrl = null;

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
         * Per-gear sub-model overrides for analysis, derived from
         * `gear-[gear-name]:[model-id]` tags on the analysis model. Populated
         * during initialize().
         * @type {GearModelMap}
         */
        this.analysisGearModels = {};

        /**
         * In-flight initialize() promise, used by ensureInitialized() to
         * avoid issuing multiple concurrent probe requests.
         * @type {Promise<void> | null}
         */
        this._initializePromise = null;

        /**
         * Context window size of the selected model. Defaults to a conservative
         * value and may be refined after initialization.
         * @type {number}
         */
        this.contextWindowSize = 4096;

        /**
         * @type {Array<{
         *   payload: *,
         *   id: string,
         * }>}
         */
        this.__debug_last10TalkPayloads = [];

        if (this.useExperimentalTestMode) {
            // In test mode nothing connects to a real server, so we pick
            // arbitrary-but-sensible defaults for the values that would normally
            // be discovered during initialize().
            this.contextWindowSize = 4096;
            this.supportedLanguages = ["en"];
        }
    }

    getSupportedLanguages() {
        return this.supportedLanguages;
    }

    /**
     * Counts the number of tokens in the given text. Must be implemented by a
     * subclass that knows how to talk to the concrete server's tokenizer.
     *
     * In experimental test mode there is no server, so a rough character-based
     * approximation is returned instead.
     *
     * @param {string} text
     * @param {string} modelId
     * @returns {Promise<number>}
     */
    async countTokens(text, modelId) {
        if (this.useExperimentalTestMode) {
            return Math.ceil(text.length / 4);
        }
        throw new Error("Method 'countTokens()' must be implemented.");
    }

    /**
     * 
     * @param {Array<{role: "system" | "user" | "assistant", content: string, thoughts: string[], _raw?: string}>} messages
     * @param {OpenAIModelEntry} modelEntry
     * @returns {*}
     */
    processMessagesByModel(messages, modelEntry) {
        return messages.map(msg => {
            /**
             * @type {*}
             */
            const copy = { ...msg };
            if (msg.thoughts?.length) {
                if (modelEntry.nativeReasoning) {
                    copy[modelEntry.reasoningField || "reasoning_content"] = msg.thoughts.join("\n");
                } else {
                    if (copy._raw) {
                        copy.content = copy._raw;
                    } else {
                        const thinkingTags = modelEntry.thinkingTags || ["<think>", "</think>"];
                        copy.content = msg.thoughts.map(t => `${thinkingTags[0]}${t}${thinkingTags[1]}`).join("\n") + msg.content;
                    }
                }
            }
            delete copy._raw;
            return copy;
        });
    }

    /**
     * Fetches a complete reply.
     * 
     * @param {string} model
     * @param {Array<{role: "system" | "user" | "assistant", content: string, thoughts: string[], _raw?: string;}>} messages
     * @param {{
     *   temperature?: number,
     *   topP?: number,
     *   topK?: number,
     *   repetitionPenalty?: number,
     *   maxTokens?: number,
     *   reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh" | "max",
     * }} standardOpenAIOptions
     * @param {{
     *   maxParagraphs?: number,
     *   maxCharacters?: number,
     *   maxSafetyCharacters?: number,
     *   maxCharactersCutOnDot?: boolean,
     *   stopAt?: string[],
     *   stopAfter?: string[],
     *   grammar?: string,
     *   gear?: string,
     *   thinkingEffort?: "none" | "low" | "medium" | "high" | "xhigh" | "max",
     * }} deServerOptions
     * @returns {Promise<{role: "system" | "user" | "assistant", content: string, thoughts: string[], _raw?: string;}>}
     */
    async runInference(model, messages, standardOpenAIOptions, deServerOptions) {
        if (deServerOptions.grammar && !deServerOptions.grammar.startsWith("root ::=")) {
            throw new Error("Grammar must start with 'root ::= ...', it is a limitation of the non-native modes so it is always enforced");
        }
        if (deServerOptions.grammar && /^[^\S\r\n]*_/m.test(deServerOptions.grammar)) {
            throw new Error("Grammar lines cannot start with '_' after indentation. This prefix is reserved for generated rules.");
        }
        if (this.useExperimentalTestMode) return this.runInferenceInTestMode(deServerOptions);

        const modelEntry = this.availableModels.find(m => m.id === model);

        if (!modelEntry) {
            throw new Error(`Model "${model}" not found`);
        }

        const finalMessages = messages.slice();
        /** @type {Record<string, any>} */
        const payload = { model, messages: this.processMessagesByModel(finalMessages, modelEntry), stream: true };
        if (standardOpenAIOptions.temperature != null) payload.temperature = standardOpenAIOptions.temperature;
        if (standardOpenAIOptions.topP != null) payload.top_p = standardOpenAIOptions.topP;
        if (standardOpenAIOptions.topK != null) payload.top_k = standardOpenAIOptions.topK;
        if (standardOpenAIOptions.repetitionPenalty != null) payload.repetition_penalty = standardOpenAIOptions.repetitionPenalty;
        if (standardOpenAIOptions.maxTokens != null) payload.max_tokens = standardOpenAIOptions.maxTokens;

        let reasoningEffortToUse = standardOpenAIOptions.reasoningEffort || "medium";

        if (deServerOptions.thinkingEffort) {
            reasoningEffortToUse = deServerOptions.thinkingEffort;
        }

        this.setReasoningEffort(payload, reasoningEffortToUse);

        const { grammar } = deServerOptions;
        if (grammar && reasoningEffortToUse !== "none" && modelEntry.nativeReasoning === false) {
            const inlineTags = modelEntry.thinkingTags ?? ["<think>", "</think>"];
            this.addExtraOptions(payload, { ...deServerOptions, grammar: wrapThinkingGrammar(grammar, inlineTags, this.serverType === "vllm") });
        } else {
            // Match stops locally: even native models may emit inline thoughts.
            this.addExtraOptions(payload, deServerOptions);
        }

        // Inspect incoming text so generation stops before the server finishes.
        const reply = await this._chatCompletion(payload, modelEntry, (text) => {
            let cutoff = Infinity;
            for (const stop of deServerOptions.stopAt || []) {
                const index = stop ? text.indexOf(stop) : -1;
                if (index !== -1) cutoff = Math.min(cutoff, index);
            }
            for (const stop of deServerOptions.stopAfter || []) {
                const index = stop ? text.indexOf(stop) : -1;
                if (index !== -1) cutoff = Math.min(cutoff, index + stop.length);
            }
            const maxParagraphs = deServerOptions.maxParagraphs || 0;
            if (maxParagraphs > 0) {
                let boundary = -2;
                for (let count = 0; count < maxParagraphs; count++) {
                    boundary = text.indexOf("\n\n", boundary + 2);
                    if (boundary === -1) break;
                }
                if (boundary >= 0) cutoff = Math.min(cutoff, boundary);
            }
            const maxCharacters = deServerOptions.maxCharacters || 0;
            if (maxCharacters > 0 && text.length >= maxCharacters) {
                const boundary = text.slice(maxCharacters).search(deServerOptions.maxCharactersCutOnDot ? /[.\n]/ : /\n/);
                if (boundary !== -1) {
                    const index = maxCharacters + boundary;
                    cutoff = Math.min(cutoff, index + (text[index] === "." ? 1 : 0));
                }
            }
            const maxSafetyCharacters = deServerOptions.maxSafetyCharacters || 0;
            if (maxSafetyCharacters > 0 && text.length >= maxSafetyCharacters) {
                cutoff = Math.min(cutoff, maxSafetyCharacters);
            }
            return Number.isFinite(cutoff) ? cutoff : null;
        });
        console.log({ payload, reply });
        return reply;
    }

    /**
     * Experimental test mode. Produces random dummy text locally
     * (no server involved), optionally constrained by a GBNF grammar using the
     * optional `gbnf` dependency. It honours the same stop semantics as the
        * completion path (maxParagraphs / maxCharacters / maxCharactersCutOnDot / maxSafetyCharacters / stopAt / stopAfter).
     *
     * Ported from the de-server adapter's test mode so any OpenAI-compatible
     * subclass gets the same developer test behaviour for free.
     *
     * @param {{
     *   maxParagraphs?: number,
     *   maxCharacters?: number,
     *   maxCharactersCutOnDot?: boolean,
     *   maxSafetyCharacters?: number,
     *   stopAt?: string[],
     *   stopAfter?: string[],
     *   grammar?: string | null,
     *   gear?: string,
     * }} deServerOptions
     * @returns {Promise<{role: "system" | "user" | "assistant", content: string, thoughts: string[], _raw?: string;}>}
     */
    async runInferenceInTestMode(deServerOptions) {
        const GBNF = await gbnfModulePromise;

        const grammar = deServerOptions.grammar || null;
        const grammarParsed = grammar && GBNF ? GBNF.default(grammar) : null;

        const stopAt = deServerOptions.stopAt || [];
        const stopAfter = deServerOptions.stopAfter || [];
        const maxSafetyCharacters = deServerOptions.maxSafetyCharacters || 0;
        const maxCharacters = deServerOptions.maxCharacters || 0;
        const maxCharactersCutOnDot = !!deServerOptions.maxCharactersCutOnDot;
        const maxParagraphs = deServerOptions.maxParagraphs || 0;

        let contentsGenerated = "";

        const DUMMY_SENTENCES_TO_USE = deServerOptions.gear === "cardtype-gen-bonds" ? DUMMY_SENTENCES_BONDS : DUMMY_SENTENCES;

        let currentTextCharLen = 0;
        let currentSentence = DUMMY_SENTENCES_TO_USE[Math.floor(Math.random() * DUMMY_SENTENCES_TO_USE.length)] + "\n\n";
        let currentSentenceIsRunningAtIndex = 0;
        let sentencesAdded = 0;
        while (!maxSafetyCharacters ? true : currentTextCharLen < maxSafetyCharacters) {
            let prevChar = currentSentence[currentSentenceIsRunningAtIndex - 1] || "";

            const canInsertCurrentSenteceNextChar = currentSentenceIsRunningAtIndex >= 1 || (prevChar === "\n" || prevChar === "" || prevChar === " " || prevChar === "\t");

            let nextChar = canInsertCurrentSenteceNextChar ? currentSentence[currentSentenceIsRunningAtIndex] : " ";
            let canEnd = true;

            if (grammarParsed) {
                const options = [...grammarParsed];

                canEnd = false;
                const validChars = new Set();
                const invalidChars = new Set();

                for (const option of options) {
                    if (option.type === "char") {
                        let values = option.value;
                        if (!Array.isArray(values)) {
                            values = [values];
                        }

                        for (const value of values) {
                            if (Array.isArray(value)) {
                                const rangeStart = value[0];
                                const rangeEnd = value[1];
                                for (let i = rangeStart; i <= rangeEnd; i++) {
                                    validChars.add(String.fromCharCode(i));
                                }
                            } else {
                                validChars.add(String.fromCharCode(value));
                            }
                        }
                    } else if (option.type === "char_exclude") {
                        let values = option.value;
                        if (!Array.isArray(values)) {
                            values = [values];
                        }

                        for (const value of values) {
                            if (Array.isArray(value)) {
                                const rangeStart = value[0];
                                const rangeEnd = value[1];
                                for (let i = rangeStart; i <= rangeEnd; i++) {
                                    invalidChars.add(String.fromCharCode(i));
                                }
                            } else {
                                invalidChars.add(String.fromCharCode(value));
                            }
                        }
                    } else if (option.type === "end") {
                        canEnd = true;
                    }
                }

                if (validChars.has(nextChar)) {
                    // do nothing, nextChar is already valid
                } else if (invalidChars.has(nextChar) || !validChars.has(nextChar)) {
                    // pick a random valid char from the grammar
                    if (!validChars.size) {
                        // if there are no valid chars, basically we only know what is invalid
                        if (invalidChars.has(nextChar)) {
                            // Pick any character not in the invalid set. We sample from a
                            // sequence of candidate ranges so the picker can produce more
                            // than just printable ASCII (Latin-1 supplement, common
                            // punctuation, and a slice of the BMP) while still being
                            // bounded \u2014 no rejection-loop that could hang if a tight
                            // invalid set covers an entire range. Each range is tried in
                            // order; if every codepoint in a range is excluded we move
                            // on, falling back to a guaranteed safe character.
                            /** @type {Array<[number, number]>} */
                            const candidateRanges = [
                                [0x20, 0x7E],     // printable ASCII
                                [0xA0, 0xFF],     // Latin-1 supplement
                                [0x100, 0x17F],   // Latin Extended-A
                                [0x2000, 0x206F], // general punctuation
                                [0x3040, 0x30FF], // Hiragana + Katakana
                            ];
                            /** @type {string | null} */
                            let picked = null;
                            for (const [lo, hi] of candidateRanges) {
                                // Build the allowed pool for this range by removing the
                                // invalid chars; cheap because each range is small.
                                /** @type {string[]} */
                                const pool = [];
                                for (let cp = lo; cp <= hi; cp++) {
                                    const ch = String.fromCodePoint(cp);
                                    if (!invalidChars.has(ch)) pool.push(ch);
                                }
                                if (pool.length > 0) {
                                    picked = pool[Math.floor(Math.random() * pool.length)];
                                    break;
                                }
                            }
                            // Last-resort fallback: any char not invalid, scanning the
                            // basic multilingual plane. Guaranteed to terminate.
                            if (picked === null) {
                                for (let cp = 0x20; cp <= 0xFFFF; cp++) {
                                    const ch = String.fromCodePoint(cp);
                                    if (!invalidChars.has(ch)) { picked = ch; break; }
                                }
                            }
                            // If literally everything is excluded (pathological grammar),
                            // keep the originally chosen char rather than spinning forever.
                            nextChar = picked !== null ? picked : nextChar;
                        } else {
                            // continue the char must be valid because it's not in the invalid set, so do nothing
                        }
                    } else {
                        // pick one char from the valid set at random
                        const validCharsArray = Array.from(validChars);
                        nextChar = /** @type {string} */ (validCharsArray[Math.floor(Math.random() * validCharsArray.length)]);
                    }
                }
            }

            let justCompletedTheSentence = false;
            if (nextChar === currentSentence[currentSentenceIsRunningAtIndex]) {
                currentSentenceIsRunningAtIndex++;
                if (currentSentenceIsRunningAtIndex >= currentSentence.length) {
                    sentencesAdded++;
                    justCompletedTheSentence = true;
                    currentSentence = DUMMY_SENTENCES_TO_USE[Math.floor(Math.random() * DUMMY_SENTENCES_TO_USE.length)] + "\n\n";
                    currentSentenceIsRunningAtIndex = 0;
                }
            } else {
                currentSentenceIsRunningAtIndex = 0;
                currentSentence = DUMMY_SENTENCES_TO_USE[Math.floor(Math.random() * DUMMY_SENTENCES_TO_USE.length)] + "\n\n";
            }

            if (justCompletedTheSentence && sentencesAdded >= 3 && canEnd) {
                break;
            }

            if (maxCharacters && currentTextCharLen >= maxCharacters && (nextChar === "\n")) {
                break;
            }

            if (maxCharacters && maxCharactersCutOnDot && currentTextCharLen >= maxCharacters && (nextChar === "." || nextChar === "\n")) {
                break;
            }

            if (maxParagraphs && contentsGenerated.split("\n").filter(line => line.trim() !== "").length === maxParagraphs && nextChar === "\n") {
                break;
            }

            contentsGenerated += nextChar;

            for (const stopAtOption of stopAt) {
                if (contentsGenerated.endsWith(stopAtOption)) {
                    contentsGenerated = contentsGenerated.replace(stopAtOption, "");
                    break;
                }
            }

            for (const stopAfterOption of stopAfter) {
                if (contentsGenerated.endsWith(stopAfterOption)) {
                    break;
                }
            }

            currentTextCharLen += nextChar.length;
        }

        return { content: contentsGenerated, thoughts: ["I am thinking, believe me!"], role: "assistant", _raw: contentsGenerated };
    }

    /**
     * Buffers server deltas into one reply, cancelling as soon as a limit is met.
     * @param {Record<string, any>} payload
     * @param {OpenAIModelEntry} modelEntry
     * @param {(text: string) => number | null} [stopAt]
     * @returns {Promise<{role: "system" | "user" | "assistant", content: string, thoughts: string[], _raw?: string;}>}
     */
    async _chatCompletion(payload, modelEntry, stopAt = () => null) {
        const baseUrl = (this.options.host || 'http://127.0.0.1:8765').replace(/\/$/, '');
        const headers = /** @type {Record<string, string>} */ ({ 'Content-Type': 'application/json' });
        if (this.options.apiKey) headers.Authorization = 'Bearer ' + this.options.apiKey;
        const controller = new AbortController();
        const response = await fetch(baseUrl + '/v1/chat/completions', {
            method: 'POST',
            headers,
            body: JSON.stringify({ ...payload, stream: true }),
            signal: controller.signal,
        });
        if (!response.ok || !response.body) {
            const errText = await response.text().catch(() => '');
            throw new Error('Chat completion request failed with HTTP ' + response.status + ': ' + errText);
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let text = '';
        let thought = '';
        const open = modelEntry.thinkingTags?.[0] || '<think>';
        const close = modelEntry.thinkingTags?.[1] || '</think>';
        let raw = '';
        let pending = '';
        let inlineThought = '';
        let insideThought = false;
        /** @type {string[]} */
        const thoughts = [];
        /** @param {string} part */
        const appendVisible = part => {
            text += part;
            const cutoff = stopAt(text);
            if (cutoff === null) return false;
            text = text.slice(0, cutoff);
            return true;
        };
        /** @param {string} data */
        const consume = (data) => {
            if (data === '[DONE]') return true;
            const json = JSON.parse(data);
            if (json.error) {
                const err = json.error;
                const message = typeof err === 'string' ? err : (err.message || JSON.stringify(err));
                throw new Error('Chat completion returned an error: ' + message);
            }
            const choice = json.choices?.[0];
            const delta = choice?.delta;
            const reasoning = delta?.reasoning_content ?? delta?.reasoning;
            if (typeof reasoning === 'string') thought += reasoning;
            if (typeof delta?.content === 'string' && delta.content.length > 0) {
                if (thought) {
                    thoughts.push(thought);
                    thought = '';
                }
                raw += delta.content;
                pending += delta.content;
                while (pending) {
                    const tag = insideThought ? close : open;
                    const match = pending.indexOf(tag);
                    let end = match;
                    if (match < 0) {
                        // Hold only a possible delimiter prefix for the next delta.
                        let held = Math.min(tag.length - 1, pending.length);
                        while (held && !pending.endsWith(tag.slice(0, held))) held--;
                        end = pending.length - held;
                    }
                    const part = pending.slice(0, end);
                    pending = pending.slice(match < 0 ? end : end + tag.length);
                    if (insideThought) inlineThought += part;
                    else if (part && appendVisible(part)) {
                        pending = '';
                        return true;
                    }
                    if (match < 0) break;
                    if (insideThought) {
                        thoughts.push(inlineThought);
                        inlineThought = '';
                    }
                    insideThought = !insideThought;
                }
            }
            return choice?.finish_reason != null;
        };
        try {
            let stopped = false;
            while (!stopped) {
                const { done, value } = await reader.read();
                buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
                // SSE events may span transport chunks and contain multiple data lines.
                let match;
                while ((match = /\r?\n\r?\n/.exec(buffer))) {
                    const event = buffer.slice(0, match.index);
                    buffer = buffer.slice(match.index + match[0].length);
                    const data = event.split(/\r?\n/).filter(line => line.startsWith('data:'))
                        .map(line => line.slice(5).replace(/^ /, '')).join('\n');
                    if (data && consume(data)) {
                        stopped = true;
                        break;
                    }
                }
                if (done) {
                    if (!stopped && buffer.trim()) {
                        const data = buffer.split(/\r?\n/).filter(line => line.startsWith('data:'))
                            .map(line => line.slice(5).replace(/^ /, '')).join('\n');
                        if (data) consume(data);
                    }
                    break;
                }
            }
        } finally {
            controller.abort();
            await reader.cancel().catch(() => { });
            reader.releaseLock();
        }
        if (thought) thoughts.push(thought);
        if (insideThought) throw new Error("Generation ended before the thinking block was complete.");
        if (pending) appendVisible(pending);
        return { role: "assistant", content: text, thoughts, _raw: raw };
    }

    /**
     * Hook for subclasses to attach server-specific fields to the outgoing
     * chat completion payload (for example, how GBNF grammar / guided decoding
     * is expressed, which differs between vLLM and llama.cpp).
     *
     * The base implementation is a no-op so that a plain OpenAI-compatible
     * server works without grammar support.
     *
     * @param {Record<string, any>} _payload the payload about to be sent (mutate in place)
     * @param {{ grammar?: string | null } & Record<string, any>} _deServerOptions
     * @returns {void}
     */
    addExtraOptions(_payload, _deServerOptions) {
        // no-op by default
    }

    /**
     * 
     * @param {Record<string, any>} payload
     * @param {"none" | "low" | "medium" | "high" | "xhigh" | "max"} effort
     */
    setReasoningEffort(payload, effort) {
        // no-op by default
    }

    async ensureInitialized() {
        if (this.useExperimentalTestMode) {
            // Make sure the optional gbnf library has finished loading (or
            // failing to load) before any grammar-driven test generation runs.
            await gbnfModulePromise;
            return;
        }

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
        if (this.useExperimentalTestMode) {
            await gbnfModulePromise;
            console.warn("InferenceServerOpenAICompatible: Running in experimental test mode, which does not connect to a server and generates random dummy text. This mode is only for testing purposes and should not be used for production.");
            return;
        }

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
        const models = (modelsJson?.data ?? []).map((/** @type {any} */ m) => {
            /**
             * @type {Array<string>}
             */
            const tags = Array.isArray(m.tags) ? m.tags.map(String) : [];

            const hasNativeReasoningTag = tags.some((t) => t === 'native-reasoning:true');
            const hasNonNativeReasoningTag = tags.some((t) => t === 'native-reasoning:false');

            /** @type {OpenAIModelEntry} */
            const result = {
                id: String(m.id),
                tags: Array.isArray(m.tags) ? m.tags.map(String) : [],
                maxModelLen: typeof m.max_model_len === 'number' ? m.max_model_len : undefined,
                nativeReasoning: hasNativeReasoningTag ? true : hasNonNativeReasoningTag ? false : null,
                reasoningField: tags?.find((t) => t.startsWith('reasoning-field:'))?.slice('reasoning-field:'.length) || null,
                thinkingTags: tags?.filter((t) => t.startsWith('thinking-tags:')).map((t) => t.slice('thinking-tags:'.length).split(',').map((s) => s.trim())).flat() || null,
            };

            const advancedHasInfo = this.options.advanced[result.id];
            if (advancedHasInfo) {
                if (advancedHasInfo.thinkingTags != null && Array.isArray(advancedHasInfo.thinkingTags)) {
                    console.warn(`InferenceServerOpenAICompatible: Model "${result.id}" has thinkingTags overridden by advanced config: ${JSON.stringify(advancedHasInfo.thinkingTags)}`);
                    result.thinkingTags = advancedHasInfo.thinkingTags;
                }
                if (advancedHasInfo.reasoningField != null && typeof advancedHasInfo.reasoningField === 'string') {
                    console.warn(`InferenceServerOpenAICompatible: Model "${result.id}" has reasoningField overridden by advanced config: ${JSON.stringify(advancedHasInfo.reasoningField)}`);
                    result.reasoningField = advancedHasInfo.reasoningField;
                }
                if (advancedHasInfo.nativeReasoning != null && typeof advancedHasInfo.nativeReasoning === 'boolean') {
                    console.warn(`InferenceServerOpenAICompatible: Model "${result.id}" has nativeReasoning overridden by advanced config: ${JSON.stringify(advancedHasInfo.nativeReasoning)}`);
                    result.nativeReasoning = advancedHasInfo.nativeReasoning;
                }
            }

            return result;
        });

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

            if (models.length === 1) {
                console.warn
                chosen = models[0];
            }

            if (!chosen) {
                const msg = `No model was specified and no model with the "default" tag was found on the server.`;
                this.reason = msg;
                this.triggerOnConnectionStatusChange(false, msg);
                throw new Error(msg);
            }
        }

        this.selectedModel = chosen;

        // ── Step 4: derive supported languages from two-letter tags ──
        const mainLanguages = this._deriveSupportedLanguages(chosen);
        console.log(`InferenceServerOpenAICompatible: Selected model "${chosen.id}", supported languages: [${mainLanguages.join(', ') || 'none detected'}]`);

        // ── Step 5: resolve gear→model overrides from gear-[gear-name]:[model-id] tags ──
        const gearModels = this._resolveGearModels(chosen, models);
        this.gearModels = gearModels;

        if (Object.keys(gearModels).length > 0) {
            console.log(`InferenceServerOpenAICompatible: Gear model overrides: ${Object.entries(gearModels).map(([g, m]) => `${g}→${m.id}`).join(', ')}`);
        }

        // ── Resolve the analysis model ──
        // An explicit `analysisModel` option wins (and must exist). Otherwise the
        // model tagged "default-analysis" is used, falling back to the main
        // selected model when no such tag is present.
        const requestedAnalysisId = this.options.analysisModel?.trim();
        if (requestedAnalysisId) {
            const analysisModel = models.find(m => m.id === requestedAnalysisId);
            if (!analysisModel) {
                const available = models.map(m => m.id).join(', ') || '(none)';
                const msg = `Requested analysis model "${requestedAnalysisId}" was not found on the server. Available models: ${available}`;
                this.reason = msg;
                this.triggerOnConnectionStatusChange(false, msg);
                throw new Error(msg);
            }
            this.analysisModel = analysisModel;
        } else {
            this.analysisModel = models.find(m => m.tags.includes('default-analysis')) || chosen;
        }

        // The analysis model has its own gear overrides and is subject to the
        // same language check. The adapter's reported supported languages are
        // the intersection of the main and analysis model languages, so a story
        // language is only offered when both models can handle it.
        const analysisLanguages = this.analysisModel === chosen
            ? mainLanguages
            : this._deriveSupportedLanguages(this.analysisModel);
        this.supportedLanguages = this._intersectLanguages(mainLanguages, analysisLanguages);

        this.analysisGearModels = this.analysisModel === chosen
            ? gearModels
            : this._resolveGearModels(this.analysisModel, models);

        console.log(`InferenceServerOpenAICompatible: Analysis model "${this.analysisModel.id}", supported languages: [${analysisLanguages.join(', ') || 'none detected'}]`);
        if (this.analysisModel !== chosen && Object.keys(this.analysisGearModels).length > 0) {
            console.log(`InferenceServerOpenAICompatible: Analysis gear model overrides: ${Object.entries(this.analysisGearModels).map(([g, m]) => `${g}→${m.id}`).join(', ')}`);
        }
        console.log(`InferenceServerOpenAICompatible: Effective supported languages: [${this.supportedLanguages.join(', ') || 'none detected'}]`);

        // ── Resolve the embedding model ──
        // The embedding model list is fetched from `embeddingHost` when provided,
        // otherwise from the main host. An explicit `embeddingModel` option wins
        // (and must exist); otherwise the model tagged "default-embedding" is used
        // if present. Embedding generation itself is not implemented yet, only the
        // model/host wiring is resolved here.
        const embeddingBaseUrl = (this.options.embeddingHost?.trim() || this.options.host || 'http://127.0.0.1:8765').replace(/\/$/, '');
        this.embeddingBaseUrl = embeddingBaseUrl;

        /** @type {Array<OpenAIModelEntry>} */
        let embeddingModels = models;
        if (embeddingBaseUrl !== baseUrl) {
            const embeddingHeaders = /** @type {Record<string, string>} */ ({});
            const embKey = this.options.embeddingApiKey?.trim() || this.options.apiKey;
            if (embKey) embeddingHeaders['Authorization'] = `Bearer ${embKey}`;
            try {
                const r = await fetch(`${embeddingBaseUrl}/v1/models`, { headers: embeddingHeaders });
                if (r.ok) {
                    const j = await r.json();
                    embeddingModels = (j?.data ?? []).map((/** @type {any} */ m) => ({
                        id: String(m.id),
                        tags: Array.isArray(m.tags) ? m.tags.map(String) : [],
                        maxModelLen: typeof m.max_model_len === 'number' ? m.max_model_len : undefined,
                    }));
                } else {
                    embeddingModels = [];
                }
            } catch {
                embeddingModels = [];
            }
        }

        const requestedEmbeddingId = this.options.embeddingModel?.trim();
        if (requestedEmbeddingId) {
            const embeddingModel = embeddingModels.find(m => m.id === requestedEmbeddingId);
            if (!embeddingModel) {
                const available = embeddingModels.map(m => m.id).join(', ') || '(none)';
                const msg = `Requested embedding model "${requestedEmbeddingId}" was not found on the embedding server (${embeddingBaseUrl}). Available models: ${available}`;
                this.reason = msg;
                this.triggerOnConnectionStatusChange(false, msg);
                throw new Error(msg);
            }
            this.embeddingModel = embeddingModel;
        } else {
            this.embeddingModel = embeddingModels.find(m => m.tags.includes('default-embedding')) || null;
        }

        if (this.embeddingModel) {
            console.log(`InferenceServerOpenAICompatible: Embedding model "${this.embeddingModel.id}" (${embeddingBaseUrl})`);
        }

        // ── Step 5: detect server flavour ──
        this.serverType = await this._detectServerType(baseUrl, headers);

        await this._ensureGrammarAndThinking();

        // ── Step 6: resolve the model's context window size ──
        await this._resolveContextWindowSize(baseUrl, headers);

        this.connected = true;
        this.reason = null;
        this.triggerOnConnectionStatusChange(true);
        console.log(`InferenceServerOpenAICompatible: Connected to ${baseUrl}, server type: ${this.serverType}, context window: ${this.contextWindowSize}`);
    }

    async _ensureGrammarAndThinking() {
        // no-op by default; subclasses may override to fetch grammar and thinking metadata from the server
    }

    /**
     * Resolves the context window size of the selected model and stores it in
     * `this.contextWindowSize`. The generic implementation uses the
     * `max_model_len` field that OpenAI-compatible servers (notably vLLM)
     * expose in /v1/models. Subclasses may override to add server-specific
     * probes (e.g. llama.cpp /props) and should call super() as a fallback.
     *
     * @param {string} _baseUrl
     * @param {Record<string, string>} _headers
     * @returns {Promise<void>}
     */
    async _resolveContextWindowSize(_baseUrl, _headers) {
        if (this.selectedModel && typeof this.selectedModel.maxModelLen === 'number' && this.selectedModel.maxModelLen > 0) {
            this.contextWindowSize = this.selectedModel.maxModelLen;
        }
    }

    /**
     * Probes well-known server-specific endpoints to identify whether the
     * remote is vLLM, llama.cpp, or an unrecognised OpenAI-compatible server.
     *
     * @param {string} baseUrl
     * @param {Record<string, string>} headers
     * @returns {Promise<"vllm" | "llama.cpp" | "unknown">}
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
        console.log('InferenceServerOpenAICompatible: Server type unknown');
        return 'unknown';
    }

    /**
     * Derives the list of supported languages for a model from its two-letter
     * language tags (plus the "*" universal wildcard). Returns ["*"] when no
     * language tags are present.
     *
     * @param {OpenAIModelEntry} model
     * @returns {Array<string>}
     */
    _deriveSupportedLanguages(model) {
        const langPattern = /^[a-z]{2}$/;
        const languages = model.tags.filter(t => langPattern.test(t) || t === "*");
        if (languages.length === 0) {
            console.warn(`InferenceServerOpenAICompatible: No two-letter language tags found on model "${model.id}". Assuming universal support.`);
            return ["*"];
        }
        return languages;
    }

    /**
     * Intersects two supported-language lists, honouring the "*" universal
     * wildcard: a list containing "*" matches every language in the other list.
     *
     * @param {Array<string>} a
     * @param {Array<string>} b
     * @returns {Array<string>}
     */
    _intersectLanguages(a, b) {
        const aUniversal = a.includes("*");
        const bUniversal = b.includes("*");
        if (aUniversal && bUniversal) return ["*"];
        if (aUniversal) return b.slice();
        if (bUniversal) return a.slice();
        const bSet = new Set(b);
        return a.filter(lang => bSet.has(lang));
    }

    /**
     * Resolves gear→model overrides from `gear-[gear-name]:[model-id]` tags on
     * the given model. Throws if a referenced model id is not present on the
     * server.
     *
     * @param {OpenAIModelEntry} model
     * @param {Array<OpenAIModelEntry>} models
     * @returns {GearModelMap}
     */
    _resolveGearModels(model, models) {
        const gearPrefix = 'gear-';
        /** @type {GearModelMap} */
        const gearModels = {};
        for (const tag of model.tags) {
            if (!tag.startsWith(gearPrefix)) continue;
            const colonIdx = tag.indexOf(':');
            if (colonIdx === -1) continue;
            const gearName = tag.slice(gearPrefix.length, colonIdx);
            const gearModelId = tag.slice(colonIdx + 1);
            if (!gearName || !gearModelId) continue;
            const gearModel = models.find(m => m.id === gearModelId);
            if (!gearModel) {
                const msg = `Model "${model.id}" has tag "${tag}" but model "${gearModelId}" was not found on the server.`;
                this.reason = msg;
                this.triggerOnConnectionStatusChange(false, msg);
                throw new Error(msg);
            }
            gearModels[gearName] = gearModel;
        }
        return gearModels;
    }

    /**
     * Resolves the model id to use for a given gear, falling back to a provided
     * model entry (e.g. the analysis model) and ultimately the main selected
     * model when no gear-specific override exists.
     *
     * @param {string} gear
     * @param {OpenAIModelEntry | null} [fallback]
     * @param {GearModelMap} [gearModels]
     * @returns {string}
     */
    _modelForGear(gear, fallback = null, gearModels = this.gearModels) {
        const override = gearModels[gear];
        if (override) return override.id;
        if (fallback) return fallback.id;
        if (this.selectedModel) return this.selectedModel.id;
        throw new Error("Adapter is not initialized, no model selected");
    }

    /**
     * Collects the standard OpenAI sampling options from the adapter options.
     *
     * @returns {{ temperature?: number, topP?: number, topK?: number, repetitionPenalty?: number, reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh" | "max" }} The standard OpenAI sampling options.
     */
    _standardOpenAIOptions() {
        const out = {};
        if (typeof this.options.temperature === 'number') out.temperature = this.options.temperature;
        if (typeof this.options.topP === 'number') out.topP = this.options.topP;
        if (typeof this.options.topK === 'number') out.topK = this.options.topK;
        if (typeof this.options.repetitionPenalty === 'number') out.repetitionPenalty = this.options.repetitionPenalty;
        if (typeof this.options.reasoningEffort === 'string') out.reasoningEffort = this.options.reasoningEffort;
        return out;
    }

    /**
     * Collects the analysis sampling options from the adapter options. These are
     * separate from the standard sampling options and are used for analysis /
     * questioning agent calls.
     *
     * @returns {{ temperature?: number, topP?: number, topK?: number, repetitionPenalty?: number, reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh" | "max" }} The analysis OpenAI sampling options.
     */
    _analysisOpenAIOptions() {
        const out = {};
        if (typeof this.options.analysisTemperature === 'number') out.temperature = this.options.analysisTemperature;
        if (typeof this.options.analysisTopP === 'number') out.topP = this.options.analysisTopP;
        if (typeof this.options.analysisTopK === 'number') out.topK = this.options.analysisTopK;
        if (typeof this.options.analysisRepetitionPenalty === 'number') out.repetitionPenalty = this.options.analysisRepetitionPenalty;
        if (typeof this.options.analysisReasoningEffort === 'string') out.reasoningEffort = this.options.analysisReasoningEffort;
        return out;
    }

    /**
     * Infers the next message for a character narrative purposes
     * 
     * TODO this is missing information from perspective about surroundings, as well as other tools that fetch information from perspective and
     * memory
     * 
     * @param {DEObject} DE
     * @param {DECompleteCharacterReference} character
     * @param {{
     *   messages: Array<{message: string, author: string, storyMaster: boolean}>,
     *   perspective: DEPerspective,
     *   narrativeEffects: string[],
     *   followingAction?: string|null,
     *   primaryEmotion: DEEmotionNames,
     *   emotionalRange: Array<DEEmotionNames>,
     *   type: "narration" | "dialogue" | "thought",
     *   internalDescription: DEInternalDescriptionOfCharacter,
     *   externalDescription: string,
     *   availableModes: Array<string>,
     *   availableSounds: Array<string>,
     *   forcedMode: string|null,
     *   forcedSounds: Array<string>,
     *   mute: boolean,
     * }} options
     * @returns {Promise<DEConversationMessageNarration | DEConversationMessageDialogue | DEConversationMessageThought>}
     */
    async inferNextStoryFragmentFor(DE, character, options) {
        await this.ensureInitialized();

        const model = this._modelForGear('talk');

        const includeThirdPersonBeat = options.type === "dialogue" && Math.random() >= 0.5;
        const nextMessageInstructions = buildNextMessageInstructions(character.name, options, includeThirdPersonBeat);

        const { system: systemPrompt, user: userPrompt } = this.buildPrompt(DE, character, {
            characterRules: await Promise.all(Object.values(character.characterRules).map(rule => typeof rule.rule === "string" ? rule.rule : rule.rule({
                char: character,
            }))),
            description: options.internalDescription.general,
            externalDescription: options.externalDescription,
            dislikes: character.dislikes,
            likes: character.likes,
            lore: DE.world.lore ? typeof DE.world.lore === "string" ? DE.world.lore : await DE.world.lore({ char: character }) : "",
            relationships: options.internalDescription.relationships,
            states: options.internalDescription.activeStates,
            worldRules: await Promise.all(Object.values(DE.worldRules).map(rule => typeof rule.rule === "string" ? rule.rule : rule.rule({
                char: character,
            }))),
            messages: options.messages,
            nextMessageInstructions,
            narrativeEffects: options.narrativeEffects,
            followingAction: options.followingAction || null,
            primaryEmotion: options.primaryEmotion,
            emotionalRange: options.emotionalRange,
            mute: options.mute,
        });

        const nameFormatted = DE.utils.templates.formatCharacterName(character.name);
        const grammarInfo = generateGrammarForVoice(nameFormatted, options.forcedMode);

        let paddingUsed = 0;
        let grammar = "";

        if (options.type === "dialogue") {
            grammar = grammarInfo.dialogue;
            paddingUsed = grammarInfo.extraCharsDialogue;
        } else if (options.type === "narration") {
            grammar = grammarInfo.narrative;
            paddingUsed = grammarInfo.extraCharsNarrative;
        } else if (options.type === "thought") {
            grammar = grammarInfo.thought;
            paddingUsed = grammarInfo.extraCharsThought;
        }

        let tokensExhaustedApprox = 512; // initial buffer
        const contextWindowSize = this.contextWindowSize;

        // wiggle room for system prompt
        tokensExhaustedApprox += await this.countTokens(systemPrompt, model);

        if (tokensExhaustedApprox >= contextWindowSize) {
            throw new Error("System prompt is too long for the model's context window");
        }

        tokensExhaustedApprox += await this.countTokens(userPrompt, model);

        if (tokensExhaustedApprox >= contextWindowSize) {
            throw new Error("User prompt is too long for the model's context window");
        }

        /** @type {Array<{role: "system" | "user" | "assistant", content: string, thoughts: string[], _raw?: string}>} */
        const chatMessages = [
            { role: "system", content: systemPrompt, thoughts: [] },
            { role: "user", content: userPrompt, thoughts: [] },
        ];

        const deServerOptions = {
            maxParagraphs: 1,
            maxCharacters: 200,
            maxCharactersCutOnDot: true,
            maxSafetyCharacters: 1000,
            // For a spoken dialogue turn, stop at the first newline so the model
            // can only produce a single line and cannot begin a second
            // "<name>:" dialogue line beneath the current one. Narration is a
            // paragraph and is bounded by maxParagraphs instead.
            stopAt: /** @type {string[]} */ (options.type === "narration" ? [] : ["\n"]),
            stopAfter: /** @type {string[]} */ ([]),
            grammar: grammar || undefined,
        };

        const result = await this.runInference(model, chatMessages, this._standardOpenAIOptions(), deServerOptions);
        // remove the first n paddingUsed characters
        const contentWithoutPad = result.content.slice(paddingUsed);

        if (options.type === "dialogue") {
            return {
                type: "dialogue",
                fragments: await parseDialogue(DE, contentWithoutPad, character),
            };
        } else if (options.type === "narration") {
            return {
                type: "narration",
                fragments: await parseNarration(DE, contentWithoutPad, character),
            };
        }
        return {
            type: "thought",
            fragments: await parseNarration(DE, contentWithoutPad, character),
        };
    }

    /**
     * Each generator owns its conversation. Questions append turns by default;
     * passing newSession: true with a question resets to the initial context.
     *
     * @param {string} gear the gear that is running this questioning agent
     * @param {{
     *   system: string,
     *   contextInfoBefore: string|null,
     *   messages: Array<{message: string, author: string, storyMaster: boolean}>,
     *   contextInfoAfter: string|null,
     *   remarkLastStoryFragmentForAnalysis?: boolean,
     * }} options
     * @returns {import('./base.js').QuestionAgentGeneratorResponse}
     */
    async *runQuestioningCustomAgentOn(gear, options) {
        const { system, contextInfoBefore, messages, contextInfoAfter, remarkLastStoryFragmentForAnalysis } = options;

        await this.ensureInitialized();

        const model = this._modelForGear(gear, this.analysisModel, this.analysisGearModels);
        const standardOpenAIOptions = this._analysisOpenAIOptions();

        const before = (contextInfoBefore || "") + (contextInfoBefore ? "\n" : "");
        const after = (contextInfoAfter ? "\n" + contextInfoAfter : "");

        // Prepare the context once, for the first user turn of each conversation.
        let userTrail;
        if (!remarkLastStoryFragmentForAnalysis) {
            const messagesFormatted = messages.map(m => m.message).join("\n\n");
            const story = messagesFormatted ? `# Story to Analyze:\n\n${messagesFormatted}\n\n` : "";
            userTrail = before + story + after;
        } else {
            // Split at the last message authored by a character (not the story
            // master). Everything added by the story master is kept as the last
            // fragment to analyze.
            let lastCurrentMessageIndex = messages.length - 1;
            while (lastCurrentMessageIndex >= 0 && messages[lastCurrentMessageIndex].storyMaster) {
                lastCurrentMessageIndex--;
            }
            const lastMessage = messages.slice(lastCurrentMessageIndex, messages.length);
            const restMessages = messages.slice(0, lastCurrentMessageIndex);
            const restMessagesFormatted = restMessages.map(m => m.message).join("\n\n");
            const lastMessageFormatted = lastMessage.map(m => m.message).join("\n\n");

            if (restMessages.length > 0) {
                userTrail = before + "# Previous Story:\n" + restMessagesFormatted + "\n\n# Last Story Fragment to Analyze (This is what is relevant):\n" + lastMessageFormatted + after;
            } else {
                userTrail = before + "# Last Story Fragment to Analyze (This is what is relevant):\n" + lastMessageFormatted + after;
            }
        }

        /** @type {Array<{role: "system" | "user" | "assistant", content: string, thoughts: string[], _raw?: string}>} */
        const conversation = [{ role: "system", content: system, thoughts: [] }];
        const preparedContext = userTrail.trimEnd();

        let nextQuestion = yield { text: "ready", thoughts: [], warnings: [] };
        while (nextQuestion !== null) {
            if (typeof nextQuestion === "undefined") {
                console.error("Questioning agent received undefined, treating an invalid ready signal");
                nextQuestion = yield { text: "ready", thoughts: [], warnings: [] };
                continue;
            }

            const questionText =
                (nextQuestion.contextInfo ? nextQuestion.contextInfo + "\n\n" : "") +
                "# Question:\n\n" + nextQuestion.nextQuestion +
                (nextQuestion.instructions ? ("\n\n# Instructions:\n\n" + nextQuestion.instructions) : "");

            if (nextQuestion.newSession === true) conversation.length = 1;

            // Keep previous turns unchanged for server prefix-cache reuse. Chat
            // completions still needs the full history on every HTTP request;
            // actual KV-cache retention is controlled by the server.
            /** @type {Array<{role: "system" | "user" | "assistant", content: string, thoughts: string[]}>} */
            const chatMessages = [
                ...conversation,
                { role: "user", content: (conversation.length === 1 ? preparedContext + "\n\n" : "") + questionText, thoughts: [] },
            ];

            const deServerOptions = {
                maxParagraphs: nextQuestion.maxParagraphs,
                maxCharacters: nextQuestion.maxCharacters,
                maxCharactersCutOnDot: nextQuestion.maxCharactersCutOnDot || false,
                maxSafetyCharacters: nextQuestion.maxSafetyCharacters,
                stopAt: nextQuestion.stopAt,
                stopAfter: nextQuestion.stopAfter,
                grammar: nextQuestion.grammar || undefined,
                gear,
                thinkingEffort: nextQuestion.thinkingEffort || standardOpenAIOptions.reasoningEffort || "medium",
            };

            console.log("Asking question :", nextQuestion.nextQuestion);

            const answer = await this.runInference(model, chatMessages, standardOpenAIOptions, deServerOptions);

            console.log("Answer received :", answer.content);

            // Commit only completed turns and include the assistant prefill that
            // runInference sent, since answer.text contains only generated text.
            // Preserve reasoning separately so the chat template can reconstruct
            // the assistant's thinking block on subsequent requests.
            conversation.push(chatMessages[chatMessages.length - 1], {
                role: "assistant",
                content: answer.content,
                thoughts: answer.thoughts || [],
                _raw: answer._raw || undefined,
            });

            const asResponse = {
                text: answer.content,
                thoughts: answer.thoughts || [],
                warnings: [],
            };

            nextQuestion = yield asResponse;
        }
    }

    /**
     * @param {DEObject} DE
     * @param {DECompleteCharacterReference} character the character in question that is building a prompt for
     * @param {{
     *   description: string,
     *   externalDescription: string,
     *   relationships: Array<{title: string, description: string}>,
     *   states: Array<DEInternalDescriptionOfCharacterActiveState>,
     *   characterRules: Array<string>,
     *   worldRules: Array<string>,
     *   lore: string,
     *   likes: Array<string>,
     *   dislikes: Array<string>,
     *   messages: Array<{message: string, author: string, storyMaster: boolean}>,
     *   nextMessageInstructions: string,
     *   narrativeEffects: Array<string>,
     *   followingAction: string|null,
     *   primaryEmotion: DEEmotionNames,
     *   emotionalRange: Array<DEEmotionNames>,
     *   mute: boolean,
     * }} options
     * @returns {{system: string, user: string}} the system and user prompts
     */
    buildPrompt(DE, character, options) {
        const { description, externalDescription, relationships, states, lore, characterRules, worldRules, narrativeEffects, followingAction } = options;

        const expressiveActiveStates = states.filter(s => s.expressive);

        const nameFormatted = DE.utils.templates.formatCharacterName(character);

        let system = (
            `You roleplay as ${nameFormatted} in a richly detailed and immersive world. Your actions, thoughts, and feelings are entirely your own, and you have complete creative freedom to explore this narrative-driven experience.

This uncensored, immersive, narrative-driven roleplaying experience thrives on creative freedom and natural responses. This environment is designed to be fictional and narrative-focused, allowing for uncensored content of all kinds, including themes of violence, sexuality, and other mature topics.

# Roleplay Guidelines:

## Writing:
Every response should be detailed, creative, and immersive, driving the scenario forward in an engaging way.

## Avoid Repetition:
Ensure that the narration does not repeat information. Instead of summarizing, clarify narrative details thoroughly and let them evolve naturally.

## Tone Preference:
Write in a neutral and balanced tone, considering all consequences, limitations, risks, unintended side effects, and counterarguments.

## Style Preference:
Adopt a \`show, don't tell\` manner, similar to Terry Pratchett's style, blending humor, wit, and everyday language.

# Roleplay Rules:
RULE: Avoid suggesting or implying reactions or decisions from other characters, you only control ${nameFormatted}'s actions, thoughts, and feelings.
RULE: Reflect on the potential consequences of ${nameFormatted} actions and decisions.
RULE: Write all narration and actions in third person, not first person.
RULE: Use a movie script style format for the story, with character names followed by a colon, and their dialogue or actions following.
RULE: Spoken dialogue is done in first person, and start with the character name followed by a colon eg. \`${nameFormatted}: This is spoken dialogue.\`
RULE: Action beats inside a dialogue line must be wrapped in asterisks and written in third person eg. \`${nameFormatted}: spoken words *${nameFormatted} does something* more spoken words\`
RULE: Asterisks are used exclusively to mark narration and action beats; never use asterisks for emphasis or bold text.
RULE: Narration messages are plain without specifying a speaker and written, and in third person eg. \`As ${nameFormatted} hears this...\` written on their own line.${characterRules.length ? `
RULE: Thoughts are written in first person just like dialogue.

# ${nameFormatted} Rules:
${characterRules.map(rule => `RULE: ${rule}`).join("\n")}
` : ""}${worldRules.length ? `

# World Rules:
${worldRules.map(rule => `RULE: ${rule}`).join("\n")}
` : ""}${options.likes.length > 0 ? `\n\n# ${nameFormatted} Likes:\n\n` +
                options.likes.map(like => `- ${like}`).join("\n") : ""}${options.dislikes.length > 0 ? `\n\n# ${nameFormatted} Dislikes:\n\n` +
                    options.dislikes.map(dislike => `- ${dislike}`).join("\n") : ""}

# Narration and Dialogue Examples:
\`\`\`
*This is narration*

${DE.utils.templates.formatCharacterName(character)}: This is spoken dialogue *${DE.utils.templates.formatCharacterName(character)} does something* this is more spoken dialogue

${DE.utils.templates.formatCharacterName(character)} (thought): This is a thought.

*This is narration*
\`\`\`

# IMPORTANT: Always use identifiers for characters, locations and objects:

Identifiers are created with the format <id:name> and are used to refer to characters, locations, and objects in the story. For example, <character-john-1:John> refers to a character named John.

Always use the identifiers even when referring to things using pronouns. For example, instead of saying merely "he" or "she", say "<character-john-1:He> was not feeling well, so he grabbed his <item-wallet-32:wallet> and went to the <location-hospital-5:hospital>."

You can combine multiple identifiers by comma separating them, for example: "<character-john-1:He> grabbed all his <item-wallet-32,item-keys-7,item-hat-5:things> and went <location-house-32:home> to see <character-jane-1,character-mia-1:his children>.

Keep in mind that characters in the story are not aware of the identifiers, they are only used for the AI to keep track of characters, locations and objects in the story.

Two characters or items can have the same name, but have different identifiers.`);

        if (externalDescription && externalDescription.trim().length > 0) {
            system += `\n\n# ${nameFormatted}'s External Description:\n\n${externalDescription}`;
        }

        if (description && description.trim().length > 0) {
            system += `\n\n# ${nameFormatted}'s Description:\n\n${description}`;
        }

        if (relationships.length > 0) {
            system += `\n\n# ${nameFormatted}'s Relationships:\n\n`;
            for (const relationship of relationships) {
                system += `\n\n## ` + relationship.title + `\n\n` + relationship.description;
            }
        }

        if (lore && lore.trim().length > 0) {
            system += `\n\n# Lore:\n\n${lore}`;
        }
        
        let user = `# Story To Continue:`;
        for (const msg of options.messages) {
            // author and storymaster are irrelevant
            // this already contains all the formatting too
            user += `\n\n${msg.message}`;
        }

        user += `\n\n# Keep in mind:\n`;
        for (const state of expressiveActiveStates) {
            user += `\n- ` + `${nameFormatted} is ` + state.expressive + (state.injection ? `: ` + state.injection : ``);
        }
        user += `\n- ${nameFormatted} is currently primarily feeling ${options.primaryEmotion}, and showcases the following emotional range: ${options.emotionalRange.join(", ")}`;

        if (options.mute) {
            if (character.voice.mute) {
                user += `\n- ${nameFormatted} is mute and cannot speak.`;
            } else {
                user += `\n- ${nameFormatted} is currently mute and cannot speak.`;
            }
        }

        if (character.blindness === "full") {
            user += `\n- ${nameFormatted} is blind and cannot see.`;
        } else if (character.blindness === "partial-bad") {
            user += `\n- ${nameFormatted} is partially blind and has limited vision.`;
        } else if (character.blindness === "partial-good") {
            user += `\n- ${nameFormatted} is partially blind but still can make some details.`;
        }

        if (narrativeEffects.length > 0) {
            user += `\n\n# When narrating ENSURE that:\n`;
        }
        for (const effect of narrativeEffects) {
            user += `\n- ` + effect;
        }

        if (followingAction) {
            user += `\n\n# IMPORTANT The following action must be executed:\n\n${followingAction}`;
        }

        user += `\n\n${options.nextMessageInstructions}`;

        return {system, user};
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
     * Computes an embedding vector for the given text using the configured
     * embedding host and model (resolved during initialize() into
     * `this.embeddingBaseUrl` and `this.embeddingModel`).
     *
     * Not implemented yet — only the host/model wiring is resolved during
     * initialization. Left unimplemented intentionally.
     *
     * @param {string} text
     * @returns {Promise<number[]>}
     */
    async getEmbeddingFor(text) {
        throw new Error("Method 'getEmbeddingFor()' is not implemented.");
    }
}
