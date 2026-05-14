const cancelSound = /** @type {HTMLAudioElement} */ (document.getElementById('cancelSound'));
const pauseSound = /** @type {HTMLAudioElement} */ (document.getElementById('pauseSound'));
const hoverSound = /** @type {HTMLAudioElement} */ (document.getElementById('hoverSound'));
const confirmSound = /** @type {HTMLAudioElement} */ (document.getElementById('confirmSound'));

let fxEnabled = (localStorage.getItem('fxEnabled') || "true") === 'true';
let ambienceEnabled = (localStorage.getItem('ambienceEnabled') || "true") === 'true';

let TEMP_SOUND_DISABLE = false;

/**
 * Browsers refuse to start an AudioContext until the user has interacted with
 * the page (autoplay policy). There is no permanent "allow audio" permission
 * in browsers; the unlock is per-page-session and happens automatically on the
 * first user gesture. In electron mode this is a no-op (resolves immediately)
 * so the desktop experience is unchanged.
 * @type {Promise<void>}
 */
const audioUnlockReady = new Promise((resolve) => {
  /** @type {Array<keyof DocumentEventMap>} */
  const events = ['pointerdown', 'mousedown', 'keydown', 'touchstart'];
  const onGesture = () => {
    events.forEach(ev => document.removeEventListener(ev, onGesture, true));
    resolve();
  };
  events.forEach(ev => document.addEventListener(ev, onGesture, { capture: true, passive: true }));
});

/**
 */
function setTempSoundDisable() {
  TEMP_SOUND_DISABLE = true;
  setTimeout(() => {
    TEMP_SOUND_DISABLE = false;
  }, 300);
}

/**
 * @type {Array<{src: string, volume: number}>|null}
 */
let currentAmbience = null;

function playCancelSound() {
  if (!fxEnabled || TEMP_SOUND_DISABLE) return;
  cancelSound.currentTime = 0;
  cancelSound.play().catch(err => console.log('Cancel sound play failed:', err));
}

function playPauseSound() {
  if (!fxEnabled || TEMP_SOUND_DISABLE) return;
  pauseSound.currentTime = 0;
  pauseSound.play().catch(err => console.log('Pause sound play failed:', err));
}

function playHoverSound() {
  if (!fxEnabled || TEMP_SOUND_DISABLE) return;
  // check if confirm, pause or cancel sound is playing and is just
  const unpausedSound = [confirmSound, pauseSound, cancelSound].find(sound => !sound.paused);
  if (unpausedSound) {
    // we need to check if they started playing less than 100ms ago
    if (unpausedSound.currentTime < 0.1) {
      return;
    }
  }
  hoverSound.currentTime = 0;
  hoverSound.play().catch(err => console.log('Hover sound play failed:', err));
}

/**
 * 
 * @param {string} src
 * @param {number} volume
 * @returns 
 */
function playSound(src, volume = 1) {
  if (!fxEnabled || TEMP_SOUND_DISABLE) return;
  const sound = new Audio(src);
  sound.volume = volume;
  sound.play().catch(err => console.log('Sound play failed:', err));
  sound.addEventListener('ended', () => {
    // release the audio element from memory once it's done playing
    sound.src = '';
  });
}

function playConfirmSound() {
  if (!fxEnabled || TEMP_SOUND_DISABLE) return;
  confirmSound.currentTime = 0;
  confirmSound.play().catch(err => console.log('Confirm sound play failed:', err));
}

function toggleFX() {
  fxEnabled = !fxEnabled;
  localStorage.setItem('fxEnabled', fxEnabled.toString());
  return fxEnabled;
}

function toggleAmbience() {
  ambienceEnabled = !ambienceEnabled;
  localStorage.setItem('ambienceEnabled', ambienceEnabled.toString());
  if (!ambienceEnabled) {
    AMBIENCES = AMBIENCES.filter(amb => {
      amb.source.stop();
      amb.context.close();
      return false;
    });
  } else if (currentAmbience) {
    for (const src of currentAmbience) {
      playAmbience(src.src, src.volume);
    }
  }
  return ambienceEnabled;
}

function isFXEnabled() {
  return fxEnabled;
}

function isAmbienceEnabled() {
  return ambienceEnabled;
}

/**
 * @typedef {Object} Ambience
 * @property {AudioContext} context
 * @property {GainNode} gainNode
 * @property {AudioBufferSourceNode} source
 * @property {string} src
 * @property {number} targetVolume
 */

/** @type {Array<Ambience>} */
let AMBIENCES = [];

// Per-src monotonic operation tokens. Every public-facing operation that
// touches an ambience for a given src bumps that src's token. Any deferred
// work (awaits, scheduled cleanup) checks `isLatestOp(src, token)` before
// taking effect, so newer operations always supersede older ones cleanly
// without us having to manually cancel anything.
/** @type {Map<string, number>} */
const ambienceOpTokens = new Map();

/**
 * @param {string} src
 * @returns {number}
 */
function nextOpToken(src) {
  const t = (ambienceOpTokens.get(src) || 0) + 1;
  ambienceOpTokens.set(src, t);
  return t;
}

/**
 * @param {string} src
 * @param {number} token
 * @returns {boolean}
 */
function isLatestOp(src, token) {
  return ambienceOpTokens.get(src) === token;
}

/**
 * Set an ambience's gain immediately and stop any in-flight fade.
 * @param {Ambience} amb
 * @param {number} value
 */
function setGainImmediate(amb, value) {
  try {
    const now = amb.context.currentTime;
    amb.gainNode.gain.cancelScheduledValues(now);
    amb.gainNode.gain.setValueAtTime(value, now);
  } catch { /* context may be closed */ }
  amb.gainNode.gain.value = value;
}

/**
 * Run a JS-stepped fade on a single ambience. Bails out as soon as the
 * op-token for `src` is superseded by another operation (start/stop/play),
 * leaving the gain wherever it currently is so the new op can take over
 * smoothly.
 * @param {Ambience} amb
 * @param {string} src
 * @param {number} token
 * @param {number} fromVolume
 * @param {number} toVolume
 * @param {number} durationMs
 * @returns {Promise<boolean>} true if the fade ran to completion
 */
async function runFade(amb, src, token, fromVolume, toVolume, durationMs) {
  const steps = 20;
  const stepDuration = Math.max(1, durationMs / steps);
  const delta = (toVolume - fromVolume) / steps;

  setGainImmediate(amb, fromVolume);

  for (let i = 1; i <= steps; i++) {
    await new Promise(resolve => setTimeout(resolve, stepDuration));
    if (!isLatestOp(src, token)) return false;
    const v = i === steps ? toVolume : fromVolume + delta * i;
    setGainImmediate(amb, v);
  }
  return true;
}

/**
 * Tear down an ambience entry (stop source, close context). Safe to call
 * multiple times; errors are swallowed because the underlying nodes may
 * already be stopped/closed.
 * @param {Ambience} amb
 */
function disposeAmbience(amb) {
  try { amb.source.stop(); } catch { /* already stopped */ }
  try { amb.context.close(); } catch { /* already closed */ }
}

/**
 * Create an Ambience entry for `src` with the given starting gain. If a
 * newer op for the same src takes over while we're awaiting fetch/decode,
 * we abort and clean up.
 * @param {string} src
 * @param {number} startingGain
 * @param {number} token
 * @returns {Promise<Ambience | null>}
 */
async function createAmbience(src, startingGain, token) {
  // @ts-ignore - webkitAudioContext fallback
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === 'suspended') {
    try { await audioContext.resume(); } catch { /* ignore */ }
  }
  if (!isLatestOp(src, token)) { try { audioContext.close(); } catch {} return null; }

  let arrayBuffer;
  try {
    arrayBuffer = await fetch(src).then(res => res.arrayBuffer());
  } catch (err) {
    console.log('Ambience fetch failed:', err);
    try { audioContext.close(); } catch {}
    return null;
  }
  if (!isLatestOp(src, token)) { try { audioContext.close(); } catch {} return null; }

  let audioBuffer;
  try {
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  } catch (err) {
    console.log('Ambience decode failed:', err);
    try { audioContext.close(); } catch {}
    return null;
  }
  if (!isLatestOp(src, token)) { try { audioContext.close(); } catch {} return null; }

  const gainNode = audioContext.createGain();
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.loop = true;
  source.connect(gainNode);
  gainNode.connect(audioContext.destination);
  gainNode.gain.setValueAtTime(startingGain, audioContext.currentTime);
  source.start(0);

  /** @type {Ambience} */
  const amb = { context: audioContext, gainNode, source, src, targetVolume: startingGain };
  AMBIENCES.push(amb);
  return amb;
}

/**
 * @param {string} src
 * @param {number} volume
 */
async function playAmbience(src, volume = 0.75) {
  const token = nextOpToken(src);
  // Desired-state bookkeeping: dedupe by src so toggleAmbience doesn't
  // re-spawn duplicates.
  currentAmbience = (currentAmbience || []).filter(s => s.src !== src).concat({ src, volume });
  if (!ambienceEnabled) return;

  if (window.API.mode === "web") {
    await audioUnlockReady;
  }
  if (!ambienceEnabled || !isLatestOp(src, token)) return;

  // If something is already playing for this src, just snap it to the new
  // volume rather than stacking another AudioContext.
  const existing = AMBIENCES.find(a => a.src === src);
  if (existing) {
    existing.targetVolume = volume;
    setGainImmediate(existing, volume);
    return;
  }

  await createAmbience(src, volume, token);
}

/**
 * @param {string} src
 */
function stopAmbience(src) {
  // Bumping the token here cancels any in-flight fade for this src.
  nextOpToken(src);
  const remaining = [];
  for (const amb of AMBIENCES) {
    if (src && amb.src !== src) {
      remaining.push(amb);
    } else {
      disposeAmbience(amb);
    }
  }
  AMBIENCES = remaining;
  if (currentAmbience) {
    currentAmbience = currentAmbience.filter(s => s.src !== src);
  }
}

/**
 * @param {string} src
 * @param {number} durationMs
 */
async function stopAmbienceWithFade(src, durationMs) {
  const token = nextOpToken(src);
  if (currentAmbience) {
    currentAmbience = currentAmbience.filter(s => s.src !== src);
  }
  const amb = AMBIENCES.find(a => a.src === src);
  if (!amb) return;

  const fromVolume = amb.gainNode.gain.value;
  const completed = await runFade(amb, src, token, fromVolume, 0, durationMs);

  // A newer op took over (e.g. start ramping it back up). Leave it alive.
  if (!completed || !isLatestOp(src, token)) return;

  const idx = AMBIENCES.indexOf(amb);
  if (idx !== -1) AMBIENCES.splice(idx, 1);
  disposeAmbience(amb);
}

/**
 * @param {string} src
 * @param {number} durationMs
 * @param {number} volume
 */
async function startAmbienceWithFade(src, durationMs, volume = 0.75) {
  const token = nextOpToken(src);
  currentAmbience = (currentAmbience || []).filter(s => s.src !== src).concat({ src, volume });
  if (!ambienceEnabled) return;

  if (window.API.mode === "web") {
    await audioUnlockReady;
  }
  if (!ambienceEnabled || !isLatestOp(src, token)) return;

  /** @type {Ambience | null | undefined} */
  let amb = AMBIENCES.find(a => a.src === src);
  let fromVolume;
  if (!amb) {
    amb = await createAmbience(src, 0, token);
    if (!amb || !isLatestOp(src, token)) return;
    fromVolume = 0;
  } else {
    fromVolume = amb.gainNode.gain.value;
  }

  amb.targetVolume = volume;
  await runFade(amb, src, token, fromVolume, volume, durationMs);
}

/**
 * @param {string} src
 */
async function isAmbiencePlaying(src) {
  return AMBIENCES.some(amb => amb.src === src);
}

let lastNumberId = 0;

/**
 * @param {Array<{src: string, volume: number}>} srcs
 * @param {number} stopDurationMs
 * @param {number} durationMs
 */
async function stopAllAmbiencesAndStartNewOne(srcs, stopDurationMs, durationMs) {
  const numberId = ++lastNumberId;
  const newSrcSet = new Set(srcs.map(s => s.src));

  // Kick off fade-outs for everything not in the new set. We don't await
  // them before starting the new ones — the per-src op-token system
  // guarantees that if one of these stop targets reappears in a later
  // call, the deferred cleanup won't kill it.
  const stopPromises = AMBIENCES
    .filter(a => !newSrcSet.has(a.src))
    .map(a => stopAmbienceWithFade(a.src, stopDurationMs)
      .catch(err => console.log('Error stopping ambience with fade:', err)));

  // If a newer call has already superseded us, don't start anything.
  if (numberId !== lastNumberId) {
    await Promise.all(stopPromises);
    return;
  }

  const startPromises = srcs.map(s => startAmbienceWithFade(s.src, durationMs, s.volume)
    .catch(err => console.log('Error starting ambience with fade:', err)));

  await Promise.all([...stopPromises, ...startPromises]);
}

export {
  playCancelSound, playPauseSound, playHoverSound, playConfirmSound, toggleFX,
  toggleAmbience, isFXEnabled, isAmbienceEnabled, playAmbience, stopAmbience,
  stopAmbienceWithFade, startAmbienceWithFade, setTempSoundDisable, playSound,
  stopAllAmbiencesAndStartNewOne
};