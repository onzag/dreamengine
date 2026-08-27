import { DiffusionAdapterAIHub } from "../../../engine/diffusion/adapter-aihub.js";
import "./aihub-custom-selector.js";

export class ImageEdit extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });

        this.ownsDiffusionProcess = false;

        /** @type {Array<{name: string, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, visible: boolean, opacity: number, id: string}>} */
        this.layers = [];
        this.activeLayerId = null;
        this._layerIdCounter = 0;

        this.brushSize = 20;
        this.brushColor = '#000000';
        this.brushHardness = 0.75;

        this.zoom = 1;
        this.minZoom = 0.1;
        this.maxZoom = 8;

        this.isDrawing = false;
        this.isErasing = false;
        this.lastPoint = null;

        /** @type {Array<{layerId: string, imageData: ImageData}>} recent brush operations for undo */
        this.undoHistory = [];
        this.maxUndoSteps = 10;

        this.imageWidth = 512;
        this.imageHeight = 512;

        /** @type {HTMLElement} */
        this.canvasStack = /** @type {any} */ (null);

        /** @type {Array<() => void>} listeners notified (debounced) when the image changes */
        this.imageChangeListeners = [];
        /** @type {any} debounce timer handle for image change notifications */
        this.imageChangeTimer = null;

        // bound handlers
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        this.onWheel = this.onWheel.bind(this);
        this.onPointerEnter = this.onPointerEnter.bind(this);
        this.onPointerLeave = this.onPointerLeave.bind(this);
        this.onInfoList = this.onInfoList.bind(this);
        this.onWorkflowMessage = this.onWorkflowMessage.bind(this);
    }
    connectedCallback() {
        // Build the editor UI immediately so it is available while the connection is set up.
        this.buildImageEditUI();
        this.setupConnectionToDiffusionServer();
    }

    /**
     * @param {import("../../../engine/diffusion/adapter-aihub.js").AiHubInfoList} data
     */
    onInfoList(data) {
        const selector = /** @type {import("./aihub-custom-selector.js").AIHubCustomSelector | null} */ (
            this.root.getElementById('aihub-selector')
        );
        if (!selector) return;
        selector.configure({
            infoList: data,
            canvas: this,
            adapter: this.diffusionAdapter,
            limit: { context: 'image', projectType: null },
        });

        const runBtn = /** @type {HTMLButtonElement|null} */ (this.root.getElementById('run-workflow'));
        if (runBtn) {
            // Show the button immediately if a workflow is already selected.
            runBtn.disabled = !selector.getValue()?.workflowId;
            // Keep it in sync whenever the selection changes.
            selector.addEventListener('change', (e) => {
                runBtn.disabled = !/** @type {CustomEvent} */ (e).detail?.workflowId;
            });
            runBtn.addEventListener('click', () => this.runWorkflow());
        }
    }

    /** Run the currently selected workflow. */
    runWorkflow() {
        if (this.isRunningWorkflow) {
            this.cancelRunWorkflow();
        } else {
            this.doRunWorkflow();
        }
    }

    async doRunWorkflow() {
        this.isRunningWorkflow = true;
        const runBtn = /** @type {HTMLButtonElement|null} */ (this.root.getElementById('run-workflow'));
        if (runBtn) runBtn.innerHTML = '&#10074;&#10074; Cancel';

        const selector = /** @type {import("./aihub-custom-selector.js").AIHubCustomSelector | null} */ (
            this.root.getElementById('aihub-selector')
        );
        if (!selector) { this.finishRunWorkflow(); return; }

        this.setStatus('Uploading files&hellip;', 'loading');
        try {
            await selector.uploadAllFiles();
        } catch (err) {
            this.setStatus('Failed to upload files: ' + this.errorText(err), 'error');
            this.finishRunWorkflow();
            return;
        }

        const data = selector.getValue();
        const workflowId = data?.workflowId;
        if (!workflowId) {
            this.setStatus('No workflow selected.', 'error');
            this.finishRunWorkflow();
            return;
        }

        // Track the run so incoming messages can be matched to it.
        this.currentWorkflowId = workflowId;
        this.currentRunId = null;

        if (!this.diffusionAdapter) {
            this.setStatus('Not connected to the diffusion server.', 'error');
            this.finishRunWorkflow();
            return;
        }

        try {
            this.diffusionAdapter.addListenerOnMessage(this.onWorkflowMessage);
            this.setStatus('Queueing workflow&hellip;', 'loading');
            this.diffusionAdapter.sendWorkflowOperation(workflowId, {expose: data.values});
        } catch (err) {
            this.setStatus('Failed to start the workflow: ' + this.errorText(err), 'error');
            this.finishRunWorkflow();
        }
    }

    /**
     * Handle workflow-related messages coming back from the diffusion server.
     * @param {any} msg
     * @param {Blob | null} binaryData
     */
    onWorkflowMessage(msg, binaryData) {
        if (!msg || !this.isRunningWorkflow) return;
        // Only react to messages for the workflow we launched.
        if (msg.workflow_id && this.currentWorkflowId && msg.workflow_id !== this.currentWorkflowId) return;

        switch (msg.type) {
            case 'WORKFLOW_AWAIT': {
                this.currentRunId = msg.id;
                const ahead = typeof msg.before_this === 'number' ? msg.before_this : 0;
                if (ahead > 0) {
                    this.setStatus(`Queued (${ahead} ahead)&hellip;`, 'loading');
                } else {
                    this.setStatus('Queued, starting soon&hellip;', 'loading');
                }
                break;
            }
            case 'WORKFLOW_STATUS': {
                // Ignore progress for a different run if we already know our id.
                if (this.currentRunId && msg.id && msg.id !== this.currentRunId) break;
                const total = msg.total || 1;
                const progress = msg.progress || 0;
                const pct = Math.round((progress / total) * 100);
                const nodeName = msg.node_name || msg.node_id || 'workflow';
                this.setStatus(`${nodeName}: ${pct}% (${progress}/${total})`, 'loading');
                break;
            }
            case 'WORKFLOW_FINISHED': {
                if (this.currentRunId && msg.id && msg.id !== this.currentRunId) break;
                if (msg.error || msg.cancelled) {
                    this.setStatus(msg.error_message || 'Workflow cancelled.', 'error');
                } else {
                    this.setStatus('Workflow finished.', 'ok');
                }
                this.finishRunWorkflow();
                break;
            }
            case 'FILE': {
                const dataType = msg.data_type; // should be defined if not it is invalid
                const action = msg.action; // should be defined if not it is invalid

                // example message {"type": "FILE", "workflow_id": "basic_inpaint", "id": "8c19fe03-ffcf-4199-bc8b-5cff73790732", "data_type": "image/png", "action": {"action": "NEW_LAYER", "width": 1024, "height": 1024, "type": "image/png", "pos_x": 0, "pos_y": 0, "reference_layer_id": "1", "reference_layer_action": "REPLACE", "name": "new layer", "file_name": "new_layer.png", "file_action": ""}}
                // potential actions: NEW_LAYER, NEW_IMAGE (ignore all others)
                // potential reference_layer_action: REPLACE, NEW_BEFORE, NEW_AFTER (ignore all others)
                // NOTE about the implementation is NEW_LAYER with REPLACE, do not delete the reference layer; just hide it and do the same as NEW_AFTER; this is to avoid destructive changes, even when it says REPLACE we will not do it like that
                // reference_layer_id the name of the layer that is in reference
                // make sure when inserting a layer with the same name to add a number if the layer name already exists
                // pos_x and pos_y are the position of the new layer relative to the reference layer, since the image is the same size; notice that there is technically no guarantee that the image is the same size as the canvas
                // as all our layers are the same size as the canvas as this is a small tool and not a full image editor, just draw the image from the pos_x and pos_y given in the canvas and crop anything that is outside this box
                if (!action || !binaryData) break;
                if (action.action !== 'NEW_LAYER' && action.action !== 'NEW_IMAGE') break;
                if (dataType && typeof dataType === 'string' && !dataType.startsWith('image/')) break;
                this.applyIncomingFile(action, binaryData);
                break;
            }

            case 'ERROR': {
                this.setStatus(msg.message || 'Workflow error.', 'error');
                this.finishRunWorkflow();
                break;
            }
        }
    }

    /** Reset the run state and restore the Run button. */
    finishRunWorkflow() {
        this.isRunningWorkflow = false;
        this.currentRunId = null;
        this.currentWorkflowId = null;
        if (this.diffusionAdapter) {
            this.diffusionAdapter.removeListenerOnMessage(this.onWorkflowMessage);
        }
        const runBtn = /** @type {HTMLButtonElement|null} */ (this.root.getElementById('run-workflow'));
        if (runBtn) runBtn.innerHTML = '&#9654; Run Workflow';
    }

    cancelRunWorkflow() {
        // TODO: send a cancel request to the server once the protocol is defined.
        this.setStatus('Cancelling&hellip;', 'loading');
        this.finishRunWorkflow();
    }

    /**
     * Update the status region with a message.
     * @param {string} html
     * @param {'loading'|'error'|'ok'} [kind]
     */
    setStatus(html, kind = 'loading') {
        const statusText = this.root.getElementById('status-text');
        if (!statusText) return;
        let color = '#c9a7ff';
        let icon = '&#9203;'; // hourglass
        if (kind === 'error') { color = '#ff6b6b'; icon = '&#9888;'; }
        else if (kind === 'ok') { color = '#7CFC8A'; icon = '&#10003;'; }
        statusText.innerHTML = `<span style="color:${color};">${icon} ${html}</span>`;
    }

    async setupConnectionToDiffusionServer() {
        try {
            this.setStatus('Loading configuration&hellip;', 'loading');

            const diffusionHost = await window.API.getConfigValue("diffusionHost");
            const diffusionApiKey = await window.API.getConfigValue("diffusionApiKey");
            const diffusionExecutable = await window.API.getConfigValue("diffusionExecutablePath");
            const handleDiffusionExecutable = await window.API.getConfigValue("handleDiffusionExecutable");

            if (!diffusionHost) {
                this.setStatus('Diffusion is not supported.', 'error');
                return;
            }

            if (diffusionExecutable && handleDiffusionExecutable) {
                try {
                    try {
                        await window.ENGINE_WORKER_CLIENT.pauseInference();
                    } catch (err) {}
                    // this needs to run a local executable
                    this.setStatus('Starting Diffusion Server (VRAM Save Mode)&hellip;', 'loading');
                    await window.API.startDiffusionProcess();
                    this.ownsDiffusionProcess = true;
                } catch (err) {
                    this.setStatus('Failed to start the diffusion process: ' + this.errorText(err), 'error');
                    return;
                }
            }

            this.setStatus('Connecting to the diffusion server&hellip;', 'loading');

            this.diffusionAdapter = new DiffusionAdapterAIHub({
                host: diffusionHost,
                apiKey: diffusionApiKey,
            });
            this.diffusionAdapter.addListenerOnInfoList(this.onInfoList);
            await this.diffusionAdapter.ensureInitialized();

            this.setStatus('Ready.', 'ok');
        } catch (err) {
            this.setStatus('Could not connect to the diffusion server: ' + this.errorText(err), 'error');
        }
    }

    /**
     * @param {unknown} err
     * @returns {string}
     */
    errorText(err) {
        if (err instanceof Error) return err.message;
        if (typeof err === 'string') return err;
        try { return JSON.stringify(err); } catch { return String(err); }
    }

    buildImageEditUI() {
        const imgSrc = this.getAttribute('img-src');
        this.imageWidth = parseInt(this.getAttribute('image-width') || '512', 10) || 512;
        this.imageHeight = parseInt(this.getAttribute('image-height') || '512', 10) || 512;

        this.root.innerHTML = `
        <style>
            :host {
                display: block;
                width: 100%;
                height: 100%;
            }
            *::-webkit-scrollbar { width: 1vh; height: 1vh; }
            *::-webkit-scrollbar-track { background: rgba(100, 0, 200, 0.3); }
            *::-webkit-scrollbar-thumb {
                background: rgba(50, 0, 100, 0.8);
                border: 1px solid #ccc;
                border-radius: 0.5vh;
            }
            .editor {
                display: flex;
                flex-direction: column;
                width: 100%;
                height: 100%;
                color: white;
                font-family: sans-serif;
            }
            .status-region {
                flex: 0 0 auto;
                padding: 1vh 2vh;
                font-size: 2vh;
                border-bottom: 0.2vh solid rgba(150, 80, 220, 0.4);
                min-height: 3vh;
                display: flex;
                align-items: center;
                gap: 1.5vh;
            }
            #status-text { flex: 1 1 auto; }
            #run-workflow {
                flex: 0 0 auto;
                padding: 0.7vh 1.5vh;
                font-size: 1.8vh;
                border-radius: 0.7vh;
                cursor: pointer;
                color: #fff;
                background: rgba(100, 0, 180, 0.75);
                border: 0.15vh solid rgba(180, 100, 255, 0.7);
                user-select: none;
                white-space: nowrap;
            }
            #run-workflow:not([disabled]):hover { background: rgba(130, 0, 230, 0.9); }
            #run-workflow[disabled] { opacity: 0.45; cursor: default; }
            .main {
                flex: 1 1 auto;
                display: flex;
                flex-direction: row;
                min-height: 0;
            }
            .toolbar {
                flex: 0 0 auto;
                width: 22vh;
                padding: 1.5vh;
                display: flex;
                flex-direction: column;
                gap: 1.5vh;
                overflow-y: auto;
            }
            .sidebar {
                flex: 0 0 auto;
                width: 26vh;
                padding: 1.5vh;
                display: flex;
                flex-direction: column;
                gap: 1vh;
                overflow-y: auto;
                background: rgba(15, 0, 25, 0.7);
                border-left: 0.2vh solid rgba(150, 80, 220, 0.4);
            }
            .tool-group { display: flex; flex-direction: column; gap: 0.7vh; }
            .tool-group label { font-size: 1.7vh; color: #c9a7ff; }
            .tool-group input[type="range"] { width: 100%; accent-color: #8a2be2; }
            .tool-group input[type="color"] {
                width: 100%; height: 4vh; border: none; background: none; cursor: pointer;
            }
            .section-title {
                font-size: 2vh; font-weight: bold; color: #d9b8ff;
                margin-bottom: 0.5vh;
            }
            .canvas-region {
                flex: 1 1 auto;
                position: relative;
                overflow: auto;
                background:
                    repeating-conic-gradient(#2b2b2b 0% 25%, #3a3a3a 0% 50%) 50% / 3vh 3vh;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .canvas-stack {
                position: relative;
                transform-origin: top left;
                flex: 0 0 auto;
                cursor: none;
            }
            .canvas-stack canvas {
                position: absolute;
                top: 0;
                left: 0;
                image-rendering: pixelated;
            }
            .brush-cursor {
                position: absolute;
                top: 0;
                left: 0;
                border-radius: 50%;
                border: 1px dashed #fff;
                box-shadow: 0 0 0 1px #000, inset 0 0 0 1px #000;
                transform: translate(-50%, -50%);
                pointer-events: none;
                display: none;
                z-index: 9999;
            }
            .btn {
                padding: 1vh;
                font-size: 1.7vh;
                text-align: center;
                border-radius: 0.7vh;
                cursor: pointer;
                background: rgba(80, 0, 140, 0.6);
                border: 0.15vh solid rgba(150, 80, 220, 0.5);
                user-select: none;
            }
            .btn:hover { background: rgba(110, 0, 190, 0.8); }
            .layer {
                display: flex;
                align-items: center;
                gap: 0.7vh;
                padding: 0.8vh;
                border-radius: 0.6vh;
                background: rgba(40, 0, 70, 0.5);
                border: 0.15vh solid transparent;
                font-size: 1.6vh;
            }
            .layer.active { border-color: #b06bff; background: rgba(70, 0, 120, 0.7); }
            .layer .layer-name { flex: 1 1 auto; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .layer .layer-index {
                width: 2.4vh; height: 2.4vh; line-height: 2.4vh; text-align: center;
                border-radius: 50%; background: rgba(138, 43, 226, 0.7); font-size: 1.5vh;
            }
            .layer input[type="range"] { width: 6vh; accent-color: #8a2be2; }
            .layer .layer-toggle { cursor: pointer; font-size: 1.9vh; }
            .layer .layer-delete { cursor: pointer; font-size: 1.6vh; opacity: 0.5; line-height: 1; padding: 0 0.3vh; }
            .layer .layer-delete:hover { opacity: 1; color: #ff6b6b; }
            .zoom-controls {
                display: flex; align-items: center; gap: 0.7vh; justify-content: space-between;
            }
            .zoom-controls .btn { flex: 1 1 auto; }
            .zoom-value { font-size: 1.6vh; min-width: 6vh; text-align: center; }
        </style>
        <div class="editor">
            <div id="status" class="status-region">
                <span id="status-text"></span>
                <button id="run-workflow" disabled="disabled">&#9654; Run Workflow</button>
            </div>
            <div class="main">
                <div class="toolbar">
                    <div class="section-title">Brush</div>
                    <div class="tool-group">
                        <label>Size: <span id="brush-size-value">${this.brushSize}px</span></label>
                        <input type="range" id="brush-size" min="1" max="200" value="${this.brushSize}" />
                    </div>
                    <div class="tool-group">
                        <label>Hardness: <span id="brush-hardness-value">${Math.round(this.brushHardness * 100)}%</span></label>
                        <input type="range" id="brush-hardness" min="0" max="100" value="${Math.round(this.brushHardness * 100)}" />
                    </div>
                    <div class="tool-group">
                        <label>Color</label>
                        <input type="color" id="brush-color" value="${this.brushColor}" />
                        <div class="btn" id="pick-color">
                            <span id="pick-color-swatch" style="display:inline-block;width:1.6vh;height:1.6vh;border:0.15vh solid #fff;vertical-align:middle;background:${this.brushColor};"></span>
                            Pick from image
                        </div>
                    </div>
                    <div class="tool-group">
                        <label>Zoom</label>
                        <div class="zoom-controls">
                            <div class="btn" id="zoom-out">&minus;</div>
                            <div class="zoom-value" id="zoom-value">100%</div>
                            <div class="btn" id="zoom-in">&plus;</div>
                        </div>
                        <div class="btn" id="zoom-reset">Reset zoom</div>
                    </div>
                    <div class="tool-group">
                        <label>Actions</label>
                        <div class="btn" id="undo">&#8630; Undo</div>
                        <div class="btn" id="download">&#8595; Download PNG</div>
                    </div>
                    <div class="tool-group">
                        <label>Hint</label>
                        <div style="font-size:1.4vh;color:#a98fd0;">
                            Left click paints, right click erases. Scroll to zoom, drag with the middle mouse button to pan.
                        </div>
                    </div>
                </div>
                <div class="canvas-region" id="canvas-region">
                    <div class="canvas-stack" id="canvas-stack"></div>
                    <div class="brush-cursor" id="brush-cursor"></div>
                </div>
                <div class="sidebar">
                    <div class="section-title">Layers</div>
                    <div class="zoom-controls">
                        <div class="btn" id="import-layer">Import Layer</div>
                    </div>
                    <div class="zoom-controls">
                        <div class="btn" id="add-layer">+ Add layer</div>
                        <div class="btn" id="move-layer-up" title="Move active layer up">&#9650;</div>
                        <div class="btn" id="move-layer-down" title="Move active layer down">&#9660;</div>
                    </div>
                    <div id="layers-list"></div>
                    <div style="margin-top:1.5vh;">
                        <aihub-custom-selector id="aihub-selector"></aihub-custom-selector>
                    </div>
                </div>
            </div>
        </div>
        `;

        this.canvasStack = /** @type {HTMLElement} */ (this.root.getElementById('canvas-stack'));
        this.canvasStack.style.width = this.imageWidth + 'px';
        this.canvasStack.style.height = this.imageHeight + 'px';

        // wire up brush controls
        const brushSize = /** @type {HTMLInputElement} */ (this.root.getElementById('brush-size'));
        brushSize.addEventListener('input', () => {
            this.brushSize = parseInt(brushSize.value, 10);
            // @ts-ignore
            this.root.getElementById('brush-size-value').textContent = this.brushSize + 'px';
            this.updateBrushCursorSize();
        });

        const brushColor = /** @type {HTMLInputElement} */ (this.root.getElementById('brush-color'));
        brushColor.addEventListener('input', () => { this.setBrushColor(brushColor.value); });

        // @ts-ignore
        this.root.getElementById('pick-color').addEventListener('click', () => this.toggleColorPicking());

        const brushHardness = /** @type {HTMLInputElement} */ (this.root.getElementById('brush-hardness'));
        brushHardness.addEventListener('input', () => {
            this.brushHardness = parseInt(brushHardness.value, 10) / 100;
            // @ts-ignore
            this.root.getElementById('brush-hardness-value').textContent = Math.round(this.brushHardness * 100) + '%';
        });

        // zoom controls
        // @ts-ignore
        this.root.getElementById('zoom-in').addEventListener('click', () => this.setZoom(this.zoom * 1.25));
        // @ts-ignore
        this.root.getElementById('zoom-out').addEventListener('click', () => this.setZoom(this.zoom / 1.25));
        // @ts-ignore
        this.root.getElementById('zoom-reset').addEventListener('click', () => this.setZoom(1));

        // undo / download
        // @ts-ignore
        this.root.getElementById('undo').addEventListener('click', () => this.undo());
        // @ts-ignore
        this.root.getElementById('download').addEventListener('click', () => this.downloadMergedImage());

        // add layer
        // @ts-ignore
        this.root.getElementById('add-layer').addEventListener('click', () => this.addLayer());
        // @ts-ignore
        this.root.getElementById('import-layer').addEventListener('click', () => this.importLayer());
        // @ts-ignore
        this.root.getElementById('move-layer-up').addEventListener('click', () => this.moveActiveLayer(1));
        // @ts-ignore
        this.root.getElementById('move-layer-down').addEventListener('click', () => this.moveActiveLayer(-1));

        const canvasRegion = /** @type {HTMLElement} */ (this.root.getElementById('canvas-region'));
        canvasRegion.addEventListener('wheel', this.onWheel, { passive: false });

        // pointer events on the canvas stack
        this.canvasStack.addEventListener('pointerdown', this.onPointerDown);
        this.canvasStack.addEventListener('pointermove', this.onPointerMove);
        this.canvasStack.addEventListener('pointerenter', this.onPointerEnter);
        this.canvasStack.addEventListener('pointerleave', this.onPointerLeave);
        window.addEventListener('pointerup', this.onPointerUp);
        // suppress the context menu so right click can erase
        this.canvasStack.addEventListener('contextmenu', (e) => e.preventDefault());

        // create the initial (background) layer
        this.addLayer('Background');

        // if an image source is provided, load it into the background layer
        if (imgSrc) {
            this.loadImageIntoLayer(imgSrc, 0);
        } else {
            // fill background layer white
            const bg = this.layers[0];
            bg.ctx.fillStyle = '#ffffff';
            bg.ctx.fillRect(0, 0, this.imageWidth, this.imageHeight);
        }

        // fit the whole image into view once layout is available
        requestAnimationFrame(() => this.fitToView());
    }

    /**
     * Load an image into a given layer, resizing the canvas to the image dimensions.
     * @param {string} src
     * @param {number} layerIndex
     */
    loadImageIntoLayer(src, layerIndex) {
        const img = new Image();
        img.onload = () => {
            this.imageWidth = img.naturalWidth || this.imageWidth;
            this.imageHeight = img.naturalHeight || this.imageHeight;
            // resize every existing layer canvas to match
            for (const layer of this.layers) {
                layer.canvas.width = this.imageWidth;
                layer.canvas.height = this.imageHeight;
            }
            this.canvasStack.style.width = this.imageWidth + 'px';
            this.canvasStack.style.height = this.imageHeight + 'px';
            const layer = this.layers[layerIndex];
            if (layer) layer.ctx.drawImage(img, 0, 0, this.imageWidth, this.imageHeight);
            this.fitToView();
            this.notifyImageChanged();
        };
        img.onerror = () => {
            this.setStatus('Failed to load the image source.', 'error');
        };
        img.src = src;
    }

    /**
     * Create a new drawing layer.
     * @param {string} [name]
     */
    addLayer(name) {
        const canvas = document.createElement('canvas');
        canvas.width = this.imageWidth;
        canvas.height = this.imageHeight;
        const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
        this.canvasStack.appendChild(canvas);

        const layer = {
            id: String(this._layerIdCounter++),
            name: name || ('Layer ' + this.layers.length),
            canvas,
            ctx,
            visible: true,
            opacity: 1,
        };
        this.layers.push(layer);
        this.activeLayerId = layer.id;
        this.updateLayerStacking();
        this.renderLayersList();
        this.notifyImageChanged();
    }

    /**
     * Delete a layer by id. Picks a neighbouring layer as active if needed.
     * @param {string} id
     */
    deleteLayer(id) {
        const idx = this.layers.findIndex((l) => l.id === id);
        if (idx === -1) return;
        const [removed] = this.layers.splice(idx, 1);
        removed.canvas.remove();
        if (this.activeLayerId === id) {
            // prefer the layer that was above (now at the same index), else below
            const next = this.layers[idx] || this.layers[idx - 1] || null;
            this.activeLayerId = next ? next.id : null;
        }
        this.updateLayerStacking();
        this.renderLayersList();
        this.notifyImageChanged();
    }

    /**
     * Make a layer name unique by appending a number when it already exists.
     * @param {string} name
     * @returns {string}
     */
    uniqueLayerName(name) {
        const base = name || 'Layer';
        if (!this.layers.some((l) => l.name === base)) return base;
        let n = 2;
        while (this.layers.some((l) => l.name === `${base} ${n}`)) n++;
        return `${base} ${n}`;
    }

    /**
     * Create a new layer and insert it at a specific position in the stack
     * (0 = bottom). The name is made unique automatically.
     * @param {string} name
     * @param {number} index
     * @returns {{name: string, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, visible: boolean, opacity: number, id: string}}
     */
    insertLayerAt(name, index) {
        const canvas = document.createElement('canvas');
        canvas.width = this.imageWidth;
        canvas.height = this.imageHeight;
        const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
        this.canvasStack.appendChild(canvas);

        const layer = {
            id: String(this._layerIdCounter++),
            name: this.uniqueLayerName(name),
            canvas,
            ctx,
            visible: true,
            opacity: 1,
        };
        const clamped = Math.max(0, Math.min(this.layers.length, index));
        this.layers.splice(clamped, 0, layer);
        return layer;
    }

    /**
     * Apply an incoming FILE action from the diffusion server by inserting the
     * received image as a new layer.
     * @param {{action: string, pos_x?: number, pos_y?: number, reference_layer_id?: string, reference_layer_action?: string, name?: string}} action
     * @param {Blob} binaryData
     */
    applyIncomingFile(action, binaryData) {
        const url = URL.createObjectURL(binaryData);
        const img = new Image();
        img.onload = () => {
            try {
                const posX = action.pos_x || 0;
                const posY = action.pos_y || 0;

                // Default (NEW_IMAGE): insert on top of the whole stack.
                let insertIndex = this.layers.length;

                if (action.action === 'NEW_LAYER') {
                    const refIdx = this.layers.findIndex((l) => l.id === String(action.reference_layer_id));
                    if (refIdx !== -1) {
                        const refAction = action.reference_layer_action;
                        if (refAction === 'NEW_BEFORE') {
                            // below the reference layer
                            insertIndex = refIdx;
                        } else if (refAction === 'NEW_AFTER' || refAction === 'REPLACE') {
                            // above the reference layer
                            insertIndex = refIdx + 1;
                            // REPLACE is treated non-destructively: hide the
                            // reference layer instead of deleting it.
                            if (refAction === 'REPLACE') this.layers[refIdx].visible = false;
                        } else {
                            // unknown reference action: ignore this file
                            return;
                        }
                    }
                }

                const layer = this.insertLayerAt(action.name || 'new layer', insertIndex);
                // Draw at the given position; the canvas clips anything outside.
                layer.ctx.drawImage(img, posX, posY);
                this.activeLayerId = layer.id;
                this.updateLayerStacking();
                this.renderLayersList();
                this.notifyImageChanged();
            } finally {
                URL.revokeObjectURL(url);
            }
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            this.setStatus('Failed to load an incoming image from the server.', 'error');
        };
        img.src = url;
    }

    importLayer() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            if (!file) return;
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                // Add a new layer named after the file (without extension)
                const layerName = file.name.replace(/\.[^.]+$/, '') || 'Imported';
                this.addLayer(layerName);
                const layer = this.layers[this.layers.length - 1];

                // Cover: scale uniformly so the image fills the entire canvas,
                // then center it — cropping any overflow (no stretching).
                const scale = Math.max(
                    this.imageWidth / img.naturalWidth,
                    this.imageHeight / img.naturalHeight
                );
                const scaledW = img.naturalWidth * scale;
                const scaledH = img.naturalHeight * scale;
                const dx = (this.imageWidth - scaledW) / 2;
                const dy = (this.imageHeight - scaledH) / 2;

                layer.ctx.drawImage(img, dx, dy, scaledW, scaledH);
                URL.revokeObjectURL(url);
                this.notifyImageChanged();
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                this.setStatus('Failed to load the imported image.', 'error');
            };
            img.src = url;
        });
        input.click();
    }

    /** Keep canvas z-order and opacity in sync with the layers array. */
    updateLayerStacking() {
        this.layers.forEach((layer, i) => {
            layer.canvas.style.zIndex = String(i);
            layer.canvas.style.opacity = String(layer.visible ? layer.opacity : 0);
        });
    }

    /**
     * Move the active layer up (+1) or down (-1) in the stack.
     * @param {number} direction
     */
    moveActiveLayer(direction) {
        const from = this.layers.findIndex((l) => l.id === this.activeLayerId);
        const to = from + direction;
        if (to < 0 || to >= this.layers.length) return;
        const [layer] = this.layers.splice(from, 1);
        this.layers.splice(to, 0, layer);
        // activeLayerId stays the same; only the position changed
        this.updateLayerStacking();
        this.renderLayersList();
        this.notifyImageChanged();
    }

    /** Render the layers list in the sidebar. */
    renderLayersList() {
        const list = /** @type {HTMLElement} */ (this.root.getElementById('layers-list'));
        list.innerHTML = '';
        // show topmost layers first
        for (let i = this.layers.length - 1; i >= 0; i--) {
            const layer = this.layers[i];
            const el = document.createElement('div');
            el.className = 'layer' + (layer.id === this.activeLayerId ? ' active' : '');
            el.innerHTML = `
                <span class="layer-toggle" title="Toggle visibility">${layer.visible ? '&#128065;' : '&#128584;'}</span>
                <span class="layer-index">${i}</span>
                <span class="layer-name">${layer.name}</span>
                <input type="range" min="0" max="100" value="${Math.round(layer.opacity * 100)}" title="Opacity" />
                <span class="layer-delete" title="Delete layer">&#10005;</span>
            `;
            const toggle = /** @type {HTMLElement} */ (el.querySelector('.layer-toggle'));
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                layer.visible = !layer.visible;
                this.updateLayerStacking();
                this.renderLayersList();
                this.notifyImageChanged();
            });
            const nameEl = /** @type {HTMLElement} */ (el.querySelector('.layer-name'));
            nameEl.addEventListener('click', () => {
                this.activeLayerId = layer.id;
                this.renderLayersList();
            });
            const opacity = /** @type {HTMLInputElement} */ (el.querySelector('input[type="range"]'));
            opacity.addEventListener('input', (e) => {
                e.stopPropagation();
                layer.opacity = parseInt(opacity.value, 10) / 100;
                this.updateLayerStacking();
                this.notifyImageChanged();
            });
            const deleteBtn = /** @type {HTMLElement} */ (el.querySelector('.layer-delete'));
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteLayer(layer.id);
            });
            list.appendChild(el);
        }
    }

    /**
     * @param {number} value
     */
    setZoom(value) {
        this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, value));
        // size the layout box to the scaled dimensions so the scroll area matches
        // the visible image (prevents asymmetric extra scroll space)
        this.canvasStack.style.width = (this.imageWidth * this.zoom) + 'px';
        this.canvasStack.style.height = (this.imageHeight * this.zoom) + 'px';
        this.canvasStack.style.transform = `scale(${this.zoom})`;
        const zoomValue = this.root.getElementById('zoom-value');
        if (zoomValue) zoomValue.textContent = Math.round(this.zoom * 100) + '%';
        this.updateBrushCursorSize();
    }

    /**
     * Set the zoom so the whole image is visible within the canvas region.
     */
    fitToView() {
        const region = this.root.getElementById('canvas-region');
        if (!region) return;
        const rect = region.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        // leave a small margin around the image
        const margin = 0.95;
        const scale = Math.min(rect.width / this.imageWidth, rect.height / this.imageHeight) * margin;
        this.setZoom(scale);
    }

    /**
     * @param {WheelEvent} e
     */
    onWheel(e) {
        // scrolling over the canvas zooms directly
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        this.setZoom(this.zoom * factor);
    }

    /**
     * Convert a pointer event to canvas coordinates on the active layer.
     * @param {PointerEvent} e
     * @returns {{x: number, y: number}}
     */
    getCanvasCoords(e) {
        const rect = this.canvasStack.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / this.zoom,
            y: (e.clientY - rect.top) / this.zoom,
        };
    }

    /**
     * @param {PointerEvent} e
     */
    onPointerDown(e) {
        if (this.isPicking) {
            if (e.button === 0) {
                const color = this.pickColorAt(e);
                if (color) this.setBrushColor(color);
                this.toggleColorPicking(false);
            } else if (e.button === 2) {
                // right click cancels picking
                this.toggleColorPicking(false);
            }
            e.preventDefault();
            return;
        }
        if (e.button !== 0 && e.button !== 2) return;
        e.preventDefault();
        this.pushUndoSnapshot();
        this.isDrawing = true;
        this.isErasing = e.button === 2;
        this.lastPoint = this.getCanvasCoords(e);
        this.drawDot(this.lastPoint);
    }

    /**
     * @param {PointerEvent} e
     */
    onPointerMove(e) {
        this.updateBrushCursorPosition(e);
        if (this.isPicking) {
            const color = this.pickColorAt(e);
            if (color) this.updatePickPreview(color);
            return;
        }
        if (!this.isDrawing) return;
        const point = this.getCanvasCoords(e);
        this.drawLine(this.lastPoint, point);
        this.lastPoint = point;
    }

    onPointerEnter() {
        if (this.isPicking) return;
        const cursor = this.root.getElementById('brush-cursor');
        if (cursor) cursor.style.display = 'block';
        this.updateBrushCursorSize();
    }

    onPointerLeave() {
        const cursor = this.root.getElementById('brush-cursor');
        if (cursor) cursor.style.display = 'none';
        if (this.isPicking) this.updatePickPreview(this.brushColor);
    }

    /**
     * Enable or toggle the color picking (eyedropper) mode.
     * @param {boolean} [force] Explicit on/off; omit to toggle.
     */
    toggleColorPicking(force) {
        this.isPicking = force === undefined ? !this.isPicking : force;
        const btn = this.root.getElementById('pick-color');
        const brushCursor = this.root.getElementById('brush-cursor');
        if (btn) btn.style.background = this.isPicking ? 'rgba(110, 0, 190, 0.9)' : '';
        // hide the brush ring while picking; use crosshair on the canvas
        if (this.canvasStack) this.canvasStack.style.cursor = this.isPicking ? 'crosshair' : 'none';
        if (brushCursor) brushCursor.style.display = 'none';
        if (!this.isPicking) this.updatePickPreview(this.brushColor);
    }

    /**
     * Sample the combined visible image color under the pointer.
     * @param {PointerEvent} e
     * @returns {string|null} hex color, or null if outside the image
     */
    pickColorAt(e) {
        const { x, y } = this.getCanvasCoords(e);
        const px = Math.floor(x);
        const py = Math.floor(y);
        if (px < 0 || py < 0 || px >= this.imageWidth || py >= this.imageHeight) return null;
        const combined = this.getCombinedLayers();
        const ctx = /** @type {CanvasRenderingContext2D} */ (combined.getContext('2d'));
        const data = ctx.getImageData(px, py, 1, 1).data;
        return '#' + [data[0], data[1], data[2]]
            .map((c) => c.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Live update of the pick button swatch while hovering.
     * @param {string} color
     */
    updatePickPreview(color) {
        const swatch = this.root.getElementById('pick-color-swatch');
        if (swatch) swatch.style.background = color;
    }

    /**
     * Set the active brush color and sync the UI controls.
     * @param {string} color hex color
     */
    setBrushColor(color) {
        this.brushColor = color;
        const input = /** @type {HTMLInputElement|null} */ (this.root.getElementById('brush-color'));
        if (input) input.value = color;
        this.updatePickPreview(color);
    }

    /** Size the brush cursor overlay to the brush size in screen pixels. */
    updateBrushCursorSize() {
        const cursor = this.root.getElementById('brush-cursor');
        if (!cursor) return;
        const size = this.brushSize * this.zoom;
        cursor.style.width = size + 'px';
        cursor.style.height = size + 'px';
    }

    /**
     * Position the brush cursor overlay under the pointer.
     * @param {PointerEvent} e
     */
    updateBrushCursorPosition(e) {
        const region = this.root.getElementById('canvas-region');
        const cursor = this.root.getElementById('brush-cursor');
        if (!region || !cursor) return;
        const rect = region.getBoundingClientRect();
        cursor.style.left = (e.clientX - rect.left + region.scrollLeft) + 'px';
        cursor.style.top = (e.clientY - rect.top + region.scrollTop) + 'px';
    }

    onPointerUp() {
        const wasDrawing = this.isDrawing;
        this.isDrawing = false;
        this.isErasing = false;
        this.lastPoint = null;
        if (wasDrawing) this.notifyImageChanged();
    }

    /**
     * @returns {CanvasRenderingContext2D | null}
     */
    getActiveCtx() {
        const layer = this.layers.find((l) => l.id === this.activeLayerId);
        return layer ? layer.ctx : null;
    }

    /**
     * Capture the active layer's pixels before a brush stroke so it can be
     * reverted. Keeps at most {@link maxUndoSteps} entries.
     */
    pushUndoSnapshot() {
        const layer = this.layers.find((l) => l.id === this.activeLayerId);
        if (!layer) return;
        const imageData = layer.ctx.getImageData(0, 0, this.imageWidth, this.imageHeight);
        // @ts-ignore
        this.undoHistory.push({ layerId: this.activeLayerId, imageData });
        while (this.undoHistory.length > this.maxUndoSteps) {
            this.undoHistory.shift();
        }
    }

    /** Revert the most recent brush operation. */
    undo() {
        const entry = this.undoHistory.pop();
        if (!entry) return;
        const layer = this.layers.find((l) => l.id === entry.layerId);
        if (!layer) return;
        layer.ctx.putImageData(entry.imageData, 0, 0);
        this.notifyImageChanged();
    }

    /** Download the merged visible image as a PNG file. */
    downloadMergedImage() {
        const merged = this.getCombinedLayers();
        merged.toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'image.png';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }, 'image/png');
    }

    /**
     * Build a radial gradient stamp for the current brush honoring hardness.
     * @param {CanvasRenderingContext2D} ctx
     * @param {{x: number, y: number}} p
     * @returns {CanvasGradient}
     */
    makeBrushGradient(ctx, p) {
        const r = Math.max(this.brushSize / 2, 0.5);
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        const color = this.isErasing ? '#000000' : this.brushColor;
        // hardness: fraction of the radius kept fully solid before fading out
        const hard = Math.max(0, Math.min(1, this.brushHardness));
        grad.addColorStop(0, this.rgbaFrom(color, 1));
        grad.addColorStop(hard, this.rgbaFrom(color, 1));
        grad.addColorStop(1, this.rgbaFrom(color, 0));
        return grad;
    }

    /**
     * Convert a hex color to an rgba() string with the given alpha.
     * @param {string} hex
     * @param {number} alpha
     * @returns {string}
     */
    rgbaFrom(hex, alpha) {
        const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
        if (!m) return `rgba(0,0,0,${alpha})`;
        const n = parseInt(m[1], 16);
        return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
    }

    /**
     * Stamp a single soft/hard brush dab centered at a point.
     * @param {{x: number, y: number}} p
     */
    drawDot(p) {
        const ctx = this.getActiveCtx();
        if (!ctx) return;
        ctx.save();
        ctx.globalCompositeOperation = this.isErasing ? 'destination-out' : 'source-over';
        ctx.fillStyle = this.makeBrushGradient(ctx, p);
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(this.brushSize / 2, 0.5), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    /**
     * Draw a stroke by stamping brush dabs along the segment so hardness/softness
     * is respected consistently.
     * @param {{x: number, y: number} | null} from
     * @param {{x: number, y: number}} to
     */
    drawLine(from, to) {
        const ctx = this.getActiveCtx();
        if (!ctx) return;
        if (!from) { this.drawDot(to); return; }
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.hypot(dx, dy);
        // spacing proportional to brush size for a smooth stroke
        const step = Math.max(this.brushSize * 0.15, 0.5);
        const count = Math.max(1, Math.ceil(dist / step));
        for (let i = 1; i <= count; i++) {
            const t = i / count;
            this.drawDot({ x: from.x + dx * t, y: from.y + dy * t });
        }
    }

    /**
     * Combine the given layer indices (bottom to top) into a single canvas and
     * return it. Preserves transparency (RGBA). Custom operations can use this
     * to retrieve the composited result of specific layers.
     * @param {number[]} [indices] Layer indices to combine; defaults to all visible layers.
     * @returns {HTMLCanvasElement}
     */
    getCombinedLayers(indices) {
        const out = document.createElement('canvas');
        out.width = this.imageWidth;
        out.height = this.imageHeight;
        const ctx = /** @type {CanvasRenderingContext2D} */ (out.getContext('2d'));

        const order = indices && indices.length
            ? indices
            : this.layers.map((_, i) => i).filter((i) => this.layers[i].visible);

        for (const i of order) {
            const layer = this.layers[i];
            if (!layer) continue;
            ctx.globalAlpha = layer.opacity;
            ctx.drawImage(layer.canvas, 0, 0);
        }
        ctx.globalAlpha = 1;
        return out;
    }

    /**
     * Combine all visible layers except the given index into a new canvas.
     * @param {string} excludeId
     * @returns {HTMLCanvasElement}
     */
    getCombinedLayersExcluding(excludeId) {
        const indices = this.layers
            .map((_, i) => i)
            .filter((i) => this.layers[i].id !== excludeId && this.layers[i].visible);
        return this.getCombinedLayers(indices);
    }

    /**
     * Produce a fresh canvas snapshot for a given AIHubExposeImage source type.
     * Because every layer matches the image size, the "*_intersection" variants
     * are equivalent to their non-intersection counterparts.
     * @param {string} type
     * @returns {HTMLCanvasElement}
     */
    getImageCanvasForType(type) {
        switch (type) {
            case 'current_layer':
            case 'current_layer_at_image_intersection': {
                const out = document.createElement('canvas');
                out.width = this.imageWidth;
                out.height = this.imageHeight;
                const ctx = /** @type {CanvasRenderingContext2D} */ (out.getContext('2d'));
                const layer = this.layers.find((l) => l.id === this.activeLayerId);
                if (layer) ctx.drawImage(layer.canvas, 0, 0);
                return out;
            }
            case 'merged_image_without_current_layer':
            case 'merged_image_current_layer_intersection_without_current_layer':
                // @ts-ignore
                return this.getCombinedLayersExcluding(this.activeLayerId);
            case 'merged_image':
            case 'merged_image_current_layer_intersection':
            case 'upload':
            default:
                return this.getCombinedLayers();
        }
    }

    getActiveLayerId() {
        return this.activeLayerId;
    }

    /**
     * Return one canvas per visible layer (bottom to top), each at image size.
     * @returns {HTMLCanvasElement[]}
     */
    getLayerCanvases() {
        /** @type {HTMLCanvasElement[]} */
        const result = [];
        for (const layer of this.layers) {
            if (!layer.visible) continue;
            const out = document.createElement('canvas');
            out.width = this.imageWidth;
            out.height = this.imageHeight;
            const ctx = /** @type {CanvasRenderingContext2D} */ (out.getContext('2d'));
            ctx.globalAlpha = layer.opacity;
            ctx.drawImage(layer.canvas, 0, 0);
            result.push(out);
        }
        return result;
    }

    /**
     * Register a listener notified (debounced) when the image changes.
     * @param {() => void} cb
     */
    addImageChangeListener(cb) {
        if (!this.imageChangeListeners.includes(cb)) this.imageChangeListeners.push(cb);
    }

    /**
     * @param {() => void} cb
     */
    removeImageChangeListener(cb) {
        this.imageChangeListeners = this.imageChangeListeners.filter((l) => l !== cb);
    }

    /**
     * Notify listeners that the image changed, debounced so that in-progress
     * drawing does not trigger a flood of blob regenerations.
     */
    notifyImageChanged() {
        if (this.imageChangeTimer) clearTimeout(this.imageChangeTimer);
        this.imageChangeTimer = setTimeout(() => {
            this.imageChangeTimer = null;
            for (const cb of this.imageChangeListeners) {
                try { cb(); } catch (err) { console.error('ImageEdit: image change listener failed', err); }
            }
        }, 600);
    }

    async disconnectedCallback() {
        this.canvasStack?.removeEventListener('pointerdown', this.onPointerDown);
        this.canvasStack?.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerup', this.onPointerUp);

        if (this.ownsDiffusionProcess) {
            try {
                await window.API.stopDiffusionProcess();
                try {
                    await window.ENGINE_WORKER_CLIENT.resumeInference();
                } catch (err) {
                    console.error('ImageEdit: failed to resume inference', err);
                }
            } catch (err) {
                // nothing to display, the component is being torn down
                console.error('ImageEdit: failed to stop diffusion process', err);
            }
        }
    }
}

customElements.define('image-edit', ImageEdit);