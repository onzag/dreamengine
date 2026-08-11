import { DiffusionAdapterAIHub } from "../../../engine/diffusion/adapter-aihub.js";
import "./aihub-custom-selector.js";

export class ImageEdit extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });

        this.ownsDiffusionProcess = false;

        /** @type {Array<{name: string, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, visible: boolean, opacity: number}>} */
        this.layers = [];
        this.activeLayerIndex = 0;

        this.brushSize = 20;
        this.brushColor = '#000000';
        this.brushHardness = 0.75;

        this.zoom = 1;
        this.minZoom = 0.1;
        this.maxZoom = 8;

        this.isDrawing = false;
        this.isErasing = false;
        this.lastPoint = null;

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
        // Limit to image workflows that are not project-scoped; the selector
        // groups them by category and renders one component per expose.
        selector.configure({
            infoList: data,
            canvas: this,
            limit: { context: 'image', projectType: null },
        });
    }

    /**
     * Update the status region with a message.
     * @param {string} html
     * @param {'loading'|'error'|'ok'} [kind]
     */
    setStatus(html, kind = 'loading') {
        const status = this.root.getElementById('status');
        if (!status) return;
        let color = '#c9a7ff';
        let icon = '&#9203;'; // hourglass
        if (kind === 'error') { color = '#ff6b6b'; icon = '&#9888;'; }
        else if (kind === 'ok') { color = '#7CFC8A'; icon = '&#10003;'; }
        status.innerHTML = `<span style="color:${color};">${icon} ${html}</span>`;
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
            }
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
            .zoom-controls {
                display: flex; align-items: center; gap: 0.7vh; justify-content: space-between;
            }
            .zoom-controls .btn { flex: 1 1 auto; }
            .zoom-value { font-size: 1.6vh; min-width: 6vh; text-align: center; }
        </style>
        <div class="editor">
            <div id="status" class="status-region"></div>
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

        // add layer
        // @ts-ignore
        this.root.getElementById('add-layer').addEventListener('click', () => this.addLayer());
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
            name: name || ('Layer ' + this.layers.length),
            canvas,
            ctx,
            visible: true,
            opacity: 1,
        };
        this.layers.push(layer);
        this.activeLayerIndex = this.layers.length - 1;
        this.updateLayerStacking();
        this.renderLayersList();
        this.notifyImageChanged();
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
        const from = this.activeLayerIndex;
        const to = from + direction;
        if (to < 0 || to >= this.layers.length) return;
        const [layer] = this.layers.splice(from, 1);
        this.layers.splice(to, 0, layer);
        this.activeLayerIndex = to;
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
            el.className = 'layer' + (i === this.activeLayerIndex ? ' active' : '');
            el.innerHTML = `
                <span class="layer-toggle" title="Toggle visibility">${layer.visible ? '&#128065;' : '&#128584;'}</span>
                <span class="layer-index">${i}</span>
                <span class="layer-name">${layer.name}</span>
                <input type="range" min="0" max="100" value="${Math.round(layer.opacity * 100)}" title="Opacity" />
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
                this.activeLayerIndex = i;
                this.renderLayersList();
            });
            const opacity = /** @type {HTMLInputElement} */ (el.querySelector('input[type="range"]'));
            opacity.addEventListener('input', (e) => {
                e.stopPropagation();
                layer.opacity = parseInt(opacity.value, 10) / 100;
                this.updateLayerStacking();
                this.notifyImageChanged();
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
        const layer = this.layers[this.activeLayerIndex];
        return layer ? layer.ctx : null;
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
     * @param {number} excludeIndex
     * @returns {HTMLCanvasElement}
     */
    getCombinedLayersExcluding(excludeIndex) {
        const indices = this.layers
            .map((_, i) => i)
            .filter((i) => i !== excludeIndex && this.layers[i].visible);
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
                const layer = this.layers[this.activeLayerIndex];
                if (layer) ctx.drawImage(layer.canvas, 0, 0);
                return out;
            }
            case 'merged_image_without_current_layer':
            case 'merged_image_current_layer_intersection_without_current_layer':
                return this.getCombinedLayersExcluding(this.activeLayerIndex);
            case 'merged_image':
            case 'merged_image_current_layer_intersection':
            case 'upload':
            default:
                return this.getCombinedLayers();
        }
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