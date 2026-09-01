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
 * @property {number} age - The age of the character.
 * @property {"male" | "female" | "ambiguous"} gender - The gender of the character.
 * @property {"male" | "female" | "intersex" | "none"} sex - The sex of the character.
 * @property {string} species - The species of the character.
 * @property {"humanoid" | "feral" | "animal"} speciesType - The species type of the character.
 * @property {number} height - The height of the character in centimeters.
 * @property {number} weight - The weight of the character in kilograms.
 */

/**
 * @typedef {CharacterScriptMetadataFields & Record<string, boolean | number | string | undefined>} CharacterScriptMetadata
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
}