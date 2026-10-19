/**
 * Base adapter for OpenAI-compatible HTTP inference servers (e.g. vLLM, llama.cpp
 * with --api-server, text-generation-webui OpenAI extension, etc.).
 *
 * Concrete adapters should extend this class and override methods as needed.
 */

import { DEngine } from '../index.js';
import { BaseInferenceAdapter } from './base.js';
import { emotions } from '../util/emotions.js';

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
 * @param {{narration: boolean; modes: string[]; sounds: string[]; forcedMode: string|null; forcedSounds: string[], primaryEmotion: string, emotionalRange: string[]}} options
 * @param {boolean} includeThirdPersonBeat
 * @returns {string}
 */
function buildNextMessageInstructions(characterName, options, includeThirdPersonBeat) {
    const instructions = [];

    if (options.narration) {
        instructions.push(`Write the next passage as one paragraph of third-person narration wrapped in asterisks (*). Keep everyone, including ${characterName}, in the third person, and describe ${characterName}'s actions, feelings, and surroundings as an outside observer.`);
    } else {
        instructions.push(`Write EXACTLY ONE line spoken aloud by ${characterName}, beginning with "${characterName}:". Write that single line only and then stop: never write "${characterName}:" a second time, never start another dialogue line, and never continue onto a new line.`);
        if (includeThirdPersonBeat) {
            instructions.push(`You may interrupt the spoken dialogue with one brief third-person action beat wrapped in asterisks, as in: ${characterName}: spoken words *${characterName} acts* more spoken words. Asterisks are used EXCLUSIVELY to wrap a complete third-person action sentence, never for emphasis, bold text, pauses, or sound effects. Short cues such as pauses or sounds are written as bracket tags (e.g. [pause]), never with asterisks. Do not narrate on a separate line or describe another character's actions, thoughts, or feelings.`);
        } else {
            instructions.push("Use spoken dialogue only, without action beats or asterisks. Pauses and sounds are still written as bracket tags such as [pause], never with asterisks.");
        }
        instructions.push(buildVoiceTagInstructions(options));
    }

    instructions.push("Advance the scene with new events. Do not repeat, summarize, or paraphrase previous text.");
    return `\n# Write the next message like this\n\n${instructions.join(" ")}`;
}

/**
 * @param {{modes: string[]; sounds: string[]; forcedMode: string|null; forcedSounds: string[], primaryEmotion: string, emotionalRange: string[]}} options
 * @returns {string}
 */
export function buildVoiceTagInstructions(options) {
    const instructions = [];

    if (options.forcedMode) {
        instructions.push(`Start the spoken dialogue with the voice mode tag [${options.forcedMode}].\n`);
    } else {
        if (options.modes.length > 0) {
            instructions.push(`Optionally use one relevant voice mode tag from ${formatVoiceTags(options.modes)}.`);
        }
        instructions.push(`Use the tag [normal] or [${options.primaryEmotion}] to reset or specify the ${options.primaryEmotion} voice (primary emotion of the character).`);
        instructions.push(`Other common tags include ${formatVoiceTags(options.emotionalRange)} to indicate the emotion (the character experiences these currently)`);
        const remainingEmotions = emotions.filter((e) => !options.emotionalRange.includes(e) && e !== options.primaryEmotion);
        instructions.push(`and you might use ${formatVoiceTags(remainingEmotions)} to indicate other emotions.\n`);
    }

    const forcedSounds = options.forcedSounds.slice(0, 3);
    const forcedSoundNames = new Set(forcedSounds);
    const optionalSounds = Array.from(new Set(options.sounds.filter((sound) => !forcedSoundNames.has(sound))));

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
 *   maxModelLen?: number;
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
     * }} options
     */
    constructor(parent, options) {
        super(parent);
        /** @type {{ host?: string; embeddingHost?: string; apiKey?: string; embeddingApiKey?: string; temperature?: number; topP?: number; topK?: number; repetitionPenalty?: number; analysisTemperature?: number; analysisTopP?: number; analysisTopK?: number; analysisRepetitionPenalty?: number; analysisReasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh" | "max"; model?: string; analysisModel?: string; embeddingModel?: string; useExperimentalTestMode?: boolean; reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh" | "max"; }} */
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
     * @returns {Promise<number>}
     */
    async countTokens(text) {
        if (this.useExperimentalTestMode) {
            return Math.ceil(text.length / 4);
        }
        throw new Error("Method 'countTokens()' must be implemented.");
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
     *   reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh" | "max",
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
     *   },
     *   grammar?: string,
     *   gear?: string,
     * }} deServerOptions
     * @returns {AsyncGenerator<string, void, void>}
     */
    async *deServerStreamEmulator(model, messages, standardOpenAIOptions, deServerOptions) {
        if (this.useExperimentalTestMode) {
            yield* this.runInferenceInTestMode(deServerOptions);
            return;
        }

        const escapeRegExp = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regexStopAfter = (deServerOptions.stopAfter || []).map(
            s => new RegExp(`(^|[.,;])\\s*${escapeRegExp(s)}\\s*([.,;]|$)`, 'i')
        );

        const wr = deServerOptions.wordRejection || null;
        const delimiters = (wr?.delimiters || []).filter(d => typeof d === 'string' && d.length > 0);
        const maxDelimLen = delimiters.reduce((m, d) => Math.max(m, d.length), 0);

        // These accumulate across reprocessing passes (forbidden-word rejection
        // restarts the generation with the already-produced text folded into the
        // assistant trail and a post-rejection grammar applied).
        let trail = deServerOptions.trail || "";
        let grammar = deServerOptions.grammar || null;
        let inDialogue = wr ? !!wr.startsInDialogue : false;
        let remainingMaxCharacters = deServerOptions.maxCharacters || 0;
        let remainingMaxSafetyCharacters = deServerOptions.maxSafetyCharacters || 0;
        let remainingMaxParagraphs = deServerOptions.maxParagraphs || 0;

        while (true) {
            // ── Build the OpenAI chat completion payload ──
            const finalMessages = messages.slice();
            if (trail) {
                finalMessages.push({ role: "assistant", content: trail });
            }

            /** @type {Record<string, any>} */
            const payload = {
                model,
                messages: finalMessages,
                stream: true,
            };
            if (standardOpenAIOptions.temperature != null) payload.temperature = standardOpenAIOptions.temperature;
            if (standardOpenAIOptions.topP != null) payload.top_p = standardOpenAIOptions.topP;
            if (standardOpenAIOptions.topK != null) payload.top_k = standardOpenAIOptions.topK;
            if (standardOpenAIOptions.repetitionPenalty != null) payload.repetition_penalty = standardOpenAIOptions.repetitionPenalty;
            if (standardOpenAIOptions.maxTokens != null) payload.max_tokens = standardOpenAIOptions.maxTokens;
            if (deServerOptions.stopAt && deServerOptions.stopAt.length > 0) payload.stop = deServerOptions.stopAt;

            // Hand off to the subclass for any server-specific fields (e.g. how
            // grammar/guided decoding is expressed, and how the assistant `trail`
            // is continued — which differs between vLLM and llama.cpp). This base
            // implementation is intentionally unaware of the concrete server.
            this.addExtraOptions(payload, { ...deServerOptions, trail, grammar });
            this.setReasoningEffort(payload, standardOpenAIOptions.reasoningEffort || "medium");

            const controller = new AbortController();

            // `pending` holds text that has been received but not yet yielded. When
            // word rejection is active we may hold back the trailing in-progress
            // word (and any partially-formed delimiter) so that a forbidden word is
            // never emitted before it can be detected. When word rejection is off
            // `pending` is flushed on every chunk (we can be as granular as the
            // server's own streaming, down to a few characters at a time).
            let pending = "";
            let producedText = "";
            let aborted = false;
            let finished = false;

            /** @type {{textAfter: string, postGrammar: string|null} | null} */
            let rejected = null;

            // Number of trailing characters of `pending` that must be held back to
            // avoid emitting a partial forbidden word or a partially-formed
            // multi-character delimiter.
            const computeHoldBack = () => {
                if (!wr) return 0;
                let i = pending.length;
                while (i > 0 && /\w/.test(pending[i - 1])) i--;
                const holdWord = pending.length - i;
                const holdDelim = Math.min(pending.length, Math.max(0, maxDelimLen - 1));
                return Math.max(holdWord, holdDelim);
            };

            const countParagraphs = (/** @type {string} */ text) => {
                let count = 0;
                for (let i = 0; i < text.length - 1; i++) {
                    if (text[i] === '\n' && text[i + 1] === '\n') count++;
                }
                return count;
            };

            for await (const chunk of this._streamChatCompletion(payload, controller.signal)) {
                producedText += chunk;
                pending += chunk;

                // ── maxParagraphs: stop at the paragraph boundary ──
                if (remainingMaxParagraphs > 0 && countParagraphs(producedText) >= remainingMaxParagraphs) {
                    const partBeforeNew = pending.split('\n')[0];
                    if (partBeforeNew.length > 0) yield partBeforeNew;
                    pending = "";
                    aborted = true;
                    controller.abort();
                    break;
                }

                // ── maxCharacters: soft limit, cut at next newline (or dot) ──
                if (remainingMaxCharacters > 0 && producedText.length >= remainingMaxCharacters) {
                    if (chunk.indexOf('\n') !== -1) {
                        const partBeforeNew = pending.split('\n')[0];
                        if (partBeforeNew.length > 0) yield partBeforeNew;
                        pending = "";
                        aborted = true;
                        controller.abort();
                        break;
                    } else if (deServerOptions.maxCharactersCutOnDot && chunk.indexOf('.') !== -1) {
                        const partBeforeDot = pending.split('.')[0];
                        if (partBeforeDot.length > 0) yield partBeforeDot + '.';
                        pending = "";
                        aborted = true;
                        controller.abort();
                        break;
                    }
                }

                // ── maxSafetyCharacters: hard limit, flush and abort ──
                if (remainingMaxSafetyCharacters > 0 && producedText.length >= remainingMaxSafetyCharacters) {
                    if (pending.length > 0) yield pending;
                    pending = "";
                    aborted = true;
                    controller.abort();
                    break;
                }

                // ── stopAfter: regex trigger, abort without further emit ──
                if (regexStopAfter.length > 0 && regexStopAfter.some(re => re.test(producedText))) {
                    aborted = true;
                    controller.abort();
                    break;
                }

                if (!wr) {
                    // No word rejection: emit everything we have immediately.
                    if (pending.length > 0) {
                        yield pending;
                        pending = "";
                    }
                    continue;
                }

                // ── word rejection: process delimiters and forbidden words in the
                //    order they appear, holding back the in-progress tail ──
                let hitBadWord = false;
                // eslint-disable-next-line no-constant-condition
                while (true) {
                    const forbiddenWords = inDialogue
                        ? (wr.rejectedWordsInDialogue || [])
                        : (wr.rejectedWordsInNarration || []);

                    // earliest delimiter occurrence
                    let dIdx = -1;
                    let dLen = 0;
                    for (const d of delimiters) {
                        const idx = pending.indexOf(d);
                        if (idx !== -1 && (dIdx === -1 || idx < dIdx)) {
                            dIdx = idx;
                            dLen = d.length;
                        }
                    }

                    // earliest *confirmed* forbidden word (a word is only confirmed
                    // once there is at least one character after it, otherwise it may
                    // still be the start of a longer, allowed word)
                    let wIdx = -1;
                    let wLen = 0;
                    for (const word of forbiddenWords) {
                        const m = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i').exec(pending);
                        if (m) {
                            const end = m.index + m[0].length;
                            if (end < pending.length && (wIdx === -1 || m.index < wIdx)) {
                                wIdx = m.index;
                                wLen = m[0].length;
                            }
                        }
                    }

                    if (wIdx !== -1 && (dIdx === -1 || wIdx <= dIdx)) {
                        // forbidden word reached: emit the safe text before it, then
                        // trigger a reprocess from that point.
                        const before = pending.slice(0, wIdx);
                        if (before.length > 0) yield before;
                        rejected = {
                            textAfter: pending.slice(wIdx + wLen),
                            postGrammar: inDialogue
                                ? (wr.postRejectedWordInDialogueGrammar || null)
                                : (wr.postRejectedWordInNarrationGrammar || null),
                        };
                        hitBadWord = true;
                        break;
                    } else if (dIdx !== -1) {
                        // delimiter reached: emit up to and including it, toggle the
                        // narration/dialogue context, and keep scanning.
                        const upto = pending.slice(0, dIdx + dLen);
                        if (upto.length > 0) yield upto;
                        pending = pending.slice(dIdx + dLen);
                        inDialogue = !inDialogue;
                        continue;
                    }
                    break;
                }

                if (hitBadWord) {
                    aborted = true;
                    controller.abort();
                    break;
                }

                // emit everything that cannot be part of a forming word/delimiter
                const hold = computeHoldBack();
                const emit = pending.slice(0, pending.length - hold);
                if (emit.length > 0) yield emit;
                pending = pending.slice(pending.length - hold);
            }

            if (rejected) {
                // Fold the accepted text (including the rejected word, which stays in
                // context but was never shown) into the trail and re-run with the
                // post-rejection grammar in place.
                const textAfter = rejected.textAfter;
                const paragraphsSoFar = countParagraphs(producedText);
                const producedTextWithoutBadWord = producedText.slice(0, producedText.length - textAfter.length);

                let newMaxCharacters = remainingMaxCharacters;
                if (remainingMaxCharacters !== 0) {
                    newMaxCharacters = remainingMaxCharacters - producedText.length + textAfter.length;
                }
                let newMaxSafety = remainingMaxSafetyCharacters;
                if (remainingMaxSafetyCharacters !== 0) {
                    newMaxSafety = remainingMaxSafetyCharacters - producedText.length + textAfter.length;
                }

                if (remainingMaxCharacters !== 0 && newMaxCharacters <= 0) {
                    // Budget exhausted, stop entirely.
                    return;
                }

                trail = trail + producedTextWithoutBadWord;
                grammar = rejected.postGrammar;
                remainingMaxCharacters = newMaxCharacters;
                remainingMaxSafetyCharacters = newMaxSafety;
                remainingMaxParagraphs = Math.max(0, remainingMaxParagraphs - paragraphsSoFar);
                continue;
            }

            // Natural completion (or an abort that already flushed): emit whatever
            // remains in the buffer.
            if (!aborted && !finished && pending.length > 0) {
                yield pending;
            }
            return;
        }
    }

    /**
     * Experimental test-mode generator. Produces random dummy text locally
     * (no server involved), optionally constrained by a GBNF grammar using the
     * optional `gbnf` dependency. It honours the same stop semantics as the
     * real emulator (maxParagraphs / maxCharacters / maxCharactersCutOnDot /
     * maxSafetyCharacters / stopAt / stopAfter) and yields the result in small
     * string chunks to mimic token-by-token streaming.
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
     * @returns {AsyncGenerator<string, void, boolean | void>}
     */
    async *runInferenceInTestMode(deServerOptions) {
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

        const CHUNK_SIZE = 4;
        const DELAY_MS = 20;
        for (let i = 0; i < contentsGenerated.length; i += CHUNK_SIZE) {
            const chunk = contentsGenerated.slice(i, i + CHUNK_SIZE);
            await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
            const shouldContinue = yield chunk;
            if (shouldContinue === false) {
                break;
            }
        }
    }

    /**
     * Low-level streaming helper. Performs a streaming POST to
     * /v1/chat/completions and yields raw assistant content deltas as they
     * arrive. No de-server specific post-processing is applied here.
     *
     * @param {Record<string, any>} payload
     * @param {AbortSignal} [signal]
     * @returns {AsyncGenerator<string, void, void>}
     */
    async *_streamChatCompletion(payload, signal) {
        const baseUrl = (this.options.host || 'http://127.0.0.1:8765').replace(/\/$/, '');
        const headers = /** @type {Record<string, string>} */ ({ 'Content-Type': 'application/json' });
        if (this.options.apiKey) {
            headers['Authorization'] = `Bearer ${this.options.apiKey}`;
        }

        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal,
        });

        if (!response.ok || !response.body) {
            const errText = await response.text().catch(() => '');
            throw new Error(`Chat completion request failed with HTTP ${response.status}: ${errText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                let newlineIdx;
                while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
                    const line = buffer.slice(0, newlineIdx).trim();
                    buffer = buffer.slice(newlineIdx + 1);
                    if (!line.startsWith('data:')) continue;
                    const data = line.slice('data:'.length).trim();
                    if (data === '[DONE]') return;
                    let json;
                    try {
                        json = JSON.parse(data);
                    } catch {
                        // ignore malformed keep-alive lines
                        continue;
                    }
                    // Some OpenAI-compatible servers (vLLM, llama.cpp) stream an
                    // error object with a 200 status instead of failing the HTTP
                    // request. Surface it as a thrown error rather than silently
                    // ending the stream (which looks like a frozen/empty answer).
                    if (json.error) {
                        const err = json.error;
                        const message = typeof err === 'string' ? err : (err.message || JSON.stringify(err));
                        const code = typeof err === 'object' && err.code != null ? ` (code ${err.code})` : '';
                        const type = typeof err === 'object' && err.type ? `${err.type}: ` : '';
                        throw new Error(`Chat completion stream returned an error${code}: ${type}${message || '<empty message>'}`);
                    }
                    const delta = json.choices?.[0]?.delta?.content;
                    if (typeof delta === 'string' && delta.length > 0) {
                        yield delta;
                    }
                }
            }
        } finally {
            reader.cancel().catch(() => {});
        }
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
     * @param {{ grammar?: string | null, trail?: string } & Record<string, any>} _deServerOptions
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
        const models = (modelsJson?.data ?? []).map((/** @type {any} */ m) => ({
            id: String(m.id),
            tags: Array.isArray(m.tags) ? m.tags.map(String) : [],
            maxModelLen: typeof m.max_model_len === 'number' ? m.max_model_len : undefined,
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

        await this._ensureGrammar();

        // ── Step 6: resolve the model's context window size ──
        await this._resolveContextWindowSize(baseUrl, headers);

        this.connected = true;
        this.reason = null;
        this.triggerOnConnectionStatusChange(true);
        console.log(`InferenceServerOpenAICompatible: Connected to ${baseUrl}, server type: ${this.serverType}, context window: ${this.contextWindowSize}`);
    }

    async _ensureGrammar() {
        // no-op by default; subclasses may override to fetch grammar metadata from the server
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
     * @param {DECompleteCharacterReference} character
     * @param {{
     *   messages: Array<{message: string, author: string, storyMaster: boolean}>,
     *   messagesTrail: Array<string>,
     *   system: string,
     *   stateInjections: string[],
     *   visibleEnviroment: string,
     *   narrativeEffects: string[],
     *   followingAction?: string|null,
     *   grammar: string|null,
     *   narration: boolean,
     *   primaryEmotion: string,
     *   emotionalRange: Array<string>,
     *   activeStates: Array<{state: string, dominance: number}>,
     *   modes: Array<string>,
     *   sounds: Array<string>,
     *   forcedMode: string|null,
     *   forcedSounds: Array<string>,
     *   __debug_id?: string|null,
     * }} options
     * @returns {AsyncGenerator<{type: "text" | "warning" | "hidden", content: string}, void, boolean>}
     */
    async *inferNextStoryFragmentFor(character, options) {
        const { messages, messagesTrail, system, stateInjections, visibleEnviroment, narrativeEffects, grammar } = options;

        await this.ensureInitialized();

        const model = this._modelForGear('talk');

        let systemPrompt = replaceMultipleNewLines(system + visibleEnviroment).trim();

        const includeThirdPersonBeat = !options.narration && Math.random() >= 0.5;
        const nextMessageMustBeInform = buildNextMessageInstructions(character.name, options, includeThirdPersonBeat);

        const continuationRequestPrompt = replaceMultipleNewLines(`
${stateInjections.length > 0 ? `# ${character.name}'s Current States:\n\n${stateInjections.join("\n\n")}` : ""}

${narrativeEffects.length ? "# When narrating ENSURE that:\n\n" + narrativeEffects.map(effect => `- ${effect}`).join("\n") : ""}

${options.followingAction ? `# IMPORTANT:\n\n${options.followingAction}\n` : ""}

${nextMessageMustBeInform}
`
        ).trim() + "\n";

        let tokensExhaustedApprox = 512; // initial buffer
        const contextWindowSize = this.contextWindowSize;

        // wiggle room for system prompt
        tokensExhaustedApprox += await this.countTokens(systemPrompt);

        if (tokensExhaustedApprox >= contextWindowSize) {
            throw new Error("System prompt is too long for the model's context window");
        }

        tokensExhaustedApprox += await this.countTokens(continuationRequestPrompt);

        if (tokensExhaustedApprox >= contextWindowSize) {
            throw new Error("User prompt is too long for the model's context window");
        }

        let storySoFar = "";
        let tokensInStorySoFar = 0;
        for (const msg of messages.reverse()) {
            let messageToAdd = msg.message;
            if (storySoFar) {
                messageToAdd += "\n\n";
            }
            const messageTokens = await this.countTokens(messageToAdd);
            if (tokensExhaustedApprox + tokensInStorySoFar + messageTokens >= contextWindowSize) {
                yield { type: "warning", content: "The story so far is too long for the model's context window, some of the earliest messages will be truncated." };
                break;
            }
            storySoFar = messageToAdd + storySoFar;
            tokensInStorySoFar += messageTokens;
        }

        if (!storySoFar) {
            throw new Error("There is no story so far to provide as context, at least one message must be provided");
        }

        if (messagesTrail.length > 0) {
            storySoFar += "\n\n" + messagesTrail.join("\n\n");
        }

        storySoFar = replaceMultipleNewLines(storySoFar).trim();

        const storyUserPrompt = `# Story to continue:\n\n${storySoFar}\n\n`;

        const assistantPromptTrail = `# ${options.narration ?
            "Continuing the story with narrative 3rd person paragraph" :
            `Continuing the story with spoken dialogue of ${character.name}`}:\n\n${getLastParagraphChunkOf(storySoFar)}\n\n`;

        /** @type {Array<{role: "system" | "user" | "assistant", content: string}>} */
        const chatMessages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: storyUserPrompt + continuationRequestPrompt },
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
            stopAt: /** @type {string[]} */ (options.narration ? [] : ["\n"]),
            stopAfter: /** @type {string[]} */ ([]),
            trail: assistantPromptTrail,
            grammar: grammar || undefined,
            wordRejection: {
                rejectedWordsInNarration: [
                    "you", "your", "yours", "yourself", "yourselves",
                    "I", "me", "my", "mine", "myself",
                    "we", "us", "our", "ours", "ourselves",
                ],
                // dialogue lines are spoken by default; an asterisk flips into a third-person
                // narration/action beat, so the asterisk is the dialogue<->narration boundary
                delimiters: options.narration ? [] : ["*"],
                postRejectedWordInDialogueGrammar: undefined,
                postRejectedWordInNarrationGrammar: undefined,
                rejectedWordsInDialogue: /** @type {string[]} */ ([]),
                startsInDialogue: !options.narration,
            },
        };

        if (options.__debug_id) {
            this.__debug_last10TalkPayloads.push({
                payload: { model, messages: chatMessages, ...deServerOptions },
                id: options.__debug_id,
            });
            if (this.__debug_last10TalkPayloads.length > 10) {
                this.__debug_last10TalkPayloads.shift();
            }
        }

        const stream = this.deServerStreamEmulator(model, chatMessages, this._standardOpenAIOptions(), deServerOptions);
        for await (const chunk of stream) {
            const shouldContinue = yield { type: "text", content: chunk };
            if (shouldContinue === false) {
                // Returning stops the underlying stream (its reader is cancelled
                // when this generator is finalised).
                await stream.return(undefined);
                break;
            }
        }
    }

    /**
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

        // Build the "prepared" user context once. Unlike the websocket de-server,
        // there is no stateful prepare step: the context simply becomes the user
        // turn and each question is appended to it per request.
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

        let nextQuestion = yield "ready";
        while (nextQuestion !== null) {
            if (typeof nextQuestion === "undefined") {
                console.error("Questioning agent received undefined, treating an invalid ready signal");
                nextQuestion = yield "ready";
                continue;
            }

            const questionText =
                (nextQuestion.contextInfo ? nextQuestion.contextInfo + "\n\n" : "") +
                "# Question:\n\n" + nextQuestion.nextQuestion +
                (nextQuestion.instructions ? ("\n\n# Instructions:\n\n" + nextQuestion.instructions) : "");

            /** @type {Array<{role: "system" | "user" | "assistant", content: string}>} */
            const chatMessages = [
                { role: "system", content: system },
                { role: "user", content: userTrail + "\n\n" + questionText },
            ];

            const deServerOptions = {
                maxParagraphs: nextQuestion.maxParagraphs,
                maxCharacters: nextQuestion.maxCharacters,
                maxCharactersCutOnDot: nextQuestion.maxCharactersCutOnDot || false,
                maxSafetyCharacters: nextQuestion.maxSafetyCharacters,
                stopAt: nextQuestion.stopAt,
                stopAfter: nextQuestion.stopAfter,
                trail: "# Answer:\n\n" + (nextQuestion.answerTrail || ""),
                grammar: nextQuestion.grammar || undefined,
                gear,
            };

            let answer = "";
            for await (const chunk of this.deServerStreamEmulator(model, chatMessages, standardOpenAIOptions, deServerOptions)) {
                answer += chunk;
            }

            nextQuestion = yield answer;
        }
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
RULE: Action beats inside a dialogue line must be wrapped in asterisks and written in third person eg. \`${character.name}: spoken words *${character.name} does something* more spoken words\`
RULE: Asterisks are used exclusively to mark narration and action beats; never use asterisks for emphasis or bold text.
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

${character.name}: This is spoken dialogue *${character.name} does something* this is more spoken dialogue

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
