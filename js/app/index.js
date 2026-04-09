// import dialog
import './components/dialog.js';
import './components/overlay.js';
import './components/settings.js';
import './components/character.js';
import './components/manage.js';
import './components/license.js';
import './components/other-attributions.js';

import { EngineWorkerClient } from "../worker-sandbox/client.js";

import {
    playConfirmSound, playHoverSound, toggleAmbience,
    toggleFX, isAmbienceEnabled, isFXEnabled, startAmbienceWithFade
} from './sound.js';

const initialPromise = new Promise((resolve) => {
    window.API.getDreamEnginePaths().then((paths) => {
        window.DREAMENGINE_HOME = paths[0];
        window.DREAMENGINE_DEFAULT_SCRIPTS_HOME = paths[1];
        resolve(paths);
    });
});

let HAS_ACTIVE_DIALOG = false;
function exitGame() {
    HAS_ACTIVE_DIALOG = true;
    const dialog = document.createElement('app-dialog');
    dialog.setAttribute('dialog-title', 'Are you sure you want to exit?');
    dialog.setAttribute("confirmation", "true");
    dialog.setAttribute("confirm-text", "Exit");
    dialog.setAttribute("cancel-text", "Cancel");
    dialog.addEventListener('confirm', () => {
        window.API.closeApp();
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
exitBtn?.addEventListener('click', function () {
    exitGame();
});

const newCharacterBtn = document.getElementById('new-character-btn');
newCharacterBtn?.addEventListener('click', async () => {
    HAS_ACTIVE_DIALOG = true;
    await initialPromise;

    const overlay = document.createElement("app-character");
    document.body.appendChild(overlay);
    overlay.addEventListener('close', () => {
        document.body.removeChild(overlay);
        setTimeout(() => {
            HAS_ACTIVE_DIALOG = false;
        }, 300);
    });
});

const openSettingsBtn = document.getElementById('open-settings-btn');
openSettingsBtn?.addEventListener('click', async () => {
    HAS_ACTIVE_DIALOG = true;
    await initialPromise;
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
manageBtn?.addEventListener('click', async () => {
    HAS_ACTIVE_DIALOG = true;
    await initialPromise;
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
    link.addEventListener('click', function () {
        playConfirmSound();
    });
});

const licenseLink = document.getElementById('license-link');
licenseLink?.addEventListener('click', async () => {
    HAS_ACTIVE_DIALOG = true;
    await initialPromise;
    const overlay = document.createElement("app-license");
    document.body.appendChild(overlay);
    overlay.addEventListener('close', () => {
        document.body.removeChild(overlay);
        setTimeout(() => {
            HAS_ACTIVE_DIALOG = false;
        }, 300);
    });
});

const otherAttributionsLink = document.getElementById('attributions-link');
otherAttributionsLink?.addEventListener('click', async () => {
    HAS_ACTIVE_DIALOG = true;
    await initialPromise;
    const overlay = document.createElement("app-other-attributions");
    document.body.appendChild(overlay);
    overlay.addEventListener('close', () => {
        document.body.removeChild(overlay);
        setTimeout(() => {
            HAS_ACTIVE_DIALOG = false;
        }, 300);
    });
});

// Toggle full screen on alt+Enter
document.addEventListener("keydown", async (e) => {
    if (e.key === "Enter" && e.altKey) {
        window.API.toggleFullScreen();
        // Force focus on body to trigger repaint

    }
    if (e.key === "F12") {
        window.API.openDevTools();
    }
    if (e.key === "Escape" && !HAS_ACTIVE_DIALOG) {
        exitGame();
    }
});

document.querySelector(".fx")?.addEventListener("click", () => {
    playConfirmSound();
    const wasToggledTo = toggleFX();
    if (wasToggledTo) {
        playConfirmSound();
        document.querySelector(".fx")?.classList.add("enabled");
    } else {
        document.querySelector(".fx")?.classList.remove("enabled");
    }
});

document.querySelector(".fx")?.addEventListener("mouseenter", (e) => {
    playHoverSound();

    // @ts-ignore
    e.currentTarget.querySelector("path").setAttribute("fill", "#FF6B6B");
});

document.querySelector(".fx")?.addEventListener("mouseleave", (e) => {
    // @ts-ignore
    e.currentTarget.querySelector("path").setAttribute("fill", "#ccc");
});

document.querySelector(".ambience")?.addEventListener("mouseenter", (e) => {
    playHoverSound();

    // @ts-ignore
    e.currentTarget.querySelector("path").setAttribute("fill", "#FF6B6B");
});

document.querySelector(".ambience")?.addEventListener("mouseleave", (e) => {
    // @ts-ignore
    e.currentTarget.querySelector("path").setAttribute("fill", "#ccc");
});

document.querySelector(".ambience")?.addEventListener("click", () => {
    playConfirmSound();
    const wasToggledTo = toggleAmbience();
    if (wasToggledTo) {
        document.querySelector(".ambience")?.classList.add("enabled");
    } else {
        document.querySelector(".ambience")?.classList.remove("enabled");
    }
});

let WORKER_READY = false;
let DOM_READY = false;

// Initialize sound icons based on settings
window.addEventListener('DOMContentLoaded', () => {
    if (isFXEnabled()) {
        document.querySelector(".fx")?.classList.add("enabled");
    } else {
        document.querySelector(".fx")?.classList.remove("enabled");
    }

    if (isAmbienceEnabled()) {
        document.querySelector(".ambience")?.classList.add("enabled");
    } else {
        document.querySelector(".ambience")?.classList.remove("enabled");
    }

    setTimeout(async () => {
        DOM_READY = true;
        await startAmbienceWithFade(['./sounds/dream-ambience.mp3'], 2000, 3);
        if (WORKER_READY && DOM_READY) {
            removeLoadingBlur();
        }
    }, 500);
});

let LOADING_BLUR_OPEN = true;
function removeLoadingBlur() {
    if (!LOADING_BLUR_OPEN) {
        return;
    }
    LOADING_BLUR_OPEN = false;
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
        loadingOverlay.style.transition = 'opacity 1s ease';
        loadingOverlay.style.opacity = '0';
        setTimeout(() => {
            if (loadingOverlay.parentNode) {
                loadingOverlay.parentNode.removeChild(loadingOverlay);
            }

            setTimeout(() => {
                initialChecks();
            }, 100);
        }, 1000);
    }
}

async function initialChecks() {
    // Check if the engine has any API keys configured, if not show the settings overlay
    const apiKey = await window.API.getConfigValue('secret');
    if (!apiKey) {
        HAS_ACTIVE_DIALOG = true;
        const dialog = document.createElement('app-dialog');
        dialog.setAttribute('dialog-title', 'No API Key Configured');
        dialog.innerHTML = `<p>You have not configured an API key yet. You can enter your API key in the settings. Please note that you will need an API key to use the application even using local self-hosted mode.</p>`;
        dialog.setAttribute("confirmation", "true");
        dialog.setAttribute("confirm-text", "Open Settings");
        dialog.setAttribute("cancel-text", "Ignore");
        dialog.addEventListener('confirm', () => {
            const settingsOverlay = document.createElement('app-settings');
            settingsOverlay.setAttribute("initial-section", "1");
            document.body.appendChild(settingsOverlay);
            settingsOverlay.addEventListener('close', () => {
                document.body.removeChild(settingsOverlay);
                setTimeout(() => {
                    HAS_ACTIVE_DIALOG = false;
                    secondChecks();
                }, 300);
            });
            document.body.removeChild(dialog);
        });
        dialog.addEventListener('cancel', () => {
            document.body.removeChild(dialog);
            setTimeout(() => {
                HAS_ACTIVE_DIALOG = false;
                secondChecks();
            }, 300);
        });
        document.body.appendChild(dialog);
    } else {
        secondChecks();
    }
}

async function secondChecks() {
    // Check that all necessary user properties are set, if not show the settings overlay
    const requiredProperties = [
        'user.name', 'user.shortDescription',
        'user.heightCm', 'user.weightKg', 'user.ageYears',
        'user.carryingCapacityKg', 'user.carryingCapacityLiters',
        'user.maintenanceCaloriesPerDay', 'user.maintenanceHydrationLitersPerDay',
        'user.rangeMeters', 'user.locomotionSpeedMetersPerSecond',
        'user.stealth', 'user.perception', 'user.tierValue', 'user.powerGrowthRate'
    ];
    const missingProperties = [];
    for (const prop of requiredProperties) {
        const value = await window.API.getConfigValue(prop);
        if (!value) {
            missingProperties.push(prop);
            break;
        }
    }
    if (missingProperties.length > 0) {
        HAS_ACTIVE_DIALOG = true;
        const dialog = document.createElement('app-dialog');
        dialog.setAttribute('dialog-title', 'Missing User Information');
        dialog.innerHTML = `<p>Some required user information is missing. Please enter it in the settings to ensure the best experience.</p>`;
        dialog.setAttribute("confirmation", "true");
        dialog.setAttribute("confirm-text", "Open Settings");
        dialog.setAttribute("cancel-text", "Ignore");
        dialog.addEventListener('confirm', () => {
            const settingsOverlay = document.createElement('app-settings');
            settingsOverlay.setAttribute("initial-section", "0");
            document.body.appendChild(settingsOverlay);
            settingsOverlay.addEventListener('close', () => {
                document.body.removeChild(settingsOverlay);
                setTimeout(() => {
                    HAS_ACTIVE_DIALOG = false;
                }, 300);
            });
            document.body.removeChild(dialog);
        });
        dialog.addEventListener('cancel', () => {
            document.body.removeChild(dialog);
            setTimeout(() => {
                HAS_ACTIVE_DIALOG = false;
            }, 300);
        });
        document.body.appendChild(dialog);
    }
}

console.log("Loading worker...");
const worker = new Worker('../worker-sandbox/index.js', { type: "module" });
const client = new EngineWorkerClient(worker);
client.ready.then(async () => {
    console.log("Worker is ready");

    await initialPromise;

    const scriptFiles = await window.API.listScriptFiles();

    await client.setScriptPaths(
        {
            // @ts-ignore
            defaultScriptsPath: window.DREAMENGINE_DEFAULT_SCRIPTS_HOME,
            userScriptsPath: window.DREAMENGINE_HOME + "/scripts",
        },
    );
    await client.setScriptList({
        scripts: scriptFiles,
    });
    await client.jsEnginePreloadAllScripts();

    document.addEventListener("jsEngineRecreate", async () => {
        const scriptFiles = await window.API.listScriptFiles();
        await client.jsEngineRecreate();
        await client.setScriptList({
            scripts: scriptFiles,
        });
        await client.jsEnginePreloadAllScripts();
    });

    // Engine is ready to be used at this point
    WORKER_READY = true;

    if (WORKER_READY && DOM_READY) {
        removeLoadingBlur();
    }
}).catch((err) => {
    console.error("Worker failed to initialize:", err);
});

// Expose client on window
window.ENGINE_WORKER_CLIENT = client;