export class BaseVoiceAdapter {
    constructor() {
        /**
         * @type {Array<(status: {connected: boolean, reason?: string}) => void>}
         */
        this.onConnectionStatusChangeFns = [];
        /**
         * @type {Array<[() => void, (err: string) => void]>}
         */
        this.onConnectionStatusChangePromises = [];
    }

    async initialize() {
        throw new Error("Method 'initialize()' must be implemented.");
    }

    async ensureInitialized() {
        throw new Error("Method 'ensureInitialized()' must be implemented.");
    }

    /**
     * @returns {Promise<boolean>}
     */
    async canBePaused() {
        throw new Error("Method 'canBePaused()' must be implemented.");
    }

    async pause() {
        throw new Error("Method 'pause()' must be implemented.");
    }

    async resume() {
        throw new Error("Method 'resume()' must be implemented.");
    }

    /**
     * @param {Blob} file
     * @param {string} filename
     * @returns {Promise<{skipped: boolean, id: string}>}
     */
    uploadVoice(file, filename) {
        throw new Error("Method 'uploadVoice()' must be implemented.");
    }

    /**
     * @param {DEConversationMessageNarration} narration
     * @param {string} voiceId
     * @param {DEVoiceModeMin[]} deliveryModes
     * @returns {Promise<Blob>}
     */
    renderNarration(
        narration,
        voiceId,
        deliveryModes,
    ) {
        throw new Error("Method 'renderNarration()' must be implemented.");
    }

    /**
     * @param {DEConversationMessageThought} thought 
     * @param {string} voiceId 
     * @param {DEVoiceModeMin[]} deliveryModes
     * @returns {Promise<Blob>}
     */
    renderThought(
        thought,
        voiceId,
        deliveryModes,
    ) {
        throw new Error("Method 'renderThought()' must be implemented.");
    }

    /**
     * 
     * @param {Array<DEConversationMessageDialogueFragment>} dialogueFragment 
     * @param {string} voiceId
     * @param {DEVoiceModeMin[]} deliveryModes
     * @param {CharacterSoundAssets} sounds
     * @returns {Promise<Blob>}
     */
    renderDialogueFragmentChunk(
        dialogueFragment,
        voiceId,
        deliveryModes,
        sounds,
    ) {
        throw new Error("Method 'renderDialogueFragmentChunk()' must be implemented.");
    }

    /**
     * @param {string} assetPath
     */
    async loadAsset(assetPath) {
        // TODO implement this here
        return new Blob([], { type: "audio/wav" });
    }

    /**
     * @param {DEConversationMessageDialogue} dialogue
     * @param {DEEmotionNames} primaryEmotion
     * @param {CharacterVoiceAssets} voice
     * @param {CharacterVoiceModifiersAssets} voiceModifiers
     * @param {CharacterSoundAssets} sounds
     * @param {string} narratorVoiceId
     * @param {DEVoiceMode[]} narrationDeliveryModes
     * @returns {Promise<Blob>}
     */
    async renderDialogue(
        dialogue,
        primaryEmotion,
        voice,
        narratorVoiceId,
        voiceModifiers,
        sounds,
        narrationDeliveryModes,
    ) {
        const defaultVoice = voice[primaryEmotion] || voice.neutral;
        /**
         * @type {Blob[]}
         */
        const renderedBlobsInOrder = [];
        /**
         * @type {Array<"dialogue-chunk" | "narration-chunk">}
         */
        const renderedBlobsTypesInOrder = [];
        /**
         * @type {Array<DEConversationMessageDialogueFragment>}
         */
        let accumulatedChunks = [];
        /**
         * @type {DEVoiceModeMin[]}
         */
        let accumulatedDeliverModes = [];

        /**
         * Renders all accumulated chunks and clears the accumulation arrays. This is called when we encounter a sound with a delivery mode (and there was existing text for a previous)
         * delivery mode (or the default, just if there is text beforehand)
         * 
         * Or when we find a narration, which is a separate type of fragment that needs to be rendered separately, triggering the end of the dialogue fragment accumulation.
         */
        const renderAccumulatedChunks = async () => {
            // first we check if we have any accumulated chunks to render, if not, we can skip this step
            if (accumulatedChunks.length > 0) {
                // we need to determine which voice to use for this chunk, based on the delivery modes and the primary emotion
                let voiceToUse = defaultVoice;
                // add the primary emotion as the first delivery mode
                // if there are no accumulated delivery modes, we will use the primary emotion as the default
                // and its label
                if (accumulatedDeliverModes.length === 0) {
                    accumulatedDeliverModes.push({
                        label: "voice_emotion",
                        instructions: primaryEmotion,
                    });
                } else {
                    // otherwise if there are modes, we will pick the first one that matches a voice file
                    // if we get any
                    for (const potentialVoiceOfMode of accumulatedDeliverModes) {
                        const foundVoice = voiceModifiers[potentialVoiceOfMode.label];
                        if (foundVoice) {
                            voiceToUse = foundVoice;
                            break;
                        }
                    }
                }

                const blob = await this.loadAsset(voiceToUse.asset);
                const uploaded = await this.uploadVoice(blob, voiceToUse.asset);

                // now we will build other instructions based on the tags of the voice we are using
                const otherInstructions = voiceToUse.tags?.join(", ") || "";
                if (otherInstructions) {
                    accumulatedDeliverModes.push({
                        label: "voice_desc",
                        instructions: otherInstructions,
                    });
                }

                // now we can render all that, this includes the sounds, we don't know how the specific
                // API will handle this, specially things like pauses which could be natively handled
                const renderedDialogueChunk = await this.renderDialogueFragmentChunk(
                    accumulatedChunks,
                    uploaded.id,
                    accumulatedDeliverModes,
                    sounds,
                );

                // finally we get all these rendered chunks and add them to the final array of blobs in order, and clear the accumulated arrays for the next chunk
                renderedBlobsInOrder.push(renderedDialogueChunk);
                renderedBlobsTypesInOrder.push("dialogue-chunk");

                // clear up the accumulated arrays for the next chunk
                accumulatedChunks = [];
                accumulatedDeliverModes = [];
            }
        }

        // start loop in the fragments of the dialogue
        for (const fragment of dialogue.fragments) {
            // if the fragment is a dialogue type
            if (fragment.type === "dialogue") {
                // we accumulate that simply
                accumulatedChunks.push(fragment);
            } else if (fragment.type === "sound") {
                // sounds are more tricky let's see if it is a mode
                // we worry that there are two modes in a row before a delivery eg.
                // [screaming] [crying] [sobs] no you mean prick!
                // we need to wait until we have text to deliver that
                if (fragment.soundInfo.mode) {
                    // so we check for text, any text, narration will also ensure
                    // that we break if there is no text and only sounds, as well as at the very end whatever is left
                    const alreadyHasText = accumulatedChunks.some(f => f.type === "dialogue" || f.type === "narration");
                    // now if we already have text, render it
                    // we don't want to wait for the next mode [screaming] [crying] [sobs] no you mean prick! [whispering] but...
                    if (alreadyHasText) {
                        await renderAccumulatedChunks();
                    }
                    // add the deliver mode for whatever comes next
                    accumulatedDeliverModes.push(fragment.soundInfo.mode);
                } else {
                    // Let the adapter resolve assets and built-in pauses even when
                    // a tag has no entry in the character's voice sound definitions.
                    accumulatedChunks.push(fragment);
                }
            } else if (fragment.type === "narration") {
                // now for narrations we just going to render whatever we have accumulated so far, and then render the narration separately, as it is a different type of fragment
                await renderAccumulatedChunks();

                // then we use the standard narration rendering
                const renderedNarration = await this.renderNarration(
                    {
                        type: "narration",
                        fragments: fragment.fragments,
                    },
                    narratorVoiceId,
                    narrationDeliveryModes,
                );
                renderedBlobsInOrder.push(renderedNarration);
                renderedBlobsTypesInOrder.push("narration-chunk");
            }
        }

        // if we have anything left in the accumulated chunks, we need to render that as well
        if (accumulatedChunks.length > 0) {
            // render it
            await renderAccumulatedChunks();
        }

        // combine and done
        return await this.combineAudioBlobs(renderedBlobsInOrder, renderedBlobsTypesInOrder);
    }

    /**
     * @param {Array<Blob>} blobs
     * @param {Array<"dialogue-chunk" | "narration-chunk">} typesInOrder
     * @returns {Promise<Blob>}
     */
    combineAudioBlobs(blobs, typesInOrder) {
        throw new Error("Method 'combineAudioBlobs()' must be implemented.");
    }

    /**
     * Triggers the on connection status change event
     * @param {boolean} connected 
     * @param {string} [reason] 
     */
    triggerOnConnectionStatusChange(connected, reason) {
        const status = { connected, reason };
        this.onConnectionStatusChangeFns.forEach(fn => fn(status));
        this.onConnectionStatusChangePromises.forEach(([resolve, reject]) => {
            if (connected) {
                resolve();
            } else {
                reject(reason || "Unknown reason");
            }
        });
        this.onConnectionStatusChangePromises = [];
    }

    /**
     * @param {(status: {connected: boolean, reason?: string}) => any} callback
     */
    addEventListenerOnConnectStatusChange(callback) {
        this.onConnectionStatusChangeFns.push(callback);
    }

    /**
     * @param {(status: {connected: boolean, reason?: string}) => any} callback
     */
    removeEventListenerOnConnectStatusChange(callback) {
        this.onConnectionStatusChangeFns = this.onConnectionStatusChangeFns.filter(fn => fn !== callback);
    }

    close() {
        throw new Error("Method 'close()' must be implemented.");
    }
}

/**
 * The rendered result of a {@link VoiceJSONRequest}: a Blob containing the
 * encoded audio (`audio/ogg` or `audio/mpeg` depending on `output_format`).
 *
 * @typedef {Blob} VoiceJSONResponse
 */
