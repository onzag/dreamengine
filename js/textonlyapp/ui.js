import { DEngine } from "../engine/index.js";
import readline from "readline";
import { getHistoryForCharacter, parseMessageInComponentsAsText } from "../engine/util/messages.js";

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
            process.stdout.write(text);
        }
    }

    /**
     * @param {DEObject} obj 
     */
    async processUpdate(obj) {
        /**
         * @type {Array<{name: string; message: string; id: string}>}
         */
        let accumulatedMessages = [];
        const generator = getHistoryForCharacter(
            this.engine,
            obj.characters[this.username],
            {
                // excludeFrom: [this.username],
                includeDebugMessages: true,
                includeRejectedMessages: true,
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

        const newBuffer = accumulatedMessages.map(m => {
            return parseMessageInComponentsAsText(m.name, m.message);
        }).join("\n\n");

        if (newBuffer.length > 0) {
            console.log(newBuffer);
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