/**
 * Per-game Vocalizer session. Wraps a single {@link VoiceAdapterWebsocketVocalizer}
 * connection shared by every `app-game-message` in the current game, and keeps a
 * small in-memory cache of reference audio files so the same voice asset is not
 * re-downloaded, re-hashed or re-uploaded over and over.
 *
 * game.js owns the lifecycle: it creates the session on start (when
 * `vocalizerEnabled` is true) and exposes it as `window.GAME_VOCALIZER`. Message
 * blocks read that global to synthesize their narration/dialogue.
 */

/** Default VoxCPM generation parameters, matching the voice profile UI. */
const DEFAULT_GENERATION = { cfg_value: 1.0, inference_timesteps: 10, normalize: true };

/** Maximum bytes of reference audio to keep resident before evicting (LRU). */
const MAX_CACHE_BYTES = 25 * 1024 * 1024;

export class GameVocalizerSession {
    /**
     * @param {import("../../../engine/voice/base.js").BaseVoiceAdapter} adapter
     */
    constructor(adapter) {
        this.adapter = adapter;

        /**
         * Resolved-asset-path -> cached reference blob. Insertion order is used
         * as the LRU ordering (re-inserted on access).
         * @type {Map<string, { file: File, size: number, refName: string }>}
         */
        this._cache = new Map();

        /** Running total of cached bytes. */
        this._cacheBytes = 0;

        /**
         * Reference names already uploaded to the server this session, so we
         * skip re-sending them (the server also dedupes by hash, but this avoids
         * the round-trip entirely).
         * @type {Set<string>}
         */
        this._uploaded = new Set();
    }

    /** @returns {import("../../../engine/voice/base.js").VocalizerGeneration} */
    get defaultGeneration() {
        return { ...DEFAULT_GENERATION };
    }

    /**
     * Resolve a DE asset path (optionally `@`-prefixed) into an absolute URL.
     * @param {string} url
     * @returns {string}
     */
    _resolveAssetUrl(url) {
        if (!url) return url;
        if (/^(https?:|blob:|data:|\.\/)/.test(url)) return url;
        const isSystemAsset = url.startsWith('@');
        const base = isSystemAsset ? window.DREAMENGINE_DEFAULT_SCRIPTS_HOME : window.DREAMENGINE_HOME;
        return base + "/" + (isSystemAsset ? url.slice(1) : url);
    }

    /**
     * Derive a stable, server-safe reference filename for a given asset path.
     * @param {string} assetPath
     * @returns {string}
     */
    _refNameFor(assetPath) {
        return assetPath.replace(/^@/, 'sys/').replace(/[^a-zA-Z0-9._-]/g, '_');
    }

    /**
     * Fetch (with caching) a voice asset and ensure it has been uploaded to the
     * server for this connection. Returns the reference name to use in scene
     * segments, or null if the asset could not be loaded.
     * @param {string} assetPath
     * @returns {Promise<string|null>}
     */
    async ensureAssetUploaded(assetPath) {
        if (!assetPath || assetPath === '@none') return null;

        const refName = this._refNameFor(assetPath);
        let entry = this._cache.get(assetPath);

        if (entry) {
            // Touch for LRU.
            this._cache.delete(assetPath);
            this._cache.set(assetPath, entry);
        } else {
            const resolved = this._resolveAssetUrl(assetPath);
            let file;
            try {
                const response = await fetch(resolved);
                if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
                const blob = await response.blob();
                file = new File([blob], refName, { type: blob.type || 'audio/ogg' });
            } catch (err) {
                console.error(`GameVocalizerSession: failed to fetch voice asset "${assetPath}"`, err);
                return null;
            }
            entry = { file, size: file.size, refName };
            this._cache.set(assetPath, entry);
            this._cacheBytes += entry.size;
            this._evictIfNeeded();
        }

        if (!this._uploaded.has(refName)) {
            try {
                await this.adapter.sendFile(entry.file, refName);
                this._uploaded.add(refName);
            } catch (err) {
                console.error(`GameVocalizerSession: failed to upload voice asset "${assetPath}"`, err);
                return null;
            }
        }

        return refName;
    }

    /** Evict least-recently-used cache entries until under the byte budget. */
    _evictIfNeeded() {
        while (this._cacheBytes > MAX_CACHE_BYTES && this._cache.size > 1) {
            const oldestKey = this._cache.keys().next().value;
            if (!oldestKey) break;
            const oldest = this._cache.get(oldestKey);
            this._cache.delete(oldestKey);
            if (oldest) this._cacheBytes -= oldest.size;
            // Note: the reference stays in `_uploaded` — the server keeps it for
            // the connection lifetime, so we never need to re-upload it.
        }
    }

    /**
     * Build a single speech segment for a piece of text spoken with the given
     * voice. Uploads the voice's reference asset first. Returns null when there
     * is no text or the voice asset cannot be resolved.
     *
     * The voice's `tags` become the comma-separated `voice_prompt`, and when a
     * `transcript` is available it is supplied as `prompt_text`/`prompt_ref`
     * (VoxCPM voice cloning); otherwise the asset is used as a plain `ref`.
     *
     * @param {string} text
     * @param {{ asset: string, transcript?: string|null, tags?: string[] }} voice
     * @returns {Promise<import("../../../engine/voice/base.js").VocalizerSpeechSegment|null>}
     */
    async buildSpeechSegment(text, voice) {
        const clean = (text || '').replace(/\*/g, '').trim();
        if (!clean || !voice || !voice.asset) return null;

        const refName = await this.ensureAssetUploaded(voice.asset);

        if (!refName) return null;

        /** @type {import("../../../engine/voice/base.js").VocalizerSpeechSegment} */
        const segment = { text: clean };

        const tags = Array.isArray(voice.tags) ? voice.tags.filter(Boolean) : [];
        if (tags.length) segment.voice_prompt = tags.join(", ");

        if (voice.transcript) {
            segment.prompt_ref = refName;
            segment.prompt_text = voice.transcript;
        } else {
            segment.ref = refName;
        }

        return segment;
    }

    /**
     * Render a list of speech segments into a single audio object URL.
     * @param {import("../../../engine/voice/base.js").VocalizerSpeechSegment[]} segments
     * @returns {Promise<string|null>} an object URL, or null on failure/empty input
     */
    async renderSegments(segments) {
        if (!segments || segments.length === 0) return null;
        try {
            const blob = await this.adapter.runWorkflow({
                output_format: "mp3",
                generation: this.defaultGeneration,
                segments,
            });
            return URL.createObjectURL(blob);
        } catch (err) {
            console.error("GameVocalizerSession: render failed", err);
            return null;
        }
    }

    /** Close the underlying connection and drop cached references. */
    close() {
        try {
            // @ts-ignore optional on the base type
            if (typeof this.adapter.close === "function") this.adapter.close();
        } catch (_e) { /* ignore */ }
        this._cache.clear();
        this._cacheBytes = 0;
        this._uploaded.clear();
    }
}
