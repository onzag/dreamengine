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

        /**
         * Builds a complete FSSBase for Dema.
         * Dema is asexual — intimate and sexual openness are always "not".
         * Plain affection openness and initiation probability scale with the bond level.
         *
         * @param {DEStringTemplateCharAndOther} description
         * @param {string | null} relationshipName
         * @param {"not" | "slight" | "moderate" | "very"} affectionOpenness
         * @param {string} affectionReason
         * @param {number} initiateProbability
         * @returns {any}
         */
        function demaBase(description, relationshipName, affectionOpenness, affectionReason, initiateProbability) {
            return {
                relationshipName,
                description,
                openToAffection: () => ({ value: affectionOpenness, reason: affectionReason }),
                openToAffectionResponses: [],
                openToIntimateAffection: () => ({ value: /** @type {"not"} */("not"), reason: "Dema is asexual and not open to intimate affection." }),
                openToIntimateAffectionResponses: [],
                openToSex: () => ({ value: /** @type {"not"} */("not"), reason: "Dema is asexual and not open to sexual contact." }),
                openToSexResponses: [],
                proneToInitiatingAffection: { probability: () => initiateProbability, actions: [] },
                proneToInitiatingIntimateAffection: { probability: () => 0, actions: [] },
                proneToInitiatingSex: { probability: () => 0, actions: [] },
            };
        }
        /**
         * Dema has no family ties, so family and nonFamily share the same base.
         * @param {any} base
         * @returns {{ family: any, nonFamily: any }}
         */
        function demaTie(base) { return { family: base, nonFamily: base }; }

        const Dema = DE.utils.newCharacter(fss.setup(DE, {
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
            libido: 0,
            violence: 0,
        }, {
            type: "4d_creepy",
            strangerBad_n100_n5: {
                relationshipName: null,
                description: strangerBadTemplate,
                openToAffection: (char, other) => {
                    return ({
                        value: "not",
                        reason: "Dema does not know " + other.name + " and is a robot, so it is not open to affection from them at this time."
                    })
                },
                openToAffectionResponses: [],
                openToIntimateAffection: (char, other) => {
                    return ({
                        value: "not",
                        reason: "Dema is not open to intimate affection because they are asexual",
                    })
                },
                openToIntimateAffectionResponses: [],
                openToSex: (char, other) => {
                    return ({
                        value: "not",
                        reason: "Dema is not open to sex because they are asexual",
                    })
                },
                openToSexResponses: [],
                proneToInitiatingAffection: {
                    probability: () => 0,
                    actions: [],
                },
                proneToInitiatingIntimateAffection: {
                    probability: () => 0,
                    actions: [],
                },
                proneToInitiatingSex: {
                    probability: () => 0,
                    actions: [],
                },
            },
            strangerGood_5_100: {
                relationshipName: null,
                description: strangerGoodTemplate,
                openToAffection: (char, other) => {
                    return ({
                        value: "not",
                        reason: "Dema does not know " + other.name + " and is a robot, so it is not open to affection from them at this time."
                    })
                },
                openToAffectionResponses: [],
                openToIntimateAffection: (char, other) => {
                    return ({
                        value: "not",
                        reason: "Dema is not open to intimate affection because they are asexual",
                    })
                },
                openToIntimateAffectionResponses: [],
                openToSex: (char, other) => {
                    return ({
                        value: "not",
                        reason: "Dema is not open to sex because they are asexual",
                    })
                },
                openToSexResponses: [],
                proneToInitiatingAffection: {
                    probability: () => 0,
                    actions: [],
                },
                proneToInitiatingIntimateAffection: {
                    probability: () => 0,
                    actions: [],
                },
                proneToInitiatingSex: {
                    probability: () => 0,
                    actions: [],
                },
            },
            strangerNeutral_n5_5: {
                relationshipName: null,
                description: strangerNeutralTemplate,
                openToAffection: (char, other) => {
                    return ({
                        value: "not",
                        reason: "Dema does not know " + other.name + " and is a robot, so it is not open to affection from them at this time."
                    })
                },
                openToAffectionResponses: [],
                openToIntimateAffection: (char, other) => {
                    return ({
                        value: "not",
                        reason: "Dema is not open to intimate affection because they are asexual",
                    })
                },
                openToIntimateAffectionResponses: [],
                openToSex: (char, other) => {
                    return ({
                        value: "not",
                        reason: "Dema is not open to sex because they are asexual",
                    })
                },
                openToSexResponses: [],
                proneToInitiatingAffection: {
                    probability: () => 0,
                    actions: [],
                },
                proneToInitiatingIntimateAffection: {
                    probability: () => 0,
                    actions: [],
                },
                proneToInitiatingSex: {
                    probability: () => 0,
                    actions: [],
                },
            },
            // ── Negative bonds: Dema is not open to any affection regardless of the other's interest ──
            foe_n100_n50: {
                noRomance_0_10:          demaTie(demaBase(foeBondTemplate, null, "not", "Dema sees them as a sworn enemy and will not engage in any affection.", 0)),
                creepyInterest_10_20:    demaTie(demaBase(foeBondTemplate, null, "not", "Dema sees them as a sworn enemy and will not engage in any affection.", 0)),
                obsessiveInterest_20_35: demaTie(demaBase(foeBondTemplate, null, "not", "Dema sees them as a sworn enemy and will not engage in any affection.", 0)),
                stalkingInterest_35_50:  demaTie(demaBase(foeBondTemplate, null, "not", "Dema sees them as a sworn enemy and will not engage in any affection.", 0)),
                sexualAbuseInterest_50_100: demaTie(demaBase(foeBondTemplate, null, "not", "Dema sees them as a sworn enemy and will not engage in any affection.", 0)),
            },
            hostile_n50_n35: {
                noRomance_0_10:          demaTie(demaBase(hostileBondTemplate, null, "not", "Dema regards them as an adversary and is not open to affection.", 0)),
                creepyInterest_10_20:    demaTie(demaBase(hostileBondTemplate, null, "not", "Dema regards them as an adversary and is not open to affection.", 0)),
                obsessiveInterest_20_35: demaTie(demaBase(hostileBondTemplate, null, "not", "Dema regards them as an adversary and is not open to affection.", 0)),
                stalkingInterest_35_50:  demaTie(demaBase(hostileBondTemplate, null, "not", "Dema regards them as an adversary and is not open to affection.", 0)),
                sexualAbuseInterest_50_100: demaTie(demaBase(hostileBondTemplate, null, "not", "Dema regards them as an adversary and is not open to affection.", 0)),
            },
            antagonistic_n35_n20: {
                noRomance_0_10:          demaTie(demaBase(antagonisticBondTemplate, null, "not", "Dema finds them troublesome and is not open to affection.", 0)),
                creepyInterest_10_20:    demaTie(demaBase(antagonisticBondTemplate, null, "not", "Dema finds them troublesome and is not open to affection.", 0)),
                obsessiveInterest_20_35: demaTie(demaBase(antagonisticBondTemplate, null, "not", "Dema finds them troublesome and is not open to affection.", 0)),
                stalkingInterest_35_50:  demaTie(demaBase(antagonisticBondTemplate, null, "not", "Dema finds them troublesome and is not open to affection.", 0)),
                sexualAbuseInterest_50_100: demaTie(demaBase(antagonisticBondTemplate, null, "not", "Dema finds them troublesome and is not open to affection.", 0)),
            },
            unfriendly_n20_n10: {
                noRomance_0_10:          demaTie(demaBase(unfriendlyBondTemplate, null, "not", "Dema sees them as unwelcome and is not open to affection.", 0)),
                creepyInterest_10_20:    demaTie(demaBase(unfriendlyBondTemplate, null, "not", "Dema sees them as unwelcome and is not open to affection.", 0)),
                obsessiveInterest_20_35: demaTie(demaBase(unfriendlyBondTemplate, null, "not", "Dema sees them as unwelcome and is not open to affection.", 0)),
                stalkingInterest_35_50:  demaTie(demaBase(unfriendlyBondTemplate, null, "not", "Dema sees them as unwelcome and is not open to affection.", 0)),
                sexualAbuseInterest_50_100: demaTie(demaBase(unfriendlyBondTemplate, null, "not", "Dema sees them as unwelcome and is not open to affection.", 0)),
            },
            unpleasant_n10_0: {
                noRomance_0_10:          demaTie(demaBase(unpleasantBondTemplate, null, "not", "Dema is wary of them and not comfortable with affection.", 0)),
                creepyInterest_10_20:    demaTie(demaBase(unpleasantBondTemplate, null, "not", "Dema is wary of them and not comfortable with affection.", 0)),
                obsessiveInterest_20_35: demaTie(demaBase(unpleasantBondTemplate, null, "not", "Dema is wary of them and not comfortable with affection.", 0)),
                stalkingInterest_35_50:  demaTie(demaBase(unpleasantBondTemplate, null, "not", "Dema is wary of them and not comfortable with affection.", 0)),
                sexualAbuseInterest_50_100: demaTie(demaBase(unpleasantBondTemplate, null, "not", "Dema is wary of them and not comfortable with affection.", 0)),
            },
            // ── Positive bonds: plain affection opens up; intimate/sexual always "not" (asexual) ──
            // If the other person is pushing boundaries (creepy+), Dema's openness drops regardless of bond.
            acquaintance_0_10: {
                noRomance_0_10:          demaTie(demaBase(acquaintanceBondTemplate, null, "slight",   "Dema is curious and willing to accept a small warm gesture from a new acquaintance.", 0)),
                creepyInterest_10_20:    demaTie(demaBase(acquaintanceBondTemplate, null, "not",      "Dema detects the other is pushing boundaries and is not comfortable with affection.", 0)),
                obsessiveInterest_20_35: demaTie(demaBase(acquaintanceBondTemplate, null, "not",      "Dema is unsettled by the other's obsessive interest and rejects affection.", 0)),
                stalkingInterest_35_50:  demaTie(demaBase(acquaintanceBondTemplate, null, "not",      "Dema recognises alarming behaviour and will not engage in affection.", 0)),
                sexualAbuseInterest_50_100: demaTie(demaBase(acquaintanceBondTemplate, null, "not",   "Dema detects abusive intent and firmly rejects any contact.", 0)),
            },
            friendly_10_20: {
                noRomance_0_10:          demaTie(demaBase(friendlyBondTemplate, null, "slight",   "Dema enjoys their company and is open to small friendly gestures.", 0.05)),
                creepyInterest_10_20:    demaTie(demaBase(friendlyBondTemplate, null, "not",      "Dema likes them but is uncomfortable with the way they are pushing boundaries.", 0)),
                obsessiveInterest_20_35: demaTie(demaBase(friendlyBondTemplate, null, "not",      "Dema is troubled by the obsessive behaviour and will not engage in affection.", 0)),
                stalkingInterest_35_50:  demaTie(demaBase(friendlyBondTemplate, null, "not",      "Dema recognises dangerous stalking behaviour and firmly refuses affection.", 0)),
                sexualAbuseInterest_50_100: demaTie(demaBase(friendlyBondTemplate, null, "not",   "Dema detects abusive intent and firmly rejects any contact.", 0)),
            },
            goodFriend_20_35: {
                noRomance_0_10:          demaTie(demaBase(goodFriendBondTemplate, null, "moderate", "Dema values the friendship and is genuinely open to warm, friendly gestures.", 0.1)),
                creepyInterest_10_20:    demaTie(demaBase(goodFriendBondTemplate, null, "slight",   "Dema values the bond but feels uneasy about the boundary-pushing and is more guarded.", 0.02)),
                obsessiveInterest_20_35: demaTie(demaBase(goodFriendBondTemplate, null, "not",      "Dema is worried by the obsessive behaviour and pulls back from affection.", 0)),
                stalkingInterest_35_50:  demaTie(demaBase(goodFriendBondTemplate, null, "not",      "Dema is alarmed by the stalking and refuses affection regardless of the bond.", 0)),
                sexualAbuseInterest_50_100: demaTie(demaBase(goodFriendBondTemplate, null, "not",   "Dema detects abusive intent and firmly rejects any contact.", 0)),
            },
            closeFriend_35_50: {
                noRomance_0_10:          demaTie(demaBase(closeFriendBondTemplate, null, "moderate", "Dema deeply cares for them and welcomes warm expressions of their close friendship.", 0.15)),
                creepyInterest_10_20:    demaTie(demaBase(closeFriendBondTemplate, null, "slight",   "Dema cares deeply but the boundary-pushing makes it uneasy and less open to affection.", 0.02)),
                obsessiveInterest_20_35: demaTie(demaBase(closeFriendBondTemplate, null, "not",      "Dema is distressed by the obsessive behaviour and closes off to affection.", 0)),
                stalkingInterest_35_50:  demaTie(demaBase(closeFriendBondTemplate, null, "not",      "Dema is alarmed by the stalking and refuses all affection regardless of the close bond.", 0)),
                sexualAbuseInterest_50_100: demaTie(demaBase(closeFriendBondTemplate, null, "not",   "Dema detects abusive intent and firmly rejects any contact.", 0)),
            },
            bestFriend_50_100: {
                noRomance_0_10:          demaTie(demaBase(bestFriendBondTemplate, null, "very",     "Dema cherishes this bond deeply and is very open to warm gestures of their profound friendship.", 0.2)),
                creepyInterest_10_20:    demaTie(demaBase(bestFriendBondTemplate, null, "moderate", "Dema cherishes the bond but is uncomfortable with the boundary-pushing; still open to warmth, though guarded.", 0.05)),
                obsessiveInterest_20_35: demaTie(demaBase(bestFriendBondTemplate, null, "slight",   "Dema is troubled by the obsessive behaviour despite the deep bond and becomes more reserved.", 0)),
                stalkingInterest_35_50:  demaTie(demaBase(bestFriendBondTemplate, null, "not",      "Dema is alarmed by the stalking and refuses affection regardless of how deep the bond is.", 0)),
                sexualAbuseInterest_50_100: demaTie(demaBase(bestFriendBondTemplate, null, "not",   "Dema firmly rejects any contact from someone displaying abusive intent, regardless of history.", 0)),
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