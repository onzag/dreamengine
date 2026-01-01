const cancelSound = document.getElementById('cancelSound');
const pauseSound = document.getElementById('pauseSound');
const hoverSound = document.getElementById('hoverSound');
const confirmSound = document.getElementById('confirmSound');

let fxEnabled = (localStorage.getItem('fxEnabled') || "true") === 'true';
let ambienceEnabled = (localStorage.getItem('ambienceEnabled') || "true") === 'true';

let currentAmbience = null;

function playCancelSound() {
  if (!fxEnabled) return;
  cancelSound.currentTime = 0;
  cancelSound.play().catch(err => console.log('Cancel sound play failed:', err));
}

function playPauseSound() {
  if (!fxEnabled) return;
  pauseSound.currentTime = 0;
  pauseSound.play().catch(err => console.log('Pause sound play failed:', err));
}

function playHoverSound() {
  if (!fxEnabled) return;
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
  if (!fxEnabled) return;
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
  if (ambienceEnabled && currentAmbience) {
    playAmbience(currentAmbience);
  } else {
    pauseAmbience();
  }
  return ambienceEnabled;
}

function isFXEnabled() {
  return fxEnabled;
}

function isAmbienceEnabled() {
  return ambienceEnabled;
}

const AMBIENCES = []

async function playAmbience(src, volume=0.5) {
  if (currentAmbience === src) {
    document.querySelectorAll('audio.ambience').forEach(audio => {
      audio.play().catch(err => console.log('Ambience play failed:', err));
    });
  } else {
    currentAmbience = (currentAmbience || []).concat(src);
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
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
      if (ambienceEnabled) {
        source.start(0);
        sources.push(source);
      }
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
}

function stopAmbience() {
  AMBIENCES.forEach(amb => {
    amb.sources.forEach(source => {
      source.stop();
    });
    amb.context.close();
  });
  // Clear tracked ambiences without reassigning the constant
  AMBIENCES.length = 0;
}

let isFading = null;

async function stopAmbienceWithFade(durationMs) {
  if (isFading === "OUT") {
    return;
  }
  isFading = "OUT";
  const steps = 20;
  const stepDuration = durationMs / steps;

  const volumeStepSize = 0.5 / steps;
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

async function startAmbienceWithFade(src, durationMs) {
  if (isFading === "IN") {
    return;
  }
  isFading = "IN";
  await playAmbience(src, 0);
  const steps = 20;
  const stepDuration = durationMs / steps;
  const volumeStepSize = 0.5 / steps;
  
  while (true) {
    if (isFading !== "IN") {
      return;
    }

    let updatedOne = false;
    AMBIENCES.forEach(amb => {
      if (amb.gainNode.gain.value === 0.5) {
        return;
      }
      let newValue = amb.gainNode.gain.value + volumeStepSize;
      updatedOne = true;
      if (newValue > 0.5) {
        newValue = 0.5;
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

export { playCancelSound, playPauseSound, playHoverSound, playConfirmSound, toggleFX,
  toggleAmbience, isFXEnabled, isAmbienceEnabled, playAmbience, stopAmbience,
  stopAmbienceWithFade, startAmbienceWithFade };