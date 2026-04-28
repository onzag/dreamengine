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
 * @type Array<string> | null
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
    stopAmbience(true);
  } else if (currentAmbience) {
    playAmbience(currentAmbience);
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
 * @type {Array<{context: AudioContext, gainNode: GainNode, sources: AudioBufferSourceNode[]}>}
 */
const AMBIENCES = []

/**
 * 
 * @param {string[]} src 
 * @param {number} volume 
 * @returns 
 */
async function playAmbience(src, volume = 0.75) {
  currentAmbience = (currentAmbience || []).concat(src);
  if (!ambienceEnabled) {
    return;
  }
  // In web mode wait for the first user gesture before creating an
  // AudioContext (no-op in electron). This avoids the
  // "AudioContext was not allowed to start" warning.
  if (window.API.mode === "web") {
    await audioUnlockReady;
  }
  if (!ambienceEnabled) {
    return;
  }
  // @ts-ignore
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  // Some browsers still create the context in the suspended state; resume it
  // explicitly now that we know we have a user gesture.
  if (audioContext.state === 'suspended') {
    try { await audioContext.resume(); } catch { /* ignore */ }
  }
  const gainNode = audioContext.createGain();
  const sources = [];
  for (const srcItem of src) {
    const ambienceAudio = await fetch(srcItem).then(res => res.arrayBuffer());
    const audioBuffer = await audioContext.decodeAudioData(ambienceAudio);
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.loop = true;
    // Route audio through gain node
    source.connect(gainNode);
    source.start(0);
    sources.push(source);
  }
  // Connect gain to destination once
  gainNode.connect(audioContext.destination);
  gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
  gainNode.gain.value = volume;
  AMBIENCES.push({
    context: audioContext,
    gainNode: gainNode,
    sources,
  });
}

function stopAmbience(doNotClearCurrent = false) {
  AMBIENCES.forEach(amb => {
    amb.sources.forEach(source => {
      source.stop();
    });
    amb.context.close();
  });
  // Clear tracked ambiences without reassigning the constant
  AMBIENCES.length = 0;
  if (!doNotClearCurrent) {
    currentAmbience = null;
  }
}

/**
 * 
 * @type {"IN" | "OUT" | null}
 */
let isFading = null;

/**
 * 
 * @param {number} durationMs 
 * @returns 
 */
async function stopAmbienceWithFade(durationMs, volume = 0.75) {
  if (isFading === "OUT") {
    return;
  }
  isFading = "OUT";
  const steps = 20;
  const stepDuration = durationMs / steps;

  const volumeStepSize = volume / steps;
  while (true) {
    if (isFading !== "OUT") {
      return;
    }

    let updatedOne = false;
    AMBIENCES.forEach(amb => {
      if (amb.gainNode.gain.value === 0) {
        return;
      }
      let newValue = amb.gainNode.gain.value - volumeStepSize;
      if (newValue < 0) {
        newValue = 0;
      }
      amb.gainNode.gain.setValueAtTime(newValue, amb.context.currentTime);
      amb.gainNode.gain.value = newValue;
      updatedOne = true;
    });

    if (!updatedOne) {
      isFading = null;
      stopAmbience();
      return;
    }

    await new Promise(resolve => setTimeout(resolve, stepDuration));
  }
}

/**
 * 
 * @param {string[]} src 
 * @param {number} durationMs 
 * @returns 
 */
async function startAmbienceWithFade(src, durationMs, volume = 0.75) {
  if (isFading === "IN") {
    return;
  }
  isFading = "IN";
  await playAmbience(src, 0);
  const steps = 20;
  const stepDuration = durationMs / steps;
  const volumeStepSize = volume / steps;

  while (true) {
    if (isFading !== "IN") {
      return;
    }

    let updatedOne = false;
    AMBIENCES.forEach(amb => {
      if (amb.gainNode.gain.value === volume) {
        return;
      }
      let newValue = amb.gainNode.gain.value + volumeStepSize;
      updatedOne = true;
      if (newValue > volume) {
        newValue = volume;
      }
      amb.gainNode.gain.setValueAtTime(newValue, amb.context.currentTime);
      amb.gainNode.gain.value = newValue;
    });

    if (!updatedOne) {
      isFading = null;
      return;
    }

    await new Promise(resolve => setTimeout(resolve, stepDuration));
  }
}

export {
  playCancelSound, playPauseSound, playHoverSound, playConfirmSound, toggleFX,
  toggleAmbience, isFXEnabled, isAmbienceEnabled, playAmbience, stopAmbience,
  stopAmbienceWithFade, startAmbienceWithFade, setTempSoundDisable
};