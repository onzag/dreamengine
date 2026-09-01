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
 * Desired-state bookkeeping keyed by ambience id. Each id maps to the list of
 * sources it should be playing and whether they are meant to be cycled (played
 * one after another) or a single looped source.
 * @type {Map<string, {srcs: Array<{src: string, fadeDurationMs?: number, volume: number}>, cycle: boolean}>}
 */
let CURRENT_AMBIENCES_MEANT_TO_BE_PLAYING = new Map();

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
      disposeAmbience(amb);
      return false;
    });
  } else {
    for (const [id, desired] of CURRENT_AMBIENCES_MEANT_TO_BE_PLAYING) {
      if (desired.cycle) {
        startAmbiencesWithFade(id, desired.srcs);
      } else if (desired.srcs.length) {
        const s = desired.srcs[0];
        startAmbienceWithFade(id, s.src, s.fadeDurationMs || 0, s.volume);
      }
    }
  }
  return ambienceEnabled;
}

/**
 * @param {number} factor
 * @param {number} [fadeDurationMs]
 */
async function setAllAmbiencesVolume(factor, fadeDurationMs = 500) {
  await Promise.all(AMBIENCES.map(async amb => {
    const newVolume = amb.targetVolume * factor;
    const token = ambienceOpTokens.get(amb.id) || 0;
    const fromVolume = amb.gainNode.gain.value;
    await runFade(amb, amb.id, token, fromVolume, newVolume, fadeDurationMs);
  }));
}

/**
 * @param {number} [fadeDurationMs]
 */
async function restoreAllAmbiencesVolume(fadeDurationMs = 500) {
  await Promise.all(AMBIENCES.map(async amb => {
    const token = ambienceOpTokens.get(amb.id) || 0;
    const fromVolume = amb.gainNode.gain.value;
    await runFade(amb, amb.id, token, fromVolume, amb.targetVolume, fadeDurationMs);
  }));
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
 * @property {string} id
 * @property {string} src
 * @property {number} targetVolume
 */

/** @type {Array<Ambience>} */
let AMBIENCES = [];

// Per-id monotonic operation tokens. Every public-facing operation that
// touches an ambience for a given id bumps that id's token. Any deferred
// work (awaits, scheduled cleanup) checks `isLatestOp(id, token)` before
// taking effect, so newer operations always supersede older ones cleanly
// without us having to manually cancel anything.
/** @type {Map<string, number>} */
const ambienceOpTokens = new Map();

/**
 * @param {string} id
 * @returns {number}
 */
function nextOpToken(id) {
  const t = (ambienceOpTokens.get(id) || 0) + 1;
  ambienceOpTokens.set(id, t);
  return t;
}

/**
 * @param {string} id
 * @param {number} token
 * @returns {boolean}
 */
function isLatestOp(id, token) {
  return ambienceOpTokens.get(id) === token;
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
 * op-token for `id` is superseded by another operation (start/stop/play),
 * leaving the gain wherever it currently is so the new op can take over
 * smoothly.
 * @param {Ambience} amb
 * @param {string} id
 * @param {number} token
 * @param {number} fromVolume
 * @param {number} toVolume
 * @param {number} fadeDurationMs
 * @returns {Promise<boolean>} true if the fade ran to completion
 */
async function runFade(amb, id, token, fromVolume, toVolume, fadeDurationMs) {
  const steps = 20;
  const stepDuration = Math.max(1, fadeDurationMs / steps);
  const delta = (toVolume - fromVolume) / steps;

  setGainImmediate(amb, fromVolume);

  for (let i = 1; i <= steps; i++) {
    await new Promise(resolve => setTimeout(resolve, stepDuration));
    if (!isLatestOp(id, token)) return false;
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
 * Remove an ambience entry from the global list and tear it down.
 * @param {Ambience} amb
 */
function removeAmbience(amb) {
  const idx = AMBIENCES.indexOf(amb);
  if (idx !== -1) AMBIENCES.splice(idx, 1);
  disposeAmbience(amb);
}

/**
 * Wait until an ambience's (non-looping) source finishes playing. Resolves
 * immediately-ish if the source is stopped early (which also fires 'ended').
 * @param {Ambience} amb
 * @returns {Promise<void>}
 */
function waitForAmbienceEnd(amb) {
  return new Promise(resolve => {
    amb.source.addEventListener('ended', () => resolve(), { once: true });
  });
}

/**
 * Create an Ambience entry for `src` under `id` with the given starting gain.
 * If a newer op for the same id takes over while we're awaiting fetch/decode,
 * we abort and clean up.
 * @param {string} id
 * @param {string} src
 * @param {number} startingGain
 * @param {number} token
 * @param {boolean} [loop]
 * @returns {Promise<Ambience | null>}
 */
async function createAmbience(id, src, startingGain, token, loop = true) {
  // @ts-ignore - webkitAudioContext fallback
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === 'suspended') {
    try { await audioContext.resume(); } catch { /* ignore */ }
  }
  if (!isLatestOp(id, token)) { try { audioContext.close(); } catch {} return null; }

  let arrayBuffer;
  try {
    arrayBuffer = await fetch(src).then(res => res.arrayBuffer());
  } catch (err) {
    console.log('Ambience fetch failed:', err);
    try { audioContext.close(); } catch {}
    return null;
  }
  if (!isLatestOp(id, token)) { try { audioContext.close(); } catch {} return null; }

  let audioBuffer;
  try {
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  } catch (err) {
    console.log('Ambience decode failed:', err);
    try { audioContext.close(); } catch {}
    return null;
  }
  if (!isLatestOp(id, token)) { try { audioContext.close(); } catch {} return null; }

  const gainNode = audioContext.createGain();
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.loop = loop;
  source.connect(gainNode);
  gainNode.connect(audioContext.destination);
  gainNode.gain.setValueAtTime(startingGain, audioContext.currentTime);
  source.start(0);

  /** @type {Ambience} */
  const amb = { context: audioContext, gainNode, source, id, src, targetVolume: startingGain };
  AMBIENCES.push(amb);
  return amb;
}

/**
 * Play a single looped source under `id`. Replaces whatever was playing for
 * that id.
 * @param {string} id
 * @param {string} src
 * @param {number} volume
 */
async function playAmbience(id, src, volume = 0.75) {
  const token = nextOpToken(id);
  // Desired-state bookkeeping keyed by id.
  CURRENT_AMBIENCES_MEANT_TO_BE_PLAYING.set(id, { srcs: [{ src, volume }], cycle: false });
  if (!ambienceEnabled) return;

  if (window.API.mode === "web") {
    await audioUnlockReady;
  }
  if (!ambienceEnabled || !isLatestOp(id, token)) return;

  // If the same src is already playing for this id, just snap it to the new
  // volume rather than stacking another AudioContext.
  const existing = AMBIENCES.find(a => a.id === id && a.src === src);
  if (existing) {
    existing.targetVolume = volume;
    setGainImmediate(existing, volume);
    // Drop any other sources previously playing under this id.
    for (const other of AMBIENCES.filter(a => a.id === id && a !== existing)) {
      removeAmbience(other);
    }
    return;
  }

  // Different (or no) source currently playing under this id: clear it out.
  for (const other of AMBIENCES.filter(a => a.id === id)) {
    removeAmbience(other);
  }

  await createAmbience(id, src, volume, token);
}

/**
 * Immediately stop and dispose every ambience playing under `id`.
 * @param {string} id
 */
function stopAmbience(id) {
  // Bumping the token here cancels any in-flight fade/cycle for this id.
  nextOpToken(id);
  const remaining = [];
  for (const amb of AMBIENCES) {
    if (id && amb.id !== id) {
      remaining.push(amb);
    } else {
      disposeAmbience(amb);
    }
  }
  AMBIENCES = remaining;
  CURRENT_AMBIENCES_MEANT_TO_BE_PLAYING.delete(id);
}

/**
 * Fade out and dispose every ambience playing under `id`.
 * @param {string} id
 * @param {number} fadeDurationMs
 */
async function stopAmbienceWithFade(id, fadeDurationMs) {
  const token = nextOpToken(id);
  CURRENT_AMBIENCES_MEANT_TO_BE_PLAYING.delete(id);
  const ambs = AMBIENCES.filter(a => a.id === id);
  if (!ambs.length) return;

  await Promise.all(ambs.map(async amb => {
    const fromVolume = amb.gainNode.gain.value;
    const completed = await runFade(amb, id, token, fromVolume, 0, fadeDurationMs);

    // A newer op took over (e.g. start ramping it back up). Leave it alive.
    if (!completed || !isLatestOp(id, token)) return;

    removeAmbience(amb);
  }));
}

/**
 * Start a single looped source under `id`, fading it in.
 * @param {string} id
 * @param {string} src
 * @param {number} fadeDurationMs
 * @param {number} volume
 */
async function startAmbienceWithFade(id, src, fadeDurationMs, volume = 0.75) {
  const token = nextOpToken(id);
  CURRENT_AMBIENCES_MEANT_TO_BE_PLAYING.set(id, { srcs: [{ src, fadeDurationMs, volume }], cycle: false });
  if (!ambienceEnabled) return;

  if (window.API.mode === "web") {
    await audioUnlockReady;
  }
  if (!ambienceEnabled || !isLatestOp(id, token)) return;

  // Drop any other sources previously playing under this id.
  for (const other of AMBIENCES.filter(a => a.id === id && a.src !== src)) {
    removeAmbience(other);
  }

  /** @type {Ambience | null | undefined} */
  let amb = AMBIENCES.find(a => a.id === id && a.src === src);
  let fromVolume;
  if (!amb) {
    amb = await createAmbience(id, src, 0, token, true);
    if (!amb || !isLatestOp(id, token)) return;
    fromVolume = 0;
  } else {
    fromVolume = amb.gainNode.gain.value;
  }

  amb.targetVolume = volume;
  await runFade(amb, id, token, fromVolume, volume, fadeDurationMs);
}

/**
 * Starts multiple ambiences in the order they are given, playing them one
 * after another under a single `id`.
 *
 * Each source is played once (not looped): it fades in, plays through to its
 * end, and only then does the next one fade in. Because we wait until the
 * previous one is completely done there is no crossfade — the next one simply
 * fades in once the previous finishes. After the whole list has played it
 * repeats the cycle again, until a newer operation supersedes this id.
 *
 * @param {string} id a special id to identify the group cycle
 * @param {Array<{src: string; fadeDurationMs?: number; volume: number}>} srcs
 */
async function startAmbiencesWithFade(id, srcs) {
  if (srcs.length === 0) {
    stopAmbience(id);
    return;
  } else if (srcs.length === 1) {
    const s = srcs[0];
    await startAmbienceWithFade(id, s.src, s.fadeDurationMs || 0, s.volume);
    return;
  }

  const token = nextOpToken(id);
  CURRENT_AMBIENCES_MEANT_TO_BE_PLAYING.set(id, {
    srcs: srcs.map(s => ({ src: s.src, fadeDurationMs: s.fadeDurationMs, volume: s.volume })),
    cycle: true
  });
  if (!srcs.length || !ambienceEnabled) return;

  if (window.API.mode === "web") {
    await audioUnlockReady;
  }
  if (!ambienceEnabled || !isLatestOp(id, token)) return;

  // Clear anything currently playing under this id before we start the cycle.
  for (const other of AMBIENCES.filter(a => a.id === id)) {
    removeAmbience(other);
  }

  while (isLatestOp(id, token) && ambienceEnabled) {
    for (const s of srcs) {
      if (!isLatestOp(id, token) || !ambienceEnabled) return;

      const amb = await createAmbience(id, s.src, 0, token, false);
      if (!amb || !isLatestOp(id, token)) {
        if (amb) removeAmbience(amb);
        return;
      }

      amb.targetVolume = s.volume;
      await runFade(amb, id, token, 0, s.volume, s.fadeDurationMs || 0);
      if (!isLatestOp(id, token)) {
        removeAmbience(amb);
        return;
      }

      // Wait until this source has played all the way through before moving on.
      await waitForAmbienceEnd(amb);
      if (!isLatestOp(id, token)) return;

      removeAmbience(amb);
    }
  }
}

/**
 * @param {string} id
 */
async function isAmbiencePlaying(id) {
  return AMBIENCES.some(amb => amb.id === id);
}

let lastNumberId = 0;

/**
 * Stop every ambience group that isn't in `groups` (with a fade) and start the
 * given groups. Each group is keyed by an id and may contain multiple ordered
 * sources that will be cycled via startAmbiencesWithFade.
 *
 * @param {Array<{id: string, srcs: Array<{src: string, fadeDurationMs: number, volume: number}>}>} groups
 * @param {number} stopfadeDurationMs
 */
async function stopAllAmbiencesAndStartNewOne(groups, stopfadeDurationMs) {
  const numberId = ++lastNumberId;
  const newIdSet = new Set(groups.map(g => g.id));

  // Kick off fade-outs for every id not in the new set. We don't await them
  // before starting the new ones — the per-id op-token system guarantees that
  // if one of these stop targets reappears in a later call, the deferred
  // cleanup won't kill it.
  const currentIds = [...new Set(AMBIENCES.map(a => a.id))];
  const stopPromises = currentIds
    .filter(id => !newIdSet.has(id))
    .map(id => stopAmbienceWithFade(id, stopfadeDurationMs)
      .catch(err => console.log('Error stopping ambience with fade:', err)));

  // If a newer call has already superseded us, don't start anything.
  if (numberId !== lastNumberId) {
    await Promise.all(stopPromises);
    return;
  }

  const startPromises = groups.map(g => startAmbiencesWithFade(g.id, g.srcs)
    .catch(err => console.log('Error starting ambiences with fade:', err)));

  await Promise.all([...stopPromises, ...startPromises]);
}

/**
 * Takes a group of ambience sources and randomizes the order returning an array of the same sources in a new order. This is useful for creating a more dynamic ambience experience.
 * 
 * @param {Array<{src: string, fadeDurationMs: number, volume: number}>} group
 */
function randomizeAmbienceGroupSrc(group) {
  const shuffled = [...group];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export {
  playCancelSound, playPauseSound, playHoverSound, playConfirmSound, toggleFX,
  toggleAmbience, isFXEnabled, isAmbienceEnabled, playAmbience, stopAmbience,
  stopAmbienceWithFade, startAmbienceWithFade, startAmbiencesWithFade,
  isAmbiencePlaying, setTempSoundDisable, playSound,
  stopAllAmbiencesAndStartNewOne, randomizeAmbienceGroupSrc,
  setAllAmbiencesVolume, restoreAllAmbiencesVolume
};