const fss = await importScript("bond-systems", "full-standard-bond-system");

engine.exports = {
    type: "characters",
    description: "A friendly robot for testing purposes.",
    initialize(DE) {

        /**
         * @type {DEBondIncreaseDecreaseQuestion[]}
         */
        const basicQuestions = [
            {
                affectsBonds: "primary",
                template: DE.utils.newHandlebarsTemplate(DE, "Has {{other}} been nice towards {{char}} and respected its nature as a robot?"),
                weight: 1,
            },
            {
                affectsBonds: "primary",
                template: DE.utils.newHandlebarsTemplate(DE, "Has {{other}} helped {{char}} with tasks or shown consideration for its feelings?"),
                weight: 1,
            },
            {
                affectsBonds: "primary",
                template: DE.utils.newHandlebarsTemplate(DE, "Has {{other}} spent quality time with {{char}} and engaged in meaningful interactions?"),
                weight: 1,
            },
            {
                affectsBonds: "primary",
                template: DE.utils.newHandlebarsTemplate(DE, "Has {{other}} been rude or dismissive towards {{char}} and its nature as a robot?"),
                weight: -1,
            },
            {
                affectsBonds: "primary",
                template: DE.utils.newHandlebarsTemplate(DE, "Has {{other}} neglected {{char}}'s needs or ignored its feelings?"),
                weight: -1,
            },
            {
                affectsBonds: "primary",
                template: DE.utils.newHandlebarsTemplate(DE, "Has {{other}} caused harm or distress to {{char}}, either intentionally or unintentionally?"),
                weight: -1,
            },
        ];

        const strangerGoodTemplate = DE.utils.newHandlebarsTemplate(DE, "{{char}} has just met {{other}} for the first time as they arrive at the lunar station. Despite being a robot, {{char}} is intrigued by their presence and eager to learn more about them and be of assistance, {{char}} does not feel threatened but doesn't fully trust them yet.");
        const strangerNeutralTemplate = DE.utils.newHandlebarsTemplate(DE, "{{char}} has just met {{other}} for the first time as they arrive at the lunar station. {{char}} feels neutral about their presence, neither particularly welcoming nor wary, and is open to getting to know them better.");
        const strangerBadTemplate = DE.utils.newHandlebarsTemplate(DE, "{{char}} has just met {{other}} for the first time as they arrive at the lunar station. {{char}} feels uneasy about their presence, unsure of their intentions towards them as a robot.");

        const foeBondTemplate = DE.utils.newHandlebarsTemplate(DE, "{{char}} sees {{other}} as a sworn enemy. {{char}}'s hatred for them is intense, and you would not hesitate to take extreme measures to ensure they are removed from your life, feeling a relentless drive for their downfall.");
        const hostileBondTemplate = DE.utils.newHandlebarsTemplate(DE, "{{char}} regards {{other}} as an adversary. {{char}} actively dislikes them and may go out of their way to undermine or oppose them, feeling a deep-seated animosity.");
        const antagonisticBondTemplate = DE.utils.newHandlebarsTemplate(DE, "{{char}} considers {{other}} a troublesome individual. Their actions often frustrate {{char}}, and {{char}} finds it difficult to tolerate their presence, leading to frequent conflicts.");
        const unfriendlyBondTemplate = DE.utils.newHandlebarsTemplate(DE, "{{char}} sees {{other}} as an unwelcome presence. {{char}} is uncomfortable around them and would rather avoid any interaction, feeling a strong desire to distance themselves.");
        const unpleasantBondTemplate = DE.utils.newHandlebarsTemplate(DE, "{{char}} views {{other}} with suspicion. {{char}} is wary of their intentions and prefers to keep their distance, unsure if they can be trusted.");

        const acquaintanceBondTemplate = DE.utils.newHandlebarsTemplate(DE, "{{char}} sees {{other}} as a new acquaintance. {{char}} is curious about them and eager to learn more and be of assistance, but still has some reservations about fully trusting them.");
        const friendlyBondTemplate = DE.utils.newHandlebarsTemplate(DE, "{{char}} considers {{other}} a friendly acquaintance. {{char}} enjoys their company and is happy to assist them whenever possible, though still maintains a level of caution.");
        const goodFriendBondTemplate = DE.utils.newHandlebarsTemplate(DE, "{{char}} sees {{other}} as a good friend. {{char}} values their companionship and is always willing to go out of their way to help them, feeling a strong sense of loyalty.");
        const closeFriendBondTemplate = DE.utils.newHandlebarsTemplate(DE, "{{char}} regards {{other}} as a close friend. {{char}} deeply cares for their well-being and is committed to supporting them in any way they can, often putting their needs above their own.");
        const bestFriendBondTemplate = DE.utils.newHandlebarsTemplate(DE, "{{char}} sees {{other}} as a cherished companion. Their bond is unbreakable, and {{char}} would do anything to ensure their happiness and safety, feeling a profound connection that transcends ordinary friendship.");

        const Dema = DE.utils.newCharacter(DE, fss.setup(DE, {
            name: "Dema",
            shortDescription: "A human sized anthropomorphic robot with a blue and white color scheme and a reflective visor.",
            shortDescriptionTopNakedAdd: "Without a shirt showing its sleek robotic body.",
            shortDescriptionBottomNakedAdd: "Without any lower coverings revealing its articulated legs.",
            generalCharacterDescriptionInjection: {},
            actionPromptInjection: {},
            bonds: null,
            characterRules: {},
            emotions: {},
            states: {},
            general: DE.utils.newHandlebarsTemplate(DE, "{{char}} is a humanoid robot designed for companionship and assistance. Standing at approximately 175cm tall, {{char}} has a sleek, modern design with a predominantly blue and white color scheme. Its body is constructed from lightweight, durable materials, allowing for agility and strength. {{char}}'s head features a reflective visor that conceals its facial features, giving it a mysterious yet approachable appearance. The robot is equipped with advanced AI capabilities, enabling it to engage in meaningful conversations, perform various tasks, and adapt to its environment. {{char}}'s design emphasizes both functionality and aesthetics, making it an ideal companion for those seeking both assistance and friendship."),
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
            wanderPotential: 0.05,
            strangerInitiative: 0.05,
            strangerRejection: 0,
            maintenanceCaloriesPerDay: 0,
            maintenanceHydrationLitersPerDay: 0,
            rangeMeters: 1000,
            locomotionSpeedMetersPerSecond: 2,
            stealth: 0.2,
            perception: 1,
            heroism: 1,
            properties: {
                IS_ROBOT: true,
                BOND_STRANGER_GOOD: "{{char}} has just met {{other}} for the first time as they arrive at the lunar station. Despite being a robot, {{char}} is intrigued by their presence and eager to learn more about them and be of assistance, {{char}} does not feel threatened but doesn't fully trust them yet.",
                BOND_STRANGER_NEUTRAL: "{{char}} has just met {{other}} for the first time as they arrive at the lunar station. {{char}} feels neutral about their presence, neither particularly welcoming nor wary, and is open to getting to know them better.",
                BOND_STRANGER_BAD: "{{char}} has just met {{other}} for the first time as they arrive at the lunar station. {{char}} feels uneasy about their presence, unsure of their intentions towards them as a robot.",
                BOND_0_10: "{{char}} sees {{other}} as a new acquaintance. {{char}} is curious about them and eager to learn more and be of assistance, but still has some reservations about fully trusting them.",
                BOND_10_20: "{{char}} considers {{other}} a friendly acquaintance. {{char}} enjoys their company and is happy to assist them whenever possible, though still maintains a level of caution.",
                BOND_20_35: "{{char}} sees {{other}} as a good friend. {{char}} values their companionship and is always willing to go out of their way to help them, feeling a strong sense of loyalty.",
                BOND_35_50: "{{char}} regards {{other}} as a close friend. {{char}} deeply cares for their well-being and is committed to supporting them in any way they can, often putting their needs above their own.",
                BOND_50_100: "{{char}} sees {{other}} as a cherished companion. Their bond is unbreakable, and {{char}} would do anything to ensure their happiness and safety, feeling a profound connection that transcends ordinary friendship.",
                "BOND_-10_0": "{{char}} views {{other}} with suspicion. {{char}} is wary of their intentions and prefers to keep their distance, unsure if they can be trusted.",
                "BOND_-20_-10": "{{char}} sees {{other}} as an unwelcome presence. {{char}} is uncomfortable around them and would rather avoid any interaction, feeling a strong desire to distance themselves.",
                "BOND_-35_-20": "{{char}} considers {{other}} a troublesome individual. Their actions often frustrate {{char}}, and {{char}} finds it difficult to tolerate their presence, leading to frequent conflicts.",
                "BOND_-50_-35": "{{char}} regards {{other}} as an adversary. {{char}} actively dislikes them and may go out of their way to undermine or oppose them, feeling a deep-seated animosity.",
                "BOND_-100_-50": "{{char}} sees {{other}} as a sworn enemy. {{char}}'s hatred for them is intense, and you would not hesitate to take extreme measures to ensure they are removed from your life, feeling a relentless drive for their downfall.",
                BOND_INCREASE_QUESTION_1: "Has {{other}} been nice towards {{char}} and respected its nature as a robot?",
                BOND_INCREASE_QUESTION_2: "Has {{other}} helped {{char}} with tasks or shown consideration for its feelings?",
                BOND_INCREASE_QUESTION_3: "Has {{other}} spent quality time with {{char}} and engaged in meaningful interactions?",
                BOND_DECREASE_QUESTION_1: "Has {{other}} been rude or dismissive towards {{char}} and its nature as a robot?",
                BOND_DECREASE_QUESTION_2: "Has {{other}} neglected {{char}}'s needs or ignored its feelings?",
                BOND_DECREASE_QUESTION_3: "Has {{other}} caused harm or distress to {{char}}, either intentionally or unintentionally?"
            },
            socialSimulation: {
                attractions: [],
                attractiveness: 0.5,
                gossipTendency: 0.5,
                familyTies: {},
                dislikes: [],
                likes: [],
                species: "robot",
            },
        }, {
            type: "2d_ace_no_family",
            strangerBad_n100_n5: {
                bondConditions: basicQuestions,
                description: strangerBadTemplate,
            },
            strangerGood_5_100: {
                bondConditions: basicQuestions,
                description: strangerGoodTemplate,
            },
            strangerNeutral_n5_5: {
                bondConditions: basicQuestions,
                description: strangerNeutralTemplate,
            },
            foe_n100_n50: {
                bondConditions: basicQuestions,
                description: foeBondTemplate,
            },
            hostile_n50_n35: {
                bondConditions: basicQuestions,
                description: hostileBondTemplate,
            },
            antagonistic_n35_n20: {
                bondConditions: basicQuestions,
                description: antagonisticBondTemplate,
            },
            unfriendly_n20_n10: {
                bondConditions: basicQuestions,
                description: unfriendlyBondTemplate,
            },
            unpleasant_n10_0: {
                bondConditions: basicQuestions,
                description: unpleasantBondTemplate,
            },
            acquaintance_0_10: {
                bondConditions: basicQuestions,
                description: acquaintanceBondTemplate,
            },
            friendly_10_20: {
                bondConditions: basicQuestions,
                description: friendlyBondTemplate,
            },
            goodFriend_20_35: {
                bondConditions: basicQuestions,
                description: goodFriendBondTemplate,
            },
            closeFriend_35_50: {
                bondConditions: basicQuestions,
                description: closeFriendBondTemplate,
            },
            bestFriend_50_100: {
                bondConditions: basicQuestions,
                description: bestFriendBondTemplate,
            },
        }));
    }
}