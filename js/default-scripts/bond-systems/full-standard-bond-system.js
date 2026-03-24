/**
 * A complex 4 dimensional bond system with a lot of fine tuning, designed for SFW and NSFW characters alike
 */

/**
 * @typedef {Object} FSSBase
 * @property {string} description The template to use for this bond definition, should include {{char}} and {{other}} as placeholders and {{other_family_relation}} if family ties are relevant
 * @property {Array<DEBondIncreaseDecreaseQuestion>} bondIncreaseQuestions An array of questions to ask, to determine how much the bond should increase
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
 * @typedef {Object} FSSByStranger
 * @property {FSSByFamilyTie} stranger
 * @property {FSSByFamilyTie} nonStranger
 */

/**
 * @typedef {Object} FSSByStrangerNoFamily
 * @property {FSSBase} stranger
 * @property {FSSBase} nonStranger
 */

/**
 * @typedef {Object} FSSLoveDefinition
 * @property {FSSByStranger} deepInLove
 * @property {FSSByStranger} strongRomanticInterest
 * @property {FSSByStranger} romanticInterest
 * @property {FSSByStranger} slightRomanticInterest
 * @property {FSSByStranger} noRomanticInterest
 */

/**
 * @typedef {Object} FSSLoveDefinitionNoFamily
 * @property {FSSByStrangerNoFamily} deepInLove
 * @property {FSSByStrangerNoFamily} strongRomanticInterest
 * @property {FSSByStrangerNoFamily} romanticInterest
 * @property {FSSByStrangerNoFamily} slightRomanticInterest
 * @property {FSSByStrangerNoFamily} noRomanticInterest
 */

/**
 * @typedef {Object} FSSCreepyLoveDefinition
 * @property {FSSByStranger} sexualAbuseInterest
 * @property {FSSByStranger} stalkingInterest
 * @property {FSSByStranger} obsessiveInterest
 * @property {FSSByStranger} creepyInterest
 * @property {FSSByStranger} noRomance
 */

/**
 * @typedef {Object} FSS4DOptions
 * 
 * @property {"4d_standard"} type
 * 
 * @property {number} bondChangeFineTune Multiplier for bond changes, default 1
 * @property {number} bondChangeNegativityBias Multiplier for negative bond changes, default 1.5
 * @property {number} strangerBreakawayBondWeightAbsolute Absolute bond weight threshold for strangers to break away, default 10
 * @property {number} strangerBreakawayInteractionsCount Number of interactions with a stranger after which they can break away, default 30
 * @property {number} strangerBreakawayTimeMinutes Time in minutes after which a stranger can break away, default 30
 * @property {number} strangerNegativeMultiplier Multiplier for bond changes with strangers when the change is negative, default 1.5
 * @property {number} strangerPositiveMultiplier Multiplier for bond changes with strangers when the change is positive, default 1.0
 * 
 * @property {FSSLoveDefinition} foe
 * @property {FSSLoveDefinition} hostile
 * @property {FSSLoveDefinition} antagonistic
 * @property {FSSLoveDefinition} unfriendly
 * @property {FSSLoveDefinition} unpleasant
 * @property {FSSLoveDefinition} acquaintance
 * @property {FSSLoveDefinition} friendly
 * @property {FSSLoveDefinition} goodFriend
 * @property {FSSLoveDefinition} closeFriend
 * @property {FSSLoveDefinition} bestFriend
 */

/**
 * @typedef {Object} FSS4DCreepyOptions
 * @property {"4d_creepy"} type
 * 
 * @property {number} bondChangeFineTune Multiplier for bond changes, default 1
 * @property {number} bondChangeNegativityBias Multiplier for negative bond changes, default 1.5
 * @property {number} strangerBreakawayBondWeightAbsolute Absolute bond weight threshold for strangers to break away, default 10
 * @property {number} strangerBreakawayInteractionsCount Number of interactions with a stranger after which they can break away, default 30
 * @property {number} strangerBreakawayTimeMinutes Time in minutes after which a stranger can break away, default 30
 * @property {number} strangerNegativeMultiplier Multiplier for bond changes with strangers when the change is negative, default 1.5
 * @property {number} strangerPositiveMultiplier Multiplier for bond changes with strangers when the change is positive, default 1.0
 * 
 * @property {FSSCreepyLoveDefinition} foe
 * @property {FSSCreepyLoveDefinition} hostile
 * @property {FSSCreepyLoveDefinition} antagonistic
 * @property {FSSCreepyLoveDefinition} unfriendly
 * @property {FSSCreepyLoveDefinition} unpleasant
 * @property {FSSCreepyLoveDefinition} acquaintance
 * @property {FSSCreepyLoveDefinition} friendly
 * @property {FSSCreepyLoveDefinition} goodFriend
 * @property {FSSCreepyLoveDefinition} closeFriend
 * @property {FSSCreepyLoveDefinition} bestFriend
 */

/**
 * @typedef {Object} FSS3DAceOptions
 * @property {"3d_ace"} type
 * 
 * @property {number} bondChangeFineTune Multiplier for bond changes, default 1
 * @property {number} bondChangeNegativityBias Multiplier for negative bond changes, default 1.5
 * @property {number} strangerBreakawayBondWeightAbsolute Absolute bond weight threshold for strangers to break away, default 10
 * @property {number} strangerBreakawayInteractionsCount Number of interactions with a stranger after which they can break away, default 30
 * @property {number} strangerBreakawayTimeMinutes Time in minutes after which a stranger can break away, default 30
 * @property {number} strangerNegativeMultiplier Multiplier for bond changes with strangers when the change is negative, default 1.5
 * @property {number} strangerPositiveMultiplier Multiplier for bond changes with strangers when the change is positive, default 1.0
 * 
 * This is a special preset for asexual and aromantic characters, it will make the character react negatively to any bond attempts and will not form romantic or sexual bonds with anyone, but it can still have the regular bonds of the standard system, just with negative reactions to any attempts to increase them.
 * 
 * @property {string} [asexualAromanticDescriptionTemplate] A template for describing the character's asexual and aromantic nature, it is injected in the description of the character and only includes {{char}}
 * 
 * @property {FSSByStranger} foe
 * @property {FSSByStranger} hostile
 * @property {FSSByStranger} antagonistic
 * @property {FSSByStranger} unfriendly
 * @property {FSSByStranger} unpleasant
 * @property {FSSByStranger} acquaintance
 * @property {FSSByStranger} friendly
 * @property {FSSByStranger} goodFriend
 * @property {FSSByStranger} closeFriend
 * @property {FSSByStranger} bestFriend
 */

/**
 * @typedef {Object} FSS3DNoFamilyOptions
 * @property {"3d_no_family"} type
 * 
 * @property {number} bondChangeFineTune Multiplier for bond changes, default 1
 * @property {number} bondChangeNegativityBias Multiplier for negative bond changes, default 1.5
 * @property {number} strangerBreakawayBondWeightAbsolute Absolute bond weight threshold for strangers to break away, default 10
 * @property {number} strangerBreakawayInteractionsCount Number of interactions with a stranger after which they can break away, default 30
 * @property {number} strangerBreakawayTimeMinutes Time in minutes after which a stranger can break away, default 30
 * @property {number} strangerNegativeMultiplier Multiplier for bond changes with strangers when the change is negative, default 1.5
 * @property {number} strangerPositiveMultiplier Multiplier for bond changes with strangers when the change is positive, default 1.0
 * 
 *
 * @property {FSSLoveDefinitionNoFamily} foe
 * @property {FSSLoveDefinitionNoFamily} hostile
 * @property {FSSLoveDefinitionNoFamily} antagonistic
 * @property {FSSLoveDefinitionNoFamily} unfriendly
 * @property {FSSLoveDefinitionNoFamily} unpleasant
 * @property {FSSLoveDefinitionNoFamily} acquaintance
 * @property {FSSLoveDefinitionNoFamily} friendly
 * @property {FSSLoveDefinitionNoFamily} goodFriend
 * @property {FSSLoveDefinitionNoFamily} closeFriend
 * @property {FSSLoveDefinitionNoFamily} bestFriend
 */

/**
 * @typedef {Object} FSS2DAceNoFamilyOptions
 * @property {"2d_ace_no_family"} type
 * 
 * @property {number} bondChangeFineTune Multiplier for bond changes, default 1
 * @property {number} bondChangeNegativityBias Multiplier for negative bond changes, default 1.5
 * @property {number} strangerBreakawayBondWeightAbsolute Absolute bond weight threshold for strangers to break away, default 10
 * @property {number} strangerBreakawayInteractionsCount Number of interactions with a stranger after which they can break away, default 30
 * @property {number} strangerBreakawayTimeMinutes Time in minutes after which a stranger can break away, default 30
 * @property {number} strangerNegativeMultiplier Multiplier for bond changes with strangers when the change is negative, default 1.5
 * @property {number} strangerPositiveMultiplier Multiplier for bond changes with strangers when the change is positive, default 1.0
 * 
 * This is a special preset for asexual and aromantic characters, it will make the character react negatively to any bond attempts and will not form romantic or sexual bonds with anyone, but it can still have the regular bonds of the standard system, just with negative reactions to any attempts to increase them.
 * 
 * @property {string} [asexualAromanticDescriptionTemplate] A template for describing the character's asexual and aromantic nature, it is injected in the description of the character and only includes {{char}}
 *
 * @property {FSSByStrangerNoFamily} foe
 * @property {FSSByStrangerNoFamily} hostile
 * @property {FSSByStrangerNoFamily} antagonistic
 * @property {FSSByStrangerNoFamily} unfriendly
 * @property {FSSByStrangerNoFamily} unpleasant
 * @property {FSSByStrangerNoFamily} acquaintance
 * @property {FSSByStrangerNoFamily} friendly
 * @property {FSSByStrangerNoFamily} goodFriend
 * @property {FSSByStrangerNoFamily} closeFriend
 * @property {FSSByStrangerNoFamily} bestFriend
 */

/**
 * @typedef {Object} FSS1DAceNoStrangersNoFamilyOptions
 * @property {"1d_ace_no_strangers_no_family"} type
 * 
 * @property {number} bondChangeFineTune Multiplier for bond changes, default 1
 * @property {number} bondChangeNegativityBias Multiplier for negative bond changes, default 1.5
 * @property {number} strangerBreakawayBondWeightAbsolute Absolute bond weight threshold for strangers to break away, default 10
 * @property {number} strangerBreakawayInteractionsCount Number of interactions with a stranger after which they can break away, default 30
 * @property {number} strangerBreakawayTimeMinutes Time in minutes after which a stranger can break away, default 30
 * @property {number} strangerNegativeMultiplier Multiplier for bond changes with strangers when the change is negative, default 1.5
 * @property {number} strangerPositiveMultiplier Multiplier for bond changes with strangers when the change is positive, default 1.0
 * 
 * This is a special preset for asexual and aromantic characters, it will make the character react negatively to any bond attempts and will not form romantic or sexual bonds with anyone, but it can still have the regular bonds of the standard system, just with negative reactions to any attempts to increase them.
 * 
 * @property {string} [asexualAromanticDescriptionTemplate] A template for describing the character's asexual and aromantic nature, it is injected in the description of the character and only includes {{char}}
 *
 * @property {FSSBase} foe
 * @property {FSSBase} hostile
 * @property {FSSBase} antagonistic
 * @property {FSSBase} unfriendly
 * @property {FSSBase} unpleasant
 * @property {FSSBase} acquaintance
 * @property {FSSBase} friendly
 * @property {FSSBase} goodFriend
 * @property {FSSBase} closeFriend
 * @property {FSSBase} bestFriend
 */

/**
 * @typedef {Object} FSS0DTesting
 * @property {"0d_testing"} type
 * 
 * @property {number} bondChangeFineTune Multiplier for bond changes, default 1
 * @property {number} bondChangeNegativityBias Multiplier for negative bond changes, default 1.5
 * @property {number} strangerBreakawayBondWeightAbsolute Absolute bond weight threshold for strangers to break away, default 10
 * @property {number} strangerBreakawayInteractionsCount Number of interactions with a stranger after which they can break away, default 30
 * @property {number} strangerBreakawayTimeMinutes Time in minutes after which a stranger can break away, default 30
 * @property {number} strangerNegativeMultiplier Multiplier for bond changes with strangers when the change is negative, default 1.5
 * @property {number} strangerPositiveMultiplier Multiplier for bond changes with strangers when the change is positive, default 1.0
 * 
 * I don't see why anyone would use this preset other than for testing
 *
 * @property {FSSBase} value
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

/**
 * @type {Array<[string, number, number]>}
 */
const RANGES = [
    ["foe", -100, -50],
    ["hostile", -50, -35],
    ["antagonistic", -35, -20],
    ["unfriendly", -20, -10],
    ["unpleasant", -10, 0],
    ["acquaintance", 0, 10],
    ["friendly", 10, 20],
    ["goodFriend", 20, 35],
    ["closeFriend", 35, 50],
    ["bestFriend", 50, 100],
];

/**
 * @type {Array<[string, number, number]>}
 */
const SECOND_RANGES = [
    ["noRomanticInterest", 0, 10],
    ["slightRomanticInterest", 10, 20],
    ["romanticInterest", 20, 35],
    ["strongRomanticInterest", 35, 50],
    ["deepInLove", 50, 100],
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

        if (is4D) {
            const standardForm = options.type === "4d_creepy" ? convertCreepyOptionsToStandardOptions(options) : options;

            for (const [bondName, min, max] of RANGES) {
                for (const [secondaryBondName, secondaryMin, secondaryMax] of SECOND_RANGES) {
                    for (const strangerStatus of ["stranger", "nonStranger"]) {
                        for (const familyStatus of ["family", "nonFamily"]) {
                            /**
                             * @type {FSSBase}
                             */
                            const baseRule =
                                // @ts-ignore
                                standardForm[bondName][secondaryBondName][strangerStatus][familyStatus];

                            character.bonds.declarations.push({
                                name: `${options.type}_${bondName}_${secondaryBondName}_${strangerStatus}_${familyStatus}`,
                                description: baseRule.description,
                                bondConditions: baseRule.bondIncreaseQuestions,
                                minBondLevel: min,
                                maxBondLevel: max,
                                min2BondLevel: secondaryMin,
                                max2BondLevel: secondaryMax,
                                strangerBond: strangerStatus === "stranger",
                                familyBond: familyStatus === "family",
                                bondAdditionalDescription: baseRule.bondAdditionalDescription,
                                generalCharacterDescriptionInjection: baseRule.generalCharacterDescriptionInjection,
                                generalCharacterDescriptionInjectionEx: baseRule.generalCharacterDescriptionInjectionEx,
                            });
                        }
                    }
                }
            }
        } else if (options.type === "3d_ace") {
            for (const [bondName, min, max] of RANGES) {
                for (const strangerStatus of ["stranger", "nonStranger"]) {
                    for (const familyStatus of ["family", "nonFamily"]) {
                        /**
                         * @type {FSSBase}
                         */
                        const baseRule =
                            // @ts-ignore
                            options[bondName][strangerStatus][familyStatus];

                        character.bonds.declarations.push({
                            name: `${options.type}_${bondName}_${strangerStatus}_${familyStatus}`,
                            description: baseRule.description,
                            bondConditions: baseRule.bondIncreaseQuestions,
                            minBondLevel: min,
                            maxBondLevel: max,
                            min2BondLevel: 0,
                            max2BondLevel: 100,
                            strangerBond: strangerStatus === "stranger",
                            familyBond: familyStatus === "family",
                            bondAdditionalDescription: baseRule.bondAdditionalDescription,
                            generalCharacterDescriptionInjection: baseRule.generalCharacterDescriptionInjection,
                            generalCharacterDescriptionInjectionEx: baseRule.generalCharacterDescriptionInjectionEx,
                        });
                    }
                }
            }
        } else if (options.type === "3d_no_family") {
            for (const [bondName, min, max] of RANGES) {
                for (const [secondaryBondName, secondaryMin, secondaryMax] of SECOND_RANGES) {
                    for (const strangerStatus of ["stranger", "nonStranger"]) {
                        /**
                         * @type {FSSBase}
                         */
                        const baseRule =
                            // @ts-ignore
                            options[bondName][secondaryBondName][strangerStatus];

                        character.bonds.declarations.push({
                            name: `${options.type}_${bondName}_${secondaryBondName}_${strangerStatus}`,
                            description: baseRule.description,
                            bondConditions: baseRule.bondIncreaseQuestions,
                            minBondLevel: min,
                            maxBondLevel: max,
                            min2BondLevel: secondaryMin,
                            max2BondLevel: secondaryMax,
                            strangerBond: strangerStatus === "stranger",
                            familyBond: false,
                            bondAdditionalDescription: baseRule.bondAdditionalDescription,
                            generalCharacterDescriptionInjection: baseRule.generalCharacterDescriptionInjection,
                            generalCharacterDescriptionInjectionEx: baseRule.generalCharacterDescriptionInjectionEx,
                        });
                    }
                }
            }
        } else if (options.type === "2d_ace_no_family") {
            for (const [bondName, min, max] of RANGES) {
                for (const strangerStatus of ["stranger", "nonStranger"]) {
                    /**
                     * @type {FSSBase}
                     */
                    const baseRule =
                        // @ts-ignore
                        options[bondName][strangerStatus];
                    
                    character.bonds.declarations.push({
                        name: `${options.type}_${bondName}_${strangerStatus}`,
                        description: baseRule.description,
                        bondConditions: baseRule.bondIncreaseQuestions,
                        minBondLevel: min,
                        maxBondLevel: max,
                        min2BondLevel: 0,
                        max2BondLevel: 100,
                        strangerBond: strangerStatus === "stranger",
                        familyBond: false,
                        bondAdditionalDescription: baseRule.bondAdditionalDescription,
                        generalCharacterDescriptionInjection: baseRule.generalCharacterDescriptionInjection,
                        generalCharacterDescriptionInjectionEx: baseRule.generalCharacterDescriptionInjectionEx,
                    });
                }
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
                    bondConditions: baseRule.bondIncreaseQuestions,
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
                    bondConditions: baseRule.bondIncreaseQuestions,
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
                bondConditions: baseRule.bondIncreaseQuestions,
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
                bondConditions: baseRule.bondIncreaseQuestions,
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
    }
}
