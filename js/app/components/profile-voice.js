import { VoiceAdapterWebsocketVocalizer } from "../../engine/voice/adapter-websocket-vocalizer.js";
import { playHoverSound } from "../sound.js";

/** @type {Map<string, number>} */
export const profileVoiceCacheVersions = new Map();

/**
 * Bump the cache-buster for a specific voice URL so any subsequently rendered
 * `app-profile-voice` instances pointing to it will fetch a fresh copy.
 * @param {string} voiceUrl
 */
export function invalidateProfileVoiceCache(voiceUrl) {
    if (!voiceUrl) return;
    profileVoiceCacheVersions.set(voiceUrl, (profileVoiceCacheVersions.get(voiceUrl) || 0) + 1);
}

/**
 * Escape a string for safe use inside a double-quoted HTML attribute.
 * @param {string} str
 * @returns {string}
 */
function escapeAttr(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Default line spoken when generating or testing a voice. Kept short and simple
 * so renders are fast; the user can replace it with whatever they like.
 */
const DEFAULT_SPEECH_TEXT = "Hello, how are you?";

/**
 * A phonetically rich sample phrase recommended to the user for recording a
 * reference clip when uploading their own voice.
 */
const VOICE_SAMPLE_TEXT =
    "Hi there, it's really nice to finally meet you. "
    + "Would you join me for a cup of coffee and a big slice of cheesecake? "
    + "Those old photographs by the window make me feel so wonderfully calm and joyful!";

/**
 * A sensible default generation block reused for both "generate" and "test".
 */
const DEFAULT_GENERATION = { cfg_value: 2.0, inference_timesteps: 10, normalize: true };

/**
 * `<app-profile-voice>` is the audio counterpart to `<app-profile-image>`.
 *
 * By default it plays and downloads the audio located at its `voice-url` DE
 * asset path. When `editable` is present the user can change the clip: if the
 * Vocalizer is enabled a small dialog offers three options (upload a file,
 * generate a voice, or test a voice), otherwise it falls straight through to a
 * plain file upload. Just like the profile image, unsaved changes live in
 * memory and are only written back to `voice-url` via {@link saveValueToUserData}.
 *
 * A `fallback-url` may be supplied: if the primary clip does not exist the
 * fallback is used both for playback preview and as the base, without being
 * resaved on its own.
 */
class ProfileVoice extends HTMLElement {
    constructor() {
        super();
        /** @type {ShadowRoot} */
        this.root = this.attachShadow({ mode: 'open' });

        /** @type {string|null} */
        this.currentObjectUrl = null;
        /** @type {File|null} */
        this.currentFileObject = null;
        this.triedFallback = false;
        this.hasAudio = false;
        this.isPlaying = false;
    }

    /**
     * Resolve a DE asset path (optionally `@`-prefixed) into an absolute URL.
     * Absolute http(s)/blob/data URLs are returned unchanged.
     * @param {string} url
     * @returns {string}
     */
    resolveAssetUrl(url) {
        if (!url) return url;
        if (/^(https?:|blob:|data:|\.\/)/.test(url)) return url;
        const isSystemAsset = url.startsWith('@');
        const base = isSystemAsset ? window.DREAMENGINE_DEFAULT_SCRIPTS_HOME : window.DREAMENGINE_HOME;
        return base + "/" + (isSystemAsset ? url.slice(1) : url);
    }

    async connectedCallback() {
        this.render();

        /** @type {HTMLAudioElement} */
        // @ts-expect-error
        const audio = this.root.querySelector('.voice-audio');

        audio.addEventListener('error', () => {
            const fallbackUrl = this.getAttribute('fallback-url');
            // If the primary clip is missing, fall back to the provided fallback
            // source (used as the base too) before declaring there is no audio.
            if (fallbackUrl && !this.triedFallback) {
                this.triedFallback = true;
                audio.src = this.resolveAssetUrl(fallbackUrl);
                return;
            }
            this.hasAudio = false;
            this.updateAvailability();
        });
        audio.addEventListener('canplay', () => {
            this.hasAudio = true;
            this.updateAvailability();
        });
        audio.addEventListener('ended', () => {
            this.isPlaying = false;
            this.updatePlayingState();
        });
        audio.addEventListener('pause', () => {
            this.isPlaying = false;
            this.updatePlayingState();
        });
        audio.addEventListener('play', () => {
            this.isPlaying = true;
            this.updatePlayingState();
        });

        this.root.querySelector('.play-btn')?.addEventListener('click', () => this.togglePlay());
        this.root.querySelector('.download-btn')?.addEventListener('click', () => this.downloadAudio());

        if (this.hasAttribute('editable')) {
            const fileInput = this.root.querySelector('input[type="file"]');
            const enabled = await window.API.getConfigValue("vocalizerEnabled");

            this.root.querySelector('.edit-btn')?.addEventListener('click', async () => {
                const host = await window.API.getConfigValue("vocalizerHost");
                const vocalizerAvailable = enabled && host && host.length > 0;

                if (vocalizerAvailable) {
                    this.openVoiceSourceChoiceDialog();
                } else {
                    this.promptUploadFile();
                }
            });

            this.root.querySelector('.edit-btn')?.addEventListener("mouseenter", playHoverSound);

            
            const testBtn = this.root.querySelector('.test-btn');
            if (!enabled) {
                testBtn?.setAttribute('disabled', 'true');
            } else {
                testBtn?.addEventListener('click', async () => {
                    this.openVoiceGenerationDialog('test');
                });
                testBtn?.addEventListener("mouseenter", playHoverSound);
            }

            // @ts-expect-error
            fileInput.addEventListener('change', (event) => {
                // @ts-expect-error
                const file = event.target.files[0];
                if (file) this.setLocalAudioFile(file);
            });
        }
    }

    disconnectedCallback() {
        if (this.currentObjectUrl) {
            URL.revokeObjectURL(this.currentObjectUrl);
            this.currentObjectUrl = null;
        }
    }

    /**
     * Adopt a user-provided audio file (upload or generation) as the pending
     * change. It becomes the audio that plays and, on save, is written to
     * `voice-url`.
     * @param {File|Blob} file
     */
    setLocalAudioFile(file) {
        if (file.size > 1 * 1024 * 1024) {
            const dialog = document.createElement('app-dialog');
            dialog.setAttribute('dialog-title', 'File Too Large');
            dialog.setAttribute('confirm-text', 'OK');
            dialog.setAttribute('extra-z-index', '200');
            dialog.innerHTML = `<div style="font-size:2.8vh;line-height:1.5;">The selected file is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Please choose a file under 1 MB.</div>`;
            document.body.appendChild(dialog);
            dialog.addEventListener('confirm', () => dialog.parentNode?.removeChild(dialog));
            dialog.addEventListener('cancel', () => dialog.parentNode?.removeChild(dialog));
            return;
        }
        const urlBlob = URL.createObjectURL(file);
        if (this.currentObjectUrl) {
            URL.revokeObjectURL(this.currentObjectUrl);
        }
        this.currentObjectUrl = urlBlob;
        this.currentFileObject = file instanceof File
            ? file
            : new File([file], 'voice', { type: file.type || 'audio/ogg' });
        this.triedFallback = false;
        /** @type {HTMLAudioElement} */
        // @ts-expect-error
        const audio = this.root.querySelector('.voice-audio');
        audio.src = urlBlob;
        audio.load();
    }

    togglePlay() {
        if (!this.hasAudio) return;
        /** @type {HTMLAudioElement} */
        // @ts-expect-error
        const audio = this.root.querySelector('.voice-audio');
        if (this.isPlaying) {
            audio.pause();
        } else {
            audio.currentTime = 0;
            audio.play().catch((err) => console.log('Voice play failed:', err));
        }
    }

    downloadAudio() {
        if (!this.hasAudio) return;
        /** @type {HTMLAudioElement} */
        // @ts-expect-error
        const audio = this.root.querySelector('.voice-audio');
        const a = document.createElement('a');
        a.href = audio.src;
        a.download = (this.getAttribute('download-name') || 'voice') + '.ogg';
        a.click();
    }

    updateAvailability() {
        const playBtn = this.root.querySelector('.play-btn');
        const downloadBtn = this.root.querySelector('.download-btn');
        if (playBtn) playBtn.toggleAttribute('disabled', !this.hasAudio);
        if (downloadBtn) downloadBtn.toggleAttribute('disabled', !this.hasAudio);
        const statusEl = this.root.querySelector('.voice-status');
        if (statusEl) statusEl.textContent = this.hasAudio ? '' : 'No audio';
    }

    updatePlayingState() {
        const playIcon = this.root.querySelector('.play-icon');
        const pauseIcon = this.root.querySelector('.pause-icon');
        // @ts-expect-error
        if (playIcon) playIcon.style.display = this.isPlaying ? 'none' : '';
        // @ts-expect-error
        if (pauseIcon) pauseIcon.style.display = this.isPlaying ? '' : 'none';
    }

    /**
     * Open the native file picker for choosing an audio clip. Unless the user
     * has previously opted out, first show a guidance dialog recommending what
     * to record — the standard sample phrase — with "Continue" and a
     * "Do not show again" toggle persisted in localStorage.
     */
    promptUploadFile() {
        const fileInput = this.root.querySelector('input[type="file"]');
        const openPicker = () => {
            // @ts-expect-error
            fileInput.click();
        };

        if (localStorage.getItem('hideVoiceUploadGuidance') === 'true') {
            openPicker();
            return;
        }

        const dialog = document.createElement('app-dialog');
        dialog.setAttribute('dialog-title', 'Recording Tip');
        dialog.setAttribute('confirmation', 'true');
        dialog.setAttribute('confirm-text', 'Continue');
        dialog.setAttribute('cancel-text', 'Cancel');
        dialog.setAttribute('extra-z-index', '200');
        dialog.innerHTML = `
            <style>
                .vu-intro { font-size: 2.6vh; margin-bottom: 2vh; line-height: 1.4; }
                .vu-sample {
                    font-size: 3vh;
                    font-style: italic;
                    color: #FF6B6B;
                    border-left: solid 0.5vh rgba(100, 0, 200, 0.6);
                    padding: 1.5vh 2vh;
                    margin: 2vh 0;
                    background: rgba(100, 0, 200, 0.15);
                    border-radius: 0.5vh;
                    line-height: 1.4;
                }
                .vu-hint { font-size: 2.2vh; opacity: 0.7; margin-bottom: 2vh; }
                .vu-dontshow {
                    display: flex;
                    align-items: center;
                    gap: 1.5vh;
                    font-size: 2.4vh;
                    cursor: pointer;
                    user-select: none;
                    margin-top: 2vh;
                }
                .vu-dontshow input {
                    width: 2.6vh;
                    height: 2.6vh;
                    cursor: pointer;
                    accent-color: rgba(100, 0, 200, 0.9);
                }
            </style>
            <div class="vu-intro">For the best results, record a clear clip of the voice saying something like:</div>
            <div class="vu-sample">${VOICE_SAMPLE_TEXT}</div>
            <div class="vu-hint">A calm, natural reading in a quiet room works best. A short clip is plenty.</div>
            <label class="vu-dontshow">
                <input type="checkbox" id="vu-dontshow-checkbox" />
                Do not show this again
            </label>
        `;
        document.body.appendChild(dialog);

        const closeDialog = () => {
            if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
        };

        dialog.addEventListener('cancel', closeDialog);
        dialog.addEventListener('confirm', () => {
            const checkbox = dialog.querySelector('#vu-dontshow-checkbox');
            // @ts-expect-error
            if (checkbox && checkbox.checked) {
                localStorage.setItem('hideVoiceUploadGuidance', 'true');
            }
            closeDialog();
            openPicker();
        });
    }

    /**
     * Present the three change options when the Vocalizer is enabled: upload a
     * file, generate a voice, or test a voice.
     */
    openVoiceSourceChoiceDialog() {
        const dialog = document.createElement('app-dialog');
        dialog.setAttribute('dialog-title', 'Change Voice');
        dialog.setAttribute('extra-z-index', '200');
        dialog.innerHTML = `
            <style>
                .voice-source-choices {
                    display: flex;
                    gap: 2vh;
                    justify-content: center;
                    flex-wrap: wrap;
                    padding: 2vh 0;
                }
                .voice-source-choice {
                    font-size: 3vh;
                    padding: 2vh 3vh;
                    border-radius: 1vh;
                    background: rgba(100, 0, 200, 0.3);
                    border: solid 2px black;
                    cursor: pointer;
                    color: white;
                    user-select: none;
                }
                .voice-source-choice:hover, .voice-source-choice:focus {
                    background: rgba(100, 0, 200, 0.6);
                    color: #FF6B6B;
                }
            </style>
            <div class="voice-source-choices">
            <div class="voice-source-choice" id="choice-upload" role="button" tabindex="0" data-de-aria-key="u">Upload File</div>
            <div class="voice-source-choice" id="choice-generate" role="button" tabindex="0" data-de-aria-key="g">Generate Voice <span style="font-size:2vh;opacity:0.6;">(not recommended)</span></div>
            </div>
        `;
        document.body.appendChild(dialog);

        const closeDialog = () => {
            if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
        };

        dialog.addEventListener('cancel', closeDialog);

        dialog.querySelector('#choice-upload')?.addEventListener('click', () => {
            closeDialog();
            this.promptUploadFile();
        });
        dialog.querySelector('#choice-generate')?.addEventListener('click', () => {
            closeDialog();
            this.openVoiceGenerationDialog('generate');
        });
        dialog.querySelector('#choice-test')?.addEventListener('click', () => {
            closeDialog();
            this.openVoiceGenerationDialog('test');
        });
    }

    /**
     * Open a form to render a voice through the Vocalizer. In `generate` mode the
     * rendered clip becomes the pending change (saved to `voice-url` on confirm).
     * In `test` mode it is only played back and never saved.
     * @param {"generate"|"test"} mode
     */
    openVoiceGenerationDialog(mode) {
        const isGenerate = mode === 'generate';

        const defaultPrompt = this.getAttribute('voice-prompt') || '';
        const canUseSelfReference = this.hasAudio && isGenerate;

        const dialog = document.createElement('app-dialog');
        dialog.setAttribute('dialog-title', isGenerate ? 'Generate Voice' : 'Test Voice');
        dialog.setAttribute('confirmation', 'true');
        dialog.setAttribute('confirm-text', isGenerate ? 'Generate' : 'Render & Play');
        dialog.setAttribute('cancel-text', 'Cancel');
        dialog.setAttribute('extra-z-index', '200');
        dialog.innerHTML = `
            <style>
                .vg-ref-row {
                    display: flex;
                    align-items: center;
                    gap: 1.5vh;
                    margin-bottom: 2vh;
                    margin-top: 2vh;
                    font-size: 3vh;
                    user-select: none;
                }
                .vg-ref-row.disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }
                .vg-ref-row label {
                    display: flex;
                    align-items: center;
                    gap: 1.5vh;
                    cursor: pointer;
                }
                .vg-ref-row.disabled label { cursor: not-allowed; }
                .vg-ref-row input[type="checkbox"] {
                    width: 3vh;
                    height: 3vh;
                    accent-color: rgba(100, 0, 200, 0.9);
                    cursor: pointer;
                }
                .vg-ref-hint {
                    font-size: 2vh;
                    opacity: 0.6;
                }
                .vg-status {
                    font-size: 2.5vh;
                    color: #fc6;
                    min-height: 3vh;
                    margin-top: 1vh;
                }
            </style>
            <app-overlay-input
                id="vg-text-input"
                label="Text to speak"
                multiline="true"
                input-placeholder="Something for the voice to say…"
                input-default-value="${escapeAttr(DEFAULT_SPEECH_TEXT)}"
                aria-key="t"
            ></app-overlay-input>
            <app-overlay-input
                id="vg-prompt-input"
                label="Voice description"
                input-placeholder="e.g. an older man, gravelly voice"
                input-default-value="${escapeAttr(defaultPrompt)}"
                aria-key="v"
            ></app-overlay-input>
            ${isGenerate ? '' : '<!--'}<div class="vg-ref-row${canUseSelfReference ? '' : ' disabled'}" id="vg-ref-row">
                <label>
                    <input type="checkbox" id="vg-ref-checkbox" ${canUseSelfReference ? '' : 'disabled'} />
                    Use current voice as reference
                </label>
                <span class="vg-ref-hint">${canUseSelfReference ? 'Clones the existing voice' : 'No audio available'}</span>
            </div>${isGenerate ? '' : '-->'}
            <div class="vg-status" id="vg-status"></div>
        `;
        document.body.appendChild(dialog);

        const closeDialog = () => {
            if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
        };
        dialog.addEventListener('cancel', closeDialog);

        let busy = false;
        dialog.addEventListener('confirm', async () => {
            if (busy) return;

            const textInput = dialog.querySelector('#vg-text-input');
            const promptInput = dialog.querySelector('#vg-prompt-input');
            const refCheckbox = dialog.querySelector('#vg-ref-checkbox');
            const statusEl = dialog.querySelector('#vg-status');

            // @ts-ignore
            const text = (textInput?.getValue?.() || '').trim() || DEFAULT_SPEECH_TEXT;
            // @ts-ignore
            const prompt = (promptInput?.getValue?.() || '').trim();
            // @ts-ignore
            const useSelfReference = !!(refCheckbox && refCheckbox.checked && !refCheckbox.disabled);

            busy = true;
            if (statusEl) statusEl.textContent = 'Rendering…';

            /** @type {File|null} */
            let refFile = null;
            let refName = null;
            if (useSelfReference || !isGenerate) {
                try {
                    refFile = await this.getCurrentAudioAsFile();
                    refName = refFile ? refFile.name : null;
                } catch (err) {
                    if (statusEl) statusEl.textContent = `Could not load current audio: ${err instanceof Error ? err.message : String(err)}`;
                    busy = false;
                    return;
                }
            }

            /** @type {import("../../engine/voice/base.js").VocalizerSpeechSegment} */
            const segment = { text };
            if (prompt) segment.voice_prompt = prompt;
            if (refName) segment.ref = refName;

            /** @type {import("../../engine/voice/base.js").VocalizerJSONRequest} */
            const request = {
                output_format: 'ogg',
                generation: { ...DEFAULT_GENERATION },
                segments: [segment],
            };

            try {
                const blob = await this.renderVoice(request, refFile, refName);
                if (isGenerate) {
                    this.setLocalAudioFile(blob);
                    closeDialog();
                } else {
                    // Test mode: play once, keep the dialog open for iterating.
                    const url = URL.createObjectURL(blob);
                    const testAudio = new Audio(url);
                    testAudio.addEventListener('ended', () => URL.revokeObjectURL(url));
                    testAudio.play().catch((err) => console.log('Voice test play failed:', err));
                    if (statusEl) statusEl.textContent = `Rendered ${blob.size} bytes — playing…`;
                    busy = false;
                }
            } catch (err) {
                if (statusEl) statusEl.textContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
                busy = false;
            }
        });
    }

    /**
     * Fetch the currently displayed audio (pending upload, primary clip, or
     * fallback) as a File suitable for use as a Vocalizer reference clip.
     * @returns {Promise<File|null>}
     */
    async getCurrentAudioAsFile() {
        /** @type {HTMLAudioElement} */
        // @ts-expect-error
        const audio = this.root.querySelector('.voice-audio');
        const src = audio && audio.src;
        if (!src) return null;
        const response = await fetch(src);
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        const blob = await response.blob();
        return new File([blob], this.getAttribute("reference-name") || "reference", { type: blob.type });
    }

    /**
     * Connect to the Vocalizer, optionally upload a reference clip, render the
     * given request, and return the resulting audio Blob. The connection is
     * closed afterwards.
     * @param {import("../../engine/voice/base.js").VocalizerJSONRequest} request
     * @param {File|null} refFile
     * @param {string|null} refName
     * @returns {Promise<Blob>}
     */
    async renderVoice(request, refFile, refName) {
        const host = await window.API.getConfigValue("vocalizerHost");
        const secret = await window.API.getConfigValue("vocalizerApiKey");
        const adapter = new VoiceAdapterWebsocketVocalizer({
            host: (host || "wss://127.0.0.1:8222").toString(),
            secret: (secret || "").toString(),
        });
        try {
            await adapter.ensureInitialized();
            if (refFile && refName) {
                await adapter.sendFile(refFile, refName);
            }
            return await adapter.runWorkflow(request);
        } finally {
            try { adapter.close(); } catch (_e) { /* ignore */ }
        }
    }

    hasBeenModified() {
        return this.currentObjectUrl !== null;
    }

    async saveValueToUserData() {
        if (!this.hasBeenModified() || !this.currentFileObject) {
            return;
        }
        const voiceUrl = this.getAttribute('voice-url') || '';
        await window.API.uploadFileToDEPath(voiceUrl, this.currentFileObject);
        invalidateProfileVoiceCache(voiceUrl);
    }

    render() {
        const voiceUrl = this.getAttribute('voice-url') || '';
        const isEditable = this.hasAttribute('editable');
        const cacheVersion = profileVoiceCacheVersions.get(voiceUrl) || 0;
        const cacheBuster = cacheVersion ? `?v=${cacheVersion}` : '';
        const resolved = this.resolveAssetUrl(voiceUrl) + cacheBuster;
        this.root.innerHTML = `
            <style>
                :host {
                    display: block;
                    width: 100%;
                    height: 100%;
                    aspect-ratio: 1 / 1;
                }
                .voice-container {
                    width: 100%;
                    height: 100%;
                    box-sizing: border-box;
                    border-radius: 10%;
                    border: 1vh solid white;
                    box-shadow: 0 0 1vh rgba(0, 0, 0, 0.5);
                    background: rgba(100, 0, 200, 0.15);
                    position: relative;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 6%;
                    overflow: hidden;
                }
                button {
                    background: transparent;
                    border: none;
                    color: white;
                    cursor: pointer;
                    padding: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                button:disabled {
                    opacity: 0.35;
                    cursor: not-allowed;
                }
                .play-btn {
                    width: 40%;
                    height: 40%;
                }
                .play-btn svg {
                    width: 100%;
                    height: 100%;
                    filter: drop-shadow(0 0 0.4vh rgba(0,0,0,0.6));
                }
                .voice-controls {
                    display: flex;
                    align-items: center;
                    gap: 8%;
                }
                .download-btn {
                    width: 16%;
                    height: 16%;
                    min-width: 3vh;
                }
                .download-btn svg { width: 100%; height: 100%; }
                .voice-status {
                    font-size: 1.5vh;
                    color: #ffd;
                    opacity: 0.85;
                    text-align: center;
                }
                .edit-btn, .test-btn {
                    position: absolute;
                    bottom: 6%;
                    right: 6%;
                    width: 22%;
                    height: 22%;
                    background: rgba(0, 0, 0, 0.45);
                    border-radius: 50%;
                    border: none;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    opacity: 0.55;
                    transition: opacity 0.2s, background 0.2s;
                    padding: 0;
                    color: white;
                }
                .test-btn { left: 6%; right: auto; }
                .edit-btn:hover, .edit-btn:focus, .test-btn:hover, .test-btn:focus {
                    opacity: 1;
                    background: rgba(100, 0, 200, 0.7);
                }
                .edit-btn svg, .test-btn svg {
                    width: 55%;
                    height: 55%;
                    pointer-events: none;
                }
            </style>
            <div class="voice-container" part="voice-container">
                <button class="play-btn" title="Play / Pause" aria-label="Play voice" disabled>
                    <svg class="play-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#fff" d="M8 5v14l11-7z"/></svg>
                    <svg class="pause-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="display:none;"><path fill="#fff" d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>
                </button>
                <div class="voice-controls">
                    <button class="download-btn" title="Download" aria-label="Download voice" disabled>
                        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#fff" d="M12 3v10.55l3.3-3.3 1.4 1.4L12 17.4 7.3 12.65l1.4-1.4L12 13.55V3zm-7 15h14v2H5z"/></svg>
                    </button>
                </div>
                <div class="voice-status"></div>
                <button class="test-btn" title="Test voice" aria-label="Test voice">
                    <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><path fill="#fff" d="M256 32C132.3 32 32 132.3 32 256s100.3 224 224 224s224-100.3 224-224S379.7 32 256 32zm0 400c-97.2 0-176-78.8-176-176S158.8 80 256 80s176 78.8 176 176s-78.8 176-176 176z"/><path fill="#fff" d="M256 128c-70.7 0-128 57.3-128 128s57.3 128 128 128s128-57.3 128-128s-57.3-128-128-128zm0 224c-53 0-96-43-96-96s43-96 96-96s96 43 96 96s-43 96-96 96z"/></svg>
                </button>
                ${isEditable ? `<button class="edit-btn" title="Change voice" aria-label="Change voice" data-de-aria-key="v">
                    <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><path fill="#fff" d="M441 58.9L453.1 71c9.4 9.4 9.4 24.6 0 33.9L424 134.1 377.9 88 407 58.9c9.4-9.4 24.6-9.4 33.9 0zM209.8 256.2L344 121.9 390.1 168 255.8 302.2c-2.9 2.9-6.5 5-10.4 6.1l-58.5 16.7 16.7-58.5c1.1-3.9 3.2-7.5 6.1-10.4zM373.1 25L175.8 222.2c-8.7 8.7-15 19.4-18.3 31.1l-28.6 100c-2.4 8.4-.1 17.4 6.1 23.6s15.2 8.5 23.6 6.1l100-28.6c11.8-3.4 22.5-9.7 31.1-18.3L487 138.9c28.1-28.1 28.1-73.7 0-101.8L474.9 25C446.8-3.1 401.2-3.1 373.1 25zM88 64C39.4 64 0 103.4 0 152L0 424c0 48.6 39.4 88 88 88l272 0c48.6 0 88-39.4 88-88l0-112c0-13.3-10.7-24-24-24s-24 10.7-24 24l0 112c0 22.1-17.9 40-40 40L88 464c-22.1 0-40-17.9-40-40l0-272c0-22.1 17.9-40 40-40l112 0c13.3 0 24-10.7 24-24s-10.7-24-24-24L88 64z"/></svg>
                </button>` : ''}
            </div>
            <audio class="voice-audio" preload="metadata" src="${resolved}"></audio>
            <input type="file" accept=".mp3,.ogg,.wav,audio/mpeg,audio/ogg" style="display:none;" />
        `;
    }
}

customElements.define('app-profile-voice', ProfileVoice);
