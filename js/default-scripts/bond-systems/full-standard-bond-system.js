/**
 * A complex 4 dimensional bond system with a lot of fine tuning, designed for SFW and NSFW characters alike
 */

/**
 * @typedef {Object} FSSByFamilyTie
 * @property {string} family
 * @property {string} nonFamily
 */

/**
 * @typedef {Object} FSSDefinition
 * @property {FSSByFamilyTie} deepInLove
 * @property {FSSByFamilyTie} strongRomanticInterest
 * @property {FSSByFamilyTie} romanticInterest
 * @property {FSSByFamilyTie} slightRomanticInterest
 * @property {FSSByFamilyTie} noRomanticInterest
 */

/**
 * @typedef {Object} FSSOptions
 * @property {number} bondChangeFineTune Multiplier for bond changes, default 1
 * @property {number} bondChangeNegativityBias Multiplier for negative bond changes, default 1.5
 * @property {number} strangerBreakawayBondWeightAbsolute Absolute bond weight threshold for strangers to break away, default 10
 * @property {number} strangerBreakawayInteractionsCount Number of interactions with a stranger after which they can break away, default 30
 * @property {number} strangerBreakawayTimeMinutes Time in minutes after which a stranger can break away, default 30
 * @property {number} strangerNegativeMultiplier Multiplier for bond changes with strangers when the change is negative, default 1.5
 * @property {number} strangerPositiveMultiplier Multiplier for bond changes with strangers when the change is positive, default 1.0
 * 
 * @property {FSSDefinition} foe
 * @property {FSSDefinition} hostile
 * @property {FSSDefinition} antagonistic
 * @property {FSSDefinition} unfriendly
 * @property {FSSDefinition} unpleasant
 * @property {FSSDefinition} acquaintance
 * @property {FSSDefinition} friendly
 * @property {FSSDefinition} goodFriend
 * @property {FSSDefinition} closeFriend
 * @property {FSSDefinition} bestFriend
 */

/**
 * 
 * @param {any} value 
 * @param {any} defaultValue 
 * @returns 
 */
function valueOrDefault(value, defaultValue) {
    return value !== undefined ? value : defaultValue;
}

// Other normal bonds are divided as follows by default:
//          * -100 to -50: foe bond
//          * -50 to -35: hostile bond
//          * -35 to -20: antagonistic bond
//          * -20 to -10: unfriendly bond
//          * -10 to 0: unpleasant bond
//          * 0 to 10: acquaintance bond
//          * 10 to 20: friendly bond
//          * 20 to 35: good friend bond
//          * 35 to 50: close friend bond
//          * 50 to 100: best friend bond
//          * 
//          * By default the secondary bond graduation goes as follows:
//          * 0 to 10: no romantic interest
//          * 10 to 20: slight romantic interest
//          * 20 to 35: romantic interest
//          * 35 to 50: strong romantic interest
//          * 50 to 100: deeply in love
//          * 
//          * In the negative side of the primary bond it could be used in a one-sided manner
//          * which basically indicates a romantic creep or stalker type of bond
//          * 0 to 10: no romance
//          * 10 to 20: creepy interest
//          * 20 to 35: obsessive interest
//          * 35 to 50: stalking interest
//          * 50 to 100: abuser interest

engine.exports = {
    type: "misc",
    description: "A complex 4 dimensional bond system with a lot of fine tuning, designed for SFW and NSFW characters alike.",
    exposeProperties: {},

    /**
     * @param {DECompleteCharacterReference} character
     * @param {FSSOptions} options
     */
    setupManually(character, options) {
        character.bonds = {
            system: "STANDARD_FULL",
            bondChangeFineTune: valueOrDefault(options.bondChangeFineTune, 1), // Multiplier for bond changes
            bondChangeNegativityBias: valueOrDefault(options.bondChangeNegativityBias, 1.5),
            declarations: [],
            strangerBreakawayBondWeightAbsolute: valueOrDefault(options.strangerBreakawayBondWeightAbsolute, 10),
            strangerBreakawayInteractionsCount: valueOrDefault(options.strangerBreakawayInteractionsCount, 30),
            strangerBreakawayTimeMinutes: valueOrDefault(options.strangerBreakawayTimeMinutes, 30),
            strangerNegativeMultiplier: valueOrDefault(options.strangerNegativeMultiplier, 1.5),
            strangerPositiveMultiplier: valueOrDefault(options.strangerPositiveMultiplier, 1.0),
            descriptionGeneralInjection: null,
        };


    }
}
