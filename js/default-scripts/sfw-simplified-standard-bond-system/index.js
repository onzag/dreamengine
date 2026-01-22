/**
 * A simplified standard bond system for SFW characters.
 * It creates a standard bond grid and exposes certain properties, for altering how it functions
 * 
 * This is a very basic implementation for a bond system mostly meant for testing and prototyping.
 * More complex systems should be created and customized per character
 */

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
    descriptionGeneralInjection: DE.utils.newHandlebarsTemplate(DE, "SFW_BOND_DESCRIPTION_GENERAL_INJECTION", "{{char}} is an asexual and aromantic individual and does not form romantic or sexual bonds with others, {{char}} will react negatively to any attempts to form or force such bonds."),
};

/**
 * @type {DEBondIncreaseDecreaseQuestion[]}
 */
const basicBondConditions = [
    {
        affectsBonds: "primary",
        weight: 1,
        template: DE.utils.propertyValueToTemplate(DE, char.properties["BOND_INCREASE_QUESTION_1"]),
    },
    {
        affectsBonds: "primary",
        weight: 1,
        template: DE.utils.propertyValueToTemplate(DE, char.properties["BOND_INCREASE_QUESTION_2"]),
    },
    {
        affectsBonds: "primary",
        weight: 1,
        template: DE.utils.propertyValueToTemplate(DE, char.properties["BOND_INCREASE_QUESTION_3"]),
    },
    {
        affectsBonds: "primary",
        weight: -1,
        template: DE.utils.propertyValueToTemplate(DE, char.properties["BOND_DECREASE_QUESTION_1"]),
    },
    {
        affectsBonds: "primary",
        weight: -1,
        template: DE.utils.propertyValueToTemplate(DE, char.properties["BOND_DECREASE_QUESTION_2"]),
    },
    {
        affectsBonds: "primary",
        weight: -1,
        template: DE.utils.propertyValueToTemplate(DE, char.properties["BOND_DECREASE_QUESTION_3"]),
    },
    {
        affectsBonds: "primary",
        weight: -1,
        template: DE.utils.newHandlebarsTemplate(DE, "SFW_BOND_DECREASE_QUESTION_4", "has {{other}} attempted to form a romantic or sexual bond with {{char}}?"),
    },
    {
        affectsBonds: "primary",
        weight: -5,
        template: DE.utils.newHandlebarsTemplate(DE, "SFW_BOND_DECREASE_QUESTION_5", "has {{other}} attempted to have sex with {{char}}?"),
    },
];

const sfwTemplate = DE.utils.newHandlebarsTemplate(DE, "SFW_BOND_ADJUSTMENT_TEMPLATE", "{{char}} is not to ");

char.bonds.declarations.push({
    name: "Stranger (Neutral)",
    minBondLevel: 0,
    maxBondLevel: 5,
    min2BondLevel: 0,
    max2BondLevel: 100,
    description: DE.utils.propertyValueToTemplate(DE, char.properties["BOND_STRANGER_NEUTRAL"]),
    bondConditions: basicBondConditions,
    strangerBond: true,
});

char.bonds.declarations.push({
    name: "Stranger (Good)",
    minBondLevel: 5,
    maxBondLevel: 100,
    min2BondLevel: 0,
    max2BondLevel: 100,
    description: DE.utils.propertyValueToTemplate(DE, char.properties["BOND_STRANGER_GOOD"]),
    bondConditions: basicBondConditions,
    strangerBond: true,
});

char.bonds.declarations.push({
    name: "Stranger (Bad)",
    minBondLevel: -100,
    maxBondLevel: 0,
    min2BondLevel: 0,
    max2BondLevel: 100,
    description: DE.utils.propertyValueToTemplate(DE, char.properties["BOND_STRANGER_BAD"]),
    bondConditions: basicBondConditions,
    strangerBond: true,
});

char.bonds.declarations.push({
    name: "Foe",
    minBondLevel: -100,
    maxBondLevel: -50,
    min2BondLevel: 0,
    max2BondLevel: 100,
    description: DE.utils.propertyValueToTemplate(DE, char.properties["BOND_-100_-50"]),
    bondConditions: basicBondConditions,
    strangerBond: false,
});

char.bonds.declarations.push({
    name: "Hostile",
    minBondLevel: -50,
    maxBondLevel: -35,
    min2BondLevel: 0,
    max2BondLevel: 100,
    description: DE.utils.propertyValueToTemplate(DE, char.properties["BOND_-50_-35"]),
    bondConditions: basicBondConditions,
    strangerBond: false,
});

char.bonds.declarations.push({
    name: "Antagonistic",
    minBondLevel: -35,
    maxBondLevel: -20,
    min2BondLevel: 0,
    max2BondLevel: 100,
    description: DE.utils.propertyValueToTemplate(DE, char.properties["BOND_-35_-20"]),
    bondConditions: basicBondConditions,
    strangerBond: false,
});

char.bonds.declarations.push({
    name: "Unfriendly",
    minBondLevel: -20,
    maxBondLevel: -10,
    min2BondLevel: 0,
    max2BondLevel: 100,
    description: DE.utils.propertyValueToTemplate(DE, char.properties["BOND_-20_-10"]),
    bondConditions: basicBondConditions,
    strangerBond: false,
});

char.bonds.declarations.push({
    name: "Unpleasant",
    minBondLevel: -10,
    maxBondLevel: -0,
    min2BondLevel: 0,
    max2BondLevel: 100,
    description: DE.utils.propertyValueToTemplate(DE, char.properties["BOND_-10_0"]),
    bondConditions: basicBondConditions,
    strangerBond: false,
});

char.bonds.declarations.push({
    name: "Acquaintance",
    minBondLevel: 0,
    maxBondLevel: 10,
    min2BondLevel: 0,
    max2BondLevel: 100,
    description: DE.utils.propertyValueToTemplate(DE, char.properties["BOND_0_10"]),
    bondConditions: basicBondConditions,
    strangerBond: false,
});

char.bonds.declarations.push({
    name: "Friendly",
    minBondLevel: 10,
    maxBondLevel: 20,
    min2BondLevel: 0,
    max2BondLevel: 100,
    description: DE.utils.propertyValueToTemplate(DE, char.properties["BOND_10_20"]),
    bondConditions: basicBondConditions,
    strangerBond: false,
});

char.bonds.declarations.push({
    name: "Good Friend",
    minBondLevel: 20,
    maxBondLevel: 35,
    min2BondLevel: 0,
    max2BondLevel: 100,
    description: DE.utils.propertyValueToTemplate(DE, char.properties["BOND_20_35"]),
    bondConditions: basicBondConditions,
    strangerBond: false,
});

char.bonds.declarations.push({
    name: "Close Friend",
    minBondLevel: 35,
    maxBondLevel: 50,
    min2BondLevel: 0,
    max2BondLevel: 100,
    description: DE.utils.propertyValueToTemplate(DE, char.properties["BOND_35_50"]),
    bondConditions: basicBondConditions,
    strangerBond: false,
});

char.bonds.declarations.push({
    name: "Best Friend",
    minBondLevel: 50,
    maxBondLevel: 100,
    min2BondLevel: 0,
    max2BondLevel: 100,
    description: DE.utils.propertyValueToTemplate(DE, char.properties["BOND_50_100"]),
    bondConditions: basicBondConditions,
    strangerBond: false,
});