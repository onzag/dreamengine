// Canvas-based starfield. Replaces the previous DOM approach which created
// ~2350 absolutely-positioned <div>s — the browser had to repaint the entire
// star layer every animation frame and ~400 of those divs used `filter: blur`,
// both of which made the whole UI sluggish. A single canvas is orders of
// magnitude faster and looks the same.
document.addEventListener('DOMContentLoaded', function () {
  const nightsky = ['#280F36', '#632B6C', '#BE6590', '#FFC1A0', '#FE9C7F'];

  const skyEl = /** @type {HTMLElement | null} */ (document.querySelector('.sky'));
  if (!skyEl) return;
  const sky = /** @type {HTMLElement} */ (skyEl);

  const canvas = document.createElement('canvas');
  canvas.style.position = 'absolute';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.pointerEvents = 'none';
  sky.appendChild(canvas);

  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) return;
  const ctx = /** @type {CanvasRenderingContext2D} */ (ctx2d);

  /**
   * @typedef {Object} Star
   * @property {number} x          fraction 0..1 of containing box width
   * @property {number} y          fraction 0..1 of containing box height
   * @property {number} r          radius in CSS px
   * @property {string} color
   * @property {number} baseAlpha
   * @property {boolean} blink
   * @property {number} period     seconds for one blink cycle
   * @property {number} phase      0..1 phase offset
   * @property {number} glow       glow radius in CSS px (0 = no glow)
   * @property {string} [glowColor]
   */

  const rand = (/** @type {number} */ min, /** @type {number} */ max) =>
    Math.random() * (max - min) + min;
  const pickColor = () => nightsky[Math.floor(Math.random() * nightsky.length)];

  /** @type {Star[]} */ const stars = [];
  /** @type {Star[]} */ const crossStars = [];
  /** @type {Star[]} */ const crossBlurs = [];
  /** @type {Star[]} */ const crossAuxStars = [];
  /** @type {Star[]} */ const crossAuxBlurs = [];

  /**
   * @param {Star[]} list
   * @param {number} yMin
   * @param {number} yMax
   * @param {number} rPx
   * @param {string} color
   * @param {boolean} blink
   * @param {number} periodMin
   * @param {number} periodMax
   * @param {number} glow
   * @param {string} [glowColor]
   * @param {number} [baseAlpha]
   */
  function pushStar(list, yMin, yMax, rPx, color, blink, periodMin, periodMax, glow, glowColor, baseAlpha) {
    list.push({
      x: Math.random(),
      y: rand(yMin, yMax) / 100,
      r: rPx,
      color: color,
      baseAlpha: baseAlpha == null ? 0.8 : baseAlpha,
      blink: blink,
      period: rand(periodMin, periodMax),
      phase: Math.random(),
      glow: glow || 0,
      glowColor: glowColor,
    });
  }

  // Mirrors the original 6 loops (counts/distributions).
  for (let i = 0; i < 500; i++) {
    pushStar(stars, 0, 40, 0.5, '#fff', true, 2, 5, 0);
    pushStar(stars, 20, 70, 0.75, '#fff', true, 4, 8, 0);
  }
  for (let i = 0; i < 150; i++) {
    pushStar(stars, 0, 50, 0.25, '#fff', false, 1, 2.5, 0);
    pushStar(stars, 0, 50, 0.5, '#fff', true, 2.5, 4, 0);
    pushStar(stars, 0, 50, 0.75, '#fff', true, 4, 5, 0);
  }
  for (let i = 0; i < 100; i++) {
    pushStar(stars, 40, 75, 0.25, '#fff', false, 1, 3, 0);
    pushStar(stars, 40, 75, 0.5, '#fff', true, 2, 4, 0);
  }
  for (let i = 0; i < 250; i++) {
    pushStar(stars, 0, 100, 0.25, '#fff', false, 1, 2, 0);
    pushStar(stars, 0, 100, 0.5, '#fff', true, 2, 5, 0);
    pushStar(stars, 0, 100, 0.75, '#fff', true, 1, 4, 0);
    pushStar(stars, 0, 70, 1.25, '#fff', true, 5, 7, 3);
  }
  for (let i = 0; i < 150; i++) {
    pushStar(stars, 0, 100, 1.25, '#fff', true, 5, 7, 3);
  }
  for (let i = 0; i < 25; i++) {
    pushStar(stars, 0, 50, 1.25, pickColor(), false, 5, 7, 3, pickColor());
  }

  // Diagonal accent layer 1 (top:10vh, rotate(20deg), box 120vw x 20vh).
  // To read as a continuous, faint nebula cloud rather than a bunch of
  // discrete blobs we:
  //   1. Pick a small number of "cloud centers" along the strip.
  //   2. Around each center, scatter many large, near-circular soft blurs
  //      with heavy overlap (gaussian-ish jitter, not uniform random).
  //   3. Use very low per-blur alpha + additive blending so overlaps
  //      accumulate into a smooth gradient instead of distinct shapes.
  //
  // gaussian-ish offset in [-1,1], biased toward 0 (sum of two uniforms).
  const jitter = () => (Math.random() + Math.random() - 1);

  /**
   * @param {Star[]} blurList
   * @param {number} clusterCount
   * @param {number} blursPerCluster
   * @param {number} clusterSpread   half-width of cluster (in box-fraction units)
   * @param {number} sizeMin         long-axis radius min (px)
   * @param {number} sizeMax         long-axis radius max (px)
   * @param {number} alphaMin
   * @param {number} alphaMax
   */
  function buildNebulaCluster(blurList, clusterCount, blursPerCluster, clusterSpread, sizeMin, sizeMax, alphaMin, alphaMax) {
    for (let c = 0; c < clusterCount; c++) {
      const cx = rand(0.05, 0.95);
      const cy = rand(0.2, 0.8);
      // Each cluster picks 1-2 dominant hues so the blob reads as one cloud
      // with subtle color variation rather than rainbow confetti.
      const hueA = pickColor();
      const hueB = Math.random() < 0.5 ? hueA : pickColor();
      for (let i = 0; i < blursPerCluster; i++) {
        const dx = jitter() * clusterSpread;
        const dy = jitter() * clusterSpread * 0.7;
        blurList.push({
          x: Math.min(1, Math.max(0, cx + dx)),
          y: Math.min(1, Math.max(0, cy + dy)),
          r: rand(sizeMin, sizeMax),
          color: Math.random() < 0.5 ? hueA : hueB,
          baseAlpha: rand(alphaMin, alphaMax),
          blink: false, period: 1,
          phase: Math.random() * Math.PI * 2,   // rotation
          glow: rand(0.45, 0.8),                // aspect ratio (mildly elongated)
          glowColor: undefined,
        });
      }
    }
  }

  buildNebulaCluster(crossBlurs, 4, 140, 0.2, 55, 120, 0.004, 0.014);
  for (let i = 0; i < 150; i++) {
    crossStars.push({
      x: Math.random(), y: Math.random(),
      r: 0.9, color: '#ffffff',
      baseAlpha: 1, blink: true, period: rand(6, 12), phase: Math.random(),
      glow: 2.5, glowColor: pickColor(),
    });
  }
  // Diagonal accent layer 2 (top:0, left:10vw, rotate(20deg), box 120vw x 10vh)
  buildNebulaCluster(crossAuxBlurs, 2, 110, 0.24, 70, 140, 0.004, 0.014);
  for (let i = 0; i < 50; i++) {
    crossAuxStars.push({
      x: Math.random(), y: Math.random(),
      r: 1.0, color: '#ffffff',
      baseAlpha: 0.95, blink: false, period: rand(4, 10), phase: Math.random(),
      glow: 3, glowColor: pickColor(),
    });
  }

  let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  let cssW = 0, cssH = 0;

  function resize() {
    const rect = sky.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return; // element is hidden, skip
    cssW = rect.width;
    cssH = rect.height;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    draw(performance.now());
  }

  /**
   * @param {Star} star
   * @param {number} t
   */
  function alphaFor(star, t) {
    if (!star.blink) return star.baseAlpha;
    // Mimic CSS @keyframes blink { 50% { opacity: 0 } } with ease-in-out.
    const u = ((t / 1000) / star.period + star.phase) % 1;
    const tri = u < 0.5 ? u * 2 : (1 - u) * 2;       // triangle wave 0..1..0
    const eased = tri * tri * (3 - 2 * tri);          // smoothstep
    return star.baseAlpha * eased;
  }

  /**
   * @param {Star[]} list
   * @param {number} boxW
   * @param {number} boxH
   * @param {number} t
   * @param {boolean} isBlur  Render only as a soft glow (mimics filter: blur).
   */
  function drawList(list, boxW, boxH, t, isBlur) {
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const a = isBlur ? s.baseAlpha : alphaFor(s, t);
      if (a <= 0.01) continue;
      const x = s.x * boxW;
      const y = s.y * boxH;
      ctx.globalAlpha = a;

      if (isBlur) {
        // Per-blur randomized elongated soft ellipse. With additive blending
        // (set by the caller) overlapping blurs accumulate into nebula gas
        // and galactic streaks rather than reading as discrete spheres.
        const ry = s.r;                      // long axis (px)
        const aspect = s.glow || 0.4;        // short/long ratio
        const rot = s.phase;                 // rotation (radians)
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.scale(aspect, 1);
        // Very soft gaussian-ish falloff: low-alpha center, fades quickly
        // and smoothly to fully transparent. With many overlapping passes
        // (additive) this builds into a continuous cloud rather than
        // showing the outline of any individual ellipse.
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, ry);
        const hex = s.color.length === 7 ? s.color : '#ffffff';
        g.addColorStop(0.0,  hex + 'cc');
        g.addColorStop(0.2,  hex + '70');
        g.addColorStop(0.5,  hex + '20');
        g.addColorStop(0.8,  hex + '06');
        g.addColorStop(1.0,  'rgba(0,0,0,0)');
        ctx.globalAlpha = a;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, ry, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }

      if (s.glow > 0) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, s.glow);
        g.addColorStop(0, s.glowColor || s.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, s.glow, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Small subtle halo so each star reads as a point of light
        // rather than a flat dot.
        const haloR = Math.max(1.5, s.r * 2.5);
        const hg = ctx.createRadialGradient(x, y, 0, x, y, haloR);
        hg.addColorStop(0, 'rgba(255,255,255,0.18)');
        hg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(x, y, haloR, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(x, y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** @param {number} t */
  function draw(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    // Main star field (full viewport)
    drawList(stars, cssW, cssH, t, false);

    const rot = (20 * Math.PI) / 180;

    // .stars-cross: top:10vh, left:0, rotate 20deg, box 120vw x 20vh
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(0, 0.10 * cssH);
    ctx.rotate(rot);
    // Additive blend on the blur pass → overlapping wisps build up into
    // glowing gas-cloud / galaxy-arm shapes.
    ctx.globalCompositeOperation = 'lighter';
    drawList(crossBlurs, 1.20 * cssW, 0.20 * cssH, t, true);
    ctx.globalCompositeOperation = 'source-over';
    drawList(crossStars, 1.20 * cssW, 0.20 * cssH, t, false);

    // .stars-cross-aux: top:0, left:10vw, rotate 20deg, box 120vw x 10vh
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(0.10 * cssW, 0);
    ctx.rotate(rot);
    ctx.globalCompositeOperation = 'lighter';
    drawList(crossAuxBlurs, 1.20 * cssW, 0.10 * cssH, t, true);
    ctx.globalCompositeOperation = 'source-over';
    drawList(crossAuxStars, 1.20 * cssW, 0.10 * cssH, t, false);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
  }

  // Throttled animation loop. Blink cycles are 2–12s so 12 fps is plenty
  // and keeps CPU usage minimal.
  const targetFps = 12;
  const frameInterval = 1000 / targetFps;
  let lastDraw = 0;
  let running = true;

  /** @param {number} t */
  function tick(t) {
    if (!running) return;
    if (t - lastDraw >= frameInterval) {
      lastDraw = t;
      draw(t);
    }
    requestAnimationFrame(tick);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      running = false;
    } else if (!running) {
      running = true;
      lastDraw = 0;
      requestAnimationFrame(tick);
    }
  });

  // Use ResizeObserver instead of window.resize so we also catch the sky
  // element transitioning from display:none back to visible (at which point
  // the window size may not have changed but the element's size has).
  let resizeTimer = 0;
  const ro = new ResizeObserver(function () {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 100);
  });
  ro.observe(sky);

  // Defer initial draw until after first paint so loading overlay shows.
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      resize();
      requestAnimationFrame(tick);
    });
  });
});
