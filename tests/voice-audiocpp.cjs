// Run with: node tests/voice-audiocpp.cjs
// Uses Electron's real Web Audio decoder, with generated WAV fixtures and mocked HTTP.
const path = require('node:path');

if (!process.versions.electron) {
    const { spawnSync } = require('node:child_process');
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const result = spawnSync(require('electron'), [__filename], { env, stdio: 'inherit', windowsHide: true });
    if (result.error) console.error(result.error);
    process.exit(result.status ?? 1);
} else {
    const { app, BrowserWindow } = require('electron');
    app.setPath('userData', path.join(require('node:os').tmpdir(), 'rstory-voice-audiocpp-tests'));
    app.disableHardwareAcceleration();
    const timeout = setTimeout(() => { console.error('Audio tests timed out.'); app.exit(1); }, 60000);
    app.whenReady().then(async () => {
        const window = new BrowserWindow({ show: false });
        await window.loadFile(path.join(__dirname, 'voice-audiocpp.html'));
        const results = await window.webContents.executeJavaScript('window.testResult');
        for (const result of results) console.log(result);
        clearTimeout(timeout);
        app.exit(results.some(result => result.startsWith('FAIL')) ? 1 : 0);
    }).catch(error => { console.error(error); app.exit(1); });
}
