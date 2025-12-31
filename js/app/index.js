// import dialog
import './components/dialog.js';
import './components/overlay.js';
import './components/settings.js';
import './components/character.js';
import './components/manage.js';

// Sound effects
const hoverSound = document.getElementById('hoverSound');
const confirmSound = document.getElementById('confirmSound');
const cancelSound = document.getElementById('cancelSound');
const pauseSound = document.getElementById('pauseSound');

function playHoverSound() {
  hoverSound.currentTime = 0;
  hoverSound.play().catch(err => console.log('Hover sound play failed:', err));
}

function playConfirmSound() {
  confirmSound.currentTime = 0;
  confirmSound.play().catch(err => console.log('Confirm sound play failed:', err));
}

function playCancelSound() {
  cancelSound.currentTime = 0;
  cancelSound.play().catch(err => console.log('Cancel sound play failed:', err));
}

function playPauseSound() {
  pauseSound.currentTime = 0;
  pauseSound.play().catch(err => console.log('Pause sound play failed:', err));
}

let HAS_ACTIVE_DIALOG = false;
function exitGame() {
    HAS_ACTIVE_DIALOG = true;
    const dialog = document.createElement('app-dialog');
    dialog.setAttribute('dialog-title', 'Are you sure you want to exit?');
    dialog.setAttribute("confirmation", "true");
    dialog.setAttribute("confirm-text", "Exit");
    dialog.setAttribute("cancel-text", "Cancel");
    dialog.addEventListener('confirm', () => {
        window.electronAPI.closeApp();
    });
    dialog.addEventListener('cancel', () => {
        document.body.removeChild(dialog);
        setTimeout(() => {
            HAS_ACTIVE_DIALOG = false;
        }, 100);
    });
    document.body.appendChild(dialog);
}

// Get all menu buttons and add event listeners
const buttons = document.querySelectorAll('.menu-btn');
buttons.forEach(button => {
  button.addEventListener('mouseenter', playHoverSound);
});

const exitBtn = document.getElementById('exit-btn');
exitBtn.addEventListener('click', function() {
    exitGame();
});

const newCharacterBtn = document.getElementById('new-character-btn');
newCharacterBtn.addEventListener('click', async () => {
    HAS_ACTIVE_DIALOG = true;
    const rs = await window.electronAPI.createEmptyCharacterFile();
    const overlay = document.createElement("app-character");
    overlay.setAttribute("character-group", rs.group);
    overlay.setAttribute("character-file", rs.characterFile);
    document.body.appendChild(overlay);
    overlay.addEventListener('close', () => {
        document.body.removeChild(overlay);
        setTimeout(() => {
            HAS_ACTIVE_DIALOG = false;
        }, 300);
    });
});

const openSettingsBtn = document.getElementById('open-settings-btn');
openSettingsBtn.addEventListener('click', function() {
    HAS_ACTIVE_DIALOG = true;
    const overlay = document.createElement("app-settings");
    document.body.appendChild(overlay);
    overlay.addEventListener('close', () => {
        document.body.removeChild(overlay);
        setTimeout(() => {
            HAS_ACTIVE_DIALOG = false;
        }, 300);
    });
});


const manageBtn = document.getElementById('manage-btn');
manageBtn.addEventListener('click', function() {
    HAS_ACTIVE_DIALOG = true;
    const overlay = document.createElement("app-manage");
    document.body.appendChild(overlay);
    overlay.addEventListener('close', () => {
        document.body.removeChild(overlay);
        setTimeout(() => {
            HAS_ACTIVE_DIALOG = false;
        }, 300);
    });
});

// Get all footer links and add event listeners
const footerLinks = document.querySelectorAll('.footer a');
footerLinks.forEach(link => {
  link.addEventListener('mouseenter', playHoverSound);
  link.addEventListener('click', function() {
    playConfirmSound();
  });
});

// Toggle full screen on alt+Enter
document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.altKey) {
        window.electronAPI.toggleFullScreen();
        // Force focus on body to trigger repaint
        
    }
    if (e.key === "F12") {
        window.electronAPI.openDevTools();
    }
    if (e.key === "Escape" && !HAS_ACTIVE_DIALOG) {
        exitGame();
    }
});