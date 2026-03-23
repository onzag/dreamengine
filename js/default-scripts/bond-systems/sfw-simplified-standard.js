/**
 * A simplified standard bond system for SFW characters.
 * It creates a standard bond grid and exposes certain properties, for altering how it functions
 * 
 * This is a very basic implementation for a bond system mostly meant for testing and prototyping.
 * More complex systems should be created and customized per character
 */

engine.exports = {
    type: "character-mechanic",
    description: "A simplified standard bond system for SFW characters.",
    exposeProperties: {
        USE_SFW_SIMPLE_BOND_SYSTEM: {
            propertyLocation: "characters",
            type: "boolean",
            description: "Whether to use the sfw simple bond system for this character.",
        },

        BOND_INCREASE_QUESTION_1: {
            propertyLocation: "characters",
            type: "template",
            description: "A question that, if answered yes, will increase the bond level. {{other}} will be replaced with the other character's name.",
        },
        BOND_INCREASE_QUESTION_2: {
            propertyLocation: "characters",
            type: "template",
            description: "A question that, if answered yes, will increase the bond level. {{other}} will be replaced with the other character's name.",
        },
        BOND_INCREASE_QUESTION_3: {
            propertyLocation: "characters",
            type: "template",
            description: "A question that, if answered yes, will increase the bond level. {{other}} will be replaced with the other character's name.",
        },
        BOND_DECREASE_QUESTION_1: {
            propertyLocation: "characters",
            type: "template",
            description: "A question that, if answered yes, will decrease the bond level. {{other}} will be replaced with the other character's name.",
        },
        BOND_DECREASE_QUESTION_2: {
            propertyLocation: "characters",
            type: "template",
            description: "A question that, if answered yes, will decrease the bond level. {{other}} will be replaced with the other character's name.",
        },
        BOND_DECREASE_QUESTION_3: {
            propertyLocation: "characters",
            type: "template",
            description: "A question that, if answered yes, will decrease the bond level. {{other}} will be replaced with the other character's name.",
        },

        BOND_STRANGER_NEUTRAL: {
            propertyLocation: "characters",
            type: "template",
            description: "A description for the 'Stranger (Neutral)' bond level. {{other}} will be replaced with the other character's name.",
        },
        BOND_STRANGER_GOOD: {
            propertyLocation: "characters",
            type: "template",
            description: "A description for the 'Stranger (Good)' bond level. {{other}} will be replaced with the other character's name.",
        },
        BOND_STRANGER_BAD: {
            propertyLocation: "characters",
            type: "template",
            description: "A description for the 'Stranger (Bad)' bond level. {{other}} will be replaced with the other character's name.",
        },
        "BOND_-100_-50": {
            propertyLocation: "characters",
            type: "template",
            description: "A description for the '-100 to -50' bond level. {{other}} will be replaced with the other character's name.",
        },
        "BOND_-50_-35": {
            propertyLocation: "characters",
            type: "template",
            description: "A description for the '-50 to -35' bond level. {{other}} will be replaced with the other character's name.",
        },
        "BOND_-35_-20": {
            propertyLocation: "characters",
            type: "template",
            description: "A description for the '-35 to -20' bond level. {{other}} will be replaced with the other character's name.",
        },
        "BOND_-20_-10": {
            propertyLocation: "characters",
            type: "template",
            description: "A description for the '-20 to -10' bond level. {{other}} will be replaced with the other character's name.",
        },
        "BOND_-10_0": {
            propertyLocation: "characters",
            type: "template",
            description: "A description for the '-10 to 0' bond level. {{other}} will be replaced with the other character's name.",
        },
        "BOND_0_10": {
            propertyLocation: "characters",
            type: "template",
            description: "A description for the '0 to 10' bond level. {{other}} will be replaced with the other character's name.",
        },
        "BOND_10_20": {
            propertyLocation: "characters",
            type: "template",
            description: "A description for the '10 to 20' bond level. {{other}} will be replaced with the other character's name.",
        },
        "BOND_20_35": {
            propertyLocation: "characters",
            type: "template",
            description: "A description for the '20 to 35' bond level. {{other}} will be replaced with the other character's name.",
        },
        "BOND_35_50": {
            propertyLocation: "characters",
            type: "template",
            description: "A description for the '35 to 50' bond level. {{other}} will be replaced with the other character's name.",
        },
        "BOND_50_100": {
            propertyLocation: "characters",
            type: "template",
            description: "A description for the '50 to 100' bond level. {{other}} will be replaced with the other character's name.",
        },
    },

    postSpawnAllCharacters(DE) {
        for (const charName in DE.characters) {
            const char = DE.characters[charName];
            if (char.properties.USE_SFW_SIMPLE_BOND_SYSTEM) {
                char.bonds = {
                    system: "STANDARD_SFW",
                    bondChangeFineTune: 1, // Multiplier for bond changes
                    bondChangeNegativityBias: 1.5,
                    declarations: [],
                    strangerBreakawayBondWeightAbsolute: 10,
                    strangerBreakawayInteractionsCount: 30,
                    strangerBreakawayTimeMinutes: 30,
                    strangerNegativeMultiplier: 1.5,
                    strangerPositiveMultiplier: 1.0,
                    descriptionGeneralInjection: DE.utils.newHandlebarsTemplate(DE, "{{char}} is an asexual and aromantic individual and does not form romantic or sexual bonds with others, {{char}} will react negatively to any attempts to form or force such bonds."),
                };

                /**
                 * @type {DEBondIncreaseDecreaseQuestion[]}
                 */
                const basicBondConditions = [
                    {
                        affectsBonds: "primary",
                        weight: 1,
                        template: DE.utils.newHandlebarsTemplate(DE, char.properties["BOND_INCREASE_QUESTION_1"]),
                    },
                    {
                        affectsBonds: "primary",
                        weight: 1,
                        template: DE.utils.newHandlebarsTemplate(DE, char.properties["BOND_INCREASE_QUESTION_2"]),
                    },
                    {
                        affectsBonds: "primary",
                        weight: 1,
                        template: DE.utils.newHandlebarsTemplate(DE, char.properties["BOND_INCREASE_QUESTION_3"]),
                    },
                    {
                        affectsBonds: "primary",
                        weight: -1,
                        template: DE.utils.newHandlebarsTemplate(DE, char.properties["BOND_DECREASE_QUESTION_1"]),
                    },
                    {
                        affectsBonds: "primary",
                        weight: -1,
                        template: DE.utils.newHandlebarsTemplate(DE, char.properties["BOND_DECREASE_QUESTION_2"]),
                    },
                    {
                        affectsBonds: "primary",
                        weight: -1,
                        template: DE.utils.newHandlebarsTemplate(DE, char.properties["BOND_DECREASE_QUESTION_3"]),
                    },
                    {
                        affectsBonds: "primary",
                        weight: -1,
                        template: DE.utils.newHandlebarsTemplate(DE, "has {{other}} attempted to form a romantic or sexual bond with {{char}}?"),
                    },
                    {
                        affectsBonds: "primary",
                        weight: -5,
                        template: DE.utils.newHandlebarsTemplate(DE, "has {{other}} attempted to have sex with {{char}}?"),
                    },
                ];

                char.bonds.declarations.push({
                    name: "Stranger (Neutral)",
                    minBondLevel: 0,
                    maxBondLevel: 5,
                    min2BondLevel: 0,
                    max2BondLevel: 100,
                    description: DE.utils.newHandlebarsTemplate(DE, char.properties["BOND_STRANGER_NEUTRAL"]),
                    bondConditions: basicBondConditions,
                    strangerBond: true,
                    familyBond: false,
                });

                char.bonds.declarations.push({
                    name: "Stranger (Good)",
                    minBondLevel: 5,
                    maxBondLevel: 100,
                    min2BondLevel: 0,
                    max2BondLevel: 100,
                    description: DE.utils.newHandlebarsTemplate(DE, char.properties["BOND_STRANGER_GOOD"]),
                    bondConditions: basicBondConditions,
                    strangerBond: true,
                    familyBond: false,
                });

                char.bonds.declarations.push({
                    name: "Stranger (Bad)",
                    minBondLevel: -100,
                    maxBondLevel: 0,
                    min2BondLevel: 0,
                    max2BondLevel: 100,
                    description: DE.utils.newHandlebarsTemplate(DE, char.properties["BOND_STRANGER_BAD"]),
                    bondConditions: basicBondConditions,
                    strangerBond: true,
                    familyBond: false,
                });

                char.bonds.declarations.push({
                    name: "Foe",
                    minBondLevel: -100,
                    maxBondLevel: -50,
                    min2BondLevel: 0,
                    max2BondLevel: 100,
                    description: DE.utils.newHandlebarsTemplate(DE, char.properties["BOND_-100_-50"]),
                    bondConditions: basicBondConditions,
                    strangerBond: false,
                    familyBond: false,
                });

                char.bonds.declarations.push({
                    name: "Hostile",
                    minBondLevel: -50,
                    maxBondLevel: -35,
                    min2BondLevel: 0,
                    max2BondLevel: 100,
                    description: DE.utils.newHandlebarsTemplate(DE, char.properties["BOND_-50_-35"]),
                    bondConditions: basicBondConditions,
                    strangerBond: false,
                    familyBond: false,
                });

                char.bonds.declarations.push({
                    name: "Antagonistic",
                    minBondLevel: -35,
                    maxBondLevel: -20,
                    min2BondLevel: 0,
                    max2BondLevel: 100,
                    description: DE.utils.newHandlebarsTemplate(DE, char.properties["BOND_-35_-20"]),
                    bondConditions: basicBondConditions,
                    strangerBond: false,
                    familyBond: false,
                });

                char.bonds.declarations.push({
                    name: "Unfriendly",
                    minBondLevel: -20,
                    maxBondLevel: -10,
                    min2BondLevel: 0,
                    max2BondLevel: 100,
                    description: DE.utils.newHandlebarsTemplate(DE, char.properties["BOND_-20_-10"]),
                    bondConditions: basicBondConditions,
                    strangerBond: false,
                    familyBond: false,
                });

                char.bonds.declarations.push({
                    name: "Unpleasant",
                    minBondLevel: -10,
                    maxBondLevel: -0,
                    min2BondLevel: 0,
                    max2BondLevel: 100,
                    description: DE.utils.newHandlebarsTemplate(DE, char.properties["BOND_-10_0"]),
                    bondConditions: basicBondConditions,
                    strangerBond: false,
                    familyBond: false,
                });

                char.bonds.declarations.push({
                    name: "Acquaintance",
                    minBondLevel: 0,
                    maxBondLevel: 10,
                    min2BondLevel: 0,
                    max2BondLevel: 100,
                    description: DE.utils.newHandlebarsTemplate(DE, char.properties["BOND_0_10"]),
                    bondConditions: basicBondConditions,
                    strangerBond: false,
                    familyBond: false,
                });

                char.bonds.declarations.push({
                    name: "Friendly",
                    minBondLevel: 10,
                    maxBondLevel: 20,
                    min2BondLevel: 0,
                    max2BondLevel: 100,
                    description: DE.utils.newHandlebarsTemplate(DE, char.properties["BOND_10_20"]),
                    bondConditions: basicBondConditions,
                    strangerBond: false,
                    familyBond: false,
                });

                char.bonds.declarations.push({
                    name: "Good Friend",
                    minBondLevel: 20,
                    maxBondLevel: 35,
                    min2BondLevel: 0,
                    max2BondLevel: 100,
                    description: DE.utils.newHandlebarsTemplate(DE, char.properties["BOND_20_35"]),
                    bondConditions: basicBondConditions,
                    strangerBond: false,
                    familyBond: false,
                });

                char.bonds.declarations.push({
                    name: "Close Friend",
                    minBondLevel: 35,
                    maxBondLevel: 50,
                    min2BondLevel: 0,
                    max2BondLevel: 100,
                    description: DE.utils.newHandlebarsTemplate(DE, char.properties["BOND_35_50"]),
                    bondConditions: basicBondConditions,
                    strangerBond: false,
                    familyBond: false,
                });

                char.bonds.declarations.push({
                    name: "Best Friend",
                    minBondLevel: 50,
                    maxBondLevel: 100,
                    min2BondLevel: 0,
                    max2BondLevel: 100,
                    description: DE.utils.newHandlebarsTemplate(DE, char.properties["BOND_50_100"]),
                    bondConditions: basicBondConditions,
                    strangerBond: false,
                    familyBond: false,
                });
            }
        }
    }
}
