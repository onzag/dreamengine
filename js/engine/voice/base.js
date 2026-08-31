/**
 * The scene payload consumed by `Vocalizer.render_json` plus the output format
 * the caller wants back. When rendered, `file`/`ref`/`prompt_ref` references
 * resolve against the files uploaded for this connection via {@link sendFile}.
 *
 * @typedef {Object} VocalizerJSONRequest
 * @property {("ogg"|"mp3")} [output_format]   // desired encoded output (default "ogg")
 * @property {VocalizerGeneration} [generation]
 * @property {VocalizerBackground} [background]
 * @property {VocalizerSegment[]} segments
 */

/**
 * Generation parameters shared by the whole scene (and overridable per speech
 * segment). Mirrors what vocalizer.py's `_resolve_generation_params` consumes.
 *
 * @typedef {Object} VocalizerGeneration
 * @property {number} [cfg_value]            // VoxCPM classifier-free guidance value
 * @property {number} [inference_timesteps]  // VoxCPM diffusion steps
 * @property {boolean} [normalize]           // whether VoxCPM normalizes text
 * @property {boolean} [denoise]             // run the ZipEnhancer denoiser
 * @property {number} [seed]                 // fixed RNG seed
 */

/**
 * Background bed configuration. Rendered as a looping track underneath the
 * whole scene; `background_update` segments mutate it over time.
 *
 * @typedef {Object} VocalizerBackground
 * @property {string} file                     // library filename of the bed audio
 * @property {number} [volume]                 // 1..9 (5 = natural), default 5
 * @property {("on"|"off"|boolean)} [presence] // whether the bed is audible
 * @property {number} [fade_ms]                // crossfade duration in ms
 */

/**
 * A spoken segment. VoxCPM synthesizes `text`; an optional `ref` voice clip and
 * `voice_prompt` steer the delivery.
 *
 * @typedef {Object} VocalizerSpeechSegment
 * @property {string} text                    // the line to speak (required)
 * @property {string} [ref]                   // library filename of a voice reference clip
 * @property {string} [voice_prompt]          // parenthetical style hint prepended to the text
 * @property {string} [prompt_ref]            // library filename of a prompt wav (voice cloning)
 * @property {string} [prompt_text]           // transcript of prompt_ref
 * @property {(number|[number, number])} [volume] // 1..9 or a [min,max] random range
 * @property {number} [cfg_value]
 * @property {number} [inference_timesteps]
 * @property {boolean} [normalize]
 * @property {boolean} [denoise]
 * @property {number} [seed]
 */

/**
 * A library sound clip segment (has `ref`, no `text`).
 *
 * @typedef {Object} VocalizerFileSegment
 * @property {string} ref                          // filename or "name-{n}.wav" glob pattern
 * @property {boolean} [randomize]                 // pick a random match instead of sequential
 * @property {number} [repeat]                     // number of clips to concatenate
 * @property {(number|[number, number])} [volume]  // 1..9 or a [min,max] random range
 * @property {(number|[number, number])} [volume_jitter] // per-repeat random volume range
 * @property {number} [fade_ms]                    // crossfade duration in ms
 */

/**
 * A silence/delay segment (has `duration_ms`, no `text`/`ref`).
 *
 * @typedef {Object} VocalizerDelaySegment
 * @property {(number|[number, number])} duration_ms // ms of silence, or a [min,max] range
 */

/**
 * A background bed mutation (no `text`, no `ref`, no `duration_ms`). Applied at
 * the point in the timeline where it appears.
 *
 * @typedef {Object} VocalizerBackgroundUpdateSegment
 * @property {string} [file]                   // switch the bed to this library filename
 * @property {number} [volume]                 // new bed volume 1..9
 * @property {("on"|"off"|boolean)} [presence] // toggle audibility
 * @property {number} [fade_ms]                // fade duration for the change
 */

/**
 * Any segment accepted by vocalizer.py. Its kind is inferred from which keys
 * are present (see `_infer_kind`): `text` -> speech, `duration_ms` -> delay,
 * `ref` (without `text`) -> file clip, otherwise -> background update.
 *
 * @typedef {(VocalizerSpeechSegment
 *   | VocalizerFileSegment
 *   | VocalizerDelaySegment
 *   | VocalizerBackgroundUpdateSegment)} VocalizerSegment
 */

/**
 * The rendered result of a {@link VocalizerJSONRequest}: a Blob containing the
 * encoded audio (`audio/ogg` or `audio/mpeg` depending on `output_format`).
 *
 * @typedef {Blob} VocalizerJSONResponse
 */

export class BaseVoiceAdapter {
    constructor() {
        /**
         * @type {Array<(status: {connected: boolean, reason?: string}) => void>}
         */
        this.onConnectionStatusChangeFns = [];
        /**
         * @type {Array<[() => void, (err: string) => void]>}
         */
        this.onConnectionStatusChangePromises = [];
    }

    async initialize() {
        throw new Error("Method 'initialize()' must be implemented.");
    }

    async ensureInitialized() {
        throw new Error("Method 'ensureInitialized()' must be implemented.");
    }

    /**
     * @param {Blob} file
     * @param {string} filename
     */
    sendFile(file, filename) {
        throw new Error("Method 'sendFile()' must be implemented.");
    }

    /**
     * @param {VocalizerJSONRequest} request
     * @returns {Promise<VocalizerJSONResponse>}
     */
    runWorkflow(request) {
        throw new Error("Method 'runWorkflow()' must be implemented.");
    }

    /**
     * Triggers the on connection status change event
     * @param {boolean} connected 
     * @param {string} [reason] 
     */
    triggerOnConnectionStatusChange(connected, reason) {
        const status = { connected, reason };
        this.onConnectionStatusChangeFns.forEach(fn => fn(status));
        this.onConnectionStatusChangePromises.forEach(([resolve, reject]) => {
            if (connected) {
                resolve();
            } else {
                reject(reason || "Unknown reason");
            }
        });
        this.onConnectionStatusChangePromises = [];
    }

    /**
     * @param {(status: {connected: boolean, reason?: string}) => any} callback
     */
    addEventListenerOnConnectStatusChange(callback) {
        this.onConnectionStatusChangeFns.push(callback);
    }

    /**
     * @param {(status: {connected: boolean, reason?: string}) => any} callback
     */
    removeEventListenerOnConnectStatusChange(callback) {
        this.onConnectionStatusChangeFns = this.onConnectionStatusChangeFns.filter(fn => fn !== callback);
    }
}