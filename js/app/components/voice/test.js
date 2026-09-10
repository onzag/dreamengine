// Vocalizer technical test area, as a custom element: <vocalizer-test>.
//
// This component owns everything needed to *manually* exercise a Vocalizer
// WebSocket server from the settings panel: it opens a connection using the
// current settings, lets the tester upload mp3/ogg files under arbitrary
// reference names, edit a raw workflow JSON payload, render it, and play back /
// download the resulting audio.
//
// It is intentionally low-level and verbose: the point is to verify the
// connection and end-to-end functionality, not to be pretty. Append it to a
// container (e.g. a dialog) to connect; remove it to dispose.

import { VOICE_ADAPTERS } from "../../../engine/voice/all.js";
import { playSound } from "../../sound.js";

/**
 * A sensible default workflow payload shown in the textarea so the tester has
 * something runnable to start from. References here (e.g. "emotion.wav") only
 * resolve if a file with that name has been uploaded first.
 */
const DEFAULT_WORKFLOW = {
    output_format: "mp3",
    generation: { cfg_value: 2.0, inference_timesteps: 10, normalize: true },
    segments: [
        { voice_prompt: "an older man, gravelly voice", text: "If you can hear me, it works." },
    ],
};

export class VocalizerTest extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: "open" });

        /** @type {import("../../../engine/voice/base.js").BaseVoiceAdapter|null} */
        this.adapter = null;
        /** @type {string[]} object URLs to revoke on disposal */
        this.objectUrls = [];
        /** @type {string|null} */
        this.lastRenderUrl = null;
        /** Track uploaded reference names for display. @type {Set<string>} */
        this.uploaded = new Set();

        this._onUploadClick = this._onUploadClick.bind(this);
        this._onRenderClick = this._onRenderClick.bind(this);
        this._onDownloadClick = this._onDownloadClick.bind(this);
    }

    connectedCallback() {
        this._render();
        this._connect();
    }

    disconnectedCallback() {
        try { this.adapter && this.adapter.close(); } catch (_e) { /* ignore */ }
        this.adapter = null;
        this.objectUrls.forEach((u) => URL.revokeObjectURL(u));
        this.objectUrls.length = 0;
    }

    _refreshFiles() {
        const filesEl = this.root.querySelector('[data-el="files"]');
        if (!filesEl) return;
        if (this.uploaded.size === 0) {
            filesEl.innerHTML = `<div class="vt-file-item">No files uploaded yet.</div>`;
            return;
        }
        filesEl.innerHTML = "";
        this.uploaded.forEach((name) => {
            const item = document.createElement("div");
            item.className = "vt-file-item";
            item.innerHTML = `<span class="name">${name}</span> <span>uploaded ✓</span>`;
            filesEl.appendChild(item);
        });
    }

    _render() {
        this.root.innerHTML = `
        <style>
            .vt-wrap { display: flex; flex-direction: column; gap: 1.4vh; font-size: 2vh; color: #ddd; }
            .vt-row { display: flex; gap: 1ch; align-items: center; flex-wrap: wrap; }
            .vt-status { font-weight: 700; }
            .vt-status.ok { color: #6f6; }
            .vt-status.bad { color: #ff6b6b; }
            .vt-status.pending { color: #fc6; }
            .vt-label { font-size: 1.7vh; color: #999; text-transform: uppercase; letter-spacing: 0.04em; }
            textarea {
                width: 100%; min-height: 22vh; box-sizing: border-box;
                font-family: ui-monospace, Consolas, monospace; font-size: 1.8vh;
                background: #0d0d0d; color: #ddd; border: 1px solid #333; border-radius: 4px; padding: 1vh;
                resize: vertical;
            }
            input[type="text"] {
                background: #0d0d0d; color: #ddd; border: 1px solid #333; border-radius: 4px; padding: 0.6vh 1ch; font-size: 1.8vh;
            }
            .vt-btn {
                background: #1a3a4a; color: #cfe; border: 1px solid #2a5a6a; border-radius: 4px;
                padding: 0.8vh 2ch; font-size: 1.9vh; cursor: pointer;
            }
            .vt-btn:disabled { opacity: 0.4; cursor: not-allowed; }
            .vt-files { display: flex; flex-direction: column; gap: 0.6vh; }
            .vt-file-item { display: flex; gap: 1ch; align-items: center; font-size: 1.7vh; color: #bbb; }
            .vt-file-item .name { color: #fc6; }
            .vt-log {
                background: #0d0d0d; border: 1px solid #333; border-radius: 4px; padding: 1vh;
                font-family: ui-monospace, Consolas, monospace; font-size: 1.5vh; color: #9c9;
                max-height: 18vh; overflow-y: auto; white-space: pre-wrap;
            }
            .vt-section-title { font-size: 2.1vh; font-weight: 700; color: #6cf; margin-top: 0.5vh; }
        </style>
        <div class="vt-wrap">
            <div class="vt-section-title">Upload audio (mp3 / ogg)</div>
            <div class="vt-row">
                <input type="text" data-el="upload-name" placeholder="reference name e.g. emotion.mp3" style="flex:1;min-width:20ch;" />
                <input type="file" data-el="upload-file" accept=".mp3,audio/mpeg" />
                <button class="vt-btn" data-el="upload-btn" disabled>Upload</button>
            </div>
            <div class="vt-files" data-el="files"></div>

            <div class="vt-section-title">Workflow payload (VocalizerJSONRequest)</div>
            <textarea data-el="payload" spellcheck="false"></textarea>
            <div class="vt-row">
                <button class="vt-btn" data-el="render-btn" disabled>Render &amp; Play</button>
                <button class="vt-btn" data-el="download-btn" disabled>Download last render</button>
                <span data-el="render-status" style="font-size:1.7vh;color:#bbb;"></span>
            </div>

            <div class="vt-section-title">Log</div>
            <div class="vt-log" data-el="log"></div>
        </div>`;

        this._el("payload").value = JSON.stringify(DEFAULT_WORKFLOW, null, 2);
        this._refreshFiles();

        this._el("upload-btn").addEventListener("click", this._onUploadClick);
        this._el("render-btn").addEventListener("click", this._onRenderClick);
        this._el("download-btn").addEventListener("click", this._onDownloadClick);
    }

    /**
     * @param {string} name 
     * @returns {any}
     */
    _el(name) {
        return /** @type {HTMLElement} */ (this.root.querySelector(`[data-el="${name}"]`));
    }

    async _connect() {
        try {
            const adapterName = await window.API.getConfigValue("voiceAdapter") || "Vocalizer";
            const enabled = await window.API.getConfigValue("voiceEnabled");
            if (!enabled) {
                this._log(`Voice is disabled in settings; enable it to connect.`);
                return;
            }
            this.adapter = await VOICE_ADAPTERS[adapterName].build(window.API.getConfigValue.bind(window.API));
            await this.adapter.ensureInitialized();

            // hack to make prepare for use the same connection
            // @ts-ignore
            window.GAME_VOCALIZER = {
                adapter: this.adapter,
            }
            await window.API.prepareFor("voice");
            // @ts-ignore
            window.GAME_VOCALIZER = null;

            this._log(`Connected to Voice adapter "${adapterName}".`);

            // @ts-ignore
            this._el("upload-btn").disabled = false;
            // @ts-ignore
            this._el("render-btn").disabled = false;
        } catch (err) {
            this._log(`Connection failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * @param {string} msg 
     * @returns 
     */
    async _log(msg) {
        const logEl = this.root.querySelector('[data-el="log"]');
        if (!logEl) return;
        logEl.textContent += `${msg}\n`;
    }

    async _onUploadClick() {
        if (!this.adapter) return;
        const uploadFile = this._el("upload-file");
        const uploadName = this._el("upload-name");
        const uploadBtn = this._el("upload-btn");
        const file = uploadFile.files && uploadFile.files[0];
        const name = (uploadName.value || "").trim() || (file ? file.name : "");
        if (!file) { this._log("Select an mp3/ogg file first."); return; }
        if (!name) { this._log("Provide a reference name for the upload."); return; }

        uploadBtn.disabled = true;
        try {
            this._log(`Uploading "${name}" (${file.size} bytes, ${file.type || "unknown type"})…`);
            const result = await this.adapter.sendFile(file, name);
            if (result.skipped) {
                this._log(`Server already had "${name}" (hash match) — skipped transfer.`);
            } else {
                this._log(`Uploaded "${name}" (${result.size} bytes, sha256 ${String(result.hash).slice(0, 12)}…).`);
            }
            this.uploaded.add(name);
            this._refreshFiles();
            uploadName.value = "";
            uploadFile.value = "";
        } catch (err) {
            this._log(`Upload failed: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            uploadBtn.disabled = false;
        }
    }

    async _onRenderClick() {
        if (!this.adapter) return;
        const payloadEl = this._el("payload");
        const renderBtn = this._el("render-btn");
        const renderStatus = this._el("render-status");

        let request;
        try {
            request = JSON.parse(payloadEl.value);
        } catch (err) {
            this._log(`Invalid JSON payload: ${err instanceof Error ? err.message : String(err)}`);
            return;
        }

        renderBtn.disabled = true;
        renderStatus.textContent = "rendering…";
        this._log(`Rendering (output_format=${request.output_format || "mp3"})…`);
        try {
            const blob = await this.adapter.runWorkflow(request);
            this._log(`Render complete: ${blob.size} bytes (${blob.type}).`);
            renderStatus.textContent = `${blob.size} bytes`;

            if (this.lastRenderUrl) { URL.revokeObjectURL(this.lastRenderUrl); }
            this.lastRenderUrl = URL.createObjectURL(blob);
            this.objectUrls.push(this.lastRenderUrl);
            this._el("download-btn").disabled = false;

            // Play the rendered audio through the app's sound helper.
            playSound(this.lastRenderUrl);
        } catch (err) {
            this._log(`Render failed: ${err instanceof Error ? err.message : String(err)}`);
            renderStatus.textContent = "failed";
        } finally {
            renderBtn.disabled = false;
        }
    }

    _onDownloadClick() {
        if (!this.lastRenderUrl) return;
        let ext = "mp3";
        try {
            const parsed = JSON.parse(this._el("payload").value);
            if (parsed.output_format === "mp3") ext = "mp3";
        } catch (_e) { /* ignore, default mp3 */ }
        const a = document.createElement("a");
        a.href = this.lastRenderUrl;
        a.download = `vocalizer-test.${ext}`;
        a.click();
    }
}

customElements.define("vocalizer-test", VocalizerTest);
