const electron = require('electron');
const path = require('node:path');

if (typeof electron === 'string') {
    const { spawnSync } = require('node:child_process');
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const result = spawnSync(electron, [__filename], { env, stdio: 'inherit', windowsHide: true });
    if (result.error) console.error(result.error);
    process.exit(result.status ?? 1);
} else {
    const { app, BrowserWindow } = electron;
    app.setPath('userData', path.join(require('node:os').tmpdir(), 'rstory-perspective-test'));
    app.commandLine.appendSwitch('disable-gpu');
    app.whenReady().then(async () => {
        const window = new BrowserWindow({ show: false, width: 1280, height: 900,
            webPreferences: { backgroundThrottling: false } });
        const timeout = setTimeout(() => { console.error('Browser checks timed out'); app.exit(1); }, 30000);
        try {
            await window.loadFile(path.join(__dirname, 'game-perspective.html'));
            const result = await window.webContents.executeJavaScript(
                "import('./game-perspective.browser.js').then(module => module.run()).catch(error => ({ error: error.stack }))");
            if (result.error) throw new Error(result.error);
            console.log(result);
            clearTimeout(timeout);
            window.destroy();
            app.exit(0);
        } catch (error) {
            console.error(error);
            app.exit(1);
        }
    });
}
