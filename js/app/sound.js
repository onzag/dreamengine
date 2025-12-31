const cancelSound = document.getElementById('cancelSound');
const pauseSound = document.getElementById('pauseSound');
const hoverSound = document.getElementById('hoverSound');
const confirmSound = document.getElementById('confirmSound');

function playCancelSound() {
  cancelSound.currentTime = 0;
  cancelSound.play().catch(err => console.log('Cancel sound play failed:', err));
}

function playPauseSound() {
  pauseSound.currentTime = 0;
  pauseSound.play().catch(err => console.log('Pause sound play failed:', err));
}

function playHoverSound() {
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
  confirmSound.currentTime = 0;
  confirmSound.play().catch(err => console.log('Confirm sound play failed:', err));
}
export { playCancelSound, playPauseSound, playHoverSound, playConfirmSound };