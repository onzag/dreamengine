import { BaseVoiceAdapter } from "./base.js";
import { AUDIO_SAMPLE_RATE, decodeAudio, prepareAudio, joinAudio, encodeWav } from "./audio-processing.js";

// audio.cpp limits inline voice references to 5 MiB of decoded WAV data.
const MAX_VOICE_REFERENCE_BYTES = 5 * 1024 * 1024;

/**
 * Adds two quiet echoes and encodes the result as interleaved 16-bit PCM WAV.
 * @param {Blob} audio
 * @returns {Promise<Blob>}
 */
async function addSoftEcho(audio) {
    const decoded = await decodeAudio(audio);
    const delay = Math.round(AUDIO_SAMPLE_RATE * 0.16);
    const frames = decoded.channels[0].length + delay * 2;
    const channels = decoded.channels.map(samples => {
        const output = new Float32Array(frames);
        for (let frame = 0; frame < frames; frame++) {
            // Gains sum to one to leave headroom for overlapping echoes.
            output[frame] = (samples[frame] || 0) * 0.8
                + (samples[frame - delay] || 0) * 0.15
                + (samples[frame - delay * 2] || 0) * 0.05;
        }
        return output;
    });
    return encodeWav(channels);
}

/** @param {string} label */
function soundLabel(label) {
    return label.trim().replace(/^\[|\]$/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** @param {[number, number]} range @param {string} label */
function randomGap(range, label) {
    if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isFinite) || range[0] < 0 || range[1] < range[0]) {
        throw new Error(`Invalid gap range for sound "${label}"; expected [min, max] milliseconds.`);
    }
    return range[0] + Math.random() * (range[1] - range[0]);
}

// Keep pause timing independent of a model's interpretation of bracket tags.
const PAUSES = new Map([['short pause', 180], ['pause', 350], ['medium pause', 500], ['long pause', 900]]);

class VoiceAdapterLocalAudioCPP extends BaseVoiceAdapter {
    /**
     * @param {{host: string, secret: string, model: string}} options
     */
    constructor({ host, secret, model }) {
        super();
        this.host = host;
        this.secret = secret;
        this.model = model.trim() || null;
        this.connected = false;
        /** @type {string | null} */
        this.reason = null;
        /** @type {Array<{id: string, tags: string[]}>} */
        this.availableModels = [];
        /** @type {{id: string, tags: string[]} | null} */
        this.selectedModel = null;
        /** @type {Promise<void> | null} */
        this._initializePromise = null;
        /** @type {Map<string, string>} Base64 WAV references awaiting one generation. */
        this._voiceCache = new Map();
        /** @type {Map<string, {type: "base64", data: string}>} Narrator references scoped to a renderDialogue call. */
        this._narrationReferences = new Map();
        // Already assembled dialogue must retain its explicit gaps and asset volume.
        /** @type {WeakMap<Blob, {leadingSilence: number, trailingSilence: number}>} */
        this._preparedAudio = new WeakMap();
    }

    /**
     * Caches a reference locally; audio.cpp receives it inline during generation.
     * @param {Blob} file
     * @param {string} filename
     * @returns {Promise<{skipped: boolean, id: string}>}
     */
    async uploadVoice(file, filename) {
        if (file.size > MAX_VOICE_REFERENCE_BYTES) {
            throw new Error(`Voice reference "${filename}" exceeds audio.cpp's 5 MiB inline audio limit.`);
        }
        if (file.size === 0) {
            throw new Error(`Voice reference "${filename}" is empty.`);
        }

        const bytes = new Uint8Array(await file.arrayBuffer());
        /** @param {number} start @param {number} end */
        const signature = (start, end) => String.fromCharCode(...bytes.subarray(start, end));
        if (bytes.length < 12 || signature(0, 4) !== 'RIFF' || signature(8, 12) !== 'WAVE') {
            throw new Error(`Voice reference "${filename}" must be a WAV file for audio.cpp inline audio.`);
        }

        // Chunk conversion to stay below JavaScript's function argument limit.
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
            binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        }
        const id = crypto.randomUUID();
        this._voiceCache.set(id, btoa(binary));
        return { skipped: false, id };
    }

    /**
     * Consumes the cached reference when building a generation request.
     * @param {string} voiceId
     * @returns {{type: "base64", data: string}}
     */
    _takeVoiceReference(voiceId) {
        const data = this._voiceCache.get(voiceId);
        if (data === undefined) {
            throw new Error(`Voice reference "${voiceId}" is missing or has already been used. Upload it again before generation.`);
        }
        this._voiceCache.delete(voiceId);
        return { type: 'base64', data };
    }

    /**
     * @param {DEConversationMessageNarration} narration
     * @param {string} voiceId
     * @param {DEVoiceModeMin[]} deliveryModes
     * @returns {Promise<Blob>}
     */
    async renderNarration(narration, voiceId, deliveryModes) {
        const text = narration.fragments.map(fragment => typeof fragment === 'string' ? fragment : fragment.text).join('');
        if (!text.trim()) {
            throw new Error('Cannot render empty narration.');
        }

        await this.ensureInitialized();
        const reference = this._narrationReferences.get(voiceId) || this._takeVoiceReference(voiceId);
        return await this._requestSpeech(text, reference, deliveryModes);
    }

    /**
     * The caller owns the reference for the duration of one render operation.
     * @param {string} text
     * @param {{type: "base64", data: string}} voiceReference
     * @param {DEVoiceModeMin[]} deliveryModes
     * @returns {Promise<Blob>}
     */
    async _requestSpeech(text, voiceReference, deliveryModes) {
        if (!this.selectedModel) {
            throw new Error('No voice model has been selected.');
        }

        const instructions = deliveryModes.map(mode => mode.instructions.trim()).filter(Boolean).join('\n');
        const payload = {
            model: this.selectedModel.id,
            input: text,
            voice_ref: voiceReference,
            response_format: 'wav',
            ...(instructions ? { instructions } : {}),
        };
        const baseUrl = this.host.replace(/\/+$/, '');
        const headers = /** @type {Record<string, string>} */ ({ 'Content-Type': 'application/json' });
        if (this.secret) {
            headers['Authorization'] = `Bearer ${this.secret}`;
        }

        const response = await fetch(`${baseUrl}/v1/audio/speech`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`Speech generation failed with HTTP ${response.status}: ${errText}`);
        }
        return await response.blob();
    }

    /**
     * @param {DEConversationMessageThought} thought
     * @param {string} voiceId
     * @param {DEVoiceModeMin[]} deliveryModes
     * @returns {Promise<Blob>}
     */
    async renderThought(thought, voiceId, deliveryModes) {
        const audio = await this.renderNarration({ ...thought, type: 'narration' }, voiceId, deliveryModes);
        return await addSoftEcho(audio);
    }

    /**
     * A dialogue can contain several narration passages. Claim the uploaded
     * narrator once, and retain it only for the lifetime of this operation.
     * The private handle keeps simultaneous dialogue renders independent.
     * @param {DEConversationMessageDialogue} dialogue
     * @param {DEEmotionNames} primaryEmotion
     * @param {CharacterVoiceAssets} voice
     * @param {string} narratorVoiceId
     * @param {CharacterVoiceModifiersAssets} voiceModifiers
     * @param {CharacterSoundAssets} sounds
     * @param {DEVoiceMode[]} narrationDeliveryModes
     * @returns {Promise<Blob>}
     */
    async renderDialogue(dialogue, primaryEmotion, voice, narratorVoiceId, voiceModifiers, sounds, narrationDeliveryModes) {
        const needsNarrator = dialogue.fragments.some(fragment => fragment.type === 'narration');
        const narratorHandle = needsNarrator ? crypto.randomUUID() : narratorVoiceId;
        if (needsNarrator) this._narrationReferences.set(narratorHandle, this._takeVoiceReference(narratorVoiceId));
        try {
            return await super.renderDialogue(dialogue, primaryEmotion, voice, narratorHandle, voiceModifiers, sounds, narrationDeliveryModes);
        } finally {
            if (needsNarrator) this._narrationReferences.delete(narratorHandle);
        }
    }

    /**
     * Render continuous text in one take, splitting only where a local pause or
     * recorded sound must be inserted. Do not send unsupported sound tags as words.
     * @param {DEConversationMessageDialogueFragment[]} dialogueFragment
     * @param {string} voiceId
     * @param {DEVoiceModeMin[]} deliveryModes
     * @param {CharacterSoundAssets} sounds
     * @returns {Promise<Blob>}
     */
    async renderDialogueFragmentChunk(dialogueFragment, voiceId, deliveryModes, sounds) {
        /** @type {Array<{kind: "speech", text: string} | {kind: "pause", ms: number} | {kind: "asset", path: string, pre: number, post: number, volume: number}>} */
        const plan = [];
        const assets = new Map(Object.entries(sounds).map(([label, entry]) => [soundLabel(label), entry]));
        let text = '';
        const flushText = () => {
            if (text.trim()) plan.push({ kind: 'speech', text: text.trim() });
            text = '';
        };
        for (const fragment of dialogueFragment) {
            if (fragment.type !== 'sound') {
                text += fragment.fragments.map(part => typeof part === 'string' ? part : part.text).join('');
                continue;
            }
            const sound = fragment.soundInfo.sound;
            const label = soundLabel(sound?.label || fragment.text);
            const pause = PAUSES.get(label);
            if (pause !== undefined) {
                flushText();
                plan.push({ kind: 'pause', ms: pause });
                continue;
            }
            const asset = assets.get(label);
            if (asset) {
                const choices = Array.isArray(asset.asset) ? asset.asset : [asset.asset];
                if (!choices.length || choices.some(path => typeof path !== 'string' || !path.trim())) {
                    throw new Error(`Sound "${label}" has no valid asset path.`);
                }
                const volume = asset.volume ?? 1;
                if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
                    throw new Error(`Sound "${label}" volume must be between 0 and 1.`);
                }
                flushText();
                plan.push({
                    kind: 'asset',
                    path: choices[Math.floor(Math.random() * choices.length)],
                    pre: randomGap(asset.preGapRange ?? [0, 0], label),
                    post: randomGap(asset.postGapRange ?? [0, 0], label),
                    volume,
                });
                continue;
            }
            const replacements = Array.isArray(sound?.replacement) ? sound.replacement : [sound?.replacement];
            if (!replacements.length || replacements.some(replacement => typeof replacement !== 'string')) {
                throw new Error(`Sound "${label}" needs a character sound asset or a text replacement; native sound tags are not assumed for this model.`);
            }
            const replacement = replacements[Math.floor(Math.random() * replacements.length)];
            text += ` ${replacement} `;
        }
        flushText();

        // Load and validate assets before consuming the voice or generating speech.
        // This also makes the unfinished loadAsset hook fail at the relevant path.
        /** @type {Map<string, import('./audio-processing.js').AudioClip>} */
        const loaded = new Map();
        for (const part of plan) {
            if (part.kind !== 'asset' || loaded.has(part.path)) continue;
            try {
                const clip = await decodeAudio(await this.loadAsset(part.path));
                if (clip.leadingSilence === clip.channels[0].length) throw new Error('The asset contains no audible sound.');
                loaded.set(part.path, clip);
            } catch (err) {
                throw new Error(`Could not load sound asset "${part.path}": ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        const hasSpeech = plan.some(part => part.kind === 'speech');
        if (hasSpeech) await this.ensureInitialized();
        // Consume once per chunk, retaining the same reference for all its takes.
        const voiceReference = hasSpeech ? this._takeVoiceReference(voiceId) : null;
        if (!hasSpeech) this._voiceCache.delete(voiceId);
        /** @type {Array<import('./audio-processing.js').AudioClip | number>} */
        const parts = [];
        for (const part of plan) {
            if (part.kind === 'pause') {
                parts.push(part.ms);
            } else if (part.kind === 'asset') {
                const clip = loaded.get(part.path);
                if (!clip) throw new Error(`Sound asset "${part.path}" was not loaded.`);
                parts.push(part.pre, prepareAudio(clip, part.volume), part.post);
            } else if (voiceReference) {
                const clip = await decodeAudio(await this._requestSpeech(part.text, voiceReference, deliveryModes));
                if (clip.leadingSilence === clip.channels[0].length) throw new Error('Speech generation returned silent audio.');
                parts.push(prepareAudio(clip));
            }
        }
        return this._encodePreparedAudio(joinAudio(parts));
    }

    /** @param {import('./audio-processing.js').AudioClip} clip */
    _encodePreparedAudio(clip) {
        const blob = encodeWav(clip.channels);
        this._preparedAudio.set(blob, { leadingSilence: clip.leadingSilence, trailingSilence: clip.trailingSilence });
        return blob;
    }

    /**
     * Keep delivery changes close, and allow more space around narration. Existing
     * pauses count toward these minimum gaps; prepared dialogue is never re-gained
     * or trimmed, which would erase explicit pauses or undo asset volume settings.
     * @param {Blob[]} blobs
     * @param {Array<"dialogue-chunk" | "narration-chunk">} typesInOrder
     * @returns {Promise<Blob>}
     */
    async combineAudioBlobs(blobs, typesInOrder) {
        if (blobs.length !== typesInOrder.length || typesInOrder.some(type => type !== 'dialogue-chunk' && type !== 'narration-chunk')) {
            throw new Error('Each audio blob must have a matching dialogue-chunk or narration-chunk type.');
        }
        /** @type {Array<import('./audio-processing.js').AudioClip | number>} */
        const parts = [];
        for (let i = 0; i < blobs.length; i++) {
            if (i > 0) {
                const gap = typesInOrder[i] !== typesInOrder[i - 1] ? 280 : typesInOrder[i] === 'narration-chunk' ? 220 : 80;
                parts.push(gap);
            }
            const decoded = await decodeAudio(blobs[i]);
            const prepared = this._preparedAudio.get(blobs[i]);
            parts.push(prepared ? { ...decoded, ...prepared } : prepareAudio(decoded));
        }
        return this._encodePreparedAudio(joinAudio(parts));
    }

    /**
     * Unloads all resident models. The server reloads them on the next request.
     */
    async pause() {
        const baseUrl = this.host.replace(/\/$/, '');
        const headers = /** @type {Record<string, string>} */ ({});
        if (this.secret) {
            headers['Authorization'] = `Bearer ${this.secret}`;
        }

        const response = await fetch(`${baseUrl}/v1/tasks/unload_all_models`, {
            method: 'POST',
            headers,
        });
        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`Unloading audio models failed with HTTP ${response.status}: ${errText}`);
        }
    }

    async ensureInitialized() {
        if (this.connected) {
            return;
        }

        if (!this._initializePromise) {
            this._initializePromise = this.initialize().finally(() => {
                this._initializePromise = null;
            });
        }
        await this._initializePromise;
    }

    async initialize() {
        if (this.connected) {
            return;
        }

        const baseUrl = this.host.replace(/\/+$/, '');
        const headers = /** @type {Record<string, string>} */ ({});
        if (this.secret) {
            headers['Authorization'] = `Bearer ${this.secret}`;
        }

        try {
            const response = await fetch(`${baseUrl}/v1/models`, { headers });
            if (!response.ok) {
                throw new Error(`Server at ${baseUrl} returned HTTP ${response.status} from /v1/models`);
            }

            const modelsJson = await response.json();
            /** @type {Array<{id: string, tags: string[]}>} */
            const models = (modelsJson?.data ?? []).map((/** @type {any} */ model) => ({
                id: String(model.id),
                tags: Array.isArray(model.tags) ? model.tags.map(String) : [],
            }));
            this.availableModels = models;

            const chosen = this.model
                ? models.find(model => model.id === this.model)
                : models.find(model => model.tags.includes('default')) || (models.length === 1 ? models[0] : null);

            if (!chosen) {
                if (this.model) {
                    const available = models.map(model => model.id).join(', ') || '(none)';
                    throw new Error(`Requested model "${this.model}" was not found on the server. Available models: ${available}`);
                }
                throw new Error('No model was specified and no model with the "default" tag was found on the server.');
            }

            this.selectedModel = chosen;
        } catch (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            this.connected = false;
            this.reason = err.message;
            this.triggerOnConnectionStatusChange(false, err.message);
            throw err;
        }

        this.connected = true;
        this.reason = null;
        this.triggerOnConnectionStatusChange(true);
    }
}

export { VoiceAdapterLocalAudioCPP };
