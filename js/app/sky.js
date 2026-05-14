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
  // The original was small ellipses with `filter: blur(15px)` overlapping
  // along a rotated band — visually this reads as nebulous gas clouds and
  // galactic streaks. We mimic that with randomly sized & oriented soft
  // ellipses drawn with additive blending so overlaps accumulate.
  for (let i = 0; i < 150; i++) {
    const ry = rand(35, 75);
    crossBlurs.push({
      x: Math.random(), y: Math.random(),
      r: ry,                            // "radius" reused as the long axis
      color: pickColor(),
      baseAlpha: rand(0.025, 0.07),
      blink: false, period: 1, phase: 0,
      glow: rand(0.25, 0.6),            // aspect ratio (short/long)
      glowColor: undefined,
    });
    // Stash a per-blur rotation in `phase` (re-used field, 0..2pi).
    crossBlurs[crossBlurs.length - 1].phase = Math.random() * Math.PI * 2;

    crossStars.push({
      x: Math.random(), y: Math.random(),
      r: 0.9, color: '#ffffff',
      baseAlpha: 1, blink: true, period: rand(6, 12), phase: Math.random(),
      glow: 2.5, glowColor: pickColor(),
    });
  }
  // Diagonal accent layer 2 (top:0, left:10vw, rotate(20deg), box 120vw x 10vh)
  for (let i = 0; i < 50; i++) {
    const ry = rand(45, 90);
    crossAuxBlurs.push({
      x: Math.random(), y: Math.random(),
      r: ry, color: pickColor(),
      baseAlpha: rand(0.03, 0.08),
      blink: false, period: 1, phase: 0,
      glow: rand(0.25, 0.6),
      glowColor: undefined,
    });
    crossAuxBlurs[crossAuxBlurs.length - 1].phase = Math.random() * Math.PI * 2;

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
    cssW = Math.max(1, rect.width);
    cssH = Math.max(1, rect.height);
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
        // Very soft falloff: no opaque core, gradient fades from a low
        // alpha center all the way to fully transparent. This makes the
        // wisps feel like blurred gas rather than dim spheres.
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, ry);
        g.addColorStop(0,    s.color);
        g.addColorStop(0.35, s.color.length === 7 ? s.color + '60' : s.color); // ~38%
        g.addColorStop(0.7,  s.color.length === 7 ? s.color + '14' : s.color); // ~ 8%
        g.addColorStop(1,    'rgba(0,0,0,0)');
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

  let resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 100);
  });

  // Defer initial draw until after first paint so loading overlay shows.
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      resize();
      requestAnimationFrame(tick);
    });
  });
});
