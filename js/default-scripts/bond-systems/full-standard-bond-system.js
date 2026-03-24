/**
 * A complex 4 dimensional bond system with a lot of fine tuning, designed for SFW and NSFW characters alike
 */

/**
 * @typedef {Object} FSSByFamilyTie
 * @property {string} template The template to use for this bond definition, should include {{char}} and {{other}} as placeholders and {{other_family_relation}} if family ties are relevant
 * @property {Array<DEBondIncreaseDecreaseQuestion>} bondIncreaseQuestions An array of questions to ask, to determine how much the bond should increase
 */

/**
 * @typedef {Object} FSSDefinition
 * @property {FSSByFamilyTie} [deepInLove]
 * @property {FSSByFamilyTie} [strongRomanticInterest]
 * @property {FSSByFamilyTie} [romanticInterest]
 * @property {FSSByFamilyTie} [slightRomanticInterest]
 * @property {FSSByFamilyTie} noRomanticInterest
 */

/**
 * @typedef {Object} FSSCreepyDefinition
 * @property {FSSByFamilyTie} [sexualAbuseInterest]
 * @property {FSSByFamilyTie} [stalkingInterest]
 * @property {FSSByFamilyTie} [obsessiveInterest]
 * @property {FSSByFamilyTie} [creepyInterest]
 * @property {FSSByFamilyTie} noRomance
 */

/**
 * @typedef {Object} FSSOptions
 * 
 * @property {"standard"} type
 * 
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
 * @typedef {Object} FSSCreepyOptions
 * @property {"creepy"} type
 * 
 * @property {number} bondChangeFineTune Multiplier for bond changes, default 1
 * @property {number} bondChangeNegativityBias Multiplier for negative bond changes, default 1.5
 * @property {number} strangerBreakawayBondWeightAbsolute Absolute bond weight threshold for strangers to break away, default 10
 * @property {number} strangerBreakawayInteractionsCount Number of interactions with a stranger after which they can break away, default 30
 * @property {number} strangerBreakawayTimeMinutes Time in minutes after which a stranger can break away, default 30
 * @property {number} strangerNegativeMultiplier Multiplier for bond changes with strangers when the change is negative, default 1.5
 * @property {number} strangerPositiveMultiplier Multiplier for bond changes with strangers when the change is positive, default 1.0
 * 
 * @property {FSSCreepyDefinition} foe
 * @property {FSSCreepyDefinition} hostile
 * @property {FSSCreepyDefinition} antagonistic
 * @property {FSSCreepyDefinition} unfriendly
 * @property {FSSCreepyDefinition} unpleasant
 * @property {FSSCreepyDefinition} acquaintance
 * @property {FSSCreepyDefinition} friendly
 * @property {FSSCreepyDefinition} goodFriend
 * @property {FSSCreepyDefinition} closeFriend
 * @property {FSSCreepyDefinition} bestFriend
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

/**
 * 
 * @param {FSSCreepyOptions} creepyOptions 
 */
function convertCreepyOptionsToStandardOptions(creepyOptions) {
    /**
     * @type {FSSOptions}
     */
    const standardOptions = {
        ...creepyOptions,
        type: "standard",
        foe: {
            deepInLove: creepyOptions.foe.sexualAbuseInterest,
            strongRomanticInterest: creepyOptions.foe.stalkingInterest,
            romanticInterest: creepyOptions.foe.obsessiveInterest,
            slightRomanticInterest: creepyOptions.foe.creepyInterest,
            noRomanticInterest: creepyOptions.foe.noRomance,
        },
        hostile: {
            deepInLove: creepyOptions.hostile.sexualAbuseInterest,
            strongRomanticInterest: creepyOptions.hostile.stalkingInterest,
            romanticInterest: creepyOptions.hostile.obsessiveInterest,
            slightRomanticInterest: creepyOptions.hostile.creepyInterest,
            noRomanticInterest: creepyOptions.hostile.noRomance,
        },
        antagonistic: {
            deepInLove: creepyOptions.antagonistic.sexualAbuseInterest,
            strongRomanticInterest: creepyOptions.antagonistic.stalkingInterest,
            romanticInterest: creepyOptions.antagonistic.obsessiveInterest,
            slightRomanticInterest: creepyOptions.antagonistic.creepyInterest,
            noRomanticInterest: creepyOptions.antagonistic.noRomance,
        },
        unfriendly: {
            deepInLove: creepyOptions.unfriendly.sexualAbuseInterest,
            strongRomanticInterest: creepyOptions.unfriendly.stalkingInterest,
            romanticInterest: creepyOptions.unfriendly.obsessiveInterest,
            slightRomanticInterest: creepyOptions.unfriendly.creepyInterest,
            noRomanticInterest: creepyOptions.unfriendly.noRomance,
        },
        unpleasant: {
            deepInLove: creepyOptions.unpleasant.sexualAbuseInterest,
            strongRomanticInterest: creepyOptions.unpleasant.stalkingInterest,
            romanticInterest: creepyOptions.unpleasant.obsessiveInterest,
            slightRomanticInterest: creepyOptions.unpleasant.creepyInterest,
            noRomanticInterest: creepyOptions.unpleasant.noRomance,
        },
        acquaintance: {
            deepInLove: creepyOptions.acquaintance.sexualAbuseInterest,
            strongRomanticInterest: creepyOptions.acquaintance.stalkingInterest,
            romanticInterest: creepyOptions.acquaintance.obsessiveInterest,
            slightRomanticInterest: creepyOptions.acquaintance.creepyInterest,
            noRomanticInterest: creepyOptions.acquaintance.noRomance,
        },
        friendly: {
            deepInLove: creepyOptions.friendly.sexualAbuseInterest,
            strongRomanticInterest: creepyOptions.friendly.stalkingInterest,
            romanticInterest: creepyOptions.friendly.obsessiveInterest,
            slightRomanticInterest: creepyOptions.friendly.creepyInterest,
            noRomanticInterest: creepyOptions.friendly.noRomance,
        },
        goodFriend: {
            deepInLove: creepyOptions.goodFriend.sexualAbuseInterest,
            strongRomanticInterest: creepyOptions.goodFriend.stalkingInterest,
            romanticInterest: creepyOptions.goodFriend.obsessiveInterest,
            slightRomanticInterest: creepyOptions.goodFriend.creepyInterest,
            noRomanticInterest: creepyOptions.goodFriend.noRomance,
        },
        closeFriend: {
            deepInLove: creepyOptions.closeFriend.sexualAbuseInterest,
            strongRomanticInterest: creepyOptions.closeFriend.stalkingInterest,
            romanticInterest: creepyOptions.closeFriend.obsessiveInterest,
            slightRomanticInterest: creepyOptions.closeFriend.creepyInterest,
            noRomanticInterest: creepyOptions.closeFriend.noRomance,
        },
        bestFriend: {
            deepInLove: creepyOptions.bestFriend.sexualAbuseInterest,
            strongRomanticInterest: creepyOptions.bestFriend.stalkingInterest,
            romanticInterest: creepyOptions.bestFriend.obsessiveInterest,
            slightRomanticInterest: creepyOptions.bestFriend.creepyInterest,
            noRomanticInterest: creepyOptions.bestFriend.noRomance,
        },
    }

    return standardOptions;
}

engine.exports = {
    type: "misc",
    description: "A complex 4 dimensional bond system with a lot of fine tuning, designed for SFW and NSFW characters alike.",
    exposeProperties: {},

    /**
     * @param {DECompleteCharacterReference} character
     * @param {FSSOptions | FSSCreepyOptions} options
     */
    setupManually(character, options) {
        const standardForm = options.type === "creepy" ? convertCreepyOptionsToStandardOptions(options) : options;

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
