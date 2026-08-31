import { BaseVoiceAdapter } from "./base.js";

/**
 * Server-declared capabilities sent in the `ready` message on connect.
 *
 * @typedef {Object} VocalizerReadyInfo
 * @property {string[]} supported_output_formats
 * @property {number} max_upload_bytes
 * @property {number} max_session_bytes
 * @property {number} file_ttl_seconds
 * @property {number} sample_rate
 * @property {boolean} supports_parallel_requests
 */

/**
 * Compute the lowercase hex SHA-256 of a Blob's contents using the Web Crypto
 * API (available in browsers and Electron renderers).
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
async function sha256Hex(blob) {
    const buffer = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * WebSocket voice adapter that talks to the Python Vocalizer server
 * (Vocalizer/server.py). It uploads referenced audio files into a per-connection
 * temporary space and renders scene JSON to streamed ogg/mp3 audio.
 */
export class VoiceAdapterWebsocketVocalizer extends BaseVoiceAdapter {
    /**
     * @param {{
     *    host?: string;   // e.g. "wss://127.0.0.1:8222"
     *    secret?: string; // shared secret expected by the server
     * }} options
     */
    constructor(options) {
        super();
        this.options = options || {};

        this.onData = this.onData.bind(this);

        this.realHost = (this.options.host || "wss://127.0.0.1:8222");
        if (!this.realHost.endsWith("/")) {
            this.realHost += "/";
        }
        this.httpHost = this.realHost.replace(/^ws/, "http");

        /** @type {WebSocket|null} */
        this.socket = null;
        this.connected = false;
        /** @type {string|null} */
        this.reason = null;

        /** @type {VocalizerReadyInfo|null} */
        this.serverInfo = null;

        /**
         * Monotonic request id counter used to correlate responses.
         * @type {number}
         */
        this._ridCounter = 0;

        /**
         * Pending upload requests awaiting a proceed/skip/done/error reply,
         * keyed by rid.
         * @type {Map<string, {resolve: (v: any) => void, reject: (e: Error) => void, blob: Blob, filename: string}>}
         */
        this._pendingUploads = new Map();

        /**
         * Pending render requests keyed by rid. Each accumulates streamed binary
         * chunks until `render_done`.
         * @type {Map<string, {resolve: (b: Blob) => void, reject: (e: Error) => void, format: string, chunks: Blob[]}>}
         */
        this._pendingRenders = new Map();

        /**
         * Registered generic message listeners.
         * @type {Array<(data: any, binaryData: Blob | null) => void>}
         */
        this.messageCallbacks = [];
    }

    /** @returns {string} */
    _nextRid() {
        this._ridCounter += 1;
        return "r" + this._ridCounter;
    }

    /**
     * Register a listener notified for every message received from the server.
     * @param {(data: any, binaryData: Blob | null) => void} callback
     */
    addListenerOnMessage(callback) {
        if (!this.messageCallbacks.includes(callback)) this.messageCallbacks.push(callback);
    }

    /**
     * @param {(data: any, binaryData: Blob | null) => void} callback
     */
    removeListenerOnMessage(callback) {
        this.messageCallbacks = this.messageCallbacks.filter(cb => cb !== callback);
    }

    /**
     * @param {MessageEvent<any>} event
     */
    onData(event) {
        // Binary frames belong to whichever render is currently streaming. The
        // server only ever streams one render at a time (single FIFO worker).
        if (event.data instanceof Blob) {
            const streaming = this._currentStreamingRid
                ? this._pendingRenders.get(this._currentStreamingRid)
                : null;
            if (streaming) {
                streaming.chunks.push(event.data);
            } else {
                console.warn("VoiceAdapterWebsocketVocalizer: unexpected binary frame with no active render");
            }
            this.messageCallbacks.forEach(cb => {
                try { cb(null, event.data); } catch (err) { console.error("message listener failed", err); }
            });
            return;
        }

        let data;
        try {
            data = JSON.parse(event.data);
        } catch (err) {
            console.error("VoiceAdapterWebsocketVocalizer: failed to parse message", err);
            return;
        }

        try {
            this._dispatch(data);
        } catch (err) {
            console.error("VoiceAdapterWebsocketVocalizer: dispatch error", err);
        }

        this.messageCallbacks.forEach(cb => {
            try { cb(data, null); } catch (err) { console.error("message listener failed", err); }
        });
    }

    /**
     * Route a decoded JSON control message to the appropriate pending request.
     * @param {any} data
     */
    _dispatch(data) {
        const rid = data.rid;
        switch (data.type) {
            case "ready":
                this.serverInfo = data;
                break;

            // ── Upload flow ────────────────────────────────────────────
            case "upload_audio_proceed": {
                // Server is ready to receive the file bytes as one binary frame.
                const pending = this._pendingUploads.get(rid);
                if (pending) this.socket && this.socket.send(pending.blob);
                break;
            }
            case "upload_audio_skip": {
                const pending = this._pendingUploads.get(rid);
                if (pending) {
                    this._pendingUploads.delete(rid);
                    pending.resolve({ skipped: true, filename: pending.filename });
                }
                break;
            }
            case "upload_audio_done": {
                const pending = this._pendingUploads.get(rid);
                if (pending) {
                    this._pendingUploads.delete(rid);
                    pending.resolve({ skipped: false, filename: data.filename, hash: data.hash, size: data.size });
                }
                break;
            }

            // ── Render flow ────────────────────────────────────────────
            case "queued":
                // Informational: this render's position in the FIFO queue.
                break;
            case "render_start": {
                const render = this._pendingRenders.get(rid);
                if (render) {
                    render.format = data.format || render.format;
                    this._currentStreamingRid = rid;
                }
                break;
            }
            case "render_done": {
                const render = this._pendingRenders.get(rid);
                if (render) {
                    this._pendingRenders.delete(rid);
                    if (this._currentStreamingRid === rid) this._currentStreamingRid = null;
                    const mime = render.format === "mp3" ? "audio/mpeg" : "audio/ogg";
                    render.resolve(new Blob(render.chunks, { type: mime }));
                }
                break;
            }

            case "error": {
                const err = new Error(data.message || "Vocalizer server error");
                const upload = rid ? this._pendingUploads.get(rid) : undefined;
                const render = rid ? this._pendingRenders.get(rid) : undefined;
                if (upload) {
                    upload.reject(err);
                    this._pendingUploads.delete(rid);
                } else if (render) {
                    if (this._currentStreamingRid === rid) this._currentStreamingRid = null;
                    render.reject(err);
                    this._pendingRenders.delete(rid);
                } else {
                    console.error("VoiceAdapterWebsocketVocalizer: server error", err.message);
                }
                break;
            }

            case "pong":
                break;

            default:
                // Unknown message types are ignored (forwarded to listeners above).
                break;
        }
    }

    async initialize() {
        console.log("VoiceAdapterWebsocketVocalizer: connecting to " + this.realHost);

        const queryParams = "?secret=" + encodeURIComponent(this.options.secret || "");
        const socket = new WebSocket(this.realHost + queryParams);
        this.socket = socket;
        socket.addEventListener("message", this.onData);

        /** @type {Promise<void>} */
        const connectPromise = new Promise((resolve, reject) => {
            let lastClosureReason = "";

            const settleConnected = () => {
                this.connected = true;
                this.reason = null;
                console.log("VoiceAdapterWebsocketVocalizer: connection established");
                this.triggerOnConnectionStatusChange(true);
                resolve();
            };

            /**
             * @param {Error} err
             */
            const settleFailed = (err) => {
                this.connected = false;
                this.reason = err.message;
                this.socket = null;
                this.triggerOnConnectionStatusChange(false, err.message);
                reject(err);
            };

            socket.onopen = () => settleConnected();

            socket.onerror = () => {
                if (!this.connected) {
                    settleFailed(new Error("WebSocket error: failed to connect to " + this.realHost));
                }
            };

            socket.onclose = (event) => {
                lastClosureReason = closureReasonForCode(event.code, event.reason);
                console.log("VoiceAdapterWebsocketVocalizer: socket closed - " + lastClosureReason);

                // Fail any in-flight requests.
                const closeErr = new Error(lastClosureReason);
                this._pendingUploads.forEach(p => p.reject(closeErr));
                this._pendingUploads.clear();
                this._pendingRenders.forEach(p => p.reject(closeErr));
                this._pendingRenders.clear();
                this._currentStreamingRid = null;

                if (!this.connected) {
                    settleFailed(closeErr);
                } else {
                    this.connected = false;
                    this.reason = lastClosureReason;
                    this.socket = null;
                    this.triggerOnConnectionStatusChange(false, lastClosureReason);
                }
            };
        });

        return connectPromise;
    }

    async ensureInitialized() {
        if (this.connected) {
            return;
        }
        if (this.socket) {
            return new Promise((resolve, reject) => {
                // @ts-ignore
                this.onConnectionStatusChangePromises.push([resolve, (err) => reject(new Error(err))]);
            });
        }
        await this.initialize();
    }

    /**
     * Upload an audio file into this connection's temporary space so scene
     * references (`ref`, `file`, `prompt_ref`) can resolve to it. The server
     * skips the transfer if it already holds a file with a matching hash.
     *
     * @param {Blob} file    the audio bytes (WAV/MP3/OGG, < server's max_upload_bytes)
     * @param {string} [filename] the reference name used in scene JSON; defaults to file.name
     * @returns {Promise<{skipped: boolean, filename: string, hash?: string, size?: number}>}
     */
    async sendFile(file, filename) {
        await this.ensureInitialized();
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            throw new Error("Not connected to the Vocalizer server.");
        }

        // @ts-ignore File extends Blob and may carry a name.
        const name = filename || file.name;
        if (!name) {
            throw new Error("sendFile requires a filename (Blob has no name).");
        }

        const hash = await sha256Hex(file);
        const rid = this._nextRid();
        const socket = this.socket;

        return new Promise((resolve, reject) => {
            this._pendingUploads.set(rid, { resolve, reject, blob: file, filename: name });
            socket.send(JSON.stringify({
                action: "upload_audio",
                rid,
                filename: name,
                hash,
            }));
        });
    }

    /**
     * Render a scene to audio. Resolves with a Blob of the encoded output
     * (ogg or mp3). Any files referenced in the scene must have been uploaded
     * first via {@link sendFile}.
     *
     * @param {import("./base.js").VocalizerJSONRequest} request
     * @returns {Promise<import("./base.js").VocalizerJSONResponse>}
     */
    async runWorkflow(request) {
        await this.ensureInitialized();
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            throw new Error("Not connected to the Vocalizer server.");
        }

        const outputFormat = request.output_format || "ogg";
        const { output_format, ...scene } = request;
        const rid = this._nextRid();
        const socket = this.socket;

        return new Promise((resolve, reject) => {
            this._pendingRenders.set(rid, { resolve, reject, format: outputFormat, chunks: [] });
            socket.send(JSON.stringify({
                action: "render_json",
                rid,
                output_format: outputFormat,
                payload: scene,
            }));
        });
    }

    /**
     * Close the connection and reject any pending work.
     */
    close() {
        if (this.socket) {
            try { this.socket.close(1000, "Client closing"); } catch (_e) { /* ignore */ }
        }
    }
}

/**
 * Human-readable description for a WebSocket close code.
 * @param {number} code
 * @param {string} [reason]
 * @returns {string}
 */
function closureReasonForCode(code, reason) {
    switch (code) {
        case 1000: return "Normal closure.";
        case 1001: return "Endpoint going away (server down or navigated away).";
        case 1002: return "Protocol error.";
        case 1003: return "Received unacceptable data type.";
        case 1005: return "No status code present.";
        case 1006: return "Connection closed abnormally.";
        case 1007: return "Received inconsistent message data.";
        case 1008: return "Message violated server policy (bad secret?).";
        case 1009: return "Message too big to process.";
        case 1011: return "Server encountered an unexpected condition.";
        case 1015: return "TLS handshake failure (certificate could not be verified).";
        default: return reason || "Unknown reason (code " + code + ").";
    }
}
