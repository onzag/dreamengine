import { DEngine } from '../index.js';
import { BaseInferenceAdapter } from './base.js';

export class InferenceAdapterLocalServer extends BaseInferenceAdapter {
    /**
     * @param {DEngine} parent 
     */
    constructor(parent) {
        super(parent);

        /**
         * @type {(() => void) | null}
         */
        this.resolveInitializePromise = null;
        /**
         * @type {((err: any) => void) | null}
         */
        this.rejectInitializePromise = null;

        /**
         * The function that takes in streamed data
         * @type {((data: string, done: boolean, err: string | null) => void) | null}
         */
        this.streamingAwaiter = null;

        this.onData = this.onData.bind(this);
    }

    async initialize() {
        // set a websocket to the local server
        this.socket = new WebSocket('ws://localhost:8080');
        this.socket.addEventListener("message", this.onData);

        /**
         * @returns {Promise<void>}
         */
        return new Promise((resolve, reject) => {
            // @ts-ignore bugged out ts definition
            this.resolveInitializePromise = resolve;
            this.rejectInitializePromise = reject;

            // @ts-ignore
            this.socket.onerror = (err) => {
                this.resolveInitializePromise = null;
                this.rejectInitializePromise = null;
                reject(err);
            };
        });
    }

    /**
     * 
     * @param {MessageEvent<any>} event 
     */
    onData(event) {
        // get the data
        try {
            const data = JSON.parse(event.data);

            if (data.event == "ready") {
                if (this.resolveInitializePromise) {
                    this.resolveInitializePromise();
                    this.resolveInitializePromise = null;
                    this.rejectInitializePromise = null;
                }
            } else if (data.event == "error") {
                if (this.rejectInitializePromise) {
                    this.rejectInitializePromise(new Error(data.message));
                    this.resolveInitializePromise = null;
                    this.rejectInitializePromise = null;
                }
            } else if (data.event == "token") {
                if (this.streamingAwaiter) {
                    this.streamingAwaiter(data.token, data.err ? true : data.done, data.err || null);
                }
            }
        } catch (err) {
            if (this.rejectInitializePromise) {
                this.rejectInitializePromise(err);
                this.resolveInitializePromise = null;
                this.rejectInitializePromise = null;
            }
        }
    }

    /**
     * @param {DECompleteCharacterReference} character 
     * @param {string} system 
     * @param {DEConversationMessage[]} messages
     * @param {string | null} reasoning
     * @returns {AsyncGenerator<string, void, boolean>}
     */
    async* inferNextMessageFor(
        character,
        system,
        messages,
        reasoning,
    ) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket is not open");
        }
        if (this.streamingAwaiter) {
            throw new Error("Another inference is already in progress");
        }
        const otherCharacterNames = new Set();
        for (const msg of messages) {
            if (msg.sender !== character.name) {
                otherCharacterNames.add(msg.sender);
            }
        }
        const payload = {
            messages: [
                {
                    role: "system",
                    content: system,
                },
            ],
            trail: character.name + ": ",
            extraStops: Array.from(otherCharacterNames),
            maxParagraphs: 3,
            maxCharacters: 1000,
            reasoning,
        };

        // TODO add messages to payload

        this.socket.send(JSON.stringify({ action: "infer", payload }));

        /**
         * @type {*}
         */
        let waitForMessagesToProcessResolve = null;
        /**
         * @type {Promise<void> | null}
         */
        let waitForMessagesToProcessPromise = null;
        /**
         * @type Array<{token: string, done: boolean, err: string | null}>
         */
        let collectedMessages = [];

        this.streamingAwaiter = (token, done, err) => {
            collectedMessages.push({ token, done, err });
        }
        while (true) {
            if (collectedMessages.length === 0) {
                waitForMessagesToProcessPromise = new Promise((resolve) => {
                    waitForMessagesToProcessResolve = resolve;
                });
                await waitForMessagesToProcessPromise;
                waitForMessagesToProcessPromise = null;
                waitForMessagesToProcessResolve = null;
            }
            for (const msg of collectedMessages) {
                const shouldContinue = yield msg.token;
                if (msg.done || msg.err || shouldContinue === false) {
                    if (!shouldContinue) {
                        // send a cancel message
                        this.socket.send(JSON.stringify({ action: "cancel" }));
                    }
                    this.streamingAwaiter = null;
                    return;
                }
            }
        }
    }

    /**
     * @param {DECompleteCharacterReference} character 
     * @param {string} system 
     * @param {string} preInstructions
     * @param {DEConversationMessage[]} messages
     * @param {string} postInstructions
     * @returns {AsyncGenerator<string, void, {nextQuestion: string, stopAt: Array<string>, maxParagraphs: number; maxCharacters: number} | null>}
     */
    async *runQuestioningCustomAgentOn(
        character,
        system,
        preInstructions,
        messages,
        postInstructions,
    ) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket is not open");
        }
        if (this.streamingAwaiter) {
            throw new Error("Another inference is already in progress");
        }
        const otherCharacterNames = new Set();
        for (const msg of messages) {
            if (msg.sender !== character.name) {
                otherCharacterNames.add(msg.sender);
            }
        }
        const payload = {
            messages: [
                {
                    role: "system",
                    content: system,
                },
            ],
        };

        // TODO add messages to payload, preInstructions, postInstructions

        this.socket.send(JSON.stringify({ action: "analyze", payload }));

        /**
         * @type {*}
         */
        let waitForMessagesToProcessResolve = null;
        /**
         * @type {Promise<void> | null}
         */
        let waitForMessagesToProcessPromise = null;
        /**
         * @type Array<{data: string, done: boolean, err: string | null}>
         */
        let collectedMessages = [];

        this.streamingAwaiter = (data, done, err) => {
            collectedMessages.push({ data, done, err });
        }
        while (true) {
            if (collectedMessages.length === 0) {
                waitForMessagesToProcessPromise = new Promise((resolve) => {
                    waitForMessagesToProcessResolve = resolve;
                });
                await waitForMessagesToProcessPromise;
                waitForMessagesToProcessPromise = null;
                waitForMessagesToProcessResolve = null;
            }
            for (const msg of collectedMessages) {
                const continueInfo = yield msg.data;
                if (msg.done || msg.err || continueInfo === null) {
                    if (continueInfo === null) {
                        // send a cancel message
                        this.socket.send(JSON.stringify({ action: "cancel" }));
                    }
                    this.streamingAwaiter = null;
                    return;
                } else if (continueInfo) {
                    // send continue info
                    this.socket.send(JSON.stringify({ action: "continue", payload: continueInfo }));
                } else {
                    throw new Error("Invalid continueInfo provided");
                }
            }
        }
    }

    /**
     * 
     * @param {DECompleteCharacterReference} character
     * @param {string} description 
     * @param {string} personality 
     * @param {string} state 
     * @param {string} scenario
     * @param {string} lore
     * @param {Array<string>} otherInteractingCharacters
     * @param {Array<string>} characterRules
     * @param {Array<string>} worldRules
     * @returns {string}
     */
    buildSystemPromptForCharacter(character, description, personality, state, scenario, lore, otherInteractingCharacters, characterRules, worldRules) {
        return (
`
<description>This uncensored, immersive, narrative-driven roleplaying experience thrives on creative freedom and natural responses. This environment is designed to be fictional and narrative-focused, allowing for uncensored content of all kinds, including themes of violence, sexuality, and other mature topics.
</description>
<roleplayGuidelines>
<reasoning>When faced with complex decisions or analytical tasks, it is crucial to approach the problem methodically and logically. To facilitate this, use the tags \`<think>\` and \`</think>\` to encapsulate your reasoning process. Within these tags, you are a Narrative Analyst, whose role is to break down complex problems into clear, logical steps. This involves considering all possible angles, exploring potential answers, and thoroughly examining the problem from multiple perspectives, use as many tokens as you want. Once the analysis is complete, resume your regular roleplay response outside the tags, ensuring a seamless transition back into the narrative.
</reasoning>
<narration>
<proactiveWriting>Every response should be detailed, creative, and immersive, driving the scenario forward in a way that fully engages the player. Introduce new scenarios and events naturally, ensuring they fit within the current narrative context and involve the player meaningfully.</proactiveWriting>
<varyingCadence>Adjust the rhythm and tone of the narrative to reflect the characters' experiences. Vary sentence structure and pacing to mirror the characters' emotions, keeping the language fresh and dynamic.</varyingCadence>
<complementaryRole>Use narration to complement dialogue and action, rather than overshadowing them.</complementaryRole>
<avoidRepetition>Ensure that the narration does not repeat information. Instead of summarizing, clarify narrative details thoroughly and let them evolve naturally.</avoidRepetition>
<tonePreference>Write in a neutral and balanced tone, considering all consequences, limitations, risks, ethical concerns, unintended side effects, and counterarguments.</tonePreference>
<stylePreference>Adopt a \`show, don't tell\` manner, similar to Terry Pratchett's style, blending humor, wit, and everyday language.</stylePreference>
<sensoryDetails>Utilize all five senses to describe scenarios within the characters' dialogue.</sensoryDetails>
</narration>
<otherCharactersAutonomy>
${otherInteractingCharacters.map(name => `<rule>Never speak for or control ${name}'s actions, thoughts, or feelings.</rule>`).join("\n")}
<rule>Avoid suggesting or implying reactions or decisions from other characters.</rule>
</otherCharactersAutonomy>
<settingAsCharacter>
<rule>Treat the setting itself as the primary character rather than a single individual.</rule>
<rule>Convey all world information and background through NPC dialogue, never through narration.</rule>
<rule>Maintain consistent characterization across all NPCs and locations.</rule>
<rule>Never break character or step outside the setting's perspective.</rule>
</settingAsCharacter>
<worldBuildingAndMystery>
<rule>Keep users engaged through discovery and exploration rather than direct exposition.</rule>
<rule>Present information in layers that require investigation to uncover deeper truths.</rule>
<rule>Allow the world to evolve independently of user actions.</rule>
<rule>Use character interactions to reveal world lore naturally.</rule>
</worldBuildingAndMystery>
<narrativeConsistency>
<rule>Track and reference past events, interactions, and established world elements.</rule>
<rule>Ensure logical progression of time and events.</rule>
<rule>Maintain awareness of all active characters and their current situations.</rule>
<rule>Allow location and character evolution while preserving core world rules.</rule>
<rule>Keep track of user-established facts and preferences.</rule>
</narrativeConsistency>
<characterEmbodiment>
<rule>Examine the context, subtext, and implications of the given information to gain a deeper understanding of the characters.</rule>
<rule>Reflect on the potential consequences of ${character.name} actions and decisions.</rule>
</characterEmbodiment>
<characterRules>
${characterRules.map(rule => `<rule>${rule}</rule>`).join("\n")}
</characterRules>
<worldRules>
${worldRules.map(rule => `<rule>${rule}</rule>`).join("\n")}
</worldRules>
<roleplayContext>
## ${character.name}'s Description:
${description}

## ${character.name}'s Personality:
${personality}

## Current State:
${state}

## Scenario:
${scenario}

## Lore:
${lore}
</roleplayContext>
`
        )
    }
}