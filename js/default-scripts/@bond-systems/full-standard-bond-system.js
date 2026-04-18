/**
 * A complex 4 dimensional bond system with a lot of fine tuning, designed for SFW and NSFW characters alike
 */

/**
 * @typedef {Object} FSSBase
 * @property {DEStringTemplateCharAndOther} description The template to use for this bond definition, should include {{char}} and {{other}} as placeholders and {{other_family_relation}} if family ties are relevant
 * @property {DEStringTemplateCharAndOther|null} relationshipName The relationship name, should be one word, eg. friend, lover, colleague, etc... this is used for reasoning about the relationship and for the character to refer to the other character in the relationship, for example, if the relationship name is "friend", the character may refer to the other character as "my friend" or just "friend" when talking about them
 * @property {DEStringTemplateCharAndOther} [bondAdditionalDescription] additional description to be added to the bond description
 * @property {DEStringTemplateCharAndOther} [generalCharacterDescriptionInjection] A template that can be injected into the general character description when this bond declaration is active, it will have access to the same variables as the description, but it is meant to be a smaller piece of text that can be added to the general description when relevant, instead of being the main description of the bond level.
 * @property {DEStringTemplateCharAndOther} [generalCharacterDescriptionInjectionEx] Similar to generalCharacterDescriptionInjection but it will only be injected in the general character description and not in the bond description, this is useful for cases where the information is relevant for the character description but not for the bond description, for example if you want to add a sentence about how the character's family relationship with the other character affects their behavior towards them, you might want that to be in the general description injection but not in the bond description, since the bond description might be focused on romantic feelings and the family relationship might not be relevant for that.
 * @property {(DE: DEObject, char: DECompleteCharacterReference, other: DECompleteCharacterReference) => Promise<{value: boolean | string, reason?: string}>} openToAffection
 * @property {(DE: DEObject, char: DECompleteCharacterReference, other: DECompleteCharacterReference) => Promise<{value: boolean | string, reason?: string}>} openToIntimateAffection
 * @property {(DE: DEObject, char: DECompleteCharacterReference, other: DECompleteCharacterReference) => Promise<{value: boolean | string, reason?: string}>} openToSex
 * @property {(DE: DEObject, char: DECompleteCharacterReference, other: DECompleteCharacterReference) => Promise<{probability: number, options?: string[]}>} proneToInitiatingAffection
 * @property {(DE: DEObject, char: DECompleteCharacterReference, other: DECompleteCharacterReference) => Promise<{probability: number, options?: string[]}>} proneToInitiatingIntimateAffection
 * @property {(DE: DEObject, char: DECompleteCharacterReference, other: DECompleteCharacterReference) => Promise<{probability: number, options?: string[]}>} proneToInitiatingSex
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
 * @property {boolean} familyCreepy Whether family ties should be treated as creepy, default false, if true, the bond definitions for family members will be the ones in the "family" property of the love definitions, if false, they will be the ones in the "nonFamily" property
 * 
 * @property {number} [bondChangeFineTune] Multiplier for bond changes, default 1
 * @property {number} [bondChangeNegativityBias] Multiplier for negative bond changes, default 1.5
 * @property {number} [strangerBreakawayBondWeightAbsolute] Absolute bond weight threshold for strangers to break away, default 10
 * @property {number} [strangerBreakawayInteractionsCount] Number of interactions with a stranger after which they can break away, default 30
 * @property {number} [strangerBreakawayTimeMinutes] Time in minutes after which a stranger can break away, default 30
 * @property {number} [strangerNegativeMultiplier] Multiplier for bond changes with strangers when the change is negative, default 1.5
 * @property {number} [strangerPositiveMultiplier] Multiplier for bond changes with strangers when the change is positive, default 1.0
 * @property {number} [neutralInteractionBondChange] number to add on a bond on a neutral interaction, does not apply to anything above bond graduation of unfriendly or friend, it maxes there, default 0.5
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
 * @property {number} [neutralInteractionBondChange] number to add on a bond on a neutral interaction, does not apply to anything above bond graduation of unfriendly or friend, it maxes there, default 0.5
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
        familyCreepy: true,
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
     * @param {FSS4DOptions | FSS4DCreepyOptions} options
     */
    setup(DE, character, options) {
        character.bonds = {
            system: "STANDARD_FULL",
            bond2DoesNotTrackAttraction: options.type === "4d_creepy",
            // @ts-ignore
            bond2DoesNotTrackAttractionForFamily: options.type === "4d_creepy" || (options.familyCreepy === true),
            bondChangeFineTune: valueOrDefault(options.bondChangeFineTune, 1), // Multiplier for bond changes
            bondChangeNegativityBias: valueOrDefault(options.bondChangeNegativityBias, 1.5),
            declarations: [],
            strangerBreakawayBondWeightAbsolute: valueOrDefault(options.strangerBreakawayBondWeightAbsolute, 10),
            strangerBreakawayInteractionsCount: valueOrDefault(options.strangerBreakawayInteractionsCount, 30),
            strangerBreakawayTimeMinutes: valueOrDefault(options.strangerBreakawayTimeMinutes, 30),
            strangerNegativeMultiplier: valueOrDefault(options.strangerNegativeMultiplier, 1.5),
            strangerPositiveMultiplier: valueOrDefault(options.strangerPositiveMultiplier, 1.0),
            descriptionGeneralInjection: null,
            bond2Graduation: {
                slight: 10,
                moderate: 20,
                strong: 35,
            },
            bondGraduation: {
                foe: -100,
                hostile: -50,
                antagonistic: -35,
                unfriendly: -20,
                unpleasant: -10,
                acquaintance: 0,
                friend: 10,
                goodFriend: 20,
                closeFriend: 35,
                bestFriend: 50,
            },
            neutralInteractionBondChange: valueOrDefault(options.neutralInteractionBondChange, 0.5), // number to add on a bond on a neutral interaction, does not apply to anything above bond graduation of unfriendly or friend, it maxes there
        };

        {
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
                intimacy: {
                    openToAffection: options.strangerBad_n100_n5.openToAffection,
                    openToIntimateAffection: options.strangerBad_n100_n5.openToIntimateAffection,
                    openToSex: options.strangerBad_n100_n5.openToSex,
                    proneToInitiatingAffection: options.strangerBad_n100_n5.proneToInitiatingAffection,
                    proneToInitiatingIntimateAffection: options.strangerBad_n100_n5.proneToInitiatingIntimateAffection,
                    proneToInitiatingSex: options.strangerBad_n100_n5.proneToInitiatingSex,
                },
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
                intimacy: {
                    openToAffection: options.strangerNeutral_n5_5.openToAffection,
                    openToIntimateAffection: options.strangerNeutral_n5_5.openToIntimateAffection,
                    openToSex: options.strangerNeutral_n5_5.openToSex,
                    proneToInitiatingAffection: options.strangerNeutral_n5_5.proneToInitiatingAffection,
                    proneToInitiatingIntimateAffection: options.strangerNeutral_n5_5.proneToInitiatingIntimateAffection,
                    proneToInitiatingSex: options.strangerNeutral_n5_5.proneToInitiatingSex,
                },
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
                intimacy: {
                    openToAffection: options.strangerGood_5_100.openToAffection,
                    openToIntimateAffection: options.strangerGood_5_100.openToIntimateAffection,
                    openToSex: options.strangerGood_5_100.openToSex,
                    proneToInitiatingAffection: options.strangerGood_5_100.proneToInitiatingAffection,
                    proneToInitiatingIntimateAffection: options.strangerGood_5_100.proneToInitiatingIntimateAffection,
                    proneToInitiatingSex: options.strangerGood_5_100.proneToInitiatingSex,
                },
            });
        }

        {
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
                            intimacy: {
                                openToAffection: baseRule.openToAffection,
                                openToIntimateAffection: baseRule.openToIntimateAffection,
                                openToSex: baseRule.openToSex,
                                proneToInitiatingAffection: baseRule.proneToInitiatingAffection,
                                proneToInitiatingIntimateAffection: baseRule.proneToInitiatingIntimateAffection,
                                proneToInitiatingSex: baseRule.proneToInitiatingSex,
                            },
                        });
                    }
                }
            }
        }

        return character;
    }
}
