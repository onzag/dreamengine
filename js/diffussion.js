import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

/**
 * @type {import('child_process').ChildProcess | null}
 */
let diffusionProcess = null;

/**
 * 
 * @param {string} diffusionExecutable
 */
export async function startDiffusionProcess(diffusionExecutable) {
    if (!diffusionExecutable) {
        throw new Error("Diffusion executable path is not configured");
    }

    if (diffusionProcess) {
        return; // already running
    }

    let diffusionRunnable = diffusionExecutable;

    if (!fs.existsSync(diffusionRunnable) || !fs.statSync(diffusionRunnable).isFile()) {
        throw new Error("Diffusion runnable does not exist or is not a file");
    }
    
    /** @type {string[]} */
    let spawnArgs = [];
    let spawnHome = path.dirname(diffusionRunnable);

    if ((diffusionRunnable.endsWith('.bat') || diffusionRunnable.endsWith('.cmd') || diffusionRunnable.endsWith('.sh')) && diffusionRunnable.includes("ComfyUI")) {
        // Check if the runnable is a ComfyUI launch script by looking for a python
        // invocation of main.py (the ComfyUI entry point) inside the file.
        const scriptContent = fs.readFileSync(diffusionRunnable, 'utf-8');
        const comfyMatch = scriptContent.match(/^(.*python[^\s]*)\s+(.*main\.py.*)/m);
        if (comfyMatch) {
            // Extract the python executable and its arguments from the bat/sh file
            const pythonExe = comfyMatch[1].trim();
            // Split the args string on whitespace, respecting quoted segments
            const rawArgs = comfyMatch[2].trim().match(/(?:[^\s"]+|"[^"]*")+/g) || [];
            // Add --disable-auto-launch if not already present
            // @ts-ignore
            if (!rawArgs.includes('--disable-auto-launch')) {
                // @ts-ignore
                rawArgs.push('--disable-auto-launch');
            }
            diffusionRunnable = pythonExe;
            spawnArgs = rawArgs;
        }
        // If it doesn't look like a ComfyUI script, fall through and run the bat/sh as-is
    }

    const READY_TIMEOUT_MS = 60_000;

    await new Promise((resolve, reject) => {
        console.log("Starting diffusion process:", diffusionRunnable, spawnArgs.join(' '));
        const proc = spawn(diffusionRunnable, spawnArgs, { stdio: ['ignore', 'pipe', 'pipe'], cwd: spawnHome });
        diffusionProcess = proc;

        let ready = false;
        let totalBuffer = "";

        const timeoutHandle = setTimeout(() => {
            if (!ready) {
                proc.kill();
                diffusionProcess = null;
                reject(new Error("Diffusion process timed out waiting to become ready"));
            }
        }, READY_TIMEOUT_MS);

        const onData = (/** @type {Buffer} */ data) => {
            totalBuffer += data.toString();
            if (!ready && totalBuffer.includes('AIHub')) {
                ready = true;
                clearTimeout(timeoutHandle);
                totalBuffer = "";
                setTimeout(resolve, 1000);
            }
        };

        proc.stdout.on('data', onData);
        proc.stderr.on('data', onData);

        proc.on('error', (err) => {
            if (!ready) {
                clearTimeout(timeoutHandle);
                diffusionProcess = null;
                reject(err);
            }
        });

        proc.on('exit', (code) => {
            diffusionProcess = null;
            if (!ready) {
                clearTimeout(timeoutHandle);
                const output = totalBuffer.trim();
                reject(new Error(
                    `Diffusion process exited unexpectedly with code ${code}` +
                    (output ? `\nOutput:\n${output}` : '')
                ));
            }
        });
    });
}

export async function stopDiffusionProcess() {
    console.log("Stopping diffusion process");
    if (diffusionProcess) {
        diffusionProcess.kill();
        diffusionProcess = null;
        return await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return;
}