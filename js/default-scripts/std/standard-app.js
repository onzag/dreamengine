/**
 * In the dreamengine standard app, a characters script contains one single character alone
 * this metadata is used for display in the UI, technically a character script can contain multiple characters,
 * and the app will handle it, but for better user experience, it is recommended to have one character per script.
 * 
 * Metadata is otherwise always displayed in the UI unless it starts with an underscore, in which case it is for internal use
 * script metadata is easily accessible in the script
 * 
 * Note that the main reason a script can be non-standard is for example to build rows of NPCs in a loop, that is however
 * a non-standard use case
 * 
 * @typedef {Object} CharacterScriptMetadataFields
 * @property {string} __name - The name of the character, this is a special property that replaces the display name in the UI
 * @property {Array<WorldCreditGeneralAuthor>} [__authors] - The authors of the character, will display in credits if the world has credits
 * @property {number} age - The age of the character.
 * @property {"male" | "female" | "ambiguous"} gender - The gender of the character.
 * @property {"male" | "female" | "intersex" | "none"} sex - The sex of the character.
 * @property {string} species - The species of the character.
 * @property {"humanoid" | "feral" | "animal"} speciesType - The species type of the character.
 * @property {number} height - The height of the character in centimeters.
 * @property {number} weight - The weight of the character in kilograms.
 */

/**
 * @typedef {Object} WorldIntroBit
 * @property {string} title - The title of the introduction bit.
 * @property {string} subtitle - The subtitle of the introduction bit.
 */

/**
 * @typedef {Object} WorldCreditBit
 * @property {string} title - The title of the credit bit.
 * @property {string} subtitle - The subtitle of the credit bit.
 */

/**
 * @typedef {Object} WorldCreditGeneralAuthor
 * @property {string} name - The name of the general author.
 * @property {string} role - The role of the general author.
 */

/**
 * @typedef {Object} ThemeSong
 * @property {string} asset - The path to the theme song asset file.
 * @property {number} volume - Volume adjustment factor, can exceed 1.0 for amp
 */

/**
 * @typedef {Object} WorldCredit
 * @property {ThemeSong} [theme] - The theme song for the credits.
 * @property {Array<WorldCreditBit>} [mainMessages] - The credits of the world
 * @property {Array<WorldCreditGeneralAuthor>} [generalAuthors] - The general authors of the world.
 */

/**
 * @typedef {Object} WorldScriptMetadataFields
 * @property {string} __name - The name of the world, this is a special property that replaces the display name in the UI
 * @property {Array<WorldIntroBit>} [__intro] - optional introduction of the world
 * @property {WorldCredit} [__credits] - optional credits of the world, display in game over and when quested by the engine
 */

/**
 * Image assets for a character, keyed by emotion name. The `neutral` emotion is always required.
 * @typedef {{ neutral: string } & Partial<Record<DEEmotionNames, string>>} CharacterImageAssets
 */

/**
 * @typedef {Object} CharacterVoiceEntry
 * @property {string} asset - The path to the voice asset file.
 * @property {string} [transcript] - The transcript of the voice line.
 * @property {string[]} [tags] - Tags describing how the voice sounds (e.g. "soft", "raspy", "breathy").
 */

/**
 * Voice assets for a character, keyed by emotion name. The `neutral` emotion is always required.
 * @typedef {{ neutral: CharacterVoiceEntry } & Partial<Record<DEEmotionNames, CharacterVoiceEntry>>} CharacterVoiceAssets
 */

/**
 * Voice modifier assets for a character, keyed by modifier name (e.g. "whispering", "mumbling", "screaming").
 * Each key maps to a voice entry for that modifier.
 * @typedef {Record<string, CharacterVoiceEntry>} CharacterVoiceModifiersAssets
 */

/**
 * @typedef {Object} CharacterSoundEntry
 * @property {string} asset - The path to the sound asset file.
 * @property {"hidden" | "narration" | "dialogue"} displayType - How the sound is displayed in the UI.
 * @property {string} [displayLabel] - The display label for the sound. Use `{char}` to refer to the character's name.
 * @property {[number, number]} preGapRange - Range of silence before the sound in milliseconds [min, max].
 * @property {[number, number]} postGapRange - Range of silence after the sound in milliseconds [min, max].
 * @property {number} volume - Volume adjustment factor, from 0.0 (silent) to 1.0 (full).
 */

/**
 * Sound assets for a character, keyed by sound label.
 * @typedef {Record<string, CharacterSoundEntry>} CharacterSoundAssets
 */

/**
 * @typedef {Object} CharacterMetadataFields
 * @property {CharacterImageAssets} assets - the image assets for the character, this is a special property that is used to display the character in the UI
 * @property {CharacterVoiceAssets} [voice] - the sound assets for the character, this is a special property that is used to play the character's voice in the UI, do not specify if character is mute
 * @property {CharacterVoiceModifiersAssets} [voiceModifiers] - the sound assets for the character, this is a special property that is used to play the character's voice modifiers in the UI, do not specify if character has no voice modifiers
 * @property {CharacterSoundAssets} sounds - the sound assets for the character, this is a special property that is used to play the character's sounds in the UI
 */

/**
 * @typedef {Object} WorldMetadataFields
 * @property {ThemeSong} [theme] - the theme song of the world
 */

/**
 * @typedef {Object} LocationMetadataFields
 * @property {ThemeSong} [theme] - the theme song of the location
 * @property {Record<string, ThemeSong>} [themeAlternateByWeather] - the theme song of the location, but can be overridden by weather conditions
 * @property {Record<string, ThemeSong>} [weatherSounds] - the sounds of the weather at the location, when that weather is active, the sound will play along with the theme song, should loop
 * @property {string} asset - the image asset of the location
 */

/**
 * @typedef {Object} ItemMetadataFields
 * @property {string} asset - the image asset of the item
 */

/**
 * @typedef {CharacterScriptMetadataFields & Record<string, *>} CharacterScriptMetadata
 */

/**
 * @typedef {WorldScriptMetadataFields & Record<string, *>} WorldScriptMetadata
 */

/**
 * @typedef {CharacterMetadataFields & Record<string, *>} CharacterMetadata
 */

/**
 * @typedef {WorldMetadataFields & Record<string, *>} WorldMetadata
 */

/**
 * @typedef {LocationMetadataFields & Record<string, *>} LocationMetadata
 */

/**
 * @typedef {ItemMetadataFields & Record<string, *>} ItemMetadata
 */

engine.exports = {
    type: "misc",
    language: "*",
    description: "Default standard scripts for DE UI App",
    /**
     * Marks the script as a character script that contains a single character, this is useful for the UI to display the character
     * as well as to be able to do the following:
     * 
     * @param {CharacterScriptMetadata} metadata 
     * @returns {CharacterScriptMetadata}
     */
    buildCharacterScriptMetadata: (metadata) => {
        // @ts-ignore
        metadata.__single_character = true;
        return metadata;
    },

    /**
     * @param {WorldScriptMetadata} metadata 
     * @returns {WorldScriptMetadata}
     */
    buildWorldScriptMetadata: (metadata) => {
        return metadata;
    },

    /**
     * 
     * @param {CharacterMetadata} metadata 
     * @returns {CharacterMetadata}
     */
    buildCharacterMetadata: (metadata) => {
        return metadata;
    },

    /**
     * @param {WorldMetadata} metadata 
     * @returns {WorldMetadata}
     */
    buildWorldMetadata: (metadata) => {
        return metadata;
    },

    /**
     * @param {LocationMetadata} metadata 
     * @returns {LocationMetadata}
     */
    buildLocationMetadata: (metadata) => {
        return metadata;
    },

    /**
     * @param {LocationMetadata} metadata 
     * @returns {LocationMetadata}
     */
    buildLocationSlotMetadata: (metadata) => {
        return metadata;
    },

    /**
     * 
     * @param {ItemMetadata} metadata 
     * @returns {ItemMetadata}
     */
    buildItemMetadata: (metadata) => {
        return metadata;
    },
}