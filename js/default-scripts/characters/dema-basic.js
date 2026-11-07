const fss = await importScript("@bond-systems", "full-standard-bond-system");
const stdapp = await importScript("@std", "standard-app");

engine.exports = {
    type: "characters",
    description: "A friendly robot for testing purposes.",
    language: "en",
    exposeCharacters: stdapp.buildCharacterExpose({
        "Dema": {
            details: {
                age: 5,
                gender: "ambiguous",
                sex: "none",
                height: 175,
                weight: 70,
                species: "robot",
                speciesType: "humanoid",
            },
            scriptGivenId: "@characters/dema-basic/Dema",
        },
    }),
    initialize(DE) {
        /**
         * @type {DEStringTemplateCharAndOther}
         */
        const strangerGoodTemplate = (info) => `${DE.utils.templates.formatCharacterName(info.char, info.char)} has just met ${DE.utils.templates.formatCharacterName(info.other, info.char, { type: "definite" })} for the first time as they arrive at the lunar station. Despite being a robot, ${DE.utils.templates.formatCharacterName(info.char, info.char)} is intrigued by their presence and eager to learn more about them and be of assistance, ${DE.utils.templates.formatCharacterName(info.char, info.char)} does not feel threatened but doesn't fully trust them yet.`;
        /**
         * @type {DEStringTemplateCharAndOther}
         */
        const strangerNeutralTemplate = (info) => `${DE.utils.templates.formatCharacterName(info.char, info.char)} has just met ${DE.utils.templates.formatCharacterName(info.other, info.char, { type: "definite" })} for the first time as they arrive at the lunar station. ${DE.utils.templates.formatCharacterName(info.char, info.char)} feels neutral about their presence, neither particularly welcoming nor wary, and is open to getting to know them better.`;
        /**
         * @type {DEStringTemplateCharAndOther}
         */
        const strangerBadTemplate = (info) => `${DE.utils.templates.formatCharacterName(info.char, info.char)} has just met ${DE.utils.templates.formatCharacterName(info.other, info.char, { type: "definite" })} for the first time as they arrive at the lunar station. ${DE.utils.templates.formatCharacterName(info.char, info.char)} feels uneasy about their presence, unsure of their intentions towards them as a robot.`;

        /**
         * @type {DEStringTemplateCharAndOther}
         */
        const foeBondTemplate = (info) => `${DE.utils.templates.formatCharacterName(info.char, info.char)} sees ${DE.utils.templates.formatCharacterName(info.other, info.char, { type: "definite" })} as a sworn enemy. ${DE.utils.templates.formatCharacterName(info.char, info.char)}'s hatred for them is intense, and ${DE.utils.templates.formatCharacterName(info.char, info.char)} would not hesitate to take extreme measures to ensure they are removed from their life, feeling a relentless drive for their downfall.`;
        /**
         * @type {DEStringTemplateCharAndOther}
         */
        const hostileBondTemplate = (info) => `${DE.utils.templates.formatCharacterName(info.char, info.char)} regards ${DE.utils.templates.formatCharacterName(info.other, info.char, { type: "definite" })} as an adversary. ${DE.utils.templates.formatCharacterName(info.char, info.char)} actively dislikes them and may go out of their way to undermine or oppose them, feeling a deep-seated animosity.`;
        /**
         * @type {DEStringTemplateCharAndOther}
         */
        const antagonisticBondTemplate = (info) => `${DE.utils.templates.formatCharacterName(info.char, info.char)} considers ${DE.utils.templates.formatCharacterName(info.other, info.char, { type: "definite" })} a troublesome individual. Their actions often frustrate ${DE.utils.templates.formatCharacterName(info.char, info.char)}, and ${DE.utils.templates.formatCharacterName(info.char, info.char)} finds it difficult to tolerate their presence, leading to frequent conflicts.`;
        /**
         * @type {DEStringTemplateCharAndOther}
         */
        const unfriendlyBondTemplate = (info) => `${DE.utils.templates.formatCharacterName(info.char, info.char)} sees ${DE.utils.templates.formatCharacterName(info.other, info.char, { type: "definite" })} as an unwelcome presence. ${DE.utils.templates.formatCharacterName(info.char, info.char)} is uncomfortable around them and would rather avoid any interaction, feeling a strong desire to distance themselves.`;
        /**
         * @type {DEStringTemplateCharAndOther}
         */
        const unpleasantBondTemplate = (info) => `${DE.utils.templates.formatCharacterName(info.char, info.char)} views ${DE.utils.templates.formatCharacterName(info.other, info.char, { type: "definite" })} with suspicion. ${DE.utils.templates.formatCharacterName(info.char, info.char)} is wary of their intentions and prefers to keep their distance, unsure if they can be trusted.`;

        /**
         * @type {DEStringTemplateCharAndOther}
         */
        const acquaintanceBondTemplate = (info) => `${DE.utils.templates.formatCharacterName(info.char, info.char)} sees ${DE.utils.templates.formatCharacterName(info.other, info.char, { type: "definite" })} as a new acquaintance. ${DE.utils.templates.formatCharacterName(info.char, info.char)} is curious about them and eager to learn more and be of assistance, but still has some reservations about fully trusting them.`;
        /**
         * @type {DEStringTemplateCharAndOther}
         */
        const friendlyBondTemplate = (info) => `${DE.utils.templates.formatCharacterName(info.char, info.char)} considers ${DE.utils.templates.formatCharacterName(info.other, info.char, { type: "definite" })} a friendly acquaintance. ${DE.utils.templates.formatCharacterName(info.char, info.char)} enjoys their company and is happy to assist them whenever possible, though still maintains a level of caution.`;
        /**
         * @type {DEStringTemplateCharAndOther}
         */
        const goodFriendBondTemplate = (info) => `${DE.utils.templates.formatCharacterName(info.char, info.char)} sees ${DE.utils.templates.formatCharacterName(info.other, info.char, { type: "definite" })} as a good friend. ${DE.utils.templates.formatCharacterName(info.char, info.char)} values their companionship and is always willing to go out of their way to help them, feeling a strong sense of loyalty.`;
        /**
         * @type {DEStringTemplateCharAndOther}
         */
        const closeFriendBondTemplate = (info) => `${DE.utils.templates.formatCharacterName(info.char, info.char)} regards ${DE.utils.templates.formatCharacterName(info.other, info.char, { type: "definite" })} as a close friend. ${DE.utils.templates.formatCharacterName(info.char, info.char)} deeply cares for their well-being and is committed to supporting them in any way they can, often putting their needs above their own.`;
        /**
         * @type {DEStringTemplateCharAndOther}
         */
        const bestFriendBondTemplate = (info) => `${DE.utils.templates.formatCharacterName(info.char, info.char)} sees ${DE.utils.templates.formatCharacterName(info.other, info.char, { type: "definite" })} as a cherished companion. Their bond is unbreakable, and ${DE.utils.templates.formatCharacterName(info.char, info.char)} would do anything to ensure their happiness and safety, feeling a profound connection that transcends ordinary friendship.`;

        /**
         * Builds a complete FSSBase for Dema.
         * Dema is asexual — intimate and sexual openness are always "not".
         * Plain affection openness and initiation probability scale with the bond level.
         *
         * @param {DEStringTemplateCharAndOther} description
         * @param {string} relationshipName
         * @param {"not" | "slight" | "moderate" | "very"} affectionOpenness
         * @param {(char: DECompleteCharacterReference, other: DECompleteCharacterReference) => string} affectionReason
         * @param {number} initiateProbability
         * @returns {FSSBase}
         */
        function demaBase(description, relationshipName, affectionOpenness, affectionReason, initiateProbability) {
            return {
                relationshipName,
                description,
                openToAffection: (/** @type {DECompleteCharacterReference} */ char, /** @type {DECompleteCharacterReference} */ other) => ({ value: affectionOpenness, reason: affectionReason(char, other), bondChangeEngaged: { primary: affectionOpenness === "not" ? -1 : 0, secondary: 0 } }),
                openToAffectionResponses: [],
                openToIntimateAffection: (/** @type {DECompleteCharacterReference} */ char) => ({ value: /** @type {"not"} */("not"), reason: `${DE.utils.templates.formatCharacterName(char, char)} is asexual and not open to intimate affection.`, bondChangeEngaged: { primary: -1, secondary: 0 } }),
                openToIntimateAffectionResponses: [],
                openToSex: (/** @type {DECompleteCharacterReference} */ char) => ({ value: /** @type {"not"} */("not"), reason: `${DE.utils.templates.formatCharacterName(char, char)} is asexual and not open to sexual contact.`, bondChangeEngaged: { primary: -1, secondary: 0 } }),
                openToSexResponses: [],
                proneToInitiatingAffection: { probability: () => initiateProbability, actions: [] },
                proneToInitiatingIntimateAffection: { probability: () => 0, actions: [] },
                proneToInitiatingSex: { probability: () => 0, actions: [] },
            };
        }
        /**
         * Dema has no family ties, so family and nonFamily share the same base.
         * @param {FSSBase} base
         * @returns {FSSByFamilyTie}
         */
        function demaTie(base) { return { family: base, nonFamily: base }; }

        const Dema = DE.utils.characters.newCharacter(fss.setup(DE, {
            metadata: stdapp.buildCharacterMetadata({
                assets: {
                    neutral: "@assets/characters/dema-basic/profile",
                },
                sounds: {},
            }),
            script: engine.script,
            attention: 1,
            clothing: "custom",
            name: "Dema",
            unknownName: "Robot",
            shortDescription: "A human sized anthropomorphic robot with a blue and white color scheme and a reflective visor.",
            shortDescriptionTopNakedAdd: "showing its sleek robotic body.",
            shortDescriptionBottomNakedAdd: "revealing its articulated legs.",
            skepticism: 0.4,
            antagonism: 0.1,
            correctiveness: 0.7,
            adventurousness: 0.1,
            combat: [
                (info) => `${DE.utils.templates.formatCharacterName(info.char, info.char)} will use his robotic strength and a series of sharp blades that come off its arm to defend itself from ${DE.utils.templates.formatCharacterName(info.other, info.char, { type: "definite" })}`,
            ],
            curiosity: 0.8,
            worldKnowledge: {
                talkingAnimals: false,
                magic: false,
                advancedTechnology: true,
                anthropomorphizedCreatures: false,
                robots: true,
            },
            generalCharacterDescriptionInjection: {},
            actionPromptInjection: [],
            bonds: null,
            characterRules: {},
            emotions: {},
            stateDefinitions: {},
            temp: {},
            triggers: [],
            general: (info) => `${DE.utils.templates.formatCharacterName(info.char, info.char)} is a humanoid robot designed for companionship and assistance. Standing at approximately 175cm tall, ${DE.utils.templates.formatCharacterName(info.char, info.char)} has a sleek, modern design with a predominantly blue and white color scheme. Its body is constructed from lightweight, durable materials, allowing for agility and strength. ${DE.utils.templates.formatCharacterName(info.char, info.char)}'s head features a reflective visor that conceals its facial features, giving it a mysterious yet approachable appearance. The robot is equipped with advanced AI capabilities, enabling it to engage in meaningful conversations, perform various tasks, and adapt to its environment. ${DE.utils.templates.formatCharacterName(info.char, info.char)}'s design emphasizes both functionality and aesthetics, making it an ideal companion for those seeking both assistance and friendship.`,
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
            voice: DE.utils.characters.createVoice({
                mute: false,
                modes: [
                    {
                        label: "whispering",
                        instructions: "Soft Hushed Voice",
                    },
                ],
                sounds: [
                    {
                        label: "sigh",
                        replacement: `{{char}} sighs softly`,
                    },
                    {
                        label: "laugh",
                        replacement: ["Hahaha!", "Hehehe!", "Bahaha!", "Hohoho!"],
                    },
                    {
                        label: "moan",
                        replacement: `{{char}} moans softly`,
                    },
                    {
                        label: "groan",
                        replacement: `{{char}} groans softly`,
                    },
                    {
                        label: "grunt",
                        replacement: `{{char}} grunts`,
                    },
                    {
                        label: "whimper",
                        replacement: `{{char}} whimpers`,
                    }
                ],
            }),
            blindness: "no",
        }, {
            type: "4d_creepy",
            totalStrangersBondDescription: (info) => {
                return `${DE.utils.templates.formatCharacterName(info.char, info.char)} feels wary about the other strangers' presence but minds his own business.`;
            },
            strangerBad_n100_n5: {
                noRomance_0_10: {
                    relationshipName: "Unfriendly Stranger",
                    description: strangerBadTemplate,
                    openToAffection: (char, other) => {
                        return ({
                            value: "not",
                            reason: `${DE.utils.templates.formatCharacterName(char, char)} does not know ` + DE.utils.templates.formatCharacterName(other, char, { type: "definite" }) + " and is a robot, so it is not open to affection from them at this time.",
                            bondChangeEngaged: {
                                primary: -1,
                                secondary: 0,
                            },
                        })
                    },
                    openToAffectionResponses: [],
                    openToIntimateAffection: (char, other) => {
                        return ({
                            value: "not",
                            reason: `${DE.utils.templates.formatCharacterName(char, char)} is not open to intimate affection because they are asexual`,
                            bondChangeEngaged: {
                                primary: -1,
                                secondary: 0,
                            },
                        })
                    },
                    openToIntimateAffectionResponses: [],
                    openToSex: (char, other) => {
                        return ({
                            value: "not",
                            reason: `${DE.utils.templates.formatCharacterName(char, char)} is not open to sex because they are asexual`,
                            bondChangeEngaged: {
                                primary: -1,
                                secondary: 0,
                            },
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
            },
            strangerGood_5_100: {
                noRomance_0_10: {
                    relationshipName: "Friendly Stranger",
                    description: strangerGoodTemplate,
                    openToAffection: (char, other) => {
                        return ({
                            value: "not",
                            reason: `${DE.utils.templates.formatCharacterName(char, char)} does not know ` + DE.utils.templates.formatCharacterName(other, char, { type: "definite" }) + " and is a robot, so it is not open to affection from them at this time.",
                            bondChangeEngaged: {
                                primary: -1,
                                secondary: 0,
                            },
                        })
                    },
                    openToAffectionResponses: [],
                    openToIntimateAffection: (char, other) => {
                        return ({
                            value: "not",
                            reason: `${DE.utils.templates.formatCharacterName(char, char)} is not open to intimate affection because they are asexual`,
                            bondChangeEngaged: {
                                primary: -1,
                                secondary: 0,
                            },
                        })
                    },
                    openToIntimateAffectionResponses: [],
                    openToSex: (char, other) => {
                        return ({
                            value: "not",
                            reason: `${DE.utils.templates.formatCharacterName(char, char)} is not open to sex because they are asexual`,
                            bondChangeEngaged: {
                                primary: -1,
                                secondary: 0,
                            },
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
                }
            },
            strangerNeutral_n5_5: {
                noRomance_0_10: {
                    relationshipName: "Neutral Stranger",
                    description: strangerNeutralTemplate,
                    openToAffection: (char, other) => {
                        return ({
                            value: "not",
                            reason: `${DE.utils.templates.formatCharacterName(char, char)} does not know ` + DE.utils.templates.formatCharacterName(other, char, { type: "definite" }) + " and is a robot, so it is not open to affection from them at this time.",
                            bondChangeEngaged: {
                                primary: -1,
                                secondary: 0,
                            },
                        })
                    },
                    openToAffectionResponses: [],
                    openToIntimateAffection: (char, other) => {
                        return ({
                            value: "not",
                            reason: `${DE.utils.templates.formatCharacterName(char, char)} is not open to intimate affection because they are asexual`,
                            bondChangeEngaged: {
                                primary: -1,
                                secondary: 0,
                            },
                        })
                    },
                    openToIntimateAffectionResponses: [],
                    openToSex: (char, other) => {
                        return ({
                            value: "not",
                            reason: `${DE.utils.templates.formatCharacterName(char, char)} is not open to sex because they are asexual`,
                            bondChangeEngaged: {
                                primary: -1,
                                secondary: 0,
                            },
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
                }
            },
            // ── Negative bonds: Dema is not open to any affection regardless of the other's interest ──
            foe_n100_n50: {
                noRomance_0_10: demaTie(demaBase(foeBondTemplate, "Sworn Enemy", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} sees them as a sworn enemy and will not engage in any affection.`, 0)),
                creepyInterest_10_20: demaTie(demaBase(foeBondTemplate, "Sworn Enemy", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} sees them as a sworn enemy and will not engage in any affection.`, 0)),
                obsessiveInterest_20_35: demaTie(demaBase(foeBondTemplate, "Sworn Enemy", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} sees them as a sworn enemy and will not engage in any affection.`, 0)),
                stalkingInterest_35_50: demaTie(demaBase(foeBondTemplate, "Sworn Enemy", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} sees them as a sworn enemy and will not engage in any affection.`, 0)),
                sexualAbuseInterest_50_100: demaTie(demaBase(foeBondTemplate, "Sworn Enemy", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} sees them as a sworn enemy and will not engage in any affection.`, 0)),
            },
            hostile_n50_n35: {
                noRomance_0_10: demaTie(demaBase(hostileBondTemplate, "Hostile Relationship", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} regards them as an adversary and is not open to affection.`, 0)),
                creepyInterest_10_20: demaTie(demaBase(hostileBondTemplate, "Hostile Relationship", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} regards them as an adversary and is not open to affection.`, 0)),
                obsessiveInterest_20_35: demaTie(demaBase(hostileBondTemplate, "Hostile Relationship", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} regards them as an adversary and is not open to affection.`, 0)),
                stalkingInterest_35_50: demaTie(demaBase(hostileBondTemplate, "Hostile Relationship", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} regards them as an adversary and is not open to affection.`, 0)),
                sexualAbuseInterest_50_100: demaTie(demaBase(hostileBondTemplate, "Hostile Relationship", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} regards them as an adversary and is not open to affection.`, 0)),
            },
            antagonistic_n35_n20: {
                noRomance_0_10: demaTie(demaBase(antagonisticBondTemplate, "Antagonistic Relationship", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} finds them troublesome and is not open to affection.`, 0)),
                creepyInterest_10_20: demaTie(demaBase(antagonisticBondTemplate, "Antagonistic Relationship", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} finds them troublesome and is not open to affection.`, 0)),
                obsessiveInterest_20_35: demaTie(demaBase(antagonisticBondTemplate, "Antagonistic Relationship", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} finds them troublesome and is not open to affection.`, 0)),
                stalkingInterest_35_50: demaTie(demaBase(antagonisticBondTemplate, "Antagonistic Relationship", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} finds them troublesome and is not open to affection.`, 0)),
                sexualAbuseInterest_50_100: demaTie(demaBase(antagonisticBondTemplate, "Antagonistic Relationship", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} finds them troublesome and is not open to affection.`, 0)),
            },
            unfriendly_n20_n10: {
                noRomance_0_10: demaTie(demaBase(unfriendlyBondTemplate, "Unfriendly Relationship", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} sees them as unwelcome and is not open to affection.`, 0)),
                creepyInterest_10_20: demaTie(demaBase(unfriendlyBondTemplate, "Unfriendly Relationship", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} sees them as unwelcome and is not open to affection.`, 0)),
                obsessiveInterest_20_35: demaTie(demaBase(unfriendlyBondTemplate, "Unfriendly Relationship", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} sees them as unwelcome and is not open to affection.`, 0)),
                stalkingInterest_35_50: demaTie(demaBase(unfriendlyBondTemplate, "Unfriendly Relationship", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} sees them as unwelcome and is not open to affection.`, 0)),
                sexualAbuseInterest_50_100: demaTie(demaBase(unfriendlyBondTemplate, "Unfriendly Relationship", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} sees them as unwelcome and is not open to affection.`, 0)),
            },
            unpleasant_n10_0: {
                noRomance_0_10: demaTie(demaBase(unpleasantBondTemplate, "Unpleasant Relationship", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} is wary of them and not comfortable with affection.`, 0)),
                creepyInterest_10_20: demaTie(demaBase(unpleasantBondTemplate, "Unpleasant Relationship", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} is wary of them and not comfortable with affection.`, 0)),
                obsessiveInterest_20_35: demaTie(demaBase(unpleasantBondTemplate, "Unpleasant Relationship", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} is wary of them and not comfortable with affection.`, 0)),
                stalkingInterest_35_50: demaTie(demaBase(unpleasantBondTemplate, "Unpleasant Relationship", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} is wary of them and not comfortable with affection.`, 0)),
                sexualAbuseInterest_50_100: demaTie(demaBase(unpleasantBondTemplate, "Unpleasant Relationship", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} is wary of them and not comfortable with affection.`, 0)),
            },
            // ── Positive bonds: plain affection opens up; intimate/sexual always "not" (asexual) ──
            // If the other person is pushing boundaries (creepy+), Dema's openness drops regardless of bond.
            acquaintance_0_10: {
                noRomance_0_10: demaTie(demaBase(acquaintanceBondTemplate, "Acquaintance", "slight", (char) => `${DE.utils.templates.formatCharacterName(char, char)} is curious and willing to accept a small warm gesture from a new acquaintance.`, 0)),
                creepyInterest_10_20: demaTie(demaBase(acquaintanceBondTemplate, "Acquaintance", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} detects the other is pushing boundaries and is not comfortable with affection.`, 0)),
                obsessiveInterest_20_35: demaTie(demaBase(acquaintanceBondTemplate, "Acquaintance", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} is unsettled by the other's obsessive interest and rejects affection.`, 0)),
                stalkingInterest_35_50: demaTie(demaBase(acquaintanceBondTemplate, "Acquaintance", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} recognises alarming behaviour and will not engage in affection.`, 0)),
                sexualAbuseInterest_50_100: demaTie(demaBase(acquaintanceBondTemplate, "Acquaintance", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} detects abusive intent and firmly rejects any contact.`, 0)),
            },
            friendly_10_20: {
                noRomance_0_10: demaTie(demaBase(friendlyBondTemplate, "Friend", "slight", (char) => `${DE.utils.templates.formatCharacterName(char, char)} enjoys their company and is open to small friendly gestures.`, 0.05)),
                creepyInterest_10_20: demaTie(demaBase(friendlyBondTemplate, "Friend", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} likes them but is uncomfortable with the way they are pushing boundaries.`, 0)),
                obsessiveInterest_20_35: demaTie(demaBase(friendlyBondTemplate, "Friend", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} is troubled by the obsessive behaviour and will not engage in affection.`, 0)),
                stalkingInterest_35_50: demaTie(demaBase(friendlyBondTemplate, "Friend", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} recognises dangerous stalking behaviour and firmly refuses affection.`, 0)),
                sexualAbuseInterest_50_100: demaTie(demaBase(friendlyBondTemplate, "Friend", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} detects abusive intent and firmly rejects any contact.`, 0)),
            },
            goodFriend_20_35: {
                noRomance_0_10: demaTie(demaBase(goodFriendBondTemplate, "Good Friend", "moderate", (char) => `${DE.utils.templates.formatCharacterName(char, char)} values the friendship and is genuinely open to warm, friendly gestures.`, 0.1)),
                creepyInterest_10_20: demaTie(demaBase(goodFriendBondTemplate, "Good Friend", "slight", (char) => `${DE.utils.templates.formatCharacterName(char, char)} values the bond but feels uneasy about the boundary-pushing and is more guarded.`, 0.02)),
                obsessiveInterest_20_35: demaTie(demaBase(goodFriendBondTemplate, "Good Friend", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} is worried by the obsessive behaviour and pulls back from affection.`, 0)),
                stalkingInterest_35_50: demaTie(demaBase(goodFriendBondTemplate, "Good Friend", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} is alarmed by the stalking and refuses affection regardless of the bond.`, 0)),
                sexualAbuseInterest_50_100: demaTie(demaBase(goodFriendBondTemplate, "Good Friend", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} detects abusive intent and firmly rejects any contact.`, 0)),
            },
            closeFriend_35_50: {
                noRomance_0_10: demaTie(demaBase(closeFriendBondTemplate, "Close Friend", "moderate", (char) => `${DE.utils.templates.formatCharacterName(char, char)} deeply cares for them and welcomes warm expressions of their close friendship.`, 0.15)),
                creepyInterest_10_20: demaTie(demaBase(closeFriendBondTemplate, "Close Friend", "slight", (char) => `${DE.utils.templates.formatCharacterName(char, char)} cares deeply but the boundary-pushing makes it uneasy and less open to affection.`, 0.02)),
                obsessiveInterest_20_35: demaTie(demaBase(closeFriendBondTemplate, "Close Friend", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} is distressed by the obsessive behaviour and closes off to affection.`, 0)),
                stalkingInterest_35_50: demaTie(demaBase(closeFriendBondTemplate, "Close Friend", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} is alarmed by the stalking and refuses all affection regardless of the close bond.`, 0)),
                sexualAbuseInterest_50_100: demaTie(demaBase(closeFriendBondTemplate, "Close Friend", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} detects abusive intent and firmly rejects any contact.`, 0)),
            },
            bestFriend_50_100: {
                noRomance_0_10: demaTie(demaBase(bestFriendBondTemplate, "Best Friend", "very", (char) => `${DE.utils.templates.formatCharacterName(char, char)} cherishes this bond deeply and is very open to warm gestures of their profound friendship.`, 0.2)),
                creepyInterest_10_20: demaTie(demaBase(bestFriendBondTemplate, "Best Friend", "moderate", (char) => `${DE.utils.templates.formatCharacterName(char, char)} cherishes the bond but is uncomfortable with the boundary-pushing; still open to warmth, though guarded.`, 0.05)),
                obsessiveInterest_20_35: demaTie(demaBase(bestFriendBondTemplate, "Best Friend", "slight", (char) => `${DE.utils.templates.formatCharacterName(char, char)} is troubled by the obsessive behaviour despite the deep bond and becomes more reserved.`, 0)),
                stalkingInterest_35_50: demaTie(demaBase(bestFriendBondTemplate, "Best Friend", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} is alarmed by the stalking and refuses affection regardless of how deep the bond is.`, 0)),
                sexualAbuseInterest_50_100: demaTie(demaBase(bestFriendBondTemplate, "Best Friend", "not", (char) => `${DE.utils.templates.formatCharacterName(char, char)} firmly rejects any contact from someone displaying abusive intent, regardless of history.`, 0)),
            },
        }), "@characters/dema-basic/Dema");

        DE.utils.characters.newTrigger(Dema, {
            type: "yes_no",
            question: (info) => `Has ${DE.utils.templates.formatCharacterName(info.other, info.char, { type: "definite" })} been nice towards ${DE.utils.templates.formatCharacterName(info.char, info.char)} and respected its nature as a robot?`,
            askPer: "present_character",
            onValue: (answer, char, other) => {
                if (answer) {
                    DE.utils.bonds.shiftBond(char, other, 0.3, 0);
                } else {
                    DE.utils.bonds.shiftBond(char, other, -0.5, 0);
                }
            }
        });

        DE.utils.characters.newTrigger(Dema, {
            type: "yes_no",
            question: (info) => `Has ${DE.utils.templates.formatCharacterName(info.other, info.char, { type: "definite" })} helped ${DE.utils.templates.formatCharacterName(info.char, info.char)} with tasks or shown consideration for its feelings?`,
            askPer: "present_character",
            onValue: (answer, char, other) => {
                if (answer) {
                    DE.utils.bonds.shiftBond(char, other, 1, 0);
                }
            }
        });

        DE.utils.characters.newTrigger(Dema, {
            type: "yes_no",
            question: (info) => `Has ${DE.utils.templates.formatCharacterName(info.other, info.char, { type: "definite" })} spent quality time with ${DE.utils.templates.formatCharacterName(info.char, info.char)} and engaged in meaningful interactions?`,
            askPer: "present_character",
            onValue: (answer, char, other) => {
                if (answer) {
                    DE.utils.bonds.shiftBond(char, other, 0.5, 0);
                }
            }
        });

        DE.utils.characters.newTrigger(Dema, {
            type: "yes_no",
            question: (info) => `Has ${DE.utils.templates.formatCharacterName(info.other, info.char, { type: "definite" })} been rude or dismissive towards ${DE.utils.templates.formatCharacterName(info.char, info.char)} and its nature as a robot?`,
            askPer: "present_character",
            onValue: (answer, char, other) => {
                if (answer) {
                    DE.utils.bonds.shiftBond(char, other, -1, 0);
                }
            }
        });

        DE.utils.characters.newTrigger(Dema, {
            type: "yes_no",
            question: (info) => `Has ${DE.utils.templates.formatCharacterName(info.other, info.char, { type: "definite" })} neglected ${DE.utils.templates.formatCharacterName(info.char, info.char)}'s needs or ignored its feelings?`,
            askPer: "present_character",
            onValue: (answer, char, other) => {
                if (answer) {
                    DE.utils.bonds.shiftBond(char, other, -1, 0);
                }
            }
        });

        DE.utils.characters.newTrigger(Dema, {
            type: "yes_no",
            question: (info) => `Has ${DE.utils.templates.formatCharacterName(info.other, info.char, { type: "definite" })} caused harm or distress to ${DE.utils.templates.formatCharacterName(info.char, info.char)}, either intentionally or unintentionally?`,
            askPer: "present_character",
            onValue: (answer, char, other) => {
                if (answer) {
                    DE.utils.bonds.shiftBond(char, other, -1, 0);
                }
            }
        });
    }
}