import { DEngine } from "../engine/index.js";
import readline from "readline";
import { getHistoryForCharacter, parseMessageInComponentsAsText } from "../engine/util/messages.js";
import fs from "fs";
import path from "path";
import os from "os";
import { exec } from "child_process";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * 
 * @param {string} question 
 * @returns 
 */
function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

const COLORS = {
    hidden: '\x1b[90m',      // dark gray
    debug: '\x1b[90m',      // dark gray
    rejected: '\x1b[31m',    // red
    storyMaster: '\x1b[36m', // cyan
    default: '\x1b[0m',      // reset
};

/**
 * @param {{hidden: boolean, storyMaster: boolean, rejected: boolean, debug: boolean}} m
 */
function colorFor(m) {
    if (m.rejected) return COLORS.rejected;
    if (m.debug) return COLORS.debug;
    if (m.hidden) return COLORS.hidden;
    if (m.storyMaster) return COLORS.storyMaster;
    return COLORS.default;
}

console.log(COLORS.default);

/**
 * A simple text only UI for the DEngine
 */

export class TextOnlyUI {
    /**
     * 
     * @param {DEngine} engine
     * @param {string} username
     */
    constructor(engine, username) {
        /**
         * @type {DEngine}
         */
        this.engine = engine;
        this.isRunning = false;
        this.processUpdate = this.processUpdate.bind(this);
        this.addToTextBuffer = this.addToTextBuffer.bind(this);
        this.username = username;

        /**
         * @type {string|null}
         */
        this.lastMessageId = null;
        /**
         * @type {Set<string>}
         */
        this.seenMessageIds = new Set();

        this.storyFilePath = path.join(os.tmpdir(), 'rstory-story-view.txt');
        /** @type {import('child_process').ChildProcess|null} */
        this.viewerProcess = null;
        
        this.lastMessageColor = COLORS.default;

        if (!this.engine.deObject) {
            throw new Error("Engine not initialized");
        } else if (!this.engine.deObject.characters[this.username]) {
            throw new Error(`Character ${this.username} not found in the engine`);
        }
    }
    
    async run() {
        this.isRunning = true;
        if (!this.engine.deObject) {
            throw new Error("Engine not initialized");
        }

        // Spawn a story-only viewer in a separate console window
        fs.writeFileSync(this.storyFilePath, '');
        if (process.platform === 'win32') {
            const viewerScript = path.join(os.tmpdir(), 'rstory-viewer.ps1');
            fs.writeFileSync(viewerScript,
`$host.UI.RawUI.WindowTitle = 'Story View'
Get-Content -Path '${this.storyFilePath}' -Wait -Encoding UTF8`);
            this.viewerProcess = exec(`start "" powershell -ExecutionPolicy Bypass -File "${viewerScript}"`);
        } else if (process.platform === 'darwin') {
            this.viewerProcess = exec(`osascript -e 'tell app "Terminal" to do script "tail -f '${this.storyFilePath}'"'`);
        } else {
            // Linux: try common terminal emulators
            const escaped = this.storyFilePath.replace(/'/g, "'\\''");
            this.viewerProcess = exec(
                `x-terminal-emulator -T "Story View" -e tail -f '${escaped}' 2>/dev/null || ` +
                `gnome-terminal --title="Story View" -- tail -f '${escaped}' 2>/dev/null || ` +
                `xterm -T "Story View" -e tail -f '${escaped}' 2>/dev/null || ` +
                `konsole --title "Story View" -e tail -f '${escaped}' 2>/dev/null`
            );
        }
        this.viewerProcess?.unref();

        const cleanup = () => {
            if (this.viewerProcess && !this.viewerProcess.killed) {
                this.viewerProcess.kill();
            }
            // On Windows the powershell runs in its own window, kill it via taskkill
            if (process.platform === 'win32') {
                exec(`powershell -Command "Get-Process powershell | Where-Object {$_.MainWindowTitle -eq 'Story View'} | Stop-Process -Force"`);
            }
        };
        process.on('exit', cleanup);
        process.on('SIGINT', () => { cleanup(); process.exit(); });
        process.on('SIGTERM', () => { cleanup(); process.exit(); });

        console.log(`[Story viewer: ${this.storyFilePath}]`);

        this.engine.addDEObjectUpdatedListener(this.processUpdate);
        this.engine.addCycleInformListener((level, message) => {
            if (level === "info") {
                console.log(`[INFO]: ${message}`);
            } else if (level === "warning") {
                console.warn(`[WARNING]: ${message}`);
            } else if (level === "error") {
                console.error(`[ERROR]: ${message}`);
            }
        });
        this.engine.addInferringOverConversationMessageListener(this.addToTextBuffer);

        if (!this.engine.deObject.world.selectedScene) {
            console.log("The world scene has not started yet.");
            console.log("Choose one of the following initial scenes to start:");
            /**
             * @type {Record<number, string>}
             */
            const sceneToIndex = {};
            let index = 0;
            for (const [sceneId, value] of Object.entries(this.engine.deObject.world.initialScenes)) {
                index++;
                sceneToIndex[index] = sceneId;
                const narrationMessage = typeof value.narration === "string" ? value.narration : await value.narration(this.engine.deObject, {});
                // @ts-ignore
                console.log(`${index}: ${narrationMessage}`);
            }

            let chosenIndex = null;
            while (chosenIndex === null) {
                const userInput = await prompt("Enter the number of the scene to start: ");
                const parsedIndex = parseInt(userInput);
                if (!isNaN(parsedIndex) && sceneToIndex[parsedIndex]) {
                    chosenIndex = parsedIndex;
                } else {
                    console.log("Invalid input, please try again.");
                }
            }
            const chosenSceneId = sceneToIndex[chosenIndex];
            console.log(`Starting scene: ${chosenSceneId}`);
            await this.engine.startScene(chosenSceneId);
        }

        // Wait for initial update before showing prompt
        await this.processUpdate(this.engine.deObject);

        while (this.isRunning) {
            const userInput = await prompt(this.username + "> ");
            try {
                await this.engine.executeNextCycle(userInput);
            } catch (e) {
                console.error("Error executing cycle:", e);
            }
        }
    }

    /**
     * 
     * @param {DEObject} obj 
     * @param {string} conversationId 
     * @param {string} messageId 
     * @param {string} text 
     */
    addToTextBuffer(obj, conversationId, messageId, text) {
        if (this.lastMessageId === messageId) {
            // log the text without a newline
            process.stdout.write(this.lastMessageColor + text + COLORS.default);
            fs.appendFileSync(this.storyFilePath, this.lastMessageColor + text + COLORS.default);
        }
    }

    /**
     * @param {DEObject} obj 
     */
    async processUpdate(obj) {
        /**
         * @type {Array<{name: string; message: string; id: string; hidden: boolean; storyMaster: boolean; rejected: boolean; debug: boolean}>}
         */
        let accumulatedMessages = [];
        const generator = getHistoryForCharacter(
            this.engine,
            obj.characters[this.username],
            {
                // excludeFrom: [this.username],
                includeDebugMessages: true,
                includeRejectedMessages: true,
                includeHiddenMessages: true,
            }
        );
        let next = await generator.next(true);
        while (!next.done) {
            if (next.value.id === this.lastMessageId || this.seenMessageIds.has(next.value.id)) {
                await generator.return();
                break;
            }
            accumulatedMessages.push(next.value);
            next = await generator.next(true);
        }
        accumulatedMessages = accumulatedMessages.reverse();

        const coloredBuffer = accumulatedMessages.map(m => {
            return colorFor(m) + (m.debug ? m.message : parseMessageInComponentsAsText(m.name, m.message));
        }).join("\n\n");

        if (coloredBuffer.length > 0) {
            this.lastMessageColor = colorFor(accumulatedMessages[accumulatedMessages.length - 1]);
            console.log(coloredBuffer + COLORS.default);
            fs.appendFileSync(this.storyFilePath, coloredBuffer + "\n\n" + COLORS.default);
        }

        const lastMessage = accumulatedMessages[accumulatedMessages.length - 1];
        if (lastMessage) {
            this.lastMessageId = lastMessage.id;
        }
        accumulatedMessages.forEach(m =>
            this.seenMessageIds.add(m.id)
        );
    }
}