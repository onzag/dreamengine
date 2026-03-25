/**
 * A complex 4 dimensional bond system with a lot of fine tuning, designed for SFW and NSFW characters alike
 */

/**
 * @typedef {Object} FSSBase
 * @property {DEStringTemplate} description The template to use for this bond definition, should include {{char}} and {{other}} as placeholders and {{other_family_relation}} if family ties are relevant
 * @property {DEStringTemplate|null} relationshipName The relationship name, should be one word, eg. friend, lover, colleague, etc... this is used for reasoning about the relationship and for the character to refer to the other character in the relationship, for example, if the relationship name is "friend", the character may refer to the other character as "my friend" or just "friend" when talking about them
 * @property {DEStringTemplate} [bondAdditionalDescription] additional description to be added to the bond description
 * @property {DEStringTemplate} [generalCharacterDescriptionInjection] A template that can be injected into the general character description when this bond declaration is active, it will have access to the same variables as the description, but it is meant to be a smaller piece of text that can be added to the general description when relevant, instead of being the main description of the bond level.
 * @property {DEStringTemplate} [generalCharacterDescriptionInjectionEx] Similar to generalCharacterDescriptionInjection but it will only be injected in the general character description and not in the bond description, this is useful for cases where the information is relevant for the character description but not for the bond description, for example if you want to add a sentence about how the character's family relationship with the other character affects their behavior towards them, you might want that to be in the general description injection but not in the bond description, since the bond description might be focused on romantic feelings and the family relationship might not be relevant for that.
 */

/**
 * @typedef {Object} FSSByFamilyTie
 * @property {FSSBase} family
 * @property {FSSBase} nonFamily
 */

/**
 * @typedef {Object} FSSLoveDefinition
 * @property {FSSByFamilyTie} deepInLove_50_100
 * @property {FSSByFamilyTie} strongRomanticInterest_35_50
 * @property {FSSByFamilyTie} romanticInterest_20_35
 * @property {FSSByFamilyTie} slightRomanticInterest_10_20
 * @property {FSSByFamilyTie} noRomanticInterest_0_10
 */

/**
 * @typedef {Object} FSSLoveDefinitionNoFamily
 * @property {FSSBase} deepInLove_50_100
 * @property {FSSBase} strongRomanticInterest_35_50
 * @property {FSSBase} romanticInterest_20_35
 * @property {FSSBase} slightRomanticInterest_10_20
 * @property {FSSBase} noRomanticInterest_0_10
 */

/**
 * @typedef {Object} FSSCreepyLoveDefinition
 * @property {FSSByFamilyTie} sexualAbuseInterest_50_100
 * @property {FSSByFamilyTie} stalkingInterest_35_50
 * @property {FSSByFamilyTie} obsessiveInterest_20_35
 * @property {FSSByFamilyTie} creepyInterest_10_20
 * @property {FSSByFamilyTie} noRomance_0_10
 */

/**
 * @typedef {Object} FSS4DOptions
 * 
 * @property {"4d_standard"} type
 * 
 * @property {number} [bondChangeFineTune] Multiplier for bond changes, default 1
 * @property {number} [bondChangeNegativityBias] Multiplier for negative bond changes, default 1.5
 * @property {number} [strangerBreakawayBondWeightAbsolute] Absolute bond weight threshold for strangers to break away, default 10
 * @property {number} [strangerBreakawayInteractionsCount] Number of interactions with a stranger after which they can break away, default 30
 * @property {number} [strangerBreakawayTimeMinutes] Time in minutes after which a stranger can break away, default 30
 * @property {number} [strangerNegativeMultiplier] Multiplier for bond changes with strangers when the change is negative, default 1.5
 * @property {number} [strangerPositiveMultiplier] Multiplier for bond changes with strangers when the change is positive, default 1.0
 * 
 * @property {FSSLoveDefinition} foe_n100_n50
 * @property {FSSLoveDefinition} hostile_n50_n35
 * @property {FSSLoveDefinition} antagonistic_n35_n20
 * @property {FSSLoveDefinition} unfriendly_n20_n10
 * @property {FSSLoveDefinition} unpleasant_n10_0
 * @property {FSSLoveDefinition} acquaintance_0_10
 * @property {FSSLoveDefinition} friendly_10_20
 * @property {FSSLoveDefinition} goodFriend_20_35
 * @property {FSSLoveDefinition} closeFriend_35_50
 * @property {FSSLoveDefinition} bestFriend_50_100
 * 
 * @property {FSSBase} strangerBad_n100_n5
 * @property {FSSBase} strangerNeutral_n5_5
 * @property {FSSBase} strangerGood_5_100
 */

/**
 * @typedef {Object} FSS4DCreepyOptions
 * @property {"4d_creepy"} type
 * 
 * @property {number} [bondChangeFineTune] Multiplier for bond changes, default 1
 * @property {number} [bondChangeNegativityBias] Multiplier for negative bond changes, default 1.5
 * @property {number} [strangerBreakawayBondWeightAbsolute] Absolute bond weight threshold for strangers to break away, default 10
 * @property {number} [strangerBreakawayInteractionsCount] Number of interactions with a stranger after which they can break away, default 30
 * @property {number} [strangerBreakawayTimeMinutes] Time in minutes after which a stranger can break away, default 30
 * @property {number} [strangerNegativeMultiplier] Multiplier for bond changes with strangers when the change is negative, default 1.5
 * @property {number} [strangerPositiveMultiplier] Multiplier for bond changes with strangers when the change is positive, default 1.0
 * 
 * @property {FSSCreepyLoveDefinition} foe_n100_n50
 * @property {FSSCreepyLoveDefinition} hostile_n50_n35
 * @property {FSSCreepyLoveDefinition} antagonistic_n35_n20
 * @property {FSSCreepyLoveDefinition} unfriendly_n20_n10
 * @property {FSSCreepyLoveDefinition} unpleasant_n10_0
 * @property {FSSCreepyLoveDefinition} acquaintance_0_10
 * @property {FSSCreepyLoveDefinition} friendly_10_20
 * @property {FSSCreepyLoveDefinition} goodFriend_20_35
 * @property {FSSCreepyLoveDefinition} closeFriend_35_50
 * @property {FSSCreepyLoveDefinition} bestFriend_50_100
 * 
 * @property {FSSBase} strangerBad_n100_n5
 * @property {FSSBase} strangerNeutral_n5_5
 * @property {FSSBase} strangerGood_5_100
 */

/**
 * @typedef {Object} FSS3DAceOptions
 * @property {"3d_ace"} type
 * 
 * @property {number} [bondChangeFineTune] Multiplier for bond changes, default 1
 * @property {number} [bondChangeNegativityBias] Multiplier for negative bond changes, default 1.5
 * @property {number} [strangerBreakawayBondWeightAbsolute] Absolute bond weight threshold for strangers to break away, default 10
 * @property {number} [strangerBreakawayInteractionsCount] Number of interactions with a stranger after which they can break away, default 30
 * @property {number} [strangerBreakawayTimeMinutes] Time in minutes after which a stranger can break away, default 30
 * @property {number} [strangerNegativeMultiplier] Multiplier for bond changes with strangers when the change is negative, default 1.5
 * @property {number} [strangerPositiveMultiplier] Multiplier for bond changes with strangers when the change is positive, default 1.0
 * 
 * This is a special preset for asexual and aromantic characters, it will make the character react negatively to any bond attempts and will not form romantic or sexual bonds with anyone, but it can still have the regular bonds of the standard system, just with negative reactions to any attempts to increase them.
 * 
 * @property {string} [asexualAromanticDescriptionTemplate] A template for describing the character's asexual and aromantic nature, it is injected in the description of the character and only includes {{char}}
 * 
 * @property {FSSByFamilyTie} foe_n100_n50
 * @property {FSSByFamilyTie} hostile_n50_n35
 * @property {FSSByFamilyTie} antagonistic_n35_n20
 * @property {FSSByFamilyTie} unfriendly_n20_n10
 * @property {FSSByFamilyTie} unpleasant_n10_0
 * @property {FSSByFamilyTie} acquaintance_0_10
 * @property {FSSByFamilyTie} friendly_10_20
 * @property {FSSByFamilyTie} goodFriend_20_35
 * @property {FSSByFamilyTie} closeFriend_35_50
 * @property {FSSByFamilyTie} bestFriend_50_100
 * 
 * @property {FSSBase} strangerBad_n100_n5
 * @property {FSSBase} strangerNeutral_n5_5
 * @property {FSSBase} strangerGood_5_100
 */

/**
 * @typedef {Object} FSS3DNoFamilyOptions
 * @property {"3d_no_family"} type
 * 
 * @property {number} [bondChangeFineTune] Multiplier for bond changes, default 1
 * @property {number} [bondChangeNegativityBias] Multiplier for negative bond changes, default 1.5
 * @property {number} [strangerBreakawayBondWeightAbsolute] Absolute bond weight threshold for strangers to break away, default 10
 * @property {number} [strangerBreakawayInteractionsCount] Number of interactions with a stranger after which they can break away, default 30
 * @property {number} [strangerBreakawayTimeMinutes] Time in minutes after which a stranger can break away, default 30
 * @property {number} [strangerNegativeMultiplier] Multiplier for bond changes with strangers when the change is negative, default 1.5
 * @property {number} [strangerPositiveMultiplier] Multiplier for bond changes with strangers when the change is positive, default 1.0
 * 
 *
 * @property {FSSLoveDefinitionNoFamily} foe_n100_n50
 * @property {FSSLoveDefinitionNoFamily} hostile_n50_n35
 * @property {FSSLoveDefinitionNoFamily} antagonistic_n35_n20
 * @property {FSSLoveDefinitionNoFamily} unfriendly_n20_n10
 * @property {FSSLoveDefinitionNoFamily} unpleasant_n10_0
 * @property {FSSLoveDefinitionNoFamily} acquaintance_0_10
 * @property {FSSLoveDefinitionNoFamily} friendly_10_20
 * @property {FSSLoveDefinitionNoFamily} goodFriend_20_35
 * @property {FSSLoveDefinitionNoFamily} closeFriend_35_50
 * @property {FSSLoveDefinitionNoFamily} bestFriend_50_100
 * 
 * @property {FSSBase} strangerBad_n100_n5
 * @property {FSSBase} strangerNeutral_n5_5
 * @property {FSSBase} strangerGood_5_100
 */

/**
 * @typedef {Object} FSS2DAceNoFamilyOptions
 * @property {"2d_ace_no_family"} type
 * 
 * @property {number} [bondChangeFineTune] Multiplier for bond changes, default 1
 * @property {number} [bondChangeNegativityBias] Multiplier for negative bond changes, default 1.5
 * @property {number} [strangerBreakawayBondWeightAbsolute] Absolute bond weight threshold for strangers to break away, default 10
 * @property {number} [strangerBreakawayInteractionsCount] Number of interactions with a stranger after which they can break away, default 30
 * @property {number} [strangerBreakawayTimeMinutes] Time in minutes after which a stranger can break away, default 30
 * @property {number} [strangerNegativeMultiplier] Multiplier for bond changes with strangers when the change is negative, default 1.5
 * @property {number} [strangerPositiveMultiplier] Multiplier for bond changes with strangers when the change is positive, default 1.0
 * 
 * This is a special preset for asexual and aromantic characters, it will make the character react negatively to any bond attempts and will not form romantic or sexual bonds with anyone, but it can still have the regular bonds of the standard system, just with negative reactions to any attempts to increase them.
 * 
 * @property {string} [asexualAromanticDescriptionTemplate] A template for describing the character's asexual and aromantic nature, it is injected in the description of the character and only includes {{char}}
 *
 * @property {FSSBase} foe_n100_n50
 * @property {FSSBase} hostile_n50_n35
 * @property {FSSBase} antagonistic_n35_n20
 * @property {FSSBase} unfriendly_n20_n10
 * @property {FSSBase} unpleasant_n10_0
 * @property {FSSBase} acquaintance_0_10
 * @property {FSSBase} friendly_10_20
 * @property {FSSBase} goodFriend_20_35
 * @property {FSSBase} closeFriend_35_50
 * @property {FSSBase} bestFriend_50_100
 * 
 * @property {FSSBase} strangerBad_n100_n5
 * @property {FSSBase} strangerNeutral_n5_5
 * @property {FSSBase} strangerGood_5_100
 */

/**
 * @typedef {Object} FSS1DAceNoStrangersNoFamilyOptions
 * @property {"1d_ace_no_strangers_no_family"} type
 * 
 * @property {number} [bondChangeFineTune] Multiplier for bond changes, default 1
 * @property {number} [bondChangeNegativityBias] Multiplier for negative bond changes, default 1.5
 * @property {number} [strangerBreakawayBondWeightAbsolute] Absolute bond weight threshold for strangers to break away, default 10
 * @property {number} [strangerBreakawayInteractionsCount] Number of interactions with a stranger after which they can break away, default 30
 * @property {number} [strangerBreakawayTimeMinutes] Time in minutes after which a stranger can break away, default 30
 * @property {number} [strangerNegativeMultiplier] Multiplier for bond changes with strangers when the change is negative, default 1.5
 * @property {number} [strangerPositiveMultiplier] Multiplier for bond changes with strangers when the change is positive, default 1.0
 * 
 * This is a special preset for asexual and aromantic characters, it will make the character react negatively to any bond attempts and will not form romantic or sexual bonds with anyone, but it can still have the regular bonds of the standard system, just with negative reactions to any attempts to increase them.
 * 
 * @property {string} [asexualAromanticDescriptionTemplate] A template for describing the character's asexual and aromantic nature, it is injected in the description of the character and only includes {{char}}
 *
 * @property {FSSBase} foe_n100_n50
 * @property {FSSBase} hostile_n50_n35
 * @property {FSSBase} antagonistic_n35_n20
 * @property {FSSBase} unfriendly_n20_n10
 * @property {FSSBase} unpleasant_n10_0
 * @property {FSSBase} acquaintance_0_10
 * @property {FSSBase} friendly_10_20
 * @property {FSSBase} goodFriend_20_35
 * @property {FSSBase} closeFriend_35_50
 * @property {FSSBase} bestFriend_50_100
 * 
 * @property {FSSBase} strangerBad_n100_n5
 * @property {FSSBase} strangerNeutral_n5_5
 * @property {FSSBase} strangerGood_5_100
 */

/**
 * @typedef {Object} FSS0DTesting
 * @property {"0d_testing"} type
 * 
 * @property {number} [bondChangeFineTune] Multiplier for bond changes, default 1
 * @property {number} [bondChangeNegativityBias] Multiplier for negative bond changes, default 1.5
 * @property {number} [strangerBreakawayBondWeightAbsolute] Absolute bond weight threshold for strangers to break away, default 10
 * @property {number} [strangerBreakawayInteractionsCount] Number of interactions with a stranger after which they can break away, default 30
 * @property {number} [strangerBreakawayTimeMinutes] Time in minutes after which a stranger can break away, default 30
 * @property {number} [strangerNegativeMultiplier] Multiplier for bond changes with strangers when the change is negative, default 1.5
 * @property {number} [strangerPositiveMultiplier] Multiplier for bond changes with strangers when the change is positive, default 1.0
 * 
 * I don't see why anyone would use this preset other than for testing
 *
 * @property {FSSBase} value
 */


/**
 * @param {any} value 
 * @param {any} defaultValue 
 * @returns 
 */
function valueOrDefault(value, defaultValue) {
    return value !== undefined ? value : defaultValue;
}

/**
 * 
 * @param {FSS4DCreepyOptions} creepyOptions 
 */
function convertCreepyOptionsToStandardOptions(creepyOptions) {
    /**
     * @type {FSS4DOptions}
     */
    const standardOptions = {
        ...creepyOptions,
        type: "4d_standard",
        foe_n100_n50: {
            deepInLove_50_100: creepyOptions.foe_n100_n50.sexualAbuseInterest_50_100,
            strongRomanticInterest_35_50: creepyOptions.foe_n100_n50.stalkingInterest_35_50,
            romanticInterest_20_35: creepyOptions.foe_n100_n50.obsessiveInterest_20_35,
            slightRomanticInterest_10_20: creepyOptions.foe_n100_n50.creepyInterest_10_20,
            noRomanticInterest_0_10: creepyOptions.foe_n100_n50.noRomance_0_10,
        },
        hostile_n50_n35: {
            deepInLove_50_100: creepyOptions.hostile_n50_n35.sexualAbuseInterest_50_100,
            strongRomanticInterest_35_50: creepyOptions.hostile_n50_n35.stalkingInterest_35_50,
            romanticInterest_20_35: creepyOptions.hostile_n50_n35.obsessiveInterest_20_35,
            slightRomanticInterest_10_20: creepyOptions.hostile_n50_n35.creepyInterest_10_20,
            noRomanticInterest_0_10: creepyOptions.hostile_n50_n35.noRomance_0_10,
        },
        antagonistic_n35_n20: {
            deepInLove_50_100: creepyOptions.antagonistic_n35_n20.sexualAbuseInterest_50_100,
            strongRomanticInterest_35_50: creepyOptions.antagonistic_n35_n20.stalkingInterest_35_50,
            romanticInterest_20_35: creepyOptions.antagonistic_n35_n20.obsessiveInterest_20_35,
            slightRomanticInterest_10_20: creepyOptions.antagonistic_n35_n20.creepyInterest_10_20,
            noRomanticInterest_0_10: creepyOptions.antagonistic_n35_n20.noRomance_0_10,
        },
        unfriendly_n20_n10: {
            deepInLove_50_100: creepyOptions.unfriendly_n20_n10.sexualAbuseInterest_50_100,
            strongRomanticInterest_35_50: creepyOptions.unfriendly_n20_n10.stalkingInterest_35_50,
            romanticInterest_20_35: creepyOptions.unfriendly_n20_n10.obsessiveInterest_20_35,
            slightRomanticInterest_10_20: creepyOptions.unfriendly_n20_n10.creepyInterest_10_20,
            noRomanticInterest_0_10: creepyOptions.unfriendly_n20_n10.noRomance_0_10,
        },
        unpleasant_n10_0: {
            deepInLove_50_100: creepyOptions.unpleasant_n10_0.sexualAbuseInterest_50_100,
            strongRomanticInterest_35_50: creepyOptions.unpleasant_n10_0.stalkingInterest_35_50,
            romanticInterest_20_35: creepyOptions.unpleasant_n10_0.obsessiveInterest_20_35,
            slightRomanticInterest_10_20: creepyOptions.unpleasant_n10_0.creepyInterest_10_20,
            noRomanticInterest_0_10: creepyOptions.unpleasant_n10_0.noRomance_0_10,
        },
        acquaintance_0_10: {
            deepInLove_50_100: creepyOptions.acquaintance_0_10.sexualAbuseInterest_50_100,
            strongRomanticInterest_35_50: creepyOptions.acquaintance_0_10.stalkingInterest_35_50,
            romanticInterest_20_35: creepyOptions.acquaintance_0_10.obsessiveInterest_20_35,
            slightRomanticInterest_10_20: creepyOptions.acquaintance_0_10.creepyInterest_10_20,
            noRomanticInterest_0_10: creepyOptions.acquaintance_0_10.noRomance_0_10,
        },
        friendly_10_20: {
            deepInLove_50_100: creepyOptions.friendly_10_20.sexualAbuseInterest_50_100,
            strongRomanticInterest_35_50: creepyOptions.friendly_10_20.stalkingInterest_35_50,
            romanticInterest_20_35: creepyOptions.friendly_10_20.obsessiveInterest_20_35,
            slightRomanticInterest_10_20: creepyOptions.friendly_10_20.creepyInterest_10_20,
            noRomanticInterest_0_10: creepyOptions.friendly_10_20.noRomance_0_10,
        },
        goodFriend_20_35: {
            deepInLove_50_100: creepyOptions.goodFriend_20_35.sexualAbuseInterest_50_100,
            strongRomanticInterest_35_50: creepyOptions.goodFriend_20_35.stalkingInterest_35_50,
            romanticInterest_20_35: creepyOptions.goodFriend_20_35.obsessiveInterest_20_35,
            slightRomanticInterest_10_20: creepyOptions.goodFriend_20_35.creepyInterest_10_20,
            noRomanticInterest_0_10: creepyOptions.goodFriend_20_35.noRomance_0_10,
        },
        closeFriend_35_50: {
            deepInLove_50_100: creepyOptions.closeFriend_35_50.sexualAbuseInterest_50_100,
            strongRomanticInterest_35_50: creepyOptions.closeFriend_35_50.stalkingInterest_35_50,
            romanticInterest_20_35: creepyOptions.closeFriend_35_50.obsessiveInterest_20_35,
            slightRomanticInterest_10_20: creepyOptions.closeFriend_35_50.creepyInterest_10_20,
            noRomanticInterest_0_10: creepyOptions.closeFriend_35_50.noRomance_0_10,
        },
        bestFriend_50_100: {
            deepInLove_50_100: creepyOptions.bestFriend_50_100.sexualAbuseInterest_50_100,
            strongRomanticInterest_35_50: creepyOptions.bestFriend_50_100.stalkingInterest_35_50,
            romanticInterest_20_35: creepyOptions.bestFriend_50_100.obsessiveInterest_20_35,
            slightRomanticInterest_10_20: creepyOptions.bestFriend_50_100.creepyInterest_10_20,
            noRomanticInterest_0_10: creepyOptions.bestFriend_50_100.noRomance_0_10,
        },
    }

    return standardOptions;
}

/**
 * @type {Array<[string, number, number]>}
 */
const RANGES = [
    ["foe_n100_n50", -100, -50],
    ["hostile_n50_n35", -50, -35],
    ["antagonistic_n35_n20", -35, -20],
    ["unfriendly_n20_n10", -20, -10],
    ["unpleasant_n10_0", -10, 0],
    ["acquaintance_0_10", 0, 10],
    ["friendly_10_20", 10, 20],
    ["goodFriend_20_35", 20, 35],
    ["closeFriend_35_50", 35, 50],
    ["bestFriend_50_100", 50, 100],
];

/**
 * @type {Array<[string, number, number]>}
 */
const SECOND_RANGES = [
    ["noRomanticInterest_0_10", 0, 10],
    ["slightRomanticInterest_10_20", 10, 20],
    ["romanticInterest_20_35", 20, 35],
    ["strongRomanticInterest_35_50", 35, 50],
    ["deepInLove_50_100", 50, 100],
];

engine.exports = {
    type: "misc",
    description: "A complex 4 dimensional bond system with a lot of fine tuning, designed for SFW and NSFW characters alike.",
    exposeProperties: {},

    /**
     * @param {DEObject} DE
     * @param {DECompleteCharacterReference} character
     * @param {FSS4DOptions | FSS4DCreepyOptions | FSS3DAceOptions | FSS3DNoFamilyOptions | FSS2DAceNoFamilyOptions | FSS1DAceNoStrangersNoFamilyOptions | FSS0DTesting} options
     */
    setup(DE, character, options) {
        const is4D = options.type === "4d_standard" || options.type === "4d_creepy";

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
            descriptionGeneralInjection: options.type === "1d_ace_no_strangers_no_family" || options.type === "2d_ace_no_family" || options.type === "3d_ace" ? (
                DE.utils.newHandlebarsTemplate(DE, options.asexualAromanticDescriptionTemplate || "{{char}} is an asexual and aromantic individual and does not form romantic or sexual bonds with others, {{char}} will react negatively to any attempts to form or force such bonds.")
            ) : null,
        };

        if (is4D || options.type === "3d_ace" || options.type === "3d_no_family" || options.type === "2d_ace_no_family") {
            character.bonds.declarations.push({
                name: `${options.type}_strangerBad_n100_n5`,
                description: options.strangerBad_n100_n5.description,
                relationshipName: options.strangerBad_n100_n5.relationshipName,
                minBondLevel: -100,
                maxBondLevel: -5,
                min2BondLevel: 0,
                max2BondLevel: 100,
                strangerBond: true,
                familyBond: false,
                bondAdditionalDescription: options.strangerBad_n100_n5.bondAdditionalDescription,
                generalCharacterDescriptionInjection: options.strangerBad_n100_n5.generalCharacterDescriptionInjection,
                generalCharacterDescriptionInjectionEx: options.strangerBad_n100_n5.generalCharacterDescriptionInjectionEx,
            });

            character.bonds.declarations.push({
                name: `${options.type}_strangerNeutral_n5_5`,
                description: options.strangerNeutral_n5_5.description,
                relationshipName: options.strangerNeutral_n5_5.relationshipName,
                minBondLevel: -5,
                maxBondLevel: 5,
                min2BondLevel: 0,
                max2BondLevel: 100,
                strangerBond: true,
                familyBond: false,
                bondAdditionalDescription: options.strangerNeutral_n5_5.bondAdditionalDescription,
                generalCharacterDescriptionInjection: options.strangerNeutral_n5_5.generalCharacterDescriptionInjection,
                generalCharacterDescriptionInjectionEx: options.strangerNeutral_n5_5.generalCharacterDescriptionInjectionEx,
            });

            character.bonds.declarations.push({
                name: `${options.type}_strangerGood_5_100`,
                description: options.strangerGood_5_100.description,
                relationshipName: options.strangerGood_5_100.relationshipName,
                minBondLevel: 5,
                maxBondLevel: 100,
                min2BondLevel: 0,
                max2BondLevel: 100,
                strangerBond: true,
                familyBond: false,
                bondAdditionalDescription: options.strangerGood_5_100.bondAdditionalDescription,
                generalCharacterDescriptionInjection: options.strangerGood_5_100.generalCharacterDescriptionInjection,
                generalCharacterDescriptionInjectionEx: options.strangerGood_5_100.generalCharacterDescriptionInjectionEx,
            });
        }

        if (is4D) {
            const standardForm = options.type === "4d_creepy" ? convertCreepyOptionsToStandardOptions(options) : options;

            for (const [bondName, min, max] of RANGES) {
                for (const [secondaryBondName, secondaryMin, secondaryMax] of SECOND_RANGES) {
                    for (const familyStatus of ["family", "nonFamily"]) {
                        /**
                         * @type {FSSBase}
                         */
                        const baseRule =
                            // @ts-ignore
                            standardForm[bondName][secondaryBondName][familyStatus];

                        character.bonds.declarations.push({
                            name: `${options.type}_${bondName}_${secondaryBondName}_non_stranger_${familyStatus}`,
                            description: baseRule.description,
                            relationshipName: baseRule.relationshipName,
                            minBondLevel: min,
                            maxBondLevel: max,
                            min2BondLevel: secondaryMin,
                            max2BondLevel: secondaryMax,
                            strangerBond: false,
                            familyBond: familyStatus === "family",
                            bondAdditionalDescription: baseRule.bondAdditionalDescription,
                            generalCharacterDescriptionInjection: baseRule.generalCharacterDescriptionInjection,
                            generalCharacterDescriptionInjectionEx: baseRule.generalCharacterDescriptionInjectionEx,
                        });
                    }
                }
            }
        } else if (options.type === "3d_ace") {
            for (const [bondName, min, max] of RANGES) {
                for (const familyStatus of ["family", "nonFamily"]) {
                    /**
                     * @type {FSSBase}
                     */
                    const baseRule =
                        // @ts-ignore
                        options[bondName][familyStatus];

                    character.bonds.declarations.push({
                        name: `${options.type}_${bondName}_non_stranger_${familyStatus}`,
                        description: baseRule.description,
                        relationshipName: baseRule.relationshipName,
                        minBondLevel: min,
                        maxBondLevel: max,
                        min2BondLevel: 0,
                        max2BondLevel: 100,
                        strangerBond: false,
                        familyBond: familyStatus === "family",
                        bondAdditionalDescription: baseRule.bondAdditionalDescription,
                        generalCharacterDescriptionInjection: baseRule.generalCharacterDescriptionInjection,
                        generalCharacterDescriptionInjectionEx: baseRule.generalCharacterDescriptionInjectionEx,
                    });
                }
            }
        } else if (options.type === "3d_no_family") {
            for (const [bondName, min, max] of RANGES) {
                for (const [secondaryBondName, secondaryMin, secondaryMax] of SECOND_RANGES) {
                    /**
                     * @type {FSSBase}
                     */
                    const baseRule =
                        // @ts-ignore
                        options[bondName][secondaryBondName];

                    character.bonds.declarations.push({
                        name: `${options.type}_${bondName}_${secondaryBondName}_non_stranger`,
                        description: baseRule.description,
                        relationshipName: baseRule.relationshipName,
                        minBondLevel: min,
                        maxBondLevel: max,
                        min2BondLevel: secondaryMin,
                        max2BondLevel: secondaryMax,
                        strangerBond: false,
                        familyBond: false,
                        bondAdditionalDescription: baseRule.bondAdditionalDescription,
                        generalCharacterDescriptionInjection: baseRule.generalCharacterDescriptionInjection,
                        generalCharacterDescriptionInjectionEx: baseRule.generalCharacterDescriptionInjectionEx,
                    });
                }
            }
        } else if (options.type === "2d_ace_no_family") {
            for (const [bondName, min, max] of RANGES) {
                /**
                 * @type {FSSBase}
                 */
                const baseRule =
                    // @ts-ignore
                    options[bondName][strangerStatus];

                character.bonds.declarations.push({
                    name: `${options.type}_${bondName}_non_stranger`,
                    description: baseRule.description,
                    relationshipName: baseRule.relationshipName,
                    minBondLevel: min,
                    maxBondLevel: max,
                    min2BondLevel: 0,
                    max2BondLevel: 100,
                    strangerBond: false,
                    familyBond: false,
                    bondAdditionalDescription: baseRule.bondAdditionalDescription,
                    generalCharacterDescriptionInjection: baseRule.generalCharacterDescriptionInjection,
                    generalCharacterDescriptionInjectionEx: baseRule.generalCharacterDescriptionInjectionEx,
                });
            }
        } else if (options.type === "1d_ace_no_strangers_no_family") {
            for (const [bondName, min, max] of RANGES) {
                /**
                 * @type {FSSBase}
                 */
                const baseRule =
                    // @ts-ignore
                    options[bondName];

                character.bonds.declarations.push({
                    name: `${options.type}_${bondName}`,
                    description: baseRule.description,
                    relationshipName: baseRule.relationshipName,
                    minBondLevel: min,
                    maxBondLevel: max,
                    min2BondLevel: 0,
                    max2BondLevel: 100,
                    strangerBond: false,
                    familyBond: false,
                    bondAdditionalDescription: baseRule.bondAdditionalDescription,
                    generalCharacterDescriptionInjection: baseRule.generalCharacterDescriptionInjection,
                    generalCharacterDescriptionInjectionEx: baseRule.generalCharacterDescriptionInjectionEx,
                });

                character.bonds.declarations.push({
                    name: `${options.type}_${bondName}_stranger`,
                    description: baseRule.description,
                    relationshipName: baseRule.relationshipName,
                    minBondLevel: min,
                    maxBondLevel: max,
                    min2BondLevel: 0,
                    max2BondLevel: 100,
                    strangerBond: true,
                    familyBond: false,
                    bondAdditionalDescription: baseRule.bondAdditionalDescription,
                    generalCharacterDescriptionInjection: baseRule.generalCharacterDescriptionInjection,
                    generalCharacterDescriptionInjectionEx: baseRule.generalCharacterDescriptionInjectionEx,
                });
            }
        } else if (options.type === "0d_testing") {
            const baseRule = options.value;

            character.bonds.declarations.push({
                name: `${options.type}_default`,
                description: baseRule.description,
                relationshipName: baseRule.relationshipName,
                minBondLevel: -100,
                maxBondLevel: 100,
                min2BondLevel: 0,
                max2BondLevel: 100,
                strangerBond: false,
                familyBond: false,
                bondAdditionalDescription: baseRule.bondAdditionalDescription,
                generalCharacterDescriptionInjection: baseRule.generalCharacterDescriptionInjection,
                generalCharacterDescriptionInjectionEx: baseRule.generalCharacterDescriptionInjectionEx,
            });

            character.bonds.declarations.push({
                name: `${options.type}_stranger`,
                description: baseRule.description,
                relationshipName: baseRule.relationshipName,
                minBondLevel: -100,
                maxBondLevel: 100,
                min2BondLevel: 0,
                max2BondLevel: 100,
                strangerBond: true,
                familyBond: false,
                bondAdditionalDescription: baseRule.bondAdditionalDescription,
                generalCharacterDescriptionInjection: baseRule.generalCharacterDescriptionInjection,
                generalCharacterDescriptionInjectionEx: baseRule.generalCharacterDescriptionInjectionEx,
            });
        }

        return character;
    }
}
