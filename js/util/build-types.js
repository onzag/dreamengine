import path from 'path';
import fs from 'fs';
import { generateScriptRegistryContent } from './map-local-types.js';

const fsPromises = fs.promises;
const localDEPathAtHomeDir = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.dreamengine');
const typesSourceDir = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', 'types');
const deTypesDir = path.join(localDEPathAtHomeDir, 'types');

/**
 * Builds the type environment for both:
 * - The local repo (`js/types/script-registry.d.ts`) — default-scripts only
 * - The `.dreamengine` dev folder (`~/.dreamengine/types/`) — all search paths,
 *   plus copies of DE.d.ts, api.d.ts
 * @param {{doNotBuildLocals: boolean, doNotWriteHomeScript: boolean}} options
 */
export default async function build(options = { doNotBuildLocals: false, doNotWriteHomeScript: false }) {
    if (!options.doNotBuildLocals) {
        // 1. Local repo registry (default-scripts only)
        const localRegistryContent = await generateScriptRegistryContent({ localOnly: true });
        await fsPromises.writeFile(path.join(typesSourceDir, 'script-registry.d.ts'), localRegistryContent, 'utf-8');
        console.log(`Wrote script-registry.d.ts to ${typesSourceDir}`);
    }

    // 2. .dreamengine dev environment (all search paths)
    await fsPromises.mkdir(deTypesDir, { recursive: true });

    const fullRegistryContent = await generateScriptRegistryContent({ localOnly: false });
    await fsPromises.writeFile(path.join(deTypesDir, 'script-registry.d.ts'), fullRegistryContent, 'utf-8');
    console.log(`Wrote script-registry.d.ts to ${deTypesDir}`);

    // Copy the core type files to .dreamengine
    const filesToCopy = ['DE.d.ts', 'api.d.ts'];
    for (const file of filesToCopy) {
        const src = path.join(typesSourceDir, file);
        const dest = path.join(deTypesDir, file);
        await fsPromises.copyFile(src, dest);
        console.log(`Copied ${file} to ${deTypesDir}`);
    }

    if (!options.doNotWriteHomeScript) {
        const thisFile = new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
        const isWin = process.platform === 'win32';
        const scriptName = isWin ? 'update-types.cmd' : 'update-types.sh';
        const scriptContent = isWin
            ? `@echo off\r\nnode "${thisFile}" --remote-only\r\n`
            : `#!/bin/sh\nnode "${thisFile}" --remote-only\n`;
        const scriptPath = path.join(localDEPathAtHomeDir, scriptName);
        try {
            await fsPromises.writeFile(scriptPath, scriptContent, { mode: 0o755 });
            console.log(`Wrote ${scriptName} to ${scriptPath}`);
        } catch (err) {
            // @ts-ignore
            console.warn(`Could not write ${scriptName}: ${err.message}`);
        }

        // default config
        const deServerConfigPath = path.join(localDEPathAtHomeDir, 'config.json');
        if (!fs.existsSync(deServerConfigPath)) {
            const defaultConfig = JSON.stringify({
                host: 'wss://localhost:8765',
                secret: 'dev-secret-12345678900abcdef'
            }, null, 4) + '\n';
            try {
                await fsPromises.writeFile(deServerConfigPath, defaultConfig, 'utf8');
                console.log(`Wrote config.json to ${deServerConfigPath}`);
            } catch (err) {
                // @ts-ignore
                console.warn(`Could not write config.json: ${err.message}`);
            }
        }

        // cardtype-generator-llama-adapter script
        const adapterFile = path.resolve(path.dirname(thisFile), "..", "cardtype", "cardtype-generator-llama-adapter.js");
        const adapterScriptName = isWin ? 'cardtype.cmd' : 'cardtype.sh';
        const adapterScriptContent = isWin
            ? `@echo off\r\nnode "${adapterFile}" %*\r\n`
            : `#!/bin/sh\nnode "${adapterFile}" "$@"\n`;
        const adapterScriptPath = path.join(localDEPathAtHomeDir, adapterScriptName);
        try {
            await fsPromises.writeFile(adapterScriptPath, adapterScriptContent, { mode: 0o755 });
            console.log(`Wrote ${adapterScriptName} to ${adapterScriptPath}`);
        } catch (err) {
            // @ts-ignore
            console.warn(`Could not write ${adapterScriptName}: ${err.message}`);
        }
    }

    console.log('Done.');
}

const remoteOnly = process.argv.includes('--remote-only');
build({
    doNotBuildLocals: remoteOnly,
    doNotWriteHomeScript: remoteOnly,
}).catch(err => {
    console.error('Failed to build types:', err);
    process.exit(1);
});
