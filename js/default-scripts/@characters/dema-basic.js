const fss = await importScript("@bond-systems", "full-standard-bond-system");

engine.exports = {
    type: "characters",
    description: "A friendly robot for testing purposes.",
    initialize(DE) {
        /**
         * @type {DEStringTemplateCharAndOther}
         */
        const strangerGoodTemplate = (info) => `${info.char.name} has just met ${info.other.name} for the first time as they arrive at the lunar station. Despite being a robot, ${info.char.name} is intrigued by their presence and eager to learn more about them and be of assistance, ${info.char.name} does not feel threatened but doesn't fully trust them yet.`;
        /**
         * @type {DEStringTemplateCharAndOther}
         */
        const strangerNeutralTemplate = (info) => `${info.char.name} has just met ${info.other.name} for the first time as they arrive at the lunar station. ${info.char.name} feels neutral about their presence, neither particularly welcoming nor wary, and is open to getting to know them better.`;
        /**
         * @type {DEStringTemplateCharAndOther}
         */
        const strangerBadTemplate = (info) => `${info.char.name} has just met ${info.other.name} for the first time as they arrive at the lunar station. ${info.char.name} feels uneasy about their presence, unsure of their intentions towards them as a robot.`;

        /**
         * @type {DEStringTemplateCharAndOther}
         */
        const foeBondTemplate = (info) => `${info.char.name} sees ${info.other.name} as a sworn enemy. ${info.char.name}'s hatred for them is intense, and ${info.char.name} would not hesitate to take extreme measures to ensure they are removed from their life, feeling a relentless drive for their downfall.`;
        /**
         * @type {DEStringTemplateCharAndOther}
         */
        const hostileBondTemplate = (info) => `${info.char.name} regards ${info.other.name} as an adversary. ${info.char.name} actively dislikes them and may go out of their way to undermine or oppose them, feeling a deep-seated animosity.`;
        /**
         * @type {DEStringTemplateCharAndOther}
         */
        const antagonisticBondTemplate = (info) => `${info.char.name} considers ${info.other.name} a troublesome individual. Their actions often frustrate ${info.char.name}, and ${info.char.name} finds it difficult to tolerate their presence, leading to frequent conflicts.`;
        /**
         * @type {DEStringTemplateCharAndOther}
         */
        const unfriendlyBondTemplate = (info) => `${info.char.name} sees ${info.other.name} as an unwelcome presence. ${info.char.name} is uncomfortable around them and would rather avoid any interaction, feeling a strong desire to distance themselves.`;
        /**
         * @type {DEStringTemplateCharAndOther}
         */
        const unpleasantBondTemplate = (info) => `${info.char.name} views ${info.other.name} with suspicion. ${info.char.name} is wary of their intentions and prefers to keep their distance, unsure if they can be trusted.`;

        /**
         * @type {DEStringTemplateCharAndOther}
         */
        const acquaintanceBondTemplate = (info) => `${info.char.name} sees ${info.other.name} as a new acquaintance. ${info.char.name} is curious about them and eager to learn more and be of assistance, but still has some reservations about fully trusting them.`;
        /**
         * @type {DEStringTemplateCharAndOther}
         */
        const friendlyBondTemplate = (info) => `${info.char.name} considers ${info.other.name} a friendly acquaintance. ${info.char.name} enjoys their company and is happy to assist them whenever possible, though still maintains a level of caution.`;
        /**
         * @type {DEStringTemplateCharAndOther}
         */
        const goodFriendBondTemplate = (info) => `${info.char.name} sees ${info.other.name} as a good friend. ${info.char.name} values their companionship and is always willing to go out of their way to help them, feeling a strong sense of loyalty.`;
        /**
         * @type {DEStringTemplateCharAndOther}
         */
        const closeFriendBondTemplate = (info) => `${info.char.name} regards ${info.other.name} as a close friend. ${info.char.name} deeply cares for their well-being and is committed to supporting them in any way they can, often putting their needs above their own.`;
        /**
         * @type {DEStringTemplateCharAndOther}
         */
        const bestFriendBondTemplate = (info) => `${info.char.name} sees ${info.other.name} as a cherished companion. Their bond is unbreakable, and ${info.char.name} would do anything to ensure their happiness and safety, feeling a profound connection that transcends ordinary friendship.`;

        // TODO fix with fss
        const Dema = DE.utils.newCharacter(DE, fss.setup(DE, {
            name: "Dema",
            shortDescription: "A human sized anthropomorphic robot with a blue and white color scheme and a reflective visor.",
            shortDescriptionTopNakedAdd: "Without a shirt showing its sleek robotic body.",
            shortDescriptionBottomNakedAdd: "Without any lower coverings revealing its articulated legs.",
            generalCharacterDescriptionInjection: {},
            actionPromptInjection: [],
            bonds: null,
            characterRules: {},
            emotions: {},
            stateDefinitions: {},
            temp: {},
            triggers: [],
            general: (info) => `${info.char.name} is a humanoid robot designed for companionship and assistance. Standing at approximately 175cm tall, ${info.char.name} has a sleek, modern design with a predominantly blue and white color scheme. Its body is constructed from lightweight, durable materials, allowing for agility and strength. ${info.char.name}'s head features a reflective visor that conceals its facial features, giving it a mysterious yet approachable appearance. The robot is equipped with advanced AI capabilities, enabling it to engage in meaningful conversations, perform various tasks, and adapt to its environment. ${info.char.name}'s design emphasizes both functionality and aesthetics, making it an ideal companion for those seeking both assistance and friendship.` ,
            schizophrenia: 0,
            schizophrenicVoiceDescription: "",
            autism: 0,
            carryingCapacityKg: 100,
            carryingCapacityLiters: 100,
            heightCm: 175,
            gender: "ambiguous",
            sex: "none",
            tier: "human",
            tierValue: 85,
            powerGrowthRate: 0,
            ageYears: 5,
            weightKg: 70,
            initiative: 0.5,
            strangerInitiative: 0.05,
            strangerRejection: 0,
            maintenanceCaloriesPerDay: 0,
            maintenanceHydrationLitersPerDay: 0,
            rangeMeters: 1000,
            locomotionSpeedMetersPerSecond: 2,
            stealth: 0.2,
            perception: 1,
            attractiveness: 0.5,
            familyTies: {},
            dislikes: [],
            likes: [],
            charisma: 0.3,
            heroism: 1,
            state: {
                IS_ROBOT: true,
            },
            attractions: [],
            species: "robot",
            speciesType: "humanoid",
            race: null,
            groupBelonging: [],
            socialSimulation: {
                gossipTendency: 0.5,
            },
        }, {
            type: "2d_ace_no_family",
            strangerBad_n100_n5: {
                relationshipName: null,
                description: strangerBadTemplate,
            },
            strangerGood_5_100: {
                relationshipName: null,
                description: strangerGoodTemplate,
            },
            strangerNeutral_n5_5: {
                relationshipName: null,
                description: strangerNeutralTemplate,
            },
            foe_n100_n50: {
                relationshipName: null,
                description: foeBondTemplate,
            },
            hostile_n50_n35: {
                relationshipName: null,
                description: hostileBondTemplate,
            },
            antagonistic_n35_n20: {
                relationshipName: null,
                description: antagonisticBondTemplate,
            },
            unfriendly_n20_n10: {
                relationshipName: null,
                description: unfriendlyBondTemplate,
            },
            unpleasant_n10_0: {
                relationshipName: null,
                description: unpleasantBondTemplate,
            },
            acquaintance_0_10: {
                relationshipName: null,
                description: acquaintanceBondTemplate,
            },
            friendly_10_20: {
                relationshipName: null,
                description: friendlyBondTemplate,
            },
            goodFriend_20_35: {
                relationshipName: null,
                description: goodFriendBondTemplate,
            },
            closeFriend_35_50: {
                relationshipName: null,
                description: closeFriendBondTemplate,
            },
            bestFriend_50_100: {
                relationshipName: null,
                description: bestFriendBondTemplate,
            },
        }));

        DE.utils.newTrigger(Dema, {
            type: "yes_no",
            question: (info) => `Has ${info.other.name} been nice towards ${info.char.name} and respected its nature as a robot?`,
            askPer: "present_character",
            onValue: (answer, char, other) => {
                if (answer) {
                    DE.utils.shiftBond(char, other, 0.3, 0);
                } else {
                    DE.utils.shiftBond(char, other, -0.5, 0);
                }
            }
        });

        DE.utils.newTrigger(Dema, {
            type: "yes_no",
            question: (info) => `Has ${info.other?.name} helped ${info.char.name} with tasks or shown consideration for its feelings?`,
            askPer: "present_character",
            onValue: (answer, char, other) => {
                if (answer) {
                    DE.utils.shiftBond(char, other, 1, 0);
                }
            }
        });

        DE.utils.newTrigger(Dema, {
            type: "yes_no",
            question: (info) => `Has ${info.other?.name} spent quality time with ${info.char.name} and engaged in meaningful interactions?`,
            askPer: "present_character",
            onValue: (answer, char, other) => {
                if (answer) {
                    DE.utils.shiftBond(char, other, 0.5, 0);
                }
            }
        });

        DE.utils.newTrigger(Dema, {
            type: "yes_no",
            question: (info) => `Has ${info.other?.name} been rude or dismissive towards ${info.char.name} and its nature as a robot?`,
            askPer: "present_character",
            onValue: (answer, char, other) => {
                if (answer) {
                    DE.utils.shiftBond(char, other, -1, 0);
                }
            }
        });

        DE.utils.newTrigger(Dema, {
            type: "yes_no",
            question: (info) => `Has ${info.other?.name} neglected ${info.char.name}'s needs or ignored its feelings?`,
            askPer: "present_character",
            onValue: (answer, char, other) => {
                if (answer) {
                    DE.utils.shiftBond(char, other, -1, 0);
                }
            }
        });

        DE.utils.newTrigger(Dema, {
            type: "yes_no",
            question: (info) => `Has ${info.other?.name} caused harm or distress to ${info.char.name}, either intentionally or unintentionally?`,
            askPer: "present_character",
            onValue: (answer, char, other) => {
                if (answer) {
                    DE.utils.shiftBond(char, other, -1, 0);
                }
            }
        });
    }
}